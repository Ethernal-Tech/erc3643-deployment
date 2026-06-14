// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.17;

import "@tokenysolutions/t-rex/contracts/token/Token.sol";

contract ERC3643Token is Token {
    function getBalances(address[] calldata users) external view returns (uint256[] memory) {
        uint256[] memory balances = new uint256[](users.length);
        for (uint256 i = 0; i < users.length;) {
            balances[i] = super.balanceOf(users[i]);

            unchecked {
                ++i; 
            }
        }
        return balances;
    }
}
