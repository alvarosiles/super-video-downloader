# Super Video Downloader — host nativo

Proceso Node.js aparte (no es parte de la extensión) que la extensión
invoca por [Native Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)
para reconstruir streams **HLS (`.m3u8`) y DASH (`.mpd`) sin cifrar** en un
único archivo, usando `ffmpeg`. Esto es necesario porque `chrome.downloads`
solo puede guardar una respuesta HTTP tal cual — no sabe unir los
segmentos de un stream adaptativo.

**Fuera de alcance, a propósito:** streams con DRM (Widevine, PlayReady,
FairPlay). `ffmpeg` no puede descifrarlos, así que esos casos seguirán
fallando con un error claro en vez de intentar eludir la protección.

## Instalación

Requiere [Node.js](https://nodejs.org/) instalado.

```bash
cd native-host
npm install        # baja ffmpeg-static y ffprobe-static para tu plataforma
```

Luego registra el host, indicando el ID de la extensión (visible en
`chrome://extensions` con el modo desarrollador activado):

**Windows (PowerShell):**
```powershell
powershell -File native-host\install-windows.ps1 -ExtensionId <extension-id>
```

**Linux / macOS:**
```bash
./native-host/install-unix.sh <extension-id>
```

Después de instalar, recarga la extensión. Los videos HLS/DASH detectados
en el popup mostrarán un botón de descarga que pasa por este host.

## Cómo funciona

1. `background.js` (en la extensión) detecta peticiones de red a `.m3u8`/
   `.mpd` con `chrome.webRequest` — esa URL nunca aparece en el DOM cuando
   el sitio usa `hls.js`/`dash.js` con MediaSource, así que observar la
   red es la única forma honesta de encontrarla.
2. Al pulsar "Descargar" en uno de esos videos, la extensión abre una
   conexión Native Messaging (`chrome.runtime.connectNative`) y le envía
   `{ type: "download", url, filename }`.
3. `host.js` corre `ffprobe` para conocer la duración y luego `ffmpeg -i
   <manifiesto> -c copy <archivo>` (sin recodificar), reportando progreso
   en vivo y guardando el resultado en la carpeta `Downloads` del sistema.

## Desinstalar

Borra las claves de registro (Windows: `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.superviddownloader.host` y su equivalente en Edge) o los archivos `com.superviddownloader.host.json` copiados en `NativeMessagingHosts/` (Linux/macOS, ver rutas en `install-unix.sh`).
