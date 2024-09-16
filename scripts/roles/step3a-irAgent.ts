import { ethers } from "hardhat";
import OnchainID from '@onchain-id/solidity';
import TRex from '@tokenysolutions/t-rex';
import { expect } from 'chai';

async function main() {
  const provider = new ethers.JsonRpcProvider("http://localhost:8545")
  const irAgent = new ethers.Wallet("f73b34c77087caa4f26a1dd7c9d986c1d0caff269fac1466ae0fa2aa5691ed66", provider)
  const userAddress = "0x26F3f1f3F1d75c6d5d5146d1e44cec8831d0283A"
  const trexFactoryAddress = "0x0Ba997d8b14b2d2aC9BF96fa3D5F8c31927c9FdC"

  // 3. insert user into identity registry storage; only irAgent can add user into identityStorage
  // this step can be executed in parallel with claim issuing

  const trexFactory = await ethers.getContractAt(TRex.contracts.TREXFactory.abi, trexFactoryAddress)
  const idFactory = await ethers.getContractAt(OnchainID.contracts.Factory.abi, await trexFactory.getIdFactory())
  const token = await ethers.getContractAt(TRex.contracts.Token.abi, await trexFactory.getToken('tokensalt'))

  const userIdentity = await ethers.getContractAt(OnchainID.contracts.Identity.abi, await idFactory.getIdentity(userAddress))

  const idRegistry = await ethers.getContractAt(TRex.contracts.IdentityRegistry.abi, await token.identityRegistry())
  const txIdRegistry = await idRegistry.connect(irAgent).registerIdentity(userAddress, await userIdentity.getAddress(), 666)
  await txIdRegistry.wait()

  expect(txIdRegistry).to.emit(idRegistry, 'IdentityRegistered')
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
});
