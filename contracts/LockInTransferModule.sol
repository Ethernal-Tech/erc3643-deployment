// SPDX-License-Identifier: GPL-3.0
// This contract is also licensed under the Creative Commons Attribution-NonCommercial 4.0 International License.

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

    /// emitted when wait period is set
    event WaitPeriod(address compliance, uint256 value);

    /// transfer limits per compliance contract and user address
    mapping(address => mapping(address => Queue)) private transferLimits;

    /// wait period per compliance contract
    mapping(address => uint256) private waitPeriod;

    /**
     * @dev initializes the contract and sets the initial state.
     * @notice This function should only be called once during the contract deployment.
     */
    function initialize() external initializer {
        __AbstractModule_init();
    }

    /// set wait period for a compliance contract
    function setWaitPeriod(uint256 _waitPeriod) external onlyComplianceCall {
        waitPeriod[msg.sender] = _waitPeriod;
        emit WaitPeriod(msg.sender, _waitPeriod);
    }

    /**
     *  @dev See {IModule-moduleTransferAction}.
     *  add transfer limit for receiver and remove transfer limit for sender
     */
    function moduleTransferAction(
        address _from,
        address _to,
        uint256 _value
    ) external override onlyComplianceCall {
        // Remove transfer limit for sender
        _dequeueTransferLimit(msg.sender, _from, _value);
        // Add transfer limit for receiver
        _enqueueTransferLimit(msg.sender, _to, _value);
    }

    /**
     *  @dev See {IModule-moduleMintAction}.
     *  no mint action required in this module
     */
    function moduleMintAction(
        address _to,
        uint256 _value
    ) external override onlyComplianceCall {
        _enqueueTransferLimit(msg.sender, _to, _value);
    }

    /**
     *  @dev See {IModule-moduleBurnAction}.
     *  no burn action required in this module
     */
    function moduleBurnAction(
        address _from,
        uint256 _value
    ) external override onlyComplianceCall {
        Queue storage queue = transferLimits[msg.sender][_from];
        queue.balance -= _value;
    }

    function moduleCheck(
        address _from,
        address /*_to*/,
        uint256 _value,
        address _compliance
    ) external view override returns (bool) {
        if (_from == address(0)) {
            return true;
        }

        Queue storage queue = transferLimits[_compliance][_from];
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
    function canComplianceBind(
        address /*_compliance*/
    ) external view returns (bool) {
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

    /// reset queue
    function _resetQueue(Queue storage queue) internal {
        queue.start = 0;
        queue.end = 0;
    }

    /// enqueue transfer limit for a receiver
    function _enqueueTransferLimit(
        address token,
        address receiver,
        uint256 amount
    ) internal {
        if (receiver == address(0)) {
            return;
        }

        Queue storage queue = transferLimits[token][receiver];
        queue.items[queue.end] = TransferLimit(
            amount,
            block.number + waitPeriod[token]
        );
        queue.end++;
        queue.balance += amount;
    }

    /// dequeue transfer limit for a sender
    function _dequeueTransferLimit(
        address token,
        address sender,
        uint256 amount
    ) internal {
        if (sender == address(0)) {
            return;
        }

        Queue storage queue = transferLimits[token][sender];
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

        queue.balance -= amount;
    }
}
