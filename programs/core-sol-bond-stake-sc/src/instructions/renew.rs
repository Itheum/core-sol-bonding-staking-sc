use anchor_lang::prelude::*;

use crate::{
    compute_decay, compute_weighted_liveliness_decay, compute_weighted_liveliness_new,
    full_math::MulDiv, get_current_timestamp, update_address_claimable_rewards,
    AddressBondsRewards, Bond, BondConfig, Errors, RewardsConfig, State, VaultConfig,
    ADDRESS_BONDS_REWARDS_SEED, BOND_CONFIG_SEED, BOND_SEED, MAX_PERCENT, REWARDS_CONFIG_SEED,
    VAULT_CONFIG_SEED,
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
        mut,
        constraint=bond.owner == authority.key() @ Errors::OwnerMismatch,
        constraint=address_bonds_rewards.address==authority.key() @Errors::OwnerMismatch,
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

    let weighted_liveliness_score_new = compute_weighted_liveliness_new(
        weighted_liveliness_score_decayed,
        ctx.accounts.address_bonds_rewards.address_total_bond_amount,
        weight_to_be_added,
        weight_to_be_subtracted,
        0,
        0,
    );

    let address_bonds_rewards = &mut ctx.accounts.address_bonds_rewards;

    address_bonds_rewards.weighted_liveliness_score = weighted_liveliness_score_new;
    address_bonds_rewards.last_update_timestamp = current_timestamp;

    bond.unbond_timestamp = current_timestamp + ctx.accounts.bond_config.lock_period;
    bond.bond_timestamp = current_timestamp;

    Ok(())
}
