
import React, { useState } from 'react';
import { Party, City, Item, Character } from '../types.ts';
import { WEAPON_TEMPLATES, ARMOR_TEMPLATES } from '../constants.tsx';
import { Portrait } from './Portrait.tsx';

interface CityViewProps {
  city: City;
  party: Party;
  onLeave: () => void;
  onUpdateParty: (party: Party) => void;
  onUpdateCity: (city: City) => void;
}

type Tab = 'MARKET' | 'RECRUIT' | 'TAVERN' | 'REST';

export const CityView: React.FC<CityViewProps> = ({ city, party, onLeave, onUpdateParty, onUpdateCity }) => {
  const [activeTab, setActiveTab] = useState<Tab>('MARKET');
  const [notification, setNotification] = useState<string | null>(null);

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
          
          // Remove from market
          const newMarket = [...city.market];
          newMarket.splice(index, 1);
          onUpdateCity({ ...city, market: newMarket });

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
      // Do we add to market? Simplification: No, merchant "buys" it and it disappears for now.
      showNotification(`出售了 ${item.name} (+${price})`);
  };

  const handleRecruit = (merc: Character, index: number) => {
      const hireCost = Math.floor(merc.salary * 10); // Initial hiring cost
      if (party.mercenaries.length >= 20) { // Increased roster limit
          showNotification("战团人数已达上限！");
          return;
      }
      if (party.gold >= hireCost) {
          // Assign next available reserve slot (or just null)
          // For simplicity, new recruits go to reserve (formationIndex: null)
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

  const handleRest = () => {
      const cost = party.mercenaries.length * 20;
      if (party.gold >= cost) {
          onUpdateParty({
              ...party,
              gold: party.gold - cost,
              mercenaries: party.mercenaries.map(m => ({ ...m, hp: m.maxHp, fatigue: 0 }))
          });
          showNotification("全员修整完毕，精力充沛！");
      } else {
          showNotification("金币不足！");
      }
  };

  const getRoleRecommendation = (merc: Character) => {
      const { meleeSkill, meleeDefense, rangedSkill } = merc.stats;
      const { meleeSkill: msStar, rangedSkill: rsStar, meleeDefense: mdStar } = merc.stars;
      
      if (rangedSkill > 45 || (rangedSkill > 40 && rsStar >= 2)) return "后排射手";
      if ((meleeDefense > 5 || mdStar >= 2) && merc.hp > 60) return "前排肉盾";
      if (meleeSkill > 55 || (meleeSkill > 50 && msStar >= 2)) return "主力输出";
      if (merc.stats.initiative > 115) return "侧翼游击";
      return "民兵填线";
  };

  return (
    <div className="w-full h-full bg-[#080808] flex flex-col font-serif text-slate-300 relative">
        {/* Background Atmosphere */}
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/dark-wood.png')] opacity-10 pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/80 to-[#1a110a]/50 pointer-events-none" />

        {/* Header */}
        <div className="relative z-10 p-8 border-b border-amber-900/40 bg-black/60 backdrop-blur flex justify-between items-center shadow-2xl">
            <div>
                <h1 className="text-5xl font-bold text-amber-500 tracking-tighter italic drop-shadow-lg">{city.name}</h1>
                <div className="flex gap-4 mt-2 text-sm text-slate-400">
                    <span className="px-2 py-0.5 border border-amber-900/50 rounded bg-amber-900/10 text-amber-600">{city.type === 'CAPITAL' ? '王都' : city.type === 'TOWN' ? '县镇' : '村落'}</span>
                    <span className="px-2 py-0.5 border border-slate-800 rounded bg-slate-900/50">{city.faction}</span>
                    <span className={`px-2 py-0.5 border rounded
                        ${city.state === 'WAR' ? 'border-red-900 text-red-500 bg-red-900/10' : 
                          city.state === 'FAMINE' ? 'border-yellow-900 text-yellow-500 bg-yellow-900/10' : 
                          city.state === 'PROSPEROUS' ? 'border-emerald-900 text-emerald-500 bg-emerald-900/10' : 
                          'border-slate-800 text-slate-400'}
                    `}>
                        {city.state === 'WAR' ? '战乱' : city.state === 'FAMINE' ? '饥荒' : city.state === 'PROSPEROUS' ? '繁荣' : '和平'}
                    </span>
                </div>
            </div>
            
            <div className="flex items-center gap-8">
                 <div className="text-right">
                     <div className="text-[10px] uppercase text-slate-500 tracking-widest">战团资金</div>
                     <div className="text-2xl font-mono font-bold text-amber-400">{party.gold} BU</div>
                 </div>
                 <button 
                    onClick={onLeave}
                    className="px-6 py-2 border border-slate-600 hover:border-amber-500 text-slate-400 hover:text-amber-500 transition-all uppercase tracking-widest text-xs"
                 >
                    离开城镇
                 </button>
            </div>
        </div>

        {/* Navigation */}
        <div className="relative z-10 flex border-b border-white/5 bg-black/40">
            <TabBtn label="市集" icon="⚖️" active={activeTab === 'MARKET'} onClick={() => setActiveTab('MARKET')} />
            <TabBtn label="募兵" icon="🚩" active={activeTab === 'RECRUIT'} onClick={() => setActiveTab('RECRUIT')} />
            <TabBtn label="酒肆" icon="🍶" active={activeTab === 'TAVERN'} onClick={() => setActiveTab('TAVERN')} />
            <TabBtn label="修整" icon="🔥" active={activeTab === 'REST'} onClick={() => setActiveTab('REST')} />
        </div>

        {/* Content Area */}
        <div className="relative z-10 flex-1 overflow-hidden p-8">
            {activeTab === 'MARKET' && (
                <div className="grid grid-cols-2 gap-8 h-full">
                    {/* Shop Inventory */}
                    <div className="bg-black/40 border border-white/10 p-4 flex flex-col rounded-sm relative">
                        <h2 className="text-amber-600 font-bold mb-4 tracking-widest border-b border-amber-900/30 pb-2">货物供应</h2>
                        <div className="overflow-y-auto flex-1 pr-2 relative">
                             <div className="grid grid-cols-5 gap-3 pb-20"> {/* Padding bottom for tooltips */}
                                {city.market.map((item, i) => (
                                    <ItemGridCell 
                                        key={`${item.id}-${i}`} 
                                        item={item} 
                                        price={Math.floor(item.value * 1.5)} 
                                        actionLabel="购买"
                                        onClick={() => handleBuy(item, i)} 
                                    />
                                ))}
                            </div>
                            {city.market.length === 0 && <div className="text-center text-slate-600 italic mt-10">已被抢购一空</div>}
                        </div>
                    </div>

                    {/* Player Inventory */}
                    <div className="bg-black/40 border border-white/10 p-4 flex flex-col rounded-sm relative">
                        <h2 className="text-slate-500 font-bold mb-4 tracking-widest border-b border-white/10 pb-2">出售物资</h2>
                        <div className="overflow-y-auto flex-1 pr-2 relative">
                            <div className="grid grid-cols-5 gap-3 pb-20">
                                {party.inventory.map((item, i) => (
                                    <ItemGridCell 
                                        key={item.id} 
                                        item={item} 
                                        price={Math.floor(item.value * 0.5)} 
                                        actionLabel="出售"
                                        onClick={() => handleSell(item, i)} 
                                    />
                                ))}
                            </div>
                            {party.inventory.length === 0 && <div className="text-center text-slate-600 italic mt-10 col-span-5">行囊空空如也</div>}
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'RECRUIT' && (
                 <div className="grid grid-cols-3 gap-6 h-full overflow-y-auto p-2 pb-20">
                    {city.recruits.map((merc, i) => {
                        const role = getRoleRecommendation(merc);
                        return (
                            <div key={merc.id} className="bg-black/40 border border-white/10 p-5 flex flex-col justify-between hover:border-amber-500 transition-all group relative">
                                <div className="flex gap-4 mb-4">
                                    <Portrait character={merc} size="md" className="shadow-lg shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-start mb-1">
                                            <h3 className="text-xl font-bold text-slate-200 truncate">{merc.name}</h3>
                                            <span className="text-xs text-slate-500 font-mono shrink-0 ml-2">LV.{merc.level}</span>
                                        </div>
                                        <p className="text-xs text-amber-700 mb-2 italic">“{merc.background}”</p>
                                        <p className="text-[10px] text-slate-400 italic leading-snug h-12 overflow-hidden text-justify">{merc.backgroundStory}</p>
                                    </div>
                                </div>
                                
                                <div className="space-y-3 mb-4 flex-1">
                                     <div className="flex justify-between items-center border-b border-white/5 pb-1">
                                         <span className="text-[10px] text-slate-500">潜力评估</span>
                                         <span className="text-xs text-amber-400 font-bold">{role}</span>
                                     </div>
                                     <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] text-slate-400 font-mono">
                                        <div className="flex justify-between"><span>HP</span><span className="text-red-400">{merc.maxHp} {merc.stars.hp > 0 && '★'.repeat(merc.stars.hp)}</span></div>
                                        <div className="flex justify-between"><span>FAT</span><span className="text-blue-400">{merc.maxFatigue} {merc.stars.fatigue > 0 && '★'.repeat(merc.stars.fatigue)}</span></div>
                                        <div className="flex justify-between"><span>近攻</span><span>{merc.stats.meleeSkill} {merc.stars.meleeSkill > 0 && '★'.repeat(merc.stars.meleeSkill)}</span></div>
                                        <div className="flex justify-between"><span>远攻</span><span>{merc.stats.rangedSkill} {merc.stars.rangedSkill > 0 && '★'.repeat(merc.stars.rangedSkill)}</span></div>
                                        <div className="flex justify-between"><span>近防</span><span>{merc.stats.meleeDefense} {merc.stars.meleeDefense > 0 && '★'.repeat(merc.stars.meleeDefense)}</span></div>
                                        <div className="flex justify-between"><span>远防</span><span>{merc.stats.rangedDefense} {merc.stars.rangedDefense > 0 && '★'.repeat(merc.stars.rangedDefense)}</span></div>
                                    </div>
                                </div>
                                
                                <button 
                                    onClick={() => handleRecruit(merc, i)}
                                    className="w-full py-2 bg-amber-900/20 border border-amber-900/50 text-amber-500 hover:bg-amber-600 hover:text-white transition-all font-bold tracking-widest text-xs"
                                >
                                    招募 ({Math.floor(merc.salary * 10)} BU)
                                </button>
                            </div>
                        );
                    })}
                    {city.recruits.length === 0 && (
                        <div className="col-span-3 flex items-center justify-center text-slate-600 italic">
                            此处已无可用之才。
                        </div>
                    )}
                 </div>
            )}

            {activeTab === 'TAVERN' && (
                <div className="flex items-center justify-center h-full">
                    <div className="max-w-xl text-center">
                        <div className="text-6xl mb-6 opacity-20">🍶</div>
                        <p className="text-xl text-slate-400 italic leading-relaxed mb-4">
                            “听说了吗？北边的匈奴人最近有些不安分，好多商队都不敢走了。”
                        </p>
                        <p className="text-sm text-slate-600">
                            酒肆中人声鼎沸，各路消息在此汇聚。（任务系统开发中）
                        </p>
                    </div>
                </div>
            )}

            {activeTab === 'REST' && (
                <div className="flex items-center justify-center h-full">
                     <div className="bg-black/40 border border-white/10 p-10 text-center max-w-md">
                        <h2 className="text-2xl font-bold text-emerald-600 mb-4">全员修整</h2>
                        <p className="text-slate-400 mb-8 text-sm">
                            支付费用，让所有人饱餐一顿并处理伤口。恢复所有生命值并消除疲劳。
                        </p>
                        <div className="text-3xl font-mono text-amber-500 mb-8">{party.mercenaries.length * 20} BU</div>
                        <button 
                            onClick={handleRest}
                            className="w-full py-3 bg-emerald-900/20 border border-emerald-900/50 text-emerald-500 hover:bg-emerald-700 hover:text-white transition-all font-bold tracking-widest"
                        >
                            支付并休息
                        </button>
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

const TabBtn: React.FC<{ label: string, icon: string, active: boolean, onClick: () => void }> = ({ label, icon, active, onClick }) => (
    <button 
        onClick={onClick}
        className={`flex-1 py-4 flex items-center justify-center gap-2 border-b-2 transition-all
            ${active ? 'border-amber-500 bg-white/5 text-amber-500' : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-white/5'}
        `}
    >
        <span className="text-lg">{icon}</span>
        <span className="font-bold tracking-widest text-sm">{label}</span>
    </button>
);

const ItemGridCell: React.FC<{ item: Item, price: number, actionLabel: string, onClick: () => void }> = ({ item, price, actionLabel, onClick }) => (
    <div 
        onClick={onClick}
        className="aspect-square bg-slate-900/80 border border-slate-800 hover:border-amber-500 transition-all p-2 flex flex-col items-center justify-between group relative cursor-pointer"
    >
        <span className="text-[10px] text-center text-slate-400 font-bold absolute top-1 left-1">{item.type === 'WEAPON' ? '⚔️' : item.type === 'ARMOR' ? '👕' : '🛡️'}</span>
        
        <div className="flex-1 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
             {/* Simple Icon Representation */}
             {item.name.includes('剑') ? '🗡️' : item.name.includes('斧') ? '🪓' : item.name.includes('弓') ? '🏹' : item.name.includes('甲') ? '👘' : '📦'}
        </div>
        
        <div className="w-full text-center">
            <div className="text-[10px] truncate text-slate-300">{item.name}</div>
            <div className="text-[9px] text-amber-500 font-mono">{price}</div>
        </div>

        {/* Hover Tooltip - Z Index Fix */}
        <div className="absolute hidden group-hover:block bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-3 bg-black border border-amber-900/60 rounded-sm shadow-2xl z-[100] pointer-events-none">
            <div className="text-amber-500 font-bold mb-1 border-b border-amber-900/30 pb-1 text-xs">{item.name}</div>
            <div className="text-[9px] text-slate-300 leading-relaxed mb-2 italic">“{item.description}”</div>
            <div className="grid grid-cols-2 gap-y-1 gap-x-2 text-[9px] text-slate-400">
                {item.damage && <span className="text-red-400">伤: {item.damage[0]}-{item.damage[1]}</span>}
                {item.armorDmg && <span className="text-amber-400">破: {Math.round(item.armorDmg * 100)}%</span>}
                {item.armorPen && <span className="text-blue-400">穿: {Math.round(item.armorPen * 100)}%</span>}
                {item.durability && <span>耐久: {item.durability}/{item.maxDurability}</span>}
                {item.weight && <span>重: {item.weight}</span>}
            </div>
            <div className="mt-2 text-[9px] text-center text-amber-600 bg-amber-900/10 py-1">点击{actionLabel}</div>
        </div>
    </div>
);
