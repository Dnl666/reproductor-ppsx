# Reproductor PPSX

Reproduce presentaciones de PowerPoint (.ppsx / .pptx) en el navegador, con audio al hacer clic en los íconos, botones de navegación y animaciones básicas. Listo para insertar en una web o LMS.

## Publicarlo con GitHub Pages

1. Sube el contenido de esta carpeta a un repositorio (por ejemplo `reproductor-ppsx`).
2. En el repositorio: **Settings → Pages → Build and deployment → Deploy from a branch**, rama `main`, carpeta `/ (root)` → **Save**.
3. En uno o dos minutos queda en `https://TU-USUARIO.github.io/reproductor-ppsx/`.

## Usarlo

- Sube tus archivos a la carpeta `presentaciones/`.
- Abre: `https://TU-USUARIO.github.io/reproductor-ppsx/?src=presentaciones/mi-curso.ppsx`

Código para insertar (diapositiva 1280 × 720 + barra de controles de 48 px):

```html
<iframe src="https://TU-USUARIO.github.io/reproductor-ppsx/?src=presentaciones/mi-curso.ppsx&titulo=Mi%20curso"
  width="1280" height="768"
  style="width:100%;max-width:1280px;height:auto;aspect-ratio:1280/768;border:0;display:block"
  allow="autoplay; fullscreen; encrypted-media" allowfullscreen title="Mi curso"></iframe>
```

## Parámetros

| Parámetro | Ejemplo | Qué hace |
|---|---|---|
| `src` | `presentaciones/mi-curso.ppsx` | Archivo a reproducir (ruta relativa o URL completa) |
| `titulo` | `Mi%20curso` | Texto de la pantalla de inicio |
| `modo` | `navegador` · `auto` · `office` | Motor propio, automático o visor de Microsoft |
| `inicio` | `directo` | Quita el botón "Iniciar" (el navegador puede silenciar el audio hasta el primer clic) |
| `diapositiva` | `3` | Diapositiva inicial |
| `ui` | `1` | Muestra el botón para cambiar de presentación |
| `color` | `4C8DFF` | Color de los controles |

## Notas

- En la cuenta gratuita de GitHub, el sitio de Pages es **público**: cualquiera con el enlace puede ver y descargar las presentaciones.
- Si la presentación está en otro dominio, ese servidor debe permitir CORS (`Access-Control-Allow-Origin`).
- El motor de dibujo se carga desde jsDelivr (paquete npm `pptx-preview`).
