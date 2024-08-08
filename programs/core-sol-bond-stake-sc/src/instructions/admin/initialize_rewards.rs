use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Mint, Token, TokenAccount},
};

use crate::{RewardsState, State, ADMIN_PUBKEY, REWARDS_STATE_SEED};

#[derive(Accounts)]
pub struct InitializeRewards<'info> {
    #[account(
        init,
        payer=authority,
        seeds=[REWARDS_STATE_SEED.as_bytes()],
        bump,
        space=RewardsState::INIT_SPACE
    )]
    pub rewards_state: Account<'info, RewardsState>,

    #[account(
        init_if_needed,
        payer=authority,
        associated_token::mint=mint_of_token,
        associated_token::authority=rewards_state,
    )]
    pub vault: Account<'info, TokenAccount>,

    pub mint_of_token: Account<'info, Mint>,

    #[account(
        mut,
        address=ADMIN_PUBKEY,
    )]
    pub authority: Signer<'info>,

    system_program: Program<'info, System>,
    token_program: Program<'info, Token>,
    associated_token_program: Program<'info, AssociatedToken>,
}

impl<'info> InitializeRewards<'info> {
    pub fn initialize_rewards(
        &mut self,
        bumps: &InitializeRewardsBumps,
        rewards_per_slot: u64,
        max_apr: u64,
    ) -> Result<()> {
        self.rewards_state.set_inner(RewardsState {
            bump: bumps.rewards_state,
            rewards_state: State::Inactive.to_code(),
            vault: self.vault.key(),
            mint_of_token: self.mint_of_token.key(),
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
