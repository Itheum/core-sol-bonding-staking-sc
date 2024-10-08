///! 128 bit number
///! U128 is more efficient that u128
///! https://github.com/solana-labs/solana/issues/19549
use uint::construct_uint;
construct_uint! {
    pub struct U128(2);
}
