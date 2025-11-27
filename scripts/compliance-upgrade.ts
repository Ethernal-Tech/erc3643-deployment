import { ethers, upgrades } from "hardhat";
import { expect } from 'chai';
import TRex from "@tokenysolutions/t-rex";
import ConditionalTransferModule from "../artifacts/contracts/ConditionalTransferModule.sol/ConditionalTransferModule.json";
import addresses from "../addresses-fluxion.json";

async function main() {
  const [deployer] = await ethers.getSigners();

  const newImplementation = await new ethers.ContractFactory(
    ConditionalTransferModule.abi,
    ConditionalTransferModule.bytecode,
    deployer
  ).deploy();
  await newImplementation.waitForDeployment();
  console.log("New ConditionalTransferModule implementation deployed at:", await newImplementation.getAddress());

  const complianceModuleProxy = await ethers.getContractAt(
    ConditionalTransferModule.abi,
    addresses.conditionalTransferModule,
    deployer
  );

  // when
  const upgradeTx = await complianceModuleProxy.connect(deployer).upgradeTo(await newImplementation.getAddress());
  await upgradeTx.wait();

  // then
  const implementationAddress = await upgrades.erc1967.getImplementationAddress(await complianceModuleProxy.getAddress());
  expect(implementationAddress).to.eq(await newImplementation.getAddress());
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
});
