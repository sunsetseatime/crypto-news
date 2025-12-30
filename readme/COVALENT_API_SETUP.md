# How to Get Your Covalent/GoldRush API Key

## Step-by-Step Guide

### 1. Visit GoldRush Platform
Go to: **https://goldrush.dev/platform/auth/register/**

### 2. Sign Up
You can sign up using:
- **Google** (easiest)
- **GitHub** (if you prefer)
- **Email** (manual registration)

### 3. After Registration
Once you're logged in, you'll be taken to the **GoldRush Platform Dashboard**.

### 4. Find Your API Key
- Look for a section labeled **"API Keys"** or **"Your API Key"**
- The API key will typically start with `ckey_` or similar
- Copy this key

### 5. Add to Your `.env` File
Add this line to your `.env` file in the project root:

```
COVALENT_API_KEY=your_api_key_here
```

**Important**: Replace `your_api_key_here` with the actual key you copied from the dashboard.

### 6. Test It
Run your scanner:
```powershell
node src/index.js
```

If the API key is working, you'll see `OnChain=Covalent/GoldRush` in the data sources line of the output.

## What This Enables

With the Covalent API key, your scanner will now:
- ✅ Fetch token holder data from the blockchain
- ✅ Calculate holder concentration (top 10, top 20 wallets)
- ✅ Flag coins with high whale concentration risk (>50% in top 10 wallets)
- ✅ Add a new "concentration_risk" gate to the hygiene evaluation

## Free Tier Limits

The free tier typically includes:
- Sufficient requests for daily scanning
- Access to token holder endpoints
- Support for major chains (Ethereum, BSC, Polygon, etc.)

## Troubleshooting

**If you see `OnChain=NONE` in the output:**
- Check that `COVALENT_API_KEY` is set in your `.env` file
- Verify the key is correct (no extra spaces or quotes)
- Make sure you've saved the `.env` file

**If you get API errors:**
- Check your free tier limits haven't been exceeded
- Verify the token contract address is available on CoinGecko
- Some tokens may not have holder data available (especially newer tokens)

## Need Help?

- GoldRush Docs: https://goldrush.dev/docs/
- GoldRush Support: https://goldrush.dev/support/
- Discord: https://discord.gg/8ZWgu2pWY4

