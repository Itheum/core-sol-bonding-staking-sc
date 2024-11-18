use anchor_lang::prelude::*;

use crate::{
    get_current_timestamp, AddressBondsRewards, RewardsConfig, ADDRESS_BONDS_REWARDS_SEED,
    REWARDS_CONFIG_SEED,
};

#[derive(Accounts)]
pub struct InitializeAddress<'info> {
    #[account(
        init,
        payer=authority,
        seeds=[ADDRESS_BONDS_REWARDS_SEED.as_bytes(), authority.key().as_ref()],
        bump,
        space=AddressBondsRewards::INIT_SPACE
    )]
    pub address_bonds_rewards: Account<'info, AddressBondsRewards>,

    #[account(
        seeds=[REWARDS_CONFIG_SEED.as_bytes()],
        bump=rewards_config.bump,
    )]
    pub rewards_config: Box<Account<'info, RewardsConfig>>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn initialize_address<'info>(ctx: Context<InitializeAddress<'info>>) -> Result<()> {
    ctx.accounts
        .address_bonds_rewards
        .set_inner(AddressBondsRewards {
            bump: ctx.bumps.address_bonds_rewards,
            address: ctx.accounts.authority.key(),
            address_total_bond_amount: 0,
            current_index: 0,
            last_update_timestamp: get_current_timestamp()?,
            address_rewards_per_share: ctx.accounts.rewards_config.rewards_per_share,
            claimable_amount: 0,
            vault_bond_id: 0,
            padding: [0; 16],
        });

    Ok(())
}
