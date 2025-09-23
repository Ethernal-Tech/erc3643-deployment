import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";
import { expect } from "chai";
import {
  deployComplianceFixture,
  deploySuiteWithModularCompliancesFixture,
} from "./fixtures/deploy-compliance.fixture";
import LockInTransferModule from "../artifacts/contracts/LockInTransferModule.sol/LockInTransferModule.json";
import TRex from "@tokenysolutions/t-rex";

async function deployLockInTransfer() {
  const context = await loadFixture(deploySuiteWithModularCompliancesFixture);
  const { compliance } = context.suite;
  const { deployer } = context.accounts;

  const module = await new ethers.ContractFactory(
    LockInTransferModule.abi,
    LockInTransferModule.bytecode,
    deployer
  ).deploy();
  await module.waitForDeployment();

  const proxy = await new ethers.ContractFactory(
    TRex.contracts.ModuleProxy.abi,
    TRex.contracts.ModuleProxy.bytecode,
    deployer
  ).deploy(
    await module.getAddress(),
    module.interface.encodeFunctionData("initialize")
  );
  await proxy.waitForDeployment();

  const complianceModule = await ethers.getContractAt(
    LockInTransferModule.abi,
    await proxy.getAddress(),
    deployer
  );

  const tx = await compliance.addModule(await complianceModule.getAddress());
  await tx.wait();

  const tx1 = await compliance.bindToken(ethers.ZeroAddress);
  await tx1.wait();

  return {
    ...context,
    suite: {
      ...context.suite,
      complianceModule,
    },
  };
}

describe("Compliance Module: LockInTransfer", () => {
  describe(".name", () => {
    it("should return the module name", async () => {
      const context = await loadFixture(deployLockInTransfer);
      expect(await context.suite.complianceModule.name()).to.eq(
        "LockInTransferModule"
      );
    });
  });

  describe(".initialize", () => {
    it("should only be callable once", async () => {
      const { accounts } = await loadFixture(deployComplianceFixture);
      const module = (
        await ethers.deployContract("LockInTransferModule")
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
      const context = await loadFixture(deployLockInTransfer);
      await expect(
        context.suite.complianceModule.setWaitPeriod(10)
      ).to.be.revertedWith("only bound compliance can call");
    });

    it("should allow compliance to set wait period", async () => {
      const context = await loadFixture(deployLockInTransfer);

      const tx = await context.suite.compliance.callModuleFunction(
        new ethers.Interface([
          "function setWaitPeriod(uint256)",
        ]).encodeFunctionData("setWaitPeriod", [50]),
        context.suite.complianceModule.target
      );

      await expect(tx).to.not.be.reverted;
    });
  });

  describe(".moduleTransferAction", () => {
    it("should revert if called directly", async () => {
      const context = await loadFixture(deployLockInTransfer);
      await expect(
        context.suite.complianceModule.moduleTransferAction(
          context.accounts.aliceWallet.address,
          context.accounts.bobWallet.address,
          100
        )
      ).to.be.revertedWith("only bound compliance can call");
    });

    it("should enqueue transfer limits when called via compliance", async () => {
      const context = await loadFixture(deployLockInTransfer);
      const { compliance, complianceModule } = context.suite;
      const { aliceWallet, bobWallet } = context.accounts;

      // Set wait period
      await compliance.callModuleFunction(
        new ethers.Interface([
          "function setWaitPeriod(uint256)",
        ]).encodeFunctionData("setWaitPeriod", [20]),
        complianceModule.target
      );

      // Simulate a transfer via compliance
      await compliance.callModuleFunction(
        new ethers.Interface([
          "function moduleTransferAction(address,address,uint256)",
        ]).encodeFunctionData("moduleTransferAction", [
          aliceWallet.address,
          bobWallet.address,
          100,
        ]),
        complianceModule.target
      );

      expect(
        await complianceModule.getQueue(compliance.target, bobWallet.address)
      ).to.be.eq([0n, 1n, 200n]);
    });
  });

  describe(".moduleCheck", () => {
    it("should revert or return false when sender has locked balance", async () => {
      const context = await loadFixture(deployLockInTransfer);

      const { compliance, complianceModule } = context.suite;
      const { aliceWallet, bobWallet } = context.accounts;

      const setWaitPeriodTx = await compliance.callModuleFunction(
        new ethers.Interface([
          "function setWaitPeriod(uint256)",
        ]).encodeFunctionData("setWaitPeriod", [200]),
        complianceModule.target
      );

      const rec = await setWaitPeriodTx.wait();

      expect(rec)
        .to.emit(complianceModule, "WaitPeriod1")
        .withArgs(compliance.target, 200);

      console.log(
        "Wait period",
        await complianceModule.getWaitPeriod(compliance.target)
      );

      await compliance.callModuleFunction(
        new ethers.Interface([
          "function moduleMintAction(address,uint256)",
        ]).encodeFunctionData("moduleMintAction", [aliceWallet.address, 200]),
        complianceModule.target
      );

      const tx = await compliance.callModuleFunction(
        new ethers.Interface([
          "function moduleTransferAction(address,address,uint256)",
        ]).encodeFunctionData("moduleTransferAction", [
          aliceWallet.address,
          bobWallet.address,
          50,
        ]),
        complianceModule.target
      );

      expect(tx).to.emit(complianceModule, "TransferAction");

      console.log(
        "ALICE",
        await complianceModule.getQueue(compliance.target, aliceWallet.address)
      );

      console.log(
        "BOB",
        await complianceModule.getQueue(compliance.target, bobWallet.address)
      );

      // Example check
      await expect(
        complianceModule.moduleCheck(
          bobWallet.address,
          aliceWallet.address,
          50,
          compliance.target
        )
      ).to.eventually.eq(false);
    });
  });
});
