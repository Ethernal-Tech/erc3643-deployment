// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.17;

import "@tokenysolutions/t-rex/contracts/token/IToken.sol";
import "@tokenysolutions/t-rex/contracts/compliance/modular/IModularCompliance.sol";
import "@tokenysolutions/t-rex/contracts/compliance/modular/modules/AbstractModuleUpgradeable.sol";

contract LockInTransferModule is AbstractModuleUpgradeable {    
    /// Transfer limit structure
    struct TransferLimit {
        uint256 amount;
        uint256 lockedUntil;
    }

    /// Queue data structure to hold transfer limits
    struct Queue {
        uint128 start;
        uint128 end;
        uint256 balance;
        mapping(uint128 => TransferLimit) items;
    }

    /// transfer limits per compliance contract and user address
    mapping(address => mapping(address => Queue)) private _transferLimits;

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
        _waitPeriods[msg.sender] = _waitPeriod;
        emit WaitPeriod(msg.sender, _waitPeriod);
    }

    /**
     *  @dev See {IModule-moduleTransferAction}.
     *  adds transfer limit for receiver and remove transfer limit for sender
     */
    function moduleTransferAction(address _from, address _to, uint256 _value) external override onlyComplianceCall {
        // remove expired transfer limits for sender, if any
        _dequeueTransferLimit(msg.sender, _from);
        // add new transfer limit for receiver
        _enqueueTransferLimit(msg.sender, _to, _value);
    }

    /**
     *  @dev See {IModule-moduleMintAction}.
     */
    function moduleMintAction(address _to, uint256 _value) external override onlyComplianceCall {
        // add new transfer limit for receiver
        _enqueueTransferLimit(msg.sender, _to, _value);
    }

    /**
     *  @dev See {IModule-moduleBurnAction}.
     */
    function moduleBurnAction(address _from, uint256 _value) external override onlyComplianceCall {
        Queue storage queue = _transferLimits[msg.sender][_from];
        uint256 lockedBalance = queue.balance;
        if (lockedBalance == 0) {
            return; // queue is empty
        }

        // locked balance is not 0, apply burn amount to reduce locked balance
        if (lockedBalance <= _value) {
            // burn amount can fully cover locked balance, reset the queue
            _resetQueue(queue);
        } else {
            // burn amount is less than locked balance, reduce the locked balance by burn amount
            // iterate through the queue from the end and remove latest transfer limits
            // until the burn amount is fully applied
            queue.balance -= _value;
            for (uint128 i = queue.end - 1; i >= queue.start;) {
                uint256 itemAmount = queue.items[i].amount;
                if (itemAmount <= _value) {
                    _value -= itemAmount;
                } else {
                    queue.items[i].amount = itemAmount - _value;
                    queue.end = i + 1;
                    break; // burn amount has been fully applied, stop iterating
                }

                unchecked {
                    --i;
                }
            }
        }
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
            return true; // no transfer limit check for minting
        }

        Queue storage queue = _transferLimits[_compliance][_from];
        uint256 lockedBalance = queue.balance;
        if (lockedBalance == 0) {
            return true; // queue is empty, no transfer limit for sender
        }

        // calculate the total unlocked amount for sender by iterating through the queue
        for (uint128 i = queue.start; i < queue.end;) {
            TransferLimit memory item = queue.items[i]; // load item into memory to avoid multiple storage reads
            if (item.lockedUntil <= block.timestamp) {
                lockedBalance -= item.amount;
            } else {
                break; // stop iterating once we reach an item that is still locked
            }

            unchecked {
                ++i;
            }
        }

        if((IToken(IModularCompliance(_compliance).getTokenBound()).balanceOf(_from) - lockedBalance) < _value) {
            return false; // sender's available balance is less than transfer amount
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
        return "LockInTransferModule";
    }

    /**
     *  @dev reset queue
     *  @param _queue the queue to be reset
     */
    function _resetQueue(Queue storage _queue) private {
        _queue.start = 0;
        _queue.end = 0;
        _queue.balance = 0;
    }

    /**
     *  @dev enqueue transfer limit for a receiver
     *  @param _compliance compliance contract address
     *  @param _receiver receiver address
     *  @param _amount the amount to be enqueued
     */
    function _enqueueTransferLimit(address _compliance, address _receiver, uint256 _amount) private {
        if (_receiver == address(0)) {
            return; // no enqueue for burn
        }

        Queue storage queue = _transferLimits[_compliance][_receiver];
        queue.items[queue.end] = TransferLimit(_amount, block.timestamp + _waitPeriods[_compliance]);
        ++queue.end;
        queue.balance += _amount;
    }

    /**
     *  @dev dequeue transfer limit for a sender
     *  @param _compliance compliance contract address
     *  @param _sender sender address
     */
    function _dequeueTransferLimit(address _compliance, address _sender) private {
        if (_sender == address(0)) {
            return; // no dequeue for mint
        }

        Queue storage queue = _transferLimits[_compliance][_sender];
        uint256 lockedBalance = queue.balance;
        if (lockedBalance == 0) {
            return; // queue is empty
        }

        for (uint128 i = queue.start; i < queue.end;) {
            TransferLimit memory item = queue.items[i]; // load item into memory to avoid multiple storage reads
            if (item.lockedUntil <= block.timestamp) {
                lockedBalance -= item.amount;
            } else {
                queue.balance = lockedBalance;
                queue.start = i;
                break; // stop iterating once we reach an item that is still locked
            }

            unchecked {
                ++i;
            }
        }

        // reset queue if all items have been dequeued
        if (lockedBalance == 0) { 
            _resetQueue(queue);
        }
    }
}
