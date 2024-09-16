import { ethers } from "hardhat";
import TRex from '@tokenysolutions/t-rex';
import { expect } from 'chai';

async function main() {
  const provider = new ethers.JsonRpcProvider("http://localhost:8545")
  const tokenAgent = new ethers.Wallet("0e647288caf9b7d5c91f89e10ca6a9ef1cbe85e85a309e74e48149d0c2cf2291", provider)
  const userAddress = "0x26F3f1f3F1d75c6d5d5146d1e44cec8831d0283A"
  const trexFactoryAddress = "0x0Ba997d8b14b2d2aC9BF96fa3D5F8c31927c9FdC"

  // 4. mint and unpause; unpause is mandatory before token transactions!; only tokenAgent can do mint and unpause
  const trexFactory = await ethers.getContractAt(TRex.contracts.TREXFactory.abi, trexFactoryAddress)
  const token = await ethers.getContractAt(TRex.contracts.Token.abi, await trexFactory.getToken('tokensalt'))

  const txMint = await token.connect(tokenAgent).mint(userAddress, 1000);
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
