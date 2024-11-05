use anchor_lang::prelude::*;

use crate::{
    compute_decay, compute_weighted_liveliness_decay, compute_weighted_liveliness_new,
    full_math::MulDiv, get_current_timestamp, update_address_claimable_rewards,
    AddressBondsRewards, Bond, BondConfig, Errors, RewardsConfig, State, VaultConfig,
    ADDRESS_BONDS_REWARDS_SEED, BOND_CONFIG_SEED, BOND_SEED, MAX_PERCENT, REWARDS_CONFIG_SEED,
    VAULT_CONFIG_SEED,
};

#[derive(Accounts)]
#[instruction(bond_config_index:u8,bond_id:u8)]
pub struct StakeRewards<'info> {
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
        seeds=[REWARDS_CONFIG_SEED.as_bytes()],
        bump=rewards_config.bump,

    )]
    pub rewards_config: Account<'info, RewardsConfig>,

    #[account(
        mut,
        seeds=[VAULT_CONFIG_SEED.as_bytes()],
        bump=vault_config.bump,
    )]
    pub vault_config: Account<'info, VaultConfig>,

    #[account(
        mut,
        constraint=bond.owner == authority.key() @ Errors::OwnerMismatch,
        constraint=address_bonds_rewards.address==authority.key() @Errors::OwnerMismatch,
    )]
    pub authority: Signer<'info>,
}

pub fn stake_rewards<'a, 'b, 'c: 'info, 'info>(
    ctx: Context<'a, 'b, 'c, 'info, StakeRewards<'info>>,
) -> Result<()> {
    require!(ctx.accounts.bond.is_vault, Errors::BondIsNotAVault);

    require!(
        ctx.accounts.bond.state == State::Active.to_code(),
        Errors::BondIsInactive
    );

    let current_timestamp = get_current_timestamp()?;

    let decay = compute_decay(
        ctx.accounts.address_bonds_rewards.last_update_timestamp,
        current_timestamp,
        ctx.accounts.bond_config.lock_period,
    );

    let weighted_liveliness_score_decayed = compute_weighted_liveliness_decay(
        ctx.accounts.address_bonds_rewards.weighted_liveliness_score,
        decay,
    );

    update_address_claimable_rewards(
        &mut ctx.accounts.rewards_config,
        &mut ctx.accounts.vault_config,
        &mut ctx.accounts.address_bonds_rewards,
    )?;

    let current_timestamp = get_current_timestamp()?;

    let address_bonds_rewards = &mut ctx.accounts.address_bonds_rewards;
    let vault_config = &mut ctx.accounts.vault_config;

    let bond = &mut ctx.accounts.bond;

    let weight_to_be_subtracted = if current_timestamp < bond.unbond_timestamp {
        bond.bond_amount
            .mul_div_floor(
                bond.unbond_timestamp - current_timestamp,
                ctx.accounts.bond_config.lock_period,
            )
            .unwrap()
            * MAX_PERCENT
    } else {
        0
    };
    msg!("weight_to_be_subtracted: {}", weight_to_be_subtracted);
    msg!("weight_to_be_subtracted amount: {}", bond.bond_amount);
    msg!(
        "weight_to_be_subtracted percent: {}",
        bond.unbond_timestamp
            - current_timestamp / ctx.accounts.bond_config.lock_period * MAX_PERCENT
    );

    let actual_claimable_amount;

    if weighted_liveliness_score_decayed >= 95_00u64 {
        actual_claimable_amount = address_bonds_rewards.claimable_amount;
    } else {
        actual_claimable_amount = address_bonds_rewards
            .claimable_amount
            .mul_div_floor(weighted_liveliness_score_decayed, MAX_PERCENT)
            .unwrap();
    }

    bond.unbond_timestamp = current_timestamp + ctx.accounts.bond_config.lock_period;
    bond.bond_timestamp = current_timestamp;
    bond.bond_amount += &actual_claimable_amount;

    vault_config.total_bond_amount += &actual_claimable_amount;

    address_bonds_rewards.claimable_amount = 0;

    let weight_to_be_added = bond.bond_amount * MAX_PERCENT;
    msg!("weight_to_be_added: {}", weight_to_be_added);
    msg!("weight_to_be_added amount: {}", bond.bond_amount);
    msg!("weight_to_be_added percent: {}", MAX_PERCENT);

    let weighted_liveliness_score_new = compute_weighted_liveliness_new(
        weighted_liveliness_score_decayed,
        address_bonds_rewards.address_total_bond_amount,
        address_bonds_rewards.address_total_bond_amount + actual_claimable_amount,
        weight_to_be_added,
        weight_to_be_subtracted,
    );

    address_bonds_rewards.address_total_bond_amount += actual_claimable_amount;
    address_bonds_rewards.weighted_liveliness_score = weighted_liveliness_score_new;
    address_bonds_rewards.last_update_timestamp = current_timestamp;

    Ok(())
}
