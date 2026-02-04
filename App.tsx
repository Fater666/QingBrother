
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { GameView, Party, WorldTile, CombatState, MoraleStatus, Character, CombatUnit, WorldEntity, City } from './types.ts';
import { MAP_SIZE, WEAPON_TEMPLATES, ARMOR_TEMPLATES, SHIELD_TEMPLATES, HELMET_TEMPLATES, TERRAIN_DATA, CITY_NAMES, CONSUMABLE_TEMPLATES, SURNAMES, NAMES_MALE, BACKGROUNDS, BackgroundTemplate } from './constants.tsx';
import { WorldMap } from './components/WorldMap.tsx';
import { CombatView } from './components/CombatView.tsx';
import { SquadManagement } from './components/SquadManagement.tsx';
import { CityView } from './components/CityView.tsx';

// --- Character Generation ---
const generateName = (): string => {
    const surname = SURNAMES[Math.floor(Math.random() * SURNAMES.length)];
    const nameLen = Math.random() > 0.7 ? 2 : 1;
    let givenName = "";
    for(let i=0; i<nameLen; i++) {
        givenName += NAMES_MALE[Math.floor(Math.random() * NAMES_MALE.length)];
    }
    return surname + givenName;
};

const createMercenary = (id: string, fixedName?: string, forcedBgKey?: string, formationIndex: number | null = null): Character => {
  const bgKeys = Object.keys(BACKGROUNDS);
  let bgKey = forcedBgKey;
  if (!bgKey || !BACKGROUNDS[bgKey]) {
      bgKey = bgKeys[Math.floor(Math.random() * bgKeys.length)];
  }
  
  const bg: BackgroundTemplate = BACKGROUNDS[bgKey];
  const name = fixedName || generateName();
  const roll = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));
  const rollMod = (range: [number, number]) => roll(range[0], range[1]);

  const baseHp = roll(50, 70) + rollMod(bg.hpMod);
  const baseFat = roll(90, 110) + rollMod(bg.fatigueMod);
  const baseRes = roll(30, 50) + rollMod(bg.resolveMod);
  const baseInit = roll(100, 110) + rollMod(bg.initMod);
  const baseMSkill = roll(47, 57) + rollMod(bg.meleeSkillMod);
  const baseRSkill = roll(32, 42) + rollMod(bg.rangedSkillMod);
  const baseMDef = roll(0, 5) + rollMod(bg.defMod);
  const baseRDef = roll(0, 5) + rollMod(bg.defMod);

  // Generate Stars (0-3) weighted slightly by background strengths
  const genStars = (mod: [number, number]) => {
      const bonus = mod[1] > 5 ? 10 : 0; // If background gives big bonus, higher chance for stars
      const r = Math.random() * 100 + bonus;
      if (r > 95) return 3;
      if (r > 80) return 2;
      if (r > 50) return 1;
      return 0;
  };

  const stars = {
      meleeSkill: genStars(bg.meleeSkillMod),
      rangedSkill: genStars(bg.rangedSkillMod),
      meleeDefense: genStars(bg.defMod),
      rangedDefense: genStars(bg.defMod),
      resolve: genStars(bg.resolveMod),
      initiative: genStars(bg.initMod),
      hp: genStars(bg.hpMod),
      fatigue: genStars(bg.fatigueMod),
  };

  let weaponPool = WEAPON_TEMPLATES;
  let armorPool = ARMOR_TEMPLATES;
  let helmetPool = HELMET_TEMPLATES;
  
  // Gear Scaling based on background quality
  if (bg.gearQuality === 2) {
      weaponPool = WEAPON_TEMPLATES.filter(w => w.value > 300);
      armorPool = ARMOR_TEMPLATES.filter(a => a.value > 500);
      helmetPool = HELMET_TEMPLATES.filter(h => h.value > 300);
  } else if (bg.gearQuality === 1) {
      weaponPool = WEAPON_TEMPLATES.filter(w => w.value >= 100 && w.value <= 400);
      armorPool = ARMOR_TEMPLATES.filter(a => a.value >= 80 && a.value <= 600);
      helmetPool = HELMET_TEMPLATES.filter(h => h.value >= 100 && h.value <= 400);
  } else {
      weaponPool = WEAPON_TEMPLATES.filter(w => w.value < 200);
      armorPool = ARMOR_TEMPLATES.filter(a => a.value < 300);
      helmetPool = HELMET_TEMPLATES.filter(h => h.value < 150);
  }

  if (weaponPool.length === 0) weaponPool = WEAPON_TEMPLATES;
  if (armorPool.length === 0) armorPool = ARMOR_TEMPLATES;
  if (helmetPool.length === 0) helmetPool = HELMET_TEMPLATES;

  const weapon = weaponPool[Math.floor(Math.random() * weaponPool.length)];
  const armor = Math.random() > 0.2 ? armorPool[Math.floor(Math.random() * armorPool.length)] : null;
  const helmet = Math.random() > 0.4 ? helmetPool[Math.floor(Math.random() * helmetPool.length)] : null;
  
  const hasShield = Math.random() > 0.5 && (weapon.range === 1 && !weapon.name.includes("斧") && !weapon.name.includes("戟")); 
  const shield = hasShield ? SHIELD_TEMPLATES[Math.floor(Math.random() * SHIELD_TEMPLATES.length)] : null;
  
  const fatiguePenalty = (armor?.maxFatiguePenalty || 0) + (helmet?.maxFatiguePenalty || 0) + (shield?.fatigueCost || 0);
  const initiativePenalty = (armor?.weight || 0) + (helmet?.weight || 0) + (shield?.weight || 0) + (weapon.weight || 0);

  // Select Story
  const story = bg.stories && bg.stories.length > 0 ? bg.stories[Math.floor(Math.random() * bg.stories.length)] : bg.desc;

  return {
    id, name, background: bg.name, backgroundStory: story, level: 1, hp: baseHp, maxHp: baseHp, fatigue: 0,
    maxFatigue: Math.max(0, baseFat - fatiguePenalty), morale: MoraleStatus.STEADY,
    stats: { meleeSkill: baseMSkill, rangedSkill: baseRSkill, meleeDefense: baseMDef, rangedDefense: baseRDef, resolve: baseRes, initiative: Math.max(0, baseInit - initiativePenalty) },
    stars,
    traits: [], equipment: { mainHand: weapon, offHand: shield, armor: armor, helmet: helmet },
    salary: Math.floor((10 + roll(0, 5)) * bg.salaryMult),
    formationIndex // Assigned or null (Reserve)
  };
};

// ... (Rest of the file remains similar, just ensuring createMercenary is used correctly)

// --- Map Generation ---
const generateMap = (): { tiles: WorldTile[], cities: City[] } => {
  const tiles: WorldTile[] = [];
  
  // 1. Base Biomes
  for (let y = 0; y < MAP_SIZE; y++) {
    for (let x = 0; x < MAP_SIZE; x++) {
      let type: WorldTile['type'] = 'PLAINS';
      let height = 1;
      const ny = y / MAP_SIZE;
      
      // Biome Bands
      if (ny < 0.15) { type = 'SNOW'; height = 2; } 
      else if (ny > 0.85) { type = 'SWAMP'; height = 0; } 
      else if (ny > 0.6 && Math.random() > 0.8) { type = 'DESERT'; }
      else if (Math.random() > 0.97) { type = 'RUINS'; }

      tiles.push({ x, y, type, height });
    }
  }

  // 2. Mountains (Random Walks)
  for (let i = 0; i < 15; i++) {
      let mx = Math.floor(Math.random() * MAP_SIZE);
      let my = Math.floor(Math.random() * MAP_SIZE);
      for (let j = 0; j < 30; j++) {
          if (mx >= 0 && mx < MAP_SIZE && my >= 0 && my < MAP_SIZE) {
              const idx = my * MAP_SIZE + mx;
              tiles[idx].type = 'MOUNTAIN';
              tiles[idx].height = 3;
          }
          mx += Math.floor(Math.random() * 3) - 1;
          my += Math.floor(Math.random() * 3) - 1;
      }
  }

  // 3. Forests (Clusters)
  for (let i = 0; i < 40; i++) {
      let fx = Math.floor(Math.random() * MAP_SIZE);
      let fy = Math.floor(Math.random() * MAP_SIZE);
      const size = Math.floor(Math.random() * 5 + 2); 
      for (let y = -size; y <= size; y++) {
          for (let x = -size; x <= size; x++) {
              if (x*x + y*y <= size*size) {
                  const tx = fx + x;
                  const ty = fy + y;
                  if (tx >= 0 && tx < MAP_SIZE && ty >= 0 && ty < MAP_SIZE) {
                      const idx = ty * MAP_SIZE + tx;
                      if (tiles[idx].type === 'PLAINS') {
                          tiles[idx].type = 'FOREST';
                      }
                  }
              }
          }
      }
  }

  // 4. Cities
  const cities: City[] = [];
  const placedCities: {x:number, y:number}[] = [];
  for(let i=0; i<10; i++) {
      let attempts = 0;
      let cx = 0, cy = 0;
      let valid = false;
      while(attempts < 100 && !valid) {
          cx = Math.floor(Math.random() * (MAP_SIZE - 6)) + 3;
          cy = Math.floor(Math.random() * (MAP_SIZE - 6)) + 3;
          const idx = cy * MAP_SIZE + cx;
          if (tiles[idx].type !== 'MOUNTAIN' && tiles[idx].type !== 'SWAMP') {
               const tooClose = placedCities.some(pc => Math.hypot(pc.x - cx, pc.y - cy) < 8);
               if (!tooClose) valid = true;
          }
          attempts++;
      }
      
      if (valid) {
          const idx = cy * MAP_SIZE + cx;
          tiles[idx].type = 'CITY';
          placedCities.push({x: cx, y: cy});
          
          const recruits = Array.from({ length: 3 }).map((_, r) => createMercenary(`rec-${i}-${r}`));
          
          const market = [
              ...WEAPON_TEMPLATES.sort(() => 0.5 - Math.random()).slice(0, 3),
              ...ARMOR_TEMPLATES.sort(() => 0.5 - Math.random()).slice(0, 2),
              ...HELMET_TEMPLATES.sort(() => 0.5 - Math.random()).slice(0, 2)
          ];

          cities.push({
              id: `city-${i}`, name: CITY_NAMES[i] || `City-${i}`, x: cx, y: cy,
              type: i<3 ? 'CAPITAL' : 'TOWN', faction: '秦', state: 'NORMAL',
              market, recruits
          });
      }
  }

  // 5. Roads (Connect cities sequentially)
  for (let i = 0; i < placedCities.length - 1; i++) {
      let start = placedCities[i];
      let end = placedCities[i+1];
      let curr = { ...start };
      while (curr.x !== end.x || curr.y !== end.y) {
          if (curr.x < end.x) curr.x++;
          else if (curr.x > end.x) curr.x--;
          else if (curr.y < end.y) curr.y++;
          else if (curr.y > end.y) curr.y--;
          
          if (curr.x >= 0 && curr.x < MAP_SIZE && curr.y >= 0 && curr.y < MAP_SIZE) {
              const idx = curr.y * MAP_SIZE + curr.x;
              if (tiles[idx].type !== 'CITY') {
                  tiles[idx].type = 'ROAD';
              }
          }
      }
  }

  return { tiles, cities };
};

const generateEntities = (count: number, cities: City[]): WorldEntity[] => {
    const entities: WorldEntity[] = [];
    
    // Bandits (Spawn in wild, patrol home)
    for(let i=0; i<count; i++) {
        const x = Math.floor(Math.random() * MAP_SIZE);
        const y = Math.floor(Math.random() * MAP_SIZE);
        entities.push({
            id: `bandit-${i}-${Date.now()}`,
            name: Math.random() > 0.5 ? '山贼' : '逃兵',
            type: Math.random() > 0.5 ? 'BANDIT' : 'NOMAD',
            faction: 'HOSTILE',
            x, y,
            targetX: x, targetY: y,
            speed: 0.8 + Math.random() * 0.4,
            aiState: 'IDLE',
            homeX: x, homeY: y
        });
    }

    // Traders (Spawn in cities, travel to other cities)
    for(let i=0; i<3; i++) {
        const startCity = cities[i];
        const endCity = cities[(i + 1) % cities.length];
        entities.push({
            id: `trader-${i}`,
            name: '商队',
            type: 'TRADER',
            faction: 'NEUTRAL',
            x: startCity.x, y: startCity.y,
            targetX: endCity.x, targetY: endCity.y,
            speed: 0.7,
            aiState: 'TRAVEL',
            homeX: startCity.x, homeY: startCity.y
        });
    }

    // Army (Spawn in Capital, Patrol)
    const capital = cities.find(c => c.type === 'CAPITAL') || cities[0];
    entities.push({
        id: `army-0`,
        name: '秦军巡逻队',
        type: 'ARMY',
        faction: 'NEUTRAL',
        x: capital.x, y: capital.y,
        targetX: capital.x, targetY: capital.y,
        speed: 1.0,
        aiState: 'PATROL',
        homeX: capital.x, homeY: capital.y
    });

    return entities;
};

export const App: React.FC = () => {
  const [view, setView] = useState<GameView>('WORLD_MAP');
  const [mapData] = useState(generateMap());
  const tiles = mapData.tiles;
  const [cities, setCities] = useState<City[]>(mapData.cities);

  const [entities, setEntities] = useState<WorldEntity[]>(generateEntities(10, mapData.cities)); 
  const [timeScale, setTimeScale] = useState<number>(1); 
  const [chaseTargetId, setChaseTargetId] = useState<string | null>(null);
  const [preCombatEntity, setPreCombatEntity] = useState<WorldEntity | null>(null);

  const [party, setParty] = useState<Party>({
    x: mapData.cities[0].x, y: mapData.cities[0].y, 
    targetX: null, targetY: null, gold: 1200, food: 150,
    mercenaries: [
        createMercenary('1', '赵二', 'FARMER', 0), 
        createMercenary('2', '钱伍长', 'DESERTER', 1), 
        createMercenary('3', '孙游侠', 'HUNTER', 9) // Backline example
    ],
    inventory: [{ id: 'i1', name: '破旧皮甲', type: 'ARMOR', value: 50, weight: 10, durability: 20, maxDurability: 50, maxFatiguePenalty: 5, description: '多处缝补。' }],
    day: 1.0
  });

  const [combatState, setCombatState] = useState<CombatState | null>(null);
  const [currentCity, setCurrentCity] = useState<City | null>(null);
  const [nearbyCity, setNearbyCity] = useState<City | null>(null);
  const lastUpdateRef = useRef<number>(performance.now());

  const startCombat = useCallback((entity: WorldEntity) => {
    setTimeScale(0);
    setChaseTargetId(null);
    setPreCombatEntity(null);
    
    // Determine terrain
    const px = Math.floor(party.x);
    const py = Math.floor(party.y);
    const tile = tiles[py * MAP_SIZE + px];
    const terrainType = tile ? tile.type : 'PLAINS';

    const enemies: CombatUnit[] = Array.from({ length: 3 + Math.floor(Math.random()*3) }).map((_, i) => ({
      ...createMercenary(`e${i}`, undefined, entity.type === 'NOMAD' ? 'NOMAD' : 'BANDIT'),
      team: 'ENEMY', combatPos: { q: 3, r: i - 2 }, currentAP: 9, isDead: false, isShieldWall: false, isHalberdWall: false, movedThisTurn: false, hasWaited: false
    }));

    // Filter active mercenaries and assign Combat Positions based on FormationIndex
    // Formation Grid:
    // Front Row (0-8) -> q: -3, r: relative
    // Back Row (9-17) -> q: -4, r: relative
    
    const activeMercs = party.mercenaries.filter(m => m.formationIndex !== null && m.formationIndex !== undefined).sort((a,b) => (a.formationIndex!) - (b.formationIndex!));
    
    if (activeMercs.length === 0) {
        alert("你没有安排任何作战人员！(请在营地中布阵)");
        setView('CAMP');
        return;
    }

    const playerUnits: CombatUnit[] = activeMercs.map((m) => {
        const idx = m.formationIndex!;
        const isBackrow = idx >= 9;
        const rowPos = isBackrow ? idx - 9 : idx;
        
        // Calculate Q/R roughly centering around 0,0 relative to player side
        // Let's say center is rowPos 4.
        const rOffset = rowPos - 4; 
        const q = isBackrow ? -4 : -3;
        
        return {
          ...m, team: 'PLAYER', combatPos: { q: q, r: rOffset }, currentAP: 9, isDead: false, isShieldWall: false, isHalberdWall: false, movedThisTurn: false, hasWaited: false
        };
    });

    const allUnits = [...playerUnits, ...enemies];
    setCombatState({
      units: allUnits,
      turnOrder: allUnits.map(u => u.id).sort((a, b) => {
          const ua = allUnits.find(un => un.id === a)!;
          const ub = allUnits.find(un => un.id === b)!;
          return ub.stats.initiative - ua.stats.initiative;
      }),
      currentUnitIndex: 0, round: 1, combatLog: [`与 ${entity.name} 的战斗爆发！`],
      terrainType
    });
    setEntities(prev => prev.filter(e => e.id !== entity.id));
    setView('COMBAT');
  }, [party.mercenaries, party.x, party.y, tiles]);

  useEffect(() => {
    let animationFrameId: number;

    const loop = (time: number) => {
      const dt = (time - lastUpdateRef.current) / 1000;
      lastUpdateRef.current = time;

      if (view === 'WORLD_MAP' && timeScale > 0 && !preCombatEntity) {
        
        // --- Player Movement ---
        let currentTargetX = party.targetX;
        let currentTargetY = party.targetY;
        let isChasing = false;

        if (chaseTargetId) {
            const targetEntity = entities.find(e => e.id === chaseTargetId);
            if (targetEntity) {
                currentTargetX = targetEntity.x;
                currentTargetY = targetEntity.y;
                isChasing = true;
            } else {
                setChaseTargetId(null);
            }
        }

        let playerMoved = false;
        let nx = party.x;
        let ny = party.y;

        if (currentTargetX !== null && currentTargetY !== null) {
            const dx = currentTargetX - party.x;
            const dy = currentTargetY - party.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 0.05) {
                const moveSpeed = 1.5 * timeScale * (isChasing ? 1.2 : 1.0);
                const moveStep = moveSpeed * dt;
                nx = party.x + (dx / dist) * moveStep;
                ny = party.y + (dy / dist) * moveStep;
                playerMoved = true;
            } else {
                setParty(prev => ({ ...prev, targetX: null, targetY: null }));
            }
        }

        if (playerMoved) {
            setParty(prev => ({ ...prev, x: nx, y: ny, day: prev.day + 0.01 * timeScale }));
        }

        // --- Entity AI ---
        const updatedEntities = entities.map(ent => {
             const distToPlayer = Math.sqrt(Math.pow(ent.x - party.x, 2) + Math.pow(ent.y - party.y, 2));
             
             // AI State Transitions
             if (ent.type === 'BANDIT' || ent.type === 'NOMAD') {
                 if (distToPlayer < 4) { // Sight radius
                     ent.aiState = 'CHASE';
                     ent.targetX = party.x;
                     ent.targetY = party.y;
                 } else if (ent.aiState === 'CHASE') {
                     // Lost sight
                     ent.aiState = 'PATROL';
                     ent.targetX = ent.homeX;
                     ent.targetY = ent.homeY;
                 }
                 
                 // Patrol logic
                 if (ent.aiState === 'IDLE' || ent.aiState === 'PATROL') {
                     if (!ent.targetX || (Math.abs(ent.x - ent.targetX) < 0.1 && Math.abs(ent.y - ent.targetY) < 0.1)) {
                         // Pick random point near home
                         const radius = 5;
                         ent.targetX = Math.max(0, Math.min(MAP_SIZE, ent.homeX + (Math.random() * radius * 2 - radius)));
                         ent.targetY = Math.max(0, Math.min(MAP_SIZE, ent.homeY + (Math.random() * radius * 2 - radius)));
                         ent.aiState = 'PATROL';
                     }
                 }
             } else if (ent.type === 'TRADER') {
                 // Move to target, then pick new target
                 if (!ent.targetX || (Math.abs(ent.x - ent.targetX) < 0.1 && Math.abs(ent.y - ent.targetY) < 0.1)) {
                     const randomCity = cities[Math.floor(Math.random() * cities.length)];
                     ent.targetX = randomCity.x;
                     ent.targetY = randomCity.y;
                 }
             } else if (ent.type === 'ARMY') {
                  // Patrol strictly near home
                  if (!ent.targetX || (Math.abs(ent.x - ent.targetX) < 0.1 && Math.abs(ent.y - ent.targetY) < 0.1)) {
                         const radius = 8;
                         ent.targetX = Math.max(0, Math.min(MAP_SIZE, ent.homeX + (Math.random() * radius * 2 - radius)));
                         ent.targetY = Math.max(0, Math.min(MAP_SIZE, ent.homeY + (Math.random() * radius * 2 - radius)));
                  }
             }

             // Execute Movement
             if (ent.targetX !== null && ent.targetY !== null) {
                 const edx = ent.targetX - ent.x;
                 const edy = ent.targetY - ent.y;
                 const edist = Math.sqrt(edx*edx + edy*edy);
                 if (edist > 0.1) {
                     const step = ent.speed * dt * timeScale;
                     return { ...ent, x: ent.x + (edx/edist)*step, y: ent.y + (edy/edist)*step };
                 }
             }
             return ent;
        });
        setEntities(updatedEntities);
        
        // --- Collision Check ---
        const collidedEntity = updatedEntities.find(e => {
            const dist = Math.sqrt(Math.pow(e.x - nx, 2) + Math.pow(e.y - ny, 2));
            return dist < 0.6;
        });

        if (collidedEntity) {
             if (collidedEntity.faction === 'HOSTILE') {
                 setTimeScale(0);
                 if (chaseTargetId === collidedEntity.id) {
                     setPreCombatEntity(collidedEntity); 
                 } else {
                     startCombat(collidedEntity); // Ambush
                 }
             }
        }
      }
      
      const closeCity = cities.find(c => Math.sqrt(Math.pow(c.x - party.x, 2) + Math.pow(c.y - party.y, 2)) < 1.0);
      setNearbyCity(closeCity || null);

      animationFrameId = requestAnimationFrame(loop);
    };

    animationFrameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [view, timeScale, tiles, startCombat, entities, cities, party.x, party.y, party.day, chaseTargetId, preCombatEntity]);

  const endCombat = (victory: boolean, survivors: CombatUnit[]) => {
    // Merge survivors back into party.mercenaries
    // We need to keep the ones who didn't fight (Reserves) and update the ones who did.
    
    // 1. Identify dead IDs
    const deadIds = survivors.filter(u => u.isDead).map(u => u.id);
    
    // 2. Update stats for survivors
    // We need to map CombatUnit back to Character (remove combat-specific props)
    // Actually, createMercenary returns Character, CombatUnit extends it.
    // We can just update HP/Fatigue/Level from survivors to main party list.
    
    setParty(prev => {
        const newMercs = prev.mercenaries.map(m => {
             const combatVer = survivors.find(s => s.id === m.id);
             if (combatVer) {
                 if (combatVer.isDead) return null; // Will filter later
                 return { ...m, hp: combatVer.hp, fatigue: combatVer.fatigue, equipment: combatVer.equipment };
             }
             return m; // Reserve or didn't fight
        }).filter(Boolean) as Character[];

        if (victory) {
            return {
                ...prev,
                mercenaries: newMercs,
                gold: prev.gold + Math.floor(Math.random() * 300),
            };
        } else {
             return {
                ...prev,
                mercenaries: newMercs,
                morale: MoraleStatus.WAVERING 
            };
        }
    });

    if (!victory && survivors.every(s => s.isDead)) {
         alert("全军覆没。");
         window.location.reload();
    }
    
    setView('WORLD_MAP');
    setCombatState(null);
    setTimeScale(1); // Resume after combat
  };

  const handleRetreatFromMap = () => {
      setPreCombatEntity(null);
      setChaseTargetId(null);
      setParty(prev => ({ ...prev, targetX: null, targetY: null })); 
      setTimeScale(1); // Resume
  };

  const setTarget = (x: number, y: number) => {
    const clickedEntity = entities.find(e => Math.sqrt(Math.pow(e.x - x, 2) + Math.pow(e.y - y, 2)) < 1.0);
    if (clickedEntity) {
        if (clickedEntity.faction === 'HOSTILE') {
             setChaseTargetId(clickedEntity.id);
        } else {
             // Friendly interaction? For now just follow
             setChaseTargetId(clickedEntity.id);
        }
    } else {
        setChaseTargetId(null);
        setParty(prev => ({ ...prev, targetX: x + 0.5, targetY: y + 0.5 }));
    }
    if (timeScale === 0) setTimeScale(1);
  };

  return (
    <div className="w-screen h-screen flex flex-col bg-[#050505] text-slate-200 overflow-hidden font-serif">
      {/* HUD & Nav */}
      {view !== 'COMBAT' && (
          <nav className="h-16 bg-black border-b border-amber-900/40 flex items-center justify-between px-6 z-50 shrink-0">
             <div className="flex gap-4 items-center">
                 <div className="flex gap-2">
                    <button onClick={() => setTimeScale(0)} className={`px-4 py-1 border rounded transition-colors ${timeScale===0 ? 'bg-amber-900/50 border-amber-500 text-white' : 'border-slate-700 text-slate-500 hover:text-slate-300'}`}>⏸</button>
                    <button onClick={() => setTimeScale(1)} className={`px-4 py-1 border rounded transition-colors ${timeScale===1 ? 'bg-amber-900/50 border-amber-500 text-white' : 'border-slate-700 text-slate-500 hover:text-slate-300'}`}>▶</button>
                    <button onClick={() => setTimeScale(3)} className={`px-4 py-1 border rounded transition-colors ${timeScale===3 ? 'bg-amber-900/50 border-amber-500 text-white' : 'border-slate-700 text-slate-500 hover:text-slate-300'}`}>⏩</button>
                 </div>
                 <div className="text-xs text-slate-500 ml-4">
                     {timeScale === 0 ? '暂停 (PAUSED)' : timeScale === 1 ? '正常速度 (1x)' : '快速行军 (3x)'}
                 </div>
             </div>
             <div className="flex gap-6 text-sm font-mono items-center">
                 <div className="flex items-center gap-2"><span className="text-amber-500">💰 {party.gold}</span></div>
                 <div className="flex items-center gap-2"><span className="text-emerald-500">🌾 {Math.floor(party.food)}</span></div>
                 <button onClick={() => { setView('CAMP'); setTimeScale(0); }} className="px-4 py-1 bg-slate-800 border border-slate-600 hover:border-amber-500 text-xs tracking-widest uppercase">
                    营地 (CAMP)
                 </button>
             </div>
          </nav>
      )}

      <main className="flex-1 relative overflow-hidden bg-[#0a0a0a]">
        {view === 'WORLD_MAP' && (
            <>
                <WorldMap tiles={tiles} party={party} entities={entities} onSetTarget={setTarget} />
                
                {/* Pre-Combat Dialog */}
                {preCombatEntity && (
                    <div className="absolute inset-0 z-50 bg-black/80 flex items-center justify-center">
                        <div className="bg-[#1a1a1a] border border-amber-600 p-8 max-w-lg w-full shadow-2xl">
                            <h2 className="text-3xl font-bold text-amber-500 mb-4">遭遇 {preCombatEntity.name}</h2>
                            <p className="text-slate-400 mb-8">你的队伍追上了目标。现在的距离足够发动突袭，但如果要撤退，现在是最后的机会。</p>
                            <div className="flex gap-4">
                                <button 
                                    onClick={() => startCombat(preCombatEntity)}
                                    className="flex-1 py-4 bg-red-900/50 border border-red-600 hover:bg-red-800 text-red-100 font-bold"
                                >
                                    全军突击 (Attack)
                                </button>
                                <button 
                                    onClick={handleRetreatFromMap}
                                    className="flex-1 py-4 bg-slate-800 border border-slate-600 hover:bg-slate-700 text-slate-300 font-bold"
                                >
                                    撤退 (Retreat)
                                </button>
                            </div>
                        </div>
                    </div>
                )}
                
                {/* Enter City Button */}
                {nearbyCity && !preCombatEntity && (
                     <div className="absolute bottom-12 left-1/2 -translate-x-1/2 z-40 animate-bounce">
                         <button 
                            onClick={() => { setCurrentCity(nearbyCity); setView('CITY'); setTimeScale(0); }} 
                            className="px-8 py-3 bg-amber-700 hover:bg-amber-600 text-white font-bold rounded shadow-lg border-2 border-amber-400 flex flex-col items-center"
                         >
                             <span>进入 {nearbyCity.name}</span>
                             <span className="text-[10px] uppercase tracking-widest mt-1">入城</span>
                         </button>
                     </div>
                 )}
            </>
        )}
        {view === 'COMBAT' && combatState && <CombatView initialState={combatState} onCombatEnd={endCombat} />}
        {view === 'CAMP' && <SquadManagement party={party} onUpdateParty={setParty} onClose={() => { setView('WORLD_MAP'); setTimeScale(1); }} />}
        {view === 'CITY' && currentCity && <CityView city={currentCity} party={party} onLeave={() => { setView('WORLD_MAP'); setTimeScale(1); }} onUpdateParty={setParty} onUpdateCity={ (c) => { setCities(prev => prev.map(city => city.id === c.id ? c : city)); setCurrentCity(c); }} />}
      </main>
    </div>
  );
};
