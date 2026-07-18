/**
 * popup.js — Super Video Downloader
 * ─────────────────────────────────────────────────────────────────────────
 * UI del popup: pide a content.js la lista de videos de la pestaña activa
 * (con tamaño en bytes incluido — ver scripts/detector.js sobre por qué
 * esa parte es "bajo demanda") y ofrece descargarlos o copiar su URL.
 */

(() => {
  'use strict';

  const { formatBytes, formatDuration, t, applyTranslations } = window.SVDUtils;

  const els = {
    root: document.documentElement,
    refreshBtn: document.getElementById('refreshBtn'),
    settingsBtn: document.getElementById('settingsBtn'),
    favicon: document.getElementById('siteFavicon'),
    domain: document.getElementById('siteDomain'),
    countBadge: document.getElementById('countBadge'),
    videoList: document.getElementById('videoList'),
    emptyState: document.getElementById('emptyState'),
    protectedNotice: document.getElementById('protectedNotice'),
    status: document.getElementById('statusMessage'),
    template: document.getElementById('videoItemTemplate'),
  };

  const local = { tabId: null, domain: '', settings: null };

  function showStatus(text) {
    els.status.textContent = text;
    clearTimeout(showStatus._t);
    showStatus._t = setTimeout(() => {
      els.status.textContent = '';
    }, 2000);
  }

  function sendToContentScript(message) {
    return new Promise((resolve) => {
      if (local.tabId == null) return resolve(null);
      chrome.tabs.sendMessage(local.tabId, message, (response) => {
        void chrome.runtime.lastError;
        resolve(response || null);
      });
    });
  }

  function qualityLabel(variant) {
    if (variant.width && variant.height) return `${variant.width}×${variant.height}`;
    return variant.qualityLabel || (variant.mime ? variant.mime.replace('video/', '').toUpperCase() : '');
  }

  function sizeText(variant) {
    const lang = local.settings.language;
    return variant.downloadable ? formatBytes(variant.sizeBytes) || t(lang, 'unknown') : '';
  }

  function renderVideos(videos) {
    const lang = local.settings.language;
    els.videoList.innerHTML = '';
    els.countBadge.textContent = String(videos.length);
    els.emptyState.classList.toggle('hidden', videos.length > 0);
    els.protectedNotice.classList.toggle('hidden', !videos.some((v) => !v.variants.some((variant) => variant.downloadable)));

    for (const video of videos) {
      const node = els.template.content.firstElementChild.cloneNode(true);
      node.querySelector('.video-item__name').textContent = video.filename;

      const poster = node.querySelector('.video-item__poster');
      if (video.poster) {
        poster.src = video.poster;
        poster.classList.remove('hidden');
        poster.onerror = () => poster.classList.add('hidden');
      }

      const durationEl = node.querySelector('.video-item__duration');
      const duration = formatDuration(video.duration);
      if (duration) {
        durationEl.textContent = duration;
        durationEl.classList.remove('hidden');
      }

      const badge = node.querySelector('.protected-badge');
      const sizeEl = node.querySelector('.video-item__size');
      const qualitySelect = node.querySelector('.video-item__quality');
      const downloadBtn = node.querySelector('.btn--download');
      const copyBtn = node.querySelector('.icon-btn--copy');
      const progressBox = node.querySelector('.video-item__progress');
      const progressFill = node.querySelector('.video-item__progress-fill');
      const progressLabel = node.querySelector('.video-item__progress-label');
      const cancelBtn = node.querySelector('.btn--cancel');
      downloadBtn.textContent = t(lang, 'download');
      cancelBtn.textContent = t(lang, 'cancel');

      video.variants.forEach((variant, index) => {
        const option = document.createElement('option');
        option.value = String(index);
        option.textContent = qualityLabel(variant) || `#${index + 1}`;
        qualitySelect.appendChild(option);
      });
      qualitySelect.disabled = video.variants.length <= 1;

      function applyVariant(index) {
        const variant = video.variants[index];
        qualitySelect.value = String(index);
        node.classList.toggle('is-disabled', !variant.downloadable);
        sizeEl.textContent = sizeText(variant);
        badge.classList.toggle('hidden', variant.downloadable);
        badge.querySelector('.protected-badge__text').textContent = t(lang, 'notDownloadable');
        downloadBtn.disabled = !variant.downloadable;
        downloadBtn.title = variant.downloadable ? '' : t(lang, 'notDownloadableTooltip');
      }

      applyVariant(video.selectedIndex || 0);

      qualitySelect.addEventListener('change', () => {
        applyVariant(Number(qualitySelect.value));
      });

      function setDownloading(isDownloading) {
        downloadBtn.classList.toggle('hidden', isDownloading);
        copyBtn.classList.toggle('hidden', isDownloading);
        qualitySelect.disabled = isDownloading || video.variants.length <= 1;
        progressBox.classList.toggle('hidden', !isDownloading);
        if (!isDownloading) {
          progressFill.style.width = '0%';
          progressLabel.textContent = '';
        }
      }

      downloadBtn.addEventListener('click', async () => {
        const variant = video.variants[Number(qualitySelect.value)];
        try {
          if (variant.kind === 'dash') {
            throw new Error('DASH todavía no está soportado (solo HLS por ahora).');
          } else if (variant.kind === 'hls') {
            setDownloading(true);
            cancelBtn.onclick = () => cancelWasmDownload(variant.url);
            await downloadViaWasm(variant, progressFill, progressLabel);
            showStatus(`${t(lang, 'download')}: ${variant.filename}`);
          } else {
            downloadBtn.disabled = true;
            await window.SVDDownloader.startDownload(variant, local.settings, local.domain);
            showStatus(`${t(lang, 'download')}: ${variant.filename}`);
            downloadBtn.disabled = !variant.downloadable;
          }
        } catch (err) {
          showStatus(err.message || 'Error');
          downloadBtn.disabled = !variant.downloadable;
        } finally {
          setDownloading(false);
        }
      });

      copyBtn.addEventListener('click', async () => {
        const variant = video.variants[Number(qualitySelect.value)];
        try {
          await navigator.clipboard.writeText(variant.url);
          showStatus(t(lang, 'copied'));
        } catch (_err) {
          showStatus(variant.url);
        }
      });

      els.videoList.appendChild(node);
    }
  }

  /**
   * Cabeceras a mandarle al fetch de la playlist/segmentos. Muchos CDNs de
   * streaming comprueban Referer/Origin para rechazar peticiones que no
   * vienen "del reproductor real" — fetch() nunca puede ponerlas por sí
   * solo, así que background.js las fuerza con declarativeNetRequest justo
   * antes de pedir esto (ver withHeaderOverride en background.js).
   */
  function streamDownloadHeaders() {
    const headers = { 'User-Agent': navigator.userAgent };
    if (local.tabUrl) {
      headers.Referer = local.tabUrl;
      try {
        headers.Origin = new URL(local.tabUrl).origin;
      } catch (_err) {}
    }
    return headers;
  }

  /**
   * Descarga un stream HLS reconstruyéndolo con ffmpeg.wasm en un offscreen
   * document (ver offscreen/offscreen.js) — sin instalar nada aparte, lo
   * que hace esto compatible con publicar la extensión en la Chrome Web
   * Store sin pasos extra para el usuario. El progreso llega por broadcast
   * mientras el popup siga abierto.
   */
  function downloadViaWasm(variant, progressFill, progressLabel) {
    return new Promise((resolve, reject) => {
      let lastBytes = 0;
      let lastTime = Date.now();

      const onProgress = (message) => {
        if (!message || message.url !== variant.url || message.type !== 'SVD_WASM_PROGRESS') return;
        if (message.percent != null) progressFill.style.width = `${message.percent}%`;

        let speedText = '';
        if (message.bytesSoFar != null) {
          const now = Date.now();
          const deltaBytes = message.bytesSoFar - lastBytes;
          const deltaSeconds = (now - lastTime) / 1000;
          if (deltaSeconds > 0.2) {
            const speed = formatBytes(deltaBytes / deltaSeconds);
            if (speed) speedText = ` · ${speed}/s`;
            lastBytes = message.bytesSoFar;
            lastTime = now;
          }
        }
        progressLabel.textContent = `${message.percent ?? 0}%${speedText}`;
      };
      chrome.runtime.onMessage.addListener(onProgress);

      chrome.runtime.sendMessage(
        {
          type: 'SVD_WASM_DOWNLOAD',
          url: variant.url,
          filename: variant.filename,
          site: local.domain,
          headers: streamDownloadHeaders(),
          settings: local.settings,
        },
        (response) => {
          chrome.runtime.onMessage.removeListener(onProgress);
          if (chrome.runtime.lastError) {
            reject(new Error('No se pudo iniciar la reconstrucción del stream.'));
            return;
          }
          if (response && response.ok) {
            resolve();
          } else {
            reject(new Error((response && response.error) || 'Error reconstruyendo el stream'));
          }
        }
      );
    });
  }

  function cancelWasmDownload(url) {
    chrome.runtime.sendMessage({ type: 'SVD_WASM_CANCEL', url }, () => void chrome.runtime.lastError);
  }

  const STREAM_QUALITY_RE = /(\d{3,4}p|4k|fhd|hd|sd)/i;

  /**
   * Un mismo video HLS/DASH suele generar VARIAS peticiones de manifiesto
   * (el maestro + una por cada calidad que referencia) — sin agrupar, cada
   * una aparecía como una tarjeta duplicada idéntica en el popup. Aquí se
   * combinan todas las detectadas en la pestaña en un solo item con
   * selector de calidad, igual que ya se hace con los <video>/<source>.
   */
  function streamsToVideos(streams, pageTitle) {
    if (streams.length === 0) return [];
    const filename = `${(pageTitle || 'video').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80)}.mp4`;

    const variants = streams.map((stream, index) => {
      const kind = stream.kind === 'dash' ? 'DASH' : 'HLS';
      const match = STREAM_QUALITY_RE.exec(stream.url);
      return {
        url: stream.url,
        filename,
        mime: stream.kind === 'dash' ? 'application/dash+xml' : 'application/x-mpegURL',
        width: null,
        height: null,
        duration: null,
        qualityLabel: match ? `${kind} ${match[1].toUpperCase()}` : `${kind} #${index + 1}`,
        downloadable: true,
        kind: stream.kind,
        sizeBytes: null,
      };
    });

    return [{ id: 'stream-group', filename, poster: null, duration: null, selectedIndex: 0, variants }];
  }

  async function loadVideos() {
    const [response, streamsResponse] = await Promise.all([
      sendToContentScript({ type: 'SVD_GET_VIDEOS' }),
      new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'SVD_GET_STREAMS', tabId: local.tabId }, (r) => {
          void chrome.runtime.lastError;
          resolve(r);
        });
      }),
    ]);

    const streams = streamsResponse && streamsResponse.ok ? streamsResponse.streams : [];
    const streamVideos = streamsToVideos(streams, local.pageTitle);

    if (response && response.ok) {
      local.domain = response.domain;
      const fallbackPoster = response.pageThumbnail || null;
      const videos = [...response.videos, ...streamVideos].map((v) => ({ ...v, poster: v.poster || fallbackPoster }));
      renderVideos(videos);
    } else if (streamVideos.length > 0) {
      renderVideos(streamVideos);
    } else {
      renderVideos([]);
      showStatus('Esta página no permite detectar videos.');
    }
  }

  async function init() {
    local.settings = await window.SVDStorage.getSettings();
    els.root.setAttribute('data-theme', local.settings.theme);
    applyTranslations(document, local.settings.language);

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;
    local.tabId = tab.id;
    local.pageTitle = tab.title || '';
    local.tabUrl = tab.url || '';

    try {
      local.domain = new URL(tab.url).hostname.replace(/^www\./i, '');
    } catch (_err) {
      local.domain = '';
    }
    els.domain.textContent = local.domain || 'Página especial del navegador';
    els.favicon.src = tab.favIconUrl || '';
    els.favicon.onerror = () => {
      els.favicon.style.visibility = 'hidden';
    };

    await loadVideos();
  }

  els.refreshBtn.addEventListener('click', async () => {
    els.refreshBtn.classList.add('is-spinning');
    await loadVideos();
    setTimeout(() => els.refreshBtn.classList.remove('is-spinning'), 400);
  });

  els.settingsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  init();
})();
