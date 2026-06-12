const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'nexus-legacy-helper.user.js'), 'utf8');

function includes(text, message) {
  assert(source.includes(text), message || `Expected source to include ${text}`);
}

includes('@version      0.7.4', 'userscript header version should be 0.7.4');
includes('<span class="nlh-version">v0.7.4</span>', 'panel version should be v0.7.4');

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
  'function renderCollapsibleSection(id, title, html, options = {})',
  'function normalizeSectionOrder(order)',
  'function renderOrderedDetailSections(sectionMap)',
  'function setupSectionDragAndDrop(panel)',
  'function setupPeekHover(panel)',
  'function renderTopSummary(nextActionPlanner, buildingAdvisor, goalState, warningList, cacheHint)',
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
  'const isCompleted',
  'isCompleted,',
  'completed|complete|done|researched|finished|erledigt|abgeschlossen',
  'item.isCompleted',
  "state: 'erledigt'",
  'prereqs:',
  "card.querySelectorAll('.prereq",
  'unknownDataHints',
  'idleRisks',
  'skippedLowPriority',
  'dataQuality'
].forEach(text => includes(text, `Expected planner/dependency data: ${text}`));

[
  'Next Action',
  'Research Plan',
  'Session Plan',
  'Datenstatus',
  'Debug kopieren',
  'DOM Dump kopieren',
  'Alle Dumps kopieren',
  'domDumpPages',
  'data-dump-current',
  'data-dump-all',
  'Aktuell wichtig',
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
  'aff.waitHours > 6'
].forEach(text => includes(text, `Expected scoring rule: ${text}`));

assert(!/\bfetch\s*\(/.test(source), 'script must not call fetch()');
assert(!/\bXMLHttpRequest\b/.test(source), 'script must not use XMLHttpRequest');
assert(!/\.click\s*\(/.test(source), 'script must not perform DOM clicks');
assert(!/\bPOST\b|\bPUT\b|\bDELETE\b/.test(source), 'script must not contain write request verbs');
assert(!/[ÃÂ�]/.test(source), 'userscript must not contain mojibake/broken UTF-8 characters');
includes("right: -388px;", 'collapsed panel should slide right into a side rail');
includes("writing-mode: vertical-rl;", 'collapsed panel should keep a vertical side rail header');
includes('function renderRailStatus(resources, warningList)', 'collapsed rail should render key resource info');
includes('class="nlh-rail-status"', 'collapsed rail should have a visible status container');
includes('⚠', 'collapsed rail should show an alert marker when important warnings exist');

console.log('v0.7.4 planner source checks passed');
