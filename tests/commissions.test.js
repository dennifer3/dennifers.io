const assert = require('assert');
const { buildCommissions } = require('../server');

const items = buildCommissions();
assert.ok(Array.isArray(items), 'buildCommissions should return an array');
assert.ok(items.length > 0, 'buildCommissions should discover commission categories');

const first = items[0];
assert.ok(first.category, 'commission item should include a category');
assert.ok(first.description, 'commission item should include a description');
assert.ok(Array.isArray(first.tags), 'commission item should include tags');
assert.ok(Array.isArray(first.images), 'commission item should include images');

console.log(`Verified ${items.length} commission category item(s)`);
