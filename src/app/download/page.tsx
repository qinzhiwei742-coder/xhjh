'use client';

import { useState } from 'react';

export default function DownloadPage() {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res = await fetch('/api/download-requirements');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'REQUIREMENTS.md';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('下载失败:', error);
      alert('下载失败，请重试');
    }
    setDownloading(false);
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #f5f7fa 0%, #e4e8ec 100%)',
      padding: '20px'
    }}>
      <div style={{
        background: '#fff',
        borderRadius: '16px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.08)',
        padding: '48px',
        maxWidth: '480px',
        width: '100%',
        textAlign: 'center'
      }}>
        {/* Icon */}
        <div style={{
          width: '72px',
          height: '72px',
          background: 'linear-gradient(135deg, #165dff 0%, #4080ff 100%)',
          borderRadius: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 24px',
          boxShadow: '0 4px 12px rgba(22, 93, 255, 0.3)'
        }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
            <polyline points="10 9 9 9 8 9"></polyline>
          </svg>
        </div>

        {/* Title */}
        <h1 style={{
          fontSize: '24px',
          fontWeight: '600',
          color: '#1d2129',
          marginBottom: '12px'
        }}>
          星海计划【1.1】需求文档
        </h1>

        {/* Description */}
        <p style={{
          fontSize: '14px',
          color: '#86909c',
          marginBottom: '32px',
          lineHeight: '1.6'
        }}>
          完整的产品需求文档，包含项目概述、功能设计、数据库设计、API 接口等内容
        </p>

        {/* File Info */}
        <div style={{
          background: '#f7f8fa',
          borderRadius: '8px',
          padding: '16px',
          marginBottom: '24px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#165dff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
          </svg>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: '14px', fontWeight: '500', color: '#1d2129' }}>REQUIREMENTS.md</div>
            <div style={{ fontSize: '12px', color: '#86909c' }}>Markdown 文档 · 约 20KB</div>
          </div>
        </div>

        {/* Download Button */}
        <button
          onClick={handleDownload}
          disabled={downloading}
          style={{
            width: '100%',
            height: '48px',
            background: downloading ? '#94b8ff' : '#165dff',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            fontSize: '16px',
            fontWeight: '500',
            cursor: downloading ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            transition: 'all 0.2s'
          }}
        >
          {downloading ? (
            <>
              <div className="loading-spinner" style={{
                width: '18px',
                height: '18px',
                border: '2px solid rgba(255,255,255,0.3)',
                borderTopColor: '#fff',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite'
              }}></div>
              下载中...
            </>
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              一键下载
            </>
          )}
        </button>

        {/* Tip */}
        <p style={{
          fontSize: '12px',
          color: '#c9cdd4',
          marginTop: '20px'
        }}>
          下载后可使用任意 Markdown 编辑器打开
        </p>
      </div>

      <style jsx>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
