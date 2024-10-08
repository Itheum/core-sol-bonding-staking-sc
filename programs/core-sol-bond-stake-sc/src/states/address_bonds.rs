use anchor_lang::prelude::*;

#[account]
pub struct AddressBonds {
    pub bump: u8,
    pub address: Pubkey,
    pub address_total_bond_amount: u64,
    pub current_index: u8,
    pub padding: [u8; 32],
}
impl Space for AddressBonds {
    const INIT_SPACE: usize = 8 + 1 + 32 + 8 + 1 + 32;
}
