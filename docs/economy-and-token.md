# Bingo Rush — economy, token & earnings

Plain answers to the "how do I actually make money / what is the token" questions.

## 1. What is the token? (BINGO vs CNPY)

The graduated Bingo chain (**chainId 406**) has its **own native token** — its own
supply (~100M, emitting 50/block), separate from the root chain's token. So a
"Bingo token" already exists: it's the native token of chain 406.

- It currently shows the **generic symbol "CNPY"** in tooling/wallets (no custom
  ticker was set), and it is **not tradeable yet** (no exchange/DEX, no market price).
- Branding it **"$BINGO"** = giving that existing 406 token a **ticker + market
  (liquidity)** — not creating a new coin. The symbol shown in a wallet is a
  client display convention; a public ticker + a DEX/listing is what makes it
  real and swappable.
- **In THIS game's UI we already brand the currency as game "coins" (🪙)** — the
  player never sees "CNPY". The on-chain token sits behind the scenes.

## 2. Deposit → play → withdraw (the casino model)

Do **not** make players "buy CNPY then swap to BINGO". Use the deposit model:

```
Player deposits (fiat card OR a common crypto)  →  gets COINS (stable in-game value)
Player plays rooms priced in COINS               →  pot escrowed on-chain, winner paid
House keeps a RAKE                               →  accrues to the treasury account
Owner withdraws the treasury                     →  transfer / swap to stablecoin → fiat
```

The player never touches the token mechanics. Two revenue rails:
- **On-chain rake** — accrues in the 406 token (see §4). Realized as fiat once the
  token has market liquidity, or by running coins on a stable peg (§3).
- **Off-chain IAP** — buying coin/gem bundles with real money goes to your
  **payment processor** (Stripe/etc.) → **direct fiat**, independent of the token.

## 3. Pricing on mainnet — FIXED in stable-pegged coins (not raw token)

Never price entries directly in the volatile token (a game would cost $1 today,
$4 next week). Instead:

- Sell **coins** at a fixed rate; coins hold a **stable in-game value**.
- Rooms have fixed coin prices (already in the game): Classic 100 · Speed 250 ·
  Jackpot 500 · VIP 1000.
- Peg example: **1 coin ≈ $0.01** → Classic ~$1, VIP ~$10 (sane casino/bingo prices).
- The exact token amount settled on-chain is computed at play time; the **player
  always sees stable prices**.
- Convert the rake (token) to a stablecoin periodically for the treasury.

## 4. Your earnings — the rake & the treasury

- Every settle takes a **rake** (`rake_bps`, e.g. 10%) from the pot.
- As of plugin **v0.2.0**, the rake is credited to a **house treasury account**
  you control (not the validator fee pool). See `bingo-treasury-key.txt`
  (Desktop) for the address + key.
- **Withdraw** = sign a transfer from the treasury to any address (your wallet,
  an exchange, swap to a stablecoin), whenever you want — monthly, quarterly, etc.
- ⚠️ For the graduated chain (406) to credit the treasury, its node must
  auto-update to plugin **v0.2.0** (pluginAutoUpdate → infoboy27/canopy). Until
  then the rake still goes to the chain fee pool.

## 5. Roadmap to "real money out"

1. Route rake → treasury  ✅ (v0.2.0)
2. Coins on a stable peg + fiat IAP (Stripe) → immediate fiat revenue.
3. Give the 406 token a ticker + DEX liquidity → treasury (token) swappable to a
   stablecoin → off-ramp to fiat.
4. Licensing/KYC where required (real-money play is regulated gambling).
