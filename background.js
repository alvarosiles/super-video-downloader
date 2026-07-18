/**
 * background.js — Super Video Downloader
 * ─────────────────────────────────────────────────────────────────────────
 * Service worker de Manifest V3. Responsabilidades:
 *
 *   1. Mantener el badge del icono con el número de videos detectados en
 *      la pestaña activa (lo informa content.js en cada escaneo).
 *   2. Registrar en el historial cada descarga que termina, y avisar con
 *      una notificación si el usuario lo activó en Opciones. Esto vive
 *      aquí (y no en el popup) porque el popup puede cerrarse antes de que
 *      la descarga termine, y el service worker sigue activo.
 *   3. Detectar manifiestos de streaming adaptativo (HLS .m3u8 / DASH .mpd)
 *      con chrome.webRequest — un <video> nunca expone esa URL en el DOM
 *      cuando el sitio usa hls.js/dash.js (el elemento reproduce un blob:
 *      generado por MediaSource), así que la única forma honesta de verla
 *      es observar la petición de red real, no inventarla.
 *   4. Reconstruir esos streams con ffmpeg.wasm en un offscreen document
 *      (ver offscreen/offscreen.js) y reenviar el progreso al popup — sin
 *      tocar DRM ni contenido cifrado, y sin depender de nada instalado
 *      fuera de la extensión.
 *
 * Carga utils.js y storage.js como scripts clásicos (importScripts, no
 * módulos ES) para reutilizar exactamente la misma lógica que el resto de
 * la extensión — ver scripts/utils.js para más contexto sobre esta
 * decisión.
 */

importScripts('scripts/utils.js', 'scripts/storage.js');

// downloadId -> { site, sizeHint }, solo mientras la descarga está en curso.
const pendingDownloads = new Map();

// tabId -> Map(url -> { url, kind, tabId, firstSeen }), streams detectados
// por red en esa pestaña. Se limpia cuando la pestaña navega o se cierra.
const streamsByTab = new Map();

const MANIFEST_RE = /\.(m3u8|mpd)(\?.*)?(#.*)?$/i;

function streamKind(url) {
  if (/\.m3u8(\?|#|$)/i.test(url)) return 'hls';
  if (/\.mpd(\?|#|$)/i.test(url)) return 'dash';
  return null;
}

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (details.tabId < 0) return;
    if (!MANIFEST_RE.test(details.url)) return;
    const kind = streamKind(details.url);
    if (!kind) return;

    let tabStreams = streamsByTab.get(details.tabId);
    if (!tabStreams) {
      tabStreams = new Map();
      streamsByTab.set(details.tabId, tabStreams);
    }
    if (!tabStreams.has(details.url)) {
      tabStreams.set(details.url, { url: details.url, kind, tabId: details.tabId, firstSeen: Date.now() });
    }
  },
  { urls: ['http://*/*', 'https://*/*'] }
);

function clearTabStreams(tabId) {
  streamsByTab.delete(tabId);
}

chrome.tabs.onRemoved.addListener(clearTabStreams);
chrome.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId === 0) clearTabStreams(details.tabId);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== 'string') return false;

  if (message.type === 'SVD_BADGE_COUNT' && sender.tab?.id != null) {
    const tabId = sender.tab.id;
    if (message.count > 0) {
      chrome.action.setBadgeBackgroundColor({ tabId, color: '#4285F4' });
      chrome.action.setBadgeText({ tabId, text: String(message.count) });
    } else {
      chrome.action.setBadgeText({ tabId, text: '' });
    }
    return false;
  }

  if (message.type === 'SVD_REGISTER_DOWNLOAD') {
    pendingDownloads.set(message.downloadId, {
      site: message.site || '',
      sizeHint: message.sizeHint || 0,
    });
    return false;
  }

  if (message.type === 'SVD_GET_STREAMS') {
    const tabStreams = streamsByTab.get(message.tabId);
    sendResponse({ ok: true, streams: tabStreams ? Array.from(tabStreams.values()) : [] });
    return false;
  }

  if (message.type === 'SVD_WASM_DOWNLOAD') {
    startWasmDownload(message).then(sendResponse);
    return true;
  }

  return false;
});

// ── Descarga sin instalar nada aparte: ffmpeg.wasm en un offscreen document ──

const WASM_HEADER_RULE_ID = 9001;

/** Crea el offscreen document si no existe ya uno (solo puede haber uno por extensión). */
async function ensureOffscreenDocument() {
  const existing = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (existing.length > 0) return;
  await chrome.offscreen.createDocument({
    url: 'offscreen/offscreen.html',
    reasons: ['WORKERS'],
    justification: 'Ejecutar ffmpeg.wasm para reconstruir streams HLS sin depender de una app externa.',
  });
}

/**
 * chrome.offscreen.createDocument() resuelve en cuanto el documento existe,
 * no cuando su script terminó de registrar el listener de mensajes — sin
 * esto, el primer sendMessage puede llegar antes y fallar con "Receiving
 * end does not exist" (carrera de inicialización, no del lado de quien
 * llama).
 */
async function sendToOffscreen(message, attempts = 20) {
  for (let i = 0; i < attempts; i++) {
    try {
      return await chrome.runtime.sendMessage(message);
    } catch (err) {
      if (i === attempts - 1 || !/Receiving end does not exist/.test(err.message || '')) throw err;
      await new Promise((r) => setTimeout(r, 150));
    }
  }
}

/**
 * fetch() nunca puede poner Referer/Origin (son "forbidden headers" del
 * propio estándar, sin excepción para extensiones) — declarativeNetRequest
 * es la única forma de lograrlo en MV3. La regla se agrega justo antes de
 * pedir el manifiesto y se quita al terminar, para no afectar el resto del
 * tráfico del usuario.
 */
async function withHeaderOverride(manifestUrl, headers, fn) {
  let domain = null;
  try {
    domain = new URL(manifestUrl).hostname;
  } catch (_err) {}

  const rule = domain && {
    id: WASM_HEADER_RULE_ID,
    priority: 1,
    action: {
      type: 'modifyHeaders',
      requestHeaders: Object.entries(headers || {})
        .filter(([, value]) => value)
        .map(([header, value]) => ({ header, operation: 'set', value })),
    },
    condition: { urlFilter: `||${domain}^`, resourceTypes: ['xmlhttprequest', 'media', 'other'] },
  };

  if (rule && rule.action.requestHeaders.length > 0) {
    await chrome.declarativeNetRequest.updateDynamicRules({ addRules: [rule], removeRuleIds: [WASM_HEADER_RULE_ID] });
  }
  try {
    return await fn();
  } finally {
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [WASM_HEADER_RULE_ID] }).catch(() => {});
  }
}

/**
 * Orquesta la descarga vía ffmpeg.wasm: agrega la regla de cabeceras, le
 * pide al offscreen document que reconstruya el stream, y con el blob: URL
 * resultante dispara chrome.downloads.download — así el historial y la
 * notificación salen gratis del listener de chrome.downloads.onChanged que
 * ya existe más abajo, igual que cualquier descarga directa.
 */
async function startWasmDownload({ url, filename, headers, site, settings }) {
  try {
    await ensureOffscreenDocument();

    const result = await withHeaderOverride(url, headers, () =>
      sendToOffscreen({ type: 'SVD_WASM_DOWNLOAD', url, filename })
    );

    if (!result || !result.ok) {
      return { ok: false, error: (result && result.error) || 'El offscreen document no respondió' };
    }

    const downloadId = await new Promise((resolve, reject) => {
      chrome.downloads.download(
        { url: result.blobUrl, filename: result.filename, saveAs: !(settings && settings.autoName) },
        (id) => {
          if (chrome.runtime.lastError || id === undefined) {
            reject(new Error(chrome.runtime.lastError?.message || 'No se pudo iniciar la descarga'));
            return;
          }
          resolve(id);
        }
      );
    });

    pendingDownloads.set(downloadId, { site: site || '', sizeHint: result.sizeBytes || 0 });
    return { ok: true, downloadId };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}

chrome.downloads.onChanged.addListener(async (delta) => {
  if (!delta.state || delta.state.current !== 'complete') return;

  const [item] = await chrome.downloads.search({ id: delta.id });
  if (!item) return;

  const meta = pendingDownloads.get(delta.id) || {};
  pendingDownloads.delete(delta.id);

  const filename = item.filename.split(/[\\/]/).pop();

  await self.SVDStorage.addHistoryEntry({
    id: delta.id,
    date: Date.now(),
    filename,
    size: item.fileSize > 0 ? item.fileSize : meta.sizeHint,
    site: meta.site,
    url: item.url,
  });

  const settings = await self.SVDStorage.getSettings();
  if (settings.showNotifications) {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'assets/icons/icon128.png',
      title: self.SVDUtils.t(settings.language, 'appName'),
      message: `${filename}`,
    });
  }
});
