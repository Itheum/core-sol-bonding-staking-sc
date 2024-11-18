use anchor_lang::prelude::*;

use crate::{
    compute_bond_score, full_math::MulDiv, get_current_timestamp, update_address_claimable_rewards,
    AddressBondsRewards, Bond, BondConfig, Errors, RewardsConfig, State, VaultConfig,
    ADDRESS_BONDS_REWARDS_SEED, BOND_CONFIG_SEED, BOND_SEED, MAX_PERCENT, REWARDS_CONFIG_SEED,
    VAULT_CONFIG_SEED,
};

#[derive(Accounts)]
#[instruction(bond_config_index:u8,bond_id:u16)]
pub struct StakeRewards<'info> {
    #[account(
        mut,
        seeds=[ADDRESS_BONDS_REWARDS_SEED.as_bytes(), authority.key().as_ref()],
        bump=address_bonds_rewards.bump,
    )]
    pub address_bonds_rewards: Box<Account<'info, AddressBondsRewards>>,

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
    )]
    pub vault_config: Account<'info, VaultConfig>,

    #[account(
        mut,
        constraint=bond.owner == authority.key() @ Errors::OwnerMismatch,
        constraint=address_bonds_rewards.address==authority.key() @Errors::OwnerMismatch,
    )]
    pub authority: Signer<'info>,
}

pub fn stake_rewards<'a, 'b, 'c: 'info, 'info>(
    ctx: Context<'a, 'b, 'c, 'info, StakeRewards<'info>>,
    bond_id: u16,
) -> Result<()> {
    require!(
        ctx.accounts.address_bonds_rewards.vault_bond_id == bond_id
            && ctx.accounts.address_bonds_rewards.vault_bond_id != 0,
        Errors::VaultBondIdMismatch
    );

    require!(
        ctx.accounts.bond.state == State::Active.to_code(),
        Errors::BondIsInactive
    );

    update_address_claimable_rewards(
        &mut ctx.accounts.rewards_config,
        &mut ctx.accounts.vault_config,
        &mut ctx.accounts.address_bonds_rewards,
    )?;

    let current_timestamp = get_current_timestamp()?;

    let address_bonds_rewards = &mut ctx.accounts.address_bonds_rewards;
    let vault_config = &mut ctx.accounts.vault_config;

    let bond = &mut ctx.accounts.bond;

    let actual_claimable_amount;

    let actual_vault_liveliness_score = compute_bond_score(
        ctx.accounts.bond_config.lock_period,
        current_timestamp,
        bond.unbond_timestamp,
    );

    if actual_vault_liveliness_score >= 95_00u64 {
        actual_claimable_amount = address_bonds_rewards.claimable_amount;
    } else {
        actual_claimable_amount = address_bonds_rewards
            .claimable_amount
            .mul_div_floor(actual_vault_liveliness_score, MAX_PERCENT)
            .unwrap();
    }

    bond.unbond_timestamp = current_timestamp + ctx.accounts.bond_config.lock_period;
    bond.bond_timestamp = current_timestamp;
    bond.bond_amount += &actual_claimable_amount;

    vault_config.total_bond_amount += &actual_claimable_amount;

    address_bonds_rewards.claimable_amount = 0;

    address_bonds_rewards.address_total_bond_amount += actual_claimable_amount;
    address_bonds_rewards.last_update_timestamp = current_timestamp;

    Ok(())
}
