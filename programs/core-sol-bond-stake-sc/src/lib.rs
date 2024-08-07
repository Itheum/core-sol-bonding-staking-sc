use anchor_lang::prelude::*;

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
