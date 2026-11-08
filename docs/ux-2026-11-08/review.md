# BusTrackerSG UX/UI review · 8 November 2026

## Scope and evidence

This review starts from the local Turn 146 implementation on security/audit-20261029, including its uncommitted changes. “Before” refers to that local build. The production release differs. The app is a responsive React 19 / TypeScript / Tailwind 4 / Leaflet web app with Express and Vercel API entry points. There is no account, checkout or database UI.

Evidence classes are **Observed** (source or browser), **Expert judgment** (heuristic interpretation), **Assumption** (unvalidated user need), and **Outstanding** (requires another environment or participants). Browser work uses the real compiled client with controlled LTA/NEA/OneMap tile fixtures, no real location or credentials. Official standards were consulted online. Production/provider performance is outside these fixtures.

Audience assumptions, all without participant research

- **Daily commuter**, medium confidence. “When I leave NYP, show whether I can catch my usual bus and which side of the road to use.” Tasks are recall a saved service, inspect ETA and walk time, change direction.
- **Occasional rider**, medium confidence. “When I know a destination but no bus number, help me choose a trip and recognise where to board and alight.”
- **Keyboard or low-vision rider**, medium confidence. “Let me choose a location and inspect stops without precise tapping, losing focus or relying on colour.”
- Business objective is useful repeat visits and reliable travel decisions, an assumption with medium confidence. No sales or retention measurement was supplied. Primary tasks have high confidence from existing features and regression flows.

Existing strengths include arrival-first hierarchy, four stable views, visible destination labels for ambiguous nearby services, named native dialogs, saved location persistence, explicit feed failure/retry, real/scheduled distinction, text equivalents for crowding, stale-weather recovery and a text stop list alongside the map.

## A · Baseline audit

Severity 0 means no observed issue, 1 minor, 2 moderate, 3 major and 4 critical. Priorities describe this product’s task impact. A small control alone is not automatically a WCAG failure because spacing and equivalent-control exceptions apply.

| ID | Screen / evidence | Observable problem | Principle / severity | User impact | Correction / priority | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| U01 | Arrivals rain advice, RainAdviceStrip.tsx footer; axe at 320/390/600 | Metadata and Weather link have computed contrast 3.51:1 | Perceivable text, 3 | Harder to read supporting forecast provenance | Remove text opacity, use readable caption token, P1 | axe contrast check and capture |
| U02 | Arrivals mini map at 768; layers/stops.ts size=22; axe target-size | A 22×22 stop overlaps nearby clickable space | Fitts / error prevention, 2 | Precision-dependent selection | 28px marker hit region centred on coordinates, P1 | axe and map popup regressions |
| U03 | PlaceSearch.tsx keydown, choose and root effect | Enter accepts an item even with the list closed; Tab leaves suggestions open; selection always blurs | User control / keyboard, 3 | Accidental selection or lost keyboard position | Handle only open lists, Escape dismissal, focus-aware blur, polite search status, P1 | Keyboard E2E |
| U04 | BusSearchBox.tsx submit and useTrackedRoute route notice | Pending search accepts repeat submission, focus can remain in collapsed content, notice lacks live status | System status / recovery, 2 | Unclear progress and location after success/failure | Busy submit, restore disclosure focus, announce result/notice, P1 | Delayed, invalid and successful-search E2E |
| U05 | Saved dialog clickable div, 30px action icons, same remove title for every bus | Whole-row pointer action lacks keyboard semantics; small ambiguous actions | Consistency / Fitts, 2 | Keyboard users need a separate icon path; mistaken removal | Semantic row button, explicit remove label, separated 44px icon, P1 | Keyboard and target geometry |
| U06 | LocationPrivacyControls.tsx clear handler | Immediate deletion of remembered location and recents | Error prevention, 2 | Accidental irreversible loss of local choices | Inline confirmation before invoking existing clear action, P2 | Cancel retains data, confirm existing privacy flow |
| U07 | App.tsx main; RouteStopsList.tsx filter | No skip link; stop filter relies on placeholder and empty result offers no reset | Efficiency / help, 2 | Repeated tabbing and manual recovery | Main landmark target, explicit label, result status and clear button, P2 | Skip-link and no-match recovery E2E |
| U08 | AppTabs/Header/LocationBar and index.css | Some key controls are under 24px high; focus outline can be low contrast on dark trip surface; animation utilities ignore reduce preference | Fitts / accessibility, 2 | Missed taps and weak orientation | Shared target/focus/motion tokens and shared action components, P2 | DOM sizes, focus, reduced-motion checks |
| U09 | NEA full view, source review and fixtures | Extensive supporting metrics can feel dense; no demonstrated task blocker | Progressive disclosure, 1 | Occasional riders may scan more than necessary | Retain concise arrival weather; validate full-view reading with riders, P3 | Participant task |
| U10 | Map/route geometry, source review | Dense real-route marker overlap, walking shown as straight-line estimates | Geographic usability, 2 | Map alone may require zoom and local knowledge | Keep text Stops/Trip alternatives and disclaimers; clustering/walking routing remains research backlog, P2 | Dense real-data and assistive-technology session |
| U11 | Theme, source review | Light theme only; several legacy small metadata labels | Consistency/readability, 1 | Night use or enlarged text may need more refinement | Apply 12px caption floor to core task surfaces; dark theme remains separate scope, P3 | Reflow and later night-use review |

No P0 was observed in the inspected fixture journeys. This is a bounded assessment, not proof of universal access. Auth, account settings, pricing, tables and payment flows are N/A because the product has none.

### Nielsen heuristic evaluation

| Heuristic | Finding / evidence | Severity | Effect and correction |
| --- | --- | --- | --- |
| Visibility of status | U04, no pending search feedback; arrival/weather already show freshness | 2 | Add busy state and polite route result |
| Match to real world | Stop names, destinations, minutes and operator names observed | 0 | Retain familiar rider language |
| Control and freedom | U03 and U06 | 3 | Escape/Tab behavior and cancel before clear |
| Consistency and standards | U05, clickable div vs nearby buttons | 2 | Use semantic button and standard labelled icon action |
| Error prevention | U02, U03, U06 | 3 | Larger targets, open-list guard, confirmation |
| Recognition over recall | Four views, route destination and saved arrival preview observed | 0 | Retain visible names, codes and destination |
| Flexibility and efficiency | U07; usual-bus path already short | 2 | Skip link, named stop filter and reset |
| Aesthetic/minimal design | Arrival-first summary with optional Change bus observed | 1 | Refine typography without more panels |
| Recognise/diagnose/recover | U04 and U07; Retry and stale weather already present | 2 | Preserve failed input, announce, reset filter |
| Help/documentation | Crowding legend, straight-line notes and estimate explanation observed | 1 | Keep help local to the relevant data |

## B · Five journeys and interaction plan

Counts below are expert walkthrough interaction estimates, not participant timings. Typing a query counts as one field interaction. They exclude the browser permission dialog and route-dependent transfers.

| Goal and starting state | Baseline decisions / fields / actions | Revised flow and expected response | Friction/errors and completion |
| --- | --- | --- | --- |
| Check usual bus from remembered start | Choose saved bus or default, 0 fields, 0 actions for current bus or 2 via Saved | Open Saved → choose labelled bus row → arrival card | Wrong direction or unavailable feed must remain visible; completion is correct stop/direction with valid ETA or explicit unavailable |
| Find another service | 2 decisions, 1 field, 3 actions (Change bus, type, Track) | Same 3 actions; pending feedback → card and disclosure focus | Invalid service retains input/expanded chooser and announces notice; completion is selected service |
| Plan a destination trip | Destination and route decisions, 1 field, about 3 actions (type, choose, select trip) | Same actions; keyboard suggestions close predictably; optional Steps then Map | Ambiguous place, remote failure and no-trip state; completion identifies boarding bus, stop, transfer and alighting stop |
| Pick/change boarding stop | Direction and stop decisions, 1 optional filter, 3–5 actions | Stops → labelled filter → matching row; no results → Clear stop filter | Typo recovery changes from selecting/deleting the whole query to one reset; completion is selected stop with contextual arrivals |
| Update location and check conditions | Location source decision, 0 GPS fields or 1 place field, about 2–4 actions | Change → GPS or search → choose → weather/arrival | Denied GPS retains chosen origin; manual search remains available; completion is visible remembered start and local weather |

Information architecture retains Arrivals, Map, Stops and Weather. Saved remains a global shortcut. On phones the bar is reachable at the bottom; main content gets clearance above it. Search is progressively disclosed, while time, service, direction and stop remain visible.

Hick’s Law supports keeping optional search, crowding explanations and privacy controls folded. Fitts’ Law supports a 44 CSS-pixel comfort target for shared frequent actions and at least 24 CSS pixels for compact controls, with larger coarse-pointer targets. CSS pixels are web units; native Apple pt and Android dp are reference conventions, not interchangeable measurements. Jakob’s Law supports native modal dialog behavior and editable combobox conventions. Gestalt proximity keeps the bus identity beside its ETA and destructive actions separate from opening a saved ride.

## C · Low-fidelity alternatives before implementation

### Arrival screen

**A, recommended** keeps the existing arrival-first structure. This has low learning cost for existing riders and preserves the already verified flow.

    [Brand                      Saved]
    [Bus · direction · stop      Retry]
    [NEXT 4 min] [12 min] [20 min]
    [Change bus                     v]
    [From · Change / GPS             ]
    [Where to?                       ]
    [Weather summary / other buses   ]
    [Arrivals] [Map] [Stops] [Weather]

**B, considered** starts with a task launcher, which makes first use clearer but adds a decision for the common repeat check.

    [Brand                      Saved]
    [Where are you starting?         ]
    [Find bus] [Plan a trip] [Nearby  ]
    [Selected task inputs            ]
    [Arrival result after choice     ]
    [Arrivals] [Map] [Stops] [Weather]

A is selected on expert judgment, medium confidence. Validate first-use discoverability with participants before adding a launcher. No claim of measured preference.

### Saved buses

    [Saved buses                  × ]
    [72  Nanyang Poly → Tampines][bin]
    [Next 4 min · second 12 min       ]
    [50  Nanyang Poly → Punggol ][bin]
    [Close                           ]

A whole semantic row opens the tracker, and a separate named icon removes it. A card grid was considered but rejected because narrow phones would lose destination-reading width.

### Search and recovery

    [Change bus                     ^]
    [Bus number                      ]
    [72___________________][Tracking…]
    [status/error beside chooser     ]
    [Nearby stops and directions     ]

    [Search route stops_____________ ]
    [0 stops match “query”           ]
    [Clear stop filter               ]

### Location privacy confirmation

    [Your saved location data       v]
    [Download] [Clear…               ]
    [Clear location and recents?     ]
    [Cancel] [Confirm clear          ]

This preserves a way back without adding confirmation to ordinary search, GPS or tab navigation.

## D · Design specification

### Tokens and identity

The implemented identity uses Wada plate 259. Its four accents remain Lemon Yellow #f8ed43, Green Blue #099197, Helvetia Blue #005b8d and Warm Gray #a1a39a. Tinted surfaces and darker ink variants are functional derivatives.

| Role | Implemented value or rule |
| --- | --- |
| Canvas / surface | Warm 50 #f6f6f2 / white |
| Body / secondary ink | Warm 900 #26342f / Warm 500 #62685d |
| Primary action | Lemon background with Helvetia 950 #002b40 ink |
| Links and focus | Helvetia #005b8d; lemon focus on the dark trip surface |
| Positive/info | Green Blue ink #07676c on #e5f3f2 |
| Warning / error | Existing amber / rose semantic tones plus text and icons |
| Typeface | Existing system sans stack; no remote font request |
| Body / label / caption | 16 / 14 / 12 CSS pixels at the default root size; rem-based sizes scale |
| ETA | Existing 24–36px scale with explicit min unit and live/scheduled symbol |
| Spacing | Tailwind 4px base scale, 8/12/16/24px grouping increments |
| Containers | Existing 80rem maximum, 16px phone gutter, flexible cards |
| Breakpoints | Existing 40rem navigation transition and content-led wider grids |
| Shape | 12px action radius; existing 16px panel radius; restrained existing shadows |
| Targets | Shared ActionButton/IconButton 44px minimum height; compact controls 24px minimum; coarse-pointer buttons 44px |
| Motion | 150ms ease-out feedback token; reduce-motion suppresses CSS motion and Leaflet zoom/fly animation |
| Layers | Existing navigation layer 40; native top-layer modal; focusable skip link above notices |
| Focus | Two-pixel outline with 3px offset, contextual colour on dark surfaces |

The current implementation is light themed. A proposed dark theme would use Helvetia 950 canvas, Warm 900 surfaces, white primary text, light muted text and lemon focus, but remains **unimplemented**. It requires checking every Leaflet overlay, chart/metric tile and warning state, and night-use testing. Declaring unused dark CSS tokens would not deliver a working theme.

### Component behavior

| Component | Purpose and states | Keyboard / responsive contract |
| --- | --- | --- |
| ActionButton | Primary lemon, secondary blue tint, quiet transparent; hover feedback, disabled busy state | Native Enter/Space, visible focus, 44px target, wrap labels |
| IconButton | Named compact action for close/remove; same feedback and target | Accessible label required; separate from row-opening action |
| PlaceSearch | Combobox, loading/empty/result status, clear action, remote failure fallback | Arrow keys choose active option, Enter only from open suggestions, Escape closes, Tab dismisses; retain desktop keyboard context |
| Bus chooser | Disclosure, idle input, pending Track, failed notice, success | Prevent duplicate pending submit, retain invalid input, return focus to Change bus after success |
| Route stop list | Labelled search, selected/nearest states, no-match status and reset | Text alternative to spatial map; keyboard selection through native row buttons |
| ModalDialog | Named native modal, initial focus, inert background, scrollable body | Tab wrapping, Escape, click outside, close button and focus return; location sheet additionally allows drag |
| Saved row | Service/stop/destination/ETA as a button, separate remove action | Entire row is keyboard-operable; remove has bus-specific name |
| Arrivals | Loading, live/scheduled estimate, no estimate, unavailable/retry | Three estimates normally share a row; header wraps instead of overlaying at enlarged text |
| Tabs | Four views and current-page state | Explicit names, shrinking icon containers, bottom nav on narrow screens |
| Privacy disclosure | Explanation, download, request-clear, cancel/confirm, success/error | Invokes existing clearing only after confirmation; restores focus on cancel/completion |
| Alerts/help | Existing weather/error notices and crowding/estimate explanations | Plain-language text, local controls, no new automatic toast stream |

Authentication, accounts, pagination tables, payments and charts requiring new components are N/A for the current product. Existing NEA metric tiles remain the data presentation. Large migrations to a new component framework are unnecessary for these changes.

### Responsive composition

- 320–390 and 391–639px show a single column, bottom navigation and the contextual arrival shortcut. Search fields stay at 16px on coarse pointers to avoid focus zoom on supported mobile browsers.
- 640–767px use the existing wider navigation convention. Direct six-width checks include 600 and 768px; 640–767 remains covered by the existing breakpoint rules and resize testing rather than a separate full screenshot baseline.
- 768–1023px wrap map controls and preserve flexible arrival headings. 1024–1439px enables the existing map/weather columns where the content permits.
- 1440px and above cap the content width and keep the same reading order.
- Enlarged root text is tested at 200%. This is a reflow test, not a claim about physical-device Dynamic Type, browser zoom or all OS font substitutions.
- Native iOS/Android navigation, native Dynamic Type and foldable posture APIs are N/A to this web build. Device rotation and resize must retain tracked bus and location state.

### Rationale and trade-offs

Larger captions and touch targets increase vertical space. Arrival-first ordering and progressive disclosure absorb that cost without removing controls. A full row button gives Saved one clear primary action. Confirmation adds one step only to clearing local location history. Existing backend validation, route planning, persisted data representations and provider responses are used without a new dependency or telemetry service.

## E · Implementation and validation commands

Source changes cover shared actions and web tokens, search behavior and feedback, saved-row semantics, privacy confirmation, stop-filter recovery, skip navigation, caption readability, navigation/header reflow, map target geometry, tooltip naming and reduced map motion. Relevant files are under src/components, src/features/map, src/index.css and src/App.tsx. The preceding Turn 146 work is still present and uncommitted.

Commands used for this review include npm run lint, npm run verify and the installed Playwright runner. Browser runs use a loopback preview with external networking denied. The production build command also fetches provider data, so the browser suite uses npm run build:e2e instead.

The baseline/final accessibility scanner is the locally available axe-core 4.14.0, injected into the compiled client without adding a project dependency. It scans WCAG A/AA tags including 2.1 and 2.2. The repeatable scanner is e2e/accessibility.spec.ts, enabled by UX_AXE_SOURCE. It attaches raw JSON, and behavioral regressions live in e2e/ux-quality.spec.ts. The scanner covers the rendered fixture states, with any outstanding warnings recorded below. It is not a complete accessibility assessment.

## F · Validation and remaining work

Final executed results are recorded after the final checks. The initial expanded run revealed three issues in the test/code iteration
- The privacy status selector became ambiguous after adding the search live region. It was scoped to the privacy result.
- A first invalid-number test used a syntactically valid but missing service and expected the syntax message. It was changed to a genuinely malformed identifier.
- Tab dismissal and enlarged-text navigation required additional application fixes. Their final regression results follow below.

No participants were recruited and no conversion, retention, SUS, task duration or satisfaction score was measured. The hosted browser could not be inspected because local browser use is disabled in Work settings. Automated local browser tests remain available. Production latency, real provider failures, live traffic, physical-device Safari/TalkBack/VoiceOver and dense full-network maps remain separate validation needs.

### Participant study ready to run

Recruit a small initial round of approximately five regular and occasional Singapore bus riders, including keyboard/assistive-technology users where feasible. Obtain consent and use neutral scenarios. Do not collect precise home addresses or participant contact data in app logs.

| Scenario | Goal / completion | Failure points | Observe / success measure |
| --- | --- | --- | --- |
| Leaving campus | Pick Bus 72 in the correct direction and identify its next real estimate | Opposite stop, default origin, timetable vs GPS | Correct direction/stop without coaching, errors and elapsed time |
| Visiting Bishan | Plan a trip without knowing a bus number; name boarding/alighting stops | Wrong place, transfer misunderstanding | Correct plan explained aloud, backtracks, help requests |
| Returning rider | Save a ride, reload and reopen it | Heart meaning, duplicate stop names | Restored correct ride, unnecessary actions, ease rating |
| Feed failure | Decide what to do when estimates are unavailable | Treating no estimate as no service | Recognises uncertainty, finds retry, avoids fabricated departure decision |
| Location recovery | Handle denied GPS using a stop-code search | Permission loop, lost origin | Valid selected origin retained, recovery without coaching |
| Large-text keyboard use | Find a route stop and open/close Saved | Focus loss, obscured controls | Full keyboard completion, focus visibility, reflow |

For each task record completion, elapsed seconds, wrong selections, backtracking, assistance and a 1–7 ease rating. Compare the same baseline and revised journeys in counterbalanced order. A provisional goal is 90% critical-task completion and no critical keyboard blocker. For a five-person pilot, report raw counts as well as percentages. Treat a larger confirmatory round as necessary before generalising. Optional SUS follows all tasks; there is no current SUS baseline.

### Prioritised next backlog

| Group / item | User benefit / principle | Priority / effort | Dependency / regression risk | Acceptance and validation |
| --- | --- | --- | --- | --- |
| Core, dense map stops | Easier spatial selection / Fitts | P1, medium | Real-data overlap and Leaflet; risk to geographic accuracy | Cluster or equivalent stop chooser supports every occurrence and has usable targets at all zooms; map and text-list tests plus axe |
| Strategic, participant round | Verify discoverability / recognition | P1, medium | Riders and consent; low code risk | Record observed tasks and ease, revise uncertain launcher decision |
| Core, assistive technology | Verify semantics / robust access | P1, medium | Physical Safari, VoiceOver, TalkBack; low code risk | Five journeys completed with speech feedback and zoom |
| Quick win, repeatable axe CI | Catch future regressions | P2, low | Select a pinned project dev dependency and CI support; scanner maintenance | Axe runs on PR with declared exceptions and modal/search states |
| Strategic, dark appearance | Night reading / user control | P2, high | Theme design and full overlay review; medium visual risk | Two fully inspected themes with readable all-state contrast |
| Strategic, field performance | Understand actual speed | P2, medium | Privacy-reviewed instrumentation or existing host field data | p75 LCP ≤2.5s, INP ≤200ms, CLS ≤0.1 by device with actual sample counts |
| Polish, unused branding metadata | Lower repeated reading / minimalism | P3, low | Owner brand decision; low code risk | Test header wording with first-time riders |

### Executed final results

- **366 unit/integration tests in 51 files passed**, with TypeScript/unused checks and HTTPS checks, using npm run verify.
- **34 functional browser cases plus 4 optional axe audit cases passed** in the final independent run, 38 total. The final run used previously recorded baselines, without updating them.
- **18 strict visual comparisons passed**, with zero-pixel tolerance. Baselines were intentionally refreshed earlier for the implemented typography, control sizes, reflow and map motion changes. Representative arrival, saved-dialog and weather captures were inspected.
- **24 view/width axe scans** cover all four views at 320/390/600/768/1024/1440px. **12 additional scans** cover Saved, location dialog, suggestions, privacy confirmation, unavailable arrivals and no-match stops at desktop and phone sizes.
- The baseline had two low-contrast nodes in each of the three phone arrival scans, and a map target warning at 768px. Final phone and additional state scans have no reported violations in the selected rules.
- **Three map overlap target-size warnings remain**, one each in 768px Arrivals, 768px Map and 1024px Arrivals. Increasing hit regions to 28px fixes the nominal dimension but nearby markers can still partially obscure them. These warnings are explicitly included in the JSON and allowed narrowly by the optional audit test. Other violations fail the test. U02 is therefore **partially resolved**, with U10 still outstanding.
- During expanded-state testing, the scanner also surfaced transient unlabelled ETA tooltips; explicit tooltip names were added. Final scans reported none of that rule.
- No horizontal page overflow was found in the final six-width view checks. Enlarged text at 200% works through Arrivals, Stops and Weather in the phone and desktop contexts. Map at enlarged text, all transfer combinations and all forecast extremes remain untested.
- The enlarged-text regression uncovered actual content overflow in the header, ETA grid, origin controls and route-direction heading. Header and controls now wrap; ETA cards become a single column when their container is too narrow relative to text size. The check compares scroll width against document client width because mobile innerWidth can expand around overflowing content and hide the defect.
- Local test-build main JavaScript gzip increased from 117.88 to 118.57kB, stylesheet from 11.05 to 11.71kB and lazy map code from 51.49 to 51.58kB. These are same-environment Vite test-build figures, not production or field performance claims. No dependency was added. LCP, INP and CLS were not measured for production or a representative network/device sample.
- Whitespace checking passed. All work remains local and uncommitted. No deployment occurred.

Reproducible commands from the existing virtual environment

    source .venv/bin/activate
    npm run verify
    UX_AXE_SOURCE=/absolute/path/to/axe-core/axe.min.js npm run test:e2e:visual

For the offline runs the commands were enclosed in a macOS sandbox allowing loopback and denying other outbound connections. The optional scanner must be supplied locally; the standard functional suite does not require a scanner path.

### Before / after evidence

[Baseline phone arrivals](before-arrivals-phone.png) and [revised phone arrivals](after-arrivals-phone.png) show the hierarchy retained with larger readable metadata and controls. [Baseline Saved](before-saved-phone.png) and [revised Saved](after-saved-phone.png) show the semantic row and separate remove target. [Revised enlarged text](after-enlarged-text-phone.png) records the narrow-layout reflow. The full [accessibility results](accessibility-results.json) preserve the remaining warnings. Existing full-screen fixtures are in e2e/snapshots.

Source evidence at the final implementation

- U01, src/components/RainAdviceStrip.tsx:26 and src/index.css semantic caption/focus tokens.
- U02/U10, src/features/map/layers/stops.ts:34 and the target-size nodes in accessibility-results.json.
- U03, src/components/PlaceSearch.tsx:79, :162 and :190.
- U04, src/components/BusSearchBox.tsx:58 and src/App.tsx:372.
- U05, src/components/FavoritesModal.tsx:100 and :147, plus saved mini-row buttons in src/App.tsx.
- U06, src/components/LocationPrivacyControls.tsx:22 and the inline confirmation.
- U07, src/App.tsx:332 and :347, and src/components/RouteStopsList.tsx labelled filter/reset.
- U08/U11, src/components/ActionButton.tsx:6, src/index.css interaction tokens, src/components/ArrivalDisplay.tsx:427 and the 200% text regression.
- ETA tooltip naming, src/features/map/layers/etaCallout.ts:5. Primary view headings now use h2 below the app h1.

### Completion boundaries

Major local views and key interruption states have been assessed, five journeys mapped, two arrival alternatives compared, structural wireframes and high-fidelity specification supplied, shared controls implemented, and relevant tests executed. Outstanding work comprises dense map overlap resolution, dark appearance, physical-device/assistive-technology testing, participant studies and representative field performance. The live app was not visually verified because browser access was disabled. This report does not establish complete WCAG conformance or universal usability.

## G · Expert-review scorecard

Rubric for each category: 0 absent, 2 a primary task blocked, 4 repeated serious friction, 6 functional with several known gaps, 8 consistent and supported by the reviewed checks, 10 broadly validated across applicable states and devices. Intermediate values interpolate these expert judgments. The same reviewer and rubric were applied to the local baseline and final build. Scores are subjective assessment aids, not user satisfaction, conversion rates or a formal WCAG score.

| Category | Weight | Baseline /10 | Revised /10 | Evidence behind the judgment |
| --- | --- | --- | --- | --- |
| Navigation and information architecture | 15% | 7 | 8 | Four retained views, skip link and clearer recovery |
| Interaction efficiency and task flows | 20% | 7 | 8 | Keyboard saved row, search focus/progress, stop reset |
| Clarity and visual hierarchy | 15% | 7 | 8 | Arrival-first retained, larger captions, wrap instead of overlap |
| Design consistency | 10% | 6 | 8 | Shared action/icon controls and interaction tokens |
| Accessibility | 15% | 5 | 7 | Contrast, semantics and keyboard improvements tested; map and assistive-technology gaps remain |
| Responsive and adaptive behavior | 10% | 6 | 8 | Six widths and 200% text exercised; enlarged header, ETA and stop-heading failures corrected |
| Feedback and error recovery | 10% | 7 | 8 | Pending search, live statuses, reset and clear cancellation |
| Perceived performance and interaction quality | 5% | 6 | 7 | Reduced motion, responsive feedback and small bundle delta; field speed unmeasured |
| Weighted overall | 100% | **6.45** | **7.80** | Sum of category score × weight |

The largest confidence gap is real-user task performance. Priority follow-up is testing the five journeys with riders, followed by dense-map and assistive-technology verification. There is no evidence yet for a numerical change in satisfaction or retention.

## Reference basis

The current web accessibility target is WCAG 2.2 AA. Apple and Android guidance informs comfortable targets and alternate gesture actions, while this web app retains its own identity. Core Web Vitals thresholds require actual field data before a p75 conclusion can be made. Sources checked 8 November 2026.

- [W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/)
- [Nielsen Norman Group heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/)
- [Android accessibility guidance](https://developer.android.com/design/ui/mobile/guides/foundations/accessibility)
- [Apple accessibility guidance](https://developer.apple.com/design/human-interface-guidelines/accessibility) returned a JavaScript-only page in the reference reader. Detailed native compliance is N/A to this web build.
- [Web Vitals definitions and thresholds](https://web.dev/articles/vitals)
