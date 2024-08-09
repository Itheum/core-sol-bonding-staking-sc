use anchor_lang::prelude::*;

#[account]
pub struct BondConfig {
    pub bump: u8,
    pub bond_state: u8,
    pub mint_of_collection: Pubkey,
    pub lock_period: u64,
    pub bond_amount: u64,
    pub padding: [u8; 128],
}
impl Space for BondConfig {
    const INIT_SPACE: usize = 8 + 1 + 1 + 32 + 8 + 8 + 128;
}
