use anchor_lang::prelude::*;

use crate::{get_current_timestamp, Bond, Errors, BOND_SEED};

#[derive(Accounts)]
#[instruction(bond_id:u8)]
pub struct Renew<'info> {
    #[account(
        mut,
        seeds = [
            BOND_SEED.as_bytes(),
            authority.key().as_ref(),
            &bond_id.to_le_bytes()
        ],
        bump=bond.bump,

    )]
    pub bond: Account<'info, Bond>,

    #[account(
        mut,
        constraint=bond.owner == authority.key() @ Errors::WrongOwner,
    )]
    pub authority: Signer<'info>,
}

pub fn renew(ctx: Context<Renew>) -> Result<()> {
    let current_timestamp = get_current_timestamp()?;

    let bond = &mut ctx.accounts.bond;

    bond.unbond_timestamp = current_timestamp + bond.lock_period;
    bond.bond_timestamp = current_timestamp;

    Ok(())
}
