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

const ITHEUM_TOKEN = process.env.ITHEUM_TOKEN;
const programId = new PublicKey("4nvez1kVuTbeeMBzXkuUfDvFNLuSraAqbxK5NypRMvtM");
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
const PRIVATE_KEY_STR = process.env.PROGRAM_ADMIN_WALLET;
const privateKeys = PRIVATE_KEY_STR.split(",").map(Number);
const admin = Keypair.fromSecretKey(Uint8Array.from(privateKeys));

// Create the transaction using Anchor's methods API
const initializeContract = async () => {
  const transaction = await program.methods
    .initializeContract(
      1, // Index of the Collection Config (we cab have different collections. e.g. NFMeID we can have a setup and another one we can have a diff setup etc)
      new anchor.BN(43200), // Lock period (half a day) 43200 sec is 12 hours
      new anchor.BN(1000e9), // Bonding amount (1000e9 = 1000 ITHEUM)
      new anchor.BN(1e4), // Rewards per slot (1e4 = 10000) - 10000 / 10^9 (10 to the power of 9 - 9 is token decimal)
      new anchor.BN(8000), // Max APR in % (8000 is 80%)
      new anchor.BN(8000) // Withdraw penalty in % (8000 is 80%)
    )
    .signers([admin])
    .accounts({
      bondConfig: bondConfigPda1,
      rewardsConfig: rewardsConfigPda,
      merkleTree: new PublicKey("GpseMQCGcVHt2QxhieSGiEsuS6G5sKpEHeAWYwUx5z5c"), // Replace with your actual merkle tree address
      authority: admin.publicKey, // The admin will act as the authority
    })
    .transaction();

  const transactionSignature = await connection.sendTransaction(transaction, [
    admin,
  ]);

  console.log(transactionSignature);
};

// initializeContract();

const initializeVault = async () => {
  const vault_ata = await getOrCreateAssociatedTokenAccount(
    connection,
    admin,
    new PublicKey(ITHEUM_TOKEN),
    vaultConfig,
    true,
    "finalized"
  );

  // we delay so the ATA is ready or we may get a TokenAccountNotFoundError not found error
  await new Promise((resolve) => setTimeout(resolve, 5000));

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

  console.log(transactionSignature);
};

// initializeVault();

const setBondStateActive = async () => {
  const tx = await program.methods
    .setBondStateActive(1) // 1 is the Collection Config
    .signers([admin])
    .accounts({
      bondConfig: bondConfigPda1,
      authority: admin.publicKey,
    })
    .transaction();

  const transactionSignature = await connection.sendTransaction(tx, [admin]);

  console.log(transactionSignature);
};

// setBondStateActive();

const setBondStateInactive = async () => {
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

// setBondStateInactive();

const addRewards = async (amount: anchor.BN) => {
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

  console.log(transactionSignature);
};

// addRewards(new anchor.BN(1000000e9)); // 1000000e9 is 1M

const updateRewardsPerSlot = async (rewards: number) => {
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

// updateRewardsPerSlot(1000000)

const updateMaxPercentage = async (percentage: number) => {
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

// updateMaxPercentage(8000)

const setRewardsStateActive = async () => {
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

// setRewardsStateActive();

const setRewardsStateInactive = async () => {
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

// setRewardsStateInactive();

// Below are some manual testing scripts.
const object_response =
  '{"assetId":"F1h2kBVpb3bPeNYiMAQxUBrURxNXtjV25B6He9S63Xre","leafSchema":{"__kind":"V1","id":"F1h2kBVpb3bPeNYiMAQxUBrURxNXtjV25B6He9S63Xre","owner":"7jwJ1V27b91GoeWNuNcjVVZy2kv4PUab6MyZoKcwZy5o","delegate":"7jwJ1V27b91GoeWNuNcjVVZy2kv4PUab6MyZoKcwZy5o","nonce":28,"dataHash":{"0":69,"1":204,"2":218,"3":52,"4":77,"5":10,"6":199,"7":233,"8":245,"9":87,"10":127,"11":45,"12":212,"13":64,"14":124,"15":209,"16":147,"17":64,"18":243,"19":252,"20":90,"21":115,"22":189,"23":33,"24":9,"25":156,"26":190,"27":136,"28":242,"29":182,"30":253,"31":37},"creatorHash":{"0":77,"1":213,"2":154,"3":225,"4":97,"5":203,"6":74,"7":63,"8":198,"9":140,"10":244,"11":87,"12":144,"13":15,"14":74,"15":46,"16":161,"17":9,"18":203,"19":202,"20":242,"21":175,"22":172,"23":151,"24":43,"25":195,"26":151,"27":143,"28":107,"29":138,"30":102,"31":27}},"index":28,"root":[153,5,27,166,131,202,163,237,254,166,244,131,17,183,239,54,26,192,126,177,64,187,189,26,220,44,163,70,99,162,241,134],"proof":{"root":"BJKtvp9MjxNT7M5cpJ5vsEwP9i6qupkThTUWZHEk8ni1","proof":["11111111111111111111111111111111","Cf5tmmFZ4D31tviuJezHdFLf5WF7yFvzfxNyftKsqTwr","DJ1kkERH23xtXVC5w4JM8VuLaGBFMSzjnEhu8ds6BiWR","7kieKvZEkYzsP2KFniw1R94R5xLtxiQEfn1jJY9qrb6a","CX6YjLNphY2mUgDCt2MSWGUWmDB8aoJEoRiabxFgjQDb","zLUDhASAn7WA1Aqc724azRpZjKCjMQNATApe74JMg8C","ABnEXHmveD6iuMwfw2po7t6TPjn5kYMVwYJMi3fa9K91","JDh7eiWiUWtiWn623iybHqjQ6AQ6c2Czz8m6ZxwSCkta","BFvmeiEuzAYcMR8YxcuCMGYPDpjcmP5hsNbcswgQ8pMc","EvxphsdRErrDMs9nhFfF4nzq8i1C2KSogA7uB96TPpPR","HpMJWAzQv9HFgHBqY1o8V1B27sCYPFHJdGivDA658jEL","HjnrJn5vBUUzpCxzjjM9ZnCPuXei2cXKJjX468B9yWD7","4YCF1CSyTXm1Yi9W9JeYevawupkomdgy2dLxEBHL9euq","E3oMtCuPEauftdZLX8EZ8YX7BbFzpBCVRYEiLxwPJLY2"],"node_index":16412,"leaf":"BTVmcRPBuutDxfGhxcCXGHdgHCEhZrvdxj36CFG7arzt","tree_id":"GpseMQCGcVHt2QxhieSGiEsuS6G5sKpEHeAWYwUx5z5c"}}';

const object2_response =
  '{"assetId":"AEdTGc4kWLco9vkWQrAUKbtzzPva9QmWYJMxHeBvjJtq","leafSchema":{"__kind":"V1","id":"AEdTGc4kWLco9vkWQrAUKbtzzPva9QmWYJMxHeBvjJtq","owner":"BAC786427LZg4iK2TaLaHVStYhcwHxWingCUGqzMatei","delegate":"BAC786427LZg4iK2TaLaHVStYhcwHxWingCUGqzMatei","nonce":32,"dataHash":{"0":69,"1":204,"2":218,"3":52,"4":77,"5":10,"6":199,"7":233,"8":245,"9":87,"10":127,"11":45,"12":212,"13":64,"14":124,"15":209,"16":147,"17":64,"18":243,"19":252,"20":90,"21":115,"22":189,"23":33,"24":9,"25":156,"26":190,"27":136,"28":242,"29":182,"30":253,"31":37},"creatorHash":{"0":77,"1":213,"2":154,"3":225,"4":97,"5":203,"6":74,"7":63,"8":198,"9":140,"10":244,"11":87,"12":144,"13":15,"14":74,"15":46,"16":161,"17":9,"18":203,"19":202,"20":242,"21":175,"22":172,"23":151,"24":43,"25":195,"26":151,"27":143,"28":107,"29":138,"30":102,"31":27}},"index":32,"root":[95,115,57,29,46,187,206,174,111,140,123,137,116,223,51,146,251,0,162,65,128,1,165,7,4,218,168,48,18,247,192,201],"proof":{"root":"7RbdqkiSF4QmMr65we9QPgPA5i49CeiDhoMHBphaFm84","proof":["11111111111111111111111111111111","Cf5tmmFZ4D31tviuJezHdFLf5WF7yFvzfxNyftKsqTwr","DAbAU9srHpEUogXWuhy5VZ7g8UX9STymELtndcx1xgP1","3HCYqQRcQSChEuAw1ybNYHibrTNNjzbYzm56cmEmivB6","GSz87YKd3YoZWcEKhnjSsYJwv8o5aWGdBdGGYUphRfTh","4K6tKnbfNar36yQDrWvb2KSjm4y6C8aUAAcXq94BoxkG","ABnEXHmveD6iuMwfw2po7t6TPjn5kYMVwYJMi3fa9K91","JDh7eiWiUWtiWn623iybHqjQ6AQ6c2Czz8m6ZxwSCkta","BFvmeiEuzAYcMR8YxcuCMGYPDpjcmP5hsNbcswgQ8pMc","EvxphsdRErrDMs9nhFfF4nzq8i1C2KSogA7uB96TPpPR","HpMJWAzQv9HFgHBqY1o8V1B27sCYPFHJdGivDA658jEL","HjnrJn5vBUUzpCxzjjM9ZnCPuXei2cXKJjX468B9yWD7","4YCF1CSyTXm1Yi9W9JeYevawupkomdgy2dLxEBHL9euq","E3oMtCuPEauftdZLX8EZ8YX7BbFzpBCVRYEiLxwPJLY2"],"node_index":16416,"leaf":"BJ4wXh1HvjmJV8cCuQn5PuFxcL7TyJHnPCKRZwGHVV7A","tree_id":"GpseMQCGcVHt2QxhieSGiEsuS6G5sKpEHeAWYwUx5z5c"}}';

const cnft_data = JSON.parse(object2_response);

const initializeAddress = async () => {
  const pk =
    "rDQ9vxwjaqrXQZk6Y6CXTAsoVMd2C33VLejE8p1Gd3Xgobyk5RKrGWXZ9H6CsZsNCVxStBMVXV9nKByKTcEKCUD";

  const user = Keypair.fromSecretKey(Uint8Array.from(bs58.decode(pk)));

  const addressBondsRewards = PublicKey.findProgramAddressSync(
    [Buffer.from("address_bonds_rewards"), user.publicKey.toBuffer()],
    program.programId
  )[0];

  const transaction = await program.methods
    .initializeAddress()
    .signers([user])
    .accounts({
      addressBondsRewards: addressBondsRewards,
      rewardsConfig: rewardsConfigPda,
      authority: user.publicKey,
    })
    .transaction();

  const transactionSignature = await connection.sendTransaction(transaction, [
    user,
  ]);

  console.log(transactionSignature);
};

// initializeAddress()

// const bond = async () => {
//   const asset_id = cnft_data.assetId;

//   const proofPathAsAccounts = mapProof(cnft_data.proof.proof);

//   const root = decode(cnft_data.proof.root);

//   const dataHash = Object.values(cnft_data.leafSchema.dataHash) as number[];

//   const creatorHash = Object.values(
//     cnft_data.leafSchema.creatorHash as number[]
//   );

//   const nonce = cnft_data.leafSchema.nonce;
//   const index = cnft_data.index;

//   const pk =
//     "rDQ9vxwjaqrXQZk6Y6CXTAsoVMd2C33VLejE8p1Gd3Xgobyk5RKrGWXZ9H6CsZsNCVxStBMVXV9nKByKTcEKCUD";

//   const user = Keypair.fromSecretKey(Uint8Array.from(bs58.decode(pk)));

//   console.log(user.publicKey.toBase58());

//   const userBondsRewards = PublicKey.findProgramAddressSync(
//     [Buffer.from("address_bonds_rewards"), user.publicKey.toBuffer()],
//     program.programId
//   )[0];

//   const bond1 = PublicKey.findProgramAddressSync(
//     [Buffer.from("bond"), user.publicKey.toBuffer(), Buffer.from([2])],
//     program.programId
//   )[0];

//   const assetUsage = PublicKey.findProgramAddressSync(
//     [new PublicKey(asset_id).toBuffer()],
//     program.programId
//   )[0];

//   const vault_ata = await getAssociatedTokenAddress(
//     new PublicKey(ITHEUM_TOKEN),
//     vaultConfig,
//     true
//   );

//   const user_itheum_ata = await getAssociatedTokenAddress(
//     new PublicKey(ITHEUM_TOKEN),
//     user.publicKey,
//     true
//   );

//   const transaction = await program.methods
//     .bond(
//       1,
//       2,
//       new anchor.BN(1000e9),
//       new PublicKey(asset_id),
//       true,
//       root,
//       dataHash,
//       creatorHash,
//       new anchor.BN(nonce),
//       index
//     )
//     .signers([user])
//     .accounts({
//       addressBondsRewards: userBondsRewards,
//       assetUsage: assetUsage,
//       bond: bond1,
//       bondConfig: bondConfigPda1,
//       rewardsConfig: rewardsConfigPda,
//       vaultConfig: vaultConfig,
//       vault: vault_ata,
//       mintOfTokenSent: new PublicKey(ITHEUM_TOKEN),
//       authority: user.publicKey,
//       merkleTree: new PublicKey("GpseMQCGcVHt2QxhieSGiEsuS6G5sKpEHeAWYwUx5z5c"),
//       authorityTokenAccount: user_itheum_ata,
//       systemProgram: anchor.web3.SystemProgram.programId,
//       tokenProgram: TOKEN_PROGRAM_ID,
//       associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
//       compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
//     })
//     .remainingAccounts(proofPathAsAccounts)
//     .transaction();

//   const transactionSignature = await connection.sendTransaction(
//     transaction,
//     [user],
//     { skipPreflight: true }
//   );

//   console.log(transactionSignature);
// };

// bond();
