use anchor_lang::prelude::*;

use core as core_;
mod contexts;
use contexts::*;
mod states;
use states::*;
mod utils;
use utils::*;
mod libraries;
use libraries::*;

declare_id!("HtLmdHrUHszpc5i85NBHhrjtbkL5AFKThjCqrE9H1PYc");

#[program]
pub mod core_sol_bond_stake_sc {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
