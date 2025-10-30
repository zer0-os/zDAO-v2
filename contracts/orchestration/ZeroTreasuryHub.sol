// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { SafeL2 } from "@safe-global/safe-contracts/contracts/SafeL2.sol";
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
        address indexed safe
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
    mapping(bytes32 => TreasuryComponents) public treasuries;

    // TODO proto: should we add ZNS registry address here in state to verify domain ownership/existence on treasury creation?

    // TODO proto: change this to initialize() if decided to make upgradeable
    constructor(
        address _safeSingleton,
        address _safeProxyFactory,
        address _safeFallbackHandler
    ) {
        if (
            _safeSingleton == address(0) ||
            _safeProxyFactory == address(0) ||
            _safeFallbackHandler == address(0)
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
            SafeL2.setup.selector,
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
        // TODO proto: extend this event to inclide function parameters for Safe
        emit SafeTreasuryInstanceCreated(domain, safeAddress);

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
