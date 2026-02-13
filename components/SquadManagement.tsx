
import React, { useState, useEffect, useMemo } from 'react';
import { Party, Character, Item, Perk, Trait } from '../types.ts';
import { BACKGROUNDS, PERK_TREE, TRAIT_TEMPLATES, getXPForNextLevel } from '../constants';

interface SquadManagementProps {
  party: Party;
  onUpdateParty: (party: Party) => void;
  onClose: () => void;
  onTriggerTip?: (tipId: string) => void;
}

type DragSourceType = 'INVENTORY' | 'EQUIP_SLOT' | 'BAG_SLOT' | 'ROSTER';

interface DragData {
    type: DragSourceType;
    index?: number;
    slotType?: keyof Character['equipment'];
    item?: Item; 
    char?: Character;
}

interface TouchFormationDragState {
    charId: string;
    charName: string;
    sourceIndex: number | null;
    x: number;
    y: number;
    overIndex: number | null;
    overReserve: boolean;
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

// 检查物品是否可以装备到指定槽位（支持双手武器限制）
const canEquipToSlot = (item: Item, slot: keyof Character['equipment'], char?: Character): boolean => {
    // 双手武器不可放到副手
    if (slot === 'offHand' && item.twoHanded) return false;
    // 主手已装备双手武器时，副手不可装备
    if (slot === 'offHand' && char?.equipment.mainHand?.twoHanded) return false;

    const slotTypeMap: Record<keyof Character['equipment'], Item['type'][]> = {
        mainHand: ['WEAPON'],
        offHand: ['SHIELD'], // 仅允许盾牌，禁止双持武器
        armor: ['ARMOR'],
        helmet: ['HELMET'],
        ammo: ['AMMO'],
        accessory: ['ACCESSORY']
    };
    return slotTypeMap[slot].includes(item.type);
};

export const SquadManagement: React.FC<SquadManagementProps> = ({ party, onUpdateParty, onClose, onTriggerTip }) => {
  const [selectedMerc, setSelectedMerc] = useState<Character | null>(party.mercenaries[0] || null);
  const [rightTab, setRightTab] = useState<'STASH' | 'PERKS' | 'FORMATION'>('STASH');
  const [hoveredItem, setHoveredItem] = useState<Item | null>(null);
  const [hoveredPerk, setHoveredPerk] = useState<Perk | null>(null);
  const [selectedTraitId, setSelectedTraitId] = useState<string | null>(null);

  // 玩法提示：首次打开队伍管理
  useEffect(() => {
    onTriggerTip?.('squad_first_open');
  }, []);
  const [selectedStashItem, setSelectedStashItem] = useState<{ item: Item, index: number } | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isMobileLayout, setIsMobileLayout] = useState(false);
  const [touchFormationDrag, setTouchFormationDrag] = useState<TouchFormationDragState | null>(null);
  const selectedTrait: Trait | null = selectedTraitId ? (TRAIT_TEMPLATES[selectedTraitId] || null) : null;

  // 分离出战阵中和后备队伍的人员
  const activeRoster = useMemo(() => party.mercenaries.filter(m => m.formationIndex !== null), [party.mercenaries]);
  const reserveRoster = useMemo(() => party.mercenaries.filter(m => m.formationIndex === null), [party.mercenaries]);

  useEffect(() => {
      const handleMouseMove = (e: MouseEvent) => setMousePos({ x: e.clientX, y: e.clientY });
      window.addEventListener('mousemove', handleMouseMove);
      return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  useEffect(() => {
      const detectMobileLayout = () => {
          const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
          setIsMobileLayout(coarsePointer || window.innerWidth < 1024);
      };
      detectMobileLayout();
      window.addEventListener('resize', detectMobileLayout);
      return () => window.removeEventListener('resize', detectMobileLayout);
  }, []);

  useEffect(() => {
      setSelectedTraitId(null);
  }, [selectedMerc?.id]);

  const handleDragStart = (e: React.DragEvent, data: DragData) => {
      e.dataTransfer.setData('text/plain', JSON.stringify(data));
  };

  const handleDropOnEquip = (e: React.DragEvent, slot: keyof Character['equipment']) => {
      e.preventDefault();
      const dataStr = e.dataTransfer.getData('text/plain');
      if (!dataStr) return;
      const data: DragData = JSON.parse(dataStr);
      if (!data.item || !selectedMerc) return;
      
      // 验证物品类型是否匹配槽位（含双手武器限制）
      if (!canEquipToSlot(data.item, slot, selectedMerc)) return;
      
      let newInv = [...party.inventory];
      
      const newMercs = party.mercenaries.map(m => {
          if (m.id !== selectedMerc.id) return m;
          const newEquip = { ...m.equipment };
          const old = newEquip[slot];
          
          if (data.type === 'INVENTORY') newInv.splice(data.index!, 1);
          if (old) newInv.push(old);
          newEquip[slot] = data.item!;
          // 双手武器装备到主手时，自动卸下副手
          if (slot === 'mainHand' && data.item!.twoHanded && newEquip.offHand) {
              newInv.push(newEquip.offHand);
              newEquip.offHand = null;
          }
          return { ...m, equipment: newEquip };
      });
      onUpdateParty({ ...party, mercenaries: newMercs, inventory: newInv });
      setSelectedMerc(newMercs.find(m => m.id === selectedMerc.id)!);
      setSelectedStashItem(null);
  };

  // 点击式装备
  const handleEquipFromStash = (slot: keyof Character['equipment']) => {
      if (!selectedStashItem || !selectedMerc) return;
      
      // 验证物品类型是否匹配槽位（含双手武器限制）
      if (!canEquipToSlot(selectedStashItem.item, slot, selectedMerc)) return;
      
      let newInv = [...party.inventory];

      const newMercs = party.mercenaries.map(m => {
          if (m.id !== selectedMerc.id) return m;
          const newEquip = { ...m.equipment };
          const old = newEquip[slot];
          
          newInv.splice(selectedStashItem.index, 1);
          if (old) newInv.push(old);
          newEquip[slot] = selectedStashItem.item;
          // 双手武器装备到主手时，自动卸下副手
          if (slot === 'mainHand' && selectedStashItem.item.twoHanded && newEquip.offHand) {
              newInv.push(newEquip.offHand);
              newEquip.offHand = null;
          }
          return { ...m, equipment: newEquip };
      });
      onUpdateParty({ ...party, mercenaries: newMercs, inventory: newInv });
      setSelectedMerc(newMercs.find(m => m.id === selectedMerc.id)!);
      setSelectedStashItem(null);
  };

  // 双击自动穿戴逻辑
  const handleDoubleClickStashItem = (item: Item, index: number) => {
    if (!selectedMerc) return;
    
    let targetSlot: keyof Character['equipment'] | null = null;
    if (item.type === 'HELMET') targetSlot = 'helmet';
    else if (item.type === 'ARMOR') targetSlot = 'armor';
    else if (item.type === 'WEAPON') targetSlot = 'mainHand';
    else if (item.type === 'SHIELD') targetSlot = 'offHand';
    else if (item.type === 'AMMO') targetSlot = 'ammo';
    else if (item.type === 'ACCESSORY') targetSlot = 'accessory';
    
    if (targetSlot && canEquipToSlot(item, targetSlot, selectedMerc)) {
        let newInv = [...party.inventory];
        const newMercs = party.mercenaries.map(m => {
            if (m.id !== selectedMerc.id) return m;
            const newEquip = { ...m.equipment };
            const old = newEquip[targetSlot!];
            
            newInv.splice(index, 1);
            if (old) newInv.push(old);
            newEquip[targetSlot!] = item;
            
            if (targetSlot === 'mainHand' && item.twoHanded && newEquip.offHand) {
                newInv.push(newEquip.offHand);
                newEquip.offHand = null;
            }
            return { ...m, equipment: newEquip };
        });
        onUpdateParty({ ...party, mercenaries: newMercs, inventory: newInv });
        setSelectedMerc(newMercs.find(m => m.id === selectedMerc.id)!);
        setSelectedStashItem(null);
    }
  };

  // 卸下装备到仓库
  const handleUnequip = (slot: keyof Character['equipment']) => {
      if (!selectedMerc) return;
      const item = selectedMerc.equipment[slot];
      if (!item) return;
      
      const newMercs = party.mercenaries.map(m => {
          if (m.id !== selectedMerc.id) return m;
          const newEquip = { ...m.equipment };
          newEquip[slot] = null;
          return { ...m, equipment: newEquip };
      });
      onUpdateParty({ 
          ...party, 
          mercenaries: newMercs,
          inventory: [...party.inventory, item]
      });
      setSelectedMerc(newMercs.find(m => m.id === selectedMerc.id)!);
  };

  // 将角色加入战阵（找第一个空位）
  const getFirstFreeFormationSlot = () => {
      const usedSlots = party.mercenaries
          .filter(m => m.formationIndex !== null)
          .map(m => m.formationIndex);
      for (let i = 0; i < 18; i++) {
          if (!usedSlots.includes(i)) return i;
      }
      return null;
  };

  const applyFormationMove = (draggedCharId: string, targetIndex: number | null) => {
      const draggedMerc = party.mercenaries.find(m => m.id === draggedCharId);
      if (!draggedMerc) return;
      const sourceIndex = draggedMerc.formationIndex ?? null;

      // 拖回后备区
      if (targetIndex === null) {
          if (sourceIndex === null) return;
          const newMercs = party.mercenaries.map(m => m.id === draggedCharId ? { ...m, formationIndex: null } : m);
          onUpdateParty({ ...party, mercenaries: newMercs });
          return;
      }

      if (sourceIndex === targetIndex) return;
      const occupantChar = party.mercenaries.find(m => m.formationIndex === targetIndex);
      const newMercs = party.mercenaries.map(m => {
          if (m.id === draggedCharId) return { ...m, formationIndex: targetIndex };
          if (occupantChar && m.id === occupantChar.id) return { ...m, formationIndex: sourceIndex };
          return m;
      });
      onUpdateParty({ ...party, mercenaries: newMercs });
  };

  const updateTouchFormationHover = (clientX: number, clientY: number) => {
      const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
      const slotEl = el?.closest('[data-formation-slot]') as HTMLElement | null;
      const reserveEl = el?.closest('[data-formation-reserve-dropzone="true"]') as HTMLElement | null;
      const rawSlot = slotEl?.dataset.formationSlot;
      const overIndex = rawSlot !== undefined ? Number(rawSlot) : null;
      setTouchFormationDrag(prev => {
          if (!prev) return prev;
          return {
              ...prev,
              x: clientX,
              y: clientY,
              overIndex: Number.isInteger(overIndex) ? overIndex : null,
              overReserve: !!reserveEl,
          };
      });
  };

  const handleFormationTouchStart = (e: React.TouchEvent, char: Character) => {
      if (!isMobileLayout) return;
      const t = e.touches[0];
      if (!t) return;
      setTouchFormationDrag({
          charId: char.id,
          charName: char.name,
          sourceIndex: char.formationIndex ?? null,
          x: t.clientX,
          y: t.clientY,
          overIndex: char.formationIndex ?? null,
          overReserve: char.formationIndex === null,
      });
  };

  const handleFormationTouchMove = (e: React.TouchEvent) => {
      if (!touchFormationDrag) return;
      const t = e.touches[0];
      if (!t) return;
      e.preventDefault();
      updateTouchFormationHover(t.clientX, t.clientY);
  };

  const handleFormationTouchEnd = () => {
      if (!touchFormationDrag) return;
      if (touchFormationDrag.overIndex !== null) {
          applyFormationMove(touchFormationDrag.charId, touchFormationDrag.overIndex);
      } else if (touchFormationDrag.overReserve) {
          applyFormationMove(touchFormationDrag.charId, null);
      }
      setTouchFormationDrag(null);
  };

  const handleAddToFormation = (char: Character) => {
      const freeSlot = getFirstFreeFormationSlot();
      if (freeSlot === null) return; // 没有空位
      applyFormationMove(char.id, freeSlot);
  };

  // 将角色移出战阵
  const handleRemoveFromFormation = (char: Character) => {
      applyFormationMove(char.id, null);
  };

  // --- 学习专精 ---
  const handleLearnPerk = (perkId: string) => {
    if (!selectedMerc) return;
    const perk = PERK_TREE[perkId];
    if (!perk) return;
    if (selectedMerc.perks.includes(perkId)) return;
    if (selectedMerc.perkPoints <= 0) return;
    if (selectedMerc.level < perk.tier) return;
    
    const newMercs = party.mercenaries.map(m => {
      if (m.id !== selectedMerc.id) return m;
      return {
        ...m,
        perks: [...m.perks, perkId],
        perkPoints: m.perkPoints - 1,
      };
    });
    const updatedParty = { ...party, mercenaries: newMercs };
    onUpdateParty(updatedParty);
    setSelectedMerc(newMercs.find(m => m.id === selectedMerc.id)!);
  };

  // 医药和修甲材料现在是数值资源池（类似粮食），每天自动消耗

  const perkTreeTiers = useMemo(() => {
      const tiers: Perk[][] = Array.from({ length: 7 }, () => []);
      Object.values(PERK_TREE).forEach(perk => {
          if (perk.tier >= 1 && perk.tier <= 7) tiers[perk.tier - 1].push(perk);
      });
      return tiers;
  }, []);

  return (
    <div className="w-full h-full bg-[#0a0908] flex flex-col font-serif select-none overflow-hidden relative">
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
      <div className="min-h-14 bg-gradient-to-r from-[#1a1410] via-[#0d0b09] to-[#1a1410] border-b border-amber-900/50 flex flex-wrap lg:flex-nowrap items-center justify-between gap-3 px-3 md:px-8 py-2 lg:py-0 z-30 shrink-0">
          <div className="flex items-center gap-3 md:gap-6 min-w-0">
              <h1 className="text-lg md:text-2xl font-bold text-amber-600 tracking-[0.18em] md:tracking-[0.3em] shrink-0">战团营地</h1>
              {selectedMerc && (
                  <div className="flex items-center gap-1.5 md:gap-2 text-xs md:text-sm min-w-0">
                      <span className="text-slate-600">/</span>
                      <span className="text-amber-500 font-bold truncate max-w-[96px] md:max-w-none">{selectedMerc.name}</span>
                      <span className="text-slate-600 text-[10px] md:text-xs truncate max-w-[120px] md:max-w-none">({selectedMerc.background})</span>
                  </div>
              )}
          </div>
          <div className="flex items-center gap-3 md:gap-6">
              <div className="text-right shrink-0">
                  <span className="text-[10px] text-slate-600 uppercase tracking-widest block">战团资金</span>
                  <span className="text-amber-500 font-bold font-mono">{party.gold} <span className="text-amber-700 text-xs">金</span></span>
              </div>
              <button onClick={onClose} className="px-3 md:px-6 py-2 bg-[#1a1410] border border-amber-900/40 hover:border-amber-600 text-[10px] md:text-xs text-slate-400 hover:text-amber-500 uppercase tracking-widest transition-all">
                  返回地图
              </button>
          </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden z-10">
        
        {/* LEFT COLUMN: Inspector (Equipment on top, Stats below - Battle Brothers style) */}
        <div className="w-full lg:w-[420px] lg:border-r border-b lg:border-b-0 border-amber-900/30 bg-gradient-to-b from-[#0d0b08] to-[#080705] flex flex-col shrink-0 overflow-hidden">
            {selectedMerc ? (
                <div className="flex flex-col h-full overflow-y-auto custom-scrollbar">
                    {/* Character Header - Compact */}
                    <div className="p-4 border-b border-amber-900/30 bg-gradient-to-r from-amber-950/10 to-transparent">
                        <div className="flex justify-between items-center">
                            <div>
                                <h2 className="text-2xl font-bold text-amber-100 tracking-wide">{selectedMerc.name}</h2>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className="text-amber-700 text-sm">{selectedMerc.background}</span>
                                    <span className="text-slate-600">·</span>
                                    <span className="text-slate-400 text-sm">Lv.<span className="text-amber-500 font-bold">{selectedMerc.level}</span> <span className="text-slate-500 font-mono text-xs">({selectedMerc.xp}/{getXPForNextLevel(selectedMerc.level)} 经验)</span></span>
                                    <span className="text-slate-600">·</span>
                                    <span className="text-slate-500 text-xs">日薪 {selectedMerc.salary}</span>
                                </div>
                            </div>
                            <span className={`text-[10px] px-2 py-1 border ${selectedMerc.formationIndex !== null ? 'text-emerald-500 border-emerald-900/50 bg-emerald-950/20' : 'text-slate-500 border-slate-800 bg-slate-900/20'}`}>
                                {selectedMerc.formationIndex !== null ? '出战' : '后备'}
                            </span>
                        </div>
                    </div>

                    {/* Traits Section - 特质标签（使用 onTouchEnd tap 检测，兼容 Android WebView 滚动容器） */}
                    {selectedMerc.traits && selectedMerc.traits.length > 0 && (
                        <div className="px-4 py-2 border-b border-amber-900/20">
                            <div className="flex flex-wrap gap-1.5">
                                {selectedMerc.traits.map(tid => {
                                    const trait = TRAIT_TEMPLATES[tid];
                                    if (!trait) return null;
                                    const isPositive = trait.type === 'positive';
                                    return (
                                        <span
                                            key={tid}
                                            role="button"
                                            className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded border ${
                                                selectedTraitId === tid
                                                    ? 'ring-1 ring-amber-500 '
                                                    : ''
                                            }${
                                                isPositive
                                                    ? 'text-emerald-300 bg-emerald-950/40 border-emerald-800/50'
                                                    : 'text-red-300 bg-red-950/40 border-red-800/50'
                                            }`}
                                            onTouchStart={(e) => {
                                                const t = e.touches[0];
                                                (e.currentTarget as any)._tapX = t.clientX;
                                                (e.currentTarget as any)._tapY = t.clientY;
                                            }}
                                            onTouchEnd={(e) => {
                                                const el = e.currentTarget as any;
                                                const ct = e.changedTouches[0];
                                                const dx = ct.clientX - (el._tapX || 0);
                                                const dy = ct.clientY - (el._tapY || 0);
                                                if (Math.abs(dx) < 15 && Math.abs(dy) < 15) {
                                                    e.preventDefault();
                                                    setHoveredItem(null);
                                                    setHoveredPerk(null);
                                                    setSelectedTraitId(prev => prev === tid ? null : tid);
                                                }
                                            }}
                                            onClick={() => {
                                                setHoveredItem(null);
                                                setHoveredPerk(null);
                                                setSelectedTraitId(prev => prev === tid ? null : tid);
                                            }}
                                        >
                                            <span>{trait.icon}</span>
                                            <span>{trait.name}</span>
                                        </span>
                                    );
                                })}
                            </div>
                            {selectedTrait && (
                                <div className="mt-2 px-3 py-2 bg-black/70 border border-amber-900/40 rounded text-xs text-slate-300">
                                    <div className="font-bold text-amber-400 mb-1">{selectedTrait.icon} {selectedTrait.name}</div>
                                    <div>{selectedTrait.description}</div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Equipment Section - Paper Doll Layout (人形布局) */}
                    <div className="p-4 border-b border-amber-900/20">
                        <h3 className="text-[10px] text-amber-700 uppercase tracking-[0.2em] mb-3 pb-1 border-b border-amber-900/20">随身装备</h3>
                        {/* 
                            布局：类似人的位置
                                 [头盔]
                            [主手][身甲][副手]
                            [弹药]     [饰品]
                        */}
                        <div className="grid grid-cols-3 gap-2">
                            {/* Row 1: 头盔居中 */}
                            <div /> {/* 左空 */}
                            <EquipSlotText 
                                label="头盔" 
                                item={selectedMerc.equipment.helmet}
                                onHover={setHoveredItem}
                                onClick={() => selectedStashItem ? handleEquipFromStash('helmet') : handleUnequip('helmet')}
                                onDrop={(e) => handleDropOnEquip(e, 'helmet')}
                                isTarget={!!selectedStashItem && canEquipToSlot(selectedStashItem.item, 'helmet', selectedMerc)}
                            />
                            <div /> {/* 右空 */}
                            
                            {/* Row 2: 主手 | 身甲 | 副手 */}
                            <EquipSlotText 
                                label="主手" 
                                item={selectedMerc.equipment.mainHand}
                                onHover={setHoveredItem}
                                onClick={() => selectedStashItem ? handleEquipFromStash('mainHand') : handleUnequip('mainHand')}
                                onDrop={(e) => handleDropOnEquip(e, 'mainHand')}
                                isTarget={!!selectedStashItem && canEquipToSlot(selectedStashItem.item, 'mainHand', selectedMerc)}
                            />
                            <EquipSlotText 
                                label="身甲" 
                                item={selectedMerc.equipment.armor}
                                onHover={setHoveredItem}
                                onClick={() => selectedStashItem ? handleEquipFromStash('armor') : handleUnequip('armor')}
                                onDrop={(e) => handleDropOnEquip(e, 'armor')}
                                isTarget={!!selectedStashItem && canEquipToSlot(selectedStashItem.item, 'armor', selectedMerc)}
                            />
                            <EquipSlotText 
                                label="副手" 
                                item={selectedMerc.equipment.offHand}
                                onHover={setHoveredItem}
                                onClick={() => selectedStashItem ? handleEquipFromStash('offHand') : handleUnequip('offHand')}
                                onDrop={(e) => handleDropOnEquip(e, 'offHand')}
                                isTarget={!!selectedStashItem && canEquipToSlot(selectedStashItem.item, 'offHand', selectedMerc)}
                                locked={!!selectedMerc.equipment.mainHand?.twoHanded}
                            />
                            
                            {/* Row 3: 弹药 | 空 | 饰品 */}
                            <EquipSlotText 
                                label="弹药" 
                                item={selectedMerc.equipment.ammo}
                                onHover={setHoveredItem}
                                onClick={() => selectedStashItem ? handleEquipFromStash('ammo') : handleUnequip('ammo')}
                                onDrop={(e) => handleDropOnEquip(e, 'ammo')}
                                isTarget={!!selectedStashItem && canEquipToSlot(selectedStashItem.item, 'ammo', selectedMerc)}
                            />
                            <div /> {/* 中空 */}
                            <EquipSlotText 
                                label="饰品" 
                                item={selectedMerc.equipment.accessory}
                                onHover={setHoveredItem}
                                onClick={() => selectedStashItem ? handleEquipFromStash('accessory') : handleUnequip('accessory')}
                                onDrop={(e) => handleDropOnEquip(e, 'accessory')}
                                isTarget={!!selectedStashItem && canEquipToSlot(selectedStashItem.item, 'accessory', selectedMerc)}
                            />
                        </div>
                    </div>

                    {/* === 行军被动效果状态面板 === */}
                    <div className="px-4 pb-2 space-y-2">
                        {/* 生命恢复状态 */}
                        {selectedMerc.hp < selectedMerc.maxHp && (
                            <div className="border border-red-900/30 bg-red-950/10 p-3">
                                {(() => {
                                    const hasMedicine = party.medicine >= 5;
                                    const totalHealStr = hasMedicine ? '6~7' : '1~2';
                                    return (
                                        <>
                                            <h4 className="text-[10px] text-red-600 uppercase tracking-[0.2em] mb-2">
                                                生命恢复中 <span className="text-red-800 normal-case">
                                                    （{selectedMerc.name} {selectedMerc.hp}/{selectedMerc.maxHp} HP，每天 +{totalHealStr}{hasMedicine ? '，含医药加成' : '，无医药'}）
                                                </span>
                                            </h4>
                                            <div className="flex items-center gap-2">
                                                <div className="flex-1 h-2 bg-black/60 border border-white/5 overflow-hidden">
                                                    <div className="h-full bg-red-700" style={{ width: `${(selectedMerc.hp / selectedMerc.maxHp) * 100}%` }} />
                                                </div>
                                                <span className="text-[10px] text-red-500 font-mono whitespace-nowrap">{selectedMerc.hp}/{selectedMerc.maxHp}</span>
                                            </div>
                                        </>
                                    );
                                })()}
                            </div>
                        )}

                        {/* 装备修复状态提示 */}
                        {(() => {
                            const damagedSlots: { item: Item }[] = [];
                            (['armor', 'helmet', 'offHand', 'mainHand'] as (keyof Character['equipment'])[]).forEach(slot => {
                                const eq = selectedMerc.equipment[slot];
                                if (eq && eq.maxDurability > 0 && eq.durability < eq.maxDurability) {
                                    damagedSlots.push({ item: eq });
                                }
                            });
                            if (damagedSlots.length === 0) return null;
                            const hasRepairSupplies = party.repairSupplies >= 3;
                            const repairRate = hasRepairSupplies ? 10 : 2;
                            return (
                                <div className="border border-amber-900/30 bg-amber-950/10 p-3">
                                    <h4 className="text-[10px] text-amber-600 uppercase tracking-[0.2em] mb-2">
                                        装备修复中 <span className="text-amber-800 normal-case">（每件每天 +{repairRate} 耐久{hasRepairSupplies ? '，含修甲材料加成' : '，无修甲材料'}）</span>
                                    </h4>
                                    {damagedSlots.map(({ item: eq }, idx) => {
                                        const durPct = (eq.durability / eq.maxDurability) * 100;
                                        return (
                                            <div key={idx} className="flex items-center gap-2 mb-1.5 last:mb-0">
                                                <span className="text-xs text-slate-400 w-24 truncate">{eq.name}</span>
                                                <div className="flex-1 h-1.5 bg-black/60 border border-white/5 overflow-hidden">
                                                    <div className={`h-full ${durPct > 50 ? 'bg-slate-600' : durPct > 25 ? 'bg-amber-700' : 'bg-red-700'}`} style={{ width: `${durPct}%` }} />
                                                </div>
                                                <span className="text-[10px] text-slate-500 font-mono whitespace-nowrap">{eq.durability}/{eq.maxDurability}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            );
                        })()}
                    </div>

                    {/* Attributes Panel - BELOW, Two columns, Battle Brothers order */}
                    <div className="p-4 flex-1">
                        <h3 className="text-[10px] text-amber-700 uppercase tracking-[0.2em] mb-3 pb-1 border-b border-amber-900/20">
                            人物属性
                        </h3>
                        
                        {/* All stats in 2-column grid, Battle Brothers order:
                            生命 | 体力
                            胆识 | 先手
                            近战命中 | 远程命中
                            近战防御 | 远程防御
                        */}
                        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                            {/* Row 1: 生命 | 体力 */}
                            <StatBarCompact 
                                label="生命值" 
                                val={selectedMerc.hp} 
                                maxPossible={120}
                                stars={selectedMerc.stars.hp}
                                colorBar="bg-red-800"
                                colorText="text-red-400"
                            />
                            <StatBarCompact 
                                label="体力值" 
                                val={selectedMerc.maxFatigue} 
                                maxPossible={150}
                                stars={selectedMerc.stars.fatigue}
                                colorBar="bg-sky-800"
                                colorText="text-sky-400"
                            />
                            
                            {/* Row 2: 胆识 | 先手 */}
                            <StatBarCompact 
                                label="胆识" 
                                val={selectedMerc.stats.resolve} 
                                maxPossible={100}
                                stars={selectedMerc.stars.resolve}
                                colorBar="bg-purple-800"
                                colorText="text-purple-400"
                            />
                            <StatBarCompact 
                                label="先手值" 
                                val={selectedMerc.stats.initiative} 
                                maxPossible={160}
                                stars={selectedMerc.stars.initiative}
                                colorBar="bg-emerald-800"
                                colorText="text-emerald-400"
                            />
                            
                            {/* Row 3: 近战命中 | 远程命中 */}
                            <StatBarCompact 
                                label="近战命中" 
                                val={selectedMerc.stats.meleeSkill}
                                maxPossible={100}
                                stars={selectedMerc.stars.meleeSkill}
                                colorBar="bg-amber-700"
                                colorText="text-amber-400"
                            />
                            <StatBarCompact 
                                label="远程命中" 
                                val={selectedMerc.stats.rangedSkill}
                                maxPossible={100}
                                stars={selectedMerc.stars.rangedSkill}
                                colorBar="bg-orange-700"
                                colorText="text-orange-400"
                            />
                            
                            {/* Row 4: 近战防御 | 远程防御 */}
                            <StatBarCompact 
                                label="近战防御" 
                                val={selectedMerc.stats.meleeDefense}
                                maxPossible={50}
                                stars={selectedMerc.stars.meleeDefense}
                                colorBar="bg-slate-600"
                                colorText="text-slate-300"
                            />
                            <StatBarCompact 
                                label="远程防御" 
                                val={selectedMerc.stats.rangedDefense}
                                maxPossible={50}
                                stars={selectedMerc.stars.rangedDefense}
                                colorBar="bg-slate-600"
                                colorText="text-slate-300"
                            />
                        </div>

                        {/* Background Story - at bottom */}
                        <div className="mt-4 pt-3 border-t border-amber-900/20">
                            <p className="text-[10px] text-slate-600 leading-relaxed italic">
                                「{selectedMerc.backgroundStory}」
                            </p>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-700 italic px-10 text-center">
                    <div className="text-4xl text-slate-800 mb-4">?</div>
                    <p className="text-sm">从右侧名录中选择</p>
                    <p className="text-sm">一名战友以查看详情</p>
                </div>
            )}
        </div>

        {/* RIGHT COLUMN: 仓库物资 / 专精技能 / 战阵布置 同层级 Tab */}
        <div className="flex-1 flex flex-col overflow-hidden min-h-0">
            <div className="flex-1 flex flex-col min-h-0 bg-[#080705]">
                <div className="flex h-11 border-b border-amber-900/30 bg-[#0d0b08] shrink-0">
                    <button 
                        onClick={() => { setRightTab('STASH'); setSelectedStashItem(null); }} 
                        className={`px-3 sm:px-6 md:px-8 text-[11px] md:text-xs uppercase font-bold tracking-[0.12em] md:tracking-[0.15em] transition-all border-b-2 ${rightTab === 'STASH' ? 'text-amber-500 border-amber-600 bg-amber-950/10' : 'text-slate-600 border-transparent hover:text-slate-400'}`}
                    >
                        仓库物资
                    </button>
                    <button 
                        onClick={() => { setRightTab('PERKS'); setSelectedStashItem(null); }} 
                        className={`px-3 sm:px-6 md:px-8 text-[11px] md:text-xs uppercase font-bold tracking-[0.12em] md:tracking-[0.15em] transition-all border-b-2 ${rightTab === 'PERKS' ? 'text-amber-500 border-amber-600 bg-amber-950/10' : 'text-slate-600 border-transparent hover:text-slate-400'}`}
                    >
                        专精技能
                    </button>
                    <button 
                        onClick={() => { setRightTab('FORMATION'); setSelectedStashItem(null); }} 
                        className={`px-3 sm:px-6 md:px-8 text-[11px] md:text-xs uppercase font-bold tracking-[0.12em] md:tracking-[0.15em] transition-all border-b-2 ${rightTab === 'FORMATION' ? 'text-amber-500 border-amber-600 bg-amber-950/10' : 'text-slate-600 border-transparent hover:text-slate-400'}`}
                    >
                        战阵布置
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar min-h-0">
                    {rightTab === 'STASH' ? (
                        <div>
                            {party.inventory.length > 0 ? (
                                <div className="grid grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-2">
                                    {party.inventory.map((item, i) => (
                                        <div 
                                            key={`${item.id}-${i}`}
                                            draggable
                                            onDragStart={(e) => handleDragStart(e, { type: 'INVENTORY', index: i, item })}
                                            onClick={() => setSelectedStashItem(selectedStashItem?.index === i ? null : { item, index: i })}
                                            onDoubleClick={() => handleDoubleClickStashItem(item, i)}
                                            onMouseEnter={() => setHoveredItem(item)}
                                            onMouseLeave={() => setHoveredItem(null)}
                                            className={`aspect-square p-2 border cursor-pointer transition-all flex flex-col items-center justify-center text-center ${
                                                selectedStashItem?.index === i 
                                                    ? 'bg-amber-900/30 border-amber-500 shadow-lg' 
                                                    : 'bg-black/40 border-slate-800 hover:border-amber-700 hover:bg-black/60'
                                            }`}
                                        >
                                            <span className={`text-xs font-bold leading-tight ${selectedStashItem?.index === i ? 'text-amber-300' : 'text-slate-300'}`}>{item.name}</span>
                                            <span className="text-[9px] text-slate-600 mt-0.5">{getItemTypeName(item.type)}</span>
                                            <span className="text-[10px] text-amber-700 font-mono mt-1">{item.value}</span>
                                        </div>
                                    ))}
                                    {Array.from({ length: Math.max(0, 24 - party.inventory.length) }).map((_, i) => (
                                        <div key={`empty-${i}`} className="aspect-square border border-slate-800/30 bg-black/20" />
                                    ))}
                                </div>
                            ) : (
                                <div className="py-12 text-center text-slate-700 italic">
                                    <p>仓库空空如也</p>
                                    <p className="text-xs mt-1">在市集购买物资，或从战场缴获</p>
                                </div>
                            )}
                            {selectedStashItem && (
                                <div className="mt-4 p-3 bg-amber-950/20 border border-amber-900/30 text-xs text-amber-600">
                                    已选中「{selectedStashItem.item.name}」— 点击左侧装备槽进行装备
                                </div>
                            )}
                        </div>
                    ) : rightTab === 'FORMATION' ? (
                        <div
                            className="flex flex-col gap-4 min-h-0"
                            onTouchMove={handleFormationTouchMove}
                            onTouchEnd={handleFormationTouchEnd}
                            onTouchCancel={handleFormationTouchEnd}
                        >
                            {/* Formation Grid */}
                            <div className="flex-1 min-h-0">
                                <div className="flex justify-between items-center mb-2">
                                    <h3 className="text-xs font-bold text-amber-700 uppercase tracking-[0.2em]">战阵布署</h3>
                                    <span className="text-[10px] text-slate-600 text-right">
                                        出战 {activeRoster.length}/12 人
                                        {isMobileLayout ? ' · 长按拖动' : ''}
                                    </span>
                                </div>
                                <div className="grid grid-cols-9 grid-rows-2 gap-1 md:gap-1.5 min-h-[120px] md:min-h-[140px]">
                                    {Array.from({length: 18}).map((_, i) => {
                                        const char = party.mercenaries.find(m => m.formationIndex === i);
                                        const isBackRow = i >= 9;
                                        const isTouchSource = touchFormationDrag?.charId === char?.id;
                                        const isTouchTarget = touchFormationDrag?.overIndex === i;
                                        return (
                                            <div 
                                                key={i}
                                                data-formation-slot={i}
                                                draggable={!!char && !isMobileLayout}
                                                onDragStart={(e) => {
                                                    if (char) handleDragStart(e, { type: 'ROSTER', char });
                                                }}
                                                onDragOver={(e) => e.preventDefault()} 
                                                onDrop={(e) => {
                                                    e.preventDefault();
                                                    const dataStr = e.dataTransfer.getData('text/plain');
                                                    if (!dataStr) return;
                                                    const data: DragData = JSON.parse(dataStr);
                                                    if (data.type !== 'ROSTER' || !data.char) return;
                                                    applyFormationMove(data.char.id, i);
                                                }}
                                                onTouchStart={(e) => {
                                                    if (char) handleFormationTouchStart(e, char);
                                                }}
                                                onClick={() => char && setSelectedMerc(char)}
                                                className={`border transition-all flex flex-col items-center justify-center p-1 text-center ${
                                                    isTouchTarget
                                                        ? 'ring-1 ring-amber-500 ring-inset'
                                                        : ''
                                                } ${
                                                    char 
                                                        ? (selectedMerc?.id === char.id 
                                                            ? 'border-amber-500 bg-amber-950/40 cursor-grab' 
                                                            : 'border-slate-700 bg-slate-900/50 cursor-grab hover:border-slate-500') 
                                                        : isBackRow 
                                                            ? 'border-slate-800/20 bg-black/10' 
                                                            : 'border-slate-800/30 bg-black/20'
                                                }`}
                                            >
                                                {char ? (
                                                    <>
                                                        <span className={`text-[9px] md:text-[10px] font-bold truncate w-full ${selectedMerc?.id === char.id ? 'text-amber-400' : 'text-slate-300'} ${isTouchSource ? 'opacity-40' : ''}`}>{char.name}</span>
                                                        <span className="text-[8px] text-slate-600 truncate w-full">{char.background}</span>
                                                    </>
                                                ) : (
                                                    <span className="text-[8px] text-slate-800">{isBackRow ? '后' : '前'}{(i % 9) + 1}</span>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                            {/* Reserve Roster */}
                            <div className="border-t border-amber-900/20 pt-3" data-formation-reserve-dropzone="true">
                                <div className="flex justify-between items-center mb-1.5">
                                    <h3 className="text-[10px] font-bold text-slate-600 uppercase tracking-[0.15em]">后备队伍</h3>
                                    <span className="text-[10px] text-slate-700 text-right">
                                        后备 {reserveRoster.length} 人
                                        {isMobileLayout ? ' · 长按拖至阵位' : ' · 拖动至战阵以出战'}
                                    </span>
                                </div>
                                <div className="flex gap-2 overflow-x-auto custom-scrollbar pb-1">
                                    {reserveRoster.length > 0 ? (
                                        reserveRoster.map(m => (
                                            <div 
                                                key={m.id}
                                                draggable={!isMobileLayout}
                                                onDragStart={(e) => handleDragStart(e, { type: 'ROSTER', char: m })}
                                                onClick={() => setSelectedMerc(m)}
                                                onDoubleClick={() => handleAddToFormation(m)}
                                                onTouchStart={(e) => handleFormationTouchStart(e, m)}
                                                className={`shrink-0 px-2.5 md:px-3 py-1.5 border cursor-pointer transition-all min-w-[96px] md:min-w-[110px] ${
                                                    selectedMerc?.id === m.id 
                                                        ? 'border-amber-500 bg-amber-950/30' 
                                                        : 'border-slate-800 hover:border-slate-600 bg-black/40'
                                                }`}
                                            >
                                                <div className={`text-xs font-bold truncate ${selectedMerc?.id === m.id ? 'text-amber-400' : 'text-slate-400'}`}>{m.name}</div>
                                                <div className="text-[9px] text-slate-600">{m.background} · Lv.{m.level}</div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="text-xs text-slate-700 italic py-1">全员已在战阵中</div>
                                    )}
                                    <div className="shrink-0 px-4 py-1.5 border border-dashed border-slate-800 flex items-center justify-center text-slate-700 hover:border-slate-600 hover:text-slate-500 cursor-pointer transition-colors min-w-[70px]">
                                        <span className="text-xs">+ 招募</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="text-center mb-6">
                                <h3 className="text-amber-600 font-bold tracking-[0.2em] mb-1">专精技能树</h3>
                                <p className="text-[10px] text-slate-600">升级获得点数以解锁战斗加成</p>
                                {selectedMerc && (
                                    <div className="mt-2 space-y-1.5">
                                        <div className="flex items-center justify-center gap-4">
                                            <span className="text-xs text-amber-500">
                                                可用点数: <span className="font-bold font-mono text-amber-400">{selectedMerc.perkPoints}</span>
                                            </span>
                                            <span className="text-[10px] text-slate-600">
                                                已学: {selectedMerc.perks.length} 个专精
                                            </span>
                                        </div>
                                    </div>
                                )}
                            </div>
                            {perkTreeTiers.map((tierPerks, idx) => (
                                <div key={idx} className="flex items-stretch gap-3">
                                    <div className="w-12 shrink-0 flex flex-col items-center justify-center border border-amber-900/20 bg-black/30 text-[10px] text-slate-600">
                                        <span className="text-amber-700 font-bold">第{idx + 1}阶</span>
                                        <span className="text-[8px] text-slate-700 mt-0.5">Lv{idx + 1}+</span>
                                    </div>
                                    <div className="flex-1 flex flex-wrap gap-2">
                                        {tierPerks.map(perk => {
                                            const isLearned = selectedMerc?.perks.includes(perk.id);
                                            const canLearn = selectedMerc && !isLearned && selectedMerc.perkPoints > 0 && selectedMerc.level >= perk.tier;
                                            return (
                                                <div 
                                                    key={perk.id}
                                                    onClick={() => canLearn ? handleLearnPerk(perk.id) : undefined}
                                                    onMouseEnter={() => setHoveredPerk(perk)}
                                                    onMouseLeave={() => setHoveredPerk(null)}
                                                    className={`px-3 py-2 border transition-all text-xs ${
                                                        isLearned 
                                                            ? 'bg-amber-900/30 border-amber-600 text-amber-400 shadow-lg cursor-default' 
                                                            : canLearn
                                                                ? 'bg-black/30 border-emerald-700/60 text-emerald-400 hover:border-emerald-500 hover:bg-emerald-950/20 cursor-pointer'
                                                                : 'bg-black/20 border-slate-800/50 text-slate-700 cursor-not-allowed'
                                                    }`}
                                                >
                                                    {perk.name}
                                                    {isLearned && <span className="ml-1 text-[9px] text-amber-600">✓</span>}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
      </div>

      {/* FOOTER: All Roster - Quick Select */}
      <div className="h-14 md:h-16 bg-gradient-to-r from-[#0d0b08] via-[#080705] to-[#0d0b08] border-t border-amber-900/40 flex items-center gap-2 px-3 md:px-6 overflow-x-auto shrink-0 z-40 custom-scrollbar">
          <span className="text-[10px] text-slate-700 uppercase tracking-widest shrink-0 pr-4 border-r border-slate-800">全员</span>
          {party.mercenaries.map(m => (
              <button 
                  key={m.id} 
                  onClick={() => setSelectedMerc(m)}
                  className={`shrink-0 px-3 py-1.5 border text-xs transition-all ${
                      selectedMerc?.id === m.id 
                          ? 'border-amber-500 bg-amber-950/30 text-amber-400' 
                          : m.formationIndex !== null
                              ? 'border-slate-700 bg-slate-900/30 text-slate-300 hover:border-slate-500'
                              : 'border-slate-800 bg-black/30 text-slate-500 hover:border-slate-600'
                  }`}
              >
                  {m.name}
                  {m.formationIndex === null && <span className="ml-1 text-[8px] text-red-500">[备]</span>}
              </button>
          ))}
      </div>

      {touchFormationDrag && (
          <div
              className="fixed z-[110] px-2 py-1 border border-amber-600 bg-amber-950/90 text-[11px] text-amber-200 pointer-events-none shadow-xl"
              style={{ left: touchFormationDrag.x + 12, top: touchFormationDrag.y + 12 }}
          >
              {touchFormationDrag.charName}
          </div>
      )}

      {/* Tooltips */}
      {hoveredItem && !isMobileLayout && (
          <div 
              className="fixed z-[100] bg-[#0d0b08] border border-amber-900/60 p-4 shadow-2xl pointer-events-none w-72" 
              style={{ left: Math.min(mousePos.x + 20, window.innerWidth - 300), top: Math.min(mousePos.y + 20, window.innerHeight - 200) }}
          >
              <div className="border-b border-amber-900/30 pb-2 mb-3">
                  <h4 className="text-amber-500 font-bold text-base">{hoveredItem.name}</h4>
                  <div className="flex justify-between items-center mt-1">
                      <span className="text-[10px] text-slate-600 uppercase">{getItemTypeName(hoveredItem.type)}</span>
                      <span className="text-amber-700 font-mono text-sm">{hoveredItem.value} 金</span>
                  </div>
              </div>
              <p className="text-xs text-slate-500 italic mb-3 leading-relaxed">「{hoveredItem.description}」</p>
              <div className="space-y-1.5 text-xs">
                  {hoveredItem.damage && (
                      <div className="flex justify-between">
                          <span className="text-slate-600">基础杀伤</span>
                          <span className="text-red-400 font-mono">{hoveredItem.damage[0]} - {hoveredItem.damage[1]}</span>
                      </div>
                  )}
                  {hoveredItem.armorPen !== undefined && (
                      <div className="flex justify-between">
                          <span className="text-slate-600">穿甲能力</span>
                          <span className="text-sky-400 font-mono">{Math.round(hoveredItem.armorPen * 100)}%</span>
                      </div>
                  )}
                  {hoveredItem.armorDmg !== undefined && (
                      <div className="flex justify-between">
                          <span className="text-slate-600">破甲效率</span>
                          <span className="text-amber-400 font-mono">{Math.round(hoveredItem.armorDmg * 100)}%</span>
                      </div>
                  )}
                  {hoveredItem.durability !== undefined && (
                      <div className="flex justify-between">
                          <span className="text-slate-600">护甲耐久</span>
                          <span className="text-slate-300 font-mono">{hoveredItem.durability} / {hoveredItem.maxDurability}</span>
                      </div>
                  )}
                  {hoveredItem.fatigueCost !== undefined && (
                      <div className="flex justify-between">
                          <span className="text-slate-600">体力消耗</span>
                          <span className="text-purple-400 font-mono">-{hoveredItem.fatigueCost}</span>
                      </div>
                  )}
                  {hoveredItem.maxFatiguePenalty !== undefined && (
                      <div className="flex justify-between">
                          <span className="text-slate-600">负重惩罚</span>
                          <span className="text-red-400 font-mono">-{hoveredItem.maxFatiguePenalty}</span>
                      </div>
                  )}
                  {hoveredItem.defenseBonus !== undefined && (
                      <div className="flex justify-between">
                          <span className="text-slate-600">近战防御</span>
                          <span className="text-emerald-400 font-mono">+{hoveredItem.defenseBonus}</span>
                      </div>
                  )}
                  {hoveredItem.rangedBonus !== undefined && (
                      <div className="flex justify-between">
                          <span className="text-slate-600">远程防御</span>
                          <span className="text-emerald-400 font-mono">+{hoveredItem.rangedBonus}</span>
                      </div>
                  )}
              </div>
          </div>
      )}
      
      {hoveredPerk && !isMobileLayout && (
          <div 
              className="fixed z-[100] bg-[#0d0b08] border border-amber-900/60 p-4 shadow-2xl pointer-events-none w-80" 
              style={{ left: Math.min(mousePos.x + 20, window.innerWidth - 340), top: Math.min(mousePos.y, window.innerHeight - 150) }}
          >
              <div className="border-b border-amber-900/30 pb-2 mb-3">
                  <h4 className="text-amber-500 font-bold text-base">{hoveredPerk.name}</h4>
                  <span className="text-[10px] text-slate-600">第 {hoveredPerk.tier} 阶专精 · 需要 Lv.{hoveredPerk.tier}</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">{hoveredPerk.description}</p>
              {selectedMerc && (() => {
                  const isLearned = selectedMerc.perks.includes(hoveredPerk.id);
                  const canLearn = !isLearned && selectedMerc.perkPoints > 0 && selectedMerc.level >= hoveredPerk.tier;
                  const levelLocked = !isLearned && selectedMerc.level < hoveredPerk.tier;
                  return (
                      <div className="mt-3 pt-2 border-t border-amber-900/20 text-[11px]">
                          {isLearned && <span className="text-amber-400">✓ 已习得</span>}
                          {canLearn && <span className="text-emerald-400">▶ 点击学习（消耗 1 技能点）</span>}
                          {levelLocked && <span className="text-red-400/70">🔒 需要等级 {hoveredPerk.tier}</span>}
                          {!isLearned && !canLearn && !levelLocked && <span className="text-slate-600">无可用技能点</span>}
                      </div>
                  );
              })()}
          </div>
      )}

    </div>
  );
};

// --- Helper Components ---

interface EquipSlotTextProps {
    label: string;
    item: Item | null;
    onHover: (item: Item | null) => void;
    onClick: () => void;
    onDrop: (e: React.DragEvent) => void;
    isTarget?: boolean;
    locked?: boolean; // 双手武器锁定副手
}

const EquipSlotText: React.FC<EquipSlotTextProps> = ({ label, item, onHover, onClick, onDrop, isTarget, locked }) => (
    <div 
        onClick={locked ? undefined : onClick}
        onDragOver={(e) => e.preventDefault()}
        onDrop={locked ? undefined : onDrop}
        onMouseEnter={() => item && onHover(item)}
        onMouseLeave={() => onHover(null)}
        className={`h-14 border p-2 flex flex-col justify-center transition-all ${
            locked
                ? 'border-slate-800/30 bg-slate-950/40 cursor-not-allowed opacity-50'
                : isTarget 
                    ? 'border-amber-600 bg-amber-950/20 hover:bg-amber-900/30 cursor-pointer' 
                    : item 
                        ? 'border-amber-900/40 bg-black/30 hover:border-amber-700 cursor-pointer' 
                        : 'border-slate-800/50 bg-black/20 hover:border-slate-700 cursor-pointer'
        }`}
    >
        {locked ? (
            <span className="text-slate-700 text-xs text-center">🔒 双手武器</span>
        ) : item ? (
            <>
                <span className={`text-sm font-bold truncate ${
                    item.rarity === 'UNIQUE' ? 'text-red-400' 
                    : item.rarity === 'LEGENDARY' ? 'text-amber-300'
                    : item.rarity === 'EPIC' ? 'text-purple-300'
                    : item.rarity === 'RARE' ? 'text-sky-300'
                    : 'text-amber-400'
                }`}>{item.name}</span>
                <span className="text-[10px] text-slate-600">{getItemBrief(item)}</span>
            </>
        ) : (
            <span className="text-slate-700 text-xs text-center">— {label} —</span>
        )}
    </div>
);

// 紧凑型属性条 - 用于两列布局 (Battle Brothers风格)
interface StatBarCompactProps {
    label: string;
    val: number;
    maxPossible: number;
    stars?: number;
    colorBar: string;
    colorText: string;
}

const StatBarCompact: React.FC<StatBarCompactProps> = ({ label, val, maxPossible, stars = 0, colorBar, colorText }) => {
    const pct = Math.min(100, (val / maxPossible) * 100);
    
    return (
        <div className="space-y-1">
            <div className="flex justify-between items-center">
                <span className="text-[10px] text-slate-500">{label}</span>
                <div className="flex items-center gap-1">
                    {stars > 0 && (
                        <span className="text-amber-500 text-[9px]">{'★'.repeat(stars)}</span>
                    )}
                    <span className={`font-mono font-bold text-sm ${colorText}`}>{val}</span>
                </div>
            </div>
            <div className="h-2.5 bg-black/60 w-full overflow-hidden border border-white/10 relative">
                <div className={`h-full ${colorBar} transition-all duration-500`} style={{ width: `${pct}%` }} />
                {/* 刻度线 */}
                <div className="absolute inset-0 flex justify-between pointer-events-none">
                    <div className="w-px h-full bg-white/5" style={{ marginLeft: '25%' }} />
                    <div className="w-px h-full bg-white/5" style={{ marginLeft: '25%' }} />
                    <div className="w-px h-full bg-white/5" style={{ marginLeft: '25%' }} />
                </div>
            </div>
        </div>
    );
};
