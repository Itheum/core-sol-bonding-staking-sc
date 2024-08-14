use anchor_lang::prelude::*;

use crate::{
    update_address_claimable_rewards, AddressBonds, AddressRewards, Errors, RewardsConfig,
    VaultConfig, ADDRESS_BONDS_SEED, REWARDS_CONFIG_SEED, VAULT_OWNER_SEED,
};

#[derive(Accounts)]

pub struct StakeRewards<'info> {
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
    )]
    pub vault_config: Account<'info, VaultConfig>,

    #[account(
        mut,
        constraint=address_bonds.address == authority.key() @ Errors::WrongOwner,
        constraint=address_rewards.address==authority.key() @Errors::WrongOwner,
    )]
    pub authority: Signer<'info>,
}

pub fn stake_rewards<'a, 'b, 'c: 'info, 'info>(
    ctx: Context<'a, 'b, 'c, 'info, StakeRewards<'info>>,
) -> Result<()> {
    update_address_claimable_rewards(
        &mut ctx.accounts.rewards_config,
        &mut ctx.accounts.address_rewards,
        &mut ctx.accounts.address_bonds,
        ctx.remaining_accounts,
        ctx.accounts.vault_config.total_bond_amount,
        false,
    )?;
    Ok(())
}
