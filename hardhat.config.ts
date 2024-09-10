import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

const config: HardhatUserConfig = {
  networks: {
    geth: {
      url: "http://localhost:8545",
    }
  },
  solidity: "0.8.24",
};

export default config;
