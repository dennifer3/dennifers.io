/* =========================================================
   app.js — SPA router for the site
   Keeps the music player and nav persistent so audio
   continues playing across page navigation.
   ========================================================= */
(function () {
  'use strict';

  // Flag set when views are loaded through the SPA.
  // Partial HTML files redirect to index.html when loaded directly (refresh)
  // so they never render as a blank page.
  window.__spaLive = true;

  const app = document.getElementById('app');
  const siteBoot = document.getElementById('siteBoot');
  const mediaGate = document.getElementById('mediaGate');
  const mediaGateTitle = document.getElementById('mediaGateTitle');
  const mediaGateDetail = document.getElementById('mediaGateDetail');
  const mediaGateKicker = document.getElementById('mediaGateKicker');
  const mediaGateBar = document.getElementById('mediaGateBar');
  const mediaGateCount = document.getElementById('mediaGateCount');
  const mediaGateSize = document.getElementById('mediaGateSize');
  const pageScrollCue = document.getElementById('pageScrollCue');
  const pageScrollCueText = pageScrollCue ? pageScrollCue.querySelector('.page-scroll-cue-text') : null;
  const pageScrollCueArrow = pageScrollCue ? pageScrollCue.querySelector('.page-scroll-cue-arrow') : null;

  // Map route keys to content partial files
  const views = {
    home: 'index.html',
    welcome: 'welcome.html',
    portfolio: 'portfolio.html',
    vrchat: 'vrchat.html',
    videos: 'videos.html',
    downloads: 'downloads.html',
    support: 'donatesupport.html',
    commissions: 'commissions.html'
  };

  // Per-page document titles
  const titles = {
    home: 'Dennifer · Home',
    welcome: 'Dennifer · Welcome',
    portfolio: 'Dennifer · Portfolio',
    vrchat: 'Dennifer · VRChat Gallery',
    videos: 'Dennifer · Videos',
    downloads: 'Dennifer · Downloads',
    support: 'Dennifer · Support',
    commissions: 'Dennifer · Commissions'
  };

  // Reveal-on-scroll observer (shared)
  let revealObserver = null;
  let viewCleanup = null;
  let mediaLoading = false;
  let siteBootDismissed = false;
  let backgroundMediaStarted = false;
  let backgroundMediaRunning = false;
  const backgroundMediaQueue = [];
  const backgroundMediaSeen = new Set();
  const loadedMediaSets = new Set();
  const MEDIA_CACHE_STORE_KEY = 'dennifer_media_cache_sets_v2';
  const MEDIA_CACHE_MAX_AGE = 1000 * 60 * 60 * 24 * 14;
  let globalConfigPromise = null;
  const mediaGateLines = [
    'Chasing loose pixels through the vents...',
    'Convincing screenshots to stand still...',
    'Scooping up shiny image fragments...',
    'Asking the gallery to make an entrance...',
    'Polishing tiny neon corners...',
    'Catching runaway thumbnails...',
    'Sorting vibes by file size...',
    'Warming up the picture tubes...',
    'Untangling a pocket dimension of PNGs...',
    'Teaching the pixels their stage marks...',
    'Dusting off the good screenshots...',
    'Checking each image for dramatic timing...'
  ];

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeText(value, fallback = '') {
    if (Array.isArray(value)) {
      return value.join(' ').replace(/\s+/g, ' ').trim() || fallback;
    }
    return String(value ?? fallback).replace(/\s+/g, ' ').trim();
  }

  function createViewScope() {
    const cleanups = [];
    return {
      addEvent(target, type, handler, options) {
        if (!target) return;
        target.addEventListener(type, handler, options);
        cleanups.push(() => target.removeEventListener(type, handler, options));
      },
      addInterval(callback, delay) {
        const id = window.setInterval(callback, delay);
        cleanups.push(() => window.clearInterval(id));
        return id;
      },
      addCleanup(callback) {
        cleanups.push(callback);
      },
      cleanup() {
        cleanups.splice(0).forEach((fn) => fn());
      }
    };
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
      value /= 1024;
      unit += 1;
    }
    return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
  }

  function uniqueUrls(urls) {
    return [...new Set((urls || []).filter(Boolean))];
  }

  function encodeAssetPath(pathValue) {
    return normalizeText(pathValue)
      .split('/')
      .map((part) => encodeURIComponent(decodeURIComponent(part)))
      .join('/');
  }

  function parseHashRoute() {
    const raw = location.hash.replace(/^#\/?/, '');
    const [pagePart = '', queryPart = ''] = raw.split('?');
    return {
      page: pagePart.toLowerCase(),
      params: new URLSearchParams(queryPart)
    };
  }

  function targetKey(value) {
    return normalizeText(value)
      .replace(/_/g, ' ')
      .toLowerCase();
  }

  async function loadGlobalConfig() {
    if (!globalConfigPromise) {
      globalConfigPromise = fetch('CONFIG/global_config.json', { cache: 'no-store' })
        .then((res) => {
          if (!res.ok) throw new Error('Unable to load global config');
          return res.json();
        })
        .catch((err) => {
          console.warn('Global config skipped:', err);
          return {};
        });
    }
    return globalConfigPromise;
  }

  function getProjectMeta(config) {
    return (config && config.projectMeta) || {};
  }

  function setMediaGate(open) {
    mediaLoading = open;
    document.body.classList.toggle('media-loading', open);
    app.setAttribute('aria-busy', open ? 'true' : 'false');
    if (!mediaGate) return;
    mediaGate.classList.toggle('open', open);
    mediaGate.setAttribute('aria-hidden', open ? 'false' : 'true');
  }

  window.addEventListener('beforeunload', (e) => {
    if (!mediaLoading) return;
    e.preventDefault();
    e.returnValue = '';
  });

  function mediaGateLine(seed = 0) {
    return mediaGateLines[Math.abs(seed) % mediaGateLines.length];
  }

  function updateMediaGate({ title, detail, loaded, total, loadedBytes, totalBytes, measured }) {
    const percent = total > 0 ? Math.round((loaded / total) * 100) : 0;
    if (mediaGateKicker) mediaGateKicker.textContent = 'Fetching Media';
    if (mediaGateTitle) mediaGateTitle.textContent = title || 'Loading Pictures';
    if (mediaGateDetail && detail !== undefined) {
      mediaGateDetail.textContent = detail || 'Please be patient while the gallery warms up.';
    }
    if (mediaGateBar) mediaGateBar.style.width = `${percent}%`;
    if (mediaGateCount) mediaGateCount.textContent = `${loaded} / ${total} picture${total === 1 ? '' : 's'}`;
    if (mediaGateSize) {
      const knownSize = totalBytes > 0;
      mediaGateSize.textContent = knownSize
        ? `${formatBytes(loadedBytes)} / ${formatBytes(totalBytes)}`
        : (measured ? 'Size unavailable' : 'Measuring media');
    }
  }

  async function getMediaSize(url) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 3500);
    try {
      const res = await fetch(url, { method: 'HEAD', cache: 'force-cache', signal: controller.signal });
      if (!res.ok) return 0;
      return Number(res.headers.get('content-length')) || 0;
    } catch (err) {
      return 0;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function preloadImage(url) {
    return new Promise((resolve) => {
      const img = new Image();
      const timeout = window.setTimeout(() => resolve(false), 12000);
      img.onload = () => {
        window.clearTimeout(timeout);
        resolve(true);
      };
      img.onerror = () => {
        window.clearTimeout(timeout);
        resolve(false);
      };
      img.src = url;
    });
  }

  function enqueueBackgroundMedia(urls) {
    uniqueUrls(urls).forEach((url) => {
      if (!url || backgroundMediaSeen.has(url)) return;
      backgroundMediaSeen.add(url);
      backgroundMediaQueue.push(url);
    });
    runBackgroundMediaQueue();
  }

  function runBackgroundMediaQueue() {
    if (backgroundMediaRunning) return;
    backgroundMediaRunning = true;

    const runNext = async () => {
      if (mediaLoading) {
        window.setTimeout(runNext, 1200);
        return;
      }

      const batch = backgroundMediaQueue.splice(0, 3);
      if (batch.length === 0) {
        backgroundMediaRunning = false;
        return;
      }

      await Promise.all(batch.map(preloadImage));
      const idle = window.requestIdleCallback || ((callback) => window.setTimeout(callback, 800));
      idle(runNext, { timeout: 1600 });
    };

    runNext();
  }

  async function startBackgroundMediaWarmup() {
    if (backgroundMediaStarted) return;
    backgroundMediaStarted = true;

    const portfolioUrls = (window.PROJECTS || [])
      .flatMap((category) => category.projects || [])
      .flatMap((project) => project.photos || []);
    const vrchatUrls = (window.VRC_PHOTOS || [])
      .flatMap((category) => category.photos || []);

    enqueueBackgroundMedia([...portfolioUrls, ...vrchatUrls]);

    try {
      const res = await fetch('commissions.json', { cache: 'force-cache' });
      if (!res.ok) return;
      const commissions = await res.json();
      if (Array.isArray(commissions)) {
        enqueueBackgroundMedia(commissions.flatMap((item) => item.images || []));
      }
    } catch (err) {
      /* background warming should never affect navigation */
    }
  }

  function waitForImageElement(img) {
    return new Promise((resolve) => {
      if (!img) {
        resolve(false);
        return;
      }
      if (img.complete && img.naturalWidth > 0) {
        resolve(true);
        return;
      }
      const timeout = window.setTimeout(() => cleanup(false), 4200);
      function cleanup(result) {
        window.clearTimeout(timeout);
        img.removeEventListener('load', onLoad);
        img.removeEventListener('error', onError);
        resolve(result);
      }
      function onLoad() {
        cleanup(true);
      }
      function onError() {
        cleanup(false);
      }
      img.addEventListener('load', onLoad, { once: true });
      img.addEventListener('error', onError, { once: true });
    });
  }

  async function dismissSiteBootWhenReady(name) {
    if (!siteBoot || siteBootDismissed) return;
    const selector = name === 'welcome'
      ? '.welcome-preview-slot img.active'
      : name === 'home'
        ? '.featured-img.active'
        : '';
    const images = selector ? [...app.querySelectorAll(selector)].slice(0, 3) : [];
    const waitForImages = Promise.all(images.map(waitForImageElement));
    const minimumDelay = delay(900);
    const maximumDelay = delay(4800);
    await Promise.race([
      Promise.all([waitForImages, minimumDelay]),
      maximumDelay
    ]);
    siteBootDismissed = true;
    siteBoot.classList.add('hidden');
    window.setTimeout(() => {
      siteBoot.style.display = 'none';
    }, 500);
  }

  function delay(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function getStoredMediaCache() {
    try {
      const cache = JSON.parse(localStorage.getItem(MEDIA_CACHE_STORE_KEY) || '{}');
      return cache && typeof cache === 'object' ? cache : {};
    } catch (err) {
      return {};
    }
  }

  function rememberMediaCache(cacheKey) {
    try {
      const cache = getStoredMediaCache();
      cache[cacheKey] = Date.now();
      localStorage.setItem(MEDIA_CACHE_STORE_KEY, JSON.stringify(cache));
    } catch (err) {
      /* storage can be unavailable in private modes */
    }
  }

  function isRememberedMediaCache(cacheKey) {
    const cache = getStoredMediaCache();
    const cachedAt = Number(cache[cacheKey]) || 0;
    if (!cachedAt) return false;
    if (Date.now() - cachedAt > MEDIA_CACHE_MAX_AGE) return false;
    return true;
  }

  async function runLimited(items, limit, worker) {
    let next = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next;
        next += 1;
        await worker(items[index], index);
      }
    });
    await Promise.all(workers);
  }

  async function preloadMediaGroups(groups, pageTitle, cacheKey = pageTitle) {
    const normalizedGroups = (groups || [])
      .map((group) => ({
        label: normalizeText(group.label, pageTitle),
        urls: uniqueUrls(group.urls)
      }))
      .filter((group) => group.urls.length > 0);

    const allUrls = uniqueUrls(normalizedGroups.flatMap((group) => group.urls));
    if (allUrls.length === 0) return;
    const stableCacheKey = `${cacheKey}:${allUrls.join('|')}`;
    if (loadedMediaSets.has(stableCacheKey)) return;
    if (isRememberedMediaCache(stableCacheKey)) {
      loadedMediaSets.add(stableCacheKey);
      return;
    }

    let loaded = 0;
    let loadedBytes = 0;
    let totalBytes = 0;
    const sizeMap = new Map();
    const startedAt = performance.now();
    const minimumGateMs = 2200;
    let activeGroupLabel = pageTitle;
    let quirkTimer = null;

    function quirkDelay() {
      return 1500 + Math.floor(Math.random() * 1000);
    }

    function showQuirkLine() {
      updateMediaGate({
        title: `Loading ${pageTitle}`,
        detail: `${mediaGateLine(Date.now())} ${activeGroupLabel} is almost here.`,
        loaded,
        total: allUrls.length,
        loadedBytes,
        totalBytes,
        measured: totalBytes > 0
      });
    }

    function scheduleQuirkLine() {
      quirkTimer = window.setTimeout(() => {
        showQuirkLine();
        scheduleQuirkLine();
      }, quirkDelay());
    }

    setMediaGate(true);
    try {
      updateMediaGate({
        title: `Loading ${pageTitle}`,
        detail: mediaGateLine(allUrls.length),
        loaded,
        total: allUrls.length,
        loadedBytes,
        totalBytes,
        measured: false
      });

      const sizes = await Promise.all(allUrls.map(async (url) => [url, await getMediaSize(url)]));
      sizes.forEach(([url, size]) => {
        sizeMap.set(url, size);
        totalBytes += size;
      });
      showQuirkLine();
      scheduleQuirkLine();

      for (const group of normalizedGroups) {
        activeGroupLabel = group.label;
        await runLimited(group.urls, 6, async (url, index) => {
          updateMediaGate({
            title: `Loading ${pageTitle}`,
            loaded,
            total: allUrls.length,
            loadedBytes,
            totalBytes,
            measured: true
          });
          await preloadImage(url);
          loaded += 1;
          loadedBytes += sizeMap.get(url) || 0;
          updateMediaGate({
            title: `Loading ${pageTitle}`,
            loaded,
            total: allUrls.length,
            loadedBytes,
            totalBytes,
            measured: true
          });
        });
      }
    } finally {
      const elapsed = performance.now() - startedAt;
      if (quirkTimer) window.clearTimeout(quirkTimer);
      if (elapsed < minimumGateMs) {
        await delay(minimumGateMs - elapsed);
      }
      loadedMediaSets.add(stableCacheKey);
      rememberMediaCache(stableCacheKey);
      setMediaGate(false);
    }
  }

  function observeReveals() {
    const els = app.querySelectorAll('.reveal');
    if (!els.length) return;
    if (!revealObserver) {
      revealObserver = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('visible');
            revealObserver.unobserve(e.target);
          }
        });
      }, { threshold: 0.15 });
    }
    els.forEach((el) => revealObserver.observe(el));
  }

  function updatePageScrollCue() {
    if (!pageScrollCue) return;
    const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    const hasMore = maxScroll > 180;
    const nearBottom = window.scrollY >= maxScroll - 120;
    pageScrollCue.classList.toggle('visible', hasMore);
    pageScrollCue.classList.toggle('up', hasMore && nearBottom);
    pageScrollCue.setAttribute('aria-hidden', hasMore ? 'false' : 'true');
    pageScrollCue.setAttribute('aria-label', nearBottom ? 'Scroll back to top' : 'Scroll for more content');
    if (pageScrollCueText) pageScrollCueText.textContent = nearBottom ? 'Top' : 'More';
    if (pageScrollCueArrow) pageScrollCueArrow.textContent = nearBottom ? '↑' : '↓';
  }

  function schedulePageScrollCueUpdate() {
    window.requestAnimationFrame(updatePageScrollCue);
    window.setTimeout(updatePageScrollCue, 350);
    window.setTimeout(updatePageScrollCue, 1200);
  }

  if (pageScrollCue) {
    pageScrollCue.addEventListener('click', () => {
      const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const nearBottom = window.scrollY >= maxScroll - 120;
      window.scrollTo({
        top: nearBottom ? 0 : Math.min(window.scrollY + Math.floor(window.innerHeight * 0.78), maxScroll),
        behavior: 'smooth'
      });
    });
    window.addEventListener('scroll', updatePageScrollCue, { passive: true });
    window.addEventListener('resize', schedulePageScrollCueUpdate);
  }

  // ---- Portfolio rendering logic ----
  const PALETTE = ['#7f5af0', '#2cb67d', '#e58e27', '#4cc9f0', '#f72585', '#3a86ff', '#06d6a0', '#ff5e7d'];
  let allCategories = [];
  let projectMeta = {};

  function initPortfolio(scope) {
    const filtersEl = document.getElementById('filters');
    const gridEl = document.getElementById('portfolioGrid');
    const emptyEl = document.getElementById('emptyState');
    const modal = document.getElementById('modal');
    const modalBackdrop = document.getElementById('modalBackdrop');
    const modalClose = document.getElementById('modalClose');
    const modalTitle = document.getElementById('modalTitle');
    const galleryImg = document.getElementById('galleryImg');
    const galleryCounter = document.getElementById('galleryCounter');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');

    if (!gridEl) return;

    let currentPhotos = [];
    let currentIndex = 0;

    async function loadProjectMeta() {
      const config = await loadGlobalConfig();
      return getProjectMeta(config);
    }

    function visibilityPill(value) {
      const visibility = normalizeText(value);
      if (!visibility) return '';
      const key = visibility.toLowerCase();
      const className = key === 'public' ? 'is-public' : key === 'private' ? 'is-private' : '';
      return `<span class="visibility-pill ${className}">${escapeHtml(visibility)}</span>`;
    }

    function showPhoto(index) {
      currentIndex = (index + currentPhotos.length) % currentPhotos.length;
      galleryImg.src = currentPhotos[currentIndex];
      galleryCounter.textContent = `${currentIndex + 1} / ${currentPhotos.length}`;
      prevBtn.style.display = currentPhotos.length > 1 ? '' : 'none';
      nextBtn.style.display = currentPhotos.length > 1 ? '' : 'none';
    }

    function openGallery(photos, title) {
      currentPhotos = photos;
      currentIndex = 0;
      modalTitle.textContent = title;
      showPhoto(0);
      modal.classList.add('open');
      modal.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
    }

    function closeModal() {
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    }
    scope.addCleanup(closeModal);

    scope.addEvent(prevBtn, 'click', () => showPhoto(currentIndex - 1));
    scope.addEvent(nextBtn, 'click', () => showPhoto(currentIndex + 1));
    scope.addEvent(modalBackdrop, 'click', closeModal);
    scope.addEvent(modalClose, 'click', closeModal);
    scope.addEvent(document, 'keydown', (e) => {
      if (e.key === 'Escape') closeModal();
      if (modal.classList.contains('open')) {
        if (e.key === 'ArrowLeft') showPhoto(currentIndex - 1);
        if (e.key === 'ArrowRight') showPhoto(currentIndex + 1);
      }
    });

    function render(categories) {
      filtersEl.innerHTML = '';
      gridEl.innerHTML = '';
      allCategories = categories || [];

      if (allCategories.length === 0) {
        emptyEl.style.display = '';
        filtersEl.style.display = 'none';
        return;
      }

      filtersEl.style.display = '';
      emptyEl.style.display = 'none';

      const buttons = [{ name: 'All', key: 'all' }];
      allCategories.forEach((c) => buttons.push({ name: c.label, key: c.name }));

      buttons.forEach((b) => {
        const btn = document.createElement('button');
        btn.className = 'filter' + (b.key === 'all' ? ' active' : '');
        btn.dataset.filter = b.key;
        btn.textContent = b.name;
        btn.addEventListener('click', () => {
          filtersEl.querySelectorAll('.filter').forEach((f) => f.classList.remove('active'));
          btn.classList.add('active');
          applyFilter(b.key);
        });
        filtersEl.appendChild(btn);
      });

      applyFilter('all');
    }

// Build a single project card and append it to the given grid
    function buildCard(project, category, tint) {
      const projectName = normalizeText(project.name).replace(/_/g, ' ');
      const coverAlt = projectName;
      const safeProjectName = escapeHtml(projectName);
      const safeCategoryLabel = escapeHtml(category.label);
      const meta = (projectMeta[category.name] && projectMeta[category.name][project.name]) || {};
      const visibilityMarkup = visibilityPill(meta.visibility);
      const commissionedMarkup = meta.commissioned
        ? '<span class="commissioned-pill">Commissioned</span>'
        : '';
      const commissioner = meta.commissioner || {};
      const commissionerName = normalizeText(meta.commissionerName || commissioner.name);
      const commissionerVrcUrl = normalizeText(meta.commissionerVrcUrl || meta.commissionerUrl || commissioner.vrcUrl || commissioner.url);
      const commissionerMarkup = meta.commissioned && commissionerName
        ? (commissionerVrcUrl
            ? `<a class="btn project-commissioner-link" href="${escapeHtml(commissionerVrcUrl)}" target="_blank" rel="noopener noreferrer">Commissioner: ${escapeHtml(commissionerName)}</a>`
            : `<span class="btn project-commissioner-link is-static">Commissioner: ${escapeHtml(commissionerName)}</span>`)
        : '';
      const vrcUrl = normalizeText(meta.vrcUrl || meta.vrcLink);
      const vrcLinkMarkup = vrcUrl
        ? `<a class="btn btn-primary project-vrc-link" href="${escapeHtml(vrcUrl)}" target="_blank" rel="noopener noreferrer">VRC Link</a>`
        : '';
      const photoLabel = `${project.photos.length} photo${project.photos.length > 1 ? 's' : ''}`;

      // Build carousel slides from all photos
      let slides = '';
      if (project.photos.length === 0) {
        slides = `<div class="thumb-art">🌌</div>`;
      } else {
        slides = project.photos.map((src, i) => `
          <img class="thumb-img${i === 0 ? ' active' : ''}" src="${escapeHtml(src)}" alt="${escapeHtml(coverAlt)}" loading="eager" referrerpolicy="no-referrer" />
        `).join('');
      }

      const card = document.createElement('article');
      card.className = 'project reveal';
      card.dataset.category = category.name;
      card.dataset.categoryKey = targetKey(category.name);
      card.dataset.projectKey = targetKey(project.name);

      card.innerHTML = `
        <div class="project-thumb" style="--tint:${tint}">
          ${slides}
        </div>
        <div class="project-info">
          <div class="project-tags">
            <span class="tag">${safeCategoryLabel}</span>
            ${visibilityMarkup}
            ${commissionedMarkup}
          </div>
          <h3>${safeProjectName}</h3>
          <p>${photoLabel}</p>
          <div class="project-inline-actions">
            <button class="btn btn-primary gallery-open">View Photos${project.photos.length > 1 ? ` (${project.photos.length})` : ''}</button>
            ${commissionerMarkup}
            ${vrcLinkMarkup}
          </div>
        </div>
      `;

      // Auto-cycle photos every 5s if more than one
      if (project.photos.length > 1) {
        const slidesList = card.querySelectorAll('.thumb-img');
        let currentSlide = 0;
        scope.addInterval(() => {
          slidesList[currentSlide].classList.remove('active');
          currentSlide = (currentSlide + 1) % slidesList.length;
          slidesList[currentSlide].classList.add('active');
        }, 5000);
      }

      card.querySelectorAll('.gallery-open').forEach((button) => {
        button.addEventListener('click', (e) => {
          e.stopPropagation();
          openGallery(project.photos, projectName);
        });
      });

      return card;
    }

    function scrollToPortfolioTarget() {
      const { params } = parseHashRoute();
      const projectTarget = targetKey(params.get('project'));
      if (!projectTarget) return;

      const categoryTarget = targetKey(params.get('category'));
      const targetCard = [...gridEl.querySelectorAll('.project')].find((card) => {
        const projectMatches = card.dataset.projectKey === projectTarget;
        const categoryMatches = !categoryTarget || card.dataset.categoryKey === categoryTarget;
        return projectMatches && categoryMatches;
      });

      if (!targetCard) return;

      targetCard.classList.add('project-target-highlight');
      targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
      window.setTimeout(() => targetCard.classList.remove('project-target-highlight'), 2600);
    }

    function applyFilter(key) {
      gridEl.innerHTML = '';
      let idx = 0;

      // Determine which categories to show
      const shown = allCategories.filter(
        (c) => key === 'all' || c.name === key
      );

      shown.forEach((category) => {
        // When showing "All", group each category under its own section header
        if (key === 'all') {
          const section = document.createElement('div');
          section.className = 'portfolio-section';

          const header = document.createElement('div');
          header.className = 'portfolio-section-head';
          header.innerHTML = `<h2>${escapeHtml(category.label)}</h2><span>${category.projects.length} project${category.projects.length > 1 ? 's' : ''}</span>`;
          section.appendChild(header);

          const subGrid = document.createElement('div');
          subGrid.className = 'portfolio-grid';

          category.projects.forEach((project) => {
            const tint = PALETTE[idx % PALETTE.length];
            idx++;
            subGrid.appendChild(buildCard(project, category, tint));
          });

          section.appendChild(subGrid);
          gridEl.appendChild(section);
        } else {
          // Single-category filter: add cards directly to the main grid
          category.projects.forEach((project) => {
            const tint = PALETTE[idx % PALETTE.length];
            idx++;
            gridEl.appendChild(buildCard(project, category, tint));
          });
        }
      });

      observeReveals();
    }

    if (window.PROJECTS && Array.isArray(window.PROJECTS)) {
      loadProjectMeta().then((meta) => {
        projectMeta = meta || {};
        render(window.PROJECTS);
        schedulePageScrollCueUpdate();
        window.requestAnimationFrame(scrollToPortfolioTarget);
      });
      preloadMediaGroups(window.PROJECTS.map((category) => ({
        label: category.label,
        urls: (category.projects || []).flatMap((project) => project.photos || [])
      })), 'Portfolio', 'portfolio').catch((err) => console.warn('Portfolio media preload skipped:', err));
    } else {
      emptyEl.style.display = '';
      filtersEl.style.display = 'none';
      if (emptyEl.querySelector('p')) {
        emptyEl.querySelector('p').textContent =
          'No project data found. Run "node generate.js" to create projects.js, then reload.';
      }
    }
  }

// ---- VRChat photo gallery rendering logic ----
  function initVrchat(scope) {
    const filtersEl = document.getElementById('vrchatFilters');
    const jumpbarEl = document.getElementById('vrchatJumpbar');
    const gridEl = document.getElementById('vrchatGrid');
    const emptyEl = document.getElementById('vrchatEmpty');
    const modal = document.getElementById('vrchatModal');
    const modalBackdrop = document.getElementById('vrchatModalBackdrop');
    const modalClose = document.getElementById('vrchatModalClose');
    const img = document.getElementById('vrchatImg');
    const counter = document.getElementById('vrchatCounter');
    const downloadLink = document.getElementById('vrchatDownload');
    const prevBtn = document.getElementById('vrchatPrevBtn');
    const nextBtn = document.getElementById('vrchatNextBtn');
    const countEl = document.getElementById('vrchatCount');
    const countLabelEl = document.getElementById('vrchatCountLabel');

    if (!gridEl) return;

    function normalizeCategories(rawData) {
      if (!Array.isArray(rawData)) return [];
      const isFlatList = rawData.length === 0 || rawData.every((item) => typeof item === 'string');
      if (isFlatList) {
        return [{ name: 'all', label: 'All Photos', photos: rawData }];
      }
      return rawData
        .map((category) => ({
          name: String(category.name || category.label || 'category').replace(/\s+/g, '-').toLowerCase(),
          label: String(category.label || category.name || 'Category'),
          photos: Array.isArray(category.photos) ? category.photos : []
        }))
        .filter((category) => category.photos.length > 0);
    }

    const categories = normalizeCategories(window.VRC_PHOTOS);
    const flatPhotos = categories.flatMap((category) => category.photos);
    const photoIndexMap = new Map(flatPhotos.map((src, index) => [src, index]));
    let activeCategory = 'all';
    let currentIndex = 0;

    if (categories.length === 0) {
      emptyEl.style.display = '';
      gridEl.style.display = 'none';
      filtersEl.style.display = 'none';
      return;
    }

    emptyEl.style.display = 'none';
    gridEl.style.display = '';
    filtersEl.style.display = '';

    const totalPhotos = flatPhotos.length;
    if (countEl) {
      countEl.textContent = totalPhotos.toString();
    }
    if (countLabelEl) {
      countLabelEl.textContent = totalPhotos === 1 ? 'Photo' : 'Photos';
    }

    const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    function extractMonthLabel(src) {
      const decoded = decodeURIComponent(src);
      const match = decoded.match(/(\d{4})-(\d{2})-(\d{2})/);
      if (!match) return 'Unknown';
      const year = match[1];
      const month = Number(match[2]);
      const monthName = MONTH_NAMES[month - 1] || match[2];
      return `${monthName} ${year}`;
    }

    function monthId(categoryName, monthLabel) {
      return `vrchat-${categoryName}-${monthLabel}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    }

    function groupPhotosByMonth(photos) {
      const groups = new Map();
      photos.forEach((src) => {
        const monthLabel = extractMonthLabel(src);
        if (!groups.has(monthLabel)) groups.set(monthLabel, []);
        groups.get(monthLabel).push(src);
      });
      return groups;
    }

    function buildCard(src) {
      const globalIndex = photoIndexMap.get(src) ?? 0;
      const safeSrc = escapeHtml(src);
      const card = document.createElement('article');
      card.className = 'vrchat-card reveal';
      card.innerHTML = `
        <div class="vrchat-thumb">
          <img class="thumb-img active" src="${safeSrc}" alt="VRChat photo ${globalIndex + 1}" loading="eager" referrerpolicy="no-referrer" />
          <div class="vrchat-overlay">
            <button type="button" class="vrchat-action" aria-label="Open VRChat photo ${globalIndex + 1}">View</button>
            <a class="vrchat-action" href="${safeSrc}" download target="_blank" rel="noopener noreferrer" aria-label="Download VRChat photo ${globalIndex + 1}">Download</a>
          </div>
        </div>
      `;

      const viewButton = card.querySelector('button.vrchat-action');
      if (viewButton) viewButton.addEventListener('click', () => openPhoto(globalIndex));
      return card;
    }

    function renderFilters() {
      if (!filtersEl) return;
      filtersEl.innerHTML = '';
      if (categories.length <= 1) {
        filtersEl.style.display = 'none';
        return;
      }

      const buttons = [{ label: 'All', key: 'all' }, ...categories.map((category) => ({
        label: category.label,
        key: category.name
      }))];

      buttons.forEach((buttonData) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'filter' + (buttonData.key === 'all' ? ' active' : '');
        button.dataset.filter = buttonData.key;
        button.textContent = buttonData.label;
        button.addEventListener('click', () => {
          filtersEl.querySelectorAll('.filter').forEach((btn) => btn.classList.remove('active'));
          button.classList.add('active');
          activeCategory = buttonData.key;
          renderGrid();
        });
        filtersEl.appendChild(button);
      });
    }

    function buildMonthGrid(photos) {
      const monthGrid = document.createElement('div');
      monthGrid.className = 'vrchat-month-grid';
      photos.forEach((src) => monthGrid.appendChild(buildCard(src)));
      return monthGrid;
    }

    function renderJumpbar(selectedCategories) {
      if (!jumpbarEl) return;
      jumpbarEl.innerHTML = '';
      const chips = [];

      selectedCategories.forEach((category) => {
        const groups = groupPhotosByMonth(category.photos);
        groups.forEach((photos, monthLabel) => {
          chips.push({
            category,
            monthLabel,
            count: photos.length,
            target: monthId(category.name, monthLabel)
          });
        });
      });

      if (chips.length <= 1) {
        jumpbarEl.style.display = 'none';
        return;
      }

      jumpbarEl.style.display = '';
      const years = [...new Set(chips.map((chip) => chip.monthLabel.split(' ').pop()))];
      jumpbarEl.innerHTML = `
        <div class="vrchat-jumpbar-head">
          <span>Jump Bar</span>
          <small>${years.join(' / ')}</small>
        </div>
        <div class="vrchat-jumpbar-track">
          ${chips.map((chip) => `
            <button type="button" class="vrchat-jump-chip" data-target="${escapeHtml(chip.target)}">
              <span>${escapeHtml(chip.monthLabel)}</span>
              <small>${chip.count}</small>
            </button>
          `).join('')}
        </div>
      `;

      jumpbarEl.querySelectorAll('.vrchat-jump-chip').forEach((button) => {
        button.addEventListener('click', () => {
          const target = document.getElementById(button.dataset.target);
          if (!target) return;
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      });
    }

    function renderGrid() {
      gridEl.innerHTML = '';
      const selected = activeCategory === 'all'
        ? categories
        : categories.filter((category) => category.name === activeCategory);

      const buildCardsForCategory = (category, includeSection) => {
        const section = document.createElement('section');
        section.className = 'vrchat-section';
        const isUnsorted = category.name === 'unsorted' || category.label.toLowerCase() === 'unsorted';

        if (includeSection && !isUnsorted) {
          const header = document.createElement('div');
          header.className = 'portfolio-section-head';
          header.innerHTML = `
            <h2>${escapeHtml(category.label)}</h2>
            <span>${category.photos.length} photo${category.photos.length > 1 ? 's' : ''}</span>
          `;
          section.appendChild(header);
        }

        const groups = groupPhotosByMonth(category.photos);
        groups.forEach((photos, monthLabel) => {
          const monthBlock = document.createElement('div');
          monthBlock.className = 'vrchat-month-group';
          monthBlock.id = monthId(category.name, monthLabel);

          const monthHeader = document.createElement('div');
          monthHeader.className = 'vrchat-month-head';
          monthHeader.innerHTML = `
            <p>${escapeHtml(monthLabel)}</p>
            <span>${photos.length} photo${photos.length > 1 ? 's' : ''}</span>
          `;

          monthBlock.appendChild(monthHeader);
          monthBlock.appendChild(buildMonthGrid(photos));
          section.appendChild(monthBlock);
        });

        return section;
      };

      if (activeCategory === 'all') {
        selected.forEach((category) => {
          gridEl.appendChild(buildCardsForCategory(category, true));
        });
      } else if (selected.length > 0) {
        gridEl.appendChild(buildCardsForCategory(selected[0], false));
      }

      renderJumpbar(selected);
      observeReveals();
    }

    function showPhoto(index) {
      const flatPhotos = categories.flatMap((category) => category.photos);
      currentIndex = (index + flatPhotos.length) % flatPhotos.length;
      const currentPhoto = flatPhotos[currentIndex];
      img.src = currentPhoto;
      counter.textContent = `${currentIndex + 1} / ${flatPhotos.length}`;
      if (downloadLink) {
        downloadLink.href = currentPhoto;
        downloadLink.download = currentPhoto.split('/').pop() || `vrchat-photo-${currentIndex + 1}`;
        downloadLink.setAttribute('aria-label', `Download VRChat photo ${currentIndex + 1}`);
      }
      prevBtn.style.display = flatPhotos.length > 1 ? '' : 'none';
      nextBtn.style.display = flatPhotos.length > 1 ? '' : 'none';
    }

    function openPhoto(index) {
      showPhoto(index);
      modal.classList.add('open');
      modal.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
    }

    function closeModal() {
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    }
    scope.addCleanup(closeModal);

    scope.addEvent(prevBtn, 'click', () => showPhoto(currentIndex - 1));
    scope.addEvent(nextBtn, 'click', () => showPhoto(currentIndex + 1));
    scope.addEvent(modalBackdrop, 'click', closeModal);
    scope.addEvent(modalClose, 'click', closeModal);
    scope.addEvent(document, 'keydown', (e) => {
      if (e.key === 'Escape') closeModal();
      if (modal.classList.contains('open')) {
        if (e.key === 'ArrowLeft') showPhoto(currentIndex - 1);
        if (e.key === 'ArrowRight') showPhoto(currentIndex + 1);
      }
    });

    renderFilters();
    renderGrid();
    schedulePageScrollCueUpdate();
    preloadMediaGroups(categories.map((category) => ({
      label: category.label,
      urls: category.photos
    })), 'VRChat Photos', 'vrchat').catch((err) => console.warn('VRChat media preload skipped:', err));
  }

  function initCommissions(scope) {
    const gridEl = document.getElementById('commissionsGrid');
    const emptyEl = document.getElementById('commissionsEmpty');
    const finishedHeadEl = document.getElementById('finishedCommissionsHead');
    const finishedGridEl = document.getElementById('finishedCommissionsGrid');

    if (!gridEl) return;

    function renderFinishedCommissions(finishedConfig) {
      if (!finishedHeadEl || !finishedGridEl) return [];

      const config = finishedConfig || {};
      const items = Array.isArray(config.items) ? config.items : [];
      if (items.length === 0) {
        finishedHeadEl.style.display = 'none';
        finishedGridEl.style.display = 'none';
        return [];
      }

      finishedHeadEl.style.display = '';
      finishedGridEl.style.display = '';
      finishedHeadEl.innerHTML = `
        <p class="eyebrow">${escapeHtml(normalizeText(config.eyebrow, 'Finished Work'))}</p>
        <h2><span class="gradient-text">${escapeHtml(normalizeText(config.title, 'Completed commissions.'))}</span></h2>
        <p>${escapeHtml(normalizeText(config.description, 'Finished examples and delivered builds.'))}</p>
      `;

      function normalizeFolderPath(pathValue) {
        return normalizeText(pathValue)
          .replace(/\\/g, '/')
          .split('/')
          .filter(Boolean)
          .map((part) => {
            try {
              return decodeURIComponent(part);
            } catch (err) {
              return part;
            }
          })
          .join('/')
          .toLowerCase();
      }

      function photosFromImageFolder(folderPath) {
        const normalizedFolder = normalizeFolderPath(folderPath);
        if (!normalizedFolder || !Array.isArray(window.PROJECTS)) return [];

        const categoryFolder = window.PROJECTS.flatMap((category) => {
          const categoryName = normalizeFolderPath(category.name);
          const categoryLabel = normalizeFolderPath(category.label);
          return (category.projects || []).flatMap((project) => {
            const projectName = normalizeFolderPath(project.name);
            const categoryProjectMatches =
              normalizedFolder === `${categoryName}/${projectName}` ||
              normalizedFolder === `${categoryLabel}/${projectName}`;

            if (categoryProjectMatches) return project.photos || [];
            return [];
          });
        });

        if (categoryFolder.length > 0) return categoryFolder;

        return window.PROJECTS
          .flatMap((category) => category.projects || [])
          .flatMap((project) => project.photos || [])
          .filter((photo) => normalizeFolderPath(photo).startsWith(`${normalizedFolder}/`));
      }

      function imagesForFinishedItem(item) {
        const configuredImages = Array.isArray(item.images) ? item.images : [];
        if (configuredImages.length > 0) {
          return uniqueUrls(configuredImages.map(encodeAssetPath));
        }

        const folderImages = photosFromImageFolder(item.imageFolder || item.imageFolderPath);
        if (folderImages.length > 0) {
          return uniqueUrls(folderImages.map(encodeAssetPath));
        }

        const legacyImage = normalizeText(item.image);
        if (legacyImage.endsWith('/')) {
          return uniqueUrls(photosFromImageFolder(legacyImage).map(encodeAssetPath));
        }
        return legacyImage ? [encodeAssetPath(legacyImage)] : [];
      }

      const finishedMedia = items.map(imagesForFinishedItem);

      finishedGridEl.innerHTML = items.map((item, itemIndex) => {
        const title = normalizeText(item.title, 'Finished Commission');
        const builtFor = normalizeText(item.builtFor || item.client, 'Commission');
        const summary = normalizeText(item.summary, 'Completed VRChat commission work.');
        const images = finishedMedia[itemIndex] || [];
        const tags = Array.isArray(item.tags) ? item.tags : [];
        const tagMarkup = tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join('');
        const imageMarkup = images.length > 0
          ? images.map((src, index) => `<img class="finished-commission-image${index === 0 ? ' active' : ''}" src="${escapeHtml(src)}" alt="${escapeHtml(title)}" loading="eager" />`).join('')
          : '<div class="finished-commission-placeholder">Done</div>';

        return `
          <article class="finished-commission-card reveal">
            <div class="finished-commission-media">
              ${imageMarkup}
            </div>
            <div class="finished-commission-body">
              <div class="finished-commission-built-for">
                <span>Build For:</span>
                <strong>${escapeHtml(builtFor)}</strong>
              </div>
              <h3>${escapeHtml(title)}</h3>
              <p>${escapeHtml(summary)}</p>
              <div class="finished-commission-tags">${tagMarkup}</div>
            </div>
          </article>
        `;
      }).join('');

      finishedGridEl.querySelectorAll('.finished-commission-media').forEach((mediaEl) => {
        const images = mediaEl.querySelectorAll('.finished-commission-image');
        if (images.length <= 1) return;

        let currentIndex = 0;
        scope.addInterval(() => {
          images[currentIndex].classList.remove('active');
          currentIndex = (currentIndex + 1) % images.length;
          images[currentIndex].classList.add('active');
        }, 5000);
      });

      return uniqueUrls(finishedMedia.flat());
    }

    async function render() {
      try {
        const globalConfig = await loadGlobalConfig();
        const finishedImages = renderFinishedCommissions(globalConfig.commissions && globalConfig.commissions.finished);
        const res = await fetch('commissions.json', { cache: 'no-store' });
        if (!res.ok) throw new Error('Unable to load commissions data');
        const items = await res.json();

        gridEl.innerHTML = '';

        if (!Array.isArray(items) || items.length === 0) {
          emptyEl.style.display = '';
          return;
        }

        emptyEl.style.display = 'none';

        items.forEach((item) => {
          const card = document.createElement('article');
          card.className = 'commission-card reveal';
          const category = normalizeText(item.category, 'Commission');
          const description = normalizeText(item.description, 'Commission offering details coming soon.');

          const imagesMarkup = (item.images || []).length > 0
            ? (item.images || []).map((src, index) => `<img class="commission-image${index === 0 ? ' active' : ''}" src="${escapeHtml(src)}" alt="${escapeHtml(category)}" loading="eager" referrerpolicy="no-referrer" />`).join('')
            : '<div class="commission-image-placeholder">✦</div>';

          card.innerHTML = `
            <div class="commission-thumb">
              ${imagesMarkup}
            </div>
            <div class="commission-body">
              <h3>${escapeHtml(category)}</h3>
              <p>${escapeHtml(description)}</p>
            </div>
          `;

          if ((item.images || []).length > 1) {
            const images = card.querySelectorAll('.commission-image');
            let currentIndex = 0;
            scope.addInterval(() => {
              images[currentIndex].classList.remove('active');
              currentIndex = (currentIndex + 1) % images.length;
              images[currentIndex].classList.add('active');
            }, 5000);
          }

        gridEl.appendChild(card);
      });

        observeReveals();
        schedulePageScrollCueUpdate();
        const serviceGroups = items.map((item) => ({
          label: normalizeText(item.category, 'Commission'),
          urls: item.images || []
        }));
        if (finishedImages.length > 0) {
          serviceGroups.push({ label: 'Finished Work', urls: finishedImages });
        }
        preloadMediaGroups(serviceGroups, 'Commissions', 'commissions').catch((err) => console.warn('Commission media preload skipped:', err));
      } catch (err) {
        console.error(err);
        emptyEl.style.display = '';
        emptyEl.querySelector('p').textContent = 'The commission categories could not be loaded right now.';
      }
    }

    render();
  }

  function initDownloads() {
    const gridEl = document.getElementById('downloadsGrid');
    const emptyEl = document.getElementById('downloadsEmpty');
    const featuredEl = document.getElementById('downloadsFeatured');
    const toolbarEl = document.getElementById('downloadsToolbar');
    const filtersEl = document.getElementById('downloadsFilters');
    const searchEl = document.getElementById('downloadsSearch');

    if (!gridEl) return;

    let activeFilter = 'all';
    let searchTerm = '';

    function downloadSearchText(item) {
      return [
        item.title,
        item.version,
        item.description,
        item.fileSize,
        ...(Array.isArray(item.tags) ? item.tags : [])
      ].map((value) => normalizeText(value).toLowerCase()).join(' ');
    }

    function primaryDownloadTag(item) {
      const tags = Array.isArray(item.tags) ? item.tags : [];
      return normalizeText(tags[0], 'Archive');
    }

    function downloadCardMarkup(item, featured = false) {
      const title = normalizeText(item.title, 'Download');
      const version = normalizeText(item.version, 'Latest');
      const description = normalizeText(item.description, 'A downloadable item from the archive.');
      const fileSize = normalizeText(item.fileSize, 'Unknown');
      const zipUrl = normalizeText(item.zipUrl, '#');
      const zipFile = normalizeText(item.zipFile, title);
      const tags = Array.isArray(item.tags) ? item.tags : [];
      const primaryTag = normalizeText(tags[0]);
      const secondaryTags = tags.slice(1);
      const tagsMarkup = secondaryTags.map((tag) => `<span class="download-tag">${escapeHtml(tag)}</span>`).join('');
      const thumbMarkup = item.thumbnail
        ? `<img src="${escapeHtml(item.thumbnail)}" alt="${escapeHtml(title)}" loading="lazy" referrerpolicy="no-referrer" />`
        : `<div class="download-thumb-art">⬇</div>`;

      return `
        <div class="download-thumb">
          ${thumbMarkup}
        </div>
        <div class="download-card-body">
          ${featured ? '<span class="download-featured-kicker">Featured Download</span>' : ''}
          <div class="download-card-head">
            <div>
              <h3>${escapeHtml(title)}</h3>
              <div class="download-meta">
                ${primaryTag ? `<span class="download-tag download-primary-tag">${escapeHtml(primaryTag)}</span>` : ''}
                <span class="download-version">${escapeHtml(version)}</span>
                <span class="download-size">${escapeHtml(fileSize)}</span>
              </div>
            </div>
          </div>
          <p class="download-description">${escapeHtml(description)}</p>
          <div class="download-tags">${tagsMarkup}</div>
        </div>
        <div class="download-footer">
          <a class="btn btn-primary download-action" href="${escapeHtml(zipUrl)}" download="${escapeHtml(zipFile)}" target="_blank" rel="noopener noreferrer">Download</a>
        </div>
      `;
    }

    function renderCards(items) {
      gridEl.innerHTML = '';
      items.forEach((item) => {
        const card = document.createElement('article');
        card.className = 'download-card reveal';
        card.innerHTML = downloadCardMarkup(item);
        gridEl.appendChild(card);
      });
      observeReveals();
    }

    function applyDownloadFilters(items) {
      const filtered = items.filter((item) => {
        const tagMatches = activeFilter === 'all' || primaryDownloadTag(item).toLowerCase() === activeFilter;
        const searchMatches = !searchTerm || downloadSearchText(item).includes(searchTerm);
        return tagMatches && searchMatches;
      });

      renderCards(filtered);
      emptyEl.style.display = filtered.length > 0 ? 'none' : '';
      const emptyText = emptyEl.querySelector('p');
      if (emptyText && filtered.length === 0) {
        emptyText.textContent = 'No downloads match that filter or search.';
      }
    }

    async function render() {
      try {
        const candidates = ['downloads.json'];

        let items = null;
        for (const url of candidates) {
          try {
            const res = await fetch(url, { cache: 'no-store' });
            if (res.ok) {
              items = await res.json();
              break;
            }
          } catch (err) {
            // try the next candidate
          }
        }

        if (!Array.isArray(items)) {
          throw new Error('Unable to load download data');
        }

        if (!Array.isArray(items) || items.length === 0) {
          emptyEl.style.display = '';
          return;
        }

        emptyEl.style.display = 'none';

        if (featuredEl) {
          if (items.length > 1) {
            featuredEl.style.display = '';
            featuredEl.innerHTML = `<article class="download-card download-featured-card reveal">${downloadCardMarkup(items[0], true)}</article>`;
          } else {
            featuredEl.style.display = 'none';
            featuredEl.innerHTML = '';
          }
        }

        const filterTags = ['all', ...uniqueUrls(items.map((item) => primaryDownloadTag(item).toLowerCase()))];
        if (toolbarEl && filtersEl && searchEl) {
          toolbarEl.style.display = '';
          filtersEl.innerHTML = filterTags.map((tag) => `
            <button class="download-filter${tag === activeFilter ? ' active' : ''}" type="button" data-filter="${escapeHtml(tag)}">
              ${escapeHtml(tag === 'all' ? 'All' : tag)}
            </button>
          `).join('');

          filtersEl.querySelectorAll('.download-filter').forEach((button) => {
            button.addEventListener('click', () => {
              activeFilter = button.dataset.filter || 'all';
              filtersEl.querySelectorAll('.download-filter').forEach((filter) => filter.classList.toggle('active', filter === button));
              applyDownloadFilters(items);
            });
          });

          searchEl.addEventListener('input', () => {
            searchTerm = normalizeText(searchEl.value).toLowerCase();
            applyDownloadFilters(items);
          });
        }

        applyDownloadFilters(items);
      } catch (err) {
        console.error(err);
        emptyEl.style.display = '';
        emptyEl.querySelector('p').textContent = 'The download archive could not be loaded right now.';
      }
    }

    render();
  }

  function initVideos(scope) {
    const gridEl = document.getElementById('videosGrid');
    const emptyEl = document.getElementById('videosEmpty');
    const toolbarEl = document.getElementById('videosToolbar');
    const filtersEl = document.getElementById('videosFilters');
    const searchEl = document.getElementById('videosSearch');
    const countEl = document.getElementById('videosCount');
    const countLabelEl = document.getElementById('videosCountLabel');
    const modal = document.getElementById('videoModal');
    const modalBackdrop = document.getElementById('videoModalBackdrop');
    const modalClose = document.getElementById('videoModalClose');
    const player = document.getElementById('videoPlayer');
    const playerTitle = document.getElementById('videoPlayerTitle');
    const playerDescription = document.getElementById('videoPlayerDescription');
    const playerToggle = document.getElementById('videoPlayerToggle');
    const playerSeek = document.getElementById('videoPlayerSeek');
    const playerCurrent = document.getElementById('videoPlayerCurrent');
    const playerDuration = document.getElementById('videoPlayerDuration');
    const playerDownload = document.getElementById('videoPlayerDownload');
    const playerOpen = document.getElementById('videoPlayerOpen');

    if (!gridEl) return;

    let activeFilter = 'all';
    let searchTerm = '';
    let visibleItems = [];
    let isSeeking = false;

    function formatVideoTime(seconds) {
      if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
      const total = Math.floor(seconds);
      const minutes = Math.floor(total / 60);
      const secs = total % 60;
      return `${minutes}:${String(secs).padStart(2, '0')}`;
    }

    function syncPlayerUi() {
      if (!player || !playerSeek) return;
      const duration = Number.isFinite(player.duration) ? player.duration : 0;
      const current = Number.isFinite(player.currentTime) ? player.currentTime : 0;
      playerSeek.max = duration > 0 ? String(duration) : '100';
      if (!isSeeking) playerSeek.value = duration > 0 ? String(current) : '0';
      if (playerCurrent) playerCurrent.textContent = formatVideoTime(current);
      if (playerDuration) playerDuration.textContent = formatVideoTime(duration);
      if (playerToggle) playerToggle.textContent = player.paused ? '▶' : 'Ⅱ';
      if (playerToggle) playerToggle.setAttribute('aria-label', player.paused ? 'Play video' : 'Pause video');
    }

    function closeVideoModal() {
      if (!modal || !player) return;
      player.pause();
      player.removeAttribute('src');
      player.load();
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      window.dispatchEvent(new CustomEvent('dennifer:video-player-active', { detail: { active: false } }));
      syncPlayerUi();
    }

    function openVideoModal(item) {
      if (!modal || !player) return;
      const title = normalizeText(item.title, 'Video Clip');
      const description = normalizeText(item.description, 'A short clip from the archive.');
      const videoUrl = normalizeText(item.videoUrl, '#');

      player.pause();
      player.src = videoUrl;
      player.load();
      if (playerTitle) playerTitle.textContent = title;
      if (playerDescription) playerDescription.textContent = description;
      if (playerDownload) {
        playerDownload.href = videoUrl;
        playerDownload.download = videoUrl.split('/').pop() || `${title}.mp4`;
      }
      if (playerOpen) playerOpen.href = videoUrl;

      modal.classList.add('open');
      modal.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      window.dispatchEvent(new CustomEvent('dennifer:video-player-active', { detail: { active: true } }));
      syncPlayerUi();
      player.play().catch(() => syncPlayerUi());
    }

    scope.addCleanup(closeVideoModal);
    scope.addEvent(modalBackdrop, 'click', closeVideoModal);
    scope.addEvent(modalClose, 'click', closeVideoModal);
    scope.addEvent(document, 'keydown', (e) => {
      if (e.key === 'Escape') closeVideoModal();
    });
    scope.addEvent(player, 'loadedmetadata', syncPlayerUi);
    scope.addEvent(player, 'timeupdate', syncPlayerUi);
    scope.addEvent(player, 'play', syncPlayerUi);
    scope.addEvent(player, 'pause', syncPlayerUi);
    scope.addEvent(playerToggle, 'click', () => {
      if (!player) return;
      if (player.paused) {
        player.play().catch(() => syncPlayerUi());
      } else {
        player.pause();
      }
      syncPlayerUi();
    });
    scope.addEvent(playerSeek, 'input', () => {
      if (!player || !playerSeek) return;
      isSeeking = true;
      if (Number.isFinite(player.duration)) {
        player.currentTime = Number(playerSeek.value);
      }
      syncPlayerUi();
    });
    scope.addEvent(playerSeek, 'change', () => {
      isSeeking = false;
      syncPlayerUi();
    });

    function videoTags(item) {
      const tags = Array.isArray(item.tags) ? item.tags : [];
      return tags.map((tag) => normalizeText(tag)).filter(Boolean);
    }

    function primaryVideoTag(item) {
      return videoTags(item)[0] || 'Clips';
    }

    function videoSearchText(item) {
      return [
        item.title,
        item.description,
        item.duration,
        ...videoTags(item)
      ].map((value) => normalizeText(value).toLowerCase()).join(' ');
    }

    function renderCards(items) {
      visibleItems = items;
      gridEl.innerHTML = '';

      const groups = new Map();
      items.forEach((item, index) => {
        const label = activeFilter === 'all'
          ? primaryVideoTag(item)
          : (videoTags(item).find((tag) => tag.toLowerCase() === activeFilter) || activeFilter);
        const key = label.toLowerCase();
        if (!groups.has(key)) {
          groups.set(key, { label, entries: [] });
        }
        groups.get(key).entries.push({ item, index });
      });

      groups.forEach((group) => {
        const section = document.createElement('section');
        section.className = 'video-section reveal';
        section.innerHTML = `
          <div class="video-section-head">
            <div>
              <span>Sub-category</span>
              <h2>${escapeHtml(group.label)}</h2>
            </div>
            <small>${group.entries.length} clip${group.entries.length === 1 ? '' : 's'}</small>
          </div>
          <div class="video-section-grid"></div>
        `;

        const sectionGrid = section.querySelector('.video-section-grid');
        group.entries.forEach(({ item, index }) => {
          const title = normalizeText(item.title, 'Video Clip');
          const description = normalizeText(item.description, 'A short clip from the archive.');
          const videoUrl = normalizeText(item.videoUrl, '#');
          const duration = normalizeText(item.duration);
          const tags = videoTags(item);
          const card = document.createElement('article');
          card.className = 'video-card reveal';
          card.innerHTML = `
            <button class="video-preview-button" type="button" data-index="${index}" aria-label="Play ${escapeHtml(title)}">
              <span class="video-frame">
                <video muted preload="metadata" playsinline aria-hidden="true">
                  <source src="${escapeHtml(videoUrl)}">
                </video>
                <span class="video-play-badge" aria-hidden="true">▶</span>
              </span>
            </button>
            <div class="video-card-body">
              <div class="video-card-head">
                <div>
                  <h3>${escapeHtml(title)}</h3>
                  <div class="video-meta">
                    ${duration ? `<span class="download-size">${escapeHtml(duration)}</span>` : ''}
                    ${tags.slice(0, 2).map((tag) => `<span class="download-tag">${escapeHtml(tag)}</span>`).join('')}
                  </div>
                </div>
                <button class="video-open" type="button" data-index="${index}">Watch</button>
              </div>
              <p>${escapeHtml(description)}</p>
              ${tags.length > 2 ? `<div class="download-tags">${tags.slice(2).map((tag) => `<span class="download-tag">${escapeHtml(tag)}</span>`).join('')}</div>` : ''}
            </div>
          `;
          sectionGrid.appendChild(card);
        });

        gridEl.appendChild(section);
      });

      gridEl.querySelectorAll('[data-index]').forEach((button) => {
        button.addEventListener('click', () => {
          const item = visibleItems[Number(button.dataset.index)];
          if (item) openVideoModal(item);
        });
      });
      observeReveals();
      schedulePageScrollCueUpdate();
    }

    function applyVideoFilters(items) {
      const filtered = items.filter((item) => {
        const tags = videoTags(item).map((tag) => tag.toLowerCase());
        const tagMatches = activeFilter === 'all' || tags.includes(activeFilter);
        const searchMatches = !searchTerm || videoSearchText(item).includes(searchTerm);
        return tagMatches && searchMatches;
      });

      renderCards(filtered);
      emptyEl.style.display = filtered.length > 0 ? 'none' : '';
      const emptyText = emptyEl.querySelector('p');
      if (emptyText && filtered.length === 0) {
        emptyText.textContent = 'No videos match that filter or search.';
      }
    }

    async function render() {
      try {
        const res = await fetch('videos.json', { cache: 'no-store' });
        if (!res.ok) throw new Error('Unable to load video data');
        const items = await res.json();

        if (!Array.isArray(items) || items.length === 0) {
          if (countEl) countEl.textContent = '0';
          if (countLabelEl) countLabelEl.textContent = 'Clips';
          emptyEl.style.display = '';
          return;
        }

        if (countEl) countEl.textContent = String(items.length);
        if (countLabelEl) countLabelEl.textContent = items.length === 1 ? 'Clip' : 'Clips';
        emptyEl.style.display = 'none';

        const tagLabels = uniqueUrls(items.flatMap(videoTags));
        const filterTags = ['all', ...tagLabels.map((tag) => tag.toLowerCase())];
        if (toolbarEl && filtersEl && searchEl) {
          toolbarEl.style.display = '';
          filtersEl.innerHTML = filterTags.map((tag) => {
            const label = tag === 'all'
              ? 'All'
              : tagLabels.find((candidate) => candidate.toLowerCase() === tag) || tag;
            return `
              <button class="download-filter${tag === activeFilter ? ' active' : ''}" type="button" data-filter="${escapeHtml(tag)}">
                ${escapeHtml(label)}
              </button>
            `;
          }).join('');

          filtersEl.querySelectorAll('.download-filter').forEach((button) => {
            button.addEventListener('click', () => {
              activeFilter = button.dataset.filter || 'all';
              filtersEl.querySelectorAll('.download-filter').forEach((filter) => filter.classList.toggle('active', filter === button));
              applyVideoFilters(items);
            });
          });

          searchEl.addEventListener('input', () => {
            searchTerm = normalizeText(searchEl.value).toLowerCase();
            applyVideoFilters(items);
          });
        }

        applyVideoFilters(items);
      } catch (err) {
        console.error(err);
        emptyEl.style.display = '';
        emptyEl.querySelector('p').textContent = 'The video archive could not be loaded right now.';
      }
    }

    render();
  }

  function initSupport() {
    const contributorsEl = document.getElementById('supportContributors');
    if (!contributorsEl) return;

    async function render() {
      try {
        const globalConfig = await loadGlobalConfig();
        const contributorsConfig = globalConfig.support && globalConfig.support.contributors;
        const contributors = Array.isArray(contributorsConfig && contributorsConfig.items)
          ? contributorsConfig.items.slice(0, 3)
          : [];

        if (contributors.length === 0) {
          contributorsEl.style.display = 'none';
          return;
        }

        contributorsEl.style.display = '';
        contributorsEl.innerHTML = `
          <span class="support-contributors-title">${escapeHtml(normalizeText(contributorsConfig.title, 'Top Contributor'))}</span>
          <div class="support-contributor-list">
            ${contributors.map((person, index) => {
              const name = normalizeText(person.name, 'Contributor');
              const label = normalizeText(person.label, `#${index + 1}`);
              const href = normalizeText(person.href || person.url);
              const content = `
                <span>${String(index + 1).padStart(2, '0')}</span>
                <strong>${escapeHtml(name)}</strong>
                <small>${escapeHtml(label)}</small>
              `;
              return href
                ? `<a class="support-contributor" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${content}</a>`
                : `<div class="support-contributor">${content}</div>`;
            }).join('')}
          </div>
        `;
      } catch (err) {
        console.warn('Support contributors skipped:', err);
        contributorsEl.style.display = 'none';
      }
    }

    render();
  }

  function initWelcome(scope) {
    const snapshotKickerEl = document.getElementById('welcomeSnapshotKicker');
    const snapshotTitleEl = document.getElementById('welcomeSnapshotTitle');
    const snapshotDescriptionEl = document.getElementById('welcomeSnapshotDescription');
    const snapshotActionsEl = document.getElementById('welcomeSnapshotActions');
    const previewEl = document.getElementById('welcomePreview');
    const toolsEl = document.getElementById('welcomeTools');
    const panelEl = document.getElementById('welcomePanel');
    const signalsEl = document.getElementById('welcomeSignals');
    const makesHeadEl = document.getElementById('welcomeMakesHead');
    const makesEl = document.getElementById('welcomeMakes');
    const flowEl = document.getElementById('welcomeFlow');

    if (!toolsEl && !panelEl && !signalsEl && !makesEl && !flowEl) return;

    async function render() {
      try {
        const globalConfig = await loadGlobalConfig();
        const config = globalConfig.welcome || {};
        const snapshot = config.snapshot || {};

        if (snapshotKickerEl) {
          snapshotKickerEl.textContent = normalizeText(snapshot.kicker, 'VRChat Creator / Unity / UdonSharp');
        }

        if (snapshotTitleEl) {
          snapshotTitleEl.innerHTML = `${escapeHtml(normalizeText(snapshot.titlePrefix, 'Welcome to'))} <span class="gradient-text">${escapeHtml(normalizeText(snapshot.titleHighlight, "Dennifer's website"))}</span>.`;
        }

        if (snapshotDescriptionEl) {
          snapshotDescriptionEl.textContent = normalizeText(snapshot.description, 'Using Unity for personal game projects and creating VRChat worlds from scratch, self-taught!');
        }

        if (snapshotActionsEl) {
          const actions = Array.isArray(snapshot.actions) ? snapshot.actions : [
            { label: 'View Portfolio', href: '#/portfolio', page: 'portfolio', primary: true },
            { label: 'Commission Info', href: '#/commissions', page: 'commissions' }
          ];
          snapshotActionsEl.innerHTML = actions.map((action) => `
            <a class="btn ${action.primary === false ? 'btn-ghost' : 'btn-primary'}" href="${escapeHtml(normalizeText(action.href, '#/portfolio'))}" data-page="${escapeHtml(normalizeText(action.page, 'portfolio'))}">
              ${escapeHtml(normalizeText(action.label, 'View'))}
            </a>
          `).join('');
        }

        if (previewEl) {
          const projectImages = (window.PROJECTS || [])
            .flatMap((category) => category.projects || [])
            .flatMap((project) => project.photos || []);
          const availableImages = uniqueUrls(projectImages.map(encodeAssetPath));
          const previewCount = Math.min(3, availableImages.length);

          function pickPreviewSet(count, exclude = []) {
            const selected = [];
            const imagePool = availableImages.filter((src) => !exclude.includes(src));
            while (selected.length < count && imagePool.length > 0) {
              const index = Math.floor(Math.random() * imagePool.length);
              selected.push(imagePool.splice(index, 1)[0]);
            }
            return selected;
          }

          const previewImages = pickPreviewSet(previewCount);

          previewEl.innerHTML = previewImages.length > 0
            ? `
              <div class="welcome-preview-stack">
                ${previewImages.map((src, index) => `
                  <div class="welcome-preview-slot">
                    <img class="active" src="${escapeHtml(src)}" alt="Welcome preview ${index + 1}" loading="eager" />
                  </div>
                `).join('')}
              </div>
            `
            : '';

          const previewSlots = [...previewEl.querySelectorAll('.welcome-preview-slot')];
          if (previewSlots.length > 0 && availableImages.length > previewSlots.length) {
            const intervalOwner = scope || { addInterval: window.setInterval.bind(window) };
            intervalOwner.addInterval(() => {
              const currentImages = previewSlots.map((slot) => {
                const activeImage = slot.querySelector('img.active');
                return activeImage ? activeImage.getAttribute('src') : '';
              });

              previewSlots.forEach((slot, imageIndex) => {
                const currentImage = currentImages[imageIndex];
                const otherImages = currentImages.filter((src, index) => index !== imageIndex && src);
                const candidates = availableImages.filter((src) => !otherImages.includes(src) && src !== currentImage);
                if (candidates.length === 0) return;
                const nextSrc = candidates[Math.floor(Math.random() * candidates.length)];

                const nextImage = new Image();
                nextImage.alt = `Welcome preview ${imageIndex + 1}`;
                nextImage.loading = 'eager';
                nextImage.onload = () => {
                  if (!previewEl.isConnected) return;
                  slot.appendChild(nextImage);
                  window.requestAnimationFrame(() => {
                    const previousImage = slot.querySelector('img.active');
                    nextImage.classList.add('active');
                    if (previousImage) previousImage.classList.remove('active');
                    window.setTimeout(() => {
                      [...slot.querySelectorAll('img:not(.active)')].forEach((img) => img.remove());
                    }, 900);
                  });
                };
                nextImage.src = nextSrc;

                currentImages[imageIndex] = nextSrc;
              });
            }, 5500);
          }
        }

        if (toolsEl) {
          const tools = Array.isArray(config.tools) ? config.tools : [];
          toolsEl.innerHTML = tools.map((tool) => `<span>${escapeHtml(tool)}</span>`).join('');
        }

        if (panelEl) {
          const intro = config.intro || {};
          panelEl.innerHTML = `
            <span class="welcome-panel-kicker">${escapeHtml(normalizeText(intro.kicker, 'Self-taught creator'))}</span>
            <h2>${escapeHtml(normalizeText(intro.title, 'Building in Unity.'))}</h2>
            <p>${escapeHtml(normalizeText(intro.description, 'Making worlds, tools, and experiments.'))}</p>
          `;
        }

        if (signalsEl) {
          const signals = Array.isArray(config.signals) ? config.signals : [];
          signalsEl.innerHTML = signals.map((signal) => `
            <div>
              <strong>${escapeHtml(normalizeText(signal.title))}</strong>
              <span>${escapeHtml(normalizeText(signal.description))}</span>
            </div>
          `).join('');
        }

        if (makesHeadEl) {
          const makes = config.makes || {};
          makesHeadEl.innerHTML = `
            <p class="eyebrow">${escapeHtml(normalizeText(makes.eyebrow, 'What I Make'))}</p>
            <h2><span class="gradient-text">${escapeHtml(normalizeText(makes.title, 'Worlds, tools, interfaces, and experiments.'))}</span></h2>
            <p>${escapeHtml(normalizeText(makes.description, 'Things that feel useful, atmospheric, and personal.'))}</p>
          `;
        }

        if (makesEl) {
          const items = Array.isArray(config.makes && config.makes.items) ? config.makes.items : [];
          makesEl.innerHTML = items.map((item, index) => `
            <article class="welcome-make-card reveal">
              <span>${String(index + 1).padStart(2, '0')}</span>
              <h3>${escapeHtml(normalizeText(item.title))}</h3>
              <p>${escapeHtml(normalizeText(item.description))}</p>
            </article>
          `).join('');
        }

        if (flowEl) {
          const flow = Array.isArray(config.flow) ? config.flow : [];
          flowEl.innerHTML = flow.map((step) => `
            <div>
              <span>${escapeHtml(normalizeText(step.title))}</span>
              <p>${escapeHtml(normalizeText(step.description))}</p>
            </div>
          `).join('');
        }

        observeReveals();
        wireNav();
      } catch (err) {
        console.warn('Welcome config skipped:', err);
      }
    }

    render();
  }

  function initFeatured(scope) {
    const host = document.getElementById('featuredShowcase');
    if (!host) return;

    async function render() {
      try {
        const globalConfig = await loadGlobalConfig();
        const item = globalConfig.featured || {};
        const title = normalizeText(item.title);
        const image = encodeAssetPath(item.image);

        if (!title || !image) {
          host.style.display = 'none';
          return;
        }

        const eyebrow = normalizeText(item.eyebrow, 'Featured Pick');
        const heading = normalizeText(item.heading, 'Spotlight From The Archive');
        const label = normalizeText(item.label, 'Featured');
        const visibility = normalizeText(item.visibility);
        const description = normalizeText(item.description, 'A hand-picked stop from the archive.');
        const imageAlt = normalizeText(item.imageAlt, title);
        const page = normalizeText(item.page, 'portfolio');
        const cta = normalizeText(item.cta, 'View Feature');
        const projectMatch = (window.PROJECTS || [])
          .flatMap((category) => (category.projects || []).map((project) => ({ category, project })))
          .find((entry) => normalizeText(entry.project.name).replace(/_/g, ' ') === title);
        const href = projectMatch && page === 'portfolio'
          ? `#/portfolio?category=${encodeURIComponent(projectMatch.category.name)}&project=${encodeURIComponent(projectMatch.project.name)}`
          : normalizeText(item.href, '#/portfolio');
        const projectPhotos = projectMatch ? projectMatch.project : null;
        let featuredMeta = {};
        if (projectMatch) {
          const meta = getProjectMeta(globalConfig);
          featuredMeta = (meta[projectMatch.category.name] && meta[projectMatch.category.name][projectMatch.project.name]) || {};
        }
        const vrcUrl = normalizeText(featuredMeta.vrcUrl || featuredMeta.vrcLink);
        const vrcLinkMarkup = vrcUrl
          ? `<a href="${escapeHtml(vrcUrl)}" class="featured-link featured-vrc-link" target="_blank" rel="noopener noreferrer">VRC Link</a>`
          : '';
        const photos = uniqueUrls(projectPhotos && Array.isArray(projectPhotos.photos) ? projectPhotos.photos : [image]);
        const firstPhoto = photos[0] || image;

        host.innerHTML = `
          <div class="featured-head">
            <span>${escapeHtml(eyebrow)}</span>
            <p>${escapeHtml(heading)}</p>
          </div>
          <article class="featured-card">
            <a href="${escapeHtml(href)}" data-page="${escapeHtml(page)}" class="featured-media" aria-label="${escapeHtml(cta)}">
              <img class="featured-img active" src="${escapeHtml(firstPhoto)}" alt="${escapeHtml(imageAlt)}" loading="eager" />
            </a>
            <div class="featured-body">
              <div class="featured-tags">
                <span class="featured-label">${escapeHtml(label)}</span>
                ${visibility ? `<span class="visibility-pill ${visibility.toLowerCase() === 'public' ? 'is-public' : visibility.toLowerCase() === 'private' ? 'is-private' : ''}">${escapeHtml(visibility)}</span>` : ''}
              </div>
              <h2>${escapeHtml(title)}</h2>
              <p>${escapeHtml(description)}</p>
              <div class="featured-actions">
                <a href="${escapeHtml(href)}" class="featured-link" data-page="${escapeHtml(page)}">${escapeHtml(cta)}</a>
                ${vrcLinkMarkup}
              </div>
            </div>
          </article>
        `;
        host.style.display = '';
        wireNav();
        observeReveals();
        schedulePageScrollCueUpdate();
        const featuredMediaEl = host.querySelector('.featured-media');
        if (featuredMediaEl && photos.length > 1 && scope) {
          let currentSlide = 0;
          scope.addInterval(() => {
            currentSlide = (currentSlide + 1) % photos.length;
            const nextSrc = photos[currentSlide];
            const activeImage = featuredMediaEl.querySelector('.featured-img.active');
            if (activeImage && activeImage.getAttribute('src') === nextSrc) return;

            const nextImage = new Image();
            nextImage.className = 'featured-img';
            nextImage.alt = imageAlt;
            nextImage.loading = 'eager';
            nextImage.onload = () => {
              if (!featuredMediaEl.isConnected) return;
              featuredMediaEl.appendChild(nextImage);
              window.requestAnimationFrame(() => {
                const previousImage = featuredMediaEl.querySelector('.featured-img.active');
                nextImage.classList.add('active');
                if (previousImage) previousImage.classList.remove('active');
                window.setTimeout(() => {
                  [...featuredMediaEl.querySelectorAll('.featured-img:not(.active)')].forEach((img) => img.remove());
                }, 900);
              });
            };
            nextImage.src = nextSrc;
          }, 5000);
        }
      } catch (err) {
        console.warn('Featured pick skipped:', err);
        host.style.display = 'none';
      }
    }

    render();
  }

  // ---- View loading ----
  function setActive(name) {
    document.querySelectorAll('.nav-links a').forEach((a) => {
      a.classList.toggle('active-link', a.dataset.page === name);
    });
  }

async function loadView(name) {
    if (!views[name]) name = 'home';
    if (viewCleanup) {
      viewCleanup.cleanup();
      viewCleanup = null;
    }
    const scope = createViewScope();
    viewCleanup = scope;

    // Update document title
    if (titles[name]) document.title = titles[name];

// If home, content is already inline in the shell
    if (name === 'home') {
      app.innerHTML = document.getElementById('homeContent').innerHTML;
      setActive('home');
      wireNav();
      initFeatured(scope);
      observeReveals();
      schedulePageScrollCueUpdate();
      dismissSiteBootWhenReady('home');
      return;
    }

    try {
      const res = await fetch(views[name]);
      const html = await res.text();
      const container = document.createElement('div');
      container.innerHTML = html;
      // Remove any inline scripts from partials (handled by app.js)
      container.querySelectorAll('script').forEach((s) => s.remove());
      app.innerHTML = container.innerHTML;
setActive(name);
      wireNav();
      if (name === 'welcome') initWelcome(scope);
      if (name === 'portfolio') initPortfolio(scope);
      if (name === 'vrchat') initVrchat(scope);
      if (name === 'videos') initVideos(scope);
      if (name === 'downloads') initDownloads(scope);
      if (name === 'commissions') initCommissions(scope);
      if (name === 'support') initSupport(scope);
      observeReveals();
      schedulePageScrollCueUpdate();
      dismissSiteBootWhenReady(name);
      // No subsection auto-scroll needed for standalone pages.
    } catch (e) {
      app.innerHTML = '<p style="text-align:center;padding:60px">Could not load page.</p>';
    }
  }

// ---- Navigation wiring (hash-based routing) ----
  // Hash routing keeps the URL on index.html (the shell), so refreshing
  // always loads the full app and restores the same view seamlessly.
  function currentPageFromHash() {
    const hash = parseHashRoute().page;
    if (hash === 'welcome' || hash === 'portfolio' || hash === 'vrchat' || hash === 'videos' || hash === 'home' || hash === 'downloads' || hash === 'support' || hash === 'commissions') return hash;
    return 'home';
  }

  function navigate(e) {
    const link = e.currentTarget;
    e.preventDefault();
    if (mediaLoading) return;
    const page = link.dataset.page;
    const href = link.getAttribute('href') || `#/${page}`;
    location.hash = href.startsWith('#') ? href : `#/${page}`;
  }

  // Wire all nav links, including ones just injected into #app
  function wireNav() {
    document.querySelectorAll('[data-page]').forEach((a) => {
      if (!a.dataset.bound) {
        a.dataset.bound = '1';
        a.addEventListener('click', navigate);
      }
    });
  }

  wireNav();

  // Load the view based on the current hash, and on every hash change
  function route() {
    loadView(currentPageFromHash());
    window.setTimeout(startBackgroundMediaWarmup, 1800);
  }

  window.addEventListener('hashchange', route);

  // Prevent the default anchor jump for hash links (we handle routing)
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#/"]');
    if (a) {
      e.preventDefault();
      if (mediaLoading) return;
    }
  });

  route();
})();
