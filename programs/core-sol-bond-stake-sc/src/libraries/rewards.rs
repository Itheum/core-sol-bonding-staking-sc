use crate::{
    compute_bond_score, get_current_slot, get_current_timestamp, AddressBonds, AddressRewards,
    Bond, Errors, RewardsConfig, State, DIVISION_SAFETY_CONST, MAX_PERCENT, SLOTS_IN_YEAR,
};
use anchor_lang::prelude::*;

use super::full_math::MulDiv;

pub fn generate_aggregated_rewards<'a, 'b, 'c: 'info, 'info>(
    total_bond_amount: u64,
    rewards_config: &mut Account<'info, RewardsConfig>,
) -> Result<()> {
    let last_reward_slot = rewards_config.last_reward_slot;
    let extra_rewards_unbounded = calculate_rewards_since_last_allocation(rewards_config)?;
    let max_apr = rewards_config.max_apr;

    let extra_rewards: u64;
    if max_apr == 0 {
        let extra_rewards_apr_bonded_per_slot =
            get_amount_apr_bounded(rewards_config.max_apr, rewards_config.rewards_reserve);

        let current_slot = get_current_slot()?;

        let slot_diff = current_slot - last_reward_slot;

        let extra_rewards_apr_bonded = extra_rewards_apr_bonded_per_slot * slot_diff;

        extra_rewards = core::cmp::min(extra_rewards_unbounded, extra_rewards_apr_bonded);
    } else {
        extra_rewards = extra_rewards_unbounded;
    }

    if extra_rewards > 0 && extra_rewards <= rewards_config.rewards_reserve {
        let increment = extra_rewards
            .mul_div_floor(DIVISION_SAFETY_CONST, total_bond_amount)
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
    address_rewards: &mut Account<'info, AddressRewards>,
    address_bonds: &mut Account<'info, AddressBonds>,
    remaining_accounts: &'info [AccountInfo<'info>],
    total_bond_amount: u64,
    bypass_liveliness_score: bool,
) -> Result<()> {
    generate_aggregated_rewards(total_bond_amount, rewards_config)?;

    let current_timestamp = get_current_timestamp()?;

    let mut liveliness_score = 0u64;

    if !bypass_liveliness_score {
        // fetch remaining accounts and compute liveliness
        require!(
            remaining_accounts.len() == address_bonds.current_index as usize,
            Errors::InvalidRemainingAccounts
        );

        let mut total_bond_score = 0u64;
        let mut bond_amounts = 0u64;

        // load remaining accounts on the heap
        for account in remaining_accounts.iter() {
            let bond = Box::new(Account::<Bond>::try_from(account)?);
            require!(bond.owner == address_bonds.address, Errors::WrongOwner);
            if bond.state == State::Inactive.to_code() {
                continue;
            }
            bond_amounts += bond.bond_amount;
            total_bond_score +=
                compute_bond_score(bond.lock_period, current_timestamp, bond.unbond_timestamp)
                    * bond.bond_amount;
        }

        liveliness_score = total_bond_score / bond_amounts;
    }

    let address_claimable_rewards = calculate_address_share_in_rewards(
        rewards_config.accumulated_rewards,
        rewards_config.rewards_per_share,
        address_bonds.address_total_bond_amount,
        address_rewards.address_rewards_per_share,
        total_bond_amount,
        liveliness_score,
        bypass_liveliness_score,
    );

    address_rewards.address_rewards_per_share = rewards_config.rewards_per_share;
    address_rewards.claimable_amount += address_claimable_rewards;
    rewards_config.accumulated_rewards -= address_claimable_rewards;

    Ok(())
}
