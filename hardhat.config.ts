import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

const config: HardhatUserConfig = {
  // not needed if provider is defined within scripts
  networks: {
    geth: {
      url: "http://localhost:8545"
    }
  }
};

export default config;
