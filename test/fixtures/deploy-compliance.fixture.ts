import { ethers } from "hardhat";
import TRex from "@tokenysolutions/t-rex";
import OnchainID from "@onchain-id/solidity";
import { expect } from "chai";
import ERC3643Token from "../../artifacts/contracts/token/ERC3643Token.sol/ERC3643Token.json";

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

  const identityImplementationAuthority = await new ethers.ContractFactory(
    OnchainID.contracts.ImplementationAuthority.abi,
    OnchainID.contracts.ImplementationAuthority.bytecode,
    deployer
  ).deploy(identityImplementation.target);
  
  const identityFactory = await new ethers.ContractFactory(
    OnchainID.contracts.Factory.abi,
    OnchainID.contracts.Factory.bytecode,
    deployer
  ).deploy(identityImplementationAuthority.target);
  
  const gateway = await new ethers.ContractFactory(
    OnchainID.contracts.Gateway.abi,
    OnchainID.contracts.Gateway.bytecode,
    deployer
  ).deploy(identityFactory.target, [irAgent.address]); // anyone can be signer
  // end of OnChainID deployment

  const trustedIssuersRegistryImplementation = await new ethers.ContractFactory(
    TRex.contracts.TrustedIssuersRegistry.abi,
    TRex.contracts.TrustedIssuersRegistry.bytecode,
    deployer
  ).deploy();

  const identityRegistryStorageImplementation =
    await new ethers.ContractFactory(
      TRex.contracts.IdentityRegistryStorage.abi,
      TRex.contracts.IdentityRegistryStorage.bytecode,
      deployer
    ).deploy();
  
  const identityRegistryImplementation = await new ethers.ContractFactory(
    TRex.contracts.IdentityRegistry.abi,
    TRex.contracts.IdentityRegistry.bytecode,
    deployer
  ).deploy();
  
  const modularComplianceImplementation = await new ethers.ContractFactory(
    TRex.contracts.ModularCompliance.abi,
    TRex.contracts.ModularCompliance.bytecode,
    deployer
  ).deploy();
  
  const tokenImplementation = await new ethers.ContractFactory(
    ERC3643Token.abi,
    ERC3643Token.bytecode,
    deployer
  ).deploy();
  
  const claimTopicsRegistryImplementation = await new ethers.ContractFactory(
    TRex.contracts.ClaimTopicsRegistry.abi,
    TRex.contracts.ClaimTopicsRegistry.bytecode,
    deployer
  ).deploy();
  
  const versionStruct = {
    major: 4,
    minor: 0,
    patch: 0,
  };

  const contractsStruct = {
    tokenImplementation: tokenImplementation.target,
    ctrImplementation: claimTopicsRegistryImplementation.target,
    irImplementation: identityRegistryImplementation.target,
    irsImplementation: identityRegistryStorageImplementation.target,
    tirImplementation: trustedIssuersRegistryImplementation.target,
    mcImplementation: modularComplianceImplementation.target,
  };

  const trexImplementationAuthority = await new ethers.ContractFactory(
    TRex.contracts.TREXImplementationAuthority.abi,
    TRex.contracts.TREXImplementationAuthority.bytecode,
    deployer
  ).deploy(true, ethers.ZeroAddress, ethers.ZeroAddress);

  await trexImplementationAuthority.addAndUseTREXVersion(versionStruct, contractsStruct);

  const trexFactory = await new ethers.ContractFactory(
    TRex.contracts.TREXFactory.abi,
    TRex.contracts.TREXFactory.bytecode,
    deployer
  ).deploy(
    trexImplementationAuthority.target,
    identityFactory.target
  );
  
  await identityFactory.addTokenFactory(trexFactory.target);

  const trexGateway = await new ethers.ContractFactory(
    TRex.contracts.TREXGateway.abi,
    TRex.contracts.TREXGateway.bytecode,
    deployer
  ).deploy(trexFactory.target, false);
  
  await trexGateway.addDeployer(deployer.address); // token deployer can be anyone
  
  // transfer trexFactory ownership to trexGateway
  await trexFactory.transferOwnership(trexGateway.target);

  // transfer identityFactory ownership to gateway in order to allow identity creation by users
  await identityFactory.transferOwnership(gateway.target);

  const txDeployTREX = await trexGateway.deployTREXSuite(
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

  // add users to identity registry
  await gateway.connect(aliceWallet).deployIdentityForWallet(aliceWallet.address)
  await gateway.connect(bobWallet).deployIdentityForWallet(bobWallet.address)
  await gateway.connect(bobWallet).deployIdentityForWallet(deployer.address)

  const aliceIdentity = await ethers.getContractAt(OnchainID.contracts.Identity.abi,
    await identityFactory.getIdentity(aliceWallet.address), irAgent);
  const bobIdentity = await ethers.getContractAt(OnchainID.contracts.Identity.abi,
    await identityFactory.getIdentity(bobWallet.address), irAgent);
  const deployerIdentity = await ethers.getContractAt(OnchainID.contracts.Identity.abi,
    await identityFactory.getIdentity(deployer.address), irAgent);

  const identityRegistryAddr = await tokenContract.identityRegistry();
  const identityRegistry = await ethers.getContractAt(
    TRex.contracts.IdentityRegistry.abi,
    identityRegistryAddr
  );

  await identityRegistry.connect(irAgent).registerIdentity(aliceWallet.address, aliceIdentity.getAddress(), 688);
  await identityRegistry.connect(irAgent).registerIdentity(bobWallet.address, bobIdentity.getAddress(), 688);
  await identityRegistry.connect(irAgent).registerIdentity(deployer.address, deployer.getAddress(), 688);

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
