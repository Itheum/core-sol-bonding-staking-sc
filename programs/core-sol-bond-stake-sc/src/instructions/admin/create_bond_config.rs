use anchor_lang::prelude::*;
use anchor_spl::token::Mint;

use crate::{BondConfig, State, ADMIN_PUBKEY, BOND_CONFIG_SEED};

#[derive(Accounts)]
#[instruction(index: u8)]
pub struct CreateBondConfig<'info> {
    #[account(
        init,
        payer=authority,
        seeds=[BOND_CONFIG_SEED.as_bytes(),&index.to_be_bytes()],
        bump,
        space=BondConfig::INIT_SPACE
    )]
    pub bond_config: Account<'info, BondConfig>,

    pub mint_of_collection: Account<'info, Mint>,

    #[account(
        mut,
        address=ADMIN_PUBKEY,
    )]
    pub authority: Signer<'info>,

    system_program: Program<'info, System>,
}

impl<'info> CreateBondConfig<'info> {
    pub fn create_bond_config(
        &mut self,
        index: u8,
        bumps: &CreateBondConfigBumps,
        lock_period: u64,
        bond_amount: u64,
    ) -> Result<()> {
        self.bond_config.set_inner(BondConfig {
            bump: bumps.bond_config,
            index,
            bond_state: State::Inactive.to_code(),
            mint_of_collection: self.mint_of_collection.key(),
            lock_period,
            bond_amount,
            padding: [0; 128],
        });

        Ok(())
    }
}
