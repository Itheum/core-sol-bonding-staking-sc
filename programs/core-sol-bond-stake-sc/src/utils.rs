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

#[cfg(test)]
mod compute_bond_score_tests {
    use super::*;

    use quickcheck::quickcheck;

    quickcheck! {
        fn test_compute_bond_score(lock_period: u64, current_timestamp: u64, unbond_timestamp: u64) -> bool {
            let result = compute_bond_score(lock_period, current_timestamp, unbond_timestamp);

            if current_timestamp >= unbond_timestamp {
                result == 0
            } else if lock_period == 0 {
                result == 0
            } else {
                let difference = unbond_timestamp - current_timestamp;
                let expected = (10000u64 / lock_period).saturating_mul(difference);

                result == expected
            }
        }
    }
}
