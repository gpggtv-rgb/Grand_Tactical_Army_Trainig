
import React, { useState, useCallback, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom/client';

// --- 전역 설정 및 상수 ---
const TILE_SIZE = 128;
const CITY_SIZE = 40;
const FRICTION = 0.94;
const DRAG = 0.98;
const VEHICLE_ACCEL_BASE = 0.4;
const VEHICLE_TURN_SPEED = 0.08;
const PLAYER_RUN_SPEED = 4.2;
const PLAYER_WALK_SPEED = 1.8;
const ROLL_SPEED_BOOST = 8.0;

enum WeaponType {
  FIST = 'FIST',
  PISTOL = 'PISTOL',
  UZI = 'UZI',
  SNIPER = 'SNIPER',
  GRENADE = 'GRENADE'
}

const WEAPONS = {
  [WeaponType.FIST]: { range: 70, damage: 15, cooldown: 12, zoomFactor: 1.1, spread: 0 },
  [WeaponType.PISTOL]: { range: 600, damage: 25, cooldown: 18, zoomFactor: 1.6, spread: 0.04 },
  [WeaponType.UZI]: { range: 800, damage: 12, cooldown: 5, zoomFactor: 1.9, spread: 0.12 },
  [WeaponType.SNIPER]: { range: 1500, damage: 120, cooldown: 50, zoomFactor: 3.2, spread: 0 },
  [WeaponType.GRENADE]: { range: 500, damage: 150, cooldown: 65, explosive: true, zoomFactor: 1.4, spread: 0 }
};

const COLORS = {
  ROAD: '#111111',
  SIDEWALK: '#222222',
  BUILDING: '#1a1a2e',
  BUILDING_TOP: '#222244',
  PLAYER: '#00ffcc',
  PED: '#ffffff',
  MIST: 'rgba(0, 0, 0, 0.92)',
  FIRE: '#ff4400',
  WRECK: '#0a0a0a',
  BULLET: '#ffff00'
};

// --- 유틸리티 ---
const generateMap = () => {
  const grid: number[][] = [];
  for (let y = 0; y < CITY_SIZE; y++) {
    grid[y] = [];
    for (let x = 0; x < CITY_SIZE; x++) {
      if (x % 7 === 0 || y % 7 === 0) grid[y][x] = 1;
      else if (x % 7 === 1 || x % 7 === 6 || y % 7 === 1 || y % 7 === 6) grid[y][x] = 2;
      else grid[y][x] = Math.random() > 0.95 ? 4 : 3;
    }
  }
  return grid;
};

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

// --- 게임 엔진 컴포넌트 ---
const GameCanvas = ({ onUpdate, gameKey }: { onUpdate: (s: any) => void, gameKey: number }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engine = useRef({
    player: {
      pos: { x: TILE_SIZE * 7.5, y: TILE_SIZE * 7.5 },
      angle: 0,
      health: 100,
      stamina: 100,
      weapon: WeaponType.FIST,
      vehicleId: null as string | null,
      rollTimer: 0,
      lastShot: 0,
      radius: 16,
      isAiming: false,
      aimProg: 0
    },
    vehicles: [] as any[],
    peds: [] as any[],
    projectiles: [] as any[],
    particles: [] as any[],
    map: generateMap(),
    keys: {} as any,
    mouse: { x: 0, y: 0, left: false, right: false },
    camera: { x: 0, y: 0, zoom: 1.0 },
    score: 0,
    lastTime: performance.now()
  });

  useEffect(() => {
    const eng = engine.current;
    // 초기 스폰
    for (let i = 0; i < 40; i++) {
      eng.vehicles.push({
        id: `v-${i}`,
        pos: { x: (Math.floor(Math.random() * 5) * 7 + 0.5) * TILE_SIZE, y: Math.random() * CITY_SIZE * TILE_SIZE },
        angle: Math.random() < 0.5 ? 0 : Math.PI,
        speed: 0,
        health: 100,
        gear: 1, // 1, 2, 3, 4, -1(R)
        color: `hsl(${Math.random() * 360}, 70%, 50%)`,
        radius: 48,
        driver: i < 12 ? 'npc' : null,
        isWreck: false,
        burnTime: 0
      });
    }
    for (let i = 0; i < 60; i++) {
      eng.peds.push({
        id: `p-${i}`,
        pos: { x: Math.random() * CITY_SIZE * TILE_SIZE, y: Math.random() * CITY_SIZE * TILE_SIZE },
        angle: Math.random() * Math.PI * 2,
        health: 100,
        radius: 16,
        walkTimer: Math.random() * 100
      });
    }

    const handleKey = (e: KeyboardEvent, down: boolean) => {
      eng.keys[e.code] = down;
      if (down) {
        if (e.code === 'KeyF') toggleVehicle();
        if (e.code === 'KeyE') shiftGear();
        const wMap: any = { Digit1: WeaponType.FIST, Digit2: WeaponType.PISTOL, Digit3: WeaponType.UZI, Digit4: WeaponType.SNIPER, Digit5: WeaponType.GRENADE };
        if (wMap[e.code]) eng.player.weapon = wMap[e.code];
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

  const shiftGear = () => {
    const eng = engine.current;
    if (eng.player.vehicleId) {
      const v = eng.vehicles.find(v => v.id === eng.player.vehicleId);
      if (v) {
        if (v.gear === 4) v.gear = -1; // Reverse
        else if (v.gear === -1) v.gear = 1;
        else v.gear++;
        playSfx(250 + v.gear * 50, 'triangle', 0.1, 0.05);
      }
    }
  };

  const toggleVehicle = () => {
    const eng = engine.current;
    if (eng.player.vehicleId) {
      const v = eng.vehicles.find(v => v.id === eng.player.vehicleId);
      if (v) {
        eng.player.vehicleId = null; v.driver = null;
        eng.player.pos.x += Math.cos(v.angle + Math.PI/2) * 90;
        eng.player.pos.y += Math.sin(v.angle + Math.PI/2) * 90;
      }
    } else {
      const v = eng.vehicles.find(v => !v.isWreck && Math.hypot(v.pos.x - eng.player.pos.x, v.pos.y - eng.player.pos.y) < 100);
      if (v) { eng.player.vehicleId = v.id; v.driver = 'player'; }
    }
  };

  const spawnParticle = (pos: any, vel: any, color: string, life: number, size: number) => {
    engine.current.particles.push({ pos: { ...pos }, vel, color, life, size });
  };

  const loop = (time: number) => {
    const dt = Math.min(2.0, (time - engine.current.lastTime) / 16.67);
    engine.current.lastTime = time;
    const subSteps = 4;
    for (let i = 0; i < subSteps; i++) updatePhysics(dt / subSteps);
    render();
    requestAnimationFrame(loop);
  };

  const updatePhysics = (dt: number) => {
    const eng = engine.current;
    const p = eng.player;
    if (p.health <= 0) return;

    p.isAiming = eng.mouse.right && !p.vehicleId;
    p.aimProg += (p.isAiming ? 1 - p.aimProg : -p.aimProg) * 0.1 * dt;

    if (p.vehicleId) {
      const v = eng.vehicles.find(v => v.id === p.vehicleId);
      if (v && !v.isWreck) {
        // 수동 변속 물리
        const gearPower = [0, 1.2, 0.8, 0.5, 0.3]; // 1~4단 토크
        const gearMax = [0, 4.0, 7.5, 11.0, 15.0]; // 1~4단 최고속도
        
        if (v.gear === -1) { // 후진
           if (eng.keys['KeyW']) v.speed -= VEHICLE_ACCEL_BASE * 0.5 * dt;
           if (eng.keys['KeyS']) v.speed += VEHICLE_ACCEL_BASE * 0.3 * dt;
           v.speed = Math.max(-3.5, v.speed);
        } else {
           if (eng.keys['KeyW']) v.speed += VEHICLE_ACCEL_BASE * gearPower[v.gear] * dt;
           if (eng.keys['KeyS']) v.speed -= VEHICLE_ACCEL_BASE * 0.8 * dt;
           v.speed = Math.min(gearMax[v.gear], v.speed);
        }

        const turnFac = Math.min(1, Math.abs(v.speed) / 4);
        if (eng.keys['KeyA']) v.angle -= VEHICLE_TURN_SPEED * turnFac * dt;
        if (eng.keys['KeyD']) v.angle += VEHICLE_TURN_SPEED * turnFac * dt;
        
        v.speed *= Math.pow(DRAG, dt);
        v.pos.x += Math.cos(v.angle) * v.speed * dt;
        v.pos.y += Math.sin(v.angle) * v.speed * dt;
        p.pos = { ...v.pos }; p.angle = v.angle;
        checkWall(v);
      }
    } else {
      const speed = eng.keys['ShiftLeft'] ? PLAYER_WALK_SPEED : PLAYER_RUN_SPEED;
      let mx = 0, my = 0;
      if (eng.keys['KeyW']) my -= 1; if (eng.keys['KeyS']) my += 1;
      if (eng.keys['KeyA']) mx -= 1; if (eng.keys['KeyD']) mx += 1;
      if (mx !== 0 || my !== 0) {
        const ang = Math.atan2(my, mx);
        p.pos.x += Math.cos(ang) * speed * dt;
        p.pos.y += Math.sin(ang) * speed * dt;
        if (!p.isAiming) p.angle = ang;
      }
      if (p.isAiming) {
          const canvas = canvasRef.current;
          if (canvas) p.angle = Math.atan2(eng.mouse.y - canvas.height/2, eng.mouse.x - canvas.width/2);
      }
      if (eng.mouse.left) fireWeapon(p);
      checkWall(p);
    }

    // NPC AI 및 물리 처리
    eng.peds.forEach(npc => {
        npc.walkTimer -= dt;
        if (npc.walkTimer <= 0) {
            npc.angle = Math.random() * Math.PI * 2;
            npc.walkTimer = 100 + Math.random() * 200;
        }
        npc.pos.x += Math.cos(npc.angle) * 1.5 * dt;
        npc.pos.y += Math.sin(npc.angle) * 1.5 * dt;
        checkWall(npc);
    });

    eng.vehicles.forEach(v => {
        if (v.driver === 'npc' && !v.isWreck) {
            v.speed = Math.min(v.speed + 0.1 * dt, 3.0);
            v.pos.x += Math.cos(v.angle) * v.speed * dt;
            v.pos.y += Math.sin(v.angle) * v.speed * dt;
            const tx = Math.floor((v.pos.x + Math.cos(v.angle) * 100) / TILE_SIZE);
            const ty = Math.floor((v.pos.y + Math.sin(v.angle) * 100) / TILE_SIZE);
            if (eng.map[ty]?.[tx] !== 1) v.angle += 0.05 * dt;
            checkWall(v);
        }
    });

    // 투사체 처리 (가시성 확보)
    eng.projectiles = eng.projectiles.filter(pr => {
        pr.pos.x += pr.vel.x * dt; pr.pos.y += pr.vel.y * dt;
        pr.life -= dt;
        let hit = false;
        [...eng.peds, p].forEach(target => {
            if (target.id === pr.owner || target.health <= 0) return;
            const d = Math.hypot(target.pos.x - pr.pos.x, target.pos.y - pr.pos.y);
            if (d < target.radius + pr.radius) {
                target.health -= pr.damage; hit = true;
                if (target.health <= 0) for(let i=0; i<8; i++) spawnParticle(target.pos, { x: (Math.random()-0.5)*4, y: (Math.random()-0.5)*4 }, 'red', 30, 3);
            }
        });
        return !hit && pr.life > 0;
    });

    // 충돌 해결
    resolveCollisions(dt);

    onUpdate({ player: p, score: eng.score, vehicle: eng.vehicles.find(v => v.id === p.vehicleId) });
  };

  const resolveCollisions = (dt: number) => {
    const eng = engine.current;
    const all = [...eng.vehicles];
    for(let i=0; i<all.length; i++) {
        for(let j=i+1; j<all.length; j++) {
            const a = all[i], b = all[j];
            const dx = b.pos.x - a.pos.x, dy = b.pos.y - a.pos.y;
            const dist = Math.hypot(dx, dy);
            const minDist = (a.radius + b.radius) * 0.95;
            if (dist < minDist) {
                const overlap = minDist - dist;
                const nx = dx/dist, ny = dy/dist;
                a.pos.x -= nx * overlap * 0.5; a.pos.y -= ny * overlap * 0.5;
                b.pos.x += nx * overlap * 0.5; b.pos.y += ny * overlap * 0.5;
                const rel = a.speed - b.speed;
                if (Math.abs(rel) > 2) { a.health -= 5; b.health -= 5; }
                a.speed -= rel * 0.4; b.speed += rel * 0.4;
            }
        }
    }
  };

  const checkWall = (ent: any) => {
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
            if (ent.speed) { ent.health -= Math.abs(ent.speed); ent.speed *= -0.4; }
          }
        }
      }
    }
  };

  const fireWeapon = (p: any) => {
    const eng = engine.current;
    const now = Date.now();
    const config = WEAPONS[p.weapon as WeaponType];
    if (now - p.lastShot < config.cooldown * 16) return;
    p.lastShot = now;

    playSfx(p.weapon === WeaponType.SNIPER ? 350 : 600, 'sawtooth', 0.1, 0.1);
    eng.projectiles.push({
        pos: { ...p.pos }, vel: { x: Math.cos(p.angle) * 25, y: Math.sin(p.angle) * 25 },
        owner: p.id, type: p.weapon, life: config.range / 25, radius: 4, damage: config.damage
    });
  };

  const render = () => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const eng = engine.current; const p = eng.player;

    canvas.width = window.innerWidth; canvas.height = window.innerHeight;
    
    const currentV = eng.vehicles.find(v => v.id === p.vehicleId);
    const targetZoom = p.vehicleId ? (0.6 - Math.abs(currentV?.speed || 0) * 0.02) : (1.0 - p.aimProg * 0.4);
    eng.camera.zoom += (targetZoom - eng.camera.zoom) * 0.1;

    ctx.fillStyle = COLORS.MIST; ctx.fillRect(0,0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(canvas.width/2, canvas.height/2);
    ctx.scale(eng.camera.zoom, eng.camera.zoom);
    ctx.translate(-p.pos.x, -p.pos.y);

    // 타일 렌더링
    for (let y = 0; y < CITY_SIZE; y++) {
      for (let x = 0; x < CITY_SIZE; x++) {
        const t = eng.map[y][x];
        const px = x * TILE_SIZE, py = y * TILE_SIZE;
        if (t === 1) { ctx.fillStyle = COLORS.ROAD; ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE); }
        else if (t === 2) { ctx.fillStyle = COLORS.SIDEWALK; ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE); }
        else if (t === 3) {
            ctx.fillStyle = COLORS.BUILDING; ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            ctx.fillStyle = COLORS.BUILDING_TOP; ctx.fillRect(px+12, py+12, TILE_SIZE-24, TILE_SIZE-24);
        }
      }
    }

    // 차량 렌더링
    eng.vehicles.forEach(v => {
      ctx.save(); ctx.translate(v.pos.x, v.pos.y); ctx.rotate(v.angle);
      ctx.fillStyle = v.isWreck ? COLORS.WRECK : v.color;
      ctx.fillRect(-45, -24, 90, 48);
      // 라이트 표현
      if (!v.isWreck) {
          if (v.speed > 0 || v.driver) { // 전진 헤드라이트
            ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(40, -22, 10, 10); ctx.fillRect(40, 12, 10, 10);
          }
          if (v.gear === -1) { // 후진등
            ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(-48, -20, 8, 8); ctx.fillRect(-48, 12, 8, 8);
          } else { // 브레이크/후미등
            ctx.fillStyle = 'rgba(255,0,0,0.8)'; ctx.fillRect(-48, -20, 6, 8); ctx.fillRect(-48, 12, 6, 8);
          }
      }
      ctx.restore();
    });

    // NPC 및 투사체
    eng.peds.forEach(e => {
        ctx.fillStyle = COLORS.PED; ctx.beginPath(); ctx.arc(e.pos.x, e.pos.y, e.radius, 0, Math.PI*2); ctx.fill();
    });

    eng.projectiles.forEach(pr => {
        ctx.fillStyle = COLORS.BULLET; ctx.shadowBlur = 10; ctx.shadowColor = COLORS.BULLET;
        ctx.beginPath(); ctx.arc(pr.pos.x, pr.pos.y, pr.radius, 0, Math.PI*2); ctx.fill();
        ctx.shadowBlur = 0;
    });

    // 플레이어
    if (!p.vehicleId) {
      ctx.save(); ctx.translate(p.pos.x, p.pos.y); ctx.rotate(p.angle);
      ctx.fillStyle = COLORS.PLAYER; ctx.beginPath(); ctx.arc(0,0, p.radius, 0, Math.PI*2); ctx.fill();
      ctx.restore();
    }

    ctx.restore();

    // 안개 효과
    const vision = (p.isAiming ? 800 : (p.vehicleId ? 550 : 350)) / eng.camera.zoom;
    const grad = ctx.createRadialGradient(canvas.width/2, canvas.height/2, vision*0.4, canvas.width/2, canvas.height/2, vision*1.8);
    grad.addColorStop(0, 'transparent'); grad.addColorStop(1, COLORS.MIST);
    ctx.fillStyle = grad; ctx.fillRect(0,0, canvas.width, canvas.height);

    // 조준점
    if (p.isAiming) {
        ctx.strokeStyle = '#00ff66'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(eng.mouse.x, eng.mouse.y, 20, 0, Math.PI*2);
        ctx.moveTo(eng.mouse.x - 30, eng.mouse.y); ctx.lineTo(eng.mouse.x + 30, eng.mouse.y);
        ctx.moveTo(eng.mouse.x, eng.mouse.y - 30); ctx.lineTo(eng.mouse.x, eng.mouse.y + 30);
        ctx.stroke();
    }
  };

  return <canvas ref={canvasRef} className="cursor-none" />;
};

const App = () => {
  const [gameKey, setGameKey] = useState(0);
  const [state, setState] = useState<any>({ player: { health: 100, stamina: 100, weapon: WeaponType.FIST }, score: 0, vehicle: null });
  const weapons = [WeaponType.FIST, WeaponType.PISTOL, WeaponType.UZI, WeaponType.SNIPER, WeaponType.GRENADE];

  return (
    <div className="relative w-screen h-screen bg-black text-white overflow-hidden font-mono select-none">
      <GameCanvas key={gameKey} gameKey={gameKey} onUpdate={setState} />
      
      {/* HUD - 좌측 상단 */}
      <div className="absolute top-6 left-6 flex flex-col gap-4 pointer-events-none">
         <div className="bg-black/90 border-l-8 border-green-600 px-6 py-2 text-green-400 text-5xl font-black italic shadow-[8px_0_0_0_#166534]">
            $ {state.score.toString().padStart(8, '0')}
         </div>
         <div className="w-80 space-y-2">
            <div className="h-6 bg-gray-950 border-2 border-white/20 rounded-sm p-1">
                <div className="h-full bg-red-600 shadow-[0_0_15px_red] transition-all" style={{ width: `${Math.max(0, state.player.health)}%` }} />
            </div>
         </div>
      </div>

      {/* 무기 선택창 - 우측 상단 */}
      <div className="absolute top-6 right-6 flex gap-2 p-2 bg-black/60 border-b-4 border-yellow-600 rounded-lg pointer-events-none">
         {weapons.map((w, i) => (
           <div key={w} className={`w-20 h-20 flex flex-col items-center justify-center border-2 ${state.player.weapon === w ? 'border-yellow-400 bg-yellow-400/20 scale-110' : 'border-white/10'}`}>
              <div className="text-[10px] opacity-40">{i+1}</div>
              <div className="text-[10px] font-bold">{w}</div>
           </div>
         ))}
      </div>

      {/* 기어 및 속도계 - 중앙 하단 */}
      {state.vehicle && (
          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-none bg-black/80 p-4 border-t-4 border-white rounded-t-xl min-w-[200px]">
              <div className="text-white text-xs opacity-50 mb-1">GEAR</div>
              <div className="text-4xl font-black italic mb-2 text-yellow-400">
                  {state.vehicle.gear === -1 ? 'R' : state.vehicle.gear}
              </div>
              <div className="text-white text-xs opacity-50 mb-1">VELOCITY</div>
              <div className="text-5xl font-black italic">
                  {Math.floor(Math.abs(state.vehicle.speed) * 25)} <span className="text-xl opacity-30">KM/H</span>
              </div>
          </div>
      )}

      {/* 조작 가이드 - 좌측 하단 */}
      <div className="absolute bottom-6 left-6 text-[11px] font-bold opacity-40 bg-black/40 p-2 rounded border-l-2 border-white/20 pointer-events-none">
        WASD: 이동/운전 | F: 탑승/하차 | E: 기어변속 | L-CLICK: 사격 | R-CLICK: 조준(확대)
      </div>

      {/* 게임 오버 */}
      {state.player.health <= 0 && (
          <div className="absolute inset-0 bg-red-950/90 flex flex-col items-center justify-center z-50 animate-fade-in backdrop-blur-md">
              <h1 className="text-9xl font-black mb-12 skew-x-[-10deg]">WASTED</h1>
              <button className="px-12 py-4 bg-white text-red-950 font-black text-2xl hover:scale-110 transition-all" onClick={() => setGameKey(k => k+1)}>RESPAWN</button>
          </div>
      )}
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
