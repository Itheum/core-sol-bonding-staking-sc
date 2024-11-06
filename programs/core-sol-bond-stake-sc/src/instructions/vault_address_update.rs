use anchor_lang::prelude::*;
use mpl_bubblegum::utils::get_asset_id;

use crate::{
    AddressBondsRewards, Bond, BondConfig, Errors, ADDRESS_BONDS_REWARDS_SEED, BOND_CONFIG_SEED,
    BOND_SEED,
};

#[derive(Accounts)]
#[instruction(bond_config_index:u8, bond_id:u16)]
pub struct VaultAddressUpdate<'info> {
    #[account(
        mut,
        seeds=[ADDRESS_BONDS_REWARDS_SEED.as_bytes(), authority.key().as_ref()],
        bump=address_bonds_rewards.bump,
    )]
    pub address_bonds_rewards: Box<Account<'info, AddressBondsRewards>>,

    #[account(
        mut,
        seeds = [
            BOND_SEED.as_bytes(),
            authority.key().as_ref(),
            &bond_id.to_le_bytes()
        ],
        bump=bond.bump,

    )]
    pub bond: Account<'info, Bond>,

    #[account(
        seeds=[BOND_CONFIG_SEED.as_bytes(),&bond_config_index.to_be_bytes()],
        bump=bond_config.bump,
    )]
    pub bond_config: Account<'info, BondConfig>,

    #[account(
        mut,
        constraint=bond.owner == authority.key() @ Errors::OwnerMismatch,
        constraint=address_bonds_rewards.address==authority.key() @Errors::OwnerMismatch,
    )]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn update_vault_bond(ctx: Context<VaultAddressUpdate>, bond_id: u16, nonce: u64) -> Result<()> {
    let asset_id = get_asset_id(&ctx.accounts.bond_config.merkle_tree.key(), nonce);

    require!(
        asset_id == ctx.accounts.bond.asset_id,
        Errors::AssetIdMismatch
    );

    let address_bonds_rewards = &mut ctx.accounts.address_bonds_rewards;
    address_bonds_rewards.vault_bond_id = bond_id;

    Ok(())
}
