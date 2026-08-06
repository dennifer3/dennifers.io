const assert = require('assert');
const path = require('path');
const { buildDownloads } = require('../server');

const items = buildDownloads();
assert.ok(Array.isArray(items), 'buildDownloads should return an array');
assert.ok(items.length > 0, 'buildDownloads should discover at least one download item');

const first = items[0];
assert.ok(first.title, 'download item should include title');
assert.ok(first.version, 'download item should include version');
assert.ok(first.description, 'download item should include description');
assert.ok(Array.isArray(first.tags), 'download item should include tags');
assert.ok(first.fileSize, 'download item should include fileSize');
assert.ok(first.zipUrl, 'download item should include zipUrl');
assert.ok(first.thumbnail, 'download item should include thumbnail');

console.log(`Verified ${items.length} download item(s)`);
