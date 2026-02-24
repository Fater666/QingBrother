/**
 * 红武（UNIQUE品质）专属效果服务
 *
 * 每把红武拥有独特效果，分为主动技能（10把）和被动效果（5把）：
 *
 * 【主动技能】通过 constants.ts getUnitAbilities 分配给单位，战斗中主动释放：
 * - 干将「焚剑」/ 莫邪「影刺」/ 太阿「天子之威」
 * - 盘古斧「开天辟地」/ 金刚锤「金刚碎」/ 雷公鞭「雷霆万钧」
 * - 龙牙刀「斩铁」/ 霸王枪「横扫千军」/ 荆轲匕「见血封喉」/ 养由基弓「百步穿杨」
 *
 * 【被动效果】在各模块中按武器ID分别集成：
 * - 纯钧 → constants.ts calculateHitChance + damageService.ts
 * - 湛卢 → constants.ts calculateHitChance (防御加成)
 * - 项羽戟 → damageService.ts
 * - 破军锤 → CombatView.tsx getHammerBashStunChance
 * - 连弩 → CombatView.tsx (射击后自动装填)
 */

import { Item } from '../types';

export interface UniqueWeaponEffect {
  name: string;
  description: string;
  type: 'active' | 'passive';
}

/** 红武效果映射表 */
export const UNIQUE_WEAPON_EFFECTS: Record<string, UniqueWeaponEffect> = {
  // ========== 主动技能（10把）==========
  'w_unique_ganjiang': {
    name: '焚剑',
    type: 'active',
    description: '【主动】阳气全力一击，造成150%伤害。对HP>50%的目标额外+15%。（AP:6 疲:25）',
  },
  'w_unique_moye': {
    name: '影刺',
    type: 'active',
    description: '【主动】阴影突袭，命中+25%，伤害×1.3。对HP≤50%目标额外+20%。（AP:5 疲:20）',
  },
  'w_unique_taie': {
    name: '天子之威',
    type: 'active',
    description: '【主动】释放天子剑意，周围4格所有敌人进行士气检定。（AP:5 疲:30）',
  },
  'w_unique_pangu': {
    name: '开天辟地',
    type: 'active',
    description: '【主动】全力一斧，攻击目标并对其相邻1名敌人造成50%溅射伤害。（AP:7 疲:30）',
  },
  'w_unique_jingang': {
    name: '金刚碎',
    type: 'active',
    description: '【主动】碎甲重击，额外破坏目标护甲最大耐久25%，击晕概率+25%。（AP:6 疲:25）',
  },
  'w_unique_leigong': {
    name: '雷霆万钧',
    type: 'active',
    description: '【主动】雷神之击，伤害×1.3，必定击晕1回合，无视盾牌防御。（AP:6 疲:25）',
  },
  'w_unique_longya': {
    name: '斩铁',
    type: 'active',
    description: '【主动】斩铁式，护甲伤害×3。（AP:6 疲:22）',
  },
  'w_unique_bawang': {
    name: '横扫千军',
    type: 'active',
    description: '【主动】横扫攻击，对目标及其相邻1名敌人造成伤害（溅射60%）。击杀回复4AP。（AP:7 疲:30）',
  },
  'w_unique_jingke': {
    name: '见血封喉',
    type: 'active',
    description: '【主动】刺向要害（强制头部）。目标HP<30%时伤害×3，否则伤害×1.5。（AP:5 疲:20）',
  },
  'w_unique_yangyouji': {
    name: '百步穿杨',
    type: 'active',
    description: '【主动】神射，无距离惩罚，命中+25%，伤害×1.5。（AP:7 疲:25）',
  },

  // ========== 被动效果（5把）==========
  'w_unique_chunjun': {
    name: '百发百中',
    type: 'passive',
    description: '【被动】命中率下限为75%。反击伤害额外提高25%。',
  },
  'w_unique_zhanlu': {
    name: '仁者守护',
    type: 'passive',
    description: '【被动】被近战攻击时防御+10，满血时额外+5。',
  },
  'w_unique_xiangyu': {
    name: '破釜沉舟',
    type: 'passive',
    description: '【被动】生命值低于50%时，伤害提高25%，穿甲率提高10%。',
  },
  'w_unique_pojun': {
    name: '震慑',
    type: 'passive',
    description: '【被动】击晕概率+20%。击晕判定时忽略目标50%的胆识抗性。',
  },
  'w_unique_liannu': {
    name: '机关连发',
    type: 'passive',
    description: '【被动】射击后自动装填，无需手动装填。',
  },
};

/** 获取红武效果配置 */
export const getUniqueWeaponEffect = (weaponId: string): UniqueWeaponEffect | null => {
  return UNIQUE_WEAPON_EFFECTS[weaponId] || null;
};

/** 检查武器是否有红武效果 */
export const hasUniqueEffect = (weapon: Item | null): boolean => {
  if (!weapon) return false;
  return weapon.id in UNIQUE_WEAPON_EFFECTS;
};

/** 获取红武效果描述（用于UI显示） */
export const getUniqueEffectDescription = (weaponId: string): string | null => {
  const effect = UNIQUE_WEAPON_EFFECTS[weaponId];
  return effect ? `【${effect.name}】${effect.description}` : null;
};
