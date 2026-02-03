// Slow-paced evolving ecosystem (plants -> grazers -> hunters)
// + SIZE gene (visible + affects speed/cost)
// + SPECIES splitting (auto-naming + stable colors)
// + NO hard population caps (soft pressure prevents runaway growth)
// Runs fully in the browser (GitHub Pages friendly)

const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d", { alpha: false });

const statsEl = document.getElementById("stats");
const pauseBtn = document.getElementById("pauseBtn");
const resetBtn = document.getElementById("resetBtn");
const drawTrailsEl = document.getElementById("drawTrails");
const drawHeatEl = document.getElementById("drawHeat");

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

const rand = (a = 1, b = 0) => Math.random() * (a - b) + b;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const dist2 = (ax, ay, bx, by) => (ax - bx) ** 2 + (ay - by) ** 2;

function wrapPos(o) {
  const w = W(), h = H();
  if (o.x < 0) o.x += w; else if (o.x > w) o.x -= w;
  if (o.y < 0) o.y += h; else if (o.y > h) o.y -= h;
}

// =======================
// SIM SPEED / PACING
// =======================
// Only simulate one "tick" every N frames to make it visibly slow.
const TICK_EVERY_N_FRAMES = 2; // 3-5 = slower
let frameCounter = 0;

// =======================
// PLANTS
// =======================
const GRID = 120;
const PLANT_MAX = 1.0;

// slower plant regrowth
const PLANT_GROWTH = 0.006;

// grazers eat slower
const PLANT_EAT_RATE = 0.08;

let plant = new Float32Array(GRID * GRID);
function idx(ix, iy) { return iy * GRID + ix; }

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
  const ix = clamp(Math.floor((x / w) * GRID), 0, GRID - 1);
  const iy = clamp(Math.floor((y / h) * GRID), 0, GRID - 1);
  const k = idx(ix, iy);
  plant[k] = clamp(plant[k] + amount, 0, PLANT_MAX);
}

function eatPlantAt(x, y, amount) {
  const w = W(), h = H();
  const ix = clamp(Math.floor((x / w) * GRID), 0, GRID - 1);
  const iy = clamp(Math.floor((y / h) * GRID), 0, GRID - 1);
  const k = idx(ix, iy);
  const take = Math.min(plant[k], amount);
  plant[k] -= take;
  return take;
}

function regenPlants() {
  for (let i = 0; i < plant.length; i++) {
    plant[i] = clamp(plant[i] + PLANT_GROWTH * (1 - plant[i]), 0, PLANT_MAX);
  }
}

function resetPlants() {
  plant.fill(0);
  for (let i = 0; i < 350; i++) {
    addPlant(rand(W()), rand(H()), rand(0.8, 0.15));
  }
}

// =======================
// EVOLUTION / REPRODUCTION
// =======================
const MUT_RATE = 0.10;
const MUT_STRENGTH = 0.10;

// Much slower reproduction
const REPRO_THRESHOLD = 1.35;
const REPRO_COST = 0.70;

// Reproduction cooldown (prevents chain-birthing)
const REPRO_COOLDOWN_TICKS = 900;

// =======================
// MOVEMENT / ENERGY
// =======================
const SPEED_MIN = 0.12;
const SPEED_MAX = 0.95;
const BASE_MOVE_COST = 0.0024;
const TURN_RATE_BASE = 0.18;

// Vision
const GRAZER_VISION = 22;
const HUNTER_VISION = 34;

// Eating / biting
const EAT_RADIUS_BASE = 6.5;
const HUNT_DAMAGE = 0.28;

// Start with exactly two
const START_GRAZERS = 1;
const START_HUNTERS = 1;

// =======================
// SOFT POPULATION CONTROL (NO HARD CAPS)
// =======================
const TARGET_GRAZERS = 120;
const TARGET_HUNTERS = 55;

function sigmoid01(x) {
  return 1 / (1 + Math.exp(-x));
}

function densityPressure() {
  const g = grazers.length;
  const h = hunters.length;
  const gP = sigmoid01((g - TARGET_GRAZERS) / 25);
  const hP = sigmoid01((h - TARGET_HUNTERS) / 18);
  return clamp(0.55 * gP + 0.45 * hP, 0, 1);
}

function localPlantOk(x, y) {
  return samplePlant(x, y) > 0.20;
}

function preyAbundant() {
  return grazers.length > Math.max(18, hunters.length * 1.6);
}

// =======================
// SPECIES SYSTEM
// =======================
// Each agent belongs to a speciesId. Species are created at birth when genes
// drift far enough from parent species centroid (within same type).
//
// You can tweak how often speciation happens with SPECIES_SPLIT_DISTANCE.

const SPECIES_SPLIT_DISTANCE = 0.30; // lower = more new species; higher = fewer
const SPECIES_MERGE_DISTANCE = 0.18; // optional: if a newborn is close to a species, attach to it
const SPECIES_MAX = 120;            // safety: stop unlimited IDs (still soft)

let nextSpeciesId = 1;
const speciesDB = new Map(); // speciesId -> { id, type, name, color, count, centroid, createdTick }

const syllA = ["ka", "zu", "mi", "ra", "to", "shi", "na", "lo", "ve", "xi", "qu", "ha", "yo", "ti", "sa", "no"];
const syllB = ["rin", "mar", "tuk", "ven", "sol", "fer", "lan", "koi", "zen", "dor", "pik", "moi", "tes", "vex"];

function makeName(type) {
  const a = syllA[Math.floor(Math.random() * syllA.length)];
  const b = syllB[Math.floor(Math.random() * syllB.length)];
  const tag = type === "g" ? "G" : "H";
  return `${tag}-${a}${b}`;
}

function makeColor(type) {
  // HSV-ish generated colors, biased by type so grazers stay greener, hunters redder
  const h = type === "g" ? rand(150, 90) : rand(25, 350); // degrees-ish
  const s = rand(75, 55);
  const v = rand(95, 70);
  return hsvToRgbString(h, s / 100, v / 100);
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

  const R = Math.floor((r + m) * 255);
  const G = Math.floor((g + m) * 255);
  const B = Math.floor((b + m) * 255);
  return `rgb(${R}, ${G}, ${B})`;
}

function geneVector(g) {
  // Keep consistent order
  return [g.speed, g.turn, g.greed, g.caution, g.bite, g.size];
}

function vecDist(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return Math.sqrt(s);
}

function createSpecies(type, fromGenesVec, tickNow) {
  if (speciesDB.size >= SPECIES_MAX) {
    // If we hit safety max, just reuse nearest later.
    return null;
  }
  const id = nextSpeciesId++;
  const sp = {
    id,
    type,
    name: makeName(type),
    color: makeColor(type),
    count: 0,
    centroid: fromGenesVec.slice(),
    createdTick: tickNow
  };
  speciesDB.set(id, sp);
  return id;
}

function findNearestSpeciesId(type, genesVec) {
  let bestId = null;
  let bestD = Infinity;

  for (const sp of speciesDB.values()) {
    if (sp.type !== type) continue;
    const d = vecDist(genesVec, sp.centroid);
    if (d < bestD) { bestD = d; bestId = sp.id; }
  }
  return { bestId, bestD };
}

function assignSpeciesAtBirth(type, genesVec, parentSpeciesId, tickNow) {
  // Try: attach to parent if still close
  if (parentSpeciesId != null && speciesDB.has(parentSpeciesId)) {
    const parentSp = speciesDB.get(parentSpeciesId);
    if (parentSp.type === type) {
      const d = vecDist(genesVec, parentSp.centroid);
      if (d <= SPECIES_SPLIT_DISTANCE) return parentSpeciesId;
    }
  }

  // Otherwise, attach to nearest existing if close enough
  const { bestId, bestD } = findNearestSpeciesId(type, genesVec);
  if (bestId != null && bestD <= SPECIES_MERGE_DISTANCE) return bestId;

  // Else create new species
  const newId = createSpecies(type, genesVec, tickNow);
  return newId ?? (bestId ?? parentSpeciesId ?? null);
}

function updateSpeciesStats() {
  // Recompute counts + centroid by incremental averaging
  for (const sp of speciesDB.values()) {
    sp.count = 0;
  }

  // accumulate sums
  const sums = new Map(); // id -> [sum...]
  function addTo(id, vec) {
    if (id == null || !speciesDB.has(id)) return;
    const sp = speciesDB.get(id);
    sp.count++;
    if (!sums.has(id)) sums.set(id, new Array(vec.length).fill(0));
    const s = sums.get(id);
    for (let i = 0; i < vec.length; i++) s[i] += vec[i];
  }

  for (const a of grazers) addTo(a.speciesId, geneVector(a.g));
  for (const a of hunters) addTo(a.speciesId, geneVector(a.g));

  // update centroids
  for (const [id, sum] of sums.entries()) {
    const sp = speciesDB.get(id);
    if (!sp || sp.count <= 0) continue;
    for (let i = 0; i < sum.length; i++) {
      sp.centroid[i] = sum[i] / sp.count;
    }
  }

  // Garbage collect species that are extinct for long enough
  // (keeps DB tidy)
  const EXTINCT_FOR_TICKS = 3500;
  for (const [id, sp] of speciesDB.entries()) {
    if (sp.count > 0) continue;
    if (ticks - sp.createdTick > EXTINCT_FOR_TICKS) {
      speciesDB.delete(id);
    }
  }
}

// =======================
// AGENTS
// =======================
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
      if (Math.random() < MUT_RATE) {
        const delta = (Math.random() * 2 - 1) * MUT_STRENGTH;
        ng[k] = clamp(ng[k] + delta, 0, 1);
      }
    }

    const genesVec = geneVector(ng);
    const babySpeciesId = assignSpeciesAtBirth(this.type, genesVec, this.speciesId, tickNow);

    const baby = new Agent(
      this.type,
      this.x + rand(12, -12),
      this.y + rand(12, -12),
      ng,
      babySpeciesId
    );
    baby.energy = 0.65;
    baby.a = rand(Math.PI * 2);
    baby.reproCooldown = REPRO_COOLDOWN_TICKS;
    return baby;
  }
}

let grazers = [];
let hunters = [];
let paused = false;

// Initialize starting species (one per type)
function initSpecies() {
  speciesDB.clear();
  nextSpeciesId = 1;

  // Seed temporary gene vectors for the two starters
  const gSeed = geneVector({
    speed: 0.45, turn: 0.40, greed: 0.55, caution: 0.40, bite: 0.40, size: 0.25
  });
  const hSeed = geneVector({
    speed: 0.50, turn: 0.45, greed: 0.45, caution: 0.35, bite: 0.55, size: 0.30
  });

  createSpecies("g", gSeed, 0);
  createSpecies("h", hSeed, 0);
}

function resetSim() {
  grazers = [];
  hunters = [];
  resetPlants();
  initSpecies();

  // Create starters and assign them to the initial species for their type
  const gFirstId = [...speciesDB.values()].find(s => s.type === "g")?.id ?? null;
  const hFirstId = [...speciesDB.values()].find(s => s.type === "h")?.id ?? null;

  for (let i = 0; i < START_GRAZERS; i++) {
    const a = new Agent("g", rand(W()), rand(H()), null, gFirstId);
    grazers.push(a);
  }
  for (let i = 0; i < START_HUNTERS; i++) {
    const a = new Agent("h", rand(W()), rand(H()), null, hFirstId);
    hunters.push(a);
  }

  ctx.fillStyle = "#06090d";
  ctx.fillRect(0, 0, W(), H());
}
resetSim();

// =======================
// STEERING / MOVING
// =======================
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

  // speed tradeoff: bigger = slower
  const spBase = SPEED_MIN + agent.g.speed * (SPEED_MAX - SPEED_MIN);
  const sp = spBase * (1.12 - 0.55 * size);

  // move cost: bigger = more expensive
  const sizeCost = 0.65 + size * 1.10;

  // density pressure
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

// =======================
// BEHAVIOR
// =======================
function grazerStep(g) {
  const vision = GRAZER_VISION * (0.85 + (1 - g.g.size) * 0.35);
  let bestScore = -1, bestX = g.x, bestY = g.y;

  for (let i = 0; i < 8; i++) {
    const ang = g.a + (i - 3.5) * 0.35;
    const sx = g.x + Math.cos(ang) * vision;
    const sy = g.y + Math.sin(ang) * vision;
    const p = samplePlant((sx + W()) % W(), (sy + H()) % H());
    if (p > bestScore) {
      bestScore = p;
      bestX = (sx + W()) % W();
      bestY = (sy + H()) % H();
    }
  }

  // avoid nearest hunter
  let nearestH = null;
  let nd = Infinity;
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

  // eat plant underfoot
  const bite = PLANT_EAT_RATE * (0.65 + g.g.greed) * (0.75 + g.g.size * 0.85);
  const eaten = eatPlantAt(g.x, g.y, bite);
  g.energy += eaten * 0.78;

  // baseline hunger (bigger costs more)
  g.energy -= 0.00055 * (0.7 + g.g.size * 1.3) * (1 + densityPressure() * 1.1);

  move(g);
}

function hunterStep(h) {
  const vision = HUNTER_VISION * (0.9 + (1 - h.g.size) * 0.20);
  let target = null;
  let bestD = vision * vision;

  for (const g of grazers) {
    const d = dist2(h.x, h.y, g.x, g.y);
    if (d < bestD) {
      bestD = d;
      target = g;
    }
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

  // hunters have higher baseline hunger; big hunters pay more
  h.energy -= 0.00085 * (0.85 + h.g.size * 1.4) * (1 + densityPressure() * 1.2);

  move(h);
}

// =======================
// LIFE / REPRODUCTION (SOFT CONTROL)
// =======================
function handleLife(list) {
  // death + nutrient return
  for (let i = list.length - 1; i >= 0; i--) {
    const a = list[i];
    if (a.energy <= 0 || a.age > 26000) {
      addPlant(a.x, a.y, 0.22 + a.g.size * 0.35);
      list.splice(i, 1);
    }
  }

  // reproduction (slow + density-limited + resource-limited)
  const pressure = densityPressure();
  const reproSlow = 0.06;
  const popPenalty = 1 - pressure;
  const baseChance = reproSlow * (0.25 + 0.75 * popPenalty);

  for (let i = list.length - 1; i >= 0; i--) {
    const a = list[i];
    if (a.reproCooldown > 0) continue;
    if (a.energy <= REPRO_THRESHOLD) continue;

    if (a.type === "g") {
      if (!localPlantOk(a.x, a.y)) continue;
    } else {
      if (!preyAbundant()) continue;
    }

    const sizePenalty = 1 - a.g.size * 0.55;
    const p = baseChance * sizePenalty;

    if (Math.random() < p) {
      a.energy -= REPRO_COST * (0.85 + a.g.size * 0.55);
      a.reproCooldown = REPRO_COOLDOWN_TICKS;
      list.push(a.cloneMutated(ticks));
    }
  }
}

// =======================
// DRAW
// =======================
function drawHeatmap() {
  const w = W(), h = H();
  const cellW = w / GRID, cellH = h / GRID;
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const p = plant[idx(x, y)];
      if (p <= 0.03) continue;
      const v = Math.floor(26 + p * 120);
      ctx.fillStyle = `rgb(18, ${v}, 40)`;
      ctx.fillRect(x * cellW, y * cellH, cellW + 0.5, cellH + 0.5);
    }
  }
}

function drawAgents() {
  // grazers
  for (const g of grazers) {
    const sp = speciesDB.get(g.speciesId);
    const color = sp?.color ?? "rgb(120,200,140)";
    const r = 2.2 + g.g.size * 10.5;

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(g.x, g.y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // hunters
  for (const h of hunters) {
    const sp = speciesDB.get(h.speciesId);
    const color = sp?.color ?? "rgb(210,90,90)";
    const r = 2.8 + h.g.size * 12.0;

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(h.x, h.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function draw() {
  const w = W(), h = H();

  if (!drawTrailsEl.checked) {
    ctx.fillStyle = "#06090d";
    ctx.fillRect(0, 0, w, h);
  } else {
    ctx.fillStyle = "rgba(6,9,13,0.14)";
    ctx.fillRect(0, 0, w, h);
  }

  if (drawHeatEl.checked) drawHeatmap();
  drawAgents();
}

// =======================
// MAIN LOOP
// =======================
let ticks = 0;

function topSpeciesList(type, n = 5) {
  const arr = [];
  for (const sp of speciesDB.values()) {
    if (sp.type !== type) continue;
    if (sp.count > 0) arr.push(sp);
  }
  arr.sort((a, b) => b.count - a.count);
  return arr.slice(0, n);
}

function fmtSpeciesLine(sp) {
  // show name + count
  return `${sp.name}: ${sp.count}`;
}

function step() {
  if (!paused) {
    frameCounter++;
    const doTick = (frameCounter % TICK_EVERY_N_FRAMES === 0);

    if (doTick) {
      regenPlants();

      for (const g of grazers) grazerStep(g);
      for (const h of hunters) hunterStep(h);

      handleLife(grazers);
      handleLife(hunters);

      // Update species stats occasionally (not every tick)
      if (ticks % 25 === 0) updateSpeciesStats();

      ticks++;

      if (ticks % 25 === 0) {
        const avg = (arr, key) =>
          arr.length ? (arr.reduce((s, a) => s + a.g[key], 0) / arr.length).toFixed(2) : "—";
        const sizeAvg = (arr) =>
          arr.length ? (arr.reduce((s, a) => s + a.g.size, 0) / arr.length).toFixed(2) : "—";

        const gTop = topSpeciesList("g", 4);
        const hTop = topSpeciesList("h", 4);

        statsEl.textContent =
`Grazers: ${grazers.length} | Hunters: ${hunters.length} | Species: ${speciesDB.size}
Avg size: grazers ${sizeAvg(grazers)} | hunters ${sizeAvg(hunters)}
Avg genes (grazers): speed ${avg(grazers, "speed")} greed ${avg(grazers, "greed")} caution ${avg(grazers, "caution")}
Avg genes (hunters): speed ${avg(hunters, "speed")} bite  ${avg(hunters, "bite")}
Pressure: ${densityPressure().toFixed(2)} | Plants regen: ${PLANT_GROWTH} | Mutation: ${MUT_RATE}

Top grazer species:
${gTop.length ? gTop.map(fmtSpeciesLine).join("\n") : "—"}

Top hunter species:
${hTop.length ? hTop.map(fmtSpeciesLine).join("\n") : "—"}`;
      }
    }
  }

  draw();
  requestAnimationFrame(step);
}
requestAnimationFrame(step);

// =======================
// UI
// =======================
pauseBtn.addEventListener("click", () => {
  paused = !paused;
  pauseBtn.textContent = paused ? "Resume" : "Pause";
});

resetBtn.addEventListener("click", () => {
  paused = false;
  pauseBtn.textContent = "Pause";
  resetSim();
});
