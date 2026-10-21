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
