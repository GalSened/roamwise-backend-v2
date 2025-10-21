import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'list',
  timeout: 30000,

  use: {
    baseURL: 'http://localhost:8080',
    trace: 'on-first-retry',
  },

  webServer: {
    command: 'node server.js',
    url: 'http://localhost:8080/health',
    reuseExistingServer: false,
    timeout: 10000,
  },
});
