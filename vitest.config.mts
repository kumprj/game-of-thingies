import {defineConfig} from 'vitest/config';

// Server tests. `npm test` runs the unit tests; `npm run test:integration` runs the integration
// tests, which need DynamoDB Local (see server/integration/game.integration.test.ts). The web
// client has its own config in client/.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['server/**/*.test.ts'],
          exclude: ['server/integration/**'],
        },
      },
      {
        test: {
          name: 'integration',
          include: ['server/integration/**/*.test.ts'],
          testTimeout: 20_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
});
