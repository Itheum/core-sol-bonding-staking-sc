use anchor_lang::prelude::*;

#[account]
pub struct VaultState {
    pub bump: u8,
    pub vault: Pubkey,
    pub mint_of_token: Pubkey,
    pub total_bond_amount: u64,
    pub padding: [u8; 64],
}
impl Space for VaultState {
    const INIT_SPACE: usize = 8 + 1 + 32 + 32 + 8 + 64;
}
