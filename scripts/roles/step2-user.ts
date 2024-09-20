import { ethers } from "hardhat";
import OnchainID from '@onchain-id/solidity';

async function main() {
  const user = (await ethers.getSigners())[4]
  const gatewayAddress = "0x9Fa5655b812E3e0cdaB3CFAd0155a938C4136Aff"

  // 2. user setup, user identity can be created by anyone
  const gateway = await ethers.getContractAt(OnchainID.contracts.Gateway.abi, gatewayAddress)
  const txDeployId = await gateway.connect(user).deployIdentityForWallet(user.address)
  await txDeployId.wait()
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
});
