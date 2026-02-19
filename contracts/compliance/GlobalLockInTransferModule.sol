// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.17;

import "@tokenysolutions/t-rex/contracts/compliance/modular/modules/AbstractModuleUpgradeable.sol";

contract GlobalLockInTransferModule is AbstractModuleUpgradeable {    
    /// wait periods per compliance contract
    mapping(address => uint256) private _waitPeriods;

    /**
     *  this event is emitted when the wait period has been set.
     *  the event is emitted by 'setWaitPeriod' function.
     *  `_compliance` is the modular compliance contract address.
     *  `_value` is the wait period in seconds.
     */
    event WaitPeriod(address _compliance, uint256 _value);

    /**
     *  @dev initializes the contract and sets the initial state.
     *  @notice This function should only be called once during the contract deployment.
     */
    function initialize() external initializer {
        __AbstractModule_init();
    }

    /**
     *  @dev set wait period for a compliance contract
     *  only a bound modular compliance contract can call this function
     *  emits a `WaitPeriod` event
     *  @param _waitPeriod the wait period in seconds
     */
    function setWaitPeriod(uint256 _waitPeriod) external onlyComplianceCall {
        _waitPeriods[msg.sender] = block.timestamp + _waitPeriod;
        emit WaitPeriod(msg.sender, _waitPeriod);
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
        address _from,
        address /*_to*/,
        uint256 /*_value*/,
        address _compliance
    ) external view override returns (bool) {
        if (_from == address(0)) {
            return true;
        }

        return _waitPeriods[_compliance] <= block.timestamp;
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
        return "GlobalLockInTransferModule";
    }
}
