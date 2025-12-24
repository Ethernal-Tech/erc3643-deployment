import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";
import { expect } from "chai";
import { deployComplianceFixture } from "./fixtures/deploy-compliance.fixture";
import MaxBalanceModule from "../artifacts/contracts/compliance/MaxBalanceModule.sol/MaxBalanceModule.json";
import TRex from "@tokenysolutions/t-rex";

async function deployMaxBalanceModule() {
  const context = await loadFixture(deployComplianceFixture);
  const { token } = context.suite;
  const { deployer } = context.accounts;

  const module = await new ethers.ContractFactory(
    MaxBalanceModule.abi,
    MaxBalanceModule.bytecode,
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

  const maxBalanceModule = await ethers.getContractAt(
    MaxBalanceModule.abi,
    proxy.target,
    deployer
  );

  const complianceAddr = await token.compliance();

  const compliance = await ethers.getContractAt(
    TRex.contracts.ModularCompliance.abi,
    complianceAddr
  );

  await compliance.addModule(maxBalanceModule.target);

  return {
    ...context,
    suite: {
      ...context.suite,
      maxBalanceModule,
      compliance,
    },
  };
}

describe("Compliance Module: MaxBalance", () => {
  describe(".name", () => {
    it("should return the module name", async () => {
      const context = await loadFixture(deployMaxBalanceModule);
      expect(await context.suite.maxBalanceModule.name()).to.eq(
        "MaxBalanceModule"
      );
    });
  });

  describe(".initialize", () => {
    it("should only be callable once", async () => {
      const { accounts } = await loadFixture(deployComplianceFixture);
      const module = (
        await ethers.deployContract("MaxBalanceModule")
      ).connect(accounts.deployer);
      await module.initialize();

      await expect(module.initialize()).to.be.revertedWith(
        "Initializable: contract is already initialized"
      );
      expect(await module.owner()).to.eq(accounts.deployer.address);
    });
  });

  describe(".setMaxBalance", () => {
    it("should revert if called directly", async () => {
      const context = await loadFixture(deployMaxBalanceModule);
      await expect(
        context.suite.maxBalanceModule.setMaxBalance(10)
      ).to.be.revertedWith("only bound compliance can call");
    });

    it("should allow compliance to set max balance", async () => {
      const context = await loadFixture(deployMaxBalanceModule);

      await expect(context.suite.compliance
        .callModuleFunction(
          new ethers.Interface([
            "function setMaxBalance(uint256)",
          ]).encodeFunctionData("setMaxBalance", [50]),
          context.suite.maxBalanceModule.target
        )).to.not.be.reverted;
    });
  });

  describe(".moduleTransferAction", () => {
    it("should revert if called directly", async () => {
      const context = await loadFixture(deployMaxBalanceModule);
      await expect(
        context.suite.maxBalanceModule.moduleTransferAction(
          context.accounts.aliceWallet.address,
          context.accounts.bobWallet.address,
          100
        )
      ).to.be.revertedWith("only bound compliance can call");
    });

    it("should work properly", async () => {
      const context = await loadFixture(deployMaxBalanceModule);
      const { compliance, maxBalanceModule } = context.suite;
      const { aliceWallet, bobWallet } = context.accounts;

      await expect(compliance.callModuleFunction(
        new ethers.Interface([
          "function moduleTransferAction(address,address,uint256)",
        ]).encodeFunctionData("moduleTransferAction", [
          aliceWallet.address,
          bobWallet.address,
          50,
        ]),
        maxBalanceModule.target
      )).to.emit(compliance, "ModuleInteraction");
    });
  });

  describe(".moduleCheck", () => {
    it("should work when below balance", async () => {
      const context = await loadFixture(deployMaxBalanceModule);

      const { compliance, maxBalanceModule } = context.suite;
      const { aliceWallet, bobWallet } = context.accounts;

      await expect(compliance
        .callModuleFunction(
          new ethers.Interface([
            "function setMaxBalance(uint256)",
          ]).encodeFunctionData("setMaxBalance", [50]),
          maxBalanceModule.target
        )).to.emit(maxBalanceModule, "MaxBalanceSet").withArgs(compliance.target, 50);

      await expect(
        maxBalanceModule.moduleCheck(
          bobWallet.address,
          aliceWallet.address,
          50,
          compliance.target
        )
      ).to.eventually.true;
    });

    it("should revert or return false when receiver is above max balance", async () => {
      const context = await loadFixture(deployMaxBalanceModule);

      const { token, compliance, maxBalanceModule } = context.suite;
      const { aliceWallet, bobWallet } = context.accounts;

      await expect(compliance
        .callModuleFunction(
          new ethers.Interface([
            "function setMaxBalance(uint256)",
          ]).encodeFunctionData("setMaxBalance", [50]),
          maxBalanceModule.target
        )).to.emit(maxBalanceModule, "MaxBalanceSet").withArgs(compliance.target, 50);
      
      // mint to bob to exceed max balance with transfer
      await token.connect(context.accounts.tokenAgent).mint(bobWallet.address, 50);

      // bob can't receive transfer
      await expect(
        maxBalanceModule.moduleCheck(
          aliceWallet.address,
          bobWallet.address,
          50,
          compliance.target
        )
      ).to.eventually.false;
    });
  });
});
