# Bingo Rush ⇄ FleetWallet — `bingo_join` implementation guide

FleetWallet already ships everything Bingo Rush needs to **connect + read balance**
(used by the wallet chip). To enable **self-custody play**, add one request method:
`bingo_join`, which builds a `MessageJoinRoom`, signs it with the connected
account, and submits it to the round's Canopy RPC.

This is grounded in FleetWallet's existing `canoliq_deposit` implementation —
`bingo_join` mirrors it exactly, with two differences: (1) a different plugin
message, and (2) it submits to a **per-round `rpcUrl`** (Bingo is chainId **405**,
which may differ from the wallet's active env).

## Network (graduated Bingo chain)

| | |
|---|---|
| RPC | `https://bingo.val-a.grad.dev.app.canopynetwork.org/rpc` |
| chainId | **405** · networkId **1** · CNPY / 6 decimals · fee 10000 uCNPY |

The dApp passes `rpcUrl`, `chainId`, `networkId` per round (from the game
server's `GET /rounds/{id}/info`), so the wallet doesn't need to be pinned to
Bingo's env.

## dApp call (already implemented in `src/lib/wallet.ts`)

```js
await window.fleet.request({
  method: "bingo_join",
  params: [{ roundId, numCards, amount, rpcUrl, chainId, networkId }]
})
// → { txHash } or "0x…"
```
`roundId` is hex; `amount` is uCNPY the player escrows.

## FleetWallet changes

### 1. `lib/chains/canopy-tx.js` — encoder

`MessageJoinRoom` is a proto3 message; the encoder is the same style as
`encodeMessageSend`:

```js
// types.MessageJoinRoom { bytes player_address=1; bytes round_id=2; uint64 num_cards=3; uint64 amount=4; }
export function encodeMessageJoinRoom({ playerAddress, roundId, numCards, amount }) {
  return concat(
    fieldBytes(1, playerAddress),
    fieldBytes(2, roundId),
    fieldVarint(3, numCards),
    fieldVarint(4, amount),
  );
}
```
Type URL `type.googleapis.com/types.MessageJoinRoom`, message name `join_room`.

### 2. Submit with `msgTypeUrl` + `msgBytes` — NOT `msg` json ⚠️

`signCanopyMessage()` emits `{ type, msg: jsonMsg, signature, … }`. That works
for **registered** messages (send/stake) because the node re-encodes the json
canonically. **`join_room` is a plugin message** — the node cannot re-derive the
exact signed bytes from json, so the signature won't verify. Submit the **exact
signed bytes** instead (this is the proven path — the Bingo game server's Python
bridge uses it against chainId 405):

```jsonc
POST {rpcUrl}/v1/tx
{
  "type": "join_room",
  "msgTypeUrl": "type.googleapis.com/types.MessageJoinRoom",
  "msgBytes":   "<hex of encodeMessageJoinRoom(...)>",
  "signature": { "publicKey": "<48b hex>", "signature": "<96b hex>" },
  "time": <micros>, "createdHeight": <height>, "fee": 10000,
  "memo": "", "networkID": 1, "chainID": 405
}
```
The signature is over `signBytes = encodeTransaction(baseTx with signature=nil)`
where `baseTx.msgAny = encodeAny(typeUrl, msgBytes)` — identical to
`signCanopyMessage`; only the wire json's `msg` is replaced by
`msgTypeUrl`+`msgBytes`. BLS12-381 (noble) as already used.

### 3. `lib/chains/canopy.js` — method

```js
export async function bingoJoin({ from, roundId, numCards, amount, rpcUrl, chainId, networkId, privateKey, fee }) {
  const playerAddress = hexToBytes(stripHex(from).toLowerCase());
  const rid = hexToBytes(stripHex(roundId));
  const height = BigInt((await (await fetch(`${rpcUrl}/v1/query/height`,{method:"POST",headers:{'content-type':'application/json'},body:"{}"})).json()).height || 0);
  const time = BigInt(Date.now()) * 1000n;
  const messageBytes = encodeMessageJoinRoom({ playerAddress, roundId: rid, numCards: BigInt(numCards), amount: BigInt(amount) });
  // sign the Transaction envelope exactly like signCanopyMessage, then submit
  // with msgTypeUrl/msgBytes (see §2). Reuse the envelope encoder + blsSign.
  const json = signJoinToWireJson({ messageBytes, playerPub, sig, height, time,
    fee: fee || 10000n, networkId: BigInt(networkId), chainId: BigInt(chainId) });
  const res = await fetch(`${rpcUrl}/v1/tx`, { method:"POST", headers:{'content-type':'application/json'}, body: JSON.stringify(json) });
  return res.json(); // txHash string or { txHash }
}
```

### 4. `background/service-worker.js` — route

Mirror `rpcCanoliqDeposit`/`rpcCanoliqTx` (but no canoLiq env gate; use per-round
params). Add to the `handleRpc` switch:

```js
case "bingo_join": return await rpcBingoJoin(origin, params[0] || {});
```
`rpcBingoJoin(origin, p)`: require a write permission, validate
`roundId`(hex)/`numCards`(1–4)/`amount`(positive int)/`rpcUrl`(https), then open
an approval intent `{ kind:"bingo-join", address:grant.address, request:{ roundId, numCards, amount, rpcUrl, chainId, networkId } }` via `openApprovalWindow`.

### 5. `popup/popup.js` — approval screen

Add a `"bingo-join"` case in the three intent switches (routing ~L2037, render
~L2103, approve-action ~L2284), mirroring `canoliq-deposit`:
- **Render**: “Join Bingo round `{roundId.slice(0,8)}…` · stake `{amount/1e6}` CNPY”.
- **On approve**: call `canopy.bingoJoin({ from: grant.address, …intent.request, privateKey })` and resolve with the returned tx hash.

## After the wallet returns

The game server (`src/lib/api.ts`) already exposes what the dApp needs post-join:
- `GET /rounds/{id}/info` → `{ entryFee, rakeBps, chainId, networkId, rpcUrl }`
- `GET /rounds/{id}/card?address=&num_cards=` → the player's card grids

Flow: server opens the round → `bingo_join` (player signs) → `GET …/card` →
`WS /ws/rounds/{id}` (live draw) → server settles on-chain.

## Checklist

| # | File | What | Testable by |
|---|---|---|---|
| 1 | canopy-tx.js | `encodeMessageJoinRoom` | Node (bytes == Python proto) |
| 2 | canopy.js | `bingoJoin` (submit via msgTypeUrl/msgBytes) | Node (submit to chainId 405) |
| 3 | service-worker.js | `bingo_join` route + `rpcBingoJoin` | extension load |
| 4 | popup.js | `bingo-join` approval screen | **browser QA** |

Items 1–2 can be proven in Node against the live graduated chain (405) before
shipping; item 4 needs the extension's normal browser QA.
