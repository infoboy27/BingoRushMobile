// Regression: shell view (Home/Games/Rooms/Leaderboard) reset to Home on
// every page reload — there's no URL routing for these sections, they're
// plain React state, so a refresh silently discarded the player's place.
// Found by /qa on 2026-08-13 while screenshotting the Games Lobby (the
// browse tool's screenshot triggers a reload; the app landed back on Home).
// Report: .gstack/qa-reports/qa-report-bingoapp-jfmcss-com-2026-08-13.md
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import DesktopApp from "./DesktopApp";

vi.mock("../lib/api", () => ({
  apiBase: "https://bingo.jfmcss.com",
  getRooms: vi.fn().mockResolvedValue([]),
  createRound: vi.fn(),
  joinRound: vi.fn(),
  roundSocket: vi.fn(),
  chatSocket: vi.fn(),
  getRoundInfo: vi.fn(),
  getCard: vi.fn(),
  registerRound: vi.fn(),
  entryCost: (base: number) => base,
  getNetwork: vi.fn(),
  getCosmeticsShop: vi.fn().mockResolvedValue([]),
  getGems: vi.fn(),
  topupGems: vi.fn(),
  getWallet: vi.fn(),
  getPlayerStats: vi.fn(),
  getPlayerHistory: vi.fn(),
  getLeaderboard: vi.fn().mockResolvedValue([]),
}));

vi.mock("../lib/wallet", () => ({
  waitForFleet: vi.fn().mockResolvedValue(false),
  connectWallet: vi.fn(),
  tryReconnect: vi.fn().mockResolvedValue(null),
  walletBalance: vi.fn(),
  disconnectWallet: vi.fn(),
  hasFleet: () => false,
  bingoJoin: vi.fn(),
  buyCosmetic: vi.fn(),
  WALLET_METHOD_MISSING: "WALLET_METHOD_MISSING",
}));

describe("DesktopApp shell view persistence", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("defaults to Home when nothing is saved", async () => {
    render(<DesktopApp />);
    expect(await screen.findByText(/Welcome to Bingo Rush/i)).toBeInTheDocument();
  });

  it("restores the last-viewed section from sessionStorage after a reload", async () => {
    sessionStorage.setItem("brView", "games");
    render(<DesktopApp />);
    expect(await screen.findByRole("heading", { name: "Games" })).toBeInTheDocument();
  });

  it("ignores a corrupted/unknown saved view and falls back to Home", async () => {
    sessionStorage.setItem("brView", "some-garbage-value");
    render(<DesktopApp />);
    expect(await screen.findByText(/Welcome to Bingo Rush/i)).toBeInTheDocument();
  });

  it("persists the current view to sessionStorage as the user navigates", async () => {
    render(<DesktopApp />);
    // The sidebar button renders icon and label as separate <span>s
    // ("🎮"+"Games", no space) so text queries need the full textContent.
    const gamesNavButton = await screen.findByText((_content, el) => el?.tagName === "BUTTON" && el.textContent === "🎮Games");
    gamesNavButton.click();
    expect(await screen.findByRole("heading", { name: "Games" })).toBeInTheDocument();
    expect(sessionStorage.getItem("brView")).toBe("games");
  });
});
