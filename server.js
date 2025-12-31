// ===============================================================================
// APEX SUMMIT PINNACLE v21.0 (ULTIMATE MERGE) - HIGH-FREQUENCY CLUSTER
// ===============================================================================

const cluster = require('cluster');
const os = require('os');
const http = require('http');
const axios = require('axios');
const { ethers, WebSocketProvider, JsonRpcProvider, Wallet, Interface, parseEther, formatEther, Contract } = require('ethers');
require('dotenv').config();

// --- SAFETY: GLOBAL ERROR HANDLERS ---
process.on('uncaughtException', (err) => {
    console.error("\n\x1b[31m[CRITICAL ERROR] Uncaught Exception:\x1b[0m", err.message);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error("\n\x1b[31m[CRITICAL ERROR] Unhandled Rejection:\x1b[0m", reason instanceof Error ? reason.message : reason);
});

// --- DEPENDENCY CHECK ---
let FlashbotsBundleProvider;
let hasFlashbots = false;
try {
    ({ FlashbotsBundleProvider } = require('@flashbots/ethers-provider-bundle'));
    hasFlashbots = true;
} catch (e) {
    if (cluster.isPrimary) console.error("\x1b[33m%s\x1b[0m", "\n⚠️ WARNING: Flashbots dependency missing. Mainnet bundling disabled.");
}

// --- THEME ENGINE ---
const TXT = {
    reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
    green: "\x1b[32m", cyan: "\x1b[36m", yellow: "\x1b[33m", 
    magenta: "\x1b[35m", blue: "\x1b[34m", red: "\x1b[31m",
    gold: "\x1b[38;5;220m", gray: "\x1b[90m"
};

// --- CONFIGURATION ---
const GLOBAL_CONFIG = {
    TARGET_CONTRACT: process.env.TARGET_CONTRACT || "0x83EF5c401fAa5B9674BAfAcFb089b30bAc67C9A0", 
    BENEFICIARY: process.env.BENEFICIARY || "0x4B8251e7c80F910305bb81547e301DcB8A596918",
    
    // STRATEGY SETTINGS
    MIN_WHALE_VALUE: 0.1,                // SUPER SENSITIVE: Visual heartbeat for any move > 0.1 ETH
    SUMMIT_WHALE_THRESHOLD: 15.0,        // SUMMIT Tier trigger (v20.0 Summit)
    GAS_LIMIT: 1200000n,                 // Safety buffer for complex L2 routing
    PORT: process.env.PORT || 8080,
    MIN_NET_PROFIT: "0.01",              // Minimum net profit floor (~$33)
    MIN_PROFIT_BUFFER: "0.005",          // Additional safety buffer in ETH
    PRIORITY_BRIBE: 15n,                 // 15% Tip for block priority

    // 🌍 NETWORKS
    NETWORKS: [
        {
            name: "ETH_MAINNET",
            chainId: 1,
            rpc: process.env.ETH_RPC || "https://eth.llamarpc.com",
            wss: process.env.ETH_WSS || "wss://ethereum-rpc.publicnode.com", 
            type: "FLASHBOTS",
            relay: "https://relay.flashbots.net",
            aavePool: "0x87870Bca3F3f6332F99512Af77db630d00Z638025",
            uniswapRouter: "0xE592427A0AEce92De3Edee1F18E0157C05861564",
            gasOracle: null,
            priceFeed: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
            color: TXT.cyan
        },
        {
            name: "ARBITRUM",
            chainId: 42161,
            rpc: process.env.ARB_RPC || "https://arb1.arbitrum.io/rpc",
            wss: process.env.ARB_WSS || "wss://arb1.arbitrum.io/feed",
            type: "PRIVATE_RELAY",
            privateRpc: "https://arb1.arbitrum.io/rpc",
            aavePool: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
            uniswapRouter: "0xE592427A0AEce92De3Edee1F18E0157C05861564", 
            gasOracle: null,
            priceFeed: "0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612",
            color: TXT.blue
        },
        {
            name: "BASE_MAINNET",
            chainId: 8453,
            rpc: process.env.BASE_RPC || "https://mainnet.base.org",
            wss: process.env.BASE_WSS || "wss://base-rpc.publicnode.com",
            type: "PRIVATE_RELAY",
            privateRpc: "https://base.merkle.io",
            aavePool: "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5",
            uniswapRouter: "0x2626664c2603336E57B271c5C0b26F421741e481", 
            gasOracle: "0x420000000000000000000000000000000000000F",
            priceFeed: "0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70",
            color: TXT.magenta
        }
    ]
};

// --- MASTER PROCESS ---
if (cluster.isPrimary) {
    console.clear();
    console.log(`${TXT.bold}${TXT.gold}╔════════════════════════════════════════════════════════╗${TXT.reset}`);
    console.log(`${TXT.bold}${TXT.gold}║   ⚡ APEX SUMMIT v21.0 | PINNACLE CLUSTER EDITION     ║${TXT.reset}`);
    console.log(`${TXT.bold}${TXT.gold}║   MODE: SUMMIT WHALE HUNTER (15 ETH) + SCALING         ║${TXT.reset}`);
    console.log(`${TXT.bold}${TXT.gold}╚════════════════════════════════════════════════════════╝${TXT.reset}\n`);

    const cpuCount = os.cpus().length;
    console.log(`${TXT.green}[SYSTEM] Spawning ${cpuCount} Quantum Workers...${TXT.reset}`);
    console.log(`${TXT.cyan}[CONFIG] Beneficiary: ${GLOBAL_CONFIG.BENEFICIARY}${TXT.reset}`);
    console.log(`${TXT.magenta}[STRATEGY] Summit Trigger: ${GLOBAL_CONFIG.SUMMIT_WHALE_THRESHOLD} ETH | Active${TXT.reset}\n`);

    for (let i = 0; i < cpuCount; i++) {
        cluster.fork();
    }

    cluster.on('exit', (worker) => {
        console.log(`${TXT.red}⚠️  Worker ${worker.process.pid} offline. Respawning...${TXT.reset}`);
        setTimeout(() => cluster.fork(), 3000);
    });
} 
// --- WORKER PROCESS ---
else {
    const networkIndex = (cluster.worker.id - 1) % GLOBAL_CONFIG.NETWORKS.length;
    const NETWORK = GLOBAL_CONFIG.NETWORKS[networkIndex];
    initWorker(NETWORK).catch(err => console.error(`${TXT.red}[FATAL] ${err.message}${TXT.reset}`));
}

async function initWorker(CHAIN) {
    const TAG = `${CHAIN.color}[${CHAIN.name}]${TXT.reset}`;
    
    // 0. STARTUP JITTER
    await new Promise(r => setTimeout(r, Math.floor(Math.random() * 5000)));

    // 1. HEALTH CHECK SERVER
    try {
        const server = http.createServer((req, res) => {
            if (req.url === '/status') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: "ONLINE", chain: CHAIN.name, worker: cluster.worker.id }));
            } else { res.writeHead(404); res.end(); }
        });
        server.on('error', () => {});
        server.listen(GLOBAL_CONFIG.PORT + cluster.worker.id); 
    } catch (e) {}
    
    // 2. PROVIDERS & CONTRACTS
    let provider, wsProvider, wallet, gasOracle, priceFeed;
    let currentEthPrice = 0;
    let scanCount = 0;

    try {
        const network = ethers.Network.from(CHAIN.chainId);
        provider = new JsonRpcProvider(CHAIN.rpc, network, { staticNetwork: true });
        wsProvider = new WebSocketProvider(CHAIN.wss);
        
        wsProvider.on('error', (error) => {
            if (error && error.message && (error.message.includes("UNEXPECTED_MESSAGE") || error.message.includes("delayedMessagesRead"))) return;
            console.error(`${TXT.yellow}⚠️ [WS ERROR] ${TAG}: ${error.message}${TXT.reset}`);
        });

        if (wsProvider.websocket) {
            wsProvider.websocket.onerror = () => {};
            wsProvider.websocket.onclose = () => process.exit(0);
        }
        
        const pk = process.env.PRIVATE_KEY || "0x0000000000000000000000000000000000000000000000000000000000000001";
        wallet = new Wallet(pk, provider);

        if (CHAIN.gasOracle) {
            gasOracle = new Contract(CHAIN.gasOracle, ["function getL1Fee(bytes memory _data) public view returns (uint256)"], provider);
        }
        if (CHAIN.priceFeed) {
            priceFeed = new Contract(CHAIN.priceFeed, ["function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)"], provider);
            try {
                const [, price] = await priceFeed.latestRoundData();
                currentEthPrice = Number(price) / 1e8;
            } catch(e) {}
            
            setInterval(async () => {
                try {
                    const [, price] = await priceFeed.latestRoundData();
                    currentEthPrice = Number(price) / 1e8;
                } catch (e) {}
            }, 15000);
        }
        
        console.log(`${TXT.green}✅ WORKER ${cluster.worker.id} SYNCED${TXT.reset} on ${TAG}`);
    } catch (e) {
        console.log(`${TXT.red}❌ Connection Failed on ${TAG}: ${e.message}${TXT.reset}`);
        return;
    }

    const poolIface = new Interface([
        "function flashLoanSimple(address receiverAddress, address asset, uint256 amount, bytes calldata params, uint16 referralCode)"
    ]);

    let flashbotsProvider = null;
    if (CHAIN.type === "FLASHBOTS" && hasFlashbots) {
        try {
            const authSigner = new Wallet(wallet.privateKey, provider);
            flashbotsProvider = await FlashbotsBundleProvider.create(provider, authSigner, CHAIN.relay);
        } catch (e) {}
    }

    // 4. SUMMIT SCANNING LOOP
    wsProvider.on("pending", async (txHash) => {
        try {
            scanCount++;
            // High-frequency heartbeat for visual confirmation
            if (scanCount % 20 === 0 && (cluster.worker.id % 10 === 0)) {
               process.stdout.write(`\r${TAG} ${TXT.cyan}⚡ SCANNING${TXT.reset} | Txs: ${scanCount} | ETH: $${currentEthPrice.toFixed(2)} `);
            }

            if (!provider) return;
            const tx = await provider.getTransaction(txHash).catch(() => null);
            if (!tx || !tx.to) return;

            const valueEth = tx.value ? parseFloat(formatEther(tx.value)) : 0;
            
            // Summit Hunter Triggers
            const isSummitWhale = valueEth >= GLOBAL_CONFIG.SUMMIT_WHALE_THRESHOLD;
            const isStandardMove = valueEth >= GLOBAL_CONFIG.MIN_WHALE_VALUE && tx.to.toLowerCase() === CHAIN.uniswapRouter.toLowerCase();
            const isStochasticVolatility = Math.random() > 0.9998;

            if (isSummitWhale || isStandardMove || isStochasticVolatility) {

                if (isSummitWhale) {
                    console.log(`\n${TAG} ${TXT.red}${TXT.bold}🚨 SUMMIT WHALE: ${valueEth.toFixed(2)} ETH | ${txHash.substring(0, 12)}...${TXT.reset}`);
                } else {
                    console.log(`\n${TAG} ${TXT.magenta}🌊 OPPORTUNITY PROBE: ${txHash.substring(0, 10)}...${TXT.reset}`);
                }

                // 5. DYNAMIC LEVERAGE CALCULATION
                const balanceWei = await provider.getBalance(wallet.address);
                const balanceEth = parseFloat(formatEther(balanceWei));
                const usdWealth = balanceEth * currentEthPrice; 

                let loanAmount = parseEther("10"); 
                if (usdWealth >= 200) loanAmount = parseEther("100");
                else if (usdWealth >= 100) loanAmount = parseEther("75");
                else if (usdWealth >= 50)  loanAmount = parseEther("25");

                console.log(`   ${TXT.dim}⚖️ Scaling Loan Strike to: ${formatEther(loanAmount)} ETH${TXT.reset}`);

                const wethAddress = CHAIN.chainId === 8453 
                    ? "0x4200000000000000000000000000000000000006" 
                    : "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"; 

                const tradeData = poolIface.encodeFunctionData("flashLoanSimple", [
                    GLOBAL_CONFIG.TARGET_CONTRACT,
                    wethAddress, 
                    loanAmount,
                    "0x", 
                    0
                ]);

                // 6. TRIPLE-CHECK SIMULATION
                const [simulation, l1Fee, feeData] = await Promise.all([
                    provider.call({ to: CHAIN.aavePool, data: tradeData, from: wallet.address, gasLimit: GLOBAL_CONFIG.GAS_LIMIT }).catch(() => null),
                    gasOracle ? gasOracle.getL1Fee(tradeData) : 0n,
                    provider.getFeeData()
                ]);

                if (!simulation) {
                    console.log(`   ${TXT.dim}❌ Simulation Reverted (No Potential Profit)${TXT.reset}`);
                    return;
                }

                // Profit Validation (Summit logic: Net Profit Floor + Safety Buffer)
                const aaveFee = (loanAmount * 5n) / 10000n; // 0.05%
                const l2Cost = GLOBAL_CONFIG.GAS_LIMIT * feeData.maxFeePerGas;
                const minProfitWei = parseEther(GLOBAL_CONFIG.MIN_NET_PROFIT);
                const safetyBufferWei = parseEther(GLOBAL_CONFIG.MIN_PROFIT_BUFFER);
                
                const totalCostThreshold = l2Cost + l1Fee + aaveFee + minProfitWei + safetyBufferWei;
                const rawProfitFromSim = BigInt(simulation);

                if (rawProfitFromSim > totalCostThreshold) {
                    const cleanProfitEth = rawProfitFromSim - (l2Cost + l1Fee + aaveFee);
                    const profitUSD = parseFloat(formatEther(cleanProfitEth)) * currentEthPrice;

                    console.log(`${TXT.green}${TXT.bold}💎 SUMMIT STRIKE AUTHORIZED${TXT.reset}`);
                    console.log(`${TXT.gold}💰 Estimated Net: ${formatEther(cleanProfitEth)} ETH (~$${profitUSD.toFixed(2)})${TXT.reset}`);

                    let priorityBribe = parseEther("2", "gwei");
                    if (feeData.maxPriorityFeePerGas) {
                        priorityBribe = (feeData.maxPriorityFeePerGas * (100n + GLOBAL_CONFIG.PRIORITY_BRIBE)) / 100n;
                    }

                    const txPayload = {
                        to: CHAIN.aavePool,
                        data: tradeData,
                        type: 2,
                        chainId: CHAIN.chainId,
                        maxFeePerGas: feeData.maxFeePerGas,
                        maxPriorityFeePerGas: priorityBribe,
                        gasLimit: GLOBAL_CONFIG.GAS_LIMIT,
                        nonce: await provider.getTransactionCount(wallet.address),
                        value: 0n
                    };

                    const signedTx = await wallet.signTransaction(txPayload);

                    if (CHAIN.type === "FLASHBOTS" && flashbotsProvider) {
                        const bundle = [{ signedTransaction: signedTx }];
                        const targetBlock = (await provider.getBlockNumber()) + 1;
                        await flashbotsProvider.sendBundle(bundle, targetBlock);
                        console.log(`   ${TXT.green}🎉 Summit Bundle Dispatched (Mainnet Darkpool)${TXT.reset}`);
                    } else {
                        try {
                            const relayResponse = await axios.post(CHAIN.privateRpc || CHAIN.rpc, {
                                jsonrpc: "2.0", id: 1, method: "eth_sendRawTransaction", params: [signedTx]
                            }, { timeout: 2000 }).catch(() => null);

                            if (relayResponse && relayResponse.data && relayResponse.data.result) {
                                console.log(`   ${TXT.green}🎉 Relay Success: ${relayResponse.data.result}${TXT.reset}`);
                            } else {
                                await wallet.sendTransaction(txPayload).catch(() => {});
                            }
                        } catch (e) {}
                    }
                }
            }
        } catch (err) {}
    });
}
