use std::ops::Add;

use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, Token, TokenAccount, TransferChecked},
};
use mpl_bubblegum::{types::LeafSchema, utils::get_asset_id};
use spl_account_compression::program::SplAccountCompression;

use crate::{
    compute_decay, compute_weighted_liveliness_decay, compute_weighted_liveliness_new,
    get_current_timestamp, update_address_claimable_rewards, AddressBondsRewards, AssetUsage, Bond,
    BondConfig, Errors, RewardsConfig, State, VaultConfig, ADDRESS_BONDS_REWARDS_SEED,
    BOND_CONFIG_SEED, BOND_SEED, MAX_PERCENT, REWARDS_CONFIG_SEED, VAULT_CONFIG_SEED,
};

#[derive(Accounts)]
#[instruction(bond_config_index: u8, bond_id:u8, amount: u64,nonce: u64)]
pub struct BondContext<'info> {
    #[account(
        mut,
        seeds=[ADDRESS_BONDS_REWARDS_SEED.as_bytes(), authority.key().as_ref()],
        bump=address_bonds_rewards.bump,
    )]
    pub address_bonds_rewards: Box<Account<'info, AddressBondsRewards>>,

    #[account(
        init,
        payer=authority,
        seeds=[get_asset_id(&merkle_tree.key(), nonce).as_ref()],
        bump,
        space=AssetUsage::INIT_SPACE
    )]
    pub asset_usage: Box<Account<'info, AssetUsage>>,

    #[account(
        init,
        payer = authority,
        constraint=address_bonds_rewards.current_index + 1 == bond_id  @ Errors::WrongBondId,
        seeds = [
            BOND_SEED.as_bytes(),
            authority.key().as_ref(),
            &bond_id.to_le_bytes()
        ],
        bump,
        space = Bond::INIT_SPACE
    )]
    pub bond: Box<Account<'info, Bond>>,

    #[account(
        seeds=[BOND_CONFIG_SEED.as_bytes(),&bond_config_index.to_be_bytes()],
        bump=bond_config.bump,
    )]
    pub bond_config: Box<Account<'info, BondConfig>>,

    #[account(
        mut,
        seeds=[REWARDS_CONFIG_SEED.as_bytes()],
        bump=rewards_config.bump,
    )]
    pub rewards_config: Box<Account<'info, RewardsConfig>>,

    #[account(
        mut,
        seeds=[VAULT_CONFIG_SEED.as_bytes()],
        bump=vault_config.bump,
        has_one=vault,
    )]
    pub vault_config: Box<Account<'info, VaultConfig>>,

    #[account(
        mut,
        associated_token::mint=mint_of_token_sent,
        associated_token::authority=vault_config
    )]
    pub vault: Box<Account<'info, TokenAccount>>,

    #[account(
        constraint=mint_of_token_sent.key()==vault_config.mint_of_token @ Errors::MintMismatch,
    )]
    pub mint_of_token_sent: Box<Account<'info, Mint>>,

    #[account(
        mut,
        constraint=address_bonds_rewards.address == authority.key() @ Errors::OwnerMismatch,
    )]
    pub authority: Signer<'info>,

    /// CHECK: unsafe
    #[account(
        constraint= merkle_tree.key() == bond_config.merkle_tree.key() @ Errors::MerkleTreeMismatch,
    )]
    pub merkle_tree: UncheckedAccount<'info>,

    #[account(
        mut,
        constraint=authority_token_account.amount >= amount @ Errors::NotEnoughBalance,
        constraint=authority_token_account.owner==authority.key() @ Errors::OwnerMismatch,
        constraint=authority_token_account.mint==vault_config.mint_of_token @ Errors::MintMismatch,
    )
    ]
    pub authority_token_account: Box<Account<'info, TokenAccount>>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub compression_program: Program<'info, SplAccountCompression>,
}

pub fn bond<'a, 'b, 'c: 'info, 'info>(
    ctx: Context<'a, 'b, 'c, 'info, BondContext<'info>>,
    bond_id: u8,
    amount: u64,
    nonce: u64,
    is_vault: bool,
    root: [u8; 32],
    data_hash: [u8; 32],
    creator_hash: [u8; 32],
) -> Result<()> {
    require!(
        ctx.accounts.bond_config.bond_amount == amount,
        Errors::WrongAmount
    );

    let current_timestamp = get_current_timestamp()?;

    let weight_to_be_added = amount * MAX_PERCENT;

    let decay = compute_decay(
        ctx.accounts.address_bonds_rewards.last_update_timestamp,
        current_timestamp,
        ctx.accounts.bond_config.lock_period,
    );

    let weighted_liveliness_score_decayed = compute_weighted_liveliness_decay(
        ctx.accounts.address_bonds_rewards.weighted_liveliness_score,
        decay,
    );

    update_address_claimable_rewards(
        &mut ctx.accounts.rewards_config,
        &mut ctx.accounts.vault_config,
        &mut ctx.accounts.address_bonds_rewards,
    )?;

    let address_bonds_rewards = &mut ctx.accounts.address_bonds_rewards;

    let weighted_liveliness_score_new = compute_weighted_liveliness_new(
        weighted_liveliness_score_decayed,
        address_bonds_rewards.address_total_bond_amount,
        address_bonds_rewards.address_total_bond_amount + amount,
        weight_to_be_added,
        0,
    );

    address_bonds_rewards.weighted_liveliness_score = weighted_liveliness_score_new;
    address_bonds_rewards.last_update_timestamp = current_timestamp;
    address_bonds_rewards.address_total_bond_amount += amount;

    // check leaf owner here
    let asset_id = get_asset_id(&ctx.accounts.merkle_tree.key(), nonce);

    // let leaf = LeafSchema::V1 {
    //     id: asset_id,
    //     owner: ctx.accounts.authority.key(),
    //     delegate: ctx.accounts.authority.key(),
    //     nonce,
    //     data_hash,
    //     creator_hash,
    // };
    // let cpi_ctx = CpiContext::new(
    //     ctx.accounts.compression_program.to_account_info(),
    //     spl_account_compression::cpi::accounts::VerifyLeaf {
    //         merkle_tree: ctx.accounts.merkle_tree.to_account_info(),
    //     },
    // )
    // .with_remaining_accounts(ctx.remaining_accounts.to_vec());

    // spl_account_compression::cpi::verify_leaf(cpi_ctx, root, leaf.hash(), nonce as u32)?;

    let current_timestamp = get_current_timestamp()?;

    ctx.accounts
        .vault_config
        .total_bond_amount
        .checked_add(amount)
        .unwrap();

    // bond transfer to vault

    let cpi_accounts = TransferChecked {
        from: ctx.accounts.authority_token_account.to_account_info(),
        to: ctx.accounts.vault.to_account_info(),
        mint: ctx.accounts.mint_of_token_sent.to_account_info(),
        authority: ctx.accounts.authority.to_account_info(),
    };

    let cpi_context = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);

    token::transfer_checked(
        cpi_context,
        amount,
        ctx.accounts.mint_of_token_sent.decimals,
    )?;

    address_bonds_rewards.current_index = bond_id;
    ctx.accounts.vault_config.total_bond_amount += amount;

    ctx.accounts.bond.set_inner(Bond {
        bump: ctx.bumps.bond,
        state: State::Active.to_code(),
        is_vault,
        unbond_timestamp: current_timestamp.add(ctx.accounts.bond_config.lock_period),
        bond_timestamp: current_timestamp,
        bond_amount: amount,
        asset_id: asset_id.key(),
        owner: ctx.accounts.authority.key(),
        padding: [0; 64],
    });

    Ok(())
}
