
import React from 'react';

interface ContactModalProps {
  onClose: () => void;
}

export const ContactModal: React.FC<ContactModalProps> = ({ onClose }) => {
  return (
    <div 
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md bg-[#0d0906] border border-amber-900/40 shadow-2xl relative overflow-hidden mx-4">
        {/* 竹简纹理背景 */}
        <div className="absolute inset-0 opacity-[0.04] pointer-events-none" 
          style={{ backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 3px, rgba(139,69,19,0.5) 3px, rgba(139,69,19,0.5) 4px)' }} 
        />
        
        {/* 标题 */}
        <div className="relative px-8 pt-8 pb-4 border-b border-amber-900/20">
          <h3 className="text-xl text-amber-500 tracking-[0.4em] font-bold text-center">联 系 我 们</h3>
          <p className="text-xs text-amber-700/50 tracking-widest text-center mt-2">与伍同行，共话战国</p>
        </div>

        {/* 内容区 */}
        <div className="relative px-8 py-8 space-y-8">
          
          {/* QQ群 */}
          <div className="flex flex-col items-center gap-2">
            <span className="text-amber-600/60 text-xs tracking-widest uppercase">官方交流QQ群</span>
            <div className="text-amber-400 text-lg tracking-wider font-mono bg-amber-900/10 px-4 py-2 border border-amber-900/30">
              1042747173
            </div>
          </div>

          {/* 小红书 */}
          <div className="flex flex-col items-center gap-2">
            <span className="text-amber-600/60 text-xs tracking-widest uppercase">小红书</span>
            <div className="text-amber-400 text-lg tracking-wider bg-amber-900/10 px-4 py-2 border border-amber-900/30 text-center">
              法特尔 <span className="text-amber-600/60 text-sm ml-1">(27272608804)</span>
            </div>
          </div>

          {/* 微信打赏码 */}
          <div className="flex flex-col items-center gap-4">
            <span className="text-amber-600/60 text-xs tracking-widest uppercase">支持作者</span>
            <div className="w-48 h-48 bg-amber-900/5 border border-amber-900/20 flex items-center justify-center relative group">
              {/* 这里放打赏码图片 */}
              <img 
                src="/images/wechat_reward.png" 
                alt="微信打赏码" 
                className="w-full h-full object-contain opacity-80 group-hover:opacity-100 transition-opacity"
                onError={(e) => {
                  // 如果图片不存在，显示占位文字
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                  const parent = target.parentElement;
                  if (parent) {
                    const placeholder = document.createElement('div');
                    placeholder.className = 'text-amber-900/30 text-[10px] text-center p-4';
                    placeholder.innerText = '请在 public/images/ 目录下添加 wechat_reward.png 图片';
                    parent.appendChild(placeholder);
                  }
                }}
              />
              {/* 四角装饰 */}
              <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-amber-700/40" />
              <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-amber-700/40" />
              <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-amber-700/40" />
              <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-amber-700/40" />
            </div>
            <p className="text-amber-700/40 text-[10px] tracking-widest">您的支持是我们创作的最大动力</p>
          </div>
        </div>

        {/* 关闭按钮 */}
        <div className="relative px-8 pb-8">
          <button 
            onClick={onClose}
            className="w-full py-3 border border-amber-800/40 hover:border-amber-600/60 text-amber-600/80 hover:text-amber-400 text-sm tracking-[0.3em] transition-all hover:bg-amber-900/10"
          >
            返 回
          </button>
        </div>
      </div>
    </div>
  );
};
