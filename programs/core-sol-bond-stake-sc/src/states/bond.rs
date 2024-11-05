use anchor_lang::prelude::*;

#[account]
pub struct Bond {
    pub bump: u8,
    pub state: u8,
    pub is_vault: bool,
    pub bond_timestamp: u64,
    pub unbond_timestamp: u64,
    pub bond_amount: u64,
    pub asset_id: Pubkey,
    pub owner: Pubkey,
    // Range bond for cNFTs
    pub parent_bond: Pubkey,
    pub start_nonce: u64,
    pub end_nonce: u64,
    pub padding: [u8; 16],
}
impl Space for Bond {
    const INIT_SPACE: usize = 8 + 1 + 1 + 1 + 8 + 8 + 8 + 32 + 32 + 64;
}
