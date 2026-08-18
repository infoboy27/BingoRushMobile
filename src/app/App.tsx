import { useState, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import {
  Settings, Play, ArrowLeft, Check,
  Volume2, VolumeX, MessageCircle, ChevronRight,
} from "lucide-react";
import { apiBase, createRound, joinRound, roundSocket, getRooms, getShop } from "../lib/api";
import { waitForFleet, connectWallet, walletBalance, disconnectWallet } from "../lib/wallet";

// Shared session for the real on-chain play flow (Lobby → Cards → Game → Win).
type Session = {
  roomName?: string;
  roomColor?: string;
  entryFee?: number;      // display coins
  rakeBps?: number;
  weights?: number[];
  numCards: number;
  roundId?: string;
  playerAddr?: string;
  cards?: number[][][];   // player's real card grids (row-major 5x5, 0 = FREE)
  payouts?: Record<string, number>;
  winners?: string[];
  wonCoins?: number;      // coins the player won at settle (0 if lost)
};
const DEFAULT_SESSION: Session = { numCards: 1 };

type Screen =
  | "splash" | "home" | "lobby" | "cards"
  | "game" | "win" | "lose" | "shop" | "profile" | "daily" | "live";

// ─── Design tokens ────────────────────────────────────────────────────────────
const COLS = ["B", "I", "N", "G", "O"];
const COL_COLORS = ["#3B82F6", "#EC4899", "#10B981", "#D4AF6A", "#8B5CF6"];

// Bingo card — -1 = FREE center square
const CARD = [
  [7,  20, 35, 52, 65],
  [3,  27, 42, 58, 71],
  [1,  16, -1, 46, 70],
  [13, 29, 33, 55, 62],
  [5,  21, 44, 48, 68],
];
const INIT_MARKED = new Set<number>([7, 20, 52, 3]);
const RECENT: { l: string; n: number }[] = [
  { l: "B", n: 7 }, { l: "G", n: 52 }, { l: "I", n: 20 },
  { l: "B", n: 3 }, { l: "O", n: 65 },
];

// Fixed confetti positions for the Win screen
const CONFETTI = [
  { x: 8,  y: 10, c: "#D4AF6A", r: true  }, { x: 22, y: 5,  c: "#EC4899", r: false },
  { x: 40, y: 18, c: "#10B981", r: true  }, { x: 60, y: 4,  c: "#3B82F6", r: false },
  { x: 78, y: 14, c: "#8B5CF6", r: true  }, { x: 12, y: 32, c: "#EC4899", r: false },
  { x: 30, y: 8,  c: "#D4AF6A", r: true  }, { x: 52, y: 28, c: "#10B981", r: false },
  { x: 70, y: 22, c: "#3B82F6", r: true  }, { x: 88, y: 36, c: "#8B5CF6", r: false },
  { x: 18, y: 50, c: "#D4AF6A", r: true  }, { x: 42, y: 44, c: "#EC4899", r: false },
  { x: 62, y: 48, c: "#10B981", r: true  }, { x: 84, y: 56, c: "#3B82F6", r: false },
  { x: 6,  y: 62, c: "#8B5CF6", r: true  }, { x: 35, y: 68, c: "#D4AF6A", r: false },
  { x: 72, y: 72, c: "#EC4899", r: true  }, { x: 50, y: 60, c: "#10B981", r: false },
  { x: 92, y: 20, c: "#D4AF6A", r: true  }, { x: 25, y: 42, c: "#3B82F6", r: false },
];

// ─── Shared components ────────────────────────────────────────────────────────

function StatusBar() {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 24px 4px", fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.88)", fontFamily: "General Sans, sans-serif" }}>
      <span>9:41</span>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <span style={{ fontSize: 8, letterSpacing: 1 }}>●●●●</span>
        <span>WiFi</span>
        <span>🔋</span>
      </div>
    </div>
  );
}

function PhoneScreen({ children, bg }: { children: ReactNode; bg: string }) {
  return (
    <div style={{ position: "absolute", inset: 0, overflowY: "auto", overflowX: "hidden", background: bg }}>
      {children}
    </div>
  );
}

function BingoBall({ letter, number, size = 56, dim = false }: { letter: string; number: number | string; size?: number; dim?: boolean }) {
  const i = COLS.indexOf(letter as string);
  const col = COL_COLORS[i] ?? "#8B5CF6";
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: dim ? "#E5E7EB" : `radial-gradient(circle at 38% 30%, rgba(255,255,255,0.92) 0%, ${col} 52%)`,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      boxShadow: dim ? "none" : `0 4px 18px ${col}55`,
      border: `3px solid ${dim ? "#D1D5DB" : "rgba(255,255,255,0.42)"}`,
    }}>
      <span style={{ fontFamily: "Fraunces, serif", fontWeight: 700, lineHeight: 1, color: dim ? "#9CA3AF" : "white", fontSize: size * 0.26 }}>{letter}</span>
      <span style={{ fontFamily: "Fraunces, serif", fontWeight: 700, lineHeight: 1, color: dim ? "#9CA3AF" : "white", fontSize: size * 0.31 }}>{number}</span>
    </div>
  );
}

function BackBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(255,255,255,0.14)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <ArrowLeft size={17} color="white" />
    </button>
  );
}

function Pill({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 100, background: "rgba(255,255,255,0.13)", backdropFilter: "blur(8px)" }}>
      {children}
    </div>
  );
}

// ─── 1. Splash ────────────────────────────────────────────────────────────────
function SplashScreen({ go }: { go: (s: Screen) => void }) {
  const balls = [
    { l: "B", n: 12, x: 6,  y: 14, s: 52 },
    { l: "I", n: 24, x: 72, y: 8,  s: 44 },
    { l: "N", n: 37, x: 80, y: 47, s: 58 },
    { l: "G", n: 51, x: 4,  y: 58, s: 46 },
    { l: "O", n: 72, x: 68, y: 76, s: 54 },
    { l: "B", n: 5,  x: 28, y: 84, s: 38 },
    { l: "I", n: 18, x: 55, y: 10, s: 34 },
    { l: "G", n: 48, x: 12, y: 36, s: 42 },
  ] as const;

  return (
    <PhoneScreen bg="radial-gradient(ellipse 600px 500px at 50% 20%, rgba(109,40,217,0.28), transparent 70%), #0A0B14">
      <StatusBar />
      {/* Decorative floating balls */}
      {balls.map((b, idx) => {
        const ci = COLS.indexOf(b.l);
        return (
          <div key={idx} style={{
            position: "absolute", left: `${b.x}%`, top: `${b.y}%`,
            width: b.s, height: b.s, borderRadius: "50%",
            background: `radial-gradient(circle at 38% 30%, rgba(255,255,255,0.88) 0%, ${COL_COLORS[ci]} 52%)`,
            border: "3px solid rgba(255,255,255,0.22)",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            opacity: 0.62, boxShadow: `0 8px 28px ${COL_COLORS[ci]}42`, pointerEvents: "none",
            animation: `float ${2.4 + idx * 0.3}s ease-in-out infinite`,
            animationDelay: `${idx * 0.22}s`,
          }}>
            <span style={{ fontFamily: "Fraunces, serif", fontWeight: 700, fontSize: b.s * 0.27, color: "white", lineHeight: 1 }}>{b.l}</span>
            <span style={{ fontFamily: "Fraunces, serif", fontWeight: 700, fontSize: b.s * 0.31, color: "white", lineHeight: 1 }}>{b.n}</span>
          </div>
        );
      })}
      {/* Center content */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 130, paddingLeft: 32, paddingRight: 32, paddingBottom: 40 }}>
        {/* Logo */}
        <div style={{
          width: 124, height: 124, borderRadius: 36,
          background: "linear-gradient(140deg,#E6C687 0%,#D4AF6A 60%,#B8934F 100%)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 64, marginBottom: 24,
          boxShadow: "0 0 80px rgba(212,175,106,0.45), 0 20px 56px rgba(0,0,0,0.45)",
          border: "4px solid rgba(255,255,255,0.28)",
          animation: "pulse 3s ease-in-out infinite",
        }}>🎱</div>
        <h1 style={{ fontFamily: "Fraunces, serif", fontWeight: 700, fontSize: 54, color: "white", lineHeight: 1, marginBottom: 10, textShadow: "0 4px 24px rgba(0,0,0,0.5)", letterSpacing: -1 }}>
          Casino Rush
        </h1>
        <p style={{ fontFamily: "General Sans, sans-serif", color: "rgba(255,255,255,0.6)", fontSize: 17, marginBottom: 72, textAlign: "center" }}>
          The Ultimate Bingo Experience ✨
        </p>
        {/* Loading animation */}
        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{
              width: 11, height: 11, borderRadius: "50%",
              background: ["#D4AF6A", "#EC4899", "#8B5CF6"][i],
              animation: "loadDot 1.2s ease-in-out infinite",
              animationDelay: `${i * 0.22}s`,
            }} />
          ))}
        </div>
        <p style={{ fontFamily: "General Sans, sans-serif", color: "rgba(255,255,255,0.38)", fontSize: 13, marginBottom: 52 }}>Loading your game…</p>
        <button onClick={() => go("home")} style={{
          padding: "18px 56px", borderRadius: 100,
          background: "linear-gradient(135deg,#E6C687 0%,#D4AF6A 100%)",
          color: "#1A0A2E", fontFamily: "Fraunces, serif",
          fontWeight: 700, fontSize: 22, border: "none", cursor: "pointer",
          boxShadow: "0 8px 36px rgba(212,175,106,0.4), 0 2px 0 #B8934F",
          letterSpacing: 0.3,
        }}>▶  Tap to Play</button>
      </div>
    </PhoneScreen>
  );
}

// ─── 2. Home ──────────────────────────────────────────────────────────────────
function HomeScreen({ go }: { go: (s: Screen) => void }) {
  const secondaryBtns: { e: string; l: string; bg: string; s: Screen }[] = [
    { e: "🎁", l: "Daily Reward", bg: "linear-gradient(135deg,#10B981,#059669)", s: "daily" },
    { e: "🛒", l: "Shop",         bg: "linear-gradient(135deg,#3B82F6,#1D4ED8)", s: "shop"  },
    { e: "🏆", l: "Leaderboard", bg: "linear-gradient(135deg,#D4AF6A,#D97706)", s: "profile"},
    { e: "👤", l: "Profile",      bg: "linear-gradient(135deg,#EC4899,#BE185D)", s: "profile"},
  ];
  return (
    <PhoneScreen bg="radial-gradient(ellipse 500px 400px at 50% 0%, rgba(109,40,217,0.24), transparent 65%), #0A0B14">
      <StatusBar />
      {/* Top bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 16px 12px" }}>
        <div style={{ width: 46, height: 46, borderRadius: "50%", background: "linear-gradient(135deg,#D4AF6A,#EC4899)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, border: "2.5px solid rgba(255,255,255,0.42)", flexShrink: 0 }}>🦊</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "Fraunces, serif", color: "white", fontWeight: 700, fontSize: 16, lineHeight: 1.2 }}>StarPlayer99</div>
          <div style={{ color: "rgba(255,255,255,0.62)", fontSize: 12, fontFamily: "General Sans, sans-serif" }}>Level 24 · Pro</div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <Pill><span style={{ fontSize: 14 }}>🪙</span><span style={{ fontFamily: "Fraunces, serif", color: "#D4AF6A", fontWeight: 700, fontSize: 13 }}>4,250</span></Pill>
          <Pill><span style={{ fontSize: 14 }}>💎</span><span style={{ fontFamily: "Fraunces, serif", color: "#A5F3FC", fontWeight: 700, fontSize: 13 }}>120</span></Pill>
          <button style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(255,255,255,0.14)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Settings size={16} color="rgba(255,255,255,0.88)" />
          </button>
        </div>
      </div>

      {/* Weekend Jackpot banner */}
      <div style={{ margin: "0 16px 14px", padding: "14px 16px", borderRadius: 24, background: "linear-gradient(135deg,#E6C687,#D4AF6A)", boxShadow: "0 8px 30px rgba(212,175,106,0.35)", display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
        <span style={{ fontSize: 34 }}>🏆</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "Fraunces, serif", fontWeight: 700, fontSize: 17, color: "#1A0A2E" }}>Weekend Jackpot</div>
          <div style={{ fontFamily: "General Sans, sans-serif", fontSize: 12, color: "#78350F" }}>💎 5,000 gem prize pool · Ends Sunday</div>
        </div>
        <ChevronRight size={18} color="#78350F" />
      </div>

      {/* Play Now */}
      <div style={{ padding: "0 16px 12px" }}>
        <button onClick={() => go("lobby")} style={{ width: "100%", padding: "20px 0", borderRadius: 28, display: "flex", alignItems: "center", justifyContent: "center", gap: 12, background: "linear-gradient(135deg,#8B5CF6,#EC4899)", boxShadow: "0 12px 44px #8B5CF668", border: "none", cursor: "pointer" }}>
          <Play size={28} fill="white" color="white" />
          <span style={{ fontFamily: "Fraunces, serif", fontWeight: 700, fontSize: 28, color: "white" }}>Play Now!</span>
        </button>
      </div>

      {/* Secondary grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, padding: "0 16px 14px" }}>
        {secondaryBtns.map(btn => (
          <button key={btn.l} onClick={() => go(btn.s)} style={{ padding: "14px 16px", borderRadius: 20, display: "flex", alignItems: "center", gap: 10, background: btn.bg, border: "none", cursor: "pointer", boxShadow: "0 4px 18px rgba(0,0,0,0.2)" }}>
            <span style={{ fontSize: 28 }}>{btn.e}</span>
            <span style={{ fontFamily: "Fraunces, serif", fontWeight: 600, fontSize: 15, color: "white" }}>{btn.l}</span>
          </button>
        ))}
      </div>

      {/* Stats strip */}
      <div style={{ margin: "0 16px", padding: "14px 20px", borderRadius: 24, background: "#14151F", border: "1px solid rgba(255,255,255,0.08)", display: "flex", justifyContent: "space-around" }}>
        {[
          { l: "Wins",   v: "847",  e: "🏆" },
          { l: "Streak", v: "7 🔥", e: ""   },
          { l: "Rank",   v: "#142", e: "⭐" },
        ].map(s => (
          <div key={s.l} style={{ textAlign: "center" }}>
            <div style={{ fontFamily: "Fraunces, serif", fontWeight: 700, fontSize: 20, color: "#D4AF6A" }}>{s.v}</div>
            <div style={{ fontFamily: "General Sans, sans-serif", fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{s.l}</div>
          </div>
        ))}
      </div>
      <div style={{ height: 24 }} />
    </PhoneScreen>
  );
}

// ─── 3. Lobby ─────────────────────────────────────────────────────────────────
const ROOM_COLORS = ["#3B82F6", "#EC4899", "#D4AF6A", "#8B5CF6"];
const MOCK_ROOMS = [
  { id: "classic", name: "Classic Room", emoji: "🎱", entryFee: 100,  advertisedPrize: 2500,  capacity: 20, difficulty: "Easy",   rakeBps: 1000, payoutWeightsBps: [10000] },
  { id: "speed",   name: "Speed Bingo",  emoji: "⚡",  entryFee: 250,  advertisedPrize: 6000,  capacity: 20, difficulty: "Medium", rakeBps: 1000, payoutWeightsBps: [10000] },
  { id: "jackpot", name: "Jackpot Room", emoji: "💰", entryFee: 500,  advertisedPrize: 25000, capacity: 20, difficulty: "Hard",   rakeBps: 500,  payoutWeightsBps: [7000, 2000, 1000] },
  { id: "vip",     name: "VIP Lounge",   emoji: "👑", entryFee: 1000, advertisedPrize: 50000, capacity: 10, difficulty: "Elite",  rakeBps: 500,  payoutWeightsBps: [6000, 2500, 1500] },
];
function LobbyScreen({ go, setSess }: { go: (s: Screen) => void; setSess: (s: Session) => void }) {
  const [tab, setTab] = useState(0);
  const tabs = ["Classic", "Fast", "Jackpot", "VIP"];
  const [rooms, setRooms] = useState<any[]>(MOCK_ROOMS);
  const [live, setLive] = useState(false);

  useEffect(() => {
    getRooms().then(r => { if (Array.isArray(r) && r.length) { setRooms(r); setLive(true); } }).catch(() => {});
  }, []);

  const join = (room: any, color: string) => {
    setSess({
      ...DEFAULT_SESSION,
      roomName: room.name, roomColor: color, entryFee: room.entryFee,
      rakeBps: room.rakeBps, weights: room.payoutWeightsBps,
    });
    go("cards");
  };

  return (
    <PhoneScreen bg="radial-gradient(ellipse 500px 400px at 50% 0%, rgba(109,40,217,0.2), transparent 65%), #0A0B14">
      <StatusBar />
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 16px 14px" }}>
        <BackBtn onClick={() => go("home")} />
        <h2 style={{ fontFamily: "Fraunces, serif", fontWeight: 700, fontSize: 24, color: "white", flex: 1, margin: 0 }}>Game Rooms</h2>
        <Pill><span>🪙</span><span style={{ fontFamily: "Fraunces, serif", color: "#D4AF6A", fontWeight: 700, fontSize: 13 }}>4,250</span></Pill>
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 8, padding: "0 16px 14px" }}>
        {tabs.map((t, i) => (
          <button key={t} onClick={() => setTab(i)} style={{ flex: 1, padding: "8px 0", borderRadius: 100, fontFamily: "Fraunces, serif", fontSize: 13, fontWeight: 700, background: tab === i ? "rgba(212,175,106,0.16)" : "rgba(255,255,255,0.06)", color: tab === i ? "#E6C687" : "rgba(255,255,255,0.7)", border: tab === i ? "1px solid rgba(212,175,106,0.3)" : "1px solid transparent", cursor: "pointer" }}>{t}</button>
        ))}
      </div>

      <div style={{ padding: "0 16px 8px", fontFamily: "General Sans, sans-serif", fontSize: 11, color: live ? "#10B981" : "rgba(255,255,255,0.5)", fontWeight: 700 }}>
        {live ? "● live rooms from backend" : "○ demo rooms (backend offline)"}
      </div>

      {/* Room cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "0 16px 24px" }}>
        {rooms.map((room, idx) => {
          const c = ROOM_COLORS[idx % ROOM_COLORS.length];
          const prize = Number(room.advertisedPrize || 0).toLocaleString();
          return (
          <div key={room.id || room.name} style={{ borderRadius: 20, padding: 16, background: "#14151F", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
              <div style={{ width: 52, height: 52, borderRadius: 16, background: `${c}18`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, flexShrink: 0 }}>{room.emoji}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "Fraunces, serif", fontWeight: 700, fontSize: 18, color: "white" }}>{room.name}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                  <span style={{ padding: "2px 8px", borderRadius: 100, background: `${c}18`, color: c, fontFamily: "General Sans, sans-serif", fontWeight: 800, fontSize: 11 }}>{room.difficulty}</span>
                  <span style={{ fontFamily: "General Sans, sans-serif", fontSize: 12, color: "rgba(255,255,255,0.45)" }}>👥 {room.capacity} max</span>
                </div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", gap: 20 }}>
                {[{ label: "Entry", val: `🪙 ${room.entryFee}` }, { label: "Max Prize", val: `🪙 ${prize}` }].map(x => (
                  <div key={x.label}>
                    <div style={{ fontFamily: "General Sans, sans-serif", fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{x.label}</div>
                    <div style={{ fontFamily: "Fraunces, serif", fontWeight: 700, fontSize: 15, color: "#D4AF6A" }}>{x.val}</div>
                  </div>
                ))}
              </div>
              <button onClick={() => join(room, c)} style={{ padding: "10px 22px", borderRadius: 100, background: c, color: "white", fontFamily: "Fraunces, serif", fontWeight: 700, fontSize: 16, border: "none", cursor: "pointer", boxShadow: `0 4px 18px ${c}58` }}>
                Join ▶
              </button>
            </div>
          </div>
        );})}
      </div>
    </PhoneScreen>
  );
}

// ─── 4. Card Selection ────────────────────────────────────────────────────────
function CardsScreen({ go, sess, setSess }: { go: (s: Screen) => void; sess: Session; setSess: (s: Session) => void }) {
  const [sel, setSel] = useState(sess.numCards || 1);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState("");
  const [err, setErr] = useState("");
  const costs   = [100, 180, 250, 320];
  const rewards = ["2,500", "5,000", "8,000", "12,000"];

  async function start() {
    try {
      setBusy(true); setErr("");
      const weights = (sess.weights && sess.weights.length > 1) ? sess.weights : [10000];
      const entry = Math.round((sess.entryFee ?? 100) * 1_000_000); // base entry (1 card) in uCNPY
      setStep("Opening round on-chain… (1/3)");
      const r = await createRound({ entry_fee: entry, rake_bps: sess.rakeBps ?? 1000, payout_weights_bps: weights });
      setStep("Escrowing your entry… (2/3)");
      const me = await joinRound(r.roundId, sel);   // you
      setStep("Adding an opponent… (3/3)");
      await joinRound(r.roundId, 1);                // one bot competitor
      setSess({ ...sess, numCards: sel, roundId: r.roundId, playerAddr: me.player, cards: me.cards });
      go("game");
    } catch (e: any) {
      setErr(String(e?.message || e)); setBusy(false);
    }
  }

  const MiniCard = ({ tilt = 0 }: { tilt?: number }) => (
    <div style={{ borderRadius: 14, overflow: "hidden", border: "2.5px solid #7C3AED", background: "white", transform: `rotate(${tilt}deg)`, boxShadow: "0 6px 22px rgba(0,0,0,0.14)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 1, padding: 5, paddingTop: 0 }}>
        {COLS.map((c, ci) => (
          <div key={c} style={{ textAlign: "center", padding: "5px 0", background: COL_COLORS[ci], fontFamily: "Fraunces, serif", fontWeight: 700, fontSize: 12, color: "white", borderRadius: 3 }}>{c}</div>
        ))}
        {CARD.flat().map((num, i) => {
          const free = num === -1;
          const marked = INIT_MARKED.has(num);
          const ci = i % 5;
          return (
            <div key={i} style={{ aspectRatio: "1", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 5, background: free ? COL_COLORS[2] : marked ? `${COL_COLORS[ci]}28` : "#F9FAFB", fontSize: 9, fontFamily: "Fraunces, serif", fontWeight: 700, color: free ? "white" : marked ? COL_COLORS[ci] : "#374151" }}>
              {free ? "★" : num}
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <PhoneScreen bg="radial-gradient(ellipse 500px 400px at 50% 0%, rgba(109,40,217,0.2), transparent 65%), #0A0B14">
      <StatusBar />
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 16px 14px" }}>
        <BackBtn onClick={() => go("lobby")} />
        <h2 style={{ fontFamily: "Fraunces, serif", fontWeight: 700, fontSize: 24, color: "white", margin: 0 }}>Choose Cards</h2>
      </div>

      {/* Card count selector */}
      <div style={{ display: "flex", gap: 10, padding: "0 16px 20px" }}>
        {[1, 2, 3, 4].map(n => (
          <button key={n} onClick={() => setSel(n)} style={{ flex: 1, padding: "12px 0", borderRadius: 18, fontFamily: "Fraunces, serif", fontWeight: 700, fontSize: 22, background: sel === n ? "rgba(212,175,106,0.16)" : "rgba(255,255,255,0.06)", color: sel === n ? "#E6C687" : "white", border: sel === n ? "3px solid #D4AF6A" : "3px solid transparent", cursor: "pointer" }}>{n}</button>
        ))}
      </div>

      {/* Card preview area */}
      <div style={{ height: 230, position: "relative", margin: "0 28px 22px" }}>
        {sel === 1 && <div style={{ position: "absolute", left: "50%", top: 0, transform: "translateX(-50%)", width: 224 }}><MiniCard /></div>}
        {sel === 2 && <>
          <div style={{ position: "absolute", right: 0,   top: 0,  width: 210 }}><MiniCard tilt={-4} /></div>
          <div style={{ position: "absolute", left: 0,    top: 14, width: 210 }}><MiniCard tilt={3}  /></div>
        </>}
        {sel === 3 && <>
          <div style={{ position: "absolute", right: 0,               top: 0,  width: 200 }}><MiniCard tilt={-6} /></div>
          <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", top: 12, width: 200 }}><MiniCard /></div>
          <div style={{ position: "absolute", left: 0,                top: 22, width: 200 }}><MiniCard tilt={5}  /></div>
        </>}
        {sel === 4 && <>
          <div style={{ position: "absolute", right: 0,  top: 0,  width: 188 }}><MiniCard tilt={-8} /></div>
          <div style={{ position: "absolute", right: 10, top: 10, width: 188 }}><MiniCard tilt={-2} /></div>
          <div style={{ position: "absolute", left: 10,  top: 20, width: 188 }}><MiniCard tilt={3}  /></div>
          <div style={{ position: "absolute", left: 0,   top: 30, width: 188 }}><MiniCard tilt={7}  /></div>
        </>}
      </div>

      {/* Cost / reward info */}
      <div style={{ margin: "0 16px 14px", padding: "16px 20px", borderRadius: 20, background: "#14151F", border: "1px solid rgba(255,255,255,0.08)", display: "flex", justifyContent: "space-around" }}>
        {[
          { label: "Entry Cost",  val: `🪙 ${costs[sel - 1]}`,   color: "#D4AF6A" },
          { label: "Max Win",     val: `🪙 ${rewards[sel - 1]}`, color: "#3FAE7B" },
          { label: "Odds Boost",  val: `+${sel * 8}%`,            color: "#D4AF6A" },
        ].map((x, i, arr) => (
          <div key={x.label} style={{ textAlign: "center", ...(i < arr.length - 1 ? { paddingRight: 16, borderRight: "1px solid rgba(255,255,255,0.08)" } : {}) }}>
            <div style={{ fontFamily: "General Sans, sans-serif", fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>{x.label}</div>
            <div style={{ fontFamily: "Fraunces, serif", fontWeight: 700, fontSize: 20, color: x.color }}>{x.val}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: "0 16px 24px" }}>
        <button onClick={start} disabled={busy} style={{ width: "100%", padding: "20px 0", borderRadius: 28, background: busy ? "rgba(139,92,246,0.5)" : "linear-gradient(135deg,#8B5CF6,#EC4899)", color: "white", fontFamily: "Fraunces, serif", fontWeight: 700, fontSize: 24, border: "none", cursor: busy ? "default" : "pointer", boxShadow: "0 10px 36px #8B5CF648" }}>
          {busy ? (step || "Opening round on-chain…") : "Start Game 🎯"}
        </button>
        {err && <div style={{ marginTop: 10, fontFamily: "General Sans, sans-serif", fontSize: 12, color: "#DC2626", textAlign: "center" }}>{err}</div>}
      </div>
    </PhoneScreen>
  );
}

// ─── 5. Game ──────────────────────────────────────────────────────────────────
function GameScreen({ go, sess, setSess }: { go: (s: Screen) => void; sess: Session; setSess: (s: Session) => void }) {
  const real = !!(sess.roundId && sess.cards && sess.cards.length);
  // FREE center is 0 (backend) or -1 (mock) → normalize to 0 for rendering.
  const grid: number[][] = real ? sess.cards![0] : CARD.map(r => r.map(n => (n === -1 ? 0 : n)));

  const [marked, setMarked] = useState<Set<number>>(new Set(real ? [] : INIT_MARKED));
  const [current, setCurrent] = useState<{ l: string; n: number } | null>(real ? null : { l: "B", n: 12 });
  const [recent, setRecent] = useState<{ l: string; n: number }[]>(real ? [] : RECENT);
  const [count, setCount] = useState(0);
  const [statusMsg, setStatusMsg] = useState(real ? "Waiting for the draw…" : "");
  const [sound, setSound] = useState(true);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!real) return;
    const ws = roundSocket(sess.roundId!);
    wsRef.current = ws;
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.type === "ball") {
        setCurrent({ l: m.letter, n: m.number });
        setCount(m.index);
        setRecent(p => [{ l: m.letter, n: m.number }, ...p].slice(0, 5));
        setMarked(p => { const s = new Set(p); s.add(m.number); return s; });
        setStatusMsg("Drawing…");
      } else if (m.type === "bingo") {
        setStatusMsg(`BINGO at ball ${m.balls}! Settling on-chain…`);
      } else if (m.type === "settled") {
        const payouts = m.payouts || {};
        const mine = payouts[sess.playerAddr || ""] || 0;
        setSess({ ...sess, payouts, winners: m.winners || [], wonCoins: Math.round(mine / 1_000_000) });
        setStatusMsg("Settled ✓");
        setTimeout(() => go(mine > 0 ? "win" : "lose"), 1000);
      }
    };
    ws.onerror = () => setStatusMsg("connection error — check backend");
    return () => ws.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = (num: number) => {
    if (real || num === 0) return; // real mode auto-marks from the on-chain draw
    setMarked(prev => { const n = new Set(prev); n.has(num) ? n.delete(num) : n.add(num); return n; });
  };

  const pills = real
    ? [{ e: "🔢", v: `${count}` }, { e: "🃏", v: `${sess.numCards}` }, { e: "⛓️", v: "live" }]
    : [{ e: "👥", v: "12 left" }, { e: "🏆", v: "2,500" }, { e: "⏱️", v: "1:47" }];

  return (
    <PhoneScreen bg="radial-gradient(ellipse 500px 400px at 50% 0%, rgba(109,40,217,0.18), transparent 70%), #0A0B14">
      <StatusBar />
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "2px 12px 8px" }}>
        <button onClick={() => go("lobby")} style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(255,255,255,0.1)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <ArrowLeft size={15} color="white" />
        </button>
        <span style={{ fontFamily: "Fraunces, serif", color: "white", fontWeight: 700, fontSize: 14, flex: 1 }}>{sess.roomName || "Classic Room"}</span>
        {pills.map(x => (
          <div key={x.e} style={{ display: "flex", alignItems: "center", gap: 3, padding: "4px 8px", borderRadius: 100, background: "rgba(255,255,255,0.1)", fontFamily: "General Sans, sans-serif", fontSize: 11, color: "white", fontWeight: 600 }}>
            <span>{x.e}</span><span>{x.v}</span>
          </div>
        ))}
      </div>

      {/* Current ball display */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "8px 0 6px" }}>
        <span style={{ fontFamily: "General Sans, sans-serif", fontSize: 10, color: "rgba(255,255,255,0.42)", letterSpacing: 2.5, textTransform: "uppercase", marginBottom: 6 }}>{real ? (statusMsg || "Current Ball") : "Current Ball"}</span>
        {current ? <BingoBall letter={current.l} number={current.n} size={76} /> : (
          <div style={{ width: 76, height: 76, borderRadius: "50%", background: "rgba(255,255,255,0.08)", border: "3px solid rgba(255,255,255,0.15)" }} />
        )}
      </div>

      {/* Recent balls row */}
      <div style={{ display: "flex", justifyContent: "center", gap: 8, padding: "4px 0 10px", minHeight: 40 }}>
        {recent.map((b, i) => <BingoBall key={i} letter={b.l} number={b.n} size={33} dim={i > 2} />)}
      </div>

      {/* Bingo card */}
      <div style={{ margin: "0 10px", borderRadius: 26, overflow: "hidden", boxShadow: "0 10px 52px rgba(0,0,0,0.5)", border: "2px solid rgba(255,255,255,0.09)" }}>
        {/* Column headers */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)" }}>
          {COLS.map((c, ci) => (
            <div key={c} style={{ padding: "9px 0", textAlign: "center", background: COL_COLORS[ci] }}>
              <span style={{ fontFamily: "Fraunces, serif", fontWeight: 700, fontSize: 22, color: "white" }}>{c}</span>
            </div>
          ))}
        </div>
        {/* Grid cells */}
        <div style={{ background: "white", padding: 7, display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 4 }}>
          {grid.flatMap((row, ri) =>
            row.map((num, ci) => {
              const free = num === 0;
              const mk = free || marked.has(num);
              return (
                <button key={`${ri}-${ci}`} onClick={() => toggle(num)} style={{
                  aspectRatio: "1", borderRadius: 10, border: `2px solid ${mk ? COL_COLORS[ci] : "#E9EAEC"}`,
                  background: mk ? `${COL_COLORS[ci]}1E` : "#FAFAFA",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexDirection: "column", cursor: real ? "default" : "pointer", position: "relative",
                  transition: "all 0.15s",
                }}>
                  {free ? (
                    <span style={{ fontFamily: "Fraunces, serif", fontWeight: 700, fontSize: 10, color: "#7C3AED", lineHeight: 1.2, textAlign: "center" }}>FREE</span>
                  ) : (
                    <>
                      <span style={{ fontFamily: "Fraunces, serif", fontWeight: 700, fontSize: 16, color: mk ? COL_COLORS[ci] : "#374151" }}>{num}</span>
                      {mk && (
                        <div style={{ position: "absolute", top: 3, right: 3, width: 14, height: 14, borderRadius: "50%", background: COL_COLORS[ci], display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <Check size={9} color="white" strokeWidth={3} />
                        </div>
                      )}
                    </>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* BINGO button (mock) / on-chain status (real) */}
      <div style={{ padding: "10px 10px 6px" }}>
        {real ? (
          <div style={{ width: "100%", padding: "13px 0", borderRadius: 20, background: "rgba(255,255,255,0.1)", fontFamily: "Fraunces, serif", fontWeight: 700, fontSize: 16, color: "white", textAlign: "center" }}>
            ⛓️ {statusMsg || "Auto-marked & settled on-chain"}
          </div>
        ) : (
          <button onClick={() => go("win")} style={{ width: "100%", padding: "13px 0", borderRadius: 20, background: "linear-gradient(135deg,#E6C687,#D4AF6A)", fontFamily: "Fraunces, serif", fontWeight: 700, fontSize: 22, color: "#1A0A2E", border: "none", cursor: "pointer", boxShadow: "0 4px 22px rgba(212,175,106,0.35)" }}>
            🎉  BINGO!
          </button>
        )}
      </div>

      {/* Secondary controls */}
      <div style={{ display: "flex", gap: 8, padding: "0 10px 10px" }}>
        {["⚡ Auto-Mark", "💥 Power Up"].map(l => (
          <button key={l} style={{ flex: 1, padding: "9px 0", borderRadius: 14, background: "rgba(255,255,255,0.1)", border: "none", cursor: "pointer", fontFamily: "General Sans, sans-serif", fontSize: 13, color: "white", fontWeight: 700 }}>{l}</button>
        ))}
        <button onClick={() => setSound(!sound)} style={{ padding: "9px 12px", borderRadius: 14, background: "rgba(255,255,255,0.1)", border: "none", cursor: "pointer", display: "flex", alignItems: "center" }}>
          {sound ? <Volume2 size={16} color="white" /> : <VolumeX size={16} color="#9CA3AF" />}
        </button>
        <button style={{ padding: "9px 12px", borderRadius: 14, background: "rgba(255,255,255,0.1)", border: "none", cursor: "pointer", display: "flex", alignItems: "center" }}>
          <MessageCircle size={16} color="white" />
        </button>
      </div>
    </PhoneScreen>
  );
}

// ─── 6. Win ───────────────────────────────────────────────────────────────────
function WinScreen({ go, sess }: { go: (s: Screen) => void; sess: Session }) {
  const won = sess.wonCoins;
  return (
    <PhoneScreen bg="radial-gradient(ellipse 600px 500px at 50% 20%, rgba(212,175,106,0.25), transparent 70%), #0A0B14">
      <StatusBar />
      {CONFETTI.map((p, i) => (
        <div key={i} style={{
          position: "absolute", left: `${p.x}%`, top: `${p.y}%`,
          width: 8, height: p.r ? 8 : 4,
          borderRadius: p.r ? "50%" : 2, background: p.c, opacity: 0.82,
          animation: "confetti 1.4s ease-in-out infinite",
          animationDelay: `${(i * 0.09) % 1}s`,
          pointerEvents: "none",
        }} />
      ))}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "52px 24px 0" }}>
        <span style={{ fontSize: 72, marginBottom: 4, filter: "drop-shadow(0 8px 28px #D4AF6A88)" }}>🏆</span>
        <h1 style={{ fontFamily: "Fraunces, serif", fontWeight: 700, fontSize: 60, color: "#D4AF6A", textShadow: "0 0 48px #D4AF6A85, 0 4px 0 #D97706", lineHeight: 1, margin: "0 0 8px" }}>BINGO!</h1>
        <p style={{ fontFamily: "General Sans, sans-serif", color: "rgba(255,255,255,0.72)", fontSize: 17, marginBottom: 28, textAlign: "center" }}>You won {sess.roomName ? `the ${sess.roomName}` : "the Classic Room"}! 🎊</p>

        {/* Rewards panel */}
        <div style={{ width: "100%", borderRadius: 28, padding: "4px 20px", marginBottom: 16, background: "rgba(255,255,255,0.09)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.16)" }}>
          {([
            { e: "🪙", l: "Coins Won",  v: `+${(won ?? 2500).toLocaleString()}`,  c: "#D4AF6A" },
            { e: "⭐", l: "XP Gained",  v: "+450 XP", c: "#A5F3FC" },
            { e: "🏅", l: won !== undefined ? "Settled" : "Ranking", v: won !== undefined ? "on-chain ✓" : "#4 of 20", c: "#C4B5FD" },
          ]).map(r => (
            <div key={r.l} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 0", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 24 }}>{r.e}</span>
                <span style={{ fontFamily: "General Sans, sans-serif", color: "rgba(255,255,255,0.72)", fontSize: 15 }}>{r.l}</span>
              </div>
              <span style={{ fontFamily: "Fraunces, serif", fontWeight: 700, fontSize: 20, color: r.c }}>{r.v}</span>
            </div>
          ))}
        </div>

        <button onClick={() => go("lobby")} style={{ width: "100%", padding: "16px 0", borderRadius: 22, background: "linear-gradient(135deg,#E6C687,#D4AF6A)", fontFamily: "Fraunces, serif", fontWeight: 700, fontSize: 22, color: "#1A0A2E", border: "none", cursor: "pointer", boxShadow: "0 8px 36px rgba(212,175,106,0.35)", marginBottom: 10 }}>
          Play Again 🎱
        </button>
        <button onClick={() => go("home")} style={{ width: "100%", padding: "14px 0", borderRadius: 22, background: "rgba(255,255,255,0.08)", fontFamily: "Fraunces, serif", fontWeight: 600, fontSize: 18, color: "white", border: "2px solid rgba(255,255,255,0.16)", cursor: "pointer" }}>
          Back to Home
        </button>
      </div>
      <div style={{ height: 28 }} />
    </PhoneScreen>
  );
}

// ─── 7. Lose ──────────────────────────────────────────────────────────────────
function LoseScreen({ go }: { go: (s: Screen) => void }) {
  return (
    <PhoneScreen bg="linear-gradient(160deg,#0A0B14 0%,#14151F 60%,#1B1C29 100%)">
      <StatusBar />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "56px 24px 0" }}>
        <span style={{ fontSize: 72, marginBottom: 16 }}>😅</span>
        <h1 style={{ fontFamily: "Fraunces, serif", fontWeight: 700, fontSize: 38, color: "white", margin: "0 0 10px" }}>Almost There!</h1>
        <p style={{ fontFamily: "General Sans, sans-serif", color: "rgba(255,255,255,0.62)", fontSize: 15, textAlign: "center", marginBottom: 28 }}>
          You were so close! Just 2 more numbers needed for Bingo.
        </p>

        {/* Progress card */}
        <div style={{ width: "100%", borderRadius: 24, padding: "18px 20px", marginBottom: 14, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }}>
          <div style={{ fontFamily: "General Sans, sans-serif", color: "rgba(255,255,255,0.5)", fontSize: 13, marginBottom: 10 }}>Game Progress</div>
          <div style={{ width: "100%", borderRadius: 100, height: 10, background: "rgba(255,255,255,0.1)", marginBottom: 6 }}>
            <div style={{ width: "72%", height: 10, borderRadius: 100, background: "linear-gradient(90deg,#8B5CF6,#EC4899)" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontFamily: "General Sans, sans-serif", fontSize: 12, color: "rgba(255,255,255,0.38)" }}>72% complete</span>
            <span style={{ fontFamily: "General Sans, sans-serif", fontSize: 12, color: "rgba(255,255,255,0.38)" }}>Rank: 8/20</span>
          </div>
        </div>

        {/* Consolation prize */}
        <div style={{ width: "100%", borderRadius: 24, padding: "14px 18px", marginBottom: 28, display: "flex", alignItems: "center", gap: 14, background: "linear-gradient(135deg,rgba(124,58,237,0.2),rgba(236,72,153,0.2))", border: "1px solid rgba(139,92,246,0.28)" }}>
          <span style={{ fontSize: 36 }}>🎁</span>
          <div>
            <div style={{ fontFamily: "Fraunces, serif", fontWeight: 700, fontSize: 16, color: "white" }}>Consolation Prize!</div>
            <div style={{ fontFamily: "General Sans, sans-serif", fontSize: 13, color: "rgba(255,255,255,0.62)" }}>🪙 +50 coins · ⭐ +100 XP · Keep it up!</div>
          </div>
        </div>

        <button onClick={() => go("lobby")} style={{ width: "100%", padding: "16px 0", borderRadius: 22, background: "linear-gradient(135deg,#8B5CF6,#EC4899)", fontFamily: "Fraunces, serif", fontWeight: 700, fontSize: 22, color: "white", border: "none", cursor: "pointer", boxShadow: "0 8px 36px #8B5CF648", marginBottom: 10 }}>
          Try Again 💪
        </button>
        <button onClick={() => go("home")} style={{ width: "100%", padding: "14px 0", borderRadius: 22, background: "rgba(255,255,255,0.07)", fontFamily: "Fraunces, serif", fontWeight: 600, fontSize: 18, color: "rgba(255,255,255,0.72)", border: "2px solid rgba(255,255,255,0.1)", cursor: "pointer" }}>
          Back to Home
        </button>
      </div>
      <div style={{ height: 28 }} />
    </PhoneScreen>
  );
}

// ─── 8. Shop ──────────────────────────────────────────────────────────────────
function ShopScreen({ go }: { go: (s: Screen) => void }) {
  const [tab, setTab] = useState(0);
  const tabs = ["Coins", "Gems", "Boosters", "Themes"];
  const [items, setItems] = useState<any[][]>([
    [
      { n: "Starter Pack",  e: "💰", p: "$0.99",  a: "500 coins",       b: null          },
      { n: "Coin Bundle",   e: "🪙", p: "$4.99",  a: "3,000 coins",     b: "POPULAR"     },
      { n: "Mega Coins",    e: "💫", p: "$9.99",  a: "8,000 coins",     b: "BEST VALUE"  },
      { n: "Gold Rush",     e: "🏅", p: "$19.99", a: "20,000 coins",    b: null          },
    ],
    [
      { n: "Gem Starter",   e: "💎", p: "$1.99",  a: "50 gems",         b: null          },
      { n: "Gem Pack",      e: "✨", p: "$7.99",  a: "250 gems",        b: "POPULAR"     },
      { n: "Gem Vault",     e: "🔮", p: "$14.99", a: "600 gems",        b: "BEST VALUE"  },
      { n: "Diamond Box",   e: "💍", p: "$29.99", a: "1,500 gems",      b: null          },
    ],
    [
      { n: "Auto-Daub ×5", e: "⚡", p: "🪙 200", a: "5 game rounds",   b: null          },
      { n: "Lucky Star",    e: "⭐", p: "🪙 500", a: "2× coins/game",   b: "HOT"         },
      { n: "Time Freeze",   e: "⏰", p: "💎 20",  a: "Pause timer 30s", b: null          },
      { n: "Wild Number",   e: "🃏", p: "💎 50",  a: "Mark any cell",   b: "RARE"        },
    ],
    [
      { n: "Galaxy",        e: "🌌", p: "💎 100", a: "Dark cosmic skin",  b: null        },
      { n: "Neon Rush",     e: "🌈", p: "💎 80",  a: "Glowing neon skin", b: "NEW"       },
      { n: "Gold Classic",  e: "🥇", p: "💎 150", a: "Luxury gold skin",  b: null        },
      { n: "Candy Land",    e: "🍭", p: "💎 60",  a: "Sweet color skin",  b: null        },
    ],
  ]);

  useEffect(() => {
    getShop().then((s: any) => {
      const money = (it: any) => it.price_kind === "usd" ? `$${(it.price / 100).toFixed(2)}` : it.price_kind === "gems" ? `💎 ${it.price}` : `🪙 ${it.price}`;
      const desc = (it: any) => it.grants && (it.grants.coins || it.grants.gems)
        ? `${(it.grants.coins || it.grants.gems).toLocaleString()} ${it.grants.coins ? "coins" : "gems"}`
        : (it.effect || "");
      const map = (arr: any[]) => (arr || []).map((it: any) => ({ n: it.name, e: it.emoji, p: money(it), a: desc(it), b: it.badge ?? null }));
      if (s && s.coins) setItems([map(s.coins), map(s.gems), map(s.boosters), map(s.themes)]);
    }).catch(() => {});
  }, []);

  const badgeCol = (b: string | null) => ({ "BEST VALUE": "#10B981", "RARE": "#8B5CF6", "NEW": "#3B82F6" }[b ?? ""] ?? "#EC4899");

  return (
    <PhoneScreen bg="radial-gradient(ellipse 500px 400px at 50% 0%, rgba(109,40,217,0.2), transparent 65%), #0A0B14">
      <StatusBar />
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 14px 12px" }}>
        <BackBtn onClick={() => go("home")} />
        <h2 style={{ fontFamily: "Fraunces, serif", fontWeight: 700, fontSize: 24, color: "white", flex: 1, margin: 0 }}>Shop 🛒</h2>
        <Pill><span>🪙</span><span style={{ fontFamily: "Fraunces, serif", color: "#D4AF6A", fontWeight: 700, fontSize: 13 }}>4,250</span></Pill>
        <Pill><span>💎</span><span style={{ fontFamily: "Fraunces, serif", color: "#A5F3FC", fontWeight: 700, fontSize: 13 }}>120</span></Pill>
      </div>

      {/* Flash sale banner */}
      <div style={{ margin: "0 14px 12px", padding: "14px 16px", borderRadius: 24, background: "linear-gradient(135deg,#E6C687,#D4AF6A 60%,#EC4899)", boxShadow: "0 8px 32px rgba(212,175,106,0.3)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontFamily: "Fraunces, serif", fontWeight: 700, fontSize: 20, color: "#1A0A2E" }}>🔥 Flash Sale!</div>
            <div style={{ fontFamily: "General Sans, sans-serif", fontSize: 13, color: "#78350F", marginBottom: 6 }}>Double coins — today only!</div>
            <div style={{ fontFamily: "Fraunces, serif", fontWeight: 700, fontSize: 13, color: "#6D28D9" }}>⏰ 01:47:22 remaining</div>
          </div>
          <span style={{ fontSize: 48 }}>💰</span>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, padding: "0 14px 12px" }}>
        {tabs.map((t, i) => (
          <button key={t} onClick={() => setTab(i)} style={{ flex: 1, padding: "8px 0", borderRadius: 100, fontFamily: "Fraunces, serif", fontSize: 13, fontWeight: 700, background: tab === i ? "rgba(212,175,106,0.16)" : "rgba(255,255,255,0.06)", color: tab === i ? "#E6C687" : "rgba(255,255,255,0.6)", border: tab === i ? "1px solid rgba(212,175,106,0.3)" : "1px solid transparent", cursor: "pointer" }}>{t}</button>
        ))}
      </div>

      {/* Product grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, padding: "0 14px 24px" }}>
        {items[tab].map(item => (
          <div key={item.n} style={{ borderRadius: 18, padding: "16px 14px", background: "#14151F", border: "1px solid rgba(255,255,255,0.08)", position: "relative" }}>
            {item.b && (
              <div style={{ position: "absolute", top: -9, right: 10, padding: "2px 8px", borderRadius: 100, background: badgeCol(item.b), color: "white", fontFamily: "General Sans, sans-serif", fontWeight: 900, fontSize: 9 }}>{item.b}</div>
            )}
            <span style={{ fontSize: 36, display: "block", marginBottom: 8 }}>{item.e}</span>
            <div style={{ fontFamily: "Fraunces, serif", fontWeight: 700, fontSize: 15, color: "white", marginBottom: 2 }}>{item.n}</div>
            <div style={{ fontFamily: "General Sans, sans-serif", fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 12 }}>{item.a}</div>
            <button style={{ width: "100%", padding: "8px 0", borderRadius: 14, background: "linear-gradient(135deg,#7C3AED,#EC4899)", color: "white", fontFamily: "Fraunces, serif", fontWeight: 700, fontSize: 14, border: "none", cursor: "pointer" }}>
              {item.p}
            </button>
          </div>
        ))}
      </div>
    </PhoneScreen>
  );
}

// ─── 9. Profile ───────────────────────────────────────────────────────────────
function ProfileScreen({ go }: { go: (s: Screen) => void }) {
  const [theme, setTheme] = useState(0);
  const themes = ["🌌", "🌈", "🥇", "🍭", "🎯", "⚡"];
  const badges = [
    { e: "🏆", l: "First Win",    u: true  }, { e: "⭐", l: "100 Wins",    u: true  },
    { e: "🔥", l: "Hot Streak",   u: true  }, { e: "💎", l: "VIP Member",  u: true  },
    { e: "🎯", l: "Sharp Shooter",u: true  }, { e: "🃏", l: "Wild Card",   u: false },
    { e: "👑", l: "Champion",     u: false }, { e: "🎪", l: "Showstopper", u: false },
  ];

  return (
    <PhoneScreen bg="radial-gradient(ellipse 500px 400px at 50% 0%, rgba(109,40,217,0.2), transparent 65%), #0A0B14">
      <StatusBar />
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 16px 8px" }}>
        <BackBtn onClick={() => go("home")} />
        <h2 style={{ fontFamily: "Fraunces, serif", fontWeight: 700, fontSize: 24, color: "white", flex: 1, margin: 0 }}>Profile</h2>
        <Settings size={20} color="rgba(255,255,255,0.78)" style={{ cursor: "pointer" }} />
      </div>

      {/* Avatar */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingBottom: 16 }}>
        <div style={{ position: "relative", marginBottom: 10 }}>
          <div style={{ width: 88, height: 88, borderRadius: "50%", background: "linear-gradient(135deg,#D4AF6A,#EC4899)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 48, border: "4px solid white", boxShadow: "0 4px 22px rgba(0,0,0,0.22)" }}>🦊</div>
          <div style={{ position: "absolute", bottom: 0, right: 0, width: 28, height: 28, borderRadius: "50%", background: "#7C3AED", display: "flex", alignItems: "center", justifyContent: "center", border: "2.5px solid white" }}>
            <span style={{ fontFamily: "Fraunces, serif", fontWeight: 700, fontSize: 12, color: "white" }}>24</span>
          </div>
        </div>
        <div style={{ fontFamily: "Fraunces, serif", fontWeight: 700, fontSize: 22, color: "white" }}>StarPlayer99</div>
        <div style={{ fontFamily: "General Sans, sans-serif", fontSize: 13, color: "rgba(255,255,255,0.62)" }}>Bingo Master · Member since 2023</div>
      </div>

      {/* XP bar */}
      <div style={{ margin: "0 16px 14px", padding: "14px 18px", borderRadius: 22, background: "rgba(255,255,255,0.14)", backdropFilter: "blur(8px)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontFamily: "General Sans, sans-serif", fontSize: 13, color: "rgba(255,255,255,0.82)", fontWeight: 700 }}>Level 24</span>
          <span style={{ fontFamily: "General Sans, sans-serif", fontSize: 13, color: "rgba(255,255,255,0.62)" }}>7,840 / 10,000 XP</span>
        </div>
        <div style={{ width: "100%", borderRadius: 100, height: 10, background: "rgba(255,255,255,0.18)" }}>
          <div style={{ width: "78%", height: 10, borderRadius: 100, background: "linear-gradient(90deg,#D4AF6A,#EC4899)" }} />
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, margin: "0 16px 14px" }}>
        {[
          { l: "Total Wins",   v: "847",   e: "🏆" },
          { l: "Games Played", v: "1,294", e: "🎱" },
          { l: "Best Streak",  v: "14 🔥", e: ""   },
        ].map(s => (
          <div key={s.l} style={{ padding: "12px 8px", borderRadius: 16, textAlign: "center", background: "#14151F", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ fontSize: 22, marginBottom: 4 }}>{s.e}</div>
            <div style={{ fontFamily: "Fraunces, serif", fontWeight: 700, fontSize: 18, color: "#D4AF6A" }}>{s.v}</div>
            <div style={{ fontFamily: "General Sans, sans-serif", fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* Card theme picker */}
      <div style={{ margin: "0 16px 12px", padding: "16px", borderRadius: 20, background: "#14151F", border: "1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ fontFamily: "Fraunces, serif", fontWeight: 700, fontSize: 16, color: "white", marginBottom: 10 }}>Card Theme</div>
        <div style={{ display: "flex", gap: 8 }}>
          {themes.map((t, i) => (
            <button key={i} onClick={() => setTheme(i)} style={{ flex: 1, padding: "10px 0", borderRadius: 14, fontSize: 18, background: theme === i ? "rgba(212,175,106,0.16)" : "rgba(255,255,255,0.05)", border: theme === i ? "2px solid #D4AF6A" : "2px solid transparent", cursor: "pointer" }}>{t}</button>
          ))}
        </div>
      </div>

      {/* Achievements */}
      <div style={{ margin: "0 16px 24px", padding: "16px", borderRadius: 20, background: "#14151F", border: "1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ fontFamily: "Fraunces, serif", fontWeight: 700, fontSize: 16, color: "white", marginBottom: 12 }}>Achievements</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
          {badges.map((b, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div style={{ width: "100%", aspectRatio: "1", borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", background: b.u ? "rgba(212,175,106,0.12)" : "rgba(255,255,255,0.04)", fontSize: 26, border: b.u ? "2px solid rgba(212,175,106,0.3)" : "2px solid rgba(255,255,255,0.08)", opacity: b.u ? 1 : 0.36 }}>{b.e}</div>
              <span style={{ fontFamily: "General Sans, sans-serif", fontSize: 9, color: b.u ? "#E6C687" : "rgba(255,255,255,0.4)", textAlign: "center", fontWeight: 700 }}>{b.l}</span>
            </div>
          ))}
        </div>
      </div>
    </PhoneScreen>
  );
}

// ─── 10. Daily Reward ─────────────────────────────────────────────────────────
function DailyScreen({ go }: { go: (s: Screen) => void }) {
  const [claimed, setClaimed] = useState(false);
  const days = [
    { d: 1, e: "🪙", r: "50",    done: true,  today: false, locked: false, special: false },
    { d: 2, e: "🪙", r: "100",   done: true,  today: false, locked: false, special: false },
    { d: 3, e: "⭐", r: "×5",    done: true,  today: false, locked: false, special: false },
    { d: 4, e: "💎", r: "5",     done: true,  today: false, locked: false, special: false },
    { d: 5, e: "🪙", r: "300",   done: false, today: true,  locked: false, special: false },
    { d: 6, e: "🎁", r: "Box",   done: false, today: false, locked: true,  special: false },
    { d: 7, e: "💎", r: "50",    done: false, today: false, locked: true,  special: true  },
  ];

  return (
    <PhoneScreen bg="radial-gradient(ellipse 600px 500px at 50% 20%, rgba(109,40,217,0.26), transparent 70%), #0A0B14">
      <StatusBar />
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 16px 12px" }}>
        <BackBtn onClick={() => go("home")} />
        <h2 style={{ fontFamily: "Fraunces, serif", fontWeight: 700, fontSize: 24, color: "white", flex: 1, margin: 0 }}>Daily Rewards 🎁</h2>
      </div>

      {/* Streak banner */}
      <div style={{ margin: "0 16px 14px", padding: "14px 18px", borderRadius: 22, display: "flex", alignItems: "center", gap: 14, background: "rgba(255,255,255,0.14)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.2)" }}>
        <span style={{ fontSize: 40 }}>🔥</span>
        <div>
          <div style={{ fontFamily: "Fraunces, serif", fontWeight: 700, fontSize: 19, color: "white" }}>7-Day Streak!</div>
          <div style={{ fontFamily: "General Sans, sans-serif", fontSize: 13, color: "rgba(255,255,255,0.65)" }}>Keep it up to earn bonus rewards!</div>
        </div>
      </div>

      {/* 7-day calendar grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, padding: "0 16px 18px" }}>
        {days.map(day => (
          <div key={day.d} style={{
            borderRadius: 20, padding: "11px 8px", display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
            background: day.today ? "rgba(212,175,106,0.14)" : day.done ? "rgba(63,174,123,0.14)" : day.locked ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.1)",
            border: day.today ? `3px solid ${claimed ? "#3FAE7B" : "#D4AF6A"}` : day.special ? "2px solid rgba(212,175,106,0.45)" : "2px solid transparent",
            boxShadow: day.today ? "0 4px 22px rgba(212,175,106,0.3)" : "none",
            opacity: day.locked ? 0.55 : 1,
          }}>
            <span style={{ fontFamily: "General Sans, sans-serif", fontSize: 9, fontWeight: 800, color: day.today ? "#E6C687" : "rgba(255,255,255,0.52)", letterSpacing: 0.5 }}>DAY {day.d}</span>
            <span style={{ fontSize: 22, lineHeight: 1.2 }}>{day.locked ? "🔒" : day.e}</span>
            <span style={{ fontFamily: "Fraunces, serif", fontSize: 11, fontWeight: 700, color: day.today ? "#E6C687" : "rgba(255,255,255,0.8)", textAlign: "center" }}>
              {day.locked ? "Locked" : day.r}
            </span>
            {(day.done || (day.today && claimed)) && (
              <div style={{ marginTop: 2, width: 16, height: 16, borderRadius: "50%", background: "#10B981", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Check size={9} color="white" strokeWidth={3} />
              </div>
            )}
            {day.today && !claimed && (
              <span style={{ fontFamily: "General Sans, sans-serif", fontSize: 8, color: "#EC4899", fontWeight: 900, marginTop: 1, letterSpacing: 0.3 }}>TODAY!</span>
            )}
          </div>
        ))}
      </div>

      {/* Today's reward highlight */}
      <div style={{ margin: "0 16px 14px", padding: "18px 20px", borderRadius: 22, background: "#14151F", border: "1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ fontFamily: "General Sans, sans-serif", fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 10 }}>Today's Reward</div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 58, height: 58, borderRadius: 18, background: "linear-gradient(135deg,#E6C687,#D4AF6A)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, flexShrink: 0 }}>🪙</div>
          <div>
            <div style={{ fontFamily: "Fraunces, serif", fontWeight: 700, fontSize: 26, color: "#D4AF6A", lineHeight: 1.1 }}>300 Coins</div>
            <div style={{ fontFamily: "General Sans, sans-serif", fontSize: 13, color: "rgba(255,255,255,0.45)" }}>Day 5 reward · Come back tomorrow!</div>
          </div>
        </div>
      </div>

      <div style={{ padding: "0 16px 24px" }}>
        <button onClick={() => !claimed && setClaimed(true)} style={{
          width: "100%", padding: "17px 0", borderRadius: 28,
          background: claimed ? "rgba(63,174,123,0.16)" : "linear-gradient(135deg,#E6C687,#D4AF6A)",
          color: claimed ? "#3FAE7B" : "#1A0A2E",
          fontFamily: "Fraunces, serif", fontWeight: 700, fontSize: 22,
          border: "none", cursor: claimed ? "default" : "pointer",
          boxShadow: claimed ? "none" : "0 8px 36px #D4AF6A58",
        }}>
          {claimed ? "✓  Reward Claimed!" : "Claim Reward 🎁"}
        </button>
      </div>
    </PhoneScreen>
  );
}

// ─── FleetWallet connect chip ───────────────────────────────────────────────────
function WalletChip() {
  const [avail, setAvail] = useState(false);
  const [addr, setAddr] = useState<string | null>(null);
  const [bal, setBal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => { waitForFleet(700).then(setAvail); }, []);

  async function connect() {
    try {
      setBusy(true); setErr("");
      const a = await connectWallet();
      setAddr(a.address);
      const b = await walletBalance();
      if (b) setBal(`${b.whole} ${b.symbol}`);
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally { setBusy(false); }
  }
  async function disconnect() { await disconnectWallet(); setAddr(null); setBal(null); }

  const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
  const base = { display: "flex", alignItems: "center", gap: 8, margin: "0 16px 12px", padding: "10px 14px", borderRadius: 16, fontFamily: "General Sans, sans-serif", fontSize: 12 } as const;

  if (addr) {
    return (
      <div style={{ ...base, background: "rgba(16,185,129,0.16)", border: "1px solid rgba(16,185,129,0.3)", color: "white" }}>
        <span style={{ fontSize: 14 }}>🦊</span>
        <span style={{ fontWeight: 800 }}>{short(addr)}</span>
        <span style={{ opacity: 0.75 }}>· {bal ?? "— CNPY"}</span>
        <button onClick={disconnect} style={{ marginLeft: "auto", background: "rgba(255,255,255,0.14)", border: "none", color: "white", borderRadius: 10, padding: "4px 10px", cursor: "pointer", fontFamily: "General Sans, sans-serif", fontWeight: 700, fontSize: 11 }}>Disconnect</button>
      </div>
    );
  }
  return (
    <div style={{ ...base, flexDirection: "column", alignItems: "stretch", gap: 6, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)" }}>
      <button onClick={connect} disabled={!avail || busy} style={{
        padding: "10px 0", borderRadius: 12, border: "none", cursor: avail && !busy ? "pointer" : "default",
        background: avail ? "linear-gradient(135deg,#6366F1,#8B5CF6)" : "rgba(255,255,255,0.12)",
        color: "white", fontFamily: "Fraunces, serif", fontWeight: 700, fontSize: 14,
      }}>
        {busy ? "Connecting…" : avail ? "🦊 Connect FleetWallet" : "FleetWallet not detected"}
      </button>
      {!avail && <span style={{ color: "rgba(255,255,255,0.5)", textAlign: "center" }}>Install the FleetWallet Chrome extension to connect a Canopy wallet.</span>}
      {err && <span style={{ color: "#FCA5A5", textAlign: "center" }}>{err}</span>}
    </div>
  );
}

// ─── 11. Live (real backend + on-chain) ────────────────────────────────────────
function LiveScreen({ go }: { go: (s: Screen) => void }) {
  type St = "idle" | "running" | "settled" | "error";
  const [status, setStatus] = useState<St>("idle");
  const [msg, setMsg] = useState("Play a real round: opens on-chain, escrows entries, draws live, and settles on-chain.");
  const [ball, setBall] = useState<{ l: string; n: number } | null>(null);
  const [recent, setRecent] = useState<{ l: string; n: number }[]>([]);
  const [count, setCount] = useState(0);
  const [winners, setWinners] = useState<string[]>([]);
  const [payouts, setPayouts] = useState<Record<string, number>>({});
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => () => wsRef.current?.close(), []);

  async function start() {
    try {
      setStatus("running"); setBall(null); setRecent([]); setCount(0); setWinners([]); setPayouts({});
      setMsg("Opening round on-chain (commit seed)…");
      const r = await createRound({ payout_weights_bps: [7000, 3000] });
      setMsg("Players joining (entries escrowed on-chain)…");
      await joinRound(r.roundId, 2);
      await joinRound(r.roundId, 1);
      setMsg("Drawing balls…");
      const ws = roundSocket(r.roundId);
      wsRef.current = ws;
      ws.onmessage = (ev) => {
        const m = JSON.parse(ev.data);
        if (m.type === "ball") {
          setBall({ l: m.letter, n: m.number }); setCount(m.index);
          setRecent((p) => [{ l: m.letter, n: m.number }, ...p].slice(0, 5));
        } else if (m.type === "bingo") {
          setWinners(m.winners); setMsg(`BINGO at ball ${m.balls}! Settling on-chain…`);
        } else if (m.type === "settled") {
          setPayouts(m.payouts || {}); setStatus("settled"); setMsg("Settled on-chain ✓ (winner paid from escrow)");
        }
      };
      ws.onerror = () => { setStatus("error"); setMsg("WebSocket error — check the backend URL / Cloudflare challenge."); };
    } catch (e: any) {
      setStatus("error"); setMsg(`Error: ${e?.message || e}`);
    }
  }

  const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
  const coins = (u: number) => (u / 1_000_000).toLocaleString();

  return (
    <PhoneScreen bg="radial-gradient(ellipse 500px 400px at 50% 0%, rgba(109,40,217,0.18), transparent 70%), #0A0B14">
      <StatusBar />
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 16px 10px" }}>
        <BackBtn onClick={() => go("home")} />
        <h2 style={{ fontFamily: "Fraunces, serif", fontWeight: 700, fontSize: 22, color: "white", flex: 1, margin: 0 }}>Live ⛓️ On-Chain</h2>
      </div>

      <div style={{ margin: "0 16px 12px", padding: "10px 14px", borderRadius: 16, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)" }}>
        <div style={{ fontFamily: "General Sans, sans-serif", fontSize: 12, color: "rgba(255,255,255,0.72)" }}>{msg}</div>
        <div style={{ fontFamily: "General Sans, sans-serif", fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>backend: {apiBase}</div>
      </div>

      <WalletChip />

      {/* Current ball */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "6px 0" }}>
        <span style={{ fontFamily: "General Sans, sans-serif", fontSize: 10, color: "rgba(255,255,255,0.42)", letterSpacing: 2, textTransform: "uppercase", marginBottom: 6 }}>
          {count ? `Ball ${count}` : "Ready"}
        </span>
        {ball ? <BingoBall letter={ball.l} number={ball.n} size={82} /> : (
          <div style={{ width: 82, height: 82, borderRadius: "50%", background: "rgba(255,255,255,0.08)", border: "3px solid rgba(255,255,255,0.15)" }} />
        )}
      </div>

      {/* Recent balls */}
      <div style={{ display: "flex", justifyContent: "center", gap: 8, padding: "8px 0 12px", minHeight: 40 }}>
        {recent.map((b, i) => <BingoBall key={i} letter={b.l} number={b.n} size={33} dim={i > 2} />)}
      </div>

      {/* Winners / payouts */}
      {Object.keys(payouts).length > 0 && (
        <div style={{ margin: "0 16px 14px", padding: "12px 16px", borderRadius: 20, background: "rgba(16,185,129,0.14)", border: "1px solid rgba(16,185,129,0.3)" }}>
          <div style={{ fontFamily: "Fraunces, serif", fontWeight: 700, fontSize: 15, color: "#A7F3D0", marginBottom: 8 }}>🏆 Settlement (on-chain)</div>
          {Object.entries(payouts).sort((a, b) => b[1] - a[1]).map(([addr, amt]) => (
            <div key={addr} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontFamily: "General Sans, sans-serif", fontSize: 13, color: "white" }}>
              <span style={{ opacity: 0.8 }}>{short(addr)}{winners.includes(addr) ? " 👑" : ""}</span>
              <span style={{ fontWeight: 800, color: amt > 0 ? "#D4AF6A" : "rgba(255,255,255,0.4)" }}>🪙 {coins(amt)}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ padding: "0 16px 24px" }}>
        <button onClick={start} disabled={status === "running"} style={{
          width: "100%", padding: "16px 0", borderRadius: 22,
          background: status === "running" ? "rgba(255,255,255,0.14)" : "linear-gradient(135deg,#8B5CF6,#EC4899)",
          color: "white", fontFamily: "Fraunces, serif", fontWeight: 700, fontSize: 20,
          border: "none", cursor: status === "running" ? "default" : "pointer", boxShadow: "0 8px 30px #8B5CF640",
        }}>
          {status === "running" ? "Playing…" : status === "settled" ? "Play Again ⛓️" : "Start Real Game ⛓️"}
        </button>
        {status === "error" && (
          <div style={{ marginTop: 10, fontFamily: "General Sans, sans-serif", fontSize: 12, color: "#FCA5A5", textAlign: "center" }}>{msg}</div>
        )}
      </div>
    </PhoneScreen>
  );
}

// ─── App shell ────────────────────────────────────────────────────────────────
// Real mobile entry point. This used to wrap the screens in a fixed-size
// "iPhone 15" frame with a pill picker to jump between all 10 screens — a
// leftover from the original Figma design-review prototype. Every phone
// visitor (i.e. most real traffic) was landing on that picker instead of the
// game. The screens themselves are the real, backend-wired flow; only the
// design-review chrome around them gets removed here.
export default function App() {
  const [screen, setScreen] = useState<Screen>("splash");
  const [sess, setSess] = useState<Session>(DEFAULT_SESSION);

  return (
    <>
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50%       { transform: translateY(-14px) rotate(3deg); }
        }
        @keyframes loadDot {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40%            { transform: scale(1.1); opacity: 1;   }
        }
        @keyframes pulse {
          0%, 100% { box-shadow: 0 0 80px #D4AF6A75, 0 20px 56px rgba(0,0,0,0.45); }
          50%       { box-shadow: 0 0 120px #D4AF6AAA, 0 20px 56px rgba(0,0,0,0.45); }
        }
        @keyframes confetti {
          0%   { transform: translateY(0)   rotate(0deg);   opacity: 0.9; }
          50%  { transform: translateY(-12px) rotate(180deg); opacity: 1;   }
          100% { transform: translateY(0)   rotate(360deg); opacity: 0.7; }
        }
        ::-webkit-scrollbar { display: none; }
        * { scrollbar-width: none; }
      `}</style>

      <div style={{ position: "relative", minHeight: "100dvh", width: "100%", background: "#1E1B4B", overflow: "hidden" }}>
        {screen === "splash"  && <SplashScreen  go={setScreen} />}
        {screen === "home"    && <HomeScreen    go={setScreen} />}
        {screen === "lobby"   && <LobbyScreen   go={setScreen} setSess={setSess} />}
        {screen === "cards"   && <CardsScreen   go={setScreen} sess={sess} setSess={setSess} />}
        {screen === "game"    && <GameScreen    go={setScreen} sess={sess} setSess={setSess} />}
        {screen === "win"     && <WinScreen     go={setScreen} sess={sess} />}
        {screen === "lose"    && <LoseScreen    go={setScreen} />}
        {screen === "shop"    && <ShopScreen    go={setScreen} />}
        {screen === "profile" && <ProfileScreen go={setScreen} />}
        {screen === "daily"   && <DailyScreen   go={setScreen} />}
        {screen === "live"    && <LiveScreen    go={setScreen} />}
      </div>
    </>
  );
}
