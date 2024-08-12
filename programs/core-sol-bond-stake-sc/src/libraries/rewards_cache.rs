use anchor_lang::prelude::*;

use crate::RewardsConfig;

pub struct RewardsCache<'a> {
    rewards_config: &'a mut Account<'a, RewardsConfig>,
    pub rewards_state: u8,
    pub rewards_reserve: u64,
    pub accumulated_rewards: u64,
    pub rewards_per_slot: u64,
    pub rewards_per_share: u64,
    pub last_reward_slot: u64,
    pub max_apr: u64,
}

impl<'a> RewardsCache<'a> {
    pub fn new(rewards_config: &'a mut Account<'a, RewardsConfig>) -> Self {
        RewardsCache {
            rewards_state: rewards_config.rewards_state,
            rewards_reserve: rewards_config.rewards_reserve,
            accumulated_rewards: rewards_config.accumulated_rewards,
            rewards_per_slot: rewards_config.rewards_per_slot,
            rewards_per_share: rewards_config.rewards_per_share,
            last_reward_slot: rewards_config.last_reward_slot,
            max_apr: rewards_config.max_apr,
            rewards_config,
        }
    }
}

impl<'a> Drop for RewardsCache<'a> {
    fn drop(&mut self) {
        self.rewards_config.rewards_reserve = self.rewards_reserve;
        self.rewards_config.accumulated_rewards = self.accumulated_rewards;
        self.rewards_config.rewards_per_slot = self.rewards_per_slot;
        self.rewards_config.rewards_per_share = self.rewards_per_share;
        self.rewards_config.last_reward_slot = self.last_reward_slot;
        self.rewards_config.max_apr = self.max_apr;
    }
}
