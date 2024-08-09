use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Mint, Token, TokenAccount},
};

use crate::{
    BondConfig, RewardsConfig, State, VaultState, ADMIN_PUBKEY, CONTRACT_STATE_SEED,
    REWARDS_STATE_SEED, VAULT_OWNER_SEED,
};

#[derive(Accounts)]
#[instruction(index: u8)]
pub struct InitializeContract<'info> {
    #[account(
        init,
        payer=authority,
        seeds=[CONTRACT_STATE_SEED.as_bytes(),&index.to_be_bytes()],
        bump,
        space=BondConfig::INIT_SPACE
    )]
    pub bond_state: Account<'info, BondConfig>,

    #[account(
        init,
        payer=authority,
        seeds=[VAULT_OWNER_SEED.as_bytes()],
        bump,
        space=VaultState::INIT_SPACE,
    )]
    vault_state: Account<'info, VaultState>,

    #[account(
        init_if_needed,
        payer=authority,
        associated_token::mint=mint_of_token,
        associated_token::authority=vault_state,
    )]
    pub vault: Account<'info, TokenAccount>,

    pub mint_of_token: Account<'info, Mint>,
    pub mint_of_collection: Account<'info, Mint>,

    #[account(
        init,
        payer=authority,
        seeds=[REWARDS_STATE_SEED.as_bytes()],
        bump,
        space=RewardsConfig::INIT_SPACE
    )]
    pub rewards_state: Account<'info, RewardsConfig>,

    #[account(
        mut,
        address=ADMIN_PUBKEY,
    )]
    pub authority: Signer<'info>,

    system_program: Program<'info, System>,
    token_program: Program<'info, Token>,
    associated_token_program: Program<'info, AssociatedToken>,
}

impl<'info> InitializeContract<'info> {
    pub fn initialize_contract(
        &mut self,
        bumps: &InitializeContractBumps,
        index: u8,
        lock_period: u64,
        bond_amount: u64,
        rewards_per_slot: u64,
        max_apr: u64,
    ) -> Result<()> {
        self.bond_state.set_inner(BondConfig {
            bump: bumps.bond_state,
            index,
            mint_of_collection: self.mint_of_collection.key(),
            lock_period,
            bond_amount,
            bond_state: State::Inactive.to_code(),
            padding: [0; 128],
        });

        self.vault_state.set_inner(VaultState {
            bump: bumps.vault_state,
            vault: self.vault.key(),
            mint_of_token: self.mint_of_token.key(),
            total_bond_amount: 0,
            padding: [0; 64],
        });

        self.rewards_state.set_inner(RewardsConfig {
            bump: bumps.rewards_state,
            rewards_state: State::Inactive.to_code(),
            rewards_reserve: 0,
            accumulated_rewards: 0,
            rewards_per_slot,
            rewards_per_share: 0,

            last_reward_slot: 0,
            max_apr,
            padding: [0; 128],
        });

        Ok(())
    }
}
