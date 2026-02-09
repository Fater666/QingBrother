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
 * 
 * 支持的指标：
 * - battlesWon, gold, mercenaries, citiesVisited, day, heavyArmor, qualityWeapons
 * - 新增: maxMercLevel, contractsCompleted, reputation, totalCompleted, campsDestroyed, allMercsArmed
 */
function createCompleteCondition(conditionStr: string): (party: Party) => boolean {
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
  
  // === 新增完成条件 ===
  
  if (conditionStr.startsWith('maxMercLevel_ge_')) {
    const value = parseInt(conditionStr.split('_ge_')[1]);
    return (party) => getMaxMercLevel(party) >= value;
  }
  if (conditionStr.startsWith('contractsCompleted_ge_')) {
    const value = parseInt(conditionStr.split('_ge_')[1]);
    return (party) => (party.ambitionState.contractsCompleted || 0) >= value;
  }
  if (conditionStr.startsWith('reputation_ge_')) {
    const value = parseInt(conditionStr.split('_ge_')[1]);
    return (party) => party.reputation >= value;
  }
  if (conditionStr.startsWith('totalCompleted_ge_')) {
    const value = parseInt(conditionStr.split('_ge_')[1]);
    return (party) => party.ambitionState.totalCompleted >= value;
  }
  if (conditionStr.startsWith('campsDestroyed_ge_')) {
    const value = parseInt(conditionStr.split('_ge_')[1]);
    return (party) => (party.ambitionState.campsDestroyed || 0) >= value;
  }
  if (conditionStr === 'allMercsArmed_eq_1') {
    return (party) => checkAllMercsArmed(party);
  }
  
  return () => false;
}

/**
 * 根据条件表达式字符串生成可用条件检测函数
 * 
 * 支持的条件格式：
 * - 基本比较: battlesWon_lt_5, gold_ge_300, day_lt_30 等
 * - 复合条件: gold_lt_2000_and_ge_300（用 _and_ 连接两个条件）
 * - 前置完成: completed_first_victory（要求指定ID的宏愿已完成）
 * - 新增指标: maxMercLevel_lt_5, contractsCompleted_lt_3, reputation_lt_300,
 *             totalCompleted_ge_2, campsDestroyed_lt_3, allMercsArmed_eq_0
 */
function createAvailableCondition(conditionStr: string): (party: Party) => boolean {
  // 所有已知的指标前缀（用于 _and_ 复合条件的智能分割）
  const METRIC_PREFIXES = ['gold_', 'battlesWon_', 'mercenaries_', 'citiesVisited_', 'day_',
                    'maxMercLevel_', 'contractsCompleted_', 'reputation_', 'totalCompleted_',
                    'campsDestroyed_', 'heavyArmor_', 'qualityWeapons_', 'allMercsArmed_'];

  // === 复合条件（_and_ 连接）必须优先处理 ===
  // 例如: completed_first_victory_and_battlesWon_lt_5 → split → completed_first_victory + battlesWon_lt_5
  // 例如: gold_lt_2000_and_ge_300 → split → gold_lt_2000 + gold_ge_300
  if (conditionStr.includes('_and_')) {
    const lastAndIndex = conditionStr.lastIndexOf('_and_');
    const part1 = conditionStr.substring(0, lastAndIndex);
    const part2 = conditionStr.substring(lastAndIndex + 5); // +5 跳过 "_and_"
    
    // 判断 part2 是否已经是完整条件（以已知指标前缀或 completed_ 开头）
    let part2Full = part2;
    const isFullCondition = part2.startsWith('completed_') ||
      METRIC_PREFIXES.some(prefix => part2.startsWith(prefix));
    
    if (!isFullCondition) {
      // part2 是片段（如 "ge_300"），需要从 part1 提取指标前缀补全
      for (const prefix of METRIC_PREFIXES) {
        if (part1.startsWith(prefix)) {
          part2Full = prefix + part2;
          break;
        }
      }
    }
    
    const cond1 = createAvailableCondition(part1);
    const cond2 = createAvailableCondition(part2Full);
    return (party) => cond1(party) && cond2(party);
  }
  
  // === 前置完成条件: completed_xxx ===
  // 例如: completed_first_victory -> party.ambitionState.completedIds.includes('first_victory')
  if (conditionStr.startsWith('completed_')) {
    const requiredId = conditionStr.substring('completed_'.length);
    return (party) => party.ambitionState.completedIds.includes(requiredId);
  }
  
  // === 基本条件 ===
  
  // battlesWon
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
  
  // gold
  if (conditionStr.startsWith('gold_lt_')) {
    const value = parseInt(conditionStr.split('_lt_')[1]);
    return (party) => party.gold < value;
  }
  if (conditionStr.startsWith('gold_ge_')) {
    const value = parseInt(conditionStr.split('_ge_')[1]);
    return (party) => party.gold >= value;
  }
  
  // mercenaries count
  if (conditionStr.startsWith('mercenaries_lt_')) {
    const value = parseInt(conditionStr.split('_lt_')[1]);
    return (party) => party.mercenaries.length < value;
  }
  if (conditionStr.startsWith('mercenaries_ge_')) {
    const value = parseInt(conditionStr.split('_ge_')[1]);
    return (party) => party.mercenaries.length >= value;
  }
  
  // citiesVisited
  if (conditionStr.startsWith('citiesVisited_lt_')) {
    const value = parseInt(conditionStr.split('_lt_')[1]);
    return (party) => party.ambitionState.citiesVisited.length < value;
  }
  if (conditionStr.startsWith('citiesVisited_ge_')) {
    const value = parseInt(conditionStr.split('_ge_')[1]);
    return (party) => party.ambitionState.citiesVisited.length >= value;
  }
  
  // day
  if (conditionStr.startsWith('day_lt_')) {
    const value = parseInt(conditionStr.split('_lt_')[1]);
    return (party) => party.day < value;
  }
  if (conditionStr.startsWith('day_ge_')) {
    const value = parseInt(conditionStr.split('_ge_')[1]);
    return (party) => party.day >= value;
  }
  
  // heavyArmor
  if (conditionStr.startsWith('heavyArmor_lt_')) {
    const value = parseInt(conditionStr.split('_lt_')[1]);
    return (party) => countHeavyArmor(party) < value;
  }
  
  // qualityWeapons
  if (conditionStr.startsWith('qualityWeapons_lt_')) {
    const value = parseInt(conditionStr.split('_lt_')[1]);
    return (party) => countQualityWeapons(party) < value;
  }
  
  // === 新增指标 ===
  
  // maxMercLevel: 队伍中最高等级的佣兵等级
  if (conditionStr.startsWith('maxMercLevel_lt_')) {
    const value = parseInt(conditionStr.split('_lt_')[1]);
    return (party) => getMaxMercLevel(party) < value;
  }
  if (conditionStr.startsWith('maxMercLevel_ge_')) {
    const value = parseInt(conditionStr.split('_ge_')[1]);
    return (party) => getMaxMercLevel(party) >= value;
  }
  
  // contractsCompleted: 累计完成的合同数
  if (conditionStr.startsWith('contractsCompleted_lt_')) {
    const value = parseInt(conditionStr.split('_lt_')[1]);
    return (party) => (party.ambitionState.contractsCompleted || 0) < value;
  }
  if (conditionStr.startsWith('contractsCompleted_ge_')) {
    const value = parseInt(conditionStr.split('_ge_')[1]);
    return (party) => (party.ambitionState.contractsCompleted || 0) >= value;
  }
  
  // reputation
  if (conditionStr.startsWith('reputation_lt_')) {
    const value = parseInt(conditionStr.split('_lt_')[1]);
    return (party) => party.reputation < value;
  }
  if (conditionStr.startsWith('reputation_ge_')) {
    const value = parseInt(conditionStr.split('_ge_')[1]);
    return (party) => party.reputation >= value;
  }
  
  // totalCompleted: 累计完成宏愿数
  if (conditionStr.startsWith('totalCompleted_ge_')) {
    const value = parseInt(conditionStr.split('_ge_')[1]);
    return (party) => party.ambitionState.totalCompleted >= value;
  }
  if (conditionStr.startsWith('totalCompleted_lt_')) {
    const value = parseInt(conditionStr.split('_lt_')[1]);
    return (party) => party.ambitionState.totalCompleted < value;
  }
  
  // campsDestroyed: 摧毁的营地数
  if (conditionStr.startsWith('campsDestroyed_lt_')) {
    const value = parseInt(conditionStr.split('_lt_')[1]);
    return (party) => (party.ambitionState.campsDestroyed || 0) < value;
  }
  if (conditionStr.startsWith('campsDestroyed_ge_')) {
    const value = parseInt(conditionStr.split('_ge_')[1]);
    return (party) => (party.ambitionState.campsDestroyed || 0) >= value;
  }
  
  // allMercsArmed: 是否所有佣兵都装备了武器 (eq_0 表示不是, eq_1 表示是)
  if (conditionStr === 'allMercsArmed_eq_0') {
    return (party) => !checkAllMercsArmed(party);
  }
  if (conditionStr === 'allMercsArmed_eq_1') {
    return (party) => checkAllMercsArmed(party);
  }
  
  return () => true;
}

/**
 * 根据进度格式字符串生成进度显示函数
 * 
 * 支持的格式: metric/target，如 battlesWon/5, gold/500, maxMercLevel/5 等
 */
function createProgressFunction(formatStr: string): ((party: Party) => string) | undefined {
  if (!formatStr || formatStr.trim() === '') return undefined;
  
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
  
  // === 新增进度指标 ===
  if (metric === 'maxMercLevel') {
    const targetNum = parseInt(target);
    return (party) => `${Math.min(getMaxMercLevel(party), targetNum)}/${target}`;
  }
  if (metric === 'contractsCompleted') {
    const targetNum = parseInt(target);
    return (party) => `${Math.min(party.ambitionState.contractsCompleted || 0, targetNum)}/${target}`;
  }
  if (metric === 'reputation') {
    return (party) => `${Math.floor(party.reputation)}/${target}`;
  }
  if (metric === 'totalCompleted') {
    const targetNum = parseInt(target);
    return (party) => `${Math.min(party.ambitionState.totalCompleted, targetNum)}/${target}`;
  }
  if (metric === 'campsDestroyed') {
    const targetNum = parseInt(target);
    return (party) => `${Math.min(party.ambitionState.campsDestroyed || 0, targetNum)}/${target}`;
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

/** 获取队伍中最高等级的佣兵等级 */
function getMaxMercLevel(party: Party): number {
  if (party.mercenaries.length === 0) return 0;
  return Math.max(...party.mercenaries.map(m => m.level));
}

/** 检查是否所有佣兵都装备了主武器 */
function checkAllMercsArmed(party: Party): boolean {
  if (party.mercenaries.length === 0) return false;
  return party.mercenaries.every(m => m.equipment.mainHand !== null);
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
 * 核心规则：3个选项必须来自不同的 type（COMBAT/ECONOMY/TEAM/EQUIPMENT/EXPLORATION），
 * 避免"赢1场+赢5场"同质化组合出现
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
  
  // 在每个阶段内随机打乱（同难度内增加变化），然后按难度排序
  for (const stage in byStage) {
    byStage[stage].sort(() => Math.random() - 0.5);
    byStage[stage].sort((a, b) => a.difficulty - b.difficulty);
  }
  
  const choices: AmbitionTemplate[] = [];
  const usedTypes = new Set<string>(); // 记录已选的 type，确保不重复
  
  // 按优先级依次从各阶段池中选取，每次选取都遵守 type 互斥
  const stagePriority = [currentStage];
  if (currentStage < 3) stagePriority.push(currentStage + 1);
  if (currentStage > 1) stagePriority.push(currentStage - 1);
  // 补充剩余未出现的阶段
  for (let s = 1; s <= 3; s++) {
    if (!stagePriority.includes(s)) stagePriority.push(s);
  }
  
  for (const stage of stagePriority) {
    if (choices.length >= 3) break;
    const pool = byStage[stage].filter(a => !choices.includes(a));
    for (const candidate of pool) {
      if (choices.length >= 3) break;
      if (!usedTypes.has(candidate.type)) {
        choices.push(candidate);
        usedTypes.add(candidate.type);
      }
    }
  }
  
  // 如果 type 互斥导致不足3个（可用 type 类别不到3种），放宽限制补充
  if (choices.length < 3) {
    const remaining = available.filter(a => !choices.includes(a));
    const shuffled = [...remaining].sort(() => Math.random() - 0.5);
    for (const c of shuffled) {
      if (choices.length >= 3) break;
      choices.push(c);
    }
  }
  
  // 确保不超过3个
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
    case 'DIPLOMACY': return { name: '外交', icon: '🏯' };
    default: return { name: '其他', icon: '📜' };
  }
}
