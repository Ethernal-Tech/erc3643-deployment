import { loadFixture, mine } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";
import { expect } from "chai";
import { deployComplianceFixture } from "./fixtures/deploy-compliance.fixture";
import LockInTransferModule from "../artifacts/contracts/compliance/LockInTransferModule.sol/LockInTransferModule.json";
import TRex from "@tokenysolutions/t-rex";

async function deployLockInTransferModule() {
  const context = await loadFixture(deployComplianceFixture);
  const { token } = context.suite;
  const { deployer } = context.accounts;

  const module = await new ethers.ContractFactory(
    LockInTransferModule.abi,
    LockInTransferModule.bytecode,
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

  const lockInModule = await ethers.getContractAt(
    LockInTransferModule.abi,
    proxy.target,
    deployer
  );

  const complianceAddr = await token.compliance();

  const compliance = await ethers.getContractAt(
    TRex.contracts.ModularCompliance.abi,
    complianceAddr
  );

  await compliance.addModule(lockInModule.target);

  return {
    ...context,
    suite: {
      ...context.suite,
      lockInModule,
      compliance,
    },
  };
}

describe("Compliance Module: LockInTransfer", () => {
  describe(".name", () => {
    it("should return the module name", async () => {
      const context = await loadFixture(deployLockInTransferModule);
      expect(await context.suite.lockInModule.name()).to.eq(
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
      const context = await loadFixture(deployLockInTransferModule);
      await expect(
        context.suite.lockInModule.setWaitPeriod(10)
      ).to.be.revertedWith("only bound compliance can call");
    });

    it("should allow compliance to set wait period", async () => {
      const context = await loadFixture(deployLockInTransferModule);

      await expect(context.suite.compliance
        .callModuleFunction(
          new ethers.Interface([
            "function setWaitPeriod(uint256)",
          ]).encodeFunctionData("setWaitPeriod", [50]),
          context.suite.lockInModule.target
        ) ).to.not.be.reverted;
    });
  });

  describe(".moduleTransferAction", () => {
    it("should revert if called directly", async () => {
      const context = await loadFixture(deployLockInTransferModule);
      await expect(
        context.suite.lockInModule.moduleTransferAction(
          context.accounts.aliceWallet.address,
          context.accounts.bobWallet.address,
          100
        )
      ).to.be.revertedWith("only bound compliance can call");
    });

    it("should work properly", async () => {
      const context = await loadFixture(deployLockInTransferModule);
      const { compliance, lockInModule } = context.suite;
      const { aliceWallet, bobWallet } = context.accounts;

      await compliance.callModuleFunction(
        new ethers.Interface([
          "function moduleMintAction(address,uint256)",
        ]).encodeFunctionData("moduleMintAction", [aliceWallet.address, 50]),
        lockInModule.target
      );

      await expect(compliance.callModuleFunction(
        new ethers.Interface([
          "function moduleTransferAction(address,address,uint256)",
        ]).encodeFunctionData("moduleTransferAction", [
          aliceWallet.address,
          bobWallet.address,
          50,
        ]),
        lockInModule.target
      )).to.emit(compliance, "ModuleInteraction");
    });
  });

  describe(".moduleCheck", () => {
    it("should work after elapsed time", async () => {
      const context = await loadFixture(deployLockInTransferModule);

      const { compliance, lockInModule } = context.suite;
      const { aliceWallet, bobWallet } = context.accounts;

      await expect(compliance
        .callModuleFunction(
          new ethers.Interface([
            "function setWaitPeriod(uint256)",
          ]).encodeFunctionData("setWaitPeriod", [1]),
          lockInModule.target
        )).to.emit(lockInModule, "WaitPeriod").withArgs(compliance.target, 1);

      await compliance.callModuleFunction(
        new ethers.Interface([
          "function moduleMintAction(address,uint256)",
        ]).encodeFunctionData("moduleMintAction", [aliceWallet.address, 50]),
        lockInModule.target
      );

      await mine(2);

      await compliance.callModuleFunction(
        new ethers.Interface([
          "function moduleTransferAction(address,address,uint256)",
        ]).encodeFunctionData("moduleTransferAction", [
          aliceWallet.address,
          bobWallet.address,
          50,
        ]),
        lockInModule.target
      );

      await mine(2);

      await expect(
        lockInModule.moduleCheck(
          bobWallet.address,
          aliceWallet.address,
          50,
          compliance.target
        )
      ).to.eventually.true;
    });

    it("should revert or return false when sender has locked balance", async () => {
      const context = await loadFixture(deployLockInTransferModule);

      const { compliance, lockInModule } = context.suite;
      const { aliceWallet, bobWallet } = context.accounts;

      await expect(compliance
        .callModuleFunction(
          new ethers.Interface([
            "function setWaitPeriod(uint256)",
          ]).encodeFunctionData("setWaitPeriod", [50]),
          lockInModule.target
        )).to.emit(lockInModule, "WaitPeriod").withArgs(compliance.target, 50);
        
      await compliance.callModuleFunction(
        new ethers.Interface([
          "function moduleMintAction(address,uint256)",
        ]).encodeFunctionData("moduleMintAction", [aliceWallet.address, 50]),
        lockInModule.target
      );

      // after mint alice can't execute transfer
      await expect(
        lockInModule.moduleCheck(
          aliceWallet.address,
          bobWallet.address,
          50,
          compliance.target
        )
      ).to.eventually.false;

      await mine(51)

      await compliance.callModuleFunction(
        new ethers.Interface([
          "function moduleTransferAction(address,address,uint256)",
        ]).encodeFunctionData("moduleTransferAction", [
          aliceWallet.address,
          bobWallet.address,
          50,
        ]),
        lockInModule.target
      );

      // after receive bob can't execute transfer
      await expect(
        lockInModule.moduleCheck(
          bobWallet.address,
          aliceWallet.address,
          50,
          compliance.target
        )
      ).to.eventually.false;
    });
  });
});
