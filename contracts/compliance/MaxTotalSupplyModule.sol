// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.17;

import "@tokenysolutions/t-rex/contracts/token/IToken.sol";
import "@tokenysolutions/t-rex/contracts/compliance/modular/IModularCompliance.sol";
import "@tokenysolutions/t-rex/contracts/compliance/modular/modules/AbstractModuleUpgradeable.sol";

contract MaxTotalSupplyModule is AbstractModuleUpgradeable {
    /// max total supplies per modular compliance contract
    mapping(address => uint256) private _maxTotalSupplies;

    /**
     *  this event is emitted when the max total supply has been set.
     *  `_compliance` is the modular compliance address.
     *  `_limit` is the max amount of tokens in circulation.
     */
    event MaxTotalSupplySet(address _compliance, uint256 _limit);

    /**
     *  @dev error thrown when a new total supply limit is less than the old one
     *  @param _limit new total supply limit to be set
     */
    error MaxTotalSupplyInvalidLimit(uint256 _limit);

    /**
     * @dev initializes the contract and sets the initial state.
     * @notice This function should only be called once during the contract deployment.
     */
    function initialize() external initializer {
        __AbstractModule_init();
    }

    /**
     *  @dev sets max total supply.
     *  max total supply has to be smaller or equal to the actual supply.
     *  only a bound modular compliance contract can call this function
     *  emits a `MaxTotalSupplySet` event
     *  @param _limit max amount of tokens to be created
     */
    function setMaxTotalSupply(uint256 _limit) external onlyComplianceCall {
        if (_limit < IToken(IModularCompliance(msg.sender).getTokenBound()).totalSupply()) {
            revert MaxTotalSupplyInvalidLimit(_limit);
        }
        _maxTotalSupplies[msg.sender] = _limit;
        emit MaxTotalSupplySet(msg.sender, _limit);
    }

    /**
     *  @dev See {IModule-moduleTransferAction}.
     *  no transfer action required in this module
     */
    // solhint-disable-next-line no-empty-blocks
    function moduleTransferAction(address _from, address _to, uint256 _value) external onlyComplianceCall {}

    /**
     *  @dev See {IModule-moduleMintAction}.
     *  no mint action required in this module
     */
    // solhint-disable-next-line no-empty-blocks
    function moduleMintAction(address _to, uint256 _value) external onlyComplianceCall {}

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
        address _from,
        address /*_to*/,
        uint256 _value,
        address _compliance
    ) external view override returns (bool) {
        if (_from == address(0) &&
            (IToken(IModularCompliance(_compliance).getTokenBound()).totalSupply() + _value) > _maxTotalSupplies[_compliance]) {
            return false;
        }
        return true;
    }

    /**
    *  @dev gets max total supply for a given compliance contract
    *  @param _compliance the modular compliance address
    *  @return the max total supply for a given compliance contract
    */
    function getMaxTotalSupply(address _compliance) external view returns (uint256) {
        return _maxTotalSupplies[_compliance];
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
        return "MaxTotalSupplyModule";
    }
}