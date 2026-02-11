
import React, { useState, useEffect, useRef } from 'react';
import { ContactModal } from './ContactModal';

interface MainMenuProps {
  onNewGame: () => void;
  onLoadGame: () => void;
  hasSaveData: boolean;
}

// 粒子系统 - 模拟战火余烬
interface Ember {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
}

const QUOTES = [
  '"秦王扫六合，虎视何雄哉！"',
  '"风萧萧兮易水寒，壮士一去兮不复还。"',
  '"国虽大，好战必亡；天下虽安，忘战必危。"',
  '"兵者，国之大事，死生之地，存亡之道，不可不察也。"',
  '"善用兵者，役不再籍，粮不三载。"',
];

export const MainMenu: React.FC<MainMenuProps> = ({ onNewGame, onLoadGame, hasSaveData }) => {
  const [showContent, setShowContent] = useState(false);
  const [showButtons, setShowButtons] = useState(false);
  const [showQuote, setShowQuote] = useState(false);
  const [showContact, setShowContact] = useState(false);
  const [quoteIndex] = useState(() => Math.floor(Math.random() * QUOTES.length));
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const embersRef = useRef<Ember[]>([]);
  const animRef = useRef<number>(0);

  // 淡入动画序列
  useEffect(() => {
    const t1 = setTimeout(() => setShowContent(true), 300);
    const t2 = setTimeout(() => setShowQuote(true), 1200);
    const t3 = setTimeout(() => setShowButtons(true), 2000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  // 余烬粒子效果
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const spawnEmber = () => {
      const side = Math.random();
      embersRef.current.push({
        x: Math.random() * canvas.width,
        y: canvas.height + 10,
        vx: (Math.random() - 0.5) * 0.8,
        vy: -(0.3 + Math.random() * 0.7),
        life: 1,
        maxLife: 3 + Math.random() * 4,
        size: 1 + Math.random() * 2,
      });
    };

    let lastSpawn = 0;
    const animate = (time: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // 每隔一段时间生成新粒子
      if (time - lastSpawn > 120) {
        spawnEmber();
        lastSpawn = time;
      }

      embersRef.current = embersRef.current.filter(e => {
        e.x += e.vx;
        e.y += e.vy;
        e.life -= 0.016;
        
        const alpha = Math.max(0, e.life / e.maxLife);
        const r = 200 + Math.floor(Math.random() * 55);
        const g = 120 + Math.floor(Math.random() * 60);
        const b = 30;
        
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.size * alpha, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r},${g},${b},${alpha * 0.6})`;
        ctx.fill();
        
        // 光晕
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.size * alpha * 3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r},${g},${b},${alpha * 0.1})`;
        ctx.fill();
        
        return e.life > 0;
      });

      animRef.current = requestAnimationFrame(animate);
    };
    animRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animRef.current);
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-black overflow-hidden select-none" style={{ fontFamily: "'Noto Serif SC', serif" }}>
      {/* 粒子画布 */}
      <canvas ref={canvasRef} className="absolute inset-0 z-0 pointer-events-none" />

      {/* 背景暗纹 - 竹简纹理 */}
      <div className="absolute inset-0 z-0 opacity-[0.03]" 
        style={{ backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 3px, rgba(139,69,19,0.5) 3px, rgba(139,69,19,0.5) 4px)' }} 
      />

      {/* 顶部淡入渐变 */}
      <div className="absolute top-0 left-0 right-0 h-40 z-10"
        style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.8), transparent)' }}
      />

      {/* 底部淡出渐变 */}
      <div className="absolute bottom-0 left-0 right-0 h-60 z-10"
        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.9), transparent)' }}
      />

      {/* 主内容区 */}
      <div className="relative z-20 flex flex-col items-center justify-center h-full px-8">
        
        {/* 装饰性上边线 */}
        <div className={`transition-all duration-[2000ms] ease-out ${showContent ? 'opacity-100 w-64' : 'opacity-0 w-0'}`}>
          <div className="h-px bg-gradient-to-r from-transparent via-amber-700/60 to-transparent mb-8" />
        </div>

        {/* 游戏副标题 */}
        <div className={`transition-all duration-[1500ms] ease-out ${showContent ? 'opacity-70 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
          <p className="text-amber-600/70 text-sm tracking-[1em] uppercase mb-4">Warring States</p>
        </div>

        {/* 游戏标题 */}
        <div className={`transition-all duration-[2000ms] ease-out ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-8'}`}>
          <h1 className="text-6xl md:text-7xl font-bold text-transparent bg-clip-text mb-2 tracking-[0.15em] leading-tight text-center"
            style={{ 
              backgroundImage: 'linear-gradient(180deg, #d4a44a 0%, #b8860b 40%, #8b6508 100%)',
              textShadow: '0 0 80px rgba(212,164,74,0.3)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            战国
          </h1>
          <h2 className="text-2xl md:text-3xl text-amber-600/90 tracking-[0.5em] text-center font-light mt-2"
            style={{ textShadow: '0 0 40px rgba(180,130,50,0.2)' }}
          >
            与伍同行
          </h2>
        </div>

        {/* 装饰性分隔线 */}
        <div className={`flex items-center gap-4 my-8 transition-all duration-[2000ms] ease-out ${showContent ? 'opacity-100 w-80' : 'opacity-0 w-0'}`}>
          <div className="flex-1 h-px bg-gradient-to-r from-transparent to-amber-800/40" />
          <div className="w-2 h-2 rotate-45 border border-amber-700/50" />
          <div className="flex-1 h-px bg-gradient-to-l from-transparent to-amber-800/40" />
        </div>

        {/* 古诗引言 */}
        <div className={`transition-all duration-[2000ms] ease-out mb-12 ${showQuote ? 'opacity-60 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <p className="text-amber-500/50 text-sm tracking-widest italic text-center max-w-md">
            {QUOTES[quoteIndex]}
          </p>
        </div>

        {/* 菜单按钮区 */}
        <div className={`flex flex-col items-center gap-4 transition-all duration-[1500ms] ease-out ${showButtons ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          
          {/* 新战役 */}
          <button 
            onClick={onNewGame}
            className="group relative w-72 py-4 text-center overflow-hidden"
          >
            <div className="absolute inset-0 border border-amber-700/40 group-hover:border-amber-500/80 transition-all duration-500" />
            <div className="absolute inset-0 bg-amber-900/0 group-hover:bg-amber-900/20 transition-all duration-500" />
            <div className="absolute inset-y-0 left-0 w-0 group-hover:w-full bg-gradient-to-r from-amber-800/10 to-transparent transition-all duration-700" />
            <span className="relative text-amber-500 group-hover:text-amber-300 text-lg tracking-[0.4em] font-bold transition-colors duration-300">
              新 战 役
            </span>
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-0 group-hover:w-3/4 h-px bg-gradient-to-r from-transparent via-amber-500 to-transparent transition-all duration-500" />
          </button>

          {/* 续读简牍 (读档) */}
          <button 
            onClick={hasSaveData ? onLoadGame : undefined}
            disabled={!hasSaveData}
            className={`group relative w-72 py-3 text-center overflow-hidden ${!hasSaveData ? 'cursor-not-allowed' : ''}`}
          >
            <div className={`absolute inset-0 border transition-all duration-500 ${hasSaveData ? 'border-amber-900/30 group-hover:border-amber-600/60' : 'border-slate-800/30'}`} />
            <div className={`absolute inset-0 transition-all duration-500 ${hasSaveData ? 'bg-amber-900/0 group-hover:bg-amber-900/10' : ''}`} />
            <span className={`relative text-sm tracking-[0.3em] transition-colors duration-300 ${hasSaveData ? 'text-amber-600/80 group-hover:text-amber-400' : 'text-slate-600/40'}`}>
              续 读 简 牍
            </span>
            {!hasSaveData && (
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] text-slate-700/50 tracking-wider">无存档</span>
            )}
          </button>

          {/* 联系开发者 */}
          <button 
            onClick={() => setShowContact(true)}
            className="group relative w-72 py-3 text-center overflow-hidden"
          >
            <div className="absolute inset-0 border border-amber-900/20 group-hover:border-amber-700/40 transition-all duration-500" />
            <span className="relative text-amber-700/60 group-hover:text-amber-500/80 text-sm tracking-[0.3em] transition-colors duration-300">
              联 系 开 发 者
            </span>
          </button>
        </div>

        {/* 版本信息：左下角，不挡按钮 */}
        <div className={`absolute bottom-4 left-4 flex flex-col items-start gap-1 transition-all duration-[2000ms] delay-[2500ms] ${showButtons ? 'opacity-40' : 'opacity-0'}`}>
          <p className="text-[10px] text-slate-600 tracking-[0.3em] uppercase">Version 1.0.0 — 战国项目组</p>
          <button 
            onClick={() => setShowContact(true)}
            className="text-[10px] text-amber-700/60 hover:text-amber-600 tracking-[0.2em] transition-colors"
          >
            联系开发者
          </button>
        </div>
      </div>

      {/* 联系开发者面板 */}
      {showContact && (
        <ContactModal onClose={() => setShowContact(false)} />
      )}
    </div>
  );
};
