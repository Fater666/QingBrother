
import { Item, Ability, Character } from './types.ts';

// --- ABILITIES (SKILLS) ---
export const ABILITIES: Record<string, Ability> = {
    // Basic
    'WAIT': { id: 'WAIT', name: '等待', description: '推迟行动顺序。', apCost: 0, fatCost: 0, range: [0, 0], icon: '⏳', type: 'UTILITY', targetType: 'SELF' },
    'MOVE': { id: 'MOVE', name: '移动', description: '移动到目标地块。', apCost: 2, fatCost: 2, range: [1, 1], icon: '🦶', type: 'UTILITY', targetType: 'GROUND' },
    
    // Weapon Skills
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

    // Shield Skills
    'SHIELDWALL': { id: 'SHIELDWALL', name: '盾墙', description: '大幅提高近战和远程防御。', apCost: 4, fatCost: 20, range: [0, 0], icon: '🛡️', type: 'SKILL', targetType: 'SELF' },
    'KNOCK_BACK': { id: 'KNOCK_BACK', name: '推撞', description: '将敌人推开一格。', apCost: 4, fatCost: 15, range: [1, 1], icon: '🤚', type: 'SKILL', targetType: 'ENEMY' },
};

export const getUnitAbilities = (char: Character): Ability[] => {
    const skills: Ability[] = [];
    const main = char.equipment.mainHand;
    const off = char.equipment.offHand;

    // Weapon Skills
    if (main) {
        if (main.name.includes('剑')) { skills.push(ABILITIES['SLASH']); if(main.value>200) skills.push(ABILITIES['RIPOSTE']); }
        else if (main.name.includes('斧')) { skills.push(ABILITIES['CHOP']); skills.push(ABILITIES['SPLIT_SHIELD']); }
        else if (main.name.includes('矛') || main.name.includes('枪')) { skills.push(ABILITIES['THRUST']); skills.push(ABILITIES['SPEARWALL']); }
        else if (main.name.includes('棒') || main.name.includes('殳')) { skills.push(ABILITIES['BASH']); }
        else if (main.name.includes('戈') || main.name.includes('戟')) { skills.push(ABILITIES['IMPALE']); }
        else if (main.name.includes('弓') || main.name.includes('弩')) { skills.push(ABILITIES['SHOOT']); }
        else { skills.push(ABILITIES['SLASH']); } // Default generic
    } else {
        // Unarmed
        skills.push({ ...ABILITIES['SLASH'], name: '拳击', icon: '✊' });
    }

    // Shield Skills
    if (off && off.type === 'SHIELD') {
        skills.push(ABILITIES['SHIELDWALL']);
        skills.push(ABILITIES['KNOCK_BACK']);
    }

    return skills;
};

// --- WEAPONS ---
export const WEAPON_TEMPLATES: Item[] = [
  // Swords
  { id: 'w_sword_1', name: '锈蚀铁剑', type: 'WEAPON', value: 120, weight: 6, durability: 40, maxDurability: 40, damage: [20, 35], armorPen: 0.1, armorDmg: 0.7, fatigueCost: 8, range: 1, hitChanceMod: 5, description: '一把缺口的铁剑，胜在轻便。' },
  { id: 'w_sword_2', name: '青铜长剑', type: 'WEAPON', value: 350, weight: 8, durability: 60, maxDurability: 60, damage: [35, 45], armorPen: 0.2, armorDmg: 0.8, fatigueCost: 10, range: 1, hitChanceMod: 5, description: '战国时期标准的制式武器，平衡性极佳。' },
  { id: 'w_sword_3', name: '八面汉剑', type: 'WEAPON', value: 1200, weight: 9, durability: 90, maxDurability: 90, damage: [45, 55], armorPen: 0.25, armorDmg: 0.9, fatigueCost: 12, range: 1, hitChanceMod: 10, description: '精钢锻造，剑身修长，能轻易刺穿轻甲。' },

  // Axes
  { id: 'w_axe_1', name: '伐木斧', type: 'WEAPON', value: 80, weight: 12, durability: 50, maxDurability: 50, damage: [30, 50], armorPen: 0.3, armorDmg: 1.2, fatigueCost: 14, range: 1, hitChanceMod: 0, description: '原本用来伐木，但劈开脑袋也同样好用。' },
  { id: 'w_axe_2', name: '宣花大斧', type: 'WEAPON', value: 450, weight: 16, durability: 70, maxDurability: 70, damage: [45, 70], armorPen: 0.4, armorDmg: 1.5, fatigueCost: 18, range: 1, hitChanceMod: 0, description: '沉重的战斧，能轻易粉碎盾牌和铠甲。' },

  // Spears
  { id: 'w_spear_1', name: '竹枪', type: 'WEAPON', value: 40, weight: 5, durability: 20, maxDurability: 20, damage: [20, 30], armorPen: 0.1, armorDmg: 0.5, fatigueCost: 10, range: 1, hitChanceMod: 20, description: '削尖的竹子，聊胜于无。' },
  { id: 'w_spear_2', name: '青铜矛', type: 'WEAPON', value: 300, weight: 10, durability: 60, maxDurability: 60, damage: [30, 40], armorPen: 0.2, armorDmg: 0.8, fatigueCost: 14, range: 1, hitChanceMod: 20, description: '百兵之王，极高的命中率使其成为新兵首选。' },

  // Polearms (Range 2)
  { id: 'w_pole_1', name: '青铜戈', type: 'WEAPON', value: 400, weight: 14, durability: 50, maxDurability: 50, damage: [40, 60], armorPen: 0.3, armorDmg: 1.1, fatigueCost: 18, range: 2, hitChanceMod: 5, description: '勾啄结合，适合攻击阵列后方的敌人。' },
  { id: 'w_pole_2', name: '精铁长戟', type: 'WEAPON', value: 900, weight: 18, durability: 80, maxDurability: 80, damage: [55, 80], armorPen: 0.35, armorDmg: 1.3, fatigueCost: 20, range: 2, hitChanceMod: 10, description: '结合了矛与戈的优点，威力巨大。' },

  // Maces/Hammers
  { id: 'w_mace_1', name: '包铁木棒', type: 'WEAPON', value: 150, weight: 12, durability: 50, maxDurability: 50, damage: [25, 45], armorPen: 0.4, armorDmg: 1.4, fatigueCost: 14, range: 1, hitChanceMod: 0, description: '简单粗暴，对付重甲单位有奇效。' },
  { id: 'w_mace_2', name: '青铜殳', type: 'WEAPON', value: 500, weight: 15, durability: 90, maxDurability: 90, damage: [35, 55], armorPen: 0.5, armorDmg: 1.8, fatigueCost: 16, range: 1, hitChanceMod: 0, description: '沉重的钝器，哪怕没有击穿护甲也能震碎骨骼。' },

  // Ranged
  { id: 'w_bow_1', name: '猎弓', type: 'WEAPON', value: 200, weight: 6, durability: 40, maxDurability: 40, damage: [25, 40], armorPen: 0.1, armorDmg: 0.4, fatigueCost: 12, range: 6, hitChanceMod: -5, description: '普通的木弓。' },
  { id: 'w_xbow_1', name: '秦弩', type: 'WEAPON', value: 600, weight: 15, durability: 50, maxDurability: 50, damage: [40, 70], armorPen: 0.6, armorDmg: 0.8, fatigueCost: 20, range: 6, hitChanceMod: 10, description: '秦军制式重弩，破甲能力极强，但装填缓慢。' },
];

// --- SHIELDS ---
export const SHIELD_TEMPLATES: Item[] = [
  { id: 's_buckler', name: '藤牌', type: 'SHIELD', value: 80, weight: 4, durability: 20, maxDurability: 20, defenseBonus: 10, rangedBonus: 5, fatigueCost: 4, description: '轻便的藤编盾牌，能格挡一些轻微攻击。' },
  { id: 's_round', name: '蒙皮圆盾', type: 'SHIELD', value: 200, weight: 10, durability: 40, maxDurability: 40, defenseBonus: 15, rangedBonus: 15, fatigueCost: 8, description: '标准的步兵盾牌。' },
  { id: 's_tower', name: '楚式大盾', type: 'SHIELD', value: 500, weight: 20, durability: 80, maxDurability: 80, defenseBonus: 25, rangedBonus: 30, fatigueCost: 16, description: '如同一堵墙壁，提供极佳的防护，但非常沉重。' },
];

// --- ARMOR (BODY) ---
export const ARMOR_TEMPLATES: Item[] = [
  { id: 'a_cloth', name: '粗布衣', type: 'ARMOR', value: 20, weight: 2, durability: 30, maxDurability: 30, maxFatiguePenalty: 0, description: '几乎没有防护作用。' },
  { id: 'a_robe', name: '厚战袍', type: 'ARMOR', value: 80, weight: 5, durability: 50, maxDurability: 50, maxFatiguePenalty: 3, description: '多层麻布缝制的战袍，能缓冲轻微打击。' },
  { id: 'a_leather', name: '皮甲', type: 'ARMOR', value: 250, weight: 10, durability: 90, maxDurability: 90, maxFatiguePenalty: 8, description: '硬化处理的牛皮甲，平衡了防护与灵活性。' },
  { id: 'a_lamellar_l', name: '合甲 (轻)', type: 'ARMOR', value: 600, weight: 18, durability: 140, maxDurability: 140, maxFatiguePenalty: 14, description: '双层皮革夹着青铜片。' },
  { id: 'a_lamellar_h', name: '青铜扎甲', type: 'ARMOR', value: 1500, weight: 28, durability: 210, maxDurability: 210, maxFatiguePenalty: 22, description: '精良的青铜甲片编缀而成，坚固但沉重。' },
  { id: 'a_scale', name: '精铁鱼鳞甲', type: 'ARMOR', value: 3200, weight: 35, durability: 300, maxDurability: 300, maxFatiguePenalty: 30, description: '将领级别的重甲，普通刀剑难以伤其分毫。' },
];

// --- HELMETS ---
export const HELMET_TEMPLATES: Item[] = [
    { id: 'h_hood', name: '头巾', type: 'HELMET', value: 15, weight: 1, durability: 20, maxDurability: 20, maxFatiguePenalty: 0, description: '裹在头上的布，只能防晒。' },
    { id: 'h_cap', name: '皮弁', type: 'HELMET', value: 120, weight: 4, durability: 50, maxDurability: 50, maxFatiguePenalty: 2, description: '硬皮制成的帽子，保护头顶。' },
    { id: 'h_bronze', name: '青铜胄', type: 'HELMET', value: 400, weight: 8, durability: 120, maxDurability: 120, maxFatiguePenalty: 6, description: '制式青铜头盔，提供良好的防护。' },
    { id: 'h_iron', name: '铁面兜鍪', type: 'HELMET', value: 1100, weight: 12, durability: 200, maxDurability: 200, maxFatiguePenalty: 10, description: '带有铁面具的重型头盔，令人望而生畏。' },
];

export const CONSUMABLE_TEMPLATES: Item[] = [
    { id: 'c1', name: '金创药', type: 'CONSUMABLE', value: 50, weight: 1, durability: 1, maxDurability: 1, description: '用于治疗伤口。', fatigueCost: 0 },
    { id: 'c2', name: '干粮', type: 'CONSUMABLE', value: 10, weight: 2, durability: 1, maxDurability: 1, description: '行军必备的口粮。', fatigueCost: 0 },
];

export const CITY_NAMES = [
    '咸阳', '邯郸', '大梁', '临淄', '郢都', '新郑', '蓟城', '洛阳', '寿春', '琅琊'
];

export const TERRAIN_DATA = {
  PLAINS: { name: '平原', color: '#3d4a2a', moveCost: 2, height: 0, icon: '🌾' },
  FOREST: { name: '森林', color: '#1a2e1a', moveCost: 3, height: 1, icon: '🌲' },
  MOUNTAIN: { name: '山地', color: '#2f2f2f', moveCost: 8, height: 3, icon: '⛰️' }, 
  SWAMP: { name: '沼泽', color: '#1b2621', moveCost: 5, height: -1, icon: '🌫️' },
  CITY: { name: '城邑', color: '#4a3b2a', moveCost: 1, height: 1, icon: '🏯' },
  RUINS: { name: '遗迹', color: '#2a2a2a', moveCost: 3, height: 1, icon: '🏚️' },
  SNOW: { name: '雪原', color: '#e2e8f0', moveCost: 3, height: 1, icon: '❄️' },
  DESERT: { name: '荒漠', color: '#9a7b4f', moveCost: 3, height: 0, icon: '🏜️' },
  ROAD: { name: '官道', color: '#786c55', moveCost: 1, height: 0, icon: '🛣️' },
};

export const MAP_SIZE = 64; 
export const VIEWPORT_WIDTH = 20; 
export const VIEWPORT_HEIGHT = 14; 
export const MAX_SQUAD_SIZE = 12; // Technically active limit, but roster can be larger now

// --- Character Generation Data ---

export const SURNAMES = [
    '赵', '钱', '孙', '李', '周', '吴', '郑', '王', '冯', '陈', '褚', '卫', '蒋', '沈', '韩', '杨', '朱', '秦', '尤', '许',
    '何', '吕', '施', '张', '孔', '曹', '严', '华', '金', '魏', '陶', '姜', '戚', '谢', '邹', '喻', '柏', '水', '窦', '章'
];

export const NAMES_MALE = [
    '伯', '仲', '叔', '季', '勇', '猛', '刚', '强', '平', '安', '福', '寿', '康', '宁', '文', '武', '德', '才', '光', '明',
    '虎', '豹', '龙', '非', '忌', '去病', '无忌', '不害', '鞅', '仪', '斯', '恬', '信', '广', '胜', '起', '翦', '贲'
];

export interface BackgroundTemplate {
    name: string;
    desc: string;
    stories: string[]; // List of potential stories
    hpMod: [number, number];
    fatigueMod: [number, number];
    resolveMod: [number, number];
    meleeSkillMod: [number, number];
    rangedSkillMod: [number, number];
    defMod: [number, number];
    initMod: [number, number];
    salaryMult: number;
    gearQuality: number; // 0: Low, 1: Mid, 2: High
}

export const BACKGROUNDS: Record<string, BackgroundTemplate> = {
    'FARMER': {
        name: '农夫',
        desc: '失去土地的农民。',
        stories: [
            '原本在垄亩间耕作，直到秦军的征粮官拿走了最后一粒米。他拿起锄头，决定换一种活法。',
            '一场大旱毁了他的庄稼，为了不让家人饿死，他卖掉了耕牛，加入了这支队伍。',
            '因为不堪忍受沉重的徭役，他从修筑长城的工地上逃了出来。',
        ],
        hpMod: [5, 15], fatigueMod: [10, 20], resolveMod: [-5, 5],
        meleeSkillMod: [-5, 5], rangedSkillMod: [-5, 5], defMod: [-5, 0], initMod: [-5, 5],
        salaryMult: 0.8, gearQuality: 0
    },
    'DESERTER': {
        name: '逃兵',
        desc: '从战场上逃离的士兵。',
        stories: [
            '长平之战的幸存者之一，他在尸山血海中装死才逃过一劫。每当深夜，他仍会被噩梦惊醒。',
            '他在一次夜袭中扔掉了戈矛，趁着混乱钻进了深山。他不想再为那些大人物送命了。',
            '作为前锋营的死士，他奇迹般地活了下来，然后决定带着赏钱远走高飞。',
        ],
        hpMod: [0, 10], fatigueMod: [0, 10], resolveMod: [-15, -5],
        meleeSkillMod: [10, 15], rangedSkillMod: [5, 10], defMod: [5, 10], initMod: [0, 5],
        salaryMult: 1.2, gearQuality: 1
    },
    'HUNTER': {
        name: '猎户',
        desc: '山林中的猎人。',
        stories: [
            '他曾独自在深山中追踪一只猛虎三天三夜。相比于野兽，他觉得人反而更好对付。',
            '官府划定了新的禁苑，禁止百姓入山打猎。失去了生计的他，只能用弓箭去换取金币。',
            '他的村庄被土匪洗劫，只有他靠着精湛的射术和陷阱活了下来。',
        ],
        hpMod: [-5, 5], fatigueMod: [5, 15], resolveMod: [0, 10],
        meleeSkillMod: [0, 5], rangedSkillMod: [15, 25], defMod: [0, 5], initMod: [10, 20],
        salaryMult: 1.5, gearQuality: 0
    },
    'NOMAD': {
        name: '胡人游骑',
        desc: '来自北方的游牧民。',
        stories: [
            '因为部落间的仇杀，他失去了牛羊和帐篷。如今，他的马刀只为出价最高的人挥舞。',
            '他向往中原的繁华，骑着瘦马一路南下。虽然言语不通，但他的弯刀足以让人闭嘴。',
        ],
        hpMod: [5, 10], fatigueMod: [15, 25], resolveMod: [5, 15],
        meleeSkillMod: [5, 10], rangedSkillMod: [5, 15], defMod: [5, 10], initMod: [5, 15],
        salaryMult: 1.8, gearQuality: 1
    },
    'NOBLE': {
        name: '落魄士族',
        desc: '家道中落的士族子弟。',
        stories: [
            '他的家族在政治斗争中败落，满门抄斩，唯有他靠着家仆的掩护逃出生天。',
            '为了复兴家族的荣光，他散尽家财招募死士，却发现现实远比兵书残酷。',
            '他曾是稷下学宫的学子，因为得罪了权贵而被迫流亡。',
        ],
        hpMod: [-10, 0], fatigueMod: [-10, 0], resolveMod: [15, 25],
        meleeSkillMod: [15, 20], rangedSkillMod: [-5, 0], defMod: [5, 15], initMod: [0, 5],
        salaryMult: 3.0, gearQuality: 2
    },
    'MONK': {
        name: '游方方士',
        desc: '云游四方的方士。',
        stories: [
            '他自称见过蓬莱仙岛，却因为炼丹炸炉而被赶出了道观。',
            '他游历各国，试图寻找长生不老之药，顺便用医术和占卜换取盘缠。',
        ],
        hpMod: [-5, 5], fatigueMod: [-5, 5], resolveMod: [20, 40],
        meleeSkillMod: [-10, 0], rangedSkillMod: [-10, 0], defMod: [10, 20], initMod: [-5, 5],
        salaryMult: 1.4, gearQuality: 0
    },
    'BANDIT': {
        name: '山贼',
        desc: '以此为生的亡命之徒。',
        stories: [
            '被官府通缉多年，他对于如何在乱世中生存有着独特的见解。',
            '他在黑道上名声狼藉，因为不想被手下出卖，决定金盆洗手——或者换个地方重操旧业。',
        ],
        hpMod: [5, 10], fatigueMod: [0, 10], resolveMod: [0, 5],
        meleeSkillMod: [5, 10], rangedSkillMod: [0, 10], defMod: [0, 5], initMod: [0, 5],
        salaryMult: 1.0, gearQuality: 0
    }
};

// Hex Math
export const getHexNeighbors = (q: number, r: number) => [
  { q: q + 1, r: r }, { q: q + 1, r: r - 1 }, { q: q, r: r - 1 },
  { q: q - 1, r: r }, { q: q - 1, r: r + 1 }, { q: q, r: r + 1 }
];

export const getHexDistance = (a: {q:number, r:number}, b: {q:number, r:number}) => {
  return (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
};
