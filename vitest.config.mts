import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Mirrors the "@/*" path alias in tsconfig.json
    alias: { '@': import.meta.dirname },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Keep the real library database well away from the suite.
    env: { APP_PIN: '4321' },
  },
});
