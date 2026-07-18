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
      const downloadBtn = node.querySelector('.split-btn__main');
      const toggleBtn = node.querySelector('.split-btn__toggle');
      const menu = node.querySelector('.split-btn__menu');
      const copyBtn = node.querySelector('.btn--copy');
      downloadBtn.textContent = t(lang, 'download');
      copyBtn.textContent = t(lang, 'copyUrl');

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

      downloadBtn.addEventListener('click', async () => {
        const variant = video.variants[Number(qualitySelect.value)];
        downloadBtn.disabled = true;
        try {
          await window.SVDDownloader.startDownload(variant, local.settings, local.domain);
          showStatus(`${t(lang, 'download')}: ${variant.filename}`);
        } catch (err) {
          showStatus(err.message || 'Error');
        } finally {
          downloadBtn.disabled = !variant.downloadable;
        }
      });

      toggleBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const isOpen = !menu.classList.contains('hidden');
        closeAllMenus();
        if (!isOpen) {
          menu.classList.remove('hidden');
          toggleBtn.setAttribute('aria-expanded', 'true');
        }
      });

      copyBtn.addEventListener('click', async () => {
        closeAllMenus();
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

  function closeAllMenus() {
    document.querySelectorAll('.split-btn__menu').forEach((m) => m.classList.add('hidden'));
    document.querySelectorAll('.split-btn__toggle').forEach((b) => b.setAttribute('aria-expanded', 'false'));
  }
  document.addEventListener('click', closeAllMenus);

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
