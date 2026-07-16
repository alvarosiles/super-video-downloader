/**
 * scripts/detector.js — Super Video Downloader
 * ─────────────────────────────────────────────────────────────────────────
 * Lógica de detección de medios descargables en la página actual. Se
 * inyecta como content script (mundo aislado) junto con utils.js y
 * content.js (ver manifest.json — el orden importa: utils.js primero).
 *
 * Alcance deliberado: solo se detectan elementos <video> y <source> con una
 * URL http(s)/data: directa. Las fuentes blob:/mediasource: (típicas de
 * streaming adaptativo con MSE — YouTube, Netflix, la mayoría de players
 * "premium") se listan igualmente para que el usuario sepa que existen,
 * pero se marcan como NO descargables: intentar reconstruirlas implicaría
 * eludir el mecanismo de streaming/DRM del sitio, algo que este proyecto
 * evita explícitamente por diseño y por política de la Chrome Web Store.
 */

(function (root) {
  'use strict';

  const { guessMimeFromUrl, filenameFromUrl } = root.SVDUtils;

  function isDirectlyDownloadable(url) {
    return /^https?:|^data:/i.test(url);
  }

  function candidateFromVideo(video) {
    const url = video.currentSrc || video.src || '';
    if (!url) return null;
    return {
      url,
      mime: video.querySelector('source')?.type || guessMimeFromUrl(url),
      width: video.videoWidth || null,
      height: video.videoHeight || null,
      duration: isFinite(video.duration) ? video.duration : null,
    };
  }

  function candidatesFromSources(video) {
    return Array.from(video.querySelectorAll('source'))
      .map((source) => {
        const url = source.src;
        if (!url) return null;
        return {
          url,
          mime: source.type || guessMimeFromUrl(url),
          width: video.videoWidth || null,
          height: video.videoHeight || null,
          duration: isFinite(video.duration) ? video.duration : null,
        };
      })
      .filter(Boolean);
  }

  /** Escanea el documento actual y devuelve la lista de candidatos (sin tamaño en bytes: eso se pide bajo demanda). */
  function scan() {
    const seen = new Map();

    document.querySelectorAll('video').forEach((video) => {
      [candidateFromVideo(video), ...candidatesFromSources(video)].forEach((candidate) => {
        if (!candidate || seen.has(candidate.url)) return;
        seen.set(candidate.url, candidate);
      });
    });

    return Array.from(seen.values()).map((candidate, index) => ({
      id: `svd-${index}-${candidate.url.length}`,
      url: candidate.url,
      mime: candidate.mime || '',
      filename: filenameFromUrl(candidate.url, document.title, candidate.mime),
      width: candidate.width,
      height: candidate.height,
      duration: candidate.duration,
      downloadable: isDirectlyDownloadable(candidate.url),
      sizeBytes: null,
    }));
  }

  /**
   * Completa `sizeBytes` haciendo una petición HEAD por cada candidato
   * descargable. Es una operación de red, así que solo se llama bajo
   * demanda (cuando el popup realmente necesita mostrar el tamaño), nunca
   * automáticamente al cargar la página.
   */
  async function enrichWithSize(candidates) {
    await Promise.all(
      candidates
        .filter((c) => c.downloadable && c.sizeBytes == null)
        .map(async (c) => {
          try {
            const res = await fetch(c.url, { method: 'HEAD' });
            const len = res.headers.get('content-length');
            c.sizeBytes = len ? Number(len) : null;
            if (!c.mime) c.mime = res.headers.get('content-type') || '';
          } catch (_err) {
            c.sizeBytes = null;
          }
        })
    );
    return candidates;
  }

  /**
   * Observa el DOM y llama a `onChange()` (sin argumentos, el llamador
   * decide cuándo volver a escanear) cuando aparecen nuevos <video>/<source>.
   * Solo se activa si el ajuste "actualización automática" está habilitado
   * (lo decide content.js).
   */
  function observe(onChange) {
    const observer = new MutationObserver((mutations) => {
      const relevant = mutations.some((m) =>
        Array.from(m.addedNodes).some(
          (node) =>
            node.nodeType === Node.ELEMENT_NODE &&
            (node.tagName === 'VIDEO' || node.tagName === 'SOURCE' || node.querySelector?.('video, source'))
        )
      );
      if (relevant) onChange();
    });
    observer.observe(document.documentElement || document, { childList: true, subtree: true });
    return observer;
  }

  root.SVDDetector = { scan, enrichWithSize, observe };
})(window);
