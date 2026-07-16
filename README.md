# ⬇️ Super Video Downloader

> Super Video Downloader is a modern browser extension built with Manifest V3
> that detects downloadable media on supported websites and provides a
> simple interface to save available video files.

Extensión para **Google Chrome, Edge, Brave y Opera** (Manifest V3) que
detecta los videos con enlace directo disponibles en la página actual y
permite descargarlos con un clic, cuando el propio sitio lo permite.

**Esta extensión no elude DRM, cifrado ni protecciones de streaming.** Solo
trabaja con recursos que el navegador ya puede reproducir/descargar de
forma nativa (`<video>`/`<source>` con URL `http(s)`/`data:` directa). Las
fuentes `blob:`/`mediasource:` típicas del streaming adaptativo (YouTube,
Netflix, y la mayoría de plataformas "premium") se muestran en la lista
para que sepas que existen, pero se marcan como **no descargables** a
propósito.

- **Autor:** [alvarosiles](https://github.com/alvarosiles)
- **Contacto:** alvarosiles.developer@gmail.com
- **Repositorio:** [github.com/alvarosiles/super-video-downloader](https://github.com/alvarosiles/super-video-downloader)

---

## Índice

1. [Descripción](#descripción)
2. [Características](#características)
3. [Capturas de pantalla](#capturas-de-pantalla)
4. [Instalación](#instalación)
5. [Modo desarrollador](#modo-desarrollador)
6. [Compilación](#compilación)
7. [Permisos utilizados](#permisos-utilizados)
8. [Estructura del proyecto](#estructura-del-proyecto)
9. [Publicación en la Chrome Web Store](#publicación-en-la-chrome-web-store)
10. [Licencia](#licencia)
11. [Preguntas frecuentes](#preguntas-frecuentes)

---

## Descripción

Super Video Downloader escanea la pestaña activa en busca de elementos
`<video>` y `<source>`, calcula metadatos (formato, resolución, duración,
tamaño) y te deja descargarlos con la Chrome Downloads API — sin scripts
externos, sin servidores intermediarios, sin dependencias.

## Características

- Detecta automáticamente `<video>`/`<source>`, incluidos los que aparecen
  después de cargar la página (sitios de una sola página).
- Si el sitio ofrece varias calidades — como `<source>` adicionales dentro
  del reproductor o enlaces de descarga tipo "480p / 720p / 1080p" fuera de
  él — se listan todas por separado, no solo la que está reproduciéndose.
- Cada video detectado muestra: nombre, formato, resolución o calidad,
  tamaño y duración (los que estén disponibles).
- Descarga con un clic (`chrome.downloads`) o copia la URL directa.
- Badge del icono con el número de videos detectados en la pestaña.
- Página de **Opciones**: subcarpeta de descarga, nombre automático (o
  diálogo "Guardar como"), notificaciones al completar, tema claro/oscuro,
  idioma (es/en), actualización automática de la lista.
- **Historial** de descargas (fecha, archivo, tamaño, sitio), con borrado
  individual o total.
- Tema oscuro estilo Material Design (con variante clara), sin
  dependencias externas, sin llamadas de red propias de la extensión.
- No solicita permisos de host más allá de los estrictamente necesarios
  para detectar medios en la página que ya estás visitando.

## Capturas de pantalla

_(coloca aquí tus capturas antes de publicar)_

- `docs/screenshot-popup.png` — Popup con videos detectados.
- `docs/screenshot-options.png` — Página de configuración.
- `docs/screenshot-history.png` — Historial de descargas.

---

## Instalación

### Desde la Chrome Web Store

_(pendiente de publicación — ver [Publicación en la Chrome Web Store](#publicación-en-la-chrome-web-store))_

### Manual (modo desarrollador)

Ver la siguiente sección.

## Modo desarrollador

### Opción A — manual

1. Descarga o clona este repositorio.
2. Abre `chrome://extensions` (`edge://extensions`).
3. Activa **Modo desarrollador**.
4. **Cargar descomprimida** → selecciona la carpeta del proyecto (la que
   contiene `manifest.json`).

### Opción B — con las herramientas de `tools/`

```bash
./tools/1-install.sh        # Abre chrome://extensions en TU Chrome real
./tools/2-test-extension.sh # Abre Chrome con la extensión YA cargada,
                             # en un perfil de pruebas aislado, más un
                             # video de enlace directo listo para probar.
./tools/3-build.sh          # Genera dist/super-video-downloader-v<version>.zip
```

`tools/` son scripts de desarrollo (no forman parte de la extensión en sí,
por eso viven fuera de `scripts/` — esa carpeta es del propio runtime de
la extensión, ver [Estructura del proyecto](#estructura-del-proyecto)).

## Compilación

```bash
./tools/3-build.sh
```

Valida `manifest.json`, revisa la sintaxis de todos los `.js`, confirma
que existan los 4 iconos declarados, y genera
`dist/super-video-downloader-v1.0.0.zip` con únicamente los archivos que
la extensión necesita en tiempo de ejecución.

---

## Permisos utilizados

| Permiso | Para qué se usa |
|---|---|
| `storage` | Guardar la configuración y el historial de descargas (`chrome.storage.local`). |
| `activeTab` | Identificar la pestaña activa al abrir el popup. |
| `downloads` | Iniciar descargas y saber cuándo terminan (`chrome.downloads`). |
| `notifications` | Avisar cuando una descarga se completa (si el usuario lo activó en Opciones). |
| `host_permissions: <all_urls>` | Inyectar el detector en cualquier sitio — no hay una lista fija de páginas soportadas. |

No se usa `webRequest`, no se intercepta tráfico de red del usuario, y no
se envía ningún dato a servidores externos: todo el procesamiento ocurre
localmente en tu navegador.

---

## Estructura del proyecto

```
super-video-downloader/
├── manifest.json
├── background.js          # Service worker: badge, historial, notificaciones
├── content.js              # Orquesta la detección en la pestaña activa
├── scripts/                # Módulos compartidos (scripts clásicos, no ES modules)
│   ├── utils.js             # Formato de bytes/duración, MIME, i18n
│   ├── storage.js           # chrome.storage.local: settings + historial
│   ├── detector.js          # Escaneo del DOM en busca de <video>/<source>
│   └── downloader.js        # Envoltorio de chrome.downloads.download()
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── options/
│   ├── options.html
│   ├── options.css
│   └── options.js
├── assets/
│   └── icons/
│       ├── icon16.png
│       ├── icon32.png
│       ├── icon48.png
│       └── icon128.png
├── gen_icons.py            # Regenera los iconos
├── tools/                  # Scripts de DESARROLLO (no van en el .zip final)
│   ├── 1-install.sh
│   ├── 2-test-extension.sh
│   └── 3-build.sh
├── README.md
├── PUBLISHING.md
├── CHANGELOG.md
└── LICENSE
```

`scripts/` se carga como scripts clásicos (no módulos ES) en los cuatro
contextos de la extensión — content script, popup, options y el service
worker (vía `importScripts`) — para compartir la misma lógica sin
duplicar código y sin necesitar un bundler.

---

## Publicación en la Chrome Web Store

Guía completa en **[PUBLISHING.md](PUBLISHING.md)**. Resumen rápido:

```bash
./tools/3-build.sh
# → dist/super-video-downloader-v1.0.0.zip
```

Sube ese `.zip` en el
[Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).

---

## Licencia

MIT — ver [LICENSE](LICENSE).

## Preguntas frecuentes

**¿Puede descargar videos de YouTube/Netflix/Twitch?**
No. Esos sitios sirven el video en fragmentos cifrados o segmentados vía
streaming adaptativo (MSE/DRM), no como un archivo descargable directo.
Super Video Downloader los detecta (los verás en la lista) pero los marca
como "no disponible para descarga directa" — reconstruir esos fragmentos
sería eludir el mecanismo de streaming del sitio, algo que este proyecto
evita explícitamente por diseño y por política de la Chrome Web Store.

**¿Por qué no puedo elegir una carpeta de descarga cualquiera del sistema?**
Las extensiones de Chrome no tienen acceso al sistema de archivos fuera de
la carpeta de Descargas del navegador, por seguridad. Puedes definir una
**subcarpeta** dentro de Descargas en Opciones, o desactivar "Nombre
automático" para que el navegador te pregunte dónde guardar cada archivo.

**¿El tamaño del archivo siempre se muestra?**
Solo si el servidor responde a una petición `HEAD` con la cabecera
`Content-Length` (y sin bloquear la petición por CORS). Si no, se muestra
como "Desconocido" — igual puedes descargarlo con normalidad.

**¿La extensión envía mis datos a algún servidor?**
No. Todo el procesamiento (detección, metadatos, descarga) ocurre
localmente en tu navegador. No hay analítica ni telemetría.

**¿Funciona en Edge/Brave/Opera?**
Sí, son navegadores basados en Chromium y soportan Manifest V3 de la misma
forma.
