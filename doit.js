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

const WBNB = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';
const fromTokens = [
    'WBNB'
];
const fromToken = [
    '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', // WBNB
];
const fromTokenDecimals = [18];

const toTokens = [
    'BUSD',
    // 'USDT',
    // 'BAKE',
];
const toToken = [
    '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56', // BUSD
    '0x55d398326f99059ff775485246999027b3197955', // USDT
    '0xE02dF9e3e622DeBdD69fb838bB799E3F168902c5', // BAKE
];
const toTokenDecimals = [18, 18, 18];
const amount = process.env.BNB_AMOUNT;

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
            console.log(`Trading ${toTokens[j]}/${fromTokens[i]} ...`);

            const pairAddress = await pancakeFactory.methods.getPair(fromToken[i], toToken[j]).call();
            console.log(`pairAddress ${toTokens[j]}/${fromTokens[i]} is ${pairAddress}`);
            const unit0 = await new BigNumber(amount);
            let amount0 = await new BigNumber(unit0).shiftedBy(fromTokenDecimals[i]);
            console.log(`Input amount of ${fromTokens[i]}: ${amount0.toString()}`);

            // The quote currency needs to be WBNB
            let tokenIn, tokenOut, tokenInName, tokenOutName;
            if (fromToken[i] === WBNB) {
                tokenIn = fromToken[i];
                tokenInName = fromTokens[i];
                tokenOut = toToken[j];
                tokenOutName = toTokens[j];
            }

            if (toToken[j] === WBNB) {
                tokenIn = toToken[j];
                tokenInName = toTokens[j];
                tokenOut = fromToken[i];
                tokenOutName = fromTokens[i];
            }

            // The quote currency is not WBNB
            if (typeof tokenIn === 'undefined') {
                return;
            }


            const amounts = await getAmountsOut(pancakeRouter, amount0, [tokenIn, tokenOut]);
            // const amounts = await pancakeRouter.methods.getAmountsOut(amount0, [tokenIn, tokenOut]).call();
            const unit1 = await new BigNumber(amounts[1]).shiftedBy(-toTokenDecimals[j]);
            let amount1 = await new BigNumber(amounts[1]);
            console.log(`
                Buying token at PancakeSwap DEX
                =================
                tokenIn: ${unit0.toString()} ${tokenInName}
                tokenOut: ${unit1.toString()} ${tokenOutName}
            `);

            const amounts2 = await getAmountsOut(bakeryRouter, amount1, [tokenOut, tokenIn]);
            // const amounts2 = await bakeryRouter.methods.getAmountsOut(amount1, [tokenOut, tokenIn]).call();
            const unit2 = await new BigNumber(amounts2[1]).shiftedBy(-fromTokenDecimals[i]);
            const amount2 = await new BigNumber(amounts2[1]);
            console.log(`
                Buying back token at BakerySwap DEX
                =================
                tokenOut: ${unit1.toString()} ${tokenOutName}
                tokenIn: ${unit2.toString()} ${tokenInName}
            `);

            let profit = await new BigNumber(amount2).minus(amount0).shiftedBy(-fromTokenDecimals[i]);
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
            if (true || profit > 0) {
                console.log('yeeeeeeeeeeeeeeeeeeeeeee');
                const tx = flashswap.methods.startArbitrage(
                    tokenIn,
                    tokenOut,
                    profit > 0 ? 0 : amount0,
                    profit > 0 ? amount1 : 0,
                );

                if (profit < 0) {
                    profit = BigNumber(0).minus(profit);
                }

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
                profit = await new BigNumber(profit).minus(txCost);
                console.log(`txn cost: ${txCost}`);

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
    /*

    // console.log(`GasLimit: ${block.gasLimit} and Timestamp: ${block.timestamp}`);

    // console.log(`Trading ${toToken}/${fromToken} ...`);

    const pairAddress = await pancakeFactory.methods.getPair(fromToken, toToken).call();
    console.log(`pairAddress ${toToken}/${fromToken} is ${pairAddress}`);
    const unit0 = await new BigNumber(amount);
    const amount0 = await new BigNumber(unit0).shiftedBy(fromTokenDecimals[i]);
    console.log(`Input amount of ${fromToken}: ${amount0.toString()}`);

    // The quote currency needs to be WBNB
    let tokenIn, tokenOut;
    if (fromToken === WBNB) {
        tokenIn = fromToken;
        tokenOut = toToken;
    }

    if (toToken === WBNB) {
        tokenIn = toToken;
        tokenOut = fromToken;
    }

    // The quote currency is not WBNB
    if (typeof tokenIn === 'undefined') {
        return;
    }

    // call getAmountsOut in PancakeSwap
    const amounts = await pancakeRouter.methods.getAmountsOut(amount0, [tokenIn, tokenOut]).call();
    const unit1 = await new BigNumber(amounts[1]).shiftedBy(-toTokenDecimals[j]);
    const amount1 = await new BigNumber(amounts[1]);
    console.log(`
        Buying token at PancakeSwap DEX
        =================
        tokenIn: ${unit0.toString()} ${tokenIn}
        tokenOut: ${unit1.toString()} ${tokenOut}
    `);

    // call getAmountsOut in BakerySwap
    const amounts2 = await bakeryRouter.methods.getAmountsOut(amount1, [tokenOut, tokenIn]).call();
    const unit2 = await new BigNumber(amounts2[1]).shiftedBy(-fromTokenDecimals[i]);
    const amount2 = await new BigNumber(amounts2[1]);
    console.log(`
        Buying back token at BakerySwap DEX
        =================
        tokenOut: ${unit1.toString()} ${tokenOut}
        tokenIn: ${unit2.toString()} ${tokenIn}
    `);

    let profit = await new BigNumber(amount2).minus(amount0);
    console.log(`Profit: ${profit.toString()}`);

    if (profit > 0) {
        const tx = flashswap.methods.startArbitrage(
            tokenIn,
            tokenOut,
            0,
            amount1
        );

        const [gasPrice, gasCost] = await Promise.all([
            web3.eth.getGasPrice(),
            tx.estimateGas({from: admin}),
        ]);

        const txCost = web3.utils.toBN(gasCost) * web3.utils.toBN(gasPrice);
        profit = await new BigNumber(profit).minus(txCost);

        if (profit > 0) {
            console.log(`
                Block # ${block.number}: Arbitrage opportunity found!
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
        }
    } else {
        console.log(`
            Block # ${block.number}: Arbitrage opportunity not found!
            Expected profit: ${profit}
        `);
    }
    */
}

init();
