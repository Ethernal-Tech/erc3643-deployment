import { ethers, network } from "hardhat";

async function main() {
  const userAddress = "0x26F3f1f3F1d75c6d5d5146d1e44cec8831d0283A"
  await setAccountBalance(userAddress, 1000); // Give addr1 1000 ETH
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
});

async function setAccountBalance(address, amountInEther) {
  // Convert the human-readable ether amount to a BigInt (wei)
  const amountInWei = ethers.parseEther(amountInEther.toString());

  // Use the Hardhat Network's provider to send the RPC call
  await network.provider.send("hardhat_setBalance", [
    address,
    "0x" + amountInWei.toString(16) // Ensures correct hex format
  ]);

  console.log(`Set balance of ${address} to ${amountInEther} ETH`);
}