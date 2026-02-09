
import { Item, Ability, Character, Perk, BackgroundTemplate, Trait } from './types.ts';
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

// --- TRAIT SYSTEM ---
export const TRAIT_TEMPLATES: Record<string, Trait> = {};
parseCSV(TRAITS_CSV).forEach(t => {
    TRAIT_TEMPLATES[t.id] = t;
});

/** 正面特质列表 */
export const POSITIVE_TRAITS = Object.values(TRAIT_TEMPLATES).filter(t => t.type === 'positive');
/** 负面特质列表 */
export const NEGATIVE_TRAITS = Object.values(TRAIT_TEMPLATES).filter(t => t.type === 'negative');

/**
 * 背景偏好特质映射：每个背景有更高概率获得的特质ID
 * 偏好特质的权重为普通特质的 3 倍
 */
export const BG_TRAIT_WEIGHTS: Record<string, string[]> = {
    'FARMER':     ['strong', 'tough'],
    'DESERTER':   ['craven', 'quick'],
    'HUNTER':     ['eagle_eyes', 'quick'],
    'NOMAD':      ['quick', 'brave'],
    'NOBLE':      ['brave', 'fragile'],
    'MONK':       ['brave', 'iron_jaw'],
    'BANDIT':     ['brave', 'clumsy'],
    'BLACKSMITH': ['strong', 'tough'],
    'PHYSICIAN':  ['eagle_eyes', 'fragile'],
    'BEGGAR':     ['tiny', 'asthmatic'],
    'MERCHANT':   ['short_sighted', 'craven'],
    'ASSASSIN':   ['quick', 'natural_fighter'],
    'LABORER':    ['strong', 'tough'],
    'FISHERMAN':  ['tough', 'hesitant'],
    'MINER':      ['strong', 'iron_jaw'],
    'PERFORMER':  ['quick', 'fragile'],
    'MOHIST':     ['brave', 'iron_jaw'],
};

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
    'THROW': { id: 'THROW', name: '投掷', description: '投掷武器进行远程攻击。', apCost: 4, fatCost: 12, range: [2, 4], icon: '🪨', type: 'ATTACK', targetType: 'ENEMY' },
    'BITE': { id: 'BITE', name: '撕咬', description: '野兽的凶猛撕咬。', apCost: 4, fatCost: 8, range: [1, 1], icon: '🐺', type: 'ATTACK', targetType: 'ENEMY' },
};

export const getUnitAbilities = (char: Character): Ability[] => {
    const skills: Ability[] = [ABILITIES['MOVE']];
    const main = char.equipment.mainHand;
    const off = char.equipment.offHand;
    if (main) {
        const wc = main.weaponClass;  // 优先使用武器类别字段
        const wn = main.name;         // 兼容名称匹配

        // 投掷类优先检查（名称可能包含 枪/矛/斧 等字，需优先匹配）
        if (wc === 'throw' || wn.includes('飞石') || wn.includes('飞蝗') || wn.includes('标枪') || wn.includes('投矛') || wn.includes('飞斧')) {
            skills.push(ABILITIES['THROW']);
        }
        // 匕首类
        else if (wc === 'dagger' || wn.includes('匕')) {
            skills.push(ABILITIES['PUNCTURE']); skills.push(ABILITIES['SLASH']);
        }
        // 剑类
        else if (wc === 'sword' || wn.includes('剑')) {
            skills.push(ABILITIES['SLASH']);
            if (main.value > 200) skills.push(ABILITIES['RIPOSTE']);
        }
        // 斧类
        else if (wc === 'axe' || wn.includes('斧')) {
            skills.push(ABILITIES['CHOP']); skills.push(ABILITIES['SPLIT_SHIELD']);
        }
        // 刀类（厨刀、环首刀、斩马刀、龙牙刀等）
        else if (wc === 'cleaver' || wn.includes('刀')) {
            skills.push(ABILITIES['SLASH']);
        }
        // 矛/枪类
        else if (wc === 'spear' || wn.includes('矛') || wn.includes('枪')) {
            skills.push(ABILITIES['THRUST']); skills.push(ABILITIES['SPEARWALL']);
        }
        // 锤类
        else if (wc === 'hammer' || wn.includes('锤') || wn.includes('骨朵')) {
            skills.push(ABILITIES['BASH']);
        }
        // 棒/殳/钝器类
        else if (wc === 'mace' || wn.includes('棒') || wn.includes('殳')) {
            skills.push(ABILITIES['BASH']);
        }
        // 连枷/鞭/锏/铁链类
        else if (wc === 'flail' || wn.includes('鞭') || wn.includes('锏') || wn.includes('铁链')) {
            skills.push(ABILITIES['BASH']);
        }
        // 戈/戟类（长柄武器）
        else if (wc === 'polearm' || wn.includes('戈') || wn.includes('戟')) {
            skills.push(ABILITIES['IMPALE']);
        }
        // 野兽天然武器（爪/牙）
        else if (wn.includes('爪') || wn.includes('牙') || wn.includes('獠')) {
            skills.push(ABILITIES['BITE']);
        }
        // 弓类
        else if (wc === 'bow' || wn.includes('弓')) {
            skills.push(ABILITIES['SHOOT']);
        }
        // 弩类
        else if (wc === 'crossbow' || wn.includes('弩')) {
            skills.push(ABILITIES['SHOOT']); skills.push(ABILITIES['RELOAD']);
        }
        // 默认近战攻击
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
    // 粮食类
    { id: 'c_food1', name: '干粮', type: 'CONSUMABLE', subType: 'FOOD', effectValue: 10, value: 10, weight: 2, durability: 1, maxDurability: 1, description: '简单的行军口粮，可供数人食用。购买后直接补充粮食储备。' },
    { id: 'c_food2', name: '腌肉', type: 'CONSUMABLE', subType: 'FOOD', effectValue: 30, value: 25, weight: 4, durability: 1, maxDurability: 1, description: '盐渍风干的肉脯，耐储存且饱腹感强。购买后直接补充粮食储备。' },
    { id: 'c_food3', name: '上等口粮', type: 'CONSUMABLE', subType: 'FOOD', effectValue: 60, value: 50, weight: 6, durability: 1, maxDurability: 1, description: '精心准备的行军粮秣，含肉干、谷饼与蜜饯。购买后直接补充粮食储备。' },
    // 医药类
    { id: 'c_med1', name: '金创药', type: 'CONSUMABLE', subType: 'MEDICINE', effectValue: 20, value: 50, weight: 1, durability: 1, maxDurability: 1, description: '用草药制成的外敷药膏，可治疗刀伤箭创。在营地中使用，恢复20点生命。' },
    { id: 'c_med2', name: '续命膏', type: 'CONSUMABLE', subType: 'MEDICINE', effectValue: 50, value: 120, weight: 1, durability: 1, maxDurability: 1, description: '名医秘制的珍贵药膏，药效卓著。在营地中使用，恢复50点生命。' },
    // 修甲工具类
    { id: 'c_rep1', name: '修甲工具', type: 'CONSUMABLE', subType: 'REPAIR_KIT', effectValue: 50, value: 80, weight: 3, durability: 1, maxDurability: 1, description: '简易的铁锤与铆钉，可用于修补甲胄。在营地中使用，恢复50点装备耐久。' },
    { id: 'c_rep2', name: '精铁修甲具', type: 'CONSUMABLE', subType: 'REPAIR_KIT', effectValue: 9999, value: 200, weight: 5, durability: 1, maxDurability: 1, description: '铁匠级别的精良工具套装，可将甲胄完全修复如新。在营地中使用，完全恢复装备耐久。' },
];

export const CITY_NAMES = ['咸阳', '邯郸', '大梁', '临淄', '郢都', '新郑', '蓟城', '洛阳', '寿春', '琅琊', '会稽', '番禺'];
export const SURNAMES = ['赵', '钱', '孙', '李', '周', '吴', '郑', '王', '冯', '陈', '褚', '卫', '蒋', '沈', '韩', '杨', '朱', '秦', '尤', '许', '何', '吕', '施', '张', '孔', '曹', '严', '华', '金', '魏', '陶', '姜', '戚', '谢', '邹', '喻', '柏', '水', '窦', '章'];
export const NAMES_MALE = ['伯', '仲', '叔', '季', '勇', '猛', '刚', '强', '平', '安', '福', '寿', '康', '宁', '文', '武', '德', '才', '光', '明', '虎', '豹', '龙', '非', '忌', '去病', '无忌', '不害', '鞅', '仪', '斯', '恬', '信', '广', '胜', '起', '翦', '贲'];
export const MAP_SIZE = 100; 
export const VIEWPORT_WIDTH = 24; 
export const VIEWPORT_HEIGHT = 14; 
export const MAX_SQUAD_SIZE = 12;
export const VISION_RADIUS = 6;
export const MAX_INVENTORY_SIZE = 30;

// ==================== 任务描述模板池 ====================
// NPC 姓名池
export const QUEST_NPC_NAMES = {
  OFFICIALS: ['赵县令', '孙郡守', '钱主簿', '李亭长', '周太守', '吴司马', '王校尉', '张功曹', '陈廷尉'],
  MERCHANTS: ['陈掌柜', '王老板', '刘行商', '张盐商', '孙丝绸商', '马粮商', '高铁匠', '赵药商', '黄酒坊主'],
  VILLAGERS: ['老李头', '张大娘', '王猎户', '赵寡妇', '刘樵夫', '孙牧人', '陈庄主', '林里正', '何老丈'],
  MILITARY: ['校尉赵刚', '都尉陈武', '百夫长王勇', '守备李昭', '边将韩信', '卫尉张猛'],
  TRIBAL: ['阏氏', '单于使者', '左贤王', '右骨都侯', '当户'],
};

// 地名池
export const QUEST_PLACE_NAMES = {
  NORTHERN_TUNDRA: ['白狼岭', '冰河渡', '风雪关', '苍狼谷', '北望台', '寒铁矿', '朔风隘', '冻土坡', '雪灵山', '霜刃峰'],
  CENTRAL_PLAINS: ['落霞坡', '青牛岗', '柳叶渡', '官道口', '枫林铺', '金鸡岭', '望乡台', '桃花镇', '卧虎岗', '龙门驿'],
  SOUTHERN_WETLANDS: ['雾隐泽', '毒蛇溪', '瘴气林', '百越寨', '蛮荒岭', '幽篁谷', '密林深处', '苍梧山', '象牙潭', '蛟龙湾'],
  FAR_SOUTH_DESERT: ['黄沙渡', '驼铃泉', '流沙城', '烈日谷', '绿洲镇', '沙丘关', '胡杨林', '月牙泉', '戈壁滩', '天山口'],
};

// 各区域各类型的任务描述模板
export const QUEST_TEMPLATES = {
  NORTHERN_TUNDRA: {
    HUNT: [
      {
        targets: ['北疆狼群', '雪狼', '冻土野狼', '白毛狼王', '冰原巨狼'],
        titles: (diff: 1|2|3) => diff === 1 ? '驱逐狼群' : diff === 2 ? '猎杀狼王' : '荡平狼穴',
        descs: [
          (target: string, place: string, npc: string) => `${npc}面色焦虑地说道：「近日${place}一带，有一群${target}频繁出没，已经有三个牧民被咬死了。我已无力再等官府调兵——你们若能去处理此事，报酬绝不会少。」`,
          (target: string, place: string, npc: string) => `${npc}压低声音道：「你可听说了？${place}那边的${target}越来越猖獗了。上个月有个送信的军卒在那里被围攻，尸骨无存。谁能替我除了这祸害，我出双倍赏金。」`,
          (target: string, place: string, npc: string) => `酒肆角落，${npc}拍着桌子道：「我的羊群又被${target}叼走了十几只！${place}都快成狼窝了。要是有好汉肯替我出头，这笔银子我认了。」`,
          (target: string, place: string, _npc: string) => `告示上写道：「${place}近来${target}为患，袭击边民牲畜，甚至有哨兵夜间失踪。凡能清剿此害者，赏黄金若干。」——墨迹尚新，似乎是今早才贴上的。`,
        ],
      },
      {
        targets: ['逃兵', '北疆匪帮', '马贼', '流亡兵卒'],
        titles: (diff: 1|2|3) => diff === 1 ? '缉拿逃兵' : diff === 2 ? '清剿北疆匪帮' : '扫灭马贼头子',
        descs: [
          (target: string, place: string, npc: string) => `${npc}叹了口气：「一群${target}从前线逃回来，在${place}附近烧杀抢掠。朝廷的兵力都被调去了前方，这里只剩我们自己了。能帮帮忙吗？」`,
          (target: string, place: string, npc: string) => `${npc}神色凝重：「${place}那伙${target}已经杀了两个驿卒，朝廷公文都送不出去了。我以个人名义悬赏——不能再等了。」`,
          (target: string, place: string, npc: string) => `${npc}搓着手道：「听说${place}来了一股${target}，个个穷凶极恶。边关的驻军人手不够，你们能不能帮忙剿了他们？钱不是问题。」`,
        ],
      },
      {
        targets: ['匈奴斥候', '游牧骑手', '胡骑前哨', '北狄游骑'],
        titles: (diff: 1|2|3) => diff === 1 ? '驱逐胡骑' : diff === 2 ? '截杀斥候' : '歼灭游骑精锐',
        descs: [
          (target: string, place: string, npc: string) => `${npc}面色严峻：「${place}方向发现了${target}的踪迹，看马蹄印不下十骑。如果是大军前哨，事情就严重了——先去把他们解决掉，别让消息传回去。」`,
          (target: string, place: string, npc: string) => `${npc}压低嗓门：「有牧民在${place}附近撞见了${target}，吓得连羊群都不要就跑了。去看看是什么情况——能杀就杀，杀不了就回来报信。」`,
          (target: string, place: string, _npc: string) => `烽火台传来急报：「${place}方向发现${target}活动迹象，疑为敌军前锋探路。请速派人前往查探歼灭，不可令其回报敌营。」`,
        ],
      },
    ],
    PATROL: [
      {
        titles: (_diff: 1|2|3) => '边境巡逻',
        descs: [
          (place: string, npc: string) => `${npc}递来一卷边报：「${place}一带近来不太平，北方游牧部落的斥候频繁出没。需要一队人沿着边墙巡查一趟，确认没有大队人马南下的迹象。」`,
          (place: string, npc: string) => `${npc}说道：「${place}的哨塔三天前就没了回信。去查看一下情况——如果只是大雪封路还好，怕的是……唉，别想太多，去看看就行。」`,
          (place: string, npc: string) => `${npc}递过一壶热酒：「${place}的守军换防还要三天，但最近那边总有不明骑队出没。去帮他们看看，回来我请你们喝酒。」`,
        ],
      },
    ],
    ESCORT: [
      {
        titles: (_diff: 1|2|3) => '护送辎重',
        descs: [
          (place: string, npc: string) => `${npc}指着几辆大车：「这批皮裘和药材要送到${place}的守军那里，路上风雪大不说，还有马贼出没。你们帮忙护送一趟，赏钱少不了。」`,
          (place: string, npc: string) => `${npc}搓着冻红的手：「${place}的弟兄们快断粮了，这批粮草必须送到。路不好走，还可能碰上狼群或者逃兵——需要你们这样的好手护驾。」`,
        ],
      },
    ],
  },
  CENTRAL_PLAINS: {
    HUNT: [
      {
        targets: ['流寇', '山贼', '劫匪', '盗贼', '响马'],
        titles: (diff: 1|2|3) => diff === 1 ? '剿灭流寇' : diff === 2 ? '清缴山寨' : '讨伐悍匪头目',
        descs: [
          (target: string, place: string, npc: string) => `${npc}一拍桌案：「${place}那帮${target}简直无法无天！前天劫了我三车丝绸，打伤了五个伙计。谁能把他们连窝端了，我不但出赏银，还额外送一车好酒！」`,
          (target: string, place: string, npc: string) => `${npc}苦笑道：「不瞒各位，官道上那伙${target}已经猖狂到光天化日之下拦路收'过路钱'了。${place}附近的商贾苦不堪言。诸位若是有本事，烦请出手相助。」`,
          (target: string, place: string, npc: string) => `告示栏上，${npc}的悬赏令赫然在列：「缉拿${place}一带${target}，此贼屡犯官道，袭杀行商旅客。官府捕快力有不逮，特悬赏民间义士缉拿之。」`,
          (target: string, place: string, _npc: string) => `一个浑身是血的行商跌跌撞撞跑进酒肆：「${place}那边……有一帮${target}……杀了我所有伙计……求求你们……」——酒肆掌柜转头看向你：「诸位好汉，这生意你们接不接？」`,
          (target: string, place: string, npc: string) => `${npc}叹道：「自从那伙${target}盘踞在${place}，周围十里没人敢走夜路。再这样下去，集市都要散了。列位壮士，可否替百姓除此大害？」`,
        ],
      },
      {
        targets: ['叛军残部', '逃犯', '哗变兵卒', '黄巾余党'],
        titles: (diff: 1|2|3) => diff === 1 ? '追缉逃犯' : diff === 2 ? '围剿叛军残部' : '讨伐叛将',
        descs: [
          (target: string, place: string, npc: string) => `${npc}取出一份通缉文书：「${place}附近发现了一伙${target}的踪迹，人数不明，但据报有甲胄兵刃。此事关乎朝廷颜面，赏金从优。」`,
          (target: string, place: string, npc: string) => `${npc}低声道：「此事不宜声张——${place}那伙${target}身上可能还带着重要军情。活捉最好，不行就杀了，但一定要搜回文书。」`,
          (target: string, place: string, npc: string) => `${npc}拍了拍桌上的文书：「${place}那帮${target}又闹事了，这回还绑了个里正的儿子。朝廷催得紧，你们要是能办了这事，赏银加倍。」`,
        ],
      },
      {
        targets: ['邪教徒', '方士余党', '妖言惑众者', '异端教众'],
        titles: (diff: 1|2|3) => diff === 1 ? '清查邪教' : diff === 2 ? '捣毁邪祠' : '铲除邪教首领',
        descs: [
          (target: string, place: string, npc: string) => `${npc}愁眉不展：「${place}那边出了一帮${target}，蛊惑百姓献粮献钱，还扬言要'替天行道'。再不管管，怕是要出大乱子。」`,
          (target: string, place: string, npc: string) => `${npc}正色道：「有密报称${place}附近聚集了一群${target}，私铸兵器，行迹诡秘。此事关系重大——去把他们的老巢端了，务必搜出幕后之人。」`,
          (target: string, place: string, _npc: string) => `酒肆中有人低声议论：「听说${place}那边的${target}又在闹了，半夜里火光冲天，把附近的村民都吓跑了。」——这种事，正需要你们这样的人来解决。`,
        ],
      },
    ],
    PATROL: [
      {
        titles: (_diff: 1|2|3) => '官道巡检',
        descs: [
          (place: string, npc: string) => `${npc}展开地图：「最近${place}一带盗匪活动频繁，官道商旅多有损失。需要一队人沿着主干道巡逻一趟，让那些宵小知道有人在盯着。」`,
          (place: string, npc: string) => `${npc}正色道：「${place}的驿站已经连续两天没有收到邸报了。你们去巡查一下沿途情况，若遇到什么可疑之人，直接拿下。」`,
          (place: string, npc: string) => `${npc}揉着太阳穴：「${place}沿线最近盗案频发，有商人联名上书要求加派巡逻。你们替我跑一趟，顺便震慑一下那些宵小。」`,
        ],
      },
    ],
    ESCORT: [
      {
        titles: (_diff: 1|2|3) => '护送商队',
        descs: [
          (place: string, npc: string) => `${npc}愁眉不展：「我有一批盐铁要运往${place}，但最近路上不太平，上一支商队都被劫了。需要几个靠得住的好手押镖，价钱好商量。」`,
          (place: string, npc: string) => `${npc}说道：「朝廷有批军粮要送到${place}。虽然有文书在手，但这年头匪贼可不认公文。能者多劳——你们来护送，路上安全就好。」`,
          (place: string, npc: string) => `${npc}端着茶杯叹气：「这已经是第三支被劫的商队了……我还有最后一批货要送到${place}，这次说什么也得找几个靠谱的护卫。诸位意下如何？」`,
        ],
      },
    ],
    DELIVERY: [
      {
        titles: (_diff: 1|2|3) => '送信传令',
        descs: [
          (place: string, npc: string) => `${npc}递来一封密信：「这封急报必须在五日内送到${place}。沿途可能有人截杀信使——之前已经折了两个了。你们人多，应该能行。」`,
          (place: string, npc: string) => `${npc}从袖中取出竹简：「这份军令要送到${place}的守将手中，时间紧迫。路上小心——有人不想让这封信送到。」`,
        ],
      },
    ],
  },
  SOUTHERN_WETLANDS: {
    HUNT: [
      {
        targets: ['沼泽蛮人', '密林蛮族', '越人战士', '蛮族猎头', '百越蛮兵'],
        titles: (diff: 1|2|3) => diff === 1 ? '清剿蛮族' : diff === 2 ? '击破蛮寨' : '斩杀蛮王',
        descs: [
          (target: string, place: string, npc: string) => `${npc}面带忧色：「${place}深处的那些${target}越来越大胆了。上个月他们竟然摸到了镇子边上，抢走了十几个年轻人。再不出兵，怕是整个镇子都要被洗劫了。」`,
          (target: string, place: string, npc: string) => `${npc}低声说：「那些${target}在${place}盘踞了好些年了。他们熟悉地形，官兵去了几次都铩羽而归。但你们是佣兵，不受那些条条框框约束——去把他们的头领杀了，报酬翻倍。」`,
          (target: string, place: string, _npc: string) => `瘴气弥漫的告示板上钉着一张布告：「${place}之${target}频繁犯境，劫掠村落无数。现悬赏征募勇士深入密林讨伐，不论生死，凭首级领赏。」`,
          (target: string, place: string, npc: string) => `${npc}拿出一件沾血的蛮族饰物：「这是在${place}找到的——和那些${target}的图腾一模一样。他们已经在筹备下一次大规模袭击了。必须趁他们还没准备好之前先动手。」`,
        ],
      },
      {
        targets: ['水贼', '江匪', '水寨盗匪', '沿河劫匪'],
        titles: (diff: 1|2|3) => diff === 1 ? '清剿水贼' : diff === 2 ? '攻破水寨' : '歼灭江匪头目',
        descs: [
          (target: string, place: string, npc: string) => `${npc}无奈道：「${place}那帮${target}把水路都封了，渔民不敢出船，商船更是绕道百里。你们若能把他们的水寨端了，沿河百姓都念你们的好。」`,
          (target: string, place: string, npc: string) => `${npc}一拍大腿：「又来了！${place}的${target}昨晚又劫了一条粮船！朝廷的漕运都受影响了。这帮贼人不除，日子没法过。」`,
          (target: string, place: string, _npc: string) => `码头上贴着告示：「${place}水域${target}猖獗，凡能剿灭者，赏金从厚。活捉匪首者另有重赏。」`,
        ],
      },
    ],
    PATROL: [
      {
        titles: (_diff: 1|2|3) => '密林侦察',
        descs: [
          (place: string, npc: string) => `${npc}指着地图上一片绿色区域：「${place}附近最近发现了可疑的烟火和脚印。需要人深入林中探查，弄清楚是蛮族的前哨还是只是猎人的营地。」`,
          (place: string, npc: string) => `${npc}蹙眉道：「${place}那片林子里最近常有怪声传出，附近的樵夫都不敢进去了。去看看到底怎么回事——可能是蛮族在集结。」`,
        ],
      },
    ],
    ESCORT: [
      {
        titles: (_diff: 1|2|3) => '护送药商',
        descs: [
          (place: string, npc: string) => `${npc}擦着额头的汗：「我要去${place}收一批珍贵药材，但那片林子蛮族出没，上次去的伙计到现在都没回来。需要几位好手随行保护。」`,
          (place: string, npc: string) => `${npc}拱手道：「有一位大夫要去${place}义诊，但路途凶险。朝廷特拨银两雇人护送——此事功德无量，报酬也不会薄了诸位。」`,
        ],
      },
    ],
    DELIVERY: [
      {
        titles: (_diff: 1|2|3) => '传递军情',
        descs: [
          (place: string, npc: string) => `${npc}取出一个密封的竹筒：「这是前方的军情急报，必须送到${place}的守将手中。走水路太慢，陆路又有蛮族出没——只能靠你们了。」`,
          (place: string, npc: string) => `${npc}低声道：「${place}那边出了急事，需要把这封信尽快送到。林子里不太平，小心蛮族的埋伏。」`,
        ],
      },
    ],
  },
  FAR_SOUTH_DESERT: {
    HUNT: [
      {
        targets: ['胡人劫掠者', '沙匪', '戎狄骑兵', '马匪', '流沙盗'],
        titles: (diff: 1|2|3) => diff === 1 ? '驱逐沙匪' : diff === 2 ? '击退胡骑' : '斩杀沙盗首领',
        descs: [
          (target: string, place: string, npc: string) => `${npc}抹了把额头上的汗：「${place}那帮${target}又来了！每次商队经过都要被劫——已经没人敢走那条路了。你们要是能把他们赶走，我代表整个绿洲感谢你们。」`,
          (target: string, place: string, npc: string) => `${npc}咬牙切齿：「那群${target}把${place}当成了自家地盘！上个月连我们的水井都被霸占了。这是生死之仇——赏金我出，你们只管去杀。」`,
          (target: string, place: string, _npc: string) => `在风沙中摇曳的旗幡上刻着悬赏令：「${place}一带${target}肆虐，劫掠商旅、屠戮无辜。凡能诛灭此贼者，绿洲诸城共出黄金百两。」`,
          (target: string, place: string, npc: string) => `${npc}从怀里掏出一块碎裂的玉佩：「这是我兄弟的遗物……他的商队在${place}被${target}杀了个干净。我没有本事报仇，但我有钱。你们收下定金，替我了结此事。」`,
        ],
      },
      {
        targets: ['沙漠独行客', '荒漠游匪', '绿洲劫匪', '沙丘伏击者'],
        titles: (diff: 1|2|3) => diff === 1 ? '清除路匪' : diff === 2 ? '扫荡沙贼' : '端掉匪巢',
        descs: [
          (target: string, place: string, npc: string) => `${npc}指着地图上的标记：「${place}那条路上近来常有${target}出没，专挑落单的旅人下手。已经有好几个人失踪了——去把他们找出来。」`,
          (target: string, place: string, npc: string) => `${npc}喝了口水润润嗓子：「有商人报告在${place}遭到${target}伏击，虽然侥幸逃脱，但货物全丢了。这些贼人熟悉地形，普通人对付不了——得靠你们。」`,
          (target: string, place: string, _npc: string) => `集市口，一个衣衫褴褛的旅人在哭诉：「${place}有一帮${target}，把我身上最后一文钱都抢走了……」——周围商贩纷纷附和，看来这帮匪徒已经臭名昭著了。`,
        ],
      },
    ],
    PATROL: [
      {
        titles: (_diff: 1|2|3) => '商路护卫',
        descs: [
          (place: string, npc: string) => `${npc}指着远方的沙丘：「${place}那段商路已经好几天没有驼队安全通过了。去巡视一番，顺便确认那些马匪的营地位置——下次我们好一网打尽。」`,
          (place: string, npc: string) => `${npc}展开一幅粗糙的地图：「${place}周围需要定期巡逻，确保商路畅通。上次巡逻的队伍发现了几处可疑营火——这次多留个心眼。」`,
        ],
      },
    ],
    ESCORT: [
      {
        titles: (_diff: 1|2|3) => '护送驼队',
        descs: [
          (place: string, npc: string) => `${npc}一脸恳切：「我有一支驼队要穿过${place}到对面的绿洲去。路上沙匪出没，需要有人护卫。到了地方，报酬照付，一文不少。」`,
          (place: string, npc: string) => `${npc}递来一袋水囊：「这支驼队载着丝绸和香料，价值连城。经过${place}时最危险——那帮沙匪肯定会来劫。我出高价雇你们护送。」`,
        ],
      },
    ],
    DELIVERY: [
      {
        titles: (_diff: 1|2|3) => '紧急传信',
        descs: [
          (place: string, npc: string) => `${npc}递来一个密封的皮袋：「这封信要送到${place}的守将手中，十万火急。沙暴季节路不好走，还有马匪——但这信关系到整个绿洲的安危。」`,
          (place: string, npc: string) => `${npc}低声道：「${place}那边的水源出了问题，需要尽快把消息送到绿洲长老手中。路上快些——沙漠里拖不得。」`,
        ],
      },
    ],
  },
};

// 高声望专属任务模板
export const ELITE_QUEST_TEMPLATES = {
  NORTHERN_TUNDRA: [
    {
      type: 'HUNT' as const,
      targets: ['北疆巨熊', '冰原霸主', '白毛王狼'],
      titles: (diff: 1|2|3) => diff === 3 ? '猎杀冰原霸主' : '征讨极北巨兽',
      descs: [
        (target: string, place: string, npc: string) => `${npc}慎重地从袖中取出密令：「${place}出现了一头${target}——不是普通的野兽，连驻军校尉都折了两个什伍在它手上。此事不能公开悬赏，只有你们这种有声望的战团才信得过。报酬丰厚，但生死自负。」`,
      ],
      minDifficulty: 3 as 1|2|3,
      requiredReputation: 200,
    },
    {
      type: 'HUNT' as const,
      targets: ['匈奴前锋', '北狄精骑', '单于亲卫'],
      titles: (_diff: 1|2|3) => '截击敌军先锋',
      descs: [
        (target: string, place: string, npc: string) => `${npc}面色如铁：「斥候回报，${place}方向发现了一支${target}，人数约五十骑，正往边墙方向移动。驻军不敢轻动——但你们可以。在他们到达之前截住他们，赏格从优。」`,
        (target: string, place: string, npc: string) => `${npc}将一面令旗拍在桌上：「持此令旗，前往${place}截击${target}。此战关系到整个北疆防线的安危——朝廷不会亏待有功之人。」`,
      ],
      minDifficulty: 3 as 1|2|3,
      requiredReputation: 300,
    },
    {
      type: 'PATROL' as const,
      targets: ['匈奴斥候', '北狄游骑'],
      titles: (_diff: 1|2|3) => '深入敌境侦察',
      descs: [
        (target: string, place: string, npc: string) => `${npc}展开一幅残破的地图：「我们需要有人越过边墙，深入${place}侦察${target}的兵力部署。这趟差事九死一生——但只有你们这样的精锐才能胜任。」`,
      ],
      minDifficulty: 2 as 1|2|3,
      requiredReputation: 400,
    },
  ],
  CENTRAL_PLAINS: [
    {
      type: 'HUNT' as const,
      targets: ['山寨大头领', '太行群盗', '黑风寨主'],
      titles: (_diff: 1|2|3) => '围剿巨寇',
      descs: [
        (target: string, place: string, npc: string) => `${npc}用朱笔在地图上重重画了个圈：「${place}的${target}已经盘踞多年，手下精兵数百，占山为王。朝廷数次围剿皆无功而返。如今只能另辟蹊径——你们的战团声名远扬，能否替朝廷除此大患？赏金——你开价。」`,
      ],
      minDifficulty: 3 as 1|2|3,
      requiredReputation: 300,
    },
    {
      type: 'ESCORT' as const,
      targets: [],
      titles: (_diff: 1|2|3) => '护送朝廷密使',
      descs: [
        (_target: string, place: string, npc: string) => `${npc}左右张望了一下，确认无人偷听：「有一位……身份特殊的人物，需要秘密护送到${place}。路上必定有人截杀。这趟活儿只有信得过的人才能做——你们的声望够格。」`,
      ],
      minDifficulty: 2 as 1|2|3,
      requiredReputation: 400,
    },
    {
      type: 'HUNT' as const,
      targets: ['叛军主力', '反贼大将', '义军首领'],
      titles: (_diff: 1|2|3) => '平定叛乱',
      descs: [
        (target: string, place: string, npc: string) => `${npc}拿出一份加盖了朝廷大印的文书：「${place}的${target}已经聚众数千，公然对抗朝廷。正规军正在调集，但远水救不了近火——需要你们先去拖住他们，甚至……直接斩首。赏金，够买下半座城。」`,
        (target: string, place: string, npc: string) => `${npc}压低声音：「${place}的${target}实力不可小觑，据说手下有不少老兵油子。朝廷的意思是——不惜代价，尽快解决。你们是唯一信得过的战团。」`,
      ],
      minDifficulty: 3 as 1|2|3,
      requiredReputation: 600,
    },
    {
      type: 'HUNT' as const,
      targets: ['邪教教主', '方术宗师', '妖僧'],
      titles: (_diff: 1|2|3) => '诛邪除魔',
      descs: [
        (target: string, place: string, npc: string) => `${npc}神情严肃：「${place}有一个${target}，蛊惑了数百信众，已经开始公然对抗官府。此人诡计多端，身边还有死士护卫——必须派最精锐的人去。你们的声望够格接这个活。」`,
      ],
      minDifficulty: 3 as 1|2|3,
      requiredReputation: 300,
    },
  ],
  SOUTHERN_WETLANDS: [
    {
      type: 'HUNT' as const,
      targets: ['蛮王近卫', '越族大祭司', '丛林霸主'],
      titles: (_diff: 1|2|3) => '深入蛮荒',
      descs: [
        (target: string, place: string, npc: string) => `${npc}展开一幅手绘地图，上面标满了危险标记：「${place}最深处有一个${target}的据点。普通兵卒进去就是送死——瘴气、毒虫、陷阱，样样要人命。但你们不一样。你们是久经沙场的老手。去把那祸根拔了——报酬，我会让你满意的。」`,
      ],
      minDifficulty: 3 as 1|2|3,
      requiredReputation: 300,
    },
    {
      type: 'HUNT' as const,
      targets: ['百越联军', '蛮族大酋长', '越王余部'],
      titles: (_diff: 1|2|3) => '讨伐蛮王',
      descs: [
        (target: string, place: string, npc: string) => `${npc}站在沙盘前，指着${place}的位置：「${target}集结了周围数个部落的力量，正在筹备大规模南侵。朝廷的大军至少还要一个月才能到——我们等不了那么久。你们的战团是唯一能在这个时间内解决问题的力量。」`,
        (target: string, place: string, npc: string) => `${npc}递来一柄蛮族短刀：「这是从${place}阵亡的哨兵身上找到的。${target}的势力已经膨胀到了危险的程度。朝廷需要一支精锐，深入密林将其斩首——非你们莫属。」`,
      ],
      minDifficulty: 3 as 1|2|3,
      requiredReputation: 400,
    },
    {
      type: 'ESCORT' as const,
      targets: [],
      titles: (_diff: 1|2|3) => '护送朝廷特使',
      descs: [
        (_target: string, place: string, npc: string) => `${npc}环顾四周后低声道：「朝廷派了一位特使前往${place}与百越首领议和。此行凶险万分——不但蛮族中有人反对和谈，朝中也有人不想让此事成功。需要你们这样声望卓著的战团全程护卫。」`,
      ],
      minDifficulty: 2 as 1|2|3,
      requiredReputation: 400,
    },
  ],
  FAR_SOUTH_DESERT: [
    {
      type: 'HUNT' as const,
      targets: ['沙盗王', '戎狄大汗', '胡骑精锐'],
      titles: (_diff: 1|2|3) => '斩首行动',
      descs: [
        (target: string, place: string, npc: string) => `${npc}从锁着的箱子里取出一份文书：「${place}的${target}手握数百精骑，已经严重威胁到了整条丝路的安全。朝廷拨了一笔特别军费——但这钱不是给正规军的，是给你们这样的人的。条件只有一个：把头领的人头带回来。」`,
      ],
      minDifficulty: 3 as 1|2|3,
      requiredReputation: 400,
    },
    {
      type: 'HUNT' as const,
      targets: ['沙漠霸主', '大漠枭雄', '西域马王'],
      titles: (_diff: 1|2|3) => '荡平沙匪王庭',
      descs: [
        (target: string, place: string, npc: string) => `${npc}将一块令牌推到你面前：「${place}的${target}——整个南疆最大的祸患。他手下有上千骑兵，控制了三处绿洲的水源。朝廷给了死命令：不惜一切代价除掉此人。持此令牌，你可以调动沿途所有驿站的物资补给。」`,
        (target: string, place: string, npc: string) => `${npc}叹了口气：「多少人死在了${place}……${target}的势力太大了，朝廷的正规军每次出征都被游击战术拖垮。但你们不一样——小股精锐，快进快出。这可能是唯一的办法。」`,
      ],
      minDifficulty: 3 as 1|2|3,
      requiredReputation: 600,
    },
    {
      type: 'ESCORT' as const,
      targets: [],
      titles: (_diff: 1|2|3) => '护送使团出塞',
      descs: [
        (_target: string, place: string, npc: string) => `${npc}正了正衣冠：「朝廷要派使团前往${place}与西域诸国通好。路途遥远，沙匪横行——需要一支信得过的精锐护卫。你们战团声名远播，正合此任。」`,
      ],
      minDifficulty: 2 as 1|2|3,
      requiredReputation: 300,
    },
  ],
};

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

// ==================== 合围机制 (Surrounding Bonus) ====================

/** 每个额外邻接敌人的命中率加成 */
export const SURROUND_BONUS_PER_UNIT = 5;

/** 合围加成上限 */
export const SURROUND_BONUS_MAX = 25;

/**
 * 计算合围加成
 * 统计目标周围与攻击者同阵营的存活单位数（不含攻击者自身），
 * 每个额外单位 +5% 命中率，最多 +25%。
 * 
 * @param attacker 攻击者
 * @param target 目标
 * @param state 战斗状态
 * @returns 合围加成百分比（0~25）
 */
export const getSurroundingBonus = (
  attacker: CombatUnit,
  target: CombatUnit,
  state: CombatState
): number => {
  // 统计目标周围1格内与攻击者同阵营的存活单位数（不含攻击者）
  const adjacentAllies = state.units.filter(u =>
    !u.isDead &&
    u.team === attacker.team &&
    u.id !== attacker.id &&
    getHexDistance(u.combatPos, target.combatPos) === 1
  );
  const bonus = adjacentAllies.length * SURROUND_BONUS_PER_UNIT;
  return Math.min(bonus, SURROUND_BONUS_MAX);
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
  heightDiff: number = 0
): HitChanceBreakdown => {
  const isRanged = attacker.equipment.mainHand?.range
    ? attacker.equipment.mainHand.range > 1
    : false;
  // 对远程武器的判定：检查主手武器是否为弓/弩类
  const weaponName = attacker.equipment.mainHand?.name || '';
  const isRangedByName = weaponName.includes('弓') || weaponName.includes('弩') ||
    weaponName.includes('飞石') || weaponName.includes('飞蝗') ||
    weaponName.includes('标枪') || weaponName.includes('投矛') || weaponName.includes('飞斧');

  // 基础技能
  const baseSkill = isRangedByName
    ? attacker.stats.rangedSkill
    : attacker.stats.meleeSkill;

  // 目标防御
  const targetDefense = isRangedByName
    ? target.stats.rangedDefense
    : target.stats.meleeDefense;

  // 武器命中修正
  const weapon = attacker.equipment.mainHand;
  const weaponMod = weapon?.hitChanceMod || 0;

  // 士气修正
  const moraleEffects = getMoraleEffects(attacker.morale);
  const moraleMod = moraleEffects.hitChanceMod || 0;

  // 盾牌防御
  const targetShield = target.equipment.offHand;
  const shieldDef = (targetShield?.type === 'SHIELD' && targetShield.defenseBonus)
    ? targetShield.defenseBonus
    : 0;

  // 盾墙额外防御
  const shieldWallDef = (target.isShieldWall && targetShield?.type === 'SHIELD') ? 15 : 0;

  // 高地修正
  let heightMod = 0;
  if (heightDiff > 0) heightMod = 10;
  else if (heightDiff < 0) heightMod = -10;

  // 合围加成
  const surroundBonus = getSurroundingBonus(attacker, target, state);

  // 最终命中率
  let final = baseSkill - targetDefense + weaponMod + moraleMod - shieldDef - shieldWallDef + heightMod + surroundBonus;
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
