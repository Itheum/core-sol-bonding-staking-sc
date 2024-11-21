import {
  AccountMeta,
  Cluster,
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  clusterApiUrl,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import {
  CoreSolBondStakeSc,
  IDL,
} from "../target/types/core_sol_bond_stake_sc";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress,
  getOrCreateAssociatedTokenAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { SPL_ACCOUNT_COMPRESSION_PROGRAM_ID } from "@metaplex-foundation/mpl-bubblegum";

require("dotenv").config();

function decode(stuff: string) {
  return bufferToArray(bs58.decode(stuff));
}

function bufferToArray(buffer: Buffer): number[] {
  const nums: number[] = [];
  for (let i = 0; i < buffer.length; i++) {
    nums.push(buffer[i]);
  }
  return nums;
}

const mapProof = (proof: string[]): AccountMeta[] => {
  return proof.map((node) => ({
    pubkey: new PublicKey(node),
    isSigner: false,
    isWritable: false,
  }));
};

const ITHEUM_TOKEN = process.env.ITHEUM_TOKEN; // load on ENV based on devnet or mainnet
const programId = new PublicKey("B1JpBsoEdseekQYhYGcYX847XUhcU1BRLC9hemTxWkgP"); // mainnet
const connection = new Connection(
  clusterApiUrl(process.env.CLUSTER_URL as Cluster),
  "confirmed"
);

const program = new anchor.Program<CoreSolBondStakeSc>(IDL, programId, {
  connection,
});

const bondConfigPda1 = PublicKey.findProgramAddressSync(
  [Buffer.from("bond_config"), Buffer.from([1])],
  programId
)[0];

const rewardsConfigPda = PublicKey.findProgramAddressSync(
  [Buffer.from("rewards_config")],
  programId
)[0];

const vaultConfig = PublicKey.findProgramAddressSync(
  [Buffer.from("vault_config")],
  programId
)[0];

// Extract the private key from the environment variable
const PRIVATE_KEY_STR = process.env.PROGRAM_ADMIN_WALLET; // load on ENV based on devnet or mainnet
const privateKeys = PRIVATE_KEY_STR.split(",").map(Number);
const admin = Keypair.fromSecretKey(Uint8Array.from(privateKeys));

// Create the transaction using Anchor's methods API
const initializeContractMainnet = async () => {
  const transaction = await program.methods
    .initializeContract(
      1, // Index of the Collection Config (we cab have different collections. e.g. NFMeID we can have a setup and another one we can have a diff setup etc)
      new anchor.BN(7884000), // Lock period 7884000s is around 3 months
      new anchor.BN(999e9), // Bonding amount (999e9 = 999 ITHEUM)
      new anchor.BN(2e8), // Rewards per slot .200000000 every block (so 8M ITHEUM tokens vest in 6 months)
      new anchor.BN(4000), // Max APR in % (4000 is 40%)
      new anchor.BN(8000) // Withdraw penalty in % (8000 is 80%)
    )
    .signers([admin])
    .accounts({
      bondConfig: bondConfigPda1,
      rewardsConfig: rewardsConfigPda,
      merkleTree: new PublicKey("3mfKFAcrHmytAUqbky9tMhizjzqr4SpuMwjau6vETF4x"), // Replace with your actual merkle tree address
      authority: admin.publicKey, // The admin will act as the authority
    })
    .transaction();

  const transactionSignature = await connection.sendTransaction(transaction, [
    admin,
  ]);

  console.log("transactionSignature");
  console.log(transactionSignature);
};

// initializeContractMainnet();

const initializeVaultMainnet = async () => {
  const vault_ata = await getOrCreateAssociatedTokenAccount(
    connection,
    admin,
    new PublicKey(ITHEUM_TOKEN),
    vaultConfig,
    true,
    "finalized"
  );

  // we delay so the ATA is ready or we may get a TokenAccountNotFoundError not found error
  await new Promise((resolve) => setTimeout(resolve, 10000));

  const tx = await program.methods
    .initializeVault()
    .signers([admin])
    .accounts({
      vaultConfig: vaultConfig,
      vault: vault_ata.address,
      mintOfToken: new PublicKey(ITHEUM_TOKEN),
      authority: admin.publicKey,
    })
    .transaction();

  const transactionSignature = await connection.sendTransaction(tx, [admin]);

  console.log("transactionSignature");
  console.log(transactionSignature);
};

// initializeVaultMainnet();

const setBondStateActiveMainnet = async () => {
  const tx = await program.methods
    .setBondStateActive(1) // 1 is the Collection Config
    .signers([admin])
    .accounts({
      bondConfig: bondConfigPda1,
      authority: admin.publicKey,
    })
    .transaction();

  const transactionSignature = await connection.sendTransaction(tx, [admin]);

  console.log("transactionSignature");
  console.log(transactionSignature);
};

// setBondStateActiveMainnet();

const setBondStateInactiveMainnet = async () => {
  const tx = await program.methods
    .setBondStateInactive(1) // 1 is the Collection Config
    .signers([admin])
    .accounts({
      bondConfig: bondConfigPda1,
      authority: admin.publicKey,
    })
    .transaction();

  const transactionSignature = await connection.sendTransaction(tx, [admin]);

  console.log(transactionSignature);
};

// setBondStateInactiveMainnet();

const addRewardsMainnet = async (amount: anchor.BN) => {
  const vault_ata = await getAssociatedTokenAddress(
    new PublicKey(ITHEUM_TOKEN),
    vaultConfig,
    true
  );

  const admin_ata = await getAssociatedTokenAddress(
    new PublicKey(ITHEUM_TOKEN),
    admin.publicKey,
    true
  );

  const tx = await program.methods
    .addRewards(amount)
    .signers([admin])
    .accounts({
      rewardsConfig: rewardsConfigPda,
      vaultConfig: vaultConfig,
      vault: vault_ata,
      mintOfToken: new PublicKey(ITHEUM_TOKEN),
      authority: admin.publicKey,
      authorityTokenAccount: admin_ata,
    })
    .transaction();

  const transactionSignature = await connection.sendTransaction(tx, [admin]);

  console.log("transactionSignature");
  console.log(transactionSignature);
};

// addRewardsMainnet(new anchor.BN(8000000e9)); // 8000000e9 is 1M

const updateRewardsPerSlotMainnet = async (rewards: number) => {
  const tx = await program.methods
    .updateRewardsPerSlot(new anchor.BN(rewards))
    .signers([admin])
    .accounts({
      rewardsConfig: rewardsConfigPda,
      authority: admin.publicKey,
    })
    .transaction();

  const transactionSignature = await connection.sendTransaction(tx, [admin]);

  console.log(transactionSignature);
};

// updateRewardsPerSlotMainnet(1e6); // .001000000 (78,840,000 * 001 = 78840 reward per year for everyone to share)

const updateMaxPercentageMainnet = async (percentage: number) => {
  const tx = await program.methods
    .updateMaxApr(new anchor.BN(percentage))
    .signers([admin])
    .accounts({
      rewardsConfig: rewardsConfigPda,
      authority: admin.publicKey,
    })
    .transaction();

  const transactionSignature = await connection.sendTransaction(tx, [admin]);

  console.log(transactionSignature);
};

// updateMaxPercentageMainnet(8000)

const setRewardsStateActiveMainnet = async () => {
  const tx = await program.methods
    .setRewardsStateActive()
    .signers([admin])
    .accounts({
      rewardsConfig: rewardsConfigPda,
      authority: admin.publicKey,
    })
    .transaction();

  const transactionSignature = await connection.sendTransaction(tx, [admin]);

  console.log(transactionSignature);
};

// setRewardsStateActiveMainnet();

const setRewardsStateInactiveMainnet = async () => {
  const tx = await program.methods
    .setRewardsStateInactive()
    .signers([admin])
    .accounts({
      rewardsConfig: rewardsConfigPda,
      authority: admin.publicKey,
    })
    .transaction();

  const transactionSignature = await connection.sendTransaction(tx, [admin]);

  console.log(transactionSignature);
};

// setRewardsStateInactiveMainnet();

const changeLockPeriodMainnet = async (index: number, lockPeriod: number) => {
  const tx = await program.methods
    .updateLockPeriod(index, new anchor.BN(lockPeriod))
    .signers([admin])
    .accounts({
      bondConfig: bondConfigPda1,
      authority: admin.publicKey,
    })
    .transaction();

  const transactionSignature = await connection.sendTransaction(tx, [admin]);

  console.log(transactionSignature);
};

// changeLockPeriodMainnet(1, 10800);
// Lock period (half a day) 43200 sec is 12 hours

const changeMerkleTreeMainnet = async (index: number, merkleTree: string) => {
  const tx = await program.methods
    .updateMerkleTree(index, new PublicKey(merkleTree))
    .signers([admin])
    .accounts({
      bondConfig: bondConfigPda1,
      authority: admin.publicKey,
    })
    .transaction();

  const transactionSignature = await connection.sendTransaction(tx, [admin]);

  console.log(transactionSignature);
};

// changeMerkleTreeMainnet(1, "XXXX");

const changeBondAmountMainnet = async (index: number, bondAmount: number) => {
  const tx = await program.methods
    .updateBondAmount(index, new anchor.BN(bondAmount))
    .signers([admin])
    .accounts({
      bondConfig: bondConfigPda1,
      authority: admin.publicKey,
    })
    .transaction();

  const transactionSignature = await connection.sendTransaction(tx, [admin]);

  console.log(transactionSignature);
};

// changeBondAmountMainnet(1, 1000e9);
// Bonding amount (1000e9 = 1000 ITHEUM)

const changeWithdrawPenaltyMainnet = async (index: number, penalty: number) => {
  const tx = await program.methods
    .updateWithdrawPenalty(index, new anchor.BN(penalty))
    .signers([admin])
    .accounts({
      bondConfig: bondConfigPda1,
      authority: admin.publicKey,
    })
    .transaction();

  const transactionSignature = await connection.sendTransaction(tx, [admin]);

  console.log(transactionSignature);
};

// changeWithdrawPenaltyMainnet(1, 1000);
// Withdraw penalty in % (8000 is 80%)
