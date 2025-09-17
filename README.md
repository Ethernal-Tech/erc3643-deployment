# Example of ERC3643 deployment

This project demonstrates a basic ERC3643 deployment

Try running some of the following tasks in order to execute the script. Make sure that geth is running on localhost:8545 and you have users private keys set (script can be run with one user as well):

```shell
npm install --save-dev hardhat (to install hardhat)
npm ci
npx hardhat run scripts/trex-deploy.ts --network chain // --network chain -> not needed if targeting a default network
```

# How to setup hardhat vars

```sh
npx hardhat vars set DEPLOYER
npx hardhat vars set CLAIM_ISSUER
npx hardhat vars set IR_AGENT
npx hardhat vars set TOKEN_AGENT
npx hardhat vars set USER
```

# Addresses

After deployment addresses can be accessed in file `addresses-fluxion.json`
