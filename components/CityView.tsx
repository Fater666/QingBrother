
import React, { useState, useEffect, useMemo } from 'react';
import { Party, City, Item, Character, CityFacility, Quest } from '../types.ts';
import { BACKGROUNDS, TRAIT_TEMPLATES } from '../constants';
import { getReputationRewardMultiplier } from '../services/ambitionService.ts';

interface CityViewProps {
  city: City;
  party: Party;
  onLeave: () => void;
  onUpdateParty: (party: Party) => void;
  onUpdateCity: (city: City) => void;
  onAcceptQuest: (quest: Quest) => void;
  onCompleteQuest: () => void; // 交付已完成的任务（返回接取城市时调用）
}

// 获取物品类型的中文名称
const getItemTypeName = (type: Item['type']): string => {
    const typeNames: Record<Item['type'], string> = {
        'WEAPON': '兵器',
        'ARMOR': '甲胄',
        'HELMET': '头盔',
        'SHIELD': '盾牌',
        'CONSUMABLE': '消耗',
        'AMMO': '弹药',
        'ACCESSORY': '饰品'
    };
    return typeNames[type] || type;
};

// 获取物品的简短属性描述
const getItemBrief = (item: Item): string => {
    if (item.type === 'CONSUMABLE' && item.subType) {
        if (item.subType === 'FOOD') return `粮食 +${item.effectValue}`;
        if (item.subType === 'MEDICINE') return `医药 +${item.effectValue}`;
        if (item.subType === 'REPAIR_KIT') return `修甲材料 +${item.effectValue}`;
    }
    if (item.damage) return `伤害 ${item.damage[0]}-${item.damage[1]}`;
    if (item.durability !== undefined && item.maxDurability > 1) return `耐久 ${item.durability}`;
    if (item.defenseBonus !== undefined) return `防御 +${item.defenseBonus}`;
    return '';
};

// ==================== 品质分级系统 ====================
type ItemTier = 'COMMON' | 'FINE' | 'RARE' | 'EPIC' | 'LEGENDARY' | 'UNIQUE';

interface TierConfig {
    tier: ItemTier;
    label: string;
    borderClass: string;       // 卡片边框色
    borderSelectedClass: string; // 选中边框色
    nameColor: string;         // 物品名颜色
    labelColor: string;        // 品质标签颜色
    bgClass: string;           // 卡片背景
    bgSelectedClass: string;   // 选中背景
    glowClass: string;         // 光效动画 CSS class
    detailBorderColor: string; // 详情面板顶部品质色
    priceLabelColor: string;   // 价格数字颜色
}

const TIER_CONFIGS: Record<ItemTier, TierConfig> = {
    COMMON: {
        tier: 'COMMON', label: '',
        borderClass: 'border-slate-700/60',
        borderSelectedClass: 'border-slate-500',
        nameColor: 'text-slate-300',
        labelColor: '',
        bgClass: 'bg-black/30',
        bgSelectedClass: 'bg-slate-800/40',
        glowClass: '',
        detailBorderColor: 'border-slate-700',
        priceLabelColor: 'text-slate-400',
    },
    FINE: {
        tier: 'FINE', label: '',
        borderClass: 'border-amber-900/50',
        borderSelectedClass: 'border-amber-600',
        nameColor: 'text-amber-200',
        labelColor: '',
        bgClass: 'bg-black/30',
        bgSelectedClass: 'bg-amber-900/20',
        glowClass: '',
        detailBorderColor: 'border-amber-800',
        priceLabelColor: 'text-amber-400',
    },
    RARE: {
        tier: 'RARE', label: '精品',
        borderClass: 'border-sky-700/50',
        borderSelectedClass: 'border-sky-500',
        nameColor: 'text-sky-300',
        labelColor: 'text-sky-400',
        bgClass: 'bg-sky-950/10',
        bgSelectedClass: 'bg-sky-900/20',
        glowClass: '',
        detailBorderColor: 'border-sky-600',
        priceLabelColor: 'text-sky-400',
    },
    EPIC: {
        tier: 'EPIC', label: '珍品',
        borderClass: 'border-purple-600/50',
        borderSelectedClass: 'border-purple-400',
        nameColor: 'text-purple-300',
        labelColor: 'text-purple-400',
        bgClass: 'bg-purple-950/10',
        bgSelectedClass: 'bg-purple-900/20',
        glowClass: 'anim-epic-glow',
        detailBorderColor: 'border-purple-500',
        priceLabelColor: 'text-purple-400',
    },
    LEGENDARY: {
        tier: 'LEGENDARY', label: '传世',
        borderClass: 'border-amber-500/60',
        borderSelectedClass: 'border-amber-300',
        nameColor: 'text-amber-300',
        labelColor: 'text-amber-400',
        bgClass: 'bg-amber-950/15',
        bgSelectedClass: 'bg-amber-900/25',
        glowClass: 'anim-legendary-pulse',
        detailBorderColor: 'border-amber-400',
        priceLabelColor: 'text-amber-300',
    },
    UNIQUE: {
        tier: 'UNIQUE', label: '传世红装',
        borderClass: 'border-red-500/70',
        borderSelectedClass: 'border-red-400',
        nameColor: 'text-red-400',
        labelColor: 'text-red-400',
        bgClass: 'bg-red-950/20',
        bgSelectedClass: 'bg-red-900/30',
        glowClass: 'anim-unique-glow',
        detailBorderColor: 'border-red-500',
        priceLabelColor: 'text-red-400',
    },
};

/** 获取物品品质配置，优先使用 rarity 字段，缺失时按 value 推算 */
const getItemTier = (value: number, rarity?: string): TierConfig => {
    // 显式品质优先
    if (rarity === 'UNIQUE') return TIER_CONFIGS.UNIQUE;
    if (rarity === 'LEGENDARY') return TIER_CONFIGS.LEGENDARY;
    if (rarity === 'EPIC') return TIER_CONFIGS.EPIC;
    if (rarity === 'RARE') return TIER_CONFIGS.RARE;
    if (rarity === 'UNCOMMON') return TIER_CONFIGS.FINE;
    if (rarity === 'COMMON') return TIER_CONFIGS.COMMON;
    // 回退到 value 推算
    if (value >= 2500) return TIER_CONFIGS.LEGENDARY;
    if (value >= 1200) return TIER_CONFIGS.EPIC;
    if (value >= 500) return TIER_CONFIGS.RARE;
    if (value >= 100) return TIER_CONFIGS.FINE;
    return TIER_CONFIGS.COMMON;
};

// 物品类型筛选配置
const ITEM_FILTER_TABS: { key: Item['type'] | 'ALL'; label: string }[] = [
    { key: 'ALL', label: '全部' },
    { key: 'WEAPON', label: '兵器' },
    { key: 'ARMOR', label: '甲胄' },
    { key: 'HELMET', label: '头盔' },
    { key: 'SHIELD', label: '盾牌' },
    { key: 'CONSUMABLE', label: '消耗' },
];

// 获取任务类型的中文名称
const getQuestTypeName = (type: Quest['type']): string => {
    const typeNames: Record<Quest['type'], string> = {
        'HUNT': '讨伐',
        'ESCORT': '护送',
        'PATROL': '巡逻',
        'DELIVERY': '运送'
    };
    return typeNames[type] || type;
};

// 设施配置
const FACILITY_CONFIG: Record<CityFacility, { icon: string; label: string; desc: string }> = {
    'MARKET': { icon: '🏪', label: '市集', desc: '买卖货物兵器' },
    'RECRUIT': { icon: '⚔️', label: '募兵', desc: '招募新的战士' },
    'TAVERN': { icon: '🍶', label: '酒肆', desc: '打探消息接取委托' },
    'TEMPLE': { icon: '🏥', label: '医馆', desc: '治疗伤员恢复体力' },
};

// 城市状态氛围文字
const STATE_FLAVOR: Record<City['state'], string> = {
    'NORMAL': '城中安宁，百姓往来如常。',
    'WAR': '战火纷飞，城中戒备森严。',
    'FAMINE': '饥民遍地，米价飞涨。',
    'PROSPEROUS': '商贾云集，一片繁荣景象。',
};

// 城墙样式配置
const WALL_STYLE: Record<City['type'], { border: string; size: string; hasTowers: boolean; gateSize: string; wallLabel: string }> = {
    'VILLAGE': {
        border: 'border-2 border-dashed border-amber-900/50',
        size: 'w-[92vw] max-w-[420px] aspect-[21/19]',
        hasTowers: false,
        gateSize: 'w-14 sm:w-16',
        wallLabel: '木栅',
    },
    'TOWN': {
        border: 'border-[3px] border-solid border-amber-800/60',
        size: 'w-[94vw] max-w-[500px] aspect-[25/22]',
        hasTowers: true,
        gateSize: 'w-16 sm:w-20',
        wallLabel: '土墙',
    },
    'CAPITAL': {
        border: 'border-4 border-double border-amber-600/70',
        size: 'w-[95vw] max-w-[580px] aspect-[29/25]',
        hasTowers: true,
        gateSize: 'w-20 sm:w-24',
        wallLabel: '城墙',
    },
};

// 建筑在城墙内的布局位置（根据设施数量动态排列）
const getBuildingPositions = (facilities: CityFacility[]): Record<CityFacility, { top: string; left: string }> => {
    const positions: Record<string, { top: string; left: string }> = {};
    const count = facilities.length;
    
    if (count === 1) {
        positions[facilities[0]] = { top: '38%', left: '50%' };
    } else if (count === 2) {
        positions[facilities[0]] = { top: '35%', left: '30%' };
        positions[facilities[1]] = { top: '35%', left: '70%' };
    } else if (count === 3) {
        positions[facilities[0]] = { top: '25%', left: '28%' };
        positions[facilities[1]] = { top: '25%', left: '72%' };
        positions[facilities[2]] = { top: '58%', left: '50%' };
    } else {
        // 4个设施 - 2x2 网格
        positions[facilities[0]] = { top: '22%', left: '30%' };
        positions[facilities[1]] = { top: '22%', left: '70%' };
        positions[facilities[2]] = { top: '58%', left: '30%' };
        positions[facilities[3]] = { top: '58%', left: '70%' };
    }
    
    return positions as Record<CityFacility, { top: string; left: string }>;
};

type SubView = 'MAP' | CityFacility;

export const CityView: React.FC<CityViewProps> = ({ city, party, onLeave, onUpdateParty, onUpdateCity, onAcceptQuest, onCompleteQuest }) => {
  const [subView, setSubView] = useState<SubView>('MAP');
  const [notification, setNotification] = useState<string | null>(null);
  const [hoveredBuilding, setHoveredBuilding] = useState<CityFacility | null>(null);
  const [activeTraitTooltip, setActiveTraitTooltip] = useState<string | null>(null);
  const activeTrait = activeTraitTooltip ? TRAIT_TEMPLATES[activeTraitTooltip] : null;
  
  // Interaction State (for market)
  const [selectedItem, setSelectedItem] = useState<{ item: Item, from: 'MARKET' | 'INVENTORY', index: number } | null>(null);
  const [marketTab, setMarketTab] = useState<'BUY' | 'SELL'>('BUY');
  const [itemFilter, setItemFilter] = useState<Item['type'] | 'ALL'>('ALL');
  const [marketListPage, setMarketListPage] = useState(0);
  const MARKET_PAGE_SIZE = 6; // 固定每页6个，2列x3行，不滚动
  // Interaction State (for recruit)
  const [selectedRecruit, setSelectedRecruit] = useState<number | null>(null);

  const showNotification = (msg: string) => {
      setNotification(msg);
      setTimeout(() => setNotification(null), 2000);
  };

  // 自动跳转：进入接取任务的城市且任务已完成时，自动切换到酒肆
  useEffect(() => {
      if (party.activeQuest && party.activeQuest.isCompleted && party.activeQuest.sourceCityId === city.id) {
          setSubView('TAVERN');
      }
  }, []); // 仅在进入城市时检查一次

  // 切换市集标签或筛选时重置分页
  useEffect(() => {
      setMarketListPage(0);
  }, [marketTab, itemFilter]);

  useEffect(() => {
      setActiveTraitTooltip(null);
  }, [selectedRecruit, subView, city.id]);


  const handleBuy = (item: Item, index: number) => {
      const price = Math.floor(item.value * 1.5 * (city.priceModifier || 1));
      if (party.gold >= price) {
          // 消耗品直接转化为资源池数值（与粮食逻辑一致）
          if (item.type === 'CONSUMABLE' && item.subType === 'FOOD' && item.effectValue) {
              onUpdateParty({
                  ...party,
                  gold: party.gold - price,
                  food: party.food + item.effectValue,
              });
              const newMarket = [...city.market];
              newMarket.splice(index, 1);
              onUpdateCity({ ...city, market: newMarket });
              setSelectedItem(null);
              showNotification(`购买了 ${item.name}（粮食 +${item.effectValue}）`);
          } else if (item.type === 'CONSUMABLE' && item.subType === 'MEDICINE' && item.effectValue) {
              onUpdateParty({
                  ...party,
                  gold: party.gold - price,
                  medicine: party.medicine + item.effectValue,
              });
              const newMarket = [...city.market];
              newMarket.splice(index, 1);
              onUpdateCity({ ...city, market: newMarket });
              setSelectedItem(null);
              showNotification(`购买了 ${item.name}（医药 +${item.effectValue}）`);
          } else if (item.type === 'CONSUMABLE' && item.subType === 'REPAIR_KIT' && item.effectValue) {
              onUpdateParty({
                  ...party,
                  gold: party.gold - price,
                  repairSupplies: party.repairSupplies + item.effectValue,
              });
              const newMarket = [...city.market];
              newMarket.splice(index, 1);
              onUpdateCity({ ...city, market: newMarket });
              setSelectedItem(null);
              showNotification(`购买了 ${item.name}（修甲材料 +${item.effectValue}）`);
          } else {
              onUpdateParty({
                  ...party,
                  gold: party.gold - price,
                  inventory: [...party.inventory, { ...item, id: `${item.id}-${Date.now()}` }]
              });
              const newMarket = [...city.market];
              newMarket.splice(index, 1);
              onUpdateCity({ ...city, market: newMarket });
              setSelectedItem(null);
              showNotification(`购买了 ${item.name}`);
          }
      } else {
          showNotification("金币不足！");
      }
  };

  const handleSell = (item: Item, index: number) => {
      const price = Math.floor(item.value * 0.5 * (city.priceModifier || 1));
      const newInv = [...party.inventory];
      newInv.splice(index, 1);
      onUpdateParty({ ...party, gold: party.gold + price, inventory: newInv });
      setSelectedItem(null);
      showNotification(`出售了 ${item.name} (+${price})`);
  };

  const handleRecruit = (merc: Character, index: number) => {
      const hireCost = merc.hireCost;
      if (party.mercenaries.length >= 20) { showNotification("战团人数已达上限！"); return; }
      if (party.gold >= hireCost) {
          // 检查当前已上阵人数是否未满 12 人 (正式满员为 12 人)
          const activeMercs = party.mercenaries.filter(m => m.formationIndex !== null);
          let formationIndex: number | null = null;

          if (activeMercs.length < 12) {
              // 寻找第一个空余阵位 (0-17)
              const occupiedIndices = activeMercs.map(m => m.formationIndex as number);
              for (let i = 0; i < 18; i++) {
                  if (!occupiedIndices.includes(i)) {
                      formationIndex = i;
                      break;
                  }
              }
          }

          const newMerc = { ...merc, formationIndex };
          onUpdateParty({ ...party, gold: party.gold - hireCost, mercenaries: [...party.mercenaries, newMerc] });
          const newRecruits = [...city.recruits];
          newRecruits.splice(index, 1);
          onUpdateCity({ ...city, recruits: newRecruits });
          showNotification(`招募了 ${merc.name}${formationIndex !== null ? '，已上阵' : '，进入后备'}`);
      } else { showNotification("金币不足！"); }
  };

  const handleHeal = (merc: Character, index: number) => {
      const missingHp = merc.maxHp - merc.hp;
      if (missingHp <= 0) return;
      const cost = missingHp * 2;
      if (party.gold >= cost) {
          const newMercs = party.mercenaries.map((m, i) => i === index ? { ...m, hp: m.maxHp } : m);
          onUpdateParty({ ...party, gold: party.gold - cost, mercenaries: newMercs });
          showNotification(`${merc.name} 伤势已痊愈`);
      } else { showNotification("金币不足！"); }
  };

  const handleQuestTake = (quest: Quest) => {
      if (party.activeQuest) { showNotification("已有在身契约！需先完成。"); return; }
      // 根据声望调整报酬
      const mult = getReputationRewardMultiplier(party.reputation);
      const boostedQuest = { ...quest, rewardGold: Math.floor(quest.rewardGold * mult) };
      onAcceptQuest(boostedQuest);
      const newQuests = city.quests.filter(q => q.id !== quest.id);
      onUpdateCity({ ...city, quests: newQuests });
      showNotification("接受契约！");
  };

  const getRoleRecommendation = (merc: Character) => {
      const { meleeSkill, meleeDefense, rangedSkill } = merc.stats;
      const { meleeSkill: msStar, rangedSkill: rsStar, meleeDefense: mdStar } = merc.stars;
      if (rangedSkill > 45 || (rangedSkill > 40 && rsStar >= 2)) return "神射手";
      if ((meleeDefense > 5 || mdStar >= 2) && merc.hp > 60) return "重装步兵";
      if (meleeSkill > 55 || (meleeSkill > 50 && msStar >= 2)) return "主力输出";
      if (merc.stats.initiative > 115) return "突袭者";
      return "后备兵";
  };

  const goBack = () => { setSubView('MAP'); setSelectedItem(null); setSelectedRecruit(null); };

  const wallStyle = WALL_STYLE[city.type];
  const buildingPositions = getBuildingPositions(city.facilities);
  const cityTypeName = city.type === 'CAPITAL' ? '王都' : city.type === 'TOWN' ? '县镇' : '村落';
  const facilityLabel = subView !== 'MAP' ? FACILITY_CONFIG[subView as CityFacility]?.label : '';

  // 城市状态对应的背景色调
  const stateGlow: Record<City['state'], string> = {
      'NORMAL': 'from-amber-950/5 via-transparent to-amber-950/5',
      'WAR': 'from-red-950/10 via-transparent to-red-950/10',
      'FAMINE': 'from-slate-950/10 via-transparent to-slate-950/10',
      'PROSPEROUS': 'from-amber-900/10 via-transparent to-amber-900/10',
  };

  return (
    <div className="w-full h-full bg-[#0a0908] flex flex-col font-serif text-slate-300 relative select-none overflow-hidden min-h-0">
        {/* 竹简质感背景 */}
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
             style={{
                 backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(139, 90, 43, 0.4) 2px, rgba(139, 90, 43, 0.4) 4px)`
             }} 
        />
        <div className={`absolute inset-0 bg-gradient-to-b ${stateGlow[city.state]} pointer-events-none`} />

        {/* ==================== 城市地图视图 ==================== */}
        {subView === 'MAP' && (
            <div className="flex-1 min-h-0 flex flex-col relative z-10">
                {/* 顶部信息栏 */}
                <div className="h-14 bg-gradient-to-r from-[#1a1410] via-[#0d0b09] to-[#1a1410] border-b border-amber-900/50 flex items-center justify-between px-3 sm:px-8 shrink-0">
                    <div className="flex items-center gap-4">
                        <h1 className="text-lg sm:text-2xl font-bold text-amber-500 tracking-[0.12em] sm:tracking-[0.2em]">{city.name}</h1>
                        <div className="hidden sm:flex gap-2 text-[10px]">
                            <span className="text-amber-700 border border-amber-900/40 px-2 py-0.5">{cityTypeName}</span>
                            <span className="text-slate-500 border border-slate-800/40 px-2 py-0.5">{city.faction}</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="flex gap-2 sm:gap-4 text-[10px] sm:text-xs font-mono">
                            <span className="text-amber-500">💰 {party.gold}</span>
                            <span className="text-emerald-500">🌾 {party.food}</span>
                            <span className={`${party.medicine > 0 ? 'text-sky-400' : 'text-slate-600'} hidden sm:inline`} title={`医药储备 ${party.medicine}`}>💊 {party.medicine}</span>
                            <span className={`${party.repairSupplies > 0 ? 'text-orange-400' : 'text-slate-600'} hidden sm:inline`} title={`修甲材料 ${party.repairSupplies}`}>🔧 {party.repairSupplies}</span>
                            <span className="text-slate-400 hidden sm:inline">伍: {party.mercenaries.length}人</span>
                        </div>
                    </div>
                </div>

                {/* 城市俯视地图主区域 */}
                <div className="city-map-scroll flex-1 min-h-0 flex items-center justify-center relative overflow-y-auto overflow-x-hidden touch-pan-y px-2 pb-20 sm:pb-16">
                    {/* 地面纹理 */}
                    <div className="absolute inset-0 opacity-[0.04] pointer-events-none"
                         style={{
                             backgroundImage: `radial-gradient(circle at 50% 50%, rgba(139, 90, 43, 0.3) 0%, transparent 70%)`
                         }}
                    />

                    {/* 城墙容器 */}
                    <div className={`relative ${wallStyle.size} ${wallStyle.border} bg-[#0e0c09] shadow-[0_0_60px_rgba(139,90,43,0.08)]`}>
                        
                        {/* 城墙内部地面纹理 */}
                        <div className="absolute inset-0 opacity-[0.06] pointer-events-none"
                             style={{
                                 backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 8px, rgba(139, 90, 43, 0.2) 8px, rgba(139, 90, 43, 0.2) 9px),
                                                   repeating-linear-gradient(-45deg, transparent, transparent 8px, rgba(139, 90, 43, 0.2) 8px, rgba(139, 90, 43, 0.2) 9px)`
                             }}
                        />

                        {/* 角楼 (仅 TOWN / CAPITAL) */}
                        {wallStyle.hasTowers && (
                            <>
                                <TowerMarker position="top-left" type={city.type} />
                                <TowerMarker position="top-right" type={city.type} />
                                <TowerMarker position="bottom-left" type={city.type} />
                                <TowerMarker position="bottom-right" type={city.type} />
                            </>
                        )}

                        {/* 城墙标记文字 (左侧) */}
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-full pr-3">
                            <span className="text-[9px] text-amber-900/40 tracking-[0.3em] writing-mode-vertical"
                                  style={{ writingMode: 'vertical-rl' }}>
                                {wallStyle.wallLabel}
                            </span>
                        </div>

                        {/* 道路连接线 (建筑之间) */}
                        <svg className="absolute inset-0 w-full h-full pointer-events-none z-0" style={{ overflow: 'visible' }}>
                            {/* 中心到城门的主路 */}
                            <line x1="50%" y1="50%" x2="50%" y2="100%" 
                                  stroke="rgba(139, 90, 43, 0.15)" strokeWidth="3" strokeDasharray="6 4" />
                            {/* 十字路 */}
                            <line x1="20%" y1="50%" x2="80%" y2="50%" 
                                  stroke="rgba(139, 90, 43, 0.1)" strokeWidth="2" strokeDasharray="4 4" />
                            <line x1="50%" y1="15%" x2="50%" y2="85%" 
                                  stroke="rgba(139, 90, 43, 0.1)" strokeWidth="2" strokeDasharray="4 4" />
                        </svg>

                        {/* 建筑方块 */}
                        {city.facilities.map((facility) => {
                            const pos = buildingPositions[facility];
                            const config = FACILITY_CONFIG[facility];
                            if (!pos) return null;
                            const isHovered = hoveredBuilding === facility;
                            return (
                                <div
                                    key={facility}
                                    className={`absolute z-10 -translate-x-1/2 -translate-y-1/2 cursor-pointer transition-all duration-200 group
                                        ${isHovered ? 'scale-110' : 'scale-100'}
                                    `}
                                    style={{ top: pos.top, left: pos.left }}
                                    onClick={() => { setSubView(facility); setSelectedItem(null); }}
                                    onMouseEnter={() => setHoveredBuilding(facility)}
                                    onMouseLeave={() => setHoveredBuilding(null)}
                                >
                                    <div className={`w-20 h-16 sm:w-24 sm:h-20 border-2 flex flex-col items-center justify-center gap-1 relative transition-all duration-200
                                        ${isHovered 
                                            ? 'bg-amber-900/30 border-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.25)]' 
                                            : 'bg-[#141210] border-amber-900/40 hover:border-amber-700/60 shadow-[0_0_10px_rgba(0,0,0,0.5)]'
                                        }
                                    `}>
                                        {/* 屋顶效果 */}
                                        <div className={`absolute -top-2 left-1/2 -translate-x-1/2 w-[110%] h-2 transition-colors duration-200
                                            ${isHovered ? 'bg-amber-700/60' : 'bg-amber-900/30'}
                                        `} style={{ clipPath: 'polygon(10% 100%, 50% 0%, 90% 100%)' }} />
                                        
                                        <span className={`text-[10px] sm:text-xs font-bold tracking-[0.1em] sm:tracking-[0.15em] transition-colors duration-200
                                            ${isHovered ? 'text-amber-300' : 'text-amber-600/80'}
                                        `}>{config.label}</span>
                                    </div>
                                    
                                    {/* 悬停提示 */}
                                    {isHovered && (
                                        <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 whitespace-nowrap">
                                            <span className="text-[10px] text-amber-500/70 tracking-wider">{config.desc}</span>
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        {/* 城门 (底部居中) */}
                        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 z-20">
                            <button
                                onClick={onLeave}
                                className={`${wallStyle.gateSize} h-10 bg-[#1a1610] border-2 border-amber-800/50 hover:border-amber-500 hover:bg-amber-900/30 
                                           flex items-center justify-center gap-1.5 transition-all duration-200 group shadow-[0_0_15px_rgba(0,0,0,0.5)]`}
                            >
                                <span className="text-sm group-hover:text-amber-400 transition-colors">🚪</span>
                                <span className="text-[10px] text-slate-500 group-hover:text-amber-400 tracking-widest font-bold transition-colors">城门</span>
                            </button>
                        </div>

                        {/* 城市名牌 (顶部) */}
                        <div className="absolute -top-10 left-1/2 -translate-x-1/2">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-px bg-gradient-to-r from-transparent to-amber-800/40" />
                                <span className="text-xs text-amber-700/50 tracking-[0.3em] whitespace-nowrap">{city.name}</span>
                                <div className="w-8 h-px bg-gradient-to-l from-transparent to-amber-800/40" />
                            </div>
                        </div>
                    </div>

                    {/* 城墙外部装饰 — 氛围文字 */}
                    <div className="absolute bottom-10 left-1/2 -translate-x-1/2">
                        <p className="text-xs text-slate-600/60 italic tracking-[0.2em] text-center">
                            {STATE_FLAVOR[city.state]}
                        </p>
                    </div>

                    {/* 离开城镇提示 */}
                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2">
                        <p className="text-[10px] text-slate-700/40 tracking-widest">点击建筑进入 · 点击城门离开</p>
                    </div>
                </div>
            </div>
        )}

        {/* ==================== 功能面板视图 ==================== */}
        {subView !== 'MAP' && (
            <div className="flex-1 min-h-0 flex flex-col relative z-10">
                {/* 面板顶栏 */}
                <div className="bg-gradient-to-r from-[#1a1410] via-[#0d0b09] to-[#1a1410] border-b border-amber-900/50 flex flex-col sm:flex-row sm:items-center justify-between px-3 sm:px-6 py-2 gap-2 shrink-0">
                    <div className="flex items-center gap-2 sm:gap-4">
                        <button
                            onClick={goBack}
                            className="flex items-center gap-2 px-3 sm:px-4 py-1.5 border border-amber-900/40 hover:border-amber-600 text-slate-400 hover:text-amber-500 transition-all text-[11px] sm:text-xs tracking-widest"
                        >
                            <span className="text-sm">←</span>
                            <span>返回城镇</span>
                        </button>
                        <div className="h-6 w-px bg-amber-900/30 hidden sm:block" />
                        <div className="flex items-center gap-2">
                            <span className="text-lg">{FACILITY_CONFIG[subView as CityFacility]?.icon}</span>
                            <h2 className="text-base sm:text-lg font-bold text-amber-500 tracking-[0.1em] sm:tracking-[0.15em]">{facilityLabel}</h2>
                            <span className="text-xs text-slate-600">·</span>
                            <span className="text-[11px] sm:text-xs text-slate-500">{city.name}</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <span className="text-amber-500 font-bold font-mono text-sm">{party.gold} <span className="text-amber-700 text-xs">金</span></span>
                    </div>
                </div>

                {/* 面板内容区 */}
                <div className="flex-1 overflow-hidden p-2 sm:p-4 flex flex-col min-h-0">
                    {/* ===== 市集 (仿募兵面板: 左侧名录 + 右侧详情) ===== */}
                    {subView === 'MARKET' && (() => {
                        const sourceItems = marketTab === 'BUY' ? city.market : party.inventory;
                        const filteredItems = itemFilter === 'ALL' ? sourceItems : sourceItems.filter(it => it.type === itemFilter);
                        const pm = city.priceModifier || 1;
                        const getPrice = (item: Item) => marketTab === 'BUY' ? Math.floor(item.value * 1.5 * pm) : Math.floor(item.value * 0.5 * pm);
                        const fromTag = marketTab === 'BUY' ? 'MARKET' as const : 'INVENTORY' as const;

                        const total = filteredItems.length;
                        const totalPages = Math.max(1, Math.ceil(total / MARKET_PAGE_SIZE));
                        const page = Math.min(marketListPage, totalPages - 1);
                        const paginatedItems = total > 0 ? filteredItems.slice(page * MARKET_PAGE_SIZE, (page + 1) * MARKET_PAGE_SIZE) : [];
                        const isBuyMode = marketTab === 'BUY';

                        return (
                        <div className={`flex-1 gap-3 overflow-hidden min-h-0 ${isBuyMode ? 'flex flex-row' : 'flex flex-col lg:flex-row lg:gap-4'}`}>
                            {/* 左侧: 物品名录 */}
                            <div className={`${isBuyMode ? 'w-[60%] min-w-0' : 'lg:flex-[3] flex-1'} bg-black/40 border border-amber-900/30 p-2 sm:p-3 flex flex-col min-h-0 relative overflow-hidden`}>
                                {/* 购入/出售/修缮 标签切换 */}
                                <div className="flex items-center justify-between mb-2 pb-2 border-b border-amber-900/20 shrink-0">
                                    <div className="flex gap-1 overflow-x-auto">
                                        <button
                                            onClick={() => { setMarketTab('BUY'); setSelectedItem(null); }}
                                            className={`px-3 sm:px-4 py-1.5 text-[11px] sm:text-xs tracking-[0.1em] sm:tracking-[0.15em] font-bold transition-all border whitespace-nowrap ${
                                                marketTab === 'BUY'
                                                    ? 'bg-amber-900/30 border-amber-600 text-amber-400 shadow-[inset_0_0_10px_rgba(245,158,11,0.1)]'
                                                    : 'bg-transparent border-slate-800/50 text-slate-500 hover:border-amber-800 hover:text-slate-400'
                                            }`}
                                        >货物供应</button>
                                        <button
                                            onClick={() => { setMarketTab('SELL'); setSelectedItem(null); }}
                                            className={`px-3 sm:px-4 py-1.5 text-[11px] sm:text-xs tracking-[0.1em] sm:tracking-[0.15em] font-bold transition-all border whitespace-nowrap ${
                                                marketTab === 'SELL'
                                                    ? 'bg-amber-900/30 border-amber-600 text-amber-400 shadow-[inset_0_0_10px_rgba(245,158,11,0.1)]'
                                                    : 'bg-transparent border-slate-800/50 text-slate-500 hover:border-amber-800 hover:text-slate-400'
                                            }`}
                                        >出售物资</button>
                                    </div>
                                    <span className={`text-[10px] text-slate-600 ${isBuyMode ? 'inline' : 'hidden sm:inline'}`}>
                                        {marketTab === 'BUY' ? `${city.market.length} 件货物` : `背包 ${party.inventory.length} 件`}
                                    </span>
                                </div>

                                {/* 类型筛选栏 */}
                                <div className="flex gap-1 mb-2 shrink-0 flex-wrap">
                                    {ITEM_FILTER_TABS.map(tab => (
                                        <button
                                            key={tab.key}
                                            onClick={() => { setItemFilter(tab.key); setSelectedItem(null); }}
                                            className={`px-2.5 py-1 text-[10px] tracking-wider transition-all border ${
                                                itemFilter === tab.key
                                                    ? 'bg-amber-900/20 border-amber-700/50 text-amber-500'
                                                    : 'bg-transparent border-slate-800/30 text-slate-600 hover:text-slate-400 hover:border-slate-700'
                                            }`}
                                        >{tab.label}</button>
                                    ))}
                                </div>

                                {/* 物品卡片网格（当前页，纯分页不滚动） */}
                                <div className="flex-1 min-h-0">
                                    {filteredItems.length > 0 ? (
                                        <div className={`grid gap-2 h-full ${isBuyMode ? 'grid-cols-2 grid-rows-3' : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3'}`}>
                                            {paginatedItems.map((item) => {
                                                // 找到在原始数组中的真实index
                                                const realIndex = sourceItems.indexOf(item);
                                                const price = getPrice(item);
                                                const tier = getItemTier(item.value, item.rarity);
                                                const isSelected = selectedItem?.from === fromTag && selectedItem?.index === realIndex;
                                                const canAfford = marketTab === 'BUY' ? party.gold >= price : true;
                                                return (
                                                    <MarketItemCard
                                                        key={`${item.id}-${realIndex}`}
                                                        item={item}
                                                        price={price}
                                                        tier={tier}
                                                        isSelected={isSelected}
                                                        canAfford={canAfford}
                                                        onClick={() => setSelectedItem({ item, from: fromTag, index: realIndex })}
                                                        onDoubleClick={() => marketTab === 'BUY' ? handleBuy(item, realIndex) : handleSell(item, realIndex)}
                                                    />
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <div className="h-full flex flex-col items-center justify-center text-slate-700">
                                            <p className="text-lg tracking-widest">
                                                {marketTab === 'BUY' ? '已被抢购一空' : '行囊空空如也'}
                                            </p>
                                            <p className="text-xs mt-1 text-slate-800">
                                                {marketTab === 'BUY' ? '下次来或许会有新货' : '先去买些装备吧'}
                                            </p>
                                        </div>
                                    )}
                                </div>

                                <div className="mt-2 pt-2 border-t border-amber-900/20 shrink-0">
                                    <div className="flex items-center justify-between gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setMarketListPage(p => Math.max(0, p - 1))}
                                            disabled={page <= 0}
                                            className="px-2.5 py-1 text-[10px] border border-amber-900/40 text-amber-600 hover:border-amber-600 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-amber-900/40 transition-all"
                                        >
                                            上一页
                                        </button>
                                        <span className="text-[10px] text-slate-500 font-mono whitespace-nowrap">
                                            第 {page + 1} / {totalPages} 页 · {total} 件
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => setMarketListPage(p => Math.min(totalPages - 1, p + 1))}
                                            disabled={page >= totalPages - 1}
                                            className="px-2.5 py-1 text-[10px] border border-amber-900/40 text-amber-600 hover:border-amber-600 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-amber-900/40 transition-all"
                                        >
                                            下一页
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* 右侧: 物品详情面板 */}
                            {(
                            <div className={`${isBuyMode ? 'w-[40%] min-w-[260px] max-w-[460px]' : 'lg:flex-[2] flex-1 lg:min-w-[300px]'} bg-[#0d0b08] border border-amber-900/30 p-3 sm:p-4 flex flex-col shadow-xl min-h-0 relative overflow-hidden`}>
                                {selectedItem ? (() => {
                                    const item = selectedItem.item;
                                    const tier = getItemTier(item.value, item.rarity);
                                    const pmDetail = city.priceModifier || 1;
                                    const price = selectedItem.from === 'MARKET' ? Math.floor(item.value * 1.5 * pmDetail) : Math.floor(item.value * 0.5 * pmDetail);
                                    const canAfford = selectedItem.from === 'MARKET' ? party.gold >= price : true;
                                    return (
                                        <>
                                            {/* 头部: 物品名 + 品质 + 类型 */}
                                            <div className={`mb-3 shrink-0 border-b ${tier.detailBorderColor} pb-3`}>
                                                <div className="flex items-center gap-3 mb-2">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-baseline gap-2">
                                                            <h2 className={`${isBuyMode ? 'text-lg' : 'text-xl'} font-bold ${tier.nameColor} truncate`}>{item.name}</h2>
                                                            {tier.label && (
                                                                <span className={`text-[10px] px-1.5 py-0.5 border ${tier.labelColor} ${
                                                                    tier.tier === 'LEGENDARY' ? 'border-amber-500/50 bg-amber-950/30' :
                                                                    tier.tier === 'EPIC' ? 'border-purple-500/50 bg-purple-950/30' :
                                                                    'border-sky-500/50 bg-sky-950/30'
                                                                } tracking-wider font-bold`}>
                                                                    {tier.label}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <span className="text-[10px] text-slate-600 uppercase tracking-widest">{getItemTypeName(item.type)}</span>
                                                    </div>
                                                </div>
                                                {/* 价格区块 (仿募兵费用排版) */}
                                                <div className="flex items-center justify-between mt-2 bg-black/30 p-2 border border-white/5">
                                                    <div className="flex gap-4">
                                                        <div>
                                                            <span className="text-[9px] text-slate-600 block">{selectedItem.from === 'MARKET' ? '购入价' : '售出价'}</span>
                                                            <span className={`${isBuyMode ? 'text-base' : 'text-lg'} font-mono font-bold ${canAfford ? tier.priceLabelColor : 'text-red-500'}`}>
                                                                {price} <span className="text-xs text-amber-700">金</span>
                                                            </span>
                                                        </div>
                                                        <div className="border-l border-white/5 pl-4">
                                                            <span className="text-[9px] text-slate-600 block">基础价值</span>
                                                            <span className="text-sm font-mono text-slate-300">{item.value} <span className="text-xs text-slate-600">金</span></span>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <span className="text-[9px] text-slate-600 block">重量</span>
                                                        <span className="text-sm text-slate-400 font-mono">{item.weight}</span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* 属性面板 - 可滚动区域 */}
                                            <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar">
                                                {/* 属性条可视化 */}
                                                <div className="bg-black/20 p-3 border border-white/5 mb-3 space-y-2">
                                                    {item.damage && (
                                                        <ItemStatBar label="杀伤力" value={`${item.damage[0]}-${item.damage[1]}`} pct={Math.min(100, ((item.damage[0] + item.damage[1]) / 2 / 90) * 100)} colorBar="bg-red-700" colorText="text-red-400" />
                                                    )}
                                                    {item.armorPen !== undefined && item.armorPen > 0 && (
                                                        <ItemStatBar label="穿甲能力" value={`${Math.round(item.armorPen * 100)}%`} pct={item.armorPen * 100} colorBar="bg-sky-700" colorText="text-sky-400" />
                                                    )}
                                                    {item.armorDmg !== undefined && item.armorDmg > 0 && (
                                                        <ItemStatBar label="破甲效率" value={`${Math.round(item.armorDmg * 100)}%`} pct={Math.min(100, item.armorDmg * 50)} colorBar="bg-amber-700" colorText="text-amber-400" />
                                                    )}
                                                    {item.durability !== undefined && item.durability > 0 && (
                                                        <ItemStatBar label="护甲耐久" value={`${item.durability} / ${item.maxDurability}`} pct={(item.durability / Math.max(1, item.maxDurability)) * 100} colorBar="bg-slate-600" colorText="text-slate-300" />
                                                    )}
                                                    {item.defenseBonus !== undefined && item.defenseBonus > 0 && (
                                                        <ItemStatBar label="近战防御" value={`+${item.defenseBonus}`} pct={Math.min(100, (item.defenseBonus / 30) * 100)} colorBar="bg-emerald-700" colorText="text-emerald-400" />
                                                    )}
                                                    {item.rangedBonus !== undefined && item.rangedBonus > 0 && (
                                                        <ItemStatBar label="远程防御" value={`+${item.rangedBonus}`} pct={Math.min(100, (item.rangedBonus / 35) * 100)} colorBar="bg-emerald-700" colorText="text-emerald-400" />
                                                    )}
                                                    {item.fatigueCost !== undefined && item.fatigueCost > 0 && (
                                                        <ItemStatBar label="体力消耗" value={`-${item.fatigueCost}`} pct={Math.min(100, (item.fatigueCost / 22) * 100)} colorBar="bg-purple-700" colorText="text-purple-400" />
                                                    )}
                                                    {item.maxFatiguePenalty !== undefined && item.maxFatiguePenalty > 0 && (
                                                        <ItemStatBar label="负重惩罚" value={`-${item.maxFatiguePenalty}`} pct={Math.min(100, (item.maxFatiguePenalty / 34) * 100)} colorBar="bg-red-800" colorText="text-red-400" />
                                                    )}
                                                    {item.hitChanceMod !== undefined && item.hitChanceMod !== 0 && (
                                                        <ItemStatBar label="命中修正" value={`${item.hitChanceMod > 0 ? '+' : ''}${item.hitChanceMod}%`} pct={Math.min(100, Math.abs(item.hitChanceMod) / 20 * 100)} colorBar={item.hitChanceMod > 0 ? 'bg-emerald-700' : 'bg-red-800'} colorText={item.hitChanceMod > 0 ? 'text-emerald-400' : 'text-red-400'} />
                                                    )}
                                                    {item.range !== undefined && item.range > 1 && (
                                                        <ItemStatBar label="攻击距离" value={`${item.range} 格`} pct={Math.min(100, (item.range / 6) * 100)} colorBar="bg-slate-600" colorText="text-slate-300" />
                                                    )}
                                                </div>

                                                {/* 物品描述 */}
                                                <div className="mb-2">
                                                    <h4 className="text-[9px] text-slate-600 uppercase tracking-[0.15em] mb-1.5">描述</h4>
                                                    <p className={`text-xs italic leading-relaxed pl-3 border-l-2 ${
                                                        tier.tier === 'LEGENDARY' ? 'text-amber-400/80 border-amber-600/50' :
                                                        tier.tier === 'EPIC' ? 'text-purple-400/70 border-purple-600/40' :
                                                        'text-slate-500 border-amber-900/30'
                                                    }`}>
                                                        "{item.description}"
                                                    </p>
                                                </div>
                                            </div>

                                            {/* 操作按钮固定底部，避免横屏时滚动后丢失主操作 */}
                                            <div className="sticky bottom-0 pt-2 pb-1 bg-gradient-to-t from-[#0d0b08] via-[#0d0b08] to-transparent shrink-0">
                                                <button
                                                    onClick={() => selectedItem.from === 'MARKET' ? handleBuy(item, selectedItem.index) : handleSell(item, selectedItem.index)}
                                                    disabled={selectedItem.from === 'MARKET' && !canAfford}
                                                    className={`w-full py-2.5 border font-bold tracking-widest shadow-lg transition-all uppercase text-sm ${
                                                        canAfford
                                                            ? 'bg-amber-900/30 hover:bg-amber-700 border-amber-700/50 hover:border-amber-500 text-amber-500 hover:text-white'
                                                            : 'bg-slate-900/30 border-slate-800 text-slate-600 cursor-not-allowed'
                                                    }`}
                                                >
                                                    {selectedItem.from === 'MARKET'
                                                        ? (canAfford ? `购 买 — ${price} 金` : `金币不足 (需 ${price})`)
                                                        : `出 售 — ${price} 金`
                                                    }
                                                </button>
                                            </div>
                                        </>
                                    );
                                })() : (
                                    <div className="flex-1 flex flex-col items-center justify-center text-slate-700">
                                        <div className="text-4xl mb-4 text-slate-800">🏪</div>
                                        <p className="text-sm tracking-widest">从左侧选择一件物品</p>
                                        <p className="text-sm tracking-widest">查看详情或进行交易</p>
                                        <p className="text-[10px] text-slate-800 mt-3">双击可直接交易</p>
                                    </div>
                                )}
                            </div>
                            )}
                        </div>
                        );
                    })()}

                    {/* ===== 募兵 (Battle Brothers风格: 左侧名录 + 右侧详情) ===== */}
                    {subView === 'RECRUIT' && (
                        <div className="flex-1 flex flex-col lg:flex-row gap-3 lg:gap-4 overflow-hidden min-h-0">
                            {/* 左侧: 候选人名录 */}
                            <div className="lg:flex-[3] flex-1 bg-black/40 border border-amber-900/30 p-2 sm:p-3 flex flex-col min-h-0 relative overflow-hidden">
                                <div className="flex justify-between items-center mb-2 pb-1 border-b border-amber-900/20 shrink-0">
                                    <h2 className="text-[10px] text-amber-700 uppercase tracking-[0.2em]">可招募人员</h2>
                                    <span className="text-[10px] text-slate-600">当前战团 {party.mercenaries.length}/20 人</span>
                                </div>
                                <div className="overflow-y-auto flex-1 min-h-0 custom-scrollbar">
                                    {city.recruits.length > 0 ? (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-2">
                                {city.recruits.map((merc, i) => {
                                                const hireCost = merc.hireCost;
                                                const bgEntry = Object.values(BACKGROUNDS).find(b => b.name === merc.background);
                                                const bgIcon = bgEntry?.icon || '?';
                                                const isSelected = selectedRecruit === i;
                                                const canAfford = party.gold >= hireCost;
                                                return (
                                                    <div
                                                        key={merc.id}
                                                        onClick={() => setSelectedRecruit(isSelected ? null : i)}
                                                        onDoubleClick={() => handleRecruit(merc, i)}
                                                        className={`border p-3 cursor-pointer transition-all flex flex-col gap-1.5 relative group ${
                                                            isSelected
                                                                ? 'bg-amber-900/30 border-amber-500 shadow-[inset_0_0_15px_rgba(245,158,11,0.15)]'
                                                                : 'bg-black/30 border-slate-800/50 hover:border-amber-700/60 hover:bg-black/50'
                                                        }`}
                                                    >
                                                        {/* 图标 + 名字 */}
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-xl leading-none">{bgIcon}</span>
                                                            <div className="flex-1 min-w-0">
                                                                <div className={`text-sm font-bold truncate ${isSelected ? 'text-amber-100' : 'text-slate-200'}`}>{merc.name}</div>
                                                                <div className="text-[10px] text-amber-700 truncate">{merc.background}</div>
                                                            </div>
                                                        </div>
                                                        {/* 费用 */}
                                                        <div className="flex justify-between items-center mt-0.5">
                                                            <span className="text-[9px] text-slate-600">雇佣费</span>
                                                            <span className={`text-xs font-mono font-bold ${canAfford ? 'text-amber-500' : 'text-red-500'}`}>{hireCost} 金</span>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <div className="h-full flex flex-col items-center justify-center text-slate-700">
                                            <p className="text-lg tracking-widest">此处已无可用之才</p>
                                            <p className="text-xs mt-1 text-slate-800">他日再来或许会有新面孔</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* 右侧: 选中角色详情面板 */}
                            <div className="lg:flex-[2] flex-1 bg-[#0d0b08] border border-amber-900/30 p-4 sm:p-5 flex flex-col shadow-xl min-w-0 lg:min-w-[300px] min-h-0 relative overflow-hidden">
                                {selectedRecruit !== null && city.recruits[selectedRecruit] ? (() => {
                                    const merc = city.recruits[selectedRecruit];
                                    const hireCost = merc.hireCost;
                                    const role = getRoleRecommendation(merc);
                                    const bgEntry = Object.values(BACKGROUNDS).find(b => b.name === merc.background);
                                    const bgIcon = bgEntry?.icon || '?';
                                    const canAfford = party.gold >= hireCost;
                                    return (
                                        <>
                                            {/* 头部: 姓名 + 背景 */}
                                            <div className="mb-4 shrink-0 border-b border-amber-900/40 pb-4">
                                                <div className="flex items-center gap-3 mb-2">
                                                    <span className="text-3xl">{bgIcon}</span>
                                                <div>
                                                        <h2 className="text-xl font-bold text-amber-100">{merc.name}</h2>
                                                        <div className="flex items-center gap-2 mt-0.5">
                                                            <span className="text-xs text-amber-700">{merc.background}</span>
                                                            <span className="text-slate-700">·</span>
                                                            <span className="text-xs text-slate-500 font-mono">Lv.{merc.level}</span>
                                                    </div>
                                                    </div>
                                                </div>
                                                {/* 费用信息 + 角色评语 */}
                                                <div className="flex items-center justify-between mt-2 bg-black/30 p-2 border border-white/5">
                                                    <div className="flex gap-4">
                                                        <div>
                                                            <span className="text-[9px] text-slate-600 block">雇佣费</span>
                                                            <span className={`text-lg font-mono font-bold ${canAfford ? 'text-amber-500' : 'text-red-500'}`}>{hireCost} <span className="text-xs text-amber-700">金</span></span>
                                                        </div>
                                                        <div className="border-l border-white/5 pl-4">
                                                            <span className="text-[9px] text-slate-600 block">日薪</span>
                                                            <span className="text-sm font-mono text-slate-300">{merc.salary} <span className="text-xs text-slate-600">金/日</span></span>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <span className="text-[9px] text-slate-600 block">评估定位</span>
                                                        <span className="text-sm text-amber-500 font-bold">{role}</span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* 特质标签 */}
                                            {merc.traits && merc.traits.length > 0 && (
                                                <div className="flex flex-wrap gap-1.5 mb-4 shrink-0">
                                                    {merc.traits.map(tid => {
                                                        const trait = TRAIT_TEMPLATES[tid];
                                                        if (!trait) return null;
                                                        const isPositive = trait.type === 'positive';
                                                        return (
                                                            <button
                                                                type="button"
                                                                key={tid}
                                                                className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded border cursor-pointer select-none touch-manipulation ${
                                                                    isPositive
                                                                        ? 'text-emerald-300 bg-emerald-950/40 border-emerald-800/50'
                                                                        : 'text-red-300 bg-red-950/40 border-red-800/50'
                                                                }`}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setActiveTraitTooltip(prev => prev === tid ? null : tid);
                                                                }}
                                                            >
                                                                <span>{trait.icon}</span>
                                                                <span>{trait.name}</span>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                            {activeTrait && (
                                                <div className="mb-4 shrink-0 px-3 py-2 bg-black/70 border border-amber-900/40 rounded text-xs text-slate-300">
                                                    <div className="font-bold text-amber-400 mb-1">{activeTrait.icon} {activeTrait.name}</div>
                                                    <div>{activeTrait.description}</div>
                                                </div>
                                            )}

                                            {/* 属性面板 - 可滚动区域 */}
                                            <div className="flex-1 overflow-y-auto mb-4 min-h-0 custom-scrollbar">
                                                {/* 属性条 */}
                                                <div className="grid grid-cols-2 gap-x-4 gap-y-2 bg-black/20 p-3 border border-white/5 mb-4">
                                                    <StatBarSmall label="生命" val={merc.maxHp} max={120} stars={merc.stars.hp} colorBar="bg-red-800" colorText="text-red-400" />
                                                    <StatBarSmall label="体力" val={merc.maxFatigue} max={140} stars={merc.stars.fatigue} colorBar="bg-sky-800" colorText="text-sky-400" />
                                                    <StatBarSmall label="胆识" val={merc.stats.resolve} max={80} stars={merc.stars.resolve} colorBar="bg-purple-800" colorText="text-purple-400" />
                                                    <StatBarSmall label="先手" val={merc.stats.initiative} max={160} stars={merc.stars.initiative} colorBar="bg-emerald-800" colorText="text-emerald-400" />
                                                    <div className="col-span-2 h-px bg-white/5 my-1" />
                                                    <StatBarSmall label="近战命中" val={merc.stats.meleeSkill} max={100} stars={merc.stars.meleeSkill} colorBar="bg-amber-800" colorText="text-amber-400" />
                                                    <StatBarSmall label="远程命中" val={merc.stats.rangedSkill} max={100} stars={merc.stars.rangedSkill} colorBar="bg-orange-800" colorText="text-orange-400" />
                                                    <StatBarSmall label="近战防御" val={merc.stats.meleeDefense} max={50} stars={merc.stars.meleeDefense} colorBar="bg-slate-700" colorText="text-slate-400" />
                                                    <StatBarSmall label="远程防御" val={merc.stats.rangedDefense} max={50} stars={merc.stars.rangedDefense} colorBar="bg-slate-700" colorText="text-slate-400" />
                                                </div>

                                                {/* 背景故事 */}
                                                <div className="mb-3">
                                                    <h4 className="text-[9px] text-slate-600 uppercase tracking-[0.15em] mb-1.5">身世</h4>
                                                    <p className="text-xs text-slate-500 italic leading-relaxed pl-3 border-l-2 border-amber-900/30">
                                                        "{merc.backgroundStory}"
                                                    </p>
                                                </div>
                                            </div>

                                            {/* 雇佣按钮 */}
                                            <button
                                                onClick={() => {
                                                    handleRecruit(merc, selectedRecruit);
                                                    setSelectedRecruit(null);
                                                }}
                                                disabled={!canAfford || party.mercenaries.length >= 20}
                                                className={`w-full py-3 border font-bold tracking-widest shadow-lg shrink-0 transition-all uppercase ${
                                                    canAfford && party.mercenaries.length < 20
                                                        ? 'bg-amber-900/30 hover:bg-amber-700 border-amber-700/50 hover:border-amber-500 text-amber-500 hover:text-white'
                                                        : 'bg-slate-900/30 border-slate-800 text-slate-600 cursor-not-allowed'
                                                }`}
                                            >
                                                {party.mercenaries.length >= 20 ? '战团已满' : !canAfford ? `金币不足 (需 ${hireCost})` : `雇 佣 — ${hireCost} 金`}
                                            </button>
                                        </>
                                    );
                                })() : (
                                    <div className="flex-1 flex flex-col items-center justify-center text-slate-700">
                                        <div className="text-4xl mb-4 text-slate-800">⚔️</div>
                                        <p className="text-sm tracking-widest">从左侧名录中选择</p>
                                        <p className="text-sm tracking-widest">一名候选人以查看详情</p>
                                        <p className="text-[10px] text-slate-800 mt-3">双击可直接雇佣</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ===== 酒肆 ===== */}
                    {subView === 'TAVERN' && (
                        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                            <div className="shrink-0 mb-4 text-center">
                                <h2 className="text-lg font-bold text-amber-600 tracking-widest">契约公告</h2>
                                <p className="text-xs text-slate-600 mt-1">在此处接取工作，赚取金币与声望</p>
                                {party.activeQuest && !party.activeQuest.isCompleted && (
                                    <div className="mt-2 text-xs text-red-400 font-bold bg-red-950/20 py-1 px-3 inline-block border border-red-900/40">
                                        已有在身契约，需先完成当前任务
                                    </div>
                                )}
                                {party.activeQuest && party.activeQuest.isCompleted && party.activeQuest.sourceCityId !== city.id && (
                                    <div className="mt-2 text-xs text-amber-400 font-bold bg-amber-950/20 py-1 px-3 inline-block border border-amber-900/40">
                                        契约已完成，请返回接取城市交付
                                    </div>
                                )}
                            </div>
                            <div className="city-panel-scroll flex-1 overflow-y-auto min-h-0 custom-scrollbar touch-pan-y">
                                {/* ===== 已完成任务交付面板（仿战场兄弟：返回接取城市交付） ===== */}
                                {party.activeQuest && party.activeQuest.isCompleted && party.activeQuest.sourceCityId === city.id && (
                                    <div className="mb-5 border-2 border-emerald-700/60 bg-emerald-950/20 p-5 relative animate-pulse-slow">
                                        <div className="absolute top-2 right-2 text-[10px] px-2 py-0.5 border border-emerald-600/50 text-emerald-400 bg-emerald-900/30 font-bold tracking-wider">
                                            任务完成
                                        </div>
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="text-emerald-500 text-lg">&#10003;</span>
                                            <h3 className="text-lg font-bold text-emerald-300">{party.activeQuest.title}</h3>
                                        </div>
                                        <p className="text-sm text-slate-400 italic mb-3 border-l-2 border-emerald-800/50 pl-3">
                                            目标已消灭，委托人对你的表现非常满意。
                                        </p>
                                        <div className="flex items-center justify-between mb-4">
                                            <div className="text-sm text-slate-400">
                                                <span className="text-slate-600">类型: </span>
                                                <span className="text-amber-600">{party.activeQuest.type === 'HUNT' ? '讨伐' : party.activeQuest.type === 'ESCORT' ? '护送' : party.activeQuest.type === 'PATROL' ? '巡逻' : '押运'}</span>
                                                {party.activeQuest.targetEntityName && (
                                                    <span className="ml-3 text-red-400">目标:「{party.activeQuest.targetEntityName}」</span>
                                                )}
                                                {party.activeQuest.type === 'PATROL' && (
                                                    <span className="ml-3 text-amber-400">
                                                        清剿: {party.activeQuest.patrolKillsDone || 0}/{party.activeQuest.patrolKillsRequired || 0}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-right">
                                                <div className="text-xl font-mono text-amber-500 font-bold">{party.activeQuest.rewardGold}</div>
                                                <div className="text-[10px] text-amber-700">金币报酬</div>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => {
                                                onCompleteQuest();
                                                showNotification(`契约完成！获得 ${party.activeQuest!.rewardGold} 金币`);
                                            }}
                                            className="w-full py-3 bg-emerald-800/80 hover:bg-emerald-600 border border-emerald-500/60 text-white font-bold tracking-[0.3em] uppercase transition-all shadow-lg"
                                        >
                                            交付契约
                                        </button>
                                    </div>
                                )}

                                {city.quests && city.quests.length > 0 ? (
                                    <div className="space-y-4">
                                        {city.quests.map(quest => {
                                            const reputationLocked = !!quest.requiredReputation && party.reputation < quest.requiredReputation;
                                            const isDisabled = !!party.activeQuest || reputationLocked;
                                            
                                            return (
                                            <div key={quest.id} className={`border p-4 relative transition-all ${
                                                reputationLocked
                                                    ? 'bg-slate-950/60 border-slate-800/40 opacity-70'
                                                    : 'bg-black/40 border-amber-900/30 hover:border-amber-600/50'
                                            }`}>
                                                {/* 声望门槛标签 */}
                                                {quest.requiredReputation && (
                                                    <div className={`absolute top-2 right-2 text-[9px] px-2 py-0.5 border tracking-wider font-bold ${
                                                        reputationLocked
                                                            ? 'border-red-900/50 text-red-500/80 bg-red-950/30'
                                                            : 'border-amber-600/50 text-amber-400 bg-amber-900/20'
                                                    }`}>
                                                        {reputationLocked ? `需声望 ${quest.requiredReputation}` : '高级委托'}
                                                    </div>
                                                )}
                                                
                                                <div className="flex justify-between items-start mb-3">
                                                    <div>
                                                        <div className="flex items-center gap-3">
                                                            <span className={`text-[10px] px-2 py-0.5 border uppercase tracking-widest ${
                                                                reputationLocked ? 'border-slate-700 text-slate-600' : 'border-amber-900/40 text-amber-700'
                                                            }`}>
                                                                {getQuestTypeName(quest.type)}
                                                            </span>
                                                            <h3 className={`text-lg font-bold ${reputationLocked ? 'text-slate-500' : 'text-amber-100'}`}>{quest.title}</h3>
                                                        </div>
                                                        <div className="flex items-center gap-4 mt-2">
                                                            <div className={`flex text-xs tracking-widest ${reputationLocked ? 'text-slate-600' : 'text-amber-600'}`}>
                                                                <span className="text-slate-500 mr-2">难度:</span>
                                                                {'★'.repeat(quest.difficulty)}<span className="text-slate-700">{'★'.repeat(3 - quest.difficulty)}</span>
                                                            </div>
                                                            {quest.requiredReputation && (
                                                                <div className={`text-[10px] ${reputationLocked ? 'text-red-500/70' : 'text-amber-600'}`}>
                                                                    需要声望: {quest.requiredReputation}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        {(() => {
                                                          if (reputationLocked) {
                                                            return <>
                                                              <div className="text-xl font-mono text-slate-600 font-bold">???</div>
                                                              <div className="text-[10px] text-slate-700">声望不足</div>
                                                            </>;
                                                          }
                                                          const mult = getReputationRewardMultiplier(party.reputation);
                                                          const boosted = Math.floor(quest.rewardGold * mult);
                                                          const hasBonus = mult > 1;
                                                          return <>
                                                            <div className="text-xl font-mono text-amber-500 font-bold">{boosted}</div>
                                                            <div className="text-[10px] text-amber-700">
                                                              金币报酬{hasBonus && <span className="text-emerald-600 ml-1">(声望+{Math.round((mult - 1) * 100)}%)</span>}
                                                            </div>
                                                          </>;
                                                        })()}
                                                    </div>
                                                </div>
                                                <p className={`text-sm italic mb-4 border-l-2 pl-3 leading-relaxed ${
                                                    reputationLocked ? 'text-slate-600 border-slate-800' : 'text-slate-500 border-amber-900/30'
                                                }`}>
                                                    {reputationLocked 
                                                        ? '「此委托只接受声名远扬的战团。你们……还不够格。」' 
                                                        : `"${quest.description}"`
                                                    }
                                                </p>
                                                {!reputationLocked && quest.type === 'PATROL' && (
                                                    <div className="text-[11px] text-amber-600 mb-3">
                                                        任务目标：前往指定巡逻路段并击杀
                                                        <span className="text-red-400 font-bold mx-1">{quest.patrolKillsRequired || (quest.difficulty === 1 ? 4 : quest.difficulty === 2 ? 6 : 8)}</span>
                                                        名敌人
                                                    </div>
                                                )}
                                                <button 
                                                    onClick={() => !isDisabled && handleQuestTake(quest)}
                                                    disabled={isDisabled}
                                                    className={`w-full py-3 border font-bold tracking-widest uppercase transition-all
                                                        ${reputationLocked
                                                            ? 'bg-slate-950/30 border-slate-800 text-slate-700 cursor-not-allowed'
                                                            : party.activeQuest 
                                                                ? 'bg-slate-900/30 border-slate-800 text-slate-600 cursor-not-allowed' 
                                                                : 'bg-amber-900/20 border-amber-700/50 text-amber-500 hover:bg-amber-700 hover:border-amber-500 hover:text-white'
                                                        }
                                                    `}
                                                >
                                                    {reputationLocked 
                                                        ? `声望不足（需 ${quest.requiredReputation}）` 
                                                        : party.activeQuest ? '无法接受' : '接受委托'
                                                    }
                                                </button>
                                            </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="h-full flex flex-col items-center justify-center text-slate-700">
                                        <p className="text-lg tracking-widest">暂无可接委托</p>
                                        <p className="text-xs mt-1 text-slate-800">过几日再来看看，也许会有新的任务</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ===== 医馆 ===== */}
                    {subView === 'TEMPLE' && (
                        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                            <div className="text-center mb-4 shrink-0">
                                <h2 className="text-lg font-bold text-emerald-600 tracking-widest">医馆治疗</h2>
                                <p className="text-slate-600 text-xs mt-1">支付费用治疗伤员，费用取决于伤势轻重</p>
                            </div>
                            <div className="city-panel-scroll flex-1 overflow-y-auto min-h-0 custom-scrollbar touch-pan-y">
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                                    {party.mercenaries.map((merc, i) => {
                                        const missingHp = merc.maxHp - merc.hp;
                                        const healCost = missingHp * 2;
                                        const isInjured = missingHp > 0;
                                        const hpPct = (merc.hp / merc.maxHp) * 100;
                                        return (
                                            <div key={merc.id} className={`flex items-center gap-4 p-4 border bg-black/40 ${isInjured ? 'border-red-900/30' : 'border-emerald-900/20 opacity-60'}`}>
                                                <div className="flex-1">
                                                    <div className="flex justify-between items-center mb-2">
                                                        <div>
                                                            <span className="font-bold text-amber-100">{merc.name}</span>
                                                            <span className="text-xs text-slate-600 ml-2">{merc.background}</span>
                                                        </div>
                                                        <span className={`text-[10px] px-2 py-0.5 border ${isInjured ? 'text-red-400 border-red-900/40' : 'text-emerald-500 border-emerald-900/40'}`}>
                                                            {isInjured ? '受伤' : '健康'}
                                                        </span>
                                                    </div>
                                                    <div className="h-3 w-full bg-black/60 overflow-hidden border border-white/5 relative">
                                                        <div className={`h-full transition-all ${isInjured ? 'bg-red-800' : 'bg-emerald-800'}`} style={{ width: `${hpPct}%` }} />
                                                    </div>
                                                    <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-mono">
                                                        <span>生命: {merc.hp} / {merc.maxHp}</span>
                                                        {isInjured && <span className="text-red-400">-{missingHp}</span>}
                                                    </div>
                                                </div>
                                                {isInjured ? (
                                                    <button 
                                                        onClick={() => handleHeal(merc, i)}
                                                        className="px-4 py-2 bg-emerald-900/20 border border-emerald-700/50 text-emerald-400 hover:bg-emerald-700 hover:border-emerald-500 hover:text-white transition-all text-xs font-bold whitespace-nowrap"
                                                    >治疗 (-{healCost} 金)</button>
                                                ) : (
                                                    <div className="px-4 py-2 text-slate-700 text-xs font-bold">无须治疗</div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        )}

        {/* Notification Toast */}
        {notification && (
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-amber-600 text-white px-6 py-2 shadow-2xl z-50 font-bold tracking-widest">
                {notification}
            </div>
        )}
    </div>
  );
};

// ==================== Helper Components ====================

// 角楼标记组件
const TowerMarker: React.FC<{ position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'; type: City['type'] }> = ({ position, type }) => {
    const posClass: Record<string, string> = {
        'top-left': '-top-2 -left-2',
        'top-right': '-top-2 -right-2',
        'bottom-left': '-bottom-2 -left-2',
        'bottom-right': '-bottom-2 -right-2',
    };
    const size = type === 'CAPITAL' ? 'w-5 h-5' : 'w-4 h-4';
    const bg = type === 'CAPITAL' ? 'bg-amber-800/60 border-amber-600/50' : 'bg-amber-900/40 border-amber-800/40';
    
    return (
        <div className={`absolute ${posClass[position]} ${size} ${bg} border z-10 flex items-center justify-center`}>
            <span className="text-[8px] text-amber-500/70">◉</span>
        </div>
    );
};

// 属性条
interface StatBarSmallProps {
    label: string;
    val: number;
    max: number;
    stars: number;
    colorBar: string;
    colorText: string;
}

const StatBarSmall: React.FC<StatBarSmallProps> = ({ label, val, max, stars, colorBar, colorText }) => {
    const pct = Math.min(100, (val / max) * 100);
    return (
        <div className="space-y-1">
            <div className="flex justify-between items-center text-[10px]">
                <span className="text-slate-500">{label}</span>
                <div className="flex items-center gap-1">
                    {stars > 0 && <span className="text-amber-500 text-[9px]">{'★'.repeat(stars)}</span>}
                    <span className={`font-mono font-bold ${colorText}`}>{val}</span>
                </div>
            </div>
            <div className="h-2 bg-black/60 w-full overflow-hidden border border-white/10 relative">
                <div className={`h-full ${colorBar} transition-all duration-300`} style={{ width: `${pct}%` }} />
            </div>
        </div>
    );
};

// 物品属性条（用于详情面板）
interface ItemStatBarProps {
    label: string;
    value: string;
    pct: number;
    colorBar: string;
    colorText: string;
}

const ItemStatBar: React.FC<ItemStatBarProps> = ({ label, value, pct, colorBar, colorText }) => (
    <div className="space-y-1">
        <div className="flex justify-between items-center text-[10px]">
            <span className="text-slate-500">{label}</span>
            <span className={`font-mono font-bold ${colorText}`}>{value}</span>
        </div>
        <div className="h-2 bg-black/60 w-full overflow-hidden border border-white/10 relative">
            <div className={`h-full ${colorBar} transition-all duration-300`} style={{ width: `${Math.min(100, pct)}%` }} />
        </div>
    </div>
);

// 市集物品卡片（仿募兵候选人卡片风格 + 品质分级）
interface MarketItemCardProps {
    item: Item;
    price: number;
    tier: TierConfig;
    isSelected: boolean;
    canAfford: boolean;
    onClick: () => void;
    onDoubleClick: () => void;
}

const MarketItemCard: React.FC<MarketItemCardProps> = ({ item, price, tier, isSelected, canAfford, onClick, onDoubleClick }) => (
    <div
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        className={`border p-2 cursor-pointer transition-all flex flex-col gap-1 relative group min-h-[86px] ${
            isSelected
                ? `${tier.bgSelectedClass} ${tier.borderSelectedClass} shadow-[inset_0_0_15px_rgba(245,158,11,0.15)]`
                : `${tier.bgClass} ${tier.borderClass} hover:border-amber-700/60 hover:bg-black/50`
        } ${tier.glowClass}`}
    >
        {/* 顶行: 类型标签 + 品质标记 */}
        <div className="flex justify-between items-center gap-2">
            <span className="text-[8px] text-slate-600 uppercase tracking-wider truncate">{getItemTypeName(item.type)}</span>
            {tier.label && (
                <span className={`text-[8px] font-bold tracking-wider whitespace-nowrap ${tier.labelColor}`}>
                    ★{tier.label}
                </span>
            )}
        </div>

        {/* 物品名称 */}
        <div className={`text-[13px] font-bold truncate leading-tight ${isSelected ? 'text-amber-100' : tier.nameColor}`}>
            {item.name}
        </div>

        {/* 关键属性简览 */}
        <div className="flex justify-between items-center text-[9px]">
            <span className="text-slate-500 truncate">{getItemBrief(item)}</span>
        </div>

        {/* 价格 */}
        <div className="flex justify-between items-center mt-0.5">
            <span className="text-[8px] text-slate-600 truncate pr-1">{canAfford ? '' : '金币不足'}</span>
            <span className={`text-[11px] font-mono font-bold whitespace-nowrap ${canAfford ? tier.priceLabelColor : 'text-red-500'}`}>{price} 金</span>
        </div>
    </div>
);
