# Testing

100% test coverage is the key to great vibe coding. Tests let you move fast,
trust your instincts, and ship with confidence — without them, vibe coding is
just yolo coding. With tests, it's a superpower.

## Framework

[Vitest](https://vitest.dev) + [Testing Library](https://testing-library.com)
(`@testing-library/react`), jsdom environment. Config: `vitest.config.ts`.

## Running tests

```bash
npm test          # run once (CI mode)
npx vitest         # watch mode
```

## Test layers

- **Unit tests** (`src/lib/*.test.ts`) — pure logic and API/wallet client
  functions. This is where most coverage should live: `api.ts` (pricing,
  request helpers) and `wallet.ts` (FleetWallet integration, error
  classification) are the highest-risk modules since bugs there mean
  over/undercharging a real on-chain transaction or silently swallowing a
  real wallet error.
- **Component tests** — not set up yet. Add with
  `@testing-library/react` + `render()`/`screen` when a component's behavior
  (not just its logic) needs coverage.
- **E2E / browser tests** — none in this repo. Manual QA against the
  deployed app (`https://bingoapp.jfmcss.com`) plus the Python
  `tests/test_gameserver.py` E2E test on the backend (separate repo/host)
  cover the full on-chain flow today.

## Conventions

- One `*.test.ts` file per source file, colocated (`api.ts` → `api.test.ts`).
- `describe(functionName, ...)` blocks, `it("does X", ...)` with a plain-English
  behavior description, not an implementation description.
- Mock `window.fleet` directly for wallet tests (see `wallet.test.ts`) rather
  than mocking the whole `wallet.ts` module — the point is to test the real
  error-classification logic, not bypass it.
