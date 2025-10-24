import hre from "hardhat";
import { expect } from "chai";
import { WalletClient, keccak256, toHex, encodeFunctionData } from "viem";
import type { HardhatViemHelpers } from "@nomicfoundation/hardhat-viem/types";
import { NetworkConnection } from "hardhat/types/network"

import { 
  DEFAULT_DELAY, 
  DEFAULT_PROPOSAL_THRESHOLD_20, 
  DEFAULT_QUORUM_PERCENTAGE, 
  DEFAULT_VOTE_EXTENSION, 
  DEFAULT_VOTING_PERIOD 
} from "./helpers/constants.js"

describe("OZGovernorModule", async () => {
  let admin: WalletClient;
  let userA: WalletClient;
  let userB: WalletClient;

  let viem: HardhatViemHelpers;
  let networkHelpers: any;

  let avatar: any; // TestAvatar
  let multisend: any; // MultiSend from Gnosis Safe
  let votingToken: any; // ZeroVotingERC20
  let governorModule: any; // OZGovernorModule

  before(async () => {
    const connection = await hre.network.connect();

    viem = connection.viem;
    networkHelpers = connection.networkHelpers;

    // Deploy new environment
    ({
      avatar,
      multisend,
      votingToken,
      governorModule
    } = await networkHelpers.loadFixture(deploymentFixture));
  });

  // Fixture for init contract deployment
  async function deploymentFixture(): Promise<any> {
    const [admin, userA, userB] = await viem.getWalletClients();

    // Deploy TestAvatar (acts as the Safe/Avatar)
    const avatar = await viem.deployContract("TestAvatar", []);

    // Deploy MultiSend contract from Gnosis Safe
    const multisend = await viem.deployContract(
      "TestSafe",
      []
    );

    // Deploy voting token
    const votingToken = await viem.deployContract(
      "ZeroVotingERC20",
      [
        "Zero Voting Token",
        "ZVT",
        "OZ Governor Module",
        "1",
        admin.account!.address
      ]
    );

    // Deploy OZGovernorModule with all required parameters
    // TODO does viem handle encoding here?
    const governorModule = await viem.deployContract(
      "OZGovernorModule",
      [
        admin.account!.address,         // _owner
        avatar.address,                 // _target (avatar address)
        multisend.address,              // _multisend
        votingToken.address,            // _token
        "OZ Governor Module",           // _name
        BigInt(DEFAULT_DELAY),          // _votingDelay
        BigInt(DEFAULT_VOTING_PERIOD),  // _votingPeriod
        DEFAULT_PROPOSAL_THRESHOLD_20,  // _proposalThreshold
        DEFAULT_QUORUM_PERCENTAGE,      // _quorum
        BigInt(DEFAULT_VOTE_EXTENSION)  // _initialVoteExtension
      ]
    );

    // Enable the module on the avatar
    await avatar.write.enableModule([governorModule.address]);

    return {
      avatar,
      multisend,
      votingToken,
      governorModule,
      accounts: [admin, userA, userB]
    };
  }

  describe("Deployment", () => {
    it("should have correct owner", async () => {
      const [admin] = await viem.getWalletClients();
      const owner = await governorModule.read.owner();
      expect(owner.toLowerCase()).to.equal(admin.account!.address.toLowerCase());
    });

    it("should have correct target", async () => {
      const target = await governorModule.read.target();
      expect(target.toLowerCase()).to.equal(avatar.address.toLowerCase());
    });

    it("should have correct multisend", async () => {
      const multisendAddr = await governorModule.read.multisend();
      expect(multisendAddr.toLowerCase()).to.equal(multisend.address.toLowerCase());
    });

    it("should have correct name", async () => {
      const name = await governorModule.read.name();
      expect(name).to.equal("OZ Governor Module");
    });

    it("should have correct voting delay", async () => {
      const votingDelay = await governorModule.read.votingDelay();
      expect(votingDelay).to.equal(BigInt(DEFAULT_DELAY));
    });

    it("should have correct voting period", async () => {
      const votingPeriod = await governorModule.read.votingPeriod();
      expect(votingPeriod).to.equal(BigInt(DEFAULT_VOTING_PERIOD));
    });

    it("should have correct proposal threshold", async () => {
      const proposalThreshold = await governorModule.read.proposalThreshold();
      expect(proposalThreshold).to.equal(DEFAULT_PROPOSAL_THRESHOLD_20);
    });

    it("should have correct quorum", async () => {
      // Quorum is expressed as a fraction of total supply
      const quorumNumerator = await governorModule.read.quorumNumerator();
      expect(quorumNumerator).to.equal(DEFAULT_QUORUM_PERCENTAGE);
    });
  });

  describe("Module Integration", () => {
    it("should be enabled as a module on the avatar", async () => {
      const isEnabled = await avatar.read.isModuleEnabled([governorModule.address]);
      expect(isEnabled).to.be.true;
    });

    it("should have avatar as the module's target", async () => {
      const target = await governorModule.read.target();
      expect(target.toLowerCase()).to.equal(avatar.address.toLowerCase());
    });
  });

  describe("Token Integration", () => {
    it("should use the correct voting token", async () => {
      const tokenAddress = await governorModule.read.token();
      expect(tokenAddress.toLowerCase()).to.equal(votingToken.address.toLowerCase());
    });

    it("should allow token holders to delegate", async () => {
      const [admin] = await viem.getWalletClients();
      
      // Admin should have tokens from initial mint
      const balance = await votingToken.read.balanceOf([admin.account!.address]);
      expect(Number(balance)).to.be.greaterThan(0);

      // Delegate to self
      await votingToken.write.delegate([admin.account!.address], {
        account: admin.account!
      });

      // Check voting power
      const votes = await votingToken.read.getVotes([admin.account!.address]);
      expect(votes).to.equal(balance);
    });
  });

  describe("Governance Functions", () => {
    it("should return correct clock mode", async () => {
      const clockMode = await governorModule.read.CLOCK_MODE();
      expect(clockMode).to.include("mode=blocknumber");
    });

    it("should return current clock value", async () => {
      const clock = await governorModule.read.clock();
      expect(Number(clock)).to.be.greaterThan(0);
    });

    it("should calculate quorum correctly", async () => {
      const publicClient = await viem.getPublicClient();
      const currentBlock = await publicClient.getBlockNumber();
      const quorum = await governorModule.read.quorum([currentBlock]);
      expect(Number(quorum)).to.be.greaterThan(0);
    });
  });

  describe("Proposal Lifecycle", () => {
    it("should allow creating a proposal with sufficient tokens", async () => {
      const [admin] = await viem.getWalletClients();
      
      // First mint enough tokens and delegate
      await votingToken.write.mint([admin.account!.address, DEFAULT_PROPOSAL_THRESHOLD_20], {
        account: admin.account!
      });
      
      await votingToken.write.delegate([admin.account!.address], {
        account: admin.account!
      });

      // Mine a block to ensure delegation is recorded
      await networkHelpers.mine(1);

      // Create a simple proposal - call a simple function
      const targets = [votingToken.address];
      const values = [0n];
      
      // Encode the calldata for the name() function
      const nameCalldata = encodeFunctionData({
        abi: [{
          name: 'name',
          type: 'function',
          stateMutability: 'view',
          inputs: [],
          outputs: [{ type: 'string' }]
        }],
        functionName: 'name',
        args: []
      });
      
      const calldatas = [nameCalldata];
      const description = "Test Proposal";

      // Hash the description for the proposal ID
      const descriptionHash = keccak256(toHex(description));

      const proposalId = await governorModule.read.hashProposal([
        targets,
        values,
        calldatas,
        descriptionHash
      ]);

      await governorModule.write.propose([targets, values, calldatas, description], {
        account: admin.account!
      });

      // Check proposal state
      const state = await governorModule.read.state([proposalId]);
      expect(state).to.equal(0n); // Pending state
    });
  });
});
