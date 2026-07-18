/**
 * ffmpeg-locator.js — Super Video Downloader (host nativo)
 * ─────────────────────────────────────────────────────────────────────────
 * Encuentra los binarios de ffmpeg/ffprobe a usar. Prioridad:
 *   1. Variables de entorno SVD_FFMPEG_PATH / SVD_FFPROBE_PATH (el usuario
 *      puede apuntar a un binario propio).
 *   2. Los paquetes ffmpeg-static / ffprobe-static (npm install los baja
 *      automáticamente para la plataforma actual — evita tener que
 *      empaquetar manualmente un binario de ~80MB en este repo).
 *   3. `ffmpeg`/`ffprobe` en PATH, como último recurso.
 */
'use strict';

function locate(envVar, staticPkg, fallbackName) {
  if (process.env[envVar]) return process.env[envVar];
  try {
    const resolved = require(staticPkg);
    // ffmpeg-static exporta el path directamente; ffprobe-static exporta { path }.
    const path = typeof resolved === 'string' ? resolved : resolved.path;
    if (path) return path;
  } catch (_err) {
    // Paquete no instalado (falta `npm install` en native-host/) — cae al PATH.
  }
  return fallbackName;
}

module.exports = {
  ffmpegPath: locate('SVD_FFMPEG_PATH', 'ffmpeg-static', 'ffmpeg'),
  ffprobePath: locate('SVD_FFPROBE_PATH', 'ffprobe-static', 'ffprobe'),
};
