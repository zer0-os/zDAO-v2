// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Safe } from "@safe-global/safe-contracts/contracts/Safe.sol";
import { SafeProxyFactory } from "@safe-global/safe-contracts/contracts/proxies/SafeProxyFactory.sol";
import { SafeProxy } from "@safe-global/safe-contracts/contracts/proxies/SafeProxy.sol";


/**
 * @title ZeroTreasuryHub v0.
 * @dev A contract that serves as a factory for treasury deployments based on user configs.
 * Also works as a registry to keep track of topologies of every treasury system deployed.
 * TODO proto: how do we keep track of runtime changes of addresses and such once each treasury is modified by users ?? we shouldn't wire all treasury/dao/safe calls through this contract
 */
contract ZeroTreasuryHub {

    // <--- Errors --->
    error ZeroAddressPassed();
    error TreasuryExistsForDomain(bytes32 domain);
    error InvalidSafeParams();

    // <--- Events --->
    event SafeSystemSet(
        address singleton,
        address proxyFactory,
        address fallbackHandler
    );
    event SafeTreasuryInstanceCreated(
        bytes32 indexed domain,
        address indexed safeAddress,
        address[] owners,
        uint256 threshold
    );
    event ModuleCatalogModified(
        bytes32 indexed moduleKey,
        address indexed moduleAddress,
        bool added
    );


    struct ModuleCatalog {
        address safe;
//        address governor;
//        address timelock;
    }

    /**
     * @dev Addresses of components that make up a deployed treasury system.
     */
    struct TreasuryComponents {
        address safe;
        address governor;
//        address timelock;
    }

    // TODO proto: figure these proper ones out for ZChain!
    struct SafeSystem {
        // Safe (SafeL2) contract used
        address singleton;
        // Proxy factory used to deploy new safes
        address proxyFactory;
        // Fallback handler for the safe
        address fallbackHandler;
    }

    SafeSystem public safeSystem;
    // TODO proto: make ZNS a proper module and import here to use this
//    ZNSRegistry public znsRegistry;
    /**
     * @dev All available modules to be installed for any treasury.
     * Lists all predeployed preset contracts to be cloned.
     */
    // mapping where the key = keccak256(abi.encodePacked(namespace, ":", name, ":", versionString))
    //      e.g.: "OZ:Governor_V1:v1", "ZODIAC:Roles:v4", etc. think on this and make it better.
    //      this way we don't need to upgrade and we can easily add new modules over time.
    //      if doing so, we need to store all available keys in an array.
    //      Another way would be to store a struct with metadata on the end of the mapping instead of just plain address
    //      Also need to write a deterministic helper that can create and acquire these keys for apps and such. Readable names for modules could help in events.
    mapping(bytes32 moduleKey => address module) public moduleCatalog;

    /**
     * @dev Mapping from ZNS domain hash to the addresses of components for each treasury.
     */
    // TODO proto: this should probably be a 2 lvl mapping which uses component name hashes as keys,
    //  so we never have to upgrade the contract.
    // TODO proto: define a catalog of all module strings available, so that we don't have
    //  to add constants to this contracts and then upgrade it to add new ones. (e.g. "safe.singleton.v1", "oz.governor.v1", etc)
    //  use the SAME hash keys used in `moduleCatalog` mapping above.
    mapping(bytes32 => TreasuryComponents) public treasuries;

    // TODO proto: should we add ZNS registry address here in state to verify domain ownership/existence on treasury creation?

    // TODO proto: change this to initialize() if decided to make upgradeable
    constructor(
        // TODO proto: needs to be SafeL2 address! (?)
        address _safeSingleton,
        address _safeProxyFactory,
        address _safeFallbackHandler
//        address znsRegistryAddress
    ) {
        if (
            _safeSingleton == address(0) ||
            _safeProxyFactory == address(0) ||
            _safeFallbackHandler == address(0)
//            znsRegistryAddress == address(0)
        ) {
            revert ZeroAddressPassed();
        }

        _setSafeSystem(
            _safeSingleton,
            _safeProxyFactory,
            _safeFallbackHandler
        );
    }

    // <--- Treasury Creation --->
    // TODO proto: should these be composable contracts we can evolve over time? Also separate from registry??
    // TODO proto: do we need reentrancy guards on these functions?
    function createSafe(
        bytes32 domain,
        address[] calldata owners,
        uint256 threshold,
        // TODO proto: make these better if possible. need to avoid errors and collisions. do we need it (adds complexity. including storage) ??
        //      this outline Safe's purpose/role in the Treasury, so we can deploy multiple Safes if needed
        // Optional, only for additional Safes. pass "" for "main"
        string memory purpose
    ) external returns (address) {
        if (treasuries[domain].safe != address(0)) revert TreasuryExistsForDomain(domain);
        // TODO proto: verify domain ownership!!!

        // TODO proto: should we store length in a memory var? does it save gas?
        if (owners.length == 0 || threshold == 0 || threshold > owners.length) revert InvalidSafeParams();

        // TODO proto: figure out if we ever need to set to/data/payment stuff ?
        bytes memory setup = abi.encodeWithSelector(
            Safe.setup.selector,
            owners,
            threshold,
            // to
            address(0),
            // data
            bytes(""),
            safeSystem.fallbackHandler,
            // paymentToken
            address(0),
            // payment
            0,
            // paymentReceiver
            payable(address(0))
        );

        SafeProxy safe = SafeProxyFactory(safeSystem.proxyFactory).createProxyWithNonce(
            safeSystem.singleton,
            setup,
            _getSaltNonce(
                domain,
                purpose
            )
        );

        address safeAddress = address(safe);

        treasuries[domain] = TreasuryComponents({ safe: safeAddress, governor: address(0) });

        emit SafeTreasuryInstanceCreated(
            domain,
            safeAddress,
            owners,
            threshold
        );

        return safeAddress;
    }

    function createDao() external {}

    function createHybrid() external {}

    // <--- Treasury Management --->

    function addModule() external {}

    function removeModule() external {}

    // <--- Utilities --->
    function _getSaltNonce(bytes32 domain, string memory purpose) internal pure returns (uint256) {
        string memory actualPurpose = bytes(purpose).length == 0 ? "main" : purpose;

        return uint256(keccak256(abi.encodePacked(domain, ":", actualPurpose)));
    }

    // <--- Setters --->

    function setSafeSystem(
        address _singleton,
        address _proxyFactory,
        address _fallbackHandler
    ) external {
        // TODO proto: add access control!
        _setSafeSystem(
            _singleton,
            _proxyFactory,
            _fallbackHandler
        );
    }

    function modifyModuleCatalog(
        bytes32[] calldata moduleKeys,
        address[] calldata moduleAddresses,
        // true for add/update, false for remove
        bool[] calldata add
    ) external {
        // TODO proto: add access control!
        for (uint256 i = 0; i < moduleKeys.length; i++) {
            _modifyModuleCatalog(
                moduleKeys[i],
                moduleAddresses[i],
                add[i]
            );
        }
    }

    function _modifyModuleCatalog(
        bytes32 moduleKey,
        address moduleAddress,
        bool add
    ) internal {
        if (moduleAddress == address(0)) {
            revert ZeroAddressPassed();
        }

        if (add) {
            moduleCatalog[moduleKey] = moduleAddress;
        } else {
            delete moduleCatalog[moduleKey];
        }

        emit ModuleCatalogModified(
            moduleKey,
            moduleAddress,
            add
        );
    }

    function _setSafeSystem(
        address _singleton,
        address _proxyFactory,
        address _fallbackHandler
    ) internal {
        safeSystem = SafeSystem({
            singleton: _singleton,
            proxyFactory: _proxyFactory,
            fallbackHandler: _fallbackHandler
        });

        emit SafeSystemSet(
            _singleton,
            _proxyFactory,
            _fallbackHandler
        );
    }
}
