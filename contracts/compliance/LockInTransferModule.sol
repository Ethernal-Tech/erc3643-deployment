// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.17;

import "@tokenysolutions/t-rex/contracts/compliance/modular/modules/AbstractModuleUpgradeable.sol";

contract LockInTransferModule is AbstractModuleUpgradeable {    
    /// Transfer limit structure
    struct TransferLimit {
        uint256 amount;
        uint256 untilBlock;
    }

    /// Queue data structure to hold transfer limits
    struct Queue {
        uint256 start;
        uint256 end;
        uint256 balance;
        mapping(uint256 => TransferLimit) items;
    }

    /// transfer limits per compliance contract and user address
    mapping(address => mapping(address => Queue)) private _transferLimits;

    /// wait periods per compliance contract
    mapping(address => uint256) private _waitPeriods;

    /**
     *  this event is emitted when the wait period has been set.
     *  the event is emitted by 'setWaitPeriod' function.
     *  `_compliance` is the modular compliance contract address.
     *  `_value` is the wait period in blocks.
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
     *  @param _waitPeriod the wait period in blocks
     */
    function setWaitPeriod(uint256 _waitPeriod) external onlyComplianceCall {
        _waitPeriods[msg.sender] = _waitPeriod;
        emit WaitPeriod(msg.sender, _waitPeriod);
    }

    /**
     *  @dev See {IModule-moduleTransferAction}.
     *  adds transfer limit for receiver and remove transfer limit for sender
     */
    function moduleTransferAction(address _from, address _to, uint256 _value) external override onlyComplianceCall {
        // Remove transfer limit for sender
        _dequeueTransferLimit(msg.sender, _from, _value);
        // Add transfer limit for receiver
        _enqueueTransferLimit(msg.sender, _to, _value);
    }

    /**
     *  @dev See {IModule-moduleMintAction}.
     */
    function moduleMintAction(address _to, uint256 _value) external override onlyComplianceCall {
        _enqueueTransferLimit(msg.sender, _to, _value);
    }

    /**
     *  @dev See {IModule-moduleBurnAction}.
     */
    function moduleBurnAction(address _from, uint256 _value) external override onlyComplianceCall {
        Queue storage queue = _transferLimits[msg.sender][_from];
        queue.balance -= _value;
    }

    /**
     *  @dev See {IModule-moduleCheck}.
     */
    function moduleCheck(
        address _from,
        address /*_to*/,
        uint256 _value,
        address _compliance
    ) external view override returns (bool) {
        if (_from == address(0)) {
            return true;
        }

        Queue storage queue = _transferLimits[_compliance][_from];
        if (queue.start == queue.end) {
            return true;
        }

        uint256 total = 0;
        for (uint256 i = queue.start; i < queue.end; i++) {
            if (queue.items[i].untilBlock > block.number) {
                total += queue.items[i].amount;
            }
        }

        return queue.balance - total >= _value;
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
        return "LockInTransferModule";
    }

    /**
     *  @dev reset queue
     *  @param _queue the queue to be reset
     */
    function _resetQueue(Queue storage _queue) private {
        _queue.start = 0;
        _queue.end = 0;
    }

    /**
     *  @dev enqueue transfer limit for a receiver
     *  @param _compliance compliance contract address
     *  @param _receiver receiver address
     *  @param _amount the amount to be enqueued
     */
    function _enqueueTransferLimit(address _compliance, address _receiver, uint256 _amount) private {
        if (_receiver == address(0)) {
            return;
        }

        Queue storage queue = _transferLimits[_compliance][_receiver];
        queue.items[queue.end] = TransferLimit(_amount, block.number + _waitPeriods[_compliance]);
        queue.end++;
        queue.balance += _amount;
    }

    /**
     *  @dev dequeue transfer limit for a sender
     *  @param _compliance compliance contract address
     *  @param _sender sender address
     *  @param _amount the amount to be dequeued
     */
    function _dequeueTransferLimit(address _compliance, address _sender, uint256 _amount) private {
        if (_sender == address(0)) {
            return; // no dequeue for mint
        }

        Queue storage queue = _transferLimits[_compliance][_sender];
        if (queue.end == 0) {
            return; // queue is empty
        }

        bool doResetQueue = true;
        for (uint256 i = queue.start; i < queue.end; i++) {
            if (queue.items[i].untilBlock >= block.number) {
                doResetQueue = false;
                queue.start = i;
                break;
            }
        }

        if (doResetQueue) {
            _resetQueue(queue);
        }

        queue.balance -= _amount;
    }
}
