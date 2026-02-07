/**
 * 野心目标系统服务 - 《战场兄弟》风格的野心(Ambition)机制
 * 
 * 核心功能：
 * 1. 野心模板定义与条件检测
 * 2. 候选目标生成（含条件门槛过滤）
 * 3. 完成/取消目标的状态管理
 * 4. 声望对合同出价的加成
 */

import { Ambition, AmbitionState, AmbitionType, Party, Item } from '../types';

// ==================== 默认状态 ====================

export const DEFAULT_AMBITION_STATE: AmbitionState = {
  currentAmbition: null,
  completedIds: [],
  lastCancelledIds: [],
  nextSelectionDay: 1,       // 第1天即可选择
  noAmbitionUntilDay: 0,
  totalCompleted: 0,
  battlesWon: 0,
  citiesVisited: [],
};

// ==================== 野心模板 ====================

export interface AmbitionTemplate extends Ambition {
  /** 检测是否满足完成条件 */
  checkComplete: (party: Party) => boolean;
  /** 检测是否满足出现条件（不满足则不会出现在候选中） */
  checkAvailable: (party: Party) => boolean;
  /** 进度描述（可选，用于HUD显示） */
  getProgress?: (party: Party) => string;
}

const AMBITION_TEMPLATES: AmbitionTemplate[] = [
  // ==================== 战斗类 ====================
  {
    id: 'first_victory',
    name: '初战告捷',
    description: '赢得第一场战斗，证明你的战团并非乌合之众。',
    type: 'COMBAT',
    reputationReward: 100,
    checkComplete: (party) => party.ambitionState.battlesWon >= 1,
    checkAvailable: (party) => party.ambitionState.battlesWon === 0,
  },
  {
    id: 'win_5_battles',
    name: '百战之师',
    description: '累计赢得5场战斗。',
    type: 'COMBAT',
    reputationReward: 100,
    checkComplete: (party) => party.ambitionState.battlesWon >= 5,
    checkAvailable: (party) => party.ambitionState.battlesWon < 5,
    getProgress: (party) => `${Math.min(party.ambitionState.battlesWon, 5)}/5`,
  },
  {
    id: 'win_15_battles',
    name: '纵横沙场',
    description: '累计赢得15场战斗，令天下闻名。',
    type: 'COMBAT',
    reputationReward: 100,
    checkComplete: (party) => party.ambitionState.battlesWon >= 15,
    checkAvailable: (party) => party.ambitionState.battlesWon >= 5 && party.ambitionState.battlesWon < 15,
    getProgress: (party) => `${Math.min(party.ambitionState.battlesWon, 15)}/15`,
  },

  // ==================== 经济类 ====================
  {
    id: 'gather_500_gold',
    name: '小有积蓄',
    description: '积累500金币。',
    type: 'ECONOMY',
    reputationReward: 100,
    checkComplete: (party) => party.gold >= 500,
    checkAvailable: (party) => party.gold < 500,
    getProgress: (party) => `${party.gold}/500`,
  },
  {
    id: 'gather_2000_gold',
    name: '富甲一方',
    description: '积累2000金币。',
    type: 'ECONOMY',
    reputationReward: 100,
    checkComplete: (party) => party.gold >= 2000,
    checkAvailable: (party) => party.gold < 2000 && party.gold >= 300,
    getProgress: (party) => `${party.gold}/2000`,
  },
  {
    id: 'gather_5000_gold',
    name: '财可敌国',
    description: '积累5000金币。',
    type: 'ECONOMY',
    reputationReward: 100,
    checkComplete: (party) => party.gold >= 5000,
    checkAvailable: (party) => party.gold < 5000 && party.gold >= 1500,
    getProgress: (party) => `${party.gold}/5000`,
  },

  // ==================== 团队类 ====================
  {
    id: 'recruit_6',
    name: '初具规模',
    description: '将战团扩充至6人。',
    type: 'TEAM',
    reputationReward: 100,
    checkComplete: (party) => party.mercenaries.length >= 6,
    checkAvailable: (party) => party.mercenaries.length < 6,
    getProgress: (party) => `${party.mercenaries.length}/6`,
  },
  {
    id: 'recruit_12',
    name: '满编劲旅',
    description: '将战团扩充至12人。',
    type: 'TEAM',
    reputationReward: 100,
    checkComplete: (party) => party.mercenaries.length >= 12,
    checkAvailable: (party) => party.mercenaries.length >= 5 && party.mercenaries.length < 12,
    getProgress: (party) => `${party.mercenaries.length}/12`,
  },

  // ==================== 装备类 ====================
  {
    id: 'heavy_armor',
    name: '铁壁之师',
    description: '拥有3件耐久230以上的重甲（头盔或铠甲）。',
    type: 'EQUIPMENT',
    reputationReward: 100,
    checkComplete: (party) => countHeavyArmor(party) >= 3,
    checkAvailable: (party) => countHeavyArmor(party) < 3,
    getProgress: (party) => `${countHeavyArmor(party)}/3`,
  },
  {
    id: 'quality_weapons',
    name: '兵精器利',
    description: '拥有3把价值400以上的精良武器。',
    type: 'EQUIPMENT',
    reputationReward: 100,
    checkComplete: (party) => countQualityWeapons(party) >= 3,
    checkAvailable: (party) => countQualityWeapons(party) < 3,
    getProgress: (party) => `${countQualityWeapons(party)}/3`,
  },

  // ==================== 探索类 ====================
  {
    id: 'visit_3_cities',
    name: '周游列国',
    description: '访问3座不同的城市。',
    type: 'EXPLORATION',
    reputationReward: 100,
    checkComplete: (party) => party.ambitionState.citiesVisited.length >= 3,
    checkAvailable: (party) => party.ambitionState.citiesVisited.length < 3,
    getProgress: (party) => `${party.ambitionState.citiesVisited.length}/3`,
  },
  {
    id: 'visit_6_cities',
    name: '名震天下',
    description: '访问6座不同的城市。',
    type: 'EXPLORATION',
    reputationReward: 100,
    checkComplete: (party) => party.ambitionState.citiesVisited.length >= 6,
    checkAvailable: (party) => party.ambitionState.citiesVisited.length >= 3 && party.ambitionState.citiesVisited.length < 6,
    getProgress: (party) => `${party.ambitionState.citiesVisited.length}/6`,
  },
  {
    id: 'survive_30_days',
    name: '久经风霜',
    description: '存活30天以上。',
    type: 'EXPLORATION',
    reputationReward: 100,
    checkComplete: (party) => party.day >= 30,
    checkAvailable: (party) => party.day < 30,
    getProgress: (party) => `${Math.floor(party.day)}/30天`,
  },
  {
    id: 'survive_60_days',
    name: '老当益壮',
    description: '存活60天以上。',
    type: 'EXPLORATION',
    reputationReward: 100,
    checkComplete: (party) => party.day >= 60,
    checkAvailable: (party) => party.day >= 20 && party.day < 60,
    getProgress: (party) => `${Math.floor(party.day)}/60天`,
  },
];

// ==================== 辅助函数 ====================

/** 统计所有装备和背包中耐久230+的重甲(铠甲/头盔) */
function countHeavyArmor(party: Party): number {
  let count = 0;
  const checkItem = (item: Item | null) => {
    if (item && (item.type === 'ARMOR' || item.type === 'HELMET') && item.maxDurability >= 230) {
      count++;
    }
  };
  for (const merc of party.mercenaries) {
    checkItem(merc.equipment.armor);
    checkItem(merc.equipment.helmet);
    for (const bagItem of merc.bag) {
      checkItem(bagItem);
    }
  }
  for (const invItem of party.inventory) {
    checkItem(invItem);
  }
  return count;
}

/** 统计价值400+的精良武器 */
function countQualityWeapons(party: Party): number {
  let count = 0;
  const checkItem = (item: Item | null) => {
    if (item && item.type === 'WEAPON' && item.value >= 400) {
      count++;
    }
  };
  for (const merc of party.mercenaries) {
    checkItem(merc.equipment.mainHand);
    for (const bagItem of merc.bag) {
      checkItem(bagItem);
    }
  }
  for (const invItem of party.inventory) {
    checkItem(invItem);
  }
  return count;
}

// ==================== 核心 API ====================

/**
 * 获取所有可用的野心目标（排除已完成、条件不满足、刚取消的）
 */
export function getAvailableAmbitions(party: Party): AmbitionTemplate[] {
  const state = party.ambitionState;
  return AMBITION_TEMPLATES.filter(tmpl => {
    // 排除已完成的
    if (state.completedIds.includes(tmpl.id)) return false;
    // 排除上次刚取消的（下一轮不出现）
    if (state.lastCancelledIds.includes(tmpl.id)) return false;
    // 排除出现条件不满足的
    if (!tmpl.checkAvailable(party)) return false;
    return true;
  });
}

/**
 * 生成3个候选目标 + 可能的"无野心"选项
 * 返回 { choices: AmbitionTemplate[], showNoAmbition: boolean }
 */
export function generateAmbitionChoices(party: Party): {
  choices: AmbitionTemplate[];
  showNoAmbition: boolean;
} {
  const available = getAvailableAmbitions(party);
  
  // 随机选3个（不重复）
  const shuffled = [...available].sort(() => Math.random() - 0.5);
  const choices = shuffled.slice(0, 3);
  
  // 完成过2个以上目标后，出现"无野心"选项
  const showNoAmbition = party.ambitionState.totalCompleted >= 2;

  return { choices, showNoAmbition };
}

/**
 * 检测当前野心目标是否完成
 */
export function checkAmbitionComplete(party: Party): boolean {
  const current = party.ambitionState.currentAmbition;
  if (!current) return false;
  
  const template = AMBITION_TEMPLATES.find(t => t.id === current.id);
  if (!template) return false;
  
  return template.checkComplete(party);
}

/**
 * 选定一个野心目标
 */
export function selectAmbition(party: Party, ambitionId: string): AmbitionState {
  const template = AMBITION_TEMPLATES.find(t => t.id === ambitionId);
  if (!template) return party.ambitionState;
  
  return {
    ...party.ambitionState,
    currentAmbition: {
      id: template.id,
      name: template.name,
      description: template.description,
      type: template.type,
      reputationReward: template.reputationReward,
    },
    lastCancelledIds: [], // 选定新目标后清除取消列表
  };
}

/**
 * 选择"无野心"
 */
export function selectNoAmbition(party: Party): AmbitionState {
  return {
    ...party.ambitionState,
    currentAmbition: null,
    noAmbitionUntilDay: party.day + 7,
    nextSelectionDay: party.day + 7,
    lastCancelledIds: [],
  };
}

/**
 * 完成当前野心目标
 * 返回更新后的 AmbitionState（不处理声望和士气，由调用方处理）
 */
export function completeAmbition(party: Party): AmbitionState {
  const current = party.ambitionState.currentAmbition;
  if (!current) return party.ambitionState;

  return {
    ...party.ambitionState,
    currentAmbition: null,
    completedIds: [...party.ambitionState.completedIds, current.id],
    totalCompleted: party.ambitionState.totalCompleted + 1,
    nextSelectionDay: party.day + 1 + Math.random(), // 1-2天后出新选择
    lastCancelledIds: [],
  };
}

/**
 * 取消当前野心目标
 * 返回更新后的 AmbitionState
 */
export function cancelAmbition(party: Party): AmbitionState {
  const current = party.ambitionState.currentAmbition;
  if (!current) return party.ambitionState;

  return {
    ...party.ambitionState,
    currentAmbition: null,
    lastCancelledIds: [current.id], // 下一次候选中排除此目标
    nextSelectionDay: party.day + 1 + Math.random(), // 1-2天后出新选择
  };
}

/**
 * 是否应该弹出目标选择界面
 */
export function shouldShowAmbitionSelect(party: Party): boolean {
  const state = party.ambitionState;
  // 已有目标，不弹
  if (state.currentAmbition) return false;
  // 还在冷却期，不弹
  if (party.day < state.nextSelectionDay) return false;
  if (party.day < state.noAmbitionUntilDay) return false;
  // 没有可选目标也不弹
  const available = getAvailableAmbitions(party);
  if (available.length === 0) return false;
  return true;
}

/**
 * 获取当前野心的进度描述
 */
export function getAmbitionProgress(party: Party): string | null {
  const current = party.ambitionState.currentAmbition;
  if (!current) return null;
  
  const template = AMBITION_TEMPLATES.find(t => t.id === current.id);
  if (!template || !template.getProgress) return null;
  
  return template.getProgress(party);
}

/**
 * 声望对合同出价的加成倍率
 */
export function getReputationRewardMultiplier(reputation: number): number {
  return 1 + reputation / 1000;
}

/**
 * 获取野心类型的中文名称和图标
 */
export function getAmbitionTypeInfo(type: AmbitionType): { name: string; icon: string } {
  switch (type) {
    case 'COMBAT': return { name: '武功', icon: '⚔️' };
    case 'ECONOMY': return { name: '财富', icon: '💰' };
    case 'TEAM': return { name: '人才', icon: '👥' };
    case 'EQUIPMENT': return { name: '军备', icon: '🛡️' };
    case 'EXPLORATION': return { name: '壮游', icon: '🗺️' };
  }
}
