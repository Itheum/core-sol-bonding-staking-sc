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

pub fn compute_bond_score(lock_period: u64, current_timestamp: u64, unbond_timestamp: u64) -> u64 {
    if current_timestamp >= unbond_timestamp {
        0
    } else {
        let difference = unbond_timestamp - current_timestamp;

        if lock_period == 0 {
            0
        } else {
            let div_result = 10000u64.checked_div(lock_period).unwrap_or(0);
            div_result.checked_mul(difference).unwrap_or(0)
        }
    }
}
