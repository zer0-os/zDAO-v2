import hre from "hardhat";
import { expect } from "chai";
import { ethers } from "ethers";
import { DEFAULT_ADMIN_ROLE } from "../src/constants.js";
import { HardhatViemHelpers } from "@nomicfoundation/hardhat-viem/types";
import { encodeFunctionData } from "viem";
import { type Contract, type Wallet } from "./helpers/viem";
import { NetworkHelpers } from "@nomicfoundation/hardhat-network-helpers/types";


describe("ZDAO main features flow test", () => {
  let viem : HardhatViemHelpers;
  let networkHelpers : NetworkHelpers;

  let admin : Wallet;
  let user1 : Wallet;
  let user2 : Wallet;

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

  const initialAdminBalance = ethers.parseUnits("100000000000000");
  const initialUser1Balance = ethers.parseUnits("1000");
  const initialUser2Balance = ethers.parseUnits("200");

  const votingTokenName = "MockZeroVotingERC20";

  let votingERC20 : Contract<"MockZeroVotingERC20">;
  let timelock : Contract<"TimelockController">;
  let governance20 : Contract<"ZDAO">;

  // eslint-disable-next-line prefer-arrow/prefer-arrow-functions
  async function fixture () {
    ({ viem, networkHelpers } = await hre.network.connect());
    [ admin, user1, user2 ] = await viem.getWalletClients();

    voting20Params = [
      votingTokenName,
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
      votingTokenName,
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

    return ({
      votingERC20,
      timelock,
      governance20,
    });
  }

  beforeEach(async () => {
    ({ viem, networkHelpers } = await hre.network.connect());
    ({
      votingERC20,
      timelock,
      governance20,
    } = await networkHelpers.loadFixture(fixture));
  });

  it("should have Voting20 deployed with DAO using viem", async () => {
    expect(votingERC20.address).to.exist;
    expect(await votingERC20.read.name()).to.equal(votingTokenName);
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

  it("Should create," +
    "vote for UPDATE QUORUM," +
    "queue," +
    "execute a proposal successfully" +
    "and have changed quorum", async () => {

    const currentQuorumNumerator = await governance20.read.quorumNumerator();
    const newQuorumNumerator = currentQuorumNumerator + 1n;

    const calldata = encodeFunctionData({
      abi: governance20.abi,
      functionName: "updateQuorumNumerator",
      args: [newQuorumNumerator],
    });

    const proposalDescription = "Increase quorum percentage by 1";
    const proposalDescriptionHash = ethers.keccak256(
      ethers.toUtf8Bytes(proposalDescription)
    ) as `0x${string}`;     // TODO: Is typing OK?

    await governance20.write.propose([
      [ governance20.address ],
      [ 0n ],
      [ calldata ],
      proposalDescription,
    ], {
      account: admin.account.address,
    });

    const proposalId = await governance20.read.getProposalId([
      [ governance20.address ],
      [ 0n ],
      [ calldata ],
      proposalDescriptionHash,
    ]);

    await networkHelpers.mine(delay + 1);

    await governance20.write.castVote([
      proposalId,
      1,
    ], {
      account: admin.account.address,
    });

    await networkHelpers.mine(votingPeriod + 1);

    await governance20.write.queue([
      [ governance20.address ],
      [ 0n ],
      [ calldata ],
      proposalDescriptionHash,
    ], {
      account: admin.account.address,
    });

    await governance20.write.execute([
      [governance20.address],
      [0n],
      [
        calldata,
      ],
      proposalDescriptionHash,
    ], {
      account: admin.account.address,
    });

    expect(
      await governance20.read.quorumNumerator()
    ).to.equal(
      newQuorumNumerator
    );
  });

  it("Delegates may vote on behalf of multiple token holders", async () => {
    const user1InitialBalance = await votingERC20.read.balanceOf([user1.account.address]);
    const user2InitialBalance = await votingERC20.read.balanceOf([user2.account.address]);
    const adminInitialBalance = await votingERC20.read.balanceOf([admin.account.address]);

    // user2 delegates to user1
    await votingERC20.write.delegate([user1.account.address], {
      account: user2.account.address,
    });
    // admin delegates to user1
    await votingERC20.write.delegate([user1.account.address], {
      account: admin.account.address,
    });
    // mine 1 block so info about delegations can be updated
    await networkHelpers.mine(2);

    const calldata = encodeFunctionData({
      abi: votingERC20.abi,
      functionName: "mint",
      args: [user1.account.address, ethers.parseUnits("1")],
    });
    const proposalDescription = "Mint 1 token to user1";
    const proposalDescriptionHash = ethers.keccak256(
      ethers.toUtf8Bytes(proposalDescription)
    ) as `0x${string}`;     // TODO: Is typing OK?

    await governance20.write.propose([
      [ votingERC20.address ],
      [ 0n ],
      [ calldata ],
      proposalDescription,
    ], {
      account: user1.account.address,
    });

    const proposalId = await governance20.read.getProposalId([
      [ votingERC20.address ],
      [ 0n ],
      [ calldata ],
      proposalDescriptionHash,
    ]);

    await networkHelpers.mine(delay + 1);

    await governance20.write.castVote([
      proposalId,
      1,
    ], {
      account: user1.account.address,
    });

    await networkHelpers.mine(votingPeriod + 1);

    const currentVotes = await governance20.read.getVotes([
      user1.account.address,
      BigInt(await networkHelpers.time.latestBlock() - 1),
    ], {
      account: user1.account.address,
    });

    expect(currentVotes).to.equal(
      user1InitialBalance +
      user2InitialBalance +
      adminInitialBalance
    );
  });

  it("Should succesfully create and execute generic proposal by PASSING READ FUNCTION to the calldata", async () => {
    const calldata = encodeFunctionData({
      abi: governance20.abi,
      functionName: "votingDelay",
      args: [],
    });

    const proposalDescription = "Shell we use generic proposals?";
    const proposalDescriptionHash = ethers.keccak256(
      ethers.toUtf8Bytes(proposalDescription)
    ) as `0x${string}`;     // TODO: Is typing OK?

    await governance20.write.propose([
      [ governance20.address ],
      [ 0n ],
      [ calldata ],
      proposalDescription,
    ], {
      account: admin.account.address,
    });

    const proposalId = await governance20.read.getProposalId([
      [ governance20.address ],
      [ 0n ],
      [ calldata ],
      proposalDescriptionHash,
    ]);

    await networkHelpers.mine(delay + 1);

    await governance20.write.castVote([
      proposalId,
      1,
    ], {
      account: admin.account.address,
    });

    await networkHelpers.mine(votingPeriod + 1);

    await governance20.write.queue([
      [ governance20.address ],
      [ 0n ],
      [ calldata ],
      proposalDescriptionHash,
    ], {
      account: admin.account.address,
    });

    await governance20.write.execute([
      [governance20.address],
      [0n],
      [
        calldata,
      ],
      proposalDescriptionHash,
    ], {
      account: admin.account.address,
    });
  });

  it.skip("Should successfully execute a proposal to transfer tokens to user1", async () => {
    const transferAmount = ethers.parseUnits("50");
    const calldata = encodeFunctionData({
      abi: votingERC20.abi,
      functionName: "transfer",
      args: [user1.account.address, transferAmount],
    });

    const proposalDescription = "Transfer 50 tokens to user1";
    const proposalDescriptionHash = ethers.keccak256(
      ethers.toUtf8Bytes(proposalDescription)
    ) as `0x${string}`;     // TODO: Is typing OK?

    const user1InitialBalance = await votingERC20.read.balanceOf([user1.account.address]);

    await governance20.write.propose([
      [ votingERC20.address ],
      [ 0n ],
      [ calldata ],
      proposalDescription,
    ], {
      account: admin.account.address,
    });

    const proposalId = await governance20.read.getProposalId([
      [ votingERC20.address ],
      [ 0n ],
      [ calldata ],
      proposalDescriptionHash,
    ]);

    await networkHelpers.mine(delay + 1);

    await governance20.write.castVote([
      proposalId,
      1,
    ], {
      account: admin.account.address,
    });

    await networkHelpers.mine(votingPeriod + 1);

    await governance20.write.queue([
      [ votingERC20.address ],
      [ 0n ],
      [ calldata ],
      proposalDescriptionHash,
    ], {
      account: admin.account.address,
    });

    console.log("Admin: ", await votingERC20.read.balanceOf([admin.account.address]));
    console.log("User1: ", await votingERC20.read.balanceOf([user1.account.address]));
    console.log("Gover: ", await votingERC20.read.balanceOf([governance20.address]));
    console.log("Admin address: ", admin.account.address);
    console.log("User1 address: ", user1.account.address);
    console.log("Gover address: ", governance20.address);

    await governance20.write.execute([
      [votingERC20.address],
      [0n],
      [
        calldata,
      ],
      proposalDescriptionHash,
    ], {
      account: admin.account.address,
    });

    const user1FinalBalance = await votingERC20.read.balanceOf([user1.account.address]);

    expect(user1FinalBalance).to.equal(
      user1InitialBalance + transferAmount
    );
  });
});
