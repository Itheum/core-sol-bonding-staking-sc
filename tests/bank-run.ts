// import {Program} from '@coral-xyz/anchor'
// import {
//   Connection,
//   Keypair,
//   LAMPORTS_PER_SOL,
//   PublicKey,
//   SystemProgram,
//   Transaction,
// } from '@solana/web3.js'
// import {BankrunProvider} from 'anchor-bankrun'
// import {startAnchor} from 'solana-bankrun'
// import {CoreSolBondStakeSc} from '../target/types/core_sol_bond_stake_sc'
// import {
//   createAssociatedTokenAccountIdempotentInstruction,
//   createInitializeMint2Instruction,
//   createMintToInstruction,
//   getAssociatedTokenAddressSync,
//   getMinimumBalanceForRentExemptMint,
//   MINT_SIZE,
//   TOKEN_PROGRAM_ID,
// } from '@solana/spl-token'
// import * as anchor from '@coral-xyz/anchor'
// import {
//   generateSigner,
//   keypairIdentity,
//   percentAmount,
// } from '@metaplex-foundation/umi'
// import {createUmi} from '@metaplex-foundation/umi-bundle-defaults'
// import {
//   createTree,
//   MetadataArgsArgs,
//   mintToCollectionV1,
//   mplBubblegum,
// } from '@metaplex-foundation/mpl-bubblegum'
// import {
//   fromWeb3JsKeypair,
//   toWeb3JsPublicKey,
// } from '@metaplex-foundation/umi-web3js-adapters'
// import {
//   mplTokenMetadata,
//   createNft,
// } from '@metaplex-foundation/mpl-token-metadata'

// require('dotenv').config()

// describe('BankRun', () => {
//   const logWrapper = 'noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV'
//   const compression = 'cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK'
//   const bubbleGum = 'BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY'
//   const metadata = 'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s'
//   it('anchor', async () => {
//     const context = await startAnchor('', [], [])
//     const programId = PublicKey.unique()
//     const executableAccount = await context.banksClient.getAccount(programId)

//     const provider = new BankrunProvider(context)

//     anchor.setProvider(provider)

//     const connection = provider.connection

//     const program = anchor.workspace
//       .CoreSolBondStakeSc as Program<CoreSolBondStakeSc>

//     const PRIVATE_KEY_STR = process.env.UNIT_TEST_PRIVATE_KEY
//     const privateKeys = PRIVATE_KEY_STR.split(',').map(Number)

//     const [user, user2, itheum_token_mint, another_token_mint] = Array.from(
//       {length: 5},
//       () => Keypair.generate()
//     )

//     let collection_mint: PublicKey
//     let user_nft_mint: PublicKey
//     let user2_nft_mint: PublicKey

//     const itheum_token_user_ata = getAssociatedTokenAddressSync(
//       itheum_token_mint.publicKey,
//       user.publicKey
//     )
//     const another_token_user_ata = getAssociatedTokenAddressSync(
//       another_token_mint.publicKey,
//       user.publicKey
//     )

//     const itheum_token_user2_ata = getAssociatedTokenAddressSync(
//       itheum_token_mint.publicKey,
//       user2.publicKey
//     )
//     const another_token_user2_ata = getAssociatedTokenAddressSync(
//       another_token_mint.publicKey,
//       user2.publicKey
//     )

//     const admin = Keypair.fromSecretKey(Uint8Array.from(privateKeys))

//     const itheum_token_admin_ata = getAssociatedTokenAddressSync(
//       itheum_token_mint.publicKey,
//       admin.publicKey
//     )
//     const another_token_admin_ata = getAssociatedTokenAddressSync(
//       another_token_mint.publicKey,
//       admin.publicKey
//     )

//     const bondConfigPda1 = PublicKey.findProgramAddressSync(
//       [Buffer.from('bond_config'), Buffer.from([1])],
//       program.programId
//     )[0]

//     const rewardsConfigPda = PublicKey.findProgramAddressSync(
//       [Buffer.from('rewards_config')],
//       program.programId
//     )[0]

//     const vaultConfigPda = PublicKey.findProgramAddressSync(
//       [Buffer.from('vault_config')],
//       program.programId
//     )[0]

//     const vault_ata = getAssociatedTokenAddressSync(
//       itheum_token_mint.publicKey,
//       vaultConfigPda,
//       true
//     )

//     const another_vault_ata = getAssociatedTokenAddressSync(
//       another_token_mint.publicKey,
//       vaultConfigPda,
//       true
//     )

//     const confirm = async (signature: string): Promise<string> => {
//       const block = await connection.getLatestBlockhash()
//       await connection.confirmTransaction({
//         signature,
//         ...block,
//       })

//       return signature
//     }

//     const log = async (signature: string): Promise<string> => {
//       console.log(
//         `Transaction signature: https://explorer.solana.com/transaction/${signature}?cluster=custom&customUrl=${connection.rpcEndpoint}`
//       )
//       return signature
//     }
//     let lamports = await getMinimumBalanceForRentExemptMint(connection)
//     let tx2 = new Transaction()
//     tx2.instructions = [
//       ...[admin].map((k) =>
//         SystemProgram.transfer({
//           fromPubkey: provider.publicKey,
//           toPubkey: k.publicKey,
//           lamports: 10 * LAMPORTS_PER_SOL,
//         })
//       ),
//       ...[itheum_token_mint, another_token_mint].map((m) =>
//         SystemProgram.createAccount({
//           fromPubkey: provider.publicKey,
//           newAccountPubkey: m.publicKey,
//           lamports,
//           space: MINT_SIZE,
//           programId: TOKEN_PROGRAM_ID,
//         })
//       ),
//       ...[
//         [itheum_token_mint.publicKey, admin.publicKey, itheum_token_admin_ata],
//         [
//           another_token_mint.publicKey,
//           admin.publicKey,
//           another_token_admin_ata,
//         ],
//       ].flatMap((x) => [
//         createInitializeMint2Instruction(x[0], 9, x[1], x[1]),
//         createAssociatedTokenAccountIdempotentInstruction(
//           provider.publicKey,
//           x[2],
//           x[1],
//           x[0],
//           TOKEN_PROGRAM_ID
//         ),
//         createMintToInstruction(x[0], x[2], x[1], 2_000_000e9),
//       ]),
//     ]
//     await provider
//       .sendAndConfirm(tx2, [admin, itheum_token_mint, another_token_mint])
//       .then(log)

//     let tx = new Transaction()
//     tx.instructions = [
//       ...[user, user2].map((k) =>
//         SystemProgram.transfer({
//           fromPubkey: provider.publicKey,
//           toPubkey: k.publicKey,
//           lamports: 10 * LAMPORTS_PER_SOL,
//         })
//       ),
//       ...[
//         [itheum_token_mint.publicKey, user.publicKey, itheum_token_user_ata],
//         [another_token_mint.publicKey, user.publicKey, another_token_user_ata],
//         [itheum_token_mint.publicKey, user2.publicKey, itheum_token_user2_ata],
//         [
//           another_token_mint.publicKey,
//           user2.publicKey,
//           another_token_user2_ata,
//         ],
//       ].flatMap((x) => [
//         createAssociatedTokenAccountIdempotentInstruction(
//           provider.publicKey,
//           x[2],
//           x[1],
//           x[0],
//           TOKEN_PROGRAM_ID
//         ),
//         createMintToInstruction(x[0], x[2], admin.publicKey, 1_000e9),
//       ]),
//     ]

//     await provider.sendAndConfirm(tx, [admin])

//     const adminInfo = await connection.getAccountInfo(admin.publicKey)

//     console.log('adminInfo', adminInfo)

//     const umi = createUmi(new Connection('http://localhost:8899'))
//     umi.use(mplTokenMetadata())

//     umi.use(keypairIdentity(fromWeb3JsKeypair(admin)))

//     const collection = generateSigner(umi)

//     collection_mint = toWeb3JsPublicKey(collection.publicKey)

//     const resp = await createNft(umi, {
//       mint: collection,
//       name: 'Itheum Vaults',
//       uri: 'https://ipfs.io/ipfs/QmTBeJHejL9awc5RA3u7TGWNv9RyGi2KgQUfzzdZstyz3n/',
//       sellerFeeBasisPoints: percentAmount(5.1), // 5.1%
//       isCollection: true,
//     }).sendAndConfirm(umi)

//     const umi2 = createUmi(new Connection('http://localhost:8899'))

//     umi2.use(keypairIdentity(fromWeb3JsKeypair(admin)))
//     umi2.use(mplBubblegum())

//     const merkleTree = generateSigner(umi2)
//     const builder = await createTree(umi2, {
//       merkleTree,
//       maxDepth: 14,
//       maxBufferSize: 64,
//     })
//     await builder.sendAndConfirm(umi2)

//     const metadata: MetadataArgsArgs = {
//       name: 'Vault NFMEID user1',
//       uri: 'https://indigo-complete-silverfish-271.mypinata.cloud/ipfs/QmcgwWW47d9FjHksKhZ5DWJYWvzPbVR1uhgH8kwBgNkJ9F/GetBitzNFTunesMainM.json',
//       sellerFeeBasisPoints: 200,
//       collection: {key: collection.publicKey, verified: false},
//       creators: [
//         {
//           address: fromWeb3JsKeypair(user).publicKey,
//           verified: false,
//           share: 100,
//         },
//       ],
//     }

//     const metadata2: MetadataArgsArgs = {
//       name: 'Vault NFMEID user2',
//       uri: 'https://indigo-complete-silverfish-271.mypinata.cloud/ipfs/QmcgwWW47d9FjHksKhZ5DWJYWvzPbVR1uhgH8kwBgNkJ9F/GetBitzNFTunesMainM.json',
//       sellerFeeBasisPoints: 200,
//       collection: {key: collection.publicKey, verified: false},
//       creators: [
//         {
//           address: fromWeb3JsKeypair(user2).publicKey,
//           verified: false,
//           share: 100,
//         },
//       ],
//     }

//     const nft_mint1 = generateSigner(umi2)

//     user_nft_mint = toWeb3JsPublicKey(nft_mint1.publicKey)

//     const resp3 = await mintToCollectionV1(umi2, {
//       leafOwner: fromWeb3JsKeypair(user).publicKey,
//       merkleTree: merkleTree.publicKey,
//       collectionMint: collection.publicKey,
//       metadata: metadata,
//     }).sendAndConfirm(umi2)

//     const nft_mint_2 = generateSigner(umi2)
//     const resp4 = await mintToCollectionV1(umi2, {
//       leafOwner: fromWeb3JsKeypair(user2).publicKey,
//       merkleTree: merkleTree.publicKey,
//       collectionMint: collection.publicKey,
//       metadata: metadata2,
//     }).sendAndConfirm(umi2)

//     user2_nft_mint = toWeb3JsPublicKey(nft_mint_2.publicKey)
//   })
// })
