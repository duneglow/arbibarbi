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

const flashswap = new web3.eth.Contract(
    Flashswap.abi,
    //Flashswap.networks[networkId].address
    '0X4C2C14C41400DEE551EF0F45F32508CAB2A129DD'
);

class Token {
    constructor(name, address, decimals, startAmt) {
     this.name = name; this.address = address;
     this.decimals = decimals; this.startAmt = startAmt;
    }
}

class Pair {
    constructor(token0, token1) {
        this.token0 = token0; this.token1 = token1;
    }
    // utility getters
    get address0() {
        return this.token0.address
    }
    get address1() {
        return this.token1.address
    }
    get name0() {
        return this.token0.name
    }
    get name1() {
        return this.token1.name
    }
    get decimals0() {
        return this.token0.decimals
    }
    get decimals1() {
        return this.token1.decimals
    }
    get inverted() {
        return new Pair(this.token1, this.token0);
    }
}


const WBNB = new Token('WBNB', '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', 18, 10);
const BUSD = new Token('BUSD', '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56', 18, 10000);
const USDT = new Token('USDT', '0x55d398326f99059ff775485246999027b3197955', 18, 10000);
const BAKE = new Token('BAKE', '0xE02dF9e3e622DeBdD69fb838bB799E3F168902c5', 18, 1000);
const ETH  = new Token('ETH',  '0x2170ed0880ac9a755fd29b2688956bd959f933f8', 18, 10);

const pairs = [
    new Pair(WBNB, BUSD),
    new Pair(WBNB, USDT),
    new Pair(WBNB, BAKE),
    new Pair(BUSD, BAKE),
    new Pair(USDT, BUSD),
    new Pair(ETH,  WBNB),
]


// different multipliers to the amount of money considered when scanning for arb opportunities
const QTY_MULTIPLIERS = [ 0.1, 1, 10 ];

const init = async () => {
    console.log('initializing');
    const networkId = await web3.eth.net.getId();

    console.log('Getting flashswap contract abi');

    for (const pair of pairs) {

        const amount = pair.token0.startAmt;

        // prova ad arbitrare con diverse quantita' di denaro
        for (multiplier of QTY_MULTIPLIERS) {
            // pair dritta
            await tryPerformingArbitrage(pair, amount * multiplier);
            // pair invertita
            await tryPerformingArbitrage(pair.inverted, amount * multiplier);
        }
        // esegui tutto insieme asincronamente
        // await Promise.all(QTY_MULTIPLIERS.map( (mult) => tryPerformingArbitrage(pair, amount*mult)));

    }
}

async function toWei(number) {
    const n = await new BigNumber(number).shiftedBy(-18);
    return n;
}

async function fromWei(number) {
    const n = await new BigNumber(number).shiftedBy(18);
    return n;
}

function getAmountsOut(router, amount, pair) {
    return router.methods.getAmountsOut(amount, pair).call();
}

// ritorna l'indirizzo della pair sul dex definito da factory
async function getPairAddressFrom(factory, pair) {
    const pairAddress = await factory.methods.getPair(pair.address0, pair.address1).call();
    console.log(`pairAddress ${pair.name1}/${pair.name0} is ${pairAddress}`);
    return pairAddress;
}


async function calculateSwapOn(router, amount, path) {
    const amounts = await getAmountsOut(router, amount, path);
    const value = await new BigNumber(amounts[1]).shiftedBy(-18);
    const wei = await new BigNumber(amounts[1]);
    return [ value, wei ]
}

async function tryPerformingArbitrage(pair, amount) {

    const tokenA = pair.token0;
    const tokenB = pair.token1;
    console.log(`Trading ${tokenB.name}/${tokenA.name} ...`);

    const pairAddress = await getPairAddressFrom(pancakeFactory, pair);


    const unit0 = await new BigNumber(amount);
    let amount0 = await fromWei(amount);
    console.log(`Input amount of ${tokenA.name}: ${unit0.toString()}`);


    tokenIn = tokenA.address;
    tokenInName = tokenA.name;
    tokenOut = tokenB.address;
    tokenOutName = tokenB.name;


    // Calcolo quante banane mi danno con amount0 di $tokenIn su exchangeX
    //    [value, wei]
    const [unit1, amount1] = await calculateSwapOn(
                                            pancakeRouter, amount0, [tokenIn, tokenOut]);
    console.log(`
        Buying ${pair.name0} at PancakeSwap DEX
        =================
        Send: ${unit0.toString()} ${tokenInName}
        Receive: ${unit1.toString()} ${tokenOutName}
    `);

    // Calcolo quanti $tokenIn mi danno con amount1 di banane su exchangeY
    //    [value, wei]
    const [unit2, amount2] = await calculateSwapOn(
                                            bakeryRouter, amount1, [tokenOut, tokenIn]);
    console.log(`
        Selling ${pair.name0} at BakerySwap DEX
        =================
        Send: ${unit1.toString()} ${tokenOutName}
        Receive: ${unit2.toString()} ${tokenInName}
    `);
    let profit = await new BigNumber(amount2).minus(amount0).shiftedBy(-tokenA.decimals);
    console.log(`Profit: ${profit.toString()} ${tokenInName}`);

    if (profit > 0) {
        await startArbitrage(
            tokenA,
            tokenB,
            0,
            amount1
        );
    } else {
        console.log(`
            Arbitrage opportunity not found!
            Expected profit: ${profit} ${pair.name0}
            amount0: ${amount0 / 10**18} ${pair.name0}
            amount1: ${amount1 / 10**18} ${pair.name1}
            amount2: ${amount2 / 10**18} ${pair.name0}
        `);
    }

}

/*
 * startArbitrage
 * args:
 *  - tokenIn  of type Token
 *  - tokenOut of type Token
 *  - amount0 number
 *  - amount1 number
 */
const startArbitrage = async (tokenIn, tokenOut, amount0, amount1, profit) => {

    if (! (amount0 == 0 || amount1 == 0)) {
        throw `Invalid amounts ${amount0} and ${amount1}`
    }

    // costruisci l'oggetto della transazione (per poi decidere se mandarla)
    const tx = flashswap.methods.startArbitrage(
        tokenIn.address,
        tokenOut.address,
        amount0,
        amount1,
    );


    /*
    // Stima dei prezzi del gas che non funziona
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

    // workaround perche' il codice commentato sopra non funziona
    const txCost = BigNumber(0.0055).shiftedBy(18);

    profit = await new BigNumber(profit).minus(txCost);

    // se il profitto al netto dei costi di transazione e' ancora buono,
    // allora manda la transazione
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

}

init();
