use std::ops::Add;

use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Mint, Token, TokenAccount},
};
use mpl_token_metadata::accounts::Metadata;

use crate::{
    get_current_timestamp, update_address_claimable_rewards, AddressBonds, AddressRewards, Bond,
    BondConfig, Errors, RewardsConfig, State, VaultConfig, ADDRESS_BONDS_SEED,
    ADDRESS_REWARDS_SEED, BOND_CONFIG_SEED, BOND_SEED, REWARDS_CONFIG_SEED, VAULT_OWNER_SEED,
};

#[derive(Accounts)]
#[instruction(bond_config_index: u8, bond_id:u8, amount: u64)]
pub struct BondContext<'info> {
    #[account(
        init_if_needed,
        payer=authority,
        seeds=[ADDRESS_BONDS_SEED.as_bytes(), authority.key().as_ref()],
        bump,
        space=AddressBonds::INIT_SPACE
    )]
    pub address_bonds: Account<'info, AddressBonds>,

    #[account(
        init_if_needed,
        payer=authority,
        seeds=[ADDRESS_REWARDS_SEED.as_bytes(), authority.key().as_ref()],
        bump,
        space=AddressRewards::INIT_SPACE
    )]
    pub address_rewards: Account<'info, AddressRewards>,

    #[account(
        init,
        payer = authority,
        constraint=address_bonds.current_index + 1 == bond_id  @ Errors::WrongBondId,
        seeds = [
            BOND_SEED.as_bytes(),
            authority.key().as_ref(),
            &bond_id.to_le_bytes()
        ],
        bump,
        space = Bond::INIT_SPACE
    )]
    pub bond: Account<'info, Bond>,

    #[account(
        seeds=[BOND_CONFIG_SEED.as_bytes(),&bond_config_index.to_be_bytes()],
        bump=bond_config.bump,
    )]
    pub bond_config: Account<'info, BondConfig>,

    #[account(
        seeds=[REWARDS_CONFIG_SEED.as_bytes()],
        bump=rewards_config.bump,
    )]
    pub rewards_config: Account<'info, RewardsConfig>,
    #[account(
        seeds=[VAULT_OWNER_SEED.as_bytes()],
        bump=vault_config.bump,
    )]
    pub vault_config: Account<'info, VaultConfig>,

    #[account(
        mut,
        associated_token::mint=mint_of_token_sent,
        associated_token::authority=vault_config
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        constraint=mint_of_token_sent.key()==vault_config.mint_of_token @ Errors::MintMismatch,
    )]
    pub mint_of_token_sent: Account<'info, Mint>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub mint_of_nft: Account<'info, Mint>,

    /// CHECK: This is the account we'll fetch metadata for
    #[account(mut)]
    pub metadata: AccountInfo<'info>,

    #[account(
        mut,
        constraint=authority_token_account.amount >= amount @ Errors::NotEnoughBalance,
        constraint=authority_token_account.owner==authority.key() @ Errors::OwnerMismatch,
        constraint=authority_token_account.mint==vault_config.mint_of_token @ Errors::MintMismatch,
    )
    ]
    pub authority_token_account: Account<'info, TokenAccount>,

    system_program: Program<'info, System>,
    token_program: Program<'info, Token>,
    associated_token_program: Program<'info, AssociatedToken>,
}
impl<'info> BondContext<'info> {
    pub fn bond(
        &mut self,
        bumps: &BondContextBumps,
        remaining_accounts: &'info [AccountInfo<'info>],
        bond_id: u8,
        amount: u64,
        is_vault: bool,
    ) -> Result<()> {
        require!(self.bond_config.bond_amount == amount, Errors::WrongAmount);

        update_address_claimable_rewards(
            &mut self.rewards_config,
            &mut self.address_rewards,
            &mut self.address_bonds,
            remaining_accounts,
            self.vault_config.total_bond_amount,
            true,
        )?;

        // if bond_id == 1 {
        //     self.address_rewards.set_inner(AddressRewards {
        //         bump: bumps.address_rewards,
        //         address: self.authority.key(),
        //         address_rewards_per_share: 0, // after generate aggregated rewards set this to actual rewards per share
        //         claimable_amount: 0,
        //         padding: [0; 32],
        //     });
        // } else {
        //     // claim rewards
        // }

        // Check if this is updated even if account exists
        self.address_bonds.set_inner(AddressBonds {
            bump: bumps.address_bonds,
            address: self.authority.key(),
            address_total_bond_amount: self.address_bonds.address_total_bond_amount + amount,
            current_index: bond_id,
            padding: [0; 32],
        });

        // Not really required
        let (metadata, _) = Pubkey::find_program_address(
            &[
                "metadata".as_bytes(),
                mpl_token_metadata::ID.as_ref(),
                self.mint_of_nft.key().as_ref(),
            ],
            &mpl_token_metadata::ID,
        );
        // Not really required
        require!(
            metadata == self.metadata.key(),
            Errors::MetadataAccountMismatch
        );

        let mint_metadata = Metadata::safe_deserialize(&self.metadata.try_borrow_data()?)?;

        // Check if the creator is the same as the authority
        let collection_key = mint_metadata
            .collection
            .ok_or(Errors::MintFromWrongCollection)?
            .key;

        require!(
            self.bond_config.mint_of_collection == collection_key,
            Errors::MintFromWrongCollection
        );

        let is_creator = mint_metadata.creators.map_or(false, |creators| {
            creators.iter().any(|c| c.address == self.authority.key())
        });

        require!(is_creator, Errors::NotTheMintCreator);

        let current_timestamp = get_current_timestamp()?;

        self.vault_config
            .total_bond_amount
            .checked_add(amount)
            .unwrap();

        self.bond.set_inner(Bond {
            bump: bumps.bond,
            state: State::Active.to_code(),
            is_vault,
            unbond_timestamp: current_timestamp.add(self.bond_config.lock_period),
            bond_timestamp: current_timestamp,
            bond_amount: amount,
            lock_period: self.bond_config.lock_period,
            mint_of_nft: self.mint_of_nft.key(),
            owner: self.authority.key(),
            padding: [0; 64],
        });

        Ok(())
    }
}
