import { expect } from "chai";
import { encodeFunctionData, keccak256, type Hex } from "viem";
import { setupViem, type Contract, type Wallet } from "./helpers/viem";

// Smoke flow using ONLY generic deployers:
// 1) Deploy Registry, Factory, ZDAOUpgradeable (governor) and TimelockUpgradeable master copies.
// 2) Register moduleIds for Governor (1) and Timelock (2).
// 3) User deploys a new DAO via generic deployModules (Timelock first, then ZDAO) for their domain.
// 4) Verify addresses, registry mappings, and emitted events.

describe("ZeroTreasuryDaoFactory smoke flow (generic deployModules with ZDAOUpgradeable + TimelockUpgradeable)", () => {
  let admin : Wallet;
  let user : Wallet;
  let viem : Awaited<ReturnType<typeof setupViem>>["viem"];

  let registry : Contract<"ZeroTreasuryRegistry">;
  let factory : Contract<"ZeroTreasuryDaoFactory">;
  let zdaoImpl : Contract<"ZDAOUpgradeable">;
  let timelockImpl : Contract<"TimelockUpgradeableMaster">;
  let token : Contract<"TestERC20Votes">;


  const MODULE_GOVERNOR = 1n;
  const MODULE_TIMELOCK = 2n;

  before(async () => {
    ({ viem, wallets: [admin, user] } = await setupViem());

    // Deploy Registry (admin gets ADMIN_ROLE and DEFAULT_ADMIN_ROLE per constructor)
    registry = await viem.deployContract("ZeroTreasuryRegistry", [admin.account.address, []]);

    // Deploy Factory
    factory = await viem.deployContract("ZeroTreasuryDaoFactory", [registry.address]);

    // Grant FACTORY_ROLE to the factory so it can record deployments
    const FACTORY_ROLE = await registry.read.FACTORY_ROLE();
    await registry.write.grantRole([FACTORY_ROLE, factory.address], { account: admin.account });

    // Deploy upgradeable master copies to be used by EIP-1167 clones
    zdaoImpl = await viem.deployContract("ZDAOUpgradeable");
    timelockImpl = await viem.deployContract("TimelockUpgradeableMaster");

    // Register moduleIds 1 and 2 in the catalog (admin-only)
    await registry.write.setModule([MODULE_GOVERNOR, zdaoImpl.address], { account: admin.account });
    await registry.write.setModule([MODULE_TIMELOCK, timelockImpl.address], { account: admin.account });

    // Voting token for governor
    token = await viem.deployContract("TestERC20Votes", ["Vote", "VOTE", 10n ** 24n]);
  });

  it("deploys Timelock + ZDAO using generic deployModules and records instances + emits events", async () => {
    const domain : Hex = keccak256("0xcommunity-domain");
    const instanceId = 1n; // non-canonical instance; canonical is instanceId=0 by convention

    // Predict clone addresses for timelock and governor using same instanceId
    const predictedTl = await factory.read.predictCloneAddress([MODULE_TIMELOCK, domain, instanceId]);
    const predictedGov = await factory.read.predictCloneAddress([MODULE_GOVERNOR, domain, instanceId]);

    // Build initializer calldatas
    const tlInit = encodeFunctionData({
      abi: timelockImpl.abi,
      functionName: "initializeTimelock",
      args: [
        1n,              // minDelay
        [] as Array<string>,  // proposers
        [] as Array<string>,  // executors
      ],
    });

    const govInit = encodeFunctionData({
      abi: zdaoImpl.abi,
      functionName: "initialize",
      args: [
        42n,                    // daoId
        "MyDAO",               // name
        token.address,          // IVotes token
        predictedTl,            // Timelock address (predicted clone)
        1n,                     // votingDelay (blocks)
        10n,                    // votingPeriod (blocks)
        0n,                     // proposalThreshold
        4n,                     // quorum %
        0n,                     // voteExtension
      ],
    });

    // Deploy with generic API (order: timelock then governor)
    const moduleIds = [MODULE_TIMELOCK, MODULE_GOVERNOR];
    const initPayload = [tlInit, govInit];
    const instanceIds = [instanceId, instanceId];

    await factory.write.deployModules([
      domain,
      moduleIds,
      initPayload,
      instanceIds,
    ], { account: user.account });

    // Read factory ModuleCloned events and map by moduleId
    const clonedEvents = await factory.getEvents.ModuleCloned();
    const lastTwo = clonedEvents.slice(-2).map(e => e.args);

    const tlClone = lastTwo.find(e => BigInt(e.moduleId) === MODULE_TIMELOCK)!.clone;
    const govClone = lastTwo.find(e => BigInt(e.moduleId) === MODULE_GOVERNOR)!.clone;

    expect(tlClone).to.equal(predictedTl);
    expect(govClone).to.equal(predictedGov);

    // Registry should have recorded instances (non-canonical)
    const recTl = await registry.read.getInstance([domain, MODULE_TIMELOCK, instanceId]);
    const recGov = await registry.read.getInstance([domain, MODULE_GOVERNOR, instanceId]);
    expect(recTl).to.equal(tlClone);
    expect(recGov).to.equal(govClone);

    // Canonical still zero (no flip in this smoke test)
    const canTl = await registry.read.getCanonical([domain, MODULE_TIMELOCK]);
    const canGov = await registry.read.getCanonical([domain, MODULE_GOVERNOR]);
    expect(canTl).to.equal("0x0000000000000000000000000000000000000000");
    expect(canGov).to.equal("0x0000000000000000000000000000000000000000");

    // Registry events
    const recEvents = await registry.getEvents.DomainModuleInstanceRecorded();
    const recLastTwo = recEvents.slice(-2).map(e => e.args);
    const set = new Set(recLastTwo.map(a => `${a.domain}-${a.moduleId}-${a.instanceId}-${a.deployed}-${a.isCanonical}`));
    expect(set.has(`${domain}-${MODULE_TIMELOCK}-${instanceId}-${tlClone}-false`)).to.equal(true);
    expect(set.has(`${domain}-${MODULE_GOVERNOR}-${instanceId}-${govClone}-false`)).to.equal(true);

    // Light sanity on governor initializer (reads)
    const govAsDeployed = await viem.getContractAt("ZDAOUpgradeable", govClone);
    const gotVotingPeriod = await govAsDeployed.read.votingPeriod();
    expect(gotVotingPeriod).to.equal(10n);
  });
});
