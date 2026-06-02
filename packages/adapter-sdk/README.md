# @argus/adapter-sdk

Chain adapter interface and types for blockchain monitoring. Provides a unified interface for interacting with different blockchains (Solana, EVM, etc.).

## Installation

```bash
npm install @argus/adapter-sdk
```

## Usage

### Basic usage with Solana

```typescript
import { SolanaAdapter } from '@argus/adapter-sdk';

const adapter = new SolanaAdapter({
  rpcUrl: 'https://mainnet.helius-rpc.com/?api-key=YOUR_KEY',
});

// Get native SOL balance (returns lamports as BigInt)
const balance = await adapter.getNativeBalance(
  'Gg7UjK8Kz1Kz1Kz1Kz1Kz1Kz1Kz1Kz1Kz1Kz1Kz1Kz1',
);
console.log(`Balance: ${balance.balance} lamports`);

// Get SPL token balances
const tokens = await adapter.getTokenBalances(
  'Gg7UjK8Kz1Kz1Kz1Kz1Kz1Kz1Kz1Kz1Kz1Kz1Kz1Kz1',
);

// Get recent transactions
const txs = await adapter.getRecentTransactions(
  'Gg7UjK8Kz1Kz1Kz1Kz1Kz1Kz1Kz1Kz1Kz1Kz1Kz1Kz1',
  10,
);

// Check RPC health
const health = await adapter.checkRpcHealth(
  'https://mainnet.helius-rpc.com/?api-key=YOUR_KEY',
);
```

### Implementing a custom chain adapter

```typescript
import { ChainAdapter, NativeBalance, TokenBalance, Transaction, RpcHealthResult } from '@argus/adapter-sdk';

export class MyChainAdapter implements ChainAdapter {
  getChainType(): string {
    return 'my-chain';
  }

  async getNativeBalance(address: string): Promise<NativeBalance> {
    // Implement chain-specific logic
    return {
      address,
      balance: BigInt(0),
      decimals: 18,
      symbol: 'MYC',
    };
  }

  async getTokenBalances(address: string): Promise<TokenBalance[]> {
    return [];
  }

  async getRecentTransactions(address: string, limit?: number): Promise<Transaction[]> {
    return [];
  }

  async checkRpcHealth(endpoint: string): Promise<RpcHealthResult> {
    return {
      endpoint,
      healthy: true,
      latencyMs: 0,
      blockHeight: 0,
    };
  }
}
```

## API

### `ChainAdapter` interface

| Method | Description |
|--------|-------------|
| `getNativeBalance(address)` | Get native currency balance (returns BigInt) |
| `getTokenBalances(address)` | Get all token balances for an address |
| `getRecentTransactions(address, limit?)` | Get recent transactions |
| `checkRpcHealth(endpoint)` | Check RPC endpoint health |
| `getChainType()` | Get chain type identifier |

### `SolanaAdapter`

Reference implementation of `ChainAdapter` for Solana. Uses `@solana/web3.js` under the hood.

**Constructor options:**
- `rpcUrl` (required) — Solana RPC endpoint URL

## Types

All monetary amounts use `bigint` (never `number` or `float`) to avoid precision loss.

- `NativeBalance` — Native currency balance
- `TokenBalance` — Token/SPL balance
- `Transaction` — Normalized transaction
- `RpcHealthResult` — RPC health check result

## Building

```bash
npm run build
```

## Publishing

```bash
npm publish
```

## License

MIT
