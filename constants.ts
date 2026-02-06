
import { Item, Ability, Character, Perk, BackgroundTemplate } from './types.ts';
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
  damage: [w.dmgMin, w.dmgMax]
}));

export const ARMOR_TEMPLATES: Item[] = parseCSV(ARMOR_CSV).map(a => ({ ...a, type: 'ARMOR', maxDurability: a.durability }));

export const HELMET_TEMPLATES: Item[] = parseCSV(HELMETS_CSV).map(h => ({ ...h, type: 'HELMET', maxDurability: h.durability }));

export const SHIELD_TEMPLATES: Item[] = parseCSV(SHIELDS_CSV).map(s => ({ ...s, type: 'SHIELD', maxDurability: s.durability }));

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

const STORIES: Record<string, string[]> = {
    'FARMER': ['原本在垄亩间耕作，直到秦军的征粮官拿走了最后一粒米。', '一场大旱毁了他的庄稼，为了不让家人饿死。', '因为不堪忍受沉重的徭役。'],
    'DESERTER': ['长平之战的幸存者之一。', '他在一次夜袭中扔掉了戈矛。', '作为前锋营的死士，他奇迹般地活了下来。'],
    'HUNTER': ['他曾独自在深山中追踪猛虎。', '官府划定了新的禁苑。', '他的村庄被土匪洗劫。'],
    'NOMAD': ['因为部落间的仇杀，他失去了牛羊。', '他向向往中原的繁华，骑着瘦马一路南下。'],
    'NOBLE': ['他的家族在政治斗争中败落。', '为了复兴家族的荣光，他散尽家财。', '他曾是稷下学宫的学子。'],
    'BLACKSMITH': ["炉火已熄，国破家亡，唯有手中铁锤尚能锻造命运。", "昔日为兵器师，今欲以血肉之躯，亲验所铸利刃锋芒。", "厌倦了为贵族打造华而不实的玩物，想为真正的战士铸造武器。"],
    'PHYSICIAN': ["悬壶济世，终难医乱世沉疴，唯有以身涉险，方能寻得生机。", "医者仁心，却见生灵涂炭，愿入伍以血肉之躯，止戈救人。", "尝尝药石无功，今欲于刀光剑影中，洞悉生死奥秘。"],
    'BEGGAR': ["饥寒交迫，命如草芥，不如提刀入伍，或能博得一线生机。", "昔日沿街乞讨，今欲以手中之刃，夺回本该属于自己的尊严。", "乱世之中，乞食亦难，不如以血肉之躯，搏一个饱饭。"],
    'MERCHANT': ["商道断绝，货物尽失，唯有刀剑之路，或可重开财源。", "曾逐利天下，今欲以武力为舟，再渡乱世洪流。", "厌恶了官吏的盘剥，渴望以武力守护自己的所得。"],
    'ASSASSIN': ["一击不中，反遭追杀，不如投身乱世，以血还血。", "厌倦了阴影中的生活，欲以手中之刃，光明正大立于战场。", "昔日为钱财取人性命，今欲寻一明主，以武报国。"],
    'LABORER': ["农田荒芜，生计艰难，唯有投笔从戎，或可求得温饱。", "日复一日的劳作，不如以血肉之躯，在沙场上搏一个出路。", "不甘终身困于泥土，欲以汗水与鲜血，铸就一番功业。"],
    'FISHERMAN': ["河川枯竭，鱼虾无踪，不如弃舟从戎，搏一个生路。", "水匪横行，生计难维，唯有提刀入伍，方可自保。", "厌倦了水上漂泊，想在陆地上，用另一种方式捕获命运。"],
    'MINER': ["矿坑塌陷，生灵涂炭，不如以手中镐头，改掘乱世财宝。", "不见天日的劳作，不如以血肉之躯，在阳光下搏杀。", "不甘为奴为婢，愿以一身蛮力，在沙场上掘出新的人生。"],
    'PERFORMER': ["弦歌中断，看客散尽，不如以血肉为舞，再奏一曲悲歌。", "乱世无太平，歌舞难维生，唯有持剑而舞，方能生存。", "厌倦了虚假的欢笑，想在真实的战场上，演绎生命的价值。"],
    'MOHIST': ["兼爱非攻，终难平乱世之争，唯有以身入局，方能止戈。", "墨者兼爱，却见民不聊生，愿以手中之剑，捍卫世间公义。", "昔日游说诸侯，今欲以血肉之躯，亲身践行兼爱非攻之道。"],
};

export const BACKGROUNDS: Record<string, BackgroundTemplate> = {};
parseCSV(BACKGROUNDS_CSV).forEach(bg => {
    BACKGROUNDS[bg.id] = { ...bg, stories: STORIES[bg.id] || [] };
});

// --- REMAINING CONSTANTS ---
export const ABILITIES: Record<string, Ability> = {
    'WAIT': { id: 'WAIT', name: '等待', description: '推迟行动顺序。', apCost: 0, fatCost: 0, range: [0, 0], icon: '⏳', type: 'UTILITY', targetType: 'SELF' },
    'MOVE': { id: 'MOVE', name: '移动', description: '移动到目标地块。', apCost: 2, fatCost: 2, range: [1, 12], icon: '🦶', type: 'UTILITY', targetType: 'GROUND' },
    'SLASH': { id: 'SLASH', name: '劈砍', description: '基础剑术攻击。', apCost: 4, fatCost: 10, range: [1, 1], icon: '🗡️', type: 'ATTACK', targetType: 'ENEMY' },
    'RIPOSTE': { id: 'RIPOSTE', name: '反击', description: '进入防御姿态，受到攻击时会自动反击。', apCost: 4, fatCost: 20, range: [0, 0], icon: '🔄', type: 'SKILL', targetType: 'SELF' },
    'CHOP': { id: 'CHOP', name: '斧劈', description: '沉重的劈砍，对头部造成额外伤害。', apCost: 4, fatCost: 12, range: [1, 1], icon: '🪓', type: 'ATTACK', targetType: 'ENEMY' },
    'SPLIT_SHIELD': { id: 'SPLIT_SHIELD', name: '破盾', description: '专门破坏盾牌的攻击。', apCost: 4, fatCost: 15, range: [1, 1], icon: '🛡️💥', type: 'ATTACK', targetType: 'ENEMY' },
    'THRUST': { id: 'THRUST', name: '刺击', description: '利用长矛的距离优势进行攻击。', apCost: 4, fatCost: 12, range: [1, 1], icon: '🔱', type: 'ATTACK', targetType: 'ENEMY' },
    'SPEARWALL': { id: 'SPEARWALL', name: '矛墙', description: '阻止敌人进入近身范围。', apCost: 6, fatCost: 25, range: [0, 0], icon: '🚧', type: 'SKILL', targetType: 'SELF' },
    'BASH': { id: 'BASH', name: '重击', description: '造成大量疲劳伤害，有几率击晕。', apCost: 4, fatCost: 14, range: [1, 1], icon: '🔨', type: 'ATTACK', targetType: 'ENEMY' },
    'IMPALE': { id: 'IMPALE', name: '穿刺', description: '长柄武器攻击，无视部分护甲。', apCost: 6, fatCost: 15, range: [1, 2], icon: '🍢', type: 'ATTACK', targetType: 'ENEMY' },
    'SHOOT': { id: 'SHOOT', name: '射击', description: '远程攻击。', apCost: 4, fatCost: 10, range: [2, 7], icon: '🏹', type: 'ATTACK', targetType: 'ENEMY' },
    'RELOAD': { id: 'RELOAD', name: '装填', description: '为弩装填箭矢。', apCost: 6, fatCost: 15, range: [0, 0], icon: '🔄', type: 'UTILITY', targetType: 'SELF' },
    'PUNCTURE': { id: 'PUNCTURE', name: '透甲', description: '匕首攻击，完全无视护甲，但很难命中。', apCost: 4, fatCost: 15, range: [1, 1], icon: '🔪', type: 'ATTACK', targetType: 'ENEMY' },
    'SHIELDWALL': { id: 'SHIELDWALL', name: '盾墙', description: '大幅提高近战和远程防御。', apCost: 4, fatCost: 20, range: [0, 0], icon: '🛡️', type: 'SKILL', targetType: 'SELF' },
    'KNOCK_BACK': { id: 'KNOCK_BACK', name: '推撞', description: '将敌人推开一格。', apCost: 4, fatCost: 15, range: [1, 1], icon: '🤚', type: 'SKILL', targetType: 'ENEMY' },
};

export const getUnitAbilities = (char: Character): Ability[] => {
    const skills: Ability[] = [ABILITIES['MOVE']];
    const main = char.equipment.mainHand;
    const off = char.equipment.offHand;
    if (main) {
        if (main.name.includes('剑')) { skills.push(ABILITIES['SLASH']); if(main.value>200) skills.push(ABILITIES['RIPOSTE']); }
        else if (main.name.includes('斧')) { skills.push(ABILITIES['CHOP']); skills.push(ABILITIES['SPLIT_SHIELD']); }
        else if (main.name.includes('矛') || main.name.includes('枪')) { skills.push(ABILITIES['THRUST']); skills.push(ABILITIES['SPEARWALL']); }
        else if (main.name.includes('棒') || main.name.includes('殳')) { skills.push(ABILITIES['BASH']); }
        else if (main.name.includes('戈') || main.name.includes('戟')) { skills.push(ABILITIES['IMPALE']); }
        else if (main.name.includes('弓')) { skills.push(ABILITIES['SHOOT']); }
        else if (main.name.includes('弩')) { skills.push(ABILITIES['SHOOT']); skills.push(ABILITIES['RELOAD']); }
        else { skills.push(ABILITIES['SLASH']); }
    } else { skills.push({ ...ABILITIES['SLASH'], name: '拳击', icon: '✊' }); }
    if (off && off.type === 'SHIELD') { skills.push(ABILITIES['SHIELDWALL']); skills.push(ABILITIES['KNOCK_BACK']); }
    if (char.perks) {
        if (char.perks.includes('recover')) skills.push({ id: 'RECOVER_SKILL', name: '调息', description: '恢复疲劳。', apCost: 9, fatCost: 0, range: [0,0], icon: '😤', type: 'SKILL', targetType: 'SELF' });
        if (char.perks.includes('adrenaline')) skills.push({ id: 'ADRENALINE_SKILL', name: '血勇', description: '下回合先动。', apCost: 1, fatCost: 20, range: [0,0], icon: '💉', type: 'SKILL', targetType: 'SELF' });
        if (char.perks.includes('rotation')) skills.push({ id: 'ROTATION_SKILL', name: '换位', description: '与盟友换位。', apCost: 3, fatCost: 25, range: [1,1], icon: '🔄', type: 'UTILITY', targetType: 'ALLY' });
        if (char.perks.includes('footwork')) skills.push({ id: 'FOOTWORK_SKILL', name: '脱身', description: '无视敌人控制区移动一格。', apCost: 3, fatCost: 15, range: [1,1], icon: '💨', type: 'UTILITY', targetType: 'GROUND' });
    }
    skills.push(ABILITIES['WAIT']);
    return skills;
};

export const CONSUMABLE_TEMPLATES: Item[] = [
    { id: 'c1', name: '金创药', type: 'CONSUMABLE', value: 50, weight: 1, durability: 1, maxDurability: 1, description: '用于治疗伤口。', fatigueCost: 0 },
    { id: 'c2', name: '干粮', type: 'CONSUMABLE', value: 10, weight: 2, durability: 1, maxDurability: 1, description: '行军必备的口粮。', fatigueCost: 0 },
];

export const CITY_NAMES = ['咸阳', '邯郸', '大梁', '临淄', '郢都', '新郑', '蓟城', '洛阳', '寿春', '琅琊'];
export const SURNAMES = ['赵', '钱', '孙', '李', '周', '吴', '郑', '王', '冯', '陈', '褚', '卫', '蒋', '沈', '韩', '杨', '朱', '秦', '尤', '许', '何', '吕', '施', '张', '孔', '曹', '严', '华', '金', '魏', '陶', '姜', '戚', '谢', '邹', '喻', '柏', '水', '窦', '章'];
export const NAMES_MALE = ['伯', '仲', '叔', '季', '勇', '猛', '刚', '强', '平', '安', '福', '寿', '康', '宁', '文', '武', '德', '才', '光', '明', '虎', '豹', '龙', '非', '忌', '去病', '无忌', '不害', '鞅', '仪', '斯', '恬', '信', '广', '胜', '起', '翦', '贲'];
export const MAP_SIZE = 64; 
export const VIEWPORT_WIDTH = 20; 
export const VIEWPORT_HEIGHT = 14; 
export const MAX_SQUAD_SIZE = 12;
export const VISION_RADIUS = 6;
export const MAX_INVENTORY_SIZE = 30;

export const QUEST_FLAVOR_TEXTS = {
    HUNT: [
        {
            title: (diff: number) => diff === 1 ? '剿灭流寇' : diff === 2 ? '清缴山寨' : '讨伐悍匪头目',
            desc: (target: string) => `市井传闻，附近有一伙名为“${target}”的匪徒。`
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

import { CombatUnit, CombatState } from './types.ts';

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
