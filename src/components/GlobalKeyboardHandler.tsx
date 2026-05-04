'use client';

import { useEffect } from 'react';

/**
 * 全局键盘快捷键处理器
 * 支持 Command+Z (Mac) / Ctrl+Z (Windows) 关闭弹窗
 */
export default function GlobalKeyboardHandler() {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Command+Z (Mac) 或 Ctrl+Z (Windows)
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey && !e.altKey) {
        // 阻止默认行为
        e.preventDefault();
        
        // 触发全局关闭弹窗事件
        const closeEvent = new CustomEvent('global-close-modal', {
          detail: { key: 'escape' }
        });
        window.dispatchEvent(closeEvent);
      }
      
      // Escape 键关闭弹窗
      if (e.key === 'Escape') {
        const closeEvent = new CustomEvent('global-close-modal', {
          detail: { key: 'escape' }
        });
        window.dispatchEvent(closeEvent);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return null;
}
