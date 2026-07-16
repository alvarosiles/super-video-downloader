# Cómo publicar Super Video Downloader en la Chrome Web Store

Guía paso a paso para subir la extensión al [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).

## 0. Generar el paquete

```bash
./tools/3-build.sh
# → dist/super-video-downloader-v1.0.0.zip
```

Vuelve a correrlo cada vez que cambies el código, antes de subir una nueva
versión.

## 1. Subir el paquete

Clic en **"+ Nuevo elemento"** → arrastra o selecciona
`dist/super-video-downloader-v1.0.0.zip`.

## 2. Completar la ficha del Store

| Campo | Qué poner |
|---|---|
| Nombre | Super Video Downloader |
| Descripción resumida (132 caracteres) | "Detecta videos de enlace directo en la página actual y te deja descargarlos con un clic." |
| Descripción detallada | Puedes usar el bloque de "Características" del [README.md](README.md) |
| Categoría | Herramientas (Tools) |
| Idioma | Español (o English, la extensión soporta ambos) |
| Capturas de pantalla (mín. 1, recomendado 3-5, 1280×800 o 640×400) | Popup con videos detectados, página de Opciones |
| Icono de la tienda (128×128) | `assets/icons/icon128.png` |

## 3. Justificar permisos

La pestaña **"Privacidad"** del listing va a exigir justificar cada
permiso. Como referencia:

- **`host_permissions: <all_urls>`**: la extensión necesita inyectarse en
  cualquier sitio para detectar los elementos `<video>`/`<source>` de esa
  página, sin importar el dominio (no hay una lista fija de sitios
  soportados).
- **`downloads`**: es el propósito central de la extensión — iniciar la
  descarga del video detectado y saber cuándo termina para registrar el
  historial.
- **`notifications`**: se usa únicamente para avisar al usuario cuando una
  descarga se completa, y solo si lo activó explícitamente en Opciones.
- **`storage`**: guardar la configuración del usuario y el historial de
  descargas localmente (nunca se envía a un servidor).
- **Declaración de "Single Purpose"**: "detectar videos de enlace directo
  en la página activa y permitir descargarlos".
- **Política de privacidad**: aunque no se recolecta ni transmite ningún
  dato, Google casi siempre la exige por el alcance de `host_permissions`.
  Una página simple aclarando que todo el procesamiento es local es
  suficiente.
- Menciona explícitamente que la extensión **no elude DRM ni protecciones
  de streaming** — los recursos `blob:`/`mediasource:` se detectan pero se
  marcan como no descargables a propósito. Esto ayuda a la revisión de
  Google, que es más estricta con extensiones de "descarga de video".

## 4. Cuenta de desarrollador

- Cuota única de registro (~$5 USD), si es tu primera publicación.
- **Verificación en 2 pasos (2FA)** obligatoria en la cuenta de Google que
  publica. Si ves el error *"Ocurrió un problema al subir el archivo...
  es necesario que habilites la verificación en 2 pasos"*, actívala en
  [myaccount.google.com/security](https://myaccount.google.com/security)
  y reintenta. Es un paso único por cuenta.

## 5. Enviar a revisión

Botón **"Enviar para revisión"**. Las extensiones de descarga de video
suelen recibir un escrutinio manual más detallado — deja claro en la
descripción que solo se descargan recursos que el propio navegador ya
podía reproducir, sin eludir ninguna protección.

## Actualizar una versión ya publicada

1. Sube la versión en `manifest.json` (ej. `1.0.0` → `1.0.1`) y en
   `CHANGELOG.md`.
2. `./tools/3-build.sh` de nuevo.
3. En el Dashboard, entra al elemento publicado → **"Paquete"** → sube el
   nuevo `.zip` → enviar a revisión otra vez.
