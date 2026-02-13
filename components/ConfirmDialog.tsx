import React from 'react';

interface ConfirmDialogProps {
  open: boolean;
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title = '确认操作',
  message,
  confirmText = '确认',
  cancelText = '取消',
  onConfirm,
  onCancel,
}) => {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[320] flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="w-full max-w-md bg-[#0d0906] border border-amber-900/40 shadow-2xl relative overflow-hidden mx-4">
        <div
          className="absolute inset-0 opacity-[0.04] pointer-events-none"
          style={{
            backgroundImage:
              'repeating-linear-gradient(90deg, transparent, transparent 3px, rgba(139,69,19,0.5) 3px, rgba(139,69,19,0.5) 4px)',
          }}
        />

        <div className="relative px-8 pt-7 pb-4 border-b border-amber-900/20">
          <h3 className="text-lg text-amber-500 tracking-[0.2em] font-bold text-center">{title}</h3>
        </div>

        <div className="relative px-8 py-7">
          <p className="text-sm text-amber-300/90 text-center leading-relaxed">{message}</p>
        </div>

        <div className="relative px-8 pb-8 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 border border-slate-700/50 text-slate-400 hover:text-slate-200 text-sm tracking-widest transition-all hover:border-slate-600"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 border border-amber-700/60 bg-amber-900/20 text-amber-400 hover:bg-amber-800/40 text-sm tracking-widest transition-all"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
