import { ethers } from "hardhat";
import OnchainID from "@onchain-id/solidity";
import TRex from "@tokenysolutions/t-rex";
import { writeFileSync } from "fs";
import TransparentUpgradeableProxy from "@openzeppelin/contracts/build/contracts/TransparentUpgradeableProxy.json";
import CountryPermitModule from "../artifacts/contracts/compliance/CountryPermitModule.sol/CountryPermitModule.json";
import CountryRestrictModule from "../artifacts/contracts/compliance/CountryRestrictModule.sol/CountryRestrictModule.json";
import MaxBalanceModule from "../artifacts/contracts/compliance/MaxBalanceModule.sol/MaxBalanceModule.json";
import MaxTotalSupplyModule from "../artifacts/contracts/compliance/MaxTotalSupplyModule.sol/MaxTotalSupplyModule.json";
import MinInvestmentModule from "../artifacts/contracts/compliance/MinInvestmentModule.sol/MinInvestmentModule.json";
import LockInTransferModule from "../artifacts/contracts/compliance/LockInTransferModule.sol/LockInTransferModule.json";
import GlobalLockInTransferModule from "../artifacts/contracts/compliance/GlobalLockInTransferModule.sol/GlobalLockInTransferModule.json";
import TransferPermitModule from "../artifacts/contracts/compliance/TransferPermitModule.sol/TransferPermitModule.json";
import MarketplaceManager from "../artifacts/contracts/marketplace/MarketplaceManager.sol/MarketplaceManager.json";
import ERC3643Token from "../artifacts/contracts/token/ERC3643Token.sol/ERC3643Token.json";

async function main() {
  const appAdmin = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"; // replace with actual app admin address
  const [deployer] = await ethers.getSigners(); // deployer is infraAdmin, 1st account in HH config

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
  ).deploy(await identityFactory.getAddress(), [appAdmin]); // anyone can be signer
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
    ERC3643Token.abi,
    ERC3643Token.bytecode,
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

  const txAddTREX = await trexImplementationAuthority.connect(deployer).addAndUseTREXVersion(versionStruct, contractsStruct);
  await txAddTREX.wait();

  const trexFactory = await new ethers.ContractFactory(
    TRex.contracts.TREXFactory.abi,
    TRex.contracts.TREXFactory.bytecode,
    deployer
  ).deploy(await trexImplementationAuthority.getAddress(), await identityFactory.getAddress());
  await trexFactory.waitForDeployment();

  const txAddTokenFactory = await identityFactory.connect(deployer).addTokenFactory(await trexFactory.getAddress());
  await txAddTokenFactory.wait();

  const trexGateway = await new ethers.ContractFactory(
    TRex.contracts.TREXGateway.abi,
    TRex.contracts.TREXGateway.bytecode,
    deployer
  ).deploy(await trexFactory.getAddress(), false);
  await trexGateway.waitForDeployment();

  const txAddDeployer = await trexGateway.connect(deployer).addDeployer(appAdmin); // token deployer can be anyone
  await txAddDeployer.wait();

  // transfer trexFactory ownership to trexGateway
  const trexGatewayOwnership = await trexFactory.connect(deployer).transferOwnership(await trexGateway.getAddress());
  await trexGatewayOwnership.wait();

  // transfer identityFactory ownership to gateway in order to allow identity creation by users
  const txTransferOwnership = await identityFactory.connect(deployer).transferOwnership(await gateway.getAddress());
  await txTransferOwnership.wait();

  console.log("TREXFactory address -> %s", (await trexFactory.getAddress()).toString());
  console.log("TREXGateway address -> %s", (await trexGateway.getAddress()).toString());
  console.log("Gateway address -> %s", (await gateway.getAddress()).toString());

  // TREXGateway contains trexFactory; trexFactory contains idFactory, token; token contains MC, IR; IR contains IRS, TIR, CTR
  // Gateway is for users identity creation

  const countryPermitModule = await new ethers.ContractFactory(
    CountryPermitModule.abi,
    CountryPermitModule.bytecode,
    deployer
  ).deploy();
  await countryPermitModule.waitForDeployment();

  const countryPermitModuleProxy = await new ethers.ContractFactory(
    TRex.contracts.ModuleProxy.abi,
    TRex.contracts.ModuleProxy.bytecode,
    deployer
  ).deploy(
    await countryPermitModule.getAddress(),
    countryPermitModule.interface.encodeFunctionData("initialize")
  );
  await countryPermitModuleProxy.waitForDeployment();

  console.log(
    "Country Permit Module Proxy ->",
    await countryPermitModuleProxy.getAddress()
  );

  // CountryRestrictModule
  const countryRestrictModule = await new ethers.ContractFactory(
    CountryRestrictModule.abi,
    CountryRestrictModule.bytecode,
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

  // MaxBalanceModule
  const maxBalanceModule = await new ethers.ContractFactory(
    MaxBalanceModule.abi,
    MaxBalanceModule.bytecode,
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

  // MaxTotalSupplyModule
  const maxTotalSupplyModule = await new ethers.ContractFactory(
    MaxTotalSupplyModule.abi,
    MaxTotalSupplyModule.bytecode,
    deployer
  ).deploy();
  await maxTotalSupplyModule.waitForDeployment();

  const maxTotalSupplyModuleProxy = await new ethers.ContractFactory(
    TRex.contracts.ModuleProxy.abi,
    TRex.contracts.ModuleProxy.bytecode,
    deployer
  ).deploy(
    await maxTotalSupplyModule.getAddress(),
    maxTotalSupplyModule.interface.encodeFunctionData("initialize")
  );
  await maxTotalSupplyModuleProxy.waitForDeployment();

  console.log(
    "Max Total Supply Module Proxy ->",
    await maxTotalSupplyModuleProxy.getAddress()
  );

  // MinInvestmentModule
  const minInvestmentModule = await new ethers.ContractFactory(
    MinInvestmentModule.abi,
    MinInvestmentModule.bytecode,
    deployer
  ).deploy();
  await minInvestmentModule.waitForDeployment();

  const minInvestmentModuleProxy = await new ethers.ContractFactory(
    TRex.contracts.ModuleProxy.abi,
    TRex.contracts.ModuleProxy.bytecode,
    deployer
  ).deploy(
    await minInvestmentModule.getAddress(),
    minInvestmentModule.interface.encodeFunctionData("initialize")
  );
  await minInvestmentModuleProxy.waitForDeployment();

  console.log(
    "Min Investment Module Proxy ->",
    await minInvestmentModuleProxy.getAddress()
  );

  // LockInTransferModule
  const lockInTransferModule = await new ethers.ContractFactory(
    LockInTransferModule.abi,
    LockInTransferModule.bytecode,
    deployer
  ).deploy();
  await lockInTransferModule.waitForDeployment();

  const lockInTransferModuleProxy = await new ethers.ContractFactory(
    TRex.contracts.ModuleProxy.abi,
    TRex.contracts.ModuleProxy.bytecode,
    deployer
  ).deploy(
    await lockInTransferModule.getAddress(),
    lockInTransferModule.interface.encodeFunctionData("initialize")
  );
  await lockInTransferModuleProxy.waitForDeployment();

  console.log(
    "Lock In Transfer Module Proxy ->",
    await lockInTransferModuleProxy.getAddress()
  );

  // GlobalLockInTransferModule
  const globalLockInTransferModule = await new ethers.ContractFactory(
    GlobalLockInTransferModule.abi,
    GlobalLockInTransferModule.bytecode,
    deployer
  ).deploy();
  await globalLockInTransferModule.waitForDeployment();

  const globalLockInTransferModuleProxy = await new ethers.ContractFactory(
    TRex.contracts.ModuleProxy.abi,
    TRex.contracts.ModuleProxy.bytecode,
    deployer
  ).deploy(
    await globalLockInTransferModule.getAddress(),
    globalLockInTransferModule.interface.encodeFunctionData("initialize")
  );
  await globalLockInTransferModuleProxy.waitForDeployment();

  console.log(
    "Global Lock In Transfer Module Proxy ->",
    await globalLockInTransferModuleProxy.getAddress()
  );

  // TransferPermitModule
  const transferPermitModule = await new ethers.ContractFactory(
    TransferPermitModule.abi,
    TransferPermitModule.bytecode,
    deployer
  ).deploy();
  await transferPermitModule.waitForDeployment();

  const transferPermitModuleProxy = await new ethers.ContractFactory(
    TRex.contracts.ModuleProxy.abi,
    TRex.contracts.ModuleProxy.bytecode,
    deployer
  ).deploy(
    await transferPermitModule.getAddress(),
    transferPermitModule.interface.encodeFunctionData("initialize")
  );
  await transferPermitModuleProxy.waitForDeployment();

  console.log(
    "Transfer Permit Module Proxy ->",
    await transferPermitModuleProxy.getAddress()
  );

  // MarketplaceManager
  const marketplaceManager = await new ethers.ContractFactory(
    MarketplaceManager.abi,
    MarketplaceManager.bytecode,
    deployer
  ).deploy();
  await marketplaceManager.waitForDeployment();

  const marketplaceManagerProxy = await new ethers.ContractFactory(
    TransparentUpgradeableProxy.abi,
    TransparentUpgradeableProxy.bytecode,
    deployer
  ).deploy(
    await marketplaceManager.getAddress(),
    deployer.address,
    marketplaceManager.interface.encodeFunctionData("initialize")
  );
  await marketplaceManagerProxy.waitForDeployment();

  console.log(
    "Marketplace Manager Proxy ->",
    await marketplaceManagerProxy.getAddress()
  );

  const identityRegistryStorageProxy = await new ethers.ContractFactory(
    TRex.contracts.IdentityRegistryStorageProxy.abi,
    TRex.contracts.IdentityRegistryStorageProxy.bytecode,
    deployer
  ).deploy(await trexImplementationAuthority.getAddress());
  await identityRegistryStorageProxy.waitForDeployment();

  console.log("Identity Registry Storage Proxy ->", await identityRegistryStorageProxy.getAddress());

  const irStorage = await ethers.getContractAt(
    TRex.contracts.IdentityRegistryStorage.abi,
    await identityRegistryStorageProxy.getAddress()
  );
  const txAddAgent = await irStorage.connect(deployer).addAgent(appAdmin);
  await txAddAgent.wait();

  const transferOwnershipIRS = await irStorage.connect(deployer).transferOwnership(await trexFactory.getAddress());
  await transferOwnershipIRS.wait();

  const addresses = {
    trexFactory: await trexFactory.getAddress(),
    trexGateway: await trexGateway.getAddress(),
    gateway: await gateway.getAddress(),
    identityRegistryStorage: await identityRegistryStorageProxy.getAddress(),
    countryPermitModule: await countryPermitModuleProxy.getAddress(),
    countryRestrictModule: await countryRestrictModuleProxy.getAddress(),
    maxBalanceModule: await maxBalanceModuleProxy.getAddress(),
    maxTotalSupplyModule: await maxTotalSupplyModuleProxy.getAddress(),
    minInvestmentModule: await minInvestmentModuleProxy.getAddress(),
    lockInTransferModule: await lockInTransferModuleProxy.getAddress(),
    globalLockInTransferModule: await globalLockInTransferModuleProxy.getAddress(),
    transferPermitModule: await transferPermitModuleProxy.getAddress(),
    marketplaceManager: await marketplaceManagerProxy.getAddress(),
  };

  writeFileSync("addresses-folion.json", JSON.stringify(addresses, null, 2));
  console.log("Addresses written to addresses-folion.json");
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
