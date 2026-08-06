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

// Supported image extensions (case-insensitive)
const IMAGE_EXTS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.avif'
]);
// Ignore non-portfolio content folders so they do not appear in portfolio.
const EXCLUDE_CATEGORIES = new Set([
  'COMMISIONINFO',
  'DOWNLOADS',
  'SUPPORT_PHOTOS',
  'VRC_PHOTOS',
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

function urlEncode(name) {
  // Encode for safe use in a URL while keeping slashes
  return name.split(path.sep).map(encodeURIComponent).join('/');
}

function labelFor(folderName) {
  return CATEGORY_LABELS[folderName] || folderName.replace(/_/g, ' ');
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

module.exports = { build, buildCommissionsData };
