// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Governor } from "@openzeppelin/contracts/governance/Governor.sol";
import { GovernorSettings } from "@openzeppelin/contracts/governance/extensions/GovernorSettings.sol";
import { GovernorCountingSimple } from "@openzeppelin/contracts/governance/extensions/GovernorCountingSimple.sol";
import { GovernorVotes, IVotes } from "@openzeppelin/contracts/governance/extensions/GovernorVotes.sol";
import {
    GovernorTimelockControl
} from "@openzeppelin/contracts/governance/extensions/GovernorTimelockControl.sol";
import {
    TimelockController
} from "@openzeppelin/contracts/governance/TimelockController.sol";
import {
    GovernorVotesQuorumFraction
} from "@openzeppelin/contracts/governance/extensions/GovernorVotesQuorumFraction.sol";
import { GovernorPreventLateQuorum } from "@openzeppelin/contracts/governance/extensions/GovernorPreventLateQuorum.sol";


event Signal(string description);

contract ZDAO is
    Governor,
    GovernorSettings,
    GovernorCountingSimple,
    GovernorVotes,
    GovernorTimelockControl,
    GovernorVotesQuorumFraction,
    GovernorPreventLateQuorum {

    constructor(
        uint256 _daoId,
        string memory governorName,
        IVotes token,
        TimelockController timelock,
        uint48 delay_,
        uint32 votingPeriod_,
        uint256 proposalThreshold_,
        uint256 quorumPercentage_,
        uint48 voteExtension_
    )
        Governor(governorName)
        GovernorVotes(token)
        GovernorTimelockControl(timelock)
        GovernorSettings(
            delay_,
            votingPeriod_,
            proposalThreshold_
        )
        GovernorVotesQuorumFraction(quorumPercentage_)
        GovernorPreventLateQuorum(voteExtension_) {}

    function executeSignal(string memory description)
    external 
    onlyGovernance {
        emit Signal(
            description
        );
    }

    function votingDelay()
    public
    view
    override(Governor, GovernorSettings)
    returns (uint256) {
        return super.votingDelay();
    }

    function votingPeriod()
    public
    view
    override(Governor, GovernorSettings)
    returns (uint256) {
        return super.votingPeriod();
    }

    function proposalThreshold()
    public
    view
    override (Governor, GovernorSettings)
    returns (uint256) {
        return super.proposalThreshold();
    }

    function quorum(uint256 blockNumber)
    public
    view
    override(Governor, GovernorVotesQuorumFraction)
    returns (uint256) {
        return super.quorum(blockNumber);
    }

    function state(uint256 proposalId)
    public
    view
    override(Governor, GovernorTimelockControl)
    returns (ProposalState) {
        return super.state(proposalId);
    }

    function proposalNeedsQueuing(uint256 proposalId)
    public
    view
    override(Governor, GovernorTimelockControl)
    returns (bool) {
        return super.proposalNeedsQueuing(proposalId);
    }

    function proposalDeadline(uint256 proposalId)
    public
    view
    override(Governor, GovernorPreventLateQuorum)
    returns (uint256) {
        return super.proposalDeadline(proposalId);
    }

    function supportsInterface(bytes4 interfaceId)
    public
    view
    override
    returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    function _queueOperations(
        uint256 proposalId,
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    )
    internal
    override(Governor, GovernorTimelockControl)
    returns (uint48) {
        return super._queueOperations(
            proposalId,
            targets,
            values,
            calldatas,
            descriptionHash
        );
    }

    function _executeOperations(
        uint256 proposalId,
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    )
    internal
    override(Governor, GovernorTimelockControl) {
        super._executeOperations(
            proposalId,
            targets,
            values,
            calldatas,
            descriptionHash
        );
    }

    function _cancel(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    )
    internal
    override(Governor, GovernorTimelockControl)
    returns (uint256) {
        return super._cancel(
            targets,
            values,
            calldatas,
            descriptionHash
        );
    }

    function _castVote(
        uint256 proposalId,
        address account,
        uint8 support,
        string memory reason,
        bytes memory params
    )
    internal
    override(Governor)
    returns (uint256) {
        return super._castVote(
            proposalId,
            account,
            support,
            reason,
            params
        );
    }

    function _tallyUpdated(uint256 proposalId)
    internal
    override(Governor, GovernorPreventLateQuorum) {
        return super._tallyUpdated(proposalId);
    }

    function _executor()
    internal
    view
    override(Governor, GovernorTimelockControl)
    returns (address) {
        return super._executor();
    }
}
