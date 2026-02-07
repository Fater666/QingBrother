
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { GameView, Party, WorldTile, CombatState, MoraleStatus, Character, CombatUnit, WorldEntity, City, CityFacility, Quest, WorldAIType, OriginConfig, BattleResult, Item, AIType, AmbitionState } from './types.ts';
import { MAP_SIZE, WEAPON_TEMPLATES, ARMOR_TEMPLATES, SHIELD_TEMPLATES, HELMET_TEMPLATES, TERRAIN_DATA, CITY_NAMES, SURNAMES, NAMES_MALE, BACKGROUNDS, BackgroundTemplate, QUEST_FLAVOR_TEXTS, VISION_RADIUS, CONSUMABLE_TEMPLATES } from './constants';
import { WorldMap } from './components/WorldMap.tsx';
import { CombatView } from './components/CombatView.tsx';
import { SquadManagement } from './components/SquadManagement.tsx';
import { CityView } from './components/CityView.tsx';
import { MainMenu } from './components/MainMenu.tsx';
import { Prologue } from './components/Prologue.tsx';
import { OriginSelect, ORIGIN_CONFIGS } from './components/OriginSelect.tsx';
import { BattleResultView } from './components/BattleResultView.tsx';
import { SaveLoadPanel, getSaveSlotKey, getAllSaveMetas, saveMetas, hasAnySaveData, SaveSlotMeta } from './components/SaveLoadPanel.tsx';
import { updateWorldEntityAI, generateRoadPatrolPoints, generateCityPatrolPoints } from './services/worldMapAI.ts';
import { generateWorldMap, getBiome, BIOME_CONFIGS } from './services/mapGenerator.ts';
import { AmbitionSelect } from './components/AmbitionSelect.tsx';
import { DEFAULT_AMBITION_STATE, selectAmbition, selectNoAmbition, completeAmbition, cancelAmbition, checkAmbitionComplete, shouldShowAmbitionSelect, getAmbitionProgress, getAmbitionTypeInfo } from './services/ambitionService.ts';

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
  // 使用新的柏林噪声地图生成器
  const result = generateWorldMap(MAP_SIZE, CITY_NAMES);
  console.log(`[地图生成] 种子: ${result.seed}, 城市数: ${result.cities.length}`);
  return { tiles: result.tiles, cities: result.cities };
};

const generateEntities = (cities: City[], tiles: WorldTile[]): WorldEntity[] => {
    const ents: WorldEntity[] = [];
    
    // 根据区域生成不同类型的实体
    // 北疆冻土 (y < 25%): 更多野兽（狼群）
    // 中原沃野 (25%-60%): 更多土匪和军队
    // 江南水乡 (60%-80%): 蛮族和野兽
    // 南疆荒漠 (>80%): 游牧民骑兵
    
    // 北疆野兽 - 狼群为主
    for(let i = 0; i < 5; i++) {
        let x = Math.floor(Math.random() * MAP_SIZE);
        let y = Math.floor(Math.random() * (MAP_SIZE * 0.25));  // 北疆区域
        
        // 尝试在雪原或森林生成
        for (let attempt = 0; attempt < 20; attempt++) {
            const tx = Math.floor(Math.random() * MAP_SIZE);
            const ty = Math.floor(Math.random() * (MAP_SIZE * 0.3));
            const tile = tiles[ty * MAP_SIZE + tx];
            if (tile && (tile.type === 'SNOW' || tile.type === 'FOREST')) {
                x = tx;
                y = ty;
                break;
            }
        }
        
        const beastNames = ['北疆狼群', '雪狼', '冻土野狼'];
        ents.push({ 
            id: `beast-north-${i}`, 
            name: beastNames[Math.floor(Math.random() * beastNames.length)], 
            type: 'BEAST', 
            faction: 'HOSTILE', 
            x, y, 
            targetX: null, 
            targetY: null, 
            speed: 1.0 + Math.random() * 0.2,
            aiState: 'WANDER', 
            homeX: x, 
            homeY: y,
            worldAIType: 'BEAST',
            alertRadius: 4,
            chaseRadius: 8,
            territoryRadius: 5 + Math.random() * 3,
            wanderCooldown: Math.random() * 5
        });
    }
    
    // 中原土匪 - 在道路附近活动
    for(let i = 0; i < 10; i++) {
        let x = Math.floor(Math.random() * MAP_SIZE);
        let y = Math.floor(MAP_SIZE * 0.25 + Math.random() * (MAP_SIZE * 0.35));  // 中原区域
        
        // 尝试在道路附近生成
        for (let attempt = 0; attempt < 15; attempt++) {
            const tx = Math.floor(Math.random() * MAP_SIZE);
            const ty = Math.floor(MAP_SIZE * 0.2 + Math.random() * (MAP_SIZE * 0.45));
            const tile = tiles[ty * MAP_SIZE + tx];
            if (tile && (tile.type === 'ROAD' || tile.type === 'PLAINS' || tile.type === 'FOREST')) {
                x = tx;
                y = ty;
                break;
            }
        }
        
        const names = ['流寇', '山贼', '劫匪', '盗贼', '响马'];
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
            alertRadius: 4 + Math.random() * 2,
            chaseRadius: 10 + Math.random() * 4,
            strength: 3 + Math.floor(Math.random() * 3),
            fleeThreshold: 0.2 + Math.random() * 0.1,
            patrolPoints,
            patrolIndex: 0
        });
    }
    
    // 江南水乡野兽和蛮族
    for(let i = 0; i < 4; i++) {
        let x = Math.floor(Math.random() * MAP_SIZE);
        let y = Math.floor(MAP_SIZE * 0.6 + Math.random() * (MAP_SIZE * 0.2));  // 江南区域
        
        // 尝试在沼泽或森林生成
        for (let attempt = 0; attempt < 20; attempt++) {
            const tx = Math.floor(Math.random() * MAP_SIZE);
            const ty = Math.floor(MAP_SIZE * 0.55 + Math.random() * (MAP_SIZE * 0.25));
            const tile = tiles[ty * MAP_SIZE + tx];
            if (tile && (tile.type === 'SWAMP' || tile.type === 'FOREST')) {
                x = tx;
                y = ty;
                break;
            }
        }
        
        const names = ['沼泽蛮人', '密林蛮族', '越人战士'];
        ents.push({ 
            id: `beast-south-${i}`, 
            name: names[Math.floor(Math.random() * names.length)], 
            type: 'BANDIT',  // 作为土匪类型处理
            faction: 'HOSTILE', 
            x, y, 
            targetX: null, 
            targetY: null, 
            speed: 0.8 + Math.random() * 0.2,
            aiState: 'WANDER', 
            homeX: x, 
            homeY: y,
            worldAIType: 'BANDIT',
            alertRadius: 3,
            chaseRadius: 6,
            territoryRadius: 4 + Math.random() * 3,
            wanderCooldown: Math.random() * 5
        });
    }
    
    // 南疆游牧民 - 沙漠地带
    for(let i = 0; i < 6; i++) {
        let x = Math.floor(Math.random() * MAP_SIZE);
        let y = Math.floor(MAP_SIZE * 0.8 + Math.random() * (MAP_SIZE * 0.2));  // 南疆区域
        
        // 尝试在沙漠生成
        for (let attempt = 0; attempt < 15; attempt++) {
            const tx = Math.floor(Math.random() * MAP_SIZE);
            const ty = Math.floor(MAP_SIZE * 0.75 + Math.random() * (MAP_SIZE * 0.25));
            const tile = tiles[ty * MAP_SIZE + tx];
            if (tile && (tile.type === 'DESERT' || tile.type === 'PLAINS')) {
                x = tx;
                y = ty;
                break;
            }
        }
        
        const isHostile = Math.random() > 0.4;  // 60%概率敌对
        const names = isHostile ? ['胡人劫掠者', '沙匪', '戎狄骑兵'] : ['胡人游骑', '沙漠商旅'];
        
        ents.push({ 
            id: `nomad-${i}`, 
            name: names[Math.floor(Math.random() * names.length)], 
            type: 'NOMAD', 
            faction: isHostile ? 'HOSTILE' : 'NEUTRAL', 
            x, y, 
            targetX: null, 
            targetY: null, 
            speed: 1.1 + Math.random() * 0.3,  // 游牧民速度最快
            aiState: 'WANDER', 
            homeX: x, 
            homeY: y,
            worldAIType: 'NOMAD',
            alertRadius: 6,
            chaseRadius: 10,
            wanderCooldown: Math.random() * 5,
            strength: 4 + Math.floor(Math.random() * 2)
        });
    }
    
    // 巡防军 - 在城市附近
    for(let i = 0; i < Math.min(4, cities.length); i++) {
        const nearCity = cities[i];
        const offsetX = (Math.random() - 0.5) * 10;
        const offsetY = (Math.random() - 0.5) * 10;
        const x = Math.max(1, Math.min(MAP_SIZE - 2, nearCity.x + offsetX));
        const y = Math.max(1, Math.min(MAP_SIZE - 2, nearCity.y + offsetY));
        
        const armyPatrolPoints = generateCityPatrolPoints(nearCity.x, nearCity.y, 6, 4);
        
        ents.push({ 
            id: `army-${i}`, 
            name: '巡防军', 
            type: 'ARMY', 
            faction: 'NEUTRAL',
            x, y, 
            targetX: null, 
            targetY: null, 
            speed: 0.6 + Math.random() * 0.2, 
            aiState: 'PATROL', 
            homeX: nearCity.x, 
            homeY: nearCity.y,
            worldAIType: 'ARMY',
            alertRadius: 6,
            chaseRadius: 12,
            linkedCityId: nearCity.id,
            strength: 5 + Math.floor(Math.random() * 3),
            patrolPoints: armyPatrolPoints,
            patrolIndex: 0
        });
    }
    
    // 商队 - 在城市间往返
    cities.forEach((city, idx) => {
        if (cities.length < 2) return;
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
            chaseRadius: 0,
            linkedCityId: city.id,
            destinationCityId: targetCity.id,
            wanderCooldown: 5 + Math.random() * 5
        });
    });
    
    return ents;
};

// --- 战斗结果生成 ---
const generateBattleResult = (
  victory: boolean,
  survivors: CombatUnit[],
  enemyUnits: CombatUnit[],
  rounds: number,
  enemyName: string,
  playerUnitsBeforeCombat: Character[]
): BattleResult => {
  const enemiesKilled = enemyUnits.filter(u => u.isDead).length;
  const enemiesRouted = enemyUnits.filter(u => !u.isDead && u.morale === MoraleStatus.FLEEING).length;

  // 阵亡己方
  const deadPlayerIds = new Set(
    playerUnitsBeforeCombat
      .filter(m => m.formationIndex !== null)
      .filter(m => !survivors.find(s => s.id === m.id))
      .map(m => m.id)
  );

  const casualties = playerUnitsBeforeCombat
    .filter(m => deadPlayerIds.has(m.id))
    .map(m => ({
      name: m.name,
      background: BACKGROUNDS[m.background]?.name || m.background,
    }));

  // XP 计算: 基础25 + 击杀 * 15 + 回合 * 2
  const xpPerSurvivor = victory ? 25 + enemiesKilled * 15 + rounds * 2 : 0;

  const survivorData = survivors.map(s => {
    const beforeMerc = playerUnitsBeforeCombat.find(m => m.id === s.id);
    return {
      id: s.id,
      name: s.name,
      background: BACKGROUNDS[s.background]?.name || s.background,
      hpBefore: beforeMerc?.hp ?? s.maxHp,
      hpAfter: s.hp,
      maxHp: s.maxHp,
      xpGained: xpPerSurvivor,
    };
  });

  // --- 战利品生成 ---
  const lootItems: Item[] = [];
  
  if (victory) {
    enemyUnits.forEach(enemy => {
      if (!enemy.isDead) return; // 溃逃敌人不掉落

      const equipment = [enemy.equipment.mainHand, enemy.equipment.armor, enemy.equipment.helmet, enemy.equipment.offHand];
      
      equipment.forEach(item => {
        if (!item) return;
        // 天然武器（野兽爪牙等）不掉落
        if (item.value <= 0) return;
        // 40% 掉落几率
        if (Math.random() > 0.4) return;
        
        // 战损：耐久减损 20%-50%
        const damageFraction = 0.5 + Math.random() * 0.3; // 剩余 50%-80%
        const newDurability = Math.max(1, Math.floor(item.durability * damageFraction));
        
        lootItems.push({
          ...item,
          id: `loot-${item.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          durability: newDurability,
        });
      });
    });

    // 15% 概率额外掉落消耗品
    if (Math.random() < 0.15 && CONSUMABLE_TEMPLATES.length > 0) {
      const consumable = CONSUMABLE_TEMPLATES[Math.floor(Math.random() * CONSUMABLE_TEMPLATES.length)];
      lootItems.push({
        ...consumable,
        id: `loot-${consumable.id}-${Date.now()}`,
      });
    }
  }

  // --- 金钱奖励 ---
  let goldReward = 0;
  if (victory) {
    enemyUnits.forEach(enemy => {
      const aiType = enemy.aiType || 'BANDIT';
      switch (aiType) {
        case 'ARMY': goldReward += 40 + Math.floor(Math.random() * 40); break;
        case 'BEAST': goldReward += 10 + Math.floor(Math.random() * 20); break;
        case 'ARCHER': goldReward += 25 + Math.floor(Math.random() * 30); break;
        case 'BERSERKER': goldReward += 35 + Math.floor(Math.random() * 45); break;
        default: goldReward += 20 + Math.floor(Math.random() * 30); break; // BANDIT
      }
    });
  }

  return {
    victory,
    roundsTotal: rounds,
    enemyName,
    casualties,
    survivors: survivorData,
    enemiesKilled,
    enemiesRouted,
    lootItems,
    goldReward,
  };
};

// --- 难度曲线与装备系统（仿战场兄弟） ---

/** 根据天数获取难度阶段 */
const getDifficultyTier = (day: number) => {
  if (day <= 15) return { tier: 0, valueLimit: 400, statMult: 1.0 };
  if (day <= 40) return { tier: 1, valueLimit: 900, statMult: 1.08 };
  if (day <= 70) return { tier: 2, valueLimit: 1800, statMult: 1.18 };
  return { tier: 3, valueLimit: 5000, statMult: 1.3 };
};

/** 根据AI类型和价值上限为敌人分配合适装备 */
const getEquipmentForAIType = (aiType: AIType, valueLimit: number): {
  mainHand: Item | null; offHand: Item | null; armor: Item | null; helmet: Item | null;
} => {
  const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
  const uid = () => Math.random().toString(36).slice(2, 6);
  const cloneItem = (item: Item) => ({ ...item, id: `e-${item.id}-${uid()}` });

  switch (aiType) {
    case 'ARCHER': {
      // 弓手必须拿远程武器
      const rangedWeapons = WEAPON_TEMPLATES.filter(w =>
        (w.name.includes('弓') || w.name.includes('弩')) && w.value <= valueLimit
      );
      const weapon = rangedWeapons.length > 0 ? pick(rangedWeapons) : WEAPON_TEMPLATES.find(w => w.id === 'w_bow_3') || WEAPON_TEMPLATES.find(w => w.name.includes('弓'))!;
      const lightArmors = ARMOR_TEMPLATES.filter(a => a.value <= Math.min(valueLimit * 0.5, 300));
      const lightHelmets = HELMET_TEMPLATES.filter(h => h.value <= Math.min(valueLimit * 0.3, 200));
      return {
        mainHand: cloneItem(weapon),
        offHand: null,
        armor: lightArmors.length > 0 && Math.random() > 0.3 ? cloneItem(pick(lightArmors)) : null,
        helmet: lightHelmets.length > 0 && Math.random() > 0.5 ? cloneItem(pick(lightHelmets)) : null,
      };
    }
    case 'BANDIT': {
      // 匪徒拿各类近战武器，可能有盾
      const weapons = WEAPON_TEMPLATES.filter(w =>
        !w.name.includes('弓') && !w.name.includes('弩') &&
        !w.name.includes('飞石') && !w.name.includes('飞蝗') && !w.name.includes('标枪') && !w.name.includes('投矛') && !w.name.includes('飞斧') &&
        !(w.name.includes('爪') || w.name.includes('牙') || w.name.includes('獠')) &&
        w.value <= valueLimit && w.value > 0
      );
      const weapon = weapons.length > 0 ? pick(weapons) : WEAPON_TEMPLATES.find(w => w.id === 'w_sword_1')!;
      const shields = SHIELD_TEMPLATES.filter(s => s.value <= valueLimit);
      const armors = ARMOR_TEMPLATES.filter(a => a.value <= Math.min(valueLimit, 600));
      const helmets = HELMET_TEMPLATES.filter(h => h.value <= Math.min(valueLimit * 0.5, 400));
      return {
        mainHand: cloneItem(weapon),
        offHand: shields.length > 0 && Math.random() < 0.3 ? cloneItem(pick(shields)) : null,
        armor: armors.length > 0 && Math.random() > 0.3 ? cloneItem(pick(armors)) : null,
        helmet: helmets.length > 0 && Math.random() > 0.5 ? cloneItem(pick(helmets)) : null,
      };
    }
    case 'ARMY': {
      // 军队拿制式军事武器 + 高概率盾牌 + 中重甲
      const armyKeywords = ['矛', '枪', '剑', '戈', '戟', '殳', '刀'];
      const weapons = WEAPON_TEMPLATES.filter(w =>
        armyKeywords.some(k => w.name.includes(k)) &&
        !w.name.includes('飞') && !w.name.includes('投') && !w.name.includes('标枪') && !w.name.includes('匕') && !w.name.includes('厨') &&
        !(w.name.includes('爪') || w.name.includes('牙') || w.name.includes('獠')) &&
        w.value <= valueLimit && w.value > 0
      );
      const weapon = weapons.length > 0 ? pick(weapons) : WEAPON_TEMPLATES.find(w => w.id === 'w_spear_2')!;
      const shields = SHIELD_TEMPLATES.filter(s => s.value <= valueLimit);
      const armors = ARMOR_TEMPLATES.filter(a => a.value <= valueLimit && a.value >= 80);
      const helmets = HELMET_TEMPLATES.filter(h => h.value <= valueLimit);
      return {
        mainHand: cloneItem(weapon),
        offHand: shields.length > 0 && Math.random() < 0.6 ? cloneItem(pick(shields)) : null,
        armor: armors.length > 0 ? cloneItem(pick(armors)) : null,
        helmet: helmets.length > 0 && Math.random() > 0.3 ? cloneItem(pick(helmets)) : null,
      };
    }
    case 'BERSERKER': {
      // 狂战士拿重型双手武器，轻甲或无甲，无盾
      const heavyKeywords = ['斧', '锤', '殳', '棒', '鞭', '锏', '铁链', '刀'];
      const weapons = WEAPON_TEMPLATES.filter(w =>
        heavyKeywords.some(k => w.name.includes(k)) &&
        !w.name.includes('飞') && !w.name.includes('投') && !w.name.includes('匕') && !w.name.includes('厨') &&
        !(w.name.includes('爪') || w.name.includes('牙') || w.name.includes('獠')) &&
        w.value <= valueLimit && w.value >= 80
      );
      const weapon = weapons.length > 0 ? pick(weapons) : WEAPON_TEMPLATES.find(w => w.id === 'w_axe_1')!;
      const lightArmors = ARMOR_TEMPLATES.filter(a => a.value <= Math.min(valueLimit * 0.3, 300));
      return {
        mainHand: cloneItem(weapon),
        offHand: null,
        armor: lightArmors.length > 0 && Math.random() > 0.5 ? cloneItem(pick(lightArmors)) : null,
        helmet: Math.random() > 0.7 && HELMET_TEMPLATES.length > 0 ? cloneItem(HELMET_TEMPLATES[0]) : null,
      };
    }
    default: // BEAST 由单独逻辑处理
      return { mainHand: null, offHand: null, armor: null, helmet: null };
  }
};

/** 多阶段敌人编制表（仿战场兄弟难度递进） */
interface EnemyComp { name: string; bg: string; aiType: AIType }

const TIERED_ENEMY_COMPOSITIONS: Record<string, EnemyComp[][]> = {
  'BANDIT': [
    // Tier 0: 早期 - 3人小队
    [
      { name: '山贼', bg: 'BANDIT', aiType: 'BANDIT' },
      { name: '山贼', bg: 'FARMER', aiType: 'BANDIT' },
      { name: '贼弓手', bg: 'HUNTER', aiType: 'ARCHER' },
    ],
    // Tier 1: 中期 - 5人
    [
      { name: '山贼', bg: 'BANDIT', aiType: 'BANDIT' },
      { name: '贼弓手', bg: 'HUNTER', aiType: 'ARCHER' },
      { name: '山贼', bg: 'BANDIT', aiType: 'BANDIT' },
      { name: '悍匪', bg: 'DESERTER', aiType: 'BERSERKER' },
      { name: '贼弓手', bg: 'HUNTER', aiType: 'ARCHER' },
    ],
    // Tier 2: 后期 - 7人
    [
      { name: '山贼头目', bg: 'DESERTER', aiType: 'BERSERKER' },
      { name: '贼弓手', bg: 'HUNTER', aiType: 'ARCHER' },
      { name: '山贼', bg: 'BANDIT', aiType: 'BANDIT' },
      { name: '悍匪', bg: 'DESERTER', aiType: 'BERSERKER' },
      { name: '贼弓手', bg: 'HUNTER', aiType: 'ARCHER' },
      { name: '山贼', bg: 'BANDIT', aiType: 'BANDIT' },
      { name: '山贼精锐', bg: 'DESERTER', aiType: 'ARMY' },
    ],
    // Tier 3: 末期 - 9人
    [
      { name: '贼王', bg: 'NOBLE', aiType: 'BERSERKER' },
      { name: '贼弓手', bg: 'HUNTER', aiType: 'ARCHER' },
      { name: '贼弓手', bg: 'HUNTER', aiType: 'ARCHER' },
      { name: '悍匪', bg: 'DESERTER', aiType: 'BERSERKER' },
      { name: '山贼精锐', bg: 'DESERTER', aiType: 'ARMY' },
      { name: '山贼精锐', bg: 'DESERTER', aiType: 'ARMY' },
      { name: '山贼', bg: 'BANDIT', aiType: 'BANDIT' },
      { name: '山贼', bg: 'BANDIT', aiType: 'BANDIT' },
      { name: '贼弓手', bg: 'HUNTER', aiType: 'ARCHER' },
    ],
  ],
  'ARMY': [
    // Tier 0
    [
      { name: '叛卒', bg: 'DESERTER', aiType: 'ARMY' },
      { name: '叛卒', bg: 'DESERTER', aiType: 'ARMY' },
      { name: '叛卒', bg: 'FARMER', aiType: 'ARMY' },
    ],
    // Tier 1
    [
      { name: '叛卒', bg: 'DESERTER', aiType: 'ARMY' },
      { name: '叛卒', bg: 'DESERTER', aiType: 'ARMY' },
      { name: '弩手', bg: 'HUNTER', aiType: 'ARCHER' },
      { name: '叛将', bg: 'NOBLE', aiType: 'ARMY' },
      { name: '叛卒', bg: 'DESERTER', aiType: 'ARMY' },
    ],
    // Tier 2
    [
      { name: '叛将', bg: 'NOBLE', aiType: 'BERSERKER' },
      { name: '弩手', bg: 'HUNTER', aiType: 'ARCHER' },
      { name: '弩手', bg: 'HUNTER', aiType: 'ARCHER' },
      { name: '叛卒', bg: 'DESERTER', aiType: 'ARMY' },
      { name: '叛卒', bg: 'DESERTER', aiType: 'ARMY' },
      { name: '叛卒', bg: 'DESERTER', aiType: 'ARMY' },
      { name: '悍卒', bg: 'DESERTER', aiType: 'BERSERKER' },
    ],
    // Tier 3
    [
      { name: '叛军主将', bg: 'NOBLE', aiType: 'BERSERKER' },
      { name: '弩手', bg: 'HUNTER', aiType: 'ARCHER' },
      { name: '弩手', bg: 'HUNTER', aiType: 'ARCHER' },
      { name: '叛军精锐', bg: 'DESERTER', aiType: 'ARMY' },
      { name: '叛军精锐', bg: 'DESERTER', aiType: 'ARMY' },
      { name: '叛卒', bg: 'DESERTER', aiType: 'ARMY' },
      { name: '叛卒', bg: 'DESERTER', aiType: 'ARMY' },
      { name: '悍卒', bg: 'DESERTER', aiType: 'BERSERKER' },
      { name: '弩手', bg: 'HUNTER', aiType: 'ARCHER' },
    ],
  ],
  'BEAST': [
    // Tier 0
    [
      { name: '野狼', bg: 'FARMER', aiType: 'BEAST' },
      { name: '野狼', bg: 'FARMER', aiType: 'BEAST' },
      { name: '头狼', bg: 'HUNTER', aiType: 'BEAST' },
    ],
    // Tier 1
    [
      { name: '野狼', bg: 'FARMER', aiType: 'BEAST' },
      { name: '野狼', bg: 'FARMER', aiType: 'BEAST' },
      { name: '野狼', bg: 'FARMER', aiType: 'BEAST' },
      { name: '头狼', bg: 'HUNTER', aiType: 'BEAST' },
    ],
    // Tier 2
    [
      { name: '野狼', bg: 'FARMER', aiType: 'BEAST' },
      { name: '野狼', bg: 'FARMER', aiType: 'BEAST' },
      { name: '野狼', bg: 'FARMER', aiType: 'BEAST' },
      { name: '头狼', bg: 'HUNTER', aiType: 'BEAST' },
      { name: '头狼', bg: 'HUNTER', aiType: 'BEAST' },
    ],
    // Tier 3
    [
      { name: '野狼', bg: 'FARMER', aiType: 'BEAST' },
      { name: '野狼', bg: 'FARMER', aiType: 'BEAST' },
      { name: '野狼', bg: 'FARMER', aiType: 'BEAST' },
      { name: '野狼', bg: 'FARMER', aiType: 'BEAST' },
      { name: '头狼', bg: 'HUNTER', aiType: 'BEAST' },
      { name: '头狼', bg: 'HUNTER', aiType: 'BEAST' },
    ],
  ],
  'NOMAD': [
    // Tier 0
    [
      { name: '胡骑', bg: 'NOMAD', aiType: 'ARMY' },
      { name: '胡骑', bg: 'NOMAD', aiType: 'ARMY' },
      { name: '胡弓手', bg: 'NOMAD', aiType: 'ARCHER' },
    ],
    // Tier 1
    [
      { name: '胡骑', bg: 'NOMAD', aiType: 'ARMY' },
      { name: '胡骑', bg: 'NOMAD', aiType: 'ARMY' },
      { name: '胡弓手', bg: 'NOMAD', aiType: 'ARCHER' },
      { name: '胡骑首领', bg: 'NOMAD', aiType: 'BERSERKER' },
    ],
    // Tier 2
    [
      { name: '胡骑', bg: 'NOMAD', aiType: 'ARMY' },
      { name: '胡骑', bg: 'NOMAD', aiType: 'ARMY' },
      { name: '胡弓手', bg: 'NOMAD', aiType: 'ARCHER' },
      { name: '胡弓手', bg: 'NOMAD', aiType: 'ARCHER' },
      { name: '胡骑首领', bg: 'NOMAD', aiType: 'BERSERKER' },
      { name: '胡骑', bg: 'NOMAD', aiType: 'ARMY' },
    ],
    // Tier 3
    [
      { name: '胡骑大汗', bg: 'NOBLE', aiType: 'BERSERKER' },
      { name: '胡弓手', bg: 'NOMAD', aiType: 'ARCHER' },
      { name: '胡弓手', bg: 'NOMAD', aiType: 'ARCHER' },
      { name: '胡骑精锐', bg: 'NOMAD', aiType: 'ARMY' },
      { name: '胡骑精锐', bg: 'NOMAD', aiType: 'ARMY' },
      { name: '胡骑', bg: 'NOMAD', aiType: 'ARMY' },
      { name: '胡骑', bg: 'NOMAD', aiType: 'ARMY' },
      { name: '胡骑首领', bg: 'NOMAD', aiType: 'BERSERKER' },
    ],
  ],
};

export const App: React.FC = () => {
  const [view, setView] = useState<GameView>('MAIN_MENU');
  const [gameInitialized, setGameInitialized] = useState(false);
  
  // 游戏状态 - 延迟到"新战役"或"读档"时初始化
  const [tiles, setTiles] = useState<WorldTile[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [entities, setEntities] = useState<WorldEntity[]>([]);
  const [timeScale, setTimeScale] = useState<number>(0); 
  const [preCombatEntity, setPreCombatEntity] = useState<WorldEntity | null>(null);
  const [battleResult, setBattleResult] = useState<BattleResult | null>(null);
  const combatEnemyNameRef = useRef<string>('');

  const [party, setParty] = useState<Party>({
    x: 0, y: 0, targetX: null, targetY: null, gold: 0, food: 0,
    mercenaries: [], inventory: [], day: 1.0, activeQuest: null,
    reputation: 0, ambitionState: { ...DEFAULT_AMBITION_STATE }, moraleModifier: 0
  });

  const [combatState, setCombatState] = useState<CombatState | null>(null);
  const [currentCity, setCurrentCity] = useState<City | null>(null);
  const lastUpdateRef = useRef<number>(performance.now());
  const [hasSave, setHasSave] = useState<boolean>(hasAnySaveData());
  const [saveLoadMode, setSaveLoadMode] = useState<'SAVE' | 'LOAD' | null>(null);

  // 野心目标系统状态
  const [showAmbitionPopup, setShowAmbitionPopup] = useState(false);
  const [ambitionNotification, setAmbitionNotification] = useState<string | null>(null);
  const ambitionNotifTimerRef = useRef<number | null>(null);

  // 叙事流程状态
  const [selectedOrigin, setSelectedOrigin] = useState<OriginConfig | null>(null);
  const [leaderName, setLeaderName] = useState<string>('');
  const [introStoryLines, setIntroStoryLines] = useState<string[]>([]);
  const [introLineIndex, setIntroLineIndex] = useState(0);
  const [introCharIndex, setIntroCharIndex] = useState(0);
  const [introDisplayed, setIntroDisplayed] = useState<string[]>([]);
  const [introComplete, setIntroComplete] = useState(false);
  const [introFade, setIntroFade] = useState<'in' | 'visible' | 'out'>('in');
  const introTimerRef = useRef<number | null>(null);

  // 预生成地图数据 (在起源选择阶段就准备好)
  const pendingMapRef = useRef<{ tiles: WorldTile[], cities: City[] } | null>(null);

  // --- 新战役：根据起源生成初始队伍 ---
  const initGameWithOrigin = useCallback((origin: OriginConfig, name: string, mapData: { tiles: WorldTile[], cities: City[] }) => {
    setTiles(mapData.tiles);
    setCities(mapData.cities);
    setEntities(generateEntities(mapData.cities, mapData.tiles));

    const mercs = origin.mercenaries.map((m, i) => {
      const merc = createMercenary(`${i + 1}`, i === 0 ? name : m.name, m.bg, m.formationIndex);
      return merc;
    });

    setParty({
      x: mapData.cities[0].x, y: mapData.cities[0].y,
      targetX: null, targetY: null,
      gold: origin.gold, food: origin.food,
      mercenaries: mercs,
      inventory: [], day: 1.0, activeQuest: null,
      reputation: 0, ambitionState: { ...DEFAULT_AMBITION_STATE }, moraleModifier: 0
    });
    setGameInitialized(true);
    setTimeScale(0);
  }, []);

  // --- SAVE & LOAD SYSTEM (多栏位) ---
  const saveGame = useCallback((slotIndex: number) => {
    const saveData = {
        tiles,
        cities,
        entities,
        party,
        day: party.day,
        view: view === 'COMBAT' ? 'WORLD_MAP' : view // 不保存战斗状态，退回地图
    };
    try {
        localStorage.setItem(getSaveSlotKey(slotIndex), JSON.stringify(saveData));
        // 更新元数据
        const metas = getAllSaveMetas();
        metas[slotIndex] = {
          slotIndex,
          timestamp: Date.now(),
          day: party.day,
          gold: party.gold,
          mercCount: party.mercenaries.length,
          leaderName: party.mercenaries[0]?.name || '无名',
          view: saveData.view as string,
        };
        saveMetas(metas);
        setHasSave(true);
    } catch (e) {
        alert("简牍告罄，无法刻录（存档失败）。");
    }
  }, [tiles, cities, entities, party, view]);

  const loadGame = useCallback((slotIndex: number) => {
    const raw = localStorage.getItem(getSaveSlotKey(slotIndex));
    if (!raw) {
        return;
    }
    try {
        const data = JSON.parse(raw);
        setTiles(data.tiles);
        setCities(data.cities);
        setEntities(data.entities);
        // 旧存档兼容：补充缺失的野心/声望字段
        const loadedParty: Party = {
          ...data.party,
          reputation: data.party.reputation ?? 0,
          ambitionState: data.party.ambitionState ?? { ...DEFAULT_AMBITION_STATE },
          moraleModifier: data.party.moraleModifier ?? 0,
        };
        setParty(loadedParty);
        setGameInitialized(true);
        setView(data.view || 'WORLD_MAP');
        setTimeScale(0);
    } catch (e) {
        alert("简牍残破，无法辨识（读档失败）。");
    }
  }, []);

  // 兼容旧存档：迁移到新的多栏位系统
  useEffect(() => {
    const oldSave = localStorage.getItem('zhanguo_with_five_save');
    if (oldSave && !hasAnySaveData()) {
      try {
        localStorage.setItem(getSaveSlotKey(0), oldSave);
        const data = JSON.parse(oldSave);
        const metas = getAllSaveMetas();
        metas[0] = {
          slotIndex: 0,
          timestamp: Date.now(),
          day: data.party?.day || 1,
          gold: data.party?.gold || 0,
          mercCount: data.party?.mercenaries?.length || 0,
          leaderName: data.party?.mercenaries?.[0]?.name || '无名',
          view: data.view || 'WORLD_MAP',
        };
        saveMetas(metas);
        localStorage.removeItem('zhanguo_with_five_save');
        setHasSave(true);
      } catch { /* 忽略迁移失败 */ }
    }
  }, []);

  // 战争迷雾更新
  useEffect(() => {
      if (!gameInitialized) return;
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
  }, [party.x, party.y, gameInitialized]);

  const startCombat = useCallback((entity: WorldEntity) => {
    setTimeScale(0);
    
    // --- 难度曲线：根据天数决定敌人强度 ---
    const day = party.day;
    const { tier, valueLimit, statMult } = getDifficultyTier(day);
    
    // 获取当前实体类型对应的阶段编制
    const tierComps = TIERED_ENEMY_COMPOSITIONS[entity.type] || TIERED_ENEMY_COMPOSITIONS['BANDIT'];
    const compositions = tierComps[Math.min(tier, tierComps.length - 1)];
    
    const enemies: CombatUnit[] = compositions.map((comp, i) => {
      const baseChar = createMercenary(`e${i}`, comp.name, comp.bg);
      
      // BEAST类型敌人：使用天然武器，不穿装备
      if (comp.aiType === 'BEAST') {
        const isAlpha = comp.name.includes('头狼');
        // 野兽属性也随天数缩放
        const beastStatMult = statMult;
        baseChar.equipment = {
          mainHand: {
            id: `beast-claw-${i}`,
            name: isAlpha ? '狼牙' : '利爪',
            type: 'WEAPON' as const,
            value: 0,
            weight: 0,
            durability: 999,
            maxDurability: 999,
            description: isAlpha ? '头狼锋利的獠牙，撕咬力惊人。' : '野狼锋利的爪子。',
            damage: isAlpha
              ? [Math.floor(30 * beastStatMult), Math.floor(50 * beastStatMult)] as [number, number]
              : [Math.floor(20 * beastStatMult), Math.floor(35 * beastStatMult)] as [number, number],
            armorPen: isAlpha ? 0.3 : 0.15,
            armorDmg: 0.5,
            fatigueCost: 8,
            range: 1,
            hitChanceMod: isAlpha ? 15 : 10,
          },
          offHand: null,
          armor: null,
          helmet: null,
          ammo: null,
          accessory: null,
        };
      } else {
        // 非野兽敌人：根据AI类型和天数分配合适装备
        const equip = getEquipmentForAIType(comp.aiType, valueLimit);
        baseChar.equipment = {
          mainHand: equip.mainHand,
          offHand: equip.offHand,
          armor: equip.armor,
          helmet: equip.helmet,
          ammo: null,
          accessory: null,
        };
      }
      
      // --- 属性缩放：天数越高敌人基础属性越强 ---
      if (statMult > 1.0) {
        baseChar.maxHp = Math.floor(baseChar.maxHp * statMult);
        baseChar.hp = baseChar.maxHp;
        baseChar.stats.meleeSkill = Math.floor(baseChar.stats.meleeSkill * statMult);
        baseChar.stats.rangedSkill = Math.floor(baseChar.stats.rangedSkill * statMult);
        baseChar.stats.meleeDefense = Math.floor(baseChar.stats.meleeDefense * statMult);
        baseChar.stats.rangedDefense = Math.floor(baseChar.stats.rangedDefense * statMult);
        baseChar.stats.resolve = Math.floor(baseChar.stats.resolve * statMult);
      }
      
      return {
        ...baseChar,
        team: 'ENEMY' as const,
        combatPos: { q: 2, r: i - Math.floor(compositions.length / 2) },
        currentAP: 9,
        isDead: false,
        isShieldWall: false,
        isHalberdWall: false,
        movedThisTurn: false,
        waitCount: 0,
        freeSwapUsed: false,
        hasUsedFreeAttack: false,
        aiType: comp.aiType
      };
    });
    
    // 根据士气修正决定开场士气状态
    const startMorale = party.moraleModifier > 0 ? MoraleStatus.CONFIDENT
      : party.moraleModifier < 0 ? MoraleStatus.WAVERING
      : MoraleStatus.STEADY;
    
    const playerUnits: CombatUnit[] = party.mercenaries.filter(m => m.formationIndex !== null).map((m, idx) => {
        // 调整玩家位置：前排 q=-2，后排 q=-3
        const row = m.formationIndex! >= 9 ? 1 : 0; // 0=前排, 1=后排
        const col = m.formationIndex! % 9;
        const q = -2 - row;
        const r = col - 4; // 不再 clamp，每个编队位置映射到唯一的 r（-4 到 4）
        return { ...m, morale: startMorale, team: 'PLAYER' as const, combatPos: { q, r }, currentAP: 9, isDead: false, isShieldWall: false, isHalberdWall: false, movedThisTurn: false, waitCount: 0, freeSwapUsed: false, hasUsedFreeAttack: false };
    });
    const allUnits = [...playerUnits, ...enemies];
    
    // 根据先手值排序回合顺序
    const sortedTurnOrder = allUnits
      .map(u => ({ id: u.id, init: u.stats.initiative + Math.random() * 10 }))
      .sort((a, b) => b.init - a.init)
      .map(u => u.id);
    
    // 根据玩家当前位置获取世界地图地形
    const tileIndex = Math.floor(party.y) * MAP_SIZE + Math.floor(party.x);
    const worldTerrain = tiles[tileIndex]?.type || 'PLAINS';
    
    combatEnemyNameRef.current = entity.name;
    setCombatState({
      units: allUnits, 
      turnOrder: sortedTurnOrder,
      currentUnitIndex: 0, 
      round: 1, 
      combatLog: [`与 ${entity.name} 激战开始！（第${Math.floor(day)}天，${['初期', '中期', '后期', '末期'][tier]}难度）`], 
      terrainType: worldTerrain
    });
    setEntities(prev => prev.filter(e => e.id !== entity.id));
    // 士气修正已应用到开场士气，重置为0
    if (party.moraleModifier !== 0) {
      setParty(p => ({ ...p, moraleModifier: 0 }));
    }
    setView('COMBAT');
  }, [party.mercenaries, party.x, party.y, party.day, party.moraleModifier, tiles]);

  // 主循环处理 AI 与位移
  useEffect(() => {
    if (!gameInitialized) return;
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
                if (city) {
                  setCurrentCity(city);
                  setView('CITY');
                  setTimeScale(0);
                  // 记录访问过的城市（野心目标追踪）
                  setParty(p => {
                    const visited = p.ambitionState.citiesVisited;
                    if (!visited.includes(city.id)) {
                      return { ...p, ambitionState: { ...p.ambitionState, citiesVisited: [...visited, city.id] } };
                    }
                    return p;
                  });
                }
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
  }, [view, timeScale, party, cities, preCombatEntity, gameInitialized]);

  // --- INTRO STORY 逐字显示逻辑 ---
  useEffect(() => {
    if (view !== 'INTRO_STORY' || introComplete || introFade !== 'visible') return;

    const lines = introStoryLines;
    if (introLineIndex >= lines.length) {
      setIntroComplete(true);
      return;
    }

    const currentLine = lines[introLineIndex];

    if (currentLine === '') {
      introTimerRef.current = window.setTimeout(() => {
        setIntroDisplayed(prev => [...prev, '']);
        setIntroLineIndex(prev => prev + 1);
        setIntroCharIndex(0);
      }, 300);
      return () => { if (introTimerRef.current) clearTimeout(introTimerRef.current); };
    }

    if (introCharIndex === 0) {
      setIntroDisplayed(prev => [...prev, '']);
    }

    if (introCharIndex < currentLine.length) {
      introTimerRef.current = window.setTimeout(() => {
        setIntroDisplayed(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = currentLine.substring(0, introCharIndex + 1);
          return updated;
        });
        setIntroCharIndex(prev => prev + 1);
      }, 50);
    } else {
      introTimerRef.current = window.setTimeout(() => {
        setIntroLineIndex(prev => prev + 1);
        setIntroCharIndex(0);
      }, 200);
    }

    return () => { if (introTimerRef.current) clearTimeout(introTimerRef.current); };
  }, [view, introLineIndex, introCharIndex, introStoryLines, introComplete, introFade]);

  // Intro fade in
  useEffect(() => {
    if (view === 'INTRO_STORY' && introFade === 'in') {
      const t = setTimeout(() => setIntroFade('visible'), 100);
      return () => clearTimeout(t);
    }
  }, [view, introFade]);

  // --- 野心目标：完成检测 ---
  useEffect(() => {
    if (!gameInitialized) return;
    if (!party.ambitionState.currentAmbition) return;
    
    if (checkAmbitionComplete(party)) {
      const completedName = party.ambitionState.currentAmbition.name;
      const reward = party.ambitionState.currentAmbition.reputationReward;
      setParty(p => ({
        ...p,
        reputation: p.reputation + reward,
        ambitionState: completeAmbition(p),
        moraleModifier: 1, // 下次战斗全员自信开场
      }));
      // 显示通知
      setAmbitionNotification(`目标达成「${completedName}」！声望 +${reward}`);
      if (ambitionNotifTimerRef.current) clearTimeout(ambitionNotifTimerRef.current);
      ambitionNotifTimerRef.current = window.setTimeout(() => setAmbitionNotification(null), 4000);
    }
  }, [party.gold, party.mercenaries.length, party.ambitionState.battlesWon, party.ambitionState.citiesVisited.length, party.day, party.inventory.length, gameInitialized]);

  // --- 野心目标：弹出选择界面 ---
  useEffect(() => {
    if (!gameInitialized) return;
    if (view !== 'WORLD_MAP') return;
    if (showAmbitionPopup) return;
    if (preCombatEntity) return;
    if (saveLoadMode) return;
    
    if (shouldShowAmbitionSelect(party)) {
      // 小延迟后弹出，避免页面切换时立即弹出
      const t = setTimeout(() => setShowAmbitionPopup(true), 800);
      return () => clearTimeout(t);
    }
  }, [view, party.ambitionState.currentAmbition, party.day, gameInitialized, showAmbitionPopup, preCombatEntity, saveLoadMode]);

  // --- 野心目标：选择/取消处理 ---
  const handleAmbitionSelect = useCallback((ambitionId: string) => {
    setParty(p => ({ ...p, ambitionState: selectAmbition(p, ambitionId) }));
    setShowAmbitionPopup(false);
    setTimeScale(0);
  }, []);

  const handleAmbitionNoAmbition = useCallback(() => {
    setParty(p => ({ ...p, ambitionState: selectNoAmbition(p) }));
    setShowAmbitionPopup(false);
    setTimeScale(0);
  }, []);

  const handleAmbitionCancel = useCallback(() => {
    const cancelledName = party.ambitionState.currentAmbition?.name;
    setParty(p => ({
      ...p,
      ambitionState: cancelAmbition(p),
      moraleModifier: -1, // 下次战斗全员动摇开场
    }));
    if (cancelledName) {
      setAmbitionNotification(`放弃了「${cancelledName}」，全员士气低落……`);
      if (ambitionNotifTimerRef.current) clearTimeout(ambitionNotifTimerRef.current);
      ambitionNotifTimerRef.current = window.setTimeout(() => setAmbitionNotification(null), 3000);
    }
  }, [party.ambitionState.currentAmbition]);

  const handleIntroClick = useCallback(() => {
    if (!introComplete) {
      // 快速完成
      if (introTimerRef.current) clearTimeout(introTimerRef.current);
      setIntroDisplayed(introStoryLines);
      setIntroLineIndex(introStoryLines.length);
      setIntroComplete(true);
      return;
    }
    // 完成 -> 进入世界地图
    setIntroFade('out');
    setTimeout(() => setView('WORLD_MAP'), 800);
  }, [introComplete, introStoryLines]);

  // 是否是游戏前的菜单/叙事阶段
  const isPreGameView = view === 'MAIN_MENU' || view === 'PROLOGUE' || view === 'ORIGIN_SELECT' || view === 'INTRO_STORY';

  return (
    <div className="w-screen h-screen flex flex-col bg-black text-slate-200 overflow-hidden font-serif">
      {/* 游戏中导航栏 - 仅在游戏内视图显示 */}
      {!isPreGameView && view !== 'COMBAT' && view !== 'BATTLE_RESULT' && (
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
                    <button onClick={() => setSaveLoadMode('SAVE')} className="px-3 py-1 text-[10px] text-emerald-500 border border-emerald-900/40 hover:bg-emerald-900/20 transition-all uppercase">存档</button>
                    <button onClick={() => setSaveLoadMode('LOAD')} className="px-3 py-1 text-[10px] text-blue-500 border border-blue-900/40 hover:bg-blue-900/20 transition-all uppercase">读档</button>
                </div>
             </div>

             {/* 当前野心（可点击取消） */}
             {party.ambitionState.currentAmbition && (
               <div className="flex items-center gap-2 ml-4">
                 <div className="h-6 w-px bg-amber-900/40" />
                 <span className="text-[9px] text-amber-700 uppercase tracking-widest">志向</span>
                 <button
                   onClick={handleAmbitionCancel}
                   className="px-2.5 py-0.5 text-xs text-amber-400 border border-amber-900/40 hover:border-red-500/60 hover:text-red-400 transition-all group relative"
                   title="点击取消当前志向（会降低全员士气）"
                 >
                   {getAmbitionTypeInfo(party.ambitionState.currentAmbition.type).icon} {party.ambitionState.currentAmbition.name}
                   {(() => {
                     const progress = getAmbitionProgress(party);
                     return progress ? <span className="ml-1.5 text-[10px] text-amber-600">({progress})</span> : null;
                   })()}
                   <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[8px] text-red-500 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                     点击放弃
                   </span>
                 </button>
               </div>
             )}

             <div className="flex gap-8 items-center">
                 <div className="flex gap-4 text-xs font-mono">
                     <span className="text-amber-500">金: {party.gold}</span>
                     <span className="text-emerald-500">粮: {party.food}</span>
                     <span className="text-slate-400">伍: {party.mercenaries.length}人</span>
                     <span className="text-yellow-600">望: {party.reputation}</span>
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
        {/* ===== 主菜单 ===== */}
        {view === 'MAIN_MENU' && (
          <MainMenu
            hasSaveData={hasSave}
            onNewGame={() => setView('PROLOGUE')}
            onLoadGame={() => setSaveLoadMode('LOAD')}
          />
        )}

        {/* ===== 开场序幕 ===== */}
        {view === 'PROLOGUE' && (
          <Prologue onComplete={() => {
            // 在进入起源选择前预生成地图
            pendingMapRef.current = generateMap();
            setView('ORIGIN_SELECT');
          }} />
        )}

        {/* ===== 起源选择 ===== */}
        {view === 'ORIGIN_SELECT' && (
          <OriginSelect onSelect={(origin, name) => {
            setSelectedOrigin(origin);
            setLeaderName(name);
            // 准备过场叙事
            const cityName = pendingMapRef.current?.cities[0]?.name || '城邑';
            const storyLines = [
              ...origin.introStory,
              '',
              `你们来到了${cityName}，决定在此暂歇整顿。`,
              '新的征途，即将开始……',
            ];
            setIntroStoryLines(storyLines);
            setIntroDisplayed([]);
            setIntroLineIndex(0);
            setIntroCharIndex(0);
            setIntroComplete(false);
            setIntroFade('in');
            // 同时初始化游戏数据
            if (pendingMapRef.current) {
              initGameWithOrigin(origin, name, pendingMapRef.current);
            }
            setView('INTRO_STORY');
          }} />
        )}

        {/* ===== 过场叙事 ===== */}
        {view === 'INTRO_STORY' && (
          <div
            className={`w-screen h-screen bg-black flex flex-col items-center justify-center relative overflow-hidden select-none cursor-pointer transition-opacity duration-[800ms] ${
              introFade === 'out' ? 'opacity-0' : introFade === 'in' ? 'opacity-0' : 'opacity-100'
            }`}
            onClick={handleIntroClick}
          >
            {/* 背景氛围 */}
            <div className="absolute inset-0 opacity-[0.04] pointer-events-none"
              style={{ backgroundImage: `radial-gradient(ellipse 600px 400px at 50% 50%, rgba(139, 90, 43, 0.4), transparent)` }}
            />

            {/* 起源标题 */}
            <div className="absolute top-[10%]">
              <div className="flex items-center gap-4">
                <div className="w-20 h-px bg-gradient-to-r from-transparent to-amber-800/40" />
                <span className="text-sm text-amber-700/60 tracking-[0.5em] font-serif">
                  {selectedOrigin?.name} · {selectedOrigin?.subtitle}
                </span>
                <div className="w-20 h-px bg-gradient-to-l from-transparent to-amber-800/40" />
              </div>
            </div>

            {/* 叙事文字 */}
            <div className="max-w-2xl px-8">
              <div className="space-y-3">
                {introDisplayed.map((line, i) => (
                  <p
                    key={i}
                    className={`text-lg leading-loose tracking-[0.12em] font-serif ${
                      line === '' ? 'h-4' : 'text-amber-100/80'
                    }`}
                    style={{ textShadow: '0 0 20px rgba(217, 119, 6, 0.1)' }}
                  >
                    {line}
                    {i === introDisplayed.length - 1 && !introComplete && line !== '' && (
                      <span className="inline-block w-px h-5 bg-amber-500 ml-1 animate-pulse" />
                    )}
                  </p>
                ))}
              </div>
            </div>

            {/* 继续提示 */}
            {introComplete && (
              <div className="absolute bottom-[18%] animate-pulse">
                <p className="text-xs text-amber-700/60 tracking-[0.3em]">— 点击进入世界 —</p>
              </div>
            )}

            {/* 跳过按钮 */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (introTimerRef.current) clearTimeout(introTimerRef.current);
                setIntroFade('out');
                setTimeout(() => setView('WORLD_MAP'), 400);
              }}
              className="absolute bottom-8 right-8 text-xs text-slate-700 hover:text-slate-500 tracking-widest transition-colors z-10"
            >
              跳过 →
            </button>
          </div>
        )}

        {/* ===== 世界地图 ===== */}
        {view === 'WORLD_MAP' && gameInitialized && (
            <WorldMap 
                tiles={tiles} 
                party={party} 
                entities={entities} 
                cities={cities}
                onSetTarget={(x, y) => { setParty(p => ({ ...p, targetX: x, targetY: y })); setTimeScale(1); }} 
            />
        )}
        {view === 'COMBAT' && combatState && (
            <CombatView 
                initialState={combatState} 
                onCombatEnd={(victory, survivors, enemyUnits, rounds) => {
                    const result = generateBattleResult(
                      victory,
                      survivors,
                      enemyUnits,
                      rounds,
                      combatEnemyNameRef.current || '未知敌人',
                      party.mercenaries
                    );
                    setBattleResult(result);
                    // 先更新存活者的 HP（从战斗状态同步回来）+ 战斗胜利计数
                    if (victory) {
                      setParty(p => ({
                        ...p,
                        mercenaries: p.mercenaries.map(m => {
                          const sur = survivors.find(s => s.id === m.id);
                          if (sur) return { ...m, hp: sur.hp, fatigue: 0 };
                          return m; // 阵亡者暂时保留，在结算完成后移除
                        }),
                        ambitionState: {
                          ...p.ambitionState,
                          battlesWon: p.ambitionState.battlesWon + 1,
                        }
                      }));
                    }
                    setCombatState(null);
                    setView('BATTLE_RESULT');
                    setTimeScale(0);
                }} 
            />
        )}
        {view === 'BATTLE_RESULT' && battleResult && (
            <BattleResultView
                result={battleResult}
                party={party}
                onComplete={(selectedLoot, goldReward, xpMap) => {
                    setParty(p => {
                      // 移除阵亡者
                      const deadIds = new Set(battleResult.casualties.map(c => {
                        const merc = p.mercenaries.find(m => m.name === c.name);
                        return merc?.id;
                      }).filter(Boolean));

                      const updatedMercs = p.mercenaries
                        .filter(m => !deadIds.has(m.id))
                        .map(m => {
                          const xp = xpMap[m.id] || 0;
                          return { ...m, xp: m.xp + xp };
                        });

                      return {
                        ...p,
                        mercenaries: updatedMercs,
                        gold: p.gold + goldReward,
                        inventory: [...p.inventory, ...selectedLoot],
                      };
                    });
                    setBattleResult(null);
                    setView('WORLD_MAP');
                    setTimeScale(0);
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
                onUpdateCity={(newCity) => { setCities(prev => prev.map(c => c.id === newCity.id ? newCity : c)); setCurrentCity(newCity); }}
                onAcceptQuest={(q) => {
                    // 寻找地图上名称匹配的最近敌人实体，绑定targetEntityId
                    // 如果附近没有匹配实体（距离>15格），在城市附近生成一个任务专属目标
                    let linkedQuest = { ...q };
                    if (q.type === 'HUNT' && q.targetEntityName) {
                        const sourceCity = cities.find(c => c.id === q.sourceCityId);
                        const cx = sourceCity?.x ?? party.x;
                        const cy = sourceCity?.y ?? party.y;
                        let bestDist = Infinity;
                        let bestId: string | undefined;
                        for (const ent of entities) {
                            if (ent.faction !== 'HOSTILE') continue;
                            if (ent.name !== q.targetEntityName) continue;
                            const d = Math.hypot(ent.x - cx, ent.y - cy);
                            if (d < bestDist) { bestDist = d; bestId = ent.id; }
                        }
                        
                        const MAX_QUEST_DIST = 15; // 任务目标最大距离
                        if (bestId && bestDist <= MAX_QUEST_DIST) {
                            // 附近有匹配的敌人，直接绑定
                            linkedQuest.targetEntityId = bestId;
                        } else {
                            // 附近没有匹配的敌人，在城市附近生成一个任务专属目标
                            const spawnDist = 5 + Math.random() * 6; // 距城市5-11格
                            const spawnAngle = Math.random() * Math.PI * 2;
                            const spawnX = Math.max(1, Math.min(MAP_SIZE - 2, cx + Math.cos(spawnAngle) * spawnDist));
                            const spawnY = Math.max(1, Math.min(MAP_SIZE - 2, cy + Math.sin(spawnAngle) * spawnDist));
                            const questEntId = `quest-target-${q.id}-${Date.now()}`;
                            
                            // 根据目标名称推断实体类型
                            const beastNames = ['北疆狼群', '雪狼', '冻土野狼'];
                            const isBeast = beastNames.includes(q.targetEntityName);
                            const entityType = isBeast ? 'BEAST' : 'BANDIT';
                            const worldAIType = isBeast ? 'BEAST' : 'BANDIT';
                            
                            const newEntity: WorldEntity = {
                                id: questEntId,
                                name: q.targetEntityName,
                                type: entityType as any,
                                faction: 'HOSTILE',
                                x: spawnX,
                                y: spawnY,
                                targetX: null,
                                targetY: null,
                                speed: 0.6 + Math.random() * 0.3,
                                aiState: 'WANDER',
                                homeX: spawnX,
                                homeY: spawnY,
                                worldAIType: worldAIType as any,
                                alertRadius: 4,
                                chaseRadius: 8,
                                isQuestTarget: true,
                                wanderCooldown: Math.random() * 5,
                                territoryRadius: 4 + Math.random() * 3,
                            };
                            setEntities(prev => [...prev, newEntity]);
                            linkedQuest.targetEntityId = questEntId;
                        }
                    }
                    setParty(p => ({ ...p, activeQuest: linkedQuest }));
                }}
            />
        )}

        {/* Post-Combat UI / Interaction Dialogs */}
        {/* ===== 存档/读档面板 ===== */}
        {saveLoadMode && (
          <SaveLoadPanel
            mode={saveLoadMode}
            onSave={(slot) => saveGame(slot)}
            onLoad={(slot) => loadGame(slot)}
            onClose={() => setSaveLoadMode(null)}
          />
        )}

        {/* ===== 野心目标选择弹窗 ===== */}
        {showAmbitionPopup && !preCombatEntity && !saveLoadMode && (
          <AmbitionSelect
            party={party}
            onSelect={handleAmbitionSelect}
            onSelectNoAmbition={handleAmbitionNoAmbition}
          />
        )}

        {/* ===== 野心通知横幅 ===== */}
        {ambitionNotification && (
          <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[200] animate-pulse">
            <div className="bg-[#1a110a]/95 border border-amber-600/60 px-6 py-3 shadow-2xl backdrop-blur-sm">
              <p className="text-amber-400 text-sm font-bold tracking-wider text-center">
                {ambitionNotification}
              </p>
            </div>
          </div>
        )}

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
