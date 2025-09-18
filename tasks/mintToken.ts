import { task } from "hardhat/config";
import TRex from "@tokenysolutions/t-rex";
import { expect } from "chai";

task("mint-token", "Mints and unpauses a T-Rex token")
  .addParam("user", "Recipient address")
  .addParam("token", "Token contract address")
  .addParam("amount", "Amount to mint")
  .setAction(async (taskArgs, hre) => {
    const { user, token: tokenAddress, amount } = taskArgs;

    if (!hre.ethers.isAddress(user)) throw new Error("Invalid user address");
    if (!hre.ethers.isAddress(tokenAddress))
      throw new Error("Invalid token address");

    const signers = await hre.ethers.getSigners();
    const tokenAgent = signers[3];

    const token = await hre.ethers.getContractAt(
      TRex.contracts.Token.abi,
      tokenAddress,
      tokenAgent
    );

    const txMint = await token
      .connect(tokenAgent)
      .mint(user, hre.ethers.parseEther(amount));
    await txMint.wait();
    expect(txMint).to.emit(token, "Transfer");

    const txUnpause = await token.connect(tokenAgent).unpause();
    await txUnpause.wait();
    expect(txUnpause).to.emit(token, "Unpaused");
  });
