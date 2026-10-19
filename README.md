# 🖼️ FrameGen 3D — HueForge & Photo Frame Generator

An interactive web app to design, preview in 3D, and export printable STL frames for [HueForge](https://www.hueforge.com/) prints and photos.


**[▶ Live Demo](https://ventus34.github.io/hueforge-frame-generator/)**

![FrameGen 3D — app screenshot](screenshots/1.png)

---

## 🌟 Features

- **Interactive 3D Preview** — Real-time Three.js rendering with PLA color presets, custom hex picker, OrbitControls, and a virtual print-bed grid.
- **Blind Mounting Recesses** — Optional cylindrical recesses open from the back of the frame; their diameter is limited by the border width.
- **Rounded Outer Corners** — Adjustable corner radius for unsplit rectangular frames.
- **Hexagonal Frames** — Full honeycomb support for tiling prints on walls.
- **2D Mounting Planner** — Drag-and-drop canvas for arranging Command strips (S / M / L) on the frame's back.
- **STL Export** — Binary STL export for frames and split parts.
- **Project Files** — Changes are saved in browser storage; import or export a versioned JSON project file.
- **Split-Part ZIP** — Download all part STLs, assembly notes, a manifest, and the Bowtie key when needed.
- **Printer Fit Checks** — Choose a bed preset or enter custom dimensions; checks allow a 90° rotation of each part.
- **Live Stats** — Bounding dimensions, volume (cm³), and estimated mass for a solid PLA model.

The mounting recesses are blind cylinders, not keyhole slots: they do not have a wider chamber for a screw head and a narrow entry channel. The PLA mass estimate assumes a fully solid model and does not account for infill, walls, supports, or slicer settings. Printer fit checks use each part's XY bounding rectangle and do not include brim, skirt, clips, or slicer margins. Split frames disable corner rounding.

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| UI | React 19, TypeScript |
| Build | Vite 8 |
| Styling | Vanilla CSS — custom properties, glassmorphism, CSS Grid |
| 3D | Three.js (vanilla WebGL wrapper) |
| Geometry & Export | Custom unindexed B-Rep buffer geometry compiler + binary STL writer |

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** ≥ 24
- **npm** ≥ 10

### 1. Clone & install

```bash
git clone https://github.com/ventus34/hueforge-frame-generator.git
cd hueforge-frame-generator
npm install
```

### 2. Run dev server

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### 3. Build for production

```bash
npm run build
```

The optimized bundle lands in `dist/`. GitHub Actions checks lint, tests, and the production build on pull requests. Pushes to `main` and manual workflow runs also deploy the result to GitHub Pages. Set the repository's Pages source to **GitHub Actions** to enable deployment.

### Quality checks

```bash
npm run lint
npm test
npm run build
```

The test suite uses Node.js 24's native TypeScript support to import geometry modules directly.

---

## 📐 Parameters Guide

| Parameter | Description |
|-----------|-------------|
| **Picture size** | Dimensions of your HueForge print or photo |
| **Clearance** | Gap around the print for comfortable fit (default 0.2 mm) |
| **Border thickness** | Width of the outer frame border |
| **Frame height** | Total Z-height of the frame |
| **Pocket depth** | Recess depth in the back where the print sits |
| **Support shelf** | Inner lip that holds the print and prevents it from falling forward |
| **Corner radius** | Outer corner rounding (rectangular frames only) |

Project settings are saved in this browser automatically. Use the Project controls to export a JSON backup or load a project file on another device. When frame splitting is enabled, the main download creates a ZIP with STL parts, assembly notes, a fit manifest, and a Bowtie key if the selected joint needs one.

---

## 🇵🇱 O Projekcie

Interaktywna aplikacja webowa służąca do projektowania i generowania gotowych plików STL z ramkami do wydruków HueForge oraz tradycyjnych zdjęć.

**Możliwości:**
- Podgląd 3D modelu w różnych kolorach filamentu (wbudowany próbnik + dowolny kolor HEX) na wirtualnym stole roboczym
- Planowanie rozmieszczenia rzepów montażowych (Command strips) w interaktywnym planerze 2D
- Dodawanie ślepych, cylindrycznych zagłębień montażowych od tyłu ramki; to nie są otwory typu keyhole
- Automatyczny zapis w przeglądarce oraz import i eksport projektu JSON
- Eksport podzielonej ramki jako ZIP z plikami STL, opisem montażu i manifestem dopasowania części do stołu
- Profile wymiarów stołu drukarki i kontrola dopasowania części z obrotem o 90°
- Generowanie i pobieranie pliku STL gotowego do druku 3D
- Szacowana masa zakłada pełny model z PLA — nie uwzględnia wypełnienia ani ustawień slicera

---

## 📄 License

MIT © [ventus34](https://github.com/ventus34)

---

<sub>Built with assistance from Antigravity AI (Google DeepMind).</sub>
