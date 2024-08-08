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

    // Contract state
    pub fn initialize_contract(
        ctx: Context<InitializeContract>,
        mint_of_token: Pubkey,
        mint_of_collection: Pubkey,
        lock_period: u64,
        bond_amount: u64,
    ) -> Result<()> {
        ctx.accounts.initialize_contract(
            &ctx.bumps,
            mint_of_token,
            mint_of_collection,
            lock_period,
            bond_amount,
        )
    }

    pub fn set_contract_state_active(ctx: Context<UpdateContract>) -> Result<()> {
        ctx.accounts.update_contract_state(State::Active.to_code())
    }

    pub fn set_contract_state_inactive(ctx: Context<UpdateContract>) -> Result<()> {
        ctx.accounts
            .update_contract_state(State::Inactive.to_code())
    }

    pub fn update_mint_of_token(ctx: Context<UpdateContract>, mint_of_token: Pubkey) -> Result<()> {
        ctx.accounts.update_mint_of_token(mint_of_token)
    }

    pub fn update_mint_of_collection(
        ctx: Context<UpdateContract>,
        mint_of_collection: Pubkey,
    ) -> Result<()> {
        ctx.accounts.update_mint_of_collection(mint_of_collection)
    }

    pub fn update_lock_period(ctx: Context<UpdateContract>, lock_period: u64) -> Result<()> {
        ctx.accounts.update_lock_period(lock_period)
    }

    pub fn update_bond_amount(ctx: Context<UpdateContract>, bond_amount: u64) -> Result<()> {
        ctx.accounts.update_bond_amount(bond_amount)
    }

    // Rewards state
    pub fn initialize_rewards(
        ctx: Context<InitializeRewards>,
        rewards_per_slot: u64,
        max_apr: u64,
    ) -> Result<()> {
        ctx.accounts
            .initialize_rewards(&ctx.bumps, rewards_per_slot, max_apr)
    }

    pub fn set_rewards_state_active(ctx: Context<UpdateRewards>) -> Result<()> {
        ctx.accounts.set_rewards_state_active()
    }

    pub fn set_rewards_state_inactive(ctx: Context<UpdateRewards>) -> Result<()> {
        ctx.accounts.set_rewards_state_inactive()
    }

    pub fn update_rewards_per_slot(
        ctx: Context<UpdateRewards>,
        rewards_per_slot: u64,
    ) -> Result<()> {
        ctx.accounts.update_rewards_per_slot(rewards_per_slot)
    }

    pub fn update_max_apr(ctx: Context<UpdateRewards>, max_apr: u64) -> Result<()> {
        ctx.accounts.update_max_apr(max_apr)
    }
}
