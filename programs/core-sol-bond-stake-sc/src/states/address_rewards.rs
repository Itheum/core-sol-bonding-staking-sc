use anchor_lang::prelude::*;

#[account]
pub struct AddressRewards {
    pub bump: u8,
    pub address: Pubkey,
    pub address_rewards_per_share: u64,
    pub claimable_amount: u64,
    pub padding: [u8; 16],
}
impl Space for AddressRewards {
    const INIT_SPACE: usize = 8 + 1 + 32 + 8 + 8 + 16;
}
