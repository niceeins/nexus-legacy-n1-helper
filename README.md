# Nexus Legacy N1 Helper

Passive Tampermonkey helper overlay for **Nexus Legacy**.

The helper reads the visible game page and shows guide-based recommendations for:

- research priorities
- next action planning
- research dependency planning
- 30/60/120 minute session planning
- next building recommendations
- resource bottlenecks
- fleet/mining status
- early-game progress
- Anomaly Scanning rush path

It is designed as a planning and guide overlay only.

## Important

This is **not a bot**.

The helper does **not**:

- click buttons
- start buildings
- start research
- start fleet missions
- send hidden API requests
- automate gameplay

It only reads visible page data from the browser DOM and stores helper data locally in `localStorage`.

## Installation

Install Tampermonkey:

https://www.tampermonkey.net/

Then open the raw userscript URL:

https://raw.githubusercontent.com/niceeins/nexus-legacy-n1-helper/main/nexus-legacy-helper.user.js

Tampermonkey should offer to install the script automatically.

## Usage

Open Nexus Legacy normally.

The helper overlay should appear in the bottom-right corner.

For best results, open these pages once so the helper can cache visible data locally:

- Overview
- Fleet
- Mining
- Buildings
- Research -> Science
- Research -> Economy
- Research -> Military

If a page has not been scanned recently, the overlay keeps the last valid cache data but marks that area as stale or unknown. For example, Buildings will not claim there are no Mining missions just because Fleet/Missions data is missing.

## Updates

Tampermonkey can update the script from GitHub because the userscript contains:

```js
// @updateURL    https://raw.githubusercontent.com/niceeins/nexus-legacy-n1-helper/main/nexus-legacy-helper.user.js
// @downloadURL  https://raw.githubusercontent.com/niceeins/nexus-legacy-n1-helper/main/nexus-legacy-helper.user.js
```

To update manually:

Tampermonkey Dashboard -> Nexus Legacy Helper -> Check for userscript updates

## Features

Current features include:

- passive overlay
- resource parsing
- storage/cap warnings
- fleet/mining status
- research cache across branches
- building cache
- local cache/debug export
- guide-based early-game checklist
- Anomaly Scanning goal mode
- Next Action Planner
- Research Dependency Resolver
- 30/60/120 minute session plan
- next building recommendation
- building priority order
- data quality/debug status
- cache freshness and parser diagnostics
- first-time onboarding hints
- affordability and wait-time estimates

## Safety / Fair Play

This helper is intentionally passive.

It does not automate actions and does not play the game for the user. It is closer to a checklist, calculator and note overlay than a bot.

## Repository

Main userscript:

```text
nexus-legacy-helper.user.js
```

Raw install URL:

```text
https://raw.githubusercontent.com/niceeins/nexus-legacy-n1-helper/main/nexus-legacy-helper.user.js
```

## Disclaimer

This project is unofficial and not affiliated with Nexus Legacy.
