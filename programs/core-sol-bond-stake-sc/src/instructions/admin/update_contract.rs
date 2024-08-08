use anchor_lang::prelude::*;

use crate::{BondState, ADMIN_PUBKEY, CONTRACT_STATE_SEED};

#[derive(Accounts)]
pub struct UpdateContract<'info> {
    #[account(
        mut,
        seeds=[CONTRACT_STATE_SEED.as_bytes()],
        bump=contract_state.bump,
    )]
    pub contract_state: Account<'info, BondState>,

    #[account(
        mut,
        address=ADMIN_PUBKEY
    )]
    pub authority: Signer<'info>,
}
impl<'info> UpdateContract<'info> {
    pub fn update_contract_state(&mut self, state: u8) -> Result<()> {
        self.contract_state.contract_state = state;
        Ok(())
    }

    pub fn update_mint_of_collection(&mut self, mint_of_collection: Pubkey) -> Result<()> {
        self.contract_state.mint_of_collection = mint_of_collection;
        Ok(())
    }

    pub fn update_lock_period(&mut self, lock_period: u64) -> Result<()> {
        self.contract_state.lock_period = lock_period;
        Ok(())
    }

    pub fn update_bond_amount(&mut self, bond_amount: u64) -> Result<()> {
        self.contract_state.bond_amount = bond_amount;
        Ok(())
    }
}
