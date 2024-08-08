use anchor_lang::prelude::*;

use crate::{ContractState, State, ADMIN_PUBKEY, CONTRACT_STATE_SEED};

#[derive(Accounts)]
pub struct InitializeContract<'info> {
    #[account(
        init,
        payer=authority,
        seeds=[CONTRACT_STATE_SEED.as_bytes()],
        bump,
        space=ContractState::INIT_SPACE
    )]
    pub contract_state: Account<'info, ContractState>,

    #[account(
        mut,
        address=ADMIN_PUBKEY,
    )]
    pub authority: Signer<'info>,

    system_program: Program<'info, System>,
}

impl<'info> InitializeContract<'info> {
    pub fn initialize_contract(
        &mut self,
        bumps: &InitializeContractBumps,
        mint_of_token: Pubkey,
        mint_of_collection: Pubkey,
        lock_period: u64,
        bond_amount: u64,
    ) -> Result<()> {
        self.contract_state.set_inner(ContractState {
            bump: bumps.contract_state,
            mint_of_token,
            mint_of_collection,
            lock_period,
            bond_amount,
            total_bond_amount: 0,
            contract_state: State::Inactive.to_code(),
            padding: [0; 128],
        });

        Ok(())
    }
}
