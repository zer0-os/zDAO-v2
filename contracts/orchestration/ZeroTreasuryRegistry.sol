// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";

interface IDomainOwnership {
    function isOwner(bytes32 domain, address caller) external view returns (bool);
}

/**
 * @title ZeroTreasuryRegistry
 * @notice Registry that stores master copy addresses for modules (by numeric IDs)
 *         and tracks, per domain, which module clone was deployed.
 * @dev Minimal, two-mapping design:
 *      - moduleCatalog: moduleId => implementation
 *      - treasuries: keccak256(domain, ":", moduleId, ":", instanceId) => deployed clone
 *      Canonical instance is stored under instanceId = 0.
 */
contract ZeroTreasuryRegistry is AccessControl {
    // --- Events ---
    event ModuleCatalogSet(uint256 indexed moduleId, address indexed masterCopy);
    // Instance-aware events
    event DomainModuleInstanceRecorded(
        bytes32 indexed domain,
        uint256 indexed moduleId,
        uint256 indexed instanceId,
        address deployed,
        bool isCanonical,
        string purposeLabel
    );
    event CanonicalInstanceChanged(
        bytes32 indexed domain,
        uint256 indexed moduleId,
        uint256 newInstanceId
    );

    // --- Errors ---
    error ZeroAddress();
    error LengthMismatch();
    error AccessDenied();
    error ModuleAlreadyExists(uint256 moduleId);
    error InstanceAlreadyExists();
    error InstanceNotFound();

    // --- Roles ---
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant FACTORY_ROLE = keccak256("FACTORY_ROLE");

    // --- Storage ---
    // Catalog of module master copies (implementation contracts)
    mapping(uint256 moduleId => address masterCopy) public moduleCatalog;
    // Append-only counter for catalog discoverability (no arrays)
    uint256 public lastModuleId;

    // Composite-key storage for deployed instances (canonical and alternates)
    // key = keccak256(abi.encodePacked(domain, ":", moduleId, ":", instanceId))
    mapping(bytes32 key => address deployed) public treasuries;

    // Optional domain ownership oracle to authorize domain owners to record/update
    address public domainOwnershipOracle;

    constructor(address governor, address[] memory admins) {
        if (governor == address(0)) revert ZeroAddress();
        _grantRole(ADMIN_ROLE, governor);
        // Break-glass role for recovery/rotation via DEFAULT_ADMIN_ROLE
        _grantRole(DEFAULT_ADMIN_ROLE, governor);
        _setRoleAdmin(FACTORY_ROLE, ADMIN_ROLE);
        // Allow ADMIN_ROLE to self-administer for routine rotations
        _setRoleAdmin(ADMIN_ROLE, ADMIN_ROLE);
        // initialize optional domain ownership oracle to zero; admins can set later
        domainOwnershipOracle = address(0);
    }

    // --- Internal key helper ---
    function _key(bytes32 domain, uint256 moduleId, uint256 instanceId) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(domain, ":", moduleId, ":", bytes32(instanceId)));
    }

    // --- Catalog management ---

    /// Set a specific moduleId to an implementation (immutable per id)
    function setModule(uint256 moduleId, address masterCopy) external onlyRole(ADMIN_ROLE) {
        _setModule(moduleId, masterCopy);
        if (moduleId > lastModuleId) {
            lastModuleId = moduleId;
        }
    }

    /// Append a new module at ++lastModuleId and return its id
    function addModule(address masterCopy) external onlyRole(ADMIN_ROLE) returns (uint256 moduleId) {
        moduleId = lastModuleId + 1;
        _setModule(moduleId, masterCopy);
        lastModuleId = moduleId;
    }

    function _setModule(uint256 moduleId, address masterCopy) internal {
        if (masterCopy == address(0)) revert ZeroAddress();
        if (moduleCatalog[moduleId] != address(0)) revert ModuleAlreadyExists(moduleId);
        moduleCatalog[moduleId] = masterCopy;
        emit ModuleCatalogSet(moduleId, masterCopy);
    }

    // --- Catalog views (simple on-chain discovery) ---

    /// Returns all non-zero catalog entries from startId to lastModuleId (inclusive).
    /// Note: This is a view; gas is not charged to the caller off-chain. Keep startId reasonable for on-chain callers.
    function getModulesInRange(uint256 startId)
        external
        view
        returns (uint256[] memory ids, address[] memory impls)
    {
        if (startId == 0) startId = 1;
        if (startId > lastModuleId) {
            return (new uint256[](0), new address[](0));
        }

        uint256 n = lastModuleId - startId + 1;
        ids = new uint256[](n);
        impls = new address[](n);

        for (uint256 j = 0; j < n; j++) {
            uint256 id = startId + j;
            ids[j] = id;
            impls[j] = moduleCatalog[id]; // may be address(0) for gaps
        }
    }

    // --- Recording deployments ---

    /// Record or update a specific instanceId (does NOT change canonical pointer)
    /// Authorization: FACTORY_ROLE, ADMIN_ROLE, or domain owner via oracle (if configured).
    /// Overwrite policy: existing instanceId can be overwritten only by ADMIN or domain owner; FACTORY can only write new slots.
    function recordDomainModuleInstance(
        bytes32 domain,
        uint256 moduleId,
        uint256 instanceId,
        address deployed,
        string calldata purposeLabel
    ) external {
        if (deployed == address(0)) revert ZeroAddress();

        bool isFactory = hasRole(FACTORY_ROLE, msg.sender);
        bool isAdmin = hasRole(ADMIN_ROLE, msg.sender);
        bool isOwner = false;
        if (domainOwnershipOracle != address(0)) {
            isOwner = IDomainOwnership(domainOwnershipOracle).isOwner(domain, msg.sender);
        }
        if (!(isFactory || isAdmin || isOwner)) revert AccessDenied();

        bytes32 instKey = _key(domain, moduleId, instanceId);
        address existing = treasuries[instKey];
        if (existing != address(0)) {
            // Only ADMIN or domain owner may overwrite an existing instance slot
            if (!(isAdmin || isOwner)) revert InstanceAlreadyExists();
        }
        treasuries[instKey] = deployed;

        // Event marks canonical only if instanceId == 0 (rare); flipping canonical is a separate function
        bool isCanonical = (instanceId == 0);
        emit DomainModuleInstanceRecorded(domain, moduleId, instanceId, deployed, isCanonical, purposeLabel);
    }

    // --- Canonical management ---
    /// Set canonical instance for (domain,moduleId) to an existing instanceId.
    /// Authorization: ADMIN_ROLE or domain owner via oracle (if configured).
    function setCanonical(bytes32 domain, uint256 moduleId, uint256 instanceId) external {
        bool isAdmin = hasRole(ADMIN_ROLE, msg.sender);
        bool isOwner = false;
        if (domainOwnershipOracle != address(0)) {
            isOwner = IDomainOwnership(domainOwnershipOracle).isOwner(domain, msg.sender);
        }
        if (!(isAdmin || isOwner)) revert AccessDenied();

        address instAddr = treasuries[_key(domain, moduleId, instanceId)];
        if (instAddr == address(0)) revert InstanceNotFound();

        treasuries[_key(domain, moduleId, 0)] = instAddr;
        emit CanonicalInstanceChanged(domain, moduleId, instanceId);
    }

    // --- Read helpers for callers ---

    function getCanonical(bytes32 domain, uint256 moduleId) external view returns (address) {
        return treasuries[_key(domain, moduleId, 0)];
    }

    function getInstance(bytes32 domain, uint256 moduleId, uint256 instanceId) external view returns (address) {
        return treasuries[_key(domain, moduleId, instanceId)];
    }

    // --- Admin setters ---
    function setDomainOwnershipOracle(address oracle) external onlyRole(ADMIN_ROLE) {
        domainOwnershipOracle = oracle; // set to zero to disable owner path
    }
}
