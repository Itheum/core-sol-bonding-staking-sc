use anchor_lang::prelude::*;

use crate::{
    get_current_timestamp, AddressBonds, AddressRewards, RewardsConfig, ADDRESS_BONDS_SEED,
    ADDRESS_REWARDS_SEED, REWARDS_CONFIG_SEED,
};

#[derive(Accounts)]
pub struct InitializeAddress<'info> {
    #[account(
        init,
        payer=authority,
        seeds=[ADDRESS_BONDS_SEED.as_bytes(), authority.key().as_ref()],
        bump,
        space=AddressBonds::INIT_SPACE
    )]
    pub address_bonds: Account<'info, AddressBonds>,

    #[account(
        init,
        payer=authority,
        seeds=[ADDRESS_REWARDS_SEED.as_bytes(), authority.key().as_ref()],
        bump,
        space=AddressRewards::INIT_SPACE
    )]
    pub address_rewards: Account<'info, AddressRewards>,

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
    ctx.accounts.address_rewards.set_inner(AddressRewards {
        bump: ctx.bumps.address_rewards,
        address: ctx.accounts.authority.key(),
        address_rewards_per_share: ctx.accounts.rewards_config.rewards_per_share,
        claimable_amount: 0,
        padding: [0; 16],
    });

    ctx.accounts.address_bonds.set_inner(AddressBonds {
        bump: ctx.bumps.address_bonds,
        address: ctx.accounts.authority.key(),
        address_total_bond_amount: 0,
        current_index: 0,
        weighted_liveliness_score: 0,
        last_update_timestamp: get_current_timestamp()?,
        padding: [0; 16],
    });

    Ok(())
}
