# XSS audit and rendering hardening — 21 October 2026

The audit of application release `e904c64` found no confirmed exploitable XSS path. Its recommendations are committed and verified live in application release `1025ec1`. See `COMMENTS.md` Turn 88 for deployment and live verification details. The original review and subsequent implementation/validation are recorded in `COMMENTS.md` Turns 86–87.

## Implemented output boundaries

- `src/features/map/dom.ts` builds HTML elements with `textContent` for arbitrary text. Tag names and classes come from application code.
- `markerElements.ts` builds bus markers, bus popups and ETA tooltips as DOM nodes. Service numbers, stop names and ordinals stay text. Nonfinite/wrong-type ETA values display an em dash; unknown enum values use fixed fallbacks rather than inherited object properties.
- `popupElements.ts` builds user, incident, boarding/change, alighting/destination and stop popup content. Names, roads, messages and stop identities never become parsed HTML. Stop buttons have local listeners and `type="button"`; the former generated IDs/global `document.getElementById` lookup and popup-open listener are removed. Duplicate physical stop visits do not share a button target.
- All `L.divIcon`, `bindPopup` and `bindTooltip` content in the map layers now receives DOM elements. Existing classes, copy, dimensions, colors, titles, ETA emphasis, live-GPS SVG and actions are retained. SVG nodes use `createElementNS`; the namespace URI identifies SVG and is not a network request.
- `src/graphics/busArtwork.ts` contains fixed shape descriptors shared by the React bus icon and DOM map icons. `BusTypeIcon.tsx` creates normal SVG children; `dangerouslySetInnerHTML` and the old `markerHtml.ts` string-rendering module are removed. External SVG/attribute descriptions are not accepted.
- `attribution.ts` is the explicit exception: Leaflet's attribution API accepts HTML strings. The OneMap logo URL is normalized/protocol-validated with the existing URL parser, then encoded for its quoted attribute. Attribution links and the OSM credit are fixed source markup. URL entities are preserved without attribute breakout or accidental entity decoding. The production HTTPS policy is unchanged.

React page/search/weather/trip labels continue to render data as text. Existing request, provider, saved-state, route/network and GPS validators remain in place. DOM text methods complement validation; they do not replace URL scheme checks, authorization, CSP or resource limits. No sanitizer or input character-stripping was added, and persisted/API strings are not pre-escaped.

## Original audit and remaining limits

The reviewed release escaped arbitrary names/messages in Leaflet strings and used ordinary React text elsewhere. Raw ETA/index/stop-code slots were constrained by validation and internal generation, and the only React raw-HTML sink selected fixed bus artwork. No payload execution was reproduced. The refactor removes reliance on those HTML-string assumptions at popup/marker output boundaries, rather than fixing a demonstrated active exploit.

The HTTP handlers return JSON rather than embedding it into HTML. No user-controlled navigation target, iframe srcDoc, browser URL-fragment/search-to-HTML flow or explicit eval call was found in the reviewed first-party runtime. These findings are a targeted code/data-flow review and payload exercise, not proof against every possible XSS or a dependency vulnerability audit. Leaflet's own fixed control/attribution markup still uses its internal HTML parser; this is not a Trusted Types migration or a claim that no dependency uses innerHTML.

If a future feature intentionally renders user-authored rich HTML, give that feature its own maintained sanitizer and explicit allowlist. Keep ordinary text on React children or DOM text APIs. For any external URL, validate the scheme even when assigning a DOM property.

## Validation and development dependencies

`tests/xss-rendering.test.ts` tests actual React output plus the DOM factories, hostile text, malformed runtime numeric/enum props, duplicate stop-button targets/rebuilding, fixed SVG and quoted attribution URL entities. A first-party source guard rejects raw-HTML APIs and literal string popup content. `tests/journey-presentation.test.ts` retains its GPS/ETA presentation checks against real DOM nodes.

Pinned **LinkeDOM 0.18.14** is development-only and provides an isolated document per unit test; it is not part of the application bundle. The install reported zero vulnerabilities. Actual browser payload tests supplement the DOM library; CSP is absent in that isolated test so it cannot hide encoding defects.

All **188 tests**, TypeScript including unused-local checks, the production client build and the HTTPS literal scan pass. The latter now recognizes the exact SVG namespace only when it is an XML namespace or the first `createElementNS` argument; insecure fetches remain flagged. The isolated HTTPS production fixture passes at 375 px and 1280 px for all APIs, trip/map flows, persistence, races, cleanup and transport/CSP behavior. See `COMMENTS.md` Turn 87 for final payload/secret-scan results and precise delivery status.

References: [OWASP XSS prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet), [React raw HTML guidance](https://react.dev/reference/react-dom/components/common#dangerously-setting-the-inner-html), and the installed Leaflet `src/layer/DivOverlay.js`, `src/layer/marker/DivIcon.js`, `src/layer/marker/Marker.js` and `src/control/Control.Attribution.js` implementation.
