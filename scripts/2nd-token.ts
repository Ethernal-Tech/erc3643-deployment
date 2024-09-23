import { ethers } from "hardhat";
import OnchainID from '@onchain-id/solidity';
import TRex from '@tokenysolutions/t-rex';
import { expect } from 'chai';

async function main() {
  const [deployer] = await ethers.getSigners()
  // contracts
  const trexGatewayAddress = "0x36E628aa89855497159715F94BbD59D383d9D26c"
  const firstTokenAddress = "0xe96D6053326E91e4dB1c370E13DfB722a11f8E78"
  // agents & owner
  const irAgentAddress = "0x85b41C1dfd4b79385C6cEa3450192dF4B4dD14d0"
  const tokenAgentAddress = "0xa5E7b2A02355Df8E2a43267136d7c9B085118c52"
  const owner = irAgentAddress

  const countryAllowModule = await new ethers.ContractFactory(
    TRex.contracts.CountryAllowModule.abi,
    TRex.contracts.CountryAllowModule.bytecode,
    deployer
  ).deploy()
  await countryAllowModule.waitForDeployment()

  const trexGateway = await ethers.getContractAt(TRex.contracts.TREXGateway.abi, trexGatewayAddress, deployer)
  const trexFactory = await ethers.getContractAt(TRex.contracts.TREXFactory.abi, await trexGateway.getFactory(), deployer)
  const identityFactory = await ethers.getContractAt(OnchainID.contracts.Factory.abi, await trexFactory.getIdFactory(), deployer)

  // reuse claims & irs from the 1st token
  const token = await ethers.getContractAt(TRex.contracts.Token.abi, firstTokenAddress, deployer)
  const idRegistry = await ethers.getContractAt(TRex.contracts.IdentityRegistry.abi, await token.identityRegistry(), deployer)
  const tirContract = await ethers.getContractAt(TRex.contracts.TrustedIssuersRegistry.abi, await idRegistry.issuersRegistry(), deployer)
  
  const claimIssuerContracts = await tirContract.getTrustedIssuersForClaimTopic(ethers.id('CLAIM_TOPIC')) // this is array!

  const txDeployTREX = await trexGateway.connect(deployer).deployTREXSuite(
    {
      owner: owner, // token owner/admin can be any account (doesn't have to be deployer)
      name: 'Token Name98',
      symbol: 'ETHRS',
      decimals: 18,
      irs: await idRegistry.identityStorage(), // if irs address is passed then all users from that irs will be reused (multiple tokens case)
      ONCHAINID: ethers.ZeroAddress,
      irAgents: [irAgentAddress],
      tokenAgents: [tokenAgentAddress],
      complianceModules: [await countryAllowModule.getAddress()],
      complianceSettings: [
        new ethers.Interface(['function batchAllowCountries(uint16[])']).encodeFunctionData('batchAllowCountries', [
          [688],
        ])
      ]
    },
    {
      claimTopics: [ethers.id('CLAIM_TOPIC')],
      issuers: [claimIssuerContracts[0]],
      issuerClaims: [[ethers.id('CLAIM_TOPIC')]]
    }
  )
  const receipt = await txDeployTREX.wait()

  const trexSuiteDeployed = await trexFactory.queryFilter(
    trexFactory.filters.TREXSuiteDeployed(), receipt.blockNumber, receipt.blockNumber
  )
  expect(trexSuiteDeployed).to.have.lengthOf(1)

  console.log("Token address -> %s", (trexSuiteDeployed[0]).args[0])

  expect(txDeployTREX).to.emit(trexGateway, 'GatewaySuiteDeploymentProcessed')
  expect(txDeployTREX).to.emit(trexFactory, 'TREXSuiteDeployed')
  expect(txDeployTREX).to.emit(identityFactory, 'Deployed')
  expect(txDeployTREX).to.emit(identityFactory, 'TokenLinked')

  // OPTIONALLY DEPLOY VERIFIER CONTRACT
  const verifier = await new ethers.ContractFactory(
    OnchainID.contracts.Verifier.abi,
    OnchainID.contracts.Verifier.bytecode,
    deployer).deploy()
  await verifier.waitForDeployment()

  const txClaimTopic = await verifier.connect(deployer).addClaimTopic(ethers.id('CLAIM_TOPIC'));
  await txClaimTopic.wait()

  const txTrustedIssuer = await verifier.connect(deployer).addTrustedIssuer(claimIssuerContracts[0], [ethers.id('CLAIM_TOPIC')]);
  await txTrustedIssuer.wait()

  const txOwnership = await verifier.connect(deployer).transferOwnership(owner)
  await txOwnership.wait()

  console.log("Verifier address -> %s", await verifier.getAddress())
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
});
