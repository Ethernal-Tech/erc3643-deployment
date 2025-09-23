import { ethers } from "hardhat";
import TRex from "@tokenysolutions/t-rex";

// eslint-disable-next-line import/prefer-default-export
export async function deployComplianceFixture() {
  const [deployer, aliceWallet, bobWallet, anotherWallet] = await ethers.getSigners();

  const compliance = await new ethers.ContractFactory(
    TRex.contracts.ModularCompliance.abi,
    TRex.contracts.ModularCompliance.bytecode,
    deployer
  ).deploy();

  await compliance.waitForDeployment();
  await compliance.init();

  return {
    accounts: {
      deployer,
      aliceWallet,
      bobWallet,
      anotherWallet,
    },
    suite: {
      compliance,
    },
  };
}