use std::ops::DerefMut;

use anchor_lang::prelude::*;

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

    /// CHECK: unsafe
    pub merkle_tree: UncheckedAccount<'info>,

    #[account(
        mut,
        address=ADMIN_PUBKEY,
    )]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn create_bond_config(
    ctx: Context<CreateBondConfig>,
    index: u8,
    lock_period: u64,
    bond_amount: u64,
    withdraw_penalty: u64,
) -> Result<()> {
    let bond_config = ctx.accounts.bond_config.deref_mut();

    bond_config.bump = ctx.bumps.bond_config;
    bond_config.index = index;
    bond_config.bond_state = State::Inactive.to_code();
    bond_config.merkle_tree = ctx.accounts.merkle_tree.key();
    bond_config.lock_period = lock_period;
    bond_config.bond_amount = bond_amount;
    bond_config.withdraw_penalty = withdraw_penalty;
    // bond_config.padding = [0; 32];

    Ok(())
}
