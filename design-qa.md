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
