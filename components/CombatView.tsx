import React, { useState, useMemo, useEffect, useRef } from 'react';
import { CombatState, CombatUnit, Ability, Item } from '../types.ts';
import { getHexNeighbors, getHexDistance, getUnitAbilities, ABILITIES } from '../constants.tsx';
import { Portrait } from './Portrait.tsx';

interface CombatViewProps {
  initialState: CombatState;
  onCombatEnd: (victory: boolean, survivors: CombatUnit[]) => void;
}

interface FloatingText {
    id: number;
    text: string;
    x: number;
    y: number;
    color: string;
    life: number;
}

export const CombatView: React.FC<CombatViewProps> = ({ initialState, onCombatEnd }) => {
  const [state, setState] = useState(initialState);
  const [floatingTexts, setFloatingTexts] = useState<FloatingText[]>([]);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const cameraRef = useRef({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(0.8);
  const [hoveredHex, setHoveredHex] = useState<{q:number, r:number} | null>(null);
  const [hoveredSkill, setHoveredSkill] = useState<Ability | null>(null);
  const [selectedAbility, setSelectedAbility] = useState<Ability | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const unitRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  const activeUnit = state.units.find(u => u.id === state.turnOrder[state.currentUnitIndex]);
  const isPlayerTurn = activeUnit?.team === 'PLAYER';

  // --- 风格常量 ---
  const HEX_SIZE = 44;
  const HEX_GAP = 2;
  const TILE_COLOR_NORMAL = "#2e2a24";
  const TILE_COLOR_HOVER = "#4a3e2e";
  const TILE_COLOR_MIST = "#0a0a0a";

  const getPixelPos = (q: number, r: number) => {
    const x = HEX_SIZE * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r);
    const y = HEX_SIZE * (1.5 * r);
    return { x, y };
  };

  // 生成地形缓存
  const gridRange = 25;
  const terrainMap = useMemo(() => {
    const map = new Map<string, { color: string, prop: string | null, height: number }>();
    for (let q = -gridRange; q <= gridRange; q++) {
      for (let r = Math.max(-gridRange, -q - gridRange); r <= Math.min(gridRange, -q + gridRange); r++) {
         const noise = Math.sin(q * 0.2) * Math.cos(r * 0.2);
         let color = TILE_COLOR_NORMAL;
         let prop = null;
         let h = 0;
         if (noise > 0.6) { color = "#3d362d"; prop = "🌲"; h = 1; }
         else if (noise < -0.5) { color = "#1a1815"; h = -1; }
         map.set(`${q},${r}`, { color, prop, height: h });
      }
    }
    return map;
  }, []);

  // 视野可见性
  const visibleHexes = useMemo(() => {
    const set = new Set<string>();
    state.units.filter(u => u.team === 'PLAYER' && !u.isDead).forEach(u => {
      const radius = 6;
      for (let q = -radius; q <= radius; q++) {
        for (let r = Math.max(-radius, -q - radius); r <= Math.min(radius, -q + radius); r++) {
          if (getHexDistance({q:0, r:0}, {q, r}) <= radius) {
            set.add(`${u.combatPos.q + q},${u.combatPos.r + r}`);
          }
        }
      }
    });
    return set;
  }, [state.units]);

  const addToLog = (msg: string) => {
    setState(prev => ({ ...prev, combatLog: [msg, ...prev.combatLog].slice(0, 5) }));
  };

  const nextTurn = () => {
    setState(prev => {
      const nextIdx = (prev.currentUnitIndex + 1) % prev.turnOrder.length;
      return { 
        ...prev, 
        currentUnitIndex: nextIdx,
        round: nextIdx === 0 ? prev.round + 1 : prev.round,
        units: prev.units.map(u => u.id === prev.turnOrder[nextIdx] ? { ...u, currentAP: 9 } : u)
      };
    });
    setSelectedAbility(null);
  };

  // --- Canvas 核心渲染 ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const drawHex = (x: number, y: number, size: number, fillStyle: string, strokeStyle: string, lineWidth: number) => {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 180) * (60 * i + 30);
        const px = x + size * Math.cos(angle);
        const py = y + size * Math.sin(angle);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = fillStyle;
      ctx.fill();
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    };

    let animId: number;
    const render = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      if (canvas.width !== rect.width * dpr) {
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);
      }
      ctx.clearRect(0, 0, rect.width, rect.height);

      ctx.save();
      ctx.translate(rect.width / 2, rect.height / 2);
      ctx.scale(zoom, zoom);
      ctx.translate(cameraRef.current.x, cameraRef.current.y);

      // 1. 渲染背景地表 (棋盘)
      terrainMap.forEach((data, key) => {
        const [q, r] = key.split(',').map(Number);
        const isVisible = visibleHexes.has(key);
        const isHovered = hoveredHex?.q === q && hoveredHex?.r === r;
        const { x, y } = getPixelPos(q, r);

        // 绘制阴影层 (3D感)
        if (isVisible) {
          ctx.shadowBlur = 10;
          ctx.shadowColor = 'rgba(0,0,0,0.5)';
        }

        const color = isVisible ? (isHovered ? TILE_COLOR_HOVER : data.color) : TILE_COLOR_MIST;
        const stroke = isVisible ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.2)';
        
        drawHex(x, y, HEX_SIZE - HEX_GAP, color, stroke, 1);
        ctx.shadowBlur = 0;

        if (isVisible) {
          if (data.prop) {
            ctx.font = '22px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillText(data.prop, x, y);
          }

          // 技能范围高亮
          if (isPlayerTurn && activeUnit && selectedAbility?.type === 'ATTACK') {
             const dist = getHexDistance(activeUnit.combatPos, {q, r});
             if (dist >= selectedAbility.range[0] && dist <= selectedAbility.range[1]) {
                ctx.strokeStyle = 'rgba(220, 38, 38, 0.4)';
                ctx.lineWidth = 3;
                drawHex(x, y, HEX_SIZE - HEX_GAP - 2, 'transparent', 'rgba(220, 38, 38, 0.4)', 2);
             }
          }
        }
      });

      // 2. 渲染单位光环
      state.units.forEach(u => {
          if (u.isDead) return;
          const isVisible = visibleHexes.has(`${u.combatPos.q},${u.combatPos.r}`);
          if (!isVisible && u.team === 'ENEMY') return;

          const { x, y } = getPixelPos(u.combatPos.q, u.combatPos.r);
          
          ctx.beginPath();
          ctx.ellipse(x, y + 15, 20, 10, 0, 0, Math.PI * 2);
          ctx.fillStyle = u.team === 'PLAYER' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(239, 68, 68, 0.15)';
          ctx.fill();

          if (activeUnit?.id === u.id) {
              ctx.strokeStyle = '#f59e0b';
              ctx.setLineDash([5, 3]);
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.ellipse(x, y + 15, 24, 12, 0, 0, Math.PI * 2);
              ctx.stroke();
              ctx.setLineDash([]);
          }
      });

      ctx.restore();
      animId = requestAnimationFrame(render);
    };
    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [terrainMap, visibleHexes, hoveredHex, activeUnit, selectedAbility, zoom]);

  // 同步单位图层
  useEffect(() => {
    let anim: number;
    const sync = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const cx = rect.width / 2, cy = rect.height / 2;
      
      state.units.forEach(u => {
        const el = unitRefs.current.get(u.id);
        if (el) {
          const isVisible = visibleHexes.has(`${u.combatPos.q},${u.combatPos.r}`);
          if (u.isDead || (!isVisible && u.team === 'ENEMY')) {
            el.style.opacity = '0'; el.style.pointerEvents = 'none';
          } else {
            el.style.opacity = '1'; el.style.pointerEvents = 'auto';
            const { x, y } = getPixelPos(u.combatPos.q, u.combatPos.r);
            const screenX = cx + (x + cameraRef.current.x) * zoom - 25;
            const screenY = cy + (y + cameraRef.current.y) * zoom - 35;
            el.style.transform = `translate3d(${screenX}px, ${screenY}px, 0) scale(${zoom})`;
          }
        }
      });
      anim = requestAnimationFrame(sync);
    };
    anim = requestAnimationFrame(sync);
    return () => cancelAnimationFrame(anim);
  }, [state.units, zoom, visibleHexes]);

  // --- 交互处理 ---
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) { isDraggingRef.current = true; dragStartRef.current = { x: e.clientX, y: e.clientY }; }
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDraggingRef.current) {
      cameraRef.current.x += (e.clientX - dragStartRef.current.x) / zoom;
      cameraRef.current.y += (e.clientY - dragStartRef.current.y) / zoom;
      dragStartRef.current = { x: e.clientX, y: e.clientY };
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const worldX = (e.clientX - rect.left - rect.width / 2) / zoom - cameraRef.current.x;
    const worldY = (e.clientY - rect.top - rect.height / 2) / zoom - cameraRef.current.y;
    const r = Math.round(worldY / (HEX_SIZE * 1.5));
    const q = Math.round((worldX - HEX_SIZE * (Math.sqrt(3) / 2) * r) / (HEX_SIZE * Math.sqrt(3)));
    if (hoveredHex?.q !== q || hoveredHex?.r !== r) setHoveredHex({ q, r });
    setMousePos({ x: e.clientX, y: e.clientY });
  };
  const handleMouseUp = () => isDraggingRef.current = false;

  const performAttack = () => {
    if (!hoveredHex || !activeUnit || !isPlayerTurn || !selectedAbility) return;
    const target = state.units.find(u => !u.isDead && u.combatPos.q === hoveredHex.q && u.combatPos.r === hoveredHex.r);
    if (target && target.team === 'ENEMY') {
        const dist = getHexDistance(activeUnit.combatPos, hoveredHex);
        if (dist >= selectedAbility.range[0] && dist <= selectedAbility.range[1]) {
            if (activeUnit.currentAP < selectedAbility.apCost) { addToLog("行动力不足！"); return; }
            const dmg = Math.floor(Math.random() * 20) + 10;
            setFloatingTexts(prev => [...prev, { id: Date.now(), text: `-${dmg}`, x: hoveredHex.q, y: hoveredHex.r, color: '#ef4444', life: 1 }]);
            setState(prev => ({
                ...prev,
                units: prev.units.map(u => {
                    if (u.id === target.id) return { ...u, hp: Math.max(0, u.hp - dmg), isDead: u.hp - dmg <= 0 };
                    if (u.id === activeUnit.id) return { ...u, currentAP: u.currentAP - selectedAbility.apCost };
                    return u;
                })
            }));
            addToLog(`${activeUnit.name} 施展 ${selectedAbility.name}！`);
        }
    }
  };

  const performMove = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!hoveredHex || !activeUnit || !isPlayerTurn) return;
    const dist = getHexDistance(activeUnit.combatPos, hoveredHex);
    const apCost = dist * 2;
    if (activeUnit.currentAP >= apCost && !state.units.some(u => !u.isDead && u.combatPos.q === hoveredHex.q && u.combatPos.r === hoveredHex.r)) {
        setState(prev => ({
            ...prev,
            units: prev.units.map(u => u.id === activeUnit.id ? { ...u, combatPos: hoveredHex, currentAP: u.currentAP - apCost } : u)
        }));
    }
  };

  useEffect(() => {
    if (!state.units.some(u => u.team === 'ENEMY' && !u.isDead)) onCombatEnd(true, state.units.filter(u => u.team === 'PLAYER' && !u.isDead));
    else if (!state.units.some(u => u.team === 'PLAYER' && !u.isDead)) onCombatEnd(false, []);
  }, [state.units]);

  return (
    <div className="flex flex-col h-full w-full bg-[#0c0a09] font-serif select-none overflow-hidden relative">
      
      {/* 行动顺序栏 */}
      <div className="h-16 bg-gradient-to-r from-black via-[#1a110a] to-black border-b border-amber-900/40 flex items-center px-8 gap-4 z-50 shrink-0">
          <div className="text-[10px] text-amber-700 font-bold uppercase tracking-widest mr-4">行动序</div>
          <div className="flex gap-2 items-center overflow-x-auto custom-scrollbar flex-1 py-2">
            {state.turnOrder.map((uid, i) => {
                const u = state.units.find(u => u.id === uid);
                if (!u || u.isDead) return null;
                const isCurrent = i === state.currentUnitIndex;
                return (
                    <div key={uid} className={`relative flex-shrink-0 transition-all duration-300 ${isCurrent ? 'scale-110' : 'opacity-40 grayscale scale-90'}`}>
                        <Portrait character={u} size="sm" className={u.team === 'ENEMY' ? 'border-red-900' : 'border-blue-900'} />
                        {isCurrent && <div className="absolute -bottom-1 left-0 w-full h-1 bg-amber-500 shadow-[0_0_8px_#f59e0b]" />}
                    </div>
                );
            })}
          </div>
          <div className="text-xs text-slate-500 font-mono">第 {state.round} 回合</div>
      </div>

      {/* 战场主体 */}
      <div ref={containerRef} className="flex-1 relative bg-[#0a0807] overflow-hidden" onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onWheel={e => setZoom(z => Math.max(0.4, Math.min(2, z - Math.sign(e.deltaY) * 0.05)))}>
          {/* 背景纹理 */}
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/dark-wood.png')] opacity-10 pointer-events-none" />
          
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" onClick={performAttack} onContextMenu={performMove} />
          
          <div className="absolute inset-0 pointer-events-none">
            {state.units.map(u => (
                <div key={u.id} ref={el => { if(el) unitRefs.current.set(u.id, el); else unitRefs.current.delete(u.id); }} className="absolute w-[50px] h-[50px] transition-opacity duration-300">
                    <div className="relative w-full h-full">
                        <Portrait character={u} size="sm" className={`${u.team === 'PLAYER' ? 'border-blue-500' : 'border-red-700'} border-2 shadow-xl`} />
                        <div className="absolute -top-4 left-0 w-full h-1 bg-black/60 rounded-full border border-white/5 overflow-hidden">
                            <div className="h-full bg-red-600 transition-all" style={{ width: `${(u.hp/u.maxHp)*100}%` }} />
                        </div>
                    </div>
                </div>
            ))}
            {floatingTexts.map(ft => {
                const { x, y } = getPixelPos(ft.x, ft.y);
                const screenX = (window.innerWidth/2) + (x + cameraRef.current.x) * zoom;
                const screenY = (window.innerHeight/2) + (y + cameraRef.current.y) * zoom - 60;
                return (
                    <div key={ft.id} className="absolute text-2xl font-bold animate-bounce" style={{ left: screenX, top: screenY, color: ft.color, textShadow: '2px 2px 0 black' }}>{ft.text}</div>
                );
            })}
          </div>

          {/* 交互提示 */}
          {hoveredHex && isPlayerTurn && activeUnit && visibleHexes.has(`${hoveredHex.q},${hoveredHex.r}`) && (
              <div className="absolute pointer-events-none bg-black/80 border border-amber-900/50 p-2 rounded-sm text-[10px] text-amber-500 z-50 shadow-2xl" style={{ left: mousePos.x + 20, top: mousePos.y + 20 }}>
                  <div className="flex gap-4">
                      <span>距离: {getHexDistance(activeUnit.combatPos, hoveredHex)}</span>
                      <span>消耗: {getHexDistance(activeUnit.combatPos, hoveredHex) * 2} AP</span>
                  </div>
                  <div className="text-slate-500 mt-1 uppercase text-[8px]">右键移动 / 左键技能</div>
              </div>
          )}
      </div>

      {/* 底部控制台 */}
      <div className="h-40 bg-[#120d09] border-t border-amber-900/60 relative z-50 flex items-center px-10 gap-10 shadow-[0_-10px_30px_rgba(0,0,0,0.8)] shrink-0">
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/dark-leather.png')] opacity-10 pointer-events-none" />
          
          {/* 单位状态 */}
          <div className="flex items-center gap-6 w-72 relative">
             {activeUnit && (
               <>
                 <Portrait character={activeUnit} size="lg" className="border-amber-600 border-2" />
                 <div className="flex flex-col gap-1">
                    <span className="text-2xl font-bold text-amber-500 tracking-widest">{activeUnit.name}</span>
                    <span className="text-[10px] text-amber-800 font-bold uppercase">{activeUnit.background}</span>
                    <div className="flex gap-4 mt-2">
                        <div className="flex flex-col">
                            <span className="text-[8px] text-slate-500">AP</span>
                            <span className="text-sm font-mono text-white font-bold">{activeUnit.currentAP} / 9</span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[8px] text-slate-500">体力</span>
                            <span className="text-sm font-mono text-white font-bold">{activeUnit.fatigue} / {activeUnit.maxFatigue}</span>
                        </div>
                    </div>
                 </div>
               </>
             )}
          </div>

          {/* 技能区 */}
          <div className="flex-1 flex justify-center items-center gap-4">
              {isPlayerTurn && activeUnit && getUnitAbilities(activeUnit).filter(a => a.id !== 'MOVE').map(skill => (
                  <button 
                    key={skill.id}
                    onClick={() => setSelectedAbility(skill)}
                    onMouseEnter={() => setHoveredSkill(skill)}
                    onMouseLeave={() => setHoveredSkill(null)}
                    className={`group relative w-16 h-16 border-2 transition-all flex flex-col items-center justify-center ${selectedAbility?.id === skill.id ? 'border-amber-400 bg-amber-900/40 -translate-y-2 shadow-[0_0_20px_rgba(245,158,11,0.3)]' : 'border-amber-900/30 bg-black/40 hover:border-amber-600'}`}
                  >
                      <span className="text-3xl">{skill.icon}</span>
                      <span className="absolute top-1 right-1 text-[10px] font-mono text-amber-600">{skill.apCost}</span>
                      <div className="absolute -bottom-2 w-0 h-[2px] bg-amber-500 transition-all group-hover:w-full" />
                  </button>
              ))}
          </div>

          {/* 战斗日志与操作 */}
          <div className="w-72 flex flex-col items-end gap-3">
              <div className="h-16 overflow-hidden flex flex-col-reverse text-[10px] text-slate-500 text-right font-serif leading-relaxed">
                  {state.combatLog.map((log, i) => <div key={i} className="opacity-80">{log}</div>)}
              </div>
              {isPlayerTurn ? (
                <button 
                    onClick={nextTurn}
                    className="w-full py-2 bg-amber-900/20 border border-amber-600/50 text-amber-500 font-bold text-xs hover:bg-amber-600 hover:text-white transition-all tracking-[0.3em] uppercase"
                >
                    结束回合
                </button>
              ) : (
                <div className="w-full text-center text-amber-900 animate-pulse font-bold tracking-widest text-sm py-2">敌军行动中...</div>
              )}
          </div>
      </div>

      {/* 技能说明浮窗 */}
      {hoveredSkill && (
          <div className="fixed bottom-44 left-1/2 -translate-x-1/2 w-80 bg-[#1a1512] border border-amber-900/50 p-4 z-[100] shadow-2xl rounded-sm">
              <div className="flex justify-between items-center border-b border-amber-900/30 pb-2 mb-2">
                  <span className="text-amber-500 font-bold tracking-widest">{hoveredSkill.name}</span>
                  <span className="text-[10px] text-slate-500 font-mono">AP: {hoveredSkill.apCost} | FAT: {hoveredSkill.fatCost}</span>
              </div>
              <p className="text-xs text-slate-400 italic leading-relaxed">“{hoveredSkill.description}”</p>
          </div>
      )}
    </div>
  );
};
