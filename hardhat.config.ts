import { HardhatUserConfig } from "hardhat/config";
import { vars } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "./tasks/mintToken";
import "./tasks/kyc";
import "./tasks/transfer";

const config: HardhatUserConfig = {
  defaultNetwork: "chain",
  networks: {
    chain: {
      url: "http://localhost:10002",
      accounts: [
        vars.get("deployer"),
        vars.get("claimIssuer"),
        vars.get("irAgent"),
        vars.get("tokenAgent"),
      ],
    },
  },
  solidity: "0.8.17",
};

export default config;
