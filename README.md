# Byculla Zoo Navigator

An open-source visitor map and navigation application for **Veermata Jijabai Bhosale Udyan (Byculla Zoo), Mumbai, India**.

The project combines an interactive geographical map, attraction discovery, administration tools for maintaining zoo map data, and walking navigation that is available only when paths and attraction entrances have been explicitly verified.

> **Navigation safety:** Never present a route as available unless it uses only administrator-verified visitor-accessible paths and ends at an explicitly verified attraction entrance.

## Features

### Visitor experience
- Interactive map with pan and zoom.
- Attraction discovery, category filters, destination search, and details.
- Closed-attraction handling.
- Responsive mobile layout and navigation panel.
- Browser geolocation with permission, timeout, unavailable-position, and accuracy states.
- Walking routes over the verified visitor-accessible network.
- Bounded GPS-to-network snapping with safety checks.
- Route distance, progress, next-direction guidance, off-route handling, and arrival detection.
- Cached attraction details and bundled path geometry for limited offline resilience.

### Administration
- Map editor for points, lines, and polygons.
- Attraction metadata and OSM geometry linking.
- Shared geometry support.
- Separate attraction entrance placement and verification.
- Walking-path access review: visitor-accessible, restricted, or needs verification.
- Import/export for editable records.

## Technology

The application uses React, TypeScript, Vite, Tailwind CSS, MapLibre GL JS, OpenStreetMap-derived data, and OpenFreeMap basemap styles. Check `package.json` for exact dependency versions and scripts.

## Getting started

Requirements: a recent Node.js version, npm, and a modern browser.

```bash
git clone <REPOSITORY_URL>
cd <REPOSITORY_DIRECTORY>
npm install
npm run dev
```

Open the local URL printed by Vite.

Run tests with:

```bash
npm test
```

Use `npm run` to inspect the repository's available type-check and lint scripts, then run those before submitting changes. Browser geolocation generally requires HTTPS or `localhost` and user permission.

## Data architecture and safety

Keep these data concerns separate:

| Data | Responsibility |
|---|---|
| OSM source geometry | Original geographic paths and mapped features |
| Attraction records | Attraction metadata, availability, and geometry references |
| Path-access records | Admin-reviewed access status and notes for OSM paths |
| Entrance records | Explicitly placed and verified visitor entrance coordinates |
| Route graph | Derived from visitor-accessible path geometry |

Important rules:

1. Do not silently modify original OSM geometry when changing attraction or path metadata.
2. Reference source features by stable IDs instead of copying their coordinates into unrelated records.
3. Represent shared geometry once and link multiple attraction records to it.
4. An attraction polygon is not an entrance.
5. A path is not visitor-accessible until an administrator explicitly verifies it.
6. Never invent GPS coordinates, entrances, accessible paths, or route availability.
7. Treat browser storage as local application state, not a shared multi-user database.

## Contributing

Contributions are welcome. For substantial changes, open an issue first to discuss the proposed approach.

1. Fork the repository.
2. Create a focused branch.
3. Install dependencies and run the application.
4. Read [AGENTS.md](AGENTS.md) before changing code.
5. Make a focused change and add/update tests.
6. Run tests, type-checking, and linting using the scripts in `package.json`.
7. Check visitor and admin modes where relevant.
8. Open a pull request describing the change, tests, and limitations.

### Contribution guidelines

- Preserve attraction IDs, OSM IDs, and geometry relationships.
- Do not modify source map datasets as a side effect of editing metadata.
- Do not infer visitor access from OSM tags or path appearance.
- Do not derive entrances from polygon centres, corners, or nearest-path guesses.
- Keep visitor behavior separate from admin editing.
- Keep GPS snapping bounded and prevent crossing restricted or unverified paths.
- Handle missing GPS, poor accuracy, disconnected paths, and unavailable destinations explicitly.
- Avoid unnecessary dependencies.
- Do not commit real location traces, personal data, secrets, or local environment files.

### Bug reports

Include expected and actual behavior, reproduction steps, browser/device details, whether the issue occurs in visitor or admin mode, and relevant console output with secrets and personal information removed. For map issues, include feature IDs when possible. Do not publish private location traces.

### Map-data contributions

Map-data changes can affect visitor safety. Identify the source, affected feature IDs, and whether the change concerns source geometry, attraction metadata, path access, or an entrance. Do not present an unverified assumption as a confirmed visitor route.

## Attribution and licensing

This project uses OpenStreetMap-derived data. OpenStreetMap data is available under the **Open Database License (ODbL)**. Include required attribution in the application and redistributed data:

**© OpenStreetMap contributors**

- https://www.openstreetmap.org/copyright
- https://opendatacommons.org/licenses/odbl/

The application may use OpenFreeMap styles/tiles. Review its current terms and attribution requirements before deployment: https://openfreemap.org/

Check individual licenses for other datasets, icons, images, fonts, and third-party assets.

### Project license

Choose a project license and add the corresponding `LICENSE` file before publishing or accepting external contributions. Do not claim a license (such as MIT) until that file exists.

## Project status

The project includes visitor mapping, attraction discovery, administration tools, path-access verification, entrance management, route calculation, and live navigation features. Actual navigation availability depends on the current verified zoo data and device location quality. Implemented functionality does not imply that every destination currently has a verified route.
