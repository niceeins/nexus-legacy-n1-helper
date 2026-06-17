# Changelog

## 0.7.10

- Avoid recommending blocked building upgrades as the primary action when the queue is full.
- Prefer free Fleet Slots as the next useful action when cached Fleet data is fresh and buildings are blocked.

## 0.7.9

- Hardened global recommendation state so tips no longer depend as strongly on the active tab.
- Fixed false Fleet Slot parsing such as `59229/3`.
- Hardened Research Lab level parsing to avoid merged DOM-number artifacts.
- Changed Mining status handling so non-fleet tabs show `unknown` instead of false negatives.
- Improved cache freshness display and debug parser diagnostics.
- Extended smoke checks for passive-helper safety and parser edge cases.

## 0.7.8

- Reworked the top overlay into a single Command Center with one primary action.
- Added a separate running-builds summary so active upgrades are visible but not re-recommended.
- Moved detailed advisor/debug data behind quieter collapsed sections.
- Fixed collapsed rail positioning and widened the visible side rail.
- Removed unused legacy render markup and cleaned up UTF-8 text issues.

## 0.7.7

- Preserve detailed building cache data when visiting Overview so active upgrades and costs are not lost.
- Prefer richer building records during merge, especially `/buildings` entries with button/status data.

## 0.7.6

- Fixed fleet slot parsing when Nexus renders `1 / 3active` without spacing.
- Detect active building upgrades and stop recommending buildings that are already running.
- Tightened research prerequisite parsing to avoid combined container prerequisite names.
- Moved the collapsed side rail to the top, made it full panel height, and expanded rail status labels.

## 0.7.5

- Increased DOM dump selector limits so building and research pages export all visible cards.
- Added advisor and next-action details to DOM dump exports.

## 0.7.4

- Added per-page DOM dump capture and copy buttons for current/all visited Nexus pages.

## 0.7.3

- Bumped userscript version so Tampermonkey detects the latest side-rail and encoding fixes.

## 0.7.2

- Added drag-and-drop ordering for detail sections
- Saved custom detail section order in local settings
- Added eye hover button to make the overlay transparent

## 0.7.1

- Compact UI cleanup
- Added grouped overview layout
- Added collapsible detail sections
- Reduced visual noise in the overlay
- Moved debug/data sections behind collapsed panels

## 0.7.0

- Added Next Action Planner
- Added Research Dependency Resolver
- Added 30/60/120 minute session plan
- Improved building advisor scoring
- Added data quality/debug section
- Added local cache export/copy support
- Improved onboarding hints for first-time users

## 0.6.0

- Added building advisor
- Added next building recommendation
- Added early-game building priority order
- Added phase-aware building scoring
- Improved guide-based building reasoning

## 0.5.0

- Added guide checklist
- Added Anomaly Scanning goal mode
- Added research cache completeness hint
- Improved early-game progress display

## 0.4.1

- Fixed incorrect fleet values such as `59229/3`
- Fixed incorrect lab level parsing such as `Lab Lv.331`
- Added research cache across branches
- Added fleet/mining cache across pages
- Added cache reset button

## 0.4.0

- Added affordability checks
- Added missing resource display
- Added wait-time estimates
- Added better immediate action recommendations

## 0.3.0

- Added guide-based research and building recommendations
- Added basic fleet and mining warnings
- Added resource overview

## 0.1.0

- Initial passive overlay prototype
