import { ethers } from "hardhat";
import OnchainID from '@onchain-id/solidity';
import TRex from '@tokenysolutions/t-rex';
import { expect } from 'chai';

async function main() {
  const [deployer] = await ethers.getSigners()
  // contracts
  const trexGatewayAddress = "0x36E628aa89855497159715F94BbD59D383d9D26c"
  // agents
  const claimIssuerAddress = "0xeD18483A0c15f44bb788Bce52F3A3ac3808AFE20"
  const irAgentAddress = "0x85b41C1dfd4b79385C6cEa3450192dF4B4dD14d0"
  const tokenAgentAddress = "0xa5E7b2A02355Df8E2a43267136d7c9B085118c52"
  const owner = tokenAgentAddress

  const claimIssuerContract = await new ethers.ContractFactory(
    OnchainID.contracts.ClaimIssuer.abi,
    OnchainID.contracts.ClaimIssuer.bytecode,
    deployer).deploy(claimIssuerAddress)
  await claimIssuerContract.waitForDeployment()

  const trexGateway = await ethers.getContractAt(TRex.contracts.TREXGateway.abi, trexGatewayAddress, deployer)
  const trexFactory = await ethers.getContractAt(TRex.contracts.TREXFactory.abi, await trexGateway.getFactory(), deployer)
  const identityFactory = await ethers.getContractAt(OnchainID.contracts.Factory.abi, await trexFactory.getIdFactory(), deployer)

  // deployer must be someone added as a deployer in trexGateway
  const txDeployTREX = await trexGateway.connect(deployer).deployTREXSuite(
    {
      owner: owner, // token owner/admin can be any account (doesn't have to be deployer)
      name: 'Token name',
      symbol: 'SYM',
      decimals: 18,
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

  const trexSuiteDeployed = await trexFactory.queryFilter(
    trexFactory.filters.TREXSuiteDeployed(), receipt.blockNumber, receipt.blockNumber
  )
  expect(trexSuiteDeployed).to.have.lengthOf(1)

  console.log("Token address -> %s", (trexSuiteDeployed[0]).args[0])

  expect(txDeployTREX).to.emit(trexGateway, 'GatewaySuiteDeploymentProcessed')
  expect(txDeployTREX).to.emit(trexFactory, 'TREXSuiteDeployed')
  expect(txDeployTREX).to.emit(identityFactory, 'Deployed')
  expect(txDeployTREX).to.emit(identityFactory, 'TokenLinked')
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
});
