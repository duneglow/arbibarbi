require("@nomiclabs/hardhat-web3");

//require("@nomiclabs/hardhat-waffle");

require('hardhat-deploy');
require("@nomiclabs/hardhat-ethers");

require("@nomiclabs/hardhat-etherscan");

// plugin aggiunto da me
require("@nomiclabs/hardhat-truffle5");


const {
  infuraProjectId,
  accountPrivateKey,
  etherscanAPIKey
} = require(__dirname+'/.secrets.js');

// task action function receives the Hardhat Runtime Environment as second argument
task("accounts", "Prints accounts", async (_, { web3 }) => {
  console.log(await web3.eth.getAccounts());
});

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {

  networks: {

    hardhat: {
      accounts: [{privateKey: `0x${accountPrivateKey}`, balance: "900000000000"}]
    },


    mainnet: {
      url:  "https://bsc-dataseed1.binance.org",
      chainId: 56,
      ///gasPrice: 20000000000,
      accounts: [`0x${accountPrivateKey}`]
    },

  },

  etherscan: {
    // Your API key for Etherscan
    // Obtain one at https://etherscan.io/
    apiKey: etherscanAPIKey
  },

  solidity:  "0.7.1",
};
