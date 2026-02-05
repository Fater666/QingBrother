
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { GameView, Party, WorldTile, CombatState, MoraleStatus, Character, CombatUnit, WorldEntity, City, CityFacility, Quest } from './types.ts';
import { MAP_SIZE, WEAPON_TEMPLATES, ARMOR_TEMPLATES, SHIELD_TEMPLATES, HELMET_TEMPLATES, TERRAIN_DATA, CITY_NAMES, SURNAMES, NAMES_MALE, BACKGROUNDS, BackgroundTemplate, QUEST_FLAVOR_TEXTS, VISION_RADIUS } from './constants.tsx';
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

  const genStars = (mod: [number, number]) => {
      const r = Math.random() * 100;
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

  let weaponPool = WEAPON_TEMPLATES.filter(w => w.value < 400);
  const weapon = weaponPool[Math.floor(Math.random() * weaponPool.length)];
  const armor = Math.random() > 0.4 ? ARMOR_TEMPLATES[Math.floor(Math.random() * 2)] : null;
  const helmet = Math.random() > 0.6 ? HELMET_TEMPLATES[Math.floor(Math.random() * 2)] : null;

  return {
    id, name, background: bg.name, backgroundStory: bg.desc, level: 1, xp: 0, hp: baseHp, maxHp: baseHp, fatigue: 0,
    maxFatigue: baseFat, morale: MoraleStatus.STEADY,
    stats: { meleeSkill: baseMSkill, rangedSkill: baseRSkill, meleeDefense: baseMDef, rangedDefense: baseRDef, resolve: baseRes, initiative: baseInit },
    stars,
    traits: [], perks: [], perkPoints: 0,
    equipment: { mainHand: weapon, offHand: null, armor, helmet, ammo: null, accessory: null },
    bag: [null, null, null, null], salary: Math.floor(10 * bg.salaryMult), formationIndex
  };
};

const generateMap = (): { tiles: WorldTile[], cities: City[] } => {
  const tiles: WorldTile[] = [];
  for (let y = 0; y < MAP_SIZE; y++) {
    for (let x = 0; x < MAP_SIZE; x++) {
      let type: WorldTile['type'] = 'PLAINS';
      if (Math.random() > 0.96) type = 'MOUNTAIN';
      else if (Math.random() > 0.92) type = 'FOREST';
      tiles.push({ x, y, type, height: 1, explored: false });
    }
  }

  const cities: City[] = [];
  const placedCities: {x:number, y:number}[] = [];
  for(let i=0; i<8; i++) {
      let cx = 0, cy = 0, valid = false;
      while(!valid) {
          cx = Math.floor(Math.random() * (MAP_SIZE - 10)) + 5;
          cy = Math.floor(Math.random() * (MAP_SIZE - 10)) + 5;
          if (!placedCities.some(pc => Math.hypot(pc.x - cx, pc.y - cy) < 14)) valid = true;
      }
      const idx = cy * MAP_SIZE + cx;
      tiles[idx].type = 'CITY';
      placedCities.push({x: cx, y: cy});

      // 初始化城市数据
      const market = [
          ...WEAPON_TEMPLATES.sort(() => 0.5 - Math.random()).slice(0, 4),
          ...ARMOR_TEMPLATES.sort(() => 0.5 - Math.random()).slice(0, 3)
      ];
      const recruits = Array.from({length: 4}).map((_, j) => createMercenary(`rec-${i}-${j}`));
      const quests: Quest[] = [{
          id: `q-${i}-1`, type: 'HUNT', title: '剿灭山贼', description: '附近山林有一伙流寇作乱，请前往清剿。', difficulty: 1, rewardGold: 300, sourceCityId: `city-${i}`, isCompleted: false, daysLeft: 7
      }];

      cities.push({ 
          id: `city-${i}`, name: CITY_NAMES[i], x: cx, y: cy, type: i === 0 ? 'CAPITAL' : 'TOWN', faction: '秦', state: 'NORMAL', 
          facilities: ['MARKET', 'RECRUIT', 'TAVERN', 'TEMPLE'], market, recruits, quests 
      });
  }

  // 生成官道连接
  for (let i = 0; i < placedCities.length; i++) {
      let start = placedCities[i], end = placedCities[(i + 1) % placedCities.length], curr = { ...start };
      while (curr.x !== end.x || curr.y !== end.y) {
          if (curr.x < end.x) curr.x++; else if (curr.x > end.x) curr.x--;
          else if (curr.y < end.y) curr.y++; else if (curr.y > end.y) curr.y--;
          const idx = curr.y * MAP_SIZE + curr.x;
          if (tiles[idx].type === 'PLAINS') tiles[idx].type = 'ROAD';
      }
  }
  return { tiles, cities };
};

const generateEntities = (cities: City[]): WorldEntity[] => {
    const ents: WorldEntity[] = [];
    for(let i=0; i<20; i++) {
        const x = Math.floor(Math.random() * MAP_SIZE), y = Math.floor(Math.random() * MAP_SIZE);
        ents.push({ 
            id: `ent-${i}`, name: i % 2 === 0 ? '流寇' : '乱军', type: 'BANDIT', faction: 'HOSTILE', 
            x, y, targetX: x, targetY: y, speed: 0.7 + Math.random() * 0.3, aiState: 'IDLE', homeX: x, homeY: y 
        });
    }
    // 添加一些商队
    cities.forEach((city, idx) => {
        const target = cities[(idx + 1) % cities.length];
        ents.push({
            id: `trader-${idx}`, name: '商队', type: 'TRADER', faction: 'NEUTRAL', x: city.x, y: city.y, targetX: target.x, targetY: target.y, speed: 0.5, aiState: 'TRAVEL', homeX: city.x, homeY: city.y
        });
    });
    return ents;
};

export const App: React.FC = () => {
  const [view, setView] = useState<GameView>('WORLD_MAP');
  const [mapData] = useState(() => generateMap());
  const [tiles, setTiles] = useState<WorldTile[]>(mapData.tiles);
  const [cities, setCities] = useState<City[]>(mapData.cities);
  const [entities, setEntities] = useState<WorldEntity[]>(() => generateEntities(mapData.cities));
  const [timeScale, setTimeScale] = useState<number>(1); 
  const [preCombatEntity, setPreCombatEntity] = useState<WorldEntity | null>(null);

  const [party, setParty] = useState<Party>({
    x: mapData.cities[0].x, y: mapData.cities[0].y, targetX: null, targetY: null, gold: 1200, food: 150,
    mercenaries: [createMercenary('1', '赵二', 'FARMER', 0), createMercenary('2', '钱五长', 'DESERTER', 1), createMercenary('3', '孙游侠', 'HUNTER', 9)],
    inventory: [], day: 1.0, activeQuest: null
  });

  const [combatState, setCombatState] = useState<CombatState | null>(null);
  const [currentCity, setCurrentCity] = useState<City | null>(null);
  const lastUpdateRef = useRef<number>(performance.now());

  // 战争迷雾更新
  useEffect(() => {
      const px = Math.floor(party.x), py = Math.floor(party.y);
      setTiles(prev => {
          let hasChange = false;
          const newTiles = [...prev];
          for (let y = py - VISION_RADIUS; y <= py + VISION_RADIUS; y++) {
              for (let x = px - VISION_RADIUS; x <= px + VISION_RADIUS; x++) {
                  if (x >= 0 && x < MAP_SIZE && y >= 0 && y < MAP_SIZE) {
                      const idx = y * MAP_SIZE + x;
                      if (!newTiles[idx].explored && Math.hypot(x-px, y-py) <= VISION_RADIUS) {
                          newTiles[idx] = { ...newTiles[idx], explored: true };
                          hasChange = true;
                      }
                  }
              }
          }
          return hasChange ? newTiles : prev;
      });
  }, [party.x, party.y]);

  const startCombat = useCallback((entity: WorldEntity) => {
    setTimeScale(0);
    const enemies: CombatUnit[] = Array.from({ length: 4 }).map((_, i) => ({
      ...createMercenary(`e${i}`, '叛卒', 'BANDIT'),
      team: 'ENEMY', combatPos: { q: 3, r: i - 2 }, currentAP: 9, isDead: false, isShieldWall: false, isHalberdWall: false, movedThisTurn: false, hasWaited: false, freeSwapUsed: false
    }));
    const playerUnits: CombatUnit[] = party.mercenaries.filter(m => m.formationIndex !== null).map(m => {
        const q = m.formationIndex! >= 9 ? -4 : -3, r = (m.formationIndex! % 9) - 4;
        return { ...m, team: 'PLAYER', combatPos: { q, r }, currentAP: 9, isDead: false, isShieldWall: false, isHalberdWall: false, movedThisTurn: false, hasWaited: false, freeSwapUsed: false };
    });
    const allUnits = [...playerUnits, ...enemies];
    setCombatState({
      units: allUnits, turnOrder: allUnits.map(u => u.id).sort(() => Math.random() - 0.5),
      currentUnitIndex: 0, round: 1, combatLog: [`与 ${entity.name} 激战开始！`], terrainType: 'PLAINS'
    });
    setEntities(prev => prev.filter(e => e.id !== entity.id));
    setView('COMBAT');
  }, [party.mercenaries]);

  // 主循环处理 AI 与位移
  useEffect(() => {
    let anim: number;
    const loop = (time: number) => {
      const dt = (time - lastUpdateRef.current) / 1000;
      lastUpdateRef.current = time;
      if (view === 'WORLD_MAP' && timeScale > 0) {
        // 玩家移动
        if (party.targetX !== null && party.targetY !== null) {
            const dx = party.targetX - party.x, dy = party.targetY - party.y, dist = Math.hypot(dx, dy);
            if (dist > 0.1) {
                const step = 1.8 * timeScale * dt;
                setParty(p => ({ ...p, x: p.x + (dx/dist)*step, y: p.y + (dy/dist)*step, day: p.day + 0.012 * timeScale }));
            } else {
                setParty(p => ({ ...p, targetX: null, targetY: null }));
                const city = cities.find(c => Math.hypot(c.x - party.x, c.y - party.y) < 0.6);
                if (city) { setCurrentCity(city); setView('CITY'); setTimeScale(0); }
            }
        }
        
        // 实体移动逻辑
        setEntities(prev => prev.map(ent => {
            const distToPlayer = Math.hypot(ent.x - party.x, ent.y - party.y);
            let nent = { ...ent };
            
            // 追击逻辑
            if (ent.faction === 'HOSTILE' && distToPlayer < 4) {
                nent.aiState = 'CHASE'; nent.targetX = party.x; nent.targetY = party.y;
            } else if (nent.aiState === 'CHASE' && distToPlayer > 8) {
                nent.aiState = 'IDLE'; nent.targetX = nent.homeX; nent.targetY = nent.homeY;
            }

            if (nent.targetX !== null && nent.targetY !== null) {
                const edx = nent.targetX - nent.x, edy = nent.targetY - nent.y, edist = Math.hypot(edx, edy);
                if (edist > 0.1) {
                    const estep = nent.speed * dt * timeScale;
                    nent.x += (edx/edist)*estep; nent.y += (edy/edist)*estep;
                }
            }
            
            // 碰撞检测
            if (distToPlayer < 0.6 && nent.faction === 'HOSTILE' && !preCombatEntity) {
                setPreCombatEntity(nent); setTimeScale(0);
            }
            return nent;
        }));
      }
      anim = requestAnimationFrame(loop);
    };
    anim = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(anim);
  }, [view, timeScale, party, cities, preCombatEntity]);

  return (
    <div className="w-screen h-screen flex flex-col bg-black text-slate-200 overflow-hidden font-serif">
      {view !== 'COMBAT' && (
          <nav className="h-14 bg-black border-b border-amber-900/40 flex items-center justify-between px-6 z-50">
             <div className="flex gap-4">
                <button onClick={() => setTimeScale(0)} className={`px-3 py-1 bg-slate-800 border ${timeScale === 0 ? 'border-amber-500' : 'border-slate-700'}`}>⏸</button>
                <button onClick={() => setTimeScale(1)} className={`px-3 py-1 bg-slate-800 border ${timeScale === 1 ? 'border-amber-500' : 'border-slate-700'}`}>▶</button>
                <button onClick={() => setTimeScale(3)} className={`px-3 py-1 bg-slate-800 border ${timeScale === 3 ? 'border-amber-500' : 'border-slate-700'}`}>⏩</button>
             </div>
             <div className="flex gap-6 items-center">
                 <div className="text-amber-500 font-bold tracking-widest font-mono">💰 {party.gold}</div>
                 <button onClick={() => { setView('CAMP'); setTimeScale(0); }} className="px-6 py-1 bg-slate-900 border border-amber-800 uppercase text-xs hover:border-amber-500 transition-all">战团营地</button>
             </div>
          </nav>
      )}
      <main className="flex-1 relative">
        {view === 'WORLD_MAP' && <WorldMap tiles={tiles} party={party} entities={entities} onSetTarget={(x,y) => setParty(p => ({...p, targetX: x, targetY: y}))} />}
        {view === 'COMBAT' && combatState && <CombatView initialState={combatState} onCombatEnd={(v,s) => { 
            setParty(p => ({ ...p, mercenaries: s.map(u => u as Character) })); setView('WORLD_MAP'); setTimeScale(1); 
        }} />}
        {view === 'CAMP' && <SquadManagement party={party} onUpdateParty={setParty} onClose={() => { setView('WORLD_MAP'); setTimeScale(1); }} />}
        {view === 'CITY' && currentCity && <CityView city={currentCity} party={party} onLeave={() => { setView('WORLD_MAP'); setTimeScale(1); }} onUpdateParty={setParty} onUpdateCity={(c) => setCities(prev => prev.map(ct => ct.id === c.id ? c : ct))} onAcceptQuest={(q) => setParty(p => ({...p, activeQuest: q}))} />}
        
        {preCombatEntity && (
            <div className="absolute inset-0 bg-black/85 flex items-center justify-center z-[100]">
                <div className="bg-[#111] p-10 border-2 border-red-900 text-center shadow-[0_0_50px_rgba(220,38,38,0.2)]">
                    <h2 className="text-3xl font-bold text-red-600 mb-8 tracking-widest uppercase">遭 遇 敌 袭</h2>
                    <p className="text-slate-400 mb-10 italic">一支 {preCombatEntity.name} 挡住了你们的去路...</p>
                    <div className="flex gap-6 justify-center">
                        <button onClick={() => { startCombat(preCombatEntity); setPreCombatEntity(null); }} className="px-10 py-3 bg-red-950 border border-red-600 text-red-400 hover:bg-red-800 hover:text-white font-bold tracking-[0.5em] transition-all">迎战</button>
                        <button onClick={() => { setPreCombatEntity(null); setTimeScale(1); }} className="px-10 py-3 bg-slate-900 border border-slate-700 text-slate-400 hover:text-white font-bold tracking-[0.5em] transition-all">撤退</button>
                    </div>
                </div>
            </div>
        )}
      </main>
    </div>
  );
};
