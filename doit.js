require('dotenv').config();
const Web3 = require('web3');
const BigNumber = require('bignumber.js');

const abis = require('./abis');
const { mainnet: addresses } = require('./addresses');
const Flashswap = require('./build/contracts/Flashswap.json');

const web3 = new Web3(
    // new Web3.providers.WebsocketProvider(process.env.BSC_WSS)
    process.env.BSC_HTTPS
);
const { address: admin } = web3.eth.accounts.wallet.add(process.env.PRIVATE_KEY)

// we need pancakeSwap
const pancakeFactory = new web3.eth.Contract(
    abis.pancakeFactory.pancakeFactory,
    addresses.pancake.factory
);
const pancakeRouter = new web3.eth.Contract(
    abis.pancakeRouter.pancakeRouter,
    addresses.pancake.router
);

// we need bakerySwap
const bakeryFactory = new web3.eth.Contract(
    abis.bakeryFactory.bakeryFactory,
    addresses.bakery.factory
);
const bakeryRouter = new web3.eth.Contract(
    abis.bakeryRouter.bakeryRouter,
    addresses.bakery.router
);


class Token {
    constructor(name, address, decimals, startAmt) {
     this.name = name; this.address = address;
     this.decimals = decimals; this.startAmt = startAmt;
    }
}

const fromTokens = [
    new Token('WBNB', '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', 18, 100),
    new Token('BUSD', '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56', 18, 100000),
    new Token('USDT', '0x55d398326f99059ff775485246999027b3197955', 18, 100000),
]

// const WBNB = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';
// const fromTokens = [
//     'WBNB',
//     'BUSD',
//     'USDT',
// ];
// const fromToken = [
//     '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', // WBNB
//     '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56', // BUSD
//     '0x55d398326f99059ff775485246999027b3197955', // USDT
// ];
// const fromTokenDecimals = [18, 18, 18];

const toTokens = [
    new Token('WBNB', '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', 18, 100),
    new Token('BUSD', '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56', 18, 100000),
    new Token('USDT', '0x55d398326f99059ff775485246999027b3197955', 18, 100000),
    new Token('BAKE', '0xE02dF9e3e622DeBdD69fb838bB799E3F168902c5', 18, 10000),
]

// const toTokens = [
//     'BUSD',
//     'USDT',
//     'BAKE',
// ];
// const toToken = [
//     '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56', // BUSD
//     '0x55d398326f99059ff775485246999027b3197955', // USDT
//     '0xE02dF9e3e622DeBdD69fb838bB799E3F168902c5', // BAKE
// ];
// const toTokenDecimals = [18, 18, 18];
// const amount = process.env.BNB_AMOUNT;

function getAmountsOut(router, amount, pair) {
    return router.methods.getAmountsOut(amount, pair).call();
}

const init = async () => {
    console.log('initializing');
    const networkId = await web3.eth.net.getId();

    console.log('Getting flashswap contract abi');
    const flashswap = new web3.eth.Contract(
        Flashswap.abi,
        //Flashswap.networks[networkId].address
        '0X4C2C14C41400DEE551EF0F45F32508CAB2A129DD'
    );
    for (let i = 0; i < fromTokens.length; i++) {
        for (let j = 0; j < toTokens.length; j++) {
            const tokenA = fromTokens[i];
            const tokenB = toTokens[j];
            const amount = tokenA.startAmt;

            if (tokenA.name == tokenB.name) {
                continue;
            }
            console.log(`Trading ${tokenB.name}/${tokenA.name} ...`);

            const pairAddress = await pancakeFactory.methods.getPair(tokenA.address, tokenB.address).call();
            console.log(`pairAddress ${tokenB.name}/${tokenA.name} is ${pairAddress}`);
            const unit0 = await new BigNumber(amount);
            let amount0 = await new BigNumber(unit0).shiftedBy(tokenA.decimals);
            console.log(`Input amount of ${tokenA.name}: ${amount0.toString()}`);

            // // The quote currency needs to be WBNB
            // let tokenIn, tokenOut, tokenInName, tokenOutName;
            // if (tokenA.address === WBNB) {
            //     tokenIn = tokenA.address;
            //     tokenInName = tokenA.name;
            //     tokenOut = tokenB.address;
            //     tokenOutName = tokenB.name;
            // }

            // if (tokenB.address === WBNB) {
            //     tokenIn = tokenB.address;
            //     tokenInName = tokenB.name;
            //     tokenOut = tokenA.address;
            //     tokenOutName = tokenA.name;
            // }

            // // The quote currency is not WBNB
            // if (typeof tokenIn === 'undefined') {
            //     return;
            // }

            tokenIn = tokenA.address;
            tokenInName = tokenA.name;
            tokenOut = tokenB.address;
            tokenOutName = tokenB.name;

            const amounts = await getAmountsOut(pancakeRouter, amount0, [tokenIn, tokenOut]);
            // const amounts = await pancakeRouter.methods.getAmountsOut(amount0, [tokenIn, tokenOut]).call();
            const unit1 = await new BigNumber(amounts[1]).shiftedBy(-tokenB.decimals);
            let amount1 = await new BigNumber(amounts[1]);
            console.log(`
                Buying token at PancakeSwap DEX
                =================
                tokenIn: ${unit0.toString()} ${tokenInName}
                tokenOut: ${unit1.toString()} ${tokenOutName}
            `);

            const amounts2 = await getAmountsOut(bakeryRouter, amount1, [tokenOut, tokenIn]);
            // const amounts2 = await bakeryRouter.methods.getAmountsOut(amount1, [tokenOut, tokenIn]).call();
            const unit2 = await new BigNumber(amounts2[1]).shiftedBy(-tokenA.decimals);
            const amount2 = await new BigNumber(amounts2[1]);
            console.log(`
                Buying back token at BakerySwap DEX
                =================
                tokenOut: ${unit1.toString()} ${tokenOutName}
                tokenIn: ${unit2.toString()} ${tokenInName}
            `);

            let profit = await new BigNumber(amount2).minus(amount0).shiftedBy(-tokenA.decimals);
            console.log(`Profit: ${profit.toString()} ${tokenInName}`);

            let tmp;
            // if (profit < 0) {
            //     tmp = amount1;
            //     amount1 = amount0;
            //     amount0 = 0;

            //     profit = BigNumber(0).minus(profit);
            // } else {
            //     amount0 = 0;
            // }
            if (profit > 0) {
                const tx = flashswap.methods.startArbitrage(
                    tokenIn,
                    tokenOut,
                    0,
                    amount1,
                );


                /*
                console.log(`getting gas price and gas cost...`);
                const [gasPrice, gasCost] = await Promise.all([
                    web3.eth.getGasPrice(),
                    tx.estimateGas({from: admin}),
                ]);

                console.log(`
                    gas price: ${gasPrice}
                    gas cost:  ${gasCost}
                `);

                const txCost = web3.utils.toBN(gasCost) * web3.utils.toBN(gasPrice);
                console.log(`txn cost: ${txCost}`);
                */
                const txCost = BigNumber(0.0055).shiftedBy(18);

                profit = await new BigNumber(profit).minus(txCost);

                if (profit > 0) {
                    console.log(`
                        Arbitrage opportunity found!
                        Expected profit: ${profit}
                    `);
                    const data = tx.encodeABI();
                    const txData = {
                        from: admin,
                        to: flashswap.options.address,
                        data,
                        gas: gasCost,
                        gasPrice
                    };
                    const receipt = await web3.eth.sendTransaction(txData);
                    console.log(`Transaction hash: ${receipt.transactionHash}`);
                } else {
                    console.log(`gainz would be eaten up by txn fees`);
                }
            } else {
                console.log(`
                    Arbitrage opportunity not found!
                    Expected profit: ${profit}
                    amount0: ${amount0 / 10**18}
                    amount1: ${amount1 / 10**18}
                `);
            }
        }
    }
}

init();
