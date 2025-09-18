import { HardhatUserConfig } from "hardhat/config";
import { vars } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "./tasks/mintToken";
import "./tasks/kyc";

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
};

export default config;
