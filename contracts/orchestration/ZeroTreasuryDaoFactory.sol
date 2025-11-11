// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Clones } from "@openzeppelin/contracts/proxy/Clones.sol";
import { Address } from "@openzeppelin/contracts/utils/Address.sol";

import { ZeroTreasuryRegistry } from "./ZeroTreasuryRegistry.sol";


/**
 * @title ZeroTreasuryDaoFactory
 * @notice Deploys DAO modules (Governor, Timelock, etc.) as minimal proxy clones from
 *         pre-deployed master copies stored in a separate Registry, and records the
 *         resulting deployment addresses per domain in that Registry.
 *
 * Design goals:
 * - Pull master copies by numeric module IDs from the Registry
 * - Deploy EIP-1167 minimal proxy clones deterministically per domain
 * - Initialize each clone with user-provided calldata (constructor-equivalent)
 * - Optionally deploy Governor with or without Timelock in one call
 * - Record each deployed module address back into the Registry under the same domain
 */
contract ZeroTreasuryDaoFactory {
    using Address for address;

    // --- Errors ---
    error ZeroAddress();
    error LengthMismatch();
    error MasterCopyNotSet(uint256 moduleId);

    // --- Events ---
    event ModuleCloned(bytes32 indexed domain, uint256 indexed moduleId, address indexed clone, bytes32 salt);

    // --- Storage ---
    ZeroTreasuryRegistry public immutable registry;

    /// Optional well-known module IDs for convenience (you can use any numbering in the Registry)
    /// These are recommendations – you can organize IDs off-chain as you prefer.
    uint256 public constant MODULE_GOVERNOR = 1;
    uint256 public constant MODULE_TIMELOCK = 2;

    constructor(address registryAddress) {
        if (registryAddress == address(0)) revert ZeroAddress();
        registry = ZeroTreasuryRegistry(registryAddress);
    }

    // --- Core helpers ---

    function getMasterCopy(uint256 moduleId) public view returns (address impl) {
        impl = registry.moduleCatalog(moduleId);
        if (impl == address(0)) revert MasterCopyNotSet(moduleId);
    }

    function _salt(bytes32 domain, uint256 moduleId, uint256 instanceId) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(domain, ":", moduleId, ":", bytes32(instanceId)));
    }

    function predictCloneAddress(
        uint256 moduleId,
        bytes32 domain,
        uint256 instanceId
    ) external view returns (address predicted) {
        address impl = getMasterCopy(moduleId);
        bytes32 salt_ = _salt(domain, moduleId, instanceId);
        return Clones.predictDeterministicAddress(impl, salt_, address(this));
    }

    /// Clone, initialize and record single module for a domain
    function deployModule(
        bytes32 domain,
        uint256 moduleId,
        bytes calldata initCalldata,
        uint256 instanceId
    ) public returns (address clone) {
        address impl = getMasterCopy(moduleId);
        bytes32 salt_ = _salt(domain, moduleId, instanceId);
        clone = Clones.cloneDeterministic(impl, salt_);

        if (initCalldata.length > 0) {
            Address.functionCall(clone, initCalldata);
        }

        // Record in Registry under specific instanceId (non-canonical by default)
        registry.recordDomainModuleInstance(domain, moduleId, instanceId, clone, "");

        emit ModuleCloned(domain, moduleId, clone, salt_);
    }

    /// Deploy multiple modules in one call (e.g., Governor + Timelock)
    function deployModules(
        bytes32 domain,
        uint256[] calldata moduleIds,
        bytes[] calldata initCalldatas,
        uint256[] calldata instanceIds
    ) external returns (address[] memory clones) {
        if (moduleIds.length != initCalldatas.length) revert LengthMismatch();
        if (moduleIds.length != instanceIds.length) revert LengthMismatch();
        clones = new address[](moduleIds.length);
        for (uint256 i = 0; i < moduleIds.length; i++) {
            clones[i] = deployModule(domain, moduleIds[i], initCalldatas[i], instanceIds[i]);
        }
    }

    // --- Opinionated convenience wrappers ---

    /// Deploy only a Governor preset
    function deployGovernor(
        bytes32 domain,
        bytes calldata governorInit,
        uint256 instanceId
    ) external returns (address governor) {
        governor = deployModule(domain, MODULE_GOVERNOR, governorInit, instanceId);
    }

    /// Deploy Governor + Timelock; initialization calldata should encode proper initialize selectors
    /// for each preset implementation.
    function deployGovernorWithTimelock(
        bytes32 domain,
        bytes calldata governorInit,
        bytes calldata timelockInit,
        bytes[] calldata postInitCalls, // optional additional wiring calls targeting deployed contracts
        address[] calldata postInitTargets, // must line up with postInitCalls
        uint256 instanceId
    ) external returns (address governor, address timelock) {
        if (postInitCalls.length != postInitTargets.length) revert LengthMismatch();
        // Use the same instanceId for both modules; salts differ via moduleId so no collision
        governor = deployModule(domain, MODULE_GOVERNOR, governorInit, instanceId);
        timelock = deployModule(domain, MODULE_TIMELOCK, timelockInit, instanceId);

        // Optional post-init wiring (e.g., set timelock as executor, grant roles, set proposer)
        for (uint256 i = 0; i < postInitTargets.length; i++) {
            address target = postInitTargets[i];
            bytes memory data = postInitCalls[i];
            Address.functionCall(target, data);
        }
    }
}
