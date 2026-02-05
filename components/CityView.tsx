
import React, { useState, useEffect } from 'react';
import { Party, City, Item, Character, CityFacility, Quest } from '../types.ts';
import { WEAPON_TEMPLATES, ARMOR_TEMPLATES, BACKGROUNDS } from '../constants.tsx';
import { Portrait } from './Portrait.tsx';
import { ItemIcon } from './ItemIcon.tsx';

interface CityViewProps {
  city: City;
  party: Party;
  onLeave: () => void;
  onUpdateParty: (party: Party) => void;
  onUpdateCity: (city: City) => void;
  onAcceptQuest: (quest: Quest) => void;
}

export const CityView: React.FC<CityViewProps> = ({ city, party, onLeave, onUpdateParty, onUpdateCity, onAcceptQuest }) => {
  const [activeTab, setActiveTab] = useState<CityFacility>('MARKET');
  const [notification, setNotification] = useState<string | null>(null);
  
  // Interaction State
  const [selectedItem, setSelectedItem] = useState<{ item: Item, from: 'MARKET' | 'INVENTORY', index: number } | null>(null);
  // selectedRecruitIdx is no longer needed for the grid view, but kept if we revert or need state
  const [selectedRecruitIdx, setSelectedRecruitIdx] = useState<number | null>(null);

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

          setSelectedItem(null); // Deselect
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
      setSelectedItem(null); // Deselect
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
      
      const cost = missingHp * 2; // 2 gold per hp
      
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
      // Remove from city
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

  const getBgIcon = (bgName: string) => {
      const entry = Object.values(BACKGROUNDS).find(b => b.name === bgName);
      return entry ? entry.icon : '';
  };

  return (
    <div className="w-full h-full bg-[#080808] flex flex-col font-serif text-slate-300 relative">
        {/* Background Atmosphere */}
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/dark-wood.png')] opacity-10 pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/80 to-[#1a110a]/50 pointer-events-none" />

        {/* Compact Header */}
        <div className="relative z-10 p-4 border-b border-amber-900/40 bg-black/80 backdrop-blur flex justify-between items-center shadow-2xl shrink-0 h-20">
            <div className="flex items-center gap-6">
                <div>
                    <h1 className="text-3xl font-bold text-amber-500 tracking-tighter italic drop-shadow-lg leading-none">{city.name}</h1>
                    <div className="flex gap-2 mt-1 text-[10px] text-slate-400">
                        <span className="px-1.5 py-0.5 border border-amber-900/50 rounded bg-amber-900/10 text-amber-600">{city.type === 'CAPITAL' ? '王都' : city.type === 'TOWN' ? '县镇' : '村落'}</span>
                        <span className="px-1.5 py-0.5 border border-slate-800 rounded bg-slate-900/50">{city.faction}</span>
                    </div>
                </div>
            </div>
            
            <div className="flex items-center gap-6">
                 <div className="bg-black/40 px-4 py-1 border border-white/5 rounded flex gap-4">
                     <div className="flex flex-col items-end">
                         <span className="text-[9px] uppercase text-slate-500 tracking-widest">战团资金</span>
                         <span className="text-xl font-mono font-bold text-amber-400">{party.gold} <span className="text-xs text-amber-700">金</span></span>
                     </div>
                 </div>
                 <button 
                    onClick={onLeave}
                    className="px-6 py-2 border border-slate-600 hover:border-amber-500 text-slate-400 hover:text-amber-500 transition-all uppercase tracking-widest text-xs"
                 >
                    离开
                 </button>
            </div>
        </div>

        {/* Tab Navigation */}
        <div className="relative z-10 flex border-b border-white/5 bg-black/40 shrink-0 h-14">
            {city.facilities.includes('MARKET') && <TabBtn label="市集" icon="⚖️" active={activeTab === 'MARKET'} onClick={() => { setActiveTab('MARKET'); setSelectedItem(null); }} />}
            {city.facilities.includes('RECRUIT') && <TabBtn label="募兵" icon="🚩" active={activeTab === 'RECRUIT'} onClick={() => { setActiveTab('RECRUIT'); }} />}
            {city.facilities.includes('TAVERN') && <TabBtn label="酒肆" icon="📜" active={activeTab === 'TAVERN'} onClick={() => setActiveTab('TAVERN')} />}
            {city.facilities.includes('TEMPLE') && <TabBtn label="医馆" icon="💊" active={activeTab === 'TEMPLE'} onClick={() => setActiveTab('TEMPLE')} />}
        </div>

        {/* Content Area - Maximized Space */}
        <div className="relative z-10 flex-1 overflow-hidden p-6 flex flex-col min-h-0">
            {activeTab === 'MARKET' && (
                <div className="flex-1 flex gap-4 overflow-hidden h-full">
                    {/* Left: Goods Lists (Expanded) */}
                    <div className="flex-[2] grid grid-rows-2 gap-4 h-full min-h-0">
                        {/* Shop Inventory */}
                        <div className="bg-black/40 border border-white/10 p-3 flex flex-col rounded-sm relative min-h-0">
                            <h2 className="text-amber-600 font-bold mb-2 tracking-widest border-b border-amber-900/30 pb-1 shrink-0 text-sm">货物供应</h2>
                            <div className="overflow-y-auto flex-1 pr-2 custom-scrollbar">
                                <div className="grid grid-cols-6 gap-2">
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
                        <div className="bg-black/40 border border-white/10 p-3 flex flex-col rounded-sm relative min-h-0">
                            <h2 className="text-slate-500 font-bold mb-2 tracking-widest border-b border-white/10 pb-1 shrink-0 text-sm">出售物资</h2>
                            <div className="overflow-y-auto flex-1 pr-2 custom-scrollbar">
                                <div className="grid grid-cols-6 gap-2">
                                    {party.inventory.map((item, i) => (
                                        <ItemGridCell 
                                            key={item.id} 
                                            item={item} 
                                            price={Math.floor(item.value * 0.5)} 
                                            isSelected={selectedItem?.from === 'INVENTORY' && selectedItem?.index === i}
                                            onClick={() => setSelectedItem({ item, from: 'INVENTORY', index: i })}
                                            onDoubleClick={() => handleSell(item, i)}
                                        />
                                    ))}
                                </div>
                                {party.inventory.length === 0 && <div className="text-center text-slate-600 italic mt-10 col-span-5">行囊空空如也</div>}
                            </div>
                        </div>
                    </div>

                    {/* Right: Item Details Panel */}
                    <div className="flex-1 bg-[#0e0e0e] border border-amber-900/30 p-6 flex flex-col shadow-xl min-w-[300px] h-full">
                        {selectedItem ? (
                            <>
                                <div className="mb-6 shrink-0 border-b border-amber-900/50 pb-4">
                                    <div className="flex items-baseline justify-between">
                                        <h2 className="text-3xl font-bold text-amber-500 mb-1">{selectedItem.item.name}</h2>
                                        <span className="text-xs text-slate-500 uppercase font-bold tracking-widest">{selectedItem.item.type}</span>
                                    </div>
                                    <div className="mt-2">
                                        <span className="text-2xl font-mono text-white font-bold">
                                            {selectedItem.from === 'MARKET' ? Math.floor(selectedItem.item.value * 1.5) : Math.floor(selectedItem.item.value * 0.5)} <span className="text-sm text-amber-600">金</span>
                                        </span>
                                    </div>
                                </div>

                                <div className="flex-1 overflow-y-auto mb-4 pr-2 min-h-0 custom-scrollbar">
                                    <p className="text-sm text-slate-400 italic mb-6 leading-relaxed pl-3 border-l-2 border-amber-900/50">
                                        “{selectedItem.item.description}”
                                    </p>
                                    
                                    <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-sm font-mono text-slate-300">
                                        {selectedItem.item.damage && (
                                            <>
                                                <span className="text-slate-500">杀伤力</span>
                                                <span className="text-right text-red-400 font-bold">{selectedItem.item.damage[0]}-{selectedItem.item.damage[1]}</span>
                                            </>
                                        )}
                                        {selectedItem.item.armorPen !== undefined && (
                                            <>
                                                <span className="text-slate-500">穿甲能力</span>
                                                <span className="text-right text-blue-400">{Math.round(selectedItem.item.armorPen * 100)}%</span>
                                            </>
                                        )}
                                        {selectedItem.item.armorDmg !== undefined && (
                                            <>
                                                <span className="text-slate-500">破甲效率</span>
                                                <span className="text-right text-amber-400">{Math.round(selectedItem.item.armorDmg * 100)}%</span>
                                            </>
                                        )}
                                        {selectedItem.item.durability !== undefined && (
                                            <>
                                                <span className="text-slate-500">耐久度</span>
                                                <span className="text-right">{selectedItem.item.durability}/{selectedItem.item.maxDurability}</span>
                                            </>
                                        )}
                                        {selectedItem.item.fatigueCost !== undefined && (
                                            <>
                                                <span className="text-slate-500">疲劳消耗</span>
                                                <span className="text-right text-purple-400">{selectedItem.item.fatigueCost}</span>
                                            </>
                                        )}
                                        {selectedItem.item.maxFatiguePenalty !== undefined && (
                                            <>
                                                <span className="text-slate-500">负重惩罚</span>
                                                <span className="text-right text-red-400">-{selectedItem.item.maxFatiguePenalty}</span>
                                            </>
                                        )}
                                        {selectedItem.item.defenseBonus !== undefined && (
                                            <>
                                                <span className="text-slate-500">近战防御</span>
                                                <span className="text-right text-emerald-400">+{selectedItem.item.defenseBonus}</span>
                                            </>
                                        )}
                                        {selectedItem.item.rangedBonus !== undefined && (
                                            <>
                                                <span className="text-slate-500">远程防御</span>
                                                <span className="text-right text-emerald-400">+{selectedItem.item.rangedBonus}</span>
                                            </>
                                        )}
                                        {selectedItem.item.range !== undefined && (
                                            <>
                                                <span className="text-slate-500">攻击距离</span>
                                                <span className="text-right text-slate-200">{selectedItem.item.range} 格</span>
                                            </>
                                        )}
                                    </div>
                                </div>

                                <button 
                                    onClick={() => selectedItem.from === 'MARKET' ? handleBuy(selectedItem.item, selectedItem.index) : handleSell(selectedItem.item, selectedItem.index)}
                                    className="w-full py-4 bg-amber-700 hover:bg-amber-600 text-white font-bold tracking-widest shadow-lg border border-amber-500 shrink-0 text-lg transition-colors"
                                >
                                    {selectedItem.from === 'MARKET' ? '购 买' : '出 售'}
                                </button>
                            </>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-slate-600 opacity-50">
                                <span className="text-6xl mb-4">📜</span>
                                <p className="text-lg">请选择一件物品查看详情</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'RECRUIT' && (
                 <div className="h-full overflow-y-auto p-2 custom-scrollbar">
                    {/* Grid Layout of Cards */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {city.recruits.map((merc, i) => {
                            const hireCost = Math.floor(merc.salary * 10);
                            const role = getRoleRecommendation(merc);
                            
                            return (
                                <div key={merc.id} className="bg-black/60 border border-white/10 p-4 rounded-sm flex flex-col gap-3 shadow-lg hover:border-amber-500/50 transition-all relative group">
                                    {/* Paper Texture Overlay */}
                                    <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/dark-leather.png')] opacity-20 pointer-events-none" />
                                    
                                    {/* Header Row: Info & Action */}
                                    <div className="flex justify-between items-start relative z-10 border-b border-white/5 pb-2">
                                        <div className="flex items-center gap-3">
                                            <Portrait character={merc} size="md" className="shadow-md border-amber-900/50" /> {/* Smaller Portrait */}
                                            <div>
                                                <div className="flex items-baseline gap-2">
                                                    <h3 className="text-xl font-bold text-slate-200">{merc.name}</h3>
                                                    <span className="text-xs text-slate-500 font-mono">LV.{merc.level}</span>
                                                </div>
                                                <div className="flex items-center gap-2 text-xs text-amber-700 mt-0.5">
                                                    <span>{getBgIcon(merc.background)} {merc.background}</span>
                                                    <span className="text-slate-600">|</span>
                                                    <span className="text-slate-400">评级: <span className="text-amber-500">{role}</span></span>
                                                </div>
                                            </div>
                                        </div>
                                        
                                        <div className="flex flex-col items-end gap-2">
                                            <div className="text-right">
                                                <span className="block text-xl font-mono text-amber-500 font-bold">{hireCost}<span className="text-xs ml-1">金</span></span>
                                            </div>
                                            <button 
                                                onClick={() => handleRecruit(merc, i)}
                                                className="px-3 py-1 bg-amber-900/40 border border-amber-600 text-amber-500 hover:bg-amber-700 hover:text-white text-xs font-bold transition-colors uppercase tracking-widest rounded-sm"
                                            >
                                                雇佣
                                            </button>
                                        </div>
                                    </div>

                                    {/* Body: Story & Stats */}
                                    <div className="relative z-10 flex flex-col gap-3">
                                        {/* Background Story - Visible & Highlighted */}
                                        <div className="bg-black/30 p-2 border border-white/5 rounded text-xs text-slate-400 italic leading-relaxed h-16 overflow-y-auto custom-scrollbar">
                                            “{merc.backgroundStory}”
                                        </div>

                                        {/* Attributes Grid - Enlarged & Prominent */}
                                        <div className="grid grid-cols-2 gap-x-6 gap-y-2 bg-black/20 p-2 rounded">
                                            <StatBarSmall label="生命" val={merc.maxHp} max={120} stars={merc.stars.hp} color="bg-red-600" />
                                            <StatBarSmall label="体力" val={merc.maxFatigue} max={140} stars={merc.stars.fatigue} color="bg-blue-600" />
                                            <StatBarSmall label="胆识" val={merc.stats.resolve} max={80} stars={merc.stars.resolve} color="bg-purple-600" />
                                            <StatBarSmall label="先手" val={merc.stats.initiative} max={160} stars={merc.stars.initiative} color="bg-emerald-600" />
                                            
                                            <div className="col-span-2 h-px bg-white/5 my-1" />

                                            <StatBarSmall label="近战" val={merc.stats.meleeSkill} max={100} stars={merc.stars.meleeSkill} color="bg-amber-600" />
                                            <StatBarSmall label="远程" val={merc.stats.rangedSkill} max={100} stars={merc.stars.rangedSkill} color="bg-orange-600" />
                                            <StatBarSmall label="近防" val={merc.stats.meleeDefense} max={50} stars={merc.stars.meleeDefense} color="bg-slate-500" />
                                            <StatBarSmall label="远防" val={merc.stats.rangedDefense} max={50} stars={merc.stars.rangedDefense} color="bg-slate-500" />
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                        {city.recruits.length === 0 && (
                            <div className="col-span-2 flex flex-col items-center justify-center opacity-50 py-20">
                                <span className="text-6xl mb-4">🛡️</span>
                                <p className="text-lg">此处已无可用之才。</p>
                            </div>
                        )}
                    </div>
                 </div>
            )}

            {activeTab === 'TAVERN' && (
                <div className="h-full flex flex-col">
                    <div className="shrink-0 mb-4 text-center">
                        <h2 className="text-xl font-bold text-amber-600">酒肆</h2>
                        <p className="text-xs text-slate-500">在此处接取工作，赚取金币与声望。</p>
                        {party.activeQuest && (
                            <div className="mt-2 text-xs text-red-400 font-bold bg-red-900/20 py-1 px-3 inline-block rounded border border-red-900/50">
                                ⚠ 已有在身契约，需先完成当前任务。
                            </div>
                        )}
                    </div>
                    
                    <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                        {city.quests && city.quests.length > 0 ? (
                            <div className="space-y-4">
                                {city.quests.map(quest => (
                                    <div key={quest.id} className="bg-black/60 border border-amber-900/40 p-4 relative group hover:border-amber-500 transition-colors">
                                        {/* Paper texture overlay */}
                                        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/aged-paper.png')] opacity-5 pointer-events-none" />
                                        
                                        <div className="flex justify-between items-start mb-2 relative z-10">
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-2xl">{quest.type === 'HUNT' ? '⚔️' : quest.type === 'ESCORT' ? '🛡️' : '📦'}</span>
                                                    <h3 className="text-lg font-bold text-slate-200">{quest.title}</h3>
                                                </div>
                                                <div className="flex text-amber-500 text-xs mt-1 tracking-widest">
                                                    难度: {'★'.repeat(quest.difficulty)}
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-xl font-mono text-amber-400 font-bold">{quest.rewardGold} <span className="text-xs">金</span></div>
                                            </div>
                                        </div>
                                        
                                        <p className="text-sm text-slate-400 italic mb-4 border-l-2 border-slate-700 pl-3 leading-relaxed relative z-10">
                                            “{quest.description}”
                                        </p>
                                        
                                        <button 
                                            onClick={() => handleQuestTake(quest)}
                                            disabled={!!party.activeQuest}
                                            className={`w-full py-3 border text-white font-bold tracking-widest uppercase relative z-10 transition-all
                                                ${party.activeQuest 
                                                    ? 'bg-slate-800 border-slate-700 text-slate-500 cursor-not-allowed opacity-50' 
                                                    : 'bg-amber-900/30 border-amber-700/50 text-amber-500 hover:bg-amber-700 hover:text-white'
                                                }
                                            `}
                                        >
                                            {party.activeQuest ? '无法接受' : '接受委托'}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center opacity-50">
                                <span className="text-6xl mb-4">🍂</span>
                                <p>今日暂无委托，不如喝一杯？</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'TEMPLE' && (
                <div className="h-full flex flex-col items-center">
                     <div className="text-center mb-6">
                        <h2 className="text-2xl font-bold text-emerald-600">医馆治疗</h2>
                        <p className="text-slate-500 text-sm mt-1">支付费用治疗伤员，费用取决于伤势轻重。</p>
                     </div>
                     
                     <div className="w-full max-w-4xl grid grid-cols-2 gap-4 overflow-y-auto pb-10">
                         {party.mercenaries.map((merc, i) => {
                             const missingHp = merc.maxHp - merc.hp;
                             const healCost = missingHp * 2;
                             const isInjured = missingHp > 0;

                             return (
                                 <div key={merc.id} className={`flex items-center gap-4 p-4 border rounded bg-black/40 ${isInjured ? 'border-red-900/30' : 'border-emerald-900/30 opacity-60'}`}>
                                     <Portrait character={merc} size="md" />
                                     <div className="flex-1">
                                         <div className="flex justify-between items-center mb-1">
                                             <span className="font-bold text-slate-200">{merc.name}</span>
                                             <span className={`text-xs ${isInjured ? 'text-red-400' : 'text-emerald-500'}`}>
                                                 {isInjured ? '受伤' : '健康'}
                                             </span>
                                         </div>
                                         <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                                             <div className="h-full bg-emerald-600" style={{ width: `${(merc.hp / merc.maxHp) * 100}%` }} />
                                         </div>
                                         <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-mono">
                                             <span>生命: {merc.hp}/{merc.maxHp}</span>
                                         </div>
                                     </div>
                                     
                                     {isInjured ? (
                                         <button 
                                            onClick={() => handleHeal(merc, i)}
                                            className="px-4 py-2 bg-emerald-900/20 border border-emerald-600 text-emerald-400 hover:bg-emerald-700 hover:text-white transition-all text-xs font-bold whitespace-nowrap"
                                         >
                                             治疗 (-{healCost} 金)
                                         </button>
                                     ) : (
                                         <div className="px-4 py-2 text-slate-600 text-xs font-bold border border-transparent">
                                             无须治疗
                                         </div>
                                     )}
                                 </div>
                             );
                         })}
                     </div>
                </div>
            )}
        </div>

        {/* Notification Toast */}
        {notification && (
            <div className="absolute bottom-10 left-1/2 -translate-x-1/2 bg-amber-600 text-white px-6 py-2 rounded shadow-2xl animate-bounce z-50 font-bold">
                {notification}
            </div>
        )}
    </div>
  );
};

// --- Helper Components ---

const StatBarSmall: React.FC<{ label: string, val: number, max: number, stars: number, color: string }> = ({ label, val, max, stars, color }) => {
    const pct = Math.min(100, (val / max) * 100);
    return (
        <div className="flex items-center text-xs gap-2">
            <span className="text-slate-400 w-12 shrink-0 text-right font-bold">{label}</span>
            <div className="flex-1 h-3 bg-slate-800 rounded-sm relative overflow-hidden border border-white/5">
                <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
            </div>
            <div className="flex items-center w-12 shrink-0 justify-end gap-1">
                <span className="text-slate-200 font-mono font-bold">{val}</span>
                {stars > 0 && <span className="text-amber-400 text-[10px] tracking-tighter shadow-black drop-shadow-sm">{'★'.repeat(stars)}</span>}
            </div>
        </div>
    );
};

const TabBtn: React.FC<{ label: string, icon: string, active: boolean, onClick: () => void }> = ({ label, icon, active, onClick }) => (
    <button 
        onClick={onClick}
        className={`flex-1 py-2 flex items-center justify-center gap-2 border-b-2 transition-all
            ${active ? 'border-amber-500 bg-white/5 text-amber-500' : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-white/5'}
        `}
    >
        <span className="text-lg">{icon}</span>
        <span className="font-bold tracking-widest text-sm">{label}</span>
    </button>
);

const ItemGridCell: React.FC<{ item: Item, price: number, isSelected: boolean, onClick: () => void, onDoubleClick: () => void }> = ({ item, price, isSelected, onClick, onDoubleClick }) => (
    <div 
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        className={`aspect-square border transition-all p-2 flex flex-col items-center justify-between group relative cursor-pointer select-none
            ${isSelected ? 'bg-amber-900/30 border-amber-500 shadow-[inset_0_0_10px_rgba(245,158,11,0.2)]' : 'bg-slate-900/80 border-slate-800 hover:border-amber-700'}
        `}
    >
        <span className="text-[10px] text-center text-slate-400 font-bold absolute top-1 left-1">{item.type === 'WEAPON' ? '⚔️' : item.type === 'ARMOR' ? '👕' : '🛡️'}</span>
        
        <div className={`flex-1 w-full flex items-center justify-center transition-transform ${isSelected ? 'scale-110' : 'group-hover:scale-110'}`}>
             <ItemIcon item={item} className="w-full h-full p-1" showBackground={false} />
        </div>
        
        <div className="w-full text-center">
            <div className={`text-[10px] truncate ${isSelected ? 'text-amber-100' : 'text-slate-300'}`}>{item.name}</div>
            <div className="text-[9px] text-amber-500 font-mono">{price} <span className="text-[7px]">金</span></div>
        </div>
    </div>
);
