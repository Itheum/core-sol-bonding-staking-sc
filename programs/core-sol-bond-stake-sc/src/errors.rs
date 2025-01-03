use anchor_lang::error_code;

#[error_code]
pub enum Errors {
    #[msg("Program is paused")]
    ProgramIsPaused,
    #[msg("Not whitelisted")]
    NotWhitelisted,
    #[msg("Not whole number")]
    NotWholeNumber,
    #[msg("Not privileged")]
    NotPrivileged,
    #[msg("Not enough balance")]
    NotEnoughBalance,
    #[msg("Owner mismatch")]
    OwnerMismatch,
    #[msg("Mint mismatch")]
    MintMismatch,
    #[msg("Metadata account mismatch")]
    MetadataAccountMismatch,
    #[msg("Mint from wrong collection")]
    MintFromWrongCollection,
    #[msg("Not the Mint creator")]
    NotTheMintCreator,
    #[msg("Wrong amount")]
    WrongAmount,
    #[msg("Wrong bond id")]
    WrongBondId,
    #[msg("Invalid remaining accounts")]
    InvalidRemainingAccounts,
    #[msg("Wrong value")]
    WrongValue,
    #[msg("Bond is inactive")]
    BondIsInactive,
    #[msg("Bond is not a vault")]
    BondIsNotAVault,
    #[msg("Merkle tree mismatch")]
    MerkleTreeMismatch,
    #[msg("Not creator")]
    NotCreator,
    #[msg("Asset Id mismatch")]
    AssetIdMismatch,
    #[msg("Vault bond id mismatch")]
    VaultBondIdMismatch,
}
