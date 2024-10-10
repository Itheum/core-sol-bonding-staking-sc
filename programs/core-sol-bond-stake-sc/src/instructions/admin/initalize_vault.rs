use std::ops::DerefMut;

use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Mint, Token, TokenAccount},
};


use crate::{
     VaultConfig, ADMIN_PUBKEY, 
     VAULT_CONFIG_SEED,
};

#[derive(Accounts)]

pub struct InitializeVault<'info> {
    #[account(
        init,
        payer=authority,
        seeds=[VAULT_CONFIG_SEED.as_bytes()], 
        bump,
        space=VaultConfig::INIT_SPACE,
    )]
    pub vault_config: Account<'info, VaultConfig>,

    #[account(
        init_if_needed,
        payer=authority,
        associated_token::mint=mint_of_token,
        associated_token::authority=vault_config,
    )]
    pub vault: Account<'info, TokenAccount>,

    pub mint_of_token: Account<'info, Mint>,

    #[account(
        mut,
        address=ADMIN_PUBKEY,
    )]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

pub fn initialize_vault(
    ctx: Context<InitializeVault>,
) -> Result<()> {


    let vault_config = ctx.accounts.vault_config.deref_mut();

    vault_config.bump = ctx.bumps.vault_config;
    vault_config.vault = ctx.accounts.vault.key();
    vault_config.mint_of_token = ctx.accounts.mint_of_token.key();
    vault_config.total_bond_amount = 0;
    vault_config.total_penalized_amount = 0;
    vault_config.padding = [0; 32];

   

    Ok(())
}
