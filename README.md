# Reproductor PPSX

Reproduce presentaciones de PowerPoint (.ppsx / .pptx) en el navegador, con audio al hacer clic en los íconos, botones de navegación y animaciones básicas. Listo para insertar en una web o LMS con un iframe.

## URL del reproductor

```
https://TU-USUARIO.github.io/reproductor-ppsx/?src=ENLACE_DEL_ARCHIVO
```

Con `?src=` el reproductor abre directo la presentación (botón ▶ Iniciar que desbloquea el audio), sin la página de subir archivos.

## Dónde puede estar el .ppsx

| Dónde | Qué enlace usar | ¿Necesita algo más? |
|---|---|---|
| **OneDrive** | Compartir → "Cualquier persona con el vínculo" → Copiar vínculo (o el código de Insertar) | No |
| **Este mismo GitHub** | `presentaciones/mi-curso.ppsx` | No |
| **Dropbox** | Enlace compartido del archivo | No |
| **Tu servidor** | URL directa al .ppsx | El servidor debe permitir CORS (`Access-Control-Allow-Origin`) |
| **Google Drive** | Compartir → "Cualquier persona con el enlace" | El intermediario de Cloudflare (abajo) |

Si el archivo no se puede descargar, el reproductor muestra el visor de Microsoft como respaldo (sin audio en los botones).

## Código para insertar (1280 × 720)

El alto incluye la barra de controles de 48 px. Pon el enlace en `src` codificado (el generador lo hace por ti).

```html
<iframe src="https://TU-USUARIO.github.io/reproductor-ppsx/?src=ENLACE_CODIFICADO&titulo=Mi%20curso"
  width="1280" height="768"
  style="width:100%;max-width:1280px;height:auto;aspect-ratio:1280/768;border:0;display:block"
  allow="autoplay; fullscreen; encrypted-media" allowfullscreen title="Mi curso"></iframe>
```

## Google Drive: intermediario gratuito (una sola vez, ~10 min)

Google no deja que otra página lea sus archivos, así que un pequeño programa en Cloudflare lo descarga y se lo pasa al reproductor.

1. Crea una cuenta gratis en <https://dash.cloudflare.com> (solo correo, sin tarjeta).
2. Ve a **Workers & Pages → Create → Start with Hello World** (Create Worker), ponle de nombre `ppsx-proxy` y pulsa **Deploy**.
3. Pulsa **Edit code**, borra todo, pega el contenido de `proxy/worker.js` y pulsa **Deploy**.
4. Copia la dirección del Worker (ej. `https://ppsx-proxy.TU-USUARIO.workers.dev`). Al abrirla debe decir "ppsx-proxy funcionando".
5. En `index.html` escribe esa dirección en `const PROXY_URL = '';` (o agrega `&proxy=DIRECCIÓN` al enlace del reproductor).

En `proxy/worker.js`, `ALLOWED_ORIGINS` indica qué sitios pueden usar el intermediario (por defecto `https://dnl666.github.io`). El plan gratuito de Cloudflare permite 100.000 descargas al día.

## Parámetros

| Parámetro | Ejemplo | Qué hace |
|---|---|---|
| `src` | enlace de OneDrive, Drive, Dropbox o `presentaciones/mi-curso.ppsx` | Archivo a reproducir |
| `titulo` | `Mi%20curso` | Texto de la pantalla de inicio |
| `modo` | `auto` · `navegador` · `office` | Automático (con respaldo), solo motor propio, o solo visor de Microsoft/Google |
| `inicio` | `directo` | Quita el botón "Iniciar" (el navegador puede silenciar el audio hasta el primer clic) |
| `diapositiva` | `3` | Diapositiva inicial |
| `proxy` | `https://ppsx-proxy.TU-USUARIO.workers.dev` | Intermediario para Google Drive |
| `ui` | `1` | Muestra el botón para cambiar de presentación |
| `color` | `4C8DFF` | Color de los controles |

## Notas

- Con GitHub gratuito, el sitio de Pages es **público**: cualquiera con el enlace puede ver las presentaciones que subas a `presentaciones/`.
- La descarga desde OneDrive usa el mismo acceso público que el visor web de OneDrive; si Microsoft lo cambia, el reproductor pasa al visor de Microsoft.
- Google Drive puede limitar las descargas de un archivo muy visitado. Para cursos con muchos estudiantes, GitHub u OneDrive son más estables.
- El motor de dibujo se carga desde jsDelivr (paquete npm `pptx-preview`).
