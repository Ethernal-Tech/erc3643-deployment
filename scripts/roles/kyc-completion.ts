import { ethers } from "hardhat";
import { expect } from "chai";
import OnchainID from "@onchain-id/solidity";
import addresses from "../../addresses-fluxion.json";
import TRex from "@tokenysolutions/t-rex";

async function main() {
  const irAgent = (await ethers.getSigners())[2];
  const user = (await ethers.getSigners())[4];

  // 2. user setup, user identity can be created by anyone
  const gateway = await ethers.getContractAt(
    OnchainID.contracts.Gateway.abi,
    addresses.gateway
  );
  const txDeployId = await gateway
    .connect(irAgent)
    .deployIdentityForWallet(user.address);
  await txDeployId.wait();

  // 3. insert user into identity registry storage; only irAgent can add user into identityStorage
  // this step can be executed in parallel with claim issuing
  const trexGateway = await ethers.getContractAt(
    TRex.contracts.TREXGateway.abi,
    addresses.trexGateway,
    irAgent
  );
  const trexFactory = await ethers.getContractAt(
    TRex.contracts.TREXFactory.abi,
    await trexGateway.getFactory(),
    irAgent
  );
  const identityFactory = await ethers.getContractAt(
    OnchainID.contracts.Factory.abi,
    await trexFactory.getIdFactory(),
    irAgent
  );

  const userIdentity = await ethers.getContractAt(
    OnchainID.contracts.Identity.abi,
    await identityFactory.getIdentity(user.address),
    irAgent
  );

  // AS AN OPTION BEFORE ADDING USER IDENTITY TO IRS IT CAN BE CHECKED WITH OnchainID Verifier CONTRACT IF THE
  // USER HAS ALL CLAIMS REQUIRED FOR THIS PARTICULAR TOKEN.IF SO THEN CLAIMS MUST BE ADDED BEFORE THIS ACTION.
  // HOWEVER IF CLAIMS WILL BE PERIODICALLY RENEWED THEN THIS CHECK DOESN'T HAVE MUCH SENSE.

  // const verifier = await ethers.getContractAt(OnchainID.contracts.Verifier.abi, verifierAddress, irAgent)
  // await expect(verifier.verify(await userIdentity.getAddress())).to.eventually.be.true;

  const irStorage = await ethers.getContractAt(
    TRex.contracts.IdentityRegistryStorage.abi,
    addresses.identityRegistryStorage,
    irAgent
  );
  const txIrStorage = await irStorage
    .connect(irAgent)
    .addIdentityToStorage(user.address, await userIdentity.getAddress(), 688); // SRB Iban code
  await txIrStorage.wait();

  expect(txIrStorage).to.emit(irStorage, "IdentityStored");
  console.log("Completed");
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
