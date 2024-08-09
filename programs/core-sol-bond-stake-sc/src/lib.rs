use anchor_lang::prelude::*;

use core as core_;
mod instructions;
use instructions::*;
mod states;
use states::*;
mod utils;
use utils::*;
mod libraries;
use libraries::*;
mod constants;
use constants::*;
mod errors;
use errors::*;

declare_id!("HtLmdHrUHszpc5i85NBHhrjtbkL5AFKThjCqrE9H1PYc");

#[program]
pub mod core_sol_bond_stake_sc {
    use super::*;

    // Bond State
    pub fn initialize_contract(
        ctx: Context<InitializeContract>,
        mint_of_token: Pubkey,
        mint_of_collection: Pubkey,
        lock_period: u64,
        bond_amount: u64,
        rewards_per_slot: u64,
        max_apr: u64,
    ) -> Result<()> {
        ctx.accounts.initialize_contract(
            &ctx.bumps,
            mint_of_token,
            mint_of_collection,
            lock_period,
            bond_amount,
            rewards_per_slot,
            max_apr,
        )
    }

    pub fn set_bond_state_active(ctx: Context<UpdateBondConfig>) -> Result<()> {
        ctx.accounts.update_bond_state(State::Active.to_code())
    }

    pub fn set_bond_state_inactive(ctx: Context<UpdateBondConfig>) -> Result<()> {
        ctx.accounts.update_bond_state(State::Inactive.to_code())
    }

    pub fn update_mint_of_collection(
        ctx: Context<UpdateBondConfig>,
        mint_of_collection: Pubkey,
    ) -> Result<()> {
        ctx.accounts.update_mint_of_collection(mint_of_collection)
    }

    pub fn update_lock_period(ctx: Context<UpdateBondConfig>, lock_period: u64) -> Result<()> {
        ctx.accounts.update_lock_period(lock_period)
    }

    pub fn update_bond_amount(ctx: Context<UpdateBondConfig>, bond_amount: u64) -> Result<()> {
        ctx.accounts.update_bond_amount(bond_amount)
    }

    //Rewards config

    pub fn set_rewards_state_active(ctx: Context<UpdateRewardsConfig>) -> Result<()> {
        ctx.accounts.update_rewards_state(State::Active.to_code())
    }

    pub fn set_rewards_state_inactive(ctx: Context<UpdateRewardsConfig>) -> Result<()> {
        ctx.accounts.update_rewards_state(State::Inactive.to_code())
    }

    pub fn update_rewards_per_slot(
        ctx: Context<UpdateRewardsConfig>,
        rewards_per_slot: u64,
    ) -> Result<()> {
        ctx.accounts.update_rewards_per_slot(rewards_per_slot)
    }

    pub fn update_max_apr(ctx: Context<UpdateRewardsConfig>, max_apr: u64) -> Result<()> {
        ctx.accounts.update_max_apr(max_apr)
    }
}
