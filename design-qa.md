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
- Phone has overview, a role-specific primary section, assistant, More, and account. Other sections remain reachable through More.
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
