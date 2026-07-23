# Bingo Rush ⇄ FleetWallet integration spec

FleetWallet (https://github.com/nodefleet/FleetWallet) is a Manifest-V3 Chrome
extension that injects `window.fleet` and signs Canopy **BLS12-381** transactions
internally. This spec defines what Bingo Rush uses today and the one method
FleetWallet needs to add for self-custody play.

Mirrors the shape of the existing canoLiq integration spec (`canopy` network,
uCNPY amounts, 20-byte lowercase hex addresses, no `0x`).

---

## 1. What Bingo uses today (already shipping in FleetWallet)

The dApp side lives in `src/lib/wallet.ts`. On the **Live** screen the wallet chip:

```js
await window.fleet.connect({ permissions: ["account", "balance"], label: "Bingo Rush", network: "canopy" })
// → { address: "851e90ea…", chain: "canopy", permissions: [...] }
await window.fleet.getBalance()
// → { address, chain, raw /* uCNPY */, whole /* "5.123456" */, symbol: "CNPY" }
```

Address is normalized `address.replace(/^0x/, "").toLowerCase()`. The chip listens
for `fleet#initialized` (with a 700 ms fallback).

---

## 2. What FleetWallet needs to add: `bingo_join`

To let a player stake their own entry from self-custody, add one request method.
The wallet already has the generic signer `signCanopyMessage()` in
`lib/chains/canopy-tx.js`; `bingo_join` builds a `MessageJoinRoom`, signs it with
the connected account, and submits it.

```js
const res = await window.fleet.request({
  method: "bingo_join",
  params: [{
    roundId:   "0f4ebadafcc866c8",   // hex, from the game server
    numCards:  2,                     // 1..4
    amount:    180000000,             // uCNPY the player escrows
    rpcUrl:    "https://<canopy-node-rpc>",
    chainId:   1,
    networkId: 1
  }]
})
// → "048a2ab0…"  OR  { txHash: "048a2ab0…" }   (either accepted)
```

**What the wallet does internally** (same pattern as `canoliq_deposit`):

1. Build `MessageJoinRoom` protobuf (see §3) with `player_address` = connected account.
2. `signCanopyMessage({ messageName: "join_room", messageTypeUrl: "type.googleapis.com/types.MessageJoinRoom", messageBytes, jsonMsg, fee: 10000n, networkId, chainId, privateKey })`.
3. `POST {rpcUrl}/v1/tx` with the returned JSON payload.
4. Show a human-readable confirm: **"Join Bingo round … · stake {amount} CNPY"**.

Return the tx hash (string or `{ txHash }`).

> Settle is signed by the game-server **operator**, not the player — the player
> only ever signs `bingo_join`. This keeps the wallet's approval surface to a
> single, meaningful action.

---

## 3. Bingo transaction protobuf

Package `types` (same as core Canopy messages).

```proto
message MessageJoinRoom {
  bytes  player_address = 1;   // 20-byte connected account
  bytes  round_id       = 2;   // from roundId hex
  uint64 num_cards      = 3;
  uint64 amount         = 4;   // uCNPY
}
```

- Type URL: `type.googleapis.com/types.MessageJoinRoom`
- Outer `Transaction.message_type` / JSON `type`: `"join_room"`
- Signing: BLS12-381, `signBytes = proto.Marshal(Transaction with Signature=nil)`,
  DST `BLS_SIG_BLS12381G2_XMD:SHA-256_SSWU_RO_NUL_` — identical to `MessageSend`.

---

## 4. Flow with the game server

1. `POST {gameServer}/rounds` — operator opens the round on-chain (commit seed). → `{ roundId }`
2. `window.fleet.request({ method: "bingo_join", … })` — **player** signs + submits the entry.
3. `GET {gameServer}/rounds/{roundId}/card?address={player}&num_cards={n}` — the server (which holds the seed) returns the player's card grids.
4. `WS {gameServer}/ws/rounds/{roundId}` — live ball draw; server settles on-chain and pays winners.

Game server base URL: `VITE_API_URL` (default `https://bingo.jfmcss.com`).

---

## 5. Network parameters

| | Dev (today) | Notes |
|---|---|---|
| chainId | 1 | Bingo nested chain (dev, solo-validator) |
| networkId | 1 | |
| symbol / decimals | CNPY / 6 | 1 CNPY = 1_000_000 uCNPY |
| fee | 10000 uCNPY | matches `sendFee` |

**Open infra item:** for `bingo_join` the Canopy **node RPC must be reachable by
the browser** (`rpcUrl`). Today only the game server (`:8090`) is public via
Traefik; the node RPC (`:50102`) is private. Before enabling wallet-signed play,
expose it (e.g. a `rpc.bingo.jfmcss.com` Traefik route → node `:50102`) or add a
signed-tx proxy on the game server. Reference public Canopy devnet (canoLiq's, for
format only): `https://cplq.val-a.grad.dev.app.canopynetwork.org/rpc`, chainId 404.

---

## 6. Implementation checklist (FleetWallet side)

| # | What | Priority |
|---|---|---|
| 1 | `bingo_join` request method (build `MessageJoinRoom`, sign, submit, confirm UI) | required |
| 2 | Human-readable approval ("Join Bingo round X · stake Y CNPY") | required |
| 3 | Accept `rpcUrl`/`chainId`/`networkId` from params (per-round) | required |

Items already covered by the shipping extension: `connect`, `getAccount`,
`getBalance`, `fleet#initialized`, BLS signing (`signCanopyMessage`).
