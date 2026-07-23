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
    permissions: ["account", "balance"],
    label: "Bingo Rush",
    network: "canopy",
  });
  return { ...acc, address: (acc.address || "").replace(/^0x/, "").toLowerCase() };
}

export async function walletBalance(): Promise<FleetBalance | null> {
  if (!hasFleet() || !window.fleet!.getBalance) return null;
  try { return await window.fleet!.getBalance(); } catch { return null; }
}

export async function disconnectWallet(): Promise<void> {
  try { await window.fleet?.disconnect?.(); } catch { /* ignore */ }
}

export const WALLET_METHOD_MISSING = "WALLET_METHOD_MISSING";

/**
 * Ask FleetWallet to sign + submit a room-join for the connected account.
 * Requires the wallet to implement the `bingo_join` request method.
 * @returns the submitted tx hash
 */
export async function bingoJoin(p: {
  roundId: string;
  numCards: number;
  amount: number;      // uCNPY
  rpcUrl: string;
  chainId: number;
  networkId: number;
}): Promise<{ txHash: string }> {
  if (!hasFleet()) throw new Error("FleetWallet not detected");
  try {
    const res = await window.fleet!.request({ method: "bingo_join", params: [p] });
    return typeof res === "string" ? { txHash: res } : res;
  } catch (e: any) {
    // method not implemented by the wallet yet
    if (e?.code === 4200 || /unsupported|unknown method|not.*support/i.test(String(e?.message))) {
      const err = new Error(WALLET_METHOD_MISSING);
      (err as any).code = WALLET_METHOD_MISSING;
      throw err;
    }
    throw e;
  }
}
