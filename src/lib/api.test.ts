// Regression coverage for entryCost — the card-count price multiplier lookup
// that decides how much a wallet-signed room join actually costs. Added by
// /qa on 2026-08-13 as part of bootstrapping the test framework; not tied to
// a specific found bug, but this is the riskiest pure-logic function in the
// dApp (a wrong multiplier means over/undercharging a real on-chain join).
import { describe, it, expect } from "vitest";
import { entryCost, CARD_COST_MULTIPLIER_BPS } from "./api";

describe("entryCost", () => {
  it("charges the base entry fee for 1 card (10000 bps = 1x)", () => {
    expect(entryCost(100_000_000, 1)).toBe(100_000_000);
  });

  it("applies the 2-card multiplier (18000 bps = 1.8x)", () => {
    expect(entryCost(100_000_000, 2)).toBe(180_000_000);
  });

  it("applies the 3-card multiplier (25000 bps = 2.5x)", () => {
    expect(entryCost(100_000_000, 3)).toBe(250_000_000);
  });

  it("applies the 4-card multiplier (32000 bps = 3.2x)", () => {
    expect(entryCost(100_000_000, 4)).toBe(320_000_000);
  });

  it("falls back to 1x for an unconfigured card count instead of throwing", () => {
    // CARD_COST_MULTIPLIER_BPS has no entry for 5 cards — the ?? 10000
    // fallback must kick in rather than producing NaN/undefined pricing.
    expect(CARD_COST_MULTIPLIER_BPS[5]).toBeUndefined();
    expect(entryCost(100_000_000, 5)).toBe(100_000_000);
  });

  it("rounds to the nearest whole uCNPY", () => {
    // 3 * 18000 / 10000 = 5.4 -> rounds to 5
    expect(entryCost(3, 2)).toBe(5);
  });
});
