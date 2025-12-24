import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";
import { expect } from "chai";
import { deployComplianceFixture } from "./fixtures/deploy-compliance.fixture";
import PermitTransferModule from "../artifacts/contracts/compliance/PermitTransferModule.sol/PermitTransferModule.json";
import TRex from "@tokenysolutions/t-rex";

async function deployPermitTransferModule() {
  const context = await loadFixture(deployComplianceFixture);
  const { token } = context.suite;
  const { deployer } = context.accounts;

  const module = await new ethers.ContractFactory(
    PermitTransferModule.abi,
    PermitTransferModule.bytecode,
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

  const permitTransferModule = await ethers.getContractAt(
    PermitTransferModule.abi,
    proxy.target,
    deployer
  );

  const complianceAddr = await token.compliance();

  const compliance = await ethers.getContractAt(
    TRex.contracts.ModularCompliance.abi,
    complianceAddr
  );

  await compliance.addModule(permitTransferModule.target);
  return {
    ...context,
    suite: {
      ...context.suite,
      permitTransferModule,
      compliance,
    },
  };
}

describe("Compliance Module: PermitTransfer", () => {
  describe(".name", () => {
    it("should return the module name", async () => {
      const context = await loadFixture(deployPermitTransferModule);
      expect(await context.suite.permitTransferModule.name()).to.eq(
        "PermitTransferModule"
      );
    });
  });

  describe(".initialize", () => {
    it("should only be callable once", async () => {
      const { accounts } = await loadFixture(deployComplianceFixture);
      const module = (
        await ethers.deployContract("PermitTransferModule")
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
      const context = await loadFixture(deployPermitTransferModule);
      const { aliceWallet, bobWallet } = context.accounts;

      await expect(
        context.suite.permitTransferModule.transferPermit(aliceWallet.address, bobWallet.address, 10)
      ).to.be.revertedWith("only bound compliance can call");
    });

    it("should allow compliance to permit transfer", async () => {
      const context = await loadFixture(deployPermitTransferModule);
      const { aliceWallet, bobWallet } = context.accounts;

      await expect(context.suite.compliance
        .callModuleFunction(
          new ethers.Interface([
            "function transferPermit(address,address,uint256)",
          ]).encodeFunctionData("transferPermit", [aliceWallet.address, bobWallet.address, 50]),
          context.suite.permitTransferModule.target
        )).to.not.be.reverted;
    });
  });

  describe(".removeTransferPermission", () => {
    it("should revert if called directly", async () => {
      const context = await loadFixture(deployPermitTransferModule);
      const { aliceWallet, bobWallet } = context.accounts;

      await expect(
        context.suite.permitTransferModule.removeTransferPermission(aliceWallet.address, bobWallet.address, 10)
      ).to.be.revertedWith("only bound compliance can call");
    });

    it("should revert if previously not permitted", async () => {
      const context = await loadFixture(deployPermitTransferModule);
      const { aliceWallet, bobWallet } = context.accounts;

      await expect(context.suite.compliance
        .callModuleFunction(
          new ethers.Interface([
            "function removeTransferPermission(address,address,uint256)",
          ]).encodeFunctionData("removeTransferPermission", [aliceWallet.address, bobWallet.address, 50]),
          context.suite.permitTransferModule.target
        )).to.be.revertedWithCustomError(context.suite.permitTransferModule, "TransferNotPermitted");
    });

    it("should allow compliance to remove transfer permission", async () => {
      const context = await loadFixture(deployPermitTransferModule);
      const { aliceWallet, bobWallet } = context.accounts;

      // First permit the transfer
      await expect(context.suite.compliance
        .callModuleFunction(
          new ethers.Interface([
            "function transferPermit(address,address,uint256)",
          ]).encodeFunctionData("transferPermit", [aliceWallet.address, bobWallet.address, 50]),
          context.suite.permitTransferModule.target
        )).to.not.be.reverted;

      // Remove permission
      await expect(context.suite.compliance
        .callModuleFunction(
          new ethers.Interface([
            "function removeTransferPermission(address,address,uint256)",
          ]).encodeFunctionData("removeTransferPermission", [aliceWallet.address, bobWallet.address, 50]),
          context.suite.permitTransferModule.target
        )).to.not.be.reverted;
    });
  });

  describe(".batchTransfersPermit", () => {
    it("should revert if called directly", async () => {
      const context = await loadFixture(deployPermitTransferModule);
      const { aliceWallet, bobWallet } = context.accounts;

      await expect(
        context.suite.permitTransferModule.batchTransfersPermit([aliceWallet.address], [bobWallet.address], [10])
      ).to.be.revertedWith("only bound compliance can call");
    });

    it("should allow compliance to permit transfer", async () => {
      const context = await loadFixture(deployPermitTransferModule);
      const { aliceWallet, bobWallet } = context.accounts;

      await expect(context.suite.compliance
        .callModuleFunction(
          new ethers.Interface([
            "function batchTransfersPermit(address[],address[],uint256[])",
          ]).encodeFunctionData("batchTransfersPermit", [[aliceWallet.address], [bobWallet.address], [50]]),
          context.suite.permitTransferModule.target
        )).to.not.be.reverted;
    });
  });

  describe(".batchRemoveTransfersPermission", () => {
    it("should revert if called directly", async () => {
      const context = await loadFixture(deployPermitTransferModule);
      const { aliceWallet, bobWallet } = context.accounts;

      await expect(
        context.suite.permitTransferModule.batchRemoveTransfersPermission([aliceWallet.address], [bobWallet.address], [10])
      ).to.be.revertedWith("only bound compliance can call");
    });

    it("should revert if previously not permitted", async () => {
      const context = await loadFixture(deployPermitTransferModule);
      const { aliceWallet, bobWallet } = context.accounts;

      await expect(context.suite.compliance
        .callModuleFunction(
          new ethers.Interface([
            "function batchRemoveTransfersPermission(address[],address[],uint256[])",
          ]).encodeFunctionData("batchRemoveTransfersPermission", [[aliceWallet.address], [bobWallet.address], [50]]),
          context.suite.permitTransferModule.target
        )).to.be.revertedWithCustomError(context.suite.permitTransferModule, "TransferNotPermitted");
    });

    it("should allow compliance to remove transfer permission", async () => {
      const context = await loadFixture(deployPermitTransferModule);
      const { aliceWallet, bobWallet } = context.accounts;

      // First permit the transfer
      await expect(context.suite.compliance
        .callModuleFunction(
          new ethers.Interface([
            "function transferPermit(address,address,uint256)",
          ]).encodeFunctionData("transferPermit", [aliceWallet.address, bobWallet.address, 50]),
          context.suite.permitTransferModule.target
        )).to.not.be.reverted;

      // Remove permission
      await expect(context.suite.compliance
        .callModuleFunction(
          new ethers.Interface([
            "function batchRemoveTransfersPermission(address[],address[],uint256[])",
          ]).encodeFunctionData("batchRemoveTransfersPermission", [[aliceWallet.address], [bobWallet.address], [50]]),
          context.suite.permitTransferModule.target
        )).to.not.be.reverted;
    });
  });

  describe(".moduleTransferAction", () => {
    it("should revert if called directly", async () => {
      const context = await loadFixture(deployPermitTransferModule);
      await expect(
        context.suite.permitTransferModule.moduleTransferAction(
          context.accounts.aliceWallet.address,
          context.accounts.bobWallet.address,
          100
        )
      ).to.be.revertedWith("only bound compliance can call");
    });

    it("should work properly", async () => {
      const context = await loadFixture(deployPermitTransferModule);
      const { compliance, permitTransferModule } = context.suite;
      const { aliceWallet, bobWallet } = context.accounts;

      await expect(compliance.callModuleFunction(
        new ethers.Interface([
          "function moduleTransferAction(address,address,uint256)",
        ]).encodeFunctionData("moduleTransferAction", [
          aliceWallet.address,
          bobWallet.address,
          50,
        ]),
        permitTransferModule.target
      )).to.emit(compliance, "ModuleInteraction");
    });
  });

  describe(".moduleCheck", () => {
    it("should work when minting", async () => {
      const context = await loadFixture(deployPermitTransferModule);

      const { compliance, permitTransferModule } = context.suite;
      const { aliceWallet } = context.accounts;

      await expect(
        permitTransferModule.moduleCheck(
          ethers.ZeroAddress,
          aliceWallet.address,
          50,
          compliance.target
        )
      ).to.eventually.true;
    });

    it("should work when token owner executes a transfer", async () => {
      const context = await loadFixture(deployPermitTransferModule);

      const { compliance, permitTransferModule } = context.suite;
      const { deployer, aliceWallet } = context.accounts; // token owner
        
      await expect(
        permitTransferModule.moduleCheck(
          deployer.address,
          aliceWallet.address,
          50,
          compliance.target
        )
      ).to.eventually.true;
    });

    it("should work when transfer is permitted", async () => {
      const context = await loadFixture(deployPermitTransferModule);

      const { compliance, permitTransferModule, token } = context.suite;
      const { aliceWallet, bobWallet } = context.accounts;

      await expect(compliance
        .callModuleFunction(
          new ethers.Interface([
            "function transferPermit(address,address,uint256)",
          ]).encodeFunctionData("transferPermit", [aliceWallet.address, bobWallet.address, 50]),
          permitTransferModule.target
        )
      ).to.emit(permitTransferModule, "TransferPermitted").withArgs(aliceWallet.address, bobWallet.address, 50, token.target);

      await expect(
        permitTransferModule.moduleCheck(
          aliceWallet.address,
          bobWallet.address,
          50,
          compliance.target
        )
      ).to.eventually.true;
    });

    it("should revert or return false when transfer is not permitted", async () => {
      const context = await loadFixture(deployPermitTransferModule);

      const { compliance, permitTransferModule } = context.suite;
      const { aliceWallet, bobWallet } = context.accounts;

      await expect(
        permitTransferModule.moduleCheck(
          aliceWallet.address,
          bobWallet.address,
          50,
          compliance.target
        )
      ).to.eventually.false;
    });
  });
});
