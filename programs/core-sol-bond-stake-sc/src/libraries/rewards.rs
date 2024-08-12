use crate::{get_current_slot, State, DIVISION_SAFETY_CONST, MAX_PERCENT, SLOTS_IN_YEAR};
use anchor_lang::prelude::*;

use super::{MulDiv, RewardsCache};

fn generate_aggregated_rewards(
    total_bond_amount: u64,
    rewards_cache: &mut RewardsCache,
) -> Result<()> {
    let last_reward_slot = rewards_cache.last_reward_slot;
    let extra_rewards_unbounded = calculate_rewards_since_last_allocation(rewards_cache)?;
    let max_apr = rewards_cache.max_apr;

    let extra_rewards: u64;
    if max_apr == 0 {
        let extra_rewards_apr_bonded_per_slot =
            get_amount_apr_bounded(rewards_cache.max_apr, rewards_cache.rewards_reserve);

        let current_slot = get_current_slot()?;

        let slot_diff = current_slot - last_reward_slot;

        let extra_rewards_apr_bonded = extra_rewards_apr_bonded_per_slot * slot_diff;

        extra_rewards = core::cmp::min(extra_rewards_unbounded, extra_rewards_apr_bonded);
    } else {
        extra_rewards = extra_rewards_unbounded;
    }

    if extra_rewards > 0 && extra_rewards <= rewards_cache.rewards_reserve {
        let increment = extra_rewards
            .mul_div_floor(DIVISION_SAFETY_CONST, total_bond_amount)
            .unwrap();

        rewards_cache.rewards_per_share += increment;
        rewards_cache.rewards_reserve -= extra_rewards;
        rewards_cache.accumulated_rewards += extra_rewards;
    }

    Ok(())
}

fn get_amount_apr_bounded(max_apr: u64, amount: u64) -> u64 {
    amount * max_apr / MAX_PERCENT / SLOTS_IN_YEAR
}

fn calculate_rewards_since_last_allocation(rewards_cache: &mut RewardsCache) -> Result<u64> {
    let current_slot = get_current_slot()?;

    if !rewards_cache.rewards_state == State::Active.to_code() {
        return Ok(0u64);
    }

    if current_slot <= rewards_cache.last_reward_slot {
        return Ok(0u64);
    }

    let slot_diff = current_slot - rewards_cache.last_reward_slot;

    rewards_cache.last_reward_slot = current_slot;

    Ok(rewards_cache.rewards_per_slot * slot_diff)
}

fn calculate_address_share_in_rewards(
    rewards_cache: &RewardsCache,
    address_bond_amount: u64,
    address_last_reward_slot: u64,
    total_bond_amount: u64,
    bond_score: u64,
) -> u64 {
    if total_bond_amount == 0 {
        return 0;
    }

    if rewards_cache.accumulated_rewards == 0 {
        return 0;
    }

    let address_rewards = address_bond_amount
        .mul_div_floor(
            (rewards_cache.rewards_per_share - address_last_reward_slot),
            DIVISION_SAFETY_CONST,
        )
        .unwrap();

    if bond_score >= 95_00u64 {
        address_rewards
    } else {
        address_rewards
            .mul_div_floor(bond_score, MAX_PERCENT)
            .unwrap()
    }
}
