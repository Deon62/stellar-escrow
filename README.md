# Lumenswags - Stellar Escrow Contract

A secure peer-to-peer escrow smart contract built on Stellar/Soroban for merch transactions.

## Features

- **On-chain escrow**: Funds locked in smart contract until delivery confirmed
- **Multi-step flow**: Create → Fund → Ship → Confirm
- **Authorization**: Buyer and seller roles with required signatures
- **Evidence tracking**: Seller provides shipping proof (tracking numbers)

## Project Structure

```
.
├── contracts/
│   └── lumenswags/          # Escrow smart contract (Rust/Soroban)
│       ├── src/
│       │   ├── lib.rs       # Contract implementation
│       │   └── test.rs      # Unit tests
│       └── Cargo.toml
├── web/                      # Frontend UI (Vite + Vanilla JS)
│   ├── index.html
│   ├── styles.css
│   ├── app.js
│   └── package.json
├── DEMO_GUIDE.md            # Step-by-step testing guide
└── README.md
```

## Quick Start

### Prerequisites

- [Rust](https://rustup.rs/) with `wasm32v1-none` target
- [Stellar CLI](https://developers.stellar.org/docs/tools/cli)
- [Node.js](https://nodejs.org/) (for web UI)
- [Freighter Wallet](https://freighter.app/) browser extension

### Build the Contract

```bash
stellar contract build
```

### Deploy to Testnet

```bash
stellar contract deploy \
  --wasm target/wasm32v1-none/release/lumenswags.wasm \
  --source <YOUR_KEY> \
  --network testnet
```

### Run the Web UI

```bash
cd web
npm install
npm run dev
```

Open http://localhost:5500

## Deployed Contracts (Testnet)

| Contract | ID |
|----------|-----|
| **Escrow (Fresh)** | `CD5UVXKL72326LKWWVNBTRZZIPKGUESEEUE4ARUZMK53IKDSYKJBHOUK` |
| **Escrow (Used)** | `CBWV4EMPIO4SEFTH64V2G4JPTUI6TI53G5GPWQCMJETR5NZNFULTRPZE` |
| **Testnet XLM Token** | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` |

## Contract Methods

| Method | Caller | Description |
|--------|--------|-------------|
| `create(buyer, seller, amount, token)` | Buyer | Create a new escrow |
| `fund()` | Buyer | Lock funds in escrow |
| `mark_shipped(evidence)` | Seller | Mark order as shipped |
| `confirm_delivery()` | Buyer | Confirm receipt, release funds |
| `get_state()` | Anyone | Get escrow state (0-3) |
| `get_buyer()` | Anyone | Get buyer address |
| `get_seller()` | Anyone | Get seller address |
| `get_amount()` | Anyone | Get escrow amount |
| `get_evidence()` | Anyone | Get shipping evidence |

## Escrow States

| Value | State | Description |
|-------|-------|-------------|
| 0 | Created | Awaiting funding |
| 1 | Funded | Funds locked |
| 2 | Shipped | Seller shipped |
| 3 | Released | Funds sent to seller |

## Testing

See **[DEMO_GUIDE.md](./DEMO_GUIDE.md)** for detailed step-by-step instructions including:
- Setting up two Freighter wallets (buyer & seller)
- Creating and funding an escrow
- Full transaction flow via UI and CLI
- Troubleshooting common issues

### Run Contract Tests

```bash
cargo test
```

## Tech Stack

- **Smart Contract**: Rust, Soroban SDK
- **Frontend**: Vanilla JS, Vite, Stellar SDK
- **Wallet**: Freighter
- **Network**: Stellar Testnet

## License

MIT
