// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.17;

import "@tokenysolutions/t-rex/contracts/token/Token.sol";

contract ERC3643Token is Token {
    function getBalances(address[] calldata users) public view returns (uint256[] memory) {
        uint256[] memory balances = new uint256[](users.length);
        for (uint i = 0; i < users.length; i++) {
            balances[i] = super.balanceOf(users[i]);
        }
        return balances;
    }
}
