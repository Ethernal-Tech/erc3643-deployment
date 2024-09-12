import { ethers } from "hardhat";
import OnchainID from '@onchain-id/solidity';
import { contracts } from '@tokenysolutions/t-rex';
import { expect } from 'chai';
import { EventLog, Contract } from 'ethers';

async function main() {
  const provider = new ethers.JsonRpcProvider("http://localhost:8545")
  const deployer = new ethers.Wallet("e77f21c7c2cc438846dcfdd269c68daea4c1c7f40d2c3329ea55c01e24f77bcc", provider);
  const claimIssuer = new ethers.Wallet("7af6400ff7ddb5aae0ba6eaad5d415d9f8c6831d976c645d5bf6fecdb23ed2af", provider);
  const irAgent = new ethers.Wallet("f73b34c77087caa4f26a1dd7c9d986c1d0caff269fac1466ae0fa2aa5691ed66", provider)
  const tokenAgent = new ethers.Wallet("0e647288caf9b7d5c91f89e10ca6a9ef1cbe85e85a309e74e48149d0c2cf2291", provider)
  const user = new ethers.Wallet("b00ee7d037cd9ddd26866641bc2387059c0c8b2d86b7f1ef61d3a0956d21ab14", provider)

  const identityImplementation = await new ethers.ContractFactory(
    OnchainID.contracts.Identity.abi,
    OnchainID.contracts.Identity.bytecode,
    deployer,
  ).deploy(deployer.address, true);
  await identityImplementation.waitForDeployment()

  const identityImplementationAuthority = await new ethers.ContractFactory(
    OnchainID.contracts.ImplementationAuthority.abi,
    OnchainID.contracts.ImplementationAuthority.bytecode,
    deployer,
  ).deploy(await identityImplementation.getAddress());
  await identityImplementationAuthority.waitForDeployment()

  const identityFactory = await new ethers.ContractFactory(OnchainID.contracts.Factory.abi, OnchainID.contracts.Factory.bytecode, deployer).deploy(
    await identityImplementationAuthority.getAddress(),
  );
  await identityFactory.waitForDeployment()

  const trustedIssuersRegistryImplementation = await new ethers.ContractFactory(contracts.TrustedIssuersRegistry.abi,
    contracts.TrustedIssuersRegistry.bytecode,
    deployer
  ).deploy()
  await trustedIssuersRegistryImplementation.waitForDeployment()

  const identityRegistryStorageImplementation = await new ethers.ContractFactory(contracts.IdentityRegistryStorage.abi,
    contracts.IdentityRegistryStorage.bytecode,
    deployer
  ).deploy()
  await identityRegistryStorageImplementation.waitForDeployment()

  const identityRegistryImplementation = await new ethers.ContractFactory(contracts.IdentityRegistry.abi,
     contracts.IdentityRegistry.bytecode,
     deployer).deploy();
   await identityRegistryImplementation.waitForDeployment()

  const modularComplianceImplementation = await new ethers.ContractFactory(contracts.ModularCompliance.abi,
    contracts.ModularCompliance.bytecode,
    deployer).deploy()
  await modularComplianceImplementation.waitForDeployment()

  const tokenImplementation = await new ethers.ContractFactory(contracts.Token.abi,
    contracts.Token.bytecode,
    deployer).deploy();
  await tokenImplementation.waitForDeployment()

  const claimTopicsRegistryImplementation = await new ethers.ContractFactory(contracts.ClaimTopicsRegistry.abi,
    contracts.ClaimTopicsRegistry.bytecode,
    deployer
  ).deploy()
  await claimTopicsRegistryImplementation.waitForDeployment()

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

  const trexImplementationAuthority = await new ethers.ContractFactory(contracts.TREXImplementationAuthority.abi,
    contracts.TREXImplementationAuthority.bytecode,
    deployer
  ).deploy(true, ethers.ZeroAddress, ethers.ZeroAddress)
  await trexImplementationAuthority.waitForDeployment()

  const txAddTREX = await trexImplementationAuthority.connect(deployer).addAndUseTREXVersion(versionStruct, contractsStruct);
  await txAddTREX.wait()
  
  const trexFactory = await new ethers.ContractFactory(contracts.TREXFactory.abi,
    contracts.TREXFactory.bytecode,
    deployer).deploy(await trexImplementationAuthority.getAddress(), await identityFactory.getAddress())
  await trexFactory.waitForDeployment()

  const txAddTokenFactory = await identityFactory.connect(deployer).addTokenFactory(await trexFactory.getAddress());
  await txAddTokenFactory.wait()

  const claimIssuerContract = await new ethers.ContractFactory(OnchainID.contracts.ClaimIssuer.abi,
    OnchainID.contracts.ClaimIssuer.bytecode,
    deployer).deploy(claimIssuer.address)
  await claimIssuerContract.waitForDeployment()

  const txDeployTREX = await trexFactory.connect(deployer).deployTREXSuite(
    'salt',
    {
      owner: deployer.address,
      name: 'Token name',
      symbol: 'SYM',
      decimals: 8,
      irs: ethers.ZeroAddress,
      ONCHAINID: ethers.ZeroAddress,
      irAgents: [irAgent.address],
      tokenAgents: [tokenAgent.address],
      complianceModules: [],
      complianceSettings: [],
    },
    {
      claimTopics: [ethers.id('CLAIM_TOPIC')],
      issuers: [await claimIssuerContract.getAddress()],
      issuerClaims: [[ethers.id('CLAIM_TOPIC')]],
    },
  ); 
  const receipt = await txDeployTREX.wait()

  expect(txDeployTREX).to.emit(trexFactory, 'TREXSuiteDeployed');
  expect(txDeployTREX).to.emit(identityFactory, 'Deployed');
  expect(txDeployTREX).to.emit(identityFactory, 'TokenLinked');

  const trexSuiteDeployedEvent = receipt.logs.find((log: EventLog) => log.eventName === 'TREXSuiteDeployed');
  const identityFactoryAddress = (await identityFactory.getAddress()).toString()
  console.log("Token address -> %s", trexSuiteDeployedEvent.args[0])
  console.log("IdentityRegistry address -> %s", trexSuiteDeployedEvent.args[1])
  console.log("IdentityFactory address -> %s", identityFactoryAddress)


  ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // End of token deployment
  // Below are usage examples, this doesn't belong to token deployment but needs to be done before token production
  ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

  // 1. user setup, user identity is created by deployer; only irAgent can add user into identityStorage
  const idFactory = new Contract(identityFactoryAddress, OnchainID.contracts.Factory.abi, deployer)
  const txIdFactory = await idFactory.connect(deployer).createIdentity(user.address, 'user');
  await txIdFactory.wait()

  const userIdentity = await ethers.getContractAt(OnchainID.contracts.Identity.abi, await idFactory.getIdentity(user.address));

  const idRegistry = new Contract(trexSuiteDeployedEvent.args[1], contracts.IdentityRegistry.abi, irAgent)
  const txIdRegistry = await idRegistry.connect(irAgent).registerIdentity(user.address, await userIdentity.getAddress(), 666);
  await txIdRegistry.wait()  

  // 2 user claim
  const claimForUser = {
    data: ethers.hexlify(ethers.toUtf8Bytes('Some claim public data.')),
    issuer: await claimIssuerContract.getAddress(),
    topic: ethers.id('CLAIM_TOPIC'),
    scheme: 1,
    identity: await userIdentity.getAddress(),
    signature: '',
    uri: 'https://example.com'
  };
  claimForUser.signature = await claimIssuer.signMessage(
    ethers.getBytes(
      ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(['address', 'uint256', 'bytes'], [claimForUser.identity, claimForUser.topic, claimForUser.data]),
      ),
    ),
  );

  // option #1 for addClaim, add claim issuer signing key (type = 3 CLAIM) into user identity store:
  const txUserIdentity = await userIdentity.connect(user)
    .addKey(ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['address'], [claimIssuer.address])), 3, 1);
  await txUserIdentity.wait()

  // add user claim to user onchainid (connect should be possible with claimIssuer due to above addClaim option #1)
  const txAddClaim = await userIdentity.connect(claimIssuer)
    .addClaim(claimForUser.topic, claimForUser.scheme, claimForUser.issuer, claimForUser.signature, claimForUser.data, claimForUser.uri);
  await txAddClaim.wait()

  // option #2 for addClaim requires execute/approve pattern like this:
  // const claimData = new ethers.Interface(OnchainID.interfaces.IERC735.abi).encodeFunctionData('addClaim', [
  //   claimForUser.topic, claimForUser.scheme, claimForUser.issuer, claimForUser.signature, claimForUser.data, claimForUser.uri
  // ])

  // // value always 0
  // const txExecute = await userIdentity.connect(claimIssuer).execute(await userIdentity.getAddress(), 0, claimData);
  // const receiptExecute = await txExecute.wait()
  
  // expect(txExecute).to.emit(userIdentity, 'ExecutionRequested');
  // const executionNonce = receiptExecute.logs.find((log: EventLog) => log.eventName === 'ExecutionRequested').args[0];

  // const txApprove = await userIdentity.connect(user).approve(executionNonce, true);
  // await txApprove.wait()

  // expect(txApprove).to.emit(userIdentity, 'Approved');
  // expect(txApprove).to.emit(userIdentity, 'Executed');

  // option #3, user calls his userIdentity contract .connect(user), he needs to get signed claim from claimIssuer first
  // const txAddClaim = await userIdentity.connect(user)
  //   .addClaim(claimForUser.topic, claimForUser.scheme, claimForUser.issuer, claimForUser.signature, claimForUser.data, claimForUser.uri);
  // await txAddClaim.wait()
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
