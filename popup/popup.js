/**
 * popup.js — Super Video Downloader
 * ─────────────────────────────────────────────────────────────────────────
 * UI del popup: pide a content.js la lista de videos de la pestaña activa
 * (con tamaño en bytes incluido — ver scripts/detector.js sobre por qué
 * esa parte es "bajo demanda") y ofrece descargarlos o copiar su URL.
 */

(() => {
  'use strict';

  const { formatBytes, formatDuration, t, pluralKey, applyTranslations } = window.SVDUtils;

  const els = {
    root: document.documentElement,
    refreshBtn: document.getElementById('refreshBtn'),
    settingsBtn: document.getElementById('settingsBtn'),
    favicon: document.getElementById('siteFavicon'),
    domain: document.getElementById('siteDomain'),
    countBadge: document.getElementById('countBadge'),
    videoList: document.getElementById('videoList'),
    emptyState: document.getElementById('emptyState'),
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

  function metaLine(video) {
    const lang = local.settings.language;
    const parts = [];
    if (video.mime) parts.push(video.mime.replace('video/', '').toUpperCase());
    if (video.width && video.height) parts.push(`${video.width}×${video.height}`);
    const duration = formatDuration(video.duration);
    if (duration) parts.push(duration);
    const size = formatBytes(video.sizeBytes);
    parts.push(size || t(lang, 'unknown'));
    if (!video.downloadable) parts.push(t(lang, 'notDownloadable'));
    return parts.join(' · ');
  }

  function renderVideos(videos) {
    const lang = local.settings.language;
    els.videoList.innerHTML = '';
    els.countBadge.textContent = String(videos.length);
    els.emptyState.classList.toggle('hidden', videos.length > 0);

    for (const video of videos) {
      const node = els.template.content.firstElementChild.cloneNode(true);
      node.classList.toggle('is-disabled', !video.downloadable);
      node.querySelector('.video-item__name').textContent = video.filename;
      node.querySelector('.video-item__meta').textContent = metaLine(video);

      const downloadBtn = node.querySelector('.btn--download');
      const copyBtn = node.querySelector('.btn--copy');
      downloadBtn.textContent = t(lang, 'download');
      copyBtn.textContent = t(lang, 'copyUrl');
      downloadBtn.disabled = !video.downloadable;

      downloadBtn.addEventListener('click', async () => {
        downloadBtn.disabled = true;
        try {
          await window.SVDDownloader.startDownload(video, local.settings, local.domain);
          showStatus(`${t(lang, 'download')}: ${video.filename}`);
        } catch (err) {
          showStatus(err.message || 'Error');
        } finally {
          downloadBtn.disabled = !video.downloadable;
        }
      });

      copyBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(video.url);
          showStatus(t(lang, 'copied'));
        } catch (_err) {
          showStatus(video.url);
        }
      });

      els.videoList.appendChild(node);
    }
  }

  async function loadVideos() {
    const response = await sendToContentScript({ type: 'SVD_GET_VIDEOS' });
    if (response && response.ok) {
      local.domain = response.domain;
      renderVideos(response.videos);
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
