
import { Item, Ability, Character, Perk, BackgroundTemplate } from './types.ts';
export type { BackgroundTemplate };

// --- EMBEDDED CSV DATA ---
const WEAPONS_CSV = `id|name|value|weight|durability|dmgMin|dmgMax|armorPen|armorDmg|fatigueCost|range|hitChanceMod|description
w_sword_1|锈蚀铁剑|120|6|40|20|35|0.1|0.7|8|1|5|一把缺口的铁剑，胜在轻便。
w_sword_2|青铜长剑|350|8|60|35|45|0.2|0.8|10|1|5|战国时期标准的制式武器，平衡性极佳。
w_sword_3|八面汉剑|1200|9|90|45|55|0.25|0.9|12|1|10|精钢锻造，剑身修长，能轻易刺穿轻甲。
w_axe_1|伐木斧|80|12|50|30|50|0.3|1.2|14|1|0|原本用来伐木，但劈开脑袋也同样好用。
w_axe_2|宣花大斧|450|16|70|45|70|0.4|1.5|18|1|0|沉重的战斧，能轻易粉碎盾牌和铠甲。
w_spear_1|竹枪|40|5|20|20|30|0.1|0.5|10|1|20|削尖的竹子，聊胜于无。
w_spear_2|青铜矛|300|10|60|30|40|0.2|0.8|14|1|20|百兵之王，极高的命中率使其成为新兵首选。
w_pole_1|青铜戈|400|14|50|40|60|0.3|1.1|18|2|5|勾啄结合，适合攻击阵列后方的敌人。
w_pole_2|精铁长戟|900|18|80|55|80|0.35|1.3|20|2|10|结合了矛与戈的优点，威力巨大。
w_mace_1|包铁木棒|150|12|50|25|45|0.4|1.4|14|1|0|简单粗暴，对付重甲单位有奇效。
w_mace_2|青铜殳|500|15|90|35|55|0.5|1.8|16|1|0|沉重的钝器，哪怕没有击穿护甲也能震碎骨骼。
w_bow_1|猎弓|200|6|40|25|40|0.1|0.4|12|6|-5|普通的木弓。
w_xbow_1|秦弩|600|15|50|40|70|0.6|0.8|20|6|10|秦军制式重弩，破甲能力极强，但装填缓慢。`;

const ARMOR_CSV = `id|name|value|weight|durability|maxFatiguePenalty|description
a_cloth|粗布衣|20|2|30|0|几乎没有防护作用。
a_robe|厚战袍|80|5|50|3|多层麻布缝制的战袍，能缓冲轻微打击。
a_leather|皮甲|250|10|90|8|硬化处理的牛皮甲，平衡了防护与灵活性。
a_lamellar_l|合甲 (轻)|600|18|140|14|双层皮革夹着青铜片。
a_lamellar_h|青铜扎甲|1500|28|210|22|精良的青铜甲片编缀而成，坚固但沉重。
a_scale|精铁鱼鳞甲|3200|35|300|30|将领级别的重甲，普通刀剑难以伤其分毫。`;

const HELMETS_CSV = `id|name|value|weight|durability|maxFatiguePenalty|description
h_hood|头巾|15|1|20|0|裹在头上的布，只能防晒。
h_cap|皮弁|120|4|50|2|硬皮制成的帽子，保护头顶。
h_bronze|青铜胄|400|8|120|6|制式青铜头盔，提供良好的防护。
h_iron|铁面兜鍪|1100|12|200|10|带有铁面具的重型头盔，令人望而生畏。`;

const SHIELDS_CSV = `id|name|value|weight|durability|defenseBonus|rangedBonus|fatigueCost|description
s_buckler|藤牌|80|4|20|10|5|4|轻便的藤编盾牌，能格挡一些轻微攻击。
s_round|蒙皮圆盾|200|10|40|15|15|8|标准的步兵盾牌。
s_tower|楚式大盾|500|20|80|25|30|16|如同一堵墙壁，提供极佳的防护，但非常沉重。`;

const BACKGROUNDS_CSV = `id|name|icon|salaryMult|gearQuality|hpMod|fatigueMod|resolveMod|meleeSkillMod|rangedSkillMod|defMod|initMod|desc
FARMER|农夫|🌾|0.8|0|5,15|10,20|-5,5|-5,5|-5,5|-5,0|-5,5|失去土地的农民。
DESERTER|逃兵|🏳️|1.2|1|0,10|0,10|-15,-5|10,15|5,10|5,10|0,5|从战场上逃离的士兵。
HUNTER|猎户|🏹|1.5|0|-5,5|5,15|0,10|0,5|15,25|0,5|10,20|山林中的猎人。
NOMAD|胡人游骑|🐎|1.8|1|5,10|15,25|5,15|5,10|5,15|5,10|5,15|来自北方的游牧民。
NOBLE|落魄士族|📜|3.0|2|-10,0|-10,0|15,25|15,20|-5,0|5,15|0,5|家道中落的士族子弟。
MONK|游方方士|☯️|1.4|0|-5,5|-5,5|20,40|-10,0|-10,0|10,20|-5,5|云游四方的方士。
BANDIT|山贼|👺|1.0|0|5,10|0,10|0,5|5,10|0,10|0,5|0,5|以此为生的亡命之徒。`;

const PERKS_CSV = `id|name|tier|icon|description
colossus|强体|1|💪|生命值上限提高 25%。
nine_lives|命不该绝|1|🐈|每次战斗中第一次受到致命伤时，生命值保留 1 点并移除所有流血中毒效果。
recover|调息|1|😤|解锁技能“调息”：花费9AP，清除当前积累疲劳值的 50%。
adrenaline|血勇|1|💉|解锁技能“血勇”：花费1AP，下回合行动顺序提前至最先。
pathfinder|识途|1|🧭|所有地形的移动AP消耗减少 1 点（最低为2），疲劳消耗减半。
bags_and_belts|行囊|1|🎒|解锁全部 4 个背包格子（默认为 2 格）。
fast_adaptation|临机应变|1|🎯|每次攻击未命中，下一次攻击命中率叠加 +10%，命中后重置。
crippling_strikes|致残击|1|🦴|造成伤害引发“重伤”的门槛降低 33%。
student|学徒|1|📖|获得经验值增加 20%。达到 Lv11 时返还此技能点。
dodge|身法|2|🍃|获得相当于当前“先手”值 15% 的近战和远程防御加成。
gifted|天赋异禀|2|✨|立即获得一次额外的升级属性机会（全属性最大值）。
fortified_mind|定胆|2|🧠|“胆识”提高 25%。
resilient|硬命|2|🦠|流血、中毒等负面状态的持续时间减少 1 回合。
steel_brow|铁额|2|🤕|头部受到攻击不再遭受暴击伤害。
quick_hands|换器如风|2|👐|每回合第一次切换武器不消耗 AP。
bullseye|神射|2|👁️|攻击被遮挡目标的命中率惩罚降低。
executioner|补刀手|2|💀|对受到“重伤”影响的敌人，伤害增加 20%。
backstabber|合围|3|🔪|包围加成的命中率翻倍。
anticipation|预判|3|👀|根据远程防御值的 10% 额外增加被远程攻击时的防御。
shield_expert|盾法精通|3|🛡️|盾牌防御加成 +25%。盾牌受到破盾技能的伤害减少。
brawny|负重者|3|🏋️|身甲和头盔造成的最大体力惩罚减少 30%。
relentless|不息|3|🏃|当前疲劳值对“先手”属性的惩罚减半。
rotation|换位|3|🔄|解锁技能“换位”：与相邻盟友交换位置。
rally|振军|3|📢|解锁技能“振军”：提高范围内盟友的士气。
taunt|挑衅|3|🤬|解锁技能“挑衅”：迫使敌人优先攻击自己。
sword_mastery|剑术精通|4|🗡️|剑类技能疲劳消耗 -25%。反击不再受命中惩罚。
spear_mastery|枪术精通|4|🔱|枪矛技能疲劳消耗 -25%。矛墙命中后不再自动解除。
polearm_mastery|长兵精通|4|🍢|长柄武器技能疲劳消耗 -25%。攻击AP消耗减至 5 点。
axe_mastery|斧钺精通|4|🪓|斧类技能疲劳消耗 -25%。增加对盾牌的破坏力。
hammer_mastery|重锤精通|4|🔨|锤类技能疲劳消耗 -25%。对护甲造成的伤害增加 33%。
flail_mastery|连枷精通|4|⛓️|连枷技能疲劳消耗 -25%。无视盾牌防御加成。
cleaver_mastery|斩刀精通|4|🍖|砍刀技能疲劳消耗 -25%。流血伤害翻倍。
dagger_mastery|匕首精通|4|🗡️|匕首技能疲劳消耗 -25%。普通攻击只需 3 AP。
bow_mastery|弓术精通|4|🏹|弓类技能疲劳消耗 -25%。射程 +1。
crossbow_mastery|弩术精通|4|🔫|弩类技能疲劳消耗 -25%。穿甲伤害 +20%。
throwing_mastery|投掷精通|4|🪃|投掷技能疲劳消耗 -25%。距离越近伤害越高。
lone_wolf|独胆|5|🐺|若周围 3 格内无盟友，全属性 +15%。
underdog|破围|5|🛡️|敌人对自己进行包围攻击时，不再获得包围加成。
footwork|脱身|5|💨|解锁技能“脱身”：无视敌人控制区移动一格。
overwhelm|压制|5|🌩️|每次攻击命中或被格挡，令目标下回合全攻击力 -10%。
reach_advantage|兵势|5|📏|每次双手武器攻击命中，近战防御 +5。
nimble|轻甲流|6|🤸|受到的生命值伤害降低，越轻越硬，最高减伤 60%。
battle_forged|重甲流|6|🏰|受到的护甲伤害降低，降低幅度为当前总护甲值的 5%。
berserk|狂战|6|😡|每回合第一次击杀敌人，立即回复 4 AP。
head_hunter|索首|6|🤯|每次攻击命中身体，下次攻击必定命中头部。
killing_frenzy|杀意|7|🩸|击杀敌人后，所有攻击伤害增加 25%，持续 2 回合。
duelist|独胆宗师|7|🤺|当副手空缺时，单手武器攻击无视额外 25% 的护甲。
fearsome|威压|7|👻|任何造成至少 1 点伤害的攻击都会触发敌人的士气检定。
indomitable|不屈|7|🗿|解锁技能“不屈”：受到伤害减半，持续1回合。`;

const TERRAIN_CSV = `id|name|color|moveCost|height|icon
PLAINS|平原|#3d4a2a|2|0|🌾
FOREST|森林|#1a2e1a|3|1|🌲
MOUNTAIN|山地|#2f2f2f|8|3|⛰️
SWAMP|沼泽|#1b2621|5|-1|🌫️
CITY|城邑|#4a3b2a|1|1|🏯
RUINS|遗迹|#2a2a2a|3|1|🏚️
SNOW|雪原|#e2e8f0|3|1|❄️
DESERT|荒漠|#9a7b4f|3|0|🏜️
ROAD|官道|#786c55|1|0|🛣️`;

// --- CSV PARSER UTILITY ---
const parseCSV = (csv: string, headers: string[]): any[] => {
  const lines = csv.trim().split('\n');
  return lines.map(line => {
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
export const WEAPON_TEMPLATES: Item[] = parseCSV(WEAPONS_CSV, [
  'id', 'name', 'value', 'weight', 'durability', 'dmgMin', 'dmgMax', 'armorPen', 'armorDmg', 'fatigueCost', 'range', 'hitChanceMod', 'description'
]).map(w => ({
  ...w,
  type: 'WEAPON',
  maxDurability: w.durability,
  damage: [w.dmgMin, w.dmgMax]
}));

export const ARMOR_TEMPLATES: Item[] = parseCSV(ARMOR_CSV, [
  'id', 'name', 'value', 'weight', 'durability', 'maxFatiguePenalty', 'description'
]).map(a => ({ ...a, type: 'ARMOR', maxDurability: a.durability }));

export const HELMET_TEMPLATES: Item[] = parseCSV(HELMETS_CSV, [
  'id', 'name', 'value', 'weight', 'durability', 'maxFatiguePenalty', 'description'
]).map(h => ({ ...h, type: 'HELMET', maxDurability: h.durability }));

export const SHIELD_TEMPLATES: Item[] = parseCSV(SHIELDS_CSV, [
  'id', 'name', 'value', 'weight', 'durability', 'defenseBonus', 'rangedBonus', 'fatigueCost', 'description'
]).map(s => ({ ...s, type: 'SHIELD', maxDurability: s.durability }));

export const PERK_TREE: Record<string, Perk> = {};
parseCSV(PERKS_CSV, ['id', 'name', 'tier', 'icon', 'description']).forEach(p => {
    PERK_TREE[p.id] = p;
});

export const TERRAIN_DATA: Record<string, any> = {};
parseCSV(TERRAIN_CSV, ['id', 'name', 'color', 'moveCost', 'height', 'icon']).forEach(t => {
    TERRAIN_DATA[t.id] = t;
});

const STORIES: Record<string, string[]> = {
    'FARMER': ['原本在垄亩间耕作，直到秦军的征粮官拿走了最后一粒米。', '一场大旱毁了他的庄稼，为了不让家人饿死。', '因为不堪忍受沉重的徭役。'],
    'DESERTER': ['长平之战的幸存者之一。', '他在一次夜袭中扔掉了戈矛。', '作为前锋营的死士，他奇迹般地活了下来。'],
    'HUNTER': ['他曾独自在深山中追踪猛虎。', '官府划定了新的禁苑。', '他的村庄被土匪洗劫。'],
    'NOMAD': ['因为部落间的仇杀，他失去了牛羊。', '他向往中原的繁华，骑着瘦马一路南下。'],
    'NOBLE': ['他的家族在政治斗争中败落。', '为了复兴家族的荣光，他散尽家财。', '他曾是稷下学宫的学子。'],
};

export const BACKGROUNDS: Record<string, BackgroundTemplate> = {};
parseCSV(BACKGROUNDS_CSV, [
    'id', 'name', 'icon', 'salaryMult', 'gearQuality', 'hpMod', 'fatigueMod', 'resolveMod', 'meleeSkillMod', 'rangedSkillMod', 'defMod', 'initMod', 'desc'
]).forEach(bg => {
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
