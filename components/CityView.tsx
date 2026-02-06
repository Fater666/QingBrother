
import React, { useState, useEffect } from 'react';
import { Party, City, Item, Character, CityFacility, Quest } from '../types.ts';
import { BACKGROUNDS } from '../constants';

interface CityViewProps {
  city: City;
  party: Party;
  onLeave: () => void;
  onUpdateParty: (party: Party) => void;
  onUpdateCity: (city: City) => void;
  onAcceptQuest: (quest: Quest) => void;
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
    if (item.damage) return `伤害 ${item.damage[0]}-${item.damage[1]}`;
    if (item.durability !== undefined) return `耐久 ${item.durability}`;
    if (item.defenseBonus !== undefined) return `防御 +${item.defenseBonus}`;
    return '';
};

// 获取任务类型的中文名称
const getQuestTypeName = (type: Quest['type']): string => {
    const typeNames: Record<Quest['type'], string> = {
        'HUNT': '讨伐',
        'ESCORT': '护送',
        'DELIVERY': '运送'
    };
    return typeNames[type] || type;
};

export const CityView: React.FC<CityViewProps> = ({ city, party, onLeave, onUpdateParty, onUpdateCity, onAcceptQuest }) => {
  const [activeTab, setActiveTab] = useState<CityFacility>('MARKET');
  const [notification, setNotification] = useState<string | null>(null);
  
  // Interaction State
  const [selectedItem, setSelectedItem] = useState<{ item: Item, from: 'MARKET' | 'INVENTORY', index: number } | null>(null);

  // Set initial tab to first available facility
  useEffect(() => {
      if (!city.facilities.includes(activeTab)) {
          setActiveTab(city.facilities[0]);
      }
  }, [city]);

  const showNotification = (msg: string) => {
      setNotification(msg);
      setTimeout(() => setNotification(null), 2000);
  };

  const handleBuy = (item: Item, index: number) => {
      const price = Math.floor(item.value * 1.5);
      if (party.gold >= price) {
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
      } else {
          showNotification("金币不足！");
      }
  };

  const handleSell = (item: Item, index: number) => {
      const price = Math.floor(item.value * 0.5);
      const newInv = [...party.inventory];
      newInv.splice(index, 1);
      onUpdateParty({
          ...party,
          gold: party.gold + price,
          inventory: newInv
      });
      setSelectedItem(null);
      showNotification(`出售了 ${item.name} (+${price})`);
  };

  const handleRecruit = (merc: Character, index: number) => {
      const hireCost = Math.floor(merc.salary * 10);
      if (party.mercenaries.length >= 20) {
          showNotification("战团人数已达上限！");
          return;
      }
      if (party.gold >= hireCost) {
          const newMerc = { ...merc, formationIndex: null };
          onUpdateParty({
              ...party,
              gold: party.gold - hireCost,
              mercenaries: [...party.mercenaries, newMerc]
          });
          
          const newRecruits = [...city.recruits];
          newRecruits.splice(index, 1);
          onUpdateCity({ ...city, recruits: newRecruits });
          
          showNotification(`招募了 ${merc.name}`);
      } else {
          showNotification("金币不足！");
      }
  };

  const handleHeal = (merc: Character, index: number) => {
      const missingHp = merc.maxHp - merc.hp;
      if (missingHp <= 0) return;
      
      const cost = missingHp * 2;
      
      if (party.gold >= cost) {
          const newMercs = party.mercenaries.map((m, i) => {
              if (i === index) return { ...m, hp: m.maxHp };
              return m;
          });

          onUpdateParty({
              ...party,
              gold: party.gold - cost,
              mercenaries: newMercs
          });
          showNotification(`${merc.name} 伤势已痊愈`);
      } else {
          showNotification("金币不足！");
      }
  };

  const handleQuestTake = (quest: Quest) => {
      if (party.activeQuest) {
          showNotification("已有在身契约！需先完成。");
          return;
      }
      onAcceptQuest(quest);
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

  return (
    <div className="w-full h-full bg-[#0a0908] flex flex-col font-serif text-slate-300 relative select-none overflow-hidden">
        {/* 竹简质感背景 */}
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
             style={{
                 backgroundImage: `repeating-linear-gradient(
                     0deg,
                     transparent,
                     transparent 2px,
                     rgba(139, 90, 43, 0.4) 2px,
                     rgba(139, 90, 43, 0.4) 4px
                 )`
             }} 
        />
        <div className="absolute inset-0 bg-gradient-to-b from-amber-950/10 via-transparent to-black/20 pointer-events-none" />

        {/* Header */}
        <div className="relative z-10 h-16 bg-gradient-to-r from-[#1a1410] via-[#0d0b09] to-[#1a1410] border-b border-amber-900/50 flex items-center justify-between px-8 shrink-0">
            <div className="flex items-center gap-6">
                <div>
                    <h1 className="text-2xl font-bold text-amber-500 tracking-[0.2em]">{city.name}</h1>
                    <div className="flex gap-2 mt-0.5 text-[10px]">
                        <span className="text-amber-700">{city.type === 'CAPITAL' ? '王都' : city.type === 'TOWN' ? '县镇' : '村落'}</span>
                        <span className="text-slate-600">·</span>
                        <span className="text-slate-500">{city.faction}</span>
                    </div>
                </div>
            </div>
            
            <div className="flex items-center gap-6">
                <div className="text-right">
                    <span className="text-[10px] text-slate-600 uppercase tracking-widest block">战团资金</span>
                    <span className="text-amber-500 font-bold font-mono">{party.gold} <span className="text-amber-700 text-xs">金</span></span>
                </div>
                <button 
                    onClick={onLeave}
                    className="px-6 py-2 bg-[#1a1410] border border-amber-900/40 hover:border-amber-600 text-xs text-slate-400 hover:text-amber-500 uppercase tracking-widest transition-all"
                >
                    离开城镇
                </button>
            </div>
        </div>

        {/* Tab Navigation */}
        <div className="relative z-10 flex border-b border-amber-900/30 bg-black/40 shrink-0 h-12">
            {city.facilities.includes('MARKET') && <TabBtn label="市集" active={activeTab === 'MARKET'} onClick={() => { setActiveTab('MARKET'); setSelectedItem(null); }} />}
            {city.facilities.includes('RECRUIT') && <TabBtn label="募兵" active={activeTab === 'RECRUIT'} onClick={() => { setActiveTab('RECRUIT'); }} />}
            {city.facilities.includes('TAVERN') && <TabBtn label="酒肆" active={activeTab === 'TAVERN'} onClick={() => setActiveTab('TAVERN')} />}
            {city.facilities.includes('TEMPLE') && <TabBtn label="医馆" active={activeTab === 'TEMPLE'} onClick={() => setActiveTab('TEMPLE')} />}
        </div>

        {/* Content Area */}
        <div className="relative z-10 flex-1 overflow-hidden p-4 flex flex-col min-h-0">
            {activeTab === 'MARKET' && (
                <div className="flex-1 flex gap-4 overflow-hidden h-full">
                    {/* Left: Goods Lists */}
                    <div className="flex-[2] grid grid-rows-2 gap-4 h-full min-h-0">
                        {/* Shop Inventory */}
                        <div className="bg-black/40 border border-amber-900/30 p-3 flex flex-col min-h-0">
                            <h2 className="text-[10px] text-amber-700 uppercase tracking-[0.2em] mb-2 pb-1 border-b border-amber-900/20 shrink-0">货物供应</h2>
                            <div className="overflow-y-auto flex-1 custom-scrollbar">
                                <div className="grid grid-cols-5 gap-2">
                                    {city.market.map((item, i) => (
                                        <ItemGridCell 
                                            key={`${item.id}-${i}`} 
                                            item={item} 
                                            price={Math.floor(item.value * 1.5)} 
                                            isSelected={selectedItem?.from === 'MARKET' && selectedItem?.index === i}
                                            onClick={() => setSelectedItem({ item, from: 'MARKET', index: i })}
                                            onDoubleClick={() => handleBuy(item, i)}
                                        />
                                    ))}
                                </div>
                                {city.market.length === 0 && <div className="text-center text-slate-600 italic mt-10">已被抢购一空</div>}
                            </div>
                        </div>

                        {/* Player Inventory */}
                        <div className="bg-black/40 border border-slate-800/50 p-3 flex flex-col min-h-0">
                            <h2 className="text-[10px] text-slate-600 uppercase tracking-[0.2em] mb-2 pb-1 border-b border-slate-800/30 shrink-0">出售物资</h2>
                            <div className="overflow-y-auto flex-1 custom-scrollbar">
                                <div className="grid grid-cols-5 gap-2">
                                    {party.inventory.map((item, i) => (
                                        <ItemGridCell 
                                            key={`${item.id}-${i}`} 
                                            item={item} 
                                            price={Math.floor(item.value * 0.5)} 
                                            isSelected={selectedItem?.from === 'INVENTORY' && selectedItem?.index === i}
                                            onClick={() => setSelectedItem({ item, from: 'INVENTORY', index: i })}
                                            onDoubleClick={() => handleSell(item, i)}
                                        />
                                    ))}
                                </div>
                                {party.inventory.length === 0 && <div className="text-center text-slate-600 italic mt-10">行囊空空如也</div>}
                            </div>
                        </div>
                    </div>

                    {/* Right: Item Details Panel */}
                    <div className="flex-1 bg-[#0d0b08] border border-amber-900/30 p-5 flex flex-col shadow-xl min-w-[280px] h-full">
                        {selectedItem ? (
                            <>
                                <div className="mb-4 shrink-0 border-b border-amber-900/40 pb-4">
                                    <div className="flex items-baseline justify-between mb-2">
                                        <h2 className="text-xl font-bold text-amber-500">{selectedItem.item.name}</h2>
                                        <span className="text-[10px] text-slate-600 uppercase tracking-widest">{getItemTypeName(selectedItem.item.type)}</span>
                                    </div>
                                    <div>
                                        <span className="text-2xl font-mono text-amber-100 font-bold">
                                            {selectedItem.from === 'MARKET' ? Math.floor(selectedItem.item.value * 1.5) : Math.floor(selectedItem.item.value * 0.5)} 
                                        </span>
                                        <span className="text-sm text-amber-700 ml-1">金</span>
                                        <span className="text-xs text-slate-600 ml-2">
                                            ({selectedItem.from === 'MARKET' ? '购入' : '售出'})
                                        </span>
                                    </div>
                                </div>

                                <div className="flex-1 overflow-y-auto mb-4 min-h-0 custom-scrollbar">
                                    <p className="text-sm text-slate-500 italic mb-4 leading-relaxed pl-3 border-l-2 border-amber-900/30">
                                        "{selectedItem.item.description}"
                                    </p>
                                    
                                    <div className="space-y-2 text-sm">
                                        {selectedItem.item.damage && (
                                            <div className="flex justify-between py-1 border-b border-white/5">
                                                <span className="text-slate-500">杀伤力</span>
                                                <span className="text-red-400 font-mono font-bold">{selectedItem.item.damage[0]} - {selectedItem.item.damage[1]}</span>
                                            </div>
                                        )}
                                        {selectedItem.item.armorPen !== undefined && (
                                            <div className="flex justify-between py-1 border-b border-white/5">
                                                <span className="text-slate-500">穿甲能力</span>
                                                <span className="text-sky-400 font-mono">{Math.round(selectedItem.item.armorPen * 100)}%</span>
                                            </div>
                                        )}
                                        {selectedItem.item.armorDmg !== undefined && (
                                            <div className="flex justify-between py-1 border-b border-white/5">
                                                <span className="text-slate-500">破甲效率</span>
                                                <span className="text-amber-400 font-mono">{Math.round(selectedItem.item.armorDmg * 100)}%</span>
                                            </div>
                                        )}
                                        {selectedItem.item.durability !== undefined && (
                                            <div className="flex justify-between py-1 border-b border-white/5">
                                                <span className="text-slate-500">护甲耐久</span>
                                                <span className="text-slate-300 font-mono">{selectedItem.item.durability} / {selectedItem.item.maxDurability}</span>
                                            </div>
                                        )}
                                        {selectedItem.item.fatigueCost !== undefined && (
                                            <div className="flex justify-between py-1 border-b border-white/5">
                                                <span className="text-slate-500">体力消耗</span>
                                                <span className="text-purple-400 font-mono">-{selectedItem.item.fatigueCost}</span>
                                            </div>
                                        )}
                                        {selectedItem.item.maxFatiguePenalty !== undefined && (
                                            <div className="flex justify-between py-1 border-b border-white/5">
                                                <span className="text-slate-500">负重惩罚</span>
                                                <span className="text-red-400 font-mono">-{selectedItem.item.maxFatiguePenalty}</span>
                                            </div>
                                        )}
                                        {selectedItem.item.defenseBonus !== undefined && (
                                            <div className="flex justify-between py-1 border-b border-white/5">
                                                <span className="text-slate-500">近战防御</span>
                                                <span className="text-emerald-400 font-mono">+{selectedItem.item.defenseBonus}</span>
                                            </div>
                                        )}
                                        {selectedItem.item.rangedBonus !== undefined && (
                                            <div className="flex justify-between py-1 border-b border-white/5">
                                                <span className="text-slate-500">远程防御</span>
                                                <span className="text-emerald-400 font-mono">+{selectedItem.item.rangedBonus}</span>
                                            </div>
                                        )}
                                        {selectedItem.item.range !== undefined && (
                                            <div className="flex justify-between py-1 border-b border-white/5">
                                                <span className="text-slate-500">攻击距离</span>
                                                <span className="text-slate-300 font-mono">{selectedItem.item.range} 格</span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <button 
                                    onClick={() => selectedItem.from === 'MARKET' ? handleBuy(selectedItem.item, selectedItem.index) : handleSell(selectedItem.item, selectedItem.index)}
                                    className="w-full py-3 bg-amber-900/30 hover:bg-amber-700 border border-amber-700/50 hover:border-amber-500 text-amber-500 hover:text-white font-bold tracking-widest shadow-lg shrink-0 transition-all uppercase"
                                >
                                    {selectedItem.from === 'MARKET' ? '购 买' : '出 售'}
                                </button>
                            </>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-slate-700">
                                <p className="text-sm tracking-widest">请选择一件物品</p>
                                <p className="text-xs mt-1 text-slate-800">查看详情或进行交易</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'RECRUIT' && (
                <div className="h-full overflow-y-auto custom-scrollbar">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {city.recruits.map((merc, i) => {
                            const hireCost = Math.floor(merc.salary * 10);
                            const role = getRoleRecommendation(merc);
                            
                            return (
                                <div key={merc.id} className="bg-black/40 border border-amber-900/30 p-4 flex flex-col gap-3 hover:border-amber-600/50 transition-all relative">
                                    {/* Header Row */}
                                    <div className="flex justify-between items-start border-b border-amber-900/20 pb-3">
                                        <div>
                                            <div className="flex items-baseline gap-2">
                                                <h3 className="text-xl font-bold text-amber-100">{merc.name}</h3>
                                                <span className="text-xs text-slate-600 font-mono">LV.{merc.level}</span>
                                            </div>
                                            <div className="flex items-center gap-2 text-xs mt-1">
                                                <span className="text-amber-700">{merc.background}</span>
                                                <span className="text-slate-700">·</span>
                                                <span className="text-slate-500">评级: <span className="text-amber-500 font-bold">{role}</span></span>
                                            </div>
                                        </div>
                                        
                                        <div className="flex flex-col items-end gap-2">
                                            <span className="text-lg font-mono text-amber-500 font-bold">{hireCost} <span className="text-xs text-amber-700">金</span></span>
                                            <button 
                                                onClick={() => handleRecruit(merc, i)}
                                                className="px-4 py-1.5 bg-amber-900/30 border border-amber-700/50 text-amber-500 hover:bg-amber-700 hover:border-amber-500 hover:text-white text-xs font-bold transition-all uppercase tracking-widest"
                                            >
                                                雇佣
                                            </button>
                                        </div>
                                    </div>

                                    {/* Body */}
                                    <div className="flex flex-col gap-3">
                                        {/* Background Story */}
                                        <div className="bg-black/30 p-2 border border-white/5 text-xs text-slate-500 italic leading-relaxed h-14 overflow-y-auto custom-scrollbar">
                                            "{merc.backgroundStory}"
                                        </div>

                                        {/* Attributes Grid */}
                                        <div className="grid grid-cols-2 gap-x-4 gap-y-2 bg-black/20 p-3">
                                            <StatBarSmall label="生命" val={merc.maxHp} max={120} stars={merc.stars.hp} colorBar="bg-red-800" colorText="text-red-400" />
                                            <StatBarSmall label="体力" val={merc.maxFatigue} max={140} stars={merc.stars.fatigue} colorBar="bg-sky-800" colorText="text-sky-400" />
                                            <StatBarSmall label="胆识" val={merc.stats.resolve} max={80} stars={merc.stars.resolve} colorBar="bg-purple-800" colorText="text-purple-400" />
                                            <StatBarSmall label="先手" val={merc.stats.initiative} max={160} stars={merc.stars.initiative} colorBar="bg-emerald-800" colorText="text-emerald-400" />
                                            
                                            <div className="col-span-2 h-px bg-white/5 my-1" />

                                            <StatBarSmall label="近战" val={merc.stats.meleeSkill} max={100} stars={merc.stars.meleeSkill} colorBar="bg-amber-800" colorText="text-amber-400" />
                                            <StatBarSmall label="远程" val={merc.stats.rangedSkill} max={100} stars={merc.stars.rangedSkill} colorBar="bg-orange-800" colorText="text-orange-400" />
                                            <StatBarSmall label="近防" val={merc.stats.meleeDefense} max={50} stars={merc.stars.meleeDefense} colorBar="bg-slate-700" colorText="text-slate-400" />
                                            <StatBarSmall label="远防" val={merc.stats.rangedDefense} max={50} stars={merc.stars.rangedDefense} colorBar="bg-slate-700" colorText="text-slate-400" />
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                        {city.recruits.length === 0 && (
                            <div className="col-span-2 flex flex-col items-center justify-center text-slate-700 py-20">
                                <p className="text-lg tracking-widest">此处已无可用之才</p>
                                <p className="text-xs mt-1 text-slate-800">他日再来或许会有新面孔</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'TAVERN' && (
                <div className="h-full flex flex-col">
                    <div className="shrink-0 mb-4 text-center">
                        <h2 className="text-lg font-bold text-amber-600 tracking-widest">契约公告</h2>
                        <p className="text-xs text-slate-600 mt-1">在此处接取工作，赚取金币与声望</p>
                        {party.activeQuest && (
                            <div className="mt-2 text-xs text-red-400 font-bold bg-red-950/20 py-1 px-3 inline-block border border-red-900/40">
                                已有在身契约，需先完成当前任务
                            </div>
                        )}
                    </div>
                    
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        {city.quests && city.quests.length > 0 ? (
                            <div className="space-y-4">
                                {city.quests.map(quest => (
                                    <div key={quest.id} className="bg-black/40 border border-amber-900/30 p-4 relative hover:border-amber-600/50 transition-all">
                                        <div className="flex justify-between items-start mb-3">
                                            <div>
                                                <div className="flex items-center gap-3">
                                                    <span className="text-[10px] px-2 py-0.5 border border-amber-900/40 text-amber-700 uppercase tracking-widest">
                                                        {getQuestTypeName(quest.type)}
                                                    </span>
                                                    <h3 className="text-lg font-bold text-amber-100">{quest.title}</h3>
                                                </div>
                                                <div className="flex text-amber-600 text-xs mt-2 tracking-widest">
                                                    <span className="text-slate-500 mr-2">难度:</span>
                                                    {'★'.repeat(quest.difficulty)}<span className="text-slate-700">{'★'.repeat(5 - quest.difficulty)}</span>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-xl font-mono text-amber-500 font-bold">{quest.rewardGold}</div>
                                                <div className="text-[10px] text-amber-700">金币报酬</div>
                                            </div>
                                        </div>
                                        
                                        <p className="text-sm text-slate-500 italic mb-4 border-l-2 border-amber-900/30 pl-3 leading-relaxed">
                                            "{quest.description}"
                                        </p>
                                        
                                        <button 
                                            onClick={() => handleQuestTake(quest)}
                                            disabled={!!party.activeQuest}
                                            className={`w-full py-3 border font-bold tracking-widest uppercase transition-all
                                                ${party.activeQuest 
                                                    ? 'bg-slate-900/30 border-slate-800 text-slate-600 cursor-not-allowed' 
                                                    : 'bg-amber-900/20 border-amber-700/50 text-amber-500 hover:bg-amber-700 hover:border-amber-500 hover:text-white'
                                                }
                                            `}
                                        >
                                            {party.activeQuest ? '无法接受' : '接受委托'}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-slate-700">
                                <p className="text-lg tracking-widest">今日暂无委托</p>
                                <p className="text-xs mt-1 text-slate-800">不如喝一杯再走？</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'TEMPLE' && (
                <div className="h-full flex flex-col">
                    <div className="text-center mb-4 shrink-0">
                        <h2 className="text-lg font-bold text-emerald-600 tracking-widest">医馆治疗</h2>
                        <p className="text-slate-600 text-xs mt-1">支付费用治疗伤员，费用取决于伤势轻重</p>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                            {party.mercenaries.map((merc, i) => {
                                const missingHp = merc.maxHp - merc.hp;
                                const healCost = missingHp * 2;
                                const isInjured = missingHp > 0;
                                const hpPct = (merc.hp / merc.maxHp) * 100;

                                return (
                                    <div key={merc.id} className={`flex items-center gap-4 p-4 border bg-black/40 ${isInjured ? 'border-red-900/30' : 'border-emerald-900/20 opacity-60'}`}>
                                        {/* Character Info */}
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
                                            
                                            {/* HP Bar */}
                                            <div className="h-3 w-full bg-black/60 overflow-hidden border border-white/5 relative">
                                                <div 
                                                    className={`h-full transition-all ${isInjured ? 'bg-red-800' : 'bg-emerald-800'}`} 
                                                    style={{ width: `${hpPct}%` }} 
                                                />
                                            </div>
                                            <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-mono">
                                                <span>生命: {merc.hp} / {merc.maxHp}</span>
                                                {isInjured && <span className="text-red-400">-{missingHp}</span>}
                                            </div>
                                        </div>
                                        
                                        {/* Action */}
                                        {isInjured ? (
                                            <button 
                                                onClick={() => handleHeal(merc, i)}
                                                className="px-4 py-2 bg-emerald-900/20 border border-emerald-700/50 text-emerald-400 hover:bg-emerald-700 hover:border-emerald-500 hover:text-white transition-all text-xs font-bold whitespace-nowrap"
                                            >
                                                治疗 (-{healCost} 金)
                                            </button>
                                        ) : (
                                            <div className="px-4 py-2 text-slate-700 text-xs font-bold">
                                                无须治疗
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </div>

        {/* Notification Toast */}
        {notification && (
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-amber-600 text-white px-6 py-2 shadow-2xl z-50 font-bold tracking-widest">
                {notification}
            </div>
        )}
    </div>
  );
};

// --- Helper Components ---

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

interface TabBtnProps {
    label: string;
    active: boolean;
    onClick: () => void;
}

const TabBtn: React.FC<TabBtnProps> = ({ label, active, onClick }) => (
    <button 
        onClick={onClick}
        className={`flex-1 py-2 flex items-center justify-center border-b-2 transition-all uppercase tracking-[0.3em] text-sm font-bold
            ${active ? 'border-amber-500 bg-amber-950/10 text-amber-500' : 'border-transparent text-slate-600 hover:text-slate-400 hover:bg-white/5'}
        `}
    >
        {label}
    </button>
);

interface ItemGridCellProps {
    item: Item;
    price: number;
    isSelected: boolean;
    onClick: () => void;
    onDoubleClick: () => void;
}

const ItemGridCell: React.FC<ItemGridCellProps> = ({ item, price, isSelected, onClick, onDoubleClick }) => (
    <div 
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        className={`aspect-square border transition-all p-2 flex flex-col justify-between cursor-pointer
            ${isSelected 
                ? 'bg-amber-900/30 border-amber-500 shadow-[inset_0_0_10px_rgba(245,158,11,0.2)]' 
                : 'bg-black/30 border-slate-800/50 hover:border-amber-700'
            }
        `}
    >
        {/* Type Label */}
        <div className="text-[9px] text-slate-600 uppercase tracking-wider">
            {getItemTypeName(item.type)}
        </div>
        
        {/* Item Name */}
        <div className={`text-center text-sm font-bold truncate ${isSelected ? 'text-amber-100' : 'text-slate-300'}`}>
            {item.name}
        </div>
        
        {/* Brief Stats & Price */}
        <div className="text-center">
            <div className="text-[9px] text-slate-600 truncate">{getItemBrief(item)}</div>
            <div className="text-[10px] text-amber-600 font-mono font-bold">{price} 金</div>
        </div>
    </div>
);
