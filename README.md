
  # Bingo Rush Mobile UI/UX

  This is a code bundle for Bingo Rush Mobile UI/UX. The original project is available at https://www.figma.com/design/iI5GPX8JHJzIIOldJk9eNH/Bingo-Rush-Mobile-UI-UX.

  ## Running the code

  Run `npm i` to install the dependencies.

  Run `npm run dev` to start the development server.
  
## On-chain (Live) mode

This app can play a **real** provably-fair round backed by a Canopy blockchain:
the round is opened on-chain (commit), entries are escrowed, balls are drawn live
over a WebSocket, and the winner is paid from escrow on settle.

- Backend base URL is configured via `VITE_API_URL` (see `.env.example`), default
  `https://bingo.jfmcss.com`.
- Client lives in `src/lib/api.ts`; the flow is wired in `src/app/App.tsx`
  (Lobby → Cards → Game → Win) plus a self-contained **Live ⛓️** screen.

```
cp .env.example .env   # optional: override VITE_API_URL
npm i && npm run dev
```
Open the phone frame → **Live** pill (or Lobby → Join → Start Game) to play on-chain.
