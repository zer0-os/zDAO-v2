import hre from "hardhat";
import { expect } from "chai";
import { ethers } from "ethers";
import { DEFAULT_ADMIN_ROLE } from "../src/constants.js";
import { WalletClient, Transport, Chain, Account, RpcSchema } from "viem";
import { HardhatViemHelpers } from "@nomicfoundation/hardhat-viem/types";


let viem : HardhatViemHelpers;
let networkHelpers;

type DaoTestWallet = WalletClient<Transport, Chain, Account, RpcSchema>;

let admin : DaoTestWallet;
let user1 : WalletClient;
let user2 : WalletClient;

let voting20Params : [
  string,
  string,
  string,
  string,
  `0x${string}`
];
let timelockParams : [
  bigint,
  Array<`0x${string}`>,
  Array<`0x${string}`>,
  `0x${string}`
];
let govParams : [
  bigint,
  string,
  `0x${string}`,
  `0x${string}`,
  number,
  number,
  bigint,
  bigint,
  number
];

const delay = 1;
const votingPeriod = 10;
const proposalThreshold20 = ethers.parseUnits("100");
const quorumPercentage = 10n;
const voteExtension = 5;

const initialUser1Balance = ethers.parseUnits("1000");
const initialUser2Balance = ethers.parseUnits("200");

let votingERC20 : ReturnType<typeof viem.deployContract>;
let timelock : ReturnType<typeof viem.deployContract>;
let governance20 : ReturnType<typeof viem.deployContract>;

describe("ZDAO", () => {
  const fixture = async () => {
    [ admin, user1, user2 ] = await viem.getWalletClients();

    voting20Params = [
      "ZeroVotingERC20",
      "ZV",
      "ZERO DAO",
      "1",
      admin.account.address,
    ];

    timelockParams = [
      1n,
      [],
      [],
      admin.account.address,
    ];

    // Deploy VotingERC20
    votingERC20 = await viem.deployContract(
      "ZeroVotingERC20",
      voting20Params
    );

    // Deploy Timelock
    timelock = await viem.deployContract(
      "TimelockController",
      timelockParams
    );

    govParams = [
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
    governance20 = await viem.deployContract(
      "ZDAO",
      govParams
    );

    // Grant proposer and executor role to the gov contract to use proposals
    await timelock.write.grantRole([
      await timelock.read.PROPOSER_ROLE(),
      governance20.address,
    ]
    );
    await timelock.write.grantRole([
      await timelock.read.EXECUTOR_ROLE(),
      governance20.address,
    ]);
    // Grant minter role to the timelock to let it execute proposal on mint
    await votingERC20.write.grantRole([
      await votingERC20.read.MINTER_ROLE(),
      timelock.address,
    ]);

    // Give minter role to admin
    await votingERC20.write.grantRole([
      await votingERC20.read.MINTER_ROLE(),
      admin.account.address,
    ]);

    // Mint tokens to users
    await votingERC20.write.mint([user1.account.address, initialUser1Balance]);
    await votingERC20.write.mint([user2.account.address, initialUser2Balance]);

    // Delegate tokens to themselves for voting power
    await votingERC20.write.delegate([user1.account.address]);
    await votingERC20.write.delegate([user2.account.address]);
  };

  beforeEach(async () => {
    ({ viem, networkHelpers } = await hre.network.connect());

    await networkHelpers.loadFixture(fixture);
  });

  it("should deploy Voting20 with DAO using viem", async () => {
    expect(votingERC20.address).to.exist;
    expect(await votingERC20.read.name()).to.equal("ZeroVotingERC20");
    expect(await votingERC20.read.symbol()).to.equal("ZV");

    expect(timelock).to.exist;
    expect(await timelock.read.getMinDelay()).to.equal(timelockParams[0]);
    expect(
      await timelock.read.hasRole([
        DEFAULT_ADMIN_ROLE,
        admin.account.address,
      ])
    ).to.equal(true);

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
    expect(
      await governance20.read.votingPeriod()
    ).to.equal(
      BigInt(govParams[5])
    );
    expect(
      await governance20.read.proposalThreshold()
    ).to.equal(
      BigInt(govParams[6])
    );
  });

  // it("should create and execute a GENERIC proposal flow", async () => {
  //   const proposal = await governance20.write.proposeGeneric(
  //     [user1.account.address],
  //     [0n],
  //     ["setPurpose(string)"],
  //     [ethers.toUtf8Bytes("Hello World")],
  //     "Proposal #1: Set Purpose to 'Hello World'"
  //   );
  // });
});
