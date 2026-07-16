toma en cuenta que  la extnsion
deberia ser 
https://github.com/alvarosiles/super-video-downloader
nombre d ela extension
super-video-downloader

Super Video Downloader is a modern browser extension built with Manifest V3 that detects downloadable media on supported websites and provides a simple interface to save available video files.

y mi github es https://github.com/alvarosiles
mi corrreo es alvarosiles.developer@gmai.com

Actúa como un desarrollador Senior especializado en Google Chrome Extensions (Manifest V3), JavaScript, HTML, CSS y APIs modernas del navegador.

Quiero crear una extensión profesional llamada **Super Video Downloader**.

# Objetivo

Desarrollar una extensión moderna para Google Chrome que detecte archivos de video descargables disponibles en la página actual y permita al usuario descargarlos cuando el sitio web lo permita.

La extensión debe funcionar únicamente con recursos multimedia accesibles y no debe intentar eludir DRM, cifrado ni otras protecciones de plataformas de streaming.

Debe cumplir completamente con las políticas de Chrome Web Store.

---

# Tecnologías

Utilizar:

* Manifest V3
* JavaScript ES6+
* HTML5
* CSS3
* Chrome Extension API
* Chrome Downloads API
* Chrome Storage API
* Chrome Tabs API

No utilizar frameworks.

No utilizar librerías externas.

---

# Diseño

Crear una interfaz moderna inspirada en Material Design.

Tema oscuro.

Colores:

Fondo:
#202124

Tarjetas:
#2D2F33

Botones:
#4285F4

Texto:
#FFFFFF

Bordes redondeados.

Sombras suaves.

Animaciones fluidas.

Responsive.

---

# Popup

El popup debe mostrar:

Logo

Título:

Super Video Downloader

Sitio actual

Número de videos detectados

Lista de videos encontrados

Cada video debe mostrar:

* nombre
* formato
* resolución (si está disponible)
* tamaño (si está disponible)
* duración (si está disponible)

Botones:

Download

Copy URL

Refresh

Settings

---

# Funciones

La extensión debe:

Detectar automáticamente elementos:

* video
* source

Obtener:

* URL
* Tipo MIME
* Tamaño
* Nombre del archivo
* Resolución
* Duración

Mostrar los resultados en una lista organizada.

Permitir descargar únicamente recursos que el navegador pueda descargar mediante la Chrome Downloads API.

---

# Configuración

Agregar una página de configuración donde el usuario pueda elegir:

✔ Carpeta de descarga

✔ Nombre automático

✔ Mostrar notificaciones

✔ Tema claro/oscuro

✔ Idioma

✔ Actualización automática de la lista

---

# Historial

Guardar:

* Fecha
* Archivo
* Tamaño
* Sitio web

Permitir borrar el historial.

---

# Arquitectura

Organizar el proyecto así:

super-video-downloader/

manifest.json

background.js

content.js

popup/

popup.html

popup.css

popup.js

options/

options.html

options.css

options.js

scripts/

detector.js

downloader.js

storage.js

utils.js

assets/

icons/

images/

README.md

LICENSE

CHANGELOG.md

.gitignore

---

# Código

El código debe ser:

Modular

Limpio

Profesional

Escalable

Muy comentado

Sin código repetido

Seguir buenas prácticas ES6+

---

# Rendimiento

Optimizar memoria.

Optimizar CPU.

No realizar consultas innecesarias.

Utilizar eventos cuando sea posible.

---

# Compatibilidad

Google Chrome

Microsoft Edge

Brave

Opera

---

# Seguridad

No solicitar permisos innecesarios.

Solicitar únicamente los permisos mínimos requeridos.

Cumplir con las políticas de Chrome Web Store.

No recopilar datos personales.

No enviar información a servidores externos.

---

# README

Crear un README profesional con:

Descripción

Características

Capturas de pantalla (marcadores)

Instalación

Modo desarrollador

Compilación

Permisos utilizados

Estructura del proyecto

Publicación en Chrome Web Store

Licencia

Preguntas frecuentes

---

# Calidad

Quiero código listo para producción.

Arquitectura profesional.

UI moderna.

Componentes reutilizables.

Código optimizado.

---

# Entrega

Genera el proyecto completo archivo por archivo.

No resumas.

No omitas archivos.

Explica cada archivo antes de mostrar su código.

Espera mi confirmación antes de continuar con el siguiente archivo.
