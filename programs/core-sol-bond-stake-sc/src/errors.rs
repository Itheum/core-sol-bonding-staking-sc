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
}
