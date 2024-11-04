use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, Token, TokenAccount, TransferChecked},
};

use crate::{
    compute_decay, compute_weighted_liveliness_decay, compute_weighted_liveliness_new,
    full_math::MulDiv, get_current_timestamp, update_address_claimable_rewards,
    AddressBondsRewards, Bond, BondConfig, Errors, RewardsConfig, State, VaultConfig,
    ADDRESS_BONDS_REWARDS_SEED, BOND_CONFIG_SEED, BOND_SEED, MAX_PERCENT, REWARDS_CONFIG_SEED,
    VAULT_CONFIG_SEED,
};

#[derive(Accounts)]
#[instruction(bond_config_index:u8,bond_id: u16, amount:u64)]

pub struct TopUp<'info> {
    #[account(
        mut,
        seeds=[ADDRESS_BONDS_REWARDS_SEED.as_bytes(), authority.key().as_ref()],
        bump=address_bonds_rewards.bump,
    )]
    pub address_bonds_rewards: Box<Account<'info, AddressBondsRewards>>,

    #[account(
        seeds=[BOND_CONFIG_SEED.as_bytes(),&bond_config_index.to_be_bytes()],
        bump=bond_config.bump,
    )]
    pub bond_config: Account<'info, BondConfig>,

    #[account(
        mut,
        seeds=[REWARDS_CONFIG_SEED.as_bytes()],
        bump=rewards_config.bump,

    )]
    pub rewards_config: Account<'info, RewardsConfig>,

    #[account(
        constraint=mint_of_token_sent.key()==vault_config.mint_of_token @ Errors::MintMismatch,
    )]
    pub mint_of_token_sent: Account<'info, Mint>,

    #[account(
        mut,
        seeds = [
            BOND_SEED.as_bytes(),
            authority.key().as_ref(),
            &bond_id.to_le_bytes()
        ],
        bump=bond.bump,

    )]
    pub bond: Account<'info, Bond>,

    #[account(
        mut,
        seeds=[VAULT_CONFIG_SEED.as_bytes()],
        bump=vault_config.bump,
        has_one=vault,
    )]
    pub vault_config: Account<'info, VaultConfig>,

    #[account(
        mut,
        associated_token::mint=vault_config.mint_of_token,
        associated_token::authority=vault_config,
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint=bond.owner == authority.key() @ Errors::OwnerMismatch,
        constraint=address_bonds_rewards.address==authority.key() @Errors::OwnerMismatch,
    )]
    pub authority: Signer<'info>,

    #[account(
        mut,
        constraint=authority_token_account.owner == authority.key() @ Errors::OwnerMismatch,
        constraint=authority_token_account.mint == vault_config.mint_of_token @ Errors::MintMismatch,
    )]
    pub authority_token_account: Account<'info, TokenAccount>,

    system_program: Program<'info, System>,
    token_program: Program<'info, Token>,
    associated_token_program: Program<'info, AssociatedToken>,
}

pub fn top_up<'a, 'b, 'c: 'info, 'info>(
    ctx: Context<'a, 'b, 'c, 'info, TopUp<'info>>,
    amount: u64,
) -> Result<()> {
    let bond = &mut ctx.accounts.bond;

    require!(
        bond.state == State::Active.to_code(),
        Errors::BondIsInactive
    );

    require!(bond.is_vault, Errors::BondIsNotAVault);

    let current_timestamp = get_current_timestamp()?;

    let weight_to_be_added = (bond.bond_amount + amount) * MAX_PERCENT;

    let weight_to_be_subtracted = if current_timestamp < bond.unbond_timestamp {
        bond.bond_amount
            .mul_div_floor(
                bond.unbond_timestamp - current_timestamp,
                ctx.accounts.bond_config.lock_period,
            )
            .unwrap()
            * MAX_PERCENT
    } else {
        0
    };

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
        &ctx.accounts.vault_config,
        &mut ctx.accounts.address_bonds_rewards,
    )?;

    let address_bonds_rewards = &mut ctx.accounts.address_bonds_rewards;

    let weighted_liveliness_score_new = compute_weighted_liveliness_new(
        weighted_liveliness_score_decayed,
        address_bonds_rewards.address_total_bond_amount,
        address_bonds_rewards.address_total_bond_amount + amount,
        weight_to_be_added,
        weight_to_be_subtracted,
    );

    address_bonds_rewards.address_total_bond_amount += amount;

    address_bonds_rewards.weighted_liveliness_score = weighted_liveliness_score_new;
    address_bonds_rewards.last_update_timestamp = current_timestamp;

    let vault_config = &mut ctx.accounts.vault_config;
    vault_config.total_bond_amount += amount;

    bond.unbond_timestamp = current_timestamp + ctx.accounts.bond_config.lock_period;
    bond.bond_timestamp = current_timestamp;
    bond.bond_amount += amount;

    // transfer amount to vault

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

    Ok(())
}
