// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.17;

import "@tokenysolutions/t-rex/contracts/token/IToken.sol";
import "@tokenysolutions/t-rex/contracts/compliance/modular/IModularCompliance.sol";
import "@tokenysolutions/t-rex/contracts/compliance/modular/modules/AbstractModuleUpgradeable.sol";

abstract contract AbstractCountryModule is AbstractModuleUpgradeable {
    /// permitted/restricted countries per compliance contract
    mapping(address => mapping(uint16 => bool)) internal _countriesStatus;

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
     *  @dev sets the country status for a given country code
     *  @param _compliance the modular compliance address
     *  @param _country the ISO 3166-1 standard country code to set the status for
     *  @param _status the status to set for the country
     */
    function _setCountryStatus(address _compliance, uint16 _country, bool _status) internal {
        _countriesStatus[_compliance][_country] = _status;
    }
    
    /**
     *  @dev gets the country for a given user account address
     *  @param _compliance the modular compliance address
     *  @param _address the wallet address to get the country for
     *  @return the ISO 3166-1 standard country code for the given user account address
     */
    function _getCountry(address _compliance, address _address) internal view returns (uint16) {
        return IToken(IModularCompliance(_compliance).getTokenBound()).identityRegistry().investorCountry(_address);
    }
}
