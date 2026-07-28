// Thin client for the Bingo Rush game server (FastAPI + WebSocket).
//
// Base URL is configurable via VITE_API_URL (see .env.example); it defaults to
// the deployed backend behind Traefik. NOTE: if bingo.jfmcss.com is proxied by
// Cloudflare with a bot challenge, fetch/WebSocket calls may be blocked — relax
// the challenge for this hostname or point VITE_API_URL at the origin.

const API_BASE: string =
  ((import.meta as any).env?.VITE_API_URL as string) || "https://bingo.jfmcss.com";

export const apiBase = API_BASE;

export interface Room {
  id: string;
  name: string;
  emoji: string;
  entryFee: number;
  capacity: number;
  difficulty: string;
  advertisedPrize: number;
  rakeBps: number;
  payoutWeightsBps: number[];
}

export interface CreatedRound {
  roundId: string;
  commitment: string;
  entryFee: number;
  rakeBps: number;
  payoutWeightsBps: number[];
}

async function jget<T>(path: string): Promise<T> {
  const r = await fetch(API_BASE + path);
  if (!r.ok) throw new Error(`GET ${path} -> ${r.status}`);
  return r.json() as Promise<T>;
}

async function jpost<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(API_BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  if (!r.ok) throw new Error(`POST ${path} -> ${r.status}`);
  return r.json() as Promise<T>;
}

export const getRooms = () => jget<Room[]>("/rooms");
export const getShop = () => jget<Record<string, unknown[]>>("/shop");

export interface NetworkInfo { chainId: number; networkId: number; rpcUrl: string; }
export const getNetwork = () => jget<NetworkInfo>("/network");

export interface RoundHistoryEntry {
  roundId: string; room: string; entryFee: number; rakeBps: number;
  winners: string[]; delta: number; txHash: string; settledAt: number;
}
export interface WalletInfo {
  address: string; available: number; locked: number; history: RoundHistoryEntry[];
}
export const getWallet = (address: string) => jget<WalletInfo>(`/players/${address}/wallet`);

export interface PlayerStats { address: string; gamesPlayed: number; wins: number; totalWon: number; }
export const getPlayerStats = (address: string) => jget<PlayerStats>(`/players/${address}/stats`);
export const getPlayerHistory = (address: string) => jget<RoundHistoryEntry[]>(`/players/${address}/history`);

export type LeaderboardPeriod = "daily" | "weekly" | "monthly" | "alltime";
export interface LeaderboardEntry { address: string; gamesPlayed: number; wins: number; totalWon: number; }
export const getLeaderboard = (period: LeaderboardPeriod = "alltime", limit = 50) =>
  jget<LeaderboardEntry[]>(`/leaderboard?period=${period}&limit=${limit}`);

export interface CosmeticItem {
  id: string; name: string; emoji: string; priceGems: number;
  effect: string | null; badge: string | null;
}
export const getCosmeticsShop = () => jget<CosmeticItem[]>("/shop/cosmetics");
export const getGems = (address: string) => jget<{ address: string; gems: number }>(`/players/${address}/gems`);
// DEV ONLY: mints test gems until a real payment processor is wired up.
export const topupGems = (address: string, amount = 200) =>
  jpost<{ address: string; gems: number }>(`/players/${address}/gems/topup`, { amount });

export interface RoundInfo {
  roundId: string;
  entryFee: number;   // base entry (uCNPY) for 1 card
  rakeBps: number;
  chainId: number;    // e.g. 405 (graduated Bingo chain)
  networkId: number;
  rpcUrl: string;     // public node RPC the wallet submits the join to
}

// What a wallet needs to build+sign a MessageJoinRoom for a round.
export const getRoundInfo = (roundId: string) =>
  jget<RoundInfo>(`/rounds/${roundId}/info`);

// Register a wallet-signed player after their on-chain bingo_join, so the live
// draw + result reporting include them (on-chain settle already does).
export const registerRound = (roundId: string, address: string, numCards: number) =>
  jpost<{ player: string; numCards: number }>(`/rounds/${roundId}/register`, {
    address, num_cards: numCards,
  });

// The player's card grids, after a wallet-signed join (server holds the seed).
export const getCard = (roundId: string, address: string, numCards: number) =>
  jget<{ player: string; numCards: number; cards: number[][][] }>(
    `/rounds/${roundId}/card?address=${address}&num_cards=${numCards}`,
  );

// Entry cost = base entry × card multiplier (mirrors engine.economy).
export const CARD_COST_MULTIPLIER_BPS: Record<number, number> = { 1: 10000, 2: 18000, 3: 25000, 4: 32000 };
export const entryCost = (baseEntryUcnpy: number, numCards: number) =>
  Math.round((baseEntryUcnpy * (CARD_COST_MULTIPLIER_BPS[numCards] ?? 10000)) / 10000);

export const createRound = (opts?: {
  entry_fee?: number;
  rake_bps?: number;
  payout_weights_bps?: number[];
}) => jpost<CreatedRound>("/rounds", opts);

export const joinRound = (roundId: string, numCards: number) =>
  jpost<{ player: string; numCards: number }>(`/rounds/${roundId}/join`, {
    num_cards: numCards,
  });

// WebSocket for a round's live ball draw. Messages:
//   { type:"ball", index, letter, number }
//   { type:"bingo", balls, winners:[addr] }
//   { type:"settled", balls, winners, payouts:{addr:amount} }
export function roundSocket(roundId: string): WebSocket {
  const wsBase = API_BASE.replace(/^http/, "ws");
  return new WebSocket(`${wsBase}/ws/rounds/${roundId}`);
}

// Ephemeral waiting-room chat for a round. Messages: { type:"chat", user, text }.
export function chatSocket(roundId: string): WebSocket {
  const wsBase = API_BASE.replace(/^http/, "ws");
  return new WebSocket(`${wsBase}/ws/rounds/${roundId}/chat`);
}
