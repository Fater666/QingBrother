
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
        // 投掷类武器优先检查（名称可能包含 枪/矛/斧 等字，需优先匹配）
        if (main.name.includes('飞石') || main.name.includes('飞蝗') || main.name.includes('标枪') || main.name.includes('投矛') || main.name.includes('飞斧')) {
            skills.push(ABILITIES['THROW']);
        }
        // 匕首类
        else if (main.name.includes('匕')) { skills.push(ABILITIES['PUNCTURE']); skills.push(ABILITIES['SLASH']); }
        // 剑类
        else if (main.name.includes('剑')) { skills.push(ABILITIES['SLASH']); if(main.value>200) skills.push(ABILITIES['RIPOSTE']); }
        // 斧类
        else if (main.name.includes('斧')) { skills.push(ABILITIES['CHOP']); skills.push(ABILITIES['SPLIT_SHIELD']); }
        // 刀类（厨刀、环首刀、斩马刀等）
        else if (main.name.includes('刀')) { skills.push(ABILITIES['SLASH']); }
        // 矛/枪类
        else if (main.name.includes('矛') || main.name.includes('枪')) { skills.push(ABILITIES['THRUST']); skills.push(ABILITIES['SPEARWALL']); }
        // 锤类（石锤、铁骨朵锤等）
        else if (main.name.includes('锤') || main.name.includes('骨朵')) { skills.push(ABILITIES['BASH']); }
        // 棒/殳类
        else if (main.name.includes('棒') || main.name.includes('殳')) { skills.push(ABILITIES['BASH']); }
        // 鞭/锏/铁链类（铁连鞭、精钢狼牙锏、木柄铁链等）
        else if (main.name.includes('鞭') || main.name.includes('锏') || main.name.includes('铁链')) { skills.push(ABILITIES['BASH']); }
        // 戈/戟类
        else if (main.name.includes('戈') || main.name.includes('戟')) { skills.push(ABILITIES['IMPALE']); }
        // 野兽天然武器（爪/牙）
        else if (main.name.includes('爪') || main.name.includes('牙') || main.name.includes('獠')) { skills.push(ABILITIES['BITE']); }
        // 弓类
        else if (main.name.includes('弓')) { skills.push(ABILITIES['SHOOT']); }
        // 弩类
        else if (main.name.includes('弩')) { skills.push(ABILITIES['SHOOT']); skills.push(ABILITIES['RELOAD']); }
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
