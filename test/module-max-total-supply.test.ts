import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";
import { expect } from "chai";
import { deployComplianceFixture } from "./fixtures/deploy-compliance.fixture";
import MaxTotalSupplyModule from "../artifacts/contracts/compliance/MaxTotalSupplyModule.sol/MaxTotalSupplyModule.json";
import TRex from "@tokenysolutions/t-rex";

async function deployMaxTotalSupplyModule() {
  const context = await loadFixture(deployComplianceFixture);
  const { token } = context.suite;
  const { deployer } = context.accounts;

  const module = await new ethers.ContractFactory(
    MaxTotalSupplyModule.abi,
    MaxTotalSupplyModule.bytecode,
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

  const maxTotalSupplyModule = await ethers.getContractAt(
    MaxTotalSupplyModule.abi,
    proxy.target,
    deployer
  );

  const complianceAddr = await token.compliance();

  const compliance = await ethers.getContractAt(
    TRex.contracts.ModularCompliance.abi,
    complianceAddr
  );

  await compliance.addModule(maxTotalSupplyModule.target);

  return {
    ...context,
    suite: {
      ...context.suite,
      maxTotalSupplyModule,
      compliance,
    },
  };
}

describe("Compliance Module: MaxTotalSupply", () => {
  describe(".name", () => {
    it("should return the module name", async () => {
      const context = await loadFixture(deployMaxTotalSupplyModule);
      expect(await context.suite.maxTotalSupplyModule.name()).to.eq(
        "MaxTotalSupplyModule"
      );
    });
  });

  describe(".initialize", () => {
    it("should only be callable once", async () => {
      const { accounts } = await loadFixture(deployComplianceFixture);
      const module = (
        await ethers.deployContract("MaxTotalSupplyModule")
      ).connect(accounts.deployer);
      await module.initialize();

      await expect(module.initialize()).to.be.revertedWith(
        "Initializable: contract is already initialized"
      );
      expect(await module.owner()).to.eq(accounts.deployer.address);
    });
  });

  describe(".setMaxTotalSupply", () => {
    it("should revert if called directly", async () => {
      const context = await loadFixture(deployMaxTotalSupplyModule);
      await expect(
        context.suite.maxTotalSupplyModule.setMaxTotalSupply(10)
      ).to.be.revertedWith("only bound compliance can call");
    });

    it("should allow compliance to set max total supply", async () => {
      const context = await loadFixture(deployMaxTotalSupplyModule);

      await expect(context.suite.compliance
        .callModuleFunction(
          new ethers.Interface([
            "function setMaxTotalSupply(uint256)",
          ]).encodeFunctionData("setMaxTotalSupply", [50]),
          context.suite.maxTotalSupplyModule.target
        )).to.not.be.reverted;
    });
  });

  describe(".moduleTransferAction", () => {
    it("should revert if called directly", async () => {
      const context = await loadFixture(deployMaxTotalSupplyModule);
      await expect(
        context.suite.maxTotalSupplyModule.moduleTransferAction(
          context.accounts.aliceWallet.address,
          context.accounts.bobWallet.address,
          100
        )
      ).to.be.revertedWith("only bound compliance can call");
    });

    it("should work properly", async () => {
      const context = await loadFixture(deployMaxTotalSupplyModule);
      const { compliance, maxTotalSupplyModule } = context.suite;
      const { aliceWallet, bobWallet } = context.accounts;

      await expect(compliance.callModuleFunction(
        new ethers.Interface([
          "function moduleTransferAction(address,address,uint256)",
        ]).encodeFunctionData("moduleTransferAction", [
          aliceWallet.address,
          bobWallet.address,
          50,
        ]),
        maxTotalSupplyModule.target
      )).to.emit(compliance, "ModuleInteraction");
    });
  });

  describe(".moduleCheck", () => {
    it("should work when below max total supply", async () => {
      const context = await loadFixture(deployMaxTotalSupplyModule);

      const { compliance, maxTotalSupplyModule } = context.suite;
      const { aliceWallet } = context.accounts;

      await expect(compliance
        .callModuleFunction(
          new ethers.Interface([
            "function setMaxTotalSupply(uint256)",
          ]).encodeFunctionData("setMaxTotalSupply", [50]),
          maxTotalSupplyModule.target
        )).to.emit(maxTotalSupplyModule, "MaxTotalSupplySet").withArgs(compliance.target, 50);
        
      await expect(
        maxTotalSupplyModule.moduleCheck(
          ethers.ZeroAddress,
          aliceWallet.address,
          50,
          compliance.target
        )
      ).to.eventually.true;
    });

    it("should revert or return false when mint is above max total supply", async () => {
      const context = await loadFixture(deployMaxTotalSupplyModule);

      const { compliance, maxTotalSupplyModule } = context.suite;
      const { bobWallet } = context.accounts;

      await expect(compliance
        .callModuleFunction(
          new ethers.Interface([
            "function setMaxTotalSupply(uint256)",
          ]).encodeFunctionData("setMaxTotalSupply", [50]),
          maxTotalSupplyModule.target
        )).to.emit(maxTotalSupplyModule, "MaxTotalSupplySet").withArgs(compliance.target, 50);

      // mint to bob to exceed max total supply with mint
      await expect(
        maxTotalSupplyModule.moduleCheck(
          ethers.ZeroAddress,
          bobWallet.address,
          100,
          compliance.target
        )
      ).to.eventually.false;
    });
  });
});
