# Bingo Rush — token & liquidity (recommendation)

> Not financial/legal advice. Verify ticker availability (CoinGecko/CMC/DEX +
> trademark) and the legal framework — a bingo game paying crypto prizes may be
> regulated gambling depending on jurisdiction.

## Identity

- **Project / game:** Bingo Rush
- **Native token (on-chain "coins"):** Rush
- **Ticker:** **`$RUSH`** (primary)
  - Alternatives if taken: **`$DAUB`** (thematic — *daub* = marking the card; likely free), `$BINGO` (generic/used), `$BRUSH` (Bingo+Rush; a BRUSH exists on Fantom).
- **Decimals:** 6 (1 RUSH = 1_000_000 base units, uRUSH — matches Canopy uCNPY).

## Description (for listings / site)

> **Bingo Rush ($RUSH)** is a provably-fair, play-to-earn bingo game running on
> its own Canopy nested chain. Players enter with $RUSH, entries are held in an
> **on-chain escrow**, balls are drawn from a **commit-reveal** seed anyone can
> verify, and winners are paid automatically from the pot (minus a transparent
> rake). Cards and skins are NFTs; gems are the premium currency.

## Token model

- **$RUSH** — native chain token (the in-game "coins"): entries, prize pools,
  rewards. This is what gets a ticker + liquidity.
- **Gems 💎** — premium hard currency (second on-chain asset), bought with money
  or $RUSH; spends on boosters/skins. Kept indivisible.
- **Cosmetics** — ERC-721-like NFTs (cards/skins), priced in gems.

## Suggested supply & allocation (1,000,000,000 $RUSH)

| Bucket | % | Notes |
|---|---|---|
| Gameplay rewards / prize emissions | 40% | streamed as the game runs |
| Treasury / ecosystem | 15% | ops, partnerships |
| Team | 15% | 1–2 yr vesting, cliff |
| Community / airdrop | 10% | early players, quests |
| **Liquidity** | **8–12%** | initial DEX pool (below) |
| Reserves | remainder | buffer |

## Liquidity recommendation

- **Primary pool:** `$RUSH / CNPY` (Canopy's root token). Add `$RUSH / USDC`
  once a stable is bridged.
- **LP allocation:** 8–12% of supply, paired with equal-value CNPY.
- **Initial depth target:** ~**$50k–$150k** equivalent (deeper pool = lower
  slippage when players buy entries). Start conservative, deepen from rake.
- **LP lock:** 6–12 months (or burn the LP) as a trust signal.
- **Self-sustaining:** route part of the on-chain **rake (5–10%)** already
  collected on every room into the pool / treasury so liquidity doesn't depend
  solely on the initial seed.

## Status / dependency

Canopy is in **Alphanet** — there is no public DEX / testnet yet, so real
liquidity is **designed now, deployed when a public Canopy network exists**.
See `chain/deploy/graduation-runbook.md` (backend repo) for the chain-graduation
steps this depends on.
