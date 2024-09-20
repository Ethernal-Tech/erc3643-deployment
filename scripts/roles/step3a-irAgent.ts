import { ethers } from "hardhat";
import OnchainID from '@onchain-id/solidity';
import TRex from '@tokenysolutions/t-rex';
import { expect } from 'chai';

async function main() {
  // users
  const irAgent = (await ethers.getSigners())[2]
  const userAddress = "0x26F3f1f3F1d75c6d5d5146d1e44cec8831d0283A"
  // contracts
  const trexGatewayAddress = "0x36E628aa89855497159715F94BbD59D383d9D26c"
  const tokenAddress = "0xcE79AfF53Fd87b8baEbF1b0aB4189EF9BD332C8E"

  // 3. insert user into identity registry storage; only irAgent can add user into identityStorage
  // this step can be executed in parallel with claim issuing
  // AS AN OPTION BEFORE ADDING USER IDENTITY TO IRS IT CAN BE CHECKED WITH OnchainID Verifier CONTRACT IF THE
  // USER HAS ALL CLAIMS REQUIRED FOR THIS PARTICULAR TOKEN.IF SO THEN CLAIMS MUST BE ADDED BEFORE THIS ACTION.
  // HOWEVER IF CLAIMS WILL BE PERIODICALLY RENEWED THEN THIS CHECK DOESN'T HAVE MUCH SENSE.
  // await verifier.addClaimTopic(ethers.id('CLAIM_TOPIC'));
  // await verifier.addTrustedIssuer(await claimIssuerContract.getAddress(), [ethers.id('CLAIM_TOPIC')]);
  // await verifier.verify(userAddress)

  const trexGateway = await ethers.getContractAt(TRex.contracts.TREXGateway.abi, trexGatewayAddress, irAgent)
  const trexFactory = await ethers.getContractAt(TRex.contracts.TREXFactory.abi, await trexGateway.getFactory(), irAgent)
  const identityFactory = await ethers.getContractAt(OnchainID.contracts.Factory.abi, await trexFactory.getIdFactory(), irAgent)

  const userIdentity = await ethers.getContractAt(OnchainID.contracts.Identity.abi, await identityFactory.getIdentity(userAddress), irAgent)

  const token = await ethers.getContractAt(TRex.contracts.Token.abi, tokenAddress, irAgent)
  const idRegistry = await ethers.getContractAt(TRex.contracts.IdentityRegistry.abi, await token.identityRegistry(), irAgent)
  const txIdRegistry = await idRegistry.connect(irAgent).registerIdentity(userAddress, await userIdentity.getAddress(), 688) // SRB Iban code
  await txIdRegistry.wait()

  expect(txIdRegistry).to.emit(idRegistry, 'IdentityRegistered')
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
});
