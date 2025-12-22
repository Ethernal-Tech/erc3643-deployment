// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.17;

import "@tokenysolutions/t-rex/contracts/roles/AgentRole.sol";
import "@tokenysolutions/t-rex/contracts/compliance/modular/IModularCompliance.sol";
import "@tokenysolutions/t-rex/contracts/compliance/modular/modules/AbstractModuleUpgradeable.sol";

contract ApproveTransferModule is AbstractModuleUpgradeable {
    /// approved transfers per modular compliance contract
    mapping(address => mapping(bytes32 => uint)) private _approvedTransfers;

    /**
     *  this event is emitted whenever a transfer is approved.
     *  the event is emitted by 'approveTransfer' function.
     *  `_from` is the address of transfer sender.
     *  `_to` is the address of transfer recipient.
     *  `_amount` is the token amount to be sent.
     *  `_token` is address of the token taking part in the transfer.
     */
    event TransferApproved(address _from, address _to, uint _amount, address _token);

    /**
     *  this event is emitted whenever a transfer approval is removed.
     *  the event is emitted by 'unApproveTransfer' function.
     *  `_from` is the address of transfer sender.
     *  `_to` is the address of transfer recipient.
     *  `_amount` is the token amount to be sent.
     *  `_token` is address of the token taking part in the transfer.
     */
    event TransferApprovalRemoved(address _from, address _to, uint _amount, address _token);

    /**
     *  @dev error thrown when a transfer is not approved
     *  @param _from address of the transfer sender
     *  @param _to address of the transfer recipient
     *  @param _amount token amount to be sent
     */
    error TransferNotApproved(address _from, address _to, uint _amount);

    /**
     * @dev initializes the contract and sets the initial state.
     * @notice This function should only be called once during the contract deployment.
     */
    function initialize() external initializer {
        __AbstractModule_init();
    }

    /**
     *  @dev approves a transfer
     *  only a bound modular compliance contract can call this function
     *  emits a `TransferApproved` event
     *  @param _from the address of the transfer sender
     *  @param _to the address of the transfer receiver
     *  @param _amount the amount of tokens that `_from` would send to `_to`
     */
    function approveTransfer(address _from, address _to, uint _amount) public onlyComplianceCall {
        bytes32 transferHash = _computeTransferHash(_from, _to, _amount, IModularCompliance(msg.sender).getTokenBound());
        _approvedTransfers[msg.sender][transferHash]++;
        emit TransferApproved(_from, _to, _amount, IModularCompliance(msg.sender).getTokenBound());
    }

    /**
     *  @dev removes approval on a transfer previously approved
     *  requires the transfer to be previously approved
     *  only a bound modular compliance contract can call this function
     *  emits an `TransferApprovalRemoved` event
     *  @param _from the address of the transfer sender
     *  @param _to the address of the transfer receiver
     *  @param _amount the amount of tokens that `_from` was allowed to send to `_to`
     */
    function unapproveTransfer(address _from, address _to, uint _amount) public onlyComplianceCall {
        bytes32 transferHash = _computeTransferHash(_from, _to, _amount, IModularCompliance(msg.sender).getTokenBound());
        if (_approvedTransfers[msg.sender][transferHash] == 0) {
            revert TransferNotApproved(_from, _to, _amount);
        }
        _approvedTransfers[msg.sender][transferHash]--;
        emit TransferApprovalRemoved(_from, _to, _amount, IModularCompliance(msg.sender).getTokenBound());
    }

    /**
     *  @dev approves transfers in batch
     *  only a bound modular compliance contract can call this function
     *  emits `_from.length` `TransferApproved` events
     *  @param _from the array of addresses of the transfer senders
     *  @param _to the array of addresses of the transfer receivers
     *  @param _amount the array of tokens amounts that `_from` would send to `_to`
     *  @notice the transaction could exceed gas limit if `_from.length` is too high
     */
    function batchApproveTransfers(address[] calldata _from, address[] calldata _to, uint[] calldata _amount)
    external onlyComplianceCall {
        for (uint256 i = 0; i < _from.length; i++){
            approveTransfer(_from[i], _to[i], _amount[i]);
        }
    }

    /**
     *  @dev removes approval transfers in batch
     *  requires all transfers in the batch to be previously approved
     *  only a bound modular compliance contract can call this function
     *  emits `_from.length` `TransferApprovalRemoved` events
     *  @param _from the array of addresses of the transfer senders
     *  @param _to the array of addresses of the transfer receivers
     *  @param _amount the array of token amounts that `_from` were allowed to send to `_to`
     *  @notice the transaction could exceed gas limit if `_from.length` is too high
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
        bytes32 transferHash = _computeTransferHash(_from, _to, _value, IModularCompliance(msg.sender).getTokenBound());
        // if the transfer was approved, remove the approval. otherwise do nothing (to allow forced transfers)
        if(_approvedTransfers[msg.sender][transferHash] > 0) {
            _approvedTransfers[msg.sender][transferHash]--;
            emit TransferApprovalRemoved(_from, _to, _value, IModularCompliance(msg.sender).getTokenBound());
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
        if (_from == address(0) || _isTokenOwner(_compliance, _from)) {
            return true;
        }

        bytes32 transferHash = _computeTransferHash(_from, _to, _value, IModularCompliance(_compliance).getTokenBound());
        return _isTransferApproved(_compliance, transferHash);
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
        return "ApproveTransferModule";
    }

    /**
     *  @dev computes transfer details hash
     *  @param _from address of the transfer sender
     *  @param _to address of the transfer receiver
     *  @param _amount amount of tokens for transfer
     *  @param _token address of the token involved in the transfer
     *  @return bytes32 hash of the transfer details
     */
    function _computeTransferHash (
        address _from,
        address _to,
        uint _amount,
        address _token
    ) internal pure returns (bytes32){
        return keccak256(abi.encode(_from, _to, _amount, _token));
    }

    /**
     *  @dev checks if a transfer is approved
     *  @param _compliance the modular compliance address
     *  @param _transferHash, bytes corresponding to the transfer details, hashed
     *  @return true if the transfer is approved
     */
    function _isTransferApproved(address _compliance, bytes32 _transferHash) internal view returns (bool) {
        if (((_approvedTransfers[_compliance])[_transferHash]) > 0) {
            return true;
        }
        return false;
    }

    /**
     *  @dev checks if the given address is a token owner
     *  @param _compliance the modular compliance address
     *  @param _address user address to be checked
     *  @return true if the `_address` is the token owner
     */
    function _isTokenOwner(address _compliance, address _address) internal view returns (bool) {
        return Ownable(IModularCompliance(_compliance).getTokenBound()).owner() == _address;
    }
}
