# 🛠 Troubleshooting Guide

Encountering issues while running the ERC-8183 demo? Here is a breakdown of common pitfalls and how to resolve them quickly.

## 1. Funds & Gas Issues

| Issue | Potential Cause | Solution |
| :--- | :--- | :--- |
| **`Insufficient funds for gas`** | The Client wallet has 0 or low USDC balance. | On Arc, **USDC is used for Gas**. Use the [Circle Faucet](https://faucet.circle.com) to fund your Client SCA with at least 10-20 USDC. |
| **`Transfer amount exceeds balance`** | You're trying to fund an escrow larger than your balance. | Remember: Total cost = Job Payment + Gas Fees. Always keep a buffer of ~2-5 USDC for gas. |
| **Balance looks wrong** | Confusion between Units and Decimals. | USDC on Arc uses **6 decimals**. `1 USDC` = `1,000,000` base units in your script. |

## 2. Circle API & Authentication

| Issue | Potential Cause | Solution |
| :--- | :--- | :--- |
| **`401 Unauthorized`** | Invalid or expired API Key. | Double-check your `CIRCLE_API_KEY` in `.env`. Ensure it is a **Standard Key**, not a Read-only key. |
| **`Invalid Entity Secret`** | Secret mismatch or formatting error. | Ensure `ENTITY_SECRET` is a valid 32-byte hex string. Re-register it in the Circle Console if you've lost it. |
| **Wallet Stuck in `PENDING`** | Circle API or Network congestion. | Check [Circle Status](https://status.circle.com/). If the network is fine, try creating a fresh wallet with `npm run create-wallet`. |


## 3. ERC-8183 Lifecycle Logic

| Issue | Potential Cause | Solution |
| :--- | :--- | :--- |
| **Job stuck at `OPEN`** | The funding transaction failed. | A job cannot move to `FUNDED` until the escrow transaction is confirmed on-chain. Check the TxHash on the [Arc Explorer](https://explorer.arc.network). |
| **Submission Reverted** | Provider wallet is not registered. | Ensure the wallet executing `submit` is the same one designated as the `Provider` during job creation. |
| **Cannot Release Payment** | State Machine violation. | You cannot complete a job that hasn't been `SUBMITTED`. Ensure the full sequence of script calls is maintained. |


## 4. Environment & Runtime

* **Node.js Version:** This project requires **Node.js ≥ v22**. Check your version with `node -v`. Use `nvm install 22` if needed.
* **Module Not Found:** If you just pulled the latest changes, always run `npm install` to update dependencies.
* **Asynchronous Lag:** Testnets can be slow. If a transaction isn't found immediately, the script might time out. Increase the `polling` interval in your script logic if necessary.


## 🔍 Advanced Debugging

If the error persists:
1.  **Inspect the Explorer:** Copy the Transaction Hash from the console and paste it into the [Arc Testnet Explorer](https://explorer.arc.network). Look for the "Revert Reason".
2.  **Raw API Logs:** Add `console.log(JSON.stringify(error.response.data, null, 2))` in your catch blocks to see the exact error message from Circle's backend.
3.  **Nuclear Option:** Delete your local wallet config (if cached) and generate new SCAs using `npm run create-wallet`.

> **Note:** Testnets are experimental. If everything looks correct but fails, wait a few minutes for the RPC nodes to sync and try again.
