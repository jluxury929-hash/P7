const { ethers, Wallet, WebSocketProvider, JsonRpcProvider, Contract, Interface } = require('ethers');
require('dotenv').config();

// 1. BOOTSTRAP: SYSTEM MAXIMIZATION
console.log("-----------------------------------------");
console.log("🟢 [BOOT] SUMMIT WHALE TITAN INITIALIZING...");

// AUTO-CONVERT WSS TO HTTPS FOR EXECUTION (Premium Stability)
const RAW_WSS = process.env.WSS_URL || "";
const EXECUTION_URL = RAW_WSS.replace("wss://", "https://");

const CONFIG = {
    CHAIN_ID: 8453,
    MY_CONTRACT: "0x83EF5c401fAa5B9674BAfAcFb089b30bAc67C9A0",
    
    // ⚡ DUAL-LANE INFRASTRUCTURE
    WSS_URL: RAW_WSS,          // Listener (Fast)
    RPC_URL: EXECUTION_URL,    // Executor (Reliable)
    
    // 🏦 ASSETS
    WETH: "0x4200000000000000000000000000000000000006",
    USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    
    // 🔮 ORACLES
    GAS_ORACLE: "0x420000000000000000000000000000000000000F", // Base L1 Fee
    CHAINLINK_FEED: "0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70", // ETH Price
    
    // 🐋 WHALE SETTINGS
    WHALE_THRESHOLD: ethers.parseEther("15"), // Trigger on 15 ETH+ moves
    MIN_NET_PROFIT: "0.01", // Target ~$33 minimum take-home
    
    // ⚙️ PERFORMANCE
    GAS_LIMIT: 1100000n, 
    PRIORITY_BRIBE: 15n, // 15% Tip to be FIRST
};

// GLOBAL STATE
let currentEthPrice = 0;
let nextNonce = 0;

async function startSummitTitan() {
    // A. KEY SANITIZER (Safety First)
    let rawKey = process.env.TREASURY_PRIVATE_KEY;
    if (!rawKey) { console.error("❌ FATAL: Private Key missing."); process.exit(1); }
    const cleanKey = rawKey.trim();

    try {
        // B. DUAL-PROVIDER SETUP
        const httpProvider = new JsonRpcProvider(CONFIG.RPC_URL);
        const wsProvider = new WebSocketProvider(CONFIG.WSS_URL);
        const signer = new Wallet(cleanKey, httpProvider); // Signer uses HTTP (Stable)
        
        await wsProvider.ready;
        console.log(`✅ SUMMIT ONLINE | EXECUTOR: ${CONFIG.RPC_URL.substring(0, 25)}...`);

        // C. CONTRACTS
        const titanContract = new Contract(CONFIG.MY_CONTRACT, [
            "function requestTitanLoan(address _token, uint256 _amount, address[] calldata _path)",
            "function getProfitEstimate(address _token, uint256 _amount, address[] calldata _path) external view returns (uint256)"
        ], signer); // Connected to Signer/HTTP

        const oracleContract = new Contract(CONFIG.GAS_ORACLE, ["function getL1Fee(bytes memory _data) public view returns (uint256)"], httpProvider);
        const priceFeed = new Contract(CONFIG.CHAINLINK_FEED, ["function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)"], httpProvider);

        // Sync Nonce
        nextNonce = await httpProvider.getTransactionCount(signer.address);

        // D. LIVE PRICE TRACKER & WHALE SCANNER
        wsProvider.on("block", async (blockNum) => {
            try {
                // 1. Update Price
                const [, price] = await priceFeed.latestRoundData();
                currentEthPrice = Number(price) / 1e8;
                process.stdout.write(`\r🌊 BLOCK: ${blockNum} | ETH: $${currentEthPrice.toFixed(2)} | Scanning... `);

                // 2. FETCH BLOCK (Via HTTP to prevent WSS crash)
                const block = await httpProvider.getBlock(blockNum, true);
                if (!block || !block.transactions) return;

                // 3. WHALE FILTER
                const whaleMove = block.transactions.find(t => t.value >= CONFIG.WHALE_THRESHOLD);

                if (whaleMove) {
                    console.log(`\n🚨 WHALE DETECTED: ${ethers.formatEther(whaleMove.value)} ETH | Hash: ${whaleMove.hash.slice(0, 10)}...`);
                    await executeSummitStrike(httpProvider, signer, titanContract, oracleContract);
                }
            } catch (e) { /* Ignore block fetch errors */ }
        });

        // E. IMMORTALITY PROTOCOL
        wsProvider.websocket.onclose = () => {
            console.warn("\n⚠️ CONNECTION LOST. REBOOTING...");
            process.exit(1); 
        };

    } catch (e) {
        console.error(`\n❌ CRITICAL: ${e.message}`);
        setTimeout(startSummitTitan, 1000);
    }
}

async function executeSummitStrike(provider, signer, titanContract, oracle) {
    try {
        const path = [CONFIG.WETH, CONFIG.USDC];

        // 1. DYNAMIC LOAN (Using Real-Time Chainlink Price)
        const balanceWei = await provider.getBalance(signer.address);
        const balanceEth = parseFloat(ethers.formatEther(balanceWei));
        const usdValue = balanceEth * currentEthPrice; 

        // Scale loan aggressively based on wealth
        let loanAmount = ethers.parseEther("10");
        if (usdValue >= 200) loanAmount = ethers.parseEther("100");
        else if (usdValue >= 100) loanAmount = ethers.parseEther("75");
        else if (usdValue >= 50) loanAmount = ethers.parseEther("25");

        // 2. ENCODE DATA (For L1 Fee Calc)
        // We need the raw data to ask the Oracle how much it costs
        const strikeData = titanContract.interface.encodeFunctionData("requestTitanLoan", [
            CONFIG.WETH, loanAmount, path
        ]);

        // 3. PRE-FLIGHT (Static Call + L1 Fee + Gas Data)
        const [rawProfit, l1Fee, feeData] = await Promise.all([
            titanContract.requestTitanLoan.staticCall(CONFIG.WETH, loanAmount, path).catch(() => 0n),
            oracle.getL1Fee(strikeData),
            provider.getFeeData()
        ]);

        if (rawProfit === 0n) return; // Reverted

        // 4. MAXIMIZED COST CALCULATION
        // Aave V3 Fee: 0.05%
        const aaveFee = (loanAmount * 5n) / 10000n;
        // Priority Bribe: 15%
        const aggressivePriority = (feeData.maxPriorityFeePerGas * (100n + CONFIG.PRIORITY_BRIBE)) / 100n;
        
        const l2Cost = CONFIG.GAS_LIMIT * feeData.maxFeePerGas;
        const totalCost = l2Cost + l1Fee + aaveFee;
        
        const netProfit = BigInt(rawProfit) - totalCost;

        // 5. EXECUTION
        if (netProfit > ethers.parseEther(CONFIG.MIN_NET_PROFIT)) {
            const profitUSD = parseFloat(ethers.formatEther(netProfit)) * currentEthPrice;
            console.log(`💎 PROFIT CONFIRMED: ${ethers.formatEther(netProfit)} ETH (~$${profitUSD.toFixed(2)})`);
            
            const tx = await titanContract.requestTitanLoan(
                CONFIG.WETH, 
                loanAmount, 
                path, 
                {
                    gasLimit: CONFIG.GAS_LIMIT,
                    maxFeePerGas: feeData.maxFeePerGas,
                    maxPriorityFeePerGas: aggressivePriority, // Bribe
                    nonce: nextNonce++
                }
            );
            
            console.log(`🚀 SUMMIT STRIKE: ${tx.hash}`);
            await tx.wait();
        }
    } catch (e) {
        if (e.message.includes("nonce")) nextNonce = await provider.getTransactionCount(signer.address);
    }
}

// EXECUTE
if (require.main === module) {
    startSummitTitan().catch(e => {
        console.error("FATAL ERROR. RESTARTING...");
        setTimeout(startSummitTitan, 1000);
    });
}
