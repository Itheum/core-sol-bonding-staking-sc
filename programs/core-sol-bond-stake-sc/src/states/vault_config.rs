use anchor_lang::prelude::*;

#[account]
pub struct VaultConfig {
    pub bump: u8,
    pub vault: Pubkey,
    pub mint_of_token: Pubkey,
    pub total_bond_amount: u64,
    pub total_penalized_amount: u64,
    pub padding: [u8; 32],
}
impl Space for VaultConfig {
    const INIT_SPACE: usize = 8 + 1 + 32 + 32 + 8 + 8 + 32;
}
