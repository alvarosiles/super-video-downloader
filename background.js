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
 *   4. Hacer de puente hacia el host nativo (ver native-host/) por
 *      chrome.runtime.connectNative: le pasa la URL del manifiesto (sin
 *      tocar DRM ni contenido cifrado) para que ffmpeg reconstruya el
 *      stream en un único archivo, y reenvía el progreso al popup.
 *
 * Carga utils.js y storage.js como scripts clásicos (importScripts, no
 * módulos ES) para reutilizar exactamente la misma lógica que el resto de
 * la extensión — ver scripts/utils.js para más contexto sobre esta
 * decisión.
 */

importScripts('scripts/utils.js', 'scripts/storage.js');

const NATIVE_HOST_NAME = 'com.superviddownloader.host';

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

  if (message.type === 'SVD_NATIVE_PROBE') {
    probeNativeHost().then(sendResponse);
    return true;
  }

  if (message.type === 'SVD_NATIVE_DOWNLOAD') {
    startNativeDownload(message).then(sendResponse);
    return true;
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

/** Comprueba si el host nativo (native-host/) está instalado y responde. */
function probeNativeHost() {
  return new Promise((resolve) => {
    let settled = false;
    let port;
    try {
      port = chrome.runtime.connectNative(NATIVE_HOST_NAME);
    } catch (err) {
      resolve({ ok: false, error: err.message });
      return;
    }
    const finish = (result) => {
      if (settled) return;
      settled = true;
      try { port.disconnect(); } catch (_err) {}
      resolve(result);
    };
    port.onMessage.addListener((msg) => {
      if (msg && msg.type === 'probe-result') finish({ ok: true, ffmpeg: msg.ffmpeg || null });
    });
    port.onDisconnect.addListener(() => {
      finish({ ok: false, error: chrome.runtime.lastError?.message || 'No se pudo conectar con el host nativo' });
    });
    port.postMessage({ type: 'probe' });
    setTimeout(() => finish({ ok: false, error: 'Timeout esperando al host nativo' }), 4000);
  });
}

/**
 * Pide al host nativo que reconstruya `manifestUrl` (HLS/DASH) con ffmpeg y
 * lo guarde como un único archivo. Reenvía el progreso en vivo al popup vía
 * broadcast (chrome.runtime.sendMessage) mientras la conexión sigue abierta;
 * si el popup ya se cerró, simplemente nadie escucha esos mensajes.
 */
function startNativeDownload({ url, filename, headers, site }) {
  return new Promise((resolve) => {
    let port;
    try {
      port = chrome.runtime.connectNative(NATIVE_HOST_NAME);
    } catch (err) {
      resolve({ ok: false, error: err.message });
      return;
    }

    const broadcast = (payload) => chrome.runtime.sendMessage(payload, () => void chrome.runtime.lastError);

    port.onMessage.addListener(async (msg) => {
      if (!msg || typeof msg.type !== 'string') return;

      if (msg.type === 'progress') {
        broadcast({ type: 'SVD_NATIVE_PROGRESS', url, percent: msg.percent ?? null });
        return;
      }

      if (msg.type === 'done') {
        try { port.disconnect(); } catch (_err) {}
        await self.SVDStorage.addHistoryEntry({
          id: `native-${Date.now()}`,
          date: Date.now(),
          filename: msg.filename || filename,
          size: msg.sizeBytes || 0,
          site: site || '',
          url,
        });
        const settings = await self.SVDStorage.getSettings();
        if (settings.showNotifications) {
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'assets/icons/icon128.png',
            title: self.SVDUtils.t(settings.language, 'appName'),
            message: msg.filename || filename,
          });
        }
        broadcast({ type: 'SVD_NATIVE_DONE', url, path: msg.path });
        resolve({ ok: true, path: msg.path });
        return;
      }

      if (msg.type === 'error') {
        try { port.disconnect(); } catch (_err) {}
        broadcast({ type: 'SVD_NATIVE_ERROR', url, error: msg.message });
        resolve({ ok: false, error: msg.message });
      }
    });

    port.onDisconnect.addListener(() => {
      resolve({ ok: false, error: chrome.runtime.lastError?.message || 'El host nativo se desconectó' });
    });

    port.postMessage({ type: 'download', url, filename, headers: headers || {} });
  });
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
