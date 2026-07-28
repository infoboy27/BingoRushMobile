// FleetWallet integration (https://github.com/nodefleet/FleetWallet).
//
// FleetWallet is a Manifest-V3 Chrome extension that injects a `window.fleet`
// provider and signs Canopy BLS12-381 transactions internally. dApps connect
// and request scoped permissions; signing happens inside the extension popup.
//
// This module is the Bingo Rush dApp side. Connect + balance work against the
// shipping extension today. Signing a room entry needs a `bingo_join` request
// method on the wallet (see docs/fleetwallet-bingo-integration-spec.txt); until
// FleetWallet ships it, `bingoJoin` throws WALLET_METHOD_MISSING and the app
// falls back to the server-provisioned demo flow.

export interface FleetAccount {
  address: string;      // Canopy: 20-byte hex, lowercase, no 0x
  chain: string;        // "canopy"
  permissions?: string[];
}

export interface FleetBalance {
  address: string;
  chain: string;
  raw: string;          // uCNPY
  whole: string;        // formatted, e.g. "5.123456"
  symbol: string;       // "CNPY"
}

declare global {
  interface Window {
    fleet?: {
      isFleetWallet?: boolean;
      connect: (opts?: any) => Promise<FleetAccount>;
      disconnect?: () => Promise<{ ok: boolean; wasConnected: boolean }>;
      getAccount?: () => Promise<FleetAccount>;
      getBalance?: () => Promise<FleetBalance>;
      getPermissions?: () => Promise<string[]>;
      request: (args: { method: string; params?: unknown[] }) => Promise<any>;
    };
  }
}

export function hasFleet(): boolean {
  return typeof window !== "undefined" && !!window.fleet?.isFleetWallet;
}

/** Resolves true once window.fleet is present (extension may inject late). */
export function waitForFleet(timeoutMs = 500): Promise<boolean> {
  if (hasFleet()) return Promise.resolve(true);
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: boolean) => { if (!done) { done = true; resolve(v); } };
    window.addEventListener("fleet#initialized", () => finish(hasFleet()), { once: true });
    setTimeout(() => finish(hasFleet()), timeoutMs);
  });
}

export async function connectWallet(): Promise<FleetAccount> {
  if (!hasFleet()) throw new Error("FleetWallet not detected");
  const acc = await window.fleet!.connect({
    permissions: ["account", "balance", "tx.write"],
    label: "Bingo Rush",
    network: "canopy",
  });
  return { ...acc, address: (acc.address || "").replace(/^0x/, "").toLowerCase() };
}

/**
 * Silently restore a connection this origin was already granted (no popup) —
 * call on page load so a refresh doesn't force the user to reconnect. Returns
 * null if there's no prior grant (getAccount rejects / isn't available).
 */
export async function tryReconnect(): Promise<FleetAccount | null> {
  if (!hasFleet() || !window.fleet!.getAccount) return null;
  try {
    const acc = await window.fleet!.getAccount();
    if (!acc?.address) return null;
    return { ...acc, address: acc.address.replace(/^0x/, "").toLowerCase() };
  } catch {
    return null;
  }
}

export async function walletBalance(): Promise<FleetBalance | null> {
  if (!hasFleet() || !window.fleet!.getBalance) return null;
  try { return await window.fleet!.getBalance(); } catch { return null; }
}

export async function disconnectWallet(): Promise<void> {
  try { await window.fleet?.disconnect?.(); } catch { /* ignore */ }
}

export const WALLET_METHOD_MISSING = "WALLET_METHOD_MISSING";

// Generic Canopy tx signer (see docs/fleetwallet-canopy-generic-tx-spec.md).
// The dApp describes the plugin message by typed fields; the wallet encodes it,
// shows the fields for approval, signs (BLS) and submits to rpcUrl. Reusable for
// every game on the platform.
export interface CanopyTxField {
  number: number;
  type: "bytes" | "uint64" | "string" | "bool" | "repeated_uint64";
  value?: unknown;
  fromSigner?: boolean; // bytes only: wallet fills with the connected 20-byte address
}
export interface CanopySignParams {
  messageName: string;
  typeUrl: string;
  fields: CanopyTxField[];
  rpcUrl: string;
  chainId: number;
  networkId: number;
  fee?: number;
  display?: { title: string; lines: { label: string; value: string }[] };
}

export async function canopySignAndSubmit(params: CanopySignParams): Promise<{ txHash: string }> {
  if (!hasFleet()) throw new Error("FleetWallet not detected");
  try {
    const res = await window.fleet!.request({ method: "canopy_signAndSubmit", params: [params] });
    return typeof res === "string" ? { txHash: res } : res;
  } catch (e: any) {
    if (e?.code === 4200 || /unsupported|unknown method|not.*support/i.test(String(e?.message))) {
      const err = new Error(WALLET_METHOD_MISSING);
      (err as any).code = WALLET_METHOD_MISSING;
      throw err;
    }
    throw e;
  }
}

/**
 * Ask FleetWallet to sign + submit a room-join (MessageJoinRoom) for the
 * connected account, via the generic `canopy_signAndSubmit` method.
 */
export async function bingoJoin(p: {
  roundId: string;    // hex
  numCards: number;
  amount: number;     // uCNPY
  rpcUrl: string;
  chainId: number;
  networkId: number;
}): Promise<{ txHash: string }> {
  return canopySignAndSubmit({
    messageName: "join_room",
    typeUrl: "type.googleapis.com/types.MessageJoinRoom",
    fields: [
      { number: 1, type: "bytes", fromSigner: true },   // player_address
      { number: 2, type: "bytes", value: p.roundId },   // round_id
      { number: 3, type: "uint64", value: p.numCards }, // num_cards
      { number: 4, type: "uint64", value: p.amount },   // amount
    ],
    rpcUrl: p.rpcUrl, chainId: p.chainId, networkId: p.networkId, fee: 10000,
    display: {
      title: "Join Bingo room",
      lines: [
        { label: "Room", value: `${p.roundId.slice(0, 8)}…` },
        { label: "Stake", value: `${(p.amount / 1_000_000).toLocaleString()} CNPY` },
      ],
    },
  });
}

function randomTokenId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Mint a card-skin cosmetic NFT for the connected account (MessageBuyCosmetic,
 * gem-priced). `kind` must match a gem-priced id in the shop catalog
 * (GET /shop/cosmetics) — the plugin re-validates the price against that same
 * catalog server-side, so a tampered client can't under-pay.
 */
export async function buyCosmetic(p: {
  kind: string;       // shop item id, e.g. "galaxy"
  name: string;       // display only
  priceGems: number;  // display only
  rpcUrl: string;
  chainId: number;
  networkId: number;
}): Promise<{ txHash: string }> {
  return canopySignAndSubmit({
    messageName: "buy_cosmetic",
    typeUrl: "type.googleapis.com/types.MessageBuyCosmetic",
    fields: [
      { number: 1, type: "bytes", fromSigner: true },     // player_address
      { number: 2, type: "bytes", value: randomTokenId() }, // token_id
      { number: 3, type: "string", value: p.kind },        // kind
    ],
    rpcUrl: p.rpcUrl, chainId: p.chainId, networkId: p.networkId, fee: 10000,
    display: {
      title: "Buy card skin",
      lines: [
        { label: "Skin", value: p.name },
        { label: "Price", value: `${p.priceGems} gems` },
      ],
    },
  });
}
