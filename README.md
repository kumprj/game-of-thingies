# game-of-thingies

A simple multiplayer party game backend and client scaffold built with TypeScript, Express,
Socket.IO, and React. Uses DynamoDB for persistence and provides REST endpoints plus real-time
updates.

## FEATURES

- Create and manage games with 4-letter game codes
- Submit entries and reveal them when a game starts
- Real-time updates via WebSocket / Socket.IO
- DynamoDB-backed persistence
- Minimal React hook utilities included for client forms

## TECH STACK

- Node.js + TypeScript
- Express for REST API
- Socket.IO for real-time communication
- AWS DynamoDB (via @aws-sdk/lib-dynamodb)
- React for client components/hooks
- npm for package management

## REPOSITORY LAYOUT

- src/ - TypeScript server and client source
- src/routes.ts - API routes for game and entries
- src/db.ts - DynamoDB client wrapper
- src/types.ts - Entry, Game, Score interfaces
- README.md - This file

## GETTING STARTED (LOCAL)

1. Install dependencies:
   `npm install`

2. Have AWS credentials for the account configured (a profile or environment variables).

3. Start everything with `npm run dev` (`sst dev`). The first run creates your own stage: empty
   Games / Entries / Scores tables named after your user. It then runs the server on
   http://localhost:3001 and the Vite client on http://localhost:5173 against those tables, so
   local play never touches production. `npx sst remove` deletes your stage.

## DEPLOYMENT

Everything is defined in `sst.config.ts` (SST v4) and runs in AWS us-east-1:

- **Server:** an arm64 Lambda behind API Gateway and the existing CloudFront distribution at
  https://api.gameofthings.fun. It scales to zero between requests instead of paying for an
  always-on container. API Gateway does not host Socket.IO, so clients use their three-second
  polling fallback; actions still write directly to the REST API.
- **Web client:** S3 + CloudFront at https://gameofthings.fun (www redirects to it).
- **Tables:** production uses the existing Games / Entries / Scores tables (the `GameOfThings`
  CloudFormation stack in `cfn_tables.yml`); other stages get their own. Every write sets
  `expiresAt` a day ahead, and DynamoDB's TTL deletes games, answers and scores once it passes.

`.github/workflows/deploy.yml` runs `npx sst deploy --stage production` after every merge to
`main`, signing in to AWS through GitHub OIDC (`infra/ci-iam/template.yaml`). To deploy by hand:
`npx sst deploy --stage production`. A throwaway stage: `npx sst deploy --stage <name>` serves
<name>.gameofthings.fun and api-<name>.gameofthings.fun; remove it with
`npx sst remove --stage <name>`.

## API SUMMARY

Base path: /api

- POST /createGame
  Body: { name: string, question?: string }
  Response: { gameId: string }
  Creates a game with a random 4-letter id.

- POST /games/:gameId/entries
  Body: { authorName: string, text: string }
  Response: { entryId: string }
  Adds an entry and emits entriesUpdated to the game's Socket.IO room.

- POST /games/:gameId/start
  Body (optional): { turnSeconds?: number } (10 to 600; omit for no timer)
  Response: { success: true, turnOrder: string[] } plus { turnDeadline, serverTime } with a timer
  Shuffles players, sets game as started, reveals entries, and emits gameStarted with the turn
  order.

- PUT /games/:gameId/players/:playerName/device
  Headers: x-player-token (the device that claimed the name)
  Body: { pushToken?: string, activityToken?: string, sandbox?: boolean } (hex APNs tokens)
  Registers where to send this player's "it's your turn" notifications and Live Activity updates.

- DELETE /games/:gameId/players/:playerName/device
  Headers: x-player-token
  Opts out: forgets the player's tokens. Tokens are also forgotten when the player withdraws their
  answer or the host removes them.

### Turn timer

The host can start a game with a per-turn timer. The server stores `turnSeconds` and, on every turn
change, a `turnDeadline` (epoch ms). `GET /games/:gameId`, the start/skip responses and the
`gameStarted` and `nextTurn` events carry `turnDeadline` with `serverTime` (the server's clock), so
clients count down against the server's clock instead of their own. The server never ends a turn
itself: at 0:00 clients show "Hurry up!" and the turn waits. With no timer none of these fields
exist.

### Push notifications (iOS)

The server sends APNs pushes (no answers in them, only the game code) when it becomes a player's
turn and when the host starts a new round, and updates each player's Live Activity (who is up and
who is left). It needs credentials, which stay out of the repo as SST secrets; until they are set
push is simply off:

```sh
npx sst secret set ApnsKey --stage production < AuthKey_XXXXXXXXXX.p8
npx sst secret set ApnsKeyId --stage production XXXXXXXXXX
npx sst secret set ApnsTeamId --stage production YYYYYYYYYY
```

Create the key in the Apple Developer portal (Keys, with Apple Push Notifications service
enabled). The iOS app and its Live Activity extension need the Push Notifications capability on
their App IDs (Xcode adds it when you sign with your team).

- GET /health
  Returns OK for the deploy workflow's post-deploy check.

## WEBSOCKET EVENTS

- The local Node server still supports Socket.IO for development and integration coverage. The
  production Lambda API uses client polling because API Gateway HTTP APIs do not keep Socket.IO
  connections.
- Server emits:
    - entriesUpdated when entries change
    - gameStarted with payload { turnOrder: string[] } when a game starts (plus turnDeadline and
      serverTime when the game has a turn timer)
    - nextTurn with payload { currentPlayer, turnOrder } whenever the turn changes (plus
      turnDeadline and serverTime with a timer)

## TESTING

- Unit tests live alongside source files or in an __tests__ directory.
- Run server tests: `npm test` (repo root). Run client tests: `npx vitest run` in `client/`.
- Coding standards and feature specs live in `specs/`.
- Tests use Vitest framework, can also run with:
  `npx vitest --ui`

DEVELOPMENT NOTES

- The server attaches the Socket.IO instance to the Express request object so routes can emit
  events: (req as any).io
- Game IDs are uppercase 4-letter codes generated by the server
- DynamoDB tables: Games (gameId), Entries (gameId + entryId) and Scores (gameId + playerName).
  The server gets their names from GAMES_TABLE, ENTRIES_TABLE and SCORES_TABLE, which SST sets.

CONTRIBUTING

- Open issues and PRs on the repository remote: origin (git@github.com:kumprj/game-of-thingies.git)
- Follow existing TypeScript style and tests

LICENSE
NA
