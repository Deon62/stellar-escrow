# Lumenswags Escrow Demo Guide

This guide walks you through testing the Lumenswags escrow contract on Stellar testnet.

## Overview

The escrow contract enables secure peer-to-peer transactions:
1. **Buyer** creates an escrow with seller details and payment amount
2. **Buyer** funds the escrow (tokens locked in contract)
3. **Seller** marks the order as shipped with tracking evidence
4. **Buyer** confirms delivery → funds released to seller

## Prerequisites

### 1. Install Freighter Wallet
- Install the [Freighter browser extension](https://www.freighter.app/)
- Create **TWO separate wallets** (or use two browser profiles):
  - **Wallet A** = Buyer
  - **Wallet B** = Seller

### 2. Fund Your Wallets
Each wallet needs testnet XLM. Use the [Stellar Friendbot](https://laboratory.stellar.org/#account-creator?network=test):
1. Copy your wallet's public address (starts with `G...`)
2. Paste into Friendbot and click "Get test network lumens"
3. Repeat for both wallets

### 3. Note Your Addresses
Write down both addresses:
```
BUYER ADDRESS:  G..............(your Wallet A)
SELLER ADDRESS: G..............(your Wallet B)
```

---

## Contract Information

| Item | Value |
|------|-------|
| **New Contract ID** | `CD5UVXKL72326LKWWVNBTRZZIPKGUESEEUE4ARUZMK53IKDSYKJBHOUK` |
| **Testnet XLM Token** | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` |
| **Network** | Stellar Testnet |
| **RPC** | `https://soroban-testnet.stellar.org` |

---

## Step-by-Step Demo

### Step 1: Start the Web UI

```bash
cd web
npm install
npm run dev
```

Open http://localhost:5500 in your browser.

---

### Step 2: Connect Buyer Wallet (Wallet A)

1. Make sure **Wallet A (Buyer)** is active in Freighter
2. Click **"Connect wallet"** on the welcome page
3. Approve the connection in Freighter
4. You'll see your shortened address displayed

---

### Step 3: Load the Contract

1. Paste the contract ID:
   ```
   CD5UVXKL72326LKWWVNBTRZZIPKGUESEEUE4ARUZMK53IKDSYKJBHOUK
   ```
2. Click **"Load escrow"**
3. You should see **State: Not initialized**

---

### Step 4: Create Escrow (Buyer Action)

Fill in the **Create escrow** form:

| Field | Value |
|-------|-------|
| **Seller** | Your **Wallet B** address (G...) |
| **Amount (stroops)** | `10000000` (= 1 XLM) |
| **Token** | Already filled with testnet XLM |

Click **"Create"** and approve in Freighter.

**Expected result:** State changes to **"Created"**

---

### Step 5: Approve Token Spending (Buyer Action)

Before funding, the buyer must approve the escrow contract to spend their tokens.

**Option A: Via Stellar CLI**
```bash
stellar contract invoke \
  --id CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC \
  --source <YOUR_BUYER_KEY_ALIAS> \
  --network testnet-gateway \
  -- approve \
  --from <BUYER_ADDRESS> \
  --spender CD5UVXKL72326LKWWVNBTRZZIPKGUESEEUE4ARUZMK53IKDSYKJBHOUK \
  --amount 100000000 \
  --expiration_ledger 1000000
```

**Option B: Via Stellar Laboratory**
1. Go to https://laboratory.stellar.org/
2. Use Transaction Builder to call `approve` on the XLM token contract

---

### Step 6: Fund Escrow (Buyer Action)

1. Ensure **Wallet A (Buyer)** is connected
2. Click **"Fund escrow"**
3. Approve in Freighter

**Expected result:** State changes to **"Funded"**

---

### Step 7: Mark Shipped (Seller Action)

1. **Switch to Wallet B (Seller)** in Freighter
2. Refresh the page and reconnect
3. Load the same contract ID
4. Enter tracking info in the "Tracking #" field
5. Click **"Mark shipped"**
6. Approve in Freighter

**Expected result:** State changes to **"Shipped"**, Evidence shows tracking

---

### Step 8: Confirm Delivery (Buyer Action)

1. **Switch back to Wallet A (Buyer)** in Freighter
2. Refresh and reconnect
3. Load the contract
4. Click **"Confirm delivery"**
5. Approve in Freighter

**Expected result:** 
- State changes to **"Released"**
- Funds transferred to seller's wallet

---

## Testing via CLI (Alternative)

If browser transactions fail with sequence errors, use the CLI:

### Generate Test Keys
```bash
# Create buyer key
stellar keys generate buyer --network testnet --fund

# Create seller key  
stellar keys generate seller --network testnet --fund

# Get addresses
stellar keys address buyer
stellar keys address seller
```

### Full CLI Flow
```bash
# Set variables
CONTRACT=CD5UVXKL72326LKWWVNBTRZZIPKGUESEEUE4ARUZMK53IKDSYKJBHOUK
TOKEN=CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC
BUYER=$(stellar keys address buyer)
SELLER=$(stellar keys address seller)

# 1. Create escrow
stellar contract invoke --id $CONTRACT --source buyer --network testnet-gateway \
  -- create --buyer $BUYER --seller $SELLER --amount 10000000 --token $TOKEN

# 2. Check state (should be 0 = Created)
stellar contract invoke --id $CONTRACT --source buyer --network testnet-gateway \
  -- get_state

# 3. Approve token spending
stellar contract invoke --id $TOKEN --source buyer --network testnet-gateway \
  -- approve --from $BUYER --spender $CONTRACT --amount 100000000 --expiration_ledger 1000000

# 4. Fund escrow
stellar contract invoke --id $CONTRACT --source buyer --network testnet-gateway \
  -- fund

# 5. Check state (should be 1 = Funded)
stellar contract invoke --id $CONTRACT --source buyer --network testnet-gateway \
  -- get_state

# 6. Mark shipped (seller action)
stellar contract invoke --id $CONTRACT --source seller --network testnet-gateway \
  -- mark_shipped --evidence "TRACK-12345"

# 7. Check state (should be 2 = Shipped)
stellar contract invoke --id $CONTRACT --source buyer --network testnet-gateway \
  -- get_state

# 8. Confirm delivery (buyer action)
stellar contract invoke --id $CONTRACT --source buyer --network testnet-gateway \
  -- confirm_delivery

# 9. Final state (should be 3 = Released)
stellar contract invoke --id $CONTRACT --source buyer --network testnet-gateway \
  -- get_state
```

---

## Escrow States

| Value | Name | Description |
|-------|------|-------------|
| 0 | Created | Escrow created, awaiting funding |
| 1 | Funded | Buyer has locked funds |
| 2 | Shipped | Seller marked as shipped |
| 3 | Released | Buyer confirmed, funds sent to seller |

---

## Troubleshooting

### "Sequence error" / "txBadSeq"
- Wait 5 seconds between transactions
- Don't click buttons multiple times
- Refresh the page to reset state

### "Not enough allowance"
- The buyer must call `approve` on the token contract before funding
- See Step 5 above

### "Missing signing key"
- Make sure the correct wallet is connected
- Only the **buyer** can create/fund/confirm
- Only the **seller** can mark shipped

### Contract shows "[object Object]"
- This is a display bug - values need ScVal conversion
- Use CLI to verify actual state: `stellar contract invoke --id <CONTRACT> -- get_state`

---

## Architecture

```
┌─────────────┐         ┌─────────────────┐         ┌─────────────┐
│   BUYER     │         │  ESCROW CONTRACT │         │   SELLER    │
│  (Wallet A) │         │                 │         │  (Wallet B) │
└──────┬──────┘         └────────┬────────┘         └──────┬──────┘
       │                         │                         │
       │  1. create()            │                         │
       │ ───────────────────────>│                         │
       │                         │                         │
       │  2. approve() on token  │                         │
       │ ─────────────────────>  │                         │
       │                         │                         │
       │  3. fund()              │                         │
       │ ───────────────────────>│  (tokens locked)        │
       │                         │                         │
       │                         │  4. mark_shipped()      │
       │                         │<────────────────────────│
       │                         │                         │
       │  5. confirm_delivery()  │                         │
       │ ───────────────────────>│  (tokens released) ────>│
       │                         │                         │
```

---

## Links

- [Stellar Expert (Testnet)](https://stellar.expert/explorer/testnet)
- [Stellar Laboratory](https://laboratory.stellar.org/)
- [Freighter Wallet](https://www.freighter.app/)
- [Soroban Docs](https://developers.stellar.org/docs/smart-contracts)
