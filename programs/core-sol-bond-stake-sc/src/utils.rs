fn compute_bond_score(lock_period: u64, current_timestamp: u64, unbond_timestamp: u64) -> u64 {
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
