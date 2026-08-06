/**
 * generate.js
 * Scans top-level folders inside the project root and generates a static
 * `projects.js` data file that the portfolio page loads directly.
 *
 * This makes the site fully static and GitHub Pages-compatible: you run
 * `node generate.js`, commit the generated `projects.js`, and push to GitHub.
 *
 * STRUCTURE:
 *   <CategoryFolder>/            <- a category (e.g. VRC_WORLDS)
 *     <ProjectFolder>/           <- a project (e.g. DENNIFERS)
 *       photo1.png
 *       photo2.png
 *
 * Each top-level folder becomes a category. Each subfolder inside it becomes
 * a project. All image files in a project folder become gallery photos.
 * Folders (categories or projects) with zero images are skipped automatically.
 *
 * CATEGORY_LABELS maps a folder name to a friendly display label.
 * Add new categories here as you create them.
 *
 * Usage:
 *   node generate.js
 *
 * Outputs: projects.js  (a static JS file exposing window.PROJECTS)
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const OUTPUT = path.join(ROOT, 'projects.js');
const VIDEOS_OUTPUT = path.join(ROOT, 'videos.json');

// Supported image extensions (case-insensitive)
const IMAGE_EXTS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.avif'
]);
const VIDEO_EXTS = new Set([
  '.mp4', '.webm', '.mov', '.m4v'
]);
// Ignore non-portfolio content folders so they do not appear in portfolio.
const EXCLUDE_CATEGORIES = new Set([
  'COMMISIONINFO',
  'DOWNLOADS',
  'SUPPORT_PHOTOS',
  'VRC_PHOTOS',
  'VIDEOS',
  'RESOURCES',
  'CONFIG',
  'tests'
]);
// Map category folder names to friendly labels shown in the UI.
// Add new entries here when you create a new category folder.
const CATEGORY_LABELS = {
  VRC_WORLDS: 'VRC Worlds',
  UNITY_PROJECTS: 'Unity Projects'
};

function isImage(file) {
  return IMAGE_EXTS.has(path.extname(file).toLowerCase());
}

function isVideo(file) {
  return VIDEO_EXTS.has(path.extname(file).toLowerCase());
}

function urlEncode(name) {
  // Encode for safe use in a URL while keeping slashes
  return name.split(path.sep).map(encodeURIComponent).join('/');
}

function labelFor(folderName) {
  return CATEGORY_LABELS[folderName] || folderName.replace(/_/g, ' ');
}

function readJsonIfPresent(filePath, label) {
  if (!fs.existsSync(filePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.warn(`Skipping invalid metadata for ${label}:`, err.message);
    return {};
  }
}

function normalizeTags(tags, fallback = ['Clip']) {
  if (Array.isArray(tags)) {
    return tags.map((tag) => String(tag).trim()).filter(Boolean);
  }
  if (typeof tags === 'string') {
    return tags.split(',').map((tag) => tag.trim()).filter(Boolean);
  }
  return fallback;
}

function titleFromName(name) {
  return path.parse(name).name.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function buildVideosData() {
  const videosDir = path.join(ROOT, 'VIDEOS');
  if (!fs.existsSync(videosDir)) {
    fs.writeFileSync(VIDEOS_OUTPUT, JSON.stringify([], null, 2), 'utf8');
    console.log(`✅ Generated ${VIDEOS_OUTPUT}`);
    return [];
  }

  const items = [];
  const entries = fs.readdirSync(videosDir, { withFileTypes: true })
    .filter((entry) => !entry.name.startsWith('.'))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const folderPath = path.join(videosDir, entry.name);
      const metadata = readJsonIfPresent(path.join(folderPath, 'metadata.json'), entry.name);
      const files = fs.readdirSync(folderPath)
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      const requestedVideo = typeof metadata.video === 'string' ? metadata.video : '';
      const videoFile = requestedVideo && files.includes(requestedVideo)
        ? requestedVideo
        : files.find(isVideo);

      if (!videoFile) continue;

      items.push({
        id: entry.name,
        title: metadata.title || titleFromName(entry.name),
        description: metadata.description || 'A short clip from the archive.',
        tags: normalizeTags(metadata.tags),
        duration: metadata.duration || '',
        videoUrl: urlEncode(path.join('VIDEOS', entry.name, videoFile)),
        folder: entry.name
      });
      continue;
    }

    if (entry.isFile() && isVideo(entry.name)) {
      items.push({
        id: path.parse(entry.name).name,
        title: titleFromName(entry.name),
        description: 'A short clip from the archive.',
        tags: ['Clip'],
        duration: '',
        videoUrl: urlEncode(path.join('VIDEOS', entry.name)),
        folder: ''
      });
    }
  }

  fs.writeFileSync(VIDEOS_OUTPUT, JSON.stringify(items, null, 2), 'utf8');
  console.log(`✅ Generated ${VIDEOS_OUTPUT}`);
  return items;
}

function buildCommissionsData() {
  const commissionsOutputPath = path.join(ROOT, 'commissions.json');
  const commissionsDir = path.join(ROOT, 'COMMISIONINFO');

  if (!fs.existsSync(commissionsDir)) {
    return [];
  }

  const IMAGE_EXTS = new Set([
    '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.avif'
  ]);
  const isImage = (file) => IMAGE_EXTS.has(path.extname(file).toLowerCase());
  const urlEncode = (name) => name.split(path.sep).map(encodeURIComponent).join('/');

  const items = fs.readdirSync(commissionsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) => {
      const folderPath = path.join(commissionsDir, entry.name);
      const metadataPath = path.join(folderPath, 'metadata.json');
      let metadata = {};

      if (fs.existsSync(metadataPath)) {
        try {
          metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
        } catch (err) {
          console.warn(`Skipping invalid metadata for ${entry.name}:`, err.message);
        }
      }

      const imagesDir = path.join(folderPath, 'images');
      const images = fs.existsSync(imagesDir)
        ? fs.readdirSync(imagesDir)
            .filter(isImage)
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
            .map((file) => urlEncode(path.join('COMMISIONINFO', entry.name, 'images', file)))
        : [];

      const description = Array.isArray(metadata.description)
        ? metadata.description.join(' ').replace(/\s+/g, ' ').trim()
        : (metadata.description || 'Commission offering details coming soon.');

      return {
        id: entry.name,
        category: metadata.category || entry.name.replace(/_/g, ' '),
        description,
        images
      };
    });

  fs.writeFileSync(commissionsOutputPath, JSON.stringify(items, null, 2), 'utf8');
  console.log(`✅ Generated ${commissionsOutputPath}`);
  return items;
}

function build() {
  const categories = [];
  const categoryEntries = fs.readdirSync(ROOT, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== 'node_modules' && !e.name.startsWith('.') && !EXCLUDE_CATEGORIES.has(e.name));

  for (const catEntry of categoryEntries) {
    const catDir = path.join(ROOT, catEntry.name);
    const projects = [];

    const projectEntries = fs.readdirSync(catDir, { withFileTypes: true })
      .filter((e) => e.isDirectory());

    for (const projEntry of projectEntries) {
      const projDir = path.join(catDir, projEntry.name);
      const files = fs.readdirSync(projDir)
        .filter(isImage)
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true })); // natural sort

      if (files.length === 0) {
        console.log(`Skipping project "${catEntry.name}/${projEntry.name}" — no images found.`);
        continue; // hide projects with no photos
      }

      projects.push({
        name: projEntry.name,
        photos: files.map((f) =>
          urlEncode(path.join(catEntry.name, projEntry.name, f))
        )
      });
    }

    if (projects.length === 0) {
      console.log(`Skipping category "${catEntry.name}" — no projects with images.`);
      continue; // hide categories with no projects
    }

    projects.sort((a, b) => a.name.localeCompare(b.name));
    categories.push({
      name: catEntry.name,
      label: labelFor(catEntry.name),
      projects
    });
  }

  categories.sort((a, b) => a.label.localeCompare(b.label));

  // Generate a static JS file that the portfolio page can load directly.
  const jsContent =
    '/* ============================================================\n' +
    '   AUTO-GENERATED by generate.js — do not edit directly.\n' +
    '   Run "node generate.js" to rebuild from your folders.\n' +
    '   Data structure: [{ name, label, projects: [{ name, photos: [] }] }]\n' +
    '   ============================================================ */\n' +
    'window.PROJECTS = ' + JSON.stringify(categories, null, 2) + ';\n';

  fs.writeFileSync(OUTPUT, jsContent, 'utf8');
  buildCommissionsData();
  buildVideosData();
  console.log(`✅ Generated ${OUTPUT}`);
  console.log(`   ${categories.length} category/categories:`);
  categories.forEach((c) => {
    console.log(`   - ${c.label} (${c.name})`);
    c.projects.forEach((p) => console.log(`       • ${p.name} (${p.photos.length} photo${p.photos.length > 1 ? 's' : ''})`));
  });
}

if (require.main === module) {
  build();
}

module.exports = { build, buildCommissionsData, buildVideosData };
