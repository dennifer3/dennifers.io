const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { buildCommissionsData } = require('../generate');

const outputPath = path.join(__dirname, '..', 'commissions.json');
const items = buildCommissionsData();

assert.ok(Array.isArray(items), 'buildCommissionsData should return an array');
assert.ok(items.length > 0, 'buildCommissionsData should discover commission folders');
assert.ok(fs.existsSync(outputPath), 'commissions.json should be written by the generator');

const first = items[0];
assert.ok(first.category, 'commission item should include a category');
assert.ok(Array.isArray(first.images), 'commission item should include images');

console.log(`Verified ${items.length} commission item(s)`);
