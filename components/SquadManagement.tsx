
import React, { useState, useEffect } from 'react';
import { Party, Character, Item, Perk } from '../types.ts';
import { Portrait } from './Portrait.tsx';
import { ItemIcon } from './ItemIcon.tsx';
import { BACKGROUNDS, PERK_TREE } from '../constants.tsx';

interface SquadManagementProps {
  party: Party;
  onUpdateParty: (party: Party) => void;
  onClose: () => void;
}

// Drag Types
type DragSourceType = 'INVENTORY' | 'EQUIP_SLOT' | 'ROSTER' | 'RESERVE' | 'BAG_SLOT';

interface DragData {
    type: DragSourceType;
    index?: number; // For Inventory or Bag index
    slotType?: keyof Character['equipment']; // For Equip Slot
    formationIndex?: number; // For Formation (0-17)
    item?: Item; 
    char?: Character; 
}

export const SquadManagement: React.FC<SquadManagementProps> = ({ party, onUpdateParty, onClose }) => {
  const [selectedMerc, setSelectedMerc] = useState<Character | null>(party.mercenaries[0] || null);
  const [rightTab, setRightTab] = useState<'INVENTORY' | 'PERKS'>('INVENTORY'); 
  
  // Drag State
  const [dragging, setDragging] = useState<DragData | null>(null);

  // Tooltip Logic
  const [hoveredItem, setHoveredItem] = useState<Item | null>(null);
  const [hoveredPerk, setHoveredPerk] = useState<Perk | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  useEffect(() => {
      const handleMouseMove = (e: MouseEvent) => {
          setMousePos({ x: e.clientX, y: e.clientY });
      };
      window.addEventListener('mousemove', handleMouseMove);
      return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // --- Drag & Drop Handlers ---

  const handleDragStart = (e: React.DragEvent, data: DragData) => {
      setDragging(data);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', JSON.stringify(data));
  };

  const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault(); 
      e.dataTransfer.dropEffect = 'move';
  };

  const handleDropOnEquipSlot = (e: React.DragEvent, targetSlot: keyof Character['equipment']) => {
      e.preventDefault();
      if (!selectedMerc || !dragging) return;

      if ((dragging.type === 'INVENTORY' || dragging.type === 'EQUIP_SLOT' || dragging.type === 'BAG_SLOT') && dragging.item) {
          // Validation
          const itemType = dragging.item.type;
          let isValid = false;
          if (targetSlot === 'helmet' && itemType === 'HELMET') isValid = true;
          if (targetSlot === 'armor' && itemType === 'ARMOR') isValid = true;
          if (targetSlot === 'mainHand' && itemType === 'WEAPON') isValid = true;
          if (targetSlot === 'offHand' && (itemType === 'SHIELD' || itemType === 'WEAPON')) isValid = true; 

          if (!isValid) return;

          const newMercs = party.mercenaries.map(m => {
              if (m.id !== selectedMerc.id) return m;
              
              const newEquip = { ...m.equipment };
              const oldItemAtSlot = newEquip[targetSlot];
              const newItem = dragging.item!;
              let newInventory = [...party.inventory];
              let newBag = [...m.bag];

              // Remove from source
              if (dragging.type === 'INVENTORY' && typeof dragging.index === 'number') {
                  newInventory.splice(dragging.index, 1);
              } else if (dragging.type === 'EQUIP_SLOT' && dragging.slotType) {
                  newEquip[dragging.slotType] = null;
              } else if (dragging.type === 'BAG_SLOT' && typeof dragging.index === 'number') {
                  newBag[dragging.index] = null;
              }

              // Put old item back
              if (oldItemAtSlot) {
                  // If dragging from bag, swap? No, just put to inventory for simplicity, unless we implement direct swap logic
                  newInventory.push(oldItemAtSlot);
              }

              newEquip[targetSlot] = newItem;
              party.inventory = newInventory;
              return { ...m, equipment: newEquip, bag: newBag };
          });

          onUpdateParty({ ...party, mercenaries: newMercs });
          setSelectedMerc(newMercs.find(m => m.id === selectedMerc.id) || null);
      }
      setDragging(null);
  };

  const handleDropOnBagSlot = (e: React.DragEvent, targetIndex: number) => {
      e.preventDefault();
      if (!selectedMerc || !dragging) return;
      
      const hasBagPerk = selectedMerc.perks.includes('bags_and_belts');
      const maxSlots = hasBagPerk ? 4 : 2;
      if (targetIndex >= maxSlots) return;

      if ((dragging.type === 'INVENTORY' || dragging.type === 'EQUIP_SLOT' || dragging.type === 'BAG_SLOT') && dragging.item) {
          const newMercs = party.mercenaries.map(m => {
              if (m.id !== selectedMerc.id) return m;
              
              let newInventory = [...party.inventory];
              let newBag = [...m.bag];
              let newEquip = { ...m.equipment };
              
              const oldItemAtBag = newBag[targetIndex];
              const newItem = dragging.item!;

              // Remove from source
              if (dragging.type === 'INVENTORY' && typeof dragging.index === 'number') {
                  newInventory.splice(dragging.index, 1);
              } else if (dragging.type === 'EQUIP_SLOT' && dragging.slotType) {
                  newEquip[dragging.slotType] = null;
              } else if (dragging.type === 'BAG_SLOT' && typeof dragging.index === 'number') {
                  newBag[dragging.index] = null;
              }

              if (oldItemAtBag) {
                  newInventory.push(oldItemAtBag);
              }

              newBag[targetIndex] = newItem;
              party.inventory = newInventory;
              return { ...m, equipment: newEquip, bag: newBag };
          });
          onUpdateParty({ ...party, mercenaries: newMercs });
          setSelectedMerc(newMercs.find(m => m.id === selectedMerc.id) || null);
      }
      setDragging(null);
  };

  const handleDropOnInventory = (e: React.DragEvent) => {
      e.preventDefault();
      if (!dragging) return;

      if (selectedMerc && (dragging.type === 'EQUIP_SLOT' || dragging.type === 'BAG_SLOT') && dragging.item) {
          const newMercs = party.mercenaries.map(m => {
              if (m.id !== selectedMerc.id) return m;
              const newEquip = { ...m.equipment };
              const newBag = [...m.bag];

              if (dragging.type === 'EQUIP_SLOT' && dragging.slotType) {
                  newEquip[dragging.slotType] = null;
              } else if (dragging.type === 'BAG_SLOT' && typeof dragging.index === 'number') {
                  newBag[dragging.index] = null;
              }

              return { ...m, equipment: newEquip, bag: newBag };
          });
          const newInventory = [...party.inventory, dragging.item];
          onUpdateParty({ ...party, mercenaries: newMercs, inventory: newInventory });
          setSelectedMerc(newMercs.find(m => m.id === selectedMerc.id) || null);
      }
      setDragging(null);
  };

  // --- Roster Management Handlers ---

  const moveCharacter = (charId: string, targetFormationIdx: number | null) => {
      const updatedMercs = party.mercenaries.map(m => {
           if (m.id === charId) return { ...m, formationIndex: targetFormationIdx };
           // Swap logic if target slot occupied
           if (targetFormationIdx !== null && m.formationIndex === targetFormationIdx) {
               const sourceChar = party.mercenaries.find(sc => sc.id === charId);
               return { ...m, formationIndex: sourceChar ? sourceChar.formationIndex : null };
           }
           return m;
      });

      onUpdateParty({ ...party, mercenaries: updatedMercs });
      
      // Update selected reference
      const newSelected = updatedMercs.find(m => m.id === selectedMerc?.id);
      if(newSelected) setSelectedMerc(newSelected);
  };

  const handleDropOnFormationSlot = (e: React.DragEvent, targetIndex: number) => {
      e.preventDefault();
      if (!dragging || !dragging.char) return;
      if (dragging.type === 'ROSTER' || dragging.type === 'RESERVE') {
          moveCharacter(dragging.char.id, targetIndex);
      }
      setDragging(null);
  };

  const handleDropOnReserve = (e: React.DragEvent) => {
      e.preventDefault();
      if (!dragging || !dragging.char) return;
      if (dragging.type === 'ROSTER') {
          moveCharacter(dragging.char.id, null);
      }
      setDragging(null);
  };

  const handleUnlockPerk = (perkId: string) => {
      if (!selectedMerc || selectedMerc.perkPoints <= 0) return;
      const perk = PERK_TREE[perkId];
      if (!perk) return;
      
      // Check tier requirement
      if (selectedMerc.level < perk.tier + 1) return;

      const newMercs = party.mercenaries.map(m => {
          if (m.id === selectedMerc.id) {
              return { 
                  ...m, 
                  perkPoints: m.perkPoints - 1,
                  perks: [...(m.perks || []), perkId]
              };
          }
          return m;
      });
      onUpdateParty({ ...party, mercenaries: newMercs });
      setSelectedMerc(newMercs.find(m => m.id === selectedMerc.id) || null);
  };

  const calculateTotalFatiguePenalty = (char: Character) => {
      // Calculate bag fatigue
      const bagFatigue = (char.bag || []).reduce((acc, item) => acc + (item ? item.weight / 2 : 0), 0); // Items in bag cost half fatigue usually? Let's say half weight counts as fatigue penalty.
      
      return (char.equipment.armor?.maxFatiguePenalty || 0) + 
             (char.equipment.helmet?.maxFatiguePenalty || 0) + 
             (char.equipment.offHand?.fatigueCost || 0) + 
             Math.floor(bagFatigue);
  };

  // Helpers to render grid
  const getFormationChar = (idx: number) => party.mercenaries.find(m => m.formationIndex === idx);
  const getReserves = () => party.mercenaries.filter(m => m.formationIndex === null || m.formationIndex === undefined);

  // Helper for background icon
  const getBgIcon = (bgName: string) => {
      const entry = Object.values(BACKGROUNDS).find(b => b.name === bgName);
      return entry ? entry.icon : '';
  };

  return (
    <div className="fixed inset-0 bg-[#080808] z-50 flex flex-col p-6 overflow-hidden font-serif text-slate-200">
      <div className="absolute inset-0 opacity-10 pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/dark-leather.png')]" />

      {/* Header */}
      <div className="flex justify-between items-center mb-4 z-10 shrink-0">
        <div className="flex flex-col">
           <h1 className="text-3xl font-bold text-amber-600 italic tracking-tighter">行伍之志</h1>
        </div>
        <div className="flex gap-4 items-center">
            <div className="flex gap-4 bg-black/50 px-4 py-2 rounded border border-white/5">
                <span className="text-amber-500 font-mono text-sm">💰 {party.gold}</span>
                <span className="text-emerald-500 font-mono text-sm">🌾 {Math.floor(party.food)}</span>
            </div>
            <button 
            onClick={onClose}
            className="px-6 py-2 bg-black hover:bg-amber-900/20 border border-amber-900/50 text-amber-500 font-bold transition-all hover:scale-105 shadow-2xl active:scale-95 uppercase tracking-widest text-xs"
            >
            拔营启程
            </button>
        </div>
      </div>

      {/* Main Content - Flex Layout */}
      <div className="flex-1 flex gap-4 overflow-hidden z-10 min-h-0">
        
        {/* Left Column (30%): Stats & Equipment */}
        <div className="w-[30%] flex flex-col gap-2 min-w-[320px] bg-black/40 border border-white/5 rounded-sm p-4 overflow-y-auto custom-scrollbar shadow-inner relative">
            {selectedMerc ? (
                <div className="flex flex-col gap-6">
                    {/* Header */}
                    <div className="flex items-center gap-4">
                        <Portrait character={selectedMerc} size="lg" className="shadow-[0_0_20px_rgba(0,0,0,0.8)] border-amber-900/50" />
                        <div>
                            <h2 className="text-2xl font-bold text-slate-200 leading-none mb-1">{selectedMerc.name}</h2>
                            <div className="flex items-center gap-2">
                                <span className="text-lg" title={selectedMerc.background}>{getBgIcon(selectedMerc.background)}</span>
                                <span className="text-xs text-amber-700 italic">“{selectedMerc.background}”</span>
                                <span className="text-xs text-slate-500 font-mono border border-slate-700 px-1 rounded">LV.{selectedMerc.level}</span>
                            </div>
                        </div>
                    </div>

                    {/* Equipment Slots (Paper Doll) */}
                    <div className="relative w-full aspect-square bg-black/20 border border-white/5 rounded-full flex items-center justify-center">
                        <div className="absolute inset-0 opacity-10 pointer-events-none rounded-full border-2 border-dashed border-slate-500 scale-90" />
                        
                        {/* Cross Layout */}
                        <div className="absolute top-4 left-1/2 -translate-x-1/2">
                            <EquipSlot label="头盔" item={selectedMerc.equipment.helmet} onHover={setHoveredItem} onDragStart={(e) => handleDragStart(e, { type: 'EQUIP_SLOT', slotType: 'helmet', item: selectedMerc.equipment.helmet! })} onDrop={(e) => handleDropOnEquipSlot(e, 'helmet')} />
                        </div>
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pt-16">
                            <EquipSlot label="身甲" item={selectedMerc.equipment.armor} onHover={setHoveredItem} className="scale-110 z-10" onDragStart={(e) => handleDragStart(e, { type: 'EQUIP_SLOT', slotType: 'armor', item: selectedMerc.equipment.armor! })} onDrop={(e) => handleDropOnEquipSlot(e, 'armor')} />
                        </div>
                        <div className="absolute top-1/2 left-4 -translate-y-1/2 pt-10">
                            <EquipSlot label="主手" item={selectedMerc.equipment.mainHand} onHover={setHoveredItem} onDragStart={(e) => handleDragStart(e, { type: 'EQUIP_SLOT', slotType: 'mainHand', item: selectedMerc.equipment.mainHand! })} onDrop={(e) => handleDropOnEquipSlot(e, 'mainHand')} />
                        </div>
                        <div className="absolute top-1/2 right-4 -translate-y-1/2 pt-10">
                            <EquipSlot label="副手" item={selectedMerc.equipment.offHand} onHover={setHoveredItem} onDragStart={(e) => handleDragStart(e, { type: 'EQUIP_SLOT', slotType: 'offHand', item: selectedMerc.equipment.offHand! })} onDrop={(e) => handleDropOnEquipSlot(e, 'offHand')} />
                        </div>
                        
                        {/* Bags */}
                        <div className="absolute bottom-8 flex gap-2 justify-center w-full">
                            {Array.from({length: 4}).map((_, i) => {
                                const hasPerk = selectedMerc.perks.includes('bags_and_belts');
                                const isLocked = i >= 2 && !hasPerk;
                                return (
                                    <div 
                                        key={i}
                                        onDragOver={(e) => !isLocked && handleDragOver(e)}
                                        onDrop={(e) => !isLocked && handleDropOnBagSlot(e, i)}
                                        className={`w-10 h-10 border flex items-center justify-center relative
                                            ${isLocked ? 'border-red-900/50 bg-black/60' : 'border-slate-700 bg-slate-900/50 hover:border-amber-500'}
                                        `}
                                    >
                                        {isLocked ? (
                                            <span className="text-[10px] text-red-900">🔒</span>
                                        ) : (
                                            selectedMerc.bag[i] ? (
                                                <div 
                                                    draggable
                                                    onDragStart={(e) => handleDragStart(e, { type: 'BAG_SLOT', index: i, item: selectedMerc.bag[i]! })}
                                                    onMouseEnter={() => setHoveredItem(selectedMerc.bag[i])}
                                                    onMouseLeave={() => setHoveredItem(null)}
                                                    className="w-full h-full p-1 cursor-pointer hover:scale-110 transition-transform"
                                                >
                                                    <ItemIcon item={selectedMerc.bag[i]} showBackground={false} />
                                                </div>
                                            ) : (
                                                <span className="text-[8px] text-slate-800">空</span>
                                            )
                                        )}
                                    </div>
                                )
                            })}
                        </div>

                        {/* Mini Stats Overlay */}
                        <div className="absolute top-4 left-4 flex flex-col gap-1 text-[9px] text-slate-400 font-mono">
                             <div className="flex gap-2"><span>盔耐久:</span> <span className="text-white">{selectedMerc.equipment.helmet?.durability || 0}</span></div>
                             <div className="flex gap-2"><span>甲耐久:</span> <span className="text-white">{selectedMerc.equipment.armor?.durability || 0}</span></div>
                             <div className="flex gap-2"><span>总负重:</span> <span className="text-red-400">-{calculateTotalFatiguePenalty(selectedMerc)}</span></div>
                        </div>
                    </div>

                    {/* Attributes */}
                    <div>
                        <h3 className="text-[10px] text-amber-700 uppercase tracking-widest mb-3 border-b border-amber-900/20 pb-1">基础属性</h3>
                        <div className="grid grid-cols-1 gap-2">
                             <StatBar label="生命" val={selectedMerc.hp} max={selectedMerc.maxHp} stars={selectedMerc.stars.hp} color="bg-red-600" />
                             <StatBar label="体力" val={selectedMerc.maxFatigue} max={140} stars={selectedMerc.stars.fatigue} color="bg-blue-600" />
                             <StatBar label="胆识" val={selectedMerc.stats.resolve} max={80} stars={selectedMerc.stars.resolve} color="bg-purple-600" />
                             <StatBar label="先手" val={selectedMerc.stats.initiative} max={160} stars={selectedMerc.stars.initiative} color="bg-emerald-600" />
                        </div>
                        
                        <h3 className="text-[10px] text-amber-700 uppercase tracking-widest mt-4 mb-3 border-b border-amber-900/20 pb-1">战斗技艺</h3>
                        <div className="grid grid-cols-1 gap-2">
                             <StatBar label="近战命中" val={selectedMerc.stats.meleeSkill} max={100} stars={selectedMerc.stars.meleeSkill} color="bg-amber-600" />
                             <StatBar label="远程命中" val={selectedMerc.stats.rangedSkill} max={100} stars={selectedMerc.stars.rangedSkill} color="bg-orange-600" />
                             <StatBar label="近战防御" val={selectedMerc.stats.meleeDefense} max={50} stars={selectedMerc.stars.meleeDefense} color="bg-slate-500" />
                             <StatBar label="远程防御" val={selectedMerc.stats.rangedDefense} max={50} stars={selectedMerc.stars.rangedDefense} color="bg-slate-500" />
                        </div>
                    </div>

                    <div className="border-t border-white/5 pt-2">
                         <h4 className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">生平</h4>
                         <p className="text-xs text-slate-400 italic leading-relaxed text-justify opacity-80">
                             {selectedMerc.backgroundStory}
                         </p>
                    </div>
                </div>
            ) : (
                <div className="flex-1 flex items-center justify-center text-slate-600 italic">选择一名成员</div>
            )}
        </div>

        {/* Right Column (70%): Tabs & Formation */}
        <div className="flex-1 flex flex-col gap-4 min-h-0">
             
             {/* Top Right: Inventory / Perks Tabs */}
             <div className="flex-[1.5] bg-black/40 border border-white/5 rounded-sm flex flex-col min-h-0 relative">
                 {/* Tabs Header */}
                 <div className="flex border-b border-white/5 bg-black/20 shrink-0">
                     <button 
                        onClick={() => setRightTab('INVENTORY')}
                        className={`flex-1 py-3 text-xs font-bold uppercase tracking-widest transition-all ${rightTab === 'INVENTORY' ? 'bg-white/5 text-amber-500 border-b-2 border-amber-500' : 'text-slate-500 hover:text-slate-300'}`}
                     >
                        📦 战利品 ({party.inventory.length})
                     </button>
                     <button 
                        onClick={() => setRightTab('PERKS')}
                        className={`flex-1 py-3 text-xs font-bold uppercase tracking-widest transition-all ${rightTab === 'PERKS' ? 'bg-white/5 text-amber-500 border-b-2 border-amber-500' : 'text-slate-500 hover:text-slate-300'}`}
                     >
                        🎓 技能树 {selectedMerc && selectedMerc.perkPoints > 0 && <span className="ml-2 bg-amber-600 text-white px-1.5 rounded-full text-[9px] animate-pulse">{selectedMerc.perkPoints}</span>}
                     </button>
                 </div>

                 {/* Tab Content */}
                 <div className="flex-1 overflow-y-auto p-4 custom-scrollbar relative">
                     {rightTab === 'INVENTORY' && (
                         <div 
                            className="h-full"
                            onDragOver={handleDragOver}
                            onDrop={handleDropOnInventory}
                         >
                             <div className="grid grid-cols-8 gap-2">
                                {party.inventory.map((item, i) => (
                                     <div 
                                        key={item.id} 
                                        draggable
                                        onDragStart={(e) => handleDragStart(e, { type: 'INVENTORY', index: i, item })}
                                        onMouseEnter={() => setHoveredItem(item)}
                                        onMouseLeave={() => setHoveredItem(null)}
                                        className="aspect-square bg-slate-900/80 border border-slate-800 hover:border-amber-500 transition-all p-1 flex items-center justify-center group relative cursor-grab active:cursor-grabbing"
                                     >
                                        <ItemIcon item={item} className="w-full h-full p-0.5" showBackground={false} />
                                     </div>
                                ))}
                                {Array.from({ length: Math.max(0, 48 - party.inventory.length) }).map((_, i) => (
                                    <div key={i} className="aspect-square border border-dashed border-slate-800/30" />
                                ))}
                             </div>
                         </div>
                     )}

                     {rightTab === 'PERKS' && selectedMerc && (
                         <div className="flex flex-col gap-6 items-center py-4">
                             {Array.from({ length: 7 }).map((_, i) => {
                                 const tier = i + 1;
                                 const tierPerks = Object.values(PERK_TREE).filter(p => p.tier === tier);
                                 const isUnlockedTier = selectedMerc.level >= tier + 1;
                                 
                                 return (
                                     <div key={tier} className={`flex items-center gap-6 w-full max-w-3xl ${isUnlockedTier ? 'opacity-100' : 'opacity-40 grayscale'}`}>
                                         <div className="w-16 shrink-0 text-right">
                                             <div className="text-amber-500 font-bold text-xs font-mono">TIER {tier}</div>
                                             <div className="text-[9px] text-slate-500">{tier === 1 ? 'Lv.2' : `Lv.${tier+1}`}</div>
                                         </div>
                                         
                                         <div className="flex-1 flex flex-wrap gap-3 p-3 border-l-2 border-white/5 bg-white/[0.02] rounded-r-lg">
                                             {tierPerks.map(perk => {
                                                 const isLearned = (selectedMerc.perks || []).includes(perk.id);
                                                 const canLearn = isUnlockedTier && selectedMerc.perkPoints > 0 && !isLearned;
                                                 
                                                 return (
                                                     <div 
                                                         key={perk.id}
                                                         onMouseEnter={() => setHoveredPerk(perk)}
                                                         onMouseLeave={() => setHoveredPerk(null)}
                                                         onClick={() => canLearn && handleUnlockPerk(perk.id)}
                                                         className={`
                                                             w-12 h-12 border flex items-center justify-center text-2xl rounded cursor-pointer transition-all relative group
                                                             ${isLearned ? 'bg-amber-900/60 border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.3)] scale-105' : 'bg-black/40 border-slate-700'}
                                                             ${canLearn ? 'hover:border-white hover:bg-white/10 hover:scale-110' : ''}
                                                         `}
                                                     >
                                                         {perk.icon}
                                                         {isLearned && <div className="absolute -top-1 -right-1 text-[10px] bg-green-900 text-green-400 rounded-full w-4 h-4 flex items-center justify-center border border-green-500 shadow-lg">✔</div>}
                                                     </div>
                                                 );
                                             })}
                                         </div>
                                     </div>
                                 );
                             })}
                             
                             <div className="mt-4 px-6 py-2 bg-amber-900/20 border border-amber-900/50 rounded-full flex items-center gap-2">
                                 <span className="text-slate-400 text-xs">剩余技能点</span>
                                 <span className="text-2xl font-bold text-white font-mono">{selectedMerc.perkPoints}</span>
                             </div>
                         </div>
                     )}
                     
                     {rightTab === 'PERKS' && !selectedMerc && (
                         <div className="h-full flex items-center justify-center text-slate-600 italic">选择一名成员查看技能树</div>
                     )}
                 </div>
             </div>

             {/* Bottom Right: Battle Formation & Reserves */}
             <div className="flex-1 flex flex-col gap-2 min-h-[220px]">
                 
                 {/* 1. Battle Formation Grid */}
                 <div 
                    className="flex-[2] bg-black/40 border border-white/5 rounded-sm p-2 flex flex-col"
                 >
                     <h2 className="text-[10px] text-slate-500 uppercase tracking-widest mb-1 flex justify-between">
                         <span>作战阵型 (前排 / 后排)</span>
                         <span className="text-amber-600 text-[9px]">拖拽调整</span>
                     </h2>
                     {/* Rows */}
                     <div className="flex-1 flex flex-col gap-1 justify-center">
                         {/* Back Row (Indices 9-17) */}
                         <div className="grid grid-cols-9 gap-1 h-1/2">
                             {Array.from({length: 9}).map((_, i) => {
                                 const idx = i + 9;
                                 const merc = getFormationChar(idx);
                                 const isSelected = selectedMerc?.id === merc?.id;
                                 return (
                                     <FormationSlot 
                                        key={idx} 
                                        index={idx} 
                                        merc={merc} 
                                        isSelected={isSelected}
                                        onSelect={(m) => m && setSelectedMerc(m)}
                                        onDragStart={handleDragStart}
                                        onDrop={handleDropOnFormationSlot}
                                        onDragOver={handleDragOver}
                                        label="后"
                                     />
                                 );
                             })}
                         </div>
                         {/* Front Row (Indices 0-8) */}
                         <div className="grid grid-cols-9 gap-1 h-1/2">
                             {Array.from({length: 9}).map((_, i) => {
                                 const idx = i;
                                 const merc = getFormationChar(idx);
                                 const isSelected = selectedMerc?.id === merc?.id;
                                 return (
                                     <FormationSlot 
                                        key={idx} 
                                        index={idx} 
                                        merc={merc} 
                                        isSelected={isSelected}
                                        onSelect={(m) => m && setSelectedMerc(m)}
                                        onDragStart={handleDragStart}
                                        onDrop={handleDropOnFormationSlot}
                                        onDragOver={handleDragOver}
                                        label="前"
                                     />
                                 );
                             })}
                         </div>
                     </div>
                 </div>

                 {/* 2. Reserves List */}
                 <div 
                    className="flex-1 bg-black/40 border border-white/5 rounded-sm p-2 flex flex-col"
                    onDragOver={handleDragOver}
                    onDrop={handleDropOnReserve}
                 >
                     <h2 className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">后备队伍 (不参战)</h2>
                     <div className="flex-1 overflow-x-auto flex gap-2 items-center px-1">
                         {getReserves().map(merc => {
                             const isSelected = selectedMerc?.id === merc.id;
                             return (
                                 <div 
                                    key={merc.id}
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, { type: 'RESERVE', char: merc })}
                                    onClick={() => setSelectedMerc(merc)}
                                    className={`w-12 h-12 flex-shrink-0 relative cursor-pointer border transition-all
                                        ${isSelected ? 'border-amber-500 bg-amber-900/20' : 'border-slate-700 bg-black/40 hover:border-slate-500'}
                                    `}
                                 >
                                     <Portrait character={merc} size="sm" className="w-full h-full border-none pointer-events-none" />
                                 </div>
                             );
                         })}
                         {getReserves().length === 0 && <span className="text-[9px] text-slate-600 italic pl-2">无后备人员</span>}
                     </div>
                 </div>

             </div>
        </div>

      </div>

      {/* Global Fixed Tooltip (Item) */}
      {hoveredItem && (
          <div 
            className="fixed z-[100] w-56 p-3 bg-black border border-amber-900/80 rounded-sm shadow-2xl pointer-events-none"
            style={{ 
                left: Math.min(window.innerWidth - 240, mousePos.x + 15), 
                top: Math.min(window.innerHeight - 200, mousePos.y + 15) 
            }}
          >
            <div className="text-amber-500 font-bold mb-1 text-xs border-b border-amber-900/30 pb-1">{hoveredItem.name} <span className="float-right text-slate-600">{hoveredItem.type}</span></div>
            <div className="text-[10px] text-slate-300 leading-relaxed mb-2 italic">“{hoveredItem.description}”</div>
            <div className="grid grid-cols-2 gap-y-1 gap-x-2 text-[10px] text-slate-400 font-mono">
                {hoveredItem.damage && <div className="text-red-400">杀伤: {hoveredItem.damage[0]}-{hoveredItem.damage[1]}</div>}
                {hoveredItem.armorPen && <div className="text-blue-400">穿透: {Math.round(hoveredItem.armorPen * 100)}%</div>}
                {hoveredItem.armorDmg && <div className="text-amber-400">毁甲: {Math.round(hoveredItem.armorDmg * 100)}%</div>}
                {hoveredItem.maxFatiguePenalty !== undefined && <div className="text-purple-400">疲劳: -{hoveredItem.maxFatiguePenalty}</div>}
                {hoveredItem.durability !== undefined && <div>耐久: {hoveredItem.durability}/{hoveredItem.maxDurability}</div>}
            </div>
          </div>
      )}

      {/* Global Fixed Tooltip (Perk) */}
      {hoveredPerk && (
          <div 
            className="fixed z-[100] w-64 p-3 bg-black border border-amber-500 rounded-sm shadow-2xl pointer-events-none"
            style={{ 
                left: Math.min(window.innerWidth - 270, mousePos.x + 15), 
                top: Math.min(window.innerHeight - 100, mousePos.y + 15) 
            }}
          >
            <div className="flex gap-2 items-center mb-2 border-b border-white/20 pb-1">
                <span className="text-2xl">{hoveredPerk.icon}</span>
                <div>
                    <div className="text-amber-500 font-bold text-sm">{hoveredPerk.name}</div>
                    <div className="text-[9px] text-slate-500 uppercase">Tier {hoveredPerk.tier}</div>
                </div>
            </div>
            <div className="text-xs text-slate-300 leading-relaxed">{hoveredPerk.description}</div>
          </div>
      )}

    </div>
  );
};

const StatBar = ({ label, val, max, stars = 0, color }: { label: string, val: number, max: number, stars?: number, color: string }) => {
    const pct = Math.min(100, (val / max) * 100);
    return (
        <div className="flex items-center text-xs gap-3">
            <span className="text-slate-500 w-12 shrink-0 text-right uppercase tracking-tighter">{label}</span>
            <div className="flex-1 h-2 bg-slate-800 rounded-sm relative overflow-hidden">
                <div className={`h-full rounded-sm ${color}`} style={{ width: `${pct}%` }} />
                {/* Tick marks or simple gradient overlay could go here */}
            </div>
            <div className="flex items-center w-12 shrink-0 justify-end gap-1">
                <span className="text-slate-200 font-mono font-bold">{val}</span>
                {stars > 0 && <span className="text-amber-500 text-[9px] tracking-tighter">{'★'.repeat(stars)}</span>}
            </div>
        </div>
    );
};

const FormationSlot = ({ index, merc, isSelected, onSelect, onDragStart, onDrop, onDragOver, label }: any) => {
    return (
        <div 
            className={`w-full h-full relative border border-white/5 bg-white/5 flex items-center justify-center
                ${!merc ? 'border-dashed' : 'border-solid'}
                ${isSelected ? 'ring-1 ring-amber-500' : ''}
            `}
            onDragOver={onDragOver}
            onDrop={(e) => onDrop(e, index)}
        >
            {merc ? (
                <div 
                    draggable
                    onDragStart={(e) => onDragStart(e, { type: 'ROSTER', index, char: merc })}
                    onClick={() => onSelect(merc)}
                    className="w-full h-full cursor-grab active:cursor-grabbing relative group"
                >
                    <Portrait character={merc} size="sm" className="w-full h-full border-none pointer-events-none" />
                    <div className="absolute bottom-0 left-0 w-full h-1 bg-black/50 pointer-events-none">
                        <div className="h-full bg-red-600" style={{ width: `${(merc.hp / merc.maxHp) * 100}%` }} />
                    </div>
                </div>
            ) : (
                <span className="text-[8px] text-slate-700 pointer-events-none">{label}</span>
            )}
        </div>
    );
};

const EquipSlot = ({ label, item, className = "", onHover, onDragStart, onDrop }: { 
    label: string, 
    item: Item | null, 
    className?: string, 
    onHover: (item: Item | null) => void,
    onDragStart: (e: React.DragEvent) => void,
    onDrop: (e: React.DragEvent) => void
}) => (
    <div 
        draggable={!!item}
        onDragStart={onDragStart}
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
        onDrop={onDrop}
        onMouseEnter={() => item && onHover(item)}
        onMouseLeave={() => onHover(null)}
        className={`w-16 h-16 bg-slate-900/80 border border-slate-700 flex flex-col items-center justify-center p-1 group relative cursor-pointer hover:border-amber-500 transition-colors shadow-lg ${className}`}
    >
        <span className="text-[8px] text-slate-600 uppercase absolute -top-4 left-0 w-full text-center">{label}</span>
        {item ? (
            <div className="w-full h-full p-1 group-hover:scale-110 transition-transform pointer-events-none">
                <ItemIcon item={item} showBackground={false} />
            </div>
        ) : (
            <span className="text-[9px] text-slate-800 italic uppercase pointer-events-none">空置</span>
        )}
    </div>
);
