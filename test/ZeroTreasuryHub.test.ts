import { type HardhatViemHelpers } from "@nomicfoundation/hardhat-viem/types";
import { keccak256 } from "viem";
import { type Contract, setupViem, type Wallet } from "./helpers/viem";


describe("ZeroTreasuryHub Smoke Tests", () => {
  let viem : HardhatViemHelpers;

  let admin : Wallet;
  let user1 : Wallet;
  let user2 : Wallet;
  let user3 : Wallet;

  // TODO proto: is this really the best way ?!
  let theHub : Contract<"ZeroTreasuryHub">;
  let safeSingleton : Contract<"SafeL2">;
  let proxyFactory : Contract<"SafeProxyFactory">;
  let fallbackHandler : Contract<"CompatibilityFallbackHandler">;

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

    // Deploy the Hub
    theHub = await viem.deployContract(
      "ZeroTreasuryHub",
      [
        safeSingleton.address,
        proxyFactory.address,
        fallbackHandler.address,
      ]);
  });

  it("should deploy Safe from the hub", async () => {
    await theHub.write.createSafe([
      keccak256("0xmydomain"),
      [user2.account.address, user3.account.address],
      1n,
      "main",
    ]);

    const {
      args: {
        domain,
        safe,
      },
    } = (await theHub.getEvents.SafeTreasuryInstanceCreated())[0];

    console.log(`Domain: ${domain}. Safe ${safe}`);
  });
});
