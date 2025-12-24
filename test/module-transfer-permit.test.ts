import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";
import { expect } from "chai";
import { deployComplianceFixture } from "./fixtures/deploy-compliance.fixture";
import TransferPermitModule from "../artifacts/contracts/compliance/TransferPermitModule.sol/TransferPermitModule.json";
import TRex from "@tokenysolutions/t-rex";

async function deployTransferPermitModule() {
  const context = await loadFixture(deployComplianceFixture);
  const { token } = context.suite;
  const { deployer } = context.accounts;

  const module = await new ethers.ContractFactory(
    TransferPermitModule.abi,
    TransferPermitModule.bytecode,
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

  const transferPermitModule = await ethers.getContractAt(
    TransferPermitModule.abi,
    proxy.target,
    deployer
  );

  const complianceAddr = await token.compliance();

  const compliance = await ethers.getContractAt(
    TRex.contracts.ModularCompliance.abi,
    complianceAddr
  );

  await compliance.addModule(transferPermitModule.target);
  return {
    ...context,
    suite: {
      ...context.suite,
      transferPermitModule,
      compliance,
    },
  };
}

describe("Compliance Module: TransferPermit", () => {
  describe(".name", () => {
    it("should return the module name", async () => {
      const context = await loadFixture(deployTransferPermitModule);
      expect(await context.suite.transferPermitModule.name()).to.eq(
        "TransferPermitModule"
      );
    });
  });

  describe(".initialize", () => {
    it("should only be callable once", async () => {
      const { accounts } = await loadFixture(deployComplianceFixture);
      const module = (
        await ethers.deployContract("TransferPermitModule")
      ).connect(accounts.deployer);
      await module.initialize();

      await expect(module.initialize()).to.be.revertedWith(
        "Initializable: contract is already initialized"
      );
      expect(await module.owner()).to.eq(accounts.deployer.address);
    });
  });

  describe(".transferPermit", () => {
    it("should revert if called directly", async () => {
      const context = await loadFixture(deployTransferPermitModule);
      const { aliceWallet, bobWallet } = context.accounts;

      await expect(
        context.suite.transferPermitModule.transferPermit(aliceWallet.address, bobWallet.address, 10)
      ).to.be.revertedWith("only bound compliance can call");
    });

    it("should allow compliance to permit transfer", async () => {
      const context = await loadFixture(deployTransferPermitModule);
      const { aliceWallet, bobWallet } = context.accounts;

      await expect(context.suite.compliance
        .callModuleFunction(
          new ethers.Interface([
            "function transferPermit(address,address,uint256)",
          ]).encodeFunctionData("transferPermit", [aliceWallet.address, bobWallet.address, 50]),
          context.suite.transferPermitModule.target
        )).to.not.be.reverted;
    });
  });

  describe(".removeTransferPermission", () => {
    it("should revert if called directly", async () => {
      const context = await loadFixture(deployTransferPermitModule);
      const { aliceWallet, bobWallet } = context.accounts;

      await expect(
        context.suite.transferPermitModule.removeTransferPermission(aliceWallet.address, bobWallet.address, 10)
      ).to.be.revertedWith("only bound compliance can call");
    });

    it("should revert if previously not permitted", async () => {
      const context = await loadFixture(deployTransferPermitModule);
      const { aliceWallet, bobWallet } = context.accounts;

      await expect(context.suite.compliance
        .callModuleFunction(
          new ethers.Interface([
            "function removeTransferPermission(address,address,uint256)",
          ]).encodeFunctionData("removeTransferPermission", [aliceWallet.address, bobWallet.address, 50]),
          context.suite.transferPermitModule.target
        )).to.be.revertedWithCustomError(context.suite.transferPermitModule, "TransferNotPermitted");
    });

    it("should allow compliance to remove transfer permission", async () => {
      const context = await loadFixture(deployTransferPermitModule);
      const { aliceWallet, bobWallet } = context.accounts;

      // First permit the transfer
      await expect(context.suite.compliance
        .callModuleFunction(
          new ethers.Interface([
            "function transferPermit(address,address,uint256)",
          ]).encodeFunctionData("transferPermit", [aliceWallet.address, bobWallet.address, 50]),
          context.suite.transferPermitModule.target
        )).to.not.be.reverted;

      // Remove permission
      await expect(context.suite.compliance
        .callModuleFunction(
          new ethers.Interface([
            "function removeTransferPermission(address,address,uint256)",
          ]).encodeFunctionData("removeTransferPermission", [aliceWallet.address, bobWallet.address, 50]),
          context.suite.transferPermitModule.target
        )).to.not.be.reverted;
    });
  });

  describe(".batchTransfersPermit", () => {
    it("should revert if called directly", async () => {
      const context = await loadFixture(deployTransferPermitModule);
      const { aliceWallet, bobWallet } = context.accounts;

      await expect(
        context.suite.transferPermitModule.batchTransfersPermit([aliceWallet.address], [bobWallet.address], [10])
      ).to.be.revertedWith("only bound compliance can call");
    });

    it("should allow compliance to permit transfer", async () => {
      const context = await loadFixture(deployTransferPermitModule);
      const { aliceWallet, bobWallet } = context.accounts;

      await expect(context.suite.compliance
        .callModuleFunction(
          new ethers.Interface([
            "function batchTransfersPermit(address[],address[],uint256[])",
          ]).encodeFunctionData("batchTransfersPermit", [[aliceWallet.address], [bobWallet.address], [50]]),
          context.suite.transferPermitModule.target
        )).to.not.be.reverted;
    });
  });

  describe(".batchRemoveTransfersPermission", () => {
    it("should revert if called directly", async () => {
      const context = await loadFixture(deployTransferPermitModule);
      const { aliceWallet, bobWallet } = context.accounts;

      await expect(
        context.suite.transferPermitModule.batchRemoveTransfersPermission([aliceWallet.address], [bobWallet.address], [10])
      ).to.be.revertedWith("only bound compliance can call");
    });

    it("should revert if previously not permitted", async () => {
      const context = await loadFixture(deployTransferPermitModule);
      const { aliceWallet, bobWallet } = context.accounts;

      await expect(context.suite.compliance
        .callModuleFunction(
          new ethers.Interface([
            "function batchRemoveTransfersPermission(address[],address[],uint256[])",
          ]).encodeFunctionData("batchRemoveTransfersPermission", [[aliceWallet.address], [bobWallet.address], [50]]),
          context.suite.transferPermitModule.target
        )).to.be.revertedWithCustomError(context.suite.transferPermitModule, "TransferNotPermitted");
    });

    it("should allow compliance to remove transfer permission", async () => {
      const context = await loadFixture(deployTransferPermitModule);
      const { aliceWallet, bobWallet } = context.accounts;

      // First permit the transfer
      await expect(context.suite.compliance
        .callModuleFunction(
          new ethers.Interface([
            "function transferPermit(address,address,uint256)",
          ]).encodeFunctionData("transferPermit", [aliceWallet.address, bobWallet.address, 50]),
          context.suite.transferPermitModule.target
        )).to.not.be.reverted;

      // Remove permission
      await expect(context.suite.compliance
        .callModuleFunction(
          new ethers.Interface([
            "function batchRemoveTransfersPermission(address[],address[],uint256[])",
          ]).encodeFunctionData("batchRemoveTransfersPermission", [[aliceWallet.address], [bobWallet.address], [50]]),
          context.suite.transferPermitModule.target
        )).to.not.be.reverted;
    });
  });

  describe(".moduleTransferAction", () => {
    it("should revert if called directly", async () => {
      const context = await loadFixture(deployTransferPermitModule);
      await expect(
        context.suite.transferPermitModule.moduleTransferAction(
          context.accounts.aliceWallet.address,
          context.accounts.bobWallet.address,
          100
        )
      ).to.be.revertedWith("only bound compliance can call");
    });

    it("should work properly", async () => {
      const context = await loadFixture(deployTransferPermitModule);
      const { compliance, transferPermitModule } = context.suite;
      const { aliceWallet, bobWallet } = context.accounts;

      await expect(compliance.callModuleFunction(
        new ethers.Interface([
          "function moduleTransferAction(address,address,uint256)",
        ]).encodeFunctionData("moduleTransferAction", [
          aliceWallet.address,
          bobWallet.address,
          50,
        ]),
        transferPermitModule.target
      )).to.emit(compliance, "ModuleInteraction");
    });
  });

  describe(".moduleCheck", () => {
    it("should work when minting", async () => {
      const context = await loadFixture(deployTransferPermitModule);

      const { compliance, transferPermitModule } = context.suite;
      const { aliceWallet } = context.accounts;

      await expect(
        transferPermitModule.moduleCheck(
          ethers.ZeroAddress,
          aliceWallet.address,
          50,
          compliance.target
        )
      ).to.eventually.true;
    });

    it("should work when token owner executes a transfer", async () => {
      const context = await loadFixture(deployTransferPermitModule);

      const { compliance, transferPermitModule } = context.suite;
      const { deployer, aliceWallet } = context.accounts; // token owner
        
      await expect(
        transferPermitModule.moduleCheck(
          deployer.address,
          aliceWallet.address,
          50,
          compliance.target
        )
      ).to.eventually.true;
    });

    it("should work when transfer is permitted", async () => {
      const context = await loadFixture(deployTransferPermitModule);

      const { compliance, transferPermitModule, token } = context.suite;
      const { aliceWallet, bobWallet } = context.accounts;

      await expect(compliance
        .callModuleFunction(
          new ethers.Interface([
            "function transferPermit(address,address,uint256)",
          ]).encodeFunctionData("transferPermit", [aliceWallet.address, bobWallet.address, 50]),
          transferPermitModule.target
        )
      ).to.emit(transferPermitModule, "TransferPermitted").withArgs(aliceWallet.address, bobWallet.address, 50, token.target);

      await expect(
        transferPermitModule.moduleCheck(
          aliceWallet.address,
          bobWallet.address,
          50,
          compliance.target
        )
      ).to.eventually.true;
    });

    it("should revert or return false when transfer is not permitted", async () => {
      const context = await loadFixture(deployTransferPermitModule);

      const { compliance, transferPermitModule } = context.suite;
      const { aliceWallet, bobWallet } = context.accounts;

      await expect(
        transferPermitModule.moduleCheck(
          aliceWallet.address,
          bobWallet.address,
          50,
          compliance.target
        )
      ).to.eventually.false;
    });
  });
});
