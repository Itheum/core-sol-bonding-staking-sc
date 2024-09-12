use anchor_lang::prelude::*;

use crate::{
    full_math::MulDiv, get_current_timestamp, update_address_claimable_rewards, AddressBonds,
    AddressRewards, Bond, BondConfig, Errors, RewardsConfig, State, VaultConfig,
    ADDRESS_BONDS_SEED, ADDRESS_REWARDS_SEED, BOND_CONFIG_SEED, BOND_SEED, MAX_PERCENT,
    REWARDS_CONFIG_SEED, VAULT_CONFIG_SEED,
};

#[derive(Accounts)]
#[instruction(bond_config_index:u8,bond_id:u8)]
pub struct Renew<'info> {
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
        seeds=[ADDRESS_BONDS_SEED.as_bytes(), authority.key().as_ref()],
        bump=address_bonds.bump,
    )]
    pub address_bonds: Account<'info, AddressBonds>,

    #[account(
        mut,
        seeds=[ADDRESS_REWARDS_SEED.as_bytes(), authority.key().as_ref()],
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
        constraint=bond.owner == authority.key() @ Errors::OwnerMismatch,
        constraint=address_bonds.address == authority.key() @ Errors::OwnerMismatch,
        constraint=address_rewards.address==authority.key() @Errors::OwnerMismatch,
    )]
    pub authority: Signer<'info>,
}

pub fn renew(ctx: Context<Renew>) -> Result<()> {
    let current_timestamp = get_current_timestamp()?;

    let bond = &mut ctx.accounts.bond;

    require!(
        bond.state == State::Active.to_code(),
        Errors::BondIsInactive
    );

    let weight_to_be_added = bond.bond_amount * MAX_PERCENT;
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

    update_address_claimable_rewards(
        &mut ctx.accounts.rewards_config,
        &ctx.accounts.vault_config,
        &mut ctx.accounts.address_rewards,
        &mut ctx.accounts.address_bonds,
        ctx.accounts.bond_config.lock_period,
        true,
        Option::Some(weight_to_be_added),
        Option::None,
        Option::Some(weight_to_be_subtracted),
        Option::None,
    )?;

    bond.unbond_timestamp = current_timestamp + ctx.accounts.bond_config.lock_period;
    bond.bond_timestamp = current_timestamp;

    Ok(())
}
