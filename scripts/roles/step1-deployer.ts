import { ethers } from "hardhat";
import OnchainID from '@onchain-id/solidity';
import TRex from '@tokenysolutions/t-rex';
import { expect } from 'chai';
import { EventLog } from 'ethers';

async function main() {
  const provider = new ethers.JsonRpcProvider("http://localhost:8545")
  const deployer = new ethers.Wallet("e77f21c7c2cc438846dcfdd269c68daea4c1c7f40d2c3329ea55c01e24f77bcc", provider)
  const claimIssuerAddress = "0xeD18483A0c15f44bb788Bce52F3A3ac3808AFE20"
  const irAgentAddress = "0x85b41C1dfd4b79385C6cEa3450192dF4B4dD14d0"
  const tokenAgentAddress = "0xa5E7b2A02355Df8E2a43267136d7c9B085118c52"

  // OnChainID deployment
  const identityImplementation = await new ethers.ContractFactory(
    OnchainID.contracts.Identity.abi,
    OnchainID.contracts.Identity.bytecode,
    deployer).deploy(deployer.address, true)
  await identityImplementation.waitForDeployment()

  const identityImplementationAuthority = await new ethers.ContractFactory(
    OnchainID.contracts.ImplementationAuthority.abi,
    OnchainID.contracts.ImplementationAuthority.bytecode,
    deployer).deploy(await identityImplementation.getAddress())
  await identityImplementationAuthority.waitForDeployment()

  const identityFactory = await new ethers.ContractFactory(
    OnchainID.contracts.Factory.abi,
    OnchainID.contracts.Factory.bytecode,
    deployer).deploy(await identityImplementationAuthority.getAddress())
  await identityFactory.waitForDeployment()

  const gateway = await new ethers.ContractFactory(
    OnchainID.contracts.Gateway.abi,
    OnchainID.contracts.Gateway.bytecode,
    deployer).deploy(await identityFactory.getAddress(), [irAgentAddress])
  await gateway.waitForDeployment()
  // end of OnChainID deployment

  const trustedIssuersRegistryImplementation = await new ethers.ContractFactory(
    TRex.contracts.TrustedIssuersRegistry.abi,
    TRex.contracts.TrustedIssuersRegistry.bytecode,
    deployer).deploy()
  await trustedIssuersRegistryImplementation.waitForDeployment()

  const identityRegistryStorageImplementation = await new ethers.ContractFactory(
    TRex.contracts.IdentityRegistryStorage.abi,
    TRex.contracts.IdentityRegistryStorage.bytecode,
    deployer).deploy()
  await identityRegistryStorageImplementation.waitForDeployment()

  const identityRegistryImplementation = await new ethers.ContractFactory(
    TRex.contracts.IdentityRegistry.abi,
    TRex.contracts.IdentityRegistry.bytecode,
    deployer).deploy()
   await identityRegistryImplementation.waitForDeployment()

  const modularComplianceImplementation = await new ethers.ContractFactory(
    TRex.contracts.ModularCompliance.abi,
    TRex.contracts.ModularCompliance.bytecode,
    deployer).deploy()
  await modularComplianceImplementation.waitForDeployment()

  const tokenImplementation = await new ethers.ContractFactory(
    TRex.contracts.Token.abi,
    TRex.contracts.Token.bytecode,
    deployer).deploy()
  await tokenImplementation.waitForDeployment()

  const claimTopicsRegistryImplementation = await new ethers.ContractFactory(
    TRex.contracts.ClaimTopicsRegistry.abi,
    TRex.contracts.ClaimTopicsRegistry.bytecode,
    deployer).deploy()
  await claimTopicsRegistryImplementation.waitForDeployment()

  const versionStruct = {
    major: 4,
    minor: 0,
    patch: 0
  }

  const contractsStruct = {
    tokenImplementation: await tokenImplementation.getAddress(),
    ctrImplementation: await claimTopicsRegistryImplementation.getAddress(),
    irImplementation: await identityRegistryImplementation.getAddress(),
    irsImplementation: await identityRegistryStorageImplementation.getAddress(),
    tirImplementation: await trustedIssuersRegistryImplementation.getAddress(),
    mcImplementation: await modularComplianceImplementation.getAddress()
  }

  const trexImplementationAuthority = await new ethers.ContractFactory(
    TRex.contracts.TREXImplementationAuthority.abi,
    TRex.contracts.TREXImplementationAuthority.bytecode,
    deployer).deploy(true, ethers.ZeroAddress, ethers.ZeroAddress)
  await trexImplementationAuthority.waitForDeployment()

  const txAddTREX = await trexImplementationAuthority.connect(deployer).addAndUseTREXVersion(versionStruct, contractsStruct)
  await txAddTREX.wait()
  
  const trexFactory = await new ethers.ContractFactory(
    TRex.contracts.TREXFactory.abi,
    TRex.contracts.TREXFactory.bytecode,
    deployer).deploy(await trexImplementationAuthority.getAddress(), await identityFactory.getAddress())
  await trexFactory.waitForDeployment()

  const txAddTokenFactory = await identityFactory.connect(deployer).addTokenFactory(await trexFactory.getAddress())
  await txAddTokenFactory.wait()

  const claimIssuerContract = await new ethers.ContractFactory(
    OnchainID.contracts.ClaimIssuer.abi,
    OnchainID.contracts.ClaimIssuer.bytecode,
    deployer).deploy(claimIssuerAddress)
  await claimIssuerContract.waitForDeployment()

  const txDeployTREX = await trexFactory.connect(deployer).deployTREXSuite(
    'tokensalt',
    {
      owner: tokenAgentAddress, // token owner/admin can be any account (doesn't have to be deployer)
      name: 'Token name',
      symbol: 'SYM',
      decimals: 8,
      irs: ethers.ZeroAddress, // if irs address is passed then all users from that irs will be reused (multiple tokens case)
      ONCHAINID: ethers.ZeroAddress,
      irAgents: [irAgentAddress],
      tokenAgents: [tokenAgentAddress],
      complianceModules: [],
      complianceSettings: []
    },
    {
      claimTopics: [ethers.id('CLAIM_TOPIC')],
      issuers: [await claimIssuerContract.getAddress()],
      issuerClaims: [[ethers.id('CLAIM_TOPIC')]]
    }
  ); 
  const receipt = await txDeployTREX.wait()

  expect(txDeployTREX).to.emit(trexFactory, 'TREXSuiteDeployed')
  expect(txDeployTREX).to.emit(identityFactory, 'Deployed')
  expect(txDeployTREX).to.emit(identityFactory, 'TokenLinked')

  // after token deployment transfer ownership to gateway in order to allow identity creation by users
  const txTransferOwnership = await identityFactory.connect(deployer).transferOwnership(await gateway.getAddress())
  await txTransferOwnership.wait()

  const trexSuiteDeployedEvent = receipt.logs.find((log: EventLog) => log.eventName === 'TREXSuiteDeployed')
  console.log("Token address -> %s", trexSuiteDeployedEvent.args[0])
  console.log("TREXFactory address -> %s", (await trexFactory.getAddress()).toString())
  console.log("Gateway address -> %s", (await gateway.getAddress()).toString())

  // Gateway is for users identity creation
  // TREXFactory contains idFactory, token; token contains MC, IR; IR contains IRS, TIR, CTR
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
});
