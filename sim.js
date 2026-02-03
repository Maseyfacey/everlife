// sim.js — FULL working file (v3)
// Ecosystem sim (GitHub Pages / browser only)
// ✅ Plants -> Grazers -> Hunters
// ✅ Size gene + mutation + speciation (auto color + name)
// ✅ Legend panel (click species to follow)
// ✅ Optional labels only when zoomed in
// ✅ 3 save slots (World 1/2/3) stored in localStorage
// ✅ Export / Import world (.json)
// ✅ Autosave (settings + world) to selected slot

// ---------------- DOM ----------------
const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d", { alpha: false });

const statsEl = document.getElementById("stats");
const pauseBtn = document.getElementById("pauseBtn");
const resetBtn = document.getElementById("resetBtn");
const resetViewBtn = document.getElementById("resetViewBtn");

const drawTrailsEl = document.getElementById("drawTrails");
const drawHeatEl = document.getElementById("drawHeat");
const showLabelsEl = document.getElementById("showLabels");
const autosaveEl = document.getElementById("autosave");

const tickEveryEl = document.getElementById("tickEvery");
const plantGrowthEl = document.getElementById("plantGrowth");
const mutRateEl = document.getElementById("mutRate");
const mutStrengthEl = document.getElementById("mutStrength");
const speciesSplitEl = document.getElementById("speciesSplit");

const v_tickEvery = document.getElementById("v_tickEvery");
const v_plantGrowth = document.getElementById("v_plantGrowth");
const v_mutRate = document.getElementById("v_mutRate");
const v_mutStrength = document.getElementById("v_mutStrength");
const v_speciesSplit = document.getElementById("v_speciesSplit");

const slotSelect = document.getElementById("slotSelect");
const exportBtn = document.getElementById("exportBtn");
const importFile = document.getElementById("importFile");
const clearSlotBtn = document.getElementById("clearSlotBtn");

const legendListEl = document.getElementById("legendList");
const tabG = document.getElementById("tabG");
const tabH = document.getElementById("tabH");
const unfollowBtn = document.getElementById("unfollowBtn");

// ---------------- Canvas fit ----------------
function fitCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", fitCanvas);
fitCanvas();

const W = () => canvas.getBoundingClientRect().width;
const H = () => canvas.getBoundingClientRect().height;

// ---------------- Utils ----------------
const rand = (a = 1, b = 0) => Math.random() * (a - b) + b;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const dist2 = (ax, ay, bx, by) => (ax - bx) ** 2 + (ay - by) ** 2;

function wrapPos(o) {
  const w = W(), h = H();
  if (o.x < 0) o.x += w; else if (o.x > w) o.x -= w;
  if (o.y < 0) o.y += h; else if (o.y > h) o.y -= h;
}

function downloadTextFile(filename, text) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ---------------- Settings ----------------
const SETTINGS_KEY = "ecosim_settings_v3";
const WORLD_KEY_BASE = "ecosim_world_v3_slot_"; // + slot number

const defaults = {
  tickEvery: 2,
  plantGrowth: 0.006,
  mutRate: 0.10,
  mutStrength: 0.10,
  speciesSplit: 0.30,
  autosave: true,
};

let settings = { ...defaults };

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return;
    settings = { ...defaults, ...JSON.parse(raw) };
  } catch {}
}

function saveSettings() {
  if (!autosaveEl.checked) return;
  try {
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        tickEvery: settings.tickEvery,
        plantGrowth: settings.plantGrowth,
        mutRate: settings.mutRate,
        mutStrength: settings.mutStrength,
        speciesSplit: settings.speciesSplit,
        autosave: autosaveEl.checked,
      })
    );
  } catch {}
}

function syncUIFromSettings() {
  tickEveryEl.value = String(settings.tickEvery);
  plantGrowthEl.value = String(settings.plantGrowth);
  mutRateEl.value = String(settings.mutRate);
  mutStrengthEl.value = String(settings.mutStrength);
  speciesSplitEl.value = String(settings.speciesSplit);
  autosaveEl.checked = !!settings.autosave;

  v_tickEvery.textContent = String(settings.tickEvery);
  v_plantGrowth.textContent = settings.plantGrowth.toFixed(3);
  v_mutRate.textContent = settings.mutRate.toFixed(2);
  v_mutStrength.textContent = settings.mutStrength.toFixed(2);
  v_speciesSplit.textContent = settings.speciesSplit.toFixed(2);
}

function bindSettingHandlers() {
  autosaveEl.addEventListener("change", () => {
    settings.autosave = autosaveEl.checked;
    saveSettings();
  });

  tickEveryEl.addEventListener("input", () => {
    settings.tickEvery = parseInt(tickEveryEl.value, 10);
    v_tickEvery.textContent = String(settings.tickEvery);
    saveSettings();
  });
  plantGrowthEl.addEventListener("input", () => {
    settings.plantGrowth = parseFloat(plantGrowthEl.value);
    v_plantGrowth.textContent = settings.plantGrowth.toFixed(3);
    saveSettings();
  });
  mutRateEl.addEventListener("input", () => {
    settings.mutRate = parseFloat(mutRateEl.value);
    v_mutRate.textContent = settings.mutRate.toFixed(2);
    saveSettings();
  });
  mutStrengthEl.addEventListener("input", () => {
    settings.mutStrength = parseFloat(mutStrengthEl.value);
    v_mutStrength.textContent = settings.mutStrength.toFixed(2);
    saveSettings();
  });
  speciesSplitEl.addEventListener("input", () => {
    settings.speciesSplit = parseFloat(speciesSplitEl.value);
    v_speciesSplit.textContent = settings.speciesSplit.toFixed(2);
    saveSettings();
  });
}

loadSettings();
syncUIFromSettings();
bindSettingHandlers();

// ---------------- Save slot ----------------
let currentSlot = parseInt(slotSelect.value, 10) || 1;
function worldKey() { return WORLD_KEY_BASE + currentSlot; }

// ---------------- Camera (infinite zoom/pan) ----------------
const cam = { x: 0, y: 0, scale: 1.0 };

function resetView() {
  cam.x = W() / 2;
  cam.y = H() / 2;
  cam.scale = 1.0;
}
resetViewBtn.addEventListener("click", resetView);
canvas.addEventListener("dblclick", (e) => {
  e.preventDefault();
  resetView();
});

function screenToWorld(sx, sy) {
  const cx = W() / 2, cy = H() / 2;
  return { x: cam.x + (sx - cx) / cam.scale, y: cam.y + (sy - cy) / cam.scale };
}

canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const before = screenToWorld(mx, my);
    const factor = Math.pow(1.0015, -e.deltaY);
    cam.scale = clamp(cam.scale * factor, 0.00001, 1e9);
    const after = screenToWorld(mx, my);

    cam.x += before.x - after.x;
    cam.y += before.y - after.y;
  },
  { passive: false }
);

let dragging = false, lastX = 0, lastY = 0;
canvas.addEventListener("mousedown", (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; });
window.addEventListener("mouseup", () => (dragging = false));
window.addEventListener("mousemove", (e) => {
  if (!dragging) return;
  const dx = e.clientX - lastX;
  const dy = e.clientY - lastY;
  lastX = e.clientX;
  lastY = e.clientY;
  cam.x -= dx / cam.scale;
  cam.y -= dy / cam.scale;
});

// ---------------- Plants grid ----------------
const GRID = 120;
const PLANT_MAX = 1.0;
const PLANT_EAT_RATE = 0.08;

let plant = new Float32Array(GRID * GRID);
const idx = (ix, iy) => iy * GRID + ix;

function samplePlant(x, y) {
  const w = W(), h = H();
  const gx = clamp((x / w) * GRID, 0, GRID - 1e-6);
  const gy = clamp((y / h) * GRID, 0, GRID - 1e-6);
  const x0 = Math.floor(gx), y0 = Math.floor(gy);
  const x1 = Math.min(GRID - 1, x0 + 1), y1 = Math.min(GRID - 1, y0 + 1);
  const tx = gx - x0, ty = gy - y0;
  const a = plant[idx(x0, y0)], b = plant[idx(x1, y0)];
  const c = plant[idx(x0, y1)], d = plant[idx(x1, y1)];
  const ab = a + (b - a) * tx;
  const cd = c + (d - c) * tx;
  return ab + (cd - ab) * ty;
}

function addPlant(x, y, amount) {
  const w = W(), h = H();
  const ix0 = clamp(Math.floor((x / w) * GRID), 0, GRID - 1);
  const iy0 = clamp(Math.floor((y / h) * GRID), 0, GRID - 1);
  const k = idx(ix0, iy0);
  plant[k] = clamp(plant[k] + amount, 0, PLANT_MAX);
}

function eatPlantAt(x, y, amount) {
  const w = W(), h = H();
  const ix0 = clamp(Math.floor((x / w) * GRID), 0, GRID - 1);
  const iy0 = clamp(Math.floor((y / h) * GRID), 0, GRID - 1);
  const k = idx(ix0, iy0);
  const take = Math.min(plant[k], amount);
  plant[k] -= take;
  return take;
}

function regenPlants() {
  const g = settings.plantGrowth;
  for (let i = 0; i < plant.length; i++) {
    plant[i] = clamp(plant[i] + g * (1 - plant[i]), 0, PLANT_MAX);
  }
}

function resetPlants() {
  plant.fill(0);
  for (let i = 0; i < 350; i++) addPlant(rand(W()), rand(H()), rand(0.8, 0.15));
}

// ---------------- Sim constants ----------------
const REPRO_THRESHOLD = 1.35;
const REPRO_COST = 0.70;
const REPRO_COOLDOWN_TICKS = 900;

const SPEED_MIN = 0.12;
const SPEED_MAX = 0.95;
const BASE_MOVE_COST = 0.0024;
const TURN_RATE_BASE = 0.18;

const GRAZER_VISION = 22;
const HUNTER_VISION = 34;

const EAT_RADIUS_BASE = 6.5;
const HUNT_DAMAGE = 0.28;

const START_GRAZERS = 1;
const START_HUNTERS = 1;

const TARGET_GRAZERS = 120;
const TARGET_HUNTERS = 55;

function sigmoid01(x) { return 1 / (1 + Math.exp(-x)); }
function densityPressure() {
  const g = grazers.length, h = hunters.length;
  const gP = sigmoid01((g - TARGET_GRAZERS) / 25);
  const hP = sigmoid01((h - TARGET_HUNTERS) / 18);
  return clamp(0.55 * gP + 0.45 * hP, 0, 1);
}
const localPlantOk = (x, y) => samplePlant(x, y) > 0.20;
const preyAbundant = () => grazers.length > Math.max(18, hunters.length * 1.6);

// ---------------- Species system ----------------
let nextSpeciesId = 1;
const speciesDB = new Map();

const syllA = ["ka","zu","mi","ra","to","shi","na","lo","ve","xi","qu","ha","yo","ti","sa","no"];
const syllB = ["rin","mar","tuk","ven","sol","fer","lan","koi","zen","dor","pik","moi","tes","vex"];

function makeName(type) {
  const a = syllA[Math.floor(Math.random() * syllA.length)];
  const b = syllB[Math.floor(Math.random() * syllB.length)];
  return `${type === "g" ? "G" : "H"}-${a}${b}`;
}

function hsvToRgbString(hDeg, s, v) {
  const h = ((hDeg % 360) + 360) % 360;
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }
  return `rgb(${Math.floor((r+m)*255)}, ${Math.floor((g+m)*255)}, ${Math.floor((b+m)*255)})`;
}

function makeColor(type) {
  const h = type === "g" ? rand(150, 90) : rand(25, 350);
  const s = rand(0.80, 0.55);
  const v = rand(0.95, 0.70);
  return hsvToRgbString(h, s, v);
}

function geneVector(g) { return [g.speed, g.turn, g.greed, g.caution, g.bite, g.size]; }

function vecDist(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d*d; }
  return Math.sqrt(s);
}

function createSpecies(type, fromGenesVec, tickNow) {
  const id = nextSpeciesId++;
  speciesDB.set(id, {
    id, type,
    name: makeName(type),
    color: makeColor(type),
    count: 0,
    centroid: fromGenesVec.slice(),
    createdTick: tickNow
  });
  return id;
}

function findNearestSpeciesId(type, genesVec) {
  let bestId = null, bestD = Infinity;
  for (const sp of speciesDB.values()) {
    if (sp.type !== type) continue;
    const d = vecDist(genesVec, sp.centroid);
    if (d < bestD) { bestD = d; bestId = sp.id; }
  }
  return { bestId, bestD };
}

function assignSpeciesAtBirth(type, genesVec, parentSpeciesId, tickNow) {
  const SPLIT = settings.speciesSplit;
  const MERGE = Math.max(0.12, settings.speciesSplit * 0.60);

  if (parentSpeciesId != null && speciesDB.has(parentSpeciesId)) {
    const p = speciesDB.get(parentSpeciesId);
    if (p.type === type) {
      const d = vecDist(genesVec, p.centroid);
      if (d <= SPLIT) return parentSpeciesId;
    }
  }

  const { bestId, bestD } = findNearestSpeciesId(type, genesVec);
  if (bestId != null && bestD <= MERGE) return bestId;

  return createSpecies(type, genesVec, tickNow);
}

function updateSpeciesStats(ticksNow) {
  for (const sp of speciesDB.values()) sp.count = 0;
  const sums = new Map();

  const addTo = (id, vec) => {
    if (id == null || !speciesDB.has(id)) return;
    const sp = speciesDB.get(id);
    sp.count++;
    if (!sums.has(id)) sums.set(id, new Array(vec.length).fill(0));
    const s = sums.get(id);
    for (let i = 0; i < vec.length; i++) s[i] += vec[i];
  };

  for (const a of grazers) addTo(a.speciesId, geneVector(a.g));
  for (const a of hunters) addTo(a.speciesId, geneVector(a.g));

  for (const [id, sum] of sums.entries()) {
    const sp = speciesDB.get(id);
    if (!sp || sp.count <= 0) continue;
    for (let i = 0; i < sum.length; i++) sp.centroid[i] = sum[i] / sp.count;
  }
}

// ---------------- Agents ----------------
class Agent {
  constructor(type, x, y, genes, speciesId = null) {
    this.type = type; // "g" or "h"
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.a = rand(Math.PI * 2);
    this.energy = 0.95;
    this.age = 0;
    this.reproCooldown = 0;

    this.g = genes ?? {
      speed: rand(0.60, 0.20),
      turn: rand(0.55, 0.20),
      greed: rand(0.70, 0.20),
      caution: rand(0.55, 0.12),
      bite: rand(0.60, 0.20),
      size: rand(0.30, 0.10),
    };

    this.speciesId = speciesId;
  }

  cloneMutated(tickNow) {
    const ng = { ...this.g };
    for (const k of Object.keys(ng)) {
      if (Math.random() < settings.mutRate) {
        const delta = (Math.random() * 2 - 1) * settings.mutStrength;
        ng[k] = clamp(ng[k] + delta, 0, 1);
      }
    }
    const babySp = assignSpeciesAtBirth(this.type, geneVector(ng), this.speciesId, tickNow);

    const baby = new Agent(
      this.type,
      this.x + rand(12, -12),
      this.y + rand(12, -12),
      ng,
      babySp
    );
    baby.energy = 0.65;
    baby.a = rand(Math.PI * 2);
    baby.reproCooldown = REPRO_COOLDOWN_TICKS;
    return baby;
  }
}

let grazers = [];
let hunters = [];

// ---------------- Legend + Follow ----------------
let legendMode = "g";
let followedSpeciesId = null;

tabG.addEventListener("click", () => {
  legendMode = "g";
  tabG.classList.add("active");
  tabH.classList.remove("active");
  renderLegend();
});
tabH.addEventListener("click", () => {
  legendMode = "h";
  tabH.classList.add("active");
  tabG.classList.remove("active");
  renderLegend();
});
unfollowBtn.addEventListener("click", () => {
  followedSpeciesId = null;
  renderLegend();
});

function listSpecies(type) {
  const arr = [];
  for (const sp of speciesDB.values()) if (sp.type === type && sp.count > 0) arr.push(sp);
  arr.sort((a, b) => b.count - a.count);
  return arr;
}

function renderLegend() {
  legendListEl.innerHTML = "";
  const list = listSpecies(legendMode);

  if (!list.length) {
    const d = document.createElement("div");
    d.className = "spMeta";
    d.textContent = "No living species yet.";
    legendListEl.appendChild(d);
    return;
  }

  for (const sp of list.slice(0, 40)) {
    const row = document.createElement("div");
    row.className = "spRow" + (sp.id === followedSpeciesId ? " following" : "");

    const left = document.createElement("div");
    left.className = "spLeft";

    const sw = document.createElement("div");
    sw.className = "swatch";
    sw.style.background = sp.color;

    const name = document.createElement("div");
    name.className = "spName";
    name.textContent = sp.name;

    left.appendChild(sw);
    left.appendChild(name);

    const meta = document.createElement("div");
    meta.className = "spMeta";
    meta.textContent = String(sp.count);

    row.appendChild(left);
    row.appendChild(meta);

    row.addEventListener("click", () => {
      followedSpeciesId = sp.id;
      legendMode = sp.type;
      tabG.classList.toggle("active", legendMode === "g");
      tabH.classList.toggle("active", legendMode === "h");
      renderLegend();
    });

    legendListEl.appendChild(row);
  }
}

function speciesCenter(speciesId) {
  let sx = 0, sy = 0, n = 0;
  for (const a of grazers) if (a.speciesId === speciesId) { sx += a.x; sy += a.y; n++; }
  for (const a of hunters) if (a.speciesId === speciesId) { sx += a.x; sy += a.y; n++; }
  if (!n) return null;
  return { x: sx / n, y: sy / n, n };
}

function followCamera() {
  if (followedSpeciesId == null) return;
  const c = speciesCenter(followedSpeciesId);
  if (!c) return;
  const t = 0.08;
  cam.x = cam.x + (c.x - cam.x) * t;
  cam.y = cam.y + (c.y - cam.y) * t;
}

// ---------------- Movement + Behavior ----------------
function steerToward(agent, tx, ty, strength) {
  const angTo = Math.atan2(ty - agent.y, tx - agent.x);
  let da = angTo - agent.a;
  da = Math.atan2(Math.sin(da), Math.cos(da));
  const tr = (0.05 + agent.g.turn * TURN_RATE_BASE) * strength;
  agent.a += clamp(da, -tr, tr);
}

function wander(agent) {
  agent.a += (Math.random() * 2 - 1) * (0.012 + (1 - agent.g.turn) * 0.035);
}

function move(agent) {
  const size = agent.g.size;

  const spBase = SPEED_MIN + agent.g.speed * (SPEED_MAX - SPEED_MIN);
  const sp = spBase * (1.12 - 0.55 * size);

  const sizeCost = 0.65 + size * 1.10;
  const pressure = densityPressure();
  const crowdCost = 1 + pressure * 1.6;

  const cost = BASE_MOVE_COST * sizeCost * crowdCost * (0.85 + agent.g.speed * 0.9);
  agent.energy -= cost;

  agent.vx = Math.cos(agent.a) * sp;
  agent.vy = Math.sin(agent.a) * sp;
  agent.x += agent.vx;
  agent.y += agent.vy;
  wrapPos(agent);

  agent.age++;
  if (agent.reproCooldown > 0) agent.reproCooldown--;
}

function grazerStep(g) {
  const vision = GRAZER_VISION * (0.85 + (1 - g.g.size) * 0.35);
  let bestScore = -1, bestX = g.x, bestY = g.y;

  for (let i = 0; i < 8; i++) {
    const ang = g.a + (i - 3.5) * 0.35;
    const sx = g.x + Math.cos(ang) * vision;
    const sy = g.y + Math.sin(ang) * vision;
    const p = samplePlant((sx + W()) % W(), (sy + H()) % H());
    if (p > bestScore) { bestScore = p; bestX = (sx + W()) % W(); bestY = (sy + H()) % H(); }
  }

  let nearestH = null, nd = Infinity;
  for (const h of hunters) {
    const d = dist2(g.x, g.y, h.x, h.y);
    if (d < nd) { nd = d; nearestH = h; }
  }

  const dangerDist = 46 + g.g.size * 8;
  if (nearestH && nd < dangerDist * dangerDist && g.g.caution > 0.05) {
    const ax = g.x + (g.x - nearestH.x);
    const ay = g.y + (g.y - nearestH.y);
    steerToward(g, ax, ay, 1.15 * g.g.caution);
  } else {
    const chase = 0.18 + g.g.greed * 0.95;
    steerToward(g, bestX, bestY, chase);
    if (Math.random() < 0.18 * (1 - g.g.greed)) wander(g);
  }

  const bite = PLANT_EAT_RATE * (0.65 + g.g.greed) * (0.75 + g.g.size * 0.85);
  const eaten = eatPlantAt(g.x, g.y, bite);
  g.energy += eaten * 0.78;

  g.energy -= 0.00055 * (0.7 + g.g.size * 1.3) * (1 + densityPressure() * 1.1);
  move(g);
}

function hunterStep(h) {
  const vision = HUNTER_VISION * (0.9 + (1 - h.g.size) * 0.20);
  let target = null, bestD = vision * vision;

  for (const g of grazers) {
    const d = dist2(h.x, h.y, g.x, g.y);
    if (d < bestD) { bestD = d; target = g; }
  }

  if (target) {
    steerToward(h, target.x, target.y, 0.55 + h.g.bite * 0.95);

    const eatR = EAT_RADIUS_BASE + h.g.size * 5.5;
    if (bestD < eatR * eatR) {
      const dmg = HUNT_DAMAGE * (0.55 + h.g.bite) * (0.7 + h.g.size * 0.9);
      const steal = Math.min(target.energy, dmg);
      target.energy -= steal;
      h.energy += steal * 0.90;
    }
  } else {
    if (Math.random() < 0.60) wander(h);
  }

  h.energy -= 0.00085 * (0.85 + h.g.size * 1.4) * (1 + densityPressure() * 1.2);
  move(h);
}

function handleLife(list, tickNow) {
  for (let i = list.length - 1; i >= 0; i--) {
    const a = list[i];
    if (a.energy <= 0 || a.age > 26000) {
      addPlant(a.x, a.y, 0.22 + a.g.size * 0.35);
      list.splice(i, 1);
    }
  }

  const pressure = densityPressure();
  const reproSlow = 0.06;
  const baseChance = reproSlow * (0.25 + 0.75 * (1 - pressure));

  for (let i = list.length - 1; i >= 0; i--) {
    const a = list[i];
    if (a.reproCooldown > 0) continue;
    if (a.energy <= REPRO_THRESHOLD) continue;

    if (a.type === "g") { if (!localPlantOk(a.x, a.y)) continue; }
    else { if (!preyAbundant()) continue; }

    const sizePenalty = 1 - a.g.size * 0.55;
    const p = baseChance * sizePenalty;

    if (Math.random() < p) {
      a.energy -= REPRO_COST * (0.85 + a.g.size * 0.55);
      a.reproCooldown = REPRO_COOLDOWN_TICKS;
      list.push(a.cloneMutated(tickNow));
    }
  }
}

// ---------------- Draw ----------------
function clearFrame() {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const w = W(), h = H();
  if (!drawTrailsEl.checked) {
    ctx.fillStyle = "#06090d";
    ctx.fillRect(0, 0, w, h);
  } else {
    ctx.fillStyle = "rgba(6,9,13,0.14)";
    ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();
}

function applyCameraTransform() {
  const cx = W() / 2, cy = H() / 2;
  ctx.translate(cx, cy);
  ctx.scale(cam.scale, cam.scale);
  ctx.translate(-cam.x, -cam.y);
}

function drawHeatmap() {
  const w = W(), h = H();
  const cellW = w / GRID, cellH = h / GRID;
  for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
    const p = plant[idx(x, y)];
    if (p <= 0.03) continue;
    const v = Math.floor(26 + p * 120);
    ctx.fillStyle = `rgb(18, ${v}, 40)`;
    ctx.fillRect(x * cellW, y * cellH, cellW + 0.5, cellH + 0.5);
  }
}

function drawLabel(x, y, r, text) {
  const inv = 1 / cam.scale;
  const fontPx = clamp(12 * inv, 2.5, 10);
  ctx.save();
  ctx.font = `${fontPx}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillText(text, x, y - (r + 6 * inv));
  ctx.fillStyle = "rgba(240,245,255,0.92)";
  ctx.fillText(text, x, y - (r + 7.2 * inv));
  ctx.restore();
}

function drawAgents(withLabels) {
  for (const g of grazers) {
    const sp = speciesDB.get(g.speciesId);
    const color = sp?.color ?? "rgb(120,200,140)";
    const r = 2.2 + g.g.size * 10.5;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(g.x, g.y, r, 0, Math.PI * 2);
    ctx.fill();
    if (withLabels && sp) drawLabel(g.x, g.y, r, sp.name);
  }

  for (const h of hunters) {
    const sp = speciesDB.get(h.speciesId);
    const color = sp?.color ?? "rgb(210,90,90)";
    const r = 2.8 + h.g.size * 12.0;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(h.x, h.y, r, 0, Math.PI * 2);
    ctx.fill();
    if (withLabels && sp) drawLabel(h.x, h.y, r, sp.name);
  }
}

function draw() {
  clearFrame();
  ctx.save();
  applyCameraTransform();
  if (drawHeatEl.checked) drawHeatmap();
  const withLabels = showLabelsEl.checked && cam.scale >= 3.0;
  drawAgents(withLabels);
  ctx.restore();
}

// ---------------- World save/load (slots + export/import) ----------------
function q(v) { return Math.floor(clamp(v, 0, 1) * 65535); }
function uq(v) { return clamp(v / 65535, 0, 1); }

function packPlants() {
  const out = new Uint16Array(plant.length);
  for (let i = 0; i < plant.length; i++) out[i] = Math.floor(clamp(plant[i], 0, 1) * 65535);
  return Array.from(out);
}
function unpackPlants(arr) {
  const u = new Uint16Array(arr);
  plant = new Float32Array(u.length);
  for (let i = 0; i < u.length; i++) plant[i] = u[i] / 65535;
}

function packAgent(a) {
  return [
    a.type,
    a.x, a.y,
    a.a,
    a.energy,
    a.age,
    a.reproCooldown,
    a.speciesId ?? null,
    q(a.g.speed), q(a.g.turn), q(a.g.greed), q(a.g.caution), q(a.g.bite), q(a.g.size)
  ];
}
function unpackAgent(row) {
  const type = row[0];
  const a = new Agent(type, row[1], row[2], null, row[7]);
  a.a = row[3];
  a.energy = row[4];
  a.age = row[5];
  a.reproCooldown = row[6];
  a.g = {
    speed: uq(row[8]),
    turn: uq(row[9]),
    greed: uq(row[10]),
    caution: uq(row[11]),
    bite: uq(row[12]),
    size: uq(row[13]),
  };
  return a;
}

function packSpecies() {
  const arr = [];
  for (const sp of speciesDB.values()) {
    arr.push([sp.id, sp.type, sp.name, sp.color, sp.count, sp.centroid, sp.createdTick]);
  }
  return arr;
}
function unpackSpecies(arr) {
  speciesDB.clear();
  let maxId = 0;
  for (const row of arr) {
    speciesDB.set(row[0], {
      id: row[0],
      type: row[1],
      name: row[2],
      color: row[3],
      count: row[4],
      centroid: row[5],
      createdTick: row[6],
    });
    if (row[0] > maxId) maxId = row[0];
  }
  nextSpeciesId = maxId + 1;
}

function makeWorldPayload() {
  return {
    version: 3,
    savedAt: Date.now(),
    ticks,
    cam: { ...cam },
    followedSpeciesId,
    plant: packPlants(),
    species: packSpecies(),
    grazers: grazers.map(packAgent),
    hunters: hunters.map(packAgent),
  };
}

function applyWorldPayload(obj) {
  if (!obj || obj.version !== 3) return false;

  ticks = obj.ticks ?? 0;
  frameCounter = 0;

  if (obj.cam) {
    cam.x = obj.cam.x ?? (W() / 2);
    cam.y = obj.cam.y ?? (H() / 2);
    cam.scale = obj.cam.scale ?? 1.0;
  } else {
    resetView();
  }

  followedSpeciesId = obj.followedSpeciesId ?? null;

  if (obj.plant) unpackPlants(obj.plant); else resetPlants();
  if (obj.species) unpackSpecies(obj.species); else initSpecies(0);

  grazers = (obj.grazers ?? []).map(unpackAgent);
  hunters = (obj.hunters ?? []).map(unpackAgent);

  // safety: ensure something exists
  if (grazers.length === 0 || hunters.length === 0) resetWorldFresh();

  updateSpeciesStats(ticks);
  return true;
}

function saveWorldToSlot() {
  if (!autosaveEl.checked) return;
  try {
    localStorage.setItem(worldKey(), JSON.stringify(makeWorldPayload()));
  } catch {}
}

function loadWorldFromSlot() {
  try {
    const raw = localStorage.getItem(worldKey());
    if (!raw) return false;
    const obj = JSON.parse(raw);
    return applyWorldPayload(obj);
  } catch {
    return false;
  }
}

// Export/Import UI
exportBtn.addEventListener("click", () => {
  const payload = makeWorldPayload();
  downloadTextFile(`ecosim_world_slot${currentSlot}.json`, JSON.stringify(payload));
});

importFile.addEventListener("change", async () => {
  const file = importFile.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const obj = JSON.parse(text);
    if (!applyWorldPayload(obj)) {
      alert("Import failed: wrong file/version.");
      importFile.value = "";
      return;
    }
    // store into current slot
    try { localStorage.setItem(worldKey(), JSON.stringify(makeWorldPayload())); } catch {}
    renderLegend();
    updateStatsText();
    importFile.value = "";
  } catch {
    alert("Import failed: invalid JSON.");
    importFile.value = "";
  }
});

clearSlotBtn.addEventListener("click", () => {
  try { localStorage.removeItem(worldKey()); } catch {}
  resetWorldFresh();
  renderLegend();
  updateStatsText();
  saveWorldToSlot();
});

// Slot switching
slotSelect.addEventListener("change", () => {
  currentSlot = parseInt(slotSelect.value, 10) || 1;
  // load slot; else fresh
  if (!loadWorldFromSlot()) resetWorldFresh();
  renderLegend();
  updateStatsText();
  saveWorldToSlot();
});

// ---------------- Init / Reset ----------------
let ticks = 0;
let paused = false;
let frameCounter = 0; // ✅ FIXED: now globally defined

function initSpecies(tickNow) {
  speciesDB.clear();
  nextSpeciesId = 1;

  const gSeed = geneVector({ speed: 0.45, turn: 0.40, greed: 0.55, caution: 0.40, bite: 0.40, size: 0.25 });
  const hSeed = geneVector({ speed: 0.50, turn: 0.45, greed: 0.45, caution: 0.35, bite: 0.55, size: 0.30 });

  createSpecies("g", gSeed, tickNow);
  createSpecies("h", hSeed, tickNow);
}

function resetWorldFresh() {
  ticks = 0;
  frameCounter = 0;

  resetPlants();
  initSpecies(0);

  const gFirst = [...speciesDB.values()].find(s => s.type === "g")?.id ?? null;
  const hFirst = [...speciesDB.values()].find(s => s.type === "h")?.id ?? null;

  grazers = [];
  hunters = [];
  for (let i = 0; i < START_GRAZERS; i++) grazers.push(new Agent("g", rand(W()), rand(H()), null, gFirst));
  for (let i = 0; i < START_HUNTERS; i++) hunters.push(new Agent("h", rand(W()), rand(H()), null, hFirst));

  resetView();
  followedSpeciesId = null;
  legendMode = "g";
  tabG.classList.add("active");
  tabH.classList.remove("active");

  updateSpeciesStats(0);
}

// ---------------- UI buttons ----------------
pauseBtn.addEventListener("click", () => {
  paused = !paused;
  pauseBtn.textContent = paused ? "Resume" : "Pause";
});

resetBtn.addEventListener("click", () => {
  paused = false;
  pauseBtn.textContent = "Pause";
  resetWorldFresh();
  renderLegend();
  updateStatsText();
  saveWorldToSlot();
});

window.addEventListener("beforeunload", () => {
  saveWorldToSlot();
  saveSettings();
});

// ---------------- Main loop ----------------
function tickOnce() {
  regenPlants();

  for (const g of grazers) grazerStep(g);
  for (const h of hunters) hunterStep(h);

  handleLife(grazers, ticks);
  handleLife(hunters, ticks);

  if (ticks % 25 === 0) updateSpeciesStats(ticks);

  ticks++;
}

function updateStatsText() {
  const avg = (arr, key) => arr.length ? (arr.reduce((s,a)=>s+a.g[key],0)/arr.length).toFixed(2) : "—";
  const sizeAvg = (arr) => arr.length ? (arr.reduce((s,a)=>s+a.g.size,0)/arr.length).toFixed(2) : "—";
  const livingSpecies = Array.from(speciesDB.values()).filter(s => s.count > 0).length;

  statsEl.textContent =
`Slot: ${currentSlot} | Ticks: ${ticks}
Grazers: ${grazers.length} | Hunters: ${hunters.length} | Living species: ${livingSpecies}
Avg size: grazers ${sizeAvg(grazers)} | hunters ${sizeAvg(hunters)}
Avg genes (grazers): speed ${avg(grazers,"speed")} greed ${avg(grazers,"greed")} caution ${avg(grazers,"caution")}
Avg genes (hunters): speed ${avg(hunters,"speed")} bite  ${avg(hunters,"bite")}
Pressure: ${densityPressure().toFixed(2)} | Plant growth: ${settings.plantGrowth.toFixed(3)} | Mutation: ${settings.mutRate.toFixed(2)} / ${settings.mutStrength.toFixed(2)} | Speciation: ${settings.speciesSplit.toFixed(2)}
Following species: ${followedSpeciesId ?? "—"}`;
}

let lastLegendUpdateTick = 0;
let lastSaveTime = 0;

function step() {
  if (!paused) {
    frameCounter++;
    const doTick = (frameCounter % settings.tickEvery === 0);

    if (doTick) {
      tickOnce();
      followCamera();

      if (ticks % 25 === 0) updateStatsText();

      if (ticks - lastLegendUpdateTick >= 50) {
        lastLegendUpdateTick = ticks;
        renderLegend();
      }

      const now = performance.now();
      if (autosaveEl.checked && now - lastSaveTime > 2500) {
        lastSaveTime = now;
        saveWorldToSlot();
        saveSettings();
      }
    }
  }

  draw();
  requestAnimationFrame(step);
}

// ---------------- Start ----------------
function start() {
  resetView();

  // load current slot if possible
  if (!loadWorldFromSlot()) {
    resetWorldFresh();
  }

  updateSpeciesStats(ticks);
  renderLegend();
  updateStatsText();

  requestAnimationFrame(step);
}
start();
