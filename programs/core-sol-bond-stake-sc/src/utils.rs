use anchor_lang::prelude::*;
use solana_program::clock;

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

pub fn get_current_timestamp() -> Result<u64> {
    Ok(clock::Clock::get()?.unix_timestamp.try_into().unwrap())
}

pub fn get_current_slot() -> Result<u64> {
    Ok(clock::Clock::get()?.slot.try_into().unwrap())
}
