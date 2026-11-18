import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  use: { baseURL: process.env.QA_BASE_URL || 'http://127.0.0.1:5174', browserName: 'chromium' },
  reporter: 'list',
  workers: 1
});
