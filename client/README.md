# Game of Thingies (Client)

This folder contains the frontend client for **Game of Thingies**, built with React + Vite (TypeScript). It communicates with the backend API (Axios) and uses Socket.io for real-time game updates.

## Requirements

- Node.js (LTS recommended)
- Backend running locally on `http://localhost:3001`. Easiest: `npm run dev` from the repo root,
  which starts the server and this client together (`sst dev`).

## Project Layout

- `src/pages/`: Route-level pages (e.g., HomePage, StartGamePage)
- `src/components/`: Reusable UI components (e.g., Scoreboard)
- `src/hooks/`: Custom hooks for game logic (e.g., `useGameLogic.ts`)
- `src/gameConfig.ts`: API + Socket configuration

## Local Development

From the `client/` folder:

### Start the dev server

npm start


Vite will serve the app (default):
- http://localhost:5173

### Build for production

npm run build


Outputs a production build to:

- `client/dist`

### Preview the production build locally

npm run preview 


## Testing (Unit Tests)

### Run tests in watch mode
npm test


### Run tests with the Vitest UI (optional)

npx vitest --ui


## Environment / API Notes

- The backend URL comes from `VITE_API_URL` (`src/apiUrl.ts`). `sst.config.ts` sets it for each
  deployed stage (production: `https://api.gameofthings.fun`); without it the client uses
  `http://localhost:3001`.

## Tech Stack

- React
- Vite
- TypeScript
- Axios
- Socket.io-client
- Vitest + React Testing Library
- Framer Motion + canvas-confetti

