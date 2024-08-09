use anchor_lang::prelude::*;

use crate::{BondConfig, ADMIN_PUBKEY, CONTRACT_STATE_SEED};

#[derive(Accounts)]
#[instruction(index:u8)]
pub struct UpdateBondConfig<'info> {
    #[account(
        mut,
        seeds=[CONTRACT_STATE_SEED.as_bytes(), &index.to_be_bytes()],
        bump=bond_state.bump,
    )]
    pub bond_state: Account<'info, BondConfig>,

    #[account(
        mut,
        address=ADMIN_PUBKEY
    )]
    pub authority: Signer<'info>,
}
impl<'info> UpdateBondConfig<'info> {
    pub fn update_bond_state(&mut self, state: u8) -> Result<()> {
        self.bond_state.bond_state = state;
        Ok(())
    }

    pub fn update_mint_of_collection(&mut self, mint_of_collection: Pubkey) -> Result<()> {
        self.bond_state.mint_of_collection = mint_of_collection;
        Ok(())
    }

    pub fn update_lock_period(&mut self, lock_period: u64) -> Result<()> {
        self.bond_state.lock_period = lock_period;
        Ok(())
    }

    pub fn update_bond_amount(&mut self, bond_amount: u64) -> Result<()> {
        self.bond_state.bond_amount = bond_amount;
        Ok(())
    }
}
