/**
 * native-messaging.js — Super Video Downloader (host nativo)
 * ─────────────────────────────────────────────────────────────────────────
 * Implementa a mano el framing del protocolo de Native Messaging de
 * Chrome/Edge: cada mensaje va precedido de 4 bytes little-endian con su
 * longitud en bytes, seguidos del JSON en UTF-8. No depende de ningún
 * paquete externo — es el mismo formato en todos los navegadores basados
 * en Chromium.
 */
'use strict';

function readMessages(onMessage) {
  let buffer = Buffer.alloc(0);

  process.stdin.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);

    while (buffer.length >= 4) {
      const length = buffer.readUInt32LE(0);
      if (buffer.length < 4 + length) break; // falta el resto del mensaje

      const body = buffer.subarray(4, 4 + length);
      buffer = buffer.subarray(4 + length);

      try {
        onMessage(JSON.parse(body.toString('utf8')));
      } catch (err) {
        process.stderr.write(`native-messaging: JSON inválido (${err.message})\n`);
      }
    }
  });

  process.stdin.on('end', () => process.exit(0));
}

function sendMessage(message) {
  const body = Buffer.from(JSON.stringify(message), 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length, 0);
  process.stdout.write(Buffer.concat([header, body]));
}

module.exports = { readMessages, sendMessage };
