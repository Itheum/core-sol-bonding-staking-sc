use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{transfer_checked, Mint, Token, TokenAccount, TransferChecked},
};

use crate::{
    compute_decay, compute_weighted_liveliness_decay, compute_weighted_liveliness_new,
    full_math::MulDiv, get_current_timestamp, update_address_claimable_rewards,
    AddressBondsRewards, BondConfig, Errors, RewardsConfig, VaultConfig,
    ADDRESS_BONDS_REWARDS_SEED, BOND_CONFIG_SEED, MAX_PERCENT, REWARDS_CONFIG_SEED,
    VAULT_CONFIG_SEED,
};

#[derive(Accounts)]
#[instruction(bond_config_index:u8)]
pub struct ClaimRewards<'info> {
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
        constraint=mint_of_token_to_receive.key() == vault_config.mint_of_token @ Errors::MintMismatch,
    )]
    pub mint_of_token_to_receive: Account<'info, Mint>,

    #[account(
        mut,
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

pub fn claim_rewards<'a, 'b, 'c: 'info, 'info>(
    ctx: Context<'a, 'b, 'c, 'info, ClaimRewards<'info>>,
) -> Result<()> {
    let signer_seeds: [&[&[u8]]; 1] = [&[
        VAULT_CONFIG_SEED.as_bytes(),
        &[ctx.accounts.vault_config.bump],
    ]];

    let current_timestamp = get_current_timestamp()?;

    let decay = compute_decay(
        ctx.accounts.address_bonds_rewards.last_update_timestamp,
        current_timestamp,
        ctx.accounts.bond_config.lock_period,
    );

    let weighted_liveliness_score_decayed = compute_weighted_liveliness_decay(
        ctx.accounts.address_bonds_rewards.weighted_liveliness_score,
        decay,
    );

    let weighted_liveliness_score_new = compute_weighted_liveliness_new(
        weighted_liveliness_score_decayed,
        ctx.accounts.address_bonds_rewards.address_total_bond_amount,
        0,
        0,
        0,
        0,
    );

    update_address_claimable_rewards(
        &mut ctx.accounts.rewards_config,
        &ctx.accounts.vault_config,
        &mut ctx.accounts.address_bonds_rewards,
    )?;

    require!(
        ctx.accounts.vault.amount >= ctx.accounts.address_bonds_rewards.claimable_amount,
        Errors::NotEnoughBalance
    );

    let address_bonds_rewards = &mut ctx.accounts.address_bonds_rewards;

    let actual_claimable_amount;

    if weighted_liveliness_score_decayed >= 95_00u64 {
        actual_claimable_amount = address_bonds_rewards.claimable_amount;
    } else {
        actual_claimable_amount = address_bonds_rewards
            .claimable_amount
            .mul_div_floor(weighted_liveliness_score_decayed, MAX_PERCENT)
            .unwrap();
    }

    address_bonds_rewards.weighted_liveliness_score = weighted_liveliness_score_new;
    address_bonds_rewards.last_update_timestamp = current_timestamp;

    let cpi_accounts = TransferChecked {
        from: ctx.accounts.vault.to_account_info(),
        to: ctx.accounts.authority_token_account.to_account_info(),
        mint: ctx.accounts.mint_of_token_to_receive.to_account_info(),
        authority: ctx.accounts.vault_config.to_account_info(),
    };

    let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts)
        .with_signer(&signer_seeds);

    transfer_checked(
        cpi_ctx,
        actual_claimable_amount,
        ctx.accounts.mint_of_token_to_receive.decimals,
    )?;

    address_bonds_rewards.claimable_amount = 0;

    Ok(())
}
