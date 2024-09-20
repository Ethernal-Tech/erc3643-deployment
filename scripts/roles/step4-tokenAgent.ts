import { ethers } from "hardhat";
import TRex from '@tokenysolutions/t-rex';
import { expect } from 'chai';

async function main() {
  const tokenAgent = (await ethers.getSigners())[3]
  const userAddress = "0x26F3f1f3F1d75c6d5d5146d1e44cec8831d0283A"
  const tokenAddress = "0xcE79AfF53Fd87b8baEbF1b0aB4189EF9BD332C8E"

  // 4. mint and unpause; unpause is mandatory before token transactions!; only tokenAgent can do mint and unpause
  const token = await ethers.getContractAt(TRex.contracts.Token.abi, tokenAddress, tokenAgent)

  const txMint = await token.connect(tokenAgent).mint(userAddress, ethers.WeiPerEther * BigInt(1000)); // 1000 ether
  await txMint.wait()
  expect(txMint).to.emit(token, 'Transfer')

  const txUnpause = await token.connect(tokenAgent).unpause();
  await txUnpause.wait()
  expect(txUnpause).to.emit(token, 'Unpaused')
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
});
