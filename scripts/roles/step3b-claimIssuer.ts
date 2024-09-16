import { ethers } from "hardhat";
import OnchainID from '@onchain-id/solidity';
import TRex from '@tokenysolutions/t-rex';
import { expect } from 'chai';
import { EventLog } from 'ethers';

async function main() {
  const provider = new ethers.JsonRpcProvider("http://localhost:8545")
  const claimIssuer = new ethers.Wallet("7af6400ff7ddb5aae0ba6eaad5d415d9f8c6831d976c645d5bf6fecdb23ed2af", provider)
  const trexFactoryAddress = "0x0Ba997d8b14b2d2aC9BF96fa3D5F8c31927c9FdC"
  const tirContractAddress = "0x67233aD9015bc941DaF35dF9236d21D386710c63"
  const userAddress = "0x26F3f1f3F1d75c6d5d5146d1e44cec8831d0283A"

  // 3. method #1 add claim to user identity, method #3 generate claim and send it to user
  // this step can be executed in parallel with irAgent step

  // SELECT METHOD FOR CLAIM ISSUING------------------------------------------------------------
  const claimIssuingMethod = 1

  const trexFactory = await ethers.getContractAt(TRex.contracts.TREXFactory.abi, trexFactoryAddress)
  const idFactory = await ethers.getContractAt(OnchainID.contracts.Factory.abi, await trexFactory.getIdFactory())

  const userIdentity = await ethers.getContractAt(OnchainID.contracts.Identity.abi, await idFactory.getIdentity(userAddress))

  const tirContract = await ethers.getContractAt(TRex.contracts.TrustedIssuersRegistry.abi, tirContractAddress)
  const claimIssuerContracts = await tirContract.getTrustedIssuersForClaimTopic(ethers.id('CLAIM_TOPIC')) // this is array!
  const claimIssuerContract = await ethers.getContractAt(OnchainID.contracts.ClaimIssuer.abi, claimIssuerContracts[0])
  
  const claimForUser = {
    identity: await userIdentity.getAddress(),
    topic: ethers.id('CLAIM_TOPIC'),
    scheme: 1,
    issuer: await claimIssuerContract.getAddress(),
    signature: '',
    data: ethers.hexlify(ethers.toUtf8Bytes('Some claim public data.')),
    uri: 'https://example.com'
  }
  claimForUser.signature = await claimIssuer.signMessage(
    ethers.getBytes(
      ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(['address', 'uint256', 'bytes'], [claimForUser.identity, claimForUser.topic, claimForUser.data])
      )
    )
  )

  if (claimIssuingMethod == 1) {
    // method #1 for addClaim, add claim issuer signing key (type = 3 CLAIM) into user identity store
    // this is possible only if user allows this to claim issuer first
    const txAddClaim = await userIdentity.connect(claimIssuer)
      .addClaim(claimForUser.topic, claimForUser.scheme, claimForUser.issuer, claimForUser.signature, claimForUser.data, claimForUser.uri)
    await txAddClaim.wait()

    expect(txAddClaim).to.emit(userIdentity, 'ClaimAdded')
  }
  else if (claimIssuingMethod == 2) {
    // method #2 for addClaim requires execute/approve pattern (currently not supported)
    const claimData = new ethers.Interface(OnchainID.interfaces.IERC735.abi).encodeFunctionData('addClaim', [
      claimForUser.topic, claimForUser.scheme, claimForUser.issuer, claimForUser.signature, claimForUser.data, claimForUser.uri
    ])

    // value always 0
    const txExecute = await userIdentity.connect(claimIssuer).execute(await userIdentity.getAddress(), 0, claimData)
    const receiptExecute = await txExecute.wait()
    
    expect(txExecute).to.emit(userIdentity, 'ExecutionRequested')
    const executionNonce = receiptExecute.logs.find((log: EventLog) => log.eventName === 'ExecutionRequested').args[0]

    // send this to user
    console.log(executionNonce)
  }
  else if (claimIssuingMethod == 3) {
    // method #3, user calls his userIdentity contract, he needs to get signed claim from claimIssuer first
    // send this data to user
    console.log("topic -> %s", claimForUser.topic)
    console.log("scheme -> %d", claimForUser.scheme)
    console.log("issuer -> %s", claimForUser.issuer)
    console.log("signature -> %s", claimForUser.signature)
    console.log("data -> %s", claimForUser.data)
    console.log("uri -> %s", claimForUser.uri)
  }
  else {
    console.log("claim issuing method not supported")
  }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
});
