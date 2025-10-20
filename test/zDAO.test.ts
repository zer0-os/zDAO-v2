import hre from "hardhat";
import { expect } from "chai";
import { ethers } from "ethers";
import { ZeroVotingERC20 } from "../types/ethers-contracts/voting/ZVoting20.sol/ZeroVotingERC20.js";
import { ZDAO } from "../types/ethers-contracts/ZDAO.js";


let admin;
let user1;
let user2;

let votingERC20 : ZeroVotingERC20;
let governance20 : ZDAO;

const delay = 1;
const votingPeriod = 10;
const proposalThreshold20 = ethers.parseUnits("100");
const proposalThreshold721 = 1;
const quorumPercentage = 10n;
const voteExtension = 5;

describe("ZDAO", () => {
  const fixture = async () => {
    const { viem, networkHelpers } = await hre.network.connect();
    [ admin, user1, user2 ] = await viem.getWalletClients();
  };

  it("should deploy Voting20 with DAO using viem", async () => {
    const {
      viem,
      // networkHelpers
    } = await hre.network.connect();

    // networkHelpers.loadFixture(fixture);
    await fixture();

    const voting20Params = [
      "ZeroVotingERC20",
      "ZV",
      "ZERO DAO",
      "1",
      admin.account.address
    ]

    const votingERC20 = await viem.deployContract(
      "ZeroVotingERC20",
      [
        "ZeroVotingERC20",
        "ZV",
        "ZERO DAO",
        "1",
        admin.account.address
      ]
    );
    expect(votingERC20).to.exist;
    expect(votingERC20.address).to.exist;

    // const timelock = await viem.deployContract(
    //   "TimelockController",
    //   [
    //     1,
    //     [],
    //     [],
    //     admin.account.address
    //   ]
    // );
    // expect(timelock).to.exist;

  //   const governance20 = await viem.deployContract(
  //     "ZDAO",
  //     [
  //       1n,
  //       "ZDAO",
  //       votingERC20.address,
  //       timelock.address,
  //       delay,
  //       votingPeriod,
  //       proposalThreshold20,
  //       quorumPercentage,
  //       voteExtension,
  //     ]);
  //   expect(governance20).to.exist;
  });
});

// const { viem } = await network.connect();
// votingERC20 = await viem.deployContract(
//   "ZeroVotingERC20",
//   [
//     "ZV",
//     "domname",
//     "ZERO DAO",
//     "1",
//     "0x1234567890123456789012345678901234567890"
//   ]
// );

// describe("ZDAO", () => {
//   let dao;

//   it("load fixture", async () => {
//     const { viem } = await network.connect();
//     votingERC20 = await viem.deployContract("ZeroVotingERC20");

//     expect(votingERC20).to.exist;
//     expect(votingERC20).to.not.be.undefined;
//   });


//   // beforeEach(async function () {
    
//   //   const voting20 = await viem.deployContract("ZeroVotingERC20");
//   //   // const voting20 = await viem.deployContract("ZeroVotingERC20");
//   //   const token = await voting20.deploy(
//   //     "ZeroVotingERC20",
//   //     "ZV",
//   //     "ZERO DAO",
//   //     "1",
//   //     (await ethers.getSigners())[0]
//   //   );
//   //   await token.waitForDeployment();

//   //   const ZDAO = await ethers.getContractFactory("ZDAO");
//   //   dao = await ZDAO.deploy(
//   //     1n,
//   //     "ZDAO",
//   //     token,
//   //     delay,
//   //     votingPeriod,
//   //     proposalThreshold20,
//   //     quorumPercentage,
//   //     voteExtension,
//   //   );
//   //   await dao.waitForDeployment();
//   // });
// });