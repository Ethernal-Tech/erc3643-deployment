import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";
import { expect } from "chai";
import { deployComplianceFixture } from "./fixtures/deploy-compliance.fixture";
import CountryRestrictModule from "../artifacts/contracts/compliance/CountryRestrictModule.sol/CountryRestrictModule.json";
import TRex from "@tokenysolutions/t-rex";

async function deployCountryRestrictModule() {
  const context = await loadFixture(deployComplianceFixture);
  const { token } = context.suite;
  const { deployer } = context.accounts;

  const module = await new ethers.ContractFactory(
    CountryRestrictModule.abi,
    CountryRestrictModule.bytecode,
    deployer
  ).deploy();

  const proxy = await new ethers.ContractFactory(
    TRex.contracts.ModuleProxy.abi,
    TRex.contracts.ModuleProxy.bytecode,
    deployer
  ).deploy(
    module.target,
    module.interface.encodeFunctionData("initialize")
  );

  const countryRestrictModule = await ethers.getContractAt(
    CountryRestrictModule.abi,
    proxy.target,
    deployer
  );

  const complianceAddr = await token.compliance();

  const compliance = await ethers.getContractAt(
    TRex.contracts.ModularCompliance.abi,
    complianceAddr
  );

  await compliance.addModule(countryRestrictModule.target);
  return {
    ...context,
    suite: {
      ...context.suite,
      countryRestrictModule,
      compliance,
    },
  };
}

describe("Compliance Module: CountryRestrict", () => {
  describe(".name", () => {
    it("should return the module name", async () => {
      const context = await loadFixture(deployCountryRestrictModule);
      expect(await context.suite.countryRestrictModule.name()).to.eq(
        "CountryRestrictModule"
      );
    });
  });

  describe(".initialize", () => {
    it("should only be callable once", async () => {
      const { accounts } = await loadFixture(deployComplianceFixture);
      const module = (
        await ethers.deployContract("CountryRestrictModule")
      ).connect(accounts.deployer);
      await module.initialize();

      await expect(module.initialize()).to.be.revertedWith(
        "Initializable: contract is already initialized"
      );
      expect(await module.owner()).to.eq(accounts.deployer.address);
    });
  });

  describe(".countryRestrict", () => {
    it("should revert if called directly", async () => {
      const context = await loadFixture(deployCountryRestrictModule);

      await expect(
        context.suite.countryRestrictModule.countryRestrict(688)
      ).to.be.revertedWith("only bound compliance can call");
    });

    it("should allow compliance to restrict country", async () => {
      const context = await loadFixture(deployCountryRestrictModule);

      await expect(context.suite.compliance
        .callModuleFunction(
          new ethers.Interface([
            "function countryRestrict(uint16)",
          ]).encodeFunctionData("countryRestrict", [688]),
          context.suite.countryRestrictModule.target
        )).to.not.be.reverted;
    });
  });

  describe(".removeCountryRestriction", () => {
    it("should revert if called directly", async () => {
      const context = await loadFixture(deployCountryRestrictModule);

      await expect(
        context.suite.countryRestrictModule.removeCountryRestriction(688)
      ).to.be.revertedWith("only bound compliance can call");
    });

    it("should allow compliance to remove country restriction", async () => {
      const context = await loadFixture(deployCountryRestrictModule);

      await expect(context.suite.compliance
        .callModuleFunction(
          new ethers.Interface([
            "function removeCountryRestriction(uint16)",
          ]).encodeFunctionData("removeCountryRestriction", [688]),
          context.suite.countryRestrictModule.target
        )).to.not.be.reverted;
    });
  });

  describe(".setCountriesRestriction", () => {
    it("should revert if called directly", async () => {
      const context = await loadFixture(deployCountryRestrictModule);

      await expect(
        context.suite.countryRestrictModule.setCountriesRestriction([688], [true])
      ).to.be.revertedWith("only bound compliance can call");
    });

    it("should allow compliance to set countries restriction", async () => {
      const context = await loadFixture(deployCountryRestrictModule);

      await expect(context.suite.compliance
        .callModuleFunction(
          new ethers.Interface([
            "function setCountriesRestriction(uint16[],bool[])",
          ]).encodeFunctionData("setCountriesRestriction", [[688], [true]]),
          context.suite.countryRestrictModule.target
        )).to.not.be.reverted;
    });
  });

  describe(".moduleTransferAction", () => {
    it("should revert if called directly", async () => {
      const context = await loadFixture(deployCountryRestrictModule);
      await expect(
        context.suite.countryRestrictModule.moduleTransferAction(
          context.accounts.aliceWallet.address,
          context.accounts.bobWallet.address,
          100
        )
      ).to.be.revertedWith("only bound compliance can call");
    });

    it("should work properly", async () => {
      const context = await loadFixture(deployCountryRestrictModule);
      const { compliance, countryRestrictModule } = context.suite;
      const { aliceWallet, bobWallet } = context.accounts;

      await expect(compliance.callModuleFunction(
        new ethers.Interface([
          "function moduleTransferAction(address,address,uint256)",
        ]).encodeFunctionData("moduleTransferAction", [
          aliceWallet.address,
          bobWallet.address,
          50,
        ]),
        countryRestrictModule.target
      )).to.emit(compliance, "ModuleInteraction");
    });
  });

  describe(".moduleCheck", () => {
    it("should work when country is not restricted", async () => {
      const context = await loadFixture(deployCountryRestrictModule);

      const { compliance, countryRestrictModule } = context.suite;
      const { aliceWallet, bobWallet } = context.accounts;

      await expect(
        countryRestrictModule.moduleCheck(
          aliceWallet.address,
          bobWallet.address,
          50,
          compliance.target
        )
      ).to.eventually.true;
    });

    it("should revert or return false when country is restricted", async () => {
      const context = await loadFixture(deployCountryRestrictModule);

      const { compliance, countryRestrictModule } = context.suite;
      const { aliceWallet, bobWallet } = context.accounts;

      await expect(compliance
        .callModuleFunction(
          new ethers.Interface([
            "function countryRestrict(uint16)",
          ]).encodeFunctionData("countryRestrict", [688]),
          countryRestrictModule.target
        )
      ).to.emit(countryRestrictModule, "CountryRestricted").withArgs(compliance, 688);

      await expect(
        countryRestrictModule.moduleCheck(
          aliceWallet.address,
          bobWallet.address,
          50,
          compliance.target
        )
      ).to.eventually.false;
    });
  });
});
