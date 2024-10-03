use anchor_lang::prelude::*;

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

declare_id!("4zAKaiW68x31n7mRbYQBUgTC9BWL3q4uATjuBc5txYSN");

#[program]
pub mod core_sol_bond_stake_sc {
    use super::*;

    // Bond State
    pub fn initialize_contract(
        ctx: Context<InitializeContract>,
        index: u8,
        lock_period: u64,
        bond_amount: u64,
        rewards_per_slot: u64,
        max_apr: u64,
        withdraw_penalty: u64,
    ) -> Result<()> {
        instructions::initialize_contract(
            ctx,
            index,
            lock_period,
            bond_amount,
            rewards_per_slot,
            max_apr,
            withdraw_penalty,
        )
    }

    pub fn initialize_vault(ctx: Context<InitializeVault>) -> Result<()> {
        instructions::initialize_vault(ctx)
    }

    // Create new bond config
    pub fn create_bond_config(
        ctx: Context<CreateBondConfig>,
        index: u8,
        lock_period: u64,
        bond_amount: u64,
        withdraw_penalty: u64,
    ) -> Result<()> {
        instructions::create_bond_config(ctx, index, lock_period, bond_amount, withdraw_penalty)
    }

    // Update bond config
    pub fn set_bond_state_active(ctx: Context<UpdateBondConfig>, _index: u8) -> Result<()> {
        instructions::update_bond_state(ctx, State::Active.to_code())
    }

    pub fn set_bond_state_inactive(ctx: Context<UpdateBondConfig>, _index: u8) -> Result<()> {
        instructions::update_bond_state(ctx, State::Inactive.to_code())
    }

    pub fn update_merkle_tree(
        ctx: Context<UpdateBondConfig>,
        _index: u8,
        merkle_tree: Pubkey,
    ) -> Result<()> {
        instructions::update_merkle_tree(ctx, merkle_tree)
    }

    pub fn update_lock_period(
        ctx: Context<UpdateBondConfig>,
        _index: u8,
        lock_period: u64,
    ) -> Result<()> {
        instructions::update_lock_period(ctx, lock_period)
    }

    pub fn update_bond_amount(
        ctx: Context<UpdateBondConfig>,
        _index: u8,
        bond_amount: u64,
    ) -> Result<()> {
        instructions::update_bond_amount(ctx, bond_amount)
    }

    pub fn update_withdraw_penalty(
        ctx: Context<UpdateBondConfig>,
        _index: u8,
        withdraw_penalty: u64,
    ) -> Result<()> {
        instructions::update_withdraw_penalty(ctx, withdraw_penalty)
    }

    //Rewards config

    pub fn set_rewards_state_active(ctx: Context<UpdateRewardsConfig>) -> Result<()> {
        instructions::update_rewards_state(ctx, State::Active.to_code())
    }

    pub fn set_rewards_state_inactive(ctx: Context<UpdateRewardsConfig>) -> Result<()> {
        instructions::update_rewards_state(ctx, State::Inactive.to_code())
    }

    pub fn update_rewards_per_slot(
        ctx: Context<UpdateRewardsConfig>,
        rewards_per_slot: u64,
    ) -> Result<()> {
        instructions::update_rewards_per_slot(ctx, rewards_per_slot)
    }

    pub fn update_max_apr(ctx: Context<UpdateRewardsConfig>, max_apr: u64) -> Result<()> {
        instructions::update_max_apr(ctx, max_apr)
    }

    pub fn add_rewards(ctx: Context<RewardsContext>, amount: u64) -> Result<()> {
        instructions::add_rewards(ctx, amount)
    }

    pub fn remove_rewards(ctx: Context<RewardsContext>, amount: u64) -> Result<()> {
        instructions::remove_rewards(ctx, amount)
    }

    // Bonding

    pub fn initialize_address(ctx: Context<InitializeAddress>) -> Result<()> {
        instructions::initialize_address(ctx)
    }

    pub fn bond<'a, 'b, 'c: 'info, 'info>(
        ctx: Context<'a, 'b, 'info, 'info, BondContext<'info>>,
        _bond_config_index: u8,
        bond_id: u8,
        amount: u64,
        asset_id: Pubkey,
        is_vault: bool,
        root: [u8; 32],
        data_hash: [u8; 32],
        creator_hash: [u8; 32],
        nonce: u64,
        index: u32,
    ) -> Result<()> {
        require!(
            ctx.accounts.bond_config.bond_state == State::Active.to_code(),
            Errors::ProgramIsPaused
        );
        instructions::bond(
            ctx,
            bond_id,
            amount,
            asset_id,
            is_vault,
            root,
            data_hash,
            creator_hash,
            nonce,
            index,
        )
    }

    pub fn renew(ctx: Context<Renew>, _bond_config_index: u8, _bond_id: u8) -> Result<()> {
        require!(
            ctx.accounts.bond_config.bond_state == State::Active.to_code(),
            Errors::ProgramIsPaused
        );
        instructions::renew(ctx)
    }

    pub fn withdraw<'a, 'b, 'c: 'info, 'info>(
        ctx: Context<'a, 'b, 'info, 'info, Withdraw<'info>>,
        _bond_config_index: u8,
        _bond_id: u8,
    ) -> Result<()> {
        require!(
            ctx.accounts.bond_config.bond_state == State::Active.to_code(),
            Errors::ProgramIsPaused
        );
        instructions::withdraw(ctx)
    }

    pub fn top_up<'a, 'b, 'c: 'info, 'info>(
        ctx: Context<'a, 'b, 'c, 'info, TopUp<'info>>,
        _bond_config_index: u8,
        _bond_id: u8,
        amount: u64,
    ) -> Result<()> {
        require!(
            ctx.accounts.bond_config.bond_state == State::Active.to_code(),
            Errors::ProgramIsPaused
        );
        instructions::top_up(ctx, amount)
    }

    // Rewards

    pub fn stake_rewards<'a, 'b, 'c: 'info, 'info>(
        ctx: Context<'a, 'b, 'c, 'info, StakeRewards<'info>>,
        _bond_config_index: u8,
        _bond_id: u8,
    ) -> Result<()> {
        require!(
            ctx.accounts.bond_config.bond_state == State::Active.to_code(),
            Errors::ProgramIsPaused
        );
        require!(
            ctx.accounts.rewards_config.rewards_state == State::Active.to_code(),
            Errors::ProgramIsPaused
        );
        instructions::stake_rewards(ctx)
    }

    pub fn claim_rewards<'a, 'b, 'c: 'info, 'info>(
        ctx: Context<'a, 'b, 'c, 'info, ClaimRewards<'info>>,
        _bond_config_index: u8,
    ) -> Result<()> {
        require!(
            ctx.accounts.rewards_config.rewards_state == State::Active.to_code(),
            Errors::ProgramIsPaused
        );
        instructions::claim_rewards(ctx)
    }
}
