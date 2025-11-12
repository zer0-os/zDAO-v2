import hre from "hardhat";
import { ethers } from "ethers";
import { HardhatViemHelpers } from "@nomicfoundation/hardhat-viem/types";
import { encodeFunctionData, Hex, zeroAddress } from "viem";
import { type Contract, type Wallet } from "./helpers/viem";
import { NetworkHelpers } from "@nomicfoundation/hardhat-network-helpers/types";
import * as chai from "chai";
import { expect } from "chai";
import chaiAsPromised from "chai-as-promised";
import { DEFAULT_ADMIN_ROLE } from "../src/constants.js";

chai.use(chaiAsPromised);


describe("Deploy restrictions", () => {
  let viem : HardhatViemHelpers;
  let networkHelpers : NetworkHelpers;

  let admin : Wallet;

  let voting : Contract<"ZeroVotingERC20">;
  let timelock : Contract<"TimelockController">;

  let voting20Params : [
    string,
    string,
    string,
    string,
    Hex
  ];
  let timelockParams : [
    bigint,
    Array<Hex>,
    Array<Hex>,
    Hex
  ];
  let govParams : [
    bigint,
    string,
    Hex,
    Hex,
    number,
    number,
    bigint,
    bigint,
    number
  ];

  beforeEach(async () => {
    ({ viem, networkHelpers } = await hre.network.connect());
    [ admin ] = await viem.getWalletClients();

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

    voting = await viem.deployContract(
      "ZeroVotingERC20",
      voting20Params
    );

    timelock = await viem.deployContract(
      "TimelockController",
      timelockParams
    );

    govParams = [
      1n,
      "ZDAO",
      voting.address,
      timelock.address,
      1,
      10,
      ethers.parseUnits("10"),
      10n,
      5,
    ];

    // Give minter role to admin
    await voting.write.grantRole([
      await voting.read.MINTER_ROLE(),
      admin.account.address,
    ]);

    // Mint tokens to users
    await voting.write.mint([admin.account.address, ethers.parseUnits("10000000000")]);

    // Delegate tokens to themselves for voting power
    await voting.write.delegate([admin.account.address], { account: admin.account.address });
  });

  it("Should deploy Voting20 with DAO using viem with right params", async () => {
    const governance = await viem.deployContract(
      "ZDAO",
      govParams
    );

    expect(voting.address).to.exist;
    expect(await voting.read.name()).to.equal("ZeroVotingERC20");
    expect(await voting.read.symbol()).to.equal("ZV");

    expect(timelock).to.exist;
    expect(await timelock.read.getMinDelay()).to.equal(timelockParams[0]);
    expect(
      await timelock.read.hasRole([
        DEFAULT_ADMIN_ROLE,
        admin.account.address,
      ])
    ).to.equal(true);

    expect(governance).to.exist;
    expect(await governance.read.name()).to.equal(govParams[1]);
    expect(
      (await governance.read.token()).toLowerCase()
    ).to.equal(
      govParams[2].toLowerCase()
    );
    expect(
      (await governance.read.timelock()).toLowerCase()
    ).to.equal(
      govParams[3].toLowerCase()
    );
    expect(
      await governance.read.votingPeriod()
    ).to.equal(
      BigInt(govParams[5])
    );
    expect(
      await governance.read.proposalThreshold()
    ).to.equal(
      BigInt(govParams[6])
    );
  });

  it("Should have attached correct voting token and timelock", async () => {
    const governance = await viem.deployContract(
      "ZDAO",
      govParams
    );

    expect(
      (await governance.read.token()).toLowerCase()
    ).to.equal(
      voting.address.toLowerCase()
    );
    expect(
      (await governance.read.timelock()).toLowerCase()
    ).to.equal(
      timelock.address.toLowerCase()
    );
  });

  it("Should revert when deploying gov without voting token", async () => {
    await expect(
      viem.deployContract(
        "ZDAO",
        [
          1n,
          "ZDAO",
          zeroAddress, // no voting token
          "0x0000000000000000000000000000000000000002",
          1,
          10,
          ethers.parseUnits("10"),
          10n,
          5,
        ])
    ).to.be.rejectedWith("Transaction reverted");
  });

  it("Should let deploy gov without TimelockController", async () => {
    await expect(
      viem.deployContract(
        "ZDAO",
        [
          1n,
          "ZDAO",
          voting.address,
          zeroAddress,
          1,
          10,
          ethers.parseUnits("10"),
          10n,
          5,
        ]
      )).to.be.fulfilled;
  });

  it("Should revert when calling gov functions that require TimelockController when none is set", async () => {
    const governance = await viem.deployContract(
      "ZDAO",
      [
        1n,
        "ZDAO",
        voting.address,
        zeroAddress, // no timelock
        1,
        10,
        ethers.parseUnits("10"),
        10n,
        5,
      ]
    );

    const proposalDescription = "Mint 1 token to admin";
    const proposalDescriptionHash = ethers.keccak256(
      ethers.toUtf8Bytes(proposalDescription)
    ) as Hex;
    const calldata = encodeFunctionData({
      abi: voting.abi,
      functionName: "mint",
      args: [admin.account.address, ethers.parseUnits("1")],
    });

    await governance.write.propose(
      [
        [ voting.address ],
        [ 0n ],
        [ calldata],
        proposalDescription,
      ],
      {
        account: admin.account.address,
      }
    );

    await networkHelpers.mine(2);

    await governance.write.castVote(
      [
        await governance.read.getProposalId(
          [
            [ voting.address ],
            [ 0n ],
            [ calldata ],
            proposalDescriptionHash,
          ]
        ),
        1,
      ],
      { account: admin.account.address,
      }
    );

    await networkHelpers.mine(11);

    await expect(
      governance.write.queue(
        [
          [ voting.address ],
          [ 0n ],
          [ calldata ],
          proposalDescriptionHash,
        ], {
          account: admin.account.address,
        }
      )
    ).to.be.rejectedWith("Transaction reverted: function returned an unexpected amount of data");
  });
});

describe("ZDAO main features flow test", () => {
  let viem : HardhatViemHelpers;
  let networkHelpers : NetworkHelpers;

  let admin : Wallet;
  let user1 : Wallet;
  let user2 : Wallet;
  let empty : Wallet;

  let voting20Params : [
    string,
    string,
    string,
    string,
    Hex
  ];

  let timelockParams : [
    bigint,
    Array<Hex>,
    Array<Hex>,
    Hex
  ];

  const delay = 1;
  const votingPeriod = 10;
  const proposalThreshold20 = ethers.parseUnits("10");
  const quorumPercentage = 10n;
  const voteExtension = 5;

  let govParams : [
    bigint,
    string,
    Hex,
    Hex,
    number,
    number,
    bigint,
    bigint,
    number
  ];

  const initialAdminBalance = ethers.parseUnits("100000000000");
  const initialUser1Balance = ethers.parseUnits("1000");
  const initialUser2Balance = ethers.parseUnits("200");

  let votingERC20 : Contract<"ZeroVotingERC20">;
  let timelock : Contract<"TimelockController">;
  let governance20 : Contract<"ZDAO">;

  // eslint-disable-next-line prefer-arrow/prefer-arrow-functions
  async function fixture () {
    ({ viem, networkHelpers } = await hre.network.connect());
    [ admin, user1, user2, empty ] = await viem.getWalletClients();

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

    // mine 2 blocks so info about delegations can be updated
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

  it("Should #updateQuorumNumerator using governon voting process", async () => {
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
    ) as Hex;

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
    ) as Hex;

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

  it("Should fail when #propose with insufficient votes", async () => {
    expect(
      Number(await governance20.read.getVotes([
        empty.account.address,
        BigInt(await networkHelpers.time.latestBlock() - 1),
      ]))
    ).to.be.lessThan(
      Number(await governance20.read.proposalThreshold())
    );

    const calldata = encodeFunctionData({
      abi: votingERC20.abi,
      functionName: "mint",
      args: [empty.account.address, ethers.parseUnits("1")],
    });

    const proposalDescription = "Mint 1 token to `empty` wallet";

    await expect(
      governance20.write.propose([
        [ votingERC20.address ],
        [ 0n ],
        [ calldata ],
        proposalDescription,
      ], {
        account: empty.account.address,
      })
    ).to.be.rejectedWith("GovernorInsufficientProposerVotes");
  });

  it("Should have correct proposal state transitions", async () => {
    const calldata = encodeFunctionData({
      abi: votingERC20.abi,
      functionName: "mint",
      args: [user1.account.address, ethers.parseUnits("1")],
    });

    const proposalDescription = "Mint 1 token to user1";
    const proposalDescriptionHash = ethers.keccak256(
      ethers.toUtf8Bytes(proposalDescription)
    ) as Hex;

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
    expect(
      await governance20.read.state([proposalId])
    ).to.equal(0); // Pending

    await networkHelpers.mine(delay + 1);

    expect(
      await governance20.read.state([proposalId])
    ).to.equal(1); // Active

    await governance20.write.castVote([
      proposalId,
      1,
    ], {
      account: admin.account.address,
    });

    await networkHelpers.mine(votingPeriod + 1);

    expect(
      await governance20.read.state([proposalId])
    ).to.equal(4); // Succeeded

    await governance20.write.queue([
      [ votingERC20.address ],
      [ 0n ],
      [ calldata ],
      proposalDescriptionHash,
    ], {
      account: admin.account.address,
    });

    expect(
      await governance20.read.state([proposalId])
    ).to.equal(5); // Queued

    await networkHelpers.time.increase(delay + 1);

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

    expect(
      await governance20.read.state([proposalId])
    ).to.equal(7); // Executed
  });

  it("Should allow to cancel proposal", async () => {
    const calldata = encodeFunctionData({
      abi: votingERC20.abi,
      functionName: "mint",
      args: [user1.account.address, ethers.parseUnits("1")],
    });

    const proposalDescription = "Mint 1 token to user1";
    const proposalDescriptionHash = ethers.keccak256(
      ethers.toUtf8Bytes(proposalDescription)
    ) as Hex;

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

    await governance20.write.cancel([
      [ votingERC20.address ],
      [ 0n ],
      [ calldata ],
      proposalDescriptionHash,
    ], {
      account: admin.account.address,
    });

    expect(
      await governance20.read.state([proposalId])
    ).to.equal(2); // Canceled
  });
});

