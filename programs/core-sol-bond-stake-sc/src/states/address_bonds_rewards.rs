use anchor_lang::prelude::*;

#[account]
pub struct AddressBondsRewards {
    pub bump: u8,
    pub address: Pubkey,
    pub address_total_bond_amount: u64,
    pub current_index: u16,
    pub weighted_liveliness_score: u64,
    pub last_update_timestamp: u64,
    pub address_rewards_per_share: u64,
    pub claimable_amount: u64,
    pub padding: [u8; 16],
}
impl Space for AddressBondsRewards {
    const INIT_SPACE: usize = 8 + 1 + 32 + 8 + 2 + 8 + 8 + 8 + 8 + 16;
}
