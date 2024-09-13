import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

const config: HardhatUserConfig = {
  networks: {
    geth: {
      url: "http://localhost:8545"
    }
  }
};

export default config;
