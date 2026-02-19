import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";
import { expect } from "chai";
import { deployComplianceFixture } from "./fixtures/deploy-compliance.fixture";
import GlobalLockInTransferModule from "../artifacts/contracts/compliance/GlobalLockInTransferModule.sol/GlobalLockInTransferModule.json";
import TRex from "@tokenysolutions/t-rex";

async function deployGlobalLockInTransferModule() {
  const context = await loadFixture(deployComplianceFixture);
  const { token } = context.suite;
  const { deployer } = context.accounts;

  const module = await new ethers.ContractFactory(
    GlobalLockInTransferModule.abi,
    GlobalLockInTransferModule.bytecode,
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

  const globalLockInModule = await ethers.getContractAt(
    GlobalLockInTransferModule.abi,
    proxy.target,
    deployer
  );

  const complianceAddr = await token.compliance();

  const compliance = await ethers.getContractAt(
    TRex.contracts.ModularCompliance.abi,
    complianceAddr
  );

  await compliance.addModule(globalLockInModule.target);

  return {
    ...context,
    suite: {
      ...context.suite,
      globalLockInModule,
      compliance,
    },
  };
}

describe("Compliance Module: GlobalLockInTransfer", () => {
  describe(".name", () => {
    it("should return the module name", async () => {
      const context = await loadFixture(deployGlobalLockInTransferModule);
      expect(await context.suite.globalLockInModule.name()).to.eq(
        "GlobalLockInTransferModule"
      );
    });
  });

  describe(".initialize", () => {
    it("should only be callable once", async () => {
      const { accounts } = await loadFixture(deployComplianceFixture);
      const module = (
        await ethers.deployContract("GlobalLockInTransferModule")
      ).connect(accounts.deployer);
      await module.initialize();

      await expect(module.initialize()).to.be.revertedWith(
        "Initializable: contract is already initialized"
      );
      expect(await module.owner()).to.eq(accounts.deployer.address);
    });
  });

  describe(".setWaitPeriod", () => {
    it("should revert if called directly", async () => {
      const context = await loadFixture(deployGlobalLockInTransferModule);
      await expect(
        context.suite.globalLockInModule.setWaitPeriod(10)
      ).to.be.revertedWith("only bound compliance can call");
    });

    it("should allow compliance to set wait period", async () => {
      const context = await loadFixture(deployGlobalLockInTransferModule);

      await expect(context.suite.compliance
        .callModuleFunction(
          new ethers.Interface([
            "function setWaitPeriod(uint256)",
          ]).encodeFunctionData("setWaitPeriod", [50]),
          context.suite.globalLockInModule.target
        ) ).to.not.be.reverted;
    });
  });

  describe(".moduleTransferAction", () => {
    it("should revert if called directly", async () => {
      const context = await loadFixture(deployGlobalLockInTransferModule);
      await expect(
        context.suite.globalLockInModule.moduleTransferAction(
          context.accounts.aliceWallet.address,
          context.accounts.bobWallet.address,
          100
        )
      ).to.be.revertedWith("only bound compliance can call");
    });

    it("should work properly", async () => {
      const context = await loadFixture(deployGlobalLockInTransferModule);
      const { compliance, globalLockInModule } = context.suite;
      const { aliceWallet, bobWallet } = context.accounts;

      await expect(compliance.callModuleFunction(
        new ethers.Interface([
          "function moduleMintAction(address,uint256)",
        ]).encodeFunctionData("moduleMintAction", [aliceWallet.address, 50]),
        globalLockInModule.target
      )).to.emit(compliance, "ModuleInteraction");

      await expect(compliance.callModuleFunction(
        new ethers.Interface([
          "function moduleTransferAction(address,address,uint256)",
        ]).encodeFunctionData("moduleTransferAction", [
          aliceWallet.address,
          bobWallet.address,
          50,
        ]),
        globalLockInModule.target
      )).to.emit(compliance, "ModuleInteraction");
    });
  });

  describe(".moduleCheck", () => {
    it("should work always - mint", async () => {
      const context = await loadFixture(deployGlobalLockInTransferModule);

      const { compliance, globalLockInModule } = context.suite;
      const { bobWallet } = context.accounts;
      const waitPeriod = 1;

      await expect(compliance
        .callModuleFunction(
          new ethers.Interface([
            "function setWaitPeriod(uint256)",
          ]).encodeFunctionData("setWaitPeriod", [waitPeriod]),
          globalLockInModule.target
        )).to.emit(globalLockInModule, "WaitPeriod").withArgs(compliance.target, waitPeriod);

      await expect(
        globalLockInModule.moduleCheck(
          ethers.ZeroAddress,
          bobWallet.address,
          50,
          compliance.target
        )
      ).to.eventually.true;
    });

    it("should work after elapsed time - transfer", async () => {
      const context = await loadFixture(deployGlobalLockInTransferModule);

      const { compliance, globalLockInModule } = context.suite;
      const { aliceWallet, bobWallet } = context.accounts;
      const waitPeriod = 1;

      await expect(compliance
        .callModuleFunction(
          new ethers.Interface([
            "function setWaitPeriod(uint256)",
          ]).encodeFunctionData("setWaitPeriod", [waitPeriod]),
          globalLockInModule.target
        )).to.emit(globalLockInModule, "WaitPeriod").withArgs(compliance.target, waitPeriod);

      await time.increase(waitPeriod);

      await expect(
        globalLockInModule.moduleCheck(
          bobWallet.address,
          aliceWallet.address,
          50,
          compliance.target
        )
      ).to.eventually.true;
    });

    it("should revert or return false when global locked in is active - transfer", async () => {
      const context = await loadFixture(deployGlobalLockInTransferModule);

      const { compliance, globalLockInModule } = context.suite;
      const { aliceWallet, bobWallet } = context.accounts;
      const waitPeriod = 1;

      await expect(compliance
        .callModuleFunction(
          new ethers.Interface([
            "function setWaitPeriod(uint256)",
          ]).encodeFunctionData("setWaitPeriod", [waitPeriod]),
          globalLockInModule.target
        )).to.emit(globalLockInModule, "WaitPeriod").withArgs(compliance.target, waitPeriod);

      await expect(
        globalLockInModule.moduleCheck(
          bobWallet.address,
          aliceWallet.address,
          50,
          compliance.target
        )
      ).to.eventually.false;
    });
  });
});
