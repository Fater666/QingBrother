
import { Item, Ability, Character, Perk, BackgroundTemplate, Trait, AIType, EnemyUnitType, EnemyAIConfigFlag, GameDifficulty } from './types.ts';
export type { BackgroundTemplate };

// --- CSV DATA (loaded from csv/ folder) ---
import WEAPONS_CSV from './csv/weapons.csv?raw';
import ARMOR_CSV from './csv/armor.csv?raw';
import HELMETS_CSV from './csv/helmets.csv?raw';
import SHIELDS_CSV from './csv/shields.csv?raw';
import PERKS_CSV from './csv/perks.csv?raw';
import TERRAIN_CSV from './csv/terrain.csv?raw';
import EVENTS_CSV from './csv/events.csv?raw';
import BACKGROUNDS_CSV from './csv/backgrounds.csv?raw';
import TRAITS_CSV from './csv/traits.csv?raw';
import ABILITIES_CSV from './csv/abilities.csv?raw';
import CONSUMABLES_CSV from './csv/consumables.csv?raw';
import NAMES_CSV from './csv/names.csv?raw';
import STORIES_CSV from './csv/stories.csv?raw';
import BIOME_CONFIGS_CSV from './csv/biome_configs.csv?raw';
import MARKET_CONFIG_CSV from './csv/market_config.csv?raw';
import DIFFICULTY_TIERS_CSV from './csv/difficulty_tiers.csv?raw';
import ENEMY_COMPOSITIONS_CSV from './csv/enemy_compositions.csv?raw';
import GOLD_REWARDS_CSV from './csv/gold_rewards.csv?raw';
import CAMP_TEMPLATES_CSV from './csv/camp_templates.csv?raw';
import BOSS_CAMPS_CSV from './csv/boss_camps.csv?raw';
import MORALE_EFFECTS_CSV from './csv/morale_effects.csv?raw';
import AMBITIONS_CSV from './csv/ambitions.csv?raw';
import LEVEL_CONFIG_CSV from './csv/level_config.csv?raw';
import PERK_EFFECTS_CSV from './csv/perk_effects.csv?raw';
import BEAST_QUEST_TARGETS_CSV from './csv/beast_quest_targets.csv?raw';
import QUEST_NPC_NAMES_CSV from './csv/quest_npc_names.csv?raw';
import QUEST_PLACE_NAMES_CSV from './csv/quest_place_names.csv?raw';
import QUEST_TEMPLATES_CSV from './csv/quest_templates.csv?raw';
import ELITE_QUEST_TEMPLATES_CSV from './csv/elite_quest_templates.csv?raw';
import QUEST_CITY_COUNT_CSV from './csv/quest_city_count.csv?raw';
import QUEST_DIFFICULTY_POOLS_CSV from './csv/quest_difficulty_pools.csv?raw';
import QUEST_REWARD_RULES_CSV from './csv/quest_reward_rules.csv?raw';
import QUEST_GENERATION_RULES_CSV from './csv/quest_generation_rules.csv?raw';
import BACKGROUND_TRAIT_WEIGHTS_CSV from './csv/background_trait_weights.csv?raw';

// --- CSV PARSER UTILITY ---
const parseCSV = (csv: string): any[] => {
  const lines = csv.trim().split('\n');
  const headers = lines[0].split('|').map(h => h.trim());
  return lines.slice(1).map(line => {
    const values = line.split('|').map(v => v.trim());
    const obj: any = {};
    headers.forEach((header, i) => {
      let val: any = values[i];
      if (val === 'null') val = null;
      else if (val === 'true') val = true;
      else if (val === 'false') val = false;
      else if (!isNaN(val as any) && val !== '') val = Number(val);
      else if (val && val.includes(',')) {
          const arr = val.split(',').map((v:string) => isNaN(v as any) ? v : Number(v));
          val = arr;
      }
      obj[header] = val;
    });
    return obj;
  });
};

// --- SYNC INITIALIZATION ---
export const WEAPON_TEMPLATES: Item[] = parseCSV(WEAPONS_CSV).map(w => ({
  ...w,
  type: 'WEAPON',
  maxDurability: w.durability,
  damage: [w.dmgMin, w.dmgMax],
  twoHanded: w.twoHanded === true || w.twoHanded === 'true',
  combatClass: w.combatClass || w.weaponClass || undefined,
  weaponClass: w.weaponClass || undefined,
  rarity: w.rarity || undefined,
}));

export const ARMOR_TEMPLATES: Item[] = parseCSV(ARMOR_CSV).map(a => ({
  ...a, type: 'ARMOR', maxDurability: a.durability,
  rarity: a.rarity || undefined,
}));

export const HELMET_TEMPLATES: Item[] = parseCSV(HELMETS_CSV).map(h => ({
  ...h, type: 'HELMET', maxDurability: h.durability,
  rarity: h.rarity || undefined,
}));

export const SHIELD_TEMPLATES: Item[] = parseCSV(SHIELDS_CSV).map(s => ({
  ...s, type: 'SHIELD', maxDurability: s.durability,
  rarity: s.rarity || undefined,
}));

/** 所有传世红装武器模板（rarity === 'UNIQUE'） */
export const UNIQUE_WEAPON_TEMPLATES: Item[] = WEAPON_TEMPLATES.filter(w => w.rarity === 'UNIQUE');
/** 所有传世红装护甲模板 */
export const UNIQUE_ARMOR_TEMPLATES: Item[] = ARMOR_TEMPLATES.filter(a => a.rarity === 'UNIQUE');
/** 所有传世红装头盔模板 */
export const UNIQUE_HELMET_TEMPLATES: Item[] = HELMET_TEMPLATES.filter(h => h.rarity === 'UNIQUE');
/** 所有传世红装盾牌模板 */
export const UNIQUE_SHIELD_TEMPLATES: Item[] = SHIELD_TEMPLATES.filter(s => s.rarity === 'UNIQUE');

// 旗手机制：战旗唯一物品与对应志向ID
export const BANNER_WEAPON_ID = 'w_banner_warflag';
export const BANNER_AMBITION_ID = 'obtain_war_banner';
export const isBannerWeapon = (item: Item | null | undefined): boolean => {
  return !!item && item.type === 'WEAPON' && item.id === BANNER_WEAPON_ID;
};

export const PERK_TREE: Record<string, Perk> = {};
parseCSV(PERKS_CSV).forEach(p => {
    PERK_TREE[p.id] = p;
});

export const TERRAIN_DATA: Record<string, any> = {};
parseCSV(TERRAIN_CSV).forEach(t => {
    TERRAIN_DATA[t.id] = t;
});

export const EVENT_TEMPLATES: any[] = parseCSV(EVENTS_CSV).map(e => ({
  id: e.id,
  title: e.title,
  description: e.description,
  choices: [
    { text: e.c1_text, consequence: e.c1_consequence, impact: { gold: e.c1_gold, food: e.c1_food, morale: e.c1_morale } },
    { text: e.c2_text, consequence: e.c2_consequence, impact: { gold: e.c2_gold, food: e.c2_food, morale: e.c2_morale } }
  ]
}));

const STORIES: Record<string, string[]> = {};
parseCSV(STORIES_CSV).forEach(s => {
    if (!STORIES[s.bgId]) STORIES[s.bgId] = [];
    STORIES[s.bgId].push(s.story);
});

export const BACKGROUNDS: Record<string, BackgroundTemplate> = {};
parseCSV(BACKGROUNDS_CSV).forEach(bg => {
    BACKGROUNDS[bg.id] = { ...bg, stories: STORIES[bg.id] || [] };
});

// --- TRAIT SYSTEM ---
export const TRAIT_TEMPLATES: Record<string, Trait> = {};
parseCSV(TRAITS_CSV).forEach(t => {
    TRAIT_TEMPLATES[t.id] = t;
});

/** 正面特质列表 */
export const POSITIVE_TRAITS = Object.values(TRAIT_TEMPLATES).filter(t => t.type === 'positive');
/** 负面特质列表 */
export const NEGATIVE_TRAITS = Object.values(TRAIT_TEMPLATES).filter(t => t.type === 'negative' && !t.id.startsWith('injury_'));

/**
 * 背景偏好特质映射：每个背景有更高概率获得的特质ID
 * 偏好特质的权重为普通特质的 3 倍
 */
export const BG_TRAIT_WEIGHTS: Record<string, string[]> = {};
parseCSV(BACKGROUND_TRAIT_WEIGHTS_CSV).forEach(row => {
    const traitIds = Array.isArray(row.traitIds)
        ? row.traitIds
        : (typeof row.traitIds === 'string' && row.traitIds ? [row.traitIds] : []);
    BG_TRAIT_WEIGHTS[row.bgId] = traitIds;
});

/**
 * 基于背景加权随机分配特质
 * 规则：0-2 个正面 + 0-1 个负面，保证至少 1 个特质
 * 偏好特质权重 ×3
 * 
 * @param bgKey 背景ID（如 'FARMER'）
 * @returns 特质ID数组
 */
export const assignTraits = (bgKey: string): string[] => {
    const preferred = BG_TRAIT_WEIGHTS[bgKey] || [];
    const traits: string[] = [];
    
    // 加权随机选择函数
    const weightedPick = (pool: Trait[], exclude: string[]): Trait | null => {
        const available = pool.filter(t => !exclude.includes(t.id));
        if (available.length === 0) return null;
        
        const weights = available.map(t => preferred.includes(t.id) ? 3 : 1);
        const totalWeight = weights.reduce((a, b) => a + b, 0);
        let roll = Math.random() * totalWeight;
        for (let i = 0; i < available.length; i++) {
            roll -= weights[i];
            if (roll <= 0) return available[i];
        }
        return available[available.length - 1];
    };
    
    // 正面特质：0-2 个（50% 概率获得第一个，30% 概率获得第二个）
    if (Math.random() < 0.50) {
        const t = weightedPick(POSITIVE_TRAITS, traits);
        if (t) traits.push(t.id);
    }
    if (Math.random() < 0.30) {
        const t = weightedPick(POSITIVE_TRAITS, traits);
        if (t) traits.push(t.id);
    }
    
    // 负面特质：0-1 个（40% 概率获得）
    if (Math.random() < 0.40) {
        const t = weightedPick(NEGATIVE_TRAITS, traits);
        if (t) traits.push(t.id);
    }
    
    // 保证至少 1 个特质
    if (traits.length === 0) {
        // 随机从所有特质中取一个（偏好加权）
        const allTraits = [...POSITIVE_TRAITS, ...NEGATIVE_TRAITS];
        const t = weightedPick(allTraits, []);
        if (t) traits.push(t.id);
    }
    
    return traits;
};

/**
 * 计算特质的总属性修正
 * @param traitIds 特质ID数组
 * @returns 各属性修正值的汇总
 */
export const getTraitStatMods = (traitIds: string[]): {
    hpMod: number; fatigueMod: number; resolveMod: number;
    meleeSkillMod: number; rangedSkillMod: number;
    meleeDefMod: number; rangedDefMod: number; initMod: number;
} => {
    const mods = { hpMod: 0, fatigueMod: 0, resolveMod: 0, meleeSkillMod: 0, rangedSkillMod: 0, meleeDefMod: 0, rangedDefMod: 0, initMod: 0 };
    for (const id of traitIds) {
        const t = TRAIT_TEMPLATES[id];
        if (!t) continue;
        mods.hpMod += t.hpMod;
        mods.fatigueMod += t.fatigueMod;
        mods.resolveMod += t.resolveMod;
        mods.meleeSkillMod += t.meleeSkillMod;
        mods.rangedSkillMod += t.rangedSkillMod;
        mods.meleeDefMod += t.meleeDefMod;
        mods.rangedDefMod += t.rangedDefMod;
        mods.initMod += t.initMod;
    }
    return mods;
};

// --- REMAINING CONSTANTS ---
export const ABILITIES: Record<string, Ability> = {};
parseCSV(ABILITIES_CSV).forEach(a => {
    ABILITIES[a.id] = {
        id: a.id, name: a.name, description: a.description,
        apCost: a.apCost, fatCost: a.fatCost,
        range: [a.rangeMin, a.rangeMax],
        icon: a.icon, type: a.type, targetType: a.targetType,
    };
});

// 仿 BB：弩可在 9 AP 回合内完成「装填 + 射击」
const CROSSBOW_SHOOT_AP_COST = 5;
const CROSSBOW_RELOAD_AP_COST = 4;
// 瞄准射击：更高命中
export const AIMED_SHOT_HIT_BONUS = 15;

export const getUnitAbilities = (char: Character): Ability[] => {
    const skills: Ability[] = [ABILITIES['MOVE']];
    const main = char.equipment.mainHand;
    const off = char.equipment.offHand;
    if (main) {
        const wc = main.combatClass || main.weaponClass;
        const wn = main.name;

        // 武器技能严格按配置类别判定
        if (wc === 'throw') {
            skills.push(ABILITIES['THROW']);
        }
        else if (wc === 'dagger') {
            skills.push(ABILITIES['PUNCTURE']); skills.push(ABILITIES['SLASH']);
        }
        else if (wc === 'sword') {
            skills.push(ABILITIES['SLASH']);
            if (main.value > 200) skills.push(ABILITIES['RIPOSTE']);
        }
        else if (wc === 'axe') {
            skills.push(ABILITIES['CHOP']); skills.push(ABILITIES['SPLIT_SHIELD']);
        }
        else if (wc === 'cleaver') {
            skills.push(ABILITIES['SLASH']);
        }
        else if (wc === 'spear') {
            const thrust = ABILITIES['THRUST'];
            const spearMaxRange = Math.max(1, Number(main.range ?? 1));
            skills.push({ ...thrust, range: [thrust.range[0], spearMaxRange] });
            skills.push(ABILITIES['SPEARWALL']);
        }
        else if (wc === 'hammer') {
            skills.push(ABILITIES['BASH']);
        }
        else if (wc === 'mace') {
            skills.push(ABILITIES['BASH']);
        }
        else if (wc === 'flail') {
            skills.push(ABILITIES['BASH']);
        }
        else if (wc === 'polearm') {
            skills.push(ABILITIES['IMPALE']);
        }
        // 野兽天然武器（爪/牙）
        else if (wn.includes('爪') || wn.includes('牙') || wn.includes('獠')) {
            skills.push(ABILITIES['BITE']);
        }
        else if (wc === 'bow') {
            skills.push(ABILITIES['SHOOT']);
            if (ABILITIES['AIMED_SHOT']) {
                skills.push(ABILITIES['AIMED_SHOT']);
            }
        }
        else if (wc === 'crossbow') {
            skills.push({ ...ABILITIES['SHOOT'], apCost: CROSSBOW_SHOOT_AP_COST });
            skills.push({ ...ABILITIES['RELOAD'], apCost: CROSSBOW_RELOAD_AP_COST });
        }
        // 默认近战攻击
        else { skills.push(ABILITIES['SLASH']); }
    } else { skills.push({ ...ABILITIES['SLASH'], name: '拳击', icon: '✊' }); }
    if (off && off.type === 'SHIELD') { skills.push(ABILITIES['SHIELDWALL']); skills.push(ABILITIES['KNOCK_BACK']); }
    if (char.perks) {
        if (char.perks.includes('recover')) skills.push({ id: 'RECOVER_SKILL', name: '调息', description: '清除当前疲劳值的50%。', apCost: 9, fatCost: 0, range: [0,0], icon: '😤', type: 'SKILL', targetType: 'SELF' });
        if (char.perks.includes('adrenaline')) skills.push({ id: 'ADRENALINE_SKILL', name: '血勇', description: '下回合行动顺序提前至最先。', apCost: 1, fatCost: 20, range: [0,0], icon: '💉', type: 'SKILL', targetType: 'SELF' });
        if (char.perks.includes('rotation')) skills.push({ id: 'ROTATION_SKILL', name: '换位', description: '与相邻盟友交换位置。', apCost: 3, fatCost: 25, range: [1,1], icon: '🔄', type: 'UTILITY', targetType: 'ALLY' });
        if (char.perks.includes('footwork')) skills.push({ id: 'FOOTWORK_SKILL', name: '脱身', description: '无视敌人控制区移动一格。', apCost: 3, fatCost: 15, range: [1,1], icon: '💨', type: 'UTILITY', targetType: 'GROUND' });
        if (char.perks.includes('rally')) skills.push({ id: 'RALLY_SKILL', name: '振军', description: '提高范围内盟友的士气。', apCost: 4, fatCost: 25, range: [0,0], icon: '📢', type: 'SKILL', targetType: 'SELF' });
        if (char.perks.includes('taunt')) skills.push({ id: 'TAUNT_SKILL', name: '挑衅', description: '迫使周围敌人优先攻击自己（1回合）。', apCost: 3, fatCost: 15, range: [0,0], icon: '🤬', type: 'SKILL', targetType: 'SELF' });
        if (char.perks.includes('indomitable')) skills.push({ id: 'INDOMITABLE_SKILL', name: '不屈', description: '受到伤害减半，持续1回合。', apCost: 5, fatCost: 25, range: [0,0], icon: '🗿', type: 'SKILL', targetType: 'SELF' });
    }
    skills.push(ABILITIES['WAIT']);
    return skills;
};

export const CONSUMABLE_TEMPLATES: Item[] = parseCSV(CONSUMABLES_CSV).map(c => ({
    id: c.id, name: c.name, type: 'CONSUMABLE' as const, subType: c.subType,
    effectValue: c.effectValue, value: c.value, weight: c.weight,
    durability: 1, maxDurability: 1, description: c.description,
}));

const _namesData = parseCSV(NAMES_CSV);
export const CITY_NAMES = _namesData.filter((n: any) => n.category === 'CITY').map((n: any) => n.name as string);
export const SURNAMES = _namesData.filter((n: any) => n.category === 'SURNAME').map((n: any) => n.name as string);
export const NAMES_MALE = _namesData.filter((n: any) => n.category === 'MALE_NAME').map((n: any) => n.name as string);

// --- BIOME CONFIGS (from biome_configs.csv) ---
export const BIOME_CONFIGS_DATA: Record<string, {
    name: string; yRange: [number, number]; baseTemperature: number; baseMoisture: number;
    terrainWeights: Record<string, number>; cityDensity: number; ruinChance: number;
}> = {};
parseCSV(BIOME_CONFIGS_CSV).forEach(b => {
    const terrainWeights: Record<string, number> = {};
    if (b.twSNOW) terrainWeights.SNOW = b.twSNOW;
    if (b.twFOREST) terrainWeights.FOREST = b.twFOREST;
    if (b.twMOUNTAIN) terrainWeights.MOUNTAIN = b.twMOUNTAIN;
    if (b.twPLAINS) terrainWeights.PLAINS = b.twPLAINS;
    if (b.twSWAMP) terrainWeights.SWAMP = b.twSWAMP;
    if (b.twRUINS) terrainWeights.RUINS = b.twRUINS;
    if (b.twDESERT) terrainWeights.DESERT = b.twDESERT;
    BIOME_CONFIGS_DATA[b.id] = {
        name: b.name,
        yRange: [b.yRangeMin, b.yRangeMax],
        baseTemperature: b.baseTemperature,
        baseMoisture: b.baseMoisture,
        terrainWeights,
        cityDensity: b.cityDensity,
        ruinChance: b.ruinChance,
    };
});

// --- MARKET CONFIG (from market_config.csv) ---
export const RARITY_WEIGHTS: Record<string, Record<string, number>> = {};
export const MARKET_STOCK_CONFIG: Record<string, {
    weapons: [number, number]; armors: [number, number]; helmets: [number, number];
    shields: [number, number]; food: [number, number]; med: [number, number]; repairChance: number;
}> = {};
parseCSV(MARKET_CONFIG_CSV).forEach(m => {
    RARITY_WEIGHTS[m.cityType] = {
        COMMON: m.rarityCommon, UNCOMMON: m.rarityUncommon, RARE: m.rarityRare,
        EPIC: m.rarityEpic, LEGENDARY: m.rarityLegendary,
    };
    MARKET_STOCK_CONFIG[m.cityType] = {
        weapons: [m.weaponsMin, m.weaponsMax], armors: [m.armorsMin, m.armorsMax],
        helmets: [m.helmetsMin, m.helmetsMax], shields: [m.shieldsMin, m.shieldsMax],
        food: [m.foodMin, m.foodMax], med: [m.medMin, m.medMax],
        repairChance: m.repairChance,
    };
});

// --- DIFFICULTY TIERS (from difficulty_tiers.csv) ---
const _difficultyTiers = parseCSV(DIFFICULTY_TIERS_CSV);
export const getDifficultyTier = (day: number) => {
    if (_difficultyTiers.length === 0) return { tier: 0, valueLimit: 0, statMult: 1 };
    if (_difficultyTiers.length === 1) {
        const only = _difficultyTiers[0];
        return { tier: only.tier, valueLimit: only.valueLimit, statMult: only.statMult };
    }

    const safeDay = Math.max(1, day);
    const first = _difficultyTiers[0];
    if (safeDay <= first.maxDay) {
        return { tier: first.tier, valueLimit: first.valueLimit, statMult: first.statMult };
    }

    for (let i = 1; i < _difficultyTiers.length; i++) {
        const prev = _difficultyTiers[i - 1];
        const curr = _difficultyTiers[i];
        if (safeDay <= curr.maxDay) {
            const segmentStartDay = prev.maxDay;
            const segmentEndDay = curr.maxDay;
            const range = Math.max(1, segmentEndDay - segmentStartDay);
            const t = Math.min(1, Math.max(0, (safeDay - segmentStartDay) / range));

            const valueLimit = Math.floor(prev.valueLimit + (curr.valueLimit - prev.valueLimit) * t);
            const statMult = prev.statMult + (curr.statMult - prev.statMult) * t;

            // tier 仍按离散阶段走，编制切换保持原有节奏；仅数值与装备预算平滑增长
            return { tier: curr.tier, valueLimit, statMult };
        }
    }

    const last = _difficultyTiers[_difficultyTiers.length - 1];
    return { tier: last.tier, valueLimit: last.valueLimit, statMult: last.statMult };
};

export const GAME_DIFFICULTY_CONFIG: Record<GameDifficulty, {
  incomeMultiplier: number;
  enemyCountMultiplier: number;
  enemyStatMultiplier: number;
}> = {
  EASY: { incomeMultiplier: 1.3, enemyCountMultiplier: 0.7, enemyStatMultiplier: 0.9 },
  NORMAL: { incomeMultiplier: 1.0, enemyCountMultiplier: 1.0, enemyStatMultiplier: 1.0 },
  HARD: { incomeMultiplier: 0.85, enemyCountMultiplier: 1.2, enemyStatMultiplier: 1.08 },
  EXPERT: { incomeMultiplier: 0.7, enemyCountMultiplier: 1.4, enemyStatMultiplier: 1.17 },
};

export const getIncomeMultiplierByDifficulty = (difficulty: GameDifficulty): number =>
  GAME_DIFFICULTY_CONFIG[difficulty]?.incomeMultiplier ?? 1.0;

export const getEnemyCountMultiplierByDifficulty = (difficulty: GameDifficulty): number =>
  GAME_DIFFICULTY_CONFIG[difficulty]?.enemyCountMultiplier ?? 1.0;

export const getEnemyStatMultiplierByDifficulty = (difficulty: GameDifficulty): number =>
  GAME_DIFFICULTY_CONFIG[difficulty]?.enemyStatMultiplier ?? 1.0;

// --- ENEMY COMPOSITIONS (from enemy_compositions.csv) ---
export const TIERED_ENEMY_COMPOSITIONS: Record<string, {
    name: string;
    bg: string;
    aiType: AIType;
    unitType: EnemyUnitType;
    aiConfig: EnemyAIConfigFlag[];
}[][]> = {};
parseCSV(ENEMY_COMPOSITIONS_CSV).forEach(e => {
    if (!TIERED_ENEMY_COMPOSITIONS[e.enemyType]) TIERED_ENEMY_COMPOSITIONS[e.enemyType] = [];
    const tiers = TIERED_ENEMY_COMPOSITIONS[e.enemyType];
    while (tiers.length <= e.tier) tiers.push([]);
    const aiConfigRaw = e.aiConfig;
    const aiConfig = Array.isArray(aiConfigRaw)
      ? aiConfigRaw
      : (typeof aiConfigRaw === 'string' && aiConfigRaw ? [aiConfigRaw] : []);
    tiers[e.tier].push({
      name: e.name,
      bg: e.bg,
      aiType: e.aiType as AIType,
      unitType: (e.type as EnemyUnitType) || 'HUMANOID',
      aiConfig: aiConfig as EnemyAIConfigFlag[],
    });
});

// --- GOLD REWARDS (from gold_rewards.csv) ---
export const GOLD_REWARDS: Record<string, { goldMin: number; goldMax: number }> = {};
parseCSV(GOLD_REWARDS_CSV).forEach(g => {
    GOLD_REWARDS[g.aiType] = { goldMin: g.goldMin, goldMax: g.goldMax };
});

// --- CAMP TEMPLATES (from camp_templates.csv) ---
export const CAMP_TEMPLATES_DATA = parseCSV(CAMP_TEMPLATES_CSV).map((c: any) => ({
    region: c.region,
    entityType: c.entityType,
    entitySubType: c.entitySubType,
    faction: c.faction,
    maxAlive: c.maxAlive,
    spawnCooldown: c.spawnCooldown,
    namePool: Array.isArray(c.namePool) ? c.namePool : [c.namePool],
    speed: [c.speedMin, c.speedMax] as [number, number],
    alertRadius: [c.alertMin, c.alertMax] as [number, number],
    chaseRadius: [c.chaseMin, c.chaseMax] as [number, number],
    strength: c.strengthMin != null ? [c.strengthMin, c.strengthMax] as [number, number] : undefined,
    fleeThreshold: c.fleeMin != null ? [c.fleeMin, c.fleeMax] as [number, number] : undefined,
    territoryRadius: c.territoryMin != null ? [c.territoryMin, c.territoryMax] as [number, number] : undefined,
    aiState: c.aiState,
    preferredTerrain: Array.isArray(c.preferredTerrain) ? c.preferredTerrain : [c.preferredTerrain],
    yRange: [c.yRangeMin, c.yRangeMax] as [number, number],
}));

// --- BOSS CAMP CONFIGS (from boss_camps.csv) ---
export const BOSS_CAMP_CONFIGS = parseCSV(BOSS_CAMPS_CSV).map((b: any) => ({
  id: b.id as string,
  name: b.name as string,
  region: b.region as string,
  preferredTerrain: Array.isArray(b.preferredTerrain) ? b.preferredTerrain as string[] : [b.preferredTerrain as string],
  yRange: [b.yRangeMin, b.yRangeMax] as [number, number],
  uniqueLootIds: Array.isArray(b.uniqueLootIds) ? b.uniqueLootIds as string[] : [b.uniqueLootIds as string],
  bossCompositionKey: b.bossCompositionKey as string,
}));

// --- MORALE EFFECTS (from morale_effects.csv) ---
export const MORALE_EFFECTS_DATA: Record<string, {
    hitChanceMod: number; damageMod: number; defenseMod: number;
    skipActionChance: number; isControllable: boolean;
}> = {};
parseCSV(MORALE_EFFECTS_CSV).forEach(m => {
    MORALE_EFFECTS_DATA[m.status] = {
        hitChanceMod: m.hitChanceMod, damageMod: m.damageMod,
        defenseMod: m.defenseMod, skipActionChance: m.skipActionChance,
        isControllable: m.isControllable,
    };
});

// --- AMBITIONS CONFIG (from ambitions.csv) ---
export const AMBITIONS_CONFIG = parseCSV(AMBITIONS_CSV);

export const MAP_SIZE = 100; 
export const VIEWPORT_WIDTH = 24; 
export const VIEWPORT_HEIGHT = 14; 
export const MAX_SQUAD_SIZE = 12;
export const VISION_RADIUS = 6;
export const MAX_INVENTORY_SIZE = 30;

// ==================== 等级与经验值系统（from level_config.csv） ====================

/** 各等级所需经验值（从 CSV 加载） */
const _levelConfigData = parseCSV(LEVEL_CONFIG_CSV);
export const XP_PER_LEVEL: number[] = _levelConfigData.map((row: any) => row.xpRequired as number);

/** 获取从 level 升到 level+1 所需的 XP */
export const getXPForNextLevel = (level: number): number => {
  if (level <= 0) return XP_PER_LEVEL[0];
  if (level <= XP_PER_LEVEL.length) return XP_PER_LEVEL[level - 1];
  // 超出表格范围：最后一级 + 每级额外 500
  return XP_PER_LEVEL[XP_PER_LEVEL.length - 1] + (level - XP_PER_LEVEL.length) * 500;
};

export type LevelUpStatKey =
  | 'hp'
  | 'fatigue'
  | 'resolve'
  | 'initiative'
  | 'meleeSkill'
  | 'rangedSkill'
  | 'meleeDefense'
  | 'rangedDefense';

export type LevelUpRolls = Record<LevelUpStatKey, number>;

/** 根据星级生成本次升级的 8 项属性随机增幅（仿战场兄弟） */
export const generateLevelUpRolls = (stars: Character['stars']): LevelUpRolls => {
  const rollForStar = (star: number): number => {
    const min = 1 + star;
    const max = 3 + star;
    return min + Math.floor(Math.random() * (max - min + 1));
  };

  return {
    hp: rollForStar(stars.hp),
    fatigue: rollForStar(stars.fatigue),
    resolve: rollForStar(stars.resolve),
    initiative: rollForStar(stars.initiative),
    meleeSkill: rollForStar(stars.meleeSkill),
    rangedSkill: rollForStar(stars.rangedSkill),
    meleeDefense: rollForStar(stars.meleeDefense),
    rangedDefense: rollForStar(stars.rangedDefense),
  };
};

/**
 * 检查并执行连续升级（可能一次获得大量XP跳多级）
 * 每升一级：perkPoints +1，pendingLevelUps +1
 * 学徒(student)在 Lv11 时自动返还技能点
 * @returns 升级后的角色（level/perkPoints/pendingLevelUps/xp 已更新）
 */
export const checkLevelUp = (char: Character): { char: Character; levelsGained: number } => {
  let updated = { ...char };
  let levelsGained = 0;
  const studentReturnLv = getPerkEffect('student', 'returnLevel') || 11;
  while (true) {
    const xpNeeded = getXPForNextLevel(updated.level);
    if (updated.xp >= xpNeeded) {
      updated.xp -= xpNeeded;
      updated.level += 1;
      updated.perkPoints += 1;
      updated.pendingLevelUps = (updated.pendingLevelUps ?? 0) + 1;
      levelsGained += 1;
      // 学徒在指定等级返还技能点
      if (updated.level === studentReturnLv && updated.perks.includes('student')) {
        updated.perkPoints += 1;
      }
    } else {
      break;
    }
  }
  return { char: updated, levelsGained };
};

// ==================== 专精效果数值表（from perk_effects.csv） ====================

/**
 * 专精效果配置：perkId → { effectKey → value }
 * 所有被动/数值效果的参数均从此表读取，代码中不硬编码
 */
export const PERK_EFFECTS: Record<string, Record<string, number>> = {};
parseCSV(PERK_EFFECTS_CSV).forEach((row: any) => {
  if (!PERK_EFFECTS[row.perkId]) PERK_EFFECTS[row.perkId] = {};
  PERK_EFFECTS[row.perkId][row.effectKey] = row.value;
});

/** 便捷取值：获取某个 perk 的某项效果数值，不存在则返回 defaultVal */
export const getPerkEffect = (perkId: string, effectKey: string, defaultVal: number = 0): number => {
  return PERK_EFFECTS[perkId]?.[effectKey] ?? defaultVal;
};

/** 任务目标中按野兽单位生成的名称列表（CSV驱动） */
export const BEAST_QUEST_TARGET_NAMES = new Set(
  parseCSV(BEAST_QUEST_TARGETS_CSV)
    .map((row: any) => String(row.name ?? '').trim())
    .filter((name: string) => !!name)
);

// ==================== 任务描述模板池（CSV驱动） ====================
type QuestBiome = 'NORTHERN_TUNDRA' | 'CENTRAL_PLAINS' | 'SOUTHERN_WETLANDS' | 'FAR_SOUTH_DESERT';
type QuestNpcGroup = 'OFFICIALS' | 'MERCHANTS' | 'VILLAGERS' | 'MILITARY' | 'TRIBAL';
type QuestTypeConfig = 'HUNT' | 'ESCORT' | 'PATROL' | 'DELIVERY';

const _questNpcRows = parseCSV(QUEST_NPC_NAMES_CSV) as { group: QuestNpcGroup; name: string }[];
const _questPlaceRows = parseCSV(QUEST_PLACE_NAMES_CSV) as { biome: QuestBiome; place: string }[];

export interface QuestTemplateRow {
  biome: QuestBiome;
  questType: QuestTypeConfig;
  target: string;
  title1: string;
  title2: string;
  title3: string;
  description: string;
}

export interface EliteQuestTemplateRow extends QuestTemplateRow {
  minDifficulty: 1 | 2 | 3;
  requiredReputation: number;
}

export const QUEST_NPC_NAMES: Record<QuestNpcGroup, string[]> = {
  OFFICIALS: _questNpcRows.filter(r => r.group === 'OFFICIALS').map(r => r.name),
  MERCHANTS: _questNpcRows.filter(r => r.group === 'MERCHANTS').map(r => r.name),
  VILLAGERS: _questNpcRows.filter(r => r.group === 'VILLAGERS').map(r => r.name),
  MILITARY: _questNpcRows.filter(r => r.group === 'MILITARY').map(r => r.name),
  TRIBAL: _questNpcRows.filter(r => r.group === 'TRIBAL').map(r => r.name),
};

export const QUEST_PLACE_NAMES: Record<QuestBiome, string[]> = {
  NORTHERN_TUNDRA: _questPlaceRows.filter(r => r.biome === 'NORTHERN_TUNDRA').map(r => r.place),
  CENTRAL_PLAINS: _questPlaceRows.filter(r => r.biome === 'CENTRAL_PLAINS').map(r => r.place),
  SOUTHERN_WETLANDS: _questPlaceRows.filter(r => r.biome === 'SOUTHERN_WETLANDS').map(r => r.place),
  FAR_SOUTH_DESERT: _questPlaceRows.filter(r => r.biome === 'FAR_SOUTH_DESERT').map(r => r.place),
};

export const QUEST_TEMPLATE_ROWS: QuestTemplateRow[] = parseCSV(QUEST_TEMPLATES_CSV).map((r: any) => ({
  biome: r.biome,
  questType: r.questType,
  target: String(r.target ?? ''),
  title1: String(r.title1 ?? ''),
  title2: String(r.title2 ?? ''),
  title3: String(r.title3 ?? ''),
  description: String(r.description ?? ''),
}));

export const ELITE_QUEST_TEMPLATE_ROWS: EliteQuestTemplateRow[] = parseCSV(ELITE_QUEST_TEMPLATES_CSV).map((r: any) => ({
  biome: r.biome,
  questType: r.questType,
  target: String(r.target ?? ''),
  title1: String(r.title1 ?? ''),
  title2: String(r.title2 ?? ''),
  title3: String(r.title3 ?? ''),
  description: String(r.description ?? ''),
  minDifficulty: (Math.max(1, Math.min(3, Number(r.minDifficulty || 1))) as 1 | 2 | 3),
  requiredReputation: Number(r.requiredReputation || 0),
}));

export interface QuestCityCountRule {
  cityType: 'VILLAGE' | 'TOWN' | 'CAPITAL';
  min: number;
  max: number;
}

export interface QuestDifficultyPoolRule {
  cityType: 'VILLAGE' | 'TOWN' | 'CAPITAL';
  questCount: number;
  pool: (1 | 2 | 3)[];
  weight: number;
}

export interface QuestRewardRule {
  questType: 'HUNT' | 'PATROL' | 'ESCORT' | 'DELIVERY' | 'ELITE';
  difficulty: 1 | 2 | 3;
  rewardMin: number;
  rewardMax: number;
  daysLeft: number;
  patrolKillsRequired: number;
}

export interface QuestGenerationRule {
  cityType: 'VILLAGE' | 'TOWN' | 'CAPITAL';
  huntWeight: number;
  eliteChance: number;
}

export const QUEST_CITY_COUNT_RULES: QuestCityCountRule[] = parseCSV(QUEST_CITY_COUNT_CSV).map((r: any) => ({
  cityType: r.cityType,
  min: Number(r.min || 1),
  max: Number(r.max || 1),
}));

export const QUEST_DIFFICULTY_POOL_RULES: QuestDifficultyPoolRule[] = parseCSV(QUEST_DIFFICULTY_POOLS_CSV).map((r: any) => ({
  cityType: r.cityType,
  questCount: Number(r.questCount || 1),
  pool: (Array.isArray(r.pool) ? r.pool : [r.pool]).map((n: any) => Math.max(1, Math.min(3, Number(n || 1))) as 1 | 2 | 3),
  weight: Number(r.weight || 1),
}));

export const QUEST_REWARD_RULES: QuestRewardRule[] = parseCSV(QUEST_REWARD_RULES_CSV).map((r: any) => ({
  questType: r.questType,
  difficulty: Math.max(1, Math.min(3, Number(r.difficulty || 1))) as 1 | 2 | 3,
  rewardMin: Number(r.rewardMin || 0),
  rewardMax: Number(r.rewardMax || 0),
  daysLeft: Number(r.daysLeft || 7),
  patrolKillsRequired: Number(r.patrolKillsRequired || 0),
}));

export const QUEST_GENERATION_RULES: QuestGenerationRule[] = parseCSV(QUEST_GENERATION_RULES_CSV).map((r: any) => ({
  cityType: r.cityType,
  huntWeight: Number(r.huntWeight ?? 0.45),
  eliteChance: Number(r.eliteChance ?? 0),
}));

// 旧版兼容（保留不删，部分逻辑可能引用）
export const QUEST_FLAVOR_TEXTS = {
    HUNT: [
        {
            title: (diff: number) => diff === 1 ? '剿灭流寇' : diff === 2 ? '清缴山寨' : '讨伐悍匪头目',
            desc: (target: string) => `市井传闻，附近有一伙名为"${target}"的匪徒。`
        }
    ],
    ESCORT: [
        {
            title: (dest: string) => `护送商队至${dest}`,
            desc: (dest: string) => `一支运送官盐和铁器的商队急需护卫前往${dest}。`
        }
    ]
};

export const getHexNeighbors = (q: number, r: number) => [
  { q: q + 1, r: r }, { q: q + 1, r: r - 1 }, { q: q, r: r - 1 },
  { q: q - 1, r: r }, { q: q - 1, r: r + 1 }, { q: q, r: r + 1 }
];

export const getHexDistance = (a: {q:number, r:number}, b: {q:number, r:number}) => {
  return (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
};

// ==================== 控制区 (Zone of Control) 工具函数 ====================

import { CombatUnit, CombatState, MoraleStatus } from './types.ts';
import { getMoraleEffects } from './services/moraleService';
import {
  getDodgeDefenseBonus, getFastAdaptationBonus,
  getBackstabberMultiplier, getAnticipationBonus, getShieldExpertBonus,
  hasUnderdog, isLoneWolfActive, getLoneWolfMultiplier,
  getWeaponMasteryEffects, hasPerk,
} from './services/perkService';

/**
 * 获取单位的控制区格子（周围6个相邻格）
 */
export const getZoneOfControl = (unit: CombatUnit): { q: number; r: number }[] => {
  if (unit.isDead) return [];
  return getHexNeighbors(unit.combatPos.q, unit.combatPos.r);
};

/**
 * 检查位置是否在敌方控制区内
 * @param pos 要检查的位置
 * @param movingUnit 正在移动的单位
 * @param state 战斗状态
 * @returns 是否在敌方控制区内
 */
export const isInEnemyZoC = (
  pos: { q: number; r: number },
  movingUnit: CombatUnit,
  state: CombatState
): boolean => {
  return state.units.some(u => 
    !u.isDead && 
    !u.hasEscaped &&
    u.morale !== MoraleStatus.FLEEING &&
    u.team !== movingUnit.team &&
    getHexDistance(u.combatPos, pos) === 1
  );
};

/**
 * 获取对指定位置有控制区的敌方单位
 * @param pos 要检查的位置
 * @param movingUnit 正在移动的单位
 * @param state 战斗状态
 * @returns 可以进行截击的敌方单位列表
 */
export const getThreateningEnemies = (
  pos: { q: number; r: number },
  movingUnit: CombatUnit,
  state: CombatState
): CombatUnit[] => {
  return state.units.filter(u => 
    !u.isDead && 
    !u.hasEscaped &&
    u.morale !== MoraleStatus.FLEEING &&
    u.team !== movingUnit.team &&
    !u.hasUsedFreeAttack && // 本回合未使用过截击
    getHexDistance(u.combatPos, pos) === 1
  );
};

/**
 * 检查单位是否拥有"脱身"技能（footwork perk）
 */
export const hasFootworkPerk = (unit: CombatUnit): boolean => {
  return unit.perks?.includes('footwork') ?? false;
};

/**
 * 获取所有敌方单位的控制区格子（用于可视化）
 * @param team 当前单位的队伍
 * @param state 战斗状态
 * @returns 所有敌方控制区格子的集合
 */
export const getAllEnemyZoCHexes = (
  team: 'PLAYER' | 'ENEMY',
  state: CombatState
): Set<string> => {
  const zocSet = new Set<string>();
  state.units.forEach(u => {
    if (!u.isDead && u.team !== team) {
      const neighbors = getHexNeighbors(u.combatPos.q, u.combatPos.r);
      neighbors.forEach(n => zocSet.add(`${n.q},${n.r}`));
    }
  });
  return zocSet;
};

// ==================== 合围机制 (Surrounding Bonus) ====================

/** 每个额外邻接敌人的命中率加成 */
export const SURROUND_BONUS_PER_UNIT = 5;

/** 合围加成上限 */
export const SURROUND_BONUS_MAX = 25;

/** 远程命中最佳距离（超过后开始衰减） */
export const RANGED_HIT_OPTIMAL_DISTANCE = 2;
/** 远程命中每超出1格的惩罚 */
export const RANGED_HIT_PENALTY_PER_TILE = 8;
/** 远程命中距离惩罚上限 */
export const RANGED_HIT_PENALTY_MAX = 32;

/**
 * 计算合围加成
 * 统计目标周围与攻击者同阵营的存活单位数（不含攻击者自身），
 * 每个额外单位 +5% 命中率，最多 +25%。
 * 
 * 技能影响：
 * - 合围(backstabber)：攻击者的合围加成翻倍
 * - 破围(underdog)：目标不受合围加成影响
 * 
 * @param attacker 攻击者
 * @param target 目标
 * @param state 战斗状态
 * @returns 合围加成百分比（0~25+）
 */
export const getSurroundingBonus = (
  attacker: CombatUnit,
  target: CombatUnit,
  state: CombatState
): number => {
  // === 破围 (underdog): 目标不受合围加成影响 ===
  if (hasUnderdog(target)) return 0;
  
  // 统计目标周围1格内与攻击者同阵营的存活单位数（不含攻击者）
  const adjacentAllies = state.units.filter(u =>
    !u.isDead &&
    u.team === attacker.team &&
    u.id !== attacker.id &&
    getHexDistance(u.combatPos, target.combatPos) === 1
  );
  let bonus = adjacentAllies.length * SURROUND_BONUS_PER_UNIT;
  bonus = Math.min(bonus, SURROUND_BONUS_MAX);
  
  // === 合围 (backstabber): 攻击者的合围加成翻倍 ===
  const backstabberMult = getBackstabberMultiplier(attacker);
  if (backstabberMult > 1) {
    bonus = Math.floor(bonus * backstabberMult);
  }
  
  return bonus;
};

// ==================== 统一命中率计算 ====================

export interface HitChanceBreakdown {
  /** 最终命中率（5~95） */
  final: number;
  /** 攻击者基础技能 */
  baseSkill: number;
  /** 目标防御 */
  targetDefense: number;
  /** 武器命中修正 */
  weaponMod: number;
  /** 士气修正 */
  moraleMod: number;
  /** 盾牌防御 */
  shieldDef: number;
  /** 盾墙额外防御 */
  shieldWallDef: number;
  /** 高地修正 */
  heightMod: number;
  /** 合围加成 */
  surroundBonus: number;
  /** 身法(dodge)防御加成 */
  dodgeDef: number;
  /** 临机应变(fast_adaptation)命中加成 */
  adaptationBonus: number;
  /** 额外命中修正（如长柄贴脸惩罚） */
  extraHitMod: number;
}

/**
 * 统一命中率计算函数
 * 整合所有命中率影响因素：技能、防御、武器、士气、盾牌、盾墙、高地差、合围加成
 * 
 * @param attacker 攻击者
 * @param target 目标
 * @param state 战斗状态
 * @param heightDiff 高度差（正值=攻击者在高处，负值=在低处，0=同高度）
 * @returns 命中率详情分解
 */
export const calculateHitChance = (
  attacker: CombatUnit,
  target: CombatUnit,
  state: CombatState,
  heightDiff: number = 0,
  ability?: Ability,
  extraHitMod: number = 0
): HitChanceBreakdown => {
  const isRanged = attacker.equipment.mainHand?.range
    ? attacker.equipment.mainHand.range > 1
    : false;
  // 对远程武器的判定：检查主手武器是否为弓/弩类
  const weaponName = attacker.equipment.mainHand?.name || '';
  const weaponClass = attacker.equipment.mainHand?.weaponClass || '';
  const isRangedByName = weaponName.includes('弓') || weaponName.includes('弩') ||
    weaponName.includes('飞石') || weaponName.includes('飞蝗') ||
    weaponName.includes('标枪') || weaponName.includes('投矛') || weaponName.includes('飞斧') ||
    weaponClass === 'bow' || weaponClass === 'crossbow' || weaponClass === 'throw';

  // 基础技能
  let baseSkill = isRangedByName
    ? attacker.stats.rangedSkill
    : attacker.stats.meleeSkill;

  // === 独胆 (lone_wolf): 全属性+15% ===
  if (isLoneWolfActive(attacker, state)) {
    baseSkill = Math.floor(baseSkill * getLoneWolfMultiplier());
  }

  // 目标防御
  let baseTargetDefense = isRangedByName
    ? target.stats.rangedDefense
    : target.stats.meleeDefense;

  // === 独胆 (lone_wolf): 目标如果有独胆，防御也+15% ===
  if (isLoneWolfActive(target, state)) {
    baseTargetDefense = Math.floor(baseTargetDefense * getLoneWolfMultiplier());
  }

  // 身法(dodge)防御加成：基于当前先手值
  const dodgeDef = getDodgeDefenseBonus(target);
  
  // === 预判 (anticipation): 被远程攻击时额外防御 ===
  const anticipationDef = isRangedByName ? getAnticipationBonus(target) : 0;
  
  // === 兵势 (reach_advantage): 双手武器命中累积的近战防御 ===
  const reachAdvDef = (target.reachAdvantageBonus || 0);
  
  const targetDefense = baseTargetDefense + dodgeDef + anticipationDef + reachAdvDef;

  // 武器命中修正
  const weapon = attacker.equipment.mainHand;
  const aimedShotBonus = ability?.id === 'AIMED_SHOT' ? AIMED_SHOT_HIT_BONUS : 0;
  const weaponMod = (weapon?.hitChanceMod || 0) + aimedShotBonus;

  // 士气修正
  const moraleEffects = getMoraleEffects(attacker.morale);
  const moraleMod = moraleEffects.hitChanceMod || 0;

  // 盾牌防御：远程优先使用 rangedBonus，近战使用 defenseBonus
  const targetShield = target.equipment.offHand;
  let shieldDef = 0;
  if (targetShield?.type === 'SHIELD') {
    if (isRangedByName) {
      shieldDef = targetShield.rangedBonus ?? targetShield.defenseBonus ?? 0;
    } else {
      shieldDef = targetShield.defenseBonus ?? 0;
    }
  }

  // === 盾法精通 (shield_expert): 盾牌防御+25% ===
  const shieldExpertBonus = getShieldExpertBonus(target);
  shieldDef += shieldExpertBonus;
  
  // === 连枷精通 (flail_mastery): 无视盾牌防御 ===
  const masteryEffects = getWeaponMasteryEffects(attacker);
  if (masteryEffects.ignoreShieldDef) {
    shieldDef = 0;
  }

  // 盾墙额外防御
  const shieldWallDef = (target.isShieldWall && targetShield?.type === 'SHIELD') ? 15 : 0;

  // 高地修正
  let heightMod = 0;
  if (heightDiff > 0) heightMod = 10;
  else if (heightDiff < 0) heightMod = -10;

  // 合围加成：仅近战生效，远程不享受合围
  const surroundBonus = isRangedByName ? 0 : getSurroundingBonus(attacker, target, state);

  // 远程距离惩罚：超过最佳距离后逐格降低命中
  const attackDistance = getHexDistance(attacker.combatPos, target.combatPos);
  const distancePenalty = isRangedByName && attackDistance > RANGED_HIT_OPTIMAL_DISTANCE
    ? Math.min(
        RANGED_HIT_PENALTY_MAX,
        (attackDistance - RANGED_HIT_OPTIMAL_DISTANCE) * RANGED_HIT_PENALTY_PER_TILE
      )
    : 0;

  // 临机应变(fast_adaptation)命中加成
  const adaptationBonus = getFastAdaptationBonus(attacker);

  // 最终命中率
  let final = baseSkill - targetDefense + weaponMod + moraleMod - shieldDef - shieldWallDef + heightMod + surroundBonus + adaptationBonus - distancePenalty + extraHitMod;
  final = Math.max(5, Math.min(95, final));

  return {
    final,
    baseSkill,
    targetDefense,
    weaponMod,
    moraleMod,
    shieldDef,
    shieldWallDef,
    heightMod,
    surroundBonus,
    dodgeDef,
    adaptationBonus,
    extraHitMod,
  };
};

/**
 * 执行命中判定掷骰
 * @param hitChance 命中率（5~95）
 * @returns 是否命中
 */
export const rollHitCheck = (hitChance: number): boolean => {
  const roll = Math.random() * 100;
  return roll <= hitChance;
};
