const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'images', 'band');

test('band photos are 400 KB or smaller', () => {
  const tooBig = fs.readdirSync(dir)
    .filter(f => f.endsWith('.jpg'))
    .map(f => ({ f, kb: Math.round(fs.statSync(path.join(dir, f)).size / 1024) }))
    .filter(({ kb }) => kb > 400);
  expect(tooBig).toEqual([]);
});

test('internal files are excluded from the published site', () => {
  const config = fs.readFileSync(path.join(__dirname, '..', '_config.yml'), 'utf8');
  const lines = config.split('\n').map(l => l.trim());
  for (const entry of ['docs', 'tests', 'scripts', 'package.json', 'package-lock.json', 'playwright.config.js']) {
    expect(lines).toContain(`- ${entry}`);
  }
});
