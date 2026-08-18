# Design System — Casino Rush

(Rebranded from "Bingo Rush" — the platform is evolving beyond just bingo, and
the graduated chain itself is already named "Casino" (chainId 406). This is
the name change taking effect in design and, next, in code.)

## Product Context
- **What this is:** a real-money, on-chain casino web app. Bingo is live today
  (provably-fair, escrow, settle all verified on the Canopy "Casino" chain);
  Poker/Domino/Pool/Roulette are planned.
- **Who it's for:** players putting real value at stake who need to trust the
  outcome without trusting the operator — provable fairness is the actual
  product, not a marketing line.
- **Space/industry:** on-chain/crypto casino, adjacent to traditional online
  casino/iGaming.
- **Project type:** web app — desktop sidebar shell (`DesktopApp.tsx`) +
  mobile flow (`App.tsx`).

## Aesthetic Direction
- **Direction:** Luxury/Refined with subtle Art Deco accents (geometric
  precision, precious-metal color used sparingly, high contrast).
- **Decoration level:** intentional — a soft radial glow and fine borders,
  never busy patterns or heavy texture.
- **Mood:** a serious, high-stakes real casino — the opposite of "prototype."
  Confident, quiet, precise. Celebration is earned (win moments), not ambient.
- **Reference sites:** researched BC.Game and Roobet (dark near-black
  surfaces, one precious accent color, sidebar app-shell nav — category
  baseline) plus general 2026 premium-casino design coverage (dark mode,
  editorial typography, gold used as an accent point, not a full palette).
- **The one thing to remember:** "this feels like a real high-level casino" —
  every decision below serves that, not "cute mobile game."

## Typography
- **Display/Hero:** Fraunces — elegant, high-contrast serif. Replaces Fredoka
  (rounded/bubbly — reads as a casual mobile game, actively worked against
  the "premium casino" goal). Weight 600, optical size 72–144 for hero scale.
- **Body:** General Sans — clean geometric sans. Replaces Nunito for the same
  reason: rounded body text undercut the premium read.
- **UI/Labels:** General Sans, weight 500/600.
- **Data/Tables:** General Sans with `font-variant-numeric: tabular-nums` for
  all coin amounts, ranks, and stats (already the convention in `api.ts`
  display helpers — keep it).
- **Code:** not applicable (no code-display surfaces in the product).
- **Loading:** Fraunces via Google Fonts (`fonts.googleapis.com`), General
  Sans via Fontshare (`api.fontshare.com`) — both already proven to load
  correctly in the existing `fonts.css` pattern.
- **Scale:** hero 56–108px (clamp, serif) · h2 32–38px (serif) · h3 22–26px
  (serif) · body 15–16px (sans) · label/caption 11–13px (sans, uppercase,
  letter-spacing 1.5–2px for section eyebrows).

## Color
- **Approach:** restrained — one precious accent (gold) does almost all the
  color work; violet is demoted from full-bleed background to a deliberate,
  sparing accent (glows, active states, one hero highlight).
- **Background:** `#0A0B14` (near-black charcoal-navy) — replaces the current
  full-page purple gradient (`linear-gradient(160deg,#2E1065,#1E1B4B,#0F172A)`),
  which is precisely the "purple gradient as default" anti-pattern that reads
  as generic/AI-templated rather than intentional.
- **Surface:** `#14151F` (cards, sidebar, panels) · `#1B1C29` (raised/hover surface).
- **Primary accent — Gold:** `#D4AF6A` (refined metallic gold), bright variant
  `#E6C687` for gradients/highlights — replaces the current `#FBBF24`
  "cartoon yellow." Used for primary CTAs, prize amounts, active/win states.
- **Secondary accent — Violet:** `#6D28D9` (kept — this is the existing brand
  color, not abandoned) — used ONLY for: the top-of-hero radial glow, active
  nav-item tint, room-card corner glow, wallet-connected accent. Never as a
  full-surface background again.
- **Semantic:** win/success `#3FAE7B` · error/loss `#C4544B` · warning
  (existing) `#F2B544` is close enough to gold to fold into the gold family
  rather than keep as a separate warning hue.
- **Text:** primary `#F2F1ED` · dim `#9C9CAB` · faint `#5B5C6B`.
- **Dark mode:** dark-only, by design — this is a SAFE choice, not an
  oversight. Real-money casino products are almost universally dark-mode-only
  in this category; a light mode would fight the "premium/serious" mood and
  isn't something users in this category expect or ask for.

## Spacing
- **Base unit:** 8px.
- **Density:** comfortable — more generous than the current build, which
  leans on tightly-packed rounded "pill" cards. Let panels breathe.
- **Scale:** 2xs(4) xs(8) sm(12) md(16) lg(24) xl(32) 2xl(48) 3xl(64).

## Layout
- **Approach:** hybrid — grid-disciplined sidebar app-shell (Home/Games/
  Rooms/Leaderboard — already the right structure and matches category
  convention; keep it) + a more editorial treatment specifically on the Home
  screen (larger serif hero, eyebrow label, trust-badge row) so the entry
  point reads as a considered landing moment, not just another dashboard tile.
- **Grid:** sidebar fixed ~212px · content area fluid, room/game cards
  `repeat(auto-fill, minmax(240px,1fr))`.
- **Max content width:** 1180px for centered content sections.
- **Border radius:** sm 6px (chips/badges) · md 10px (buttons, inputs) ·
  lg 16px (cards, modals) · full 9999px (pills, avatar). Notably smaller/
  crisper than the current build's heavy rounding — sharper corners read
  more premium than maximal bubbliness.

## Motion
- **Approach:** intentional but restrained for general UI (fades, small
  scale/opacity transitions on modals and nav) — NOT the current bouncy/
  playful animation language throughout. **Exception, keep as-is:** the Win
  screen's confetti/pulse celebration — a real payout deserves a real
  celebration moment; that's earned motion, not ambient decoration.
- **Easing:** enter `ease-out` · exit `ease-in` · move `ease-in-out`.
- **Duration:** micro 80ms · short 180ms · medium 300ms · long 500ms (win
  celebration only).

## Naming
- **Product name: Casino Rush** (was "Bingo Rush"). Update user-facing copy,
  page `<title>`, header wordmark, and README. The on-chain game-server
  internals (round/room logic, tx types) can keep their existing `bingo_*`
  naming — this is a brand-facing rename, not a protocol rename.

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-08-17 | Design system created (Luxury/Refined, dark-only, gold+violet-as-accent) | Created by /design-consultation. Memorable-thing target: "feels like a real high-level casino." Research: BC.Game, Roobet (dark near-black + one precious accent, sidebar shell = category baseline). |
| 2026-08-17 | Renamed product Bingo Rush → Casino Rush | User decision during design consultation — aligns with the multi-game platform direction and the graduated chain already being named "Casino" (chainId 406). |
| 2026-08-17 | Fredoka/Nunito → Fraunces/General Sans | Rounded/bubbly type actively worked against the "premium casino" goal; serif display + clean geometric sans is the single highest-leverage change for the memorable-thing target. |
| 2026-08-17 | Full-page purple gradient → near-black background with violet as sparing accent | The current full-bleed purple gradient is a recognized "generic AI design" anti-pattern; demoting violet to an accent (kept, not abandoned) reads as intentional rather than templated. |
