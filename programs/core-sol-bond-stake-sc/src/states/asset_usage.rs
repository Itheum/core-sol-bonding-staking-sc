use anchor_lang::prelude::*;

#[account]
pub struct AssetUsage {}
impl Space for AssetUsage {
    const INIT_SPACE: usize = 8;
}
