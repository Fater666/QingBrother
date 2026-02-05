
import React, { useState, useEffect, useMemo } from 'react';
import { Party, Character, Item, Perk } from '../types.ts';
import { Portrait } from './Portrait.tsx';
import { ItemIcon } from './ItemIcon.tsx';
import { BACKGROUNDS, PERK_TREE } from '../constants.tsx';

interface SquadManagementProps {
  party: Party;
  onUpdateParty: (party: Party) => void;
  onClose: () => void;
}

type DragSourceType = 'INVENTORY' | 'EQUIP_SLOT' | 'BAG_SLOT' | 'ROSTER';

interface DragData {
    type: DragSourceType;
    index?: number;
    slotType?: keyof Character['equipment'];
    item?: Item; 
    char?: Character;
}

export const SquadManagement: React.FC<SquadManagementProps> = ({ party, onUpdateParty, onClose }) => {
  const [selectedMerc, setSelectedMerc] = useState<Character | null>(party.mercenaries[0] || null);
  const [rightTab, setRightTab] = useState<'STASH' | 'PERKS'>('STASH');
  const [hoveredItem, setHoveredItem] = useState<Item | null>(null);
  const [hoveredPerk, setHoveredPerk] = useState<Perk | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  useEffect(() => {
      const handleMouseMove = (e: MouseEvent) => setMousePos({ x: e.clientX, y: e.clientY });
      window.addEventListener('mousemove', handleMouseMove);
      return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  const handleDragStart = (e: React.DragEvent, data: DragData) => {
      e.dataTransfer.setData('text/plain', JSON.stringify(data));
  };

  const handleDropOnEquip = (e: React.DragEvent, slot: keyof Character['equipment']) => {
      e.preventDefault();
      const dataStr = e.dataTransfer.getData('text/plain');
      if (!dataStr) return;
      const data: DragData = JSON.parse(dataStr);
      if (!data.item || !selectedMerc) return;
      
      const newMercs = party.mercenaries.map(m => {
          if (m.id !== selectedMerc.id) return m;
          const newEquip = { ...m.equipment };
          const old = newEquip[slot];
          const newInv = [...party.inventory];
          if (data.type === 'INVENTORY') newInv.splice(data.index!, 1);
          if (old) newInv.push(old);
          newEquip[slot] = data.item!;
          onUpdateParty({ ...party, inventory: newInv });
          return { ...m, equipment: newEquip };
      });
      onUpdateParty({ ...party, mercenaries: newMercs });
      setSelectedMerc(newMercs.find(m => m.id === selectedMerc.id)!);
  };

  const perkTreeTiers = useMemo(() => {
      const tiers: Perk[][] = Array.from({ length: 7 }, () => []);
      Object.values(PERK_TREE).forEach(perk => {
          if (perk.tier >= 1 && perk.tier <= 7) tiers[perk.tier - 1].push(perk);
      });
      return tiers;
  }, []);

  return (
    <div className="w-full h-full bg-[#080808] flex flex-col font-serif select-none overflow-hidden relative">
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/dark-wood.png')] opacity-10 pointer-events-none" />
      
      {/* Header */}
      <div className="h-12 bg-black/95 border-b border-amber-900/40 flex items-center justify-between px-6 z-30 shrink-0">
          <div className="flex items-center gap-4">
              <h1 className="text-xl font-bold text-amber-500 italic tracking-[0.25em] uppercase">战团营地</h1>
              {selectedMerc && <span className="text-xs text-slate-500 font-bold uppercase">/ {selectedMerc.name} ({selectedMerc.background})</span>}
          </div>
          <button onClick={onClose} className="px-5 py-1 bg-slate-900 border border-amber-900/30 hover:border-amber-500 text-[10px] text-slate-400 uppercase tracking-widest transition-all">返回地图</button>
      </div>

      <div className="flex-1 flex overflow-hidden z-10">
        
        {/* LEFT COLUMN: Inspector (Equipment + Stats) */}
        <div className="w-[420px] border-r border-amber-900/20 bg-black/40 flex flex-col shrink-0 overflow-hidden">
            {selectedMerc ? (
                <div className="flex flex-col h-full overflow-y-auto custom-scrollbar">
                    {/* Upper: Paper Doll */}
                    <div className="p-6 flex flex-col items-center border-b border-white/5 bg-black/10">
                        <div className="flex items-center gap-6 mb-8 w-full px-4">
                            <Portrait character={selectedMerc} size="lg" className="border-amber-600 shadow-2xl" />
                            <div>
                                <h2 className="text-2xl font-bold text-white tracking-tighter mb-1">{selectedMerc.name}</h2>
                                <p className="text-[10px] text-amber-700 font-bold uppercase tracking-widest bg-amber-950/30 px-2 py-0.5 rounded border border-amber-900/20">{selectedMerc.background} | 等级 {selectedMerc.level}</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-3">
                            <div className="w-20 h-20" />
                            <EquipSlot label="头盔" item={selectedMerc.equipment.helmet} onDrop={(e) => handleDropOnEquip(e, 'helmet')} onHover={setHoveredItem} />
                            <div className="w-20 h-20" />

                            <EquipSlot label="主手" item={selectedMerc.equipment.mainHand} onDrop={(e) => handleDropOnEquip(e, 'mainHand')} onHover={setHoveredItem} />
                            <EquipSlot label="身甲" item={selectedMerc.equipment.armor} onDrop={(e) => handleDropOnEquip(e, 'armor')} onHover={setHoveredItem} />
                            <EquipSlot label="副手" item={selectedMerc.equipment.offHand} onDrop={(e) => handleDropOnEquip(e, 'offHand')} onHover={setHoveredItem} />

                            <EquipSlot label="弹药" item={selectedMerc.equipment.ammo} onDrop={(e) => handleDropOnEquip(e, 'ammo')} onHover={setHoveredItem} />
                            <div className="w-20 h-20" />
                            <EquipSlot label="饰品" item={selectedMerc.equipment.accessory} onDrop={(e) => handleDropOnEquip(e, 'accessory')} onHover={setHoveredItem} />
                        </div>
                        
                        <div className="flex gap-2 mt-6">
                            {Array.from({length: 4}).map((_, i) => (
                                <div key={i} className="w-14 h-14 bg-black/40 border border-slate-800 flex items-center justify-center relative rounded-sm opacity-30">
                                    <span className="text-[9px] text-slate-700 font-mono">{i + 1}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Lower: Attributes Panel */}
                    <div className="p-8 flex flex-col gap-5 flex-1">
                        <h3 className="text-xs font-bold text-amber-600 uppercase tracking-widest border-b border-amber-900/30 pb-2 flex justify-between">
                            <span>详细属性</span>
                            <span className="text-[10px] text-slate-500 font-normal">特性: 暂无</span>
                        </h3>
                        
                        <div className="space-y-4">
                            <AttributeRow label="生命" val={selectedMerc.hp} max={selectedMerc.maxHp} color="bg-red-800" />
                            <AttributeRow label="体力" val={selectedMerc.fatigue} max={selectedMerc.maxFatigue} color="bg-blue-800" inverse />
                            <AttributeRow label="胆识" val={selectedMerc.stats.resolve} max={100} color="bg-purple-800" />
                        </div>

                        <div className="grid grid-cols-2 gap-x-8 gap-y-3 mt-4">
                            <MiniStat label="近战命中" val={selectedMerc.stats.meleeSkill} color="text-amber-500" />
                            <MiniStat label="远程命中" val={selectedMerc.stats.rangedSkill} color="text-orange-500" />
                            <MiniStat label="近战防御" val={selectedMerc.stats.meleeDefense} color="text-slate-400" />
                            <MiniStat label="远程防御" val={selectedMerc.stats.rangedDefense} color="text-slate-400" />
                            <MiniStat label="先手优势" val={selectedMerc.stats.initiative} color="text-emerald-500" />
                        </div>
                    </div>
                </div>
            ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-700 italic px-10 text-center">
                    <span className="text-4xl mb-4 opacity-20">🛡️</span>
                    <p className="text-sm">点击下方战友头像以开始整备</p>
                </div>
            )}
        </div>

        {/* RIGHT COLUMN: Management (Stash/Perks + Formation) */}
        <div className="flex-1 flex flex-col overflow-hidden">
            
            {/* Upper: Tabs (Stash or Perks) */}
            <div className="flex-1 flex flex-col min-h-0 bg-black/10">
                <div className="flex h-10 border-b border-amber-900/20 bg-black/40 shrink-0">
                    <button onClick={() => setRightTab('STASH')} className={`px-12 text-[11px] uppercase font-bold tracking-widest transition-all ${rightTab === 'STASH' ? 'text-amber-500 border-b-2 border-amber-500 bg-white/5' : 'text-slate-500 hover:text-slate-300'}`}>仓库物资</button>
                    <button onClick={() => setRightTab('PERKS')} className={`px-12 text-[11px] uppercase font-bold tracking-widest transition-all ${rightTab === 'PERKS' ? 'text-amber-500 border-b-2 border-amber-500 bg-white/5' : 'text-slate-500 hover:text-slate-300'}`}>专精加成</button>
                </div>

                <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                    {rightTab === 'STASH' ? (
                        <div className="grid grid-cols-8 xl:grid-cols-10 gap-2">
                            {party.inventory.map((item, i) => (
                                <div key={item.id} draggable onDragStart={(e) => handleDragStart(e, { type: 'INVENTORY', index: i, item })} onMouseEnter={() => setHoveredItem(item)} onMouseLeave={() => setHoveredItem(null)} className="aspect-square bg-slate-900/30 border border-slate-800 hover:border-amber-600 cursor-grab p-1 transition-colors rounded-sm shadow-inner">
                                    <ItemIcon item={item} showBackground={false} />
                                </div>
                            ))}
                            {Array.from({length: Math.max(0, 40 - party.inventory.length)}).map((_, i) => (
                                <div key={i} className="aspect-square bg-black/30 border border-white/5 opacity-5 rounded-sm" />
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col gap-6">
                            <div className="mb-4 text-center">
                                <h3 className="text-xs text-amber-600 font-bold uppercase tracking-widest">专精技能树</h3>
                                <p className="text-[10px] text-slate-600">升级获得点数以解锁强大的战斗加成</p>
                            </div>
                            {perkTreeTiers.map((tierPerks, idx) => (
                                <div key={idx} className="flex gap-4 items-center">
                                    <div className="w-10 h-10 flex items-center justify-center border border-white/10 text-[9px] text-slate-600 font-bold bg-black/20 shrink-0">第 {idx+1} 阶</div>
                                    <div className="flex-1 h-px bg-white/5" />
                                    <div className="flex gap-2">
                                        {tierPerks.map(perk => (
                                            <div key={perk.id} onMouseEnter={() => setHoveredPerk(perk)} onMouseLeave={() => setHoveredPerk(null)} className={`w-14 h-14 border-2 flex items-center justify-center text-2xl transition-all cursor-help rounded-sm ${selectedMerc?.perks.includes(perk.id) ? 'bg-amber-900/40 border-amber-500 shadow-lg' : 'bg-black border-slate-800 grayscale opacity-40 hover:opacity-100 hover:grayscale-0'}`}>
                                                {perk.icon}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Lower: Formation Area */}
            <div className="h-64 border-t border-amber-900/30 bg-black/60 p-8 shrink-0 flex flex-col">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-[0.2em]">战阵布署</h3>
                    <span className="text-[10px] text-slate-600">拖动战友头像进行位置排布</span>
                </div>
                <div className="flex-1 grid grid-cols-9 grid-rows-2 gap-2">
                    {Array.from({length: 18}).map((_, i) => {
                        const char = party.mercenaries.find(m => m.formationIndex === i);
                        return (
                            <div 
                                key={i} 
                                onDragOver={(e) => e.preventDefault()} 
                                onDrop={(e) => {
                                    e.preventDefault();
                                    const dataStr = e.dataTransfer.getData('text/plain');
                                    if (!dataStr) return;
                                    const data: DragData = JSON.parse(dataStr);
                                    if (data.type !== 'ROSTER' || !data.char) return;
                                    const newMercs = party.mercenaries.map(m => m.id === data.char!.id ? { ...m, formationIndex: i } : (m.formationIndex === i ? { ...m, formationIndex: null } : m));
                                    onUpdateParty({ ...party, mercenaries: newMercs });
                                }}
                                onClick={() => char && setSelectedMerc(char)}
                                className={`aspect-square border-2 transition-all flex items-center justify-center relative rounded-sm ${char ? (selectedMerc?.id === char.id ? 'border-amber-500 bg-amber-950/40 shadow-xl scale-105' : 'border-slate-700 bg-slate-900/50 cursor-pointer hover:border-slate-500') : 'border-slate-800/30 bg-black/20'}`}
                            >
                                {char ? (
                                    <div className="w-full h-full p-1.5">
                                        <Portrait character={char} size="sm" className="w-full h-full" />
                                    </div>
                                ) : <span className="text-[9px] text-slate-800 font-mono opacity-20">{i + 1}</span>}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
      </div>

      {/* FOOTER: Roster List */}
      <div className="h-28 bg-black/95 border-t border-amber-900/40 flex items-center gap-5 px-10 overflow-x-auto shrink-0 z-40 custom-scrollbar">
          {party.mercenaries.map(m => (
              <div key={m.id} onClick={() => setSelectedMerc(m)} draggable onDragStart={(e) => handleDragStart(e, { type: 'ROSTER', char: m })} className={`h-20 aspect-square border-2 shrink-0 transition-all cursor-pointer relative group rounded-sm ${selectedMerc?.id === m.id ? 'border-amber-500 bg-amber-950/40 scale-110 z-10 shadow-lg' : 'border-slate-800 bg-slate-950 hover:border-slate-600 hover:bg-slate-900'}`}>
                  <Portrait character={m} size="sm" className="w-full h-full p-1.5" />
                  <div className="absolute -bottom-1 -right-1 bg-black/95 border border-amber-900/50 text-[9px] px-1.5 text-amber-500 font-mono font-bold shadow-md">LV.{m.level}</div>
                  {m.formationIndex === null && <div className="absolute -top-1 -left-1 text-[8px] bg-red-900 text-white px-1 font-bold">待机</div>}
              </div>
          ))}
          <div className="w-20 h-20 border-2 border-dashed border-slate-800 flex flex-col items-center justify-center text-slate-700 hover:border-slate-600 hover:text-slate-400 cursor-pointer shrink-0 transition-colors">
              <span className="text-2xl font-bold">+</span>
              <span className="text-[8px] font-bold uppercase tracking-widest mt-1">招募</span>
          </div>
      </div>

      {/* Tooltips */}
      {hoveredItem && (
          <div className="fixed z-[100] bg-black/95 border border-amber-600 p-4 shadow-2xl pointer-events-none w-64 rounded-sm" style={{ left: mousePos.x + 20, top: mousePos.y + 20 }}>
            <h4 className="text-amber-500 font-bold text-sm border-b border-amber-900/40 pb-2 mb-2 flex justify-between uppercase tracking-widest font-serif">{hoveredItem.name} <span className="text-slate-500 font-mono">{hoveredItem.value}G</span></h4>
            <p className="text-[10px] text-slate-400 italic mb-4 leading-relaxed font-serif">“{hoveredItem.description}”</p>
            <div className="space-y-1.5 text-[11px] font-mono">
                {hoveredItem.damage && <div className="flex justify-between text-slate-300"><span>基础杀伤</span> <span className="text-red-400 font-bold">{hoveredItem.damage[0]}-{hoveredItem.damage[1]}</span></div>}
                {hoveredItem.armorPen !== undefined && <div className="flex justify-between text-slate-300"><span>穿甲能力</span> <span className="text-blue-400 font-bold">{Math.round(hoveredItem.armorPen * 100)}%</span></div>}
                {hoveredItem.fatigueCost !== undefined && <div className="flex justify-between text-slate-300"><span>体力消耗</span> <span className="text-purple-400">-{hoveredItem.fatigueCost}</span></div>}
            </div>
          </div>
      )}
      {hoveredPerk && (
          <div className="fixed z-[100] bg-black/95 border border-amber-600 p-5 shadow-2xl pointer-events-none w-80 rounded-sm" style={{ left: mousePos.x - 340, top: mousePos.y }}>
            <h4 className="text-amber-500 font-bold text-sm border-b border-white/10 pb-2 mb-2 flex items-center gap-3 uppercase tracking-widest font-serif">
                <span className="text-2xl">{hoveredPerk.icon}</span> {hoveredPerk.name}
            </h4>
            <p className="text-[11px] text-slate-300 leading-relaxed font-serif">{hoveredPerk.description}</p>
          </div>
      )}
    </div>
  );
};

const EquipSlot = ({ item, label, onDrop, onHover }: any) => (
    <div onDragOver={(e) => e.preventDefault()} onDrop={onDrop} onMouseEnter={() => item && onHover(item)} onMouseLeave={() => onHover(null)} className="w-20 h-20 bg-black/40 border border-slate-800 flex flex-col items-center justify-center relative hover:border-amber-600 transition-all rounded-sm overflow-hidden group shadow-[inset_0_0_15px_rgba(0,0,0,0.5)]">
        {item ? <ItemIcon item={item} showBackground={false} className="p-2" /> : <span className="text-[8px] text-slate-800 uppercase font-bold tracking-widest opacity-20">{label}</span>}
    </div>
);

const AttributeRow = ({ label, val, max, color, inverse = false }: any) => {
    const pct = Math.min(100, (val / max) * 100);
    return (
        <div className="flex flex-col gap-1.5">
            <div className="flex justify-between items-baseline text-[9px] uppercase font-bold tracking-widest">
                <span className="text-slate-500">{label}</span>
                <span className="text-slate-200 font-mono">{val} / {max}</span>
            </div>
            <div className="h-1 bg-black/50 w-full overflow-hidden border border-white/5 rounded-full">
                <div className={`h-full ${color} transition-all duration-700 ease-out`} style={{ width: `${inverse ? (100-pct) : pct}%` }} />
            </div>
        </div>
    );
};

const MiniStat = ({ label, val, color }: any) => (
    <div className="flex justify-between items-center border-b border-white/5 py-2">
        <span className="text-[9px] text-slate-600 uppercase font-bold tracking-widest">{label}</span>
        <span className={`text-[11px] font-bold font-mono ${color}`}>{val}</span>
    </div>
);
