## Testing

Run tests: `npm test` (Vitest, jsdom). Test files live next to their source
(`src/lib/api.ts` → `src/lib/api.test.ts`). See `TESTING.md` for framework
details and conventions.

Expectations:
- 100% test coverage is the goal — tests make vibe coding safe.
- When writing a new function in `src/lib/`, write a corresponding test.
- When fixing a bug, write a regression test that reproduces it first.
- When adding error handling, write a test that triggers the error path.
- When adding a conditional (if/else, switch), test both branches.
- Never commit code that makes existing tests fail.

## Design System
Always read DESIGN.md before making any visual or UI decisions.
All font choices, colors, spacing, and aesthetic direction are defined there.
Do not deviate without explicit user approval.
In QA mode, flag any code that doesn't match DESIGN.md.
