# 🎮 GameVault – Gestor de Juegos Responsivo con Bootstrap

**Trabajo Práctico 13 · Laboratorio de Programación · 6° G**
IPET N° 249 "Nicolás Copérnico" · Córdoba, Argentina

| Dato | Detalle |
|---|---|
| Alumno | jonas Sarria |
| Modalidad | Individual |

---

## 1. Introducción

**GameVault** es la interfaz web de un gestor de juegos o biblioteca digital, inspirada en plataformas como Steam, Epic Games Store y la Xbox App. La temática elegida es **juegos retro e indies**.

El objetivo del trabajo fue aplicar **Bootstrap 5** para construir una interfaz moderna, ordenada y adaptable a PC, tablet y celular, dejando que el framework controle toda la estructura visual (grilla, componentes y utilidades).

## 2. Tecnologías utilizadas

- **HTML5**: estructura semántica (`nav`, `header`, `section`, `footer`, `table`).
- **Bootstrap 5** (última versión 5.x, por CDN): grilla, componentes y clases utilitarias.
- **CSS propio** (mínimo): solo detalles visuales (degradado de fondo, tipografía retro, efecto hover).
- **JavaScript**: lógica de filtros, favoritos, instalación simulada y modales.
- **anime.js v4**: animaciones de entrada y contadores (opcional; la página funciona igual sin ella).
- **Google Fonts** (*Press Start 2P*): solo para los títulos.
- **GitHub Pages**: despliegue público.

## 3. Cumplimiento de los requisitos del TP

| # | Requisito | Cómo se cumplió |
|---|---|---|
| 1 | HTML5 + Bootstrap por CDN en el `<head>` | Se vincula `bootstrap@5` (CSS) en el `<head>` y el bundle JS al final del `<body>`. |
| 2 | Modo oscuro global | `<html lang="es" data-bs-theme="dark">`. |
| 3 | Contenido dentro de `container` | Todo el contenido principal está dentro de un `<div class="container">`. |
| 4 | Tabla HTML estructurada | Tabla "Mi biblioteca" con `<table>`, `<thead>`, `<tbody>`, `<tr>`, `<th>` y `<td>`. Columnas: ID, Nombre del Juego, Género, Año, Precio y Estado. |
| 5 | Texto y espaciado con utilidades | `text-center`, `text-warning`, `text-primary`, `text-secondary`, `py-5`, `py-4`, `p-4`, `mb-4`, `g-3`, etc. |
| 6 | Código ordenado y comentado | Secciones separadas con comentarios (`<!-- Fin de la tabla -->`, `<!-- Fin div de la tabla -->`, etc.). |
| 7 | Despliegue en GitHub Pages | Ver enlace al inicio de este documento. |

## 4. Diseño responsivo

La estructura se apoya en el **sistema de grilla de Bootstrap**:

| Pantalla | Catálogo de juegos | Estadísticas |
|---|---|---|
| Celular (< 576 px) | 1 columna (`row-cols-1`) | 2 por fila (`col-6`) |
| Tablet (≥ 576 px) | 2 columnas (`row-cols-sm-2`) | 2 por fila |
| PC (≥ 992 px) | 4 columnas (`row-cols-lg-4`) | 4 por fila (`col-lg-3`) |

Otras decisiones responsivas:

- La **barra de navegación** colapsa en un menú hamburguesa en pantallas chicas (`navbar-expand-lg`).
- La **tabla** está envuelta en `table-responsive`, por lo que se desliza horizontalmente en el celular.
- El **modal para jugar** pasa a pantalla completa en pantallas chicas (`modal-fullscreen-md-down`) y muestra controles táctiles solo en esos dispositivos.
- El título usa `clamp()` para ajustar su tamaño a cualquier ancho.

## 5. Funcionalidades

Además de los requisitos obligatorios, se agregaron mejoras:

- **Catálogo con tarjetas** generadas automáticamente a partir de los datos de la tabla (la tabla es la única fuente de datos).
- **Buscador en vivo**, que ignora tildes y mayúsculas.
- **Filtros** por estado (Todos / Instalados / Disponibles / Próximamente) y por género.
- **Ordenamiento** por nombre, precio o año.
- **Favoritos** con persistencia en `localStorage`.
- **Estadísticas en vivo**: total de juegos, instalados, favoritos y valor de la biblioteca.
- **Modal de detalle** con descripción, puntaje y acción según el estado del juego (jugar, comprar e instalar, avisarme).
- **Instalación simulada** con barra de progreso y aviso (*toast*).
- **Juegos jugables** dentro de la página: *Asteroides* (TP10) y *Rush Track* (TP11), cargados en un `iframe`.
- **Accesibilidad**: etiquetas `aria`, navegación con teclado, `prefers-reduced-motion` respetado.

## 6. Estructura del proyecto

```
/
├── index.html          # Página principal (HTML + CSS + JS)
├── README.md           # Este informe
└── juegos/
    ├── asteroides/     # Juego del TP10
    │   └── index.html
    └── rush-track/     # Juego del TP11
        └── index.html
```

> Las carpetas `juegos/` deben estar en el repositorio para que los botones **▶ Jugar** funcionen en GitHub Pages.

## 7. Cómo ejecutarlo

**Online:** abrir el enlace de GitHub Pages indicado al inicio.

**Local:**

1. Clonar o descargar el repositorio.
2. Abrir `index.html` en el navegador (se necesita conexión a internet para cargar Bootstrap, anime.js y la tipografía desde sus CDN).

## 8. Verificación realizada

- Se probó la página redimensionando la ventana del navegador y con el modo dispositivo de las herramientas de desarrollo (celular, tablet y PC).
- Se verificó que el menú colapse, que la grilla cambie de columnas y que la tabla se desplace sin romper el diseño.
- Se comprobó que los filtros, favoritos e instalación funcionen y se mantengan al recargar la página.`

---

## 9. Uso de Inteligencia Artificial – Ficha de Transparencia
adjuntado en un archivo word:
---
