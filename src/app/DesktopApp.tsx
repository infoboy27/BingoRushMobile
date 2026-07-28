// Desktop / web layout for Bingo Rush — same brand as the mobile mockup
// (Fredoka + Nunito, purple/gold palette, B-I-N-G-O balls) but laid out for wide
// screens. Wired to the real backend (rooms, on-chain round, live WebSocket
// draw, on-chain settle) and FleetWallet, reusing src/lib/api.ts + wallet.ts.

import { useEffect, useRef, useState } from "react";
import { apiBase, createRound, joinRound, roundSocket, getRooms, getRoundInfo, getCard, registerRound, entryCost, getNetwork, getCosmeticsShop, getGems, topupGems, getWallet, type Room, type CosmeticItem, type WalletInfo } from "../lib/api";
import { waitForFleet, connectWallet, walletBalance, disconnectWallet, hasFleet, bingoJoin, buyCosmetic, WALLET_METHOD_MISSING } from "../lib/wallet";

const COLS = ["B", "I", "N", "G", "O"];
const COL_COLORS = ["#3B82F6", "#EC4899", "#10B981", "#F59E0B", "#8B5CF6"];
const ROOM_COLORS = ["#3B82F6", "#EC4899", "#F59E0B", "#8B5CF6"];

const MOCK_ROOMS: Room[] = [
  { id: "classic", name: "Classic Room", emoji: "🎱", entryFee: 100, capacity: 20, difficulty: "Easy", advertisedPrize: 2500, rakeBps: 1000, payoutWeightsBps: [10000] },
  { id: "speed", name: "Speed Bingo", emoji: "⚡", entryFee: 250, capacity: 20, difficulty: "Medium", advertisedPrize: 6000, rakeBps: 1000, payoutWeightsBps: [10000] },
  { id: "jackpot", name: "Jackpot Room", emoji: "💰", entryFee: 500, capacity: 20, difficulty: "Hard", advertisedPrize: 25000, rakeBps: 500, payoutWeightsBps: [7000, 2000, 1000] },
  { id: "vip", name: "VIP Lounge", emoji: "👑", entryFee: 1000, capacity: 10, difficulty: "Elite", advertisedPrize: 50000, rakeBps: 500, payoutWeightsBps: [6000, 2500, 1500] },
];

const F = "Fredoka, sans-serif";
const N = "Nunito, sans-serif";

function Ball({ letter, number, size = 84, dim = false }: { letter: string; number: number | string; size?: number; dim?: boolean }) {
  const col = COL_COLORS[COLS.indexOf(letter)] ?? "#8B5CF6";
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: dim ? "#E5E7EB" : `radial-gradient(circle at 38% 30%, rgba(255,255,255,0.92) 0%, ${col} 52%)`,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      boxShadow: dim ? "none" : `0 6px 22px ${col}55`, border: `3px solid ${dim ? "#D1D5DB" : "rgba(255,255,255,0.42)"}`,
    }}>
      <span style={{ fontFamily: F, fontWeight: 700, lineHeight: 1, color: dim ? "#9CA3AF" : "white", fontSize: size * 0.26 }}>{letter}</span>
      <span style={{ fontFamily: F, fontWeight: 700, lineHeight: 1, color: dim ? "#9CA3AF" : "white", fontSize: size * 0.32 }}>{number}</span>
    </div>
  );
}

function WalletButton({ onAccount }: { onAccount?: (a: string | null) => void }) {
  const [avail, setAvail] = useState(false);
  const [addr, setAddr] = useState<string | null>(null);
  const [bal, setBal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { waitForFleet(700).then(setAvail); }, []);
  async function connect() {
    try { setBusy(true); const a = await connectWallet(); setAddr(a.address); onAccount?.(a.address); const b = await walletBalance(); if (b) setBal(`${b.whole} ${b.symbol}`); }
    catch { /* ignore */ } finally { setBusy(false); }
  }
  async function disconnect() { await disconnectWallet(); setAddr(null); setBal(null); onAccount?.(null); }
  const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
  if (addr) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", borderRadius: 100, background: "rgba(16,185,129,0.16)", border: "1px solid rgba(16,185,129,0.35)", color: "white", fontFamily: N, fontSize: 13 }}>
        <span>🦊 <b>{short(addr)}</b></span>
        <span style={{ opacity: 0.75 }}>· {bal ?? "— CNPY"}</span>
        <button onClick={disconnect} style={{ background: "rgba(255,255,255,0.16)", border: "none", color: "white", borderRadius: 100, padding: "4px 10px", cursor: "pointer", fontFamily: N, fontWeight: 700, fontSize: 11 }}>Disconnect</button>
      </div>
    );
  }
  return (
    <button onClick={connect} disabled={!avail || busy} title={avail ? "" : "Install the FleetWallet Chrome extension"} style={{
      padding: "10px 18px", borderRadius: 100, border: "none", cursor: avail && !busy ? "pointer" : "default",
      background: avail ? "linear-gradient(135deg,#6366F1,#8B5CF6)" : "rgba(255,255,255,0.12)", color: "white", fontFamily: F, fontWeight: 700, fontSize: 14,
    }}>{busy ? "Connecting…" : avail ? "🦊 Connect Wallet" : "FleetWallet not detected"}</button>
  );
}

function SkinsModal({ walletAddr, onClose }: { walletAddr: string | null; onClose: () => void }) {
  const [items, setItems] = useState<CosmeticItem[]>([]);
  const [gems, setGems] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [topupBusy, setTopupBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => { getCosmeticsShop().then(setItems).catch(() => {}); }, []);
  useEffect(() => { if (walletAddr) getGems(walletAddr).then(g => setGems(g.gems)).catch(() => {}); }, [walletAddr]);

  async function topup() {
    if (!walletAddr) return;
    setTopupBusy(true); setMsg("");
    try { const g = await topupGems(walletAddr, 200); setGems(g.gems); setMsg("+200 gems added (dev top-up)"); }
    catch (e: any) { setMsg(String(e?.message || e)); }
    finally { setTopupBusy(false); }
  }

  async function buy(item: CosmeticItem) {
    if (!walletAddr || !hasFleet()) { setMsg("Connect FleetWallet first"); return; }
    setBusyId(item.id); setMsg("");
    try {
      const net = await getNetwork();
      await buyCosmetic({ kind: item.id, name: item.name, priceGems: item.priceGems, ...net });
      const g = await getGems(walletAddr); setGems(g.gems);
      setMsg(`${item.name} minted to your wallet ✓`);
    } catch (e: any) {
      setMsg(e?.code === WALLET_METHOD_MISSING ? "Your wallet doesn't support this yet" : String(e?.message || e));
    } finally { setBusyId(null); }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#1E1B4B", borderRadius: 24, padding: 26, width: 480, maxWidth: "92vw", maxHeight: "82vh", overflowY: "auto", border: "1px solid rgba(255,255,255,0.1)", color: "white", fontFamily: N }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <h2 style={{ fontFamily: F, margin: 0, fontSize: 22 }}>🎨 Card Skins</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "white", fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 12, marginBottom: 14 }}>
          Each skin mints a real on-chain cosmetic NFT to your wallet, paid in gems.
        </div>
        {!walletAddr && (
          <div style={{ padding: 12, borderRadius: 12, background: "rgba(239,68,68,0.14)", marginBottom: 14, fontSize: 13 }}>
            Connect FleetWallet to buy skins.
          </div>
        )}
        {walletAddr && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, padding: "10px 14px", borderRadius: 12, background: "rgba(255,255,255,0.06)" }}>
            <span>💎 {gems ?? "—"} gems</span>
            <button onClick={topup} disabled={topupBusy} style={{ background: "rgba(139,92,246,0.28)", border: "none", color: "white", borderRadius: 100, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              {topupBusy ? "Adding…" : "+200 (dev top-up)"}
            </button>
          </div>
        )}
        {msg && <div style={{ fontSize: 12, color: "#FBBF24", marginBottom: 12 }}>{msg}</div>}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {items.map(item => (
            <div key={item.id} style={{ borderRadius: 16, padding: 14, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
              <div style={{ fontSize: 30 }}>{item.emoji}</div>
              <div style={{ fontFamily: F, fontWeight: 700 }}>{item.name}</div>
              {item.badge && <span style={{ fontSize: 10, color: "#FBBF24", fontWeight: 700 }}>{item.badge}</span>}
              <div style={{ fontSize: 13, opacity: 0.7, margin: "4px 0 10px" }}>💎 {item.priceGems} gems</div>
              <button disabled={!walletAddr || busyId === item.id} onClick={() => buy(item)} style={{
                width: "100%", padding: "8px 0", borderRadius: 10, border: "none", cursor: walletAddr ? "pointer" : "default",
                background: walletAddr ? "linear-gradient(135deg,#8B5CF6,#6366F1)" : "rgba(255,255,255,0.1)", color: "white", fontWeight: 700, fontSize: 13,
              }}>{busyId === item.id ? "Confirm in wallet…" : "Buy"}</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function WalletModal({ walletAddr, onClose }: { walletAddr: string | null; onClose: () => void }) {
  const [w, setW] = useState<WalletInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!walletAddr) { setLoading(false); return; }
    getWallet(walletAddr).then(setW).catch(() => {}).finally(() => setLoading(false));
  }, [walletAddr]);

  const coins = (u: number) => (u / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 });
  const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
  const date = (secs: number) => new Date(secs * 1000).toLocaleString();

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#1E1B4B", borderRadius: 24, padding: 26, width: 520, maxWidth: "92vw", maxHeight: "82vh", overflowY: "auto", border: "1px solid rgba(255,255,255,0.1)", color: "white", fontFamily: N }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ fontFamily: F, margin: 0, fontSize: 22 }}>💼 Wallet</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "white", fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>

        {!walletAddr && (
          <div style={{ padding: 12, borderRadius: 12, background: "rgba(239,68,68,0.14)", fontSize: 13 }}>
            Connect FleetWallet to see your balance and history.
          </div>
        )}

        {walletAddr && loading && <div style={{ opacity: 0.6, fontSize: 13 }}>Loading…</div>}

        {walletAddr && w && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 18 }}>
              <div style={{ padding: 16, borderRadius: 16, background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.3)" }}>
                <div style={{ fontSize: 11, opacity: 0.7 }}>Available</div>
                <div style={{ fontFamily: F, fontWeight: 700, fontSize: 22 }}>🪙 {coins(w.available)}</div>
              </div>
              <div style={{ padding: 16, borderRadius: 16, background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.3)" }}>
                <div style={{ fontSize: 11, opacity: 0.7 }}>Locked in rooms</div>
                <div style={{ fontFamily: F, fontWeight: 700, fontSize: 22 }}>🔒 {coins(w.locked)}</div>
              </div>
            </div>

            <div style={{ fontSize: 11, opacity: 0.5, marginBottom: 6 }}>{short(w.address)}</div>

            <h3 style={{ fontFamily: F, fontSize: 15, margin: "18px 0 10px" }}>History</h3>
            {w.history.length === 0 && <div style={{ opacity: 0.5, fontSize: 13 }}>No settled rounds yet.</div>}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {w.history.map(h => (
                <div key={h.roundId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderRadius: 12, background: "rgba(255,255,255,0.05)" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{h.room || "Room"}</div>
                    <div style={{ fontSize: 11, opacity: 0.5 }}>{date(h.settledAt)} · tx {h.txHash.slice(0, 8)}…</div>
                  </div>
                  <div style={{ fontFamily: F, fontWeight: 700, fontSize: 14, color: h.delta > 0 ? "#34D399" : "rgba(255,255,255,0.6)" }}>
                    {h.delta > 0 ? "+" : ""}{coins(h.delta)}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

type GameState = {
  roundId: string; room: Room; numCards: number; playerAddr: string; card: number[][];
  current: { l: string; n: number } | null; recent: { l: string; n: number }[]; marked: Set<number>; count: number;
  status: string; done: boolean; won?: boolean; wonCoins?: number;
};

export default function DesktopApp() {
  const [rooms, setRooms] = useState<Room[]>(MOCK_ROOMS);
  const [live, setLive] = useState(false);
  const [numCards, setNumCards] = useState(1);
  const [game, setGame] = useState<GameState | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [err, setErr] = useState("");
  const [walletAddr, setWalletAddr] = useState<string | null>(null);
  const [skinsOpen, setSkinsOpen] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => { getRooms().then(r => { if (r?.length) { setRooms(r); setLive(true); } }).catch(() => {}); }, []);
  useEffect(() => () => wsRef.current?.close(), []);

  async function play(room: Room) {
    try {
      setBusy(true); setErr("");
      setProgress("Opening round on-chain… (1/3)");
      const r = await createRound({ entry_fee: Math.round(room.entryFee * 1_000_000), rake_bps: room.rakeBps, payout_weights_bps: [10000] });

      // If a FleetWallet is connected, the PLAYER signs their own entry
      // (bingo_join). Otherwise the server provisions a demo player.
      let myAddr = "";
      let myCards: number[][][] = [];
      if (walletAddr && hasFleet()) {
        try {
          const info = await getRoundInfo(r.roundId);
          const amount = entryCost(info.entryFee, numCards);
          setProgress("Approve the join in your wallet… (2/3)");
          await bingoJoin({ roundId: r.roundId, numCards, amount, rpcUrl: info.rpcUrl, chainId: info.chainId, networkId: info.networkId });
          await registerRound(r.roundId, walletAddr, numCards);
          const c = await getCard(r.roundId, walletAddr, numCards);
          myAddr = walletAddr; myCards = c.cards;
        } catch (e: any) {
          if (e?.code !== WALLET_METHOD_MISSING) throw e;
          // wallet can't sign this yet → fall back to a server-provisioned player
          const me = await joinRound(r.roundId, numCards); myAddr = me.player; myCards = me.cards;
        }
      } else {
        setProgress("Escrowing your entry… (2/3)");
        const me = await joinRound(r.roundId, numCards); myAddr = me.player; myCards = me.cards;
      }

      setProgress("Adding an opponent… (3/3)");
      await joinRound(r.roundId, 1); // one bot opponent
      setProgress("");
      const g: GameState = {
        roundId: r.roundId, room, numCards, playerAddr: myAddr, card: myCards[0],
        current: null, recent: [], marked: new Set(), count: 0, status: "Waiting for the draw…", done: false,
      };
      setGame(g);
      setBusy(false);
      const ws = roundSocket(r.roundId); wsRef.current = ws;
      ws.onmessage = (ev) => {
        const m = JSON.parse(ev.data);
        setGame(prev => {
          if (!prev) return prev;
          if (m.type === "ball") {
            const marked = new Set(prev.marked); marked.add(m.number);
            return { ...prev, current: { l: m.letter, n: m.number }, count: m.index, marked, status: "Drawing…", recent: [{ l: m.letter, n: m.number }, ...prev.recent].slice(0, 6) };
          }
          if (m.type === "bingo") return { ...prev, status: `BINGO at ball ${m.balls}! Settling on-chain…` };
          if (m.type === "settled") {
            const mine = (m.payouts || {})[prev.playerAddr] || 0;
            return { ...prev, done: true, won: mine > 0, wonCoins: Math.round(mine / 1_000_000), status: mine > 0 ? "You won! Paid from escrow ✓" : "So close! The bot got there first." };
          }
          return prev;
        });
      };
      ws.onerror = () => setGame(prev => prev ? { ...prev, status: "connection error", done: true } : prev);
    } catch (e: any) { setErr(String(e?.message || e)); setBusy(false); }
  }

  function exit() { wsRef.current?.close(); setGame(null); }

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(160deg,#2E1065 0%,#1E1B4B 45%,#0F172A 100%)", color: "white", fontFamily: N }}>
      {/* Header */}
      <header style={{ display: "flex", alignItems: "center", gap: 16, padding: "18px 32px", borderBottom: "1px solid rgba(255,255,255,0.08)", position: "sticky", top: 0, backdropFilter: "blur(8px)", background: "rgba(15,23,42,0.55)", zIndex: 10 }}>
        <div onClick={exit} style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "linear-gradient(140deg,#FBBF24,#F59E0B)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, boxShadow: "0 0 30px #FBBF2455" }}>🎱</div>
          <div>
            <div style={{ fontFamily: F, fontWeight: 700, fontSize: 22, lineHeight: 1 }}>Bingo Rush</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>provably-fair · on-chain</div>
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={() => setWalletOpen(true)} style={{ marginRight: 8, background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)", color: "white", borderRadius: 100, padding: "9px 16px", fontFamily: F, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
          💼 Wallet
        </button>
        <button onClick={() => setSkinsOpen(true)} style={{ marginRight: 12, background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)", color: "white", borderRadius: 100, padding: "9px 16px", fontFamily: F, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
          🎨 Skins
        </button>
        <WalletButton onAccount={setWalletAddr} />
      </header>
      {skinsOpen && <SkinsModal walletAddr={walletAddr} onClose={() => setSkinsOpen(false)} />}
      {walletOpen && <WalletModal walletAddr={walletAddr} onClose={() => setWalletOpen(false)} />}

      {!game ? (
        /* ── Lobby ─────────────────────────────────────────────── */
        <main style={{ maxWidth: 1120, margin: "0 auto", padding: "40px 32px 64px" }}>
          <div style={{ textAlign: "center", marginBottom: 8 }}>
            <h1 style={{ fontFamily: F, fontWeight: 700, fontSize: 44, margin: 0 }}>Choose a Room</h1>
            <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 15, marginTop: 8 }}>
              Pick your cards, join on-chain, watch the live draw, and win the pot.
            </p>
            <div style={{ fontSize: 12, marginTop: 6, color: live ? "#34D399" : "rgba(255,255,255,0.4)" }}>
              {live ? "● live rooms" : "○ demo rooms (backend offline)"} · {apiBase}
            </div>
          </div>

          {/* Card count selector */}
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12, margin: "28px 0" }}>
            <span style={{ color: "rgba(255,255,255,0.7)", fontFamily: F, fontWeight: 600 }}>Cards:</span>
            {[1, 2, 3, 4].map(n => (
              <button key={n} onClick={() => setNumCards(n)} style={{
                width: 46, height: 46, borderRadius: 12, fontFamily: F, fontWeight: 700, fontSize: 20, cursor: "pointer",
                background: numCards === n ? "white" : "rgba(255,255,255,0.1)", color: numCards === n ? "#6D28D9" : "white",
                border: numCards === n ? "3px solid #FBBF24" : "3px solid transparent",
              }}>{n}</button>
            ))}
            <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 13 }}>+{numCards * 8}% odds</span>
          </div>

          {busy && progress && (
            <div style={{ maxWidth: 520, margin: "0 auto 20px", padding: "14px 18px", borderRadius: 14, background: "rgba(139,92,246,0.16)", border: "1px solid rgba(139,92,246,0.35)", textAlign: "center" }}>
              <div style={{ fontFamily: F, fontWeight: 700, fontSize: 15 }}>⏳ {progress}</div>
              <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 10 }}>
                {[1, 2, 3].map(s => {
                  const cur = Number((progress.match(/\((\d)\/3\)/) || [])[1] || 0);
                  return <div key={s} style={{ width: 60, height: 6, borderRadius: 3, background: s <= cur ? "#8B5CF6" : "rgba(255,255,255,0.15)" }} />;
                })}
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 8 }}>each step is a real on-chain transaction (~4s/block)</div>
            </div>
          )}
          {err && <div style={{ textAlign: "center", color: "#FCA5A5", marginBottom: 16 }}>{err}</div>}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 20 }}>
            {rooms.map((room, i) => {
              const c = ROOM_COLORS[i % ROOM_COLORS.length];
              return (
                <div key={room.id || room.name} style={{ borderRadius: 22, padding: 22, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 10px 30px rgba(0,0,0,0.25)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
                    <div style={{ width: 58, height: 58, borderRadius: 16, background: `${c}22`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30 }}>{room.emoji}</div>
                    <div>
                      <div style={{ fontFamily: F, fontWeight: 700, fontSize: 20 }}>{room.name}</div>
                      <span style={{ padding: "2px 10px", borderRadius: 100, background: `${c}22`, color: c, fontWeight: 800, fontSize: 11 }}>{room.difficulty}</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 18 }}>
                    <div><div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>Entry</div><div style={{ fontFamily: F, fontWeight: 700, fontSize: 18 }}>🪙 {room.entryFee}</div></div>
                    <div style={{ textAlign: "right" }}><div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>Max prize</div><div style={{ fontFamily: F, fontWeight: 700, fontSize: 18, color: "#FBBF24" }}>🪙 {Number(room.advertisedPrize).toLocaleString()}</div></div>
                  </div>
                  <button onClick={() => play(room)} disabled={busy} style={{
                    width: "100%", padding: "13px 0", borderRadius: 14, border: "none", cursor: busy ? "default" : "pointer",
                    background: busy ? "rgba(255,255,255,0.15)" : `linear-gradient(135deg,${c},#8B5CF6)`, color: "white", fontFamily: F, fontWeight: 700, fontSize: 17,
                  }}>{busy ? "Opening round…" : `Play ▶`}</button>
                </div>
              );
            })}
          </div>
        </main>
      ) : (
        /* ── Game ──────────────────────────────────────────────── */
        <main style={{ maxWidth: 1120, margin: "0 auto", padding: "32px", display: "grid", gridTemplateColumns: "1fr 360px", gap: 28, alignItems: "start" }}>
          {/* Left: card */}
          <section>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
              <button onClick={exit} style={{ background: "rgba(255,255,255,0.1)", border: "none", color: "white", borderRadius: 10, padding: "8px 14px", cursor: "pointer", fontFamily: N, fontWeight: 700 }}>← Lobby</button>
              <h2 style={{ fontFamily: F, fontWeight: 700, fontSize: 24, margin: 0 }}>{game.room.name}</h2>
              <span style={{ marginLeft: "auto", fontFamily: N, color: "rgba(255,255,255,0.6)" }}>🃏 {game.numCards} · 🔢 {game.count}</span>
            </div>

            <div style={{ borderRadius: 24, overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.5)", border: "2px solid rgba(255,255,255,0.08)", maxWidth: 560 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)" }}>
                {COLS.map((c, ci) => (
                  <div key={c} style={{ padding: "12px 0", textAlign: "center", background: COL_COLORS[ci] }}>
                    <span style={{ fontFamily: F, fontWeight: 700, fontSize: 28, color: "white" }}>{c}</span>
                  </div>
                ))}
              </div>
              <div style={{ background: "white", padding: 10, display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 6 }}>
                {game.card.flatMap((row, ri) => row.map((num, ci) => {
                  const free = num === 0;
                  const mk = free || game.marked.has(num);
                  return (
                    <div key={`${ri}-${ci}`} style={{
                      aspectRatio: "1", borderRadius: 12, border: `2px solid ${mk ? COL_COLORS[ci] : "#E9EAEC"}`,
                      background: mk ? `${COL_COLORS[ci]}1E` : "#FAFAFA", display: "flex", alignItems: "center", justifyContent: "center", position: "relative",
                    }}>
                      {free ? <span style={{ fontFamily: F, fontWeight: 700, fontSize: 14, color: "#7C3AED" }}>FREE</span>
                        : <span style={{ fontFamily: F, fontWeight: 700, fontSize: 24, color: mk ? COL_COLORS[ci] : "#374151" }}>{num}</span>}
                    </div>
                  );
                }))}
              </div>
            </div>
          </section>

          {/* Right: draw + status */}
          <aside style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ borderRadius: 20, padding: 24, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", textAlign: "center" }}>
              <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "rgba(255,255,255,0.4)", marginBottom: 12 }}>{game.count ? `Ball ${game.count}` : "Get ready"}</div>
              <div style={{ display: "flex", justifyContent: "center" }}>
                {game.current ? <Ball letter={game.current.l} number={game.current.n} size={96} />
                  : <div style={{ width: 96, height: 96, borderRadius: "50%", background: "rgba(255,255,255,0.08)", border: "3px solid rgba(255,255,255,0.15)" }} />}
              </div>
              <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 18, minHeight: 42 }}>
                {game.recent.map((b, i) => <Ball key={i} letter={b.l} number={b.n} size={38} dim={i > 2} />)}
              </div>
            </div>

            <div style={{ borderRadius: 20, padding: "18px 20px", background: game.done ? (game.won ? "rgba(251,191,36,0.14)" : "rgba(255,255,255,0.05)") : "rgba(139,92,246,0.14)", border: `1px solid ${game.done && game.won ? "rgba(251,191,36,0.4)" : "rgba(255,255,255,0.12)"}` }}>
              {game.done && game.won ? (
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 40 }}>🏆</div>
                  <div style={{ fontFamily: F, fontWeight: 700, fontSize: 30, color: "#FBBF24" }}>BINGO!</div>
                  <div style={{ fontFamily: F, fontWeight: 700, fontSize: 18, marginTop: 4 }}>🪙 +{(game.wonCoins ?? 0).toLocaleString()} coins</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginTop: 4 }}>paid from escrow · on-chain ✓</div>
                </div>
              ) : (
                <div style={{ textAlign: "center", fontFamily: F, fontWeight: 600, fontSize: 16 }}>{game.status}</div>
              )}
            </div>

            {game.done && (
              <button onClick={exit} style={{ padding: "14px 0", borderRadius: 14, border: "none", cursor: "pointer", background: "linear-gradient(135deg,#8B5CF6,#EC4899)", color: "white", fontFamily: F, fontWeight: 700, fontSize: 17 }}>Play again ▶</button>
            )}

            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", textAlign: "center" }}>
              Balls drawn from a commit-reveal seed · winner verified & paid on-chain
            </div>
          </aside>
        </main>
      )}
    </div>
  );
}
