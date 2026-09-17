import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Live tests call SerpApi and Gemini for real and spend searches, so they only run through `npm run test:live`.
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname) } },
  test: {
    environment: 'node',
    include: ['tests/**/*.live.test.ts'],
    testTimeout: 90_000,
    fileParallelism: false,
  },
});
