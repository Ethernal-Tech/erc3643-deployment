import { task } from "hardhat/config";
import TRex from "@tokenysolutions/t-rex";
import { expect } from "chai";
import OnchainID from "@onchain-id/solidity";
import addresses from "../addresses-fluxion.json";

task("kyc", "KYC completion for a user")
  .addParam("user", "Recipient address")
  .setAction(async (taskArgs, hre) => {
    const irAgent = (await hre.ethers.getSigners())[2];
    const { user } = taskArgs;
    expect(hre.ethers.isAddress(user)).to.be.true;

    console.log("Starting KYC completion for user %s", user);

    // 2. user setup, user identity can be created by anyone
    const gateway = await hre.ethers.getContractAt(
      OnchainID.contracts.Gateway.abi,
      addresses.gateway
    );
    const txDeployId = await gateway
      .connect(irAgent)
      .deployIdentityForWallet(user);
    await txDeployId.wait();

    // 3. insert user into identity registry storage; only irAgent can add user into identityStorage
    // this step can be executed in parallel with claim issuing
    const trexGateway = await hre.ethers.getContractAt(
      TRex.contracts.TREXGateway.abi,
      addresses.trexGateway,
      irAgent
    );
    const trexFactory = await hre.ethers.getContractAt(
      TRex.contracts.TREXFactory.abi,
      await trexGateway.getFactory(),
      irAgent
    );
    const identityFactory = await hre.ethers.getContractAt(
      OnchainID.contracts.Factory.abi,
      await trexFactory.getIdFactory(),
      irAgent
    );

    const userIdentity = await hre.ethers.getContractAt(
      OnchainID.contracts.Identity.abi,
      await identityFactory.getIdentity(user),
      irAgent
    );

    // AS AN OPTION BEFORE ADDING USER IDENTITY TO IRS IT CAN BE CHECKED WITH OnchainID Verifier CONTRACT IF THE
    // USER HAS ALL CLAIMS REQUIRED FOR THIS PARTICULAR TOKEN.IF SO THEN CLAIMS MUST BE ADDED BEFORE THIS ACTION.
    // HOWEVER IF CLAIMS WILL BE PERIODICALLY RENEWED THEN THIS CHECK DOESN'T HAVE MUCH SENSE.

    // const verifier = await hre.ethers.getContractAt(OnchainID.contracts.Verifier.abi, verifierAddress, irAgent)
    // await expect(verifier.verify(await userIdentity.getAddress())).to.eventually.be.true;

    const irStorage = await hre.ethers.getContractAt(
      TRex.contracts.IdentityRegistryStorage.abi,
      addresses.identityRegistryStorage,
      irAgent
    );
    const txIrStorage = await irStorage
      .connect(irAgent)
      .addIdentityToStorage(user, await userIdentity.getAddress(), 688); // SRB Iban code
    await txIrStorage.wait();

    expect(txIrStorage).to.emit(irStorage, "IdentityStored");
    console.log("Completed");
  });
