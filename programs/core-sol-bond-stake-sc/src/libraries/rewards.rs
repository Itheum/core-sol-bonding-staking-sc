use crate::{
    get_current_slot, get_current_timestamp, AddressBonds, AddressRewards, RewardsConfig, State,
    VaultConfig, DIVISION_SAFETY_CONST, MAX_PERCENT, SLOTS_IN_YEAR,
};
use anchor_lang::prelude::*;

use super::full_math::MulDiv;

pub fn generate_aggregated_rewards<'a, 'b, 'c: 'info, 'info>(
    rewards_config: &mut Account<'info, RewardsConfig>,
    vault_config: &Account<'info, VaultConfig>,
) -> Result<()> {
    let last_reward_slot = rewards_config.last_reward_slot;
    let extra_rewards_unbounded = calculate_rewards_since_last_allocation(rewards_config)?;
    let max_apr = rewards_config.max_apr;

    let extra_rewards: u64;
    if max_apr > 0 {
        let extra_rewards_apr_bonded_per_slot =
            get_amount_apr_bounded(rewards_config.max_apr, vault_config.total_bond_amount);

        let current_slot = get_current_slot()?;

        let slot_diff = current_slot - last_reward_slot;

        let extra_rewards_apr_bonded = extra_rewards_apr_bonded_per_slot * slot_diff;

        extra_rewards = core::cmp::min(extra_rewards_unbounded, extra_rewards_apr_bonded);
    } else {
        extra_rewards = extra_rewards_unbounded;
    }

    if extra_rewards > 0 && extra_rewards <= rewards_config.rewards_reserve {
        let increment = extra_rewards
            .mul_div_floor(DIVISION_SAFETY_CONST, vault_config.total_bond_amount)
            .unwrap();

        rewards_config.rewards_per_share += increment;
        rewards_config.rewards_reserve -= extra_rewards;
        rewards_config.accumulated_rewards += extra_rewards;
    }

    Ok(())
}

pub fn get_amount_apr_bounded(max_apr: u64, amount: u64) -> u64 {
    amount * max_apr / MAX_PERCENT / SLOTS_IN_YEAR
}

pub fn calculate_rewards_since_last_allocation<'info>(
    rewards_config: &mut Account<'info, RewardsConfig>,
) -> Result<u64> {
    let current_slot = get_current_slot()?;

    if rewards_config.rewards_state == State::Inactive.to_code() {
        return Ok(0u64);
    }

    if current_slot <= rewards_config.last_reward_slot {
        return Ok(0u64);
    }

    let slot_diff = current_slot - rewards_config.last_reward_slot;

    rewards_config.last_reward_slot = current_slot;

    Ok(rewards_config.rewards_per_slot * slot_diff)
}

pub fn calculate_address_share_in_rewards(
    accumulated_rewards: u64,
    rewards_per_share: u64,
    address_bond_amount: u64,
    address_rewards_per_share: u64,
    total_bond_amount: u64,
    liveliness_score: u64,
    bypass_liveliness_score: bool,
) -> u64 {
    if total_bond_amount == 0 {
        return 0;
    }

    if accumulated_rewards == 0 {
        return 0;
    }

    let address_rewards = address_bond_amount
        .mul_div_floor(
            rewards_per_share - address_rewards_per_share,
            DIVISION_SAFETY_CONST,
        )
        .unwrap();

    if liveliness_score >= 95_00u64 || bypass_liveliness_score {
        address_rewards
    } else {
        address_rewards
            .mul_div_floor(liveliness_score, MAX_PERCENT)
            .unwrap()
    }
}

pub fn update_address_claimable_rewards<'info>(
    rewards_config: &mut Account<'info, RewardsConfig>,
    vault_config: &Account<'info, VaultConfig>,
    address_rewards: &mut Account<'info, AddressRewards>,
    address_bonds: &mut Account<'info, AddressBonds>,
    lock_period: u64,
    bypass_liveliness_score: bool,
    weight_to_be_added: Option<u64>,
    bond_to_be_added: Option<u64>,
    weight_to_be_subtracted: Option<u64>,
    bond_to_be_subtracted: Option<u64>,
) -> Result<()> {
    generate_aggregated_rewards(rewards_config, vault_config)?;

    let current_timestamp = get_current_timestamp()?;

    let mut liveliness_score = 0u64;

    let decay = (current_timestamp - address_bonds.last_update_timestamp)
        .mul_div_floor(DIVISION_SAFETY_CONST, lock_period)
        .unwrap();

    let weighted_liveliness_score_decayed = address_bonds
        .weighted_liveliness_score
        .mul_div_floor(1 * DIVISION_SAFETY_CONST - decay, DIVISION_SAFETY_CONST)
        .unwrap();

    let weighted_liveliness_new = (weighted_liveliness_score_decayed
        .saturating_mul(address_bonds.address_total_bond_amount)
        .saturating_sub(weight_to_be_subtracted.unwrap_or(0))
        .saturating_add(weight_to_be_added.unwrap_or(0)))
        / (address_bonds.address_total_bond_amount + bond_to_be_added.unwrap_or(0)
            - bond_to_be_subtracted.unwrap_or(0));

    address_bonds.weighted_liveliness_score = weighted_liveliness_new;
    address_bonds.last_update_timestamp = current_timestamp;

    if !bypass_liveliness_score {
        liveliness_score = weighted_liveliness_score_decayed;
    }

    let address_claimable_rewards = calculate_address_share_in_rewards(
        rewards_config.accumulated_rewards,
        rewards_config.rewards_per_share,
        address_bonds.address_total_bond_amount,
        address_rewards.address_rewards_per_share,
        vault_config.total_bond_amount,
        liveliness_score,
        bypass_liveliness_score,
    );

    address_rewards.address_rewards_per_share = rewards_config.rewards_per_share;
    address_rewards.claimable_amount += address_claimable_rewards;

    Ok(())
}
