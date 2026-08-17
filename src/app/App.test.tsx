// Regression: real mobile visitors (any viewport <900px, i.e. virtually all
// phones — see main.tsx) were landing on the original Figma design-review
// harness — a "10 Screens" pill picker inside a fixed iPhone-15-shaped frame
// — instead of the real game. The screens themselves were already wired to
// the backend; only the picker/frame chrome around them was the bug.
// Found by /qa on 2026-08-17 against https://bingoapp.jfmcss.com (mobile viewport).
// Report: .gstack/qa-reports/qa-report-bingoapp-jfmcss-com-2026-08-17.md
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "./App";

vi.mock("../lib/api", () => ({
  apiBase: "https://bingo.jfmcss.com",
  getRooms: vi.fn().mockResolvedValue([]),
  getShop: vi.fn().mockResolvedValue({}),
  createRound: vi.fn(),
  joinRound: vi.fn(),
  roundSocket: vi.fn(),
}));

vi.mock("../lib/wallet", () => ({
  waitForFleet: vi.fn().mockResolvedValue(false),
  connectWallet: vi.fn(),
  walletBalance: vi.fn(),
  disconnectWallet: vi.fn(),
}));

describe("App (mobile entry) — no design-review chrome", () => {
  it("does not render the Figma screen-picker/phone-frame harness", async () => {
    render(<App />);
    expect(await screen.findByText(/Tap to Play/i)).toBeInTheDocument();
    expect(screen.queryByText(/Mobile UI Concept/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/10 Screens/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/iPhone 15/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Use the pills above/i)).not.toBeInTheDocument();
  });

  it("does not render the screen-jump pill navigator", async () => {
    render(<App />);
    await screen.findByText(/Tap to Play/i);
    // The old picker rendered one pill button per screen (Splash/Home/Lobby/...).
    expect(screen.queryByRole("button", { name: /^✨ Splash$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^🏠 Home$/ })).not.toBeInTheDocument();
  });
});
