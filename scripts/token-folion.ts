import { ethers } from "hardhat";
import OnchainID from "@onchain-id/solidity";
import TRex from "@tokenysolutions/t-rex";
import { expect } from "chai";
import addresses from "../addresses-folion.json";

async function main() {
  const [deployer, _, irAgent, tokenAgent] = await ethers.getSigners();

  const trexGateway = await ethers.getContractAt(
    TRex.contracts.TREXGateway.abi,
    addresses.trexGateway,
    deployer
  );
  const trexFactory = await ethers.getContractAt(
    TRex.contracts.TREXFactory.abi,
    await trexGateway.getFactory(),
    deployer
  );
  const identityFactory = await ethers.getContractAt(
    OnchainID.contracts.Factory.abi,
    await trexFactory.getIdFactory(),
    deployer
  );

  // deploy new token, irAgent is set as appAdmin, i.e. token deployer
  const txDeployTREX = await trexGateway.connect(irAgent).deployTREXSuite(
    {
      owner: irAgent.address, // token owner/admin can be any account (doesn't have to be deployer)
      name: "Token Name98",
      symbol: "ETHRS",
      decimals: 18,
      irs: addresses.identityRegistryStorage, // if irs address is passed then all users from that irs will be reused (multiple tokens case)
      ONCHAINID: ethers.ZeroAddress,
      irAgents: [irAgent.address],
      tokenAgents: [tokenAgent.address, addresses.marketplaceManager],
      complianceModules: [
        addresses.countryPermitModule,
        addresses.maxBalanceModule,
        addresses.approveTransferModule,
      ],
      complianceSettings: [
        new ethers.Interface([
          "function setCountriesPermission(uint16[], bool[])",
        ]).encodeFunctionData("setCountriesPermission", [[688], [true]]),
        new ethers.Interface([
          "function setMaxBalance(uint256)",
        ]).encodeFunctionData("setMaxBalance", [ethers.parseEther("1")]),
      ],
    },
    {
      claimTopics: [],
      issuers: [],
      issuerClaims: [],
    }
  );
  const receipt = await txDeployTREX.wait();
  console.log("receipt status -> %d", receipt.status)

  const trexSuiteDeployed = await trexFactory.queryFilter(
    trexFactory.filters.TREXSuiteDeployed(),
    receipt.blockNumber,
    receipt.blockNumber
  );
  expect(trexSuiteDeployed).to.have.lengthOf(1);

  console.log("Token address -> %s", trexSuiteDeployed[0].args[0]);

  expect(txDeployTREX).to.emit(trexGateway, "GatewaySuiteDeploymentProcessed");
  expect(txDeployTREX).to.emit(trexFactory, "TREXSuiteDeployed");
  expect(txDeployTREX).to.emit(identityFactory, "Deployed");
  expect(txDeployTREX).to.emit(identityFactory, "TokenLinked");

  console.log("Completed");
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
