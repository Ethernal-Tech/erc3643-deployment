// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.17;

import "./AbstractCountryModule.sol";

contract CountryRestrictModule is AbstractCountryModule {
    /**
     *  this event is emitted whenever a country has been restricted.
     *  the event is emitted by 'countryRestrict' and 'setCountriesRestriction' functions.
     *  `_country` is the numeric ISO 3166-1 of the restricted country.
     */
    event CountryRestricted(address _compliance, uint16 _country);
    /**
     *  this event is emitted whenever a country restriction has been removed.
     *  the event is emitted by 'removeCountryRestriction' and 'setCountriesRestriction' functions.
     *  `_country` is the numeric ISO 3166-1 of the country whose restriction has been removed.
     */
    event CountryRestrictionRemoved(address _compliance, uint16 _country);

    /**
     * @dev initializes the contract and sets the initial state.
     * @notice This function should only be called once during the contract deployment.
     */
    function initialize() external initializer {
        __AbstractModule_init();
    }

    /**
     *  @dev restricts country for tokens posession.
     *  only a bound modular compliance contract can call this function
     *  emits a `CountryRestricted` event
     *  @param _country ISO 3166-1 numeric standard code of the country to be restricted
     */
    function countryRestrict(uint16 _country) public onlyComplianceCall {
        _setCountryStatus(msg.sender, _country, true);
        emit CountryRestricted(msg.sender, _country);
    }

    /**
     *  @dev removes country restriction for tokens posession.
     *  only a bound modular compliance contract can call this function
     *  emits a `CountryRestrictionRemoved` event
     *  @param _country ISO 3166-1 numeric standard code of the country whose restriction is to be removed
     */
    function removeCountryRestriction(uint16 _country) public onlyComplianceCall {
        _setCountryStatus(msg.sender, _country, false);
        emit CountryRestrictionRemoved(msg.sender, _country);
    }

    /**
     *  @dev sets countries restriction in batch.
     *  only a bound modular compliance contract can call this function
     *  emits `CountryRestricted` and `CountryRestrictionRemoved` events
     *  @param _countries countries to be restricted/unrestricted, should be expressed by numeric ISO 3166-1 standard code
     *  @param _restrictions restrictions to be set for the countries, true to restrict, false to unrestrict
     */
    function setCountriesRestriction(uint16[] calldata _countries, bool[] calldata _restrictions) external onlyComplianceCall {
        for (uint256 i = 0; i < _countries.length;) {
            if (_restrictions[i]) {
                countryRestrict(_countries[i]);
            } else {
                removeCountryRestriction(_countries[i]);
            }

            unchecked {
                ++i; 
            }
        }
    }

    /**
     *  @dev See {IModule-moduleCheck}.
     *  checks if the country of address _to is not restricted for this _compliance
     *  returns TRUE if the country of _to is not restricted for this _compliance
     *  returns FALSE if the country of _to is restricted for this _compliance
     */
    function moduleCheck(
        address /*_from*/,
        address _to,
        uint256 /*_value*/,
        address _compliance
    ) external view override returns (bool) {
        uint16 receiverCountry = _getCountry(_compliance, _to);
        return !isCountryRestricted(_compliance, receiverCountry);
    }

    /**
     *  @dev See {IModule-name}.
     */
    function name() public pure returns (string memory _name) {
        return "CountryRestrictModule";
    }

    /**
     *  @dev checks if country is restricted for a given compliance contract
     *  @param _compliance the modular compliance address
     *  @param _country, numeric ISO 3166-1 standard code of the country to be checked
     *  @return true if the `_country` is restricted
     */
    function isCountryRestricted(address _compliance, uint16 _country) public view returns (bool) {
        return _countriesStatus[_compliance][_country];
    }
}
