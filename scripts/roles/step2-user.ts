import { ethers } from "hardhat";
import OnchainID from '@onchain-id/solidity';

async function main() {
  const provider = new ethers.JsonRpcProvider("http://localhost:8545")
  const user = new ethers.Wallet("b00ee7d037cd9ddd26866641bc2387059c0c8b2d86b7f1ef61d3a0956d21ab14", provider)
  const gatewayAddress = "0xb81a64B1A19f6BE0dAeD369c8E43eD0fD31FB8dB"

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
