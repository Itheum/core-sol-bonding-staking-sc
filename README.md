# Itheum Core Solana - Itheum Life Bonding Contract V1 (cNFTs)

## Abstract

The Itheum Life bonding contract coordinates data creator $ITHEUM token bonding actions and "Liveliness" reputation scores for data creators.

## Install, Build, Deploy and Test

Let's run the test once to see what happens.

### Install `anchor`

First, make sure that `anchor` and the `solana-cli` is installed:

Install `avm`:

```bash
$ cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
...
```

Install latest `anchor` version:

```bash
$ avm install 0.29.0
...
$ avm use 0.29.0
...
```

install Solana CLI as per here: https://docs.solanalabs.com/cli/install

#### Verify the Installation

Check if Anchor is successfully installed:

```bash
$ anchor --version
anchor-cli 0.29.0

$ solana --version
solana-cli 1.18.15 (src:767d24e5; feat:4215500110, client:SolanaLabs)
```

### Install Dependencies

Next, install dependencies:

```
$ yarn
```

If you use npm and have warnings, you can install via `--legacy-peer-deps` (as its only needed for interactions script usage)

### Build `core-sol-bond-stake-sc`

Remove any `target` folder if needed or rename if you want to keep it (i.e. version upgrade). You also need to delete it the first time you deploy this program, as only doing this will generate a new program_id needed for next step. For upgrades and followups, you don't need to delete the folder.

```bash
$ anchor build
```

#### Update `program_id`

Once you build, a new Program address is generated (so long as you don't have a `target` folder). Get the public key of the program. This keypair is generated automatically so a different key is expected:

```bash
$ anchor keys list
core-sol-bond-stake-sc: 4wDs9FnvdksFXy69UKVgi7WWqtYJmbM6TiMCEWY9wJz9
```

Replace the default value of `program_id` with this new value:

```toml
# Anchor.toml

[programs.localnet]
core-sol-bond-stake-sc = "DRxp3EJv4hGQDze6Evf515KE1YwVgYNv6PiDp1dqF4pK"

...
```

```rust
// lib.rs

...

declare_id!("DRxp3EJv4hGQDze6Evf515KE1YwVgYNv6PiDp1dqF4pK");

...
```

ALSO, note that you need to "hardcode" the General Admin wallet in constants.rs. This general admin is the one that can call initializeContract.

```
pub const ADMIN_PUBKEY: Pubkey = pubkey!("AxDG4CDKrn8s3a1caY69nQYCjR8YnxqjhMPwhUGFKL2Q");
```

We re-Build the program: (DO NOT delete the `target` folder this time before running)

```
$ anchor build
```

### Deploy `core-sol-bond-stake-sc`

Let's deploy the program using anchor...

```
$ solana config set --url localhost
```

or else, you can update Anchor.toml `cluster = "devnet"` or `mainnet` (mainnet-beta?)

you can also toggle deploying wallet by `wallet = "usb://ledger?key=1"` or `wallet = "~/.config/solana/id.json"`

Deploy command for Anchor:
`anchor deploy`

**Ledger based deploys**
NOTE: that we can't deploy via Anchor as we found it not too unstable when using Ledger, so we used the Solana CLI.

- First, let's generate a new key pair that we will use to deploy the "buffer", once you have it, save it somewhere safe. You will also need a decent amount of SOL in this account (around 3 should do for this program), as it will be used as "rent" for the code. then we set this as the default solana cli wallet for now (or else it will use our standard id.json wallet). Note that on top of setting the custom wallet, you also need to confirm the RPC and config is correct for the mainnet deployment as it defaults to devnet.

Update RPC for devnet/testnet/mainnet by editing the config file here:
`vi /Users/USER/.config/solana/cli/config.yml` (and then check via `solana config get`)

Set the default wallet like so:
`solana config set -k /location_of/custom_wallet.json`

The below keys have been backed-up in storage.

[devnet]
`solana config set -k /Users/USER/Documents/Source/Software/core-sol-bond-stake-sc/devnet_interim_first_deployer_wallet_9tSsTbCZEGMgZYALathtBbqmELY7BefFbQQ4gasXGBAo.json`

[mainnet]
`solana config set -k /Users/USER/Documents/Source/Software/core-sol-bond-stake-sc/interim_buffer_deployer_mainnet_FVnq4TFB39W8xEY36rhwFnScpkGzc59jhL3EuFi6K8Nb.json`

- Next, we use this key pair to generate the buffer
  `solana program write-buffer "./target/deploy/core-sol-bond-stake-sc.so"`

Note that if you don't have enough SOL, then you will see some error like `Error: Account XXX has insufficient funds for spend (2.80402392 SOL) + fee (0.002 SOL)`

In this situation, you need to get more SOL.. but you don't lose what you used, you can do this to close the buffer (note that this closes ALL buffers on this authority -- so if this is not the plan, then you can try and recover the buffer after increasing your SOL. The console should give you tips on how to recover the buffer when the error is hit)
`solana program close --buffers`

if it's a success, the console will give us the buffer like so as an e.g. `Buffer: 85me4UW2ytQmUnzTAHtFvLoZf85D6qhzwgcvUusAByb2`

[devnet]
https://explorer.solana.com/address/85me4UW2ytQmUnzTAHtFvLoZf85D6qhzwgcvUusAByb2?cluster=devnet

[testnet]
`Buffer: 4c5UDi4inDoauN9HShH4CrF5SfEmXxnPAZguKvMK4ocd`
https://explorer.solana.com/address/4c5UDi4inDoauN9HShH4CrF5SfEmXxnPAZguKvMK4ocd?cluster=testnet

[mainnet]
`Buffer: GohVs4cC1WMtTjBgvKA7byWpWsyd9zHy85Z21JtuDPm`
https://explorer.solana.com/address/GohVs4cC1WMtTjBgvKA7byWpWsyd9zHy85Z21JtuDPm

if you notice, the Deploy Authority, is our custom new HOT wallet. Maybe we want to move this to a Cold wallet for security? if so we can do this:

[devnet]
`solana program set-buffer-authority 85me4UW2ytQmUnzTAHtFvLoZf85D6qhzwgcvUusAByb2 --new-buffer-authority 4FeJ53a5QZQFroVgQ5pKFNsu7BEV5AoxHMGhsNKhETYt`

[mainnet]
`solana program set-buffer-authority GohVs4cC1WMtTjBgvKA7byWpWsyd9zHy85Z21JtuDPm --new-buffer-authority 4FeJ53a5QZQFroVgQ5pKFNsu7BEV5AoxHMGhsNKhETYt`

- And finally, we deploy the program from the buffer:
  [devnet]
  `solana program deploy --program-id "./target/deploy/core-sol-bond-stake-sc-keypair.json" --buffer 85me4UW2ytQmUnzTAHtFvLoZf85D6qhzwgcvUusAByb2 --upgrade-authority "usb://ledger?key=2"`

[mainnet]
`solana program deploy --program-id "./target/deploy/core-sol-bond-stake-sc-keypair.json" --buffer GohVs4cC1WMtTjBgvKA7byWpWsyd9zHy85Z21JtuDPm --upgrade-authority "usb://ledger?key=2"`

You should finally get the program deployed and see something like:

```
✅ Approved
Program Id: 4wDs9FnvdksFXy69UKVgi7WWqtYJmbM6TiMCEWY9wJz9
```

### Test `core-sol-bond-stake-sc`

To test against localnet, update the `cluster` section in `Anchor.toml`:

```toml
[provider]
cluster = "localnet"
```

Because the program needs a constant admin address, the tests will use the `UNIT_TEST_PRIVATE_KEY` stored in the `.env` file. This key is used to sign transactions in the tests.
Copy the content from `env.copy` to `.env`. Copy the `UNIT_TEST_PUBLIC_KEY` from the `env.copy` to the `constants.rs` file where the `ADMIN_PUBKEY` constant is defined.

> [!WARNING]  
> In order to run the tests, you need to comment out the cNFT leaf owner check in bond endpoint at `src/bond.rs` line `165` - `181`. This check can be tested separately on devnet.

```
$ anchor test
```

### Using Interactions Node Script

Configure your deployed contract using the interactions node script.

Go into the interactions Folder, and run the script as `bun index.ts` as you comment out sections you want to run. We use `bun` so you can run the TS files. You can also use `npx ts-node index.ts `. Note that sometimes some commands can fail with an error like "TokenAccountNotFound" -- this may just be due to congestion, so try again or add some "sleeps" between tasks.

## Upgrade contract

- Update your code as needed and then run `anchor build`
- Then make sure `Anchor.toml` has the right settings for your target environment and keys
- Then `anchor deploy`
