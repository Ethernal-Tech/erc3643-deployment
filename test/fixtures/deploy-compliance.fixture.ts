import { ethers } from "hardhat";
import TRex from "@tokenysolutions/t-rex";
import OnchainID from "@onchain-id/solidity";
import { expect } from "chai";

// eslint-disable-next-line import/prefer-default-export
export async function deployComplianceFixture() {
  const [deployer, irAgent, tokenAgent, aliceWallet, bobWallet, anotherWallet] =
    await ethers.getSigners();

  // OnChainID deployment
  const identityImplementation = await new ethers.ContractFactory(
    OnchainID.contracts.Identity.abi,
    OnchainID.contracts.Identity.bytecode,
    deployer
  ).deploy(deployer.address, true);
  await identityImplementation.waitForDeployment();

  const identityImplementationAuthority = await new ethers.ContractFactory(
    OnchainID.contracts.ImplementationAuthority.abi,
    OnchainID.contracts.ImplementationAuthority.bytecode,
    deployer
  ).deploy(await identityImplementation.getAddress());
  await identityImplementationAuthority.waitForDeployment();

  const identityFactory = await new ethers.ContractFactory(
    OnchainID.contracts.Factory.abi,
    OnchainID.contracts.Factory.bytecode,
    deployer
  ).deploy(await identityImplementationAuthority.getAddress());
  await identityFactory.waitForDeployment();

  const gateway = await new ethers.ContractFactory(
    OnchainID.contracts.Gateway.abi,
    OnchainID.contracts.Gateway.bytecode,
    deployer
  ).deploy(await identityFactory.getAddress(), [irAgent.address]); // anyone can be signer
  await gateway.waitForDeployment();
  // end of OnChainID deployment

  const trustedIssuersRegistryImplementation = await new ethers.ContractFactory(
    TRex.contracts.TrustedIssuersRegistry.abi,
    TRex.contracts.TrustedIssuersRegistry.bytecode,
    deployer
  ).deploy();
  await trustedIssuersRegistryImplementation.waitForDeployment();

  const identityRegistryStorageImplementation =
    await new ethers.ContractFactory(
      TRex.contracts.IdentityRegistryStorage.abi,
      TRex.contracts.IdentityRegistryStorage.bytecode,
      deployer
    ).deploy();
  await identityRegistryStorageImplementation.waitForDeployment();

  const identityRegistryImplementation = await new ethers.ContractFactory(
    TRex.contracts.IdentityRegistry.abi,
    TRex.contracts.IdentityRegistry.bytecode,
    deployer
  ).deploy();
  await identityRegistryImplementation.waitForDeployment();

  const modularComplianceImplementation = await new ethers.ContractFactory(
    TRex.contracts.ModularCompliance.abi,
    TRex.contracts.ModularCompliance.bytecode,
    deployer
  ).deploy();
  await modularComplianceImplementation.waitForDeployment();

  const tokenImplementation = await new ethers.ContractFactory(
    TRex.contracts.Token.abi,
    TRex.contracts.Token.bytecode,
    deployer
  ).deploy();
  await tokenImplementation.waitForDeployment();

  const claimTopicsRegistryImplementation = await new ethers.ContractFactory(
    TRex.contracts.ClaimTopicsRegistry.abi,
    TRex.contracts.ClaimTopicsRegistry.bytecode,
    deployer
  ).deploy();
  await claimTopicsRegistryImplementation.waitForDeployment();

  const versionStruct = {
    major: 4,
    minor: 0,
    patch: 0,
  };

  const contractsStruct = {
    tokenImplementation: await tokenImplementation.getAddress(),
    ctrImplementation: await claimTopicsRegistryImplementation.getAddress(),
    irImplementation: await identityRegistryImplementation.getAddress(),
    irsImplementation: await identityRegistryStorageImplementation.getAddress(),
    tirImplementation: await trustedIssuersRegistryImplementation.getAddress(),
    mcImplementation: await modularComplianceImplementation.getAddress(),
  };

  const trexImplementationAuthority = await new ethers.ContractFactory(
    TRex.contracts.TREXImplementationAuthority.abi,
    TRex.contracts.TREXImplementationAuthority.bytecode,
    deployer
  ).deploy(true, ethers.ZeroAddress, ethers.ZeroAddress);
  await trexImplementationAuthority.waitForDeployment();

  const txAddTREX = await trexImplementationAuthority
    .connect(deployer)
    .addAndUseTREXVersion(versionStruct, contractsStruct);
  await txAddTREX.wait();

  const trexFactory = await new ethers.ContractFactory(
    TRex.contracts.TREXFactory.abi,
    TRex.contracts.TREXFactory.bytecode,
    deployer
  ).deploy(
    await trexImplementationAuthority.getAddress(),
    await identityFactory.getAddress()
  );
  await trexFactory.waitForDeployment();

  const txAddTokenFactory = await identityFactory
    .connect(deployer)
    .addTokenFactory(await trexFactory.getAddress());
  await txAddTokenFactory.wait();

  const trexGateway = await new ethers.ContractFactory(
    TRex.contracts.TREXGateway.abi,
    TRex.contracts.TREXGateway.bytecode,
    deployer
  ).deploy(await trexFactory.getAddress(), false);
  await trexGateway.waitForDeployment();

  const txAddDeployer = await trexGateway
    .connect(deployer)
    .addDeployer(deployer.address); // token deployer can be anyone
  await txAddDeployer.wait();

  // transfer trexFactory ownership to trexGateway
  const trexGatewayOwnership = await trexFactory
    .connect(deployer)
    .transferOwnership(await trexGateway.getAddress());
  await trexGatewayOwnership.wait();

  // transfer identityFactory ownership to gateway in order to allow identity creation by users
  const txTransferOwnership = await identityFactory
    .connect(deployer)
    .transferOwnership(await gateway.getAddress());
  await txTransferOwnership.wait();

  const txDeployTREX = await trexGateway.connect(deployer).deployTREXSuite(
    {
      owner: deployer.address, // token owner/admin can be any account (doesn't have to be deployer)
      name: "Token Name98",
      symbol: "ETHRS",
      decimals: 18,
      irs: ethers.ZeroAddress, // if irs address is passed then all users from that irs will be reused (multiple tokens case)
      ONCHAINID: ethers.ZeroAddress,
      irAgents: [irAgent.address],
      tokenAgents: [tokenAgent.address],
      complianceModules: [],
      complianceSettings: [],
    },
    {
      claimTopics: [],
      issuers: [],
      issuerClaims: [],
    }
  );
  const receipt = await txDeployTREX.wait();

  const trexSuiteDeployed = await trexFactory.queryFilter(
    trexFactory.filters.TREXSuiteDeployed(),
    receipt.blockNumber,
    receipt.blockNumber
  );
  expect(trexSuiteDeployed).to.have.lengthOf(1);

  await expect(txDeployTREX).to.emit(
    trexGateway,
    "GatewaySuiteDeploymentProcessed"
  );
  await expect(txDeployTREX).to.emit(trexFactory, "TREXSuiteDeployed");
  await expect(txDeployTREX).to.emit(identityFactory, "Deployed");
  await expect(txDeployTREX).to.emit(identityFactory, "TokenLinked");

  const tokenContract = await ethers.getContractAt(
    TRex.contracts.Token.abi,
    trexSuiteDeployed[0].args[0]
  );

  return {
    accounts: {
      deployer,
      aliceWallet,
      bobWallet,
      anotherWallet,
      tokenAgent,
      irAgent,
    },
    suite: {
      token: tokenContract,
    },
  };
}
