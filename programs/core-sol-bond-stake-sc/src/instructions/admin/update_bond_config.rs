use anchor_lang::prelude::*;

use crate::{BondConfig, Errors, ADMIN_PUBKEY, BOND_CONFIG_SEED, MAX_PERCENT};

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

pub fn update_merkle_tree(ctx: Context<UpdateBondConfig>, merkle_tree: Pubkey) -> Result<()> {
    let bond_config = &mut ctx.accounts.bond_config;
    bond_config.merkle_tree = merkle_tree;
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

pub fn update_withdraw_penalty(
    ctx: Context<UpdateBondConfig>,
    withdraw_penalty: u64,
) -> Result<()> {
    require!(withdraw_penalty <= MAX_PERCENT, Errors::WrongValue,);
    let bond_config = &mut ctx.accounts.bond_config;
    bond_config.withdraw_penalty = withdraw_penalty;
    Ok(())
}
