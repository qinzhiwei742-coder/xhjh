'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';

export default function LoginPage() {
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError('');
    setIsLoading(true);

    if (!key.trim()) {
      setError('请输入密钥');
      setIsLoading(false);
      return;
    }

    const result = await login(key.trim());
    if (!result.success) {
      setError(result.error || '密钥错误');
    }
    setIsLoading(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  };

  return (
    <div 
      style={{ 
        minHeight: '100vh',
        width: '100%',
        backgroundImage: 'url(/login-bg.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
      }}
    >
      {/* 半透明遮罩层 */}
      <div 
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.3)',
        }}
      />

      {/* 登录输入区域 */}
      <div 
        style={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        {/* 密码输入框 */}
        <div style={{ position: 'relative' }}>
          <input
            type="password"
            value={key}
            onChange={(e) => {
              setKey(e.target.value);
              setError('');
            }}
            onKeyDown={handleKeyDown}
            placeholder="输入访问密钥..."
            autoFocus
            disabled={isLoading}
            style={{
              width: '280px',
              height: '56px',
              padding: '0 24px',
              fontSize: '16px',
              color: '#fff',
              background: 'rgba(255, 255, 255, 0.15)',
              backdropFilter: 'blur(10px)',
              border: error ? '1px solid #f53f3f' : '1px solid rgba(255, 255, 255, 0.3)',
              borderRadius: '28px',
              outline: 'none',
              transition: 'all 0.3s ease',
            }}
            onFocus={(e) => {
              e.target.style.background = 'rgba(255, 255, 255, 0.2)';
              e.target.style.borderColor = 'rgba(255, 255, 255, 0.5)';
            }}
            onBlur={(e) => {
              e.target.style.background = 'rgba(255, 255, 255, 0.15)';
              e.target.style.borderColor = error ? '#f53f3f' : 'rgba(255, 255, 255, 0.3)';
            }}
          />
          {error && (
            <p 
              style={{ 
                position: 'absolute',
                top: '100%',
                left: '50%',
                transform: 'translateX(-50%)',
                marginTop: '8px',
                color: '#f53f3f',
                fontSize: '13px',
                whiteSpace: 'nowrap',
                textShadow: '0 1px 2px rgba(0,0,0,0.5)',
              }}
            >
              {error}
            </p>
          )}
        </div>

        {/* 右侧箭头按钮 */}
        <button
          onClick={() => handleSubmit()}
          disabled={isLoading}
          style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            background: 'rgba(255, 255, 255, 0.15)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            cursor: isLoading ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.3s ease',
            opacity: isLoading ? 0.6 : 1,
          }}
          onMouseEnter={(e) => {
            if (!isLoading) {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.25)';
              e.currentTarget.style.transform = 'scale(1.05)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          {isLoading ? (
            <div 
              style={{
                width: '20px',
                height: '20px',
                border: '2px solid rgba(255, 255, 255, 0.3)',
                borderTopColor: '#fff',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }}
            />
          ) : (
            <svg 
              width="24" 
              height="24" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="#fff" 
              strokeWidth="2" 
              strokeLinecap="round" 
              strokeLinejoin="round"
            >
              <line x1="5" y1="12" x2="19" y2="12"></line>
              <polyline points="12 5 19 12 12 19"></polyline>
            </svg>
          )}
        </button>
      </div>

      {/* 加载动画样式 */}
      <style jsx global>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
