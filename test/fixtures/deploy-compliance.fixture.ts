import { ethers } from "hardhat";
import TRex from "@tokenysolutions/t-rex";
// eslint-disable-next-line import/prefer-default-export
export async function deployComplianceFixture() {
  const [deployer, aliceWallet, bobWallet, anotherWallet] =
    await ethers.getSigners();

  const compliance = await new ethers.ContractFactory(
    TRex.contracts.ModularCompliance.abi,
    TRex.contracts.ModularCompliance.bytecode,
    deployer
  ).deploy();

  await compliance.waitForDeployment();

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

export async function deploySuiteWithModularCompliancesFixture() {
  const [deployer, aliceWallet, bobWallet, anotherWallet, tokenAgent] =
    await ethers.getSigners();

  const trexImplementationAuthority = await new ethers.ContractFactory(
    TRex.contracts.TREXImplementationAuthority.abi,
    TRex.contracts.TREXImplementationAuthority.bytecode,
    deployer
  ).deploy(true, ethers.ZeroAddress, ethers.ZeroAddress);

  await trexImplementationAuthority.waitForDeployment();

  const modularCompliance = await new ethers.ContractFactory(
    TRex.contracts.ModularCompliance.abi,
    TRex.contracts.ModularCompliance.bytecode,
    deployer
  ).deploy();
  await modularCompliance.waitForDeployment();

  const complianceProxy = await new ethers.ContractFactory(
    TRex.contracts.ModularComplianceProxy.abi,
    TRex.contracts.ModularComplianceProxy.bytecode,
    deployer
  ).deploy(trexImplementationAuthority.target);
  await complianceProxy.waitForDeployment();

  const compliance = await ethers.getContractAt(
    TRex.contracts.ModularCompliance.abi,
    complianceProxy.target,
    deployer
  );

  return {
    ...context,
    suite: {
      compliance,
    },
    authorities: {
      trexImplementationAuthority,
    },
    accounts: {
      deployer,
      aliceWallet,
      bobWallet,
      anotherWallet,
      tokenAgent,
    },
  };
}
