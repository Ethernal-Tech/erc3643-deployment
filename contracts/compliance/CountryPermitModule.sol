// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.17;

import "./AbstractCountryModule.sol";

contract CountryPermitModule is AbstractCountryModule {
    /**
     *  this event is emitted whenever a country has been permitted.
     *  the event is emitted by 'countryPermit' and 'setCountriesPermission' functions.
     *  `_country` is the numeric ISO 3166-1 of the permitted country.
     */
    event CountryPermitted(address _compliance, uint16 _country);
    /**
     *  this event is emitted whenever a country permission has been removed.
     *  the event is emitted by 'removeCountryPermission' and 'setCountriesPermission' functions.
     *  `_country` is the numeric ISO 3166-1 of the country whose permission has been removed.
     */
    event CountryPermissionRemoved(address _compliance, uint16 _country);

    /**
     * @dev initializes the contract and sets the initial state.
     * @notice This function should only be called once during the contract deployment.
     */
    function initialize() external initializer {
        __AbstractModule_init();
    }

    /**
     *  @dev permits country for tokens posession.
     *  only a bound modular compliance contract can call this function
     *  emits a `CountryPermitted` event
     *  @param _country ISO 3166-1 numeric standard code of the country to be permitted
     */
    function countryPermit(uint16 _country) public onlyComplianceCall {
        _setCountryStatus(msg.sender, _country, true);
        emit CountryPermitted(msg.sender, _country);
    }

    /**
     *  @dev removes country permission for tokens posession.
     *  only a bound modular compliance contract can call this function
     *  emits a `CountryPermissionRemoved` event
     *  @param _country ISO 3166-1 numeric standard code of the country whose permission is to be removed
     */
    function removeCountryPermission(uint16 _country) public onlyComplianceCall {
        _setCountryStatus(msg.sender, _country, false);
        emit CountryPermissionRemoved(msg.sender, _country);
    }

    /**
     *  @dev sets countries permission in batch.
     *  only a bound modular compliance contract can call this function
     *  emits `CountryPermitted` and `CountryPermissionRemoved` events
     *  @param _countries countries to be permitted/disallowed, should be expressed by numeric ISO 3166-1 standard code
     *  @param _permissions permissions to be set for the countries, true to permit, false to disallow
     */
    function setCountriesPermission(uint16[] calldata _countries, bool[] calldata _permissions) external onlyComplianceCall {
        for (uint256 i = 0; i < _countries.length; i++) {
            if (_permissions[i]) {
                countryPermit(_countries[i]);
            } else {
                removeCountryPermission(_countries[i]);
            }
        }
    }

    /**
     *  @dev See {IModule-moduleCheck}.
     *  checks if the country of address _to is permitted for this _compliance
     *  returns TRUE if the country of _to is permitted for this _compliance
     *  returns FALSE if the country of _to is not permitted for this _compliance
     */
    function moduleCheck(
        address /*_from*/,
        address _to,
        uint256 /*_value*/,
        address _compliance
    ) external view override returns (bool) {
        uint16 receiverCountry = _getCountry(_compliance, _to);
        return isCountryPermitted(_compliance, receiverCountry);
    }

    /**
     *  @dev See {IModule-name}.
     */
    function name() public pure returns (string memory _name) {
        return "CountryPermitModule";
    }

    /**
     *  @dev checks if country is permitted for a given compliance contract
     *  @param _compliance the modular compliance address
     *  @param _country, numeric ISO 3166-1 standard code of the country to be checked
     *  @return true if the `_country` is permitted
     */
    function isCountryPermitted(address _compliance, uint16 _country) public view returns (bool) {
        return _countriesStatus[_compliance][_country];
    }
}
