import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";
import { expect } from "chai";
import { deployComplianceFixture } from "./fixtures/deploy-compliance.fixture";
import ERC3643Token from "../artifacts/contracts/token/ERC3643Token.sol/ERC3643Token.json";

async function deployERC3643Token() {
  const context = await loadFixture(deployComplianceFixture);
  const { token } = context.suite;
  const { aliceWallet, bobWallet, tokenAgent } = context.accounts;

  await token.connect(tokenAgent).mint(aliceWallet, 10)
  await token.connect(tokenAgent).mint(bobWallet, 20)

  const erc3643Token = await ethers.getContractAt(ERC3643Token.abi, token.target);

  return {
    ...context,
    suite: {
      ...context.suite,
      erc3643Token,
    },
  };
}

describe("ERC3643 Token", () => {
  describe(".getBalances", () => {
    it("should return correct balances", async () => {
      const context = await loadFixture(deployERC3643Token);
      const { erc3643Token } = context.suite;
      const { aliceWallet, bobWallet, anotherWallet } = context.accounts;
      const users = [aliceWallet, bobWallet, anotherWallet];

      const balances = await erc3643Token.connect(aliceWallet).getBalances(users)
      expect(balances.length).to.equal(users.length)

      for (let i = 0; i < users.length; i++) {
         expect(balances[i]).to.equal(await erc3643Token.connect(users[i]).balanceOf(users[i]))
      }
    });
  });
});
