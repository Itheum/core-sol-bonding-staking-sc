import * as anchor from '@coral-xyz/anchor'
import {Program} from '@coral-xyz/anchor'
import {CoreSolBondStakeSc} from '../target/types/core_sol_bond_stake_sc'
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
} from '@solana/web3.js'
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createInitializeMint2Instruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  getMinimumBalanceForRentExemptMint,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token'
import {
  generateSigner,
  keypairIdentity,
  percentAmount,
} from '@metaplex-foundation/umi'
import {
  createTree,
  MetadataArgsArgs,
  mintToCollectionV1,
  mplBubblegum,
} from '@metaplex-foundation/mpl-bubblegum'
import {assert, expect} from 'chai'
import {
  mplTokenMetadata,
  createNft,
} from '@metaplex-foundation/mpl-token-metadata'
import {
  fromWeb3JsKeypair,
  toWeb3JsPublicKey,
} from '@metaplex-foundation/umi-web3js-adapters'
import {createUmi} from '@metaplex-foundation/umi-bundle-defaults'

require('dotenv').config()

describe('core-sol-bond-stake-sc', () => {
  anchor.setProvider(anchor.AnchorProvider.env())

  const provider = anchor.getProvider()

  const connection = provider.connection

  const program = anchor.workspace
    .CoreSolBondStakeSc as Program<CoreSolBondStakeSc>

  const PRIVATE_KEY_STR = process.env.UNIT_TEST_PRIVATE_KEY
  const privateKeys = PRIVATE_KEY_STR.split(',').map(Number)

  const [user, user2, itheum_token_mint, another_token_mint] = Array.from(
    {length: 5},
    () => Keypair.generate()
  )

  let collection_mint: PublicKey
  let user_nft_mint: PublicKey
  let user2_nft_mint: PublicKey

  const itheum_token_user_ata = getAssociatedTokenAddressSync(
    itheum_token_mint.publicKey,
    user.publicKey
  )
  const another_token_user_ata = getAssociatedTokenAddressSync(
    another_token_mint.publicKey,
    user.publicKey
  )

  const itheum_token_user2_ata = getAssociatedTokenAddressSync(
    itheum_token_mint.publicKey,
    user2.publicKey
  )
  const another_token_user2_ata = getAssociatedTokenAddressSync(
    another_token_mint.publicKey,
    user2.publicKey
  )

  const admin = Keypair.fromSecretKey(Uint8Array.from(privateKeys))

  const itheum_token_admin_ata = getAssociatedTokenAddressSync(
    itheum_token_mint.publicKey,
    admin.publicKey
  )
  const another_token_admin_ata = getAssociatedTokenAddressSync(
    another_token_mint.publicKey,
    admin.publicKey
  )

  const bondConfigPda1 = PublicKey.findProgramAddressSync(
    [Buffer.from('bond_config'), Buffer.from([1])],
    program.programId
  )[0]

  const rewardsConfigPda = PublicKey.findProgramAddressSync(
    [Buffer.from('rewards_config')],
    program.programId
  )[0]

  const vaultConfigPda = PublicKey.findProgramAddressSync(
    [Buffer.from('vault_config')],
    program.programId
  )[0]

  const vault_ata = getAssociatedTokenAddressSync(
    itheum_token_mint.publicKey,
    vaultConfigPda,
    true
  )

  const another_vault_ata = getAssociatedTokenAddressSync(
    another_token_mint.publicKey,
    vaultConfigPda,
    true
  )

  const confirm = async (signature: string): Promise<string> => {
    const block = await connection.getLatestBlockhash()
    await connection.confirmTransaction({
      signature,
      ...block,
    })

    return signature
  }

  const log = async (signature: string): Promise<string> => {
    console.log(
      `Transaction signature: https://explorer.solana.com/transaction/${signature}?cluster=custom&customUrl=${connection.rpcEndpoint}`
    )
    return signature
  }

  before('Airdrop and create mints and collections', async () => {
    let lamports = await getMinimumBalanceForRentExemptMint(connection)

    let tx2 = new Transaction()
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
    ]
    await provider
      .sendAndConfirm(tx2, [admin, itheum_token_mint, another_token_mint])
      .then(log)

    let tx = new Transaction()
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
    ]

    await provider.sendAndConfirm(tx, [admin])

    const umi = createUmi(connection)
    umi.use(mplTokenMetadata())

    umi.use(keypairIdentity(fromWeb3JsKeypair(admin)))

    const collection = generateSigner(umi)

    collection_mint = toWeb3JsPublicKey(collection.publicKey)

    const resp = await createNft(umi, {
      mint: collection,
      name: 'Itheum Vaults',
      uri: 'https://ipfs.io/ipfs/QmTBeJHejL9awc5RA3u7TGWNv9RyGi2KgQUfzzdZstyz3n/',
      sellerFeeBasisPoints: percentAmount(5.1), // 5.1%
      isCollection: true,
    }).sendAndConfirm(umi)

    const umi2 = createUmi(connection)

    umi2.use(keypairIdentity(fromWeb3JsKeypair(admin)))
    umi2.use(mplBubblegum())

    const merkleTree = generateSigner(umi2)
    const builder = await createTree(umi2, {
      merkleTree,
      maxDepth: 14,
      maxBufferSize: 64,
    })
    await builder.sendAndConfirm(umi2)

    const metadata: MetadataArgsArgs = {
      name: 'Vault NFMEID user1',
      uri: 'https://indigo-complete-silverfish-271.mypinata.cloud/ipfs/QmcgwWW47d9FjHksKhZ5DWJYWvzPbVR1uhgH8kwBgNkJ9F/GetBitzNFTunesMainM.json',
      sellerFeeBasisPoints: 200,
      collection: {key: collection.publicKey, verified: false},
      creators: [
        {
          address: fromWeb3JsKeypair(user).publicKey,
          verified: false,
          share: 100,
        },
      ],
    }

    const metadata2: MetadataArgsArgs = {
      name: 'Vault NFMEID user2',
      uri: 'https://indigo-complete-silverfish-271.mypinata.cloud/ipfs/QmcgwWW47d9FjHksKhZ5DWJYWvzPbVR1uhgH8kwBgNkJ9F/GetBitzNFTunesMainM.json',
      sellerFeeBasisPoints: 200,
      collection: {key: collection.publicKey, verified: false},
      creators: [
        {
          address: fromWeb3JsKeypair(user2).publicKey,
          verified: false,
          share: 100,
        },
      ],
    }

    const nft_mint1 = generateSigner(umi2)

    user_nft_mint = toWeb3JsPublicKey(nft_mint1.publicKey)

    const resp3 = await mintToCollectionV1(umi2, {
      leafOwner: fromWeb3JsKeypair(user).publicKey,
      merkleTree: merkleTree.publicKey,
      collectionMint: collection.publicKey,
      metadata: metadata,
    }).sendAndConfirm(umi2)

    const nft_mint_2 = generateSigner(umi2)
    const resp4 = await mintToCollectionV1(umi2, {
      leafOwner: fromWeb3JsKeypair(user2).publicKey,
      merkleTree: merkleTree.publicKey,
      collectionMint: collection.publicKey,
      metadata: metadata2,
    }).sendAndConfirm(umi2)

    user2_nft_mint = toWeb3JsPublicKey(nft_mint_2.publicKey)
  })

  it('Initialize contract - by user (should fail)', async () => {
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
        .accountsPartial({
          bondConfig: bondConfigPda1,
          vaultConfig: vaultConfigPda,
          vault: vault_ata,
          mintOfToken: itheum_token_mint.publicKey,
          mintOfCollection: collection_mint,
          rewardsConfig: rewardsConfigPda,
          authority: user.publicKey,
        })
        .rpc()
      assert(false, 'Should have thrown error')
    } catch (err) {
      expect((err as anchor.AnchorError).error.errorCode.number).to.equal(2012)
      expect((err as anchor.AnchorError).error.errorMessage).to.equal(
        'An address constraint was violated'
      )
    }
  })

  it('Initialize Contract by admin', async () => {
    await program.methods
      .initializeContract(
        1,
        new anchor.BN(900),
        new anchor.BN(100e9),
        new anchor.BN(1e9),
        new anchor.BN(0),
        new anchor.BN(6000)
      )
      .signers([admin])
      .accountsPartial({
        bondConfig: bondConfigPda1,
        vaultConfig: vaultConfigPda,
        vault: vault_ata,
        mintOfToken: itheum_token_mint.publicKey,
        mintOfCollection: collection_mint,
        rewardsConfig: rewardsConfigPda,
        authority: admin.publicKey,
      })
      .rpc()

    let bond_config = await program.account.bondConfig.fetch(bondConfigPda1)
    let vault_config = await program.account.vaultConfig.fetch(vaultConfigPda)
    let rewards_config = await program.account.rewardsConfig.fetch(
      rewardsConfigPda
    )

    assert(bond_config.bondAmount.eq(new anchor.BN(100e9)))
    assert(bond_config.bondState == 0)
    assert(bond_config.lockPeriod.eq(new anchor.BN(900)))
    assert(bond_config.mintOfCollection.equals(collection_mint))
    assert(bond_config.withdrawPenalty.eq(new anchor.BN(6000)))
    assert(bond_config.index == 1)

    assert(vault_config.mintOfToken.equals(itheum_token_mint.publicKey))

    assert(rewards_config.rewardsState == 0)

    assert(rewards_config.rewardsState == 0)
    assert(rewards_config.rewardsPerSlot.eq(new anchor.BN(1e9)))
    assert(rewards_config.rewardsPerShare.eq(new anchor.BN(0)))
    assert(rewards_config.lastRewardSlot.eq(new anchor.BN(0)))
    assert(rewards_config.maxApr.eq(new anchor.BN(0)))
  })

  it('Create bond Config by user (should fail)', async () => {
    const bondConfigPda2 = PublicKey.findProgramAddressSync(
      [Buffer.from('bond_config'), Buffer.from([2])],
      program.programId
    )[0]
    try {
      await program.methods
        .createBondConfig(
          2,
          new anchor.BN(900),
          new anchor.BN(100e9),
          new anchor.BN(6000)
        )
        .signers([user])
        .accountsPartial({
          bondConfig: bondConfigPda2,
          authority: user.publicKey,
          mintOfCollection: collection_mint,
        })
        .rpc()
      assert(false, 'Should have thrown error')
    } catch (err) {
      expect((err as anchor.AnchorError).error.errorCode.number).to.equal(2012)
      expect((err as anchor.AnchorError).error.errorMessage).to.equal(
        'An address constraint was violated'
      )
    }
  })

  it('Create bond Config by admin', async () => {
    const bondConfigPda2 = PublicKey.findProgramAddressSync(
      [Buffer.from('bond_config'), Buffer.from([2])],
      program.programId
    )[0]

    await program.methods
      .createBondConfig(
        2,
        new anchor.BN(900),
        new anchor.BN(100e9),
        new anchor.BN(6000)
      )
      .signers([admin])
      .accountsPartial({
        bondConfig: bondConfigPda2,
        authority: admin.publicKey,
        mintOfCollection: collection_mint,
      })
      .rpc()

    let bond_config = await program.account.bondConfig.fetch(bondConfigPda2)

    assert(bond_config.bondAmount.eq(new anchor.BN(100e9)))
    assert(bond_config.bondState == 0)
    assert(bond_config.lockPeriod.eq(new anchor.BN(900)))
    assert(bond_config.mintOfCollection.equals(collection_mint))
    assert(bond_config.withdrawPenalty.eq(new anchor.BN(6000)))
    assert(bond_config.index == 2)
  })

  it('Set bond state by user (should fail)', async () => {
    try {
      await program.methods
        .setBondStateActive(1)
        .signers([user])
        .accountsPartial({
          bondConfig: bondConfigPda1,
          authority: user.publicKey,
        })
        .rpc()
    } catch (err) {
      expect((err as anchor.AnchorError).error.errorCode.number).to.equal(2012)
      expect((err as anchor.AnchorError).error.errorMessage).to.equal(
        'An address constraint was violated'
      )
    }

    try {
      await program.methods
        .setBondStateInactive(1)
        .signers([user])
        .accountsPartial({
          bondConfig: bondConfigPda1,
          authority: user.publicKey,
        })
        .rpc()
    } catch (err) {
      expect((err as anchor.AnchorError).error.errorCode.number).to.equal(2012)
      expect((err as anchor.AnchorError).error.errorMessage).to.equal(
        'An address constraint was violated'
      )
    }

    const bondConfigPda2 = PublicKey.findProgramAddressSync(
      [Buffer.from('bond_config'), Buffer.from([2])],
      program.programId
    )[0]

    try {
      await program.methods
        .setBondStateActive(2)
        .signers([user])
        .accountsPartial({
          bondConfig: bondConfigPda2,
          authority: user.publicKey,
        })
        .rpc()
    } catch (err) {
      expect((err as anchor.AnchorError).error.errorCode.number).to.equal(2012)
      expect((err as anchor.AnchorError).error.errorMessage).to.equal(
        'An address constraint was violated'
      )
    }

    try {
      await program.methods
        .setBondStateInactive(2)
        .signers([user])
        .accountsPartial({
          bondConfig: bondConfigPda2,
          authority: user.publicKey,
        })
        .rpc()
    } catch (err) {
      expect((err as anchor.AnchorError).error.errorCode.number).to.equal(2012)
      expect((err as anchor.AnchorError).error.errorMessage).to.equal(
        'An address constraint was violated'
      )
    }
  })

  it('Set bond state by admin', async () => {
    await program.methods
      .setBondStateActive(1)
      .signers([admin])
      .accountsPartial({
        bondConfig: bondConfigPda1,
        authority: admin.publicKey,
      })
      .rpc()

    let bond_config = await program.account.bondConfig.fetch(bondConfigPda1)

    assert(bond_config.bondState == 1)

    const bondConfigPda2 = PublicKey.findProgramAddressSync(
      [Buffer.from('bond_config'), Buffer.from([2])],
      program.programId
    )[0]

    await program.methods
      .setBondStateActive(2)
      .signers([admin])
      .accountsPartial({
        bondConfig: bondConfigPda2,
        authority: admin.publicKey,
      })
      .rpc()

    let bond_config2 = await program.account.bondConfig.fetch(bondConfigPda2)

    assert(bond_config2.bondState == 1)

    // set to inactive

    await program.methods
      .setBondStateInactive(1)
      .signers([admin])
      .accountsPartial({
        bondConfig: bondConfigPda1,
        authority: admin.publicKey,
      })
      .rpc()

    let bond_config3 = await program.account.bondConfig.fetch(bondConfigPda1)

    assert(bond_config3.bondState == 0)

    await program.methods
      .setBondStateInactive(2)
      .signers([admin])
      .accountsPartial({
        bondConfig: bondConfigPda2,
        authority: admin.publicKey,
      })
      .rpc()

    let bond_config4 = await program.account.bondConfig.fetch(bondConfigPda2)

    assert(bond_config4.bondState == 0)
  })

  it('Update mint of collection by user (should fail)', async () => {
    try {
      await program.methods
        .updateMintOfCollection(1, collection_mint)
        .signers([user])
        .accountsPartial({
          bondConfig: bondConfigPda1,
          authority: user.publicKey,
        })
        .rpc()
      assert(false, 'Should have thrown error')
    } catch (err) {
      expect((err as anchor.AnchorError).error.errorCode.number).to.equal(2012)
      expect((err as anchor.AnchorError).error.errorMessage).to.equal(
        'An address constraint was violated'
      )
    }

    const bondConfigPda2 = PublicKey.findProgramAddressSync(
      [Buffer.from('bond_config'), Buffer.from([2])],
      program.programId
    )[0]

    try {
      await program.methods
        .updateMintOfCollection(2, collection_mint)
        .signers([user])
        .accountsPartial({
          bondConfig: bondConfigPda2,
          authority: user.publicKey,
        })
        .rpc()
      assert(false, 'Should have thrown error')
    } catch (err) {
      expect((err as anchor.AnchorError).error.errorCode.number).to.equal(2012)
      expect((err as anchor.AnchorError).error.errorMessage).to.equal(
        'An address constraint was violated'
      )
    }
  })

  it('Update mint of collection by admin', async () => {
    await program.methods
      .updateMintOfCollection(1, collection_mint)
      .signers([admin])
      .accountsPartial({
        bondConfig: bondConfigPda1,
        authority: admin.publicKey,
      })
      .rpc()

    let bond_config = await program.account.bondConfig.fetch(bondConfigPda1)

    assert(bond_config.mintOfCollection.equals(collection_mint))

    const bondConfigPda2 = PublicKey.findProgramAddressSync(
      [Buffer.from('bond_config'), Buffer.from([2])],
      program.programId
    )[0]

    await program.methods
      .updateMintOfCollection(2, collection_mint)
      .signers([admin])
      .accountsPartial({
        bondConfig: bondConfigPda2,
        authority: admin.publicKey,
      })
      .rpc()

    let bond_config2 = await program.account.bondConfig.fetch(bondConfigPda2)

    assert(bond_config2.mintOfCollection.equals(collection_mint))
  })

  it('Update lock period by user (should fail)', async () => {
    try {
      await program.methods
        .updateLockPeriod(1, new anchor.BN(1000))
        .signers([user])
        .accountsPartial({
          bondConfig: bondConfigPda1,
          authority: user.publicKey,
        })
        .rpc()
      assert(false, 'Should have thrown error')
    } catch (err) {
      expect((err as anchor.AnchorError).error.errorCode.number).to.equal(2012)
      expect((err as anchor.AnchorError).error.errorMessage).to.equal(
        'An address constraint was violated'
      )
    }

    const bondConfigPda2 = PublicKey.findProgramAddressSync(
      [Buffer.from('bond_config'), Buffer.from([2])],
      program.programId
    )[0]

    try {
      await program.methods
        .updateLockPeriod(2, new anchor.BN(1000))
        .signers([user])
        .accountsPartial({
          bondConfig: bondConfigPda2,
          authority: user.publicKey,
        })
        .rpc()
      assert(false, 'Should have thrown error')
    } catch (err) {
      expect((err as anchor.AnchorError).error.errorCode.number).to.equal(2012)
      expect((err as anchor.AnchorError).error.errorMessage).to.equal(
        'An address constraint was violated'
      )
    }
  })

  it('Update lock period by admin', async () => {
    await program.methods
      .updateLockPeriod(1, new anchor.BN(1000))
      .signers([admin])
      .accountsPartial({
        bondConfig: bondConfigPda1,
        authority: admin.publicKey,
      })
      .rpc()

    let bond_config = await program.account.bondConfig.fetch(bondConfigPda1)

    assert(bond_config.lockPeriod.eq(new anchor.BN(1000)))

    const bondConfigPda2 = PublicKey.findProgramAddressSync(
      [Buffer.from('bond_config'), Buffer.from([2])],
      program.programId
    )[0]

    await program.methods
      .updateLockPeriod(2, new anchor.BN(1000))
      .signers([admin])
      .accountsPartial({
        bondConfig: bondConfigPda2,
        authority: admin.publicKey,
      })
      .rpc()

    let bond_config2 = await program.account.bondConfig.fetch(bondConfigPda2)

    assert(bond_config2.lockPeriod.eq(new anchor.BN(1000)))
  })

  it('Update bond amount by user (should fail)', async () => {
    try {
      await program.methods
        .updateBondAmount(1, new anchor.BN(200e9))
        .signers([user])
        .accountsPartial({
          bondConfig: bondConfigPda1,
          authority: user.publicKey,
        })
        .rpc()
      assert(false, 'Should have thrown error')
    } catch (err) {
      expect((err as anchor.AnchorError).error.errorCode.number).to.equal(2012)
      expect((err as anchor.AnchorError).error.errorMessage).to.equal(
        'An address constraint was violated'
      )
    }

    const bondConfigPda2 = PublicKey.findProgramAddressSync(
      [Buffer.from('bond_config'), Buffer.from([2])],
      program.programId
    )[0]

    try {
      await program.methods
        .updateBondAmount(2, new anchor.BN(200e9))
        .signers([user])
        .accountsPartial({
          bondConfig: bondConfigPda2,
          authority: user.publicKey,
        })
        .rpc()
      assert(false, 'Should have thrown error')
    } catch (err) {
      expect((err as anchor.AnchorError).error.errorCode.number).to.equal(2012)
      expect((err as anchor.AnchorError).error.errorMessage).to.equal(
        'An address constraint was violated'
      )
    }
  })

  it('Update bond amount by admin', async () => {
    await program.methods
      .updateBondAmount(1, new anchor.BN(200e9))
      .signers([admin])
      .accountsPartial({
        bondConfig: bondConfigPda1,
        authority: admin.publicKey,
      })
      .rpc()

    let bond_config = await program.account.bondConfig.fetch(bondConfigPda1)

    assert(bond_config.bondAmount.eq(new anchor.BN(200e9)))

    const bondConfigPda2 = PublicKey.findProgramAddressSync(
      [Buffer.from('bond_config'), Buffer.from([2])],
      program.programId
    )[0]

    await program.methods
      .updateBondAmount(2, new anchor.BN(200e9))
      .signers([admin])
      .accountsPartial({
        bondConfig: bondConfigPda2,
        authority: admin.publicKey,
      })
      .rpc()

    let bond_config2 = await program.account.bondConfig.fetch(bondConfigPda2)

    assert(bond_config2.bondAmount.eq(new anchor.BN(200e9)))
  })

  it('Update withdraw penalty by user (should fail)', async () => {
    try {
      await program.methods
        .updateWithdrawPenalty(1, new anchor.BN(5000))
        .signers([user])
        .accountsPartial({
          bondConfig: bondConfigPda1,
          authority: user.publicKey,
        })
        .rpc()
      assert(false, 'Should have thrown error')
    } catch (err) {
      expect((err as anchor.AnchorError).error.errorCode.number).to.equal(2012)
      expect((err as anchor.AnchorError).error.errorMessage).to.equal(
        'An address constraint was violated'
      )
    }

    const bondConfigPda2 = PublicKey.findProgramAddressSync(
      [Buffer.from('bond_config'), Buffer.from([2])],
      program.programId
    )[0]

    try {
      await program.methods
        .updateWithdrawPenalty(2, new anchor.BN(5000))
        .signers([user])
        .accountsPartial({
          bondConfig: bondConfigPda2,
          authority: user.publicKey,
        })
        .rpc()
      assert(false, 'Should have thrown error')
    } catch (err) {
      expect((err as anchor.AnchorError).error.errorCode.number).to.equal(2012)
      expect((err as anchor.AnchorError).error.errorMessage).to.equal(
        'An address constraint was violated'
      )
    }
  })

  it('Update withdraw penalty by admin', async () => {
    await program.methods
      .updateWithdrawPenalty(1, new anchor.BN(5000))
      .signers([admin])
      .accountsPartial({
        bondConfig: bondConfigPda1,
        authority: admin.publicKey,
      })
      .rpc()

    let bond_config = await program.account.bondConfig.fetch(bondConfigPda1)

    assert(bond_config.withdrawPenalty.eq(new anchor.BN(5000)))

    const bondConfigPda2 = PublicKey.findProgramAddressSync(
      [Buffer.from('bond_config'), Buffer.from([2])],
      program.programId
    )[0]

    await program.methods
      .updateWithdrawPenalty(2, new anchor.BN(5000))
      .signers([admin])
      .accountsPartial({
        bondConfig: bondConfigPda2,
        authority: admin.publicKey,
      })
      .rpc()

    let bond_config2 = await program.account.bondConfig.fetch(bondConfigPda2)

    assert(bond_config2.withdrawPenalty.eq(new anchor.BN(5000)))
  })

  // Rewards Config

  it('Set rewards state by user (should fail)', async () => {
    try {
      await program.methods
        .setRewardsStateActive()
        .signers([user])
        .accountsPartial({
          rewardsConfig: rewardsConfigPda,
          authority: user.publicKey,
        })
        .rpc()
    } catch (err) {
      expect((err as anchor.AnchorError).error.errorCode.number).to.equal(2012)
      expect((err as anchor.AnchorError).error.errorMessage).to.equal(
        'An address constraint was violated'
      )
    }

    try {
      await program.methods
        .setRewardsStateInactive()
        .signers([user])
        .accountsPartial({
          rewardsConfig: rewardsConfigPda,
          authority: user.publicKey,
        })
        .rpc()
    } catch (err) {
      expect((err as anchor.AnchorError).error.errorCode.number).to.equal(2012)
      expect((err as anchor.AnchorError).error.errorMessage).to.equal(
        'An address constraint was violated'
      )
    }
  })

  it('Set rewards state by admin', async () => {
    await program.methods
      .setRewardsStateActive()
      .signers([admin])
      .accountsPartial({
        rewardsConfig: rewardsConfigPda,
        authority: admin.publicKey,
      })
      .rpc()

    let rewards_config = await program.account.rewardsConfig.fetch(
      rewardsConfigPda
    )

    assert(rewards_config.rewardsState == 1)

    await program.methods
      .setRewardsStateInactive()
      .signers([admin])
      .accountsPartial({
        rewardsConfig: rewardsConfigPda,
        authority: admin.publicKey,
      })
      .rpc()

    let rewards_config2 = await program.account.rewardsConfig.fetch(
      rewardsConfigPda
    )

    assert(rewards_config2.rewardsState == 0)
  })

  it('Update rewards per slot by user (should fail)', async () => {
    try {
      await program.methods
        .updateRewardsPerSlot(new anchor.BN(2e9))
        .signers([user])
        .accountsPartial({
          rewardsConfig: rewardsConfigPda,
          authority: user.publicKey,
        })
        .rpc()
      assert(false, 'Should have thrown error')
    } catch (err) {
      expect((err as anchor.AnchorError).error.errorCode.number).to.equal(2012)
      expect((err as anchor.AnchorError).error.errorMessage).to.equal(
        'An address constraint was violated'
      )
    }
  })

  it('Update rewards per slot by admin', async () => {
    await program.methods
      .updateRewardsPerSlot(new anchor.BN(2e9))
      .signers([admin])
      .accountsPartial({
        rewardsConfig: rewardsConfigPda,
        authority: admin.publicKey,
      })
      .rpc()

    let rewards_config = await program.account.rewardsConfig.fetch(
      rewardsConfigPda
    )

    assert(rewards_config.rewardsPerSlot.eq(new anchor.BN(2e9)))
  })

  it('Update max apr by user (should fail)', async () => {
    try {
      await program.methods
        .updateMaxApr(new anchor.BN(10))
        .signers([user])
        .accountsPartial({
          rewardsConfig: rewardsConfigPda,
          authority: user.publicKey,
        })
        .rpc()
      assert(false, 'Should have thrown error')
    } catch (err) {
      expect((err as anchor.AnchorError).error.errorCode.number).to.equal(2012)
      expect((err as anchor.AnchorError).error.errorMessage).to.equal(
        'An address constraint was violated'
      )
    }
  })

  it('Update max apr by admin', async () => {
    await program.methods
      .updateMaxApr(new anchor.BN(10))
      .signers([admin])
      .accountsPartial({
        rewardsConfig: rewardsConfigPda,
        authority: admin.publicKey,
      })
      .rpc()

    let rewards_config = await program.account.rewardsConfig.fetch(
      rewardsConfigPda
    )

    assert(rewards_config.maxApr.eq(new anchor.BN(10)))
  })

  it('Add rewards by user (should fail)', async () => {
    try {
      await program.methods
        .addRewards(new anchor.BN(1000e9))
        .signers([user])
        .accountsPartial({
          rewardsConfig: rewardsConfigPda,
          vaultConfig: vaultConfigPda,
          vault: vault_ata,
          mintOfToken: itheum_token_mint.publicKey,
          authority: user.publicKey,
          authorityTokenAccount: itheum_token_user_ata,
        })
        .rpc()
    } catch (err) {
      expect((err as anchor.AnchorError).error.errorCode.number).to.equal(2012)
      expect((err as anchor.AnchorError).error.errorMessage).to.equal(
        'An address constraint was violated'
      )
    }
  })

  it('Add rewards by admin', async () => {
    await program.methods
      .addRewards(new anchor.BN(1_000_000e9))
      .signers([admin])
      .accountsPartial({
        rewardsConfig: rewardsConfigPda,
        vaultConfig: vaultConfigPda,
        vault: vault_ata,
        mintOfToken: itheum_token_mint.publicKey,
        authority: admin.publicKey,
        authorityTokenAccount: itheum_token_admin_ata,
      })
      .rpc()

    let rewards_config = await program.account.rewardsConfig.fetch(
      rewardsConfigPda
    )

    assert(rewards_config.rewardsReserve.eq(new anchor.BN(1_000_000e9)))
  })

  it('Remove rewards by user (should fail)', async () => {
    try {
      await program.methods
        .removeRewards(new anchor.BN(1000e9))
        .signers([user])
        .accountsPartial({
          rewardsConfig: rewardsConfigPda,
          vaultConfig: vaultConfigPda,
          vault: vault_ata,
          mintOfToken: itheum_token_mint.publicKey,
          authority: user.publicKey,
          authorityTokenAccount: itheum_token_user_ata,
        })
        .rpc()
    } catch (err) {
      expect((err as anchor.AnchorError).error.errorCode.number).to.equal(2012)
      expect((err as anchor.AnchorError).error.errorMessage).to.equal(
        'An address constraint was violated'
      )
    }

    try {
      await program.methods
        .removeRewards(new anchor.BN(1000e9))
        .signers([user])
        .accountsPartial({
          rewardsConfig: rewardsConfigPda,
          vaultConfig: vaultConfigPda,
          vault: vault_ata,
          mintOfToken: another_token_mint.publicKey,
          authority: user.publicKey,
          authorityTokenAccount: itheum_token_user_ata,
        })
        .rpc()
    } catch (err) {
      expect((err as anchor.AnchorError).error.errorCode.number).to.equal(6006)
      expect((err as anchor.AnchorError).error.errorMessage).to.equal(
        'Mint mismatch'
      )
    }
  })

  it('Remove rewards by admin', async () => {
    await program.methods
      .removeRewards(new anchor.BN(1000e9))
      .signers([admin])
      .accountsPartial({
        rewardsConfig: rewardsConfigPda,
        vaultConfig: vaultConfigPda,
        vault: vault_ata,
        mintOfToken: itheum_token_mint.publicKey,
        authority: admin.publicKey,
        authorityTokenAccount: itheum_token_admin_ata,
      })
      .rpc()

    let rewards_config = await program.account.rewardsConfig.fetch(
      rewardsConfigPda
    )

    assert(rewards_config.rewardsReserve.eq(new anchor.BN(999_000e9)))

    await program.methods
      .addRewards(new anchor.BN(1_000e9))
      .signers([admin])
      .accountsPartial({
        rewardsConfig: rewardsConfigPda,
        vaultConfig: vaultConfigPda,
        vault: vault_ata,
        mintOfToken: itheum_token_mint.publicKey,
        authority: admin.publicKey,
        authorityTokenAccount: itheum_token_admin_ata,
      })
      .rpc()

    let rewards_config2 = await program.account.rewardsConfig.fetch(
      rewardsConfigPda
    )

    assert(rewards_config2.rewardsReserve.eq(new anchor.BN(1_000_000e9)))
  })

  it('Remove rewards by admin (should fail - mint of token mismatch)', async () => {
    try {
      await program.methods
        .removeRewards(new anchor.BN(1000e9))
        .signers([admin])
        .accountsPartial({
          rewardsConfig: rewardsConfigPda,
          vaultConfig: vaultConfigPda,
          vault: vault_ata,
          mintOfToken: another_token_mint.publicKey,
          authority: admin.publicKey,
          authorityTokenAccount: itheum_token_admin_ata,
        })
        .rpc()
    } catch (err) {
      expect((err as anchor.AnchorError).error.errorCode.number).to.equal(6006)
      expect((err as anchor.AnchorError).error.errorMessage).to.equal(
        'Mint mismatch'
      )
    }
  })

  it("Remove rewards by admin (should fail - authority's token account mismatch)", async () => {
    try {
      await program.methods
        .removeRewards(new anchor.BN(1000e9))
        .signers([admin])
        .accountsPartial({
          rewardsConfig: rewardsConfigPda,
          vaultConfig: vaultConfigPda,
          vault: vault_ata,
          mintOfToken: itheum_token_mint.publicKey,
          authority: admin.publicKey,
          authorityTokenAccount: itheum_token_user_ata,
        })
        .rpc()
    } catch (err) {
      expect((err as anchor.AnchorError).error.errorCode.number).to.equal(6005)
      expect((err as anchor.AnchorError).error.errorMessage).to.equal(
        'Owner mismatch'
      )
    }
  })

  it("Remove rewards by admin (should fail - authority's token account mint mismatch)", async () => {
    try {
      await program.methods
        .removeRewards(new anchor.BN(1000e9))
        .signers([admin])
        .accountsPartial({
          rewardsConfig: rewardsConfigPda,
          vaultConfig: vaultConfigPda,
          vault: vault_ata,
          mintOfToken: another_token_mint.publicKey,
          authority: admin.publicKey,
          authorityTokenAccount: another_token_admin_ata,
        })
        .rpc()
    } catch (err) {
      expect((err as anchor.AnchorError).error.errorCode.number).to.equal(6006)
      expect((err as anchor.AnchorError).error.errorMessage).to.equal(
        'Mint mismatch'
      )
    }
  })

  it('Remove rewards by admin (should fail - wrong vault ata', async () => {
    try {
      await program.methods
        .removeRewards(new anchor.BN(1000e9))
        .signers([admin])
        .accountsPartial({
          rewardsConfig: rewardsConfigPda,
          vaultConfig: vaultConfigPda,
          vault: itheum_token_admin_ata,
          mintOfToken: itheum_token_mint.publicKey,
          authority: admin.publicKey,
          authorityTokenAccount: itheum_token_admin_ata,
        })
        .rpc()
    } catch (err) {
      expect((err as anchor.AnchorError).error.errorCode.number).to.equal(2001)
      expect((err as anchor.AnchorError).error.errorMessage).to.equal(
        'A has one constraint was violated'
      )
    }
  })

  it('Activate rewards by admin', async () => {
    await program.methods
      .setRewardsStateActive()
      .signers([admin])
      .accountsPartial({
        rewardsConfig: rewardsConfigPda,
        authority: admin.publicKey,
      })
      .rpc()

    let rewards_config = await program.account.rewardsConfig.fetch(
      rewardsConfigPda
    )

    assert(rewards_config.rewardsState == 1)
  })
})
