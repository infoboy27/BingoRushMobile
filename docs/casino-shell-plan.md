# Plan — Casino Shell (Fase A)

Objetivo: convertir el mockup "Bingo Rush Web3 Game" (artifact analizado 2026-07-28) en el
frontend REAL de la plataforma, conectado 100% a lo que ya tenemos construido y probado en
la chain graduada (405). Poker/Domino/Pool/Roulette quedan como tiles "Coming Soon" — cero
trabajo de backend en esta fase. Ver contexto completo en `docs/economy-and-token.md` y
`chain/deploy/graduated-chain.md`.

Regla de oro de esta fase: **no se toca el plugin/chain a menos que se diga explícitamente**.
Todo lo de abajo es frontend + una capa delgada nueva de persistencia en el game server.

---

## Orden de tareas

### 1. Persistencia mínima en el game server (base de todo lo demás)
- Agregar SQLite (`gameserver/db.py`) con dos tablas: `rounds` (round_id, room, entry_fee,
  rake_bps, winners json, payouts json, settled_at, tx_hash) y `player_stats` (address,
  games_played, wins, total_won, updated_at).
- Escribir a estas tablas en el mismo punto donde hoy se hace `settle` en `rooms.py`.
- Nuevo endpoint `GET /players/{address}/history` y `GET /players/{address}/stats`.
- **Por qué primero:** Dashboard, Leaderboard y Profile dependen de esto; sin esto son mock.

### 2. Endpoint de leaderboard
- `GET /leaderboard?period=daily|weekly|monthly|alltime` — agrega sobre `player_stats`
  (o filtra `rounds` por fecha para daily/weekly/monthly).
- Sin ranking on-chain: se calcula del índice local: es información pública derivada de
  eventos ya verificados on-chain (settle), no un nuevo dato de confianza.

### 3. Panel Provably Fair (dato que YA existe, solo falta exponerlo)
- `GET /rounds/{id}/proof` → `{commitment, seed, blockHeight, settleTxHash}` (ya lo tenemos
  todo en `RoomRound`/el resultado de settle; falta un endpoint que lo sirva tal cual).
- Frontend: panel colapsable en la pantalla de juego, igual al del mockup.

### 4. Activar el shop de gems/cosméticos (plugin ya lo soporta, UI nunca lo usó)
- `GET /shop/cosmetics` (ya existe `/shop` genérico; agregar catálogo de cosméticos).
- Frontend: pantalla "Card Skins" que llama `buy_gems`/`buy_cosmetic` vía
  `canopySignAndSubmit` (mismo patrón que `bingoJoin`).
- Necesita nuevo campo en `wallet.ts`: `buyCosmetic(p)` construyendo `MessageBuyCosmetic`.

### 5. Wallet page real
- Balance disponible: ya se puede leer (`account_balance`).
- Balance "locked": suma de `entryFee` de rondas activas donde el jugador está registrado
  (calculable en el game server, no requiere nuevo estado on-chain).
- Historial de tx: se sirve desde la tabla `rounds` de la tarea 1 (no hace falta indexer
  genérico de la chain, alcanza con lo que nosotros mismos originamos).
- "Buy $BINGO": en dev sigue siendo `faucet`; queda pendiente de fiat on/off-ramp (fuera de
  esta fase, ver `docs/economy-and-token.md` §5).

### 6. Confirm Join — estados de escrow explícitos
- Reemplazar el flujo actual (spinner de pasos genérico) por los estados del mockup:
  `idle → awaiting signature → pending on-chain → confirmed / insufficient / failed`,
  mapeados 1:1 a las fases reales de `bingoJoin` (esperando popup de FleetWallet → tx en
  mempool → incluida en bloque).

### 7. Waiting room: chat + ready-up
- Chat: nuevo canal WS por ronda (`/ws/rounds/{id}/chat`), broadcast en memoria, sin
  persistencia — no es dato de negocio.
- "Ready up": bandera local en el game server por participante; el inicio de la ronda ya
  no depende solo de un timer sino de todos "ready" O el timer (lo que ocurra primero).

### 8. Dashboard / Profile
- Frontend puro sobre los endpoints de las tareas 1 y 5 (historial + stats). Sin lógica
  nueva de servidor más allá de lo ya listado.

### 9. Reestructurar el frontend al shell del mockup
- Reemplazar `DesktopApp.tsx` (y el equivalente móvil) por la navegación del mockup:
  sidebar/bottom-nav con Home / Games / Rooms / Tournaments(disabled) / My Games / Rewards /
  Wallet / Leaderboard / Profile.
- Games Lobby: Bingo con status "live" (link real); Poker/Domino/Pool con status
  "coming-soon" (botón "Notify me", sin backend); Roulette con status "tournament" pero
  deshabilitado por ahora (evita prometer algo que no existe todavía).
- Reusa componentes ya existentes (`WalletButton`, la lógica de `play()`, `roundSocket`)
  en vez de reescribirlos.

### 10. QA end-to-end + deploy
- Probar en `bingoapp.jfmcss.com` contra la chain 405: connect wallet → join real → chat →
  ready-up → juego → call bingo → result → wallet page muestra el historial correcto →
  leaderboard refleja la partida.
- Redeploy `ui-dist` (nginx) + `bingo-gameserver` (nueva imagen con SQLite).

---

## Explícitamente FUERA de esta fase
- Poker, Domino, Pool, Roulette reales (juegos nuevos completos — fases futuras B/C/D).
- Torneos con bracket real.
- Salas "ranked"/privadas con lógica real (hoy son solo etiquetas visuales).
- Deposit/withdraw con fiat (Stripe, KYC) — bloqueado por temas legales/negocio, no técnicos.

## Notas de esfuerzo
- Tareas 1–5: bajo esfuerzo, reutilizan piezas ya construidas y probadas (~1 semana).
- Tareas 6–8: esfuerzo medio, trabajo de estado/UX nuevo pero sin chain nueva (~1 semana).
- Tarea 9: la más grande en volumen de UI, pero sin riesgo técnico (~3-5 días).
