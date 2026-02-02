# Lumenswags Escrow - Demo Guide

A step-by-step guide to test the escrow flow using the web UI.

## Prerequisites

1. **Freighter Wallet** - Install from [freighter.app](https://www.freighter.app/)
2. **Testnet Account** - Create and fund via [Stellar Laboratory](https://laboratory.stellar.org/#account-creator?network=test)
3. **Node.js** - For running the dev server

## Quick Start

```bash
cd web
npm install
npm run dev
```

Open http://localhost:5500

## Latest Deployed Contract

```
CAKIIMRZ57JQFOXAZENGUOPFF4UXN2EPYJZUP43PGU5DGUN4SSK2NQ3M
```

## Complete Demo Flow (5 Steps)

### Step A: Generate Demo Seller
1. Click **"Generate & Fund Seller"**
2. Wait for Friendbot to fund the account
3. Seller address auto-fills in the form

### Step B: Create Escrow
1. Seller address is already filled from Step A
2. Enter amount (default: 1000 stroops)
3. Click **"Create Escrow"**
4. Confirm in Freighter

### Step C: Approve & Fund
1. Click **"Approve Tokens"** → Confirm in Freighter
2. Click **"Fund Escrow"** → Confirm in Freighter
3. State changes to "Funded"

### Step D: Mark Shipped (Demo Seller)
1. Enter tracking number (default: TRACK123)
2. Click **"Ship as Demo Seller"**
3. State changes to "Shipped"

### Step E: Confirm Delivery
1. Click **"Confirm Delivery"** → Confirm in Freighter
2. State changes to "Released"
3. Funds transferred to seller!

## Escrow States

| State | Value | Description |
|-------|-------|-------------|
| Created | 0 | Escrow created, awaiting funding |
| Funded | 1 | Buyer locked funds |
| Shipped | 2 | Seller marked as shipped |
| Released | 3 | Buyer confirmed, funds released |

## Deploy Your Own Contract

### 1. Build the contract
```bash
cd contracts/lumenswags
cargo build --release --target wasm32v1-none
```

### 2. Deploy to testnet
```bash
# Add your key first (one-time)
stellar keys generate mykey --network testnet

# Deploy
stellar contract deploy \
  --wasm target/wasm32v1-none/release/lumenswags.wasm \
  --source mykey \
  --network testnet
```

### 3. Use the new contract ID in the UI

## Troubleshooting

### "Sequence error"
- Wait 5 seconds and retry
- The UI auto-retries up to 3 times

### "Demo seller doesn't match escrow"
- You need to create a NEW escrow with the demo seller
- Generate seller → Create escrow → then proceed

### "Not enough allowance"
- Click "Approve Tokens" before "Fund Escrow"

### Freighter not detected
- Make sure extension is installed and enabled
- Refresh the page

## Token Contract (Testnet XLM)

The UI uses the wrapped native XLM token on testnet:
```
CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC
```

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Freighter     │────▶│    Web UI       │────▶│  Soroban RPC    │
│   (Buyer)       │     │   (Vite)        │     │  (Testnet)      │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                               │                        │
┌─────────────────┐            │                        ▼
│  Demo Seller    │────────────┘                ┌─────────────────┐
│  (Generated)    │                             │ Escrow Contract │
└─────────────────┘                             └─────────────────┘
```

## Files

- `web/index.html` - UI structure
- `web/app.js` - Application logic
- `web/styles.css` - Styling
- `contracts/lumenswags/src/lib.rs` - Escrow contract
