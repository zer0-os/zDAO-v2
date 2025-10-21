import hre from "hardhat";
import { expect } from "chai";
import { ethers } from "ethers";
import { DEFAULT_ADMIN_ROLE } from "../src/constants.js";
import { WalletClient } from "viem";

let viem;
let networkHelpers;

let admin : WalletClient;
let user1 : WalletClient;
let user2 : WalletClient;

const delay = 1n;
const votingPeriod = 10n;
const proposalThreshold20 = ethers.parseUnits("100");
const quorumPercentage = 10n;
const voteExtension = 5n;

describe("ZDAO", () => {
  const fixture = async () => {
    ({ viem, networkHelpers } = await hre.network.connect());
    [ admin, user1, user2 ] = await viem.getWalletClients();
  };

  it("should deploy Voting20 with DAO using viem", async () => {
    // networkHelpers.loadFixture(fixture);
    await fixture();

    const voting20Params = [
      "ZeroVotingERC20",
      "ZV",
      "ZERO DAO",
      "1",
      admin.account?.address,
    ];

    const timelockParams = [
      1n,
      [],
      [],
      admin.account?.address,
    ];

    // Deploy VotingERC20
    const votingERC20 = await viem.deployContract(
      "ZeroVotingERC20",
      voting20Params
    );
    expect(votingERC20.address).to.exist;
    expect(await votingERC20.read.name()).to.equal("ZeroVotingERC20");
    expect(await votingERC20.read.symbol()).to.equal("ZV");

    // Deploy Timelock
    const timelock = await viem.deployContract(
      "TimelockController",
      timelockParams
    );

    expect(timelock).to.exist;
    expect(await timelock.read.getMinDelay()).to.equal(timelockParams[0]);
    expect(
      await timelock.read.hasRole([
        DEFAULT_ADMIN_ROLE,
        admin.account.address,
      ])
    ).to.equal(true);

    const govParams = [
      1n,
      "ZDAO",
      votingERC20.address,
      timelock.address,
      delay,
      votingPeriod,
      proposalThreshold20,
      quorumPercentage,
      voteExtension,
    ];

    // Deploy Governance
    const governance20 = await viem.deployContract(
      "ZDAO",
      govParams
    );

    expect(governance20).to.exist;
    expect(await governance20.read.name()).to.equal(govParams[1]);
    expect(
      (await governance20.read.token()).toLowerCase()
    ).to.equal(
      govParams[2].toLowerCase()
    );
    expect(
      (await governance20.read.timelock()).toLowerCase()
    ).to.equal(
      govParams[3].toLowerCase()
    );
    expect(await governance20.read.votingPeriod()).to.equal(govParams[5]);
    expect(await governance20.read.proposalThreshold()).to.equal(govParams[6]);
  });
});
