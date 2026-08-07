# FleetWallet — generic `canopy_signAndSubmit` (platform-wide)

A single, reusable dApp method to sign + submit **any Canopy plugin transaction**.
Implement it once; every game on the platform (Bingo, poker, dominó, the casino)
uses it — no per-game wallet changes.

## Why generic, and why safe

FleetWallet today only exposes app-specific tx methods (`canoliq_deposit`, …).
A naive "sign these raw bytes" method is unsafe (a malicious dApp could hide a
fund-draining `MessageSend`). This design keeps it **generic and safe**: the dApp
describes the message **by typed fields**, and the **wallet encodes it itself**
(with the proto3 primitives it already has) and **renders every field** in the
approval. The wallet always knows and shows exactly what it signs.

## dApp call

```js
const res = await window.fleet.request({
  method: "canopy_signAndSubmit",
  params: [{
    // --- the message (wallet encodes this itself) ---
    messageName: "join_room",                              // outer Transaction.message_type + json "type"
    typeUrl:     "type.googleapis.com/types.MessageJoinRoom",
    fields: [                                              // proto3 fields, any order (number carries position)
      { number: 1, type: "bytes",  fromSigner: true },    // player_address = connected account (auto-filled)
      { number: 2, type: "bytes",  value: "9f2c…" },      // round_id (hex)
      { number: 3, type: "uint64", value: 2 },            // num_cards
      { number: 4, type: "uint64", value: 100000000 }     // amount (uCNPY)
    ],
    // --- where + how ---
    rpcUrl:    "https://casino.val-a.grad.dev.app.canopynetwork.org/rpc",
    chainId:   406,
    networkId: 1,
    fee:       10000,
    // --- human approval (shown alongside the decoded fields) ---
    display: {
      title: "Join Bingo room",
      lines: [
        { label: "Room",  value: "9f2c…" },
        { label: "Stake", value: "100 CNPY" }
      ]
    }
  }]
})
// → { txHash: "…" }   (or a plain hash string)
```

## Field types → the encoders FleetWallet already has (`lib/chains/canopy-tx.js`)

| `type` | encoded with | `value` |
|---|---|---|
| `bytes` | `fieldBytes(number, hexToBytes(value))` | hex string (no 0x) |
| `uint64` | `fieldVarint(number, BigInt(value))` | number or numeric string |
| `string` | `fieldString(number, value)` | string |
| `bool` | `fieldBool(number, value)` | boolean |
| `repeated_uint64` | `fieldPackedVarints(number, value.map(BigInt))` | number[] |

`fromSigner: true` on a `bytes` field → the wallet fills it with the **connected
account's 20-byte address** (ignores any `value`). This binds the signer and
prevents a dApp from asking you to sign a tx that claims a different sender.

## Wallet implementation (small, reuses existing plumbing)

1. **Route** (`background/service-worker.js`): add
   `case "canopy_signAndSubmit": return await rpcCanopySignAndSubmit(origin, params[0] || {});`
   `rpcCanopySignAndSubmit`: require a write permission (e.g. `tx.write`),
   validate `messageName`/`typeUrl`/`fields`/`rpcUrl`(https)/`chainId`/`networkId`,
   then open an approval intent `{ kind:"canopy-tx", address: grant.address, request: {…} }`.

2. **Encode** (`lib/chains/canopy-tx.js`): a generic encoder that maps each field
   by `type` to the existing `field*` helpers (table above), concatenated in
   `number` order → `msgBytes`.

3. **Sign + submit** (`lib/chains/canopy.js`): reuse the `signCanopyMessage`
   envelope + BLS/Ed25519 signing, but emit the **plugin-tx wire json** —
   `msgTypeUrl` + `msgBytes` (hex) instead of `msg: jsonMsg`. (Suggest adding a
   `pluginTx: true` flag to `signCanopyMessage`: when set, the returned `json`
   uses `msgTypeUrl`/`msgBytes` — a ~3-line change.) ⚠️ This is required: plugin
   messages can't be re-derived from json, so the exact signed bytes must be
   sent, or the signature won't verify. Then `POST {rpcUrl}/v1/tx`.

4. **Approval screen** (`popup/popup.js`): one `"canopy-tx"` case (mirroring the
   `canoliq-deposit` case). Render `display.title`, `display.lines`, **plus the
   decoded fields** (name/number, type, value — with `bytes` shown hex), the
   chain id, RPC host and fee. On approve → call the generic signer.

That's **one** popup screen + one route + one encoder + a 3-line submit tweak —
and it serves every game on the platform forever.

## How each game uses it

**Bingo — join a room** (shown above): `MessageJoinRoom` fields 1–4.

**Bingo — the player never signs settle** (the operator/committee does), so a
player wallet only ever signs `join_room`.

**A future casino game** — e.g. place a bet:
```js
window.fleet.request({ method:"canopy_signAndSubmit", params:[{
  messageName:"place_bet", typeUrl:"type.googleapis.com/types.MessagePlaceBet",
  fields:[ {number:1,type:"bytes",fromSigner:true},{number:2,type:"bytes",value:tableIdHex},
           {number:3,type:"uint64",value:betUcnpy} ],
  rpcUrl, chainId, networkId, fee:10000,
  display:{ title:"Place bet", lines:[{label:"Table",value:"…"},{label:"Bet",value:"5 CNPY"}] }
}]})
```
No wallet change — same method, different fields + display.

## Network (Bingo, today)

Add in FleetWallet → **Custom networks** (family Canopy):
`Bingo · canopy · 406 · https://casino.val-a.grad.dev.app.canopynetwork.org/rpc`,
Network ID `1`. (Our RPC already returns permissive CORS, so the extension can
reach it directly.)

## dApp side — already ready

`src/lib/wallet.ts` exposes `canopySignAndSubmit(params)` and a `bingoJoin(...)`
that builds the `join_room` fields and calls it. The game server exposes
`GET /rounds/{id}/info` (rpcUrl, chainId, entryFee…) and
`GET /rounds/{id}/card?address=&num_cards=`. Wallet-signed play lands the moment
FleetWallet ships `canopy_signAndSubmit`.
