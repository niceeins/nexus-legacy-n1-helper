const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'nexus-legacy-helper.user.js'), 'utf8');

function includes(text, message) {
  assert(source.includes(text), message || `Expected source to include ${text}`);
}

includes('@version      0.6.0', 'userscript header version should be 0.6.0');
includes('<span class="nlh-version">v0.6.0</span>', 'panel version should be v0.6.0');

[
  'function getBuildingAdvisor(resources, buildings, researchItems, fleetState)',
  'function scoreBuildingCandidate(building, context)',
  'function getBuildingPhase(context)',
  'function getBuildingAdvisorReason(building, context)',
  'function getBuildingAdvisorWarnings(building, context)',
  'function renderBuildingAdvisor(advisor)'
].forEach(fn => includes(fn, `${fn} should exist`));

[
  'Gebäudeberater',
  'Nächstes Gebäude',
  'Reihenfolge',
  'Phase:',
  "anomaly_rush: 'Anomaly Rush'",
  "sentinel_setup: 'Sentinel Setup'",
  "economy_stabilize: 'Economy Stabilize'",
  'Research Lab Lv3 ist zentral für den Anomaly-Scanning-Pfad.',
  'Energie ist knapp. Ohne freie Energie blockieren weitere Produktionsgebäude.',
  'Guide sagt: Früh sind Ressourcen der Engpass, nicht Bauzeit/Storage.'
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

console.log('building advisor source checks passed');
