// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.17;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

import "@tokenysolutions/t-rex/contracts/roles/AgentRole.sol";
import "@tokenysolutions/t-rex/contracts/token/IToken.sol";

contract MarketplaceManager is Initializable, OwnableUpgradeable, UUPSUpgradeable {
    /// contains swap transfer data: sender address, token address and amount to deliver
    struct Delivery {
        address sender;
        address token;
        uint256 amount;
    }

    /// contains transfer fee data for a given parity of tokens
    struct TransferFee {
        uint token1Fee;
        uint token2Fee;
        uint feeBase;
        address fee1Wallet;
        address fee2Wallet;
    }
    
    /// contains computed tx fees for a given transfer
    struct TxFees {
        uint txFee1;
        uint txFee2;
        address fee1Wallet;
        address fee2Wallet;
    }

    /// fees per parity of tokens
    mapping(bytes32 => TransferFee) private _transferFees;

    /// token1 taking part in transfer
    mapping(bytes32 => Delivery) private _token1ToDeliver;

    /// token2 taking part in transfer
    mapping(bytes32 => Delivery) private _token2ToDeliver;

    /// transfer nonce
    uint256 private _transferNonce;

    /**
     * @dev Emitted when a transfer is initiated by `maker` to swap `token1Amount` tokens `token1` (ERC3643 or not)
     * for `token2Amount` tokens `token2` with `taker`
     * this event is emitted by the `initiateTransfer` function
     */
    event TransferInitiated(
        bytes32 indexed transferID,
        address maker,
        address indexed token1,
        uint256 token1Amount,
        address taker,
        address indexed token2,
        uint256 token2Amount);

    /**
     * @dev Emitted when a transfer is validated by `taker` and
     * executed either by `taker` either by the agent of the tokens involved in the transfer
     * this event is emitted by the `takeTransfer` function
     */
    event TransferExecuted(bytes32 indexed transferID);

    /**
     * @dev Emitted when a transfer is cancelled
     * this event is emitted by the `cancelTransfer` function
     */
    event TransferCancelled(bytes32 indexed transferID);

    /**
     * @dev Emitted when a fee is set for a given parity of tokens
     * this event is emitted by the `setTransferFee` function
     */
    event TransferFeeSet(
        bytes32 indexed parity,
        address token1,
        address token2,
        uint fee1,
        uint fee2,
        uint feeBase,
        address fee1Wallet,
        address fee2Wallet);

    /**
     * @dev initializes the contract and sets the initial state.
     * @notice This function should only be called once during the contract deployment.
     */
    function initialize() external initializer {
        __Ownable_init();
    }

    /**
     *  @dev authorizes the upgrade of the contract implementation
     *  only the owner can authorize the upgrade
     */
    // solhint-disable-next-line no-empty-blocks
    function _authorizeUpgrade(address /*newImplementation*/) internal override virtual onlyOwner { }

    /**
     *  @dev set fees applied to a parity of tokens (tokens can be ERC3643 or ERC20)
     *  @param _token1 address of the 1st token for the parity `_token1`/`_token2`
     *  @param _token2 address of the counterpart token for the parity `_token1`/`_token2`
     *  @param _fee1 the fee to apply on `_token1` leg of the transfer per 10^`_feeBase`
     *  @param _fee2 the fee to apply on `_token2` leg of the transfer per 10^`_feeBase`
     *  @param _feeBase the precision of the fee setting, e.g.
     *  if `_feeBase` == 2 then `_fee1` and `_fee2` are in % (fee/10^`_feeBase`)
     *  @param _fee1Wallet wallet address receiving fees applied on `_token1`
     *  @param _fee2Wallet wallet address receiving fees applied on `_token2`
     *  @notice
     *  `_token1` and `_token2` has to be ERC20 or ERC3643 token addresses, otherwise the transaction will fail
     *  `msg.sender` has to be owner of ERC3643 token involved in the parity (if any)
     *  requires fees to be lower than 100%
     *  requires `_feeBase` to be higher or equal to 2 (precision 10^2)
     *  requires `_feeBase` to be lower or equal to 5 (precision 10^5) to avoid overflows
     *  requires `_fee1Wallet` & `_fee2Wallet` to be non empty addresses if `_fee1` & `_fee2` are respectively set
     *  note that if fees are not set for a parity the default fee is basically 0%
     *  emits a `TransferFeeSet` event
     */
    function setTransferFee(
        address _token1,
        address _token2,
        uint _fee1,
        uint _fee2,
        uint _feeBase,
        address _fee1Wallet,
        address _fee2Wallet) external {
        require(
            isTokenOwner(_token1, msg.sender) ||
            isTokenOwner(_token2, msg.sender)
            , "Ownable: only owner can call");
        require(
            IERC20(_token1).totalSupply() != 0 &&
            IERC20(_token2).totalSupply() != 0
            , "invalid address : address is not an ERC20");
        require(
            _fee1 <= 10**_feeBase && _fee1 >= 0 &&
            _fee2 <= 10**_feeBase && _fee2 >= 0 &&
            _feeBase <= 5 &&
            _feeBase >= 2
            , "invalid fee settings");
        if (_fee1 > 0) {
            require(_fee1Wallet != address(0), "fee wallet 1 cannot be zero address");
        }
        if (_fee2 > 0) {
            require(_fee2Wallet != address(0), "fee wallet 2 cannot be zero address");
        }

        // compute fee for the parity
        bytes32 _parity = computeParity(_token1, _token2);
        TransferFee memory fee;
        fee.token1Fee = _fee1;
        fee.token2Fee = _fee2;
        fee.feeBase = _feeBase;
        fee.fee1Wallet = _fee1Wallet;
        fee.fee2Wallet = _fee2Wallet;
        _transferFees[_parity] = fee;
        emit TransferFeeSet(_parity, _token1, _token2, _fee1, _fee2, _feeBase, _fee1Wallet, _fee2Wallet);

        // mirror fee for the reverse parity
        bytes32 _mirrorParity = computeParity(_token2, _token1);
        TransferFee memory mirrorFee;
        mirrorFee.token1Fee = _fee2;
        mirrorFee.token2Fee = _fee1;
        mirrorFee.feeBase = _feeBase;
        mirrorFee.fee1Wallet = _fee2Wallet;
        mirrorFee.fee2Wallet = _fee1Wallet;
        _transferFees[_mirrorParity] = mirrorFee;
        emit TransferFeeSet(_mirrorParity, _token2, _token1, _fee2, _fee1, _feeBase, _fee2Wallet, _fee1Wallet);
    }

    /**
     *  @dev initiates a regular or mint transfer between `msg.sender` & `_counterpart`
     *  @param _token1 address of the token (ERC20 or ERC3643) provided by `msg.sender`
     *  @param _token1Amount amount of `_token1` that `msg.sender` will send to `_counterpart` at execution time
     *  @param _counterpart address of the counterpart user, which will receive `_token1Amount` of `_token1` 
     *  in exchange for `_token2Amount` of `_token2`
     *  @param _token2 address of the token (ERC20 or ERC3643) provided by `_counterpart`
     *  @param _token2Amount amount of `_token2` that `_counterpart` will send to `msg.sender` at execution time
     *  @notice
     *  requires `msg.sender` to have enough `_token1` tokens to process the transfer
     *  requires `MarketplaceManager` contract to have the necessary allowance to process the transfer on `msg.sender`
     *  requires `_counterpart` to not be the 0 address
     *  requires `_token1` & `_token2` to be valid token addresses
     *  emits a `TransferInitiated` event
     */
    function initiateTransfer(
        address _token1,
        uint256 _token1Amount,
        address _counterpart,
        address _token2,
        uint256 _token2Amount
    ) external {
        _initiateTransfer(_token1, _token1Amount, _counterpart, _token2, _token2Amount, false);
    }

    /**
     *  @dev initiates a burn transfer between `msg.sender` & `_counterpart`
     *  @param _token1 address of the token (ERC20 or ERC3643) provided by `msg.sender`
     *  @param _token1Amount amount of `_token1` that `msg.sender` will send to `_counterpart` at execution time
     *  @param _counterpart address of the counterpart user, which will receive `_token1Amount` of `_token1` 
     *  in exchange for `_token2Amount` of `_token2`
     *  @param _token2 address of the token (ERC20 or ERC3643) provided by `_counterpart`
     *  @param _token2Amount amount of `_token2` that `_counterpart` will send to `msg.sender` at execution time
     *  @notice
     *  requires `msg.sender` to have enough `_token1` tokens to process the transfer
     *  requires `_counterpart` to not be the 0 address
     *  requires `_token1` & `_token2` to be valid token addresses
     *  emits a `TransferInitiated` event
     */
    function initiateBurnTransfer(
        address _token1,
        uint256 _token1Amount,
        address _counterpart,
        address _token2,
        uint256 _token2Amount
    ) external {
        _initiateTransfer(_token1, _token1Amount, _counterpart, _token2, _token2Amount, true);
    }

    /**
     *  @dev execute a transfer that was previously initiated through the `initiateTransfer` function
     *  @param _transferID the transfer identifier as computed through
     *  the `computeTransferID` function for the initiated transfer to execute
     *  @notice
     *  requires `_transferID` to exist (transfer has to be initiated)
     *  requires that taker (counterpart sending token2) has enough tokens in balance to process the transfer
     *  requires that `MarketplaceManager` contract has enough allowance to process the `token2` leg of the transfer
     *  requires that `msg.sender` is the taker OR the token agent in case a
     *  ERC3643 token is involved in the transfer (in case of conditional transfer
     *  the agent can call the function when the transfer has been approved)
     *  if fees apply on one side or both sides of the transfer the fees will be sent,
     *  at transaction time, to the fees wallet previously set
     *  in case fees apply the both participants in transfer will receive less than the amounts
     *  included in the transfer as part of the transfer is redirected to the
     *  fee wallet at transfer execution time
     *  if one or both legs of the transfer are ERC3643, then all the relevant
     *  checks apply on the transaction (compliance + identity checks)
     *  and the transaction WILL FAIL if the ERC3643 conditions of transfer are
     *  not respected, please refer to {Token-transfer} and {Token-transferFrom} to
     *  know more about ERC3643 conditions for transfers
     *  once the transfer is executed the `_transferID` is removed from the pending `_transferID` pool
     *  emits a `TransferExecuted` event
     */
    function takeTransfer(bytes32 _transferID) external {
        Delivery memory token1 = _token1ToDeliver[_transferID];
        Delivery memory token2 = _token2ToDeliver[_transferID];
        require(token1.sender != address(0) && token2.sender != address(0), "transfer ID does not exist");
        IERC20 token1Contract = IERC20(token1.token);
        IERC20 token2Contract = IERC20(token2.token);
        require (
            msg.sender == token2.sender ||
            isTokenAgent(token1.token, msg.sender) ||
            isTokenAgent(token2.token, msg.sender)
            , "transfer has to be executed by the counterpart or by token agent");
        require(token2Contract.balanceOf(token2.sender) >= token2.amount, "not enough tokens in balance");
        require(token2Contract.allowance(token2.sender, address(this)) >= token2.amount,
            "not enough allowance to transfer");

        TxFees memory fees = computeFee(_transferID);
        token1Contract.transferFrom(token1.sender, token2.sender, (token1.amount - fees.txFee1));
        if (fees.txFee1 != 0) {
            token1Contract.transferFrom(token1.sender, fees.fee1Wallet, fees.txFee1);
        }
        token2Contract.transferFrom(token2.sender, token1.sender, (token2.amount - fees.txFee2));
        if (fees.txFee2 != 0) {
            token2Contract.transferFrom(token2.sender, fees.fee2Wallet, fees.txFee2);
        }
        delete _token1ToDeliver[_transferID];
        delete _token2ToDeliver[_transferID];
        emit TransferExecuted(_transferID);
    }

    /**
     *  @dev execute a mint transfer that was previously initiated through the `initiateTransfer` function
     *  @param _transferID the transfer identifier as computed through
     *  the `computeTransferID` function for the initiated transfer to execute
     *  @notice
     *  requires `_transferID` to exist (transfer has to be initiated)
     *  requires that token2 contract is an ERC3643 token
     *  requires that token2 sender is the owner of token2 contract
     *  requires that `msg.sender` is the token agent of token2 contract
     *  in case fees apply the token2 owner will receive less than the amount
     *  included in the transfer as part of the transfer is redirected to the
     *  fee wallet at transfer execution time
     *  once the mint transfer is executed the `_transferID` is removed from the pending `_transferID` pool
     *  emits a `TransferExecuted` event
     */
    function takeMintTransfer(bytes32 _transferID) external {
        Delivery memory token1 = _token1ToDeliver[_transferID];
        Delivery memory token2 = _token2ToDeliver[_transferID];
        require(token1.sender != address(0) && token2.sender != address(0), "transfer ID does not exist");
        IERC20 token1Contract = IERC20(token1.token);
        IToken token2Contract = IToken(token2.token);
        require (
            isERC3643(token2.token) &&
            isTokenOwner(token2.token, token2.sender) &&
            isTokenAgent(token2.token, msg.sender)
            , "mint has to be executed by minting token agent and minting token owner has to be taker");
        
        TxFees memory fees = computeFee(_transferID);
        token1Contract.transferFrom(token1.sender, token2.sender, (token1.amount - fees.txFee1));
        if (fees.txFee1 != 0) {
            token1Contract.transferFrom(token1.sender, fees.fee1Wallet, fees.txFee1);
        }
        // no fees on minting action, mint goes to maker from token2 contract
        token2Contract.mint(token1.sender, token2.amount);
        delete _token1ToDeliver[_transferID];
        delete _token2ToDeliver[_transferID];
        emit TransferExecuted(_transferID);
    }

    /**
     *  @dev execute a burn transfer that was previously initiated through the `initiateTransfer` function
     *  @param _transferID the transfer identifier as computed through
     *  the `computeTransferID` function for the initiated transfer to execute
     *  @notice
     *  requires `_transferID` to exist (transfer has to be initiated)
     *  requires that token1 contract is an ERC3643 token
     *  requires that token2 sender is the owner of token1 contract
     *  requires that `msg.sender` is the token agent of token1 contract
     *  in case fees apply the token1 sender will receive less than the amount
     *  included in the transfer as part of the transfer is redirected to the
     *  fee wallet at transfer execution time
     *  once the burn transfer is executed the `_transferID` is removed from the pending `_transferID` pool
     *  emits a `TransferExecuted` event
     */
    function takeBurnTransfer(bytes32 _transferID) external {
        Delivery memory token1 = _token1ToDeliver[_transferID];
        Delivery memory token2 = _token2ToDeliver[_transferID];
        require(token1.sender != address(0) && token2.sender != address(0), "transfer ID does not exist");
        IToken token1Contract = IToken(token1.token);
        IERC20 token2Contract = IERC20(token2.token);
        require (
            isERC3643(token1.token) &&
            isTokenOwner(token1.token, token2.sender) &&
            isTokenAgent(token1.token, msg.sender)
            , "burn has to be executed by burning token agent and burning token owner has to be taker");
        require(token2Contract.balanceOf(token2.sender) >= token2.amount, "not enough tokens in balance");
        require(token2Contract.allowance(token2.sender, address(this)) >= token2.amount,
            "not enough allowance to transfer");

        TxFees memory fees = computeFee(_transferID);
        token2Contract.transferFrom(token2.sender, token1.sender, (token2.amount - fees.txFee2));
        if (fees.txFee2 != 0) {
            token2Contract.transferFrom(token2.sender, fees.fee2Wallet, fees.txFee2);
        }
        // no fees on burning action, burn happens for token1 contract on maker account 
        token1Contract.burn(token1.sender, token1.amount);
        delete _token1ToDeliver[_transferID];
        delete _token2ToDeliver[_transferID];
        emit TransferExecuted(_transferID);
    }

    /**
     *  @dev cancel a pending transfer that was previously initiated
     *  through the `initiateTransfer` function from the pool
     *  @param _transferID the transfer identifier as computed through
     *  the `computeTransferID` function for the initiated transfer to delete
     *  @notice
     *  requires `_transferID` to exist (transfer has to be initiated)
     *  requires that `msg.sender` is the taker or the maker
     *  or the ERC3643 agent in case an ERC3643 token is involved in the transfer
     *  once the `cancelTransfer` is executed the `_transferID` is removed from the pending `_transferID` pool
     *  emits a `TransferCancelled` event
     */
    function cancelTransfer(bytes32 _transferID) external {
        Delivery memory token1 = _token1ToDeliver[_transferID];
        Delivery memory token2 = _token2ToDeliver[_transferID];
        require(token1.sender != address(0) && token2.sender != address(0), "transfer ID does not exist");
        require (
            msg.sender == token1.sender ||
            msg.sender == token2.sender ||
            isTokenAgent(token1.token, msg.sender) ||
            isTokenAgent(token2.token, msg.sender)
            , "you are not allowed to cancel this transfer");
        delete _token1ToDeliver[_transferID];
        delete _token2ToDeliver[_transferID];
        emit TransferCancelled(_transferID);
    }

    /**
     *  @dev check if `_token` corresponds to a functional ERC3643 token (with identity registry initiated)
     *  @param _token token address to check
     *  @notice
     *  the function will try to call `identityRegistry()` on
     *  the address, which is a getter specific to ERC3643 tokens
     *  if the call pass and returns an address it means that
     *  the token is an ERC3643, otherwise it's not an ERC3643
     *  @return bool `true` if the token is an ERC3643, `false` otherwise
     */
    function isERC3643(address _token) public view returns (bool) {
        try IToken(_token).identityRegistry() returns (IIdentityRegistry _ir) {
            if (address(_ir) != address(0)) {
                return true;
            }
        return false;
        }
        catch {
            return false;
        }
    }

    /**
     *  @dev check if `_user` is a `_token` agent
     *  @param _token token address to check
     *  @param _user user wallet address to check
     *  @notice if `_token` is an ERC3643 token this function will check if `_user` is registered as an agent on it
     *  @return bool `true` if `_user` is agent of `_token`, return `false` otherwise
     */
    function isTokenAgent(address _token, address _user) public view returns (bool) {
        if (isERC3643(_token)){
            return AgentRole(_token).isAgent(_user);
        }
        return false;
    }

    /**
     *  @dev check if `_user` is a `_token` owner
     *  @param _token token address to check
     *  @param _user user wallet address to check
     *  @notice if `_token` is an ERC3643 token this function will check if `_user` is registered as an owner on it
     *  @return bool `true` if `_user` is owner of `_token`, return `false` otherwise
     */
    function isTokenOwner(address _token, address _user) public view returns (bool) {
        if (isERC3643(_token)){
            return Ownable(_token).owner() == _user;
        }
        return false;
    }

    /**
     *  @dev computes tx fees to apply to a specific transfer depending
     *  on the transfer fees applied to the parity used in the transfer
     *  @param _transferID transfer identifier as computed through the
     *  `computeTransferID` function
     *  @notice requires `_transferID` to exist (transfer has to be initiated)
     *  @return TxFees fees to apply on each leg of the transfer in the form of a `TxFees` struct
     */
    function computeFee(bytes32 _transferID) public view returns(TxFees memory) {
        TxFees memory fees;
        Delivery memory token1 = _token1ToDeliver[_transferID];
        Delivery memory token2 = _token2ToDeliver[_transferID];
        require(token1.sender != address(0) && token2.sender != address(0), "transfer ID does not exist");
        bytes32 parity = computeParity(token1.token, token2.token);
        TransferFee memory feeDetails = _transferFees[parity];
        if (feeDetails.token1Fee != 0 || feeDetails.token2Fee != 0 ){
            uint _txFee1 =
            (token1.amount * feeDetails.token1Fee * 10**(feeDetails.feeBase - 2)) / (10**feeDetails.feeBase);
            uint _txFee2 =
            (token2.amount * feeDetails.token2Fee * 10**(feeDetails.feeBase - 2)) / (10**feeDetails.feeBase);
            fees.txFee1 = _txFee1;
            fees.txFee2 = _txFee2;
            fees.fee1Wallet = feeDetails.fee1Wallet;
            fees.fee2Wallet = feeDetails.fee2Wallet;
            return fees;
        }
        else {
            fees.txFee1 = 0;
            fees.txFee2 = 0;
            fees.fee1Wallet = address(0);
            fees.fee2Wallet = address(0);
            return fees;
        }
    }

    /**
     *  @dev computes token parity byte signature
     *  @param _token1 address of the 1st token
     *  @param _token2 address of the counterpart token
     *  @return bytes32 parity byte signature
     */
    function computeParity (address _token1, address _token2) public pure returns (bytes32) {
        return keccak256(abi.encode(_token1, _token2));
    }

    /**
     *  @dev computes transferID depending on transfer parameters
     *  @param _nonce the nonce of the transfer on the smart contract
     *  @param _maker the address of the transfer maker (initiator of the transfer)
     *  @param _token1 the address of the token that the maker is providing
     *  @param _token1Amount the amount of tokens `_token1` provided by the maker
     *  @param _taker the address of the transfer taker (executor of the transfer)
     *  @param _token2 the address of the token that the taker is providing
     *  @param _token2Amount the amount of tokens `_token2` provided by the taker
     *  @return bytes32 the identifier of the transfer as a byte signature
     */
    function computeTransferID (
        uint256 _nonce,
        address _maker,
        address _token1,
        uint256 _token1Amount,
        address _taker,
        address _token2,
        uint256 _token2Amount
    ) public pure returns (bytes32){
        return keccak256(abi.encode(_nonce, _maker, _token1, _token1Amount, _taker, _token2, _token2Amount));
    }

    /**
     *  @dev initiates a transfer between `msg.sender` & `_counterpart`
     *  @param _token1 address of the token (ERC20 or ERC3643) provided by `msg.sender`
     *  @param _token1Amount amount of `_token1` that `msg.sender` will send to `_counterpart` at execution time
     *  @param _counterpart address of the counterpart user, which will receive `_token1Amount` of `_token1` 
     *  in exchange for `_token2Amount` of `_token2`
     *  @param _token2 address of the token (ERC20 or ERC3643) provided by `_counterpart`
     *  @param _token2Amount amount of `_token2` that `_counterpart` will send to `msg.sender` at execution time
     *  @param _isBurn if burn transfer is initiated
     *  @notice
     *  requires `msg.sender` to have enough `_token1` tokens to process the transfer
     *  requires MarketplaceManager contract to have the necessary allowance
     *  on `msg.sender` token1 to process the transfer (only for non burning transfers)
     *  requires `_counterpart` to not be the 0 address
     *  requires `_token1` & `_token2` to be valid token addresses
     *  emits a `TransferInitiated` event
     */
    function _initiateTransfer(
        address _token1,
        uint256 _token1Amount,
        address _counterpart,
        address _token2,
        uint256 _token2Amount,
        bool _isBurn
    ) internal {
        require(IERC20(_token1).balanceOf(msg.sender) >= _token1Amount, "not enough tokens in balance");
        if (!_isBurn) {
            require(IERC20(_token1).allowance(msg.sender, address(this)) >= _token1Amount,
                "not enough allowance to initiate transfer");
        }
        require (_counterpart != address(0), "counterpart address cannot be null");
        require(IERC20(_token2).totalSupply() != 0, "invalid token2 address: address is not an ERC20");

        // token1 sender, amount and address
        Delivery memory token1;
        token1.sender = msg.sender;
        token1.token = _token1;
        token1.amount = _token1Amount;

        // token2 sender, amount and address
        Delivery memory token2;
        token2.sender = _counterpart;
        token2.token = _token2;
        token2.amount = _token2Amount;

        // store transfer data and emit event
        bytes32 transferID =
        computeTransferID(
                _transferNonce,
                token1.sender,
                token1.token,
                token1.amount,
                token2.sender,
                token2.token,
                token2.amount);
        _token1ToDeliver[transferID] = token1;
        _token2ToDeliver[transferID] = token2;
        emit TransferInitiated(
                transferID,
                token1.sender,
                token1.token,
                token1.amount,
                token2.sender,
                token2.token,
                token2.amount);
        _transferNonce++;
    }
}
