use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{transfer_checked, Mint, Token, TokenAccount, TransferChecked},
};

use crate::{
    Errors, RewardsConfig, VaultConfig, ADMIN_PUBKEY, REWARDS_CONFIG_SEED, VAULT_CONFIG_SEED,
};

#[derive(Accounts)]
#[instruction(amount:u64)]
pub struct RewardsContext<'info> {
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
        constraint=mint_of_token.key() == vault_config.mint_of_token @ Errors::MintMismatch,
    )]
    pub mint_of_token: Account<'info, Mint>,

    #[account(
        mut,
        address=ADMIN_PUBKEY,
    )]
    pub authority: Signer<'info>,

    #[account(
        mut,
        constraint=authority_token_account.owner == authority.key() @ Errors::OwnerMismatch,
        constraint=authority_token_account.mint == vault_config.mint_of_token @ Errors::MintMismatch,
    )]
    pub authority_token_account: Account<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

pub fn add_rewards(ctx: Context<RewardsContext>, amount: u64) -> Result<()> {
    let rewards_config = &mut ctx.accounts.rewards_config;
    rewards_config.rewards_reserve += amount;

    let cpi_accounts = TransferChecked {
        from: ctx.accounts.authority_token_account.to_account_info(),
        to: ctx.accounts.vault.to_account_info(),
        mint: ctx.accounts.mint_of_token.to_account_info(),
        authority: ctx.accounts.authority.to_account_info(),
    };

    let cpi_context = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);

    transfer_checked(cpi_context, amount, ctx.accounts.mint_of_token.decimals)?;

    Ok(())
}

pub fn remove_rewards(ctx: Context<RewardsContext>, amount: u64) -> Result<()> {
    let signer_seeds: [&[&[u8]]; 1] = [&[
        VAULT_CONFIG_SEED.as_bytes(),
        &[ctx.accounts.vault_config.bump],
    ]];
    let rewards_config = &mut ctx.accounts.rewards_config;
    rewards_config.rewards_reserve -= amount;

    require!(
        ctx.accounts.vault.amount >= amount,
        Errors::NotEnoughBalance
    );

    let cpi_accounts = TransferChecked {
        from: ctx.accounts.vault.to_account_info(),
        to: ctx.accounts.authority_token_account.to_account_info(),
        mint: ctx.accounts.mint_of_token.to_account_info(),
        authority: ctx.accounts.vault_config.to_account_info(),
    };

    let cpi_context = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts)
        .with_signer(&signer_seeds);

    transfer_checked(cpi_context, amount, ctx.accounts.mint_of_token.decimals)?;

    Ok(())
}
