const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'nexus-legacy-helper.user.js'), 'utf8');

function includes(text, message) {
  assert(source.includes(text), message || `Expected source to include ${text}`);
}

function extractFunction(name) {
  const start = source.indexOf(`function ${name}`);
  assert(start >= 0, `Expected function ${name} to exist`);
  const signatureEnd = source.indexOf(') {', start);
  assert(signatureEnd >= 0, `Expected function ${name} signature to end with ) {`);
  const open = signatureEnd + 2;
  let depth = 0;

  for (let index = open; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }

  throw new Error(`Could not extract function ${name}`);
}

function loadParserSandbox() {
  const sandbox = {
    diagnostics: {
      fleetSlotCandidates: [],
      rejectedFleetSlotCandidates: [],
      researchLabLevelCandidates: [],
      rejectedLevelCandidates: []
    }
  };
  vm.createContext(sandbox);
  vm.runInContext('function getParserDiagnostics() { return diagnostics; }', sandbox);
  vm.runInContext(`${extractFunction('parseFleetSlotsSafe')}; this.parseFleetSlotsSafe = parseFleetSlotsSafe;`, sandbox);
  vm.runInContext(`${extractFunction('parseLevelFromLabel')}; this.parseLevelFromLabel = parseLevelFromLabel;`, sandbox);
  return sandbox;
}

includes('@version      0.7.11', 'userscript header version should be 0.7.11');
includes('<span class="nlh-version">v0.7.11</span>', 'panel version should be v0.7.11');

[
  'function getBuildingAdvisor(resources, buildings, researchItems, fleetState)',
  'function getResearchByName(researchItems, name)',
  'function getResearchState(researchItems, name)',
  'function buildResearchDependencyPlan(targetName, researchItems, buildings)',
  'function buildNextActionPlanner(resources, buildings, researchItems, fleetState, goalState, buildingAdvisor)',
  'function buildSessionPlan(resources, buildings, researchItems, fleetState, nextActionPlanner, buildingAdvisor)',
  'function renderNextAction(planner)',
  'function renderResearchPlan(plan)',
  'function renderSessionPlan(plan)',
  'function renderDataQuality(dataQuality)',
  'function captureDomDump()',
  'function getAllDomDumps()',
  'function copyDomDump(allPages = false)',
  'function getDomDumpPayload()',
  'function renderCollapsibleSection(id, title, html, options = {})',
  'function normalizeSectionOrder(order)',
  'function renderOrderedDetailSections(sectionMap)',
  'function setupSectionDragAndDrop(panel)',
  'function setupPeekHover(panel)',
  'function renderTopSummary(nextActionPlanner, buildingAdvisor, goalState, warningList, cacheHint)',
  'function renderCommandCenter(nextActionPlanner, runningBuildings, warningList)',
  'function renderRunningBuildings(buildings)',
  'function renderDataQualityCompact(dataQuality)',
  'function renderCompactDashboard(currentStatus, fleet, dataQuality, resources)',
  'function renderCompactResources(resources)',
  'function copyDebugData()',
  'function scoreBuildingCandidate(building, context)',
  'function getBuildingPhase(context)',
  'function getBuildingAdvisorReason(building, context)',
  'function getBuildingAdvisorWarnings(building, context)',
  'function renderBuildingAdvisor(advisor)'
].forEach(fn => includes(fn, `${fn} should exist`));

[
  'const CACHE_TTL = {',
  'function cacheMeta(section, updatedAt)',
  'function isCacheStale(section, updatedAt)',
  'function markCacheUpdate(snapshots, section)',
  'function parseFleetSlotsSafe(text)',
  'function chooseFleetSlotCandidate(candidates)',
  'function parseLevelFromLabel(text, labels, options = {})',
  'function getParserDiagnostics()',
  'function buildGlobalRecommendations(resources, buildings, researchItems, fleetState, buildingAdvisor, nextActionPlanner)',
  'function sortRecommendations(recommendations)',
  'function isUsablePrimaryItem(item)',
  'function isResearchQueueBusy(researchItems)',
  'const researchQueueBusy = isResearchQueueBusy(researchItems)',
  '!researchQueueBusy && anomaly.startable',
  '!researchQueueBusy && basicSensors.startable',
  '!researchQueueBusy && researchPlan.nextResearch?.startable',
  "action.kind === 'research' && researchQueueBusy",
  "actionState = 'Forschung läuft'",
  'buildingAdvisor.recommended && isUsablePrimaryItem(buildingAdvisor.recommended)',
  'fleetState.free > 0',
  'Fleet Slot nutzen',
  "id: 'fleet_slots_available'",
  "source: ['fleet-cache', 'global-state']",
  "source: ['research-cache', 'global-state']",
  "source: ['mining-cache', 'global-state']",
  "miningStatus: fleet.miningStatus || 'unknown'",
  "if (isMiningContext(path))",
  "Mining unbekannt",
  "Fleet/Missions-Tab noch nicht aktuell gescannt",
  "Parser-Kandidaten",
  "verworfene Fleet-Slot-Kandidaten",
  "Research-Lab-Level-Kandidaten",
  "Cache-Alter",
  "finale Recommendation-Liste",
  "Top-Empfehlung"
].forEach(text => includes(text, `Expected v0.7.9 hardening hook: ${text}`));

const fleetParserBody = source.slice(
  source.indexOf('function parseFleetSlotsSafe(text)'),
  source.indexOf('function chooseFleetSlotCandidate(candidates)')
);
assert(fleetParserBody.includes('(\\d{1,2})\\s*\\/\\s*(\\d{1,2})'), 'fleet parser should only accept one- or two-digit slot fractions');
assert(fleetParserBody.includes('max > 20'), 'fleet parser should reject implausible max slots');
assert(fleetParserBody.includes('used > max'), 'fleet parser should reject used slots above max');
assert(!fleetParserBody.includes('(\\d+)\\s*\\/\\s*(\\d+)'), 'fleet parser must not accept arbitrary long fractions such as 59229/3');

const levelParserBody = source.slice(
  source.indexOf('function parseLevelFromLabel(text, labels, options = {})'),
  source.indexOf('function currentResearchBranch()')
);
assert(levelParserBody.includes('\\\\d{1,2}'), 'level parser should only accept one- or two-digit levels');
assert(levelParserBody.includes('level > 99'), 'level parser should reject impossible levels such as 331');
assert(levelParserBody.includes('Research Lab') && levelParserBody.includes('Research Laboratory'), 'research lab labels should be explicit');

assert(!source.includes("Lab Level 331'"), 'source should not preserve Lab Level 331 as an accepted fixture');
assert(!source.includes('59229/3`.'), 'source should not document 59229/3 as a valid fleet value');

const parserSandbox = loadParserSandbox();
assert.strictEqual(parserSandbox.parseFleetSlotsSafe('59229/3'), null, 'fleet parser should reject 59229/3');
assert.deepStrictEqual(
  (({ usedSlots, maxSlots, freeSlots }) => ({ usedSlots, maxSlots, freeSlots }))(parserSandbox.parseFleetSlotsSafe('2/3')),
  { usedSlots: 2, maxSlots: 3, freeSlots: 1 },
  'fleet parser should accept 2/3'
);
assert.deepStrictEqual(
  (({ usedSlots, maxSlots, freeSlots }) => ({ usedSlots, maxSlots, freeSlots }))(parserSandbox.parseFleetSlotsSafe('Fleet Slots: 2 / 3')),
  { usedSlots: 2, maxSlots: 3, freeSlots: 1 },
  'fleet parser should accept Fleet Slots: 2 / 3'
);
assert.strictEqual(
  parserSandbox.parseLevelFromLabel('Lab Level 331', ['Research Lab', 'Research Laboratory', 'Forschungslabor', 'Lab'], { allowShortLab: true }),
  null,
  'level parser should reject Lab Level 331'
);
assert.strictEqual(
  parserSandbox.parseLevelFromLabel('Research Lab Level 7', ['Research Lab', 'Research Laboratory', 'Forschungslabor', 'Lab'], { allowShortLab: true }),
  7,
  'level parser should accept Research Lab Level 7'
);

[
  'const isCompleted',
  'isCompleted,',
  'completed|complete|done|researched|finished|erledigt|abgeschlossen',
  'item.isCompleted',
  "state: 'erledigt'",
  'prereqs:',
  "card.querySelectorAll('.prereq,.prerequisite')",
  'const isUpgrading',
  'isUpgrading,',
  'item.isUpgrading',
  "actionState = 'läuft'",
  'building.isUpgrading',
  'function buildingMergeWeight(item)',
  "item.source === 'buildings'",
  "item.source === 'overview'",
  'const hasDetailedCurrent',
  'snapshots.buildings = hasDetailedCurrent',
  'unknownDataHints',
  'idleRisks',
  'skippedLowPriority',
  'dataQuality'
].forEach(text => includes(text, `Expected planner/dependency data: ${text}`));

[
  'Research Plan',
  'Session Plan',
  'Debug kopieren',
  'DOM Dump kopieren',
  'Alle Dumps kopieren',
  'dumpElements(selector, limit = 200)',
  'advisor: getDomDumpAdvisor()',
  '(\\d{1,2})\\s*\\/\\s*(\\d{1,2})(?!\\d)',
  'domDumpPages',
  'data-dump-current',
  'data-dump-all',
  'bottom: 14px;',
  'right: -342px;',
  'width: 88px;',
  'height: 84vh;',
  'order: -1;',
  'Energie frei',
  'Silicates',
  'Command Center',
  'Primäre Aktion',
  'Läuft gerade',
  'Keine laufenden Builds erkannt',
  'Debug öffnen',
  'Compact Dashboard',
  'Compact',
  'Details',
  'data-section="${esc(id)}"',
  "renderCollapsibleSection('research-plan'",
  "renderCollapsibleSection('data-debug'",
  'settings.compactMode',
  'settings.sectionOpen',
  'settings.sectionOrder',
  'draggable="true"',
  'data-section-drag',
  "addEventListener('dragstart'",
  "addEventListener('drop'",
  'nlh-peek',
  'peek-transparent',
  '&#128065;',
  "addEventListener('mouseenter'",
  'Geb',
  'N',
  'Reihenfolge',
  'Phase:',
  "anomaly_rush: 'Anomaly Rush'",
  "sentinel_setup: 'Sentinel Setup'",
  "economy_stabilize: 'Economy Stabilize'",
  'Research Lab Lv3',
  'Energie ist knapp'
].forEach(text => includes(text, `Expected UI/advisor copy: ${text}`));

[
  'energyFree < 40',
  'energyRatio >= 0.92',
  'researchLabLevel < 3',
  "name === 'solar plant'",
  "name === 'research lab'",
  "name === 'storage complex'",
  "name === 'construction yard'",
  'aff.waitHours <= 1',
  'aff.waitHours > 6',
  'score -= 900'
].forEach(text => includes(text, `Expected scoring rule: ${text}`));

assert(!/\bfetch\s*\(/.test(source), 'script must not call fetch()');
assert(!/\bXMLHttpRequest\b/.test(source), 'script must not use XMLHttpRequest');
assert(!/\.click\s*\(/.test(source), 'script must not perform DOM clicks');
assert(!/\bPOST\b|\bPUT\b|\bDELETE\b/.test(source), 'script must not contain write request verbs');
assert(!/[ÃÂ�]/.test(source), 'userscript must not contain mojibake/broken UTF-8 characters');
includes("right: -342px;", 'collapsed panel should slide right into a wider side rail');
includes("writing-mode: vertical-rl;", 'collapsed panel should keep a vertical side rail header');
includes('function renderRailStatus(resources, warningList)', 'collapsed rail should render key resource info');
includes('class="nlh-rail-status"', 'collapsed rail should have a visible status container');
includes('⚠', 'collapsed rail should show an alert marker when important warnings exist');

includes('const runningBuildings = buildings.filter(building => building.isUpgrading)', 'render should derive running buildings once');
includes("renderCommandCenter(nextActionPlanner, runningBuildings, warningList)", 'top UI should use command center');
includes("'building-order': renderCollapsibleSection('building-order', 'Gebäudeberater'", 'building detail title should be advisor not duplicate order');
includes("'data-debug': renderCollapsibleSection('data-debug', 'Debug', renderDataQuality(dataQuality)", 'debug detail title should be short');
includes("defaultOpen: false,\n        badge: buildingAdvisor.recommended", 'building detail should start collapsed');

const bodyRenderMatches = source.match(/panel\.querySelector\('\.nlh-body'\)\.innerHTML =/g) || [];
assert.strictEqual(bodyRenderMatches.length, 1, 'render should assign .nlh-body innerHTML once');

console.log('v0.7.11 planner source checks passed');
