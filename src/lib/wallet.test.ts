// Regression coverage for canopySignAndSubmit's error classification — the
// logic that decides whether a failed wallet call means "FleetWallet doesn't
// support this method yet" (WALLET_METHOD_MISSING, safe to fall back to the
// demo flow) vs. a real failure (insufficient funds, user rejection) that
// must surface to the player instead of being silently swallowed. Added by
// /qa on 2026-08-13.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { canopySignAndSubmit, WALLET_METHOD_MISSING } from "./wallet";

const baseParams = {
  messageName: "join_room",
  typeUrl: "type.googleapis.com/types.MessageJoinRoom",
  fields: [],
  rpcUrl: "https://casino.val-a.grad.dev.app.canopynetwork.org/rpc",
  chainId: 406,
  networkId: 1,
};

function installFleet(request: (...args: any[]) => any) {
  (window as any).fleet = { isFleetWallet: true, request };
}

describe("canopySignAndSubmit", () => {
  beforeEach(() => {
    delete (window as any).fleet;
  });

  it("throws immediately if FleetWallet isn't installed", async () => {
    await expect(canopySignAndSubmit(baseParams)).rejects.toThrow("FleetWallet not detected");
  });

  it("wraps a string result as { txHash }", async () => {
    installFleet(async () => "abc123");
    await expect(canopySignAndSubmit(baseParams)).resolves.toEqual({ txHash: "abc123" });
  });

  it("passes an object result through unchanged", async () => {
    installFleet(async () => ({ txHash: "abc123", extra: true }));
    await expect(canopySignAndSubmit(baseParams)).resolves.toEqual({ txHash: "abc123", extra: true });
  });

  it("converts a JSON-RPC 'method not supported' code into WALLET_METHOD_MISSING", async () => {
    installFleet(async () => { throw { code: 4200, message: "Method not found" }; });
    await expect(canopySignAndSubmit(baseParams)).rejects.toMatchObject({
      message: WALLET_METHOD_MISSING,
      code: WALLET_METHOD_MISSING,
    });
  });

  it("converts an 'unsupported method' message into WALLET_METHOD_MISSING even without the code", async () => {
    installFleet(async () => { throw new Error("unsupported method: canopy_signAndSubmit"); });
    await expect(canopySignAndSubmit(baseParams)).rejects.toMatchObject({ code: WALLET_METHOD_MISSING });
  });

  it("does NOT reclassify a real failure like insufficient funds", async () => {
    installFleet(async () => { throw new Error("insufficient funds"); });
    await expect(canopySignAndSubmit(baseParams)).rejects.toThrow("insufficient funds");
  });

  it("does NOT reclassify a user-rejected signature", async () => {
    installFleet(async () => { throw { code: 4001, message: "User rejected the request" }; });
    await expect(canopySignAndSubmit(baseParams)).rejects.toMatchObject({ code: 4001 });
  });
});
