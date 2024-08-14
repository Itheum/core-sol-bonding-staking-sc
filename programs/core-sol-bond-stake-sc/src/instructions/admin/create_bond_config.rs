use std::ops::DerefMut;

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

pub fn create_bond_config(
    ctx: Context<CreateBondConfig>,
    index: u8,
    lock_period: u64,
    bond_amount: u64,
) -> Result<()> {
    let bond_config = ctx.accounts.bond_config.deref_mut();

    bond_config.bump = ctx.bumps.bond_config;
    bond_config.index = index;
    bond_config.bond_state = State::Inactive.to_code();
    bond_config.mint_of_collection = ctx.accounts.mint_of_collection.key();
    bond_config.lock_period = lock_period;
    bond_config.bond_amount = bond_amount;
    bond_config.padding = [0; 128];

    Ok(())
}
