import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { CoreSolBondStakeSc } from "../target/types/core_sol_bond_stake_sc";

describe("core-sol-bond-stake-sc", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.CoreSolBondStakeSc as Program<CoreSolBondStakeSc>;

  it("Is initialized!", async () => {
    // Add your test here.
    const tx = await program.methods.initialize().rpc();
    console.log("Your transaction signature", tx);
  });
});
