use crate::{
  get_current_slot, AddressBondsRewards, RewardsConfig, State, VaultConfig,
  DIVISION_SAFETY_CONST, MAX_PERCENT, SLOTS_IN_YEAR,
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
) -> u64 {
  if total_bond_amount == 0 {
      return 0;
  }

  if accumulated_rewards == 0 {
      return 0;
  }

  let diff = rewards_per_share - address_rewards_per_share;

  let address_rewards = address_bond_amount
      .mul_div_floor(diff, DIVISION_SAFETY_CONST)
      .unwrap();

  address_rewards
}

pub fn update_address_claimable_rewards<'info>(
  rewards_config: &mut Account<'info, RewardsConfig>,
  vault_config: &Account<'info, VaultConfig>,
  address_bonds_rewards: &mut Account<'info, AddressBondsRewards>,
) -> Result<()> {
  generate_aggregated_rewards(rewards_config, vault_config)?;

  let address_claimable_rewards = calculate_address_share_in_rewards(
      rewards_config.accumulated_rewards,
      rewards_config.rewards_per_share,
      address_bonds_rewards.address_total_bond_amount,
      address_bonds_rewards.address_rewards_per_share,
      vault_config.total_bond_amount,
  );

  address_bonds_rewards.address_rewards_per_share = rewards_config.rewards_per_share;
  address_bonds_rewards.claimable_amount += address_claimable_rewards;

  Ok(())
}

pub fn compute_decay(last_update_timestamp: u64, current_timestamp: u64, lock_period: u64) -> u64 {
  (current_timestamp - last_update_timestamp)
      .mul_div_floor(DIVISION_SAFETY_CONST, lock_period)
      .unwrap()
}

pub fn compute_weighted_liveliness_decay(weighted_liveliness_score: u64, decay: u64) -> u64 {
  let weighted_liveliness_score_decayed = weighted_liveliness_score
      .mul_div_floor(
          1 * DIVISION_SAFETY_CONST.saturating_sub(decay),
          DIVISION_SAFETY_CONST,
      )
      .unwrap();

  weighted_liveliness_score_decayed
}

pub fn compute_weighted_liveliness_new(
  weighted_liveliness_score_decayed: u64,
  address_total_bond_amount_before: u64,
  address_totaal_bond_amount_after: u64,
  weight_to_be_added: u64,
  weight_to_be_subtracted: u64,
) -> u64 {
  let new = (weighted_liveliness_score_decayed
      .saturating_mul(address_total_bond_amount_before)
      .saturating_sub(weight_to_be_subtracted)
      .saturating_add(weight_to_be_added))
  .saturating_div(address_totaal_bond_amount_after);

  new
}