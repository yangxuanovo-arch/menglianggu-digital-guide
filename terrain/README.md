# 山河作证 · 孟良崮三维战场

Independent static module. No framework, API key, runtime CDN, map service, webfont or backend. Open `web/terrain/index.html` through an HTTP server (not `file://`). Compiled assets are committed; no build is needed to serve it.

## Main app integration

Copy/cherry-pick this directory into `web/terrain/`, then add one line to the main app:

```html
<script src="terrain/adapter.js" defer></script>
```

The adapter registers `window.GuideShell.registerModule('terrain', open)` both immediately (if ready) and on `guide:shell-ready`. It opens a full-window native dialog containing the standalone module. It does not mutate narrator IDs, shell markup or styles. The module's back button and Escape close the dialog, unload WebGL, and restore opener focus. Messages are same-origin and source-checked. No changes to the main app, gh-pages, PR #1 or PR #2 are part of this branch.

If a shell adapter isn't desired, a normal link to `terrain/index.html` works too.

## Development

```sh
cd web/terrain
npm ci
npm run check
npm run build
```

Three.js 0.170.0 (MIT) is bundled locally. `terrain.js` is generated from `src/main.js` and `src/battle.js`; rebuild it after edits. No pre-commit hooks are configured in this module or the base repository. `node_modules` is ignored.

Serve `web/` using any static HTTP server; module URL is `/terrain/`. Example: `python -m http.server 8080 --directory web --bind 0.0.0.0`.

## What is real, and what is schematic

- Real: modern WGS84 / EGM96 terrain from Mapzen/Tilezen Skadi N35E118, an SRTM-derived region. Bilinearly resampled to 257×257, stored as signed little-endian metres. Bounds 118.07–118.30 E / 35.49–35.72 N; sampled heights 123–556 m. A coarse grid may miss a summit; these are not official summit measurements.
- Real: cited unit identities, directional actions, phase order, campaign dates. Sources appear beside each phase and each unit, and in the in-app source dialog. Source-linked data is in `src/battle.js`.
- Schematic: all troop coordinates, curves, marker sizes and animation intermediate positions. These are editorial teaching anchors, NOT georeferenced archival movement tracks. They must not be described as exact reconstruction. No strength ratio, casualty simulation or precise battle boundary is implied.
- Modern place-name references: 孟良崮 core area approximately 118.189 E / 35.579 N; 垛庄 approximately 118.158 E / 35.545 N. 坦埠 lies beyond the north edge and is labeled as an off-map direction, not plotted at a false town coordinate.
- Artistic: bronze terrain palette, contour styling, light, particles and cinematic camera. No satellite image or historic ground cover is claimed. Default vertical exaggeration 3.6× is labeled and can be switched to 1×.
- AI assistance: coding, visual design and historical text summarization; declared in-app. No AI-generated elevation or historical imagery is used.

## Reproduce elevation

```sh
python tools/build_terrain.py
```

Python standard library only. Downloads the 8.8 MB gzip source at build time, validates HGT layout and rejects voids in sampled data, and writes the 132,098-byte runtime asset plus provenance/hashes to `assets/`. Optional `--hgt /path/to/N35E118.hgt` avoids re-downloading. Visitors never download the original tile. Source attribution and processing details are visible in the application and in `assets/elevation.json`.

Attribution: **SRTM data courtesy of the U.S. Geological Survey. Terrain Tiles by Mapzen / Tilezen.** Source license/attribution: <https://github.com/tilezen/joerd/blob/master/docs/attribution.md>.

## Performance and access

About 132 KB elevation + 553 KB bundled JavaScript + CSS/HTML, uncompressed. Typical gzip transfer is substantially smaller; actual network time depends on hosting. Phones use 129×129 geometry (~32k triangles), capped 1.5 DPR, reduced antialiasing and a 30 fps render budget; desktops use ~131k triangles and 1.75 DPR cap. Rendering pauses in background tabs. Assets are same-origin and relative-path safe for static hosting. The context-loss / no-WebGL fallback keeps the timeline, historical text and source dialog accessible. No service worker or external runtime request.

Dragging/touch rotates; wheel/pinch zooms; buttons provide cinematic orbit, reset, overhead view and terrain-only view. Timeline supports phase buttons, range input and play/pause. Reduced-motion preference avoids automatic animation (none starts on load); playback and camera movement are explicit actions. Source dialog and shell wrapper are keyboard-operable native dialogs.
