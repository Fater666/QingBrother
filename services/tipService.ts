
export interface GameTipData {
  id: string;
  text: string;
  duration: number;       // 自动消失时间(ms)
  position: 'top' | 'bottom';
}

export const GAME_TIPS: Record<string, GameTipData> = {
  // ===== 大地图 =====
  world_map_intro: {
    id: 'world_map_intro',
    text: '点击地图设定目的地，队伍将自动前进。行军消耗时间与粮草，注意补给。',
    duration: 8000,
    position: 'top',
  },
  world_map_enemy_nearby: {
    id: 'world_map_enemy_nearby',
    text: '前方发现敌对势力！靠近后将进入战斗，请确保队伍状态良好。',
    duration: 6000,
    position: 'top',
  },
  world_map_food_low: {
    id: 'world_map_food_low',
    text: '粮草告急！断粮后佣兵每日会损失生命，请尽快前往城镇补给。',
    duration: 7000,
    position: 'top',
  },

  // ===== 城市 =====
  city_first_enter: {
    id: 'city_first_enter',
    text: '城镇提供市集、募兵、酒肆等设施，在此补充物资、招募战士、接取委托。',
    duration: 7000,
    position: 'top',
  },
  city_market_open: {
    id: 'city_market_open',
    text: '市集可买卖装备与补给品。各城物价不同，善用差价可获利。',
    duration: 6000,
    position: 'top',
  },
  city_recruit_open: {
    id: 'city_recruit_open',
    text: '雇佣佣兵需支付雇金，此后每日还需支付薪资。出身不同，能力各异。',
    duration: 7000,
    position: 'top',
  },
  city_tavern_open: {
    id: 'city_tavern_open',
    text: '酒肆中可接取契约赚取金币与声望。同一时间只能持有一份契约。',
    duration: 6000,
    position: 'top',
  },

  // ===== 战斗 =====
  combat_first_start: {
    id: 'combat_first_start',
    text: '点击敌人攻击，右键移动。每单位每回合有9点行动力，移动和攻击都会消耗。',
    duration: 9000,
    position: 'top',
  },
  combat_first_attack: {
    id: 'combat_first_attack',
    text: '命中率受攻击技能与目标防御影响。武器先削甲再伤血，注重护甲的维护。',
    duration: 8000,
    position: 'top',
  },
  combat_armor_break: {
    id: 'combat_armor_break',
    text: '护甲损坏后将直接承受伤害。战后可逐日修复，也可购买修甲材料加速。',
    duration: 7000,
    position: 'top',
  },
  combat_morale_change: {
    id: 'combat_morale_change',
    text: '士气影响战斗表现。友军阵亡会降低周围士气，崩溃者将逃离战场。',
    duration: 7000,
    position: 'top',
  },
  combat_ap_zero: {
    id: 'combat_ap_zero',
    text: '行动力耗尽后可结束回合',
    duration: 7000,
    position: 'top',
  },

  // ===== 队伍管理 =====
  squad_first_open: {
    id: 'squad_first_open',
    text: '在此管理阵型与装备。拖动佣兵调整站位，点击仓库物资中的物品进行装备。',
    duration: 8000,
    position: 'top',
  },

  // ===== 契约 =====
  quest_first_accept: {
    id: 'quest_first_accept',
    text: '契约有时限，逾期未完成将自动失败。完成后需返回接取城市交付领赏。',
    duration: 7000,
    position: 'top',
  },
};

export const isTipShown = (shownTips: string[], tipId: string): boolean => {
  return shownTips.includes(tipId);
};

export const markTipShown = (shownTips: string[], tipId: string): string[] => {
  if (shownTips.includes(tipId)) return shownTips;
  return [...shownTips, tipId];
};
