# On-Chain Intelligence Implementation Summary

## ✅ Implementation Complete!

All on-chain intelligence features have been successfully integrated into your crypto scanner.

## What Was Implemented

### 1. **Covalent/GoldRush API Integration**
- ✅ Added `COVALENT_API_KEY` environment variable support
- ✅ Implemented token holder data fetching from Covalent API
- ✅ Automatic contract address detection from CoinGecko
- ✅ Chain mapping (Ethereum, BSC, Polygon, etc. → Covalent chain names)

### 2. **Holder Concentration Analysis**
- ✅ Calculates percentage of supply held by the top 10 holders
- ✅ Calculates percentage of supply held by the top 20 holders
- ✅ Assigns a simple, plain-English level: **Low / Medium / High / Unknown**
- ✅ Breaks down the top 10 into:
  - **Wallets**
  - **Smart contracts**
  - **Exchange wallets** (only when you tag them in `config/address_book.json`)

### 3. **New Gate: Ownership Concentration**
- ✅ Added a 5th gate to hygiene evaluation
- ✅ High ownership concentration downgrades coins from `KEEP` → `WATCH-ONLY`
- ✅ Missing ownership data is treated as **Unknown**, which prevents `KEEP` (so coins don’t look “clean” due to missing data)

### 4. **Report Integration**
- ✅ Added holder data to `Layer1Report.json`:
  - `top_10_holder_percent`
  - `top_20_holder_percent`
  - `high_concentration_risk` (boolean)
  - `holder_confidence` (MEDIUM/UNKNOWN)
- ✅ Added plain-English notes in `Summary.md` (e.g., "ownership very concentrated", "ownership data missing")
- ✅ Updated data sources tracking to show `OnChain=Covalent/GoldRush`

## How to Enable

### Step 1: Get Your API Key
1. Visit: **https://goldrush.dev/platform/auth/register/**
2. Sign up (Google, GitHub, or Email)
3. After login, find your API key in the dashboard
4. Copy the key (starts with `ckey_` or similar)

### Step 2: Add to `.env`
Add this line to your `.env` file:
```
COVALENT_API_KEY=your_key_here
```

### Step 3: Run Scanner
```powershell
node src/index.js
```

You should see `OnChain=Covalent/GoldRush` in the data sources output.

## What This Detects

**High Concentration Examples:**
- 🚨 **Top 10 holders have 60%** → Marked as **High** concentration
- 🚨 **Top 20 holders have 75%** → Marked as **High** concentration
- ✅ **Top 10 holders have 30%** → Usually **Medium** or **Low** depending on holder types

## Why This Matters

**The Problem:**
- If a few wallets control most of the supply, they can:
  - Dump the price at any time
  - Manipulate governance votes
  - Create false liquidity signals

**Your Solution:**
- Automatically detects this risk **before** you invest
- Flags it in reports so you can avoid risky projects
- Uses real on-chain data (not speculation)

## Technical Details

### API Endpoint Used
```
GET https://api.goldrush.dev/v1/{chain}/tokens/{address}/token_holders/?key={api_key}
```

### Supported Chains
- Ethereum (`eth-mainnet`)
- Binance Smart Chain (`bsc-mainnet`)
- Polygon (`matic-mainnet`)
- Avalanche (`avalanche-mainnet`)
- Arbitrum (`arbitrum-mainnet`)
- Optimism (`optimism-mainnet`)
- Base (`base-mainnet`)
- And more...

### Caching
- Holder data cached for 6 hours (same as other data)
- Reduces API calls and improves performance

## Files Modified

1. **src/index.js**
   - Added Covalent API functions
   - Integrated into main scanning loop
   - Updated gate evaluation logic
   - Updated report generation

2. **README.md**
   - Added Covalent API key instructions
   - Updated features table
   - Added on-chain analysis notes

3. **COVALENT_API_SETUP.md** (NEW)
   - Step-by-step setup guide
   - Troubleshooting tips

## Next Steps

1. **Get your API key** from GoldRush platform
2. **Add it to `.env`** file
3. **Run the scanner** and see on-chain data in action!

## Questions?

- See `COVALENT_API_SETUP.md` for detailed setup instructions
- Tag known exchange wallets (optional): `config/address_book.json`
- GoldRush docs: https://goldrush.dev/docs/

