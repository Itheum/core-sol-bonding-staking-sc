import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { CoreSolBondStakeSc } from "../target/types/core_sol_bond_stake_sc";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionSignature,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createInitializeMint2Instruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  getMinimumBalanceForRentExemptMint,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  generateSigner,
  keypairIdentity,
  percentAmount,
} from "@metaplex-foundation/umi";
import {
  createTree,
  getAssetWithProof,
  getCurrentRoot,
  LeafSchema,
  MetadataArgsArgs,
  mintToCollectionV1,
  mplBubblegum,
  parseLeafFromMintToCollectionV1Transaction,
  SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
} from "@metaplex-foundation/mpl-bubblegum";
import { assert, expect } from "chai";
import {
  mplTokenMetadata,
  createNft,
} from "@metaplex-foundation/mpl-token-metadata";
import {
  fromWeb3JsKeypair,
  fromWeb3JsPublicKey,
  toWeb3JsPublicKey,
} from "@metaplex-foundation/umi-web3js-adapters";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";

require("dotenv").config();

describe("core-sol-bond-stake-sc", () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  const provider = anchor.getProvider();
  const connection = provider.connection;
  const program = anchor.workspace
    .CoreSolBondStakeSc as Program<CoreSolBondStakeSc>;

  const PRIVATE_KEY_STR = process.env.UNIT_TEST_PRIVATE_KEY;
  const privateKeys = PRIVATE_KEY_STR.split(",").map(Number);

  const [user, user2, itheum_token_mint, another_token_mint] = Array.from(
    { length: 5 },
    () => Keypair.generate()
  );

  let collection_mint: PublicKey;
  let user_nft_leaf_schemas: LeafSchema[] = [];
  let user2_nft_leaf_schemas: LeafSchema[] = [];
  let merkleTree: PublicKey;

  const itheum_token_user_ata = getAssociatedTokenAddressSync(
    itheum_token_mint.publicKey,
    user.publicKey
  );
  const another_token_user_ata = getAssociatedTokenAddressSync(
    another_token_mint.publicKey,
    user.publicKey
  );

  const itheum_token_user2_ata = getAssociatedTokenAddressSync(
    itheum_token_mint.publicKey,
    user2.publicKey
  );
  const another_token_user2_ata = getAssociatedTokenAddressSync(
    another_token_mint.publicKey,
    user2.publicKey
  );

  const admin = Keypair.fromSecretKey(Uint8Array.from(privateKeys));

  const itheum_token_admin_ata = getAssociatedTokenAddressSync(
    itheum_token_mint.publicKey,
    admin.publicKey
  );
  const another_token_admin_ata = getAssociatedTokenAddressSync(
    another_token_mint.publicKey,
    admin.publicKey
  );

  const bondConfigPda1 = PublicKey.findProgramAddressSync(
    [Buffer.from("bond_config"), Buffer.from([1])],
    program.programId
  )[0];

  const rewardsConfigPda = PublicKey.findProgramAddressSync(
    [Buffer.from("rewards_config")],
    program.programId
  )[0];

  const vaultConfigPda = PublicKey.findProgramAddressSync(
    [Buffer.from("vault_config")],
    program.programId
  )[0];

  const vault_ata = getAssociatedTokenAddressSync(
    itheum_token_mint.publicKey,
    vaultConfigPda,
    true
  );

  const another_vault_ata = getAssociatedTokenAddressSync(
    another_token_mint.publicKey,
    vaultConfigPda,
    true
  );

  let activation_slot: number = 0;

  const confirm = async (signature: string): Promise<string> => {
    const block = await connection.getLatestBlockhash();
    await connection.confirmTransaction({
      signature,
      ...block,
    });

    return signature;
  };

  const log = async (signature: string): Promise<string> => {
    console.log(
      `Transaction signature: https://explorer.solana.com/transaction/${signature}?cluster=custom&customUrl=${connection.rpcEndpoint}`
    );
    return signature;
  };

  before("Airdrop and create mints and collections", async () => {
    let lamports = await getMinimumBalanceForRentExemptMint(connection);

    let tx2 = new Transaction();
    tx2.instructions = [
      ...[admin].map((k) =>
        SystemProgram.transfer({
          fromPubkey: provider.publicKey,
          toPubkey: k.publicKey,
          lamports: 10 * LAMPORTS_PER_SOL,
        })
      ),
      ...[itheum_token_mint, another_token_mint].map((m) =>
        SystemProgram.createAccount({
          fromPubkey: provider.publicKey,
          newAccountPubkey: m.publicKey,
          lamports,
          space: MINT_SIZE,
          programId: TOKEN_PROGRAM_ID,
        })
      ),
      ...[
        [itheum_token_mint.publicKey, admin.publicKey, itheum_token_admin_ata],
        [
          another_token_mint.publicKey,
          admin.publicKey,
          another_token_admin_ata,
        ],
      ].flatMap((x) => [
        createInitializeMint2Instruction(x[0], 9, x[1], x[1]),
        createAssociatedTokenAccountIdempotentInstruction(
          provider.publicKey,
          x[2],
          x[1],
          x[0],
          TOKEN_PROGRAM_ID
        ),
        createMintToInstruction(x[0], x[2], x[1], 2_000_000e9),
      ]),
    ];
    await provider
      .sendAndConfirm(tx2, [admin, itheum_token_mint, another_token_mint])
      .then(log);

    let tx = new Transaction();
    tx.instructions = [
      ...[user, user2].map((k) =>
        SystemProgram.transfer({
          fromPubkey: provider.publicKey,
          toPubkey: k.publicKey,
          lamports: 10 * LAMPORTS_PER_SOL,
        })
      ),
      ...[
        [itheum_token_mint.publicKey, user.publicKey, itheum_token_user_ata],
        [another_token_mint.publicKey, user.publicKey, another_token_user_ata],
        [itheum_token_mint.publicKey, user2.publicKey, itheum_token_user2_ata],
        [
          another_token_mint.publicKey,
          user2.publicKey,
          another_token_user2_ata,
        ],
      ].flatMap((x) => [
        createAssociatedTokenAccountIdempotentInstruction(
          provider.publicKey,
          x[2],
          x[1],
          x[0],
          TOKEN_PROGRAM_ID
        ),
        createMintToInstruction(x[0], x[2], admin.publicKey, 1_000e9),
      ]),
    ];

    await provider.sendAndConfirm(tx, [admin]);

    let umiConnection = new Connection("http://localhost:8899", "confirmed");

    const umi = createUmi(umiConnection);
    umi.use(mplTokenMetadata());

    umi.use(keypairIdentity(fromWeb3JsKeypair(admin)));

    const collection = generateSigner(umi);

    collection_mint = toWeb3JsPublicKey(collection.publicKey);

    const resp = await createNft(umi, {
      mint: collection,
      name: "Itheum Vaults",
      uri: "https://ipfs.io/ipfs/QmTBeJHejL9awc5RA3u7TGWNv9RyGi2KgQUfzzdZstyz3n/",
      sellerFeeBasisPoints: percentAmount(5.1), // 5.1%
      isCollection: true,
    }).sendAndConfirm(umi);

    const umi2 = createUmi(umiConnection);

    umi2.use(keypairIdentity(fromWeb3JsKeypair(admin)));
    umi2.use(mplBubblegum());

    const merkleTreeKey = generateSigner(umi2);
    const builder = await createTree(umi2, {
      merkleTree: merkleTreeKey,
      maxDepth: 14,
      maxBufferSize: 64,
    });
    await builder.sendAndConfirm(umi2);

    merkleTree = toWeb3JsPublicKey(merkleTreeKey.publicKey);

    const metadata: MetadataArgsArgs = {
      name: "Vault NFMEID user1",
      uri: "https://indigo-complete-silverfish-271.mypinata.cloud/ipfs/QmcgwWW47d9FjHksKhZ5DWJYWvzPbVR1uhgH8kwBgNkJ9F/GetBitzNFTunesMainM.json",
      sellerFeeBasisPoints: 200,
      collection: { key: collection.publicKey, verified: false },
      creators: [
        {
          address: fromWeb3JsKeypair(user).publicKey,
          verified: false,
          share: 100,
        },
      ],
    };

    const metadata2: MetadataArgsArgs = {
      name: "Vault NFMEID user2",
      uri: "https://indigo-complete-silverfish-271.mypinata.cloud/ipfs/QmcgwWW47d9FjHksKhZ5DWJYWvzPbVR1uhgH8kwBgNkJ9F/GetBitzNFTunesMainM.json",
      sellerFeeBasisPoints: 200,
      collection: { key: collection.publicKey, verified: false },
      creators: [
        {
          address: fromWeb3JsKeypair(user2).publicKey,
          verified: false,
          share: 100,
        },
      ],
    };

    for (let i = 0; i < 5; i++) {
      const resp = await mintToCollectionV1(umi2, {
        leafOwner: fromWeb3JsKeypair(user).publicKey,
        merkleTree: fromWeb3JsPublicKey(merkleTree),
        collectionMint: collection.publicKey,
        metadata: metadata,
      }).sendAndConfirm(umi2);

      let nft_leaf_schema = await parseLeafFromMintToCollectionV1Transaction(
        umi2,
        resp.signature
      );

      user_nft_leaf_schemas.push(nft_leaf_schema);
    }

    for (let i = 0; i < 5; i++) {
      const resp4 = await mintToCollectionV1(umi2, {
        leafOwner: fromWeb3JsKeypair(user2).publicKey,
        merkleTree: fromWeb3JsPublicKey(merkleTree),
        collectionMint: collection.publicKey,
        metadata: metadata2,
      }).sendAndConfirm(umi2);

      let nft2_leaf_schema = await parseLeafFromMintToCollectionV1Transaction(
        umi2,
        resp4.signature
      );

      user2_nft_leaf_schemas.push(nft2_leaf_schema);
    }
  });

  it("Initialize contract - by user (should fail)", async () => {
    try {
      await program.methods
        .initializeContract(
          1,
          new anchor.BN(900),
          new anchor.BN(100e9),
          new anchor.BN(1e9),
          new anchor.BN(0),
          new anchor.BN(6000)
        )
        .signers([user])
        .accounts({
          bondConfig: bondConfigPda1,
          merkleTree: merkleTree,
          rewardsConfig: rewardsConfigPda,
          authority: user.publicKey,
        })
        .rpc();
      assert(false, "Should have thrown error");
    } catch (err) {
      expect((err as anchor.AnchorError).error.errorCode.number).to.equal(2012);
      expect((err as anchor.AnchorError).error.errorMessage).to.equal(
        "An address constraint was violated"
      );
    }
  });

  it("Initialize Contract by admin", async () => {
    const sig = await program.methods
      .initializeContract(
        1,
        new anchor.BN(900),
        new anchor.BN(100e9),
        new anchor.BN(1e9),
        new anchor.BN(0),
        new anchor.BN(6000)
      )
      .signers([admin])
      .accounts({
        bondConfig: bondConfigPda1,
        rewardsConfig: rewardsConfigPda,
        merkleTree: merkleTree,
        authority: admin.publicKey,
      })
      .rpc();

    await program.methods
      .initializeVault()
      .signers([admin])
      .accounts({
        vaultConfig: vaultConfigPda,
        vault: vault_ata,
        mintOfToken: itheum_token_mint.publicKey,
        authority: admin.publicKey,
      })
      .rpc();

    let bond_config = await program.account.bondConfig.fetch(bondConfigPda1);
    let vault_config = await program.account.vaultConfig.fetch(vaultConfigPda);
    let rewards_config = await program.account.rewardsConfig.fetch(
      rewardsConfigPda
    );

    assert(bond_config.bondAmount.eq(new anchor.BN(100e9)));
    assert(bond_config.bondState == 0);
    assert(bond_config.lockPeriod.eq(new anchor.BN(900)));
    assert(bond_config.merkleTree.equals(merkleTree));
    assert(bond_config.withdrawPenalty.eq(new anchor.BN(6000)));
    assert(bond_config.index == 1);

    assert(vault_config.mintOfToken.equals(itheum_token_mint.publicKey));

    assert(rewards_config.rewardsState == 0);

    assert(rewards_config.rewardsState == 0);
    assert(rewards_config.rewardsPerSlot.eq(new anchor.BN(1e9)));
    assert(rewards_config.rewardsPerShare.eq(new anchor.BN(0)));
    assert(rewards_config.lastRewardSlot.eq(new anchor.BN(0)));
    assert(rewards_config.maxApr.eq(new anchor.BN(0)));
  });

  it("Create bond Config by user (should fail)", async () => {
    const bondConfigPda2 = PublicKey.findProgramAddressSync(
      [Buffer.from("bond_config"), Buffer.from([2])],
      program.programId
    )[0];
    try {
      await program.methods
        .createBondConfig(
          2,
          new anchor.BN(900),
          new anchor.BN(100e9),
          new anchor.BN(6000)
        )
        .signers([user])
        .accounts({
          bondConfig: bondConfigPda2,
          authority: user.publicKey,
          merkleTree: merkleTree,
        })
        .rpc();
      assert(false, "Should have thrown error");
    } catch (err) {
      expect((err as anchor.AnchorError).error.errorCode.number).to.equal(2012);
      expect((err as anchor.AnchorError).error.errorMessage).to.equal(
        "An address constraint was violated"
      );
    }
  });

  it("Create bond Config by admin", async () => {
    const bondConfigPda2 = PublicKey.findProgramAddressSync(
      [Buffer.from("bond_config"), Buffer.from([2])],
      program.programId
    )[0];

    await program.methods
      .createBondConfig(
        2,
        new anchor.BN(900),
        new anchor.BN(100e9),
        new anchor.BN(6000)
      )
      .signers([admin])
      .accounts({
        bondConfig: bondConfigPda2,
        authority: admin.publicKey,
        merkleTree: merkleTree,
      })
      .rpc();

    let bond_config = await program.account.bondConfig.fetch(bondConfigPda2);

    assert(bond_config.bondAmount.eq(new anchor.BN(100e9)));
    assert(bond_config.bondState == 0);
    assert(bond_config.lockPeriod.eq(new anchor.BN(900)));
    assert(bond_config.merkleTree.equals(merkleTree));
    assert(bond_config.withdrawPenalty.eq(new anchor.BN(6000)));
    assert(bond_config.index == 2);
  });

  it("Set bond state by user (should fail)", async () => {
    try {
      await program.methods
        .setBondStateActive(1)
        .signers([user])
        .accounts({
          bondConfig: bondConfigPda1,
          authority: user.publicKey,
        })
        .rpc();
    } catch (err) {
      expect((err as anchor.AnchorError).error.errorCode.number).to.equal(2012);
      expect((err as anchor.AnchorError).error.errorMessage).to.equal(
        "An address constraint was violated"
      );
    }

    try {
      await program.methods
        .setBondStateInactive(1)
        .signers([user])
        .accounts({
          bondConfig: bondConfigPda1,
          authority: user.publicKey,
        })
        .rpc();
    } catch (err) {
      expect((err as anchor.AnchorError).error.errorCode.number).to.equal(2012);
      expect((err as anchor.AnchorError).error.errorMessage).to.equal(
        "An address constraint was violated"
      );
    }

    const bondConfigPda2 = PublicKey.findProgramAddressSync(
      [Buffer.from("bond_config"), Buffer.from([2])],
      program.programId
    )[0];

    try {
      await program.methods
        .setBondStateActive(2)
        .signers([user])
        .accounts({
          bondConfig: bondConfigPda2,
          authority: user.publicKey,
        })
        .rpc();
    } catch (err) {
      expect((err as anchor.AnchorError).error.errorCode.number).to.equal(2012);
      expect((err as anchor.AnchorError).error.errorMessage).to.equal(
        "An address constraint was violated"
      );
    }

    try {
      await program.methods
        .setBondStateInactive(2)
        .signers([user])
        .accounts({
          bondConfig: bondConfigPda2,
          authority: user.publicKey,
        })
        .rpc();
    } catch (err) {
      expect((err as anchor.AnchorError).error.errorCode.number).to.equal(2012);
      expect((err as anchor.AnchorError).error.errorMessage).to.equal(
        "An address constraint was violated"
      );
    }
  });

  it("Set bond state by admin", async () => {
    await program.methods
      .setBondStateActive(1)
      .signers([admin])
      .accounts({
        bondConfig: bondConfigPda1,
        authority: admin.publicKey,
      })
      .rpc();

    let bond_config = await program.account.bondConfig.fetch(bondConfigPda1);

    assert(bond_config.bondState == 1);

    const bondConfigPda2 = PublicKey.findProgramAddressSync(
      [Buffer.from("bond_config"), Buffer.from([2])],
      program.programId
    )[0];

    await program.methods
      .setBondStateActive(2)
      .signers([admin])
      .accounts({
        bondConfig: bondConfigPda2,
        authority: admin.publicKey,
      })
      .rpc();

    let bond_config2 = await program.account.bondConfig.fetch(bondConfigPda2);

    assert(bond_config2.bondState == 1);

    // set to inactive

    await program.methods
      .setBondStateInactive(1)
      .signers([admin])
      .accounts({
        bondConfig: bondConfigPda1,
        authority: admin.publicKey,
      })
      .rpc();

    let bond_config3 = await program.account.bondConfig.fetch(bondConfigPda1);

    assert(bond_config3.bondState == 0);

    await program.methods
      .setBondStateInactive(2)
      .signers([admin])
      .accounts({
        bondConfig: bondConfigPda2,
        authority: admin.publicKey,
      })
      .rpc();

    let bond_config4 = await program.account.bondConfig.fetch(bondConfigPda2);

    assert(bond_config4.bondState == 0);
  });

  it("Update mint of collection by user (should fail)", async () => {
    try {
      await program.methods
        .updateMerkleTree(1, merkleTree)
        .signers([user])
        .accounts({
          bondConfig: bondConfigPda1,
          authority: user.publicKey,
        })
        .rpc();
      assert(false, "Should have thrown error");
    } catch (err) {
      expect((err as anchor.AnchorError).error.errorCode.number).to.equal(2012);
      expect((err as anchor.AnchorError).error.errorMessage).to.equal(
        "An address constraint was violated"
      );
    }

    const bondConfigPda2 = PublicKey.findProgramAddressSync(
      [Buffer.from("bond_config"), Buffer.from([2])],
      program.programId
    )[0];

    try {
      await program.methods
        .updateMerkleTree(2, merkleTree)
        .signers([user])
        .accounts({
          bondConfig: bondConfigPda2,
          authority: user.publicKey,
        })
        .rpc();
      assert(false, "Should have thrown error");
    } catch (err) {
      expect((err as anchor.AnchorError).error.errorCode.number).to.equal(2012);
      expect((err as anchor.AnchorError).error.errorMessage).to.equal(
        "An address constraint was violated"
      );
    }
  });

  it("Update mint of collection by admin", async () => {
    await program.methods
      .updateMerkleTree(1, merkleTree)
      .signers([admin])
      .accounts({
        bondConfig: bondConfigPda1,
        authority: admin.publicKey,
      })
      .rpc();

    let bond_config = await program.account.bondConfig.fetch(bondConfigPda1);

    assert(bond_config.merkleTree.equals(merkleTree));

    const bondConfigPda2 = PublicKey.findProgramAddressSync(
      [Buffer.from("bond_config"), Buffer.from([2])],
      program.programId
    )[0];

    await program.methods
      .updateMerkleTree(2, merkleTree)
      .signers([admin])
      .accounts({
        bondConfig: bondConfigPda2,
        authority: admin.publicKey,
      })
      .rpc();

    let bond_config2 = await program.account.bondConfig.fetch(bondConfigPda2);

    assert(bond_config2.merkleTree.equals(merkleTree));
  });

  it("Update lock period by user (should fail)", async () => {
    try {
      await program.methods
        .updateLockPeriod(1, new anchor.BN(1000))
        .signers([user])
        .accounts({
          bondConfig: bondConfigPda1,
          authority: user.publicKey,
        })
        .rpc();
      assert(false, "Should have thrown error");
    } catch (err) {
      expect((err as anchor.AnchorError).error.errorCode.number).to.equal(2012);
      expect((err as anchor.AnchorError).error.errorMessage).to.equal(
        "An address constraint was violated"
      );
    }

    const bondConfigPda2 = PublicKey.findProgramAddressSync(
      [Buffer.from("bond_config"), Buffer.from([2])],
      program.programId
    )[0];

    try {
      await program.methods
        .updateLockPeriod(2, new anchor.BN(1000))
        .signers([user])
        .accounts({
          bondConfig: bondConfigPda2,
          authority: user.publicKey,
        })
        .rpc();
      assert(false, "Should have thrown error");
    } catch (err) {
      expect((err as anchor.AnchorError).error.errorCode.number).to.equal(2012);
      expect((err as anchor.AnchorError).error.errorMessage).to.equal(
        "An address constraint was violated"
      );
    }
  });

  it("Update lock period by admin", async () => {
    await program.methods
      .updateLockPeriod(1, new anchor.BN(1000))
      .signers([admin])
      .accounts({
        bondConfig: bondConfigPda1,
        authority: admin.publicKey,
      })
      .rpc();

    let bond_config = await program.account.bondConfig.fetch(bondConfigPda1);

    assert(bond_config.lockPeriod.eq(new anchor.BN(1000)));

    const bondConfigPda2 = PublicKey.findProgramAddressSync(
      [Buffer.from("bond_config"), Buffer.from([2])],
      program.programId
    )[0];

    await program.methods
      .updateLockPeriod(2, new anchor.BN(1000))
      .signers([admin])
      .accounts({
        bondConfig: bondConfigPda2,
        authority: admin.publicKey,
      })
      .rpc();

    let bond_config2 = await program.account.bondConfig.fetch(bondConfigPda2);

    assert(bond_config2.lockPeriod.eq(new anchor.BN(1000)));
  });

  it("Update bond amount by user (should fail)", async () => {
    try {
      await program.methods
        .updateBondAmount(1, new anchor.BN(200e9))
        .signers([user])
        .accounts({
          bondConfig: bondConfigPda1,
          authority: user.publicKey,
        })
        .rpc();
      assert(false, "Should have thrown error");
    } catch (err) {
      expect((err as anchor.AnchorError).error.errorCode.number).to.equal(2012);
      expect((err as anchor.AnchorError).error.errorMessage).to.equal(
        "An address constraint was violated"
      );
    }

    const bondConfigPda2 = PublicKey.findProgramAddressSync(
      [Buffer.from("bond_config"), Buffer.from([2])],
      program.programId
    )[0];

    try {
      await program.methods
        .updateBondAmount(2, new anchor.BN(200e9))
        .signers([user])
        .accounts({
          bondConfig: bondConfigPda2,
          authority: user.publicKey,
        })
        .rpc();
      assert(false, "Should have thrown error");
    } catch (err) {
      expect((err as anchor.AnchorError).error.errorCode.number).to.equal(2012);
      expect((err as anchor.AnchorError).error.errorMessage).to.equal(
        "An address constraint was violated"
      );
    }
  });

  it("Update bond amount by admin", async () => {
    await program.methods
      .updateBondAmount(1, new anchor.BN(200e9))
      .signers([admin])
      .accounts({
        bondConfig: bondConfigPda1,
        authority: admin.publicKey,
      })
      .rpc();

    let bond_config = await program.account.bondConfig.fetch(bondConfigPda1);

    assert(bond_config.bondAmount.eq(new anchor.BN(200e9)));

    const bondConfigPda2 = PublicKey.findProgramAddressSync(
      [Buffer.from("bond_config"), Buffer.from([2])],
      program.programId
    )[0];

    await program.methods
      .updateBondAmount(2, new anchor.BN(200e9))
      .signers([admin])
      .accounts({
        bondConfig: bondConfigPda2,
        authority: admin.publicKey,
      })
      .rpc();

    let bond_config2 = await program.account.bondConfig.fetch(bondConfigPda2);

    assert(bond_config2.bondAmount.eq(new anchor.BN(200e9)));

    await program.methods
      .updateBondAmount(1, new anchor.BN(100e9))
      .signers([admin])
      .accounts({
        bondConfig: bondConfigPda1,
        authority: admin.publicKey,
      })
      .rpc();
  });

  it("Update withdraw penalty by user (should fail)", async () => {
    try {
      await program.methods
        .updateWithdrawPenalty(1, new anchor.BN(5000))
        .signers([user])
        .accounts({
          bondConfig: bondConfigPda1,
          authority: user.publicKey,
        })
        .rpc();
      assert(false, "Should have thrown error");
    } catch (err) {
      expect((err as anchor.AnchorError).error.errorCode.number).to.equal(2012);
      expect((err as anchor.AnchorError).error.errorMessage).to.equal(
        "An address constraint was violated"
      );
    }

    const bondConfigPda2 = PublicKey.findProgramAddressSync(
      [Buffer.from("bond_config"), Buffer.from([2])],
      program.programId
    )[0];

    try {
      await program.methods
        .updateWithdrawPenalty(2, new anchor.BN(5000))
        .signers([user])
        .accounts({
          bondConfig: bondConfigPda2,
          authority: user.publicKey,
        })
        .rpc();
      assert(false, "Should have thrown error");
    } catch (err) {
      expect((err as anchor.AnchorError).error.errorCode.number).to.equal(2012);
      expect((err as anchor.AnchorError).error.errorMessage).to.equal(
        "An address constraint was violated"
      );
    }
  });

  it("Update withdraw penalty by admin", async () => {
    await program.methods
      .updateWithdrawPenalty(1, new anchor.BN(5000))
      .signers([admin])
      .accounts({
        bondConfig: bondConfigPda1,
        authority: admin.publicKey,
      })
      .rpc();

    let bond_config = await program.account.bondConfig.fetch(bondConfigPda1);

    assert(bond_config.withdrawPenalty.eq(new anchor.BN(5000)));

    const bondConfigPda2 = PublicKey.findProgramAddressSync(
      [Buffer.from("bond_config"), Buffer.from([2])],
      program.programId
    )[0];

    await program.methods
      .updateWithdrawPenalty(2, new anchor.BN(5000))
      .signers([admin])
      .accounts({
        bondConfig: bondConfigPda2,
        authority: admin.publicKey,
      })
      .rpc();

    let bond_config2 = await program.account.bondConfig.fetch(bondConfigPda2);

    assert(bond_config2.withdrawPenalty.eq(new anchor.BN(5000)));
  });

  // Rewards Config

  it("Set rewards state by user (should fail)", async () => {
    try {
      await program.methods
        .setRewardsStateActive()
        .signers([user])
        .accounts({
          rewardsConfig: rewardsConfigPda,
          authority: user.publicKey,
        })
        .rpc();
    } catch (err) {
      expect((err as anchor.AnchorError).error.errorCode.number).to.equal(2012);
      expect((err as anchor.AnchorError).error.errorMessage).to.equal(
        "An address constraint was violated"
      );
    }

    try {
      await program.methods
        .setRewardsStateInactive()
        .signers([user])
        .accounts({
          rewardsConfig: rewardsConfigPda,
          authority: user.publicKey,
        })
        .rpc();
    } catch (err) {
      expect((err as anchor.AnchorError).error.errorCode.number).to.equal(2012);
      expect((err as anchor.AnchorError).error.errorMessage).to.equal(
        "An address constraint was violated"
      );
    }
  });

  it("Set rewards state by admin", async () => {
    await program.methods
      .setRewardsStateActive()
      .signers([admin])
      .accounts({
        rewardsConfig: rewardsConfigPda,
        authority: admin.publicKey,
      })
      .rpc();

    let rewards_config = await program.account.rewardsConfig.fetch(
      rewardsConfigPda
    );

    assert(rewards_config.rewardsState == 1);

    await program.methods
      .setRewardsStateInactive()
      .signers([admin])
      .accounts({
        rewardsConfig: rewardsConfigPda,
        authority: admin.publicKey,
      })
      .rpc();

    let rewards_config2 = await program.account.rewardsConfig.fetch(
      rewardsConfigPda
    );

    assert(rewards_config2.rewardsState == 0);
  });

  it("Update rewards per slot by user (should fail)", async () => {
    try {
      await program.methods
        .updateRewardsPerSlot(new anchor.BN(2e9))
        .signers([user])
        .accounts({
          rewardsConfig: rewardsConfigPda,
          authority: user.publicKey,
        })
        .rpc();
      assert(false, "Should have thrown error");
    } catch (err) {
      expect((err as anchor.AnchorError).error.errorCode.number).to.equal(2012);
      expect((err as anchor.AnchorError).error.errorMessage).to.equal(
        "An address constraint was violated"
      );
    }
  });

  it("Update rewards per slot by admin", async () => {
    await program.methods
      .updateRewardsPerSlot(new anchor.BN(2e9))
      .signers([admin])
      .accounts({
        rewardsConfig: rewardsConfigPda,
        authority: admin.publicKey,
      })
      .rpc();

    let rewards_config = await program.account.rewardsConfig.fetch(
      rewardsConfigPda
    );

    assert(rewards_config.rewardsPerSlot.eq(new anchor.BN(2e9)));
  });

  it("Update max apr by user (should fail)", async () => {
    try {
      await program.methods
        .updateMaxApr(new anchor.BN(10))
        .signers([user])
        .accounts({
          rewardsConfig: rewardsConfigPda,
          authority: user.publicKey,
        })
        .rpc();
      assert(false, "Should have thrown error");
    } catch (err) {
      expect((err as anchor.AnchorError).error.errorCode.number).to.equal(2012);
      expect((err as anchor.AnchorError).error.errorMessage).to.equal(
        "An address constraint was violated"
      );
    }
  });

  it("Update max apr by admin", async () => {
    await program.methods
      .updateMaxApr(new anchor.BN(10))
      .signers([admin])
      .accounts({
        rewardsConfig: rewardsConfigPda,
        authority: admin.publicKey,
      })
      .rpc();

    let rewards_config = await program.account.rewardsConfig.fetch(
      rewardsConfigPda
    );

    assert(rewards_config.maxApr.eq(new anchor.BN(10)));
  });

  it("Add rewards by user (should fail)", async () => {
    try {
      await program.methods
        .addRewards(new anchor.BN(1000e9))
        .signers([user])
        .accounts({
          rewardsConfig: rewardsConfigPda,
          vaultConfig: vaultConfigPda,
          vault: vault_ata,
          mintOfToken: itheum_token_mint.publicKey,
          authority: user.publicKey,
          authorityTokenAccount: itheum_token_user_ata,
        })
        .rpc();
    } catch (err) {
      expect((err as anchor.AnchorError).error.errorCode.number).to.equal(2012);
      expect((err as anchor.AnchorError).error.errorMessage).to.equal(
        "An address constraint was violated"
      );
    }
  });

  it("Add rewards by admin", async () => {
    await program.methods
      .addRewards(new anchor.BN(1_000_000e9))
      .signers([admin])
      .accounts({
        rewardsConfig: rewardsConfigPda,
        vaultConfig: vaultConfigPda,
        vault: vault_ata,
        mintOfToken: itheum_token_mint.publicKey,
        authority: admin.publicKey,
        authorityTokenAccount: itheum_token_admin_ata,
      })
      .rpc();

    let rewards_config = await program.account.rewardsConfig.fetch(
      rewardsConfigPda
    );

    assert(rewards_config.rewardsReserve.eq(new anchor.BN(1_000_000e9)));
  });

  it("Remove rewards by user (should fail)", async () => {
    try {
      await program.methods
        .removeRewards(new anchor.BN(1000e9))
        .signers([user])
        .accounts({
          rewardsConfig: rewardsConfigPda,
          vaultConfig: vaultConfigPda,
          vault: vault_ata,
          mintOfToken: itheum_token_mint.publicKey,
          authority: user.publicKey,
          authorityTokenAccount: itheum_token_user_ata,
        })
        .rpc();
    } catch (err) {
      expect((err as anchor.AnchorError).error.errorCode.number).to.equal(2012);
      expect((err as anchor.AnchorError).error.errorMessage).to.equal(
        "An address constraint was violated"
      );
    }

    try {
      await program.methods
        .removeRewards(new anchor.BN(1000e9))
        .signers([user])
        .accounts({
          rewardsConfig: rewardsConfigPda,
          vaultConfig: vaultConfigPda,
          vault: vault_ata,
          mintOfToken: another_token_mint.publicKey,
          authority: user.publicKey,
          authorityTokenAccount: itheum_token_user_ata,
        })
        .rpc();
    } catch (err) {
      expect((err as anchor.AnchorError).error.errorCode.number).to.equal(6006);
      expect((err as anchor.AnchorError).error.errorMessage).to.equal(
        "Mint mismatch"
      );
    }
  });

  it("Remove rewards by admin", async () => {
    await program.methods
      .removeRewards(new anchor.BN(1000e9))
      .signers([admin])
      .accounts({
        rewardsConfig: rewardsConfigPda,
        vaultConfig: vaultConfigPda,
        vault: vault_ata,
        mintOfToken: itheum_token_mint.publicKey,
        authority: admin.publicKey,
        authorityTokenAccount: itheum_token_admin_ata,
      })
      .rpc();

    let rewards_config = await program.account.rewardsConfig.fetch(
      rewardsConfigPda
    );

    assert(rewards_config.rewardsReserve.eq(new anchor.BN(999_000e9)));

    await program.methods
      .addRewards(new anchor.BN(1_000e9))
      .signers([admin])
      .accounts({
        rewardsConfig: rewardsConfigPda,
        vaultConfig: vaultConfigPda,
        vault: vault_ata,
        mintOfToken: itheum_token_mint.publicKey,
        authority: admin.publicKey,
        authorityTokenAccount: itheum_token_admin_ata,
      })
      .rpc();

    let rewards_config2 = await program.account.rewardsConfig.fetch(
      rewardsConfigPda
    );

    assert(rewards_config2.rewardsReserve.eq(new anchor.BN(1_000_000e9)));
  });

  it("Remove rewards by admin (should fail - mint of token mismatch)", async () => {
    try {
      await program.methods
        .removeRewards(new anchor.BN(1000e9))
        .signers([admin])
        .accounts({
          rewardsConfig: rewardsConfigPda,
          vaultConfig: vaultConfigPda,
          vault: vault_ata,
          mintOfToken: another_token_mint.publicKey,
          authority: admin.publicKey,
          authorityTokenAccount: itheum_token_admin_ata,
        })
        .rpc();
    } catch (err) {
      expect((err as anchor.AnchorError).error.errorCode.number).to.equal(6006);
      expect((err as anchor.AnchorError).error.errorMessage).to.equal(
        "Mint mismatch"
      );
    }
  });

  it("Remove rewards by admin (should fail - authority's token account mismatch)", async () => {
    try {
      await program.methods
        .removeRewards(new anchor.BN(1000e9))
        .signers([admin])
        .accounts({
          rewardsConfig: rewardsConfigPda,
          vaultConfig: vaultConfigPda,
          vault: vault_ata,
          mintOfToken: itheum_token_mint.publicKey,
          authority: admin.publicKey,
          authorityTokenAccount: itheum_token_user_ata,
        })
        .rpc();
    } catch (err) {
      expect((err as anchor.AnchorError).error.errorCode.number).to.equal(6005);
      expect((err as anchor.AnchorError).error.errorMessage).to.equal(
        "Owner mismatch"
      );
    }
  });

  it("Remove rewards by admin (should fail - authority's token account mint mismatch)", async () => {
    try {
      await program.methods
        .removeRewards(new anchor.BN(1000e9))
        .signers([admin])
        .accounts({
          rewardsConfig: rewardsConfigPda,
          vaultConfig: vaultConfigPda,
          vault: vault_ata,
          mintOfToken: another_token_mint.publicKey,
          authority: admin.publicKey,
          authorityTokenAccount: another_token_admin_ata,
        })
        .rpc();
    } catch (err) {
      expect((err as anchor.AnchorError).error.errorCode.number).to.equal(6006);
      expect((err as anchor.AnchorError).error.errorMessage).to.equal(
        "Mint mismatch"
      );
    }
  });

  it("Remove rewards by admin (should fail - wrong vault ata", async () => {
    try {
      await program.methods
        .removeRewards(new anchor.BN(1000e9))
        .signers([admin])
        .accounts({
          rewardsConfig: rewardsConfigPda,
          vaultConfig: vaultConfigPda,
          vault: itheum_token_admin_ata,
          mintOfToken: itheum_token_mint.publicKey,
          authority: admin.publicKey,
          authorityTokenAccount: itheum_token_admin_ata,
        })
        .rpc();
    } catch (err) {
      expect((err as anchor.AnchorError).error.errorCode.number).to.equal(2001);
      expect((err as anchor.AnchorError).error.errorMessage).to.equal(
        "A has one constraint was violated"
      );
    }
  });

  it("Bond 1 by user - should fail (address not initialized)", async () => {
    const userBondsRewards = PublicKey.findProgramAddressSync(
      [Buffer.from("address_bonds_rewards"), user.publicKey.toBuffer()],
      program.programId
    )[0];

    const bond1 = PublicKey.findProgramAddressSync(
      [
        Buffer.from("bond"),
        user.publicKey.toBuffer(),
        new anchor.BN(1).toBuffer("le", 2),
      ],
      program.programId
    )[0];

    const assetUsage1 = PublicKey.findProgramAddressSync(
      [toWeb3JsPublicKey(user_nft_leaf_schemas[0].id).toBuffer()],
      program.programId
    )[0];

    try {
      await program.methods
        .bond(
          1,
          1,
          new anchor.BN(100e9),
          new anchor.BN(Number(user_nft_leaf_schemas[0].nonce)),
          Array.from(bs58.decode(user_nft_leaf_schemas[0].id)),
          Array.from(user_nft_leaf_schemas[0].dataHash),
          Array.from(user_nft_leaf_schemas[0].creatorHash)
        )
        .signers([user])
        .accounts({
          addressBondsRewards: userBondsRewards,
          assetUsage: assetUsage1,
          bond: bond1,
          bondConfig: bondConfigPda1,
          rewardsConfig: rewardsConfigPda,
          vaultConfig: vaultConfigPda,
          vault: vault_ata,
          mintOfTokenSent: itheum_token_mint.publicKey,
          authority: user.publicKey,
          merkleTree: merkleTree,
          authorityTokenAccount: itheum_token_user_ata,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
        })
        .remainingAccounts([
          {
            pubkey: new PublicKey(merkleTree),
            isSigner: false,
            isWritable: false,
          },
        ])
        .rpc();
      assert(false, "Should have thrown error");
    } catch (err) {
      expect((err as anchor.AnchorError).error.errorCode.number).to.equal(3012);
      expect((err as anchor.AnchorError).error.errorMessage).to.equal(
        "The program expected this account to be already initialized"
      );
    }
  });

  it("Unpause bond program", async () => {
    await program.methods
      .setBondStateActive(1)
      .signers([admin])
      .accounts({ bondConfig: bondConfigPda1, authority: admin.publicKey })
      .rpc();
  });

  it("Bond 1 by user - wrong bond amount (should fail)", async () => {
    const userBondsRewards = PublicKey.findProgramAddressSync(
      [Buffer.from("address_bonds_rewards"), user.publicKey.toBuffer()],
      program.programId
    )[0];

    const bond1 = PublicKey.findProgramAddressSync(
      [
        Buffer.from("bond"),
        user.publicKey.toBuffer(),
        new anchor.BN(1).toBuffer("le", 2),
      ],
      program.programId
    )[0];

    const assetUsage1 = PublicKey.findProgramAddressSync(
      [toWeb3JsPublicKey(user_nft_leaf_schemas[0].id).toBuffer()],
      program.programId
    )[0];

    await program.methods
      .initializeAddress()
      .signers([user])
      .accounts({
        addressBondsRewards: userBondsRewards,
        rewardsConfig: rewardsConfigPda,
        authority: user.publicKey,
      })
      .rpc();

    try {
      await program.methods
        .bond(
          1,
          1,
          new anchor.BN(10e9),
          new anchor.BN(Number(user_nft_leaf_schemas[0].nonce)),
          Array.from(bs58.decode(user_nft_leaf_schemas[0].id)),
          Array.from(user_nft_leaf_schemas[0].dataHash),
          Array.from(user_nft_leaf_schemas[0].creatorHash)
        )
        .signers([user])
        .accounts({
          addressBondsRewards: userBondsRewards,
          assetUsage: assetUsage1,
          bond: bond1,
          bondConfig: bondConfigPda1,
          rewardsConfig: rewardsConfigPda,
          vaultConfig: vaultConfigPda,
          vault: vault_ata,
          mintOfTokenSent: itheum_token_mint.publicKey,
          authority: user.publicKey,
          merkleTree: merkleTree,
          authorityTokenAccount: itheum_token_user_ata,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
        })
        .remainingAccounts([
          {
            pubkey: new PublicKey(merkleTree),
            isSigner: false,
            isWritable: false,
          },
        ])
        .rpc();
      assert(false, "Should have thrown error");
    } catch (err) {
      expect((err as anchor.AnchorError).error.errorCode.number).to.equal(6010);
      expect((err as anchor.AnchorError).error.errorMessage).to.equal(
        "Wrong amount"
      );
    }
  });

  it("Bond 1 by user - wrong bond id (should fail)", async () => {
    const userBondsRewards = PublicKey.findProgramAddressSync(
      [Buffer.from("address_bonds_rewards"), user.publicKey.toBuffer()],
      program.programId
    )[0];

    const bond1 = PublicKey.findProgramAddressSync(
      [
        Buffer.from("bond"),
        user.publicKey.toBuffer(),
        new anchor.BN(2).toBuffer("le", 2),
      ],
      program.programId
    )[0];

    const assetUsage1 = PublicKey.findProgramAddressSync(
      [toWeb3JsPublicKey(user_nft_leaf_schemas[0].id).toBuffer()],
      program.programId
    )[0];

    try {
      await program.methods
        .bond(
          1,
          2,
          new anchor.BN(100e9),
          new anchor.BN(Number(user_nft_leaf_schemas[0].nonce)),
          Array.from(bs58.decode(user_nft_leaf_schemas[0].id)),
          Array.from(user_nft_leaf_schemas[0].dataHash),
          Array.from(user_nft_leaf_schemas[0].creatorHash)
        )
        .signers([user])
        .accounts({
          addressBondsRewards: userBondsRewards,
          assetUsage: assetUsage1,
          bond: bond1,
          bondConfig: bondConfigPda1,
          rewardsConfig: rewardsConfigPda,
          vaultConfig: vaultConfigPda,
          vault: vault_ata,
          mintOfTokenSent: itheum_token_mint.publicKey,
          authority: user.publicKey,
          merkleTree: merkleTree,
          authorityTokenAccount: itheum_token_user_ata,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
        })
        .remainingAccounts([
          {
            pubkey: new PublicKey(merkleTree),
            isSigner: false,
            isWritable: false,
          },
        ])
        .rpc();
      assert(false, "Should have thrown error");
    } catch (err) {
      expect((err as anchor.AnchorError).error.errorCode.number).to.equal(6011);
      expect((err as anchor.AnchorError).error.errorMessage).to.equal(
        "Wrong bond id"
      );
    }
  });

  it("Bond 1 by user", async () => {
    const userBondsRewards = PublicKey.findProgramAddressSync(
      [Buffer.from("address_bonds_rewards"), user.publicKey.toBuffer()],
      program.programId
    )[0];

    const bond1 = PublicKey.findProgramAddressSync(
      [
        Buffer.from("bond"),
        user.publicKey.toBuffer(),
        new anchor.BN(1).toBuffer("le", 2),
      ],
      program.programId
    )[0];

    const assetUsage1 = PublicKey.findProgramAddressSync(
      [toWeb3JsPublicKey(user_nft_leaf_schemas[0].id).toBuffer()],
      program.programId
    )[0];

    let x = await program.methods
      .bond(
        1,
        1,
        new anchor.BN(100e9),
        new anchor.BN(Number(user_nft_leaf_schemas[0].nonce)),
        Array.from(bs58.decode(user_nft_leaf_schemas[0].id)),
        Array.from(user_nft_leaf_schemas[0].dataHash),
        Array.from(user_nft_leaf_schemas[0].creatorHash)
      )
      .signers([user])
      .accounts({
        addressBondsRewards: userBondsRewards,
        assetUsage: assetUsage1,
        bond: bond1,
        bondConfig: bondConfigPda1,
        rewardsConfig: rewardsConfigPda,
        vaultConfig: vaultConfigPda,
        vault: vault_ata,
        mintOfTokenSent: itheum_token_mint.publicKey,
        authority: user.publicKey,
        merkleTree: merkleTree,
        authorityTokenAccount: itheum_token_user_ata,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
      })
      .remainingAccounts([
        {
          pubkey: new PublicKey(merkleTree),
          isSigner: false,
          isWritable: false,
        },
      ])
      .rpc();

    let addressBondsRewards = await program.account.addressBondsRewards.fetch(
      userBondsRewards
    );

    expect(addressBondsRewards.currentIndex).to.equal(1);
    expect(addressBondsRewards.claimableAmount.toNumber()).to.equal(0);
    expect(addressBondsRewards.vaultBondId).to.equal(0);
    expect(
      addressBondsRewards.addressTotalBondAmount.toNumber() / LAMPORTS_PER_SOL
    ).to.eq(100);

    let bondAcc = await program.account.bond.fetch(bond1);
    let bondConfigAcc = await program.account.bondConfig.fetch(bondConfigPda1);

    await new Promise((r) => setTimeout(r, 2000));

    const transactionDetails = await program.provider.connection.getTransaction(
      x,
      { commitment: "confirmed" }
    );
    const blockTime = await program.provider.connection.getBlockTime(
      transactionDetails.slot
    );

    expect(bondAcc.bondAmount.toNumber()).to.equal(100e9);
    expect(bondAcc.state).to.equal(1);
    expect(bondAcc.owner.toBase58()).to.equal(user.publicKey.toBase58());
    expect(bondAcc.bondTimestamp.toNumber()).to.equal(blockTime);
    expect(bondAcc.unbondTimestamp.toNumber()).to.equal(
      blockTime + bondConfigAcc.lockPeriod.toNumber()
    );
  });

  it("Bond 2 by user", async () => {
    const userBondsRewards = PublicKey.findProgramAddressSync(
      [Buffer.from("address_bonds_rewards"), user.publicKey.toBuffer()],
      program.programId
    )[0];

    const bond2 = PublicKey.findProgramAddressSync(
      [
        Buffer.from("bond"),
        user.publicKey.toBuffer(),
        new anchor.BN(2).toBuffer("le", 2),
      ],
      program.programId
    )[0];

    const assetUsage2 = PublicKey.findProgramAddressSync(
      [toWeb3JsPublicKey(user_nft_leaf_schemas[1].id).toBuffer()],
      program.programId
    )[0];

    let x = await program.methods
      .bond(
        1,
        2,
        new anchor.BN(100e9),
        new anchor.BN(Number(user_nft_leaf_schemas[1].nonce)),
        Array.from(bs58.decode(user_nft_leaf_schemas[1].id)),
        Array.from(user_nft_leaf_schemas[1].dataHash),
        Array.from(user_nft_leaf_schemas[1].creatorHash)
      )
      .signers([user])
      .accounts({
        addressBondsRewards: userBondsRewards,
        assetUsage: assetUsage2,
        bond: bond2,
        bondConfig: bondConfigPda1,
        rewardsConfig: rewardsConfigPda,
        vaultConfig: vaultConfigPda,
        vault: vault_ata,
        mintOfTokenSent: itheum_token_mint.publicKey,
        authority: user.publicKey,
        merkleTree: merkleTree,
        authorityTokenAccount: itheum_token_user_ata,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
      })
      .remainingAccounts([
        {
          pubkey: new PublicKey(merkleTree),
          isSigner: false,
          isWritable: false,
        },
      ])
      .rpc();

    let addressBondsRewards = await program.account.addressBondsRewards.fetch(
      userBondsRewards
    );

    expect(addressBondsRewards.currentIndex).to.equal(2);
    expect(addressBondsRewards.claimableAmount.toNumber()).to.equal(0);
    expect(addressBondsRewards.vaultBondId).to.equal(0);
    expect(
      addressBondsRewards.addressTotalBondAmount.toNumber() / LAMPORTS_PER_SOL
    ).to.eq(200);

    let bondAcc = await program.account.bond.fetch(bond2);
    let bondConfigAcc = await program.account.bondConfig.fetch(bondConfigPda1);

    await new Promise((r) => setTimeout(r, 2000));

    const transactionDetails = await program.provider.connection.getTransaction(
      x,
      { commitment: "confirmed" }
    );
    const blockTime = await program.provider.connection.getBlockTime(
      transactionDetails.slot
    );

    expect(bondAcc.bondAmount.toNumber()).to.equal(100e9);
    expect(bondAcc.state).to.equal(1);
    expect(bondAcc.owner.toBase58()).to.equal(user.publicKey.toBase58());
    expect(bondAcc.bondTimestamp.toNumber()).to.equal(blockTime);
    expect(bondAcc.unbondTimestamp.toNumber()).to.equal(
      blockTime + bondConfigAcc.lockPeriod.toNumber()
    );
  });

  it("Bond 1 by user2", async () => {
    const userBondsRewards = PublicKey.findProgramAddressSync(
      [Buffer.from("address_bonds_rewards"), user2.publicKey.toBuffer()],
      program.programId
    )[0];

    const bond1 = PublicKey.findProgramAddressSync(
      [
        Buffer.from("bond"),
        user2.publicKey.toBuffer(),
        new anchor.BN(1).toBuffer("le", 2),
      ],
      program.programId
    )[0];

    const assetUsage1 = PublicKey.findProgramAddressSync(
      [toWeb3JsPublicKey(user2_nft_leaf_schemas[0].id).toBuffer()],
      program.programId
    )[0];

    await program.methods
      .initializeAddress()
      .signers([user2])
      .accounts({
        addressBondsRewards: userBondsRewards,
        rewardsConfig: rewardsConfigPda,
        authority: user2.publicKey,
      })
      .rpc();

    let x = await program.methods
      .bond(
        1,
        1,
        new anchor.BN(100e9),
        new anchor.BN(Number(user2_nft_leaf_schemas[0].nonce)),
        Array.from(bs58.decode(user2_nft_leaf_schemas[0].id)),
        Array.from(user2_nft_leaf_schemas[0].dataHash),
        Array.from(user2_nft_leaf_schemas[0].creatorHash)
      )
      .signers([user2])
      .accounts({
        addressBondsRewards: userBondsRewards,
        assetUsage: assetUsage1,
        bond: bond1,
        bondConfig: bondConfigPda1,
        rewardsConfig: rewardsConfigPda,
        vaultConfig: vaultConfigPda,
        vault: vault_ata,
        mintOfTokenSent: itheum_token_mint.publicKey,
        authority: user2.publicKey,
        merkleTree: merkleTree,
        authorityTokenAccount: itheum_token_user2_ata,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
      })
      .remainingAccounts([
        {
          pubkey: new PublicKey(merkleTree),
          isSigner: false,
          isWritable: false,
        },
      ])
      .rpc();

    let addressBondsRewards = await program.account.addressBondsRewards.fetch(
      userBondsRewards
    );

    expect(addressBondsRewards.currentIndex).to.equal(1);
    expect(addressBondsRewards.claimableAmount.toNumber()).to.equal(0);
    expect(addressBondsRewards.vaultBondId).to.equal(0);
    expect(
      addressBondsRewards.addressTotalBondAmount.toNumber() / LAMPORTS_PER_SOL
    ).to.eq(100);

    let bondAcc = await program.account.bond.fetch(bond1);
    let bondConfigAcc = await program.account.bondConfig.fetch(bondConfigPda1);

    await new Promise((r) => setTimeout(r, 2000));

    const transactionDetails = await program.provider.connection.getTransaction(
      x,
      { commitment: "confirmed" }
    );
    const blockTime = await program.provider.connection.getBlockTime(
      transactionDetails.slot
    );

    expect(bondAcc.assetId.toBase58()).to.equal(user2_nft_leaf_schemas[0].id);
    expect(bondAcc.bondAmount.toNumber()).to.equal(100e9);
    expect(bondAcc.state).to.equal(1);
    expect(bondAcc.owner.toBase58()).to.equal(user2.publicKey.toBase58());
    expect(bondAcc.bondTimestamp.toNumber()).to.equal(blockTime);
    expect(bondAcc.unbondTimestamp.toNumber()).to.equal(
      blockTime + bondConfigAcc.lockPeriod.toNumber()
    );
  });

  it("Renew bond 1 by user - wrong bond (should fail)", async () => {
    const userBondsRewards = PublicKey.findProgramAddressSync(
      [Buffer.from("address_bonds_rewards"), user.publicKey.toBuffer()],
      program.programId
    )[0];

    const bond1 = PublicKey.findProgramAddressSync(
      [
        Buffer.from("bond"),
        user2.publicKey.toBuffer(),
        new anchor.BN(1).toBuffer("le", 2),
      ],
      program.programId
    )[0];

    try {
      let x = await program.methods
        .renew(1, 1)
        .signers([user])
        .accounts({
          bondConfig: bondConfigPda1,
          rewardsConfig: rewardsConfigPda,
          vaultConfig: vaultConfigPda,
          addressBondsRewards: userBondsRewards,
          bond: bond1,
          authority: user.publicKey,
        })
        .rpc();
      assert(false, "Should have thrown error");
    } catch (err) {
      expect((err as anchor.AnchorError).error.errorCode.number).to.equal(2006);
      expect((err as anchor.AnchorError).error.errorMessage).to.equal(
        "A seeds constraint was violated"
      );
    }
  });

  it("Renew bond 1 by user", async () => {
    const userBondsRewards = PublicKey.findProgramAddressSync(
      [Buffer.from("address_bonds_rewards"), user.publicKey.toBuffer()],
      program.programId
    )[0];

    const bond1 = PublicKey.findProgramAddressSync(
      [
        Buffer.from("bond"),
        user.publicKey.toBuffer(),
        new anchor.BN(1).toBuffer("le", 2),
      ],
      program.programId
    )[0];

    let x = await program.methods
      .renew(1, 1)
      .signers([user])
      .accounts({
        bondConfig: bondConfigPda1,
        rewardsConfig: rewardsConfigPda,
        vaultConfig: vaultConfigPda,
        addressBondsRewards: userBondsRewards,
        bond: bond1,
        authority: user.publicKey,
      })
      .rpc();

    let bondAcc = await program.account.bond.fetch(bond1);
    let bondConfigAcc = await program.account.bondConfig.fetch(bondConfigPda1);

    await new Promise((r) => setTimeout(r, 2000));

    const transactionDetails = await program.provider.connection.getTransaction(
      x,
      { commitment: "confirmed" }
    );
    const blockTime = await program.provider.connection.getBlockTime(
      transactionDetails.slot
    );

    expect(bondAcc.state).to.equal(1);
    expect(bondAcc.bondTimestamp.toNumber()).to.equal(blockTime);
    expect(bondAcc.unbondTimestamp.toNumber()).to.equal(
      blockTime + bondConfigAcc.lockPeriod.toNumber()
    );
    expect(bondAcc.bondAmount.toNumber() / LAMPORTS_PER_SOL).to.equal(100);
  });

  it("TopUp bond 2 by user - bond not vault (should fail)", async () => {
    const userBondsRewards = PublicKey.findProgramAddressSync(
      [Buffer.from("address_bonds_rewards"), user.publicKey.toBuffer()],
      program.programId
    )[0];

    const bond2 = PublicKey.findProgramAddressSync(
      [
        Buffer.from("bond"),
        user.publicKey.toBuffer(),
        new anchor.BN(2).toBuffer("le", 2),
      ],
      program.programId
    )[0];

    try {
      let x = await program.methods
        .topUp(1, 2, new anchor.BN(100e9))
        .signers([user])
        .accounts({
          addressBondsRewards: userBondsRewards,
          bondConfig: bondConfigPda1,
          rewardsConfig: rewardsConfigPda,
          mintOfTokenSent: itheum_token_mint.publicKey,
          bond: bond2,
          vaultConfig: vaultConfigPda,
          vault: vault_ata,
          authority: user.publicKey,
          authorityTokenAccount: itheum_token_user_ata,
        })
        .rpc();
      assert(false, "Should have thrown error");
    } catch (err) {
      expect((err as anchor.AnchorError).error.errorCode.number).to.equal(6019);
      expect((err as anchor.AnchorError).error.errorMessage).to.equal(
        "Vault bond id mismatch"
      );
    }
  });
  it("TopUp bond 1 by user - wrong mint of token (should fail)", async () => {
    const userBondsRewards = PublicKey.findProgramAddressSync(
      [Buffer.from("address_bonds_rewards"), user.publicKey.toBuffer()],
      program.programId
    )[0];

    const bond1 = PublicKey.findProgramAddressSync(
      [
        Buffer.from("bond"),
        user.publicKey.toBuffer(),
        new anchor.BN(1).toBuffer("le", 2),
      ],
      program.programId
    )[0];

    try {
      let x = await program.methods
        .topUp(1, 1, new anchor.BN(100e9))
        .signers([user])
        .accounts({
          addressBondsRewards: userBondsRewards,
          bondConfig: bondConfigPda1,
          rewardsConfig: rewardsConfigPda,
          mintOfTokenSent: another_token_mint.publicKey,
          bond: bond1,
          vaultConfig: vaultConfigPda,
          vault: vault_ata,
          authority: user.publicKey,
          authorityTokenAccount: itheum_token_user_ata,
        })
        .rpc();
      assert(false, "Should have thrown error");
    } catch (err) {
      expect((err as anchor.AnchorError).error.errorCode.number).to.equal(6006);
      expect((err as anchor.AnchorError).error.errorMessage).to.equal(
        "Mint mismatch"
      );
    }
  });

  it("TopUp bond 1 by user - wrong user accounts (should fail)", async () => {
    const userBondsRewards = PublicKey.findProgramAddressSync(
      [Buffer.from("address_bonds_rewards"), user2.publicKey.toBuffer()],
      program.programId
    )[0];

    const bond1 = PublicKey.findProgramAddressSync(
      [
        Buffer.from("bond"),
        user2.publicKey.toBuffer(),
        new anchor.BN(1).toBuffer("le", 2),
      ],
      program.programId
    )[0];

    try {
      let x = await program.methods
        .topUp(1, 1, new anchor.BN(100e9))
        .signers([user])
        .accounts({
          addressBondsRewards: userBondsRewards,
          bondConfig: bondConfigPda1,
          rewardsConfig: rewardsConfigPda,
          mintOfTokenSent: itheum_token_mint.publicKey,
          bond: bond1,
          vaultConfig: vaultConfigPda,
          vault: vault_ata,
          authority: user.publicKey,
          authorityTokenAccount: itheum_token_user_ata,
        })
        .rpc();
      assert(false, "Should have thrown error");
    } catch (err) {
      expect((err as anchor.AnchorError).error.errorCode.number).to.equal(2006);
      expect((err as anchor.AnchorError).error.errorMessage).to.equal(
        "A seeds constraint was violated"
      );
    }
  });

  it("TopUp bond 1 by user - vault not set (should fail)", async () => {
    const userBondsRewards = PublicKey.findProgramAddressSync(
      [Buffer.from("address_bonds_rewards"), user.publicKey.toBuffer()],
      program.programId
    )[0];

    const bond1 = PublicKey.findProgramAddressSync(
      [
        Buffer.from("bond"),
        user.publicKey.toBuffer(),
        new anchor.BN(1).toBuffer("le", 2),
      ],
      program.programId
    )[0];

    try {
      let x = await program.methods
        .topUp(1, 1, new anchor.BN(100e9))
        .signers([user])
        .accounts({
          addressBondsRewards: userBondsRewards,
          bondConfig: bondConfigPda1,
          rewardsConfig: rewardsConfigPda,
          mintOfTokenSent: itheum_token_mint.publicKey,
          bond: bond1,
          vaultConfig: vaultConfigPda,
          vault: vault_ata,
          authority: user.publicKey,
          authorityTokenAccount: itheum_token_user_ata,
        })
        .rpc();
      assert(false, "Should have thrown error");
    } catch (err) {
      expect((err as anchor.AnchorError).error.errorCode.number).to.equal(6019);
      expect((err as anchor.AnchorError).error.errorMessage).to.equal(
        "Vault bond id mismatch"
      );
    }
  });

  it("Set bond id 1 as vault by user", async () => {
    const userBondsRewards = PublicKey.findProgramAddressSync(
      [Buffer.from("address_bonds_rewards"), user.publicKey.toBuffer()],
      program.programId
    )[0];

    const bond1 = PublicKey.findProgramAddressSync(
      [
        Buffer.from("bond"),
        user.publicKey.toBuffer(),
        new anchor.BN(1).toBuffer("le", 2),
      ],
      program.programId
    )[0];

    await program.methods
      .updateVaultBond(
        1,
        1,
        new anchor.BN(Number(user_nft_leaf_schemas[0].nonce))
      )
      .signers([user])
      .accounts({
        addressBondsRewards: userBondsRewards,
        bond: bond1,
        bondConfig: bondConfigPda1,
        authority: user.publicKey,
      })
      .rpc();

    const userAcc = await program.account.addressBondsRewards.fetch(
      userBondsRewards
    );

    expect(userAcc.vaultBondId).to.equal(1);
  });

  it("Topup vault by user", async () => {
    const userBondsRewards = PublicKey.findProgramAddressSync(
      [Buffer.from("address_bonds_rewards"), user.publicKey.toBuffer()],
      program.programId
    )[0];

    const bond1 = PublicKey.findProgramAddressSync(
      [
        Buffer.from("bond"),
        user.publicKey.toBuffer(),
        new anchor.BN(1).toBuffer("le", 2),
      ],
      program.programId
    )[0];

    let x = await program.methods
      .topUp(1, 1, new anchor.BN(100e9))
      .signers([user])
      .accounts({
        addressBondsRewards: userBondsRewards,
        bondConfig: bondConfigPda1,
        rewardsConfig: rewardsConfigPda,
        mintOfTokenSent: itheum_token_mint.publicKey,
        bond: bond1,
        vaultConfig: vaultConfigPda,
        vault: vault_ata,
        authority: user.publicKey,
        authorityTokenAccount: itheum_token_user_ata,
      })
      .rpc();

    let bondAcc = await program.account.bond.fetch(bond1);

    expect(bondAcc.bondAmount.toNumber() / LAMPORTS_PER_SOL).to.equal(200);

    let userAcc = await program.account.addressBondsRewards.fetch(
      userBondsRewards
    );

    expect(
      userAcc.addressTotalBondAmount.toNumber() / LAMPORTS_PER_SOL
    ).to.equal(300);
  });

  it("Change vault to bond 2 by user", async () => {
    const userBondsRewards = PublicKey.findProgramAddressSync(
      [Buffer.from("address_bonds_rewards"), user.publicKey.toBuffer()],
      program.programId
    )[0];

    const bond2 = PublicKey.findProgramAddressSync(
      [
        Buffer.from("bond"),
        user.publicKey.toBuffer(),
        new anchor.BN(2).toBuffer("le", 2),
      ],
      program.programId
    )[0];

    await program.methods
      .updateVaultBond(
        1,
        2,
        new anchor.BN(Number(user_nft_leaf_schemas[1].nonce))
      )
      .signers([user])
      .accounts({
        addressBondsRewards: userBondsRewards,
        bond: bond2,
        bondConfig: bondConfigPda1,
        authority: user.publicKey,
      })
      .rpc();

    const userAcc = await program.account.addressBondsRewards.fetch(
      userBondsRewards
    );

    expect(userAcc.vaultBondId).to.equal(2);
  });

  it("TopUp bond 1 by user - vault set to other bond (should fail)", async () => {
    const userBondsRewards = PublicKey.findProgramAddressSync(
      [Buffer.from("address_bonds_rewards"), user.publicKey.toBuffer()],
      program.programId
    )[0];

    const bond1 = PublicKey.findProgramAddressSync(
      [
        Buffer.from("bond"),
        user.publicKey.toBuffer(),
        new anchor.BN(1).toBuffer("le", 2),
      ],
      program.programId
    )[0];

    try {
      let x = await program.methods
        .topUp(1, 1, new anchor.BN(100e9))
        .signers([user])
        .accounts({
          addressBondsRewards: userBondsRewards,
          bondConfig: bondConfigPda1,
          rewardsConfig: rewardsConfigPda,
          mintOfTokenSent: itheum_token_mint.publicKey,
          bond: bond1,
          vaultConfig: vaultConfigPda,
          vault: vault_ata,
          authority: user.publicKey,
          authorityTokenAccount: itheum_token_user_ata,
        })
        .rpc();
      assert(false, "Should have thrown error");
    } catch (err) {
      expect((err as anchor.AnchorError).error.errorCode.number).to.equal(6019);
      expect((err as anchor.AnchorError).error.errorMessage).to.equal(
        "Vault bond id mismatch"
      );
    }
  });

  it("Withdraw bond 1 by user", async () => {
    const userBondsRewards = PublicKey.findProgramAddressSync(
      [Buffer.from("address_bonds_rewards"), user.publicKey.toBuffer()],
      program.programId
    )[0];

    const bond1 = PublicKey.findProgramAddressSync(
      [
        Buffer.from("bond"),
        user.publicKey.toBuffer(),
        new anchor.BN(1).toBuffer("le", 2),
      ],
      program.programId
    )[0];

    let balanceBefore = (
      await program.provider.connection.getTokenAccountBalance(
        itheum_token_user_ata
      )
    ).value.amount;

    let x = await program.methods
      .withdraw(1, 1)
      .signers([user])
      .accounts({
        addressBondsRewards: userBondsRewards,
        bondConfig: bondConfigPda1,
        rewardsConfig: rewardsConfigPda,
        mintOfTokenToReceive: itheum_token_mint.publicKey,
        bond: bond1,
        vaultConfig: vaultConfigPda,
        vault: vault_ata,
        authority: user.publicKey,
        authorityTokenAccount: itheum_token_user_ata,
      })
      .rpc();

    let userAcc = await program.account.addressBondsRewards.fetch(
      userBondsRewards
    );

    let vaultAcc = await program.account.vaultConfig.fetch(vaultConfigPda);

    let balanceAfter = (
      await program.provider.connection.getTokenAccountBalance(
        itheum_token_user_ata
      )
    ).value.amount;

    expect(
      vaultAcc.totalPenalizedAmount.toNumber() / LAMPORTS_PER_SOL
    ).to.equal(100); // bond 1 - 200 tokens ; penalty 50% => 100 tokens
    expect(vaultAcc.totalBondAmount.toNumber() / LAMPORTS_PER_SOL).to.equal(
      200
    );

    expect(
      userAcc.addressTotalBondAmount.toNumber() / LAMPORTS_PER_SOL
    ).to.equal(100); // remaining

    expect(Number(balanceAfter) / LAMPORTS_PER_SOL).to.equal(
      Number(balanceBefore) / LAMPORTS_PER_SOL + 100
    );
  });

  it("Withdraw bond 1 by user - already withdrawn (should fail)", async () => {
    const userBondsRewards = PublicKey.findProgramAddressSync(
      [Buffer.from("address_bonds_rewards"), user.publicKey.toBuffer()],
      program.programId
    )[0];

    const bond1 = PublicKey.findProgramAddressSync(
      [
        Buffer.from("bond"),
        user.publicKey.toBuffer(),
        new anchor.BN(1).toBuffer("le", 2),
      ],
      program.programId
    )[0];

    try {
      await program.methods
        .withdraw(1, 1)
        .signers([user])
        .accounts({
          addressBondsRewards: userBondsRewards,
          bondConfig: bondConfigPda1,
          rewardsConfig: rewardsConfigPda,
          mintOfTokenToReceive: itheum_token_mint.publicKey,
          bond: bond1,
          vaultConfig: vaultConfigPda,
          vault: vault_ata,
          authority: user.publicKey,
          authorityTokenAccount: itheum_token_user_ata,
        })
        .rpc();
      assert(false, "Should have thrown error");
    } catch (err) {
      expect((err as anchor.AnchorError).error.errorCode.number).to.equal(6014);
      expect((err as anchor.AnchorError).error.errorMessage).to.equal(
        "Bond is inactive"
      );
    }
  });

  it("Top up bond 1 by user - bond inactive (should fail)", async () => {
    const userBondsRewards = PublicKey.findProgramAddressSync(
      [Buffer.from("address_bonds_rewards"), user.publicKey.toBuffer()],
      program.programId
    )[0];

    const bond1 = PublicKey.findProgramAddressSync(
      [
        Buffer.from("bond"),
        user.publicKey.toBuffer(),
        new anchor.BN(1).toBuffer("le", 2),
      ],
      program.programId
    )[0];

    try {
      await program.methods
        .topUp(1, 1, new anchor.BN(100e9))
        .signers([user])
        .accounts({
          addressBondsRewards: userBondsRewards,
          bondConfig: bondConfigPda1,
          rewardsConfig: rewardsConfigPda,
          mintOfTokenSent: itheum_token_mint.publicKey,
          bond: bond1,
          vaultConfig: vaultConfigPda,
          vault: vault_ata,
          authority: user.publicKey,
          authorityTokenAccount: itheum_token_user_ata,
        })
        .rpc();
      assert(false, "Should have thrown error");
    } catch (err) {
      expect((err as anchor.AnchorError).error.errorCode.number).to.equal(6014);
      expect((err as anchor.AnchorError).error.errorMessage).to.equal(
        "Bond is inactive"
      );
    }
  });
  it("Renew bond 1 by user - bond inactive (should fail)", async () => {
    const userBondsRewards = PublicKey.findProgramAddressSync(
      [Buffer.from("address_bonds_rewards"), user.publicKey.toBuffer()],
      program.programId
    )[0];

    const bond1 = PublicKey.findProgramAddressSync(
      [
        Buffer.from("bond"),
        user.publicKey.toBuffer(),
        new anchor.BN(1).toBuffer("le", 2),
      ],
      program.programId
    )[0];

    try {
      await program.methods
        .renew(1, 1)
        .signers([user])
        .accounts({
          bondConfig: bondConfigPda1,
          rewardsConfig: rewardsConfigPda,
          vaultConfig: vaultConfigPda,
          addressBondsRewards: userBondsRewards,
          bond: bond1,
          authority: user.publicKey,
        })
        .rpc();
      assert(false, "Should have thrown error");
    } catch (err) {
      expect((err as anchor.AnchorError).error.errorCode.number).to.equal(6014);
      expect((err as anchor.AnchorError).error.errorMessage).to.equal(
        "Bond is inactive"
      );
    }
  });

  it("Update rewards per slot by admin", async () => {
    await program.methods
      .updateRewardsPerSlot(new anchor.BN(1e6))
      .signers([admin])
      .accounts({
        rewardsConfig: rewardsConfigPda,
        authority: admin.publicKey,
      })
      .rpc();
  });

  it("Activate rewards by admin", async () => {
    await program.methods
      .updateMaxApr(new anchor.BN(0))
      .signers([admin])
      .accounts({ rewardsConfig: rewardsConfigPda, authority: admin.publicKey })
      .rpc();

    let x = await program.methods
      .setRewardsStateActive()
      .signers([admin])
      .accounts({ rewardsConfig: rewardsConfigPda, authority: admin.publicKey })
      .rpc();

    let newConn = new Connection("http://localhost:8899", "confirmed");

    let sigStatus = await newConn.getSignatureStatus(x);

    activation_slot = sigStatus.context.slot;
  });

  it("Check user rewards - (renew bond 2 by user)", async () => {
    const userBondsRewards = PublicKey.findProgramAddressSync(
      [Buffer.from("address_bonds_rewards"), user.publicKey.toBuffer()],
      program.programId
    )[0];

    const bond2 = PublicKey.findProgramAddressSync(
      [
        Buffer.from("bond"),
        user.publicKey.toBuffer(),
        new anchor.BN(2).toBuffer("le", 2),
      ],
      program.programId
    )[0];

    let userAccBefore = await program.account.addressBondsRewards.fetch(
      userBondsRewards
    );

    let x = await program.methods
      .renew(1, 2)
      .signers([user])
      .accounts({
        bondConfig: bondConfigPda1,
        rewardsConfig: rewardsConfigPda,
        vaultConfig: vaultConfigPda,
        addressBondsRewards: userBondsRewards,
        bond: bond2,
        authority: user.publicKey,
      })
      .rpc();

    let userAccAfter = await program.account.addressBondsRewards.fetch(
      userBondsRewards
    );

    expect(userAccAfter.claimableAmount.toNumber()).to.equal(
      userAccBefore.claimableAmount.toNumber() + 5e5
    );
    expect(userAccAfter.addressRewardsPerShare.toNumber()).to.equal(
      userAccBefore.addressRewardsPerShare.toNumber() + 5e3
    );
  });

  it("Check user2 rewards - (renew bond 1 by user2)", async () => {
    const userBondsRewards = PublicKey.findProgramAddressSync(
      [Buffer.from("address_bonds_rewards"), user2.publicKey.toBuffer()],
      program.programId
    )[0];

    const bond1 = PublicKey.findProgramAddressSync(
      [
        Buffer.from("bond"),
        user2.publicKey.toBuffer(),
        new anchor.BN(1).toBuffer("le", 2),
      ],
      program.programId
    )[0];

    let userAccBefore = await program.account.addressBondsRewards.fetch(
      userBondsRewards
    );

    let x = await program.methods
      .renew(1, 1)
      .signers([user2])
      .accounts({
        bondConfig: bondConfigPda1,
        rewardsConfig: rewardsConfigPda,
        vaultConfig: vaultConfigPda,
        addressBondsRewards: userBondsRewards,
        bond: bond1,
        authority: user2.publicKey,
      })
      .rpc();

    let userAccAfter = await program.account.addressBondsRewards.fetch(
      userBondsRewards
    );

    expect(userAccAfter.claimableAmount.toNumber()).to.equal(
      userAccBefore.claimableAmount.toNumber() + 10e5
    );

    expect(userAccAfter.addressRewardsPerShare.toNumber()).to.equal(
      userAccBefore.addressRewardsPerShare.toNumber() + 10e3
    );
  });

  it("Check user rewards - bond 3 by user", async () => {
    const userBondsRewards = PublicKey.findProgramAddressSync(
      [Buffer.from("address_bonds_rewards"), user.publicKey.toBuffer()],
      program.programId
    )[0];

    const assetUsage3 = PublicKey.findProgramAddressSync(
      [toWeb3JsPublicKey(user_nft_leaf_schemas[2].id).toBuffer()],
      program.programId
    )[0];

    const bond3 = PublicKey.findProgramAddressSync(
      [
        Buffer.from("bond"),
        user.publicKey.toBuffer(),
        new anchor.BN(3).toBuffer("le", 2),
      ],
      program.programId
    )[0];

    let userAccBefore = await program.account.addressBondsRewards.fetch(
      userBondsRewards
    );

    let x = await program.methods
      .bond(
        1,
        3,
        new anchor.BN(100e9),
        new anchor.BN(Number(user_nft_leaf_schemas[2].nonce)),
        Array.from(bs58.decode(user_nft_leaf_schemas[2].id)),
        Array.from(user_nft_leaf_schemas[2].dataHash),
        Array.from(user_nft_leaf_schemas[2].creatorHash)
      )
      .signers([user])
      .accounts({
        addressBondsRewards: userBondsRewards,
        assetUsage: assetUsage3,
        bond: bond3,
        bondConfig: bondConfigPda1,
        rewardsConfig: rewardsConfigPda,
        vaultConfig: vaultConfigPda,
        vault: vault_ata,
        mintOfTokenSent: itheum_token_mint.publicKey,
        authority: user.publicKey,
        merkleTree: merkleTree,
        authorityTokenAccount: itheum_token_user_ata,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
      })
      .remainingAccounts([
        {
          pubkey: new PublicKey(merkleTree),
          isSigner: false,
          isWritable: false,
        },
      ])
      .rpc();

    let userAccAfter = await program.account.addressBondsRewards.fetch(
      userBondsRewards
    );

    expect(userAccAfter.claimableAmount.toNumber()).to.equal(
      userAccBefore.claimableAmount.toNumber() + 10e5
    );

    expect(userAccAfter.addressRewardsPerShare.toNumber()).to.equal(
      userAccBefore.addressRewardsPerShare.toNumber() + 10e3
    );
  });

  it("Stake rewards user2 - no vault set (should fail)", async () => {
    const addressBondsRewards = PublicKey.findProgramAddressSync(
      [Buffer.from("address_bonds_rewards"), user2.publicKey.toBuffer()],
      program.programId
    )[0];

    const bond = PublicKey.findProgramAddressSync(
      [
        Buffer.from("bond"),
        user2.publicKey.toBuffer(),
        new anchor.BN(1).toBuffer("le", 2),
      ],
      program.programId
    )[0];

    try {
      let x = await program.methods
        .stakeRewards(1, 1)
        .signers([user2])
        .accounts({
          addressBondsRewards: addressBondsRewards,
          bondConfig: bondConfigPda1,
          rewardsConfig: rewardsConfigPda,
          vaultConfig: vaultConfigPda,
          bond: bond,
          authority: user2.publicKey,
        })
        .rpc();
    } catch (e) {
      expect((e as anchor.AnchorError).error.errorCode.number).to.equal(6019);
      expect((e as anchor.AnchorError).error.errorMessage).to.equal(
        "Vault bond id mismatch"
      );
    }
  });

  it("Set vault bond id 1 by user2", async () => {
    const addressBondsRewards = PublicKey.findProgramAddressSync(
      [Buffer.from("address_bonds_rewards"), user2.publicKey.toBuffer()],
      program.programId
    )[0];

    const bond = PublicKey.findProgramAddressSync(
      [
        Buffer.from("bond"),
        user2.publicKey.toBuffer(),
        new anchor.BN(1).toBuffer("le", 2),
      ],
      program.programId
    )[0];

    await program.methods
      .updateVaultBond(
        1,
        1,
        new anchor.BN(Number(user2_nft_leaf_schemas[0].nonce))
      )
      .signers([user2])
      .accounts({
        addressBondsRewards: addressBondsRewards,
        bond: bond,
        bondConfig: bondConfigPda1,
        authority: user2.publicKey,
      })
      .rpc();
  });

  it("Stake rewards user2 into vault bond", async () => {
    const addressBondsRewards = PublicKey.findProgramAddressSync(
      [Buffer.from("address_bonds_rewards"), user2.publicKey.toBuffer()],
      program.programId
    )[0];

    const bond = PublicKey.findProgramAddressSync(
      [
        Buffer.from("bond"),
        user2.publicKey.toBuffer(),
        new anchor.BN(1).toBuffer("le", 2),
      ],
      program.programId
    )[0];

    let bondAccBefore = await program.account.bond.fetch(bond);

    let x = await program.methods
      .stakeRewards(1, 1)
      .signers([user2])
      .accounts({
        addressBondsRewards: addressBondsRewards,
        bondConfig: bondConfigPda1,
        rewardsConfig: rewardsConfigPda,
        vaultConfig: vaultConfigPda,
        bond: bond,
        authority: user2.publicKey,
      })
      .rpc();

    let rewardsConfigAcc = await program.account.rewardsConfig.fetch(
      rewardsConfigPda
    );
    let bondAccAfter = await program.account.bond.fetch(bond);
    let userAcc = await program.account.addressBondsRewards.fetch(
      addressBondsRewards
    );

    expect(bondAccAfter.bondAmount.toNumber()).to.equal(
      bondAccBefore.bondAmount.toNumber() + 2166600
    );

    expect(userAcc.claimableAmount.toNumber()).to.equal(0);
    expect(userAcc.addressRewardsPerShare.toNumber()).to.equal(
      rewardsConfigAcc.rewardsPerShare.toNumber()
    );
  });

  it("Claim rewards user", async () => {
    const addressBondsRewards = PublicKey.findProgramAddressSync(
      [Buffer.from("address_bonds_rewards"), user.publicKey.toBuffer()],
      program.programId
    )[0];

    const bond = PublicKey.findProgramAddressSync(
      [
        Buffer.from("bond"),
        user.publicKey.toBuffer(),
        new anchor.BN(2).toBuffer("le", 2),
      ],
      program.programId
    )[0];

    let userBalanceBefore = (
      await program.provider.connection.getTokenAccountBalance(
        itheum_token_user_ata
      )
    ).value.amount;

    let x = await program.methods
      .claimRewards(1, 2)
      .signers([user])
      .accounts({
        addressBondsRewards: addressBondsRewards,
        bondConfig: bondConfigPda1,
        rewardsConfig: rewardsConfigPda,
        vaultConfig: vaultConfigPda,
        bond: bond,
        vault: vault_ata,
        mintOfTokenToReceive: itheum_token_mint.publicKey,
        authority: user.publicKey,
        authorityTokenAccount: itheum_token_user_ata,
      })
      .rpc();

    let userAccAfter = await program.account.addressBondsRewards.fetch(
      addressBondsRewards
    );

    let userBalanceAfter = (
      await program.provider.connection.getTokenAccountBalance(
        itheum_token_user_ata
      )
    ).value.amount;

    let rewardsConfigAcc = await program.account.rewardsConfig.fetch(
      rewardsConfigPda
    );

    expect(userAccAfter.addressRewardsPerShare.toNumber()).to.equal(
      rewardsConfigAcc.rewardsPerShare.toNumber()
    );
    expect(userAccAfter.claimableAmount.toNumber()).to.equal(0);
    expect(userAccAfter.claimableAmount.toNumber()).to.equal(0);
    expect(Number(userBalanceAfter)).to.equal(
      Number(userBalanceBefore) + 3499800
    );
  });

  it("Withdraw bond 2 by user", async () => {
    const userBondsRewards = PublicKey.findProgramAddressSync(
      [Buffer.from("address_bonds_rewards"), user.publicKey.toBuffer()],
      program.programId
    )[0];

    const bond2 = PublicKey.findProgramAddressSync(
      [
        Buffer.from("bond"),
        user.publicKey.toBuffer(),
        new anchor.BN(2).toBuffer("le", 2),
      ],
      program.programId
    )[0];

    let userBalanceBefore = (
      await program.provider.connection.getTokenAccountBalance(
        itheum_token_user_ata
      )
    ).value.amount;

    let x = await program.methods
      .withdraw(1, 2)
      .signers([user])
      .accounts({
        addressBondsRewards: userBondsRewards,
        bondConfig: bondConfigPda1,
        rewardsConfig: rewardsConfigPda,
        mintOfTokenToReceive: itheum_token_mint.publicKey,
        bond: bond2,
        vaultConfig: vaultConfigPda,
        vault: vault_ata,
        authority: user.publicKey,
        authorityTokenAccount: itheum_token_user_ata,
      })
      .rpc();

    let userBalanceAfter = (
      await program.provider.connection.getTokenAccountBalance(
        itheum_token_user_ata
      )
    ).value.amount;

    let bondAcc = await program.account.bond.fetch(bond2);

    expect(bondAcc.state).to.equal(0);
    expect(bondAcc.bondAmount.toNumber()).to.equal(0);
    expect(Number(userBalanceAfter)).to.equal(Number(750003499800));
  });

  it("Withdraw bond 3 by user", async () => {
    const userBondsRewards = PublicKey.findProgramAddressSync(
      [Buffer.from("address_bonds_rewards"), user.publicKey.toBuffer()],
      program.programId
    )[0];

    const bond3 = PublicKey.findProgramAddressSync(
      [
        Buffer.from("bond"),
        user.publicKey.toBuffer(),
        new anchor.BN(3).toBuffer("le", 2),
      ],
      program.programId
    )[0];

    let userBalanceBefore = (
      await program.provider.connection.getTokenAccountBalance(
        itheum_token_user_ata
      )
    ).value.amount;

    let x = await program.methods
      .withdraw(1, 3)
      .signers([user])
      .accounts({
        addressBondsRewards: userBondsRewards,
        bondConfig: bondConfigPda1,
        rewardsConfig: rewardsConfigPda,
        mintOfTokenToReceive: itheum_token_mint.publicKey,
        bond: bond3,
        vaultConfig: vaultConfigPda,
        vault: vault_ata,
        authority: user.publicKey,
        authorityTokenAccount: itheum_token_user_ata,
      })
      .rpc();

    let userBalanceAfter = (
      await program.provider.connection.getTokenAccountBalance(
        itheum_token_user_ata
      )
    ).value.amount;

    let bondAcc = await program.account.bond.fetch(bond3);

    expect(bondAcc.state).to.equal(0);
    expect(bondAcc.bondAmount.toNumber()).to.equal(0);
    expect(Number(userBalanceAfter)).to.equal(Number(800003499800));
  });
});
