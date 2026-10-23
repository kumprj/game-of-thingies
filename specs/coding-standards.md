# Coding Standards

Conventions for this repo. `/code-review` treats these as the documented standards; where one conflicts with a generic smell heuristic, this file wins.

## General
- Match the surrounding code: naming, comment density, formatting. Don't reformat lines you aren't changing.
- Prefer the smallest change that puts logic in the layer that owns it. No speculative parameters, hooks or abstractions.
- Comments explain why, not what. Keep them short.

## Server (`server/`)
- Express handlers live in `routes.ts`; pure logic (no DynamoDB, no sockets) goes in its own module with a `*.test.ts` beside it (see `turnOrder.ts`).
- Fetch a Games row through `getGame`, not an inline `GetCommand`.
- Validate request input that is written to the database (names, ids) before writing it. Reject with a 4xx and a short `{error}` body.
- Write the smallest DynamoDB update that expresses the change (`SET map.#key = :v`, `ADD`). Don't read-modify-write a whole attribute when concurrent requests can touch it.
- Every handler that awaits DynamoDB catches errors, logs with `console.error`, and returns a 500 `{error}`.
- Socket events keep the existing names and payload shapes (see README, WebSocket Events).

## Client (`client/src/`)
- Function components with hooks. Game state and API calls live in `hooks/useGameLogic.ts`; pages stay presentational.
- Styling uses shared classes in `global.css` and the iOS color tokens in `:root`. Inline `style` only for one-off spacing.
- Derive a repeated condition once (`const roundOver = ...`) instead of re-testing it in JSX.
- Props with a closed set of values use a string-literal union, not `string`.
- Shared UI pieces (`TopBar`, `Modal`, `Collapse`) are used for every instance; don't hand-roll a second copy.

## Motion
- Animate `transform` and `opacity`; the one exception is the height expand in `Collapse`.
- Shared easing: ease-out `[0.23, 1, 0.32, 1]`, ease-in-out `[0.77, 0, 0.175, 1]`. Press feedback 100-160ms, dialogs and toasts 150-250ms, nothing in routine UI over 300ms.
- Anything that appears must also exit the way it came in (wrap in `AnimatePresence`).
- Don't animate actions repeated many times a session (answer taps, keyboard-driven actions).
- Honour reduced motion: the app root uses `<MotionConfig reducedMotion="user">`; CSS animations need a `prefers-reduced-motion` branch.

## Testing
- Server: `npm run typecheck` and `npm test` at the repo root (Vitest). Client: `npm run build` (type-checks) and `npx vitest run` in `client/`. iOS: see `apps/ios/README.md`.
- CI runs all of these on every PR (`.github/workflows/ci.yml`, and `ios.yml` when `apps/ios/` changes), on GitHub-hosted runners only: the repo is public, so fork PRs must never reach a self-hosted machine. CI doesn't rerun on pushes to `main`: `main` is protected, so changes only land through a PR whose `server`, `client` and `ios` checks passed.
- New pure logic gets a unit test in the same change. Randomized logic is tested by property (who can be first, no player dropped), not by seed.
- Run on Node 24 (`.nvmrc`).
- iOS stays in Swift 6 language mode (`SWIFT_VERSION = 6.x` on every target); CI fails otherwise.

## Commits and PRs
- One logical change per commit; subject in the imperative and accurate to the final behavior.
- Keep the PR description in sync with the branch: update it when scope changes.
