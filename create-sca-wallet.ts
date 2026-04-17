import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";

const client = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY!,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
});

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

console.log(`Client:   ${clientWallet.address} (${clientWallet.id})`);
console.log(`Provider: ${providerWallet.address} (${providerWallet.id})`);
console.log(`Evaluator: ${clientWallet.address} (${clientWallet.id})`);
