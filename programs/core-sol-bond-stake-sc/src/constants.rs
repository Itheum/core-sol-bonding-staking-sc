use solana_program::pubkey;
use solana_program::pubkey::Pubkey;

pub const BOND_SEED: &str = "bond";
pub const ADDRESS_BONDS_REWARDS_SEED: &str = "address_bonds_rewards";
pub const BOND_CONFIG_SEED: &str = "bond_config";
pub const REWARDS_CONFIG_SEED: &str = "rewards_config";
pub const VAULT_CONFIG_SEED: &str = "vault_config";

pub const MAX_PERCENT: u64 = 10_000;
pub const SLOTS_IN_YEAR: u64 = 78_840_000u64;
pub const DIVISION_SAFETY_CONST: u64 = 1_000_000_000;

pub const ADMIN_PUBKEY: Pubkey = pubkey!("1KsJeTvmJaWsAdZba7V7sxQ7zPFKQp1seh2XP9ZHnsd");
