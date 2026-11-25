# Agent Instructions

These instructions apply to coding agents working in this repository.

## Project purpose

Byculla Zoo Navigator is a visitor map and walking-navigation application for Veermata Jijabai Bhosale Udyan (Byculla Zoo), Mumbai, India. It also includes admin tools for maintaining attraction data, map geometry, path access, and verified entrances.

**Navigation safety is critical:** never report a route as available unless every route segment is explicitly verified as visitor-accessible and the destination has an explicitly verified entrance connected to that network.

## Before changing code

1. Inspect the existing implementation and follow its architecture and naming conventions.
2. Read `package.json` for the actual scripts and package manager.
3. Inspect relevant types, loaders, persistence helpers, map layers, and tests before changing a data flow.
4. Prefer focused changes over broad refactors.
5. Verify documentation claims against current source code.

## Core data boundaries

Keep these concerns separate:

- **OSM source geometry:** original geographic features and coordinates.
- **Attraction records:** attraction metadata, availability, and geometry references.
- **Path-access records:** admin decisions and notes for individual OSM paths.
- **Entrance records:** explicit entrance coordinates and verification state.
- **Routing graph:** derived from eligible path geometry and access records.
- **GPS state:** live device location; do not persist personal location traces.

### OSM data protection

- Treat original OSM datasets as source data.
- Do not silently rewrite, regenerate, normalize, or delete source geometry during unrelated work.
- Keep manual edits and admin metadata in their designated stores.
- Preserve source IDs and OSM attribution.
- If a task genuinely requires changing source data, identify the files and feature IDs and add validation/tests.

### Shared geometry

Multiple attractions may reference one OSM feature. Do not duplicate source geometry or render duplicate polygons unnecessarily. Keep each attraction's metadata and entrance independent. Removing one attraction's link must not remove another attraction's link.

### Path-access rules

- Only paths explicitly marked visitor-accessible by an administrator may enter the visitor routing graph.
- Unverified, needs-verification, restricted, missing, and unknown statuses must be excluded.
- Never infer visitor access from OSM tags, path type, appearance, or connectivity.
- A connected physical network is not necessarily a visitor-accessible network.
- Preserve independent access decisions for connected path segments.
- Do not change access status automatically during imports or graph rebuilds.

### Entrance rules

- Entrances must be explicitly placed and verified through the admin workflow.
- Moving an entrance must clear its previous verification unless the existing product rules explicitly provide another safe behavior.
- Never infer entrances from polygon centres, corners, centroids, or nearest paths.
- A verified entrance is route-ready only when it satisfies the existing network-connection rule.
- Keep entrance records separate from attraction and OSM geometry records.

## Routing and GPS safety

- Use only the verified visitor-accessible path graph.
- Preserve existing geographic distance calculations and routing behavior unless a task explicitly requires a change.
- Preserve exact matching for path junctions and verified entrance connections unless an explicit, tested alternative is approved.
- Treat GPS snapping as a separate operation. Respect its configured maximum distance and safety checks.
- Never snap across restricted or unverified paths.
- If a safe connection or continuous route cannot be established, return an explicit unavailable/no-route state. Do not draw a fabricated route.
- Never invent or substitute GPS coordinates.
- Treat poor GPS accuracy and noisy fixes conservatively.
- Do not persist visitor GPS coordinates or location history.
- Keep progress, off-route, and arrival thresholds consistent with existing tests unless requirements explicitly change.

## Visitor/admin separation

- Visitor mode must not expose admin editing, linking, rejection, or destructive controls.
- Admin workflows must not inherit visitor filters that hide records admins need to inspect.
- Closed attractions remain in the data; visibility is a presentation/availability decision.
- Preserve import/export and local persistence behavior unless the task specifically changes it.

## Frontend and map implementation

- Follow existing React and TypeScript patterns.
- Reuse existing hooks, components, map sources, and layer-management patterns where practical.
- Clean up map event listeners, sources, layers, and geolocation watches.
- Avoid duplicate GPS watches and duplicate map layers.
- Keep controls usable on small screens and accessible by touch.
- Do not rely on color alone to communicate status.
- Handle loading, empty, offline, permission-denied, timeout, and error states explicitly.
- Do not claim basemap/offline support unless the implementation actually provides it.

## Testing expectations

For behavior changes:

1. Add or update focused tests.
2. Test success and failure paths.
3. Test visitor and admin behavior where relevant.
4. Test persistence and import/export when data formats change.
5. Test shared geometry when linking or rendering changes.
6. Test that restricted and unverified paths cannot enter a route.
7. Test that missing or unverified entrances cannot become route endpoints.
8. Test GPS noise, poor accuracy, unavailable location, and safe snapping when GPS/routing changes.

Run relevant scripts from `package.json`. Run tests and, when configured, type-checking and linting. Report exact commands and results; never claim tests passed if they were not run.

## Data and storage changes

- Treat browser storage keys and serialized formats as compatibility-sensitive.
- Use explicit versioning or migration logic for persisted schema changes.
- Validate imported feature types, known IDs, and allowed properties.
- Ignore or reject unknown records safely.
- Do not let imported geometry overwrite protected source geometry unless explicitly required.
- Avoid destructive resets or clearing user data during tests.
- Use isolated fixtures and restore test state.
- Never commit real visitor coordinates, personal information, API keys, or secrets.

## Documentation and reporting

Update documentation when changing developer workflows, data formats, configuration, or user-facing behavior.

Implementation summaries must report:
- files changed;
- behavior changed;
- tests and commands run;
- data files or storage keys affected;
- known limitations and manual verification still required.

## Avoid

- Unrequested redesigns or broad refactors.
- New dependencies without clear value.
- Fake map data presented as real zoo data.
- Hard-coded coordinates presented as a visitor's current location.
- Automatically approving paths or entrances.
- Duplicating OSM geometry.
- Silently changing persistent data formats.
- Claiming real-world navigation is validated solely because unit tests pass.
