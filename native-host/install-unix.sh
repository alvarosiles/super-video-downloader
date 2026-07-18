#!/usr/bin/env bash
#
# install-unix.sh — Super Video Downloader (host nativo)
# ─────────────────────────────────────────────────────────────────────────
# Registra el host nativo para Chrome/Chromium en Linux o macOS.
#
# Uso:
#   npm install                                  (dentro de native-host/)
#   ./native-host/install-unix.sh <id-de-chrome://extensions>

set -euo pipefail

EXT_ID="${1:?Uso: install-unix.sh <extension-id>}"
HOST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

NODE_BIN="$(command -v node || true)"
if [[ -z "$NODE_BIN" ]]; then
  echo "No se encontró 'node' en PATH. Instala Node.js antes de continuar." >&2
  exit 1
fi

if [[ ! -d "$HOST_DIR/node_modules" ]]; then
  echo "Aviso: no se encontró native-host/node_modules. Ejecuta 'npm install' en esta carpeta antes de usar el host." >&2
fi

RUNNER_PATH="$HOST_DIR/run-host.sh"
cat > "$RUNNER_PATH" <<EOF
#!/usr/bin/env bash
exec "$NODE_BIN" "$HOST_DIR/host.js"
EOF
chmod +x "$RUNNER_PATH"

MANIFEST_PATH="$HOST_DIR/com.superviddownloader.host.json"
sed \
  -e "s#__RUNNER_PATH__#$RUNNER_PATH#g" \
  -e "s#__EXTENSION_ID__#$EXT_ID#g" \
  "$HOST_DIR/manifest.template.json" > "$MANIFEST_PATH"

if [[ "$OSTYPE" == darwin* ]]; then
  TARGETS=(
    "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
    "$HOME/Library/Application Support/Microsoft Edge/NativeMessagingHosts"
    "$HOME/Library/Application Support/Chromium/NativeMessagingHosts"
  )
else
  TARGETS=(
    "$HOME/.config/google-chrome/NativeMessagingHosts"
    "$HOME/.config/microsoft-edge/NativeMessagingHosts"
    "$HOME/.config/chromium/NativeMessagingHosts"
  )
fi

for dir in "${TARGETS[@]}"; do
  mkdir -p "$dir"
  cp "$MANIFEST_PATH" "$dir/com.superviddownloader.host.json"
  echo "Registrado en: $dir/com.superviddownloader.host.json"
done

echo
echo "Host nativo instalado. Recarga la extensión (chrome://extensions) y prueba a descargar un video HLS/DASH."
