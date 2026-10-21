// @ts-check
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: 'tests',
  reporter: 'list',
  use: { baseURL: 'http://localhost:4317' },
  webServer: {
    command: 'npm run serve',
    url: 'http://localhost:4317',
    reuseExistingServer: false,
  },
  projects: [
    { name: 'mobile', use: { browserName: 'chromium', viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true } },
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1280, height: 800 } } },
  ],
});
