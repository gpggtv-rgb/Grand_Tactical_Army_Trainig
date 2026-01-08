
import React, { useState, useCallback, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom/client';

// --- CONSTANTS ---
const TILE_SIZE = 128;
const CITY_SIZE = 45;
const FRICTION = 0.94;
const DRAG = 0.98;
const VEHICLE_ACCEL = 0.3;
const VEHICLE_TURN_SPEED = 0.07;
const PLAYER_RUN_SPEED = 3.8;
const PLAYER_WALK_SPEED = 1.6;
const STAMINA_REGEN = 0.5;
const ROLL_STAMINA_COST = 35;
const ROLL_SPEED_BOOST = 7.0;

const COLORS = {
  ROAD: '#1a1a1a',
  SIDEWALK: '#333333',
  BUILDING: '#151525',
  BUILDING_TOP: '#1e1e35',
  GRASS: '#122512',
  TREE: '#081508',
  PLAYER: '#00ffcc',
  PED: '#ffffff',
  BLOOD: 'rgba(200, 0, 0, 0.8)',
  MIST: 'rgba(0, 0, 0, 0.9)'
};

enum WeaponType {
  FIST = 'FIST',
  PISTOL = 'PISTOL',
  MACHINE_GUN = 'MACHINE_GUN',
  GRENADE = 'GRENADE'
}

const WEAPONS = {
  [WeaponType.FIST]: { range: 65, damage: 15, cooldown: 12, zoomFactor: 1.1 },
  [WeaponType.PISTOL]: { range: 550, damage: 25, cooldown: 18, zoomFactor: 1.4 },
  [WeaponType.MACHINE_GUN]: { range: 750, damage: 15, cooldown: 5, zoomFactor: 1.7 },
  [WeaponType.GRENADE]: { range: 450, damage: 120, cooldown: 55, explosive: true, zoomFactor: 1.3 }
};

// --- TYPES ---
interface Vector2 { x: number; y: number; }
interface BloodSplatter { pos: Vector2; angle: number; scale: number; alpha: number; startTime: number; }
interface Particle { pos: Vector2; vel: Vector2; life: number; color: string; }

// --- MAP GENERATION ---
const generateMap = () => {
  const grid: number[][] = [];
  for (let y = 0; y < CITY_SIZE; y++) {
    grid[y] = [];
    for (let x = 0; x < CITY_SIZE; x++) {
      if (x % 7 === 0 || y % 7 === 0) grid[y][x] = 1; // Road
      else if (x % 7 === 1 || x % 7 === 6 || y % 7 === 1 || y % 7 === 6) grid[y][x] = 2; // Sidewalk
      else grid[y][x] = Math.random() > 0.95 ? 4 : 3; // 3: Building, 4: Park
    }
  }
  return grid;
};

// --- AUDIO UTILS ---
const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
const playSfx = (freq: number, type: OscillatorType, dur: number, vol: number) => {
  try {
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    g.gain.setValueAtTime(vol, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + dur);
    osc.connect(g); g.connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime + dur);
  } catch(e) {}
};

// --- GAME COMPONENT ---
const GameCanvas = ({ onUpdate, gameKey }: { onUpdate: (s: any) => void, gameKey: number }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engine = useRef({
    player: {
      pos: { x: TILE_SIZE * 8.5, y: TILE_SIZE * 8.5 },
      vel: { x: 0, y: 0 },
      angle: 0,
      health: 100,
      stamina: 100,
      weapon: WeaponType.FIST,
      vehicleId: null as string | null,
      state: 'idle',
      lastShot: 0,
      rollTimer: 0,
      radius: 16
    },
    vehicles: [] as any[],
    peds: [] as any[],
    projectiles: [] as any[],
    blood: [] as BloodSplatter[],
    particles: [] as Particle[],
    map: generateMap(),
    keys: {} as any,
    mouse: { x: 0, y: 0, left: false, right: false },
    camera: { x: 0, y: 0, zoom: 1.0 },
    score: 0,
    lastTime: performance.now(),
    punchAnim: 0
  });

  useEffect(() => {
    const eng = engine.current;
    // Initial Spawning
    for (let i = 0; i < 40; i++) {
        eng.vehicles.push({
            id: `v-${i}`,
            pos: { x: (Math.floor(Math.random() * 6) * 7 + 0.5) * TILE_SIZE, y: (Math.floor(Math.random() * CITY_SIZE)) * TILE_SIZE },
            vel: { x: 0, y: 0 },
            angle: Math.random() < 0.5 ? 0 : Math.PI,
            speed: 0,
            color: `hsl(${Math.random() * 360}, 60%, 45%)`,
            radius: 46,
            driver: i < 15 ? 'npc' : null
        });
    }
    for (let i = 0; i < 60; i++) {
        eng.peds.push({
            id: `p-${i}`,
            pos: { x: (Math.random() * CITY_SIZE) * TILE_SIZE, y: (Math.random() * CITY_SIZE) * TILE_SIZE },
            vel: { x: 0, y: 0 },
            angle: Math.random() * Math.PI * 2,
            health: 100,
            radius: 16,
            anger: Math.random() * 20
        });
    }

    const handleKey = (e: KeyboardEvent, down: boolean) => {
        eng.keys[e.code] = down;
        if (down) {
            if (e.code === 'KeyF') toggleVehicle();
            if (e.code === 'Digit1') eng.player.weapon = WeaponType.FIST;
            if (e.code === 'Digit2') eng.player.weapon = WeaponType.PISTOL;
            if (e.code === 'Digit3') eng.player.weapon = WeaponType.MACHINE_GUN;
            if (e.code === 'Digit4') eng.player.weapon = WeaponType.GRENADE;
            if (e.code === 'Space' && eng.player.rollTimer <= 0 && !eng.player.vehicleId) {
                if (eng.player.stamina > ROLL_STAMINA_COST) {
                    eng.player.stamina -= ROLL_STAMINA_COST;
                    eng.player.rollTimer = 25;
                    playSfx(150, 'sine', 0.2, 0.1);
                }
            }
        }
    };

    const handleMouse = (e: MouseEvent, down: boolean) => {
        if (e.button === 0) eng.mouse.left = down;
        if (e.button === 2) eng.mouse.right = down;
    };

    window.addEventListener('keydown', (e) => handleKey(e, true));
    window.addEventListener('keyup', (e) => handleKey(e, false));
    window.addEventListener('mousedown', (e) => handleMouse(e, true));
    window.addEventListener('mouseup', (e) => handleMouse(e, false));
    window.addEventListener('mousemove', (e) => { eng.mouse.x = e.clientX; eng.mouse.y = e.clientY; });
    window.addEventListener('contextmenu', (e) => e.preventDefault());

    const frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [gameKey]);

  const toggleVehicle = () => {
    const eng = engine.current;
    if (eng.player.vehicleId) {
      const v = eng.vehicles.find(v => v.id === eng.player.vehicleId);
      if (v) {
        eng.player.vehicleId = null; v.driver = null;
        eng.player.pos.x += Math.cos(v.angle + Math.PI/2) * 90;
        eng.player.pos.y += Math.sin(v.angle + Math.PI/2) * 90;
        playSfx(200, 'sine', 0.2, 0.1);
      }
    } else {
      const v = eng.vehicles.find(v => {
        const d = Math.hypot(v.pos.x - eng.player.pos.x, v.pos.y - eng.player.pos.y);
        return d < 100;
      });
      if (v) {
        eng.player.vehicleId = v.id; v.driver = 'player';
        playSfx(400, 'sine', 0.1, 0.1);
      }
    }
  };

  const spawnBlood = (pos: Vector2) => {
    engine.current.blood.push({
        pos: { ...pos },
        angle: Math.random() * Math.PI * 2,
        scale: 0.6 + Math.random() * 1.4,
        alpha: 0.85,
        startTime: Date.now()
    });
    playSfx(100 + Math.random() * 50, 'sawtooth', 0.3, 0.15);
  };

  const loop = (time: number) => {
    const dt = Math.min(2.0, (time - engine.current.lastTime) / 16.67);
    engine.current.lastTime = time;

    // --- PHYSICS SUB-STEPPING (4 steps for stability) ---
    const subSteps = 4;
    for (let s = 0; s < subSteps; s++) {
        updatePhysics(dt / subSteps);
    }
    
    render();
    requestAnimationFrame(loop);
  };

  const updatePhysics = (dt: number) => {
    const eng = engine.current;
    const p = eng.player;

    if (p.health <= 0) return;

    // Player Input & Movement
    if (p.vehicleId) {
        const v = eng.vehicles.find(v => v.id === p.vehicleId);
        if (v) {
            if (eng.keys['KeyW']) v.speed += VEHICLE_ACCEL * dt;
            if (eng.keys['KeyS']) v.speed -= (VEHICLE_ACCEL * 0.6) * dt;
            const turnFactor = Math.min(1, Math.abs(v.speed) / 4);
            if (eng.keys['KeyA']) v.angle -= VEHICLE_TURN_SPEED * turnFactor * dt;
            if (eng.keys['KeyD']) v.angle += VEHICLE_TURN_SPEED * turnFactor * dt;
            v.speed *= Math.pow(DRAG, dt);
            v.pos.x += Math.cos(v.angle) * v.speed * dt;
            v.pos.y += Math.sin(v.angle) * v.speed * dt;
            p.pos = { ...v.pos }; p.angle = v.angle;
            checkWallCollision(v);
        }
    } else {
        if (p.rollTimer > 0) {
            p.pos.x += Math.cos(p.angle) * ROLL_SPEED_BOOST * dt;
            p.pos.y += Math.sin(p.angle) * ROLL_SPEED_BOOST * dt;
            p.rollTimer -= dt;
        } else {
            const isWalk = eng.keys['ShiftLeft'];
            const speed = isWalk ? PLAYER_WALK_SPEED : PLAYER_RUN_SPEED;
            let moveX = 0, moveY = 0;
            if (eng.keys['KeyW']) moveY -= 1; if (eng.keys['KeyS']) moveY += 1;
            if (eng.keys['KeyA']) moveX -= 1; if (eng.keys['KeyD']) moveX += 1;
            
            if (moveX !== 0 || moveY !== 0) {
                const ang = Math.atan2(moveY, moveX);
                p.pos.x += Math.cos(ang) * speed * dt;
                p.pos.y += Math.sin(ang) * speed * dt;
                if (!eng.mouse.right) p.angle = ang;
            }
            if (eng.mouse.right) {
                const canvas = canvasRef.current;
                if (canvas) {
                    p.angle = Math.atan2(eng.mouse.y - canvas.height/2, eng.mouse.x - canvas.width/2);
                }
            }
            if (eng.mouse.left) fireWeapon(p);
        }
        checkWallCollision(p);
    }

    // NPC Vehicles
    eng.vehicles.forEach(v => {
        if (v.driver === 'npc') {
            v.speed = Math.min(v.speed + 0.1 * dt, 2.8);
            const tx = Math.floor((v.pos.x + Math.cos(v.angle) * 80) / TILE_SIZE);
            const ty = Math.floor((v.pos.y + Math.sin(v.angle) * 80) / TILE_SIZE);
            if (eng.map[ty]?.[tx] !== 1) v.angle += 0.05 * dt;
            v.pos.x += Math.cos(v.angle) * v.speed * dt;
            v.pos.y += Math.sin(v.angle) * v.speed * dt;
            checkWallCollision(v);
        }
    });

    // Resolve Collisions
    resolveCollisions(dt);

    p.stamina = Math.min(100, p.stamina + STAMINA_REGEN * dt);
    if (eng.punchAnim > 0) eng.punchAnim -= dt;

    // Blood Fading
    eng.blood = eng.blood.filter(b => {
        const age = Date.now() - b.startTime;
        if (age > 10000) b.alpha -= 0.005 * dt;
        return b.alpha > 0;
    });

    onUpdate({ player: p, score: eng.score, vSpeed: eng.vehicles.find(v => v.id === p.vehicleId)?.speed || 0 });
  };

  const fireWeapon = (p: any) => {
    const eng = engine.current;
    const now = Date.now();
    const config = WEAPONS[p.weapon as WeaponType];
    if (now - p.lastShot < config.cooldown * 16) return;
    p.lastShot = now;

    if (p.weapon === WeaponType.FIST) {
        eng.punchAnim = 10; playSfx(150, 'square', 0.1, 0.1);
        [...eng.peds, p].forEach(target => {
            if (target === p || target.health <= 0) return;
            const dist = Math.hypot(target.pos.x - p.pos.x, target.pos.y - p.pos.y);
            if (dist < 70) {
                target.health -= config.damage;
                if (target.health <= 0) spawnBlood(target.pos);
            }
        });
    } else {
        playSfx(p.weapon === WeaponType.GRENADE ? 110 : 500, 'sawtooth', 0.1, 0.1);
        eng.projectiles.push({
            pos: { ...p.pos }, vel: { x: Math.cos(p.angle) * 18, y: Math.sin(p.angle) * 18 },
            owner: p.id, type: p.weapon, life: config.range / 18, radius: 4
        });
    }
  };

  const checkWallCollision = (ent: any) => {
    const eng = engine.current;
    const tx = Math.floor(ent.pos.x / TILE_SIZE), ty = Math.floor(ent.pos.y / TILE_SIZE);
    for (let y = ty-1; y <= ty+1; y++) {
        for (let x = tx-1; x <= tx+1; x++) {
            if (eng.map[y]?.[x] === 3) {
                const bX = x * TILE_SIZE, bY = y * TILE_SIZE;
                const cX = Math.max(bX, Math.min(ent.pos.x, bX + TILE_SIZE));
                const cY = Math.max(bY, Math.min(ent.pos.y, bY + TILE_SIZE));
                const dx = ent.pos.x - cX, dy = ent.pos.y - cY;
                const d = Math.hypot(dx, dy);
                if (d < ent.radius && d > 0) {
                    ent.pos.x += (dx/d) * (ent.radius - d);
                    ent.pos.y += (dy/d) * (ent.radius - d);
                    if (ent.speed) ent.speed *= -0.3;
                }
            }
        }
    }
  };

  const resolveCollisions = (dt: number) => {
    const eng = engine.current;
    const allPeds = [...eng.peds, eng.player];
    
    // Vehicle vs Vehicle
    for (let i = 0; i < eng.vehicles.length; i++) {
        for (let j = i+1; j < eng.vehicles.length; j++) {
            const a = eng.vehicles[i], b = eng.vehicles[j];
            const dx = b.pos.x - a.pos.x, dy = b.pos.y - a.pos.y;
            const dist = Math.hypot(dx, dy);
            const minDist = (a.radius + b.radius) * 0.95;
            if (dist < minDist) {
                const overlap = (minDist - dist);
                a.pos.x -= (dx/dist) * overlap * 0.5; a.pos.y -= (dy/dist) * overlap * 0.5;
                b.pos.x += (dx/dist) * overlap * 0.5; b.pos.y += (dy/dist) * overlap * 0.5;
                const rel = a.speed - b.speed;
                a.speed -= rel * 0.5; b.speed += rel * 0.5;
            }
        }
    }

    // Vehicle vs Ped
    eng.vehicles.forEach(v => {
        allPeds.forEach(ped => {
            if (ped.vehicleId === v.id || ped.health <= 0) return;
            const dx = ped.pos.x - v.pos.x, dy = ped.pos.y - v.pos.y;
            const dist = Math.hypot(dx, dy);
            const minDist = v.radius + ped.radius - 5;
            if (dist < minDist) {
                ped.pos.x += (dx/dist) * (minDist - dist);
                ped.pos.y += (dy/dist) * (minDist - dist);
                if (Math.abs(v.speed) > 1.5) {
                    ped.health -= Math.abs(v.speed) * 20;
                    if (ped.health <= 0) spawnBlood(ped.pos);
                }
            }
        });
    });
  };

  const render = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const eng = engine.current;
    const p = eng.player;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // Zoom Handling
    const targetZoom = p.vehicleId ? (0.7 - Math.abs(eng.vehicles.find(v => v.id === p.vehicleId)?.speed || 0) * 0.04) : 1.0;
    eng.camera.zoom += (targetZoom - eng.camera.zoom) * 0.1;

    ctx.fillStyle = '#050510'; ctx.fillRect(0,0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(canvas.width/2, canvas.height/2);
    ctx.scale(eng.camera.zoom, eng.camera.zoom);
    ctx.translate(-p.pos.x, -p.pos.y);

    // Tiles
    for (let y = 0; y < CITY_SIZE; y++) {
        for (let x = 0; x < CITY_SIZE; x++) {
            const px = x * TILE_SIZE, py = y * TILE_SIZE;
            const t = eng.map[y][x];
            if (t === 1) { ctx.fillStyle = COLORS.ROAD; ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE); }
            else if (t === 2) { ctx.fillStyle = COLORS.SIDEWALK; ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE); }
            else if (t === 3) { 
                ctx.fillStyle = COLORS.BUILDING; ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
                ctx.fillStyle = COLORS.BUILDING_TOP; ctx.fillRect(px+12, py+12, TILE_SIZE-24, TILE_SIZE-24);
            }
        }
    }

    // Blood
    eng.blood.forEach(b => {
        ctx.save(); ctx.translate(b.pos.x, b.pos.y); ctx.rotate(b.angle); ctx.scale(b.scale, b.scale);
        ctx.fillStyle = `rgba(180, 0, 0, ${b.alpha})`;
        ctx.beginPath(); ctx.moveTo(0,0);
        for(let i=0; i<8; i++){ const r = 10+Math.random()*15; const a = (i/8)*Math.PI*2; ctx.lineTo(Math.cos(a)*r, Math.sin(a)*r); }
        ctx.fill(); ctx.restore();
    });

    // Vehicles
    eng.vehicles.forEach(v => {
        ctx.save(); ctx.translate(v.pos.x, v.pos.y); ctx.rotate(v.angle);
        ctx.fillStyle = v.color; ctx.fillRect(-45, -22, 90, 44);
        ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(-20, -15, 50, 30);
        ctx.fillStyle = 'white'; ctx.fillRect(40, -18, 6, 8); ctx.fillRect(40, 10, 6, 8);
        ctx.fillStyle = 'red'; ctx.fillRect(-46, -18, 4, 8); ctx.fillRect(-46, 10, 4, 8);
        ctx.restore();
    });

    // Peds
    const drawEnt = (e: any, isP = false) => {
        if (isP && e.vehicleId) return;
        ctx.save(); ctx.translate(e.pos.x, e.pos.y); ctx.rotate(e.angle);
        if (isP && eng.punchAnim > 0) { ctx.strokeStyle = 'white'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(0,0, 50, -0.5, 0.5); ctx.stroke(); }
        ctx.fillStyle = isP ? COLORS.PLAYER : COLORS.PED;
        ctx.beginPath(); ctx.arc(0,0, e.radius, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = 'black'; ctx.fillRect(10, -2, 7, 4);
        ctx.restore();
    };
    eng.peds.forEach(e => drawEnt(e));
    drawEnt(p, true);

    ctx.restore();

    // Mist Fog
    const isCar = !!p.vehicleId;
    const visionRad = (eng.mouse.right ? 500 : (isCar ? 450 : 280)) / eng.camera.zoom;
    const grad = ctx.createRadialGradient(canvas.width/2, canvas.height/2, visionRad*0.4, canvas.width/2, canvas.height/2, visionRad*1.8);
    grad.addColorStop(0, 'transparent'); grad.addColorStop(1, isCar ? 'rgba(0,0,0,0.7)' : COLORS.MIST);
    ctx.fillStyle = grad; ctx.fillRect(0,0, canvas.width, canvas.height);

    renderMinimap(ctx, canvas);
  };

  const renderMinimap = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
    const sz = 200, pad = 25, mx = canvas.width - sz - pad, my = canvas.height - sz - pad;
    const eng = engine.current; const p = eng.player;
    const scale = 0.05; // 3x zoom out from 0.15

    ctx.save(); ctx.translate(mx, my);
    ctx.fillStyle = 'rgba(0,0,0,0.9)'; ctx.fillRect(0,0, sz, sz);
    ctx.strokeStyle = '#444'; ctx.lineWidth = 4; ctx.strokeRect(0,0, sz, sz);
    ctx.beginPath(); ctx.rect(0,0, sz, sz); ctx.clip();
    
    ctx.save(); ctx.translate(sz/2, sz/2); ctx.scale(scale, scale); ctx.translate(-p.pos.x, -p.pos.y);
    
    // Vision Range
    const vRad = (eng.mouse.right ? 550 : (!!p.vehicleId ? 450 : 280));
    ctx.beginPath(); ctx.arc(p.pos.x, p.pos.y, vRad, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(0, 255, 150, 0.05)'; ctx.fill();
    ctx.strokeStyle = 'rgba(0, 255, 150, 0.2)'; ctx.lineWidth = 20; ctx.stroke();

    for(let y=0; y<CITY_SIZE; y++){
      for(let x=0; x<CITY_SIZE; x++){
        if(eng.map[y][x] === 3) { ctx.fillStyle = '#1e1e35'; ctx.fillRect(x*TILE_SIZE+10, y*TILE_SIZE+10, TILE_SIZE-20, TILE_SIZE-20); }
      }
    }
    eng.peds.forEach(npc => {
        const d = Math.hypot(npc.pos.x - p.pos.x, npc.pos.y - p.pos.y);
        if (d < vRad) { ctx.fillStyle = 'red'; ctx.beginPath(); ctx.arc(npc.pos.x, npc.pos.y, 100, 0, Math.PI*2); ctx.fill(); }
    });
    ctx.restore();

    ctx.fillStyle = '#00ffcc'; ctx.beginPath(); ctx.arc(sz/2, sz/2, 6, 0, Math.PI*2); ctx.fill();
    ctx.save(); ctx.translate(sz/2, sz/2); ctx.rotate(p.angle); ctx.beginPath(); ctx.moveTo(12,0); ctx.lineTo(-4,-5); ctx.lineTo(-4,5); ctx.fill(); ctx.restore();
    ctx.restore();
  };

  return <canvas ref={canvasRef} className="cursor-none" />;
};

// --- MAIN APP ---
const App = () => {
  const [gameKey, setGameKey] = useState(0);
  const [state, setState] = useState<any>({ player: { health: 100, stamina: 100 }, score: 0, vSpeed: 0 });

  const weaponLabels = ['FIST', 'PISTOL', 'UZI', 'GRENADE'];
  const weapons = [WeaponType.FIST, WeaponType.PISTOL, WeaponType.MACHINE_GUN, WeaponType.GRENADE];

  return (
    <div className="relative w-screen h-screen bg-black text-white overflow-hidden font-mono select-none">
      <GameCanvas key={gameKey} gameKey={gameKey} onUpdate={setState} />

      {/* HUD - MONEY & STATS */}
      <div className="absolute top-6 left-6 flex flex-col gap-4 pointer-events-none z-20">
         <div className="bg-black/90 border-l-8 border-green-600 px-6 py-2 text-green-400 text-5xl font-black italic shadow-[8px_0_0_0_#166534]">
            $ {state.score.toString().padStart(8, '0')}
         </div>
         <div className="w-80 space-y-2">
            <div className="h-6 bg-gray-950 border-2 border-white/20 rounded-sm p-1">
                <div className="h-full bg-red-600 shadow-[0_0_15px_red] transition-all" style={{ width: `${Math.max(0, state.player.health)}%` }} />
            </div>
            <div className="h-3 bg-gray-950 border-2 border-white/20 rounded-sm p-0.5">
                <div className="h-full bg-blue-500 transition-all" style={{ width: `${state.player.stamina}%` }} />
            </div>
         </div>
      </div>

      {/* WEAPON SLOTS */}
      <div className="absolute top-6 right-6 flex gap-2 p-2 bg-black/60 border-b-4 border-yellow-600 rounded-lg pointer-events-none z-20">
         {weapons.map((w, i) => (
           <div key={w} className={`w-20 h-20 flex flex-col items-center justify-center border-2 ${state.player.weapon === w ? 'border-yellow-400 bg-yellow-400/20 scale-110' : 'border-white/10'}`}>
              <div className="text-[10px] opacity-40">{i+1}</div>
              <div className={`text-[11px] font-bold ${state.player.weapon === w ? 'text-yellow-400' : 'text-white/30'}`}>{weaponLabels[i]}</div>
           </div>
         ))}
      </div>

      {/* SPEEDOMETER */}
      {state.player.vehicleId && (
          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-none z-20">
              <div className="bg-black/80 px-8 py-2 border-t-4 border-white flex items-end gap-2 rounded-t-lg">
                  <span className="text-4xl font-black italic">{Math.floor(Math.abs(state.vSpeed)*22)}</span>
                  <span className="text-sm opacity-50 mb-1">KM/H</span>
              </div>
              <div className="w-64 h-2 bg-gray-900 border border-white/20 overflow-hidden">
                  <div className="h-full bg-white" style={{ width: `${Math.min(100, Math.abs(state.vSpeed)*12)}%` }} />
              </div>
          </div>
      )}

      {/* GAME OVER */}
      {state.player.health <= 0 && (
          <div className="absolute inset-0 bg-red-950/90 flex flex-col items-center justify-center z-50 animate-fade-in backdrop-blur-md">
              <h1 className="text-9xl font-black mb-12 skew-x-[-10deg] drop-shadow-2xl">WASTED</h1>
              <button className="px-12 py-4 bg-white text-red-950 font-black text-2xl hover:scale-110 active:scale-95 transition-all" onClick={() => setGameKey(k => k+1)}>RESPAWN</button>
          </div>
      )}
      
      <div className="absolute bottom-6 left-6 text-[10px] opacity-30 pointer-events-none">WASD: MOVE | F: CAR | SPACE: ROLL | L-CLICK: FIRE | R-CLICK: ZOOM</div>
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<App />);
