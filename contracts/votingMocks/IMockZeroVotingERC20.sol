// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { IAccessControl } from "@openzeppelin/contracts/access/IAccessControl.sol";
import { IVotes } from "@openzeppelin/contracts/governance/utils/IVotes.sol";
import { IERC5267 } from "@openzeppelin/contracts/interfaces/IERC5267.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";


interface IMockZeroVotingERC20 is
    IAccessControl,
    IERC20,
    IERC5267,
    IVotes {

    error ZeroAddressPassed();

    function mint(
        address account,
        uint256 value
    ) external;

    function burn(
        address account,
        uint256 amount
    ) external;
}
