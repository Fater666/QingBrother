
import React, { useState, useEffect } from 'react';
import { Party, Character, Item } from '../types.ts';
import { Portrait } from './Portrait.tsx';

interface SquadManagementProps {
  party: Party;
  onUpdateParty: (party: Party) => void;
  onClose: () => void;
}

// Drag Types
type DragSourceType = 'INVENTORY' | 'EQUIP_SLOT' | 'ROSTER' | 'RESERVE';

interface DragData {
    type: DragSourceType;
    index?: number; // For Inventory index
    slotType?: keyof Character['equipment']; // For Equip Slot
    formationIndex?: number; // For Formation (0-17)
    item?: Item; 
    char?: Character; 
}

const FORMATION_SIZE = 18; // 2 rows of 9

export const SquadManagement: React.FC<SquadManagementProps> = ({ party, onUpdateParty, onClose }) => {
  const [selectedMerc, setSelectedMerc] = useState<Character | null>(party.mercenaries[0] || null);
  
  // Drag State
  const [dragging, setDragging] = useState<DragData | null>(null);

  // Tooltip Logic
  const [hoveredItem, setHoveredItem] = useState<Item | null>(null);
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

      if ((dragging.type === 'INVENTORY' || dragging.type === 'EQUIP_SLOT') && dragging.item) {
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

              if (dragging.type === 'INVENTORY' && typeof dragging.index === 'number') {
                  newInventory.splice(dragging.index, 1);
              } else if (dragging.type === 'EQUIP_SLOT' && dragging.slotType) {
                  newEquip[dragging.slotType] = null;
              }

              if (oldItemAtSlot) {
                  newInventory.push(oldItemAtSlot);
              }

              newEquip[targetSlot] = newItem;
              party.inventory = newInventory;
              return { ...m, equipment: newEquip };
          });

          onUpdateParty({ ...party, mercenaries: newMercs });
          setSelectedMerc(newMercs.find(m => m.id === selectedMerc.id) || null);
      }
      setDragging(null);
  };

  const handleDropOnInventory = (e: React.DragEvent) => {
      e.preventDefault();
      if (!dragging) return;

      if (dragging.type === 'EQUIP_SLOT' && dragging.item && dragging.slotType && selectedMerc) {
          const newMercs = party.mercenaries.map(m => {
              if (m.id !== selectedMerc.id) return m;
              return {
                  ...m,
                  equipment: { ...m.equipment, [dragging.slotType!]: null }
              };
          });
          const newInventory = [...party.inventory, dragging.item];
          onUpdateParty({ ...party, mercenaries: newMercs, inventory: newInventory });
          setSelectedMerc(newMercs.find(m => m.id === selectedMerc.id) || null);
      }
      setDragging(null);
  };

  // --- Roster Management Handlers ---

  const moveCharacter = (charId: string, targetFormationIdx: number | null) => {
      // Check if target slot is occupied
      const targetChar = party.mercenaries.find(m => m.formationIndex === targetFormationIdx);
      
      const newMercs = party.mercenaries.map(m => {
          if (m.id === charId) {
              // Move source to target
              return { ...m, formationIndex: targetFormationIdx };
          }
          if (targetFormationIdx !== null && m.formationIndex === targetFormationIdx) {
               // Swap: Move target to source's old position?
               // Or simply swap logic. We need the source char to know its old pos.
               // Let's iterate differently.
               return m;
          }
          return m;
      });

      // Better Swap Logic outside map
      const sourceChar = party.mercenaries.find(m => m.id === charId);
      if(!sourceChar) return;

      const updatedMercs = party.mercenaries.map(m => {
           if (m.id === charId) return { ...m, formationIndex: targetFormationIdx };
           if (targetFormationIdx !== null && m.formationIndex === targetFormationIdx) {
               // Swapped char goes to source's old position (whether it was reserve null or formation number)
               return { ...m, formationIndex: sourceChar.formationIndex };
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
          // Move from formation to reserve
          moveCharacter(dragging.char.id, null);
      }
      setDragging(null);
  };

  const calculateTotalFatiguePenalty = (char: Character) => {
      return (char.equipment.armor?.maxFatiguePenalty || 0) + 
             (char.equipment.helmet?.maxFatiguePenalty || 0) + 
             (char.equipment.offHand?.fatigueCost || 0);
  };

  // Helpers to render grid
  const getFormationChar = (idx: number) => party.mercenaries.find(m => m.formationIndex === idx);
  const getReserves = () => party.mercenaries.filter(m => m.formationIndex === null || m.formationIndex === undefined);

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

      {/* Main Content - 4 Quadrants Grid */}
      <div className="flex-1 grid grid-cols-2 gap-4 overflow-hidden z-10 min-h-0">
        
        {/* Left Column: Character Inspector */}
        <div className="flex flex-col gap-4 min-h-0">
            
            {/* Top Left: Equipment (Cross Layout) */}
            <div className="flex-[0.8] bg-black/40 border border-white/5 rounded-sm p-4 relative shadow-inner flex items-center justify-center">
                {selectedMerc ? (
                    <div className="flex w-full h-full gap-8">
                         {/* Info Side */}
                         <div className="flex flex-col items-center justify-center gap-2 w-1/3">
                             <Portrait character={selectedMerc} size="lg" className="shadow-[0_0_20px_rgba(0,0,0,0.8)] border-amber-900/50" />
                             <div className="text-center">
                                 <h2 className="text-2xl font-bold text-slate-200">{selectedMerc.name}</h2>
                                 <p className="text-xs text-amber-700 italic">“{selectedMerc.background}” <span className="text-slate-500 ml-1">LV.{selectedMerc.level}</span></p>
                             </div>
                              {/* Derived Stats Mini */}
                            <div className="w-full mt-4 space-y-1 bg-black/20 p-2 rounded text-[10px] text-slate-400">
                                <div className="flex justify-between"><span>头盔耐久</span><span className="text-slate-200">{selectedMerc.equipment.helmet?.durability || 0}</span></div>
                                <div className="flex justify-between"><span>身甲耐久</span><span className="text-slate-200">{selectedMerc.equipment.armor?.durability || 0}</span></div>
                                <div className="flex justify-between"><span>负重惩罚</span><span className="text-red-400">-{calculateTotalFatiguePenalty(selectedMerc)}</span></div>
                            </div>
                         </div>

                         {/* Paper Doll Side (Cross Layout) */}
                         <div className="flex-1 flex items-center justify-center relative">
                             {/* Cross Structure Container */}
                             <div className="relative w-64 h-64">
                                  {/* Background Silhouette */}
                                  <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none">
                                      <div className="w-32 h-48 border-2 border-dashed border-slate-500 rounded-full" />
                                  </div>

                                  {/* Slots - Absolute positioning */}
                                  <div className="absolute top-0 left-1/2 -translate-x-1/2">
                                      <EquipSlot 
                                        label="头盔" 
                                        item={selectedMerc.equipment.helmet} 
                                        onHover={setHoveredItem} 
                                        onDragStart={(e) => handleDragStart(e, { type: 'EQUIP_SLOT', slotType: 'helmet', item: selectedMerc.equipment.helmet! })}
                                        onDrop={(e) => handleDropOnEquipSlot(e, 'helmet')}
                                      />
                                  </div>
                                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pt-8">
                                      <EquipSlot 
                                        label="身甲" 
                                        item={selectedMerc.equipment.armor} 
                                        onHover={setHoveredItem} 
                                        className="scale-125 z-10" 
                                        onDragStart={(e) => handleDragStart(e, { type: 'EQUIP_SLOT', slotType: 'armor', item: selectedMerc.equipment.armor! })}
                                        onDrop={(e) => handleDropOnEquipSlot(e, 'armor')}
                                      />
                                  </div>
                                  <div className="absolute top-1/2 left-4 -translate-y-1/2 pt-12">
                                      <EquipSlot 
                                        label="主手" 
                                        item={selectedMerc.equipment.mainHand} 
                                        onHover={setHoveredItem} 
                                        onDragStart={(e) => handleDragStart(e, { type: 'EQUIP_SLOT', slotType: 'mainHand', item: selectedMerc.equipment.mainHand! })}
                                        onDrop={(e) => handleDropOnEquipSlot(e, 'mainHand')}
                                      />
                                  </div>
                                  <div className="absolute top-1/2 right-4 -translate-y-1/2 pt-12">
                                      <EquipSlot 
                                        label="副手" 
                                        item={selectedMerc.equipment.offHand} 
                                        onHover={setHoveredItem} 
                                        onDragStart={(e) => handleDragStart(e, { type: 'EQUIP_SLOT', slotType: 'offHand', item: selectedMerc.equipment.offHand! })}
                                        onDrop={(e) => handleDropOnEquipSlot(e, 'offHand')}
                                      />
                                  </div>
                             </div>
                         </div>
                    </div>
                ) : (
                    <div className="text-slate-600 italic">选择一名成员以查看装备</div>
                )}
            </div>

            {/* Bottom Left: Attributes & Potential */}
            <div className="flex-1 bg-black/40 border border-white/5 rounded-sm p-4 overflow-y-auto">
                {selectedMerc ? (
                    <div>
                        <h3 className="text-[10px] text-amber-700 uppercase tracking-widest mb-3 border-b border-amber-900/20 pb-1">属性与潜力</h3>
                        <div className="grid grid-cols-2 gap-x-8 gap-y-2">
                             <StatRow label="生命 (HP)" val={selectedMerc.hp} max={selectedMerc.maxHp} stars={selectedMerc.stars.hp} />
                             <StatRow label="体力 (FAT)" val={selectedMerc.fatigue} max={selectedMerc.maxFatigue} stars={selectedMerc.stars.fatigue} subtext={`max: ${selectedMerc.maxFatigue}`} />
                             
                             <div className="col-span-2 h-px bg-white/5 my-1" />
                             
                             <StatRow label="胆识 (RES)" val={selectedMerc.stats.resolve} stars={selectedMerc.stars.resolve} />
                             <StatRow label="先手 (INIT)" val={selectedMerc.stats.initiative} stars={selectedMerc.stars.initiative} />
                             
                             <div className="col-span-2 h-px bg-white/5 my-1" />

                             <StatRow label="近战命中" val={selectedMerc.stats.meleeSkill} stars={selectedMerc.stars.meleeSkill} highlight />
                             <StatRow label="远程命中" val={selectedMerc.stats.rangedSkill} stars={selectedMerc.stars.rangedSkill} highlight />
                             <StatRow label="近战防御" val={selectedMerc.stats.meleeDefense} stars={selectedMerc.stars.meleeDefense} />
                             <StatRow label="远程防御" val={selectedMerc.stats.rangedDefense} stars={selectedMerc.stars.rangedDefense} />
                        </div>
                        
                        <div className="mt-6 border-t border-white/5 pt-2">
                             <h4 className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">生平经历</h4>
                             <p className="text-xs text-slate-400 italic leading-relaxed text-justify">
                                 {selectedMerc.backgroundStory}
                             </p>
                        </div>
                    </div>
                ) : (
                    <div className="text-center text-slate-600 italic mt-10">...</div>
                )}
            </div>
        </div>

        {/* Right Column: Inventory & Roster */}
        <div className="flex flex-col gap-4 min-h-0">
             
             {/* Top Right: Stash (Inventory) */}
             <div 
                className="flex-1 bg-black/40 border border-white/5 rounded-sm p-4 flex flex-col min-h-0"
                onDragOver={handleDragOver}
                onDrop={handleDropOnInventory}
             >
                 <h2 className="text-[10px] text-slate-500 uppercase tracking-widest mb-2 flex justify-between">
                     <span>战利品 & 物资</span>
                     <span>{party.inventory.length}/99</span>
                 </h2>
                 <div className="flex-1 overflow-y-auto pr-1">
                     <div className="grid grid-cols-6 gap-2">
                        {party.inventory.map((item, i) => (
                             <div 
                                key={item.id} 
                                draggable
                                onDragStart={(e) => handleDragStart(e, { type: 'INVENTORY', index: i, item })}
                                onMouseEnter={() => setHoveredItem(item)}
                                onMouseLeave={() => setHoveredItem(null)}
                                className="aspect-square bg-slate-900/80 border border-slate-800 hover:border-amber-500 transition-all p-1 flex items-center justify-center group relative cursor-grab active:cursor-grabbing"
                             >
                                <span className="text-xl">{item.name.includes('剑') ? '🗡️' : item.name.includes('盾') ? '🛡️' : '📦'}</span>
                             </div>
                        ))}
                        {Array.from({ length: Math.max(0, 24 - party.inventory.length) }).map((_, i) => (
                            <div key={i} className="aspect-square border border-dashed border-slate-800/30" />
                        ))}
                     </div>
                 </div>
             </div>

             {/* Bottom Right: Battle Formation & Reserves */}
             <div className="flex-[1.2] flex flex-col gap-2">
                 
                 {/* 1. Battle Formation Grid */}
                 <div 
                    className="flex-1 bg-black/40 border border-white/5 rounded-sm p-2 flex flex-col"
                 >
                     <h2 className="text-[10px] text-slate-500 uppercase tracking-widest mb-1 flex justify-between">
                         <span>作战阵型 (前排 / 后排)</span>
                         <span className="text-amber-600 text-[9px]">拖拽调整</span>
                     </h2>
                     {/* Rows */}
                     <div className="flex-1 flex flex-col gap-1 justify-center">
                         {/* Back Row (Indices 9-17) */}
                         <div className="grid grid-cols-9 gap-1">
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
                         <div className="grid grid-cols-9 gap-1">
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
                    className="h-24 bg-black/40 border border-white/5 rounded-sm p-2 flex flex-col"
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

      {/* Global Fixed Tooltip */}
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

    </div>
  );
};

const FormationSlot = ({ index, merc, isSelected, onSelect, onDragStart, onDrop, onDragOver, label }: any) => {
    return (
        <div 
            className={`aspect-square relative border border-white/5 bg-white/5 flex items-center justify-center
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

const StatRow = ({ label, val, max, stars = 0, subtext, highlight = false }: { label: string, val: number, max?: number, stars?: number, subtext?: string, highlight?: boolean }) => (
    <div className={`flex justify-between items-end border-b border-white/5 pb-1 ${highlight ? 'text-amber-100' : 'text-slate-300'}`}>
        <span className="text-xs text-slate-500 tracking-tighter uppercase">{label}</span>
        <div className="text-right flex items-center gap-2">
            <span className="text-xs text-amber-500 tracking-widest text-[8px]">{stars > 0 ? '★'.repeat(stars) : ''}</span>
            <div className="leading-none">
                <span className="font-mono font-bold text-sm">{val}</span>
                {max !== undefined && <span className="text-[10px] text-slate-500 ml-1">/{max}</span>}
            </div>
        </div>
    </div>
);

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
            <div className="text-[10px] text-center text-amber-500 font-bold leading-tight uppercase group-hover:scale-110 transition-transform pointer-events-none">
                {item.name}
            </div>
        ) : (
            <span className="text-[9px] text-slate-800 italic uppercase pointer-events-none">空置</span>
        )}
    </div>
);
