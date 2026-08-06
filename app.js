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

  function initPortfolio() {
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

    prevBtn.addEventListener('click', () => showPhoto(currentIndex - 1));
    nextBtn.addEventListener('click', () => showPhoto(currentIndex + 1));
    modalBackdrop.addEventListener('click', closeModal);
    modalClose.addEventListener('click', closeModal);
    document.addEventListener('keydown', (e) => {
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
      const projectName = project.name.replace(/_/g, ' ');
      const coverAlt = projectName;

      // Build carousel slides from all photos
      let slides = '';
      if (project.photos.length === 0) {
        slides = `<div class="thumb-art">🌌</div>`;
      } else {
        slides = project.photos.map((src, i) => `
          <img class="thumb-img${i === 0 ? ' active' : ''}" src="${src}" alt="${coverAlt}" loading="lazy" referrerpolicy="no-referrer" />
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
          <span class="tag">${category.label}</span>
          <h3>${projectName}</h3>
          <p>${project.photos.length} photo${project.photos.length > 1 ? 's' : ''}</p>
        </div>
      `;

      // Auto-cycle photos every 5s if more than one
      if (project.photos.length > 1) {
        const slidesList = card.querySelectorAll('.thumb-img');
        let currentSlide = 0;
        setInterval(() => {
          slidesList[currentSlide].classList.remove('active');
          currentSlide = (currentSlide + 1) % slidesList.length;
          slidesList[currentSlide].classList.add('active');
        }, 5000);
      }

      card.querySelector('.gallery-open').addEventListener('click', (e) => {
        e.stopPropagation();
        openGallery(project.photos, project.name.replace(/_/g, ' '));
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
          header.innerHTML = `<h2>${category.label}</h2><span>${category.projects.length} project${category.projects.length > 1 ? 's' : ''}</span>`;
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
  function initVrchat() {
    const filtersEl = document.getElementById('vrchatFilters');
    const gridEl = document.getElementById('vrchatGrid');
    const emptyEl = document.getElementById('vrchatEmpty');
    const modal = document.getElementById('vrchatModal');
    const modalBackdrop = document.getElementById('vrchatModalBackdrop');
    const modalClose = document.getElementById('vrchatModalClose');
    const img = document.getElementById('vrchatImg');
    const counter = document.getElementById('vrchatCounter');
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
      const card = document.createElement('article');
      card.className = 'vrchat-card reveal';
      card.innerHTML = `
        <button type="button" class="vrchat-thumb" aria-label="Open VRChat photo ${globalIndex + 1}">
          <img class="thumb-img active" src="${src}" alt="VRChat photo ${globalIndex + 1}" loading="lazy" referrerpolicy="no-referrer" />
          <div class="vrchat-overlay">
            <span>View</span>
          </div>
        </button>
      `;

      const thumb = card.querySelector('.vrchat-thumb');
      if (thumb) {
        thumb.addEventListener('click', () => openPhoto(globalIndex));
      }
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
            <h2>${category.label}</h2>
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
            <p>${monthLabel}</p>
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
      img.src = flatPhotos[currentIndex];
      counter.textContent = `${currentIndex + 1} / ${flatPhotos.length}`;
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

    prevBtn.addEventListener('click', () => showPhoto(currentIndex - 1));
    nextBtn.addEventListener('click', () => showPhoto(currentIndex + 1));
    modalBackdrop.addEventListener('click', closeModal);
    modalClose.addEventListener('click', closeModal);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeModal();
      if (modal.classList.contains('open')) {
        if (e.key === 'ArrowLeft') showPhoto(currentIndex - 1);
        if (e.key === 'ArrowRight') showPhoto(currentIndex + 1);
      }
    });

    renderFilters();
    renderGrid();
  }

  function initCommissions() {
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

        emptyEl.style.display = 'none';

        items.forEach((item) => {
          const card = document.createElement('article');
          card.className = 'commission-card reveal';

          const imagesMarkup = (item.images || []).length > 0
            ? (item.images || []).map((src, index) => `<img class="commission-image${index === 0 ? ' active' : ''}" src="${src}" alt="${item.category}" loading="lazy" referrerpolicy="no-referrer" />`).join('')
            : '<div class="commission-image-placeholder">✦</div>';

          card.innerHTML = `
            <div class="commission-thumb">
              ${imagesMarkup}
            </div>
            <div class="commission-body">
              <h3>${item.category}</h3>
              <p>${item.description}</p>
            </div>
          `;

          if ((item.images || []).length > 1) {
            const images = card.querySelectorAll('.commission-image');
            let currentIndex = 0;
            setInterval(() => {
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
        const candidates = [
          'downloads.json',
          '/downloads.json',
          '/d3nniferio/downloads.json',
          'http://127.0.0.1:3000/downloads.json'
        ];

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

          const tagsMarkup = (item.tags || []).map((tag) => `<span class="download-tag">${tag}</span>`).join('');
          const thumbMarkup = item.thumbnail
            ? `<img src="${item.thumbnail}" alt="${item.title}" loading="lazy" referrerpolicy="no-referrer" />`
            : `<div class="download-thumb-art">⬇</div>`;

          card.innerHTML = `
            <div class="download-thumb">
              ${thumbMarkup}
            </div>
            <div class="download-card-body">
              <div class="download-card-head">
                <div>
                  <h3>${item.title}</h3>
                  <span class="download-version">${item.version}</span>
                </div>
              </div>
              <p class="download-description">${item.description}</p>
              <div class="download-tags">${tagsMarkup}</div>
              <div class="download-footer">
                <span class="download-size">${item.fileSize}</span>
                <a class="btn btn-primary download-action" href="${item.zipUrl}" download="${item.zipFile || item.title}" target="_blank" rel="noopener noreferrer">Download</a>
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
      if (name === 'portfolio') initPortfolio();
      if (name === 'vrchat') initVrchat();
      if (name === 'downloads') initDownloads();
      if (name === 'commissions') initCommissions();
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
    if (a) e.preventDefault();
  });

  route();
})();
