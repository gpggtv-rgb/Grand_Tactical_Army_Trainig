
import React, { useRef, useEffect } from 'react';
import { Vector2, GameState, EntityType, Vehicle, Pedestrian, WeaponType, Projectile, BloodEffect } from '../types';
import { 
  TILE_SIZE, CITY_SIZE, FRICTION, DRAG, VEHICLE_ACCEL, VEHICLE_TURN_SPEED, 
  PLAYER_RUN_SPEED, PLAYER_WALK_SPEED, STAMINA_REGEN, ROLL_STAMINA_COST, 
  ROLL_SPEED_BOOST, WEAPONS, COLORS, generateMap 
} from '../constants';

const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();

const playSynthSound = (freq: number, type: OscillatorType, duration: number, volume: number) => {
    try {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        gain.gain.setValueAtTime(volume, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    } catch (e) {}
};

const playDeathSound = () => {
  const baseFreq = 80 + Math.random() * 40;
  playSynthSound(baseFreq, 'sawtooth', 0.4, 0.15);
  setTimeout(() => playSynthSound(baseFreq * 0.8, 'sine', 0.3, 0.1), 100);
};

interface GameCanvasProps {
  onUpdate: (state: Partial<GameState>) => void;
}

const GameCanvas: React.FC<GameCanvasProps> = ({ onUpdate }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engine = useRef({
    state: {
      player: {
        id: 'player', pos: { x: TILE_SIZE * 7.5, y: TILE_SIZE * 7.5 }, angle: 0, velocity: { x: 0, y: 0 },
        type: EntityType.PLAYER, health: 100, currentWeapon: WeaponType.FIST, state: 'idle',
        anger: 0, stamina: 100, radius: 15, lastShotTime: 0, rollTimer: 0, currentVehicleId: undefined, isAiming: false
      } as Pedestrian,
      vehicles: [] as (Vehicle & { driverId?: string })[],
      pedestrians: [] as Pedestrian[],
      projectiles: [] as Projectile[],
      bloodEffects: [] as BloodEffect[],
      score: 0, wantedLevel: 0
    },
    map: generateMap(),
    keys: {} as Record<string, boolean>,
    mouse: { x: 0, y: 0, left: false, right: false },
    lastTime: 0,
    footstepTimer: 0,
    frameId: 0,
    cameraOffset: { x: 0, y: 0 },
    punchEffect: 0,
    zoom: 1.0
  });

  useEffect(() => {
    const map = engine.current.map;
    const getSpawnPoints = (tileType: number) => {
      const points: Vector2[] = [];
      for (let y = 0; y < CITY_SIZE; y++) {
        for (let x = 0; x < CITY_SIZE; x++) {
          if (map[y][x] === tileType) points.push({ x: x * TILE_SIZE + TILE_SIZE/2, y: y * TILE_SIZE + TILE_SIZE/2 });
        }
      }
      return points;
    };

    const roadPoints = getSpawnPoints(1);
    const sidewalkPoints = getSpawnPoints(2);

    const vehicles: (Vehicle & { driverId?: string })[] = [];
    for (let i = 0; i < 35; i++) {
        const spawn = roadPoints[Math.floor(Math.random() * roadPoints.length)];
        vehicles.push({
            id: `v-${i}`, type: EntityType.VEHICLE,
            pos: { ...spawn },
            angle: Math.random() < 0.5 ? 0 : Math.PI/2, velocity: { x: 0, y: 0 }, radius: 45,
            vehicleStyle: i % 3 === 0 ? 'sport' : (i % 3 === 1 ? 'sedan' : 'van'),
            color: `hsl(${Math.random() * 360}, 50%, 45%)`, speed: 0, health: 100,
            driverId: i < 15 ? `ai-driver-${i}` : undefined
        });
    }
    engine.current.state.vehicles = vehicles;

    const peds: Pedestrian[] = [];
    for (let i = 0; i < 60; i++) {
        const spawn = sidewalkPoints[Math.floor(Math.random() * sidewalkPoints.length)];
        peds.push({
            id: `p-${i}`, type: EntityType.PEDESTRIAN,
            pos: { ...spawn },
            angle: Math.random() * Math.PI * 2, velocity: { x: 0, y: 0 }, radius: 15,
            health: 100, currentWeapon: WeaponType.PISTOL, state: 'idle', anger: Math.random() * 20,
            stamina: 100, lastShotTime: 0, rollTimer: 0
        });
    }
    engine.current.state.pedestrians = peds;

    const handleKey = (e: KeyboardEvent, isDown: boolean) => {
        engine.current.keys[e.code] = isDown;
        if (isDown) {
            if (e.code === 'Digit1') engine.current.state.player.currentWeapon = WeaponType.FIST;
            if (e.code === 'Digit2') engine.current.state.player.currentWeapon = WeaponType.PISTOL;
            if (e.code === 'Digit3') engine.current.state.player.currentWeapon = WeaponType.MACHINE_GUN;
            if (e.code === 'Digit4') engine.current.state.player.currentWeapon = WeaponType.GRENADE;
            if (e.code === 'KeyF') toggleVehicleEntry();
            if (e.code === 'Space' && engine.current.state.player.state !== 'rolling' && !engine.current.state.player.currentVehicleId) {
                performRoll(engine.current.state.player);
            }
        }
    };

    const handleMouse = (e: MouseEvent, isDown: boolean) => {
        if (e.button === 0) engine.current.mouse.left = isDown;
        if (e.button === 2) engine.current.mouse.right = isDown;
    };

    const handleMouseMove = (e: MouseEvent) => {
        engine.current.mouse.x = e.clientX;
        engine.current.mouse.y = e.clientY;
    };

    window.addEventListener('keydown', (e) => handleKey(e, true));
    window.addEventListener('keyup', (e) => handleKey(e, false));
    window.addEventListener('mousedown', (e) => handleMouse(e, true));
    window.addEventListener('mouseup', (e) => handleMouse(e, false));
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('contextmenu', (e) => e.preventDefault());

    engine.current.frameId = requestAnimationFrame(gameLoop);
    return () => {
        cancelAnimationFrame(engine.current.frameId);
        window.removeEventListener('keydown', (e) => handleKey(e, true));
        window.removeEventListener('keyup', (e) => handleKey(e, false));
        window.removeEventListener('mousedown', (e) => handleMouse(e, true));
        window.removeEventListener('mouseup', (e) => handleMouse(e, false));
        window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  const spawnBlood = (pos: Vector2) => {
    engine.current.state.bloodEffects.push({
      pos: { ...pos },
      alpha: 0.8,
      timestamp: Date.now(),
      angle: Math.random() * Math.PI * 2,
      scale: 0.5 + Math.random() * 1.5
    });
  };

  const toggleVehicleEntry = () => {
    const { player, vehicles } = engine.current.state;
    if (player.currentVehicleId) {
      const v = vehicles.find(v => v.id === player.currentVehicleId);
      if (v) {
        player.currentVehicleId = undefined;
        v.driverId = undefined;
        player.pos.x += Math.cos(v.angle + Math.PI/2) * 85;
        player.pos.y += Math.sin(v.angle + Math.PI/2) * 85;
        player.velocity = { x: 0, y: 0 };
        playSynthSound(180, 'sine', 0.2, 0.1);
      }
    } else {
      const nearest = vehicles.find(v => {
        const dx = v.pos.x - player.pos.x, dy = v.pos.y - player.pos.y;
        return Math.sqrt(dx*dx + dy*dy) < 95;
      });
      if (nearest) {
        player.currentVehicleId = nearest.id;
        nearest.driverId = 'player';
        playSynthSound(350, 'sine', 0.1, 0.1);
      }
    }
  };

  const performRoll = (p: Pedestrian) => {
    if (p.stamina >= ROLL_STAMINA_COST) {
        p.stamina -= ROLL_STAMINA_COST;
        p.state = 'rolling';
        p.rollTimer = 22;
        playSynthSound(140, 'sine', 0.2, 0.1);
    }
  };

  const gameLoop = (time: number) => {
    const dt = Math.min(2.0, (time - engine.current.lastTime) / 16.67);
    engine.current.lastTime = time;
    update(dt);
    render();
    engine.current.frameId = requestAnimationFrame(gameLoop);
  };

  const fireWeapon = (p: Pedestrian) => {
    const now = Date.now();
    const config = WEAPONS[p.currentWeapon];
    if (now - p.lastShotTime < config.cooldown * 16) return;
    p.lastShotTime = now;
    
    if (p.currentWeapon === WeaponType.FIST) {
        playSynthSound(180, 'square', 0.1, 0.1);
        engine.current.punchEffect = 10;
        engine.current.state.pedestrians.concat(engine.current.state.player).forEach(target => {
            if (target === p || target.health <= 0) return;
            const dx = target.pos.x - p.pos.x, dy = target.pos.y - p.pos.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            const angleToTarget = Math.atan2(dy, dx);
            const diff = Math.abs(((angleToTarget - p.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
            if (dist < config.range && diff < 0.9) {
                target.health -= config.damage;
                target.anger = 100;
                target.targetId = p.id;
                if (target.health <= 0) { spawnBlood(target.pos); playDeathSound(); }
                if (p.id === 'player') engine.current.state.score += 5;
            }
        });
    } else {
        playSynthSound(p.currentWeapon === WeaponType.GRENADE ? 120 : 480, 'sawtooth', 0.1, 0.1);
        engine.current.state.projectiles.push({
            id: `proj-${now}`, type: EntityType.PROJECTILE, ownerId: p.id,
            pos: { ...p.pos }, angle: p.angle, 
            velocity: { x: Math.cos(p.angle) * 17, y: Math.sin(p.angle) * 17 },
            radius: 4, weaponType: p.currentWeapon, distanceTraveled: 0,
            maxDistance: config.range, isExplosive: !!(config as any).explosive
        });
    }
  };

  const resolveEntityCollisions = (dt: number) => {
    const { state } = engine.current;
    const peds = [...state.pedestrians, state.player];
    
    // Improved Vehicle vs Vehicle Collision
    for (let i = 0; i < state.vehicles.length; i++) {
        for (let j = i + 1; j < state.vehicles.length; j++) {
            const a = state.vehicles[i], b = state.vehicles[j];
            const dx = b.pos.x - a.pos.x, dy = b.pos.y - a.pos.y;
            const distSq = dx*dx + dy*dy;
            const minDist = (a.radius + b.radius) * 0.95; // slightly tighter
            if (distSq < minDist * minDist) {
                const dist = Math.sqrt(distSq) || 0.1;
                const overlap = (minDist - dist);
                const nx = dx / dist, ny = dy / dist;
                
                // Push both out
                a.pos.x -= nx * overlap * 0.5; a.pos.y -= ny * overlap * 0.5;
                b.pos.x += nx * overlap * 0.5; b.pos.y += ny * overlap * 0.5;
                
                // Physics bounce
                const impactSpeed = a.speed - b.speed;
                a.speed -= impactSpeed * 0.6;
                b.speed += impactSpeed * 0.6;
                
                if (Math.abs(impactSpeed) > 1.0) playSynthSound(70 + Math.random()*20, 'square', 0.1, 0.05);
            }
        }
    }

    // Vehicle vs Pedestrian
    state.vehicles.forEach(v => {
        peds.forEach(ent => {
            if (ent.id === 'player' && ent.currentVehicleId === v.id) return;
            if (ent.currentVehicleId || ent.health <= 0) return;
            const dx = ent.pos.x - v.pos.x, dy = ent.pos.y - v.pos.y;
            const distSq = dx*dx + dy*dy;
            const minDist = v.radius + ent.radius - 5;
            if (distSq < minDist * minDist) {
                const dist = Math.sqrt(distSq) || 0.1;
                const push = (minDist - dist);
                const nx = dx / dist, ny = dy / dist;
                ent.pos.x += nx * push; ent.pos.y += ny * push;
                
                if (Math.abs(v.speed) > 1.2) {
                    ent.health -= Math.abs(v.speed) * 15;
                    if (ent.health <= 0) { spawnBlood(ent.pos); playDeathSound(); }
                    else playSynthSound(90, 'sawtooth', 0.1, 0.1);
                    ent.anger = 100;
                }
            }
        });
    });

    // Peds vs Peds
    for (let i = 0; i < peds.length; i++) {
        for (let j = i + 1; j < peds.length; j++) {
            const a = peds[i], b = peds[j];
            if (a.currentVehicleId || b.currentVehicleId || a.health <= 0 || b.health <= 0) continue;
            const dx = b.pos.x - a.pos.x, dy = b.pos.y - a.pos.y;
            const minDist = a.radius + b.radius;
            if (dx*dx + dy*dy < minDist * minDist) {
                const dist = Math.sqrt(dx*dx + dy*dy) || 0.1;
                const overlap = (minDist - dist) / 2;
                const nx = dx / dist, ny = dy / dist;
                a.pos.x -= nx * overlap; a.pos.y -= ny * overlap;
                b.pos.x += nx * overlap; b.pos.y += ny * overlap;
            }
        }
    }
  };

  const update = (dt: number) => {
    const { state, keys, mouse, map } = engine.current;
    const p = state.player;

    if (p.health <= 0) return; // Stop logic if dead

    const currentV = state.vehicles.find(v => v.id === p.currentVehicleId);
    let speedFac = 0;
    if (currentV) {
       speedFac = Math.abs(currentV.speed) / 8;
       engine.current.zoom += ( (0.7 - speedFac * 0.4) - engine.current.zoom) * 0.05 * dt;
    } else {
       engine.current.zoom += (1.0 - engine.current.zoom) * 0.1 * dt;
    }

    p.isAiming = mouse.right && !p.currentVehicleId;
    const canvas = canvasRef.current;
    if (canvas) {
        if (!p.currentVehicleId && p.state !== 'rolling') {
            const dx = mouse.x - canvas.width / 2;
            const dy = mouse.y - canvas.height / 2;
            p.angle = Math.atan2(dy, dx);
        }
        if (p.isAiming) {
            const targetX = Math.cos(p.angle) * 200, targetY = Math.sin(p.angle) * 200;
            engine.current.cameraOffset.x += (targetX - engine.current.cameraOffset.x) * 0.1 * dt;
            engine.current.cameraOffset.y += (targetY - engine.current.cameraOffset.y) * 0.1 * dt;
        } else {
            engine.current.cameraOffset.x *= Math.pow(0.85, dt);
            engine.current.cameraOffset.y *= Math.pow(0.85, dt);
        }
    }

    if (engine.current.punchEffect > 0) engine.current.punchEffect -= dt;

    state.vehicles.forEach(v => {
      const isControlledByPlayer = p.currentVehicleId === v.id;
      if (isControlledByPlayer) {
        if (keys['KeyW'] || keys['ArrowUp']) v.speed += VEHICLE_ACCEL * dt;
        if (keys['KeyS'] || keys['ArrowDown']) v.speed -= (VEHICLE_ACCEL * 0.5) * dt;
        const turnMult = Math.min(1, Math.abs(v.speed) / 3.8);
        if (keys['KeyA'] || keys['ArrowLeft']) v.angle -= VEHICLE_TURN_SPEED * turnMult * dt;
        if (keys['KeyD'] || keys['ArrowRight']) v.angle += VEHICLE_TURN_SPEED * turnMult * dt;
        v.speed *= Math.pow(DRAG, dt);
        v.velocity.x = Math.cos(v.angle) * v.speed;
        v.velocity.y = Math.sin(v.angle) * v.speed;
        p.pos = { ...v.pos };
        p.angle = v.angle;
      } else if (v.driverId) {
        v.speed = Math.min(v.speed + 0.1 * dt, 2.8);
        const lookX = v.pos.x + Math.cos(v.angle) * 75, lookY = v.pos.y + Math.sin(v.angle) * 75;
        const tx = Math.floor(lookX / TILE_SIZE), ty = Math.floor(lookY / TILE_SIZE);
        if (map[ty]?.[tx] !== 1) v.angle += 0.05 * dt;
        v.velocity.x = Math.cos(v.angle) * v.speed;
        v.velocity.y = Math.sin(v.angle) * v.speed;
      } else {
        v.speed *= Math.pow(DRAG, dt);
        v.velocity.x = Math.cos(v.angle) * v.speed;
        v.velocity.y = Math.sin(v.angle) * v.speed;
      }
      v.pos.x += v.velocity.x * dt;
      v.pos.y += v.velocity.y * dt;
      checkBuildingCollision(v);
    });

    if (!p.currentVehicleId) {
      if (p.state === 'rolling') {
          p.pos.x += Math.cos(p.angle) * ROLL_SPEED_BOOST * dt;
          p.pos.y += Math.sin(p.angle) * ROLL_SPEED_BOOST * dt;
          p.rollTimer -= dt;
          if (p.rollTimer <= 0) p.state = 'idle';
      } else {
          const isWalking = keys['ShiftLeft'] || keys['ShiftRight'];
          const speed = isWalking ? PLAYER_WALK_SPEED : PLAYER_RUN_SPEED;
          let dx = 0, dy = 0;
          if (keys['KeyW'] || keys['ArrowUp']) dy -= 1;
          if (keys['KeyS'] || keys['ArrowDown']) dy += 1;
          if (keys['KeyA'] || keys['ArrowLeft']) dx -= 1;
          if (keys['KeyD'] || keys['ArrowRight']) dx += 1;
          if (dx !== 0 || dy !== 0) {
              const moveAngle = Math.atan2(dy, dx);
              p.velocity.x = Math.cos(moveAngle) * speed;
              p.velocity.y = Math.sin(moveAngle) * speed;
              p.state = isWalking ? 'walking' : 'running';
              if (!isWalking) {
                  engine.current.footstepTimer += dt;
                  if (engine.current.footstepTimer > 15) { playSynthSound(45, 'sine', 0.05, 0.005); engine.current.footstepTimer = 0; }
              }
          } else {
              p.velocity.x *= Math.pow(FRICTION, dt);
              p.velocity.y *= Math.pow(FRICTION, dt);
              p.state = 'idle';
          }
          p.pos.x += p.velocity.x * dt;
          p.pos.y += p.velocity.y * dt;
          if (mouse.left) fireWeapon(p);
      }
      checkBuildingCollision(p);
    }

    resolveEntityCollisions(dt);

    p.stamina = Math.min(100, p.stamina + STAMINA_REGEN * dt);

    state.bloodEffects = state.bloodEffects.filter(b => {
      const age = Date.now() - b.timestamp;
      if (age > 10000) b.alpha -= 0.005 * dt;
      return b.alpha > 0;
    });

    state.projectiles = state.projectiles.filter(proj => {
        proj.pos.x += proj.velocity.x * dt;
        proj.pos.y += proj.velocity.y * dt;
        proj.distanceTraveled += 18 * dt;
        let hit = false;
        [...state.pedestrians, p].forEach(target => {
            if(target.id === proj.ownerId || target.health <= 0 || target.currentVehicleId) return;
            const dx = target.pos.x - proj.pos.x, dy = target.pos.y - proj.pos.y;
            if(dx*dx + dy*dy < (target.radius + proj.radius)**2) {
                target.health -= WEAPONS[proj.weaponType].damage;
                target.anger = 100; target.targetId = proj.ownerId;
                hit = true; 
                if (target.health <= 0) { spawnBlood(target.pos); playDeathSound(); }
                if(proj.ownerId === 'player') state.score += 25;
            }
        });
        return !hit && proj.distanceTraveled < proj.maxDistance;
    });

    state.pedestrians = state.pedestrians.filter(npc => {
        if(npc.health <= 0) { state.score += 60; return false; }
        if(npc.anger > 45 && npc.targetId) {
            const target = npc.targetId === 'player' ? p : state.pedestrians.find(o => o.id === npc.targetId);
            if(target) {
                const dx = target.pos.x - npc.pos.x, dy = target.pos.y - npc.pos.y;
                npc.angle = Math.atan2(dy, dx);
                npc.pos.x += Math.cos(npc.angle) * 2.4 * dt;
                npc.pos.y += Math.sin(npc.angle) * 2.4 * dt;
                if(Math.sqrt(dx*dx+dy*dy) < 450) fireWeapon(npc);
            }
        } else {
            npc.angle += (Math.random()-0.5) * 0.12 * dt;
            npc.pos.x += Math.cos(npc.angle) * 1.4 * dt;
            npc.pos.y += Math.sin(npc.angle) * 1.4 * dt;
            if (map[Math.floor(npc.pos.y/TILE_SIZE)]?.[Math.floor(npc.pos.x/TILE_SIZE)] === 1) npc.angle += Math.PI;
        }
        checkBuildingCollision(npc);
        return true;
    });

    onUpdate({ player: p, score: state.score, wantedLevel: state.wantedLevel, currentVehicleSpeed: currentV?.speed });
  };

  const checkBuildingCollision = (entity: any) => {
    const { map } = engine.current;
    const tx = Math.floor(entity.pos.x / TILE_SIZE), ty = Math.floor(entity.pos.y / TILE_SIZE);
    for(let y = ty-1; y <= ty+1; y++) {
        for(let x = tx-1; x <= tx+1; x++) {
            if(x < 0 || y < 0 || x >= CITY_SIZE || y >= CITY_SIZE) continue;
            if(map[y][x] === 3) {
                const bX = x * TILE_SIZE, bY = y * TILE_SIZE;
                const cX = Math.max(bX, Math.min(entity.pos.x, bX + TILE_SIZE));
                const cY = Math.max(bY, Math.min(entity.pos.y, bY + TILE_SIZE));
                const dx = entity.pos.x - cX, dy = entity.pos.y - cY;
                const dSq = dx*dx + dy*dy;
                if(dSq < entity.radius*entity.radius) {
                    const dist = Math.sqrt(dSq) || 0.1;
                    entity.pos.x += (dx/dist) * (entity.radius-dist);
                    entity.pos.y += (dy/dist) * (entity.radius-dist);
                    if (entity.type === EntityType.VEHICLE) entity.speed *= -0.4;
                }
            }
        }
    }
  };

  const render = () => {
    const canvas = canvasRef.current;
    if (!canvas || !canvas.getContext('2d')) return;
    const ctx = canvas.getContext('2d')!;
    const { player, vehicles, pedestrians, projectiles, bloodEffects } = engine.current.state;
    const { map, cameraOffset, zoom } = engine.current;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    ctx.fillStyle = '#050510';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-player.pos.x - cameraOffset.x, -player.pos.y - cameraOffset.y);

    const startX = Math.max(0, Math.floor((player.pos.x - canvas.width / zoom) / TILE_SIZE));
    const endX = Math.min(CITY_SIZE, Math.ceil((player.pos.x + canvas.width / zoom) / TILE_SIZE));
    const startY = Math.max(0, Math.floor((player.pos.y - canvas.height / zoom) / TILE_SIZE));
    const endY = Math.min(CITY_SIZE, Math.ceil((player.pos.y + canvas.height / zoom) / TILE_SIZE));

    // Map Tiles
    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const tile = map[y][x];
        const px = x * TILE_SIZE, py = y * TILE_SIZE;
        if (tile === 1) { ctx.fillStyle = COLORS.ROAD; ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE); }
        else if (tile === 2) { ctx.fillStyle = COLORS.SIDEWALK; ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE); }
        else if (tile === 3) {
            ctx.fillStyle = COLORS.BUILDING; ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            ctx.fillStyle = COLORS.BUILDING_TOP; ctx.fillRect(px + 12, py + 12, TILE_SIZE - 24, TILE_SIZE - 24);
        } else if (tile === 4) {
            ctx.fillStyle = COLORS.GRASS; ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            ctx.fillStyle = COLORS.TREE; ctx.beginPath(); ctx.arc(px+TILE_SIZE/2, py+TILE_SIZE/2, 48, 0, Math.PI*2); ctx.fill();
        }
      }
    }

    // Blood
    bloodEffects.forEach(b => {
      ctx.save();
      ctx.translate(b.pos.x, b.pos.y);
      ctx.rotate(b.angle);
      ctx.scale(b.scale, b.scale);
      ctx.fillStyle = `rgba(180, 0, 0, ${b.alpha})`;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      for(let i=0; i<8; i++) {
        const ang = (i / 8) * Math.PI * 2;
        const rad = 10 + Math.random() * 15;
        ctx.lineTo(Math.cos(ang) * rad, Math.sin(ang) * rad);
      }
      ctx.fill();
      ctx.restore();
    });

    // Vehicles
    vehicles.forEach(v => {
        ctx.save();
        ctx.translate(v.pos.x, v.pos.y);
        ctx.rotate(v.angle);
        ctx.fillStyle = v.color;
        const w = v.vehicleStyle === 'van' ? 100 : 88, h = v.vehicleStyle === 'van' ? 58 : 45;
        ctx.fillRect(-w/2, -h/2, w, h);
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(-w/2 + 25, -h/2 + 8, w-50, h-16);
        ctx.fillStyle = 'rgba(255,255,255,0.8)'; // Headlights
        ctx.fillRect(w/2 - 6, -h/2 + 6, 8, 10); ctx.fillRect(w/2 - 6, h/2 - 16, 8, 10);
        ctx.fillStyle = 'rgba(255,0,0,0.8)'; // Tail
        ctx.fillRect(-w/2 - 2, -h/2 + 6, 6, 10); ctx.fillRect(-w/2 - 2, h/2 - 16, 6, 10);
        ctx.restore();
    });

    // Projectiles
    projectiles.forEach(pr => {
        ctx.fillStyle = pr.weaponType === WeaponType.GRENADE ? '#ff0000' : '#ffff00';
        ctx.beginPath(); ctx.arc(pr.pos.x, pr.pos.y, pr.radius + (pr.weaponType === WeaponType.GRENADE ? 4 : 0), 0, Math.PI*2); ctx.fill();
    });

    // Peds
    const renderEntity = (ent: Pedestrian, isPlayer = false) => {
        if (isPlayer && ent.currentVehicleId) return;
        ctx.save();
        ctx.translate(ent.pos.x, ent.pos.y);
        ctx.rotate(ent.angle);
        if(ent.state === 'rolling') ctx.scale(1.3, 0.7);
        if (isPlayer && engine.current.punchEffect > 0) {
            ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 6;
            ctx.beginPath(); ctx.arc(0,0, 52, -0.6, 0.6); ctx.stroke();
        }
        ctx.fillStyle = isPlayer ? COLORS.PLAYER : COLORS.PED;
        ctx.beginPath(); ctx.arc(0, 0, ent.radius, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#000'; ctx.fillRect(10, -2, 7, 4);
        ctx.restore();
    };
    pedestrians.forEach(ped => renderEntity(ped));
    renderEntity(player, true);

    ctx.restore();

    // Mist (Screen Space)
    ctx.save();
    const config = WEAPONS[player.currentWeapon];
    const isCar = !!player.currentVehicleId;
    const baseRadius = (player.isAiming ? 480 * config.zoomFactor : (isCar ? 400 : 250)) / zoom;
    const mistGrad = ctx.createRadialGradient(
        canvas.width/2 + cameraOffset.x, canvas.height/2 + cameraOffset.y, baseRadius * 0.4, 
        canvas.width/2 + cameraOffset.x, canvas.height/2 + cameraOffset.y, baseRadius * 1.8
    );
    mistGrad.addColorStop(0, 'rgba(0,0,0,0)');
    mistGrad.addColorStop(1, isCar ? 'rgba(0,0,0,0.7)' : COLORS.MIST);
    ctx.fillStyle = mistGrad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    // Crosshair
    if (player.isAiming) {
        ctx.strokeStyle = '#00ff66'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(engine.current.mouse.x, engine.current.mouse.y, 14, 0, Math.PI*2);
        ctx.moveTo(engine.current.mouse.x-20, engine.current.mouse.y); ctx.lineTo(engine.current.mouse.x+20, engine.current.mouse.y);
        ctx.moveTo(engine.current.mouse.x, engine.current.mouse.y-20); ctx.lineTo(engine.current.mouse.x, engine.current.mouse.y+20);
        ctx.stroke();
    }

    // Minimap Rendering
    renderMinimap(ctx, canvas);
  };

  const renderMinimap = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
    const mapSize = 180;
    const padding = 20;
    const mx = canvas.width - mapSize - padding;
    const my = canvas.height - mapSize - padding;
    const { player, pedestrians } = engine.current.state;
    // Map scale zoomed out 3x (from original 0.15 to 0.05)
    const mapScale = 0.05;

    ctx.save();
    ctx.translate(mx, my);
    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.9)';
    ctx.fillRect(0,0, mapSize, mapSize);
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 3;
    ctx.strokeRect(0,0, mapSize, mapSize);

    // Map Clip
    ctx.beginPath(); ctx.rect(0,0, mapSize, mapSize); ctx.clip();

    ctx.save();
    ctx.translate(mapSize/2, mapSize/2);
    ctx.scale(mapScale, mapScale);
    ctx.translate(-player.pos.x, -player.pos.y);

    const config = WEAPONS[player.currentWeapon];
    const isCar = !!player.currentVehicleId;
    const visionRadius = (player.isAiming ? 480 * config.zoomFactor : (isCar ? 400 : 250));

    // Highlight the buildings
    for(let y=0; y<CITY_SIZE; y++) {
      for(let x=0; x<CITY_SIZE; x++) {
        if(engine.current.map[y][x] === 3) {
          ctx.fillStyle = '#222244';
          ctx.fillRect(x*TILE_SIZE + 5, y*TILE_SIZE + 5, TILE_SIZE-10, TILE_SIZE-10);
        }
      }
    }

    // Vision Area Highlight on Map
    ctx.save();
    ctx.beginPath();
    ctx.arc(player.pos.x, player.pos.y, visionRadius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 255, 100, 0.06)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 255, 100, 0.2)';
    ctx.lineWidth = 15;
    ctx.stroke();
    ctx.restore();

    // NPCs (Only if inside the player's vision radius)
    pedestrians.forEach(npc => {
      const dx = npc.pos.x - player.pos.x, dy = npc.pos.y - player.pos.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      if (dist < visionRadius) {
        ctx.fillStyle = '#ff3333';
        ctx.beginPath(); ctx.arc(npc.pos.x, npc.pos.y, 80, 0, Math.PI*2); ctx.fill();
      }
    });

    ctx.restore();

    // Player Marker
    ctx.fillStyle = '#00ffcc';
    ctx.beginPath();
    ctx.arc(mapSize/2, mapSize/2, 6, 0, Math.PI*2); ctx.fill();
    
    // Direction pointer
    ctx.save();
    ctx.translate(mapSize/2, mapSize/2);
    ctx.rotate(player.angle);
    ctx.fillStyle = '#00ffcc';
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.lineTo(-4, -5);
    ctx.lineTo(-4, 5);
    ctx.fill();
    ctx.restore();

    ctx.restore();
  };

  return <canvas ref={canvasRef} className="cursor-none" />;
};

export default GameCanvas;
