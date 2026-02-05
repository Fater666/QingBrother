
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { GameView, Party, WorldTile, CombatState, MoraleStatus, Character, CombatUnit, WorldEntity, City, CityFacility, Quest, WorldAIType } from './types.ts';
import { MAP_SIZE, WEAPON_TEMPLATES, ARMOR_TEMPLATES, SHIELD_TEMPLATES, HELMET_TEMPLATES, TERRAIN_DATA, CITY_NAMES, SURNAMES, NAMES_MALE, BACKGROUNDS, BackgroundTemplate, QUEST_FLAVOR_TEXTS, VISION_RADIUS } from './constants.tsx';
import { WorldMap } from './components/WorldMap.tsx';
import { CombatView } from './components/CombatView.tsx';
import { SquadManagement } from './components/SquadManagement.tsx';
import { CityView } from './components/CityView.tsx';
import { updateWorldEntityAI, generateRoadPatrolPoints, generateCityPatrolPoints } from './services/worldMapAI.ts';

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

const generateEntities = (cities: City[], tiles: WorldTile[]): WorldEntity[] => {
    const ents: WorldEntity[] = [];
    
    // 生成土匪 - 倾向于在道路附近生成
    for(let i = 0; i < 12; i++) {
        let x = Math.floor(Math.random() * MAP_SIZE);
        let y = Math.floor(Math.random() * MAP_SIZE);
        
        // 尝试在道路附近生成
        for (let attempt = 0; attempt < 10; attempt++) {
            const tx = Math.floor(Math.random() * MAP_SIZE);
            const ty = Math.floor(Math.random() * MAP_SIZE);
            const tile = tiles[ty * MAP_SIZE + tx];
            if (tile && (tile.type === 'ROAD' || tile.type === 'PLAINS')) {
                x = tx;
                y = ty;
                break;
            }
        }
        
        const names = ['流寇', '山贼', '劫匪', '盗贼', '马贼'];
        // 为土匪生成道路巡逻点
        const patrolPoints = generateRoadPatrolPoints(x, y, tiles, 3, 12);
        
        ents.push({ 
            id: `bandit-${i}`, 
            name: names[Math.floor(Math.random() * names.length)], 
            type: 'BANDIT', 
            faction: 'HOSTILE', 
            x, y, 
            targetX: null, 
            targetY: null, 
            speed: 0.7 + Math.random() * 0.3, 
            aiState: 'PATROL', 
            homeX: x, 
            homeY: y,
            worldAIType: 'BANDIT',
            alertRadius: 4 + Math.random() * 2,   // 4-6格发现玩家
            chaseRadius: 10 + Math.random() * 4,  // 10-14格放弃追击
            strength: 3 + Math.floor(Math.random() * 3), // 队伍实力 3-5
            fleeThreshold: 0.2 + Math.random() * 0.1,
            patrolPoints,
            patrolIndex: 0
        });
    }
    
    // 生成野兽 - 在森林和山地生成
    for(let i = 0; i < 8; i++) {
        let x = Math.floor(Math.random() * MAP_SIZE);
        let y = Math.floor(Math.random() * MAP_SIZE);
        
        // 尝试在森林或山地生成
        for (let attempt = 0; attempt < 20; attempt++) {
            const tx = Math.floor(Math.random() * MAP_SIZE);
            const ty = Math.floor(Math.random() * MAP_SIZE);
            const tile = tiles[ty * MAP_SIZE + tx];
            if (tile && (tile.type === 'FOREST' || tile.type === 'MOUNTAIN')) {
                x = tx;
                y = ty;
                break;
            }
        }
        
        const beastNames = ['野狼群', '猛虎', '野猪', '熊'];
        ents.push({ 
            id: `beast-${i}`, 
            name: beastNames[Math.floor(Math.random() * beastNames.length)], 
            type: 'BEAST', 
            faction: 'HOSTILE', 
            x, y, 
            targetX: null, 
            targetY: null, 
            speed: 0.9 + Math.random() * 0.3,  // 野兽速度较快
            aiState: 'WANDER', 
            homeX: x, 
            homeY: y,
            worldAIType: 'BEAST',
            alertRadius: 3,                    // 较小的警戒范围
            chaseRadius: 6,                    // 不会追太远
            territoryRadius: 4 + Math.random() * 3,  // 领地范围 4-7格
            wanderCooldown: Math.random() * 5
        });
    }
    
    // 生成乱军 - 在城市附近生成，会追击土匪
    for(let i = 0; i < 4; i++) {
        const nearCity = cities[Math.floor(Math.random() * cities.length)];
        const offsetX = (Math.random() - 0.5) * 10;
        const offsetY = (Math.random() - 0.5) * 10;
        const x = Math.max(1, Math.min(MAP_SIZE - 2, nearCity.x + offsetX));
        const y = Math.max(1, Math.min(MAP_SIZE - 2, nearCity.y + offsetY));
        
        // 为军队生成城市周边巡逻点
        const armyPatrolPoints = generateCityPatrolPoints(nearCity.x, nearCity.y, 6, 4);
        
        ents.push({ 
            id: `army-${i}`, 
            name: '巡防军', 
            type: 'ARMY', 
            faction: 'NEUTRAL',  // 军队对玩家中立
            x, y, 
            targetX: null, 
            targetY: null, 
            speed: 0.6 + Math.random() * 0.2, 
            aiState: 'PATROL', 
            homeX: nearCity.x, 
            homeY: nearCity.y,
            worldAIType: 'ARMY',
            alertRadius: 6,    // 较大的警戒范围
            chaseRadius: 12,   // 会追击较远
            linkedCityId: nearCity.id,
            strength: 5 + Math.floor(Math.random() * 3),
            patrolPoints: armyPatrolPoints,
            patrolIndex: 0
        });
    }
    
    // 生成游牧民 - 随机分布
    for(let i = 0; i < 4; i++) {
        const x = Math.floor(Math.random() * MAP_SIZE);
        const y = Math.floor(Math.random() * MAP_SIZE);
        const isHostile = Math.random() > 0.5;  // 50%概率敌对
        
        ents.push({ 
            id: `nomad-${i}`, 
            name: isHostile ? '胡人劫掠者' : '胡人游骑', 
            type: 'NOMAD', 
            faction: isHostile ? 'HOSTILE' : 'NEUTRAL', 
            x, y, 
            targetX: null, 
            targetY: null, 
            speed: 1.0 + Math.random() * 0.3,  // 游牧民速度最快
            aiState: 'WANDER', 
            homeX: x, 
            homeY: y,
            worldAIType: 'NOMAD',
            alertRadius: 5,
            chaseRadius: 8,
            wanderCooldown: Math.random() * 5,
            strength: 4 + Math.floor(Math.random() * 2)
        });
    }
    
    // 生成商队 - 在城市间往返
    cities.forEach((city, idx) => {
        const targetCity = cities[(idx + 1) % cities.length];
        ents.push({
            id: `trader-${idx}`, 
            name: '商队', 
            type: 'TRADER', 
            faction: 'NEUTRAL', 
            x: city.x, 
            y: city.y, 
            targetX: targetCity.x, 
            targetY: targetCity.y, 
            speed: 0.5, 
            aiState: 'TRAVEL', 
            homeX: city.x, 
            homeY: city.y,
            worldAIType: 'TRADER',
            alertRadius: 5,
            chaseRadius: 0,  // 商队不会追击
            linkedCityId: city.id,
            destinationCityId: targetCity.id,
            wanderCooldown: 5 + Math.random() * 5
        });
    });
    
    return ents;
};

export const App: React.FC = () => {
  const [view, setView] = useState<GameView>('WORLD_MAP');
  const [mapData] = useState(() => generateMap());
  const [tiles, setTiles] = useState<WorldTile[]>(mapData.tiles);
  const [cities, setCities] = useState<City[]>(mapData.cities);
  const [entities, setEntities] = useState<WorldEntity[]>(() => generateEntities(mapData.cities, mapData.tiles));
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

  // --- SAVE & LOAD SYSTEM ---
  const saveGame = useCallback(() => {
    const saveData = {
        tiles,
        cities,
        entities,
        party,
        day: party.day,
        view: view === 'COMBAT' ? 'WORLD_MAP' : view // 不保存战斗状态，退回地图
    };
    try {
        localStorage.setItem('zhanguo_with_five_save', JSON.stringify(saveData));
        alert("战绩已刻录简牍（存档成功）。");
    } catch (e) {
        alert("简牍告罄，无法刻录（存档失败）。");
    }
  }, [tiles, cities, entities, party, view]);

  const loadGame = useCallback(() => {
    const raw = localStorage.getItem('zhanguo_with_five_save');
    if (!raw) {
        alert("未发现往昔简牍（无存档）。");
        return;
    }
    try {
        const data = JSON.parse(raw);
        setTiles(data.tiles);
        setCities(data.cities);
        setEntities(data.entities);
        setParty(data.party);
        setView(data.view);
        alert("往昔历历在目（读档成功）。");
    } catch (e) {
        alert("简牍残破，无法辨识（读档失败）。");
    }
  }, []);

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
    
    // 根据实体类型生成不同的敌人配置
    type AIType = 'BANDIT' | 'BEAST' | 'ARMY' | 'ARCHER' | 'BERSERKER';
    interface EnemyConfig {
      count: number;
      compositions: { name: string; bg: string; aiType: AIType }[];
    }
    
    const enemyConfigs: Record<string, EnemyConfig> = {
      'BANDIT': {
        count: 4,
        compositions: [
          { name: '山贼', bg: 'BANDIT', aiType: 'BANDIT' },
          { name: '贼弓手', bg: 'HUNTER', aiType: 'ARCHER' },
          { name: '山贼', bg: 'BANDIT', aiType: 'BANDIT' },
          { name: '悍匪', bg: 'DESERTER', aiType: 'BERSERKER' },
        ]
      },
      'ARMY': {
        count: 5,
        compositions: [
          { name: '叛卒', bg: 'DESERTER', aiType: 'ARMY' },
          { name: '叛卒', bg: 'DESERTER', aiType: 'ARMY' },
          { name: '弩手', bg: 'HUNTER', aiType: 'ARCHER' },
          { name: '叛将', bg: 'NOBLE', aiType: 'ARMY' },
          { name: '叛卒', bg: 'DESERTER', aiType: 'ARMY' },
        ]
      },
      'BEAST': {
        count: 3,
        compositions: [
          { name: '野狼', bg: 'FARMER', aiType: 'BEAST' },
          { name: '野狼', bg: 'FARMER', aiType: 'BEAST' },
          { name: '头狼', bg: 'HUNTER', aiType: 'BEAST' },
        ]
      },
      'NOMAD': {
        count: 4,
        compositions: [
          { name: '胡骑', bg: 'NOMAD', aiType: 'ARMY' },
          { name: '胡骑', bg: 'NOMAD', aiType: 'ARMY' },
          { name: '胡弓手', bg: 'NOMAD', aiType: 'ARCHER' },
          { name: '胡骑首领', bg: 'NOMAD', aiType: 'BERSERKER' },
        ]
      }
    };

    // 获取敌人配置，默认使用匪徒配置
    const config = enemyConfigs[entity.type] || enemyConfigs['BANDIT'];
    
    const enemies: CombatUnit[] = config.compositions.slice(0, config.count).map((comp, i) => ({
      ...createMercenary(`e${i}`, comp.name, comp.bg),
      team: 'ENEMY' as const,
      combatPos: { q: 2, r: i - Math.floor(config.count / 2) }, // 敌人初始位置更近
      currentAP: 9,
      isDead: false,
      isShieldWall: false,
      isHalberdWall: false,
      movedThisTurn: false,
      hasWaited: false,
      freeSwapUsed: false,
      aiType: comp.aiType
    }));
    
    const playerUnits: CombatUnit[] = party.mercenaries.filter(m => m.formationIndex !== null).map(m => {
        // 调整玩家位置：前排 q=-2，后排 q=-3，r 在 -2 到 2 之间
        const row = m.formationIndex! >= 9 ? 1 : 0; // 0=前排, 1=后排
        const col = m.formationIndex! % 9;
        const q = -2 - row;
        const r = Math.min(2, Math.max(-2, col - 4)); // 限制在 -2 到 2 范围
        return { ...m, team: 'PLAYER' as const, combatPos: { q, r }, currentAP: 9, isDead: false, isShieldWall: false, isHalberdWall: false, movedThisTurn: false, hasWaited: false, freeSwapUsed: false };
    });
    const allUnits = [...playerUnits, ...enemies];
    
    // 根据先手值排序回合顺序
    const sortedTurnOrder = allUnits
      .map(u => ({ id: u.id, init: u.stats.initiative + Math.random() * 10 }))
      .sort((a, b) => b.init - a.init)
      .map(u => u.id);
    
    setCombatState({
      units: allUnits, 
      turnOrder: sortedTurnOrder,
      currentUnitIndex: 0, 
      round: 1, 
      combatLog: [`与 ${entity.name} 激战开始！`], 
      terrainType: 'PLAINS'
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
        
        // 使用行为树系统更新实体 AI
        setEntities(prev => {
            let combatTriggered = false;
            let combatEntity: WorldEntity | null = null;
            
            const updatedEntities = prev.map(ent => {
                // 使用行为树更新 AI
                const updatedEnt = updateWorldEntityAI(ent, party, prev, tiles, cities, dt * timeScale);
                
                // 碰撞检测
                const distToPlayer = Math.hypot(updatedEnt.x - party.x, updatedEnt.y - party.y);
                if (distToPlayer < 0.6 && updatedEnt.faction === 'HOSTILE' && !preCombatEntity && !combatTriggered) {
                    combatTriggered = true;
                    combatEntity = updatedEnt;
                }
                
                return updatedEnt;
            });
            
            // 触发战斗
            if (combatEntity) {
                setPreCombatEntity(combatEntity);
                setTimeScale(0);
            }
            
            return updatedEntities;
        });
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
             <div className="flex gap-4 items-center">
                <span className="text-amber-500 font-bold tracking-widest text-lg uppercase italic">战国·与伍同行</span>
                <div className="h-6 w-px bg-amber-900/40" />
                <button 
                    onClick={() => setView(view === 'CAMP' ? 'WORLD_MAP' : 'CAMP')}
                    className={`px-4 py-1 text-xs font-bold transition-all border ${view === 'CAMP' ? 'bg-amber-600 text-white border-amber-500' : 'text-amber-500 border-amber-900/40 hover:border-amber-500'}`}
                >
                    战团营地
                </button>
                <div className="flex gap-2 ml-4">
                    <button onClick={saveGame} className="px-3 py-1 text-[10px] text-emerald-500 border border-emerald-900/40 hover:bg-emerald-900/20 transition-all uppercase">存档</button>
                    <button onClick={loadGame} className="px-3 py-1 text-[10px] text-blue-500 border border-blue-900/40 hover:bg-blue-900/20 transition-all uppercase">读档</button>
                </div>
             </div>

             <div className="flex gap-8 items-center">
                 <div className="flex gap-4 text-xs font-mono">
                     <span className="text-amber-500">金: {party.gold}</span>
                     <span className="text-emerald-500">粮: {party.food}</span>
                     <span className="text-slate-400">伍: {party.mercenaries.length}人</span>
                 </div>
                 <div className="flex bg-slate-900/50 rounded-sm border border-white/5 p-1">
                     {[0, 1, 2].map(s => (
                         <button key={s} onClick={() => setTimeScale(s)} className={`w-8 h-6 flex items-center justify-center text-[10px] transition-all ${timeScale === s ? 'bg-amber-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}>
                             {s === 0 ? '⏸' : s === 1 ? '▶' : '▶▶'}
                         </button>
                     ))}
                 </div>
             </div>
          </nav>
      )}

      <main className="flex-1 relative">
        {view === 'WORLD_MAP' && (
            <WorldMap 
                tiles={tiles} 
                party={party} 
                entities={entities} 
                onSetTarget={(x, y) => { setParty(p => ({ ...p, targetX: x, targetY: y })); setTimeScale(1); }} 
            />
        )}
        {view === 'COMBAT' && combatState && (
            <CombatView 
                initialState={combatState} 
                onCombatEnd={(victory, survivors) => {
                    if (victory) {
                        setParty(p => ({ ...p, mercenaries: survivors }));
                        setView('WORLD_MAP');
                        setCombatState(null);
                        setTimeScale(0);
                    } else {
                        alert("全军覆没...");
                        window.location.reload();
                    }
                }} 
            />
        )}
        {view === 'CAMP' && (
            <SquadManagement 
                party={party} 
                onUpdateParty={setParty} 
                onClose={() => setView('WORLD_MAP')} 
            />
        )}
        {view === 'CITY' && currentCity && (
            <CityView 
                city={currentCity} 
                party={party} 
                onLeave={() => { setView('WORLD_MAP'); setTimeScale(0); }}
                onUpdateParty={setParty}
                onUpdateCity={(newCity) => setCities(prev => prev.map(c => c.id === newCity.id ? newCity : c))}
                onAcceptQuest={(q) => setParty(p => ({ ...p, activeQuest: q }))}
            />
        )}

        {/* Post-Combat UI / Interaction Dialogs */}
        {preCombatEntity && (
            <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-10">
                <div className="w-full max-w-md bg-[#1a110a] border border-amber-900/50 p-8 shadow-2xl relative">
                    <div className="absolute inset-0 opacity-10 pointer-events-none" style={{backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 2px, rgba(139,69,19,0.3) 2px, rgba(139,69,19,0.3) 4px)'}} />
                    <h2 className="text-2xl font-bold text-amber-500 mb-4 tracking-widest text-center">遭遇 {preCombatEntity.name}</h2>
                    <p className="text-slate-400 text-center mb-8 italic">一支{preCombatEntity.name}正在逼近，由于距离过近，战斗已不可避免。</p>
                    <div className="flex flex-col gap-3">
                        <button 
                            onClick={() => { startCombat(preCombatEntity); setPreCombatEntity(null); }}
                            className="w-full py-3 bg-amber-800 hover:bg-amber-600 text-white font-bold tracking-[0.3em] uppercase transition-all shadow-lg border border-amber-500"
                        >
                            进入战场
                        </button>
                        <button 
                            onClick={() => { setPreCombatEntity(null); setTimeScale(0); }}
                            className="w-full py-2 text-slate-500 hover:text-slate-300 text-xs uppercase tracking-widest transition-all"
                        >
                            尝试交涉 (暂不可用)
                        </button>
                    </div>
                </div>
            </div>
        )}
      </main>
    </div>
  );
};
