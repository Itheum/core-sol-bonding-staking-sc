use anchor_lang::prelude::*;

#[account]
pub struct BondState {
    pub bump: u8,
    pub contract_state: u8,
    pub mint_of_collection: Pubkey,
    pub lock_period: u64,
    pub bond_amount: u64,
    pub padding: [u8; 128],
}
impl Space for BondState {
    const INIT_SPACE: usize = 8 + 1 + 1 + 32 + 8 + 8 + 128;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq)]
pub enum State {
    Inactive = 0,
    Active = 1,
}
impl State {
    pub fn to_code(&self) -> u8 {
        match self {
            State::Inactive => 0,
            State::Active => 1,
        }
    }
}
