# Free On-Chain Holder Analysis Setup Guide

## What you need (and why)

The scanner’s **holder concentration** feature needs a **token-holder list provider**. On many explorer APIs (including Etherscan), holder-list endpoints are now **paid/Pro-only**.

For a simple free-first setup (especially if your watchlist is mostly Ethereum tokens), use **Ethplorer**.

**Solana note**: The holder-concentration module in v1 supports **EVM tokens only**. Solana holder analysis would require a Solana-specific provider/API (not included in v1).

## Recommended setup (Ethereum tokens)

1. Add this to your `.env`:
   ```env
   ETHPLORER_API_KEY=freekey
   ```
2. Run the scanner:
   ```powershell
   node src/index.js
   ```

If successful you’ll see `OnChain=Ethplorer` in the “Data sources” line, and an **On-chain Holder Snapshot** section in `reports/Summary.md`.

## Optional setup (multi-chain holders)

If you want holder lists for Arbitrum/Optimism/Base/Polygon/BSC (and other chains), add:

```env
COVALENT_API_KEY=your_key_here
```

## How the scanner chooses sources (fallback order)

1. **Ethereum**: Ethplorer (when enabled)
2. **Explorer APIs** (when enabled and supported)
3. **Covalent/GoldRush** (when enabled)
4. Otherwise, on-chain holder analysis is skipped (the rest of the scanner still runs).

## Rate limits (practical)

- Ethplorer `freekey` is rate-limited (roughly ~1 request/second); the scanner caches results for hours, so normal runs are fine.
- CoinGecko and other sources have their own rate limits; the scanner backs off on `429` responses where possible.

## Troubleshooting

- `OnChain=NONE`: add `ETHPLORER_API_KEY=freekey` (Ethereum) or `COVALENT_API_KEY` (multi-chain) and re-run.
- Still no holder data for a specific token: it may not be an Ethereum ERC-20, it may be missing a contract mapping, or the provider may not index it yet.
