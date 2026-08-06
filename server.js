/**
 * server.js
 * A tiny static file server that auto-regenerates projects.json on every
 * request, so adding new category folders / project folders / photos is
 * detected automatically on the next page refresh.
 *
 * STRUCTURE:
 *   <CategoryFolder>/            <- a category (e.g. VRC_WORLDS)
 *     <ProjectFolder>/           <- a project (e.g. DENNIFERS)
 *       photo1.png
 *
 * Usage:
 *   node server.js
 *
 * Then open http://localhost:3000/portfolio.html
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const DOWNLOADS_DIR = path.join(ROOT, 'DOWNLOADS');
const COMMISSIONS_DIR = path.join(ROOT, 'COMMISIONINFO');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon'
};

// Map category folder names to friendly labels shown in the UI.
// Add new entries here when you create a new category folder.
const CATEGORY_LABELS = {
  VRC_WORLDS: 'VRC Worlds',
  UNITY_PROJECTS: 'Unity Projects'
};
const EXCLUDE_PROJECT_CATEGORIES = new Set([
  'COMMISIONINFO',
  'DOWNLOADS',
  'SUPPORT_PHOTOS',
  'VRC_PHOTOS',
  'RESOURCES',
  'CONFIG',
  'tests'
]);

function buildProjects() {
  const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.avif']);
  const isImage = (f) => IMAGE_EXTS.has(path.extname(f).toLowerCase());
  const urlEncode = (name) => name.split(path.sep).map(encodeURIComponent).join('/');
  const labelFor = (name) => CATEGORY_LABELS[name] || name.replace(/_/g, ' ');

  const categories = [];
  const categoryEntries = fs.readdirSync(ROOT, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== 'node_modules' && !e.name.startsWith('.') && !EXCLUDE_PROJECT_CATEGORIES.has(e.name));

  for (const catEntry of categoryEntries) {
    const catDir = path.join(ROOT, catEntry.name);
    const projects = [];

    const projectEntries = fs.readdirSync(catDir, { withFileTypes: true })
      .filter((e) => e.isDirectory());

    for (const projEntry of projectEntries) {
      const projDir = path.join(catDir, projEntry.name);
      const files = fs.readdirSync(projDir)
        .filter(isImage)
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      if (files.length === 0) continue; // hide projects with no photos
      projects.push({
        name: projEntry.name,
        photos: files.map((f) => urlEncode(path.join(catEntry.name, projEntry.name, f)))
      });
    }

    if (projects.length === 0) continue; // hide categories with no projects

    projects.sort((a, b) => a.name.localeCompare(b.name));
    categories.push({
      name: catEntry.name,
      label: labelFor(catEntry.name),
      projects
    });
  }

  categories.sort((a, b) => a.label.localeCompare(b.label));
  return { categories };
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function buildPlaceholderThumbnail(title) {
  const label = String(title || 'D').trim().slice(0, 2).toUpperCase();
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1600 1000">
      <defs>
        <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#7f5af0" />
          <stop offset="100%" stop-color="#2cb67d" />
        </linearGradient>
      </defs>
      <rect width="1600" height="1000" fill="#0a0a14" />
      <rect x="60" y="60" width="1480" height="880" rx="42" fill="url(#g)" fill-opacity="0.18" stroke="rgba(255,255,255,0.2)" />
      <circle cx="1260" cy="280" r="220" fill="#7f5af0" fill-opacity="0.18" />
      <circle cx="350" cy="760" r="240" fill="#2cb67d" fill-opacity="0.16" />
      <text x="800" y="525" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="220" font-weight="700" fill="#f5f7ff">${label}</text>
      <text x="800" y="660" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="44" font-weight="500" fill="#dcdcf5" letter-spacing="6">DOWNLOAD</text>
    </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function buildCommissions() {
  if (!fs.existsSync(COMMISSIONS_DIR)) return [];

  const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.avif']);
  const isImage = (f) => IMAGE_EXTS.has(path.extname(f).toLowerCase());
  const urlEncode = (name) => name.split(path.sep).map(encodeURIComponent).join('/');

  return fs.readdirSync(COMMISSIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) => {
      const dirPath = path.join(COMMISSIONS_DIR, entry.name);
      const metadataPath = path.join(dirPath, 'metadata.json');
      let metadata = {};

      if (fs.existsSync(metadataPath)) {
        try {
          metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
        } catch (err) {
          console.warn(`Could not parse commissions metadata for ${entry.name}:`, err.message);
        }
      }

      const imagesDir = path.join(dirPath, 'images');
      const images = fs.existsSync(imagesDir)
        ? fs.readdirSync(imagesDir)
            .filter((file) => isImage(file))
            .sort((a, b) => a.localeCompare(b))
            .map((file) => urlEncode(path.join('COMMISIONINFO', entry.name, 'images', file)))
        : [];

      const tags = Array.isArray(metadata.tags)
        ? metadata.tags
        : typeof metadata.tags === 'string'
          ? metadata.tags.split(',').map((tag) => tag.trim()).filter(Boolean)
          : [];

      const fallbackTags = [metadata.category || 'Commission', 'Unity', 'VRChat'];
      const normalizedTags = tags.length > 0 ? tags : fallbackTags;

      const description = Array.isArray(metadata.description)
        ? metadata.description.join(' ').replace(/\s+/g, ' ').trim()
        : (metadata.description || 'Commission offering details coming soon.');

      return {
        id: entry.name,
        category: metadata.category || entry.name.replace(/_/g, ' '),
        description,
        tags: normalizedTags,
        images,
        folder: entry.name
      };
    });
}

function buildDownloads() {
  if (!fs.existsSync(DOWNLOADS_DIR)) return [];

  const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.avif']);
  const isImage = (f) => IMAGE_EXTS.has(path.extname(f).toLowerCase());
  const urlEncode = (name) => name.split(path.sep).map(encodeURIComponent).join('/');

  return fs.readdirSync(DOWNLOADS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) => {
      const dirPath = path.join(DOWNLOADS_DIR, entry.name);
      const metadataPath = path.join(dirPath, 'metadata.json');
      let metadata = {};

      if (fs.existsSync(metadataPath)) {
        try {
          metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
        } catch (err) {
          console.warn(`Could not parse metadata for ${entry.name}:`, err.message);
        }
      }

      const zipFiles = fs.readdirSync(dirPath)
        .filter((file) => file.toLowerCase().endsWith('.zip'))
        .sort((a, b) => a.localeCompare(b));
      const requestedZip = typeof metadata.zip === 'string' ? metadata.zip : '';
      const zipFile = requestedZip && zipFiles.includes(requestedZip)
        ? requestedZip
        : (zipFiles[0] || null);
      const zipPath = zipFile ? path.join(dirPath, zipFile) : null;
      const fileSize = zipPath && fs.existsSync(zipPath)
        ? formatBytes(fs.statSync(zipPath).size)
        : 'Unknown';

      const imageFiles = fs.readdirSync(dirPath)
        .filter((file) => isImage(file))
        .sort((a, b) => a.localeCompare(b));
      const iconPath = path.join(DOWNLOADS_DIR, 'downloadicon.png');
      const thumbnail = fs.existsSync(iconPath)
        ? urlEncode(path.join('DOWNLOADS', 'downloadicon.png'))
        : buildPlaceholderThumbnail(metadata.title || entry.name);

      const tags = Array.isArray(metadata.tags)
        ? metadata.tags
        : typeof metadata.tags === 'string'
          ? metadata.tags.split(',').map((tag) => tag.trim()).filter(Boolean)
          : [];

      const normalizedTags = tags.length > 0 ? tags : (metadata.category ? [metadata.category] : ['Archive']);

      return {
        id: entry.name,
        title: metadata.title || entry.name.replace(/_/g, ' '),
        version: metadata.version || 'Latest',
        description: metadata.description || 'A downloadable item from the archive.',
        tags: normalizedTags,
        fileSize,
        zipFile,
        zipUrl: zipFile ? urlEncode(path.join('DOWNLOADS', entry.name, zipFile)) : '#',
        thumbnail,
        folder: entry.name
      };
    });
}

const server = http.createServer((req, res) => {
  // Resolve requested path safely
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';

  const filePath = path.join(ROOT, path.normalize(urlPath));

  // Prevent path traversal outside ROOT
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  if (urlPath === '/downloads.json') {
    try {
      const data = buildDownloads();
      fs.writeFileSync(path.join(ROOT, 'downloads.json'), JSON.stringify(data, null, 2), 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(data));
      return;
    } catch (err) {
      console.error('Failed to regenerate downloads.json:', err.message);
      res.writeHead(500);
      res.end('Server Error');
      return;
    }
  }

  if (urlPath === '/commissions.json') {
    try {
      const data = buildCommissions();
      fs.writeFileSync(path.join(ROOT, 'commissions.json'), JSON.stringify(data, null, 2), 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(data));
      return;
    } catch (err) {
      console.error('Failed to regenerate commissions.json:', err.message);
      res.writeHead(500);
      res.end('Server Error');
      return;
    }
  }

  // Auto-regenerate projects.json on every request to the portfolio
  if (urlPath.includes('portfolio.html') || urlPath.includes('projects.json')) {
    try {
      const data = buildProjects();
      fs.writeFileSync(path.join(ROOT, 'projects.json'), JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
      console.error('Failed to regenerate projects.json:', err.message);
    }
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404);
        res.end('404 Not Found');
      } else {
        res.writeHead(500);
        res.end('Server Error');
      }
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(content);
  });
});

if (require.main === module) {
  function listen(port, attemptsLeft = 10) {
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE' && attemptsLeft > 0) {
        console.warn(`Port ${port} is busy, trying ${port + 1}...`);
        listen(port + 1, attemptsLeft - 1);
        return;
      }
      throw err;
    });

    server.listen(port, () => {
      console.log(`Server running at http://localhost:${port}/#/home`);
      console.log('   Add category folders / project folders / photos, then refresh.');
    });
  }

  listen(PORT);
}

module.exports = { buildDownloads, buildCommissions, buildProjects };
