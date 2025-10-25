import hre from "hardhat";
import { expect } from "chai";
import { ethers } from "ethers";
import { DEFAULT_ADMIN_ROLE } from "../src/constants.js";
import { HardhatViemHelpers } from "@nomicfoundation/hardhat-viem/types";
import { DaoTestWallet } from "./types.js";
import { encodeFunctionData } from "viem";


describe("ZDAO", () => {
  let viem : HardhatViemHelpers;
  let networkHelpers;

  let admin : DaoTestWallet;
  let user1 : DaoTestWallet;
  let user2 : DaoTestWallet;

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

  const delay = 1;
  const votingPeriod = 10;
  const proposalThreshold20 = ethers.parseUnits("100");
  const quorumPercentage = 10n;
  const voteExtension = 5;

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

  const initialAdminBalance = ethers.parseUnits("100000000");
  const initialUser1Balance = ethers.parseUnits("1000");
  const initialUser2Balance = ethers.parseUnits("200");

  let votingERC20;
  let timelock;
  let governance20;

  // eslint-disable-next-line prefer-arrow/prefer-arrow-functions
  async function fixture () {
    ({ viem, networkHelpers } = await hre.network.connect());
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
    const votingERC20 = await viem.deployContract(
      "ZeroVotingERC20",
      voting20Params
    );

    // Deploy Timelock
    const timelock = await viem.deployContract(
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
    const governance20 = await viem.deployContract(
      "ZDAO",
      govParams
    );

    return ({
      votingERC20,
      timelock,
      governance20,
    });
  }

  before(async () => {
    ({ viem, networkHelpers } = await hre.network.connect());
    ({
      votingERC20,
      timelock,
      governance20,
    } = await networkHelpers.loadFixture(fixture));

    // Grant proposer and executor role to the gov contract to use proposals
    await timelock.write.grantRole([
      await timelock.read.PROPOSER_ROLE(),
      governance20.address,
    ]);
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
    await votingERC20.write.mint([admin.account.address, initialAdminBalance]);
    await votingERC20.write.mint([user1.account.address, initialUser1Balance]);
    await votingERC20.write.mint([user2.account.address, initialUser2Balance]);

    // Delegate tokens to themselves for voting power
    await votingERC20.write.delegate([admin.account.address], { account: admin.account.address });
    await votingERC20.write.delegate([user1.account.address], { account: user1.account.address });
    await votingERC20.write.delegate([user2.account.address], { account: user2.account.address });

    // mine 1 block so info about delegations can be updated
    await networkHelpers.mine(2);

    const calldata = encodeFunctionData({
      abi: governance20.abi,
      functionName: "updateQuorumNumerator",
      args: [quorumPercentage + 1n],
    });

    const votesAdmin = await governance20.read.getVotes([
      admin.account.address,
      await networkHelpers.time.latestBlock() - 1,
    ]);
    console.log("Admin votes:", votesAdmin);

    const publicClient = await viem.getPublicClient();
    const eventDelegate = await publicClient.getContractEvents({
      abi: votingERC20.abi,
      address: votingERC20.address,
      eventName: "DelegateChanged",
      fromBlock: 0n,
      toBlock: "latest",
      args: {
        delegator: admin.account.address,
      },
    });

    console.log("Delegate event: ", eventDelegate);

    const proposal = await governance20.write.propose([
      [governance20.address],
      [0n],
      [
        calldata,
      ],
      "Increase quorum percentage by 1",
    ], {
      account: admin.account.address,
    });
    console.log("Proposal ID: ", proposal);

    await networkHelpers.mine(votingPeriod + voteExtension + 1);
    await governance20.write.castVote([
      proposal,
      1,
    ], { account: admin.account.address });

    await networkHelpers.time.increase(delay + 1);

    await governance20.write.execute([
      [governance20.address],
      [0n],
      [
        calldata,
      ],
      ethers.keccak256(ethers.toUtf8Bytes("Increase quorum percentage by 1")),
    ], { account: admin.account.address });
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
  //   const proposal = await governance20.write.propose([
  //     [],
  //     [],
  //     [],
  //     [ethers.toUtf8Bytes("Hello World")],
  //   ], {
  //     from: user1.account.address,
  //   });

  //   const votes1 = await governance20.read.getVotes([
  //     user1.account.address,
  //     await networkHelpers.time.latestBlock() - 1,
  //   ]);

  //   const votes2 = await governance20.read.getVotes([
  //     user2.account.address,
  //     await networkHelpers.time.latestBlock() - 1n,
  //   ]);
  //   const votes3 = await governance20.read.getVotes([
  //     admin.account.address,
  //     await networkHelpers.time.latestBlock() - 1n,
  //   ]);

  //   console.log("User1 votes:", votes1);
  //   console.log("User2 votes:", votes2);
  //   console.log("Admin votes:", votes3);

  // });
});
