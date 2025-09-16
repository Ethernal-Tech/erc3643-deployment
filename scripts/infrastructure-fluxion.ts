import { ethers } from "hardhat";
import OnchainID from "@onchain-id/solidity";
import TRex from "@tokenysolutions/t-rex";

async function main() {
  const [deployer] = await ethers.getSigners();
  const irAgentAddress = "0x85b41C1dfd4b79385C6cEa3450192dF4B4dD14d0";

  // OnChainID deployment
  const identityImplementation = await new ethers.ContractFactory(
    OnchainID.contracts.Identity.abi,
    OnchainID.contracts.Identity.bytecode,
    deployer
  ).deploy(deployer.address, true);
  await identityImplementation.waitForDeployment();

  const identityImplementationAuthority = await new ethers.ContractFactory(
    OnchainID.contracts.ImplementationAuthority.abi,
    OnchainID.contracts.ImplementationAuthority.bytecode,
    deployer
  ).deploy(await identityImplementation.getAddress());
  await identityImplementationAuthority.waitForDeployment();

  const identityFactory = await new ethers.ContractFactory(
    OnchainID.contracts.Factory.abi,
    OnchainID.contracts.Factory.bytecode,
    deployer
  ).deploy(await identityImplementationAuthority.getAddress());
  await identityFactory.waitForDeployment();

  const gateway = await new ethers.ContractFactory(
    OnchainID.contracts.Gateway.abi,
    OnchainID.contracts.Gateway.bytecode,
    deployer
  ).deploy(await identityFactory.getAddress(), [irAgentAddress]); // anyone can be signer
  await gateway.waitForDeployment();
  // end of OnChainID deployment

  const trustedIssuersRegistryImplementation = await new ethers.ContractFactory(
    TRex.contracts.TrustedIssuersRegistry.abi,
    TRex.contracts.TrustedIssuersRegistry.bytecode,
    deployer
  ).deploy();
  await trustedIssuersRegistryImplementation.waitForDeployment();

  const identityRegistryStorageImplementation =
    await new ethers.ContractFactory(
      TRex.contracts.IdentityRegistryStorage.abi,
      TRex.contracts.IdentityRegistryStorage.bytecode,
      deployer
    ).deploy();
  await identityRegistryStorageImplementation.waitForDeployment();

  const identityRegistryImplementation = await new ethers.ContractFactory(
    TRex.contracts.IdentityRegistry.abi,
    TRex.contracts.IdentityRegistry.bytecode,
    deployer
  ).deploy();
  await identityRegistryImplementation.waitForDeployment();

  const modularComplianceImplementation = await new ethers.ContractFactory(
    TRex.contracts.ModularCompliance.abi,
    TRex.contracts.ModularCompliance.bytecode,
    deployer
  ).deploy();
  await modularComplianceImplementation.waitForDeployment();

  const tokenImplementation = await new ethers.ContractFactory(
    TRex.contracts.Token.abi,
    TRex.contracts.Token.bytecode,
    deployer
  ).deploy();
  await tokenImplementation.waitForDeployment();

  const claimTopicsRegistryImplementation = await new ethers.ContractFactory(
    TRex.contracts.ClaimTopicsRegistry.abi,
    TRex.contracts.ClaimTopicsRegistry.bytecode,
    deployer
  ).deploy();
  await claimTopicsRegistryImplementation.waitForDeployment();

  const versionStruct = {
    major: 4,
    minor: 0,
    patch: 0,
  };

  const contractsStruct = {
    tokenImplementation: await tokenImplementation.getAddress(),
    ctrImplementation: await claimTopicsRegistryImplementation.getAddress(),
    irImplementation: await identityRegistryImplementation.getAddress(),
    irsImplementation: await identityRegistryStorageImplementation.getAddress(),
    tirImplementation: await trustedIssuersRegistryImplementation.getAddress(),
    mcImplementation: await modularComplianceImplementation.getAddress(),
  };

  const trexImplementationAuthority = await new ethers.ContractFactory(
    TRex.contracts.TREXImplementationAuthority.abi,
    TRex.contracts.TREXImplementationAuthority.bytecode,
    deployer
  ).deploy(true, ethers.ZeroAddress, ethers.ZeroAddress);
  await trexImplementationAuthority.waitForDeployment();

  const txAddTREX = await trexImplementationAuthority
    .connect(deployer)
    .addAndUseTREXVersion(versionStruct, contractsStruct);
  await txAddTREX.wait();

  const trexFactory = await new ethers.ContractFactory(
    TRex.contracts.TREXFactory.abi,
    TRex.contracts.TREXFactory.bytecode,
    deployer
  ).deploy(
    await trexImplementationAuthority.getAddress(),
    await identityFactory.getAddress()
  );
  await trexFactory.waitForDeployment();

  const txAddTokenFactory = await identityFactory
    .connect(deployer)
    .addTokenFactory(await trexFactory.getAddress());
  await txAddTokenFactory.wait();

  const trexGateway = await new ethers.ContractFactory(
    TRex.contracts.TREXGateway.abi,
    TRex.contracts.TREXGateway.bytecode,
    deployer
  ).deploy(await trexFactory.getAddress(), false);
  await trexGateway.waitForDeployment();

  const txAddDeployer = await trexGateway
    .connect(deployer)
    .addDeployer(deployer.address); // token deployer can be anyone
  await txAddDeployer.wait();

  // transfer trexFactory ownership to trexGateway
  const trexGatewayOwnership = await trexFactory
    .connect(deployer)
    .transferOwnership(await trexGateway.getAddress());
  await trexGatewayOwnership.wait();

  // transfer identityFactory ownership to gateway in order to allow identity creation by users
  const txTransferOwnership = await identityFactory
    .connect(deployer)
    .transferOwnership(await gateway.getAddress());
  await txTransferOwnership.wait();

  console.log(
    "TREXGateway address -> %s",
    (await trexGateway.getAddress()).toString()
  );
  console.log("Gateway address -> %s", (await gateway.getAddress()).toString());

  // TREXGateway contains trexFactory; trexFactory contains idFactory, token; token contains MC, IR; IR contains IRS, TIR, CTR
  // Gateway is for users identity creation

  const countryAllowModule = await new ethers.ContractFactory(
    TRex.contracts.CountryAllowModule.abi,
    TRex.contracts.CountryAllowModule.bytecode,
    deployer
  ).deploy();
  await countryAllowModule.waitForDeployment();

  const countryAllowModuleProxy = await new ethers.ContractFactory(
    TRex.contracts.ModuleProxy.abi,
    TRex.contracts.ModuleProxy.bytecode,
    deployer
  ).deploy(
    await countryAllowModule.getAddress(),
    countryAllowModule.interface.encodeFunctionData("initialize")
  );
  await countryAllowModuleProxy.waitForDeployment();

  console.log(
    "Country Allow Module Proxy ->",
    await countryAllowModuleProxy.getAddress()
  );

  // ConditionalTransferModule
  const conditionalTransferModule = await new ethers.ContractFactory(
    TRex.contracts.ConditionalTransferModule.abi,
    TRex.contracts.ConditionalTransferModule.bytecode,
    deployer
  ).deploy();
  await conditionalTransferModule.waitForDeployment();

  const conditionalTransferModuleProxy = await new ethers.ContractFactory(
    TRex.contracts.ModuleProxy.abi,
    TRex.contracts.ModuleProxy.bytecode,
    deployer
  ).deploy(
    await conditionalTransferModule.getAddress(),
    conditionalTransferModule.interface.encodeFunctionData("initialize")
  );
  await conditionalTransferModuleProxy.waitForDeployment();

  console.log(
    "Conditional Transfer Module Proxy ->",
    await conditionalTransferModuleProxy.getAddress()
  );

  // CountryRestrictModule
  const countryRestrictModule = await new ethers.ContractFactory(
    TRex.contracts.CountryRestrictModule.abi,
    TRex.contracts.CountryRestrictModule.bytecode,
    deployer
  ).deploy();
  await countryRestrictModule.waitForDeployment();

  const countryRestrictModuleProxy = await new ethers.ContractFactory(
    TRex.contracts.ModuleProxy.abi,
    TRex.contracts.ModuleProxy.bytecode,
    deployer
  ).deploy(
    await countryRestrictModule.getAddress(),
    countryRestrictModule.interface.encodeFunctionData("initialize")
  );
  await countryRestrictModuleProxy.waitForDeployment();

  console.log(
    "Country Restrict Module Proxy ->",
    await countryRestrictModuleProxy.getAddress()
  );

  // ExchangeMonthlyLimitsModule
  const exchangeMonthlyLimitsModule = await new ethers.ContractFactory(
    TRex.contracts.ExchangeMonthlyLimitsModule.abi,
    TRex.contracts.ExchangeMonthlyLimitsModule.bytecode,
    deployer
  ).deploy();
  await exchangeMonthlyLimitsModule.waitForDeployment();

  const exchangeMonthlyLimitsModuleProxy = await new ethers.ContractFactory(
    TRex.contracts.ModuleProxy.abi,
    TRex.contracts.ModuleProxy.bytecode,
    deployer
  ).deploy(
    await exchangeMonthlyLimitsModule.getAddress(),
    exchangeMonthlyLimitsModule.interface.encodeFunctionData("initialize")
  );
  await exchangeMonthlyLimitsModuleProxy.waitForDeployment();

  console.log(
    "Exchange Monthly Limits Module Proxy ->",
    await exchangeMonthlyLimitsModuleProxy.getAddress()
  );

  // MaxBalanceModule
  const maxBalanceModule = await new ethers.ContractFactory(
    TRex.contracts.MaxBalanceModule.abi,
    TRex.contracts.MaxBalanceModule.bytecode,
    deployer
  ).deploy();
  await maxBalanceModule.waitForDeployment();

  const maxBalanceModuleProxy = await new ethers.ContractFactory(
    TRex.contracts.ModuleProxy.abi,
    TRex.contracts.ModuleProxy.bytecode,
    deployer
  ).deploy(
    await maxBalanceModule.getAddress(),
    maxBalanceModule.interface.encodeFunctionData("initialize")
  );
  await maxBalanceModuleProxy.waitForDeployment();

  console.log(
    "Max Balance Module Proxy ->",
    await maxBalanceModuleProxy.getAddress()
  );

  // SupplyLimitModule
  const supplyLimitModule = await new ethers.ContractFactory(
    TRex.contracts.SupplyLimitModule.abi,
    TRex.contracts.SupplyLimitModule.bytecode,
    deployer
  ).deploy();
  await supplyLimitModule.waitForDeployment();

  const supplyLimitModuleProxy = await new ethers.ContractFactory(
    TRex.contracts.ModuleProxy.abi,
    TRex.contracts.ModuleProxy.bytecode,
    deployer
  ).deploy(
    await supplyLimitModule.getAddress(),
    supplyLimitModule.interface.encodeFunctionData("initialize")
  );
  await supplyLimitModuleProxy.waitForDeployment();

  console.log(
    "Supply Limit Module Proxy ->",
    await supplyLimitModuleProxy.getAddress()
  );

  // TimeExchangeLimitsModule
  const timeExchangeLimitsModule = await new ethers.ContractFactory(
    TRex.contracts.TimeExchangeLimitsModule.abi,
    TRex.contracts.TimeExchangeLimitsModule.bytecode,
    deployer
  ).deploy();
  await timeExchangeLimitsModule.waitForDeployment();

  const timeExchangeLimitsModuleProxy = await new ethers.ContractFactory(
    TRex.contracts.ModuleProxy.abi,
    TRex.contracts.ModuleProxy.bytecode,
    deployer
  ).deploy(
    await timeExchangeLimitsModule.getAddress(),
    timeExchangeLimitsModule.interface.encodeFunctionData("initialize")
  );
  await timeExchangeLimitsModuleProxy.waitForDeployment();

  console.log(
    "Time Exchange Limits Module Proxy ->",
    await timeExchangeLimitsModuleProxy.getAddress()
  );

  // TimeTransfersLimitsModule
  const timeTransfersLimitsModule = await new ethers.ContractFactory(
    TRex.contracts.TimeTransfersLimitsModule.abi,
    TRex.contracts.TimeTransfersLimitsModule.bytecode,
    deployer
  ).deploy();
  await timeTransfersLimitsModule.waitForDeployment();

  const timeTransfersLimitsModuleProxy = await new ethers.ContractFactory(
    TRex.contracts.ModuleProxy.abi,
    TRex.contracts.ModuleProxy.bytecode,
    deployer
  ).deploy(
    await timeTransfersLimitsModule.getAddress(),
    timeTransfersLimitsModule.interface.encodeFunctionData("initialize")
  );
  await timeTransfersLimitsModuleProxy.waitForDeployment();

  console.log(
    "Time Transfers Limits Module Proxy ->",
    await timeTransfersLimitsModuleProxy.getAddress()
  );

  // TransferFeesModules
  const transferFeesModules = await new ethers.ContractFactory(
    TRex.contracts.TransferFeesModule.abi,
    TRex.contracts.TransferFeesModule.bytecode,
    deployer
  ).deploy();
  await transferFeesModules.waitForDeployment();

  const transferFeesModulesProxy = await new ethers.ContractFactory(
    TRex.contracts.ModuleProxy.abi,
    TRex.contracts.ModuleProxy.bytecode,
    deployer
  ).deploy(
    await transferFeesModules.getAddress(),
    transferFeesModules.interface.encodeFunctionData("initialize")
  );
  await transferFeesModulesProxy.waitForDeployment();

  console.log(
    "Transfer Fees Modules Proxy ->",
    await transferFeesModulesProxy.getAddress()
  );

  // TransferRestrictModule
  const transferRestrictModule = await new ethers.ContractFactory(
    TRex.contracts.TransferRestrictModule.abi,
    TRex.contracts.TransferRestrictModule.bytecode,
    deployer
  ).deploy();
  await transferRestrictModule.waitForDeployment();

  const transferRestrictModuleProxy = await new ethers.ContractFactory(
    TRex.contracts.ModuleProxy.abi,
    TRex.contracts.ModuleProxy.bytecode,
    deployer
  ).deploy(
    await transferRestrictModule.getAddress(),
    transferRestrictModule.interface.encodeFunctionData("initialize")
  );
  await transferRestrictModuleProxy.waitForDeployment();

  console.log(
    "Transfer Restrict Module Proxy ->",
    await transferRestrictModuleProxy.getAddress()
  );

  const identityRegistryStorageProxy = await new ethers.ContractFactory(
    TRex.contracts.IdentityRegistryStorageProxy.abi,
    TRex.contracts.IdentityRegistryStorageProxy.bytecode,
    deployer
  ).deploy(await trexImplementationAuthority.getAddress());
  await identityRegistryStorageProxy.waitForDeployment();

  console.log(
    "Identity Registry Storage Proxy ->",
    await identityRegistryStorageProxy.getAddress()
  );
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
