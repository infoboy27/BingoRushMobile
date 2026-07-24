# Bingo Rush → On-chain Gaming Platform — Strategy

*Draft for internal / investor discussion. Prepared with the team.*

## 1. Vision

Start with **Bingo Rush** — a provably-fair, play-to-earn bingo running on its
own Canopy chain — and grow it into a **multi-game, on-chain casino/GameFi
platform**: one token, one settlement layer, many games (poker, dominó,
billar/pool, casino), one wallet integration. Every room: players stake tokens,
the pot is escrowed on-chain, and the winner is paid automatically minus a
transparent house rake.

The insight: the hard part (on-chain escrow + provably-fair settlement +
economy + NFTs + wallet) is **game-agnostic and already built**. New games are
mostly a new rules engine on top of the same rails.

## 2. What already exists (not slideware — running)

- **Its own blockchain**: Bingo graduated as a Canopy nested chain (chainId 405);
  the node runs our custom **Python plugin** (the on-chain logic).
- **On-chain primitives** (in the plugin): room **escrow** (open/join/settle),
  **provably-fair RNG** via commit-reveal (the chain re-verifies the winner
  before paying), **multi-rank prize payout**, a transparent **rake**, an
  **economy** (coins + gems) and **NFT** cosmetics.
- **Game server** (FastAPI + WebSocket) orchestrating live play, sharing one pure
  **game engine** (card/draw/rules) with the chain so results are verifiable.
- **Web + mobile UI** live at a public URL, wired end-to-end.
- **Wallet**: FleetWallet (self-custody, BLS) connect integration + a spec for
  signing entries from the wallet.
- Provably-fair, on-chain settlement demonstrated end-to-end (winner paid the net
  pot 70/30 by a seed-derived ranking).

## 3. Architecture (why it scales & ports)

```
Frontend (web/mobile) ── Game server (FastAPI + WS, real-time) ── Canopy chain
        │                    │  shared pure engine (rules)          (plugin = on-chain logic)
     Wallet (BLS)            └─ orchestration, matchmaking          escrow · commit-reveal · rake · NFTs
```

- **Clean separation**: the engine is pure and chain-agnostic; only the plugin +
  bridge are chain-specific. → new games = new engine; new chains = new bridge.

## 4. Scalability

- **On-chain**: a **dedicated L1** — all block space is ours. A game ≈ 4 tx;
  thousands of games/min are feasible; settlement can be batched.
- **Off-chain**: make the game server **stateless + Redis + Postgres**, WS fan-out
  via pub/sub, horizontal instances behind a load balancer → **tens of thousands
  of concurrent players**. Real-time is absorbed off-chain; the chain settles.

## 5. Security

**Already strong**: provably-fair commit-reveal, the chain re-verifies the win
inside the settlement tx, on-chain escrow, supply-conserving integer math,
BLS-signed transactions.
**To harden before real money**: add **VRF / future-block-hash / player-nonce
entropy** so even the operator can't foresee outcomes; real anti-spam fees;
operator key in KMS/HSM; rate-limiting/DDoS; independent **audit + bug bounty**.
**Compliance (biggest item)**: real-money play = regulated gambling →
licensing, KYC/AML, geo-blocking per jurisdiction.

## 6. Multi-chain

Portable by design. Canopy today (own cheap chain + own token); can also deploy
to **EVM (Base/Polygon/BNB/Arbitrum)** via Solidity contracts + Chainlink VRF,
**Solana** (Rust + VRF) or **Cosmos** (CosmWasm) — reusing the frontend, game
server and engine, swapping only the on-chain layer and bridge. EVM unlocks
MetaMask/WalletConnect + existing liquidity.

## 7. Wallets

Wallet layer is abstracted. Today: FleetWallet (Canopy BLS). Roadmap: an
**embedded/social-login wallet** for frictionless onboarding of non-crypto
users, plus **MetaMask/WalletConnect** on any EVM deployment.

## 8. Token & monetization

**Token**: a **platform token** (staked to play across all games). Bingo's
`$RUSH` generalizes to the platform. ~1B supply; liquidity 8–12% in a
token/CNPY pool (see `tokenomics.md`).

**Revenue (several already coded):**
- **Rake** on every pot (5–10%) → the recurring, core revenue *(implemented)*.
- **IAP**: buy coins/gems with money *(shop implemented)*.
- **NFTs**: cosmetics + marketplace fees.
- **Premium boosters** *(implemented)*.
- **Validator infra** (nodefleet runs validators, earns token + subsidies).
- **Platform fees** from third-party games built on our rails.

> Sustainable core = **rake + IAP + NFT fees on real volume**; token is secondary
> and regulation-sensitive.

## 9. Roadmap

1. **Now**: graduated chain is live; waiting on its validator committee to produce
   blocks, then flip the game server to it (1 command; already prepared).
2. **Q+1**: seed entropy hardening (VRF/player-nonce), real fees, wallet-signed
   play (FleetWallet `bingo_join`), audit.
3. **Q+2**: second game (poker or dominó) on the same rails; platform token; NFT
   marketplace; scale the server tier (Redis/Postgres).
4. **Q+3**: multi-chain (EVM), embedded wallet, licensing where required.

## 10. Team

**Nodefleet** — blockchain infrastructure operator (validators/nodes), building
and hosting the chain, plugin, servers and validator set. Natural fit: the
platform's infra revenue reinforces the core business.

## 11. The ask

Raising a **$750K pre-seed** (on a SAFE, ~$6M pre-money — sized to 2026 market
medians; adjustable). We already have a working product and our own live chain,
so the round funds the path to a **real-money soft-launch**, not R&D from zero.

**Use of funds**
- 25% — Security hardening + independent audit (VRF entropy, key custody, bug bounty)
- 25% — Legal · licensing · KYC/AML (real-money play is regulated gambling)
- 20% — Games #2–#3 + product hardening
- 15% — Infrastructure & scaling (Redis/Postgres, WS fan-out, validators)
- 15% — Go-to-market & initial token liquidity

**Milestone this funds**: security+legal cleared → soft-launch of game #1 with
real money in 1–2 jurisdictions → game #2 in progress. Deck: pitch web page.

*Benchmarks (2026): pre-seed median ~$750K, pre-money ~$6M, ~15% dilution; web3
gaming pre-seeds trend to the low single-digit millions.*
