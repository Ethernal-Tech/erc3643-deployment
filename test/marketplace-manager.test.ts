import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";
import { expect } from "chai";
import { deployComplianceFixture } from "./fixtures/deploy-compliance.fixture";
import MarketplaceManager from "../artifacts/contracts/marketplace/MarketplaceManager.sol/MarketplaceManager.json";
import TransparentUpgradeableProxy from "@openzeppelin/contracts/build/contracts/TransparentUpgradeableProxy.json";

async function deployMarketplaceManager() {
  const context = await loadFixture(deployComplianceFixture);
  const { token } = context.suite;
  const { deployer, aliceWallet, bobWallet, tokenAgent } = context.accounts;

  const implementation = await new ethers.ContractFactory(
    MarketplaceManager.abi,
    MarketplaceManager.bytecode,
    deployer
  ).deploy();

  const proxy = await new ethers.ContractFactory(
    TransparentUpgradeableProxy.abi,
    TransparentUpgradeableProxy.bytecode,
    deployer
  ).deploy(
    implementation.target,
    deployer.address,
    implementation.interface.encodeFunctionData("initialize")
  );

  const marketplaceManager = await ethers.getContractAt(MarketplaceManager.abi, proxy.target);

  await token.connect(tokenAgent).mint(aliceWallet, 100)
  await token.connect(tokenAgent).mint(bobWallet, 100)
  await token.connect(tokenAgent).unpause()

  // add marketplace manager as a token agent
  await token.connect(deployer).addAgent(marketplaceManager.target)

  return {
    ...context,
    suite: {
      ...context.suite,
      marketplaceManager,
    },
  };
}

describe("Marketplace Manager", () => {
  describe(".initialize", () => {
    it("should only be callable once", async () => {
      const { accounts } = await loadFixture(deployComplianceFixture);
      const manager = (
        await ethers.deployContract("MarketplaceManager")
      ).connect(accounts.deployer);
      await manager.initialize();

      await expect(manager.initialize()).to.be.revertedWith(
        "Initializable: contract is already initialized"
      );
      expect(await manager.owner()).to.eq(accounts.deployer.address);
    });
  });

  describe(".initiateTransfer", () => {
    it("should revert if sender (initiator) has no enough balance", async () => {
      const context = await loadFixture(deployMarketplaceManager);
      const { token, marketplaceManager } = context.suite;
      const { aliceWallet, bobWallet } = context.accounts;

      await expect(
        marketplaceManager.connect(aliceWallet).initiateTransfer(token, 200, bobWallet, token, 20)
      ).to.be.revertedWith("not enough tokens in balance");
    });

    it("should revert if sender (initiator) has no approved balance in favour of marketplace manager", async () => {
      const context = await loadFixture(deployMarketplaceManager);
      const { token, marketplaceManager } = context.suite;
      const { aliceWallet, bobWallet } = context.accounts;

      await expect(
        marketplaceManager.connect(aliceWallet).initiateTransfer(token, 50, bobWallet, token, 20)
      ).to.be.revertedWith("not enough allowance to initiate transfer");
    });

    it("should revert if counterpart address is 0", async () => {
      const context = await loadFixture(deployMarketplaceManager);
      const { token, marketplaceManager } = context.suite;
      const { aliceWallet } = context.accounts;

      // approve transfer
      await token.connect(aliceWallet).approve(marketplaceManager.target, 50)

      await expect(
        marketplaceManager.connect(aliceWallet).initiateTransfer(token, 50, ethers.ZeroAddress, token, 20)
      ).to.be.revertedWith("counterpart address cannot be null");
    });

    it("should revert if token2 is not an ERC20", async () => {
      const context = await loadFixture(deployMarketplaceManager);
      const { token, marketplaceManager } = context.suite;
      const { aliceWallet, bobWallet } = context.accounts;

      // approve transfer
      await token.connect(aliceWallet).approve(marketplaceManager.target, 50)

      await expect(
        marketplaceManager.connect(aliceWallet).initiateTransfer(token, 50, bobWallet, marketplaceManager, 20)
      ).to.be.reverted;
    });

    it("should initiate transfer properly", async () => {
      const context = await loadFixture(deployMarketplaceManager);
      const { token, marketplaceManager } = context.suite;
      const { aliceWallet, bobWallet } = context.accounts;

      // approve transfer
      await token.connect(aliceWallet).approve(marketplaceManager.target, 50)

      await expect(
        marketplaceManager.connect(aliceWallet).initiateTransfer(token, 50, bobWallet, token, 20)
      ).to.emit(marketplaceManager, "TransferInitiated");
    });
  });

  describe(".takeTransfer", () => {
    it("should revert if transfer not initiated previously", async () => {
      const context = await loadFixture(deployMarketplaceManager);
      const { marketplaceManager } = context.suite;
      const { bobWallet } = context.accounts;

      await expect(
        marketplaceManager.connect(bobWallet).takeTransfer(ethers.encodeBytes32String("0"))
      ).to.be.revertedWith("transfer ID does not exist");
    });

    it("should revert if sender (taker) is not a counterpart user", async () => {
      const context = await loadFixture(deployMarketplaceManager);
      const { token, marketplaceManager } = context.suite;
      const { aliceWallet, bobWallet } = context.accounts;

            // approve transfer
      await token.connect(aliceWallet).approve(marketplaceManager.target, 50)
      await expect(
        marketplaceManager.connect(aliceWallet).initiateTransfer(token, 50, bobWallet, token, 20)
      ).to.emit(marketplaceManager, "TransferInitiated");

      const id = await marketplaceManager.connect(aliceWallet).computeTransferID(0, aliceWallet, token, 50, bobWallet, token, 20)
      await expect(
        marketplaceManager.connect(aliceWallet).takeTransfer(id)
      ).to.be.revertedWith("transfer has to be executed by the counterpart or by token agent");
    });

    it("should revert if sender (taker) has no enough balance", async () => {
      const context = await loadFixture(deployMarketplaceManager);
      const { token, marketplaceManager } = context.suite;
      const { aliceWallet, bobWallet } = context.accounts;

      // approve transfer
      await token.connect(aliceWallet).approve(marketplaceManager.target, 50)
      await expect(
        marketplaceManager.connect(aliceWallet).initiateTransfer(token, 50, bobWallet, token, 200)
      ).to.emit(marketplaceManager, "TransferInitiated");

      const id = await marketplaceManager.connect(bobWallet).computeTransferID(0, aliceWallet, token, 50, bobWallet, token, 200)
      await expect(
        marketplaceManager.connect(bobWallet).takeTransfer(id)
      ).to.be.revertedWith("not enough tokens in balance");
    });

    it("should revert if sender (taker) has no approved balance in favour of marketplace manager", async () => {
      const context = await loadFixture(deployMarketplaceManager);
      const { token, marketplaceManager } = context.suite;
      const { aliceWallet, bobWallet } = context.accounts;

      // approve transfer
      await token.connect(aliceWallet).approve(marketplaceManager.target, 50)
      await expect(
        marketplaceManager.connect(aliceWallet).initiateTransfer(token, 50, bobWallet, token, 20)
      ).to.emit(marketplaceManager, "TransferInitiated");

      const id = await marketplaceManager.connect(bobWallet).computeTransferID(0, aliceWallet, token, 50, bobWallet, token, 20)
      await expect(
        marketplaceManager.connect(bobWallet).takeTransfer(id)
      ).to.be.revertedWith("not enough allowance to transfer");
    });
  });

  it("should execute transfer properly", async () => {
    const context = await loadFixture(deployMarketplaceManager);
    const { token, marketplaceManager } = context.suite;
    const { aliceWallet, bobWallet } = context.accounts;

    // approve transfer
    await token.connect(aliceWallet).approve(marketplaceManager.target, 50)
    await expect(
      marketplaceManager.connect(aliceWallet).initiateTransfer(token, 50, bobWallet, token, 20)
    ).to.emit(marketplaceManager, "TransferInitiated");

    // approve transfer
    await token.connect(bobWallet).approve(marketplaceManager.target, 20)
    const id = await marketplaceManager.connect(bobWallet).computeTransferID(0, aliceWallet, token, 50, bobWallet, token, 20)
    await expect(
      marketplaceManager.connect(bobWallet).takeTransfer(id)
    ).to.emit(marketplaceManager, "TransferExecuted").withArgs(id)
  });

  describe(".takeMintTransfer", () => {
    it("should revert if transfer not initiated previously", async () => {
      const context = await loadFixture(deployMarketplaceManager);
      const { marketplaceManager } = context.suite;
      const { bobWallet } = context.accounts;

      await expect(
        marketplaceManager.connect(bobWallet).takeMintTransfer(ethers.encodeBytes32String("0"))
      ).to.be.revertedWith("transfer ID does not exist");
    });

    it("should revert if taker is not a token2 owner", async () => {
      const context = await loadFixture(deployMarketplaceManager);
      const { token, marketplaceManager } = context.suite;
      const { aliceWallet, bobWallet, tokenAgent } = context.accounts;

      // approve transfer
      await token.connect(aliceWallet).approve(marketplaceManager.target, 50)
      await expect(
        marketplaceManager.connect(aliceWallet).initiateTransfer(token, 50, bobWallet, token, 20)
      ).to.emit(marketplaceManager, "TransferInitiated");

      const id = await marketplaceManager.connect(aliceWallet).computeTransferID(0, aliceWallet, token, 50, bobWallet, token, 20)
      await expect(
        marketplaceManager.connect(tokenAgent).takeMintTransfer(id)
      ).to.be.revertedWith("mint can be executed by token agent if token owner is set as taker");
    });

    it("should revert if sender is not a token2 agent", async () => {
      const context = await loadFixture(deployMarketplaceManager);
      const { token, marketplaceManager } = context.suite;
      const { aliceWallet, bobWallet, deployer } = context.accounts;

      // approve transfer
      await token.connect(aliceWallet).approve(marketplaceManager.target, 50)
      await expect(
        marketplaceManager.connect(aliceWallet).initiateTransfer(token, 50, deployer, token, 20)
      ).to.emit(marketplaceManager, "TransferInitiated");

      const id = await marketplaceManager.connect(aliceWallet).computeTransferID(0, aliceWallet, token, 50, deployer, token, 20)
      await expect(
        marketplaceManager.connect(bobWallet).takeMintTransfer(id)
      ).to.be.revertedWith("mint can be executed by token agent if token owner is set as taker");
    });

    it("should execute mint properly", async () => {
      const context = await loadFixture(deployMarketplaceManager);
      const { token, marketplaceManager } = context.suite;
      const { aliceWallet, tokenAgent, deployer } = context.accounts;

      // approve transfer
      await token.connect(aliceWallet).approve(marketplaceManager.target, 50)
      await expect(
        marketplaceManager.connect(aliceWallet).initiateTransfer(token, 50, deployer, token, 20)
      ).to.emit(marketplaceManager, "TransferInitiated");

      const id = await marketplaceManager.connect(aliceWallet).computeTransferID(0, aliceWallet, token, 50, deployer, token, 20)
      await expect(
        marketplaceManager.connect(tokenAgent).takeMintTransfer(id)
      ).to.emit(marketplaceManager, "TransferExecuted").withArgs(id)
    });
  });
});
