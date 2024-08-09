use anchor_lang::prelude::*;

#[account]
pub struct RewardsConfig {
    pub bump: u8,
    pub rewards_state: u8,
    pub rewards_reserve: u64,
    pub accumulated_rewards: u64,
    pub rewards_per_slot: u64,
    pub rewards_per_share: u64,
    pub last_reward_slot: u64,
    pub max_apr: u64,
    pub padding: [u8; 128],
}

impl Space for RewardsConfig {
    const INIT_SPACE: usize = 8 + 1 + 1 + 8 + 8 + 8 + 8 + 8 + 8 + 128;
}
