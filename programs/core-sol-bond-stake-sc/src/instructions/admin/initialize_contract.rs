use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Mint, Token, TokenAccount},
};

use crate::{BondState, State, VaultState, ADMIN_PUBKEY, CONTRACT_STATE_SEED, VAULT_OWNER_SEED};

#[derive(Accounts)]
pub struct InitializeContract<'info> {
    #[account(
        init,
        payer=authority,
        seeds=[CONTRACT_STATE_SEED.as_bytes()],
        bump,
        space=BondState::INIT_SPACE
    )]
    pub contract_state: Account<'info, BondState>,

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
    pub fn initialize_contract_and_vault(
        &mut self,
        bumps: &InitializeContractBumps,
        mint_of_token: Pubkey,
        mint_of_collection: Pubkey,
        lock_period: u64,
        bond_amount: u64,
    ) -> Result<()> {
        self.contract_state.set_inner(BondState {
            bump: bumps.contract_state,
            mint_of_collection,
            lock_period,
            bond_amount,
            contract_state: State::Inactive.to_code(),
            padding: [0; 128],
        });

        self.vault_state.set_inner(VaultState {
            bump: bumps.vault_state,
            vault: self.vault.key(),
            mint_of_token,
            total_bond_amount: 0,
            padding: [0; 64],
        });

        Ok(())
    }
}
