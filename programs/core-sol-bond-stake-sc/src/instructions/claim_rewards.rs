use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{transfer_checked, Mint, Token, TokenAccount, TransferChecked},
};

use crate::{
    update_address_claimable_rewards, AddressBonds, AddressRewards, Errors, RewardsConfig,
    VaultConfig, ADDRESS_BONDS_SEED, REWARDS_CONFIG_SEED, VAULT_OWNER_SEED,
};

#[derive(Accounts)]
pub struct ClaimRewards<'info> {
    #[account(
        mut,
        seeds=[ADDRESS_BONDS_SEED.as_bytes(), authority.key().as_ref()],
        bump=address_bonds.bump,
    )]
    pub address_bonds: Account<'info, AddressBonds>,

    #[account(
        mut,
        seeds=[ADDRESS_BONDS_SEED.as_bytes(), authority.key().as_ref()],
        bump=address_rewards.bump,

    )]
    pub address_rewards: Account<'info, AddressRewards>,

    #[account(
        mut,
        seeds=[REWARDS_CONFIG_SEED.as_bytes()],
        bump=rewards_config.bump,

    )]
    pub rewards_config: Account<'info, RewardsConfig>,

    #[account(
        mut,
        seeds=[VAULT_OWNER_SEED.as_bytes()],
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
        constraint=address_bonds.address == authority.key() @ Errors::WrongOwner,
        constraint=address_rewards.address==authority.key() @Errors::WrongOwner,
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
        VAULT_OWNER_SEED.as_bytes(),
        &[ctx.accounts.vault_config.bump],
    ]];

    update_address_claimable_rewards(
        &mut ctx.accounts.rewards_config,
        &mut ctx.accounts.address_rewards,
        &mut ctx.accounts.address_bonds,
        ctx.remaining_accounts,
        ctx.accounts.vault_config.total_bond_amount,
        false,
    )?;

    require!(
        ctx.accounts.vault.amount >= ctx.accounts.address_rewards.claimable_amount,
        Errors::NotEnoughBalance
    );

    let address_rewards = &mut ctx.accounts.address_rewards;

    let cpi_accounts = TransferChecked {
        from: ctx.accounts.vault.to_account_info(),
        to: ctx.accounts.authority_token_account.to_account_info(),
        mint: ctx.accounts.mint_of_token_to_receive.to_account_info(),
        authority: ctx.accounts.authority.to_account_info(),
    };

    let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts)
        .with_signer(&signer_seeds);

    transfer_checked(
        cpi_ctx,
        address_rewards.claimable_amount,
        ctx.accounts.mint_of_token_to_receive.decimals,
    )?;

    address_rewards.claimable_amount = 0;

    Ok(())
}
