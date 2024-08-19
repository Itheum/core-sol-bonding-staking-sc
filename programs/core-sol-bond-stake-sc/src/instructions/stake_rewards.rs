use anchor_lang::prelude::*;

use crate::{
    get_current_timestamp, update_address_claimable_rewards, AddressBonds, AddressRewards, Bond,
    Errors, RewardsConfig, VaultConfig, ADDRESS_BONDS_SEED, BOND_SEED, REWARDS_CONFIG_SEED,
    VAULT_OWNER_SEED,
};

#[derive(Accounts)]
#[instruction(bond_id:u8)]
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
    require!(ctx.accounts.bond.is_vault, Errors::BondIsNotAVault);

    update_address_claimable_rewards(
        &mut ctx.accounts.rewards_config,
        &mut ctx.accounts.address_rewards,
        &mut ctx.accounts.address_bonds,
        ctx.remaining_accounts,
        ctx.accounts.vault_config.total_bond_amount,
        false,
    )?;

    let current_timestamp = get_current_timestamp()?;

    let address_rewards = &mut ctx.accounts.address_rewards;
    let address_bonds = &mut ctx.accounts.address_bonds;
    let vault_config = &mut ctx.accounts.vault_config;

    let bond = &mut ctx.accounts.bond;

    bond.unbond_timestamp = current_timestamp + bond.lock_period;
    bond.bond_timestamp = current_timestamp;
    bond.bond_amount += &address_rewards.claimable_amount;

    address_bonds.address_total_bond_amount += &address_rewards.claimable_amount;
    vault_config.total_bond_amount += &address_rewards.claimable_amount;

    address_rewards.claimable_amount = 0;

    Ok(())
}
