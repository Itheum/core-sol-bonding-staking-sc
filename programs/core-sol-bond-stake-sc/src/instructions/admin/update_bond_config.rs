use anchor_lang::prelude::*;

use crate::{BondConfig, ADMIN_PUBKEY, BOND_CONFIG_SEED};

#[derive(Accounts)]
#[instruction(index:u8)]
pub struct UpdateBondConfig<'info> {
    #[account(
        mut,
        seeds=[BOND_CONFIG_SEED.as_bytes(), &index.to_be_bytes()],
        bump=bond_config.bump,
    )]
    pub bond_config: Account<'info, BondConfig>,

    #[account(
        mut,
        address=ADMIN_PUBKEY
    )]
    pub authority: Signer<'info>,
}

pub fn update_bond_state(ctx: Context<UpdateBondConfig>, state: u8) -> Result<()> {
    let bond_config = &mut ctx.accounts.bond_config;
    bond_config.bond_state = state;
    Ok(())
}

pub fn update_mint_of_collection(
    ctx: Context<UpdateBondConfig>,
    mint_of_collection: Pubkey,
) -> Result<()> {
    let bond_config = &mut ctx.accounts.bond_config;
    bond_config.mint_of_collection = mint_of_collection;
    Ok(())
}

pub fn update_lock_period(ctx: Context<UpdateBondConfig>, lock_period: u64) -> Result<()> {
    let bond_config = &mut ctx.accounts.bond_config;
    bond_config.lock_period = lock_period;
    Ok(())
}

pub fn update_bond_amount(ctx: Context<UpdateBondConfig>, bond_amount: u64) -> Result<()> {
    let bond_config = &mut ctx.accounts.bond_config;
    bond_config.bond_amount = bond_amount;
    Ok(())
}
