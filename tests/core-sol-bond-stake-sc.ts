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
import {assert} from 'chai'
import {
  mplTokenMetadata,
  createNft,
} from '@metaplex-foundation/mpl-token-metadata'
import {fromWeb3JsKeypair} from '@metaplex-foundation/umi-web3js-adapters'
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
    [Buffer.from('bond_config'), Uint8Array.from([1])],
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
        createMintToInstruction(x[0], x[2], x[1], 1000e9),
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
        createMintToInstruction(x[0], x[2], admin.publicKey, 100e9),
      ]),
    ]

    await provider.sendAndConfirm(tx, [admin])

    const umi = createUmi(connection)
    umi.use(mplTokenMetadata())

    umi.use(keypairIdentity(fromWeb3JsKeypair(admin)))

    const collection_mint = generateSigner(umi)

    const resp = await createNft(umi, {
      mint: collection_mint,
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

    const umi3 = createUmi(connection)
    umi3.use(keypairIdentity(fromWeb3JsKeypair(admin)))
    umi3.use(mplBubblegum())

    const metadata: MetadataArgsArgs = {
      name: 'Vault NFMEID',
      uri: 'https://indigo-complete-silverfish-271.mypinata.cloud/ipfs/QmcgwWW47d9FjHksKhZ5DWJYWvzPbVR1uhgH8kwBgNkJ9F/GetBitzNFTunesMainM.json',
      sellerFeeBasisPoints: 200,
      collection: {key: collection_mint.publicKey, verified: false},
      creators: [
        {
          address: fromWeb3JsKeypair(user).publicKey,
          verified: false,
          share: 100,
        },
      ],
    }

    const nft_mint = generateSigner(umi3)
    const resp3 = await mintToCollectionV1(umi3, {
      leafOwner: fromWeb3JsKeypair(user).publicKey,
      merkleTree: merkleTree.publicKey,
      collectionMint: collection_mint.publicKey,
      metadata: metadata,
    }).sendAndConfirm(umi3)

    console.log(nft_mint)
  })

  it('test', async () => {
    assert(true == true)
  })
})
