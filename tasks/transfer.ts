import { task } from "hardhat/config";
import TRex from "@tokenysolutions/t-rex";
import { expect } from "chai";
import addresses from "../addresses-fluxion.json";

task("transfer", "Transfers from sender to receiver")
  .addParam("sender", "Sender private key")
  .addParam("receiver", "Receiver address")
  .addParam("token", "Token contract address")
  .addParam("amount", "Amount to send")
  .setAction(async (taskArgs, hre) => {
    const { sender, receiver, token: tokenAddress, amount } = taskArgs;
    const senderWallet = new hre.ethers.Wallet(sender, hre.ethers.provider);

    const etherAmount = hre.ethers.parseEther(amount);

    if (!hre.ethers.isAddress(receiver))
      throw new Error("Invalid user address");
    if (!hre.ethers.isAddress(tokenAddress))
      throw new Error("Invalid token address");

    const signers = await hre.ethers.getSigners();
    const irAgent = signers[2];
    const tokenAgent = signers[3];

    const token = await hre.ethers.getContractAt(
      TRex.contracts.Token.abi,
      tokenAddress,
      tokenAgent
    );

    const compliance = await hre.ethers.getContractAt(
      TRex.contracts.ModularCompliance.abi,
      await token.compliance(),
      irAgent
    );

    const tx = await compliance.callModuleFunction(
      new hre.ethers.Interface([
        "function batchApproveTransfers(address[], address[], uint256[])",
      ]).encodeFunctionData("batchApproveTransfers", [
        [senderWallet.address],
        [receiver],
        [etherAmount],
      ]),
      addresses.conditionalTransferModule
    );

    const txTransfer = await token
      .connect(senderWallet)
      .transfer(receiver, etherAmount);

    await txTransfer.wait();
  });
