// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.17;

import "@tokenysolutions/t-rex/contracts/token/IToken.sol";
import "@tokenysolutions/t-rex/contracts/compliance/modular/IModularCompliance.sol";
import "@tokenysolutions/t-rex/contracts/compliance/modular/modules/AbstractModuleUpgradeable.sol";

contract MaxBalanceModule is AbstractModuleUpgradeable {
    /// max balances per modular compliance contract
    mapping(address => uint256) private _maxBalances;

    /// this event is emitted when the max balance has been set for a modular compliance contract
    event MaxBalanceSet(address _compliance, uint256 _maxBalance);

    /**
     * @dev initializes the contract and sets the initial state.
     * @notice This function should only be called once during the contract deployment.
     */
    function initialize() external initializer {
        __AbstractModule_init();
    }

    /**
     *  @dev sets max balance for a modular compliance contract which is calling this function
     *  @param _maxBalance max amount of tokens an account can have
     */
    function setMaxBalance(uint256 _maxBalance) external onlyComplianceCall {
        _maxBalances[msg.sender] = _maxBalance;
        emit MaxBalanceSet(msg.sender, _maxBalance);
    }

    /**
     *  @dev See {IModule-moduleTransferAction}.
     *  no transfer action required in this module
     */
    // solhint-disable-next-line no-empty-blocks
    function moduleTransferAction(address _from, address _to, uint256 _value) external override onlyComplianceCall {}

    /**
     *  @dev See {IModule-moduleMintAction}.
     *  no mint action required in this module
     */
    // solhint-disable-next-line no-empty-blocks
    function moduleMintAction(address _to, uint256 _value) external override onlyComplianceCall {}

    /**
     *  @dev See {IModule-moduleBurnAction}.
     *  no burn action required in this module
     */
    // solhint-disable-next-line no-empty-blocks
    function moduleBurnAction(address _from, uint256 _value) external override onlyComplianceCall {}

    /**
     *  @dev See {IModule-moduleCheck}.
     */
    function moduleCheck(
        address /*_from*/,
        address _to,
        uint256 _value,
        address _compliance
    ) external view override returns (bool) {
        uint256 maxBalance = _maxBalances[_compliance];
        if (_value > maxBalance) {
            return false;
        }

        if((IToken(IModularCompliance(_compliance).getTokenBound()).balanceOf(_to) + _value) > maxBalance) {
            return false;
        }

        return true;
    }

    /**
     *  @dev See {IModule-canComplianceBind}.
     */
    function canComplianceBind(address /*_compliance*/) external view returns (bool) {
        return true;
    }

    /**
     *  @dev See {IModule-isPlugAndPlay}.
     */
    function isPlugAndPlay() external pure returns (bool) {
        return true;
    }

    /**
     *  @dev See {IModule-name}.
     */
    function name() public pure returns (string memory _name) {
        return "MaxBalanceModule";
    }
}
