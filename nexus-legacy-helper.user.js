// ==UserScript==
// @name         Nexus Legacy Helper
// @namespace    https://niceeins.local/
// @version      0.7.5
// @description  Passive guide-based helper for Nexus Legacy: resources, build/research hints, affordability, wait times, research/fleet cache. No automation.
// @match        https://*.nexuslegacy.space/*
// @match        https://nexuslegacy.space/*
// @run-at       document-idle
// @grant        none
// @updateURL    https://raw.githubusercontent.com/niceeins/nexus-legacy-n1-helper/main/nexus-legacy-helper.user.js
// @downloadURL  https://raw.githubusercontent.com/niceeins/nexus-legacy-n1-helper/main/nexus-legacy-helper.user.js
// ==/UserScript==

(() => {
  'use strict';

  const PANEL_ID = 'nlh-panel';
  const SETTINGS_KEY = 'nexusLegacyHelper.v041.settings';
  const SNAPSHOT_KEY = 'nexusLegacyHelper.v041.snapshots';
  const DOM_DUMP_KEY = 'nexusLegacyHelper.v041.domDumps';
  const GUIDE = 'Determinator Beginner Guide';

  const GUIDE_TECH_ORDER = [
    'Basic Sensors',
    'Probe Technology',
    'Structural Alloys',
    'Orbital Mechanics',
    'Anomaly Scanning',
    'Fleet Coordination',
    'Navigation Computer',
    'Workforce Management'
  ];

  const GUIDE_BUILD_ORDER = [
    'Research Lab',
    'Ore Mine',
    'Silicate Mine',
    'Solar Plant',
    'Hydrogen Processor',
    'Alloy Foundry',
    'Residential Complex',
    'Bio Complex'
  ];

  const DETAIL_SECTION_ORDER = [
    'research-plan',
    'building-order',
    'session-plan',
    'checklist',
    'resources',
    'data-debug',
    'priorities',
    'guide-path'
  ];

  const LOW_EARLY_PRIORITY = new Set([
    'storage complex',
    'construction yard',
    'expanded warehousing',
    'basic armor plating',
    'laser weapons',
    'fighter doctrine'
  ]);

  const settings = normalizeSettings(loadJson(SETTINGS_KEY, {}));

  function normalizeSettings(raw) {
    return {
      collapsed: !!raw.collapsed,
      compactMode: !!raw.compactMode,
      sectionOrder: normalizeSectionOrder(raw.sectionOrder),
      sectionOpen: {
        ...{
          'research-plan': true,
          'building-order': true,
          'session-plan': false,
          checklist: false,
          resources: false,
          'data-debug': false,
          priorities: false,
          'guide-path': false
        },
        ...(raw.sectionOpen || {})
      }
    };
  }

  function normalizeSectionOrder(order) {
    const seen = new Set();
    const normalized = [];

    for (const id of Array.isArray(order) ? order : []) {
      if (DETAIL_SECTION_ORDER.includes(id) && !seen.has(id)) {
        seen.add(id);
        normalized.push(id);
      }
    }

    for (const id of DETAIL_SECTION_ORDER) {
      if (!seen.has(id)) normalized.push(id);
    }

    return normalized;
  }

  function loadJson(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key)) || fallback;
    } catch {
      return fallback;
    }
  }

  function saveJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function getSnapshots() {
    return loadJson(SNAPSHOT_KEY, {
      researchByBranch: {},
      buildings: [],
      fleet: null,
      updatedAt: null
    });
  }

  function saveSnapshots(snapshots) {
    snapshots.updatedAt = Date.now();
    saveJson(SNAPSHOT_KEY, snapshots);
  }

  function getAllDomDumps() {
    const raw = loadJson(DOM_DUMP_KEY, {});
    return raw && typeof raw === 'object' ? raw : {};
  }

  function compactHtml(value) {
    return String(value || '')
      .replace(/\s+/g, ' ')
      .replace(/>\s+</g, '><')
      .trim();
  }

  function dumpElements(selector, limit = 200) {
    return [...document.querySelectorAll(selector)]
      .slice(0, limit)
      .map((el, index) => ({
        index,
        text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 1200),
        html: compactHtml(el.outerHTML).slice(0, 12000)
      }));
  }

  function getDomDumpAdvisor() {
    const resources = getResources();
    const buildings = getBuildings();
    const research = getResearch();
    const fleet = fleetState();
    const advisor = getBuildingAdvisor(resources, buildings, research, fleet);
    const goalState = buildGoalState(resources, buildings, research, fleet);
    const nextAction = buildNextActionPlanner(resources, buildings, research, fleet, goalState, advisor);

    return {
      phase: advisor.phase,
      recommended: advisor.recommended,
      queue: advisor.queue,
      notes: advisor.notes,
      nextAction: nextAction.primaryAction,
      nextActionReason: nextAction.explanation
    };
  }

  function captureDomDump() {
    const key = location.pathname + location.search;
    const dump = {
      version: '0.7.5',
      capturedAt: new Date().toISOString(),
      path: key,
      title: document.title,
      domDumpPages: Object.keys(getAllDomDumps()).sort(),
      selectors: {
        resources: dumpElements('.resource-bar .resource-item'),
        overviewBuildings: dumpElements('.ov-bld-card'),
        buildings: dumpElements('.building-card'),
        research: dumpElements('.research-card'),
        fleet: dumpElements('.fleet-missions-card,.fleet-page,.fleet-section,.missions-list,.mission-card,.ov-mission-card,[class*="mission-card"]'),
        status: dumpElements('.bld-stat-chip,.res-hero-sub,.sidebar-link')
      },
      parsed: {
        resources: getResources(),
        buildings: getBuildings(),
        research: getResearch(),
        fleet: fleetState()
      },
      advisor: getDomDumpAdvisor()
    };

    const all = getAllDomDumps();
    all[key] = dump;
    saveJson(DOM_DUMP_KEY, all);
    return dump;
  }

  function getDomDumpPayload() {
    return {
      version: '0.7.5',
      exportedAt: new Date().toISOString(),
      pages: getAllDomDumps()
    };
  }

  function esc(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function norm(value) {
    return String(value || '')
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase();
  }

  function cleanName(value) {
    return String(value || '')
      .replace(/Lv\.?\s*\d+.*$/i, '')
      .replace(/Level\s*\d+.*$/i, '')
      .replace(/[✓✔🔒]/g, '')
      .replace(/→.*$/i, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function parseNum(value) {
    if (value == null) return null;

    let raw = String(value)
      .trim()
      .replace(/\s/g, '')
      .replace('+', '')
      .replace('/h', '');

    if (!raw) return null;

    if (/k$/i.test(raw)) {
      const n = parseFloat(raw.replace(/k$/i, '').replace(',', '.'));
      return Number.isFinite(n) ? n * 1000 : null;
    }

    if (/^\d{1,3}(\.\d{3})+$/.test(raw)) {
      raw = raw.replaceAll('.', '');
    } else {
      raw = raw.replace(',', '.');
    }

    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : null;
  }

  function fmtNum(value) {
    if (!Number.isFinite(value)) return '?';

    if (value >= 1000000) {
      return `${(value / 1000000).toFixed(2).replace(/\.00$/, '')}M`;
    }

    if (value >= 1000) {
      return `${(value / 1000).toFixed(value >= 10000 ? 1 : 2).replace(/\.00$/, '')}K`;
    }

    return `${Math.ceil(value)}`;
  }

  function fmtTime(hours) {
    if (!Number.isFinite(hours)) return 'unbekannt';
    if (hours <= 0) return 'jetzt';

    const mins = Math.ceil(hours * 60);

    if (mins < 60) return `${mins}m`;

    const h = Math.floor(mins / 60);
    const m = mins % 60;

    if (h < 24) {
      return m ? `${h}h ${m}m` : `${h}h`;
    }

    const d = Math.floor(h / 24);
    const rh = h % 24;

    return rh ? `${d}d ${rh}h` : `${d}d`;
  }

  function mergeByName(items) {
    const map = new Map();

    for (const item of items) {
      if (!item?.name) continue;

      const key = `${item.kind}:${norm(item.name)}`;
      const old = map.get(key);

      if (!old) {
        map.set(key, item);
        continue;
      }

      const oldWeight =
        (old.fromCache ? 0 : 20) +
        (old.isStartable ? 10 : 0) -
        (old.isBlocked ? 4 : 0);

      const newWeight =
        (item.fromCache ? 0 : 20) +
        (item.isStartable ? 10 : 0) -
        (item.isBlocked ? 4 : 0);

      if (newWeight >= oldWeight) {
        map.set(key, { ...old, ...item });
      }
    }

    return [...map.values()];
  }

  function parseSmallFraction(text) {
    const matches = [...String(text || '').matchAll(/\b(\d{1,2})\s*\/\s*(\d{1,2})\b/g)];

    for (const match of matches) {
      const active = parseInt(match[1], 10);
      const max = parseInt(match[2], 10);

      if (max > 0 && max <= 20 && active >= 0 && active <= max) {
        return { active, max };
      }
    }

    return null;
  }

  function getResources() {
    return [...document.querySelectorAll('.resource-bar .resource-item')]
      .map(parseResourceItem)
      .filter(r => r.name && r.name !== 'Unknown');
  }

  function parseResourceItem(el) {
    const icon = el.querySelector('img');
    const title = el.getAttribute('title') || '';
    const first = title.split('\n')[0] || '';

    const capacityMatch = first.match(/:\s*([0-9.,Kk]+)\s*\/\s*([0-9.,Kk]+)/);
    const energyMatch = first.match(/Energy:\s*([0-9.,Kk]+)\s+used\s*\/\s*([0-9.,Kk]+)\s+produced/i);
    const storageMatch = title.match(/Storage full in:\s*([^\n]+)/i);
    const netMatch = title.match(/Net:\s*([+-]?[0-9.,Kk]+\/h)/i);

    const rate = el.querySelector('.resource-rate')?.textContent?.trim() || '';

    return {
      name: icon?.alt?.trim() || 'Unknown',
      value: el.querySelector('.resource-value')?.textContent?.trim() || '',
      rate,
      amount: capacityMatch ? parseNum(capacityMatch[1]) : null,
      capacity: capacityMatch ? parseNum(capacityMatch[2]) : null,
      usedEnergy: energyMatch ? parseNum(energyMatch[1]) : null,
      producedEnergy: energyMatch ? parseNum(energyMatch[2]) : null,
      storageFullIn: storageMatch ? storageMatch[1].trim() : null,
      net: netMatch ? netMatch[1].trim() : rate,
      netNumber: parseNum(netMatch ? netMatch[1] : rate)
    };
  }

  function getRes(resources, name) {
    return resources.find(r => norm(r.name) === norm(name)) || null;
  }

  function getEnergy(resources) {
    const e = getRes(resources, 'Energy');

    if (!e || e.usedEnergy == null || e.producedEnergy == null) {
      return null;
    }

    return {
      used: e.usedEnergy,
      produced: e.producedEnergy,
      free: e.producedEnergy - e.usedEnergy,
      ratio: e.producedEnergy > 0 ? e.usedEnergy / e.producedEnergy : 1
    };
  }

  function soonFull(text) {
    if (!text) return false;

    const t = text.toLowerCase();

    if (/\d+\s*m/.test(t) && !/\d+\s*d/.test(t)) {
      return true;
    }

    const h = t.match(/(\d+)\s*h/);

    return !!(h && !/\d+\s*d/.test(t) && parseInt(h[1], 10) <= 8);
  }

  function parseCosts(card, selector) {
    const root = card.querySelector(selector);

    if (!root) return [];

    return [...root.querySelectorAll('span[title]')]
      .map(node => {
        const title = node.getAttribute('title') || '';
        const match = title.match(/^([^:]+):\s*([0-9.,Kk]+)/);

        if (!match) return null;

        return {
          name: match[1].trim(),
          amount: parseNum(match[2]),
          text: node.textContent.trim()
        };
      })
      .filter(Boolean);
  }

  function parsePrereqs(card) {
    return [...card.querySelectorAll('.prereq,.prerequisite,[class*="prereq"]')]
      .map(node => {
        const rawText = node.textContent || '';
        const text = rawText
          .replace(/[✓✔🔒]/g, '')
          .replace(/\s+/g, ' ')
          .trim();

        if (!text) return null;

        const classes = node.className || '';
        const missing = /missing|locked|unmet|blocked|not-met|danger/i.test(classes) ||
          /missing|required|locked|benötigt|fehlt/i.test(text) ||
          rawText.includes('🔒');
        const met = !missing && (
          /met|done|complete|completed|ok|success/i.test(classes) ||
          /done|complete|completed|erfüllt|erledigt/i.test(text) ||
          rawText.includes('✓') ||
          rawText.includes('✔')
        );

        return {
          name: cleanName(text.replace(/^(requires?|prereq(?:uisite)?|benötigt|fehlt):?\s*/i, '')),
          met,
          missing
        };
      })
      .filter(item => item?.name);
  }

  function affordability(item, resources) {
    if (!item.costs?.length) {
      return {
        known: false,
        affordable: null,
        missing: [],
        waitHours: null,
        waitText: 'Kosten nicht sichtbar'
      };
    }

    const missing = [];
    let wait = 0;

    for (const cost of item.costs) {
      const res = getRes(resources, cost.name);

      if (res?.amount == null || cost.amount == null) continue;

      if (res.amount < cost.amount) {
        const deficit = cost.amount - res.amount;
        const waitHours = res.netNumber > 0 ? deficit / res.netNumber : Infinity;

        wait = Math.max(wait, waitHours);

        missing.push({
          name: cost.name,
          deficit,
          waitHours
        });
      }
    }

    return {
      known: true,
      affordable: missing.length === 0,
      missing,
      waitHours: missing.length ? wait : 0,
      waitText: missing.length ? fmtTime(wait) : 'jetzt'
    };
  }

  function parseOverviewBuilding(card) {
    const name = card.querySelector('.ov-bld-name')?.childNodes?.[0]?.textContent?.trim() || '';
    const levelText = card.querySelector('.lvl')?.textContent || '';

    return {
      kind: 'building',
      name: cleanName(name),
      level: parseInt(levelText.replace(/^Lv/i, ''), 10) || 0,
      nextLevel: null,
      costs: [],
      timeText: null,
      isStartable: false,
      isBlocked: false,
      fromCache: false,
      source: 'overview'
    };
  }

  function parseBuilding(card) {
    const name =
      card.querySelector('.building-name')?.childNodes?.[0]?.textContent?.trim() ||
      card.querySelector('.building-name')?.textContent?.trim() ||
      card.querySelector('h3,h4')?.textContent?.trim() ||
      '';

    const levelText = card.querySelector('.building-level')?.textContent || '';
    const levelMatch = levelText.match(/\bLv\.?\s*(\d{1,2})\b/i);
    const nextMatch = levelText.match(/→\s*(\d{1,2})/i);

    const buttonText = [...card.querySelectorAll('button')]
      .map(button => button.textContent.trim())
      .join(' | ');

    return {
      kind: 'building',
      name: cleanName(name),
      level: levelMatch ? parseInt(levelMatch[1], 10) : 0,
      nextLevel: nextMatch ? parseInt(nextMatch[1], 10) : null,
      costs: parseCosts(card, '.building-costs'),
      timeText: card.querySelector('.build-time')?.textContent?.trim() || null,
      buttonText,
      isStartable: /Upgrade|Build/i.test(buttonText) && !/missing|disabled|locked|queue|insufficient/i.test(buttonText),
      isBlocked: /missing|disabled|locked|queue|insufficient/i.test(buttonText),
      fromCache: false,
      source: 'buildings'
    };
  }

  function getVisibleBuildings() {
    const cards = [...document.querySelectorAll('.building-card')];

    if (cards.length) {
      return cards.map(parseBuilding).filter(b => b.name);
    }

    return [...document.querySelectorAll('.ov-bld-card')]
      .map(parseOverviewBuilding)
      .filter(b => b.name);
  }

  function getBuildings() {
    const current = getVisibleBuildings();
    const snapshots = getSnapshots();

    if (current.length) {
      snapshots.buildings = current.map(item => ({ ...item, fromCache: true }));
      saveSnapshots(snapshots);
    }

    return mergeByName([
      ...(snapshots.buildings || []),
      ...current
    ]);
  }

  function buildingLevel(buildings, name) {
    return buildings.find(b => norm(b.name) === norm(name))?.level || 0;
  }

  function labLevel(buildings) {
    const hero = document.querySelector('.res-hero-sub')?.textContent || '';
    const heroMatch = hero.match(/\bLab\s+Lv\.?\s*(\d{1,2})\b/i);

    if (heroMatch) {
      return parseInt(heroMatch[1], 10);
    }

    const labCard = [...document.querySelectorAll('.building-card')]
      .find(card => /^Research Lab\b/i.test(card.querySelector('.building-name')?.textContent?.trim() || ''));

    const labCardMatch = labCard?.querySelector('.building-level')?.textContent?.match(/\bLv\.?\s*(\d{1,2})\b/i);

    if (labCardMatch) {
      return parseInt(labCardMatch[1], 10);
    }

    const overviewLab = [...document.querySelectorAll('.ov-bld-card')]
      .find(card => /Research Lab/i.test(card.textContent || ''));

    const overviewMatch = overviewLab?.querySelector('.lvl')?.textContent?.match(/\bLv\.?\s*(\d{1,2})\b/i);

    if (overviewMatch) {
      return parseInt(overviewMatch[1], 10);
    }

    const parsed = buildingLevel(buildings, 'Research Lab');

    return parsed && parsed <= 99 ? parsed : null;
  }

  function currentResearchBranch() {
    const active = document.querySelector('.res-branch-tab.active .res-branch-label')?.textContent?.trim();

    if (active) return active.toLowerCase();

    return new URLSearchParams(location.search).get('branch') || 'unknown';
  }

  function parseResearch(card) {
    const text = card.textContent || '';

    const name =
      card.querySelector('.research-name-link')?.textContent?.trim() ||
      card.querySelector('.research-name')?.textContent?.trim() ||
      card.querySelector('h3,h4,a')?.textContent?.trim() ||
      '';

    const levelMatch = text.match(/Lv\.?\s*(\d{1,2})\s*\/\s*(\d{1,2})/i);
    const labMatch = text.match(/\bLab\s+Lv\.?\s*(\d{1,2})\b/i);

    const buttonText = [...card.querySelectorAll('button')]
      .map(button => button.textContent.trim())
      .join(' | ');

    const isCompleted =
      /completed|complete|done|researched|finished|erledigt|abgeschlossen/i.test(text) ||
      card.classList.contains('completed') ||
      card.classList.contains('complete') ||
      card.classList.contains('researched') ||
      card.classList.contains('done');

    return {
      kind: 'research',
      name: cleanName(name),
      level: levelMatch ? parseInt(levelMatch[1], 10) : 0,
      maxLevel: levelMatch ? parseInt(levelMatch[2], 10) : null,
      labRequired: labMatch ? parseInt(labMatch[1], 10) : null,
      prereqs: parsePrereqs(card),
      costs: parseCosts(card, '.research-costs'),
      timeText: card.querySelector('.research-time')?.textContent?.trim() || null,
      href: card.querySelector('.research-name-link')?.getAttribute('href') || '',
      buttonText,
      isCompleted,
      isStartable: /Start Research|Level Up/i.test(buttonText) && !/Prerequisites missing|Missing|Locked/i.test(buttonText),
      isPlanned: /Added/i.test(buttonText),
      isBlocked: /Prerequisites missing|Missing|Locked/i.test(buttonText) || card.classList.contains('prereq-missing'),
      fromCache: false,
      source: 'research'
    };
  }

  function getResearch() {
    const current = [...document.querySelectorAll('.research-card')]
      .map(parseResearch)
      .filter(r => r.name);

    const snapshots = getSnapshots();

    if (current.length) {
      snapshots.researchByBranch[currentResearchBranch()] = current.map(item => ({
        ...item,
        fromCache: true
      }));

      saveSnapshots(snapshots);
    }

    return mergeByName([
      ...Object.values(snapshots.researchByBranch || {}).flat(),
      ...current
    ]);
  }

  function fleetState() {
    const path = location.pathname;
    const text = document.body.textContent || '';

    let active = null;
    let max = null;

    const title = document.querySelector('.fleet-missions-card h3')?.textContent || '';
    const titleMatch = title.match(/Fleet Missions\s*\((\d{1,2})\s*\/\s*(\d{1,2})\)/i);

    if (titleMatch) {
      active = parseInt(titleMatch[1], 10);
      max = parseInt(titleMatch[2], 10);
    }

    if (active == null) {
      const fleetLink = [...document.querySelectorAll('.sidebar-link')]
        .find(link => link.querySelector('.sidebar-link-label')?.textContent?.trim() === 'Fleet');

      const badge = fleetLink?.querySelector('.sidebar-badge')?.textContent?.trim();

      if (badge && /^\d{1,2}$/.test(badge)) {
        active = parseInt(badge, 10);
        max = 3;
      }
    }

    if (
      (path.includes('/fleet') || path.includes('/overview') || path.includes('/mining')) &&
      (active == null || max == null)
    ) {
      const fraction = parseSmallFraction(
        document.querySelector('.fleet-missions-card,.fleet-page,.fleet-section,.missions-list')?.textContent || ''
      );

      if (fraction) {
        active = fraction.active;
        max = fraction.max;
      }
    }

    let hasMining =
      !!document.querySelector('.mission-card.status-mining') ||
      [...document.querySelectorAll('.ov-mission-card,[class*="mission-card"]')]
        .some(card => /\bMining\b/i.test(card.textContent || ''));

    if (!hasMining && (path.includes('/fleet') || path.includes('/overview') || path.includes('/mining'))) {
      hasMining = /Mining Mission|status-mining|⛏ Mining|\bMining\b/i.test(text);
    }

    let result = {
      active: Number.isFinite(active) ? active : 0,
      max: Number.isFinite(max) ? max : null,
      free: Number.isFinite(active) && Number.isFinite(max) ? Math.max(0, max - active) : null,
      hasMining,
      fromCache: false
    };

    const snapshots = getSnapshots();

    if (path.includes('/fleet') || path.includes('/overview') || path.includes('/mining')) {
      if (result.max && result.max <= 20 && result.active >= 0 && result.active <= result.max) {
        snapshots.fleet = {
          ...result,
          fromCache: true,
          cachedAt: Date.now()
        };

        saveSnapshots(snapshots);
      }
    } else if (snapshots.fleet) {
      result = {
        ...snapshots.fleet,
        fromCache: true
      };
    }

    return result;
  }

  function status(buildings) {
    let queue = null;
    let slots = null;

    for (const chip of document.querySelectorAll('.bld-stat-chip')) {
      const text = chip.textContent.replace(/\s+/g, ' ').trim();
      const match = text.match(/(\d{1,2})\s*\/\s*(\d{1,2})/);

      if (/slots/i.test(text) && match) {
        slots = `${match[1]}/${match[2]}`;
      }

      if (/queue/i.test(text) && match) {
        queue = `${match[1]}/${match[2]}`;
      }
    }

    return {
      queue,
      slots,
      lab: labLevel(buildings)
    };
  }

  function findResearch(researchItems, name) {
    return researchItems.find(item => norm(item.name) === norm(name)) || null;
  }

  function researchState(researchItems, name) {
    const item = findResearch(researchItems, name);

    if (!item) {
      return {
        name,
        item: null,
        done: false,
        state: 'nicht gesehen',
        tone: 'warn'
      };
    }

    if (item.level > 0 || item.isCompleted) {
      return {
        name,
        item,
        done: true,
        state: 'erledigt',
        tone: 'good'
      };
    }

    if (item.isStartable) {
      return {
        name,
        item,
        done: false,
        state: 'startbar',
        tone: 'good'
      };
    }

    if (item.isBlocked) {
      return {
        name,
        item,
        done: false,
        state: 'blockiert',
        tone: 'danger'
      };
    }

    return {
      name,
      item,
      done: false,
      state: 'sichtbar',
      tone: 'warn'
    };
  }

  function labChecklistState(buildings, targetLevel) {
    const lab = labLevel(buildings);

    return {
      done: lab >= targetLevel,
      state: lab >= targetLevel
        ? 'erledigt'
        : lab
          ? `Lab Lv.${lab}`
          : 'nicht gesehen',
      tone: lab >= targetLevel ? 'good' : 'warn'
    };
  }

  function buildGoalState(resources, buildings, researchItems, fleetState) {
    const steps = [
      researchState(researchItems, 'Basic Sensors'),
      researchState(researchItems, 'Probe Technology'),
      researchState(researchItems, 'Structural Alloys'),
      researchState(researchItems, 'Orbital Mechanics'),
      {
        name: 'Research Lab Lv3',
        item: null,
        done: labLevel(buildings) >= 3,
        state: labLevel(buildings) >= 3
          ? 'erledigt'
          : labLevel(buildings)
            ? `Lab Lv.${labLevel(buildings)}`
            : 'nicht gesehen',
        tone: labLevel(buildings) >= 3 ? 'good' : 'warn'
      },
      researchState(researchItems, 'Anomaly Scanning')
    ];

    const basicSensors = steps[0];
    const orbitalMechanics = steps[3];
    const anomalyScanning = steps[5];
    const lab = labLevel(buildings) || 0;
    const labKnown = !!buildings.find(building => norm(building.name) === 'research lab');
    const doneCount = steps.filter(step => step.done).length;

    let nextStep = 'Research-Branches einmal öffnen, damit der Helper Prereqs sehen kann';

    if (anomalyScanning.done) {
      nextStep = 'Anomaly Scanning ist erforscht';
    } else if (basicSensors.item?.isStartable) {
      nextStep = 'Basic Sensors starten';
    } else if (!basicSensors.done) {
      nextStep = 'Basic Sensors freischalten';
    } else if (lab < 3 && labKnown) {
      nextStep = 'Research Lab auf Lv3 bringen';
    } else if (orbitalMechanics.item?.isStartable) {
      nextStep = 'Orbital Mechanics starten';
    } else if (anomalyScanning.item?.isStartable) {
      nextStep = 'Anomaly Scanning starten';
    }

    return {
      title: 'Anomaly Scanning',
      status: `${doneCount}/${steps.length} Schritte erledigt`,
      missingSteps: steps.filter(step => !step.done).map(step => ({
        label: step.name,
        state: step.state,
        tone: step.tone
      })),
      nextStep
    };
  }

  function buildGuideChecklist(resources, buildings, researchItems, fleetState) {
    const mining = fleetState.hasMining
      ? { state: 'erledigt', tone: 'good' }
      : { state: 'nicht erkannt', tone: 'danger' };

    const fleetSlots = fleetState.max != null
      ? { state: `geprüft ${fleetState.active}/${fleetState.max}`, tone: 'good' }
      : { state: 'nicht gesehen', tone: 'warn' };

    const workforce = researchState(researchItems, 'Workforce Management');
    const storageConstruction = [...buildings, ...researchItems].some(item =>
      LOW_EARLY_PRIORITY.has(norm(item.name)) && item.isStartable
    )
      ? { state: 'zurückstellen', tone: 'warn' }
      : { state: 'Guide-Regel aktiv', tone: 'good' };

    return [
      { label: 'Mining läuft', ...mining },
      { label: 'Fleet-Slots geprüft', ...fleetSlots },
      { label: 'Research Lab Lv2 erreicht', ...labChecklistState(buildings, 2) },
      { label: 'Research Lab Lv3 erreicht', ...labChecklistState(buildings, 3) },
      { label: 'Basic Sensors erforscht oder startbar/sichtbar', ...researchState(researchItems, 'Basic Sensors') },
      { label: 'Probe Technology erforscht oder startbar/sichtbar', ...researchState(researchItems, 'Probe Technology') },
      { label: 'Structural Alloys erforscht oder startbar/sichtbar', ...researchState(researchItems, 'Structural Alloys') },
      { label: 'Orbital Mechanics erforscht oder startbar/sichtbar', ...researchState(researchItems, 'Orbital Mechanics') },
      { label: 'Anomaly Scanning erforscht oder startbar/sichtbar', ...researchState(researchItems, 'Anomaly Scanning') },
      {
        label: 'Workforce Management vorgemerkt',
        state: workforce.item ? workforce.state : 'nicht gesehen',
        tone: workforce.item ? workforce.tone : 'warn'
      },
      { label: 'Storage/Construction nicht überpriorisiert', ...storageConstruction }
    ];
  }

  function researchCacheHint() {
    const snapshots = getSnapshots();
    const branchCount = Object.values(snapshots.researchByBranch || {})
      .filter(items => Array.isArray(items) && items.length)
      .length;

    return branchCount < 3
      ? 'Research-Cache unvollständig: Science/Economy/Military einmal öffnen.'
      : '';
  }

  function getCachedBranches() {
    const snapshots = getSnapshots();
    const branches = snapshots.researchByBranch || {};

    return ['science', 'economy', 'military'].map(key => ({
      key,
      label: key.charAt(0).toUpperCase() + key.slice(1),
      cached: Array.isArray(branches[key]) && branches[key].length > 0
    }));
  }

  function getResearchByName(researchItems, name) {
    return researchItems.find(item => norm(item.name) === norm(name)) || null;
  }

  function getResearchState(researchItems, name) {
    const item = getResearchByName(researchItems, name);

    if (!item) {
      return {
        name,
        item: null,
        completed: false,
        startable: false,
        blocked: false,
        state: 'Daten fehlen'
      };
    }

    const completed = item.level > 0 || item.isCompleted;

    return {
      name,
      item,
      completed,
      startable: !completed && !!item.isStartable,
      blocked: !completed && !!item.isBlocked,
      state: completed ? 'erledigt' : item.isStartable ? 'startbar' : item.isBlocked ? 'blockiert' : 'sichtbar'
    };
  }

  function buildResearchDependencyPlan(targetName, researchItems, buildings) {
    const target = getResearchState(researchItems, targetName);
    const requiredNames = ['Basic Sensors', 'Structural Alloys', 'Orbital Mechanics', targetName];
    const optionalNames = ['Probe Technology'];
    const required = requiredNames.map(name => getResearchState(researchItems, name));
    const optional = optionalNames.map(name => getResearchState(researchItems, name));
    const lab = labLevel(buildings) || 0;
    const labMet = lab >= 3;
    const missing = [];
    const unknownDataHints = [];
    const cachedBranches = getCachedBranches();

    for (const branch of cachedBranches) {
      if (!branch.cached) unknownDataHints.push(`${branch.label} Research öffnen`);
    }

    if (!labMet) {
      missing.push({ name: 'Research Lab Lv3', state: lab ? `Lab Lv.${lab}` : 'nicht gesehen', hard: true });
    }

    for (const state of required) {
      if (!state.completed) missing.push({ name: state.name, state: state.state, hard: true });
    }

    for (const state of optional) {
      if (!state.completed) missing.push({ name: state.name, state: state.state, hard: false });
    }

    const prereqMissing = target.item?.prereqs?.filter(prereq => prereq.missing) || [];
    const nextResearch = required.find(state => state.startable) ||
      optional.find(state => state.startable) ||
      required.find(state => !state.completed && state.item) ||
      optional.find(state => !state.completed && state.item) ||
      null;

    return {
      target: targetName,
      completed: target.completed,
      startable: target.startable,
      blocked: target.blocked || prereqMissing.length > 0 || !labMet,
      missing,
      nextResearch,
      unknownDataHints,
      cachedBranches,
      progress: {
        done: required.filter(state => state.completed).length + (labMet ? 1 : 0),
        total: required.length + 1
      },
      prereqMissing
    };
  }

  function getActionStatus(item) {
    if (!item) return 'Daten fehlen';
    if (item.actionState === 'jetzt möglich' || item.actionState === 'startbar') return 'jetzt';
    if (item.actionState === 'blockiert' || item.isBlocked) return 'blockiert';
    if (item.actionState?.startsWith('wartet')) return 'wartet';
    if (item.fromCache) return 'Daten fehlen';
    return 'wartet';
  }

  function confidenceFromData(blockers, secondaryActions) {
    const dataHints = [...blockers, ...secondaryActions].filter(item => /Daten|öffnen|Cache|Branch/i.test(item));
    if (!dataHints.length) return 'Hoch';
    if (dataHints.length <= 2) return 'Mittel';
    return 'Niedrig';
  }

  function buildNextActionPlanner(resources, buildings, researchItems, fleetState, goalState, buildingAdvisor) {
    const energy = getEnergy(resources);
    const researchPlan = buildResearchDependencyPlan('Anomaly Scanning', researchItems, buildings);
    const secondaryActions = [];
    const blockers = [];
    const lab = labLevel(buildings) || 0;
    const actionList = actions(resources, buildings, researchItems);
    const anomaly = getResearchState(researchItems, 'Anomaly Scanning');
    const basicSensors = getResearchState(researchItems, 'Basic Sensors');
    const solar = buildings.find(building => norm(building.name) === 'solar plant');
    const labBuilding = buildings.find(building => norm(building.name) === 'research lab');
    let primaryAction = null;
    let primaryItem = null;
    let explanation = 'Beste sichtbare Guide-Aktion aus Research-, Gebäude- und Fleet-Daten.';

    for (const hint of researchPlan.unknownDataHints) secondaryActions.push(hint);

    if (!buildings.length) blockers.push('Buildings-Seite öffnen, damit Level, Kosten und Wartezeiten sichtbar sind.');

    if (!fleetState.hasMining && fleetState.max != null) {
      secondaryActions.push('Mining prüfen, weil kein Mining erkannt wurde.');
    } else if (!fleetState.hasMining) {
      blockers.push('Fleet-/Mining-Seite öffnen, weil Mining-Daten fehlen.');
    }

    if (anomaly.startable) {
      primaryAction = 'Anomaly Scanning starten';
      primaryItem = anomaly.item;
      explanation = 'Das Zielresearch ist sichtbar startbar und hat höchste Priorität.';
    } else if (energy && (energy.free < 40 || energy.ratio >= 0.92) && solar) {
      primaryAction = 'Solar Plant bauen, weil Energie knapp ist';
      primaryItem = solar;
      explanation = `Energie ist kritisch (${energy.used}/${energy.produced}); weitere Ausbauten können sonst blockieren.`;
    } else if (lab < 3 && labBuilding) {
      primaryAction = 'Research Lab auf Lv3 bringen';
      primaryItem = labBuilding;
      explanation = 'Research Lab Lv3 ist zentral für den Anomaly-Scanning-Pfad.';
    } else if (basicSensors.startable) {
      primaryAction = 'Basic Sensors starten';
      primaryItem = basicSensors.item;
      explanation = 'Basic Sensors ist ein früher Schlüssel im Anomaly-Scanning-Pfad.';
    } else if (researchPlan.nextResearch?.startable) {
      primaryAction = `${researchPlan.nextResearch.name} starten`;
      primaryItem = researchPlan.nextResearch.item;
      explanation = 'Das nächste sichtbare Research im Dependency-Plan ist startbar.';
    } else if (buildingAdvisor.recommended) {
      primaryAction = `${buildingAdvisor.recommended.name} auf Lv${buildingAdvisor.recommended.targetLevel} bringen`;
      primaryItem = buildingAdvisor.recommended;
      explanation = buildingAdvisor.recommended.reason || explanation;
    } else if (!fleetState.hasMining) {
      primaryAction = 'Mining prüfen, weil kein Mining erkannt wurde';
      explanation = 'Frühes Mining ist guide-relevant, aber aktuell nicht sicher erkannt.';
    } else {
      const first = actionList[0];
      primaryAction = first ? `${first.name} prüfen` : goalState.nextStep;
      primaryItem = first || null;
    }

    const aff = primaryItem ? affordability(primaryItem, resources) : null;
    if (aff?.missing?.length) secondaryActions.push(`Warten bis bezahlbar: ${aff.waitText}`);

    return {
      primaryAction,
      primaryItem,
      primaryStatus: getActionStatus(primaryItem),
      secondaryActions: [...new Set(secondaryActions)].slice(0, 5),
      blockers: [...new Set(blockers)].slice(0, 5),
      confidence: confidenceFromData(blockers, secondaryActions),
      explanation,
      affordability: aff
    };
  }

  function buildSessionPlan(resources, buildings, researchItems, fleetState, nextActionPlanner, buildingAdvisor) {
    const actionList = actions(resources, buildings, researchItems);
    const now = [];
    const next30 = [];
    const next60 = [];
    const next120 = [];
    const idleRisks = [];

    if (nextActionPlanner.primaryAction) now.push(nextActionPlanner.primaryAction);

    for (const action of actionList) {
      if (action.actionState === 'jetzt möglich' || action.actionState === 'startbar') {
        now.push(`${action.name} ${action.kind === 'research' ? 'starten' : 'bauen/upgrade prüfen'}`);
      } else if (action.affordability?.waitHours <= 0.5) {
        next30.push(`${action.name}: ${action.affordability.waitText}`);
      } else if (action.affordability?.waitHours <= 1) {
        next60.push(`${action.name}: ${action.affordability.waitText}`);
      } else if (action.affordability?.waitHours <= 2) {
        next120.push(`${action.name}: ${action.affordability.waitText}`);
      }
    }

    if (!fleetState.hasMining) now.push('Mining prüfen');
    for (const hint of getCachedBranches().filter(branch => !branch.cached)) now.push(`${hint.label} Research-Branch öffnen`);

    const energy = getEnergy(resources);
    if (resources.some(resource => resource.name !== 'Energy' && soonFull(resource.storageFullIn))) idleRisks.push('Storage bald voll');
    if (energy && (energy.free < 40 || energy.ratio >= 0.92)) idleRisks.push('Energie knapp');
    if (fleetState.free > 0) idleRisks.push('Fleet Slots frei');
    if (buildingAdvisor.recommended?.affordability?.waitHours <= 2 && buildingAdvisor.recommended.actionState !== 'jetzt möglich') {
      idleRisks.push('Build queue frei halten: gutes Gebäude bald bezahlbar');
    }
    if (researchItems.some(item => item.isStartable)) idleRisks.push('Research sichtbar startbar, aber nicht gestartet');

    return {
      now: [...new Set(now)].slice(0, 6),
      next30: [...new Set(next30)].slice(0, 5),
      next60: [...new Set(next60)].slice(0, 5),
      next120: [...new Set(next120)].slice(0, 5),
      idleRisks: [...new Set(idleRisks)].slice(0, 6)
    };
  }

  function relativeTime(ts) {
    if (!ts) return 'unbekannt';
    const minutes = Math.max(0, Math.floor((Date.now() - ts) / 60000));
    if (minutes < 2) return 'gerade eben';
    if (minutes < 60) return `vor ${minutes}m`;
    return `vor ${Math.floor(minutes / 60)}h`;
  }

  function buildDataQuality(resources, buildings, researchItems, fleet, nextAction, buildingAdvisor) {
    const snapshots = getSnapshots();
    const cachedBranches = getCachedBranches();
    const domDumpPages = Object.keys(getAllDomDumps()).sort();

    return {
      version: '0.7.5',
      path: location.pathname + location.search,
      cachedBranches,
      domDumpPages,
      buildingsCached: Array.isArray(snapshots.buildings) && snapshots.buildings.length > 0,
      fleetCached: !!snapshots.fleet,
      miningDetected: !!fleet.hasMining,
      lastUpdated: relativeTime(snapshots.updatedAt),
      buildingsCount: buildings.length,
      researchCount: researchItems.length,
      fleetState: fleet,
      resources,
      labLevel: labLevel(buildings),
      nextAction: nextAction.primaryAction,
      buildingRecommendation: buildingAdvisor.recommended?.name || null
    };
  }

  function rank(item, resources, buildings) {
    const name = norm(item.name);

    let prio = 20;
    let reason = 'Erkannte Aktion.';
    let source = 'Seitenzustand';

    const lab = labLevel(buildings);
    const energy = getEnergy(resources);

    if (item.kind === 'research') {
      const index = GUIDE_TECH_ORDER.findIndex(tech => norm(tech) === name);

      if (index >= 0) {
        prio = 120 - index * 6;
        reason = 'Teil des Guide-Pfads Richtung Anomaly Scanning und Exploration.';
        source = `${GUIDE}: Research path`;
      }

      if (name === 'basic sensors') {
        prio = 140;
        reason = 'Direkte Voraussetzung für Probe Technology und Anomaly Scanning.';
        source = `${GUIDE}: Basic Sensors`;
      }

      if (name === 'probe technology') {
        prio = 132;
        reason = 'Hilft beim frühen Scouting.';
        source = `${GUIDE}: Probe/scouting`;
      }

      if (name === 'structural alloys') {
        prio = 128;
        reason = 'Wichtige frühe Tech Richtung Shipyard/Fleet.';
        source = `${GUIDE}: Lab Lv1 techs`;
      }

      if (name === 'orbital mechanics') {
        prio = 126;
        reason = 'Zentrale Voraussetzung für Scouts, Freighters und weitere Techs.';
        source = `${GUIDE}: Lab Lv2 techs`;
      }

      if (name === 'anomaly scanning') {
        prio = 138;
        reason = 'Erste echte Rush-Tech laut Guide.';
        source = `${GUIDE}: Anomaly rush`;
      }

      if (name === 'improved mining' && item.level >= 1) {
        prio = 30;
        reason = 'Schon Lv1. Income-Techs nicht zu früh hochpushen.';
        source = `${GUIDE}: income techs`;
      }

      if (LOW_EARLY_PRIORITY.has(name)) {
        prio = 15;
        reason = 'Früh niedrige Priorität.';
        source = `${GUIDE}: early ignore/later`;
      }

      if (item.labRequired && lab && item.labRequired > lab) {
        prio -= 20;
        reason += ` Benötigt Lab Lv.${item.labRequired}; aktuell Lab Lv.${lab}.`;
      }

      if (item.isBlocked) prio -= 30;
      if (item.isStartable) prio += 20;
      if (item.fromCache) prio -= 2;
    } else {
      const index = GUIDE_BUILD_ORDER.findIndex(building => norm(building) === name);

      if (index >= 0) {
        prio = 105 - index * 7;
        reason = 'Guide-basierter Early-Game-Ausbau.';
        source = `${GUIDE}: build focus`;
      }

      if (name === 'research lab' && item.level < 3) {
        prio = 145;
        reason = 'Lab Lv3 ist zentral Richtung Anomaly Scanning.';
        source = `${GUIDE}: Lab Lv3`;
      }

      if ((name === 'ore mine' || name === 'silicate mine') && item.level >= 1) {
        prio += 10;
        reason = 'Ore/Silicate als frühe industrielle Basis.';
      }

      if (name === 'solar plant') {
        prio = energy && (energy.free < 80 || energy.ratio >= 0.9) ? 125 : 72;
        reason = energy ? `Energie-Reserve ${energy.free}. Solar nach Bedarf.` : 'Solar nach Bedarf.';
        source = `${GUIDE}: power`;
      }

      if (name === 'alloy foundry' && item.level < 3) {
        prio = 80;
        reason = 'Ab Tag 2 Richtung Lv3, aber nach Lab/Anomaly-Pfad.';
        source = `${GUIDE}: day 2 alloys`;
      }

      if (LOW_EARLY_PRIORITY.has(name)) {
        prio = 12;
        reason = 'Früh nicht priorisieren, außer konkreter Engpass.';
        source = `${GUIDE}: early ignore`;
      }

      if (item.isStartable) prio += 15;
      if (item.isBlocked) prio -= 20;
      if (item.fromCache) prio -= 4;
    }

    return {
      prio,
      reason,
      source
    };
  }

  function actions(resources, buildings, research) {
    return [...research, ...buildings]
      .map(item => {
        const ranking = rank(item, resources, buildings);
        const aff = affordability(item, resources);

        let actionState = 'unbekannt';

        if (item.isBlocked) {
          actionState = 'blockiert';
        } else if (aff.affordable === true && item.isStartable) {
          actionState = 'jetzt möglich';
        } else if (aff.affordable === false) {
          actionState = `wartet: ${aff.waitText}`;
        } else if (item.isStartable) {
          actionState = 'startbar';
        } else if (item.fromCache) {
          actionState = 'aus Cache';
        }

        let score = ranking.prio;

        if (aff.affordable === true) score += 18;
        if (aff.affordable === false && aff.waitHours <= 1) score += 10;
        if (aff.affordable === false && aff.waitHours > 6) score -= 15;
        if (item.isBlocked) score -= 28;

        return {
          ...item,
          score,
          reason: ranking.reason,
          source: ranking.source,
          affordability: aff,
          actionState
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 14);
  }

  function getBuildingAdvisor(resources, buildings, researchItems, fleetState) {
    const energy = getEnergy(resources) || {};
    const ore = getRes(resources, 'Ore') || {};
    const silicates = getRes(resources, 'Silicates') || {};
    const hydrogen = getRes(resources, 'Hydrogen') || {};
    const alloys = getRes(resources, 'Alloys') || {};
    const population = getRes(resources, 'Population') || {};
    const anomaly = researchState(researchItems, 'Anomaly Scanning');
    const candidates = buildings.filter(building => building.kind === 'building' && building.name);

    const context = {
      resources,
      buildings,
      researchItems,
      fleetState,
      labLevel: labLevel(buildings) || 0,
      energyFree: Number.isFinite(energy.free) ? energy.free : Infinity,
      energyRatio: Number.isFinite(energy.ratio) ? energy.ratio : 0,
      oreMineLevel: buildingLevel(buildings, 'Ore Mine'),
      silicateMineLevel: buildingLevel(buildings, 'Silicate Mine'),
      hydrogenProcessorLevel: buildingLevel(buildings, 'Hydrogen Processor'),
      alloyFoundryLevel: buildingLevel(buildings, 'Alloy Foundry'),
      researchLabLevel: buildingLevel(buildings, 'Research Lab'),
      residentialComplexLevel: buildingLevel(buildings, 'Residential Complex'),
      bioComplexLevel: buildingLevel(buildings, 'Bio Complex'),
      storageComplexLevel: buildingLevel(buildings, 'Storage Complex'),
      constructionYardLevel: buildingLevel(buildings, 'Construction Yard'),
      population: {
        amount: population.amount,
        capacity: population.capacity
      },
      ore: {
        amount: ore.amount,
        net: ore.net,
        netNumber: ore.netNumber
      },
      silicates: {
        amount: silicates.amount,
        net: silicates.net,
        netNumber: silicates.netNumber
      },
      hydrogen: {
        amount: hydrogen.amount,
        net: hydrogen.net,
        netNumber: hydrogen.netNumber
      },
      alloys: {
        amount: alloys.amount,
        net: alloys.net,
        netNumber: alloys.netNumber
      },
      currentGoal: anomaly.done ? 'sentinel_setup' : 'anomaly_scanning',
      hasMining: !!fleetState.hasMining,
      anomalyScanningDone: anomaly.done,
      anomalyScanningSeen: !!anomaly.item,
      anyStorageSoonFull: resources.some(resource => resource.name !== 'Energy' && soonFull(resource.storageFullIn))
    };

    context.phase = getBuildingPhase(context);

    const scoredCandidates = candidates
      .map(building => {
        const aff = affordability(building, resources);
        let actionState = 'unbekannt';

        if (building.isBlocked) {
          actionState = 'blockiert';
        } else if (aff.affordable === true && building.isStartable) {
          actionState = 'jetzt möglich';
        } else if (aff.affordable === false) {
          actionState = `wartet: ${aff.waitText}`;
        } else if (building.isStartable) {
          actionState = 'startbar';
        } else if (building.fromCache) {
          actionState = 'aus Cache';
        }

        return {
          ...building,
          score: scoreBuildingCandidate(building, context),
          reason: getBuildingAdvisorReason(building, context),
          warnings: getBuildingAdvisorWarnings(building, context),
          affordability: aff,
          actionState,
          targetLevel: getBuildingAdvisorTargetLevel(building, context),
          source: `${GUIDE}: Gebäudeberater`
        };
      })
      .sort((a, b) => b.score - a.score);

    const queue = scoredCandidates.slice(0, 5);

    const notes = [];

    if (!candidates.length) {
      notes.push('Keine Gebäudedaten erkannt. Öffne einmal /buildings.');
    } else if (!candidates.some(building => building.costs?.length)) {
      notes.push('Gebäudekosten nicht sichtbar. Öffne /buildings für genaue Wartezeiten.');
      notes.push('Buildings-Seite einmal öffnen, damit der Gebäudeberater Kosten und Level kennt.');
    } else if (candidates.some(building => building.source === 'overview' && !building.costs?.length)) {
      notes.push('Gebäudekosten nicht sichtbar. Öffne /buildings für genaue Wartezeiten.');
    }

    if (!fleetState.hasMining) {
      notes.push('Mining ist nicht sicher erkannt; Fleet-/Mining-Seite gelegentlich öffnen.');
    }

    return {
      recommended: queue[0] || null,
      top5: queue,
      skippedLowPriority: scoredCandidates.slice(5).filter(building => building.score < 250).slice(0, 5),
      warnings: notes,
      dataQuality: {
        buildingsKnown: candidates.length > 0,
        costsKnown: candidates.some(building => building.costs?.length),
        fromCacheCount: candidates.filter(building => building.fromCache).length
      },
      queue,
      phase: context.phase,
      notes
    };
  }

  function scoreBuildingCandidate(building, context) {
    const name = norm(building.name);
    const aff = affordability(building, context.resources);
    const energyFree = context.energyFree;
    const energyRatio = context.energyRatio;
    const energyCritical = energyFree < 40 || energyRatio >= 0.92;
    let score = 100;

    if (name === 'solar plant') {
      score = energyCritical ? 1000 : 360;
    } else if (name === 'research lab') {
      score = context.researchLabLevel < 3 ? 920 : 260;
      if (energyCritical) score -= 520;
    } else if (name === 'silicate mine') {
      score = context.oreMineLevel > context.silicateMineLevel + 1 ? 740 : 560;
    } else if (name === 'ore mine') {
      score = context.oreMineLevel <= context.silicateMineLevel ? 700 : 540;
    } else if (name === 'hydrogen processor') {
      score = 420;
      if ((context.hydrogen.amount ?? Infinity) < 1000 && context.researchLabLevel < 3) score = 680;
      if ((context.hydrogen.netNumber ?? Infinity) < 120) score = Math.max(score, 540);
    } else if (name === 'alloy foundry') {
      score = context.alloyFoundryLevel < 3 ? 430 : 210;
      if (context.researchLabLevel < 3) score -= 110;
      if ((context.alloys.amount ?? Infinity) < 500) score += 80;
    } else if (name === 'residential complex') {
      const ratio = context.population.capacity > 0
        ? context.population.amount / context.population.capacity
        : 0;
      score = ratio >= 0.8 ? 620 : 260;
    } else if (name === 'bio complex') {
      score = 310;
    } else if (name === 'medical bay') {
      score = 95;
    } else if (name === 'storage complex') {
      score = context.anyStorageSoonFull ? 650 : 45;
    } else if (name === 'construction yard') {
      const manyAffordable = context.buildings.filter(item => affordability(item, context.resources).affordable === true).length;
      score = manyAffordable >= 3 ? 420 : 40;
    } else {
      const guideIndex = GUIDE_BUILD_ORDER.findIndex(item => norm(item) === name);
      score = guideIndex >= 0 ? 330 - guideIndex * 18 : 120;
    }

    if (aff.affordable === true) score += 60;
    if (aff.affordable === false && aff.waitHours <= 1) score += 35;
    if (aff.affordable === false && aff.waitHours > 6) score -= 120;
    if (building.isStartable) score += 35;
    if (building.isBlocked) score -= 90;
    if (building.fromCache) score -= 8;

    return score;
  }

  function getBuildingPhase(context) {
    if (!context.anomalyScanningDone) {
      return 'anomaly_rush';
    }

    if (!context.hasMining || !context.fleetState.max) {
      return 'sentinel_setup';
    }

    if (
      context.labLevel >= 3 &&
      context.oreMineLevel >= 1 &&
      context.silicateMineLevel >= 1 &&
      context.hydrogenProcessorLevel >= 1
    ) {
      return 'economy_stabilize';
    }

    return 'sentinel_setup';
  }

  function getBuildingAdvisorReason(building, context) {
    const name = norm(building.name);
    const energyFree = context.energyFree;
    const energyRatio = context.energyRatio;
    const energyCritical = energyFree < 40 || energyRatio >= 0.92;

    if (name === 'solar plant' && energyCritical) {
      return 'Energie ist knapp. Ohne freie Energie blockieren weitere Produktionsgebäude.';
    }

    if (name === 'research lab' && context.researchLabLevel < 3 && !energyCritical) {
      return 'Research Lab Lv3 ist zentral für den Anomaly-Scanning-Pfad.';
    }

    if (name === 'ore mine' || name === 'silicate mine') {
      return 'Ore/Silicate sind die frühe industrielle Basis; Ore leicht priorisieren.';
    }

    if (name === 'hydrogen processor') {
      return 'Hydrogen wird für Forschung und spätere Fleet-/Scout-Schritte gebraucht.';
    }

    if (name === 'alloy foundry') {
      return 'Alloys werden ab Tag 2 wichtiger; Lv3 ist solides frühes Ziel.';
    }

    if (name === 'residential complex' || name === 'bio complex') {
      return 'Population wird durch Workforce Management produktionsrelevant.';
    }

    if (name === 'medical bay') {
      return 'Medical Bay ist sichtbar, aber früh wegen Energiebedarf keine Pflicht-Priorität.';
    }

    if (name === 'storage complex' || name === 'construction yard') {
      return 'Guide sagt: Früh sind Ressourcen der Engpass, nicht Bauzeit/Storage.';
    }

    return 'Guide-basierte frühe Gebäudepriorität.';
  }

  function getBuildingAdvisorWarnings(building, context) {
    const name = norm(building.name);
    const warnings = [];

    if ((name === 'storage complex' || name === 'construction yard') && context.phase === 'anomaly_rush') {
      warnings.push('Früh niedrig priorisiert, solange kein konkreter Engpass sichtbar ist.');
    }

    if (name === 'medical bay') {
      warnings.push('Energieintensiv; nur bei erkennbarem Population-Engpass vorziehen.');
    }

    if (name !== 'solar plant' && (context.energyFree < 40 || context.energyRatio >= 0.92)) {
      warnings.push('Energie knapp; Solar Plant kann diese Empfehlung überholen.');
    }

    if (!building.costs?.length) {
      warnings.push('Kosten nicht sichtbar; Wartezeit nur mit /buildings genau.');
    }

    if (building.fromCache) {
      warnings.push('Aus Cache; aktuelle Seite kann abweichen.');
    }

    return warnings;
  }

  function getBuildingAdvisorTargetLevel(building, context) {
    const name = norm(building.name);

    if (name === 'research lab') return Math.max(3, building.level + 1);
    if (name === 'alloy foundry') return Math.max(3, building.level + 1);
    if (name === 'ore mine' || name === 'silicate mine') {
      return Math.max(building.level + 1, Math.max(context.oreMineLevel, context.silicateMineLevel));
    }

    return building.nextLevel || building.level + 1;
  }

  function warnings(resources, fleet) {
    const output = [];
    const energy = getEnergy(resources);

    if (fleet.max && fleet.free > 0) {
      output.push({
        type: 'warn',
        title: `${fleet.free} Fleet-Slot${fleet.free === 1 ? '' : 's'} frei`,
        text: fleet.hasMining
          ? 'Mining läuft. Freie Slots für Scouting/weitere Missionen prüfen.'
          : 'Keine Mining-Mission erkannt. Salvaged Freighters früh fürs Mining nutzen.'
      });
    }

    if (!fleet.hasMining) {
      output.push({
        type: 'danger',
        title: 'Keine Mining-Mission erkannt',
        text: fleet.fromCache
          ? 'Auch im gespeicherten Fleet-Status wurde keine Mining-Mission erkannt.'
          : 'Der Guide empfiehlt frühes Mining im Heimatsystem.'
      });
    }

    if (energy && (energy.free < 40 || energy.ratio >= 0.92)) {
      output.push({
        type: 'danger',
        title: 'Energie knapp',
        text: `${energy.used}/${energy.produced}. Solar Plant prüfen.`
      });
    }

    const caps = resources.filter(resource =>
      resource.storageFullIn &&
      soonFull(resource.storageFullIn) &&
      resource.name !== 'Energy'
    );

    if (caps.length) {
      output.push({
        type: 'warn',
        title: 'Lager/Cap bald voll',
        text: caps.map(resource => `${resource.name}: ${resource.storageFullIn}`).join(', ')
      });
    }

    return output;
  }

  function createPanel() {
    if (document.getElementById(PANEL_ID)) return;

    const panel = document.createElement('div');
    panel.id = PANEL_ID;

    panel.innerHTML = `
      <div class="nlh-header">
        <div class="nlh-title">
          <strong>Nexus Helper</strong>
          <span class="nlh-version">v0.7.5</span>
        </div>
        <div class="nlh-rail-status"></div>
        <div class="nlh-actions">
          <button class="nlh-toggle">−</button>
          <button class="nlh-peek" title="Overlay beim Hover transparent">&#128065;</button>
          <button class="nlh-compact-toggle">Compact</button>
          <button class="nlh-clear-cache">Cache</button>
          <button class="nlh-refresh">↻</button>
        </div>
      </div>
      <div class="nlh-body">Lade Daten...</div>
    `;

    const style = document.createElement('style');
    style.textContent = `
      #${PANEL_ID} {
        position: fixed;
        right: 14px;
        bottom: 14px;
        z-index: 999999;
        width: 430px;
        max-height: 84vh;
        overflow: auto;
        background: rgba(7,11,20,.97);
        color: #e5e7eb;
        border: 1px solid rgba(148,163,184,.35);
        border-radius: 12px;
        box-shadow: 0 18px 45px rgba(0,0,0,.48);
        font-family: system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
        font-size: 13px;
        transition: opacity .12s ease, right .18s ease, height .18s ease;
      }

      #${PANEL_ID}.collapsed {
        right: -388px;
        width: 430px;
        height: min(84vh, 520px);
        max-height: min(84vh, 520px);
        overflow: visible;
        border-radius: 12px 0 0 12px;
      }

      #${PANEL_ID}.peek-transparent {
        opacity: .22;
      }

      #${PANEL_ID}.collapsed .nlh-body {
        display: none;
      }

      #${PANEL_ID} .nlh-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 10px;
        padding: 10px 12px;
        border-bottom: 1px solid rgba(148,163,184,.25);
        position: sticky;
        top: 0;
        background: rgba(7,11,20,.99);
      }

      #${PANEL_ID}.collapsed .nlh-header {
        width: 42px;
        height: 100%;
        box-sizing: border-box;
        flex-direction: column;
        justify-content: flex-start;
        align-items: center;
        gap: 10px;
        padding: 8px 4px;
        border-bottom: 0;
        border-right: 1px solid rgba(148,163,184,.25);
        writing-mode: vertical-rl;
      }

      #${PANEL_ID} .nlh-title {
        min-width: 0;
      }

      #${PANEL_ID}.collapsed .nlh-title {
        display: flex;
        align-items: center;
        gap: 6px;
        white-space: nowrap;
      }

      #${PANEL_ID} .nlh-version {
        margin-left: 6px;
        font-size: 11px;
        color: #93c5fd;
        font-weight: 650;
      }

      #${PANEL_ID}.collapsed .nlh-version {
        margin-left: 0;
      }

      #${PANEL_ID} .nlh-rail-status {
        display: none;
      }

      #${PANEL_ID}.collapsed .nlh-rail-status {
        display: flex;
        align-items: center;
        gap: 7px;
        color: #cbd5e1;
        font-size: 11px;
        font-weight: 700;
        white-space: nowrap;
      }

      #${PANEL_ID} .nlh-actions {
        display: flex;
        gap: 5px;
        flex-wrap: wrap;
        justify-content: flex-end;
      }

      #${PANEL_ID}.collapsed .nlh-actions {
        writing-mode: horizontal-tb;
        flex-direction: column;
        align-items: center;
        flex-wrap: nowrap;
      }

      #${PANEL_ID}.collapsed .nlh-actions button:not(.nlh-toggle) {
        display: none;
      }

      #${PANEL_ID} button {
        background: rgba(59,130,246,.18);
        color: #dbeafe;
        border: 1px solid rgba(96,165,250,.35);
        border-radius: 7px;
        cursor: pointer;
        padding: 2px 7px;
        font-family: inherit;
        font-size: 11px;
      }

      #${PANEL_ID} .nlh-clear-cache {
        background: rgba(148,163,184,.12);
        color: #cbd5e1;
        border-color: rgba(148,163,184,.28);
      }

      #${PANEL_ID} .nlh-body {
        padding: 8px 10px 10px;
      }

      #${PANEL_ID} .nlh-section {
        margin-bottom: 9px;
      }

      #${PANEL_ID} .nlh-section-title {
        color: #93c5fd;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: .08em;
        margin-bottom: 5px;
        display: flex;
        justify-content: space-between;
      }

      #${PANEL_ID} .nlh-card {
        padding: 7px 8px;
        margin-bottom: 6px;
        border: 1px solid rgba(148,163,184,.18);
        border-radius: 10px;
        background: rgba(15,23,42,.72);
      }

      #${PANEL_ID} .nlh-card.top {
        border-color: rgba(96,165,250,.42);
        background: rgba(30,64,175,.18);
        padding: 9px 10px;
      }

      #${PANEL_ID} .nlh-card-title {
        font-weight: 750;
        margin-bottom: 3px;
      }

      #${PANEL_ID} .nlh-reason {
        color: #aab3c2;
        font-size: 12px;
        line-height: 1.35;
      }

      #${PANEL_ID} .nlh-clamp {
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      #${PANEL_ID} .nlh-dashboard {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 5px;
      }

      #${PANEL_ID} .nlh-dash-item {
        min-width: 0;
        padding: 5px 6px;
        border: 1px solid rgba(148,163,184,.16);
        border-radius: 8px;
        background: rgba(15,23,42,.58);
      }

      #${PANEL_ID} .nlh-dash-label {
        color: #94a3b8;
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: .04em;
      }

      #${PANEL_ID} .nlh-dash-value {
        font-size: 12px;
        font-weight: 750;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      #${PANEL_ID} .nlh-row {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 8px;
        padding: 4px 0;
        border-bottom: 1px solid rgba(148,163,184,.10);
      }

      #${PANEL_ID} .nlh-check-row {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 8px;
        align-items: center;
        padding: 4px 0;
        border-bottom: 1px solid rgba(148,163,184,.10);
      }

      #${PANEL_ID} .nlh-check-label {
        min-width: 0;
      }

      #${PANEL_ID} .nlh-check-state {
        white-space: nowrap;
      }

      #${PANEL_ID} .nlh-muted {
        color: #9ca3af;
      }

      #${PANEL_ID} .nlh-good {
        color: #86efac;
      }

      #${PANEL_ID} .nlh-warn {
        color: #fbbf24;
        font-weight: 700;
      }

      #${PANEL_ID} .nlh-danger {
        color: #fca5a5;
        font-weight: 700;
      }

      #${PANEL_ID} .nlh-alert {
        border-radius: 10px;
        padding: 8px 9px;
        margin-bottom: 7px;
        border: 1px solid rgba(251,191,36,.28);
        background: rgba(251,191,36,.08);
      }

      #${PANEL_ID} .nlh-alert.danger {
        border-color: rgba(248,113,113,.32);
        background: rgba(248,113,113,.09);
      }

      #${PANEL_ID} .nlh-small {
        font-size: 10px;
      }

      #${PANEL_ID} .nlh-pill {
        display: inline-block;
        padding: 1px 5px;
        border-radius: 999px;
        background: rgba(96,165,250,.13);
        border: 1px solid rgba(96,165,250,.25);
        color: #bfdbfe;
        font-size: 10px;
        margin: 1px 3px 1px 0;
      }

      #${PANEL_ID} .nlh-pill.good {
        background: rgba(34,197,94,.13);
        border-color: rgba(34,197,94,.25);
        color: #bbf7d0;
      }

      #${PANEL_ID} .nlh-pill.warn {
        background: rgba(251,191,36,.13);
        border-color: rgba(251,191,36,.25);
        color: #fde68a;
      }

      #${PANEL_ID} .nlh-pill.danger {
        background: rgba(248,113,113,.13);
        border-color: rgba(248,113,113,.25);
        color: #fecaca;
      }

      #${PANEL_ID} .nlh-link {
        color: #93c5fd;
        text-decoration: none;
      }

      #${PANEL_ID} .nlh-footer-note {
        color: #64748b;
        font-size: 11px;
        line-height: 1.35;
        margin-top: 8px;
      }

      #${PANEL_ID} .nlh-missing {
        margin-top: 4px;
      }

      #${PANEL_ID} .nlh-section-toggle {
        width: 100%;
        display: grid;
        grid-template-columns: auto auto 1fr auto;
        gap: 7px;
        align-items: center;
        text-align: left;
        padding: 6px 7px;
        margin-bottom: 5px;
        background: rgba(15,23,42,.64);
        border-color: rgba(148,163,184,.20);
        color: #dbeafe;
      }

      #${PANEL_ID} .nlh-section-chevron {
        color: #93c5fd;
        font-size: 11px;
      }

      #${PANEL_ID} .nlh-section-drag {
        color: #64748b;
        cursor: grab;
        font-size: 12px;
        line-height: 1;
        user-select: none;
      }

      #${PANEL_ID} .nlh-section-drag:active {
        cursor: grabbing;
      }

      #${PANEL_ID} .nlh-section-name {
        color: #93c5fd;
        font-size: 11px;
        font-weight: 750;
        text-transform: uppercase;
        letter-spacing: .06em;
      }

      #${PANEL_ID} .nlh-section-badge {
        justify-self: end;
      }

      #${PANEL_ID} .nlh-collapsible.closed .nlh-section-body,
      #${PANEL_ID}.compact .nlh-details {
        display: none;
      }

      #${PANEL_ID} .nlh-collapsible.muted .nlh-section-toggle {
        opacity: .82;
      }

      #${PANEL_ID} .nlh-collapsible.danger .nlh-section-toggle {
        border-color: rgba(248,113,113,.32);
      }

      #${PANEL_ID} .nlh-collapsible.dragging {
        opacity: .55;
      }

      #${PANEL_ID} .nlh-collapsible.drag-over .nlh-section-toggle {
        border-color: rgba(96,165,250,.62);
        background: rgba(30,64,175,.24);
      }

      #${PANEL_ID} .nlh-resource-table {
        display: grid;
        gap: 1px;
      }

      #${PANEL_ID} .nlh-resource-row {
        display: grid;
        grid-template-columns: minmax(95px, 1fr) 72px 92px;
        gap: 8px;
        align-items: center;
        padding: 4px 0;
        border-bottom: 1px solid rgba(148,163,184,.10);
      }

      #${PANEL_ID} .nlh-building-advisor .nlh-card-title {
        display: flex;
        justify-content: space-between;
        gap: 8px;
      }

      #${PANEL_ID} .nlh-priority-list {
        margin-top: 7px;
      }

      #${PANEL_ID} .nlh-priority-row {
        display: grid;
        grid-template-columns: 24px 1fr auto;
        gap: 8px;
        align-items: center;
        padding: 5px 0;
        border-top: 1px solid rgba(148,163,184,.10);
      }

      @media(max-width:700px) {
        #${PANEL_ID} {
          left: 10px;
          right: 10px;
          bottom: 10px;
          width: auto;
          max-height: 70vh;
        }

        #${PANEL_ID}.collapsed {
          right: -318px;
          width: 360px;
        }
      }
    `;

    document.head.appendChild(style);
    document.body.appendChild(panel);

    panel.querySelector('.nlh-refresh').addEventListener('click', render);

    panel.querySelector('.nlh-compact-toggle').addEventListener('click', () => {
      settings.compactMode = !settings.compactMode;
      saveJson(SETTINGS_KEY, settings);
      applyCompactMode();
      render();
    });

    panel.querySelector('.nlh-toggle').addEventListener('click', () => {
      settings.collapsed = !settings.collapsed;
      saveJson(SETTINGS_KEY, settings);
      applyCollapsed();
    });

    panel.querySelector('.nlh-clear-cache').addEventListener('click', () => {
      localStorage.removeItem(SNAPSHOT_KEY);
      render();
    });

    setupPeekHover(panel);
    applyCollapsed();
    applyCompactMode();
  }

  function applyCollapsed() {
    const panel = document.getElementById(PANEL_ID);

    if (!panel) return;

    panel.classList.toggle('collapsed', !!settings.collapsed);

    const button = panel.querySelector('.nlh-toggle');

    if (button) {
      button.textContent = settings.collapsed ? '+' : '−';
    }
  }

  function renderCard(action, index, top) {
    const stateClass =
      action.actionState === 'jetzt möglich' || action.actionState === 'startbar'
        ? 'good'
        : action.actionState === 'blockiert'
          ? 'danger'
          : 'warn';

    const missingHtml = action.affordability?.missing?.length
      ? `
        <div class="nlh-missing">
          ${action.affordability.missing.map(missing => `
            <span class="nlh-pill warn">
              fehlt ${esc(missing.name)} ${fmtNum(missing.deficit)} · ${fmtTime(missing.waitHours)}
            </span>
          `).join('')}
        </div>
      `
      : '';

    const costHtml = action.costs?.length
      ? action.costs.map(cost => `
          <span class="nlh-pill">${esc(cost.name)} ${fmtNum(cost.amount)}</span>
        `).join('')
      : '<span class="nlh-pill warn">Kosten nicht sichtbar</span>';

    const meta = [
      action.kind === 'research' ? 'Forschung' : 'Gebäude',
      action.level != null ? `Lv.${action.level}${action.maxLevel ? '/' + action.maxLevel : ''}` : null,
      action.nextLevel ? `→ ${action.nextLevel}` : null,
      action.labRequired ? `Lab ${action.labRequired}` : null,
      action.timeText || null,
      action.fromCache ? 'Cache' : null
    ].filter(Boolean);

    const title = action.href
      ? `<a class="nlh-link" href="${esc(action.href)}">${esc(action.name)}</a>`
      : esc(action.name);

    return `
      <div class="nlh-card ${top ? 'top' : ''}">
        <div class="nlh-card-title">${index + 1}. ${title}</div>
        <div>
          <span class="nlh-pill ${stateClass}">${esc(action.actionState)}</span>
          ${meta.map(item => `<span class="nlh-pill">${esc(item)}</span>`).join('')}
        </div>
        <div class="nlh-reason">${esc(action.reason)}</div>
        <div class="nlh-small">${costHtml}</div>
        ${missingHtml}
        <div class="nlh-muted nlh-small">Quelle: ${esc(action.source)} · Score ${Math.round(action.score)}</div>
      </div>
    `;
  }

  function applyCompactMode() {
    const panel = document.getElementById(PANEL_ID);

    if (!panel) return;

    panel.classList.toggle('compact', !!settings.compactMode);

    const button = panel.querySelector('.nlh-compact-toggle');

    if (button) {
      button.textContent = settings.compactMode ? 'Details' : 'Compact';
    }
  }

  function setupPeekHover(panel) {
    const button = panel.querySelector('.nlh-peek');

    if (!button) return;

    button.addEventListener('mouseenter', () => {
      panel.classList.add('peek-transparent');
    });

    button.addEventListener('mouseleave', () => {
      panel.classList.remove('peek-transparent');
    });
  }

  function setSectionOpen(sectionId, open) {
    settings.sectionOpen = settings.sectionOpen || {};
    settings.sectionOpen[sectionId] = !!open;
    saveJson(SETTINGS_KEY, settings);
  }

  function getSectionOpen(id, defaultOpen) {
    if (!settings.sectionOpen) settings.sectionOpen = {};
    if (settings.sectionOpen[id] == null) settings.sectionOpen[id] = !!defaultOpen;
    return !!settings.sectionOpen[id];
  }

  function renderCollapsibleSection(id, title, html, options = {}) {
    const open = getSectionOpen(id, options.defaultOpen);
    const classes = [
      'nlh-section',
      'nlh-collapsible',
      open ? 'open' : 'closed',
      options.muted ? 'muted' : '',
      options.danger ? 'danger' : ''
    ].filter(Boolean).join(' ');
    const badge = options.badge ? `<span class="nlh-section-badge">${options.badge}</span>` : '<span></span>';

    return `
      <div class="${classes}" data-section="${esc(id)}" draggable="true">
        <button class="nlh-section-toggle" type="button" data-section-toggle="${esc(id)}">
          <span class="nlh-section-drag" data-section-drag title="Section verschieben">::</span>
          <span class="nlh-section-chevron">${open ? 'v' : '>'}</span>
          <span class="nlh-section-name">${esc(title)}</span>
          ${badge}
        </button>
        <div class="nlh-section-body">${html}</div>
      </div>
    `;
  }

  function renderOrderedDetailSections(sectionMap) {
    settings.sectionOrder = normalizeSectionOrder(settings.sectionOrder);

    return settings.sectionOrder
      .map(id => sectionMap[id])
      .filter(Boolean)
      .join('');
  }

  function setupSectionDragAndDrop(panel) {
    let draggedId = null;

    panel.querySelectorAll('.nlh-collapsible[data-section]').forEach(section => {
      section.addEventListener('dragstart', event => {
        draggedId = section.getAttribute('data-section');
        section.classList.add('dragging');

        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', draggedId || '');
        }
      });

      section.addEventListener('dragover', event => {
        event.preventDefault();
        if (section.getAttribute('data-section') !== draggedId) {
          section.classList.add('drag-over');
        }
      });

      section.addEventListener('dragleave', () => {
        section.classList.remove('drag-over');
      });

      section.addEventListener('drop', event => {
        event.preventDefault();

        const targetId = section.getAttribute('data-section');
        const sourceId = draggedId || event.dataTransfer?.getData('text/plain');

        panel.querySelectorAll('.nlh-collapsible').forEach(item => item.classList.remove('drag-over', 'dragging'));

        if (!sourceId || !targetId || sourceId === targetId) return;

        const order = normalizeSectionOrder(settings.sectionOrder).filter(id => id !== sourceId);
        const targetIndex = order.indexOf(targetId);
        const rect = section.getBoundingClientRect();
        const dropAfter = event.clientY > rect.top + rect.height / 2;
        const insertAt = targetIndex + (dropAfter ? 1 : 0);

        order.splice(insertAt, 0, sourceId);
        settings.sectionOrder = normalizeSectionOrder(order);
        saveJson(SETTINGS_KEY, settings);
        render();
      });

      section.addEventListener('dragend', () => {
        draggedId = null;
        panel.querySelectorAll('.nlh-collapsible').forEach(item => item.classList.remove('drag-over', 'dragging'));
      });
    });
  }

  function renderGoal(goalState, cacheHint) {
    return `
      <div class="nlh-card top">
        <div class="nlh-card-title">Hauptziel: ${esc(goalState.title)}</div>
        <div>
          <span class="nlh-pill">${esc(goalState.status)}</span>
          ${cacheHint ? `<span class="nlh-pill warn">${esc(cacheHint)}</span>` : ''}
        </div>
        <div class="nlh-reason">Nächster Schritt: ${esc(goalState.nextStep)}</div>
        ${
          goalState.missingSteps.length
            ? `<div class="nlh-missing">
                ${goalState.missingSteps.map(step => `
                  <span class="nlh-pill ${esc(step.tone)}">${esc(step.label)}: ${esc(step.state)}</span>
                `).join('')}
              </div>`
            : '<div class="nlh-good nlh-small">Alle Schritte für dieses Ziel erkannt.</div>'
        }
      </div>
    `;
  }

  function pillClass(value) {
    if (/hoch|jetzt|erledigt|ja/i.test(value)) return 'good';
    if (/blockiert|nein/i.test(value)) return 'danger';
    return 'warn';
  }

  function renderMissingPills(missing, limit = 2) {
    if (!missing?.length) return '';

    const visible = missing.slice(0, limit).map(item => `
      <span class="nlh-pill warn">fehlt ${esc(item.name)} ${fmtNum(item.deficit)} · ${fmtTime(item.waitHours)}</span>
    `).join('');
    const more = missing.length > limit ? `<span class="nlh-pill warn">+${missing.length - limit} mehr</span>` : '';

    return `<div class="nlh-missing">${visible}${more}</div>`;
  }

  function renderTopNextAction(planner) {
    return `
      <div class="nlh-card top">
        <div class="nlh-card-title">${esc(planner.primaryAction || 'Daten vervollständigen')}</div>
        <div>
          <span class="nlh-pill ${pillClass(planner.primaryStatus)}">${esc(planner.primaryStatus)}</span>
          <span class="nlh-pill ${pillClass(planner.confidence)}">Confidence: ${esc(planner.confidence)}</span>
          ${planner.affordability?.known ? `<span class="nlh-pill ${planner.affordability.affordable ? 'good' : 'warn'}">Wartezeit: ${esc(planner.affordability.waitText)}</span>` : ''}
        </div>
        <div class="nlh-reason nlh-clamp">${esc(planner.explanation)}</div>
        ${renderMissingPills(planner.affordability?.missing, 2)}
      </div>
    `;
  }

  function renderCompactBuilding(advisor) {
    const item = advisor.recommended;

    if (!item) return '<div class="nlh-card"><div class="nlh-muted">Nächstes Gebäude: Buildings Cache fehlt.</div></div>';

    const stateClass =
      item.actionState === 'jetzt möglich' || item.actionState === 'startbar'
        ? 'good'
        : item.actionState === 'blockiert'
          ? 'danger'
          : 'warn';
    const title = item.href
      ? `<a class="nlh-link" href="${esc(item.href)}">${esc(item.name)}</a>`
      : esc(item.name);

    return `
      <div class="nlh-card">
        <div class="nlh-card-title">Nächstes Gebäude: ${title}</div>
        <div>
          <span class="nlh-pill">Lv.${esc(item.level)} -> ${esc(item.targetLevel)}</span>
          <span class="nlh-pill ${stateClass}">${esc(item.actionState)}</span>
          ${item.affordability?.known ? `<span class="nlh-pill ${item.affordability.affordable ? 'good' : 'warn'}">${esc(item.affordability.waitText)}</span>` : '<span class="nlh-pill warn">Kosten fehlen</span>'}
        </div>
      </div>
    `;
  }

  function renderCompactGoal(goalState, cacheHint) {
    const progress = String(goalState.status || '').match(/(\d+)\s*\/\s*(\d+)/);

    return `
      <div class="nlh-card">
        <div class="nlh-card-title">Hauptziel: ${esc(goalState.title)}</div>
        <div>
          <span class="nlh-pill">${esc(goalState.status)}</span>
          ${progress ? `<span class="nlh-pill">${esc(progress[1])}/${esc(progress[2])}</span>` : ''}
          ${cacheHint ? `<span class="nlh-pill warn">${esc(cacheHint)}</span>` : ''}
        </div>
        <div class="nlh-reason nlh-clamp">Nächster Schritt: ${esc(goalState.nextStep)}</div>
      </div>
    `;
  }

  function renderCompactWarnings(warningList, limit = 2) {
    const sorted = [...warningList].sort((a, b) => (a.type === 'danger' ? 0 : 1) - (b.type === 'danger' ? 0 : 1));
    const visible = sorted.slice(0, limit);

    if (!visible.length) return '<div class="nlh-card"><div class="nlh-good">Keine akuten Warnungen erkannt.</div></div>';

    return `
      ${visible.map(warning => `
        <div class="nlh-alert ${warning.type === 'danger' ? 'danger' : ''}">
          <div class="${warning.type === 'danger' ? 'nlh-danger' : 'nlh-warn'}">${esc(warning.title)}</div>
          <div class="nlh-reason nlh-clamp">${esc(warning.text)}</div>
        </div>
      `).join('')}
      ${sorted.length > limit ? `<div class="nlh-footer-note">+${sorted.length - limit} weitere Warnungen in Details</div>` : ''}
    `;
  }

  function renderTopSummary(nextActionPlanner, buildingAdvisor, goalState, warningList, cacheHint) {
    return `
      <div class="nlh-section">
        <div class="nlh-section-title">Aktuell wichtig</div>
        ${renderTopNextAction(nextActionPlanner)}
        ${renderCompactBuilding(buildingAdvisor)}
        ${renderCompactGoal(goalState, cacheHint)}
        ${renderCompactWarnings(warningList, 2)}
      </div>
    `;
  }

  function renderCompactDashboard(currentStatus, fleet, dataQuality, resources) {
    const researchCached = dataQuality.cachedBranches.filter(branch => branch.cached).length;
    const energy = getEnergy(resources);
    const items = [
      ['Lab', currentStatus.lab ? `Lv.${currentStatus.lab}` : '?'],
      ['Fleet', fleet.max != null ? `${fleet.active}/${fleet.max}` : '?'],
      ['Mining', dataQuality.miningDetected ? 'Ja' : 'Nein'],
      ['Energie frei', energy && Number.isFinite(energy.free) ? fmtNum(energy.free) : '?'],
      ['Research Cache', `${researchCached}/${dataQuality.cachedBranches.length}`],
      ['Buildings Cache', dataQuality.buildingsCached ? 'Ja' : 'Nein']
    ];

    return `
      <div class="nlh-section">
        <div class="nlh-section-title">Compact Dashboard</div>
        <div class="nlh-dashboard">
          ${items.map(([label, value]) => `
            <div class="nlh-dash-item">
              <div class="nlh-dash-label">${esc(label)}</div>
              <div class="nlh-dash-value">${esc(value)}</div>
            </div>
          `).join('')}
        </div>
        <div class="nlh-footer-note">Cache: Research ${researchCached}/${dataQuality.cachedBranches.length} · Buildings ${dataQuality.buildingsCached ? 'ok' : 'fehlt'} · Fleet ${dataQuality.fleetCached ? 'ok' : 'fehlt'}</div>
      </div>
    `;
  }

  function renderBuildingOrder(advisor) {
    const phaseLabel = {
      anomaly_rush: 'Anomaly Rush',
      sentinel_setup: 'Sentinel Setup',
      economy_stabilize: 'Economy Stabilize'
    }[advisor.phase] || advisor.phase;

    if (!advisor.queue.length) {
      return `
        <div>
          <span class="nlh-pill warn">Phase: ${esc(phaseLabel)}</span>
        </div>
        <div class="nlh-card"><div class="nlh-muted">Keine Gebäudedaten erkannt. Öffne einmal /buildings.</div></div>
      `;
    }

    return `
      <div>
        <span class="nlh-pill warn">Phase: ${esc(phaseLabel)}</span>
      </div>
      <div class="nlh-card">
        <div class="nlh-priority-list">
          ${advisor.queue.map((building, index) => `
            <div class="nlh-priority-row">
              <div class="nlh-muted">${index + 1}.</div>
              <div>
                <strong>${esc(building.name)} Lv${esc(building.targetLevel)}</strong>
                <div class="nlh-muted nlh-small nlh-clamp">${esc(building.reason)}</div>
              </div>
              <div><span class="nlh-pill ${building.actionState === 'jetzt möglich' ? 'good' : building.actionState === 'blockiert' ? 'danger' : 'warn'}">${esc(building.actionState)}</span></div>
            </div>
          `).join('')}
        </div>
      </div>
      ${advisor.notes.map(note => `<div class="nlh-footer-note">${esc(note)}</div>`).join('')}
    `;
  }

  function renderWarningsList(warningList) {
    return warningList.length
      ? warningList.map(warning => `
          <div class="nlh-alert ${warning.type === 'danger' ? 'danger' : ''}">
            <div class="${warning.type === 'danger' ? 'nlh-danger' : 'nlh-warn'}">${esc(warning.title)}</div>
            <div class="nlh-reason">${esc(warning.text)}</div>
          </div>
        `).join('')
      : '<div class="nlh-card"><div class="nlh-good">Keine akuten Warnungen erkannt.</div></div>';
  }

  function renderTopPriorities(actionList, immediate, waiting, warningList) {
    return `
      <div class="nlh-section">
        <div class="nlh-card-title">Warnungen</div>
        ${renderWarningsList(warningList)}
      </div>
      <div class="nlh-section">
        <div class="nlh-card-title">Jetzt sinnvoll</div>
        ${
          immediate.length
            ? immediate.slice(0, 5).map((action, index) => renderCard(action, index, index === 0)).join('')
            : '<div class="nlh-muted">Keine sofort startbare Guide-Aktion sichtbar.</div>'
        }
      </div>
      <div class="nlh-section">
        <div class="nlh-card-title">Warten bis bezahlbar</div>
        ${
          waiting.length
            ? waiting.map((action, index) => renderCard(action, index, false)).join('')
            : '<div class="nlh-muted">Keine Wartezeit-Ziele mit sichtbaren Kosten erkannt.</div>'
        }
      </div>
      ${
        actionList.length
          ? actionList.slice(0, 8).map((action, index) => renderCard(action, index, index === 0)).join('')
          : '<div class="nlh-card"><div class="nlh-muted">Keine Aktionen erkannt.</div></div>'
      }
    `;
  }

  function renderCompactResources(resources) {
    const rows = ['Ore', 'Silicates', 'Hydrogen', 'Alloys', 'Energy', 'Population', 'Bio-Extract']
      .map(name => getRes(resources, name))
      .filter(Boolean)
      .map(resource => `
        <div class="nlh-resource-row">
          <strong>${esc(resource.name)}</strong>
          <span class="${String(resource.net || resource.rate).startsWith('+') ? 'nlh-good' : 'nlh-muted'}">${esc(resource.net || resource.rate || '-')}</span>
          <span class="${soonFull(resource.storageFullIn) ? 'nlh-warn' : 'nlh-muted'}">${esc(resource.storageFullIn || '-')}</span>
        </div>
      `).join('');

    return rows
      ? `<div class="nlh-card"><div class="nlh-resource-table">${rows}</div></div>`
      : '<div class="nlh-muted">Keine Ressourcen erkannt.</div>';
  }

  function renderRailStatus(resources, warningList) {
    const energy = getEnergy(resources);
    const ore = getRes(resources, 'Ore');
    const silicates = getRes(resources, 'Silicates');
    const hydrogen = getRes(resources, 'Hydrogen');
    const hasDanger = warningList.some(warning => warning.type === 'danger');
    const hasWarning = warningList.length > 0;
    const bits = [];

    if (hasDanger || hasWarning) bits.push(hasDanger ? '⚠' : '!');
    if (energy) bits.push(`E ${fmtNum(energy.free)}`);
    if (ore?.amount != null) bits.push(`O ${fmtNum(ore.amount)}`);
    if (silicates?.amount != null) bits.push(`S ${fmtNum(silicates.amount)}`);
    if (hydrogen?.amount != null) bits.push(`H ${fmtNum(hydrogen.amount)}`);

    return bits.length ? bits.join(' · ') : 'Status';
  }

  function renderNextAction(planner) {
    const missingHtml = planner.affordability?.missing?.length
      ? `<div class="nlh-missing">${planner.affordability.missing.map(missing => `
          <span class="nlh-pill warn">fehlt ${esc(missing.name)} ${fmtNum(missing.deficit)} · ${fmtTime(missing.waitHours)}</span>
        `).join('')}</div>`
      : '';

    return `
      <div class="nlh-card top">
        <div class="nlh-card-title">${esc(planner.primaryAction || 'Daten vervollständigen')}</div>
        <div>
          <span class="nlh-pill ${pillClass(planner.primaryStatus)}">${esc(planner.primaryStatus)}</span>
          <span class="nlh-pill ${pillClass(planner.confidence)}">Confidence: ${esc(planner.confidence)}</span>
          ${planner.affordability?.known ? `<span class="nlh-pill ${planner.affordability.affordable ? 'good' : 'warn'}">Wartezeit: ${esc(planner.affordability.waitText)}</span>` : ''}
        </div>
        <div class="nlh-reason">${esc(planner.explanation)}</div>
        ${missingHtml}
        ${planner.secondaryActions.length ? `<div class="nlh-missing">${planner.secondaryActions.map(item => `<span class="nlh-pill warn">${esc(item)}</span>`).join('')}</div>` : ''}
        ${planner.blockers.length ? `<div class="nlh-missing">${planner.blockers.map(item => `<span class="nlh-pill danger">${esc(item)}</span>`).join('')}</div>` : ''}
      </div>
    `;
  }

  function renderResearchPlan(plan) {
    const missingHtml = plan.missing.length
      ? plan.missing.map(item => `<span class="nlh-pill ${item.hard ? 'warn' : ''}">${esc(item.name)}: ${esc(item.state)}${item.hard ? '' : ' (optional)'}</span>`).join('')
      : '<span class="nlh-pill good">Alle sichtbaren Schritte erledigt</span>';
    const blockedHtml = plan.prereqMissing.length
      ? plan.prereqMissing.map(item => `<span class="nlh-pill danger">${esc(item.name)}</span>`).join('')
      : '';

    return `
      <div class="nlh-card">
        <div class="nlh-card-title">Ziel: ${esc(plan.target)}</div>
        <div>
          <span class="nlh-pill">${esc(plan.progress.done)}/${esc(plan.progress.total)}</span>
          <span class="nlh-pill ${plan.startable ? 'good' : plan.blocked ? 'danger' : 'warn'}">${plan.completed ? 'erledigt' : plan.startable ? 'startbar' : plan.blocked ? 'blockiert' : 'wartet'}</span>
        </div>
        <div class="nlh-reason">Nächstes Research-Ziel: ${esc(plan.nextResearch?.name || 'Daten vervollständigen')}</div>
        <div class="nlh-missing">${missingHtml}</div>
        ${blockedHtml ? `<div class="nlh-missing">${blockedHtml}</div>` : ''}
        ${plan.unknownDataHints.length ? `<div class="nlh-missing">${plan.unknownDataHints.map(item => `<span class="nlh-pill warn">Daten fehlen: ${esc(item)}</span>`).join('')}</div>` : ''}
      </div>
    `;
  }

  function renderPlanList(title, items) {
    return `
      <div class="nlh-card">
        <div class="nlh-card-title">${esc(title)}</div>
        ${
          items.length
            ? items.map(item => `<div class="nlh-check-row"><div class="nlh-check-label">${esc(item)}</div></div>`).join('')
            : '<div class="nlh-muted">Keine Punkte erkannt.</div>'
        }
      </div>
    `;
  }

  function renderSessionPlan(plan) {
    return `
      ${renderPlanList('Jetzt', plan.now)}
      ${renderPlanList('Nächste 30m', plan.next30)}
      ${renderPlanList('Nächste 60m', plan.next60)}
      ${renderPlanList('Nächste 120m', plan.next120)}
      ${renderPlanList('Risiken', plan.idleRisks)}
    `;
  }

  function renderOnboarding(dataQuality) {
    const cachedResearch = dataQuality.cachedBranches.filter(branch => branch.cached).length;

    if (dataQuality.fleetCached || dataQuality.buildingsCached || cachedResearch >= 2) return '';

    return `
      <div class="nlh-section">
        <div class="nlh-card">
          <div class="nlh-card-title">Für bessere Empfehlungen einmal öffnen:</div>
          <div class="nlh-reason">Fleet, Buildings, Research Science/Economy/Military</div>
        </div>
      </div>
    `;
  }

  function renderDataQuality(dataQuality) {
    return `
      <div class="nlh-card">
        <div>
          ${dataQuality.cachedBranches.map(branch => `<span class="nlh-pill ${branch.cached ? 'good' : 'warn'}">${esc(branch.label)}: ${branch.cached ? 'cached' : 'fehlt'}</span>`).join('')}
          <span class="nlh-pill ${dataQuality.buildingsCached ? 'good' : 'warn'}">Buildings cached: ${dataQuality.buildingsCached ? 'Ja' : 'Nein'}</span>
          <span class="nlh-pill ${dataQuality.fleetCached ? 'good' : 'warn'}">Fleet cached: ${dataQuality.fleetCached ? 'Ja' : 'Nein'}</span>
          <span class="nlh-pill ${dataQuality.miningDetected ? 'good' : 'danger'}">Mining erkannt: ${dataQuality.miningDetected ? 'Ja' : 'Nein'}</span>
          <span class="nlh-pill">Update: ${esc(dataQuality.lastUpdated)}</span>
          <span class="nlh-pill">DOM Dumps: ${esc(dataQuality.domDumpPages.length)}</span>
        </div>
        <button class="nlh-debug-copy">Debug kopieren</button>
        <button class="nlh-debug-copy data-dump-current">DOM Dump kopieren</button>
        <button class="nlh-debug-copy data-dump-all">Alle Dumps kopieren</button>
        <div class="nlh-debug-output nlh-footer-note"></div>
      </div>
    `;
  }

  function getCurrentDebugData() {
    const resources = getResources();
    const buildings = getBuildings();
    const research = getResearch();
    const fleet = fleetState();
    const advisor = getBuildingAdvisor(resources, buildings, research, fleet);
    const goalState = buildGoalState(resources, buildings, research, fleet);
    const nextAction = buildNextActionPlanner(resources, buildings, research, fleet, goalState, advisor);

    return buildDataQuality(resources, buildings, research, fleet, nextAction, advisor);
  }

  function writeDebugOutput(output, successText) {
    const panel = document.getElementById(PANEL_ID);
    const target = panel?.querySelector('.nlh-debug-output');

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(output)
        .then(() => {
          if (target) target.textContent = successText;
        })
        .catch(() => {
          if (target) target.innerHTML = `<textarea rows="6" style="width:100%">${esc(output)}</textarea>`;
        });
      return;
    }

    if (target) {
      target.innerHTML = `<textarea rows="6" style="width:100%">${esc(output)}</textarea>`;
    } else {
      prompt(successText, output);
    }
  }

  function copyDebugData() {
    const output = JSON.stringify(getCurrentDebugData(), null, 2);
    writeDebugOutput(output, 'Debug JSON kopiert.');
  }

  function copyDomDump(allPages = false) {
    const payload = allPages
      ? getDomDumpPayload()
      : captureDomDump();
    const output = JSON.stringify(payload, null, 2);
    writeDebugOutput(output, allPages ? 'Alle DOM Dumps kopiert.' : 'DOM Dump kopiert.');
  }

  function renderBuildingAdvisor(advisor) {
    const phaseLabel = {
      anomaly_rush: 'Anomaly Rush',
      sentinel_setup: 'Sentinel Setup',
      economy_stabilize: 'Economy Stabilize'
    }[advisor.phase] || advisor.phase;

    if (!advisor.recommended) {
      return `
        <div class="nlh-building-advisor">
          <div>
            <span class="nlh-pill warn">Phase: ${esc(phaseLabel)}</span>
          </div>
          <div class="nlh-card">
            <div class="nlh-muted">Keine Gebäudedaten erkannt. Öffne einmal /buildings.</div>
          </div>
          ${advisor.notes.map(note => `<div class="nlh-footer-note">${esc(note)}</div>`).join('')}
        </div>
      `;
    }

    const item = advisor.recommended;
    const stateClass =
      item.actionState === 'jetzt möglich' || item.actionState === 'startbar'
        ? 'good'
        : item.actionState === 'blockiert'
          ? 'danger'
          : 'warn';

    const missingHtml = item.affordability?.missing?.length
      ? `
        <div class="nlh-missing">
          ${item.affordability.missing.map(missing => `
            <span class="nlh-pill warn">
              fehlt ${esc(missing.name)} ${fmtNum(missing.deficit)} · ${fmtTime(missing.waitHours)}
            </span>
          `).join('')}
        </div>
      `
      : '';

    const waitHtml = item.affordability?.known
      ? `<span class="nlh-pill ${item.affordability.affordable ? 'good' : 'warn'}">Wartezeit: ${esc(item.affordability.waitText)}</span>`
      : '<span class="nlh-pill warn">Kosten nicht sichtbar</span>';

    const listHtml = advisor.queue.map((building, index) => `
      <div class="nlh-priority-row">
        <div class="nlh-muted">${index + 1}.</div>
        <div>
          <strong>${esc(building.name)} Lv${esc(building.targetLevel)}</strong>
          <div class="nlh-muted nlh-small">${esc(building.reason)}</div>
        </div>
        <div><span class="nlh-pill ${building.actionState === 'jetzt möglich' ? 'good' : 'warn'}">${esc(building.actionState)}</span></div>
      </div>
    `).join('');

    return `
      <div class="nlh-building-advisor">
        <div>
          <span class="nlh-pill warn">Phase: ${esc(phaseLabel)}</span>
        </div>
        <div class="nlh-card top">
          <div class="nlh-card-title">
            <span>Nächstes Gebäude</span>
            <span class="nlh-muted nlh-small">Score ${Math.round(item.score)}</span>
          </div>
          <div>
            <strong>${esc(item.name)}</strong>
            <span class="nlh-pill">Lv.${esc(item.level)} → ${esc(item.targetLevel)}</span>
            <span class="nlh-pill ${stateClass}">${esc(item.actionState)}</span>
            ${item.fromCache ? '<span class="nlh-pill warn">aus Cache</span>' : ''}
            ${waitHtml}
          </div>
          <div class="nlh-reason">${esc(item.reason)}</div>
          ${missingHtml}
          ${
            item.warnings.length
              ? `<div class="nlh-missing">${item.warnings.map(warning => `<span class="nlh-pill warn">${esc(warning)}</span>`).join('')}</div>`
              : ''
          }
        </div>
        <div class="nlh-card">
          <div class="nlh-card-title">Gebäude-Reihenfolge</div>
          <div class="nlh-priority-list">${listHtml}</div>
        </div>
        ${advisor.notes.map(note => `<div class="nlh-footer-note">${esc(note)}</div>`).join('')}
      </div>
    `;
  }

  function renderChecklist(checklist) {
    return `
      <div class="nlh-card">
        ${checklist.map(item => `
          <div class="nlh-check-row">
            <div class="nlh-check-label">${esc(item.label)}</div>
            <div class="nlh-check-state">
              <span class="nlh-pill ${esc(item.tone)}">${esc(item.state)}</span>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  function render() {
    const panel = document.getElementById(PANEL_ID);

    if (!panel) return;

    const resources = getResources();
    const buildings = getBuildings();
    const research = getResearch();
    const fleet = fleetState();
    const currentStatus = status(buildings);
    const goalState = buildGoalState(resources, buildings, research, fleet);
    const buildingAdvisor = getBuildingAdvisor(resources, buildings, research, fleet);
    const checklist = buildGuideChecklist(resources, buildings, research, fleet);
    const cacheHint = researchCacheHint();
    const nextActionPlanner = buildNextActionPlanner(resources, buildings, research, fleet, goalState, buildingAdvisor);
    const researchPlan = buildResearchDependencyPlan('Anomaly Scanning', research, buildings);
    const sessionPlan = buildSessionPlan(resources, buildings, research, fleet, nextActionPlanner, buildingAdvisor);
    captureDomDump();
    const dataQuality = buildDataQuality(resources, buildings, research, fleet, nextActionPlanner, buildingAdvisor);
    const actionList = actions(resources, buildings, research);
    const warningList = warnings(resources, fleet);
    const railStatus = renderRailStatus(resources, warningList);

    const statusBits = [];

    if (currentStatus.queue) statusBits.push(`Queue ${currentStatus.queue}`);
    if (currentStatus.slots) statusBits.push(`Slots ${currentStatus.slots}`);
    if (fleet.max != null) statusBits.push(`Fleet ${fleet.active}/${fleet.max}${fleet.fromCache ? ' cached' : ''}`);
    if (currentStatus.lab) statusBits.push(`Lab Lv.${currentStatus.lab}`);

    const immediate = actionList.filter(action =>
      action.actionState === 'jetzt möglich' ||
      action.actionState === 'startbar'
    );

    const waiting = actionList
      .filter(action => action.actionState.startsWith('wartet'))
      .slice(0, 5);

    const warningsHtml = warningList.length
      ? warningList.map(warning => `
          <div class="nlh-alert ${warning.type === 'danger' ? 'danger' : ''}">
            <div class="${warning.type === 'danger' ? 'nlh-danger' : 'nlh-warn'}">${esc(warning.title)}</div>
            <div class="nlh-reason">${esc(warning.text)}</div>
          </div>
        `).join('')
      : '<div class="nlh-card"><div class="nlh-good">Keine akuten Warnungen erkannt.</div></div>';

    const resourcesHtml = ['Ore', 'Silicates', 'Hydrogen', 'Alloys', 'Energy', 'Population', 'Bio-Extract']
      .map(name => getRes(resources, name))
      .filter(Boolean)
      .map(resource => `
        <div class="nlh-row">
          <div>
            <strong>${esc(resource.name)}</strong>
            ${
              resource.storageFullIn
                ? `<div class="${soonFull(resource.storageFullIn) ? 'nlh-warn' : 'nlh-muted'} nlh-small">Lager voll: ${esc(resource.storageFullIn)}</div>`
                : ''
            }
          </div>
          <div class="${String(resource.net || resource.rate).startsWith('+') ? 'nlh-good' : 'nlh-muted'}">${esc(resource.net || resource.rate || '')}</div>
        </div>
      `).join('');

    const legacyLayout = `
      ${renderOnboarding(dataQuality)}

      <div class="nlh-section">
        <div class="nlh-section-title">
          <span>Status</span>
          <span class="nlh-muted">${esc(location.pathname + location.search)}</span>
        </div>
        <div class="nlh-card">
          ${statusBits.map(bit => `<span class="nlh-pill">${esc(bit)}</span>`).join('') || '<span class="nlh-muted">Status nicht erkannt.</span>'}
          <div class="nlh-footer-note">Nur Overlay/Rechner. Keine Klicks, keine Requests, keine Automatisierung.</div>
        </div>
      </div>

      <div class="nlh-section">
        <div class="nlh-section-title">Hauptziel</div>
        ${renderGoal(goalState, cacheHint)}
      </div>

      <div class="nlh-section">
        <div class="nlh-section-title">Next Action</div>
        ${renderNextAction(nextActionPlanner)}
      </div>

      <div class="nlh-section">
        <div class="nlh-section-title">Research Plan</div>
        ${renderResearchPlan(researchPlan)}
      </div>

      <div class="nlh-section">
        <div class="nlh-section-title">Session Plan</div>
        ${renderSessionPlan(sessionPlan)}
      </div>

      <div class="nlh-section">
        <div class="nlh-section-title">Gebäudeberater</div>
        ${renderBuildingAdvisor(buildingAdvisor)}
      </div>

      <div class="nlh-section">
        <div class="nlh-section-title">Guide-Checkliste</div>
        ${renderChecklist(checklist)}
      </div>

      <div class="nlh-section">
        <div class="nlh-section-title">Jetzt sinnvoll</div>
        ${
          immediate.length
            ? immediate.slice(0, 5).map((action, index) => renderCard(action, index, index === 0)).join('')
            : '<div class="nlh-card"><div class="nlh-muted">Keine sofort startbare Guide-Aktion sichtbar.</div></div>'
        }
      </div>

      <div class="nlh-section">
        <div class="nlh-section-title">Warten bis bezahlbar</div>
        ${
          waiting.length
            ? waiting.map((action, index) => renderCard(action, index, false)).join('')
            : '<div class="nlh-card"><div class="nlh-muted">Keine Wartezeit-Ziele mit sichtbaren Kosten erkannt.</div></div>'
        }
      </div>

      <div class="nlh-section">
        <div class="nlh-section-title">Warnungen</div>
        ${warningsHtml}
      </div>

      <div class="nlh-section">
        <div class="nlh-section-title">Top-Prioritäten</div>
        ${
          actionList.length
            ? actionList.slice(0, 8).map((action, index) => renderCard(action, index, index === 0)).join('')
            : '<div class="nlh-card"><div class="nlh-muted">Keine Aktionen erkannt.</div></div>'
        }
      </div>

      <div class="nlh-section">
        <div class="nlh-section-title">Guide-Pfad</div>
        <div class="nlh-card">
          ${GUIDE_TECH_ORDER.map(item => `<span class="nlh-pill">${esc(item)}</span>`).join('')}
        </div>
      </div>

      <div class="nlh-section">
        <div class="nlh-section-title">Ressourcen</div>
        ${resourcesHtml || '<div class="nlh-muted">Keine Ressourcen erkannt.</div>'}
      </div>

      <div class="nlh-section">
        <div class="nlh-section-title">Datenstatus</div>
        ${renderDataQuality(dataQuality)}
      </div>

      <div class="nlh-footer-note">
        Für beste Ergebnisse einmal /overview, /fleet, /mining, /buildings und alle Research-Branches öffnen. Research/Fleet/Buildings werden lokal gecached.
      </div>
    `;

    const detailSections = {
      'research-plan': renderCollapsibleSection('research-plan', 'Research Plan', renderResearchPlan(researchPlan), {
        defaultOpen: true,
        badge: `<span class="nlh-pill ${researchPlan.startable ? 'good' : researchPlan.blocked ? 'danger' : 'warn'}">${esc(researchPlan.progress.done)}/${esc(researchPlan.progress.total)}</span>`
      }),
      'building-order': renderCollapsibleSection('building-order', 'Gebäude-Reihenfolge', renderBuildingOrder(buildingAdvisor), {
        defaultOpen: true,
        badge: buildingAdvisor.recommended ? `<span class="nlh-pill ${buildingAdvisor.recommended.actionState === 'jetzt möglich' ? 'good' : 'warn'}">${esc(buildingAdvisor.recommended.actionState)}</span>` : '<span class="nlh-pill warn">fehlt</span>'
      }),
      'session-plan': renderCollapsibleSection('session-plan', 'Session Plan', renderSessionPlan(sessionPlan), {
        defaultOpen: false,
        badge: `<span class="nlh-pill">${sessionPlan.now.length}</span>`
      }),
      checklist: renderCollapsibleSection('checklist', 'Guide-Checkliste', renderChecklist(checklist), {
        defaultOpen: false,
        badge: `<span class="nlh-pill">${checklist.filter(item => item.tone === 'good').length}/${checklist.length}</span>`
      }),
      resources: renderCollapsibleSection('resources', 'Ressourcen', renderCompactResources(resources), {
        defaultOpen: false,
        muted: true
      }),
      'data-debug': renderCollapsibleSection('data-debug', 'Datenstatus / Debug', renderDataQuality(dataQuality), {
        defaultOpen: false,
        muted: true
      }),
      priorities: renderCollapsibleSection('priorities', 'Top-Prioritäten', renderTopPriorities(actionList, immediate, waiting, warningList), {
        defaultOpen: false,
        badge: `<span class="nlh-pill">${actionList.length}</span>`,
        danger: warningList.some(warning => warning.type === 'danger')
      }),
      'guide-path': renderCollapsibleSection('guide-path', 'Guide-Pfad', `
        <div class="nlh-card">
          ${GUIDE_TECH_ORDER.map(item => `<span class="nlh-pill">${esc(item)}</span>`).join('')}
        </div>
      `, {
        defaultOpen: false,
        muted: true
      })
    };

    const rail = panel.querySelector('.nlh-rail-status');

    if (rail) rail.textContent = railStatus;

    panel.querySelector('.nlh-body').innerHTML = `
      ${renderOnboarding(dataQuality)}
      ${renderTopSummary(nextActionPlanner, buildingAdvisor, goalState, warningList, cacheHint)}
      ${renderCompactDashboard(currentStatus, fleet, dataQuality, resources)}

      <div class="nlh-details">
        ${renderCollapsibleSection('research-plan', 'Research Plan', renderResearchPlan(researchPlan), {
          defaultOpen: true,
          badge: `<span class="nlh-pill ${researchPlan.startable ? 'good' : researchPlan.blocked ? 'danger' : 'warn'}">${esc(researchPlan.progress.done)}/${esc(researchPlan.progress.total)}</span>`
        })}
        ${renderCollapsibleSection('building-order', 'Gebäude-Reihenfolge', renderBuildingOrder(buildingAdvisor), {
          defaultOpen: true,
          badge: buildingAdvisor.recommended ? `<span class="nlh-pill ${buildingAdvisor.recommended.actionState === 'jetzt möglich' ? 'good' : 'warn'}">${esc(buildingAdvisor.recommended.actionState)}</span>` : '<span class="nlh-pill warn">fehlt</span>'
        })}
        ${renderCollapsibleSection('session-plan', 'Session Plan', renderSessionPlan(sessionPlan), {
          defaultOpen: false,
          badge: `<span class="nlh-pill">${sessionPlan.now.length}</span>`
        })}
        ${renderCollapsibleSection('checklist', 'Guide-Checkliste', renderChecklist(checklist), {
          defaultOpen: false,
          badge: `<span class="nlh-pill">${checklist.filter(item => item.tone === 'good').length}/${checklist.length}</span>`
        })}
        ${renderCollapsibleSection('resources', 'Ressourcen', renderCompactResources(resources), {
          defaultOpen: false,
          muted: true
        })}
        ${renderCollapsibleSection('data-debug', 'Datenstatus / Debug', renderDataQuality(dataQuality), {
          defaultOpen: false,
          muted: true
        })}
        ${renderCollapsibleSection('priorities', 'Top-Prioritäten', renderTopPriorities(actionList, immediate, waiting, warningList), {
          defaultOpen: false,
          badge: `<span class="nlh-pill">${actionList.length}</span>`,
          danger: warningList.some(warning => warning.type === 'danger')
        })}
        ${renderCollapsibleSection('guide-path', 'Guide-Pfad', `
          <div class="nlh-card">
            ${GUIDE_TECH_ORDER.map(item => `<span class="nlh-pill">${esc(item)}</span>`).join('')}
          </div>
        `, {
          defaultOpen: false,
          muted: true
        })}
      </div>

      <div class="nlh-footer-note">
        Nur Overlay/Rechner. Keine Klicks, keine Requests, keine Automatisierung.
      </div>
    `;

    panel.querySelector('.nlh-body').innerHTML = `
      ${renderOnboarding(dataQuality)}
      ${renderTopSummary(nextActionPlanner, buildingAdvisor, goalState, warningList, cacheHint)}
      ${renderCompactDashboard(currentStatus, fleet, dataQuality, resources)}

      <div class="nlh-details">
        ${renderOrderedDetailSections(detailSections)}
      </div>

      <div class="nlh-footer-note">
        Nur Overlay/Rechner. Keine Klicks, keine Requests, keine Automatisierung.
      </div>
    `;

    panel.querySelectorAll('[data-section-toggle]').forEach(button => {
      button.addEventListener('click', event => {
        if (event.target.closest('[data-section-drag]')) return;

        const id = button.getAttribute('data-section-toggle');
        const section = button.closest('.nlh-collapsible');

        if (!id || !section) return;

        const open = section.classList.contains('closed');
        setSectionOpen(id, open);
        section.classList.toggle('closed', !open);
        section.classList.toggle('open', open);
        section.querySelector('.nlh-section-chevron').textContent = open ? 'v' : '>';
      });
    });

    setupSectionDragAndDrop(panel);
    applyCompactMode();
    panel.querySelector('.nlh-debug-copy')?.addEventListener('click', copyDebugData);
    panel.querySelector('.data-dump-current')?.addEventListener('click', () => copyDomDump(false));
    panel.querySelector('.data-dump-all')?.addEventListener('click', () => copyDomDump(true));
  }

  function boot() {
    if (!document.body) return;

    createPanel();
    render();
  }

  let timer = null;

  new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(boot, 350);
  }).observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true
  });

  boot();
})();
