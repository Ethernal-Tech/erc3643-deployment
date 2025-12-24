import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";
import { expect } from "chai";
import { deployComplianceFixture } from "./fixtures/deploy-compliance.fixture";
import CountryPermitModule from "../artifacts/contracts/compliance/CountryPermitModule.sol/CountryPermitModule.json";
import TRex from "@tokenysolutions/t-rex";

async function deployCountryPermitModule() {
  const context = await loadFixture(deployComplianceFixture);
  const { token } = context.suite;
  const { deployer } = context.accounts;

  const module = await new ethers.ContractFactory(
    CountryPermitModule.abi,
    CountryPermitModule.bytecode,
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

  const countryPermitModule = await ethers.getContractAt(
    CountryPermitModule.abi,
    proxy.target,
    deployer
  );

  const complianceAddr = await token.compliance();

  const compliance = await ethers.getContractAt(
    TRex.contracts.ModularCompliance.abi,
    complianceAddr
  );

  await compliance.addModule(countryPermitModule.target);
  return {
    ...context,
    suite: {
      ...context.suite,
      countryPermitModule,
      compliance,
    },
  };
}

describe("Compliance Module: CountryPermit", () => {
  describe(".name", () => {
    it("should return the module name", async () => {
      const context = await loadFixture(deployCountryPermitModule);
      expect(await context.suite.countryPermitModule.name()).to.eq(
        "CountryPermitModule"
      );
    });
  });

  describe(".initialize", () => {
    it("should only be callable once", async () => {
      const { accounts } = await loadFixture(deployComplianceFixture);
      const module = (
        await ethers.deployContract("CountryPermitModule")
      ).connect(accounts.deployer);
      await module.initialize();

      await expect(module.initialize()).to.be.revertedWith(
        "Initializable: contract is already initialized"
      );
      expect(await module.owner()).to.eq(accounts.deployer.address);
    });
  });

  describe(".countryPermit", () => {
    it("should revert if called directly", async () => {
      const context = await loadFixture(deployCountryPermitModule);

      await expect(
        context.suite.countryPermitModule.countryPermit(688)
      ).to.be.revertedWith("only bound compliance can call");
    });

    it("should allow compliance to permit country", async () => {
      const context = await loadFixture(deployCountryPermitModule);

      await expect(context.suite.compliance
        .callModuleFunction(
          new ethers.Interface([
            "function countryPermit(uint16)",
          ]).encodeFunctionData("countryPermit", [688]),
          context.suite.countryPermitModule.target
        )).to.not.be.reverted;
    });
  });

  describe(".removeCountryPermission", () => {
    it("should revert if called directly", async () => {
      const context = await loadFixture(deployCountryPermitModule);

      await expect(
        context.suite.countryPermitModule.removeCountryPermission(688)
      ).to.be.revertedWith("only bound compliance can call");
    });

    it("should allow compliance to remove country permission", async () => {
      const context = await loadFixture(deployCountryPermitModule);

      await expect(context.suite.compliance
        .callModuleFunction(
          new ethers.Interface([
            "function removeCountryPermission(uint16)",
          ]).encodeFunctionData("removeCountryPermission", [688]),
          context.suite.countryPermitModule.target
        )).to.not.be.reverted;
    });
  });

  describe(".setCountriesPermission", () => {
    it("should revert if called directly", async () => {
      const context = await loadFixture(deployCountryPermitModule);
      const { aliceWallet, bobWallet } = context.accounts;

      await expect(
        context.suite.countryPermitModule.setCountriesPermission([688], [true])
      ).to.be.revertedWith("only bound compliance can call");
    });

    it("should allow compliance to set countries permission", async () => {
      const context = await loadFixture(deployCountryPermitModule);
      const { aliceWallet, bobWallet } = context.accounts;

      await expect(context.suite.compliance
        .callModuleFunction(
          new ethers.Interface([
            "function setCountriesPermission(uint16[],bool[])",
          ]).encodeFunctionData("setCountriesPermission", [[688], [true]]),
          context.suite.countryPermitModule.target
        )).to.not.be.reverted;
    });
  });

  describe(".moduleTransferAction", () => {
    it("should revert if called directly", async () => {
      const context = await loadFixture(deployCountryPermitModule);
      await expect(
        context.suite.countryPermitModule.moduleTransferAction(
          context.accounts.aliceWallet.address,
          context.accounts.bobWallet.address,
          100
        )
      ).to.be.revertedWith("only bound compliance can call");
    });

    it("should work properly", async () => {
      const context = await loadFixture(deployCountryPermitModule);
      const { compliance, countryPermitModule } = context.suite;
      const { aliceWallet, bobWallet } = context.accounts;

      await expect(compliance.callModuleFunction(
        new ethers.Interface([
          "function moduleTransferAction(address,address,uint256)",
        ]).encodeFunctionData("moduleTransferAction", [
          aliceWallet.address,
          bobWallet.address,
          50,
        ]),
        countryPermitModule.target
      )).to.emit(compliance, "ModuleInteraction");
    });
  });

  describe(".moduleCheck", () => {
    it("should work when country is permitted", async () => {
      const context = await loadFixture(deployCountryPermitModule);

      const { compliance, countryPermitModule } = context.suite;
      const { aliceWallet, bobWallet } = context.accounts;

      await expect(compliance
        .callModuleFunction(
          new ethers.Interface([
            "function countryPermit(uint16)",
          ]).encodeFunctionData("countryPermit", [688]),
          countryPermitModule.target
        )
      ).to.emit(countryPermitModule, "CountryPermitted").withArgs(compliance, 688);

      await expect(
        countryPermitModule.moduleCheck(
          aliceWallet.address,
          bobWallet.address,
          50,
          compliance.target
        )
      ).to.eventually.true;
    });

    it("should revert or return false when country is not permitted", async () => {
      const context = await loadFixture(deployCountryPermitModule);

      const { compliance, countryPermitModule } = context.suite;
      const { aliceWallet, bobWallet } = context.accounts;

      await expect(
        countryPermitModule.moduleCheck(
          aliceWallet.address,
          bobWallet.address,
          50,
          compliance.target
        )
      ).to.eventually.false;
    });
  });
});
