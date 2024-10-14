use anchor_lang::prelude::*;

use crate::{get_current_slot, RewardsConfig, State, ADMIN_PUBKEY, REWARDS_CONFIG_SEED};

#[derive(Accounts)]
pub struct UpdateRewardsConfig<'info> {
    #[account(
        mut,
        seeds=[REWARDS_CONFIG_SEED.as_bytes()],
        bump=rewards_config.bump,
    )]
    pub rewards_config: Account<'info, RewardsConfig>,

    #[account(
        mut,
        address=ADMIN_PUBKEY
    )]
    pub authority: Signer<'info>,
}

pub fn update_rewards_state(ctx: Context<UpdateRewardsConfig>, state: u8) -> Result<()> {
    let rewards_config = &mut ctx.accounts.rewards_config;
    rewards_config.rewards_state = state;
    if state == State::Active.to_code() {
        rewards_config.last_reward_slot = get_current_slot()?;
    }
    Ok(())
}

pub fn update_rewards_per_slot(
    ctx: Context<UpdateRewardsConfig>,
    rewards_per_slot: u64,
) -> Result<()> {
    let rewards_config = &mut ctx.accounts.rewards_config;
    rewards_config.rewards_per_slot = rewards_per_slot;
    Ok(())
}

pub fn update_max_apr(ctx: Context<UpdateRewardsConfig>, max_apr: u64) -> Result<()> {
    let rewards_config = &mut ctx.accounts.rewards_config;
    rewards_config.max_apr = max_apr;
    Ok(())
}
