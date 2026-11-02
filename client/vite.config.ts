// client/vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
    // Node 25+ ships a global localStorage that is unusable without --localstorage-file
    // and shadows jsdom's. Turn it off so tests get jsdom's working Storage.
    execArgv: ['--no-experimental-webstorage'],
    // Pass --coverage to report
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/setupTests.ts', 'src/**/*.d.ts', 'src/index.tsx',
        'src/reportWebVitals.ts'],
      reporter: ['text-summary', 'text'],
    },
  },
});
