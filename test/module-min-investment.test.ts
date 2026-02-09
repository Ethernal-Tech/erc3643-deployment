import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";
import { expect } from "chai";
import { deployComplianceFixture } from "./fixtures/deploy-compliance.fixture";
import MinInvestmentModule from "../artifacts/contracts/compliance/MinInvestmentModule.sol/MinInvestmentModule.json";
import TRex from "@tokenysolutions/t-rex";

async function deployMinInvestmentModule() {
  const context = await loadFixture(deployComplianceFixture);
  const { token } = context.suite;
  const { deployer } = context.accounts;

  const module = await new ethers.ContractFactory(
    MinInvestmentModule.abi,
    MinInvestmentModule.bytecode,
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

  const minInvestmentModule = await ethers.getContractAt(
    MinInvestmentModule.abi,
    proxy.target,
    deployer
  );

  const complianceAddr = await token.compliance();

  const compliance = await ethers.getContractAt(
    TRex.contracts.ModularCompliance.abi,
    complianceAddr
  );

  await compliance.addModule(minInvestmentModule.target);

  return {
    ...context,
    suite: {
      ...context.suite,
      minInvestmentModule,
      compliance,
    },
  };
}

describe("Compliance Module: MinInvestment", () => {
  describe(".name", () => {
    it("should return the module name", async () => {
      const context = await loadFixture(deployMinInvestmentModule);
      expect(await context.suite.minInvestmentModule.name()).to.eq(
        "MinInvestmentModule"
      );
    });
  });

  describe(".initialize", () => {
    it("should only be callable once", async () => {
      const { accounts } = await loadFixture(deployComplianceFixture);
      const module = (
        await ethers.deployContract("MinInvestmentModule")
      ).connect(accounts.deployer);
      await module.initialize();

      await expect(module.initialize()).to.be.revertedWith(
        "Initializable: contract is already initialized"
      );
      expect(await module.owner()).to.eq(accounts.deployer.address);
    });
  });

  describe(".setMinInvestment", () => {
    it("should revert if called directly", async () => {
      const context = await loadFixture(deployMinInvestmentModule);
      await expect(
        context.suite.minInvestmentModule.setMinInvestment(10)
      ).to.be.revertedWith("only bound compliance can call");
    });

    it("should allow compliance to set min investment", async () => {
      const context = await loadFixture(deployMinInvestmentModule);
      await expect(context.suite.compliance
        .callModuleFunction(
          new ethers.Interface([
            "function setMinInvestment(uint256)",
          ]).encodeFunctionData("setMinInvestment", [10]),
          context.suite.minInvestmentModule.target
        )).to.not.be.reverted;
    });
  });

  describe(".moduleTransferAction", () => {
    it("should revert if called directly", async () => {
      const context = await loadFixture(deployMinInvestmentModule);
      await expect(
        context.suite.minInvestmentModule.moduleTransferAction(
          context.accounts.aliceWallet.address,
          context.accounts.bobWallet.address,
          100
        )
      ).to.be.revertedWith("only bound compliance can call");
    });

    it("should work properly", async () => {
      const context = await loadFixture(deployMinInvestmentModule);
      const { compliance, minInvestmentModule } = context.suite;
      const { aliceWallet, bobWallet } = context.accounts;

      await expect(compliance.callModuleFunction(
        new ethers.Interface([
          "function moduleTransferAction(address,address,uint256)",
        ]).encodeFunctionData("moduleTransferAction", [
          aliceWallet.address,
          bobWallet.address,
          50,
        ]),
        minInvestmentModule.target
      )).to.emit(compliance, "ModuleInteraction");
    });
  });

  describe(".moduleCheck", () => {
    it("should work when at least min investment is transferred", async () => {
      const context = await loadFixture(deployMinInvestmentModule);

      const { compliance, minInvestmentModule } = context.suite;
      const { aliceWallet, bobWallet } = context.accounts;

      await expect(compliance
        .callModuleFunction(
          new ethers.Interface([
            "function setMinInvestment(uint256)",
          ]).encodeFunctionData("setMinInvestment", [10]),
          minInvestmentModule.target
        )).to.not.be.reverted;

      await expect(
        minInvestmentModule.moduleCheck(
          bobWallet.address,
          aliceWallet.address,
          30,
          compliance.target
        )
      ).to.eventually.true;
    });

    it("should work when at least min investment amount is minted", async () => {
      const context = await loadFixture(deployMinInvestmentModule);

      const { compliance, minInvestmentModule } = context.suite;
      const { aliceWallet } = context.accounts;

      await expect(compliance
        .callModuleFunction(
          new ethers.Interface([
            "function setMinInvestment(uint256)",
          ]).encodeFunctionData("setMinInvestment", [50]),
          minInvestmentModule.target
        )).to.not.be.reverted;

      await expect(
        minInvestmentModule.moduleCheck(
          ethers.ZeroAddress,
          aliceWallet.address,
          50,
          compliance.target
        )
      ).to.eventually.true;
    });

    it("should revert or return false when mint is below min investment", async () => {
      const context = await loadFixture(deployMinInvestmentModule);

      const { compliance, minInvestmentModule } = context.suite;
      const { bobWallet } = context.accounts;

      await expect(compliance
        .callModuleFunction(
          new ethers.Interface([
            "function setMinInvestment(uint256)",
          ]).encodeFunctionData("setMinInvestment", [50]),
          minInvestmentModule.target
        )).to.not.be.reverted;

      // mint to bob below min investment
      await expect(
        minInvestmentModule.moduleCheck(
          ethers.ZeroAddress,
          bobWallet.address,
          30,
          compliance.target
        )
      ).to.eventually.false;
    });
  });

  it("should revert or return false when transfer is below min investment", async () => {
    const context = await loadFixture(deployMinInvestmentModule);

    const { compliance, minInvestmentModule } = context.suite;
    const { aliceWallet, bobWallet } = context.accounts;

    await expect(compliance
      .callModuleFunction(
        new ethers.Interface([
          "function setMinInvestment(uint256)",
        ]).encodeFunctionData("setMinInvestment", [50]),
        minInvestmentModule.target
      )).to.not.be.reverted;

    await expect(
      minInvestmentModule.moduleCheck(
        bobWallet.address,
        aliceWallet.address,
        30,
        compliance.target
      )
    ).to.eventually.false;
  });

  it("should work for invest more mints", async () => {
    const context = await loadFixture(deployMinInvestmentModule);

    const { compliance, minInvestmentModule } = context.suite;
    const { aliceWallet } = context.accounts;

    await expect(compliance
      .callModuleFunction(
        new ethers.Interface([
          "function setMinInvestment(uint256)",
        ]).encodeFunctionData("setMinInvestment", [50]),
        minInvestmentModule.target
      )).to.not.be.reverted;

    // first mint to alice at min investment
    await expect(compliance.callModuleFunction(
      new ethers.Interface([
        "function moduleMintAction(address,uint256)",
      ]).encodeFunctionData("moduleMintAction", [
        aliceWallet.address,
        50,
      ]),
      minInvestmentModule.target
    )).to.emit(compliance, "ModuleInteraction");

    // mint more to alice below min investment after she has already invested
    await expect(
      minInvestmentModule.moduleCheck(
        ethers.ZeroAddress,
        aliceWallet.address,
        10,
        compliance.target
      )
    ).to.eventually.true;
  });

  it("should work for invest more transfers", async () => {
    const context = await loadFixture(deployMinInvestmentModule);

    const { compliance, minInvestmentModule } = context.suite;
    const { aliceWallet, bobWallet } = context.accounts;
    await expect(compliance
      .callModuleFunction(
        new ethers.Interface([
          "function setMinInvestment(uint256)",
        ]).encodeFunctionData("setMinInvestment", [50]),
        minInvestmentModule.target
      )).to.not.be.reverted;

    // first mint to alice at min investment
    await expect(compliance.callModuleFunction(
      new ethers.Interface([
        "function moduleMintAction(address,uint256)",
      ]).encodeFunctionData("moduleMintAction", [
        aliceWallet.address,
        50,
      ]),
      minInvestmentModule.target
    )).to.emit(compliance, "ModuleInteraction");

    // transfer more to alice below min investment after she has already invested
    await expect(
      minInvestmentModule.moduleCheck(
        bobWallet.address,
        aliceWallet.address,
        10,
        compliance.target
      )
    ).to.eventually.true;
  });
});
