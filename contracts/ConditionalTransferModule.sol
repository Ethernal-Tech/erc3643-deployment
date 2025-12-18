// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.17;

import "@tokenysolutions/t-rex/contracts/roles/AgentRole.sol";
import "@tokenysolutions/t-rex/contracts/compliance/modular/IModularCompliance.sol";
import "@tokenysolutions/t-rex/contracts/compliance/modular/modules/AbstractModuleUpgradeable.sol";

contract ConditionalTransferModule is AbstractModuleUpgradeable {
    /// mapping between transfer details and their approval status (amount of transfers approved) per compliance
    mapping(address => mapping(bytes32 => uint)) private _transfersApproved;

    /**
     *  this event is emitted whenever a transfer is approved.
     *  the event is emitted by 'approveTransfer' function.
     *  `_from` is the address of transfer sender.
     *  `_to` is the address of transfer recipient
     *  `_amount` is the token amount to be sent (take care of decimals)
     *  `_token` is the token address of the token concerned by the approval
     */
    event TransferApproved(address _from, address _to, uint _amount, address _token);

    /**
     *  this event is emitted whenever a transfer approval is removed.
     *  the event is emitted by 'unApproveTransfer' function.
     *  `_from` is the address of transfer sender.
     *  `_to` is the address of transfer recipient
     *  `_amount` is the token amount to be sent (take care of decimals)
     *  `_token` is the token address of the token concerned by the approval
     */
    event ApprovalRemoved(address _from, address _to, uint _amount, address _token);

    /**
     * @dev initializes the contract and sets the initial state.
     * @notice This function should only be called once during the contract deployment.
     */
    function initialize() external initializer {
        __AbstractModule_init();
    }

    /**
    *  @dev approves a transfer
    *  once a transfer is approved, the sender is allowed to execute it
    *  @param _from the address of the transfer sender
    *  @param _to the address of the transfer receiver
    *  @param _amount the amount of tokens that `_from` would send to `_to`
    *  Only a bound compliance can call this function
    *  emits a `TransferApproved` event
    */
    function approveTransfer(address _from, address _to, uint _amount) public onlyComplianceCall {
        bytes32 transferHash = calculateTransferHash(_from, _to, _amount, IModularCompliance(msg.sender).getTokenBound());
        _transfersApproved[msg.sender][transferHash]++;
        emit TransferApproved(_from, _to, _amount, IModularCompliance(msg.sender).getTokenBound());
    }

    /**
    *  @dev removes approval on a transfer previously approved
    *  requires the transfer to be previously approved
    *  once a transfer approval is removed, the sender is not allowed to execute it anymore
    *  @param _from the address of the transfer sender
    *  @param _to the address of the transfer receiver
    *  @param _amount the amount of tokens that `_from` was allowed to send to `_to`
    *  Only a bound compliance can call this function
    *  emits an `ApprovalRemoved` event
    */
    function unapproveTransfer(address _from, address _to, uint _amount) public onlyComplianceCall {
        bytes32 transferHash = calculateTransferHash(_from, _to, _amount, IModularCompliance(msg.sender).getTokenBound());
        require(_transfersApproved[msg.sender][transferHash] > 0, "not approved");
        _transfersApproved[msg.sender][transferHash]--;
        emit ApprovalRemoved(_from, _to, _amount, IModularCompliance(msg.sender).getTokenBound());
    }

/**
    *  @dev approves transfers in batch
    *  once a transfer is approved, the sender is allowed to execute it
    *  @notice the transaction could exceed gas limit if `_from.length` is too high
    *  @param _from the array of addresses of the transfer senders
    *  @param _to the array of addresses of the transfer receivers
    *  @param _amount the array of tokens amounts that `_from` would send to `_to`
    *  Only a bound compliance can call this function
    *  emits `_from.length` `TransferApproved` events
    */
    function batchApproveTransfers(address[] calldata _from, address[] calldata _to, uint[] calldata _amount)
    external onlyComplianceCall {
        for (uint256 i = 0; i < _from.length; i++){
            approveTransfer(_from[i], _to[i], _amount[i]);
        }
    }

    /**
    *  @dev removes approval on a transfer previously approved
    *  requires the transfer to be previously approved
    *  once a transfer approval is removed, the sender is not allowed to execute it anymore
    *  @notice the transaction could exceed gas limit if `_from.length` is too high
    *  @param _from the array of addresses of the transfer senders
    *  @param _to the array of addresses of the transfer receivers
    *  @param _amount the array of token amounts that `_from` were allowed to send to `_to`
    *  Only a bound compliance can call this function
    *  emits `_from.length` `ApprovalRemoved` events
    */
    function batchUnapproveTransfers(address[] calldata _from, address[] calldata _to, uint[] calldata _amount)
    external onlyComplianceCall {
        for (uint256 i = 0; i < _from.length; i++){
            unapproveTransfer(_from[i], _to[i], _amount[i]);
        }
    }
    
    /**
     *  @dev See {IModule-moduleTransferAction}.
     */
    function moduleTransferAction(
        address _from,
        address _to,
        uint256 _value)
    external override onlyComplianceCall {
        bytes32 transferHash = calculateTransferHash(_from, _to, _value, IModularCompliance(msg.sender).getTokenBound());
        // if the transfer was approved, remove the approval. otherwise do nothing (to allow forced transfers)
        if(_transfersApproved[msg.sender][transferHash] > 0) {
            _transfersApproved[msg.sender][transferHash]--;
            emit ApprovalRemoved(_from, _to, _value, IModularCompliance(msg.sender).getTokenBound());
        }
    }

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
        address _to,
        uint256 _value,
        address _compliance
    ) external view override returns (bool) {
        if (_from == address(0) || _isTokenAgent(_compliance, _from)) {
            return true;
        }

        bytes32 transferHash = calculateTransferHash(_from, _to, _value, IModularCompliance(_compliance).getTokenBound());
        return isTransferApproved(_compliance, transferHash);
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
        return "ConditionalTransferModule";
    }

    /**
     *  @dev Calculates the hash of a transfer approval
     *  @param _from the address of the transfer sender
     *  @param _to the address of the transfer receiver
     *  @param _amount the amount of tokens that `_from` would send to `_to`
     *  @param _token the address of the token that would be transferred
     *  returns the transferId of the transfer
     */
    function calculateTransferHash (
        address _from,
        address _to,
        uint _amount,
        address _token
    ) public pure returns (bytes32){
        bytes32 transferHash = keccak256(abi.encode(_from, _to, _amount, _token));
        return transferHash;
    }

    /**
     *  @dev Returns true if transfer is approved
     *  @param _compliance the modular compliance address
     *  @param _transferHash, bytes corresponding to the transfer details, hashed
     *  requires `_compliance` to be bound to this module
     */
    function isTransferApproved(address _compliance, bytes32 _transferHash) public view returns (bool) {
        if (((_transfersApproved[_compliance])[_transferHash]) > 0) {
            return true;
        }
        return false;
    }

    /**
     *  @dev Returns the amount of identical transfers approved
     *  @param _compliance the modular compliance address
     *  @param _transferHash, bytes corresponding to the transfer details, hashed
     *  requires `_compliance` to be bound to this module
     */
    function getTransferApprovals(address _compliance, bytes32 _transferHash) public view returns (uint) {
        return (_transfersApproved[_compliance])[_transferHash];
    }

    /**
     *  @dev checks if the given user address is an agent of token
     *  @param _compliance the Compliance smart contract to be checked
     *  @param _userAddress ONCHAIN identity of the user
     *  internal function, can be called only from the functions of the Compliance smart contract
     */
    function _isTokenAgent(address _compliance, address _userAddress) internal view returns (bool) {
        return AgentRole(IModularCompliance(_compliance).getTokenBound()).isAgent(_userAddress);
    }
}
