import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";
import { expect } from "chai";
import { deployComplianceFixture } from "./fixtures/deploy-compliance.fixture";
import LockInTransferModule from "../artifacts/contracts/LockInTransferModule.sol/LockInTransferModule.json";
import TRex from "@tokenysolutions/t-rex";

async function deployLockInTransferModule() {
  const context = await loadFixture(deployComplianceFixture);
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

  const lockInModule = await ethers.getContractAt(
    LockInTransferModule.abi,
    await proxy.getAddress(),
    deployer
  );

  const tx = await compliance.connect(deployer).addModule(await lockInModule.getAddress());
  await tx.wait();

  return {
    ...context,
    suite: {
      ...context.suite,
      lockInModule,
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

      const tx = await context.suite.compliance.connect(context.accounts.deployer).callModuleFunction(
        new ethers.Interface([
          "function setWaitPeriod(uint256)",
        ]).encodeFunctionData("setWaitPeriod", [50]),
        context.suite.lockInModule.target
      );

      await expect(tx).to.not.be.reverted;
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
  });

  describe(".moduleCheck", () => {
    it("should revert or return false when sender has locked balance", async () => {
      const context = await loadFixture(deployLockInTransferModule);

      const { compliance, lockInModule } = context.suite;
      const { deployer, aliceWallet, bobWallet } = context.accounts;

      const setWaitPeriodTx = await compliance.connect(deployer).callModuleFunction(
        new ethers.Interface([
          "function setWaitPeriod(uint256)",
        ]).encodeFunctionData("setWaitPeriod", [200]),
        await lockInModule.getAddress()
      );
      await setWaitPeriodTx.wait();

      await expect(setWaitPeriodTx)
        .to.emit(lockInModule, "WaitPeriod")
        .withArgs(await compliance.getAddress(), 200);

      const mintTx = await compliance.callModuleFunction(
        new ethers.Interface([
          "function moduleMintAction(address,uint256)",
        ]).encodeFunctionData("moduleMintAction", [aliceWallet.address, 200]),
        lockInModule.target
      );
      await mintTx.wait()

      const transferTx = await compliance.callModuleFunction(
        new ethers.Interface([
          "function moduleTransferAction(address,address,uint256)",
        ]).encodeFunctionData("moduleTransferAction", [
          aliceWallet.address,
          bobWallet.address,
          50,
        ]),
        lockInModule.target
      );
      await transferTx.wait()

      // Example check
      await expect(
        lockInModule.moduleCheck(
          bobWallet.address,
          aliceWallet.address,
          50,
          compliance.target
        )
      ).to.eventually.eq(false);
    });
  });
});
