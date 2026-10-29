# Controlled browser data

`transit.json` contains public route/network data for buses 50 and 72 (163 stops, four direction patterns), extracted from the existing locally generated LTA route assets. Stop indices are remapped after filtering. Route call identities and dataset timestamps are fixed to `2026-10-29T00:00:00.000Z`. Road geometry is copied from the repository's tracked OpenStreetMap route shapes. The app retains its source attribution; this is a regression fixture, not a current transport feed.

`map-tile.svg` is an authored, repeated test tile. It substitutes both map tiles and the attribution image at the HTTP boundary, so screenshots do not represent live OneMap cartography. The actual Leaflet renderer, controls, markers, paths and popups still run. Weather in `../data.ts` is synthetic, schema-valid NEA-format application data; arrival envelopes are generated from the fixture's actual service/stop relationships with fixed expected times.

No provider keys, real device location, browser authentication state or production user data is stored here. Tests validate route/network/shape/weather fixtures before starting. Refresh fixtures deliberately when changing supported contracts; review the screenshot diffs before replacing baselines. A fresh checkout can run the browser tests without downloading live route data.
