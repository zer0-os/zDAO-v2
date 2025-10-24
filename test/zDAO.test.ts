import hre from "hardhat";
import { expect } from "chai";

// import { ZeroVotingERC20 } from "../types/ethers-contracts/voting/ZVoting20.sol/ZeroVotingERC20.js";
// import { ZDAO } from "../types/ethers-contracts/ZDAO.js";
import { WalletClient } from "viem";

import type { HardhatViemHelpers } from "@nomicfoundation/hardhat-viem/types";

import { NetworkConnection } from "hardhat/types/network"

import { DEFAULT_DELAY, DEFAULT_PROPOSAL_THRESHOLD_20, DEFAULT_QUORUM_PERCENTAGE, DEFAULT_VOTE_EXTENSION, DEFAULT_VOTING_PERIOD } from "./helpers/constants.js"
// import { NetworkConnection } from "hardhat/types/network";
// import { NetworkHelpers } from "@nomicfoundation/hardhat-network-helpers/types";
// import { connect } from "http2";

// type Fixture<T> = (connection: NetworkConnection) => Promise<T>;

describe("ZDAO", async () => {
  let admin : WalletClient;
  let userA : WalletClient;
  let userB : WalletClient;

  let addrs : Array<string>;

  let viem : HardhatViemHelpers;
  let networkHelpers : any; // NetworkHelpers;

  let votingERC20 : any; // ZeroVotingERC20
  let governance20 : any; //ZDAO;
  let zeroTreasuryHub : any; // temp any

  before(async () => {
    const connection = await hre.network.connect();

    viem = connection.viem;
    networkHelpers = connection.networkHelpers;

    // Deploy new environment
    ({
      zeroTreasuryHub,
      votingERC20,
      governance20
    } = await networkHelpers.loadFixture(deploymentFixture))
  });

  // Fixture for init contract deployment
  async function deploymentFixture(): Promise<any> {

    const [ admin, userA, userB ] = await viem.getWalletClients();

    const zTreasuryHub = await viem.deployContract(
      "ZeroTreasuryHub",
      [
        admin.account.address,
        `${userA.account!.address}`,
        `${userB.account!.address}`
      ]
    );

    const voting20 = await viem.deployContract(
      "ZeroVotingERC20",
      [
        "Zero Voting Token",
        "ZV",
        "ZERO DAO",
        "1",
        admin.account!.address
      ]
    );

    const governance20 = await viem.deployContract(
      "ZDAO",
      [
        1n,
        "ZDAO",
        voting20.address,
        userA.account!.address, // todo temp, replacement for timelockController.address
        DEFAULT_DELAY,
        DEFAULT_VOTING_PERIOD,
        DEFAULT_PROPOSAL_THRESHOLD_20,
        DEFAULT_QUORUM_PERCENTAGE,
        DEFAULT_VOTE_EXTENSION,
      ]);


    return {
      zeroTreasuryHub,
      voting20,
      governance20,
      accounts: [admin, userA, userB]
    };
  }

  it("should work", async () => {
    console.log(zeroTreasuryHub.address);
  });

  // TODO re add the prior tests
});
