use anchor_lang::prelude::*;

use crate::{
    AddressBondsRewards, Bond, BondConfig, Errors, State, ADDRESS_BONDS_REWARDS_SEED,
    BOND_CONFIG_SEED, BOND_SEED,
};

#[derive(Accounts)]
#[instruction(bond_config_index:u8, bond_id:u8, parent_bond_id:u8, start_nonce: u64, end_nonce: u64)]

pub struct BondRange<'info> {
    #[account(
        mut,
        seeds=[ADDRESS_BONDS_REWARDS_SEED.as_bytes(), authority.key().as_ref()],
        bump=address_bonds_rewards.bump,
    )]
    pub address_bonds_rewards: Box<Account<'info, AddressBondsRewards>>,

    // a way to limit the usage of the range again
    // To be added
    #[account(
        seeds=[BOND_SEED.as_bytes(),authority.key().as_ref(),&parent_bond_id.to_le_bytes()],
        bump,
    )]
    pub parent_bond: Box<Account<'info, Bond>>,

    #[account(
        init,
        payer = authority,
        constraint=address_bonds_rewards.current_index + 1 == bond_id  @ Errors::WrongBondId,
        seeds = [
            BOND_SEED.as_bytes(),
            authority.key().as_ref(),
            &bond_id.to_le_bytes()
        ],
        bump,
        space = Bond::INIT_SPACE
    )]
    pub bond: Box<Account<'info, Bond>>,

    #[account(
        seeds=[BOND_CONFIG_SEED.as_bytes(),&bond_config_index.to_be_bytes()],
        bump=bond_config.bump,
    )]
    pub bond_config: Box<Account<'info, BondConfig>>,

    /// CHECK: unsafe
    #[account(
        constraint= merkle_tree.key() == bond_config.merkle_tree.key() @ Errors::MerkleTreeMismatch,
    )]
    pub merkle_tree: UncheckedAccount<'info>,

    #[account(
        mut,
        constraint=address_bonds_rewards.address == authority.key() @ Errors::OwnerMismatch,
    )]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn bond_range<'info>(
    ctx: Context<BondRange>,
    _bond_config_index: u8,
    bond_id: u8,
    _parent_bond_id: u8,
    start_nonce: u64,
    end_nonce: u64,
) -> Result<()> {
    require!(
        ctx.accounts.parent_bond.is_vault,
        Errors::ParentBondIsNotVault
    );
    require!(
        ctx.accounts.parent_bond.state == State::Active.to_code(),
        Errors::ParentBondIsNotActive
    );

    let address_bonds_rewards = &mut ctx.accounts.address_bonds_rewards;

    address_bonds_rewards.current_index = bond_id;

    ctx.accounts.bond.set_inner(Bond {
        bump: ctx.bumps.bond,
        state: State::Child.to_code(),
        is_vault: false,
        unbond_timestamp: 0u64,
        bond_timestamp: 0u64,
        bond_amount: 0u64,
        asset_id: Pubkey::default(),
        owner: ctx.accounts.authority.key(),
        parent_bond: ctx.accounts.parent_bond.key(),
        start_nonce,
        end_nonce,
        padding: [0; 16],
    });

    Ok(())
}
