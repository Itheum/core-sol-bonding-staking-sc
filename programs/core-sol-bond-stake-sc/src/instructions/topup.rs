use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, Token, TokenAccount, TransferChecked},
};

use crate::{
    get_current_timestamp, update_address_claimable_rewards, AddressBonds, AddressRewards, Bond,
    Errors, RewardsConfig, State, VaultConfig, ADDRESS_BONDS_SEED, BOND_SEED, REWARDS_CONFIG_SEED,
    VAULT_OWNER_SEED,
};

#[derive(Accounts)]
#[instruction(bond_id: u8, amount:u64)]

pub struct TopUp<'info> {
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
        seeds=[VAULT_OWNER_SEED.as_bytes()],
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
        mut,
        constraint=bond.owner == authority.key() @ Errors::WrongOwner,
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

pub fn top_up<'a, 'b, 'c: 'info, 'info>(
    ctx: Context<'a, 'b, 'c, 'info, TopUp<'info>>,
    amount: u64,
) -> Result<()> {
    update_address_claimable_rewards(
        &mut ctx.accounts.rewards_config,
        &mut ctx.accounts.address_rewards,
        &mut ctx.accounts.address_bonds,
        ctx.remaining_accounts,
        ctx.accounts.vault_config.total_bond_amount,
        true,
    )?;

    let bond = &mut ctx.accounts.bond;

    require!(
        bond.state == State::Active.to_code(),
        Errors::BondIsInactive
    );

    require!(bond.is_vault, Errors::BondIsNotAVault);

    let vault_config = &mut ctx.accounts.vault_config;

    let current_timestamp = get_current_timestamp()?;

    bond.unbond_timestamp = current_timestamp + bond.lock_period;
    bond.bond_timestamp = current_timestamp;
    bond.bond_amount += amount;

    vault_config.total_bond_amount += amount;

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
