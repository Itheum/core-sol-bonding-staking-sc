use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{transfer_checked, Mint, Token, TokenAccount, TransferChecked},
};

use crate::{
    get_current_timestamp, update_address_claimable_rewards, AddressBondsRewards, Bond, BondConfig,
    Errors, RewardsConfig, State, VaultConfig, ADDRESS_BONDS_REWARDS_SEED, BOND_CONFIG_SEED,
    BOND_SEED, MAX_PERCENT, REWARDS_CONFIG_SEED, VAULT_CONFIG_SEED,
};

#[derive(Accounts)]
#[instruction(bond_config_index:u8,bond_id: u16)]
pub struct Withdraw<'info> {
    #[account(
        seeds=[BOND_CONFIG_SEED.as_bytes(),&bond_config_index.to_be_bytes()],
        bump=bond_config.bump,
    )]
    pub bond_config: Account<'info, BondConfig>,

    #[account(
        mut,
        seeds=[ADDRESS_BONDS_REWARDS_SEED.as_bytes(), authority.key().as_ref()],
        bump=address_bonds_rewards.bump,
    )]
    pub address_bonds_rewards: Box<Account<'info, AddressBondsRewards>>,

    #[account(
        mut,
        seeds=[REWARDS_CONFIG_SEED.as_bytes()],
        bump=rewards_config.bump,

    )]
    pub rewards_config: Account<'info, RewardsConfig>,

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
        constraint=vault.amount >= bond.bond_amount @ Errors::NotEnoughBalance,
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

pub fn withdraw<'a, 'b, 'c: 'info, 'info>(
    ctx: Context<'a, 'b, 'c, 'info, Withdraw<'info>>,
) -> Result<()> {
    let signer_seeds: [&[&[u8]]; 1] = [&[
        VAULT_CONFIG_SEED.as_bytes(),
        &[ctx.accounts.vault_config.bump],
    ]];

    let bond_config = &ctx.accounts.bond_config;
    let vault_config = &mut ctx.accounts.vault_config;

    let bond = &mut ctx.accounts.bond;

    require!(
        bond.state == State::Active.to_code(),
        Errors::BondIsInactive
    );
    let current_timestamp = get_current_timestamp()?;

    update_address_claimable_rewards(
        &mut ctx.accounts.rewards_config,
        vault_config,
        &mut ctx.accounts.address_bonds_rewards,
    )?;

    let address_bonds_rewards = &mut ctx.accounts.address_bonds_rewards;

    address_bonds_rewards.address_total_bond_amount -= bond.bond_amount;
    address_bonds_rewards.last_update_timestamp = current_timestamp;

    let mut penalty = 0u64;

    if bond.unbond_timestamp >= current_timestamp {
        penalty = bond.bond_amount * bond_config.withdraw_penalty / MAX_PERCENT;
    }

    vault_config.total_penalized_amount += penalty;
    vault_config.total_bond_amount -= bond.bond_amount;

    // transfer bond to authority

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
        bond.bond_amount - penalty,
        ctx.accounts.mint_of_token_to_receive.decimals,
    )?;

    bond.state = State::Inactive.to_code();
    bond.unbond_timestamp = current_timestamp;
    bond.bond_amount = 0;

    Ok(())
}
