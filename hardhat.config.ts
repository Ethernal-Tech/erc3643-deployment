import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

const config: HardhatUserConfig = {
  defaultNetwork: "chain",
  networks: {
    chain: {
      url: "http://localhost:8545",
      accounts: [
        "e77f21c7c2cc438846dcfdd269c68daea4c1c7f40d2c3329ea55c01e24f77bcc", // deployer
        "7af6400ff7ddb5aae0ba6eaad5d415d9f8c6831d976c645d5bf6fecdb23ed2af", // claimIssuer
        "f73b34c77087caa4f26a1dd7c9d986c1d0caff269fac1466ae0fa2aa5691ed66", // irAgent
        "0e647288caf9b7d5c91f89e10ca6a9ef1cbe85e85a309e74e48149d0c2cf2291", // tokenAgent
        "b00ee7d037cd9ddd26866641bc2387059c0c8b2d86b7f1ef61d3a0956d21ab14"  // user
      ]
    }
  }
};

export default config;
