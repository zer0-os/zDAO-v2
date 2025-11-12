// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {TimelockControllerUpgradeable} from "@openzeppelin/contracts-upgradeable/governance/TimelockControllerUpgradeable.sol";

/**
 * @title TimelockUpgradeableMaster
 * @notice Thin wrapper to have a local artifact for OZ TimelockControllerUpgradeable so it can be used
 *         as a master copy for EIP-1167 clones in tests.
 */
contract TimelockUpgradeableMaster is Initializable, TimelockControllerUpgradeable {
    function initializeTimelock(
        uint256 minDelay,
        address[] memory proposers,
        address[] memory executors
    ) public initializer {
        __TimelockController_init(minDelay, proposers, executors, msg.sender);
    }
}
