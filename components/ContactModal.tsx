
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
      <div className="w-full max-w-lg max-h-[90vh] bg-[#0d0906] border border-amber-900/40 shadow-2xl relative flex flex-col mx-4">
        {/* 竹简纹理背景 */}
        <div className="absolute inset-0 opacity-[0.04] pointer-events-none"
          style={{ backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 3px, rgba(139,69,19,0.5) 3px, rgba(139,69,19,0.5) 4px)' }}
        />

        {/* 标题 */}
        <div className="relative shrink-0 px-6 pt-5 pb-3 border-b border-amber-900/20">
          <h3 className="text-lg text-amber-500 tracking-[0.2em] font-bold text-center">联 系 开 发 者</h3>
          <p className="text-[10px] text-amber-700/50 tracking-widest text-center mt-1">与伍同行，共话战国</p>
        </div>

        {/* 内容区 - 横向排列适配横屏 */}
        <div className="relative flex-1 overflow-y-auto min-h-0 px-6 py-4">
          <div className="flex flex-row items-start justify-center gap-6">
            {/* QQ群 */}
            <div className="flex flex-col items-center gap-2 flex-1">
              <span className="text-amber-600/60 text-[10px] tracking-widest uppercase">官方交流QQ群</span>
              <div className="text-amber-400 text-base tracking-wider font-mono bg-amber-900/10 px-3 py-1.5 border border-amber-900/30">
                1042747173
              </div>
            </div>

            {/* 小红书 */}
            <div className="flex flex-col items-center gap-2 flex-1">
              <span className="text-amber-600/60 text-[10px] tracking-widest uppercase">小红书</span>
              <div className="text-amber-400 text-base tracking-wider bg-amber-900/10 px-3 py-1.5 border border-amber-900/30 text-center">
                法特尔 <span className="text-amber-600/60 text-xs ml-1">(27272608804)</span>
              </div>
            </div>
          </div>
        </div>

        {/* 关闭按钮 */}
        <div className="relative shrink-0 px-6 pb-4 pt-2">
          <button
            onClick={onClose}
            className="w-full py-2.5 border border-amber-800/40 hover:border-amber-600/60 text-amber-600/80 hover:text-amber-400 text-sm tracking-[0.3em] transition-all hover:bg-amber-900/10"
          >
            返 回
          </button>
        </div>
      </div>
    </div>
  );
};
