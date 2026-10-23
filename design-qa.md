# Navigation design QA

final result: passed

## Target and scope

Source visual truth: user attachment `C:/Users/03021/AppData/Local/Temp/codex-clipboard-62fd8a91-f910-47b6-9fa7-3f433ec14f91.png` (325 × 1076 pixels).

Requested scope is the navigation pattern: icon rail, account in the lower corner, and a bottom navigation alternative on phones. The Codex project list, its content, and its branding are outside the requested scope. Rental pages, role guards, and the existing app typography and green brand accent are retained.

Implementation: `http://127.0.0.1:5173/workspace/owner/overview`. Desktop CSS viewport 1024 × 1076; captured image 1024 × 1076. Phone viewport/capture 390 × 844; also checked 320 × 640. Full-page screenshots are used because the in-app browser's viewport-only screenshot scaled/clipped the emulated viewport. No density rescaling is applied to the final evidence.

## Evidence and comparison history

- Initial desktop: `docs/design-audit/37-desktop-navigation-ready.jpg`.
- Initial full-view comparison: `docs/design-audit/38-reference-comparison.png`, source left, implementation right, height 1076.
- Initial focused comparison: `docs/design-audit/39-rail-comparison.png`, source and implementation rail crops at 78 × 1076 each, without scaling.
- [P2, fixed] Account was visually weaker than the reference's 36-pixel avatar. Changed it to a 36-pixel green circular avatar with a library user icon, increased the other desktop icons to 25 pixels, and aligned the account center with the source's lower-corner position by adjusting bottom padding.
- Final desktop: `docs/design-audit/40-desktop-navigation-final.jpg`.
- Post-fix full-view comparison: `docs/design-audit/41-final-reference-comparison.png`.
- Post-fix focused rail comparison: `docs/design-audit/42-final-rail-comparison.png`.
- Mobile bottom bar: `docs/design-audit/43-mobile-navigation-final.jpg`.
- Mobile menu interaction: `docs/design-audit/35-mobile-more-menu.jpg` (before the avatar size adjustment; menu layout unchanged).

The full-view and focused comparison images were both opened and evaluated. Screenshots and the user attachment stay local and are excluded from the GitHub update because unrelated captures may contain private contact information.

## Required fidelity surfaces

- Fonts/typography: icon-only persistent navigation uses accessible names and browser tooltips. The existing Golos Text product typography remains on rental pages and the mobile drawer. No new display font or project-list typography was introduced.
- Spacing/layout: the desktop rail is 78 pixels wide, with a 52-pixel active target, 16-pixel rounding, and a rounded adjoining content panel. Settings and account stay at the bottom. On phones the five 48-pixel controls fit both 390- and 320-pixel widths. Composer bottom and navigation top both measure 770 at the 390 × 844 viewport, so they do not overlap.
- Colors/tokens: muted gray icons, neutral warm rail, gray active tile, and the app's green account accent. The green avatar instead of the source's orange monogram is an intentional brand adaptation.
- Image quality/assets: real Lucide library icons are used. Native navigation uses 72-pixel rasterizations of the same library displayed at 24 pixels, with its license included. No emoji or handmade icon drawings are used in navigation.
- Copy/content: hidden accessible page names remain role-specific. The phone overflow menu labels its remaining rental sections; the navigation does not reproduce unrelated Codex project titles.

## Interactions and accessibility

- Desktop selected link has `aria-current=page`; account links to the protected account page.
- Current phone bottom navigation has four primary role-specific sections and account. More is in the header; secondary pages remain reachable through it. See the scoped update below.
- Tested opening More and the account page, closing More with Escape, and restoring focus to its trigger. The web drawer traps Tab within its controls while open.
- Checked all bottom controls stay inside the 320-pixel viewport; document width equals scroll width.
- Browser error logs for the verification tab: none.
- TypeScript checks pass for web and native clients. Business/API test results are recorded separately in the implementation document.

## Findings and follow-up

No actionable P0/P1/P2 findings remain for the requested navigation change. P3: the source's filled home mark differs from the app's outline home icon; the library outline is retained consistently across platforms. The source did not specify a phone layout; the five-control bottom bar and More drawer implement the user's stated alternative.

## Implementation checklist

- [x] Replace text page tabs with a desktop icon rail.
- [x] Place account at the lower corner.
- [x] Add phone bottom navigation and an accessible overflow menu.
- [x] Preserve role-scoped routes and backend authorization.
- [x] Verify desktop/mobile screenshots and primary interactions.
- [x] Recompare after the account affordance fix.

## Scoped update: move More out of bottom navigation (22.10.2026)

final result: passed

The user attachment C:/Users/03021/AppData/Local/Temp/codex-clipboard-ac4b3b6b-6b3d-400f-a949-979c11d8a5e9.png requests moving the existing ellipsis control away from the bottom bar. This is a scoped navigation edit. More now sits at the right of the mobile header; the bottom bar has four primary sections and account. Owner: overview, properties, bookings, assistant, account. Guest: overview, catalog, bookings, assistant, account. Cleaner: overview, jobs, assignments, assistant, account.

Evidence: docs/design-audit/44-primary-bottom-navigation.jpg (390×844), docs/design-audit/45-header-more-menu.jpg, docs/design-audit/46-navigation-before-after.png (two 390×844 app views), and docs/design-audit/47-request-navigation-comparison.png (the 739×979 attachment and the 390×844 current app side by side, without scaling). The attachment includes browser chrome and a different capture size, so it is used to check the requested placement, not to infer pixel-level font differences. The matched-viewport before/after comparison confirms the app layout is retained. Both comparison images were opened and reviewed.

No P0/P1/P2 issue remains. Spacing, typography, colors and library icon assets remain consistent; the help label becomes a labelled help icon on phones to make room for the header menu. The header and all five bottom targets fit a 320×640 viewport without horizontal overflow. All three role layouts were opened in the browser. Header menu contents, Escape close and focus restoration were checked. On desktop the header menu is hidden and all eight owner links remain in the rail. Browser error logs are empty. TypeScript, 42 service tests, 16 HTTP tests, web build and Android/iOS/web exports pass.

## Scoped update: rounded translucent bottom navigation (23.10.2026)

final result: passed

The phone dock now floats 12px from either side and 10px above the bottom safe area. It has a 30px corner radius, a warm background at 78% opacity, a fine translucent border and a soft shadow. Web adds 20px backdrop blur. The native component shares the shape, translucency and spacing; it does not add a native blur dependency. Desktop rail rules are unchanged.

Verified the guest assistant at 390×844 and 320×640. All five links retain 48×48 targets; document and viewport widths match. The 72px dock stays clear of the composer, with bottom safe-area space reserved in the content. Browser computed styles confirm rgba(244,242,239,0.78), 30px corners and blur(20px). Console errors: none. Native TypeScript passes.

Evidence: docs/design-audit/48-rounded-translucent-navigation.jpg and docs/design-audit/49-rounded-navigation-comparison.png. The comparison was opened and reviewed: the earlier capture shows owner overview and the current capture guest assistant, so only the shared dock treatment and screen spacing are compared. Typography, icons, active states and role routing remain unchanged. No actionable P0/P1/P2 findings remain. Screenshots remain local.

## Audit-led improvements (23.10.2026)

final result: passed

Scope: improve the existing visual language and the audited role journeys, preserving the user-selected icon rail, account placement and translucent phone dock. This is an improvement pass against current product captures, not a claim of pixel-identical recreation. The user-facing audit and its limits are in docs/DESIGN_AUDIT_2026-10-23.md.

### Visual truth and comparison evidence

Source captures from this audit: docs/design-audit/51-audit-catalog-before.jpg, 52-audit-booking-form-before.jpg, 53-audit-owner-overview-before.jpg, 54-audit-settings-before.jpg, 55-audit-cleaner-jobs-before.jpg, 56-audit-desktop-before.jpg. Implementations: 57-audit-desktop-after.jpg, 58-audit-owner-overview-after.jpg, 59-audit-catalog-after.jpg, 60-audit-booking-form-after.jpg, 61-audit-quote-review.jpg, 62-audit-cleaner-jobs-after.jpg, 63-audit-settings-after.jpg, 64-audit-desktop-catalog-after.jpg and 68-audit-guest-overview-after.jpg in the same local directory.

Phone captures: 390×844 pixels at a 390×844 CSS viewport. Desktop captures: 1280×900 pixels at a 1280×900 CSS viewport. No density scaling or device frame normalization was needed. Additional browser checks used 320×640. Source and revised catalog/settings show the same role, route and initial state. Form captures use the same daily tariff, apartment and initial guest count; generated time differs by minutes. The owner and cleaner before captures show the unintended automatic scroll; the revised page entry intentionally remains at the top.

Opened and reviewed full comparisons: 65-audit-catalog-comparison.png, 66-audit-form-comparison.png and 67-audit-settings-comparison.png (780×844, two unchanged-size captures). Opened and reviewed focused detail: 69-audit-settings-detail.png, showing the earlier clipped mode and its revised name/explanation. Screenshots are local evidence and are not included in GitHub uploads.

### Findings, fixes and iteration history

- P1, page entry: automatic assistant messages scrolled overview/jobs away from their headings and primary records. Replaced repeated automatic messages with a compact overview recommendation based on server-filtered prompts. Confirmed guest overview scrollTop=0; the owner recommendation opens the matching existing task.
- P2, hierarchy and duplication: retained one role label in the header, added useful page descriptions, removed repeated introductory paragraphs and the duplicate automatic plan in list pages. Primary record and overview headings use h2. Warm attention styling applies only when the count is nonzero.
- P2, desktop layout: primary cards use the content width; the catalog uses two 411px columns at 1280px. Prices/actions align at the card bottom. Verified actual grid and card bounds in the browser.
- P2, mobile form: the original card lost width to the avatar column. The first revised comparison revealed that placing the avatar on its own row wasted vertical space. Fixed the message with a two-column grid: avatar and introductory text share the first row; the form spans both columns. Recaptured 60 and rebuilt/reopened comparison 66. Dates and guest count remain readable; no horizontal overflow at 320px.
- P2, settings: shortened selectable mode names and added an associated description. The former repeat control was removed because the persistent recommendation no longer repeats messages; its saved value remains unchanged in API submissions. Checked description updates without saving settings.
- P2, clarity/accessibility: darker navigation icons, distinct active fill, textual status chips, apartment-specific accessible selection names, visible field focus and a 44px brand-button target. Existing 48×48 phone navigation targets are preserved.
- P3 polish found in comparison: amount and unit spacing was tight; added explicit spacing. Shortened the composer placeholder so it stays on one line at 320px.

No actionable P0/P1/P2 issue remains within this implemented scope. Real listing photography, all account/long-form states and full assistive-technology coverage remain separate product/audit work, not certified by this pass.

### Required surfaces and verification

- Typography: retained Golos Text, strengthened page/card hierarchy, kept 16px form controls, shortened clipped mode labels, and checked wrapping at 320/390px.
- Spacing/layout: consistent 18px phone cards, full-width message forms, responsive catalog columns, unchanged safe-area-aware rounded dock. Composer and dock do not overlap.
- Colors/tokens: retained the warm neutral/green palette, strengthened icon contrast, used both text and warm color for urgent items, and avoided warning emphasis on zero attention count.
- Assets: existing Lucide icons and native rasterizations retained; no fake apartment photos, decorative generated imagery or new dependencies introduced.
- Copy/content: page-specific descriptions, explicit mode explanations, honest demo and integration statuses. No new capabilities claimed by the presentation.

Interactions checked: role navigation; opening a recommendation; apartment selection; occupied-interval error; successful quote with separate deposit; mode-description updates; More menu, Escape and trigger focus restoration. No booking or payment was submitted. Browser error logs: none. Web and native TypeScript checks pass; final web build passes. Native source parity was typechecked, not visually verified on a physical device. Full screen-reader, system text scaling and financial/identity flows were not tested.

## Activity clocks and chat decisions (23.10.2026)

final result: passed

The user's functional brief adds clocks and cross-role decision cards within the existing visual language; the icon rail, translucent dock, Golos Text and warm green surfaces are retained. New screens were verified in the browser with isolated, explicitly labelled local teaching records. The temporary records were removed after verification; their properties, bookings and jobs were all confirmed absent. Existing bookings and applications were not modified by this UI check.

Accepted evidence in docs/design-audit/: 70-booking-approval.jpg (owner incoming booking, conditions), 71-active-stay-timer.jpg (owner overview, actual stay), 72-calendar-countdowns.jpg (compact stay clock), 74-approval-decision-buttons.jpg (conditions and accept/reject buttons), 75-cleaner-active-timer.jpg (final cleaner overview and current-work recommendation), 77-desktop-activity-timers.jpg (desktop). File 73 was rejected because keyboard scrolling overshot today's record; it is not acceptance evidence. File 76-timers-and-approvals.png combines the final phone clock and the decision controls at original size and was opened and reviewed. These are different feature states, not a pixel-fidelity comparison of the same route.

Phone evidence is 390×844 CSS/pixels; desktop is 1280×900. No density resizing. Also checked 320×640: document width equals viewport, decision buttons exceed 44px in height and stay within the viewport. New decision content scrolls within the existing transcript; the composer and dock remain accessible.

The running clocks were observed advancing from 01:58:33 / 00:38:33 to 01:57:38 / 00:37:38 without a data refresh or reset. The calendar shows the same agreed deadline. Reloaded cleaner overview retained its actual start. The updated assistant recommends completing current work, then waiting for acceptance after submission. An owner accepted one teaching booking and rejected another through the new cards; each request disappeared from the pending inbox only after the server updated its status. The UI showed the server's decision result. No bank transaction was performed.

Typography/numbers: tabular numerals, 21–23px primary countdown, smaller calendar counter. Long unknown legacy-time labels wrap at normal text size. Layout: full-width cards and a consistent field/action layout, equal stretched decision buttons, short summary links from overview. Colors: green running state, warm overdue state, neutral waiting/stopped state, with text labels for every state. Assets: existing Lucide clock/message/check/cross icons; no added raster assets or fabricated property pictures. Copy explicitly separates stopping a clock from confirming vacancy, cleanliness or payment.

Verification: 50 service tests plus 17 HTTP tests pass, including persistence after restarting the HTTP server, stale and forged revisions, role isolation, repeated decisions, expired booking holds, report rework/resubmission and unchanged clock origin. Web/native TypeScript and final web build pass. Expo exports Android, iOS and web. Browser error logs are empty. Native physical-device interaction and full assistive-technology certification remain outside this check. No actionable P0/P1/P2 finding remains for the implemented feature scope.

## Listing galleries and role profile forms (23.10.2026)

final result: passed

The requested extension retains the green/warm surfaces, existing two-column desktop property grid, icon rail and translucent phone dock. Property cards now have a consistent photo region, readable facts, current operational status, expandable terms and a rate with an explicit 24-hour unit. Owners get a separate edit form, a gallery/cover editor, draft visibility and publication validation. A published card does not assert vacancy. Worker cards use real job states and the saved availability setting. No simulated ratings, verification or online presence.

An isolated local QA object was created through the browser form, with an explicitly described 8×8 green colour-patch image. This is upload evidence, not a photograph of an apartment. Upload, draft save, prefilled editing, changing type/area/hourly rate/deposit, publication and reload were observed against the real API. Its status remained inspection after publishing. The QA property was marked as a user-isolated teaching object before publication, then removed together with its photo, policy and audit entries. A narrow ID/owner/title check confirmed zero remaining QA objects. Existing properties, profiles, bookings and jobs were not changed by this browser exercise.

Evidence in docs/design-audit/: 78-listing-conditions-mobile.jpg (390×844; expanded conditions and deposit), 79-listing-desktop.jpg (1280×1000; persisted upload and property grid), 81-property-form-mobile.jpg (390×844; actual form fields and private-address label). File 80 is rejected as form evidence because PageUp overshot into the previous property card. No images are uploaded to GitHub. At 320×740, the form is 278px wide, inputs fit the viewport and document width does not overflow. At 390px and 1280px document width also stays within the viewport. Profile editing and the upload input were checked in the account page; all enabled-role fields are present and the fresh page has no browser errors. Personal profile values were not captured in screenshots.

Final verification: 55 service tests, 18 HTTP tests, both TypeScript checks, production web build and Expo Android/iOS/web exports pass. Tests cover EXIF removal, private draft images, ownership, profile role spoofing, stale versions, disabled worker availability and persisted images after server restart, alongside existing booking and cleaning scenarios. Native picker interaction on a physical device and a complete screen-reader audit remain unverified. Photos use bounded D1/SQLite storage for the pilot; production-scale object storage is described in docs/LISTINGS_PROFILES.md.
