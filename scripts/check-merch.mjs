// Checks merch/products.json and merch/settings.json for mistakes, in plain words.
// Runs automatically on GitHub after every edit (see .github/workflows/check-merch.yml).
import { readFileSync } from 'node:fs';
import { checkStoreFiles } from '../js/store-core.js';

function read(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    console.error(`✖ ${path} isn't written correctly: ${err.message}`);
    console.error('  Usually a missing or extra comma, or a missing quote. Compare your change with the lines around it.');
    process.exit(1);
  }
}

const errors = checkStoreFiles(read('merch/products.json'), read('merch/settings.json'));
if (errors.length) {
  console.error('✖ The store files need fixing before the store can sell anything:');
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log('✔ Store files look good.');
