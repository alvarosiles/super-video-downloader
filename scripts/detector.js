/**
 * scripts/detector.js — Super Video Downloader
 * ─────────────────────────────────────────────────────────────────────────
 * Lógica de detección de medios descargables en la página actual. Se
 * inyecta como content script (mundo aislado) junto con utils.js y
 * content.js (ver manifest.json — el orden importa: utils.js primero).
 *
 * Alcance deliberado: solo se detectan elementos <video>/<source> y enlaces
 * <a> que apunten directo a un archivo de video, todos con una URL
 * http(s)/data: directa. Las fuentes blob:/mediasource: (típicas de
 * streaming adaptativo con MSE — YouTube, Netflix, la mayoría de players
 * "premium") se listan igualmente para que el usuario sepa que existen,
 * pero se marcan como NO descargables: intentar reconstruirlas implicaría
 * eludir el mecanismo de streaming/DRM del sitio, algo que este proyecto
 * evita explícitamente por diseño y por política de la Chrome Web Store.
 *
 * Sobre "más de una resolución": un <video> HTML5 solo expone la fuente que
 * está reproduciendo en ese momento (`currentSrc`), pero muchos sitios listan
 * las demás calidades como <source> adicionales dentro del mismo <video>, o
 * como enlaces de descarga (<a href="...720p.mp4">) fuera del reproductor.
 * Este archivo recoge las tres formas y las combina en una sola lista,
 * deduplicada por URL. Si un sitio SOLO expone la calidad activa (p. ej. la
 * cambia por JavaScript sin dejar rastro en el DOM), no hay forma honesta de
 * inventar las demás sin interceptar tráfico de red — así que esos casos
 * simplemente no aparecerán con más de una opción.
 */

(function (root) {
  'use strict';

  const { guessMimeFromUrl, filenameFromUrl } = root.SVDUtils;

  const VIDEO_EXTENSION_RE = /\.(mp4|webm|ogv|ogg|mov|mkv|m4v|3gp|avi)(\?.*)?(#.*)?$/i;
  const QUALITY_LABEL_RE = /(\d{3,4}p|4k|8k|hd|sd)\b/i;

  function isDirectlyDownloadable(url) {
    return /^https?:|^data:/i.test(url);
  }

  /** Busca un indicio de calidad ("720p", "1080p", "4K"...) en un texto. */
  function qualityLabelFrom(text) {
    const match = String(text || '').match(QUALITY_LABEL_RE);
    return match ? match[1].toUpperCase() : null;
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
      qualityLabel: qualityLabelFrom(video.currentSrc) || qualityLabelFrom(video.title),
    };
  }

  function candidatesFromSources(video) {
    return Array.from(video.querySelectorAll('source'))
      .map((source) => {
        const url = source.src;
        if (!url) return null;
        // El único <source> activo (currentSrc) SÍ tiene las dimensiones
        // reales del video decodificado; los demás son solo "otras
        // calidades disponibles" y no sabemos su resolución hasta que el
        // navegador decida reproducirlos, así que no se las inventamos.
        const isActive = url === video.currentSrc;
        return {
          url,
          mime: source.type || guessMimeFromUrl(url),
          width: isActive ? video.videoWidth || null : null,
          height: isActive ? video.videoHeight || null : null,
          duration: isActive && isFinite(video.duration) ? video.duration : null,
          qualityLabel:
            qualityLabelFrom(source.getAttribute('label')) ||
            qualityLabelFrom(source.getAttribute('size')) ||
            qualityLabelFrom(url),
        };
      })
      .filter(Boolean);
  }

  /**
   * Enlaces <a href="..."> que apuntan directo a un archivo de video —
   * común en páginas que listan varias calidades como enlaces de descarga
   * fuera del propio reproductor (p. ej. "Descargar en 480p / 720p / 1080p").
   */
  function candidatesFromDownloadLinks() {
    return Array.from(document.querySelectorAll('a[href]'))
      .map((anchor) => {
        const url = anchor.href;
        if (!url || !VIDEO_EXTENSION_RE.test(url)) return null;
        return {
          url,
          mime: guessMimeFromUrl(url),
          width: null,
          height: null,
          duration: null,
          qualityLabel: qualityLabelFrom(anchor.textContent) || qualityLabelFrom(url),
        };
      })
      .filter(Boolean);
  }

  /** Combina dos candidatos de la misma URL quedándose con los datos más completos de cada uno. */
  function mergeCandidate(base, extra) {
    return {
      url: base.url,
      mime: base.mime || extra.mime,
      width: base.width ?? extra.width,
      height: base.height ?? extra.height,
      duration: base.duration ?? extra.duration,
      qualityLabel: base.qualityLabel || extra.qualityLabel,
    };
  }

  /** Escanea el documento actual y devuelve la lista de candidatos (sin tamaño en bytes: eso se pide bajo demanda). */
  function scan() {
    const seen = new Map();

    function addCandidate(candidate) {
      if (!candidate) return;
      const existing = seen.get(candidate.url);
      seen.set(candidate.url, existing ? mergeCandidate(existing, candidate) : candidate);
    }

    document.querySelectorAll('video').forEach((video) => {
      addCandidate(candidateFromVideo(video));
      candidatesFromSources(video).forEach(addCandidate);
    });
    candidatesFromDownloadLinks().forEach(addCandidate);

    return Array.from(seen.values()).map((candidate, index) => ({
      id: `svd-${index}-${candidate.url.length}`,
      url: candidate.url,
      mime: candidate.mime || '',
      filename: filenameFromUrl(candidate.url, document.title, candidate.mime),
      width: candidate.width,
      height: candidate.height,
      duration: candidate.duration,
      qualityLabel: candidate.qualityLabel || null,
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
   * decide cuándo volver a escanear) cuando aparecen nuevos
   * <video>/<source> o enlaces a archivos de video. Solo se activa si el
   * ajuste "actualización automática" está habilitado (lo decide
   * content.js).
   */
  function observe(onChange) {
    const observer = new MutationObserver((mutations) => {
      const relevant = mutations.some((m) =>
        Array.from(m.addedNodes).some((node) => {
          if (node.nodeType !== Node.ELEMENT_NODE) return false;
          if (node.tagName === 'VIDEO' || node.tagName === 'SOURCE' || node.tagName === 'A') return true;
          return node.querySelector?.('video, source, a[href]');
        })
      );
      if (relevant) onChange();
    });
    observer.observe(document.documentElement || document, { childList: true, subtree: true });
    return observer;
  }

  root.SVDDetector = { scan, enrichWithSize, observe };
})(window);
