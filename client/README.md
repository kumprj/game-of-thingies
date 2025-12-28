# Game of Thingies (Client)

This folder contains the frontend client for **Game of Thingies**, built with React + Vite (TypeScript). It communicates with the backend API (Axios) and uses Socket.io for real-time game updates.

## Requirements

- Node.js (LTS recommended)
- Backend running locally (typically on `http://localhost:3001`)

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

- In development, the client is expected to call the backend at `http://localhost:3001` (either directly via `src/gameConfig.ts` or through a Vite proxy if configured).
- In production, the client should use your deployed backend URL (e.g., Render).

## Tech Stack

- React
- Vite
- TypeScript
- Axios
- Socket.io-client
- Vitest + React Testing Library
- Framer Motion + canvas-confetti

