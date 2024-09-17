import { ethers } from "hardhat";
import TRex from '@tokenysolutions/t-rex';
import { expect } from 'chai';
import { EventLog } from 'ethers';

async function main() {
  const provider = new ethers.JsonRpcProvider("http://localhost:8545")
  const deployer = new ethers.Wallet("e77f21c7c2cc438846dcfdd269c68daea4c1c7f40d2c3329ea55c01e24f77bcc", provider)
  const trexFactoryAddress = "0x23536ED928Aaab4B505b16C14e1b7bD8e46eD8cb"
  const irAgentAddress = "0x85b41C1dfd4b79385C6cEa3450192dF4B4dD14d0"
  const tokenAgentAddress = "0xa5E7b2A02355Df8E2a43267136d7c9B085118c52"

  const countryAllowModule = await new ethers.ContractFactory(
    TRex.contracts.CountryAllowModule.abi,
    TRex.contracts.CountryAllowModule.bytecode,
    deployer
  ).deploy()
  await countryAllowModule.waitForDeployment()

  const trexFactory = await ethers.getContractAt(TRex.contracts.TREXFactory.abi, trexFactoryAddress, deployer)

  const token = await ethers.getContractAt(TRex.contracts.Token.abi, await trexFactory.getToken('tokensalt'), deployer)
  const idRegistry = await ethers.getContractAt(TRex.contracts.IdentityRegistry.abi, await token.identityRegistry(), deployer)
  const tirContract = await ethers.getContractAt(TRex.contracts.TrustedIssuersRegistry.abi, await idRegistry.issuersRegistry(), deployer)
  
  const claimIssuerContracts = await tirContract.getTrustedIssuersForClaimTopic(ethers.id('CLAIM_TOPIC')) // this is array!

  const txDeployTREX = await trexFactory.connect(deployer).deployTREXSuite(
    'tokensalt2',
    {
      owner: tokenAgentAddress, // token owner/admin can be any account (doesn't have to be deployer)
      name: 'Token Name',
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
  expect(txDeployTREX).to.emit(trexFactory, 'TREXSuiteDeployed')
  const trexSuiteDeployedEvent = receipt.logs.find((log: EventLog) => log.eventName === 'TREXSuiteDeployed')
  console.log("Token address -> %s", trexSuiteDeployedEvent.args[0])
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
});
