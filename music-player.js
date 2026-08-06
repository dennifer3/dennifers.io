/* =========================================================
   Music Player — audio-only with animated visualizer
   =========================================================
   Plays a YouTube video's audio via a hidden iframe, with a
   canvas visualizer. Volume defaults to 10% and has a slider.
   Fully static — works on GitHub Pages, no server needed.
   ========================================================= */

(function () {
  'use strict';

const VIDEO_ID = 'Yh2gZUvduqY'; // default song
const START_VOLUME = 10;        // 10% volume on load
  const AUTOPLAY = true;          // start playing automatically

  // Persist volume + playback position so a refresh resumes seamlessly
  const STORE_KEY = 'dennifer_music_state';
  let savedState = null;
  try { savedState = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); }
  catch (e) { savedState = null; }

  let player = null;
  let isPlaying = false;

  // --- DOM refs ---
  const playerEl = document.getElementById('musicPlayer');
  if (!playerEl) return;

  const playBtn = playerEl.querySelector('.mp-play');
  const restartBtn = playerEl.querySelector('.mp-restart');
  const collapseBtn = playerEl.querySelector('.mp-collapse');
  const titleEl = playerEl.querySelector('.mp-title');
  const timeEl = playerEl.querySelector('.mp-time');
  const volumeSlider = playerEl.querySelector('.mp-volume-slider');
  const volumeLabel = playerEl.querySelector('.mp-volume');
  const canvas = playerEl.querySelector('.mp-visualizer');
  const ctx = canvas ? canvas.getContext('2d') : null;

  // --- Collapse / expand ---
  function setCollapsed(collapsed) {
    playerEl.classList.toggle('collapsed', collapsed);
    const body = playerEl.querySelector('.mp-body');
    if (body) body.style.display = collapsed ? 'none' : '';
  }

  if (collapseBtn) {
    collapseBtn.addEventListener('click', () => {
      setCollapsed(!playerEl.classList.contains('collapsed'));
    });
  }

  // --- Visualizer ---
  const VIS_BARS = 32;
  let visLevels = new Array(VIS_BARS).fill(0);
  let playingAnim = false;

  function resizeCanvas() {
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  function drawVisualizer() {
    if (!ctx) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);

    const barW = w / VIS_BARS;
    const gap = barW * 0.25;

    for (let i = 0; i < VIS_BARS; i++) {
      // Smoothly rise/fall levels
      const target = isPlaying ? (Math.random() * 0.85 + 0.15) : 0.08;
      visLevels[i] += (target - visLevels[i]) * 0.12;

      const barH = visLevels[i] * h * 0.9;
      const x = i * barW + gap / 2;
      const y = (h - barH) / 2;

      // Gradient bar
      const hue = 250 + (i / VIS_BARS) * 40;
      const grad = ctx.createLinearGradient(0, y, 0, y + barH);
      grad.addColorStop(0, `hsla(${hue}, 90%, 65%, 0.95)`);
      grad.addColorStop(1, `hsla(${hue + 30}, 90%, 45%, 0.6)`);

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(x, y, barW - gap, barH, 3);
      ctx.fill();
    }

    if (isPlaying || playingAnim) {
      requestAnimationFrame(drawVisualizer);
    }
  }

  function startAnim() {
    if (playingAnim) return;
    playingAnim = true;
    drawVisualizer();
  }

  function stopAnim() {
    playingAnim = false;
    isPlaying = false;
    drawVisualizer();
  }

  // --- Play / pause ---
  function updatePlayUI() {
    if (!playBtn) return;
    playBtn.innerHTML = isPlaying ? '❚❚' : '▶';
    playBtn.classList.toggle('playing', isPlaying);
  }

  playBtn.addEventListener('click', () => {
    if (!player) return;
    if (isPlaying) {
      player.pauseVideo();
    } else {
      player.playVideo();
    }
  });

  if (restartBtn) {
    restartBtn.addEventListener('click', () => {
      if (!player) return;
      try {
        player.seekTo(0, true);
      } catch (e) {
        /* ignore */
      }
    });
  }

// --- Volume ---
  function setVolume(v) {
    if (player) player.setVolume(v);
    if (volumeSlider) {
      volumeSlider.value = v;
      // Update slider track highlight to match knob position
      try {
        volumeSlider.style.background = `linear-gradient(90deg, var(--primary) ${v}%, rgba(127, 90, 240, 0.2) ${v}%)`;
      } catch (e) { /* ignore styling errors */ }
    }
    if (volumeLabel) volumeLabel.textContent = v + '%';
  }

  // Restore volume + position from saved state, or default
  const initialVolume = (savedState && typeof savedState.volume === 'number')
    ? savedState.volume
    : START_VOLUME;

  if (volumeSlider) {
    volumeSlider.min = 0;
    volumeSlider.max = 100;
    volumeSlider.value = initialVolume;
    if (volumeLabel) volumeLabel.textContent = initialVolume + '%';
    volumeSlider.addEventListener('input', () => {
      setVolume(parseInt(volumeSlider.value, 10));
    });
  }

// Periodically save the current playback position + volume
  function saveState() {
    if (!player) return;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        volume: parseInt(volumeSlider ? volumeSlider.value : initialVolume, 10),
        time: player.getCurrentTime() || 0,
        playing: isPlaying
      }));
    } catch (e) { /* ignore storage errors */ }
  }
  setInterval(saveState, 2000);
  window.addEventListener('beforeunload', saveState);

// --- YouTube IFrame API ---
  let autoplayAttempted = false;

  function tryAutoplay() {
    if (!player || autoplayAttempted) return;
    autoplayAttempted = true;
    player.playVideo();
    // If the browser blocked autoplay, start on first user interaction
    const unlock = () => {
      if (player && !isPlaying) {
        player.playVideo();
      }
      document.removeEventListener('click', unlock);
      document.removeEventListener('keydown', unlock);
    };
    document.addEventListener('click', unlock);
    document.addEventListener('keydown', unlock);
  }

  function onYouTubeReady() {
    player = new YT.Player('musicPlayerFrame', {
      videoId: VIDEO_ID,
      width: '0',
      height: '0',
      playerVars: {
        autoplay: AUTOPLAY ? 1 : 0,
        controls: 0,
        rel: 0,
        playsinline: 1
      },
events: {
        onReady: (e) => {
          // Restore saved volume, or use the default
          setVolume(initialVolume);
          // Resume from the saved position, if any
          if (savedState && typeof savedState.time === 'number' && savedState.time > 0) {
            try { player.seekTo(savedState.time, true); } catch (e) { /* ignore */ }
          }
          if (AUTOPLAY) {
            tryAutoplay();
          }
        },
        onStateChange: (e) => {
          isPlaying = e.data === YT.PlayerState.PLAYING;
          updatePlayUI();
          if (isPlaying) {
            startAnim();
          } else {
            stopAnim();
          }
        },
        onError: () => {
          if (titleEl) titleEl.textContent = 'Audio unavailable';
        }
      }
    });
  }

  // Load the IFrame API
  const tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(tag);

  window.onYouTubeIframeAPIReady = onYouTubeReady;
})();
