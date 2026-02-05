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
  const HEX_SIZE = 45;
  const HEX_GAP = 1.5;
  const COLOR_PLAINS = "#2d3521";
  const COLOR_FOREST = "#1b251a";
  const COLOR_MOUNTAIN = "#2f2f2f";
  const COLOR_FOG = "#050505";

  const getPixelPos = (q: number, r: number) => {
    const x = HEX_SIZE * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r);
    const y = HEX_SIZE * (1.5 * r);
    return { x, y };
  };

  // 预生成地形数据，避免渲染时计算
  const gridRange = 25;
  const terrainData = useMemo(() => {
    const data = new Map<string, { color: string, prop: string | null }>();
    const noise = (q: number, r: number) => Math.sin(q * 0.25) * Math.cos(r * 0.25);
    
    for (let q = -gridRange; q <= gridRange; q++) {
      for (let r = Math.max(-gridRange, -q - gridRange); r <= Math.min(gridRange, -q + gridRange); r++) {
         const n = noise(q, r);
         let color = COLOR_PLAINS;
         let prop = null;
         if (n > 0.6) { color = COLOR_FOREST; if(Math.random() > 0.7) prop = "🌲"; }
         else if (n < -0.6) { color = COLOR_MOUNTAIN; prop = "⛰️"; }
         data.set(`${q},${r}`, { color, prop });
      }
    }
    return data;
  }, []);

  // 视野计算
  const visibleSet = useMemo(() => {
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

  // --- 渲染系统 ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false }); // 优化：禁用Alpha通道提升性能
    if (!ctx) return;

    const drawHex = (x: number, y: number, size: number) => {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 180) * (60 * i + 30);
        ctx.lineTo(x + size * Math.cos(angle), y + size * Math.sin(angle));
      }
      ctx.closePath();
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
      
      // 填充底色
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, rect.width, rect.height);

      ctx.save();
      ctx.translate(rect.width / 2, rect.height / 2);
      ctx.scale(zoom, zoom);
      ctx.translate(cameraRef.current.x, cameraRef.current.y);

      // 1. 批量渲染地块
      terrainData.forEach((data, key) => {
        const [q, r] = key.split(',').map(Number);
        const { x, y } = getPixelPos(q, r);
        const isVisible = visibleSet.has(key);
        const isHovered = hoveredHex?.q === q && hoveredHex?.r === r;

        // 仅在可视或悬停时使用更亮的颜色
        ctx.fillStyle = isVisible ? (isHovered ? lightenColor(data.color, 15) : data.color) : COLOR_FOG;
        drawHex(x, y, HEX_SIZE - HEX_GAP);
        ctx.fill();

        // 可视区域描边和装饰
        if (isVisible) {
          ctx.strokeStyle = "rgba(255,255,255,0.05)";
          ctx.lineWidth = 1;
          ctx.stroke();

          if (data.prop) {
            ctx.font = "20px serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillStyle = "rgba(255,255,255,0.1)";
            ctx.fillText(data.prop, x, y);
          }

          // 技能范围高亮
          if (isPlayerTurn && activeUnit && selectedAbility?.type === 'ATTACK') {
            const dist = getHexDistance(activeUnit.combatPos, {q, r});
            if (dist >= selectedAbility.range[0] && dist <= selectedAbility.range[1]) {
              ctx.strokeStyle = "rgba(220, 38, 38, 0.4)";
              ctx.lineWidth = 2;
              drawHex(x, y, HEX_SIZE - HEX_GAP - 3);
              ctx.stroke();
            }
          }
        }
      });

      // 2. 渲染单位阴影/指示器
      state.units.forEach(u => {
        if (u.isDead) return;
        const key = `${u.combatPos.q},${u.combatPos.r}`;
        if (!visibleSet.has(key) && u.team === 'ENEMY') return;

        const { x, y } = getPixelPos(u.combatPos.q, u.combatPos.r);
        ctx.beginPath();
        ctx.ellipse(x, y + 15, 20, 10, 0, 0, Math.PI * 2);
        ctx.fillStyle = u.team === 'PLAYER' ? "rgba(59, 130, 246, 0.2)" : "rgba(239, 68, 68, 0.2)";
        ctx.fill();

        if (activeUnit?.id === u.id) {
          ctx.strokeStyle = "#fbbf24";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.ellipse(x, y + 15, 24, 12, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      });

      ctx.restore();
      animId = requestAnimationFrame(render);
    };
    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [terrainData, visibleSet, hoveredHex, activeUnit, selectedAbility, zoom]);

  // DOM 图层同步 - 优化更新频率
  useEffect(() => {
    let anim: number;
    const sync = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const cx = rect.width / 2, cy = rect.height / 2;
      
      state.units.forEach(u => {
        const el = unitRefs.current.get(u.id);
        if (el) {
          const isVisible = visibleSet.has(`${u.combatPos.q},${u.combatPos.r}`);
          if (u.isDead || (!isVisible && u.team === 'ENEMY')) {
            el.style.display = 'none';
          } else {
            el.style.display = 'block';
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
  }, [state.units, zoom, visibleSet]);

  // --- 逻辑函数 ---
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
    const isVisible = visibleSet.has(`${hoveredHex.q},${hoveredHex.r}`);
    if (!isVisible) return;

    const target = state.units.find(u => !u.isDead && u.combatPos.q === hoveredHex.q && u.combatPos.r === hoveredHex.r);
    if (target && target.team === 'ENEMY') {
        const dist = getHexDistance(activeUnit.combatPos, hoveredHex);
        if (dist >= selectedAbility.range[0] && dist <= selectedAbility.range[1]) {
            if (activeUnit.currentAP < selectedAbility.apCost) return;
            const dmg = Math.floor(Math.random() * 20) + 15;
            setFloatingTexts(prev => [...prev, { id: Date.now(), text: `-${dmg}`, x: hoveredHex.q, y: hoveredHex.r, color: '#ef4444' }]);
            setState(prev => ({
                ...prev,
                units: prev.units.map(u => {
                    if (u.id === target.id) return { ...u, hp: Math.max(0, u.hp - dmg), isDead: u.hp - dmg <= 0 };
                    if (u.id === activeUnit.id) return { ...u, currentAP: u.currentAP - (selectedAbility.apCost || 4) };
                    return u;
                })
            }));
            addToLog(`${activeUnit.name} 攻击 ${target.name}，造成 ${dmg} 伤害。`);
            setTimeout(() => setFloatingTexts(prev => prev.slice(1)), 1000);
        }
    }
  };

  const performMove = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!hoveredHex || !activeUnit || !isPlayerTurn) return;
    if (!visibleSet.has(`${hoveredHex.q},${hoveredHex.r}`)) return;
    
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
    <div className="flex flex-col h-full w-full bg-[#050505] font-serif select-none overflow-hidden relative">
      <div className="h-16 bg-black border-b border-amber-900/40 flex items-center px-6 gap-3 z-50 shrink-0">
        {state.turnOrder.map((uid, i) => {
          const u = state.units.find(u => u.id === uid);
          if (!u || u.isDead) return null;
          const isCurrent = i === state.currentUnitIndex;
          return (
            <div key={uid} className={`relative flex-shrink-0 transition-all duration-300 ${isCurrent ? 'scale-110' : 'opacity-40 grayscale'}`}>
              <Portrait character={u} size="sm" className={u.team === 'ENEMY' ? 'border-red-900' : 'border-blue-900'} />
              {isCurrent && <div className="absolute -bottom-1 left-0 w-full h-1 bg-amber-500" />}
            </div>
          );
        })}
      </div>

      <div ref={containerRef} className="flex-1 relative bg-[#0a0a0a]" onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onWheel={e => setZoom(z => Math.max(0.4, Math.min(2, z - Math.sign(e.deltaY) * 0.05)))}>
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" onClick={performAttack} onContextMenu={performMove} />
        
        <div className="absolute inset-0 pointer-events-none">
          {state.units.map(u => (
            <div key={u.id} ref={el => { if(el) unitRefs.current.set(u.id, el); else unitRefs.current.delete(u.id); }} className="absolute w-[50px] h-[50px]">
              <div className={`relative w-full h-full ${activeUnit?.id === u.id ? 'ring-2 ring-amber-500 ring-offset-2 ring-offset-black' : ''}`}>
                <Portrait character={u} size="sm" className={`${u.team === 'PLAYER' ? 'border-blue-500' : 'border-red-700'} border-2 shadow-xl`} />
                <div className="absolute -top-3 left-0 w-full h-1 bg-black/80 rounded-full overflow-hidden">
                  <div className="h-full bg-red-600 transition-all" style={{ width: `${(u.hp/u.maxHp)*100}%` }} />
                </div>
              </div>
            </div>
          ))}
          {floatingTexts.map(ft => {
            const { x, y } = getPixelPos(ft.x, ft.y);
            const screenX = (window.innerWidth/2) + (x + cameraRef.current.x) * zoom;
            const screenY = (window.innerHeight/2) + (y + cameraRef.current.y) * zoom - 60;
            return <div key={ft.id} className="absolute text-xl font-bold animate-bounce" style={{ left: screenX, top: screenY, color: ft.color, textShadow: '2px 2px 0 black' }}>{ft.text}</div>;
          })}
        </div>

        {hoveredHex && isPlayerTurn && activeUnit && visibleSet.has(`${hoveredHex.q},${hoveredHex.r}`) && (
          <div className="absolute pointer-events-none bg-black/90 border border-amber-900/50 p-2 text-[10px] text-amber-500 z-50" style={{ left: mousePos.x + 20, top: mousePos.y + 20 }}>
            <div>消耗: {getHexDistance(activeUnit.combatPos, hoveredHex) * 2} AP</div>
            <div className="text-slate-500 mt-1 uppercase text-[8px]">右键移动 / 左键攻击</div>
          </div>
        )}
      </div>

      <div className="h-32 bg-[#0d0d0d] border-t border-amber-900/60 z-50 flex items-center px-10 justify-between shrink-0 shadow-2xl">
        <div className="flex items-center gap-6 w-64">
          {activeUnit && (
            <>
              <Portrait character={activeUnit} size="md" className="border-amber-600 border-2" />
              <div className="flex flex-col">
                <span className="text-xl font-bold text-amber-500 tracking-widest">{activeUnit.name}</span>
                <div className="flex gap-4 mt-1 text-[10px] font-mono">
                  <span className="text-slate-400">AP <b className="text-white">{activeUnit.currentAP}</b></span>
                  <span className="text-slate-400">生命 <b className="text-white">{activeUnit.hp}/{activeUnit.maxHp}</b></span>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex gap-3">
          {isPlayerTurn && activeUnit && getUnitAbilities(activeUnit).filter(a => a.id !== 'MOVE').map(skill => (
            <button key={skill.id} onClick={() => setSelectedAbility(skill)} onMouseEnter={() => setHoveredSkill(skill)} onMouseLeave={() => setHoveredSkill(null)} className={`w-14 h-14 border-2 transition-all flex flex-col items-center justify-center ${selectedAbility?.id === skill.id ? 'border-amber-400 bg-amber-900/40 -translate-y-2' : 'border-amber-900/30 bg-black/40 hover:border-amber-600'}`}>
              <span className="text-2xl">{skill.icon}</span>
              <span className="absolute top-1 right-1 text-[8px] font-mono text-amber-600">{skill.apCost}</span>
            </button>
          ))}
        </div>

        <div className="w-64 flex flex-col items-end gap-3">
          <div className="h-12 overflow-hidden flex flex-col-reverse text-[9px] text-slate-500 text-right">
            {state.combatLog.map((log, i) => <div key={i} className="opacity-80">{log}</div>)}
          </div>
          {isPlayerTurn ? (
            <button onClick={nextTurn} className="px-8 py-2 bg-amber-900/10 border border-amber-600/50 text-amber-500 font-bold text-xs hover:bg-amber-600 hover:text-white transition-all tracking-widest uppercase">结束回合</button>
          ) : (
            <div className="text-amber-900 animate-pulse font-bold tracking-widest text-sm uppercase">敌军行动...</div>
          )}
        </div>
      </div>

      {hoveredSkill && (
        <div className="fixed bottom-36 left-1/2 -translate-x-1/2 w-64 bg-black border border-amber-900/50 p-3 z-[100] shadow-2xl">
          <div className="text-amber-500 font-bold text-xs mb-1">{hoveredSkill.name}</div>
          <p className="text-[10px] text-slate-400 italic">“{hoveredSkill.description}”</p>
        </div>
      )}
    </div>
  );
};

function lightenColor(color: string, percent: number) {
    const num = parseInt(color.replace("#",""), 16), amt = Math.round(2.55 * percent),
    R = (num >> 16) + amt, B = (num >> 8 & 0x00FF) + amt, G = (num & 0x0000FF) + amt;
    return "#" + (0x1000000 + (R<255?R<1?0:R:255)*0x10000 + (B<255?B<1?0:B:255)*0x100 + (G<255?G<1?0:G:255)).toString(16).slice(1);
}
