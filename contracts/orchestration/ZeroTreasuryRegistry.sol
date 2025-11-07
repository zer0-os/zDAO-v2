// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title ZeroTreasuryRegistry
 * @notice Registry that stores master copy addresses for modules (by numeric IDs)
 *         and tracks, per domain, which module clone was deployed.
 * @dev Module IDs are uint256 to keep it simple and upgradable off-chain. You can
 *      version presets by encoding namespace + version into the number in your app tooling.
 */
contract ZeroTreasuryRegistry is AccessControl {
    // --- Events ---
    event ModuleCatalogSet(uint256 indexed moduleId, address indexed masterCopy);
    event DomainModuleRecorded(bytes32 indexed domain, uint256 indexed moduleId, address indexed deployed);

    // --- Errors ---
    error ZeroAddress();
    error LengthMismatch();
    error AccessDenied();
    error ModuleAlreadyExists();

    // --- Roles ---
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant FACTORY_ROLE = keccak256("FACTORY_ROLE");

    // --- Storage ---
    // Catalog of module master copies (implementation contracts)
    mapping(uint256 moduleId => address masterCopy) public moduleCatalog;

    // Domain -> ModuleId -> Deployed clone address
    mapping(bytes32 domainHash => mapping(uint256 moduleId => address deployed)) public treasuries;

    constructor(address governor, address[] admins) {
        if (governor == address(0)) revert ZeroAddress();
        _grantRole(ADMIN_ROLE, governor);
        // Grant a break-glass role for recovery/rotation via DEFAULT_ADMIN_ROLE
        // This role can be revoked later if needed.
        _grantRole(DEFAULT_ADMIN_ROLE, governor);
        _setRoleAdmin(FACTORY_ROLE, ADMIN_ROLE);
        // Allow ADMIN_ROLE to self-administer for routine rotations
        _setRoleAdmin(ADMIN_ROLE, ADMIN_ROLE);
    }

    // --- Catalog management ---

    function setModule(uint256 moduleId, address masterCopy) external onlyRole(ADMIN_ROLE) {
        _setModule(moduleId, masterCopy);
    }

    function setModules(uint256[] calldata moduleIds, address[] calldata masterCopies) external onlyRole(ADMIN_ROLE) {
        if (moduleIds.length != masterCopies.length) revert LengthMismatch();
        for (uint256 i = 0; i < moduleIds.length; i++) {
            _setModule(moduleIds[i], masterCopies[i]);
        }
    }

    function _setModule(uint256 moduleId, address masterCopy) internal {
        if (masterCopy == address(0)) revert ZeroAddress();
        if (moduleCatalog[moduleId] != address(0)) revert ModuleAlreadyExists(moduleId);

        moduleCatalog[moduleId] = masterCopy;

        emit ModuleCatalogSet(moduleId, masterCopy);
    }

    // --- Recording deployments ---

    function recordDomainModule(bytes32 domain, uint256 moduleId, address deployed) external {
        // In the default model, the Factory (or multiple factories) will have FACTORY_ROLE, admins also allowed.
        if (!hasRole(FACTORY_ROLE, msg.sender) && !hasRole(ADMIN_ROLE, msg.sender)) revert AccessDenied();
        if (deployed == address(0)) revert ZeroAddress();

        treasuries[domain][moduleId] = deployed;

        emit DomainModuleRecorded(domain, moduleId, deployed);
    }
}
