// 2-Organism ecosystem (plants -> grazers -> hunters) with mutation.
// Runs fully in the browser; good for GitHub Pages.

const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d", { alpha: false });

const statsEl = document.getElementById("stats");
const pauseBtn = document.getElementById("pauseBtn");
const resetBtn = document.getElementById("resetBtn");
const drawTrailsEl = document.getElementById("drawTrails");
const drawHeatEl = document.getElementById("drawHeat");

function fitCanvas() {
  // match CSS-rendered size to actual pixel buffer
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", fitCanvas);
fitCanvas();

// ====== SIM CONSTANTS (tweak these) ======
const W = () => canvas.getBoundingClientRect().width;
const H = () => canvas.getBoundingClientRect().height;

// World grid for plant energy
const GRID = 120;              // higher = more detailed, slower
const PLANT_GROWTH = 0.015;     // plant regen per tick
const PLANT_MAX = 1.0;
const PLANT_EAT_RATE = 0.18;

const BASE_MOVE_COST = 0.0035;
const TURN_RATE = 0.30;
const SPEED_MIN = 0.25;
const SPEED_MAX = 2.2;

// Reproduction
const REPRO_THRESHOLD = 1.25;
const REPRO_COST = 0.55;
const MUT_RATE = 0.12;         // chance per gene to mutate
const MUT_STRENGTH = 0.12;     // how strong mutation is

// Population caps (keeps it from melting your browser)
const MAX_GRAZERS = 250;
const MAX_HUNTERS = 160;

// Vision / hunting
const GRAZER_VISION = 28;
const HUNTER_VISION = 40;
const EAT_RADIUS = 6.5;
const HUNT_DAMAGE = 0.35;      // energy stolen per bite

// Start with exactly two organisms
const START_GRAZERS = 1;
const START_HUNTERS = 1;

// ====== UTIL ======
const rand = (a=1,b=0) => Math.random()*(a-b)+b;
const clamp = (x,a,b)=>Math.max(a,Math.min(b,x));
const dist2 = (ax,ay,bx,by)=> (ax-bx)**2 + (ay-by)**2;

function wrapPos(o) {
  const w=W(), h=H();
  if (o.x<0) o.x+=w; else if (o.x>w) o.x-=w;
  if (o.y<0) o.y+=h; else if (o.y>h) o.y-=h;
}

// ====== PLANT FIELD ======
let plant = new Float32Array(GRID*GRID);
function idx(ix,iy){ return iy*GRID+ix; }
function samplePlant(x,y){
  const w=W(), h=H();
  const gx = clamp((x/w)*GRID, 0, GRID-1e-6);
  const gy = clamp((y/h)*GRID, 0, GRID-1e-6);
  const x0 = Math.floor(gx), y0 = Math.floor(gy);
  const x1 = Math.min(GRID-1, x0+1), y1 = Math.min(GRID-1, y0+1);
  const tx = gx-x0, ty = gy-y0;
  const a = plant[idx(x0,y0)], b = plant[idx(x1,y0)];
  const c = plant[idx(x0,y1)], d = plant[idx(x1,y1)];
  const ab = a + (b-a)*tx;
  const cd = c + (d-c)*tx;
  return ab + (cd-ab)*ty;
}
function addPlant(x,y,amount){
  const w=W(), h=H();
  const ix = clamp(Math.floor((x/w)*GRID),0,GRID-1);
  const iy = clamp(Math.floor((y/h)*GRID),0,GRID-1);
  const k = idx(ix,iy);
  plant[k] = clamp(plant[k] + amount, 0, PLANT_MAX);
}
function eatPlantAt(x,y,amount){
  const w=W(), h=H();
  const ix = clamp(Math.floor((x/w)*GRID),0,GRID-1);
  const iy = clamp(Math.floor((y/h)*GRID),0,GRID-1);
  const k = idx(ix,iy);
  const take = Math.min(plant[k], amount);
  plant[k] -= take;
  return take;
}
function regenPlants(){
  for (let i=0;i<plant.length;i++){
    // logistic-ish growth: faster when low
    plant[i] = clamp(plant[i] + PLANT_GROWTH*(1-plant[i]), 0, PLANT_MAX);
  }
}
function resetPlants(){
  plant.fill(0);
  // seed with random patches
  for (let i=0;i<500;i++){
    addPlant(rand(W()), rand(H()), rand(1,0.2));
  }
}

// ====== ORGANISMS ======
class Agent {
  constructor(type, x, y, genes){
    this.type = type; // "g" or "h"
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.a = rand(Math.PI*2);
    this.energy = 0.9;
    this.age = 0;

    // genes control behavior & physiology
    // Keep genes in [0,1] for easy mutation
    this.g = genes ?? {
      speed: rand(0.75, 0.35),
      turn: rand(0.65, 0.25),
      greed: rand(0.8, 0.2),     // chase food more vs wander
      caution: rand(0.6, 0.15),  // (grazers) run from hunters
      bite: rand(0.65, 0.25),    // (hunters) aggressiveness
    };
  }

  cloneMutated() {
    const ng = { ...this.g };
    for (const k of Object.keys(ng)){
      if (Math.random() < MUT_RATE){
        const delta = (Math.random()*2-1)*MUT_STRENGTH;
        ng[k] = clamp(ng[k] + delta, 0, 1);
      }
    }
    const baby = new Agent(this.type, this.x + rand(10,-10), this.y + rand(10,-10), ng);
    baby.energy = 0.6;
    baby.a = rand(Math.PI*2);
    return baby;
  }
}

let grazers = [];
let hunters = [];
let paused = false;

function resetSim(){
  grazers = [];
  hunters = [];
  resetPlants();

  // exactly 2 organisms to start
  for (let i=0;i<START_GRAZERS;i++){
    grazers.push(new Agent("g", rand(W()), rand(H())));
  }
  for (let i=0;i<START_HUNTERS;i++){
    hunters.push(new Agent("h", rand(W()), rand(H())));
  }

  // darker clear
  ctx.fillStyle = "#06090d";
  ctx.fillRect(0,0,W(),H());
}
resetSim();

// ====== BEHAVIOR ======
function steerToward(agent, tx, ty, strength){
  const angTo = Math.atan2(ty-agent.y, tx-agent.x);
  let da = angTo - agent.a;
  // wrap angle
  da = Math.atan2(Math.sin(da), Math.cos(da));
  const tr = (0.08 + agent.g.turn*0.25) * strength;
  agent.a += clamp(da, -tr, tr);
}

function wander(agent){
  agent.a += (Math.random()*2-1) * (0.02 + (1-agent.g.turn)*0.05);
}

function move(agent){
  const sp = SPEED_MIN + agent.g.speed*(SPEED_MAX-SPEED_MIN);
  const cost = BASE_MOVE_COST * (0.65 + agent.g.speed*1.2);
  agent.energy -= cost;

  agent.vx = Math.cos(agent.a) * sp;
  agent.vy = Math.sin(agent.a) * sp;
  agent.x += agent.vx;
  agent.y += agent.vy;
  wrapPos(agent);

  agent.age++;
}

function grazerStep(g){
  // seek best nearby plant sample (cheap “vision”)
  const vision = GRAZER_VISION;
  let bestScore = -1, bestX = g.x, bestY = g.y;

  // sample in a few directions
  for (let i=0;i<8;i++){
    const ang = g.a + (i-3.5)*0.35;
    const sx = g.x + Math.cos(ang)*vision;
    const sy = g.y + Math.sin(ang)*vision;
    const p = samplePlant((sx+W())%W(), (sy+H())%H());
    if (p > bestScore){
      bestScore = p;
      bestX = (sx+W())%W();
      bestY = (sy+H())%H();
    }
  }

  // avoid nearest hunter (caution gene)
  let nearestH = null;
  let nd = Infinity;
  for (const h of hunters){
    const d = dist2(g.x,g.y,h.x,h.y);
    if (d < nd){ nd = d; nearestH = h; }
  }
  const dangerDist = 42;
  if (nearestH && nd < dangerDist*dangerDist && g.g.caution > 0.05){
    // run away
    const ax = g.x + (g.x - nearestH.x);
    const ay = g.y + (g.y - nearestH.y);
    steerToward(g, ax, ay, 1.35*g.g.caution);
  } else {
    // chase plants based on greed
    const chase = 0.2 + g.g.greed*1.1;
    steerToward(g, bestX, bestY, chase);
    if (Math.random() < 0.15*(1-g.g.greed)) wander(g);
  }

  // eat plant underfoot
  const eaten = eatPlantAt(g.x, g.y, PLANT_EAT_RATE * (0.7 + g.g.greed));
  g.energy += eaten * 0.75;

  move(g);
}

function hunterStep(h){
  // find nearest grazer in vision
  const vision = HUNTER_VISION;
  let target = null;
  let bestD = vision*vision;

  for (const g of grazers){
    const d = dist2(h.x,h.y,g.x,g.y);
    if (d < bestD){
      bestD = d;
      target = g;
    }
  }

  if (target){
    steerToward(h, target.x, target.y, 0.7 + h.g.bite*1.0);
    // bite if close
    if (bestD < EAT_RADIUS*EAT_RADIUS){
      const steal = Math.min(target.energy, HUNT_DAMAGE*(0.6 + h.g.bite));
      target.energy -= steal;
      h.energy += steal * 0.9;
    }
  } else {
    // patrol for plants (indirectly find grazers)
    if (Math.random() < 0.55) wander(h);
  }

  move(h);
}

// ====== REPRODUCTION & DEATH ======
function handleLife(list, cap){
  // death
  for (let i=list.length-1;i>=0;i--){
    const a = list[i];
    // too old or out of energy
    if (a.energy <= 0 || a.age > 20000){
      // return a bit of energy back to plants (nutrients)
      addPlant(a.x,a.y, 0.35);
      list.splice(i,1);
    }
  }
  // reproduction
  if (list.length < cap){
    for (let i=list.length-1;i>=0;i--){
      const a = list[i];
      if (a.energy > REPRO_THRESHOLD && Math.random() < 0.22){
        a.energy -= REPRO_COST;
        list.push(a.cloneMutated());
        if (list.length >= cap) break;
      }
    }
  }
}

// ====== DRAW ======
function drawHeatmap(){
  const w=W(), h=H();
  const cellW = w/GRID, cellH = h/GRID;
  for (let y=0;y<GRID;y++){
    for (let x=0;x<GRID;x++){
      const p = plant[idx(x,y)];
      if (p <= 0.02) continue;
      // greenish brightness without picking exact colors too hard
      const v = Math.floor(30 + p*120);
      ctx.fillStyle = `rgb(20, ${v}, 40)`;
      ctx.fillRect(x*cellW, y*cellH, cellW+0.5, cellH+0.5);
    }
  }
}

function drawAgents(){
  // grazers
  for (const g of grazers){
    const r = 3.2 + g.g.speed*2.0;
    const e = clamp(g.energy,0,1.8);
    ctx.fillStyle = `rgb(${Math.floor(80+e*60)}, ${Math.floor(170+e*40)}, 120)`;
    ctx.beginPath();
    ctx.arc(g.x,g.y,r,0,Math.PI*2);
    ctx.fill();
  }
  // hunters
  for (const h of hunters){
    const r = 3.6 + h.g.speed*2.4;
    const e = clamp(h.energy,0,2.0);
    ctx.fillStyle = `rgb(${Math.floor(190+e*20)}, ${Math.floor(80+e*20)}, ${Math.floor(80+e*10)})`;
    ctx.beginPath();
    ctx.arc(h.x,h.y,r,0,Math.PI*2);
    ctx.fill();
  }
}

function draw(){
  const w=W(), h=H();

  if (!drawTrailsEl.checked){
    ctx.fillStyle = "#06090d";
    ctx.fillRect(0,0,w,h);
  } else {
    // fade
    ctx.fillStyle = "rgba(6,9,13,0.15)";
    ctx.fillRect(0,0,w,h);
  }

  if (drawHeatEl.checked) drawHeatmap();
  drawAgents();
}

// ====== MAIN LOOP ======
let ticks = 0;
function step(){
  if (!paused){
    regenPlants();

    for (const g of grazers) grazerStep(g);
    for (const h of hunters) hunterStep(h);

    handleLife(grazers, MAX_GRAZERS);
    handleLife(hunters, MAX_HUNTERS);

    // If everything dies, reseed 2 organisms so it keeps being fun
    if (grazers.length === 0 && hunters.length === 0){
      resetSim();
    } else {
      // If one trophic level wipes out, let plants repop then reseed lightly
      if (grazers.length === 0){
        grazers.push(new Agent("g", rand(W()), rand(H())));
      }
      if (hunters.length === 0 && grazers.length > 12){
        hunters.push(new Agent("h", rand(W()), rand(H())));
      }
    }

    ticks++;
    if (ticks % 20 === 0){
      const avg = (arr, key) => arr.length ? (arr.reduce((s,a)=>s+a.g[key],0)/arr.length).toFixed(2) : "—";
      statsEl.textContent =
`Grazers: ${grazers.length} | Hunters: ${hunters.length}
Avg genes (grazers): speed ${avg(grazers,"speed")} greed ${avg(grazers,"greed")} caution ${avg(grazers,"caution")}
Avg genes (hunters): speed ${avg(hunters,"speed")} bite  ${avg(hunters,"bite")}
Plants: regen ${PLANT_GROWTH}  mutation ${MUT_RATE}`;
    }
  }
  draw();
  requestAnimationFrame(step);
}
requestAnimationFrame(step);

// ====== UI ======
pauseBtn.addEventListener("click", ()=>{
  paused = !paused;
  pauseBtn.textContent = paused ? "Resume" : "Pause";
});
resetBtn.addEventListener("click", ()=>{
  paused = false;
  pauseBtn.textContent = "Pause";
  resetSim();
});
