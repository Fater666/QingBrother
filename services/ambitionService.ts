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
import { AMBITIONS_CONFIG } from '../constants';

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
  /** 阶段（1=早期，2=中期，3=后期） */
  stage: number;
  /** 难度（1=简单，2=中等，3=困难） */
  difficulty: number;
}

/**
 * 根据条件表达式字符串生成完成条件检测函数
 */
function createCompleteCondition(conditionStr: string): (party: Party) => boolean {
  // battlesWon_ge_1 -> party.ambitionState.battlesWon >= 1
  // gold_ge_500 -> party.gold >= 500
  // mercenaries_ge_6 -> party.mercenaries.length >= 6
  // citiesVisited_ge_3 -> party.ambitionState.citiesVisited.length >= 3
  // day_ge_30 -> party.day >= 30
  // heavyArmor_ge_3 -> countHeavyArmor(party) >= 3
  // qualityWeapons_ge_3 -> countQualityWeapons(party) >= 3
  
  if (conditionStr.startsWith('battlesWon_ge_')) {
    const value = parseInt(conditionStr.split('_ge_')[1]);
    return (party) => party.ambitionState.battlesWon >= value;
  }
  if (conditionStr.startsWith('gold_ge_')) {
    const value = parseInt(conditionStr.split('_ge_')[1]);
    return (party) => party.gold >= value;
  }
  if (conditionStr.startsWith('mercenaries_ge_')) {
    const value = parseInt(conditionStr.split('_ge_')[1]);
    return (party) => party.mercenaries.length >= value;
  }
  if (conditionStr.startsWith('citiesVisited_ge_')) {
    const value = parseInt(conditionStr.split('_ge_')[1]);
    return (party) => party.ambitionState.citiesVisited.length >= value;
  }
  if (conditionStr.startsWith('day_ge_')) {
    const value = parseInt(conditionStr.split('_ge_')[1]);
    return (party) => party.day >= value;
  }
  if (conditionStr.startsWith('heavyArmor_ge_')) {
    const value = parseInt(conditionStr.split('_ge_')[1]);
    return (party) => countHeavyArmor(party) >= value;
  }
  if (conditionStr.startsWith('qualityWeapons_ge_')) {
    const value = parseInt(conditionStr.split('_ge_')[1]);
    return (party) => countQualityWeapons(party) >= value;
  }
  
  return () => false;
}

/**
 * 根据条件表达式字符串生成可用条件检测函数
 */
function createAvailableCondition(conditionStr: string): (party: Party) => boolean {
  // battlesWon_eq_0 -> party.ambitionState.battlesWon === 0
  // battlesWon_lt_5 -> party.ambitionState.battlesWon < 5
  // battlesWon_ge_5_and_lt_15 -> party.ambitionState.battlesWon >= 5 && party.ambitionState.battlesWon < 15
  // gold_lt_500 -> party.gold < 500
  // gold_lt_2000_and_ge_300 -> party.gold < 2000 && party.gold >= 300
  
  if (conditionStr.includes('_and_')) {
    // 处理复合条件，需要找到最后一个 _and_ 的位置来正确分割
    const lastAndIndex = conditionStr.lastIndexOf('_and_');
    const part1 = conditionStr.substring(0, lastAndIndex);
    const part2 = conditionStr.substring(lastAndIndex + 5); // +5 跳过 "_and_"
    
    // 对于 part2，需要重新构造完整的条件表达式
    // 例如：如果 part1 是 "gold_lt_2000"，part2 是 "ge_300"，需要变成 "gold_ge_300"
    let part2Full = part2;
    if (part1.startsWith('gold_')) {
      part2Full = 'gold_' + part2;
    } else if (part1.startsWith('battlesWon_')) {
      part2Full = 'battlesWon_' + part2;
    } else if (part1.startsWith('mercenaries_')) {
      part2Full = 'mercenaries_' + part2;
    } else if (part1.startsWith('citiesVisited_')) {
      part2Full = 'citiesVisited_' + part2;
    } else if (part1.startsWith('day_')) {
      part2Full = 'day_' + part2;
    }
    
    const cond1 = createAvailableCondition(part1);
    const cond2 = createAvailableCondition(part2Full);
    return (party) => cond1(party) && cond2(party);
  }
  
  if (conditionStr.startsWith('battlesWon_eq_')) {
    const value = parseInt(conditionStr.split('_eq_')[1]);
    return (party) => party.ambitionState.battlesWon === value;
  }
  if (conditionStr.startsWith('battlesWon_lt_')) {
    const value = parseInt(conditionStr.split('_lt_')[1]);
    return (party) => party.ambitionState.battlesWon < value;
  }
  if (conditionStr.startsWith('battlesWon_ge_')) {
    const value = parseInt(conditionStr.split('_ge_')[1]);
    return (party) => party.ambitionState.battlesWon >= value;
  }
  if (conditionStr.startsWith('gold_lt_')) {
    const value = parseInt(conditionStr.split('_lt_')[1]);
    return (party) => party.gold < value;
  }
  if (conditionStr.startsWith('gold_ge_')) {
    const value = parseInt(conditionStr.split('_ge_')[1]);
    return (party) => party.gold >= value;
  }
  if (conditionStr.startsWith('mercenaries_lt_')) {
    const value = parseInt(conditionStr.split('_lt_')[1]);
    return (party) => party.mercenaries.length < value;
  }
  if (conditionStr.startsWith('mercenaries_ge_')) {
    const value = parseInt(conditionStr.split('_ge_')[1]);
    return (party) => party.mercenaries.length >= value;
  }
  if (conditionStr.startsWith('citiesVisited_lt_')) {
    const value = parseInt(conditionStr.split('_lt_')[1]);
    return (party) => party.ambitionState.citiesVisited.length < value;
  }
  if (conditionStr.startsWith('citiesVisited_ge_')) {
    const value = parseInt(conditionStr.split('_ge_')[1]);
    return (party) => party.ambitionState.citiesVisited.length >= value;
  }
  if (conditionStr.startsWith('day_lt_')) {
    const value = parseInt(conditionStr.split('_lt_')[1]);
    return (party) => party.day < value;
  }
  if (conditionStr.startsWith('day_ge_')) {
    const value = parseInt(conditionStr.split('_ge_')[1]);
    return (party) => party.day >= value;
  }
  if (conditionStr.startsWith('heavyArmor_lt_')) {
    const value = parseInt(conditionStr.split('_lt_')[1]);
    return (party) => countHeavyArmor(party) < value;
  }
  if (conditionStr.startsWith('qualityWeapons_lt_')) {
    const value = parseInt(conditionStr.split('_lt_')[1]);
    return (party) => countQualityWeapons(party) < value;
  }
  
  return () => true;
}

/**
 * 根据进度格式字符串生成进度显示函数
 */
function createProgressFunction(formatStr: string): ((party: Party) => string) | undefined {
  if (!formatStr || formatStr.trim() === '') return undefined;
  
  // battlesWon/5 -> `${Math.min(party.ambitionState.battlesWon, 5)}/5`
  // gold/500 -> `${party.gold}/500`
  // mercenaries/6 -> `${party.mercenaries.length}/6`
  // citiesVisited/3 -> `${party.ambitionState.citiesVisited.length}/3`
  // day/30天 -> `${Math.floor(party.day)}/30天`
  // heavyArmor/3 -> `${countHeavyArmor(party)}/3`
  // qualityWeapons/3 -> `${countQualityWeapons(party)}/3`
  
  const parts = formatStr.split('/');
  if (parts.length !== 2) return undefined;
  
  const metric = parts[0];
  const target = parts[1];
  
  if (metric === 'battlesWon') {
    const targetNum = parseInt(target);
    return (party) => `${Math.min(party.ambitionState.battlesWon, targetNum)}/${target}`;
  }
  if (metric === 'gold') {
    return (party) => `${party.gold}/${target}`;
  }
  if (metric === 'mercenaries') {
    return (party) => `${party.mercenaries.length}/${target}`;
  }
  if (metric === 'citiesVisited') {
    return (party) => `${party.ambitionState.citiesVisited.length}/${target}`;
  }
  if (metric === 'day') {
    return (party) => `${Math.floor(party.day)}/${target}`;
  }
  if (metric === 'heavyArmor') {
    return (party) => `${countHeavyArmor(party)}/${target}`;
  }
  if (metric === 'qualityWeapons') {
    return (party) => `${countQualityWeapons(party)}/${target}`;
  }
  
  return undefined;
}

/**
 * 从配置加载宏愿模板
 */
const AMBITION_TEMPLATES: AmbitionTemplate[] = AMBITIONS_CONFIG.map((config: any) => ({
  id: config.id,
  name: config.name,
  description: config.description,
  type: config.type as AmbitionType,
  reputationReward: config.reputationReward,
  stage: config.stage,
  difficulty: config.difficulty,
  checkComplete: createCompleteCondition(config.completeCondition),
  checkAvailable: createAvailableCondition(config.availableCondition),
  getProgress: createProgressFunction(config.progressFormat),
}));

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
 * 根据玩家进度计算当前应该处于的阶段
 * 阶段划分：
 * - Stage 1: 早期（完成0-2个目标，或天数<20）
 * - Stage 2: 中期（完成3-5个目标，或天数20-50）
 * - Stage 3: 后期（完成6+个目标，或天数>50）
 */
function calculateCurrentStage(party: Party): number {
  const totalCompleted = party.ambitionState.totalCompleted;
  const days = party.day;
  
  // 根据完成目标数判断
  if (totalCompleted >= 6 || days > 50) return 3;
  if (totalCompleted >= 3 || days >= 20) return 2;
  return 1;
}

/**
 * 生成3个候选目标 + 可能的"无野心"选项
 * 按照阶段和难度逐层递进选择，类似《战场兄弟》的机制
 * 返回 { choices: AmbitionTemplate[], showNoAmbition: boolean }
 */
export function generateAmbitionChoices(party: Party): {
  choices: AmbitionTemplate[];
  showNoAmbition: boolean;
} {
  const available = getAvailableAmbitions(party);
  if (available.length === 0) {
    return { choices: [], showNoAmbition: party.ambitionState.totalCompleted >= 2 };
  }
  
  const currentStage = calculateCurrentStage(party);
  
  // 按阶段和难度分组
  const byStage: Record<number, AmbitionTemplate[]> = { 1: [], 2: [], 3: [] };
  for (const ambition of available) {
    byStage[ambition.stage].push(ambition);
  }
  
  // 在每个阶段内按难度排序
  for (const stage in byStage) {
    byStage[stage].sort((a, b) => a.difficulty - b.difficulty);
  }
  
  const choices: AmbitionTemplate[] = [];
  
  // 策略：优先选择当前阶段的目标，然后考虑下一阶段
  // 1. 优先选择当前阶段的目标（至少1个）
  if (byStage[currentStage].length > 0) {
    // 从当前阶段选择1-2个（优先难度低的）
    const currentStageChoices = byStage[currentStage].slice(0, 2);
    choices.push(...currentStageChoices);
  }
  
  // 2. 如果当前阶段目标不足，从下一阶段补充
  if (choices.length < 3 && currentStage < 3 && byStage[currentStage + 1].length > 0) {
    const nextStageChoices = byStage[currentStage + 1].slice(0, 3 - choices.length);
    choices.push(...nextStageChoices);
  }
  
  // 3. 如果还不够，从上一阶段补充（但优先度最低）
  if (choices.length < 3 && currentStage > 1 && byStage[currentStage - 1].length > 0) {
    const prevStageChoices = byStage[currentStage - 1].slice(0, 3 - choices.length);
    choices.push(...prevStageChoices);
  }
  
  // 4. 如果还不够3个，从所有可用目标中随机补充
  if (choices.length < 3) {
    const remaining = available.filter(a => !choices.includes(a));
    const shuffled = [...remaining].sort(() => Math.random() - 0.5);
    choices.push(...shuffled.slice(0, 3 - choices.length));
  }
  
  // 5. 确保不超过3个
  const finalChoices = choices.slice(0, 3);
  
  // 完成过2个以上目标后，出现"无野心"选项
  const showNoAmbition = party.ambitionState.totalCompleted >= 2;

  return { choices: finalChoices, showNoAmbition };
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
