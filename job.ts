import { createInterface } from "node:readline/promises";
import { setTimeout as delay } from "node:timers/promises";
import { stdin as input, stdout as output } from "node:process";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import {
  createPublicClient,
  decodeEventLog,
  formatUnits,
  http,
  keccak256,
  parseUnits,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { arcTestnet } from "viem/chains";

// To bootstrap provider wallet during setup (see Step 3)
const PROVIDER_STARTER_BALANCE = "1";

const AGENTIC_COMMERCE_CONTRACT =
  "0x0747EEf0706327138c69792bF28Cd525089e4583" as Address;
const JOB_BUDGET = parseUnits("5", 6); // 5 USDC (ERC-20, 6 decimals)

const circleClient = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY!,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
});

const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(),
});

const agenticCommerceAbi = [
  {
    type: "function",
    name: "createJob",
    stateMutability: "nonpayable",
    inputs: [
      { name: "provider", type: "address" },
      { name: "evaluator", type: "address" },
      { name: "expiredAt", type: "uint256" },
      { name: "description", type: "string" },
      { name: "hook", type: "address" },
    ],
    outputs: [{ name: "jobId", type: "uint256" }],
  },
  {
    type: "function",
    name: "setBudget",
    stateMutability: "nonpayable",
    inputs: [
      { name: "jobId", type: "uint256" },
      { name: "amount", type: "uint256" },
      { name: "optParams", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "fund",
    stateMutability: "nonpayable",
    inputs: [
      { name: "jobId", type: "uint256" },
      { name: "optParams", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "submit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "jobId", type: "uint256" },
      { name: "deliverable", type: "bytes32" },
      { name: "optParams", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "complete",
    stateMutability: "nonpayable",
    inputs: [
      { name: "jobId", type: "uint256" },
      { name: "reason", type: "bytes32" },
      { name: "optParams", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "getJob",
    stateMutability: "view",
    inputs: [{ name: "jobId", type: "uint256" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "id", type: "uint256" },
          { name: "client", type: "address" },
          { name: "provider", type: "address" },
          { name: "evaluator", type: "address" },
          { name: "description", type: "string" },
          { name: "budget", type: "uint256" },
          { name: "expiredAt", type: "uint256" },
          { name: "status", type: "uint8" },
          { name: "hook", type: "address" },
        ],
      },
    ],
  },
  {
    type: "event",
    name: "JobCreated",
    inputs: [
      { indexed: true, name: "jobId", type: "uint256" },
      { indexed: true, name: "client", type: "address" },
      { indexed: true, name: "provider", type: "address" },
      { indexed: false, name: "evaluator", type: "address" },
      { indexed: false, name: "expiredAt", type: "uint256" },
      { indexed: false, name: "hook", type: "address" },
    ],
    anonymous: false,
  },
] as const;

const STATUS_NAMES = [
  "Open",
  "Funded",
  "Submitted",
  "Completed",
  "Rejected",
  "Expired",
];

function extractJobId(txHash: Hex) {
  return publicClient
    .getTransactionReceipt({ hash: txHash })
    .then((receipt) => {
      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({
            abi: agenticCommerceAbi,
            data: log.data,
            topics: log.topics,
          });
          if (decoded.eventName === "JobCreated") {
            return decoded.args.jobId;
          }
        } catch {
          continue;
        }
      }
      throw new Error("Could not parse JobCreated event");
    });
}

async function waitForTransaction(txId: string, label: string) {
  process.stdout.write(`  Waiting for ${label}`);
  for (let i = 0; i < 60; i++) {
    await delay(2000);
    const tx = await circleClient.getTransaction({ id: txId });
    const data = tx.data?.transaction;

    if (data?.state === "COMPLETE" && data.txHash) {
      const txHash = data.txHash;
      console.log(
        ` ✓\n  Tx: ${arcTestnet.blockExplorers.default.url}/tx/${txHash}`,
      );
      return txHash as Hex;
    }
    if (data?.state === "FAILED") {
      throw new Error(`${label} failed onchain`);
    }
    process.stdout.write(".");
  }
  throw new Error(`${label} timed out`);
}

async function printBalances(
  title: string,
  wallets: Array<{ label: string; id?: string; address?: string | null }>,
) {
  console.log(`\n${title}:`);

  for (const wallet of wallets) {
    const balances = await circleClient.getWalletTokenBalance({
      id: wallet.id!,
    });
    const usdc = balances.data?.tokenBalances?.find(
      (b) => b.token?.symbol === "USDC",
    );
    console.log(`  ${wallet.label}: ${wallet.address}`);
    console.log(`    USDC: ${usdc?.amount ?? "0"}`);
  }
}

async function main() {
  console.log("── Step 1: Create wallets ──");

  const walletSet = await circleClient.createWalletSet({
    name: "ERC8183 Job Wallets",
  });

  const walletsResponse = await circleClient.createWallets({
    blockchains: ["ARC-TESTNET"],
    count: 2,
    walletSetId: walletSet.data?.walletSet?.id ?? "",
    accountType: "SCA",
  });

  const clientWallet = walletsResponse.data?.wallets?.[0]!;
  const providerWallet = walletsResponse.data?.wallets?.[1]!;

  console.log("\n── Step 2: Fund the client wallet ──");
  console.log("  Fund this wallet with Arc Testnet USDC:");
  console.log(`  Client: ${clientWallet.address}`);
  console.log(`  Wallet ID: ${clientWallet.id}`);
  console.log("  Public faucet:  https://faucet.circle.com");
  console.log("  Console faucet: https://console.circle.com/faucet");
  console.log("\n  This script will fund the provider wallet automatically.");

  const rl = createInterface({ input, output });
  await rl.question("\nPress Enter after the client wallet is funded... ");
  rl.close();

  console.log("\n── Step 3: Transfer starter USDC to provider ──");
  const transferTx = await circleClient.createTransaction({
    walletAddress: clientWallet.address!,
    blockchain: "ARC-TESTNET",
    tokenAddress: "0x3600000000000000000000000000000000000000",
    destinationAddress: providerWallet.address!,
    amount: [PROVIDER_STARTER_BALANCE],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });
  await waitForTransaction(
    transferTx.data?.id!,
    "transfer starter USDC to provider",
  );

  console.log("\n── Step 4: Check balances ──");
  await printBalances("Balances", [
    { label: "Client", ...clientWallet },
    { label: "Provider", ...providerWallet },
  ]);

  const now = await publicClient.getBlock();
  const expiredAt = now.timestamp + 3600n;

  console.log("\n── Step 5: Create job - createJob() ──");
  const createJobTx = await circleClient.createContractExecutionTransaction({
    walletAddress: clientWallet.address!,
    blockchain: "ARC-TESTNET",
    contractAddress: AGENTIC_COMMERCE_CONTRACT,
    abiFunctionSignature: "createJob(address,address,uint256,string,address)",
    abiParameters: [
      providerWallet.address!,
      clientWallet.address!,
      expiredAt.toString(),
      "ERC-8183 demo job on Arc Testnet",
      "0x0000000000000000000000000000000000000000",
    ],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });
  const createJobTxHash = await waitForTransaction(
    createJobTx.data?.id!,
    "create job",
  );
  const jobId = await extractJobId(createJobTxHash);
  console.log(`  Job ID: ${jobId}`);

  console.log("\n── Step 6: Set budget - setBudget() ──");
  const setBudgetTx = await circleClient.createContractExecutionTransaction({
    walletAddress: providerWallet.address!,
    blockchain: "ARC-TESTNET",
    contractAddress: AGENTIC_COMMERCE_CONTRACT,
    abiFunctionSignature: "setBudget(uint256,uint256,bytes)",
    abiParameters: [jobId.toString(), JOB_BUDGET.toString(), "0x"],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });
  await waitForTransaction(setBudgetTx.data?.id!, "set budget");

  console.log("\n── Step 7: Approve USDC - approve() ──");
  const approveTx = await circleClient.createContractExecutionTransaction({
    walletAddress: clientWallet.address!,
    blockchain: "ARC-TESTNET",
    contractAddress: "0x3600000000000000000000000000000000000000",
    abiFunctionSignature: "approve(address,uint256)",
    abiParameters: [AGENTIC_COMMERCE_CONTRACT, JOB_BUDGET.toString()],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });
  await waitForTransaction(approveTx.data?.id!, "approve USDC");

  console.log("\n── Step 8: Fund escrow - fund() ──");
  const fundTx = await circleClient.createContractExecutionTransaction({
    walletAddress: clientWallet.address!,
    blockchain: "ARC-TESTNET",
    contractAddress: AGENTIC_COMMERCE_CONTRACT,
    abiFunctionSignature: "fund(uint256,bytes)",
    abiParameters: [jobId.toString(), "0x"],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });
  await waitForTransaction(fundTx.data?.id!, "fund escrow");

  console.log("\n── Step 9: Submit deliverable - submit() ──");
  const deliverableHash = keccak256(toHex("arc-erc8183-demo-deliverable"));
  const submitTx = await circleClient.createContractExecutionTransaction({
    walletAddress: providerWallet.address!,
    blockchain: "ARC-TESTNET",
    contractAddress: AGENTIC_COMMERCE_CONTRACT,
    abiFunctionSignature: "submit(uint256,bytes32,bytes)",
    abiParameters: [jobId.toString(), deliverableHash, "0x"],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });
  await waitForTransaction(submitTx.data?.id!, "submit deliverable");

  console.log("\n── Step 10: Complete job - complete() ──");
  const reasonHash = keccak256(toHex("deliverable-approved"));
  const completeTx = await circleClient.createContractExecutionTransaction({
    walletAddress: clientWallet.address!,
    blockchain: "ARC-TESTNET",
    contractAddress: AGENTIC_COMMERCE_CONTRACT,
    abiFunctionSignature: "complete(uint256,bytes32,bytes)",
    abiParameters: [jobId.toString(), reasonHash, "0x"],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });
  await waitForTransaction(completeTx.data?.id!, "complete job");

  console.log("\n── Step 11: Check final job state ──");
  const job = await publicClient.readContract({
    address: AGENTIC_COMMERCE_CONTRACT,
    abi: agenticCommerceAbi,
    functionName: "getJob",
    args: [jobId],
  });
  console.log(`  Job ID: ${jobId}`);
  console.log(`  Status: ${STATUS_NAMES[Number(job.status)]}`);
  console.log(`  Budget: ${formatUnits(job.budget, 6)} USDC`);
  console.log(`  Hook: ${job.hook}`);
  console.log(`  Deliverable hash submitted: ${deliverableHash}`);

  console.log("\n── Step 12: Check final balances ──");
  await printBalances("Balances", [
    { label: "Client", ...clientWallet },
    { label: "Provider", ...providerWallet },
  ]);
}

main().catch((error) => {
  console.error("\nError:", error.message || error);
  process.exit(1);
});
