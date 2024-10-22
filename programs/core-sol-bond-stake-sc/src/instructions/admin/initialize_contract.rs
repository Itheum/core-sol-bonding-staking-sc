use std::ops::DerefMut;

use anchor_lang::prelude::*;
use anchor_spl::{associated_token::AssociatedToken, token::Token};

use crate::{
    BondConfig, RewardsConfig, State, ADMIN_PUBKEY, BOND_CONFIG_SEED, REWARDS_CONFIG_SEED,
};

#[derive(Accounts)]
#[instruction(index: u8)]
pub struct InitializeContract<'info> {
    #[account(
        init,
        payer=authority,
        seeds=[BOND_CONFIG_SEED.as_bytes(),index.to_be_bytes().as_ref()],
        bump,
        space=BondConfig::INIT_SPACE
    )]
    pub bond_config: Box<Account<'info, BondConfig>>,

    #[account(
        init,
        payer=authority,
        seeds=[REWARDS_CONFIG_SEED.as_bytes()],
        bump,
        space=RewardsConfig::INIT_SPACE
    )]
    pub rewards_config: Box<Account<'info, RewardsConfig>>,

    /// CHECK: unsafe
    pub merkle_tree: UncheckedAccount<'info>,

    #[account(
        mut,
        address=ADMIN_PUBKEY,
    )]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

pub fn initialize_contract(
    ctx: Context<InitializeContract>,
    index: u8,
    lock_period: u64,
    bond_amount: u64,
    rewards_per_slot: u64,
    max_apr: u64,
    withdraw_penalty: u64,
) -> Result<()> {
    let bond_config = ctx.accounts.bond_config.deref_mut();

    bond_config.bump = ctx.bumps.bond_config;
    bond_config.index = index;
    bond_config.bond_state = State::Inactive.to_code();
    bond_config.merkle_tree = ctx.accounts.merkle_tree.key();
    bond_config.lock_period = lock_period;
    bond_config.bond_amount = bond_amount;
    bond_config.withdraw_penalty = withdraw_penalty;
    bond_config.padding = [0; 32];

    let rewards_config = ctx.accounts.rewards_config.deref_mut();

    rewards_config.bump = ctx.bumps.rewards_config;
    rewards_config.rewards_state = State::Inactive.to_code();
    rewards_config.rewards_reserve = 0;
    rewards_config.accumulated_rewards = 0;
    rewards_config.rewards_per_slot = rewards_per_slot;
    rewards_config.rewards_per_share = 0;
    rewards_config.last_reward_slot = 0;
    rewards_config.max_apr = max_apr;
    rewards_config.padding = [0; 32];

    Ok(())
}
