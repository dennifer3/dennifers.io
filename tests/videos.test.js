const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { buildVideosData } = require('../generate');
const { buildVideos } = require('../server');

const outputPath = path.join(__dirname, '..', 'videos.json');
const generatedItems = buildVideosData();
const serverItems = buildVideos();

assert.ok(Array.isArray(generatedItems), 'buildVideosData should return an array');
assert.ok(Array.isArray(serverItems), 'buildVideos should return an array');
assert.ok(fs.existsSync(outputPath), 'videos.json should be written by the generator');

if (generatedItems.length > 0) {
  const first = generatedItems[0];
  assert.ok(first.title, 'video item should include a title');
  assert.ok(first.videoUrl, 'video item should include a videoUrl');
  assert.ok(Array.isArray(first.tags), 'video item should include tags');
}

console.log(`Verified ${generatedItems.length} video item(s)`);
