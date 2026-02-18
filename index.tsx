
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { App } from './App.tsx';

(() => {
  const minRecommendedMajor = 111;

  const getChromeMajor = (ua: string): number | null => {
    const match = ua.match(/Chrome\/(\d+)(?:\.\d+)?/i);
    if (!match) return null;
    const major = Number(match[1]);
    return Number.isFinite(major) ? major : null;
  };

  try {
    const ua = navigator.userAgent || '';
    const major = getChromeMajor(ua);
    if (major == null || major >= minRecommendedMajor) return;

    alert(
      `检测到当前 WebView 内核版本过低（Chrome/WebView ${major}）。\n` +
      `这会导致界面异常，请先升级后再进入游戏。\n\n` +
      `升级指引：\n` +
      `1）打开手机应用商店（应用市场）\n` +
      `2）搜索并更新：Android System WebView\n` +
      `3）若系统提供“系统 WebView 组件”，请一并更新\n` +
      `4）完成后重启手机，再重新打开游戏\n\n` +
      `若商店搜不到 WebView：\n` +
      `- 进入 设置 > 应用管理 > Android System WebView\n` +
      `- 在应用详情页检查更新或启用该组件\n` +
      `- 或执行一次系统更新后重试`
    );
  } catch {
    // Ignore reminder failures; game should still continue.
  }
})();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
