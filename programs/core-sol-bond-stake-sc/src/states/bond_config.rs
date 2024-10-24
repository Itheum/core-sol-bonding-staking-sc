use anchor_lang::prelude::*;

#[account]
pub struct BondConfig {
    pub bump: u8,
    pub index: u8,
    pub bond_state: u8,
    pub merkle_tree: Pubkey,
    pub lock_period: u64,
    pub bond_amount: u64,
    pub withdraw_penalty: u64,
    pub padding: [u8; 32],
}
impl Space for BondConfig {
    const INIT_SPACE: usize = 8 + 1 + 1 + 1 + 32 + 8 + 8 + 8 + 32;
}
