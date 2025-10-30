import { type HardhatViemHelpers, type PublicClient } from "@nomicfoundation/hardhat-viem/types";
import { type Address, type Hex, isAddress, keccak256, parseEther } from "viem";
import { type Contract, setupViem, type Wallet } from "./helpers/viem";
import Safe, {
  type ContractNetworksConfig,
} from "@safe-global/protocol-kit";
import { expect } from "chai";


describe.only("ZeroTreasuryHub Smoke Tests", () => {
  let viem : HardhatViemHelpers;

  let contractNetworks : ContractNetworksConfig;

  let publicClient : PublicClient;
  let admin : Wallet;
  let user1 : Wallet;
  let user2 : Wallet;
  let user3 : Wallet;

  let hub : Contract<"ZeroTreasuryHub">;
  let safeSingleton : Contract<"SafeL2">;
  let proxyFactory : Contract<"SafeProxyFactory">;
  let fallbackHandler : Contract<"CompatibilityFallbackHandler">;

  let safeAddress : Address;
  let domain : Hex;

  before(async () => {
    ({ viem, wallets: [ admin, user1, user2, user3 ] } = await setupViem());

    // Deploy the Safe singleton (use 'Safe' instead for L1-style)
    safeSingleton = await viem.deployContract("SafeL2");

    // Proxy Factory
    proxyFactory = await viem.deployContract("SafeProxyFactory");

    // Libs & handler frequently used by Protocol Kit
    const multiSend = await viem.deployContract("MultiSend");
    const multiSendCallOnly = await viem.deployContract("MultiSendCallOnly");
    const signMessageLib = await viem.deployContract("SignMessageLib");
    const createCall = await viem.deployContract("CreateCall");
    fallbackHandler = await viem.deployContract("CompatibilityFallbackHandler");

    publicClient = await viem.getPublicClient();
    const chainId = await publicClient.getChainId();

    contractNetworks = {
      [chainId.toString()]: {
        safeSingletonAddress: safeSingleton.address,          // your SafeL2
        safeProxyFactoryAddress: proxyFactory.address,
        fallbackHandlerAddress: fallbackHandler.address,
        multiSendAddress: multiSend.address,
        multiSendCallOnlyAddress: multiSendCallOnly.address,
        signMessageLibAddress: signMessageLib.address,
        createCallAddress: createCall.address,
      },
    };

    // Deploy the Hub
    hub = await viem.deployContract(
      "ZeroTreasuryHub",
      [
        safeSingleton.address,
        proxyFactory.address,
        fallbackHandler.address,
      ]);
  });

  it("should deploy Safe from the Hub and save to Hub storage", async () => {
    const domainHash = keccak256("0xmydomain");

    await hub.write.createSafe([
      domainHash,
      [user2.account.address, user3.account.address],
      2n,
      "main",
    ]);

    const { args } = (await hub.getEvents.SafeTreasuryInstanceCreated())[0];
    ({ domain, safeAddress } = args);
    const { owners, threshold } = args;

    expect(domain).to.be.eq(domainHash);
    // TODO proto: make a create2 and salt helper to validate deterministic safe addresses
    expect(isAddress(safeAddress)).to.be.true;
    expect(owners?.map(e => e.toLowerCase())).to.have.members([user2.account.address, user3.account.address]);
    expect(threshold).to.be.eq(2n);

    const [ safeFromMap ] = await hub.read.treasuries([domainHash]);
    expect(safeFromMap).to.be.eq(safeAddress);
  });

  it("created safe should support on-chain transaction signing and executions", async () => {
    const kitUser3 = await Safe.init({
      provider: publicClient.transport,
      signer: user3.account.address,
      safeAddress,
      contractNetworks,
    });

    // fund the safe
    await user3.sendTransaction({
      to: safeAddress ,
      value: parseEther("1"),
      account: user3.account,
      chain: publicClient.chain,
    });

    const safeBalBefore  = await publicClient.getBalance({ address: safeAddress });
    const user2BalBefore = await publicClient.getBalance({ address: user2.account.address });
    const user3BalBefore = await publicClient.getBalance({ address: user3.account.address });

    const amountToSend = parseEther("0.53");
    const txData = await kitUser3.createTransaction({
      transactions: [{
        to: user2.account.address ,
        value: amountToSend.toString(),
        data: "0x",
      }],
    });

    const txHash = await kitUser3.getTransactionHash(txData);

    const sig1 = await kitUser3.signHash(txHash);
    // make instance for user2 and sign
    const kitUser2 = await kitUser3.connect({ signer: user2.account.address });
    // TODO proto: need to check on-chain signatures as well
    const sig2 = await kitUser2.signHash(txHash);

    // add sigs
    txData.addSignature(sig1);
    txData.addSignature(sig2);

    const { hash } = await kitUser2.executeTransaction(txData);
    expect(hash).to.not.be.undefined;

    const {
      gasUsed,
      effectiveGasPrice,
    } = await publicClient.waitForTransactionReceipt({ hash: hash as Hex });
    const gasCost = gasUsed * effectiveGasPrice;

    const safeBalAfter  = await publicClient.getBalance({ address: safeAddress });
    const user2BalAfter = await publicClient.getBalance({ address: user2.account.address });
    const user3BalAfter = await publicClient.getBalance({ address: user3.account.address });

    expect(safeBalAfter).to.equal(safeBalBefore - amountToSend);
    expect(user2BalAfter).to.equal(user2BalBefore + amountToSend - gasCost);
    expect(user3BalAfter).to.equal(user3BalBefore);
  });
});
