import { ethers } from "hardhat";
import OnchainID from '@onchain-id/solidity';
import TRex from '@tokenysolutions/t-rex';
import { expect } from 'chai';

async function main() {
  const provider = new ethers.JsonRpcProvider("http://localhost:8545")
  const user = new ethers.Wallet("b00ee7d037cd9ddd26866641bc2387059c0c8b2d86b7f1ef61d3a0956d21ab14", provider)
  const trexGatewayAddress = "0x36E628aa89855497159715F94BbD59D383d9D26c"
  const claimIssuerAddress = "0xeD18483A0c15f44bb788Bce52F3A3ac3808AFE20" // required for method #1

  const executionNonce = 0 // required for method #2, user has to get this from claim issuer

  // populate this data received from claim issuer (required for method #3)
  const claimForUser = {
    topic: '0x2e8e9dbac879b1e3204f60b5b07c03c463be5f75a01ec30831bc754da79e4bf5',
    scheme: 1,
    issuer: '0x68a934Da97A04e63e156FE2e60eD82065e54F65B',
    signature: '0xfbdf35c1017472778b36d65cf1225a94b4fe1e5962249950a2d0cddce15f420a7afecb789a0c3ce0e9e696be6285f1479e937d3b77ad16d390ff4b34735f1d391b',
    data: '0x536f6d6520636c61696d207075626c696320646174612e',
    uri: 'https://example.com'
  }

  // 3. method #1 add permission to claim issuer, method #3 add claim received from claim issuer into user identity contract
  // this step can be executed in parallel with irAgent step

  // SELECT METHOD FOR CLAIM ISSUING------------------------------------------------------------
  const claimIssuingMethod = 1

  const trexGateway = await ethers.getContractAt(TRex.contracts.TREXGateway.abi, trexGatewayAddress, user)
  const trexFactory = await ethers.getContractAt(TRex.contracts.TREXFactory.abi, await trexGateway.getFactory(), user)
  const identityFactory = await ethers.getContractAt(OnchainID.contracts.Factory.abi, await trexFactory.getIdFactory(), user)

  const userIdentity = await ethers.getContractAt(OnchainID.contracts.Identity.abi, await identityFactory.getIdentity(user.address), user)

  if (claimIssuingMethod == 1) {
    // Direct Onchain Approach:
    // method #1 for addClaim, add claim issuer signing key (type = 3 CLAIM) into user identity store
    // this must be done before claim issuing
    const txAddClaimIssuer = await userIdentity.connect(user)
      .addKey(ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['address'], [claimIssuerAddress])), 3, 1)
    await txAddClaimIssuer.wait()

    expect(txAddClaimIssuer).to.emit(userIdentity, 'KeyAdded')
  }
  else if (claimIssuingMethod == 2) {
    // method #2 for addClaim requires execute/approve pattern
    // this must be done after claim issuing (currently not supported)
    const txApprove = await userIdentity.connect(user).approve(executionNonce, true)
    await txApprove.wait()

    expect(txApprove).to.emit(userIdentity, 'Approved')
    expect(txApprove).to.emit(userIdentity, 'Executed')
  }
  else if (claimIssuingMethod == 3) {
    // Indirect Hybrid Approach:
    // method #3, user calls his userIdentity contract, he needs to get signed claim from claimIssuer first
    const txAddClaim = await userIdentity.connect(user)
      .addClaim(claimForUser.topic, claimForUser.scheme, claimForUser.issuer, claimForUser.signature, claimForUser.data, claimForUser.uri)
    await txAddClaim.wait()

    expect(txAddClaim).to.emit(userIdentity, 'ClaimAdded')
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
