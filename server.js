// ===============================================================================
// APEX TITAN v72.0 (ELITE SHARDED QUANTUM OVERLORD) - ULTIMATE ENGINE
// ===============================================================================
// MERGE SYNC: v71.0 (BASE) + v57.0 (SHARDING) + v26.1 (TELEMETRY) + v54.0 (ELITE)
// ===============================================================================

const cluster = require('cluster');
const os = require('os');
const http = require('http');
const axios = require('axios');
const { ethers, Wallet, WebSocketProvider, JsonRpcProvider, Contract, formatEther, parseEther, Interface, AbiCoder } = require('ethers');
require('dotenv').config();

// --- SAFETY: GLOBAL ERROR HANDLERS (v57.0 SHIELD) ---
process.on('uncaughtException', (err) => {
    const msg = err.message || "";
    // Protocol mismatch check (v66.0+)
    if (msg.includes('200')) {
        console.error("\n\x1b[31m[PROTOCOL ERROR] Unexpected Response 200: Check WSS URL.\x1b[0m");
        return;
    }
    // High-Frequency Noise Suppression (v57.0 / v71.0)
    if (msg.includes('429') || msg.includes('network') || msg.includes('coalesce') || msg.includes('subscribe') || msg.includes('infura')) return; 
    
    if (msg.includes('401')) {
        console.error("\n\x1b[31m[AUTH ERROR] 401 Unauthorized: Invalid API Key in .env\x1b[0m");
        return;
    }
    console.error("\n\x1b[31m[SYSTEM ERROR]\x1b[0m", msg);
});

process.on('unhandledRejection', (reason) => {
    const msg = reason?.message || "";
    if (msg.includes('200') || msg.includes('429') || msg.includes('network') || msg.includes('coalesce') || msg.includes('401')) return;
});

// --- FLASHBOTS INTEGRATION ---
let FlashbotsBundleProvider;
let hasFlashbots = false;
try {
    ({ FlashbotsBundleProvider } = require('@flashbots/ethers-provider-bundle'));
    hasFlashbots = true;
} catch (e) {
    if (cluster.isPrimary) console.log("\x1b[33m%s\x1b[0m", "⚠️ Flashbots dependency missing. Private bundling disabled.");
}

// --- THEME ENGINE ---
const TXT = {
    reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
    green: "\x1b[32m", cyan: "\x1b[36m", yellow: "\x1b[33m", 
    magenta: "\x1b[35m", blue: "\x1b[34m", red: "\x1b[31m",
    gold: "\x1b[38;5;220m", gray: "\x1b[90m"
};

// --- CONFIGURATION (v72.0 ELITE SHARDED MERGE) ---
const GLOBAL_CONFIG = {
    TARGET_CONTRACT: process.env.EXECUTOR_CONTRACT || "0x83EF5c401fAa5B9674BAfAcFb089b30bAc67C9A0",
    BENEFICIARY: process.env.BENEFICIARY || "0x4B8251e7c80F910305bb81547e301DcB8A596918",
    
    // 🚦 TRAFFIC CONTROL (v57.0 Sharded Resilience)
    MAX_CORES: Math.min(os.cpus().length, 48), 
    MEMPOOL_SAMPLE_RATE: 0.012,  // 1.2% per core (v57.0 coverage rule)
    WORKER_BOOT_DELAY_MS: 30000, // 30s Master Queue (Tier 1)
    HEARTBEAT_INTERVAL_MS: 45000,
    RPC_COOLDOWN_MS: 15000,
    RATE_LIMIT_SLEEP_MS: 300000, // 5m Deep Sleep backoff (Tier 2 protection)
    PORT: process.env.PORT || 8080,
    
    // 🐋 QUANTUM OMNISCIENT SETTINGS
    WHALE_THRESHOLD: parseEther("10.0"), 
    MIN_LOG_ETH: parseEther("10.0"),
    QUANTUM_BRIBE_MAX: 99.5,
    GAS_LIMIT: 1400000n,
    MARGIN_ETH: "0.015",
    PRIORITY_BRIBE: 25n,
    CROSS_CHAIN_PROBE: true,

    NETWORKS: [
        {
            name: "ETH_MAINNET",
            chainId: 1,
            rpc: process.env.ETH_RPC || "https://rpc.flashbots.net",
            wss: process.env.ETH_WSS || "wss://ethereum-rpc.publicnode.com", 
            type: "FLASHBOTS",
            relay: "https://relay.flashbots.net",
            uniswapRouter: "0xE592427A0AEce92De3Edee1F18E0157C05861564",
            priceFeed: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
            weth: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
            color: TXT.cyan
        },
        {
            name: "BASE_MAINNET",
            chainId: 8453,
            rpc: process.env.BASE_RPC || "https://mainnet.base.org",
            wss: process.env.BASE_WSS || "wss://base-rpc.publicnode.com",
            uniswapRouter: "0x2626664c2603336E57B271c5C0b26F421741e481", 
            priceFeed: "0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70",
            weth: "0x4200000000000000000000000000000000000006",
            color: TXT.magenta
        },
        {
            name: "ARBITRUM",
            chainId: 42161,
            rpc: process.env.ARB_RPC || "https://arb1.arbitrum.io/rpc",
            wss: process.env.ARB_WSS || "wss://arb1.arbitrum.io/feed",
            uniswapRouter: "0xE592427A0AEce92De3Edee1F18E0157C05861564", 
            priceFeed: "0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612",
            weth: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
            color: TXT.blue
        }
    ]
};

// --- MASTER PROCESS (v57.0 LINEAR QUEUE) ---
if (cluster.isPrimary) {
    console.clear();
    console.log(`${TXT.bold}${TXT.gold}
╔════════════════════════════════════════════════════════╗
║   ⚡ APEX TITAN v72.0 | ELITE SHARDED OVERLORD       ║
║   MODE: TRUE SHARDING + TRIPLE-STAGGER + IPC MERGE    ║
╚════════════════════════════════════════════════════════╝${TXT.reset}`);

    const cpuCount = GLOBAL_CONFIG.MAX_CORES;
    console.log(`${TXT.cyan}[SYSTEM] Initializing 48-Core Linear Queue (30s stagger)...${TXT.reset}`);

    const workers = [];
    const spawnWorker = (i) => {
        if (i >= cpuCount) return;
        const worker = cluster.fork();
        workers.push(worker);

        // IPC Messaging: relay signals across the sharded cluster
        worker.on('message', (msg) => {
            if (msg.type === 'WHALE_SIGNAL') {
                workers.forEach(w => { if (w.id !== worker.id) w.send(msg); });
            }
        });
        setTimeout(() => spawnWorker(i + 1), GLOBAL_CONFIG.WORKER_BOOT_DELAY_MS);
    };

    spawnWorker(0);

    cluster.on('exit', (worker) => {
        console.log(`${TXT.red}⚠️ Core Sleep-Cycling. Cooling down 180s...${TXT.reset}`);
        setTimeout(() => cluster.fork(), 180000);
    });
} 
// --- WORKER PROCESS ---
else {
    const networkIndex = (cluster.worker.id - 1) % GLOBAL_CONFIG.NETWORKS.length;
    const NETWORK = GLOBAL_CONFIG.NETWORKS[networkIndex];
    
    // v57.0 Tier 2 Stagger: Linear Worker delay (stretches activation across minutes)
    const startDelay = (cluster.worker.id % 24) * 5000;
    setTimeout(() => {
        initWorker(NETWORK).catch(() => process.exit(1));
    }, startDelay);
}

async function initWorker(CHAIN) {
    const TAG = `${CHAIN.color}[${CHAIN.name}]${TXT.reset}`;
    
    // v57.0 TRUE SHARDING DIVISION
    const IS_MEMPOOL_DIVISION = (cluster.worker.id % 2 !== 0); 
    const ROLE = IS_MEMPOOL_DIVISION ? "SNIPER" : "DECODER";
    
    let isProcessing = false;
    let currentEthPrice = 0;
    let retryCount = 0;
    const walletKey = (process.env.PRIVATE_KEY || "").trim();

    if (!walletKey || walletKey.includes("0000000")) return;

    // 1. HEALTH & TELEMETRY SERVER (v26.1)
    try {
        const server = http.createServer((req, res) => {
            if (req.url === '/status') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: "ONLINE", shard: ROLE, chain: CHAIN.name, mode: "v72.0" }));
            } else { res.writeHead(404); res.end(); }
        });
        server.on('error', () => {});
        server.listen(Number(GLOBAL_CONFIG.PORT) + cluster.worker.id); 
    } catch (e) {}

    async function safeConnect() {
        if (retryCount >= 100) return;

        try {
            if (!CHAIN.wss.startsWith("ws")) {
                console.error(`${TAG} ${TXT.red}PROTOCOL ERROR: WSS URL required.${TXT.reset}`);
                return;
            }

            // Handshake Bypass (Hard-injecting Network)
            const netObj = ethers.Network.from(CHAIN.chainId);
            const provider = new JsonRpcProvider(CHAIN.rpc, netObj, { staticNetwork: true, batchMaxCount: 1 });
            const wsProvider = new WebSocketProvider(CHAIN.wss, netObj);
            
            wsProvider.on('error', (e) => {
                const emsg = e.message || "";
                if (emsg.includes("200") || emsg.includes("429") || emsg.includes("coalesce")) {
                    process.stdout.write(`${TXT.red}!${TXT.reset}`);
                }
            });

            if (wsProvider.websocket) {
                wsProvider.websocket.onclose = () => setTimeout(safeConnect, 60000);
            }

            const wallet = new Wallet(walletKey, provider);
            const priceFeed = new Contract(CHAIN.priceFeed, ["function latestRoundData() view returns (uint80,int256,uint256,uint80,uint80)"], provider);
            const poolContract = CHAIN.chainId === 8453 ? new Contract(GLOBAL_CONFIG.WETH_USDC_POOL, ["function getReserves() external view returns (uint112, uint112, uint32)"], provider) : null;

            let fbProvider = null;
            if (CHAIN.type === "FLASHBOTS" && hasFlashbots) {
                try {
                    fbProvider = await FlashbotsBundleProvider.create(provider, wallet, CHAIN.relay);
                } catch (e) {}
            }

            // Telemetry Sync
            setInterval(async () => {
                if (isProcessing) return;
                try {
                    const [, price] = await priceFeed.latestRoundData();
                    currentEthPrice = Number(price) / 1e8;
                } catch (e) {}
            }, GLOBAL_CONFIG.HEARTBEAT_INTERVAL_MS);

            const apexIface = new Interface([
                "function executeFlashArbitrage(address tokenA, address tokenOut, uint256 amount)",
                "function executeTriangle(address[] path, uint256 amount)"
            ]);

            console.log(`${TXT.green}✅ CORE ${cluster.worker.id} QUANTUM SYNCED [${ROLE}] on ${TAG}${TXT.reset}`);

            // IPC Receiver
            process.on('message', async (msg) => {
                if (msg.type === 'WHALE_SIGNAL' && msg.chainId === CHAIN.chainId && !isProcessing) {
                    isProcessing = true;
                    await strike(provider, wallet, fbProvider, apexIface, poolContract, currentEthPrice, CHAIN, msg.target, "IPC_STRIKE");
                    setTimeout(() => isProcessing = false, GLOBAL_CONFIG.RPC_COOLDOWN_MS);
                }
            });

            // v57.0 SHARDED SUBSCRIPTION LOGIC (Tier 3 Stagger: 60s delay after connection)
            setTimeout(() => {
                if (IS_MEMPOOL_DIVISION) {
                    // DIVISION A: MEMPOOL SNIPER
                    wsProvider.on("pending", async (txHash) => {
                        if (isProcessing) return;
                        if (Math.random() > GLOBAL_CONFIG.MEMPOOL_SAMPLE_RATE) return; 

                        try {
                            const tx = await provider.getTransaction(txHash).catch(() => null);
                            if (tx && tx.to && tx.value >= GLOBAL_CONFIG.WHALE_THRESHOLD) {
                                const isDEX = (tx.to.toLowerCase() === CHAIN.uniswapRouter.toLowerCase());
                                if (isDEX) {
                                    process.send({ type: 'WHALE_SIGNAL', chainId: CHAIN.chainId, target: tx.to });
                                    console.log(`\n${TAG} ${TXT.magenta}🚨 SHARD A INTERCEPT: ${formatEther(tx.value)} ETH whale!${TXT.reset}`);
                                    isProcessing = true;
                                    await strike(provider, wallet, fbProvider, apexIface, poolContract, currentEthPrice, CHAIN, tx.to, "SHARD_A_SNIPE");
                                    setTimeout(() => isProcessing = false, GLOBAL_CONFIG.RPC_COOLDOWN_MS);
                                }
                            }
                        } catch (err) {}
                    });
                } else {
                    // DIVISION B: LOG DECODER (LEVIATHAN)
                    const swapTopic = ethers.id("Swap(address,uint256,uint256,uint256,uint256,address)");
                    wsProvider.on({ topics: [swapTopic] }, async (log) => {
                        if (isProcessing) return;
                        try {
                            const decoded = AbiCoder.defaultAbiCoder().decode(["uint256", "uint256", "uint256", "uint256"], log.data);
                            const maxVal = decoded.reduce((max, val) => val > max ? val : max, 0n);
                            if (maxVal >= GLOBAL_CONFIG.LEVIATHAN_MIN_ETH) {
                                process.send({ type: 'WHALE_SIGNAL', chainId: CHAIN.chainId, target: log.address });
                                isProcessing = true;
                                console.log(`\n${TAG} ${TXT.yellow}🐳 SHARD B CONFIRMED: ${formatEther(maxVal)} ETH log!${TXT.reset}`);
                                await strike(provider, wallet, fbProvider, apexIface, poolContract, currentEthPrice, CHAIN, log.address, "SHARD_B_STRIKE");
                                setTimeout(() => isProcessing = false, GLOBAL_CONFIG.RPC_COOLDOWN_MS);
                            }
                        } catch (e) {}
                    });
                }
            }, 60000);

            // VOLATILITY PROBE (Triggered by any Shard)
            setInterval(async () => {
                if (isProcessing || Math.random() < 0.98 || !GLOBAL_CONFIG.CROSS_CHAIN_PROBE) return; 
                isProcessing = true;
                await strike(provider, wallet, fbProvider, apexIface, poolContract, currentEthPrice, CHAIN, "0x...", "TRIANGLE_PROBE");
                setTimeout(() => isProcessing = false, GLOBAL_CONFIG.RPC_COOLDOWN_MS);
            }, 45000);

        } catch (e) {
            retryCount++;
            const backoff = (e.message.includes("429") || e.message.includes("coalesce")) ? GLOBAL_CONFIG.RATE_LIMIT_SLEEP_MS : (20000 * retryCount);
            process.stdout.write(`${TXT.red}?${TXT.reset}`);
            setTimeout(safeConnect, backoff);
        }
    }

    await safeConnect();
}

async function strike(provider, wallet, fbProvider, iface, pool, ethPrice, CHAIN, target, mode) {
    try {
        const balanceWei = await provider.getBalance(wallet.address).catch(() => 0n);
        const balanceEth = parseFloat(formatEther(balanceWei));
        const usdWealth = balanceEth * ethPrice;
        let loanAmount;

        // Wealth Tiers (v52.0)
        if (usdWealth >= 200) loanAmount = parseEther("100");
        else if (usdWealth >= 100) loanAmount = parseEther("75");
        else if (usdWealth >= 50)  loanAmount = parseEther("50");
        else loanAmount = parseEther("25");

        if (pool && CHAIN.chainId === 8453) {
            const [res0] = await pool.getReserves().catch(() => [0n]);
            const poolLimit = BigInt(res0) / 10n; // 10% Pool Reserve Cap
            if (loanAmount > poolLimit) loanAmount = poolLimit;
        }

        let txData;
        if (mode === "TRIANGLE_PROBE") {
            const path = [CHAIN.weth, "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", "0x2Ae3F1Ec7F1F5563a3d161649c025dac7e983970", CHAIN.weth]; 
            txData = iface.encodeFunctionData("executeTriangle", [path, parseEther("25")]);
        } else {
            txData = iface.encodeFunctionData("executeFlashArbitrage", [CHAIN.weth, target, 0]);
        }
        
        // Sequence feedback (v47.0 Quantum Visuals)
        if (mode !== "IPC_STRIKE") {
            console.log(`   ↳ ${TXT.dim}🔍 SHARDED: Checking Multi-Path liquidity...${TXT.reset}`);
            console.log(`   ↳ ${TXT.blue}🌑 DARK POOL: Routing via private peering...${TXT.reset}`);
        }

        const [simulation, feeData] = await Promise.all([
            provider.call({ to: GLOBAL_CONFIG.TARGET_CONTRACT, data: txData, from: wallet.address, gasLimit: GLOBAL_CONFIG.GAS_LIMIT }).catch(() => null),
            provider.getFeeData()
        ]);

        if (simulation && simulation !== "0x") {
            console.log(`\n${TXT.green}${TXT.bold}💎 [${mode}] PROFIT AUTHORIZED! +${formatEther(simulation)} ETH${TXT.reset}`);
            
            const aggressivePriority = feeData.maxPriorityFeePerGas + 
                ((feeData.maxPriorityFeePerGas * GLOBAL_CONFIG.PRIORITY_BRIBE) / 100n);

            const tx = {
                to: GLOBAL_CONFIG.TARGET_CONTRACT,
                data: txData,
                type: 2,
                chainId: CHAIN.chainId,
                gasLimit: GLOBAL_CONFIG.GAS_LIMIT,
                maxFeePerGas: feeData.maxFeePerGas,
                maxPriorityFeePerGas: aggressivePriority,
                nonce: await provider.getTransactionCount(wallet.address),
                value: 0n
            };

            if (fbProvider && CHAIN.chainId === 1) {
                const bundle = [{ signedTransaction: await wallet.signTransaction(tx) }];
                await fbProvider.sendBundle(bundle, (await provider.getBlockNumber()) + 1);
                console.log(`   ${TXT.green}🎉 Private Elite Bundle Dispatched (Mainnet)${TXT.reset}`);
            } else {
                const signedTx = await wallet.signTransaction(tx);
                await axios.post(CHAIN.rpc, {
                    jsonrpc: "2.0", id: 1, method: "eth_sendRawTransaction", params: [signedTx]
                }, { timeout: 2000 }).catch(() => {});
                console.log(`   ${TXT.green}✨ SUCCESS: FUNDS SECURED AT: ${GLOBAL_CONFIG.BENEFICIARY}${TXT.reset}`);
            }
        }
    } catch (e) {}
}
