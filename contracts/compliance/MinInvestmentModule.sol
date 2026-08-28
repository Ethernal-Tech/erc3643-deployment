// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.17;

import "@tokenysolutions/t-rex/contracts/token/IToken.sol";
import "@tokenysolutions/t-rex/contracts/compliance/modular/IModularCompliance.sol";
import "@tokenysolutions/t-rex/contracts/compliance/modular/modules/AbstractModuleUpgradeable.sol";

contract MinInvestmentModule is AbstractModuleUpgradeable {
    /// min investments per modular compliance contract
    mapping(address => uint256) private _minInvestments;

    /// accounts invested per modular compliance contract
    mapping(address => mapping(address => bool)) private _accountsInvested;

    /// this event is emitted when the min investment has been set for a modular compliance contract
    event MinInvestmentSet(address _compliance, uint256 _limit);

    /**
     * @dev initializes the contract and sets the initial state.
     * @notice This function should only be called once during the contract deployment.
     */
    function initialize() external initializer {
        __AbstractModule_init();
    }

    /**
     *  @dev sets min investment.
     *  @param _limit min amount of tokens to be invested
     */
    function setMinInvestment(uint256 _limit) external onlyComplianceCall {
        _minInvestments[msg.sender] = _limit;
        emit MinInvestmentSet(msg.sender, _limit);
    }

    /**
     *  @dev See {IModule-moduleTransferAction}.
     */
    function moduleTransferAction(address /*_from*/, address _to, uint256 /*_value*/) external onlyComplianceCall {
        _accountsInvested[msg.sender][_to] = true;
    }

    /**
     *  @dev See {IModule-moduleMintAction}.
     */
    function moduleMintAction(address _to, uint256 /*_value*/) external onlyComplianceCall {
        _accountsInvested[msg.sender][_to] = true;
    }

    /**
     *  @dev See {IModule-moduleBurnAction}.
     *  no burn action required in this module
     */
    // solhint-disable-next-line no-empty-blocks
    function moduleBurnAction(address _from, uint256 _value) external onlyComplianceCall {}

    /**
     *  @dev See {IModule-moduleCheck}.
     */
    function moduleCheck(
        address /*_from*/,
        address _to,
        uint256 _value,
        address _compliance
    ) external view override returns (bool) {
        if (_value < _minInvestments[_compliance] && !_accountsInvested[_compliance][_to]) {
            return false;
        }
        return true;
    }

    /**
    *  @dev gets min investment for a given compliance contract
    *  @param _compliance the modular compliance address
    *  @return the min investment for a given compliance contract
    */
    function getMinInvestment(address _compliance) external view returns (uint256) {
        return _minInvestments[_compliance];
    }

    /**
     *  @dev See {IModule-canComplianceBind}.
     */
    function canComplianceBind(address /*_compliance*/) external view override returns (bool) {
        return true;
    }

    /**
     *  @dev See {IModule-isPlugAndPlay}.
     */
    function isPlugAndPlay() external pure override returns (bool) {
        return true;
    }

    /**
     *  @dev See {IModule-name}.
     */
    function name() public pure returns (string memory _name) {
        return "MinInvestmentModule";
    }
}