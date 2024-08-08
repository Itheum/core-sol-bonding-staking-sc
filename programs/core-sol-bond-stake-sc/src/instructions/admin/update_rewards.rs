use anchor_lang::prelude::*;

use crate::{RewardsState, State, ADMIN_PUBKEY, REWARDS_STATE_SEED};

#[derive(Accounts)]
pub struct UpdateRewards<'info> {
    #[account(
        mut,
        seeds=[REWARDS_STATE_SEED.as_bytes()],
        bump=rewards_state.bump,
    )]
    pub rewards_state: Account<'info, RewardsState>,

    #[account(
        mut,
        address=ADMIN_PUBKEY
    )]
    pub authority: Signer<'info>,
}
impl<'info> UpdateRewards<'info> {
    pub fn update_rewards_state(&mut self, state: u8) -> Result<()> {
        self.rewards_state.rewards_state = state;
        Ok(())
    }

    pub fn update_rewards_per_slot(&mut self, rewards_per_slot: u64) -> Result<()> {
        self.rewards_state.rewards_per_slot = rewards_per_slot;
        Ok(())
    }

    pub fn update_max_apr(&mut self, max_apr: u64) -> Result<()> {
        self.rewards_state.max_apr = max_apr;
        Ok(())
    }
}
