// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { ERC20Votes } from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { IZeroVotingERC20 } from "./IZeroVotingERC20.sol";


/**
 * @title ZeroVotingERC20
 *
 * @notice Implementation of the ZeroVotingERC20 token made for voting in the zDAO.
 *
 * @dev This contract's code is general, but it was made to primarily be issued 1:1 by the StakingERC20 contract
 *  as a representative token for user's staked amount.
 *  This token is non-transferrable, and can only be minted and burned by the minter and burner roles,
 *  which should be assigned to the StakingERC20 contract only.
 *  After that it is also advisable to renounce the admin role to leave control of the token to the staking contract.
 */
contract ZeroVotingERC20 is ERC20Votes, AccessControl, IZeroVotingERC20 {

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");

    /**
     * @dev Initializes the token with name and symbol, also sets up ownership.
     *
     * @param name The name of the ERC20 token.
     * @param symbol The symbol of the ERC20 token.
     * @param domainName The name of the EIP712 signing domain.
     * @param domainVersion The version of the EIP712 signing domain.
     * @param admin The address that will be granted the DEFAULT_ADMIN_ROLE which will be able to grant other roles,
     *  specifically MINTER and BURNER.
     */
    constructor(
        string memory name,
        string memory symbol,
        string memory domainName,
        string memory domainVersion,
        address admin
    )
        ERC20(name, symbol)
        EIP712(domainName, domainVersion)
    {
        if (admin == address(0)) {
            revert ZeroAddressPassed();
        }

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    /**
     * @dev External mint function. Mints a specified amount of tokens to a specified account.
     *
     * @param account The address that will receive the minted tokens.
     * @param value The amount of tokens to mint to the specified account.
     */
    function mint(
        address account,
        uint256 value
    ) external override onlyRole(MINTER_ROLE) {
        _mint(
            account,
            value
        );
    }

    /**
     * @dev External burn function. Burns a specified amount of tokens from the sender's account.
     *
     * @param account Account where tokens need to be burned.
     * @param amount The amount of tokens to burn.
     */
    function burn(
        address account,
        uint256 amount
    ) external override onlyRole(BURNER_ROLE) {
        _burn(
            account,
            amount
        );
    }

    /**
     * @dev Returns the current nonce for `owner`.
     *
     * @param owner Address to query the nonce of.
     */
    function nonces(
        address owner
    ) public view override returns (uint256) {
        return super.nonces(owner);
    }

    /**
     * @dev Disallow all transfers, only `_mint` and `_burn` are allowed
     */
    function _update(
        address from,
        address to,
        uint256 value
    ) internal override(ERC20Votes) {
        if (from != address(0) && to != address(0)) {
            revert NonTransferrableToken();
        }

        super._update(from, to, value);
    }
}
