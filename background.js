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
 *
 * Carga utils.js y storage.js como scripts clásicos (importScripts, no
 * módulos ES) para reutilizar exactamente la misma lógica que el resto de
 * la extensión — ver scripts/utils.js para más contexto sobre esta
 * decisión.
 */

importScripts('scripts/utils.js', 'scripts/storage.js');

// downloadId -> { site, sizeHint }, solo mientras la descarga está en curso.
const pendingDownloads = new Map();

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

  return false;
});

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
