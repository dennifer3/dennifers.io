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
  const mediaGate = document.getElementById('mediaGate');
  const mediaGateTitle = document.getElementById('mediaGateTitle');
  const mediaGateDetail = document.getElementById('mediaGateDetail');
  const mediaGateKicker = document.getElementById('mediaGateKicker');
  const mediaGateBar = document.getElementById('mediaGateBar');
  const mediaGateCount = document.getElementById('mediaGateCount');
  const mediaGateSize = document.getElementById('mediaGateSize');

  // Map route keys to content partial files
  const views = {
    home: 'index.html',
    welcome: 'welcome.html',
    portfolio: 'portfolio.html',
    vrchat: 'vrchat.html',
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
    downloads: 'Dennifer · Downloads',
    support: 'Dennifer · Support',
    commissions: 'Dennifer · Commissions'
  };

  // Reveal-on-scroll observer (shared)
  let revealObserver = null;
  let viewCleanup = null;
  let mediaLoading = false;
  const loadedMediaSets = new Set();

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

  function updateMediaGate({ title, detail, loaded, total, loadedBytes, totalBytes, measured }) {
    const percent = total > 0 ? Math.round((loaded / total) * 100) : 0;
    if (mediaGateKicker) mediaGateKicker.textContent = 'Fetching Media';
    if (mediaGateTitle) mediaGateTitle.textContent = title || 'Loading Pictures';
    if (mediaGateDetail) mediaGateDetail.textContent = detail || 'Please be patient while the gallery warms up.';
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
    try {
      const res = await fetch(url, { method: 'HEAD', cache: 'force-cache' });
      if (!res.ok) return 0;
      return Number(res.headers.get('content-length')) || 0;
    } catch (err) {
      return 0;
    }
  }

  function preloadImage(url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = url;
    });
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

    let loaded = 0;
    let loadedBytes = 0;
    let totalBytes = 0;
    const sizeMap = new Map();

    setMediaGate(true);
    try {
      updateMediaGate({
        title: `Loading ${pageTitle}`,
        detail: 'Measuring gallery media...',
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

      for (const group of normalizedGroups) {
        await runLimited(group.urls, 6, async (url) => {
          updateMediaGate({
            title: `Loading ${pageTitle}`,
            detail: `Fetching ${group.label} pictures...`,
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
            detail: `Fetching ${group.label} pictures...`,
            loaded,
            total: allUrls.length,
            loadedBytes,
            totalBytes,
            measured: true
          });
        });
      }
    } finally {
      loadedMediaSets.add(stableCacheKey);
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

  // ---- Portfolio rendering logic ----
  const PALETTE = ['#7f5af0', '#2cb67d', '#e58e27', '#4cc9f0', '#f72585', '#3a86ff', '#06d6a0', '#ff5e7d'];
  let allCategories = [];

  async function initPortfolio(scope) {
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

      // Build carousel slides from all photos
      let slides = '';
      if (project.photos.length === 0) {
        slides = `<div class="thumb-art">🌌</div>`;
      } else {
        slides = project.photos.map((src, i) => `
          <img class="thumb-img${i === 0 ? ' active' : ''}" src="${escapeHtml(src)}" alt="${escapeHtml(coverAlt)}" loading="lazy" referrerpolicy="no-referrer" />
        `).join('');
      }

      const card = document.createElement('article');
      card.className = 'project reveal';
      card.dataset.category = category.name;

      card.innerHTML = `
        <div class="project-thumb" style="--tint:${tint}">
          ${slides}
          <div class="project-overlay">
            <button class="btn btn-primary gallery-open">View Photos${project.photos.length > 1 ? ` (${project.photos.length})` : ''}</button>
          </div>
        </div>
        <div class="project-info">
          <span class="tag">${safeCategoryLabel}</span>
          <h3>${safeProjectName}</h3>
          <p>${project.photos.length} photo${project.photos.length > 1 ? 's' : ''}</p>
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

      card.querySelector('.gallery-open').addEventListener('click', (e) => {
        e.stopPropagation();
        openGallery(project.photos, projectName);
      });

      return card;
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
      await preloadMediaGroups(window.PROJECTS.map((category) => ({
        label: category.label,
        urls: (category.projects || []).flatMap((project) => project.photos || [])
      })), 'Portfolio', 'portfolio');
      render(window.PROJECTS);
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
  async function initVrchat(scope) {
    const filtersEl = document.getElementById('vrchatFilters');
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
          <img class="thumb-img active" src="${safeSrc}" alt="VRChat photo ${globalIndex + 1}" loading="lazy" referrerpolicy="no-referrer" />
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

    function renderGrid() {
      gridEl.innerHTML = '';
      const selected = activeCategory === 'all'
        ? categories
        : categories.filter((category) => category.name === activeCategory);

      const buildCardsForCategory = (category, includeSection) => {
        const section = document.createElement('section');
        section.className = 'vrchat-section';

        if (includeSection) {
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

    await preloadMediaGroups(categories.map((category) => ({
      label: category.label,
      urls: category.photos
    })), 'VRChat Photos', 'vrchat');
    renderFilters();
    renderGrid();
  }

  async function initCommissions(scope) {
    const gridEl = document.getElementById('commissionsGrid');
    const emptyEl = document.getElementById('commissionsEmpty');

    if (!gridEl) return;

    async function render() {
      try {
        const res = await fetch('commissions.json', { cache: 'no-store' });
        if (!res.ok) throw new Error('Unable to load commissions data');
        const items = await res.json();

        gridEl.innerHTML = '';

        if (!Array.isArray(items) || items.length === 0) {
          emptyEl.style.display = '';
          return;
        }

        await preloadMediaGroups(items.map((item) => ({
          label: normalizeText(item.category, 'Commission'),
          urls: item.images || []
        })), 'Commissions', 'commissions');

        emptyEl.style.display = 'none';

        items.forEach((item) => {
          const card = document.createElement('article');
          card.className = 'commission-card reveal';
          const category = normalizeText(item.category, 'Commission');
          const description = normalizeText(item.description, 'Commission offering details coming soon.');

          const imagesMarkup = (item.images || []).length > 0
            ? (item.images || []).map((src, index) => `<img class="commission-image${index === 0 ? ' active' : ''}" src="${escapeHtml(src)}" alt="${escapeHtml(category)}" loading="lazy" referrerpolicy="no-referrer" />`).join('')
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

    if (!gridEl) return;

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

        gridEl.innerHTML = '';

        if (!Array.isArray(items) || items.length === 0) {
          emptyEl.style.display = '';
          return;
        }

        emptyEl.style.display = 'none';

        items.forEach((item) => {
          const card = document.createElement('article');
          card.className = 'download-card reveal';
          const title = normalizeText(item.title, 'Download');
          const version = normalizeText(item.version, 'Latest');
          const description = normalizeText(item.description, 'A downloadable item from the archive.');
          const fileSize = normalizeText(item.fileSize, 'Unknown');
          const zipUrl = normalizeText(item.zipUrl, '#');
          const zipFile = normalizeText(item.zipFile, title);

          const tagsMarkup = (item.tags || []).map((tag) => `<span class="download-tag">${escapeHtml(tag)}</span>`).join('');
          const thumbMarkup = item.thumbnail
            ? `<img src="${escapeHtml(item.thumbnail)}" alt="${escapeHtml(title)}" loading="lazy" referrerpolicy="no-referrer" />`
            : `<div class="download-thumb-art">⬇</div>`;

          card.innerHTML = `
            <div class="download-thumb">
              ${thumbMarkup}
            </div>
            <div class="download-card-body">
              <div class="download-card-head">
                <div>
                  <h3>${escapeHtml(title)}</h3>
                  <span class="download-version">${escapeHtml(version)}</span>
                </div>
              </div>
              <p class="download-description">${escapeHtml(description)}</p>
              <div class="download-tags">${tagsMarkup}</div>
              <div class="download-footer">
                <span class="download-size">${escapeHtml(fileSize)}</span>
                <a class="btn btn-primary download-action" href="${escapeHtml(zipUrl)}" download="${escapeHtml(zipFile)}" target="_blank" rel="noopener noreferrer">Download</a>
              </div>
            </div>
          `;

          gridEl.appendChild(card);
        });

        observeReveals();
      } catch (err) {
        console.error(err);
        emptyEl.style.display = '';
        emptyEl.querySelector('p').textContent = 'The download archive could not be loaded right now.';
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
      observeReveals();
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
      if (name === 'portfolio') await initPortfolio(scope);
      if (name === 'vrchat') await initVrchat(scope);
      if (name === 'downloads') initDownloads(scope);
      if (name === 'commissions') await initCommissions(scope);
      observeReveals();
      // No subsection auto-scroll needed for standalone pages.
    } catch (e) {
      app.innerHTML = '<p style="text-align:center;padding:60px">Could not load page.</p>';
    }
  }

// ---- Navigation wiring (hash-based routing) ----
  // Hash routing keeps the URL on index.html (the shell), so refreshing
  // always loads the full app and restores the same view seamlessly.
  function currentPageFromHash() {
    const hash = location.hash.replace(/^#\/?/, '').toLowerCase();
    if (hash === 'welcome' || hash === 'portfolio' || hash === 'vrchat' || hash === 'home' || hash === 'downloads' || hash === 'support' || hash === 'commissions') return hash;
    return 'home';
  }

  function navigate(e) {
    const link = e.currentTarget;
    e.preventDefault();
    if (mediaLoading) return;
    const page = link.dataset.page;
    location.hash = '/' + page;
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
