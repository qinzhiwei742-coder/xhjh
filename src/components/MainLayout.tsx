'use client';

import { ReactNode, useState, useRef, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import LoginPage from './LoginPage';
import Image from 'next/image';

// 门店体系类型
export type StoreSystem = 'meili' | 'mama';

// 门店体系配置
export const STORE_SYSTEMS = [
  { id: 'mama' as const, name: '妈妈盒子', color: '#00b42a' },
  { id: 'meili' as const, name: '美丽妈妈', color: '#ff7d00' },
];

interface MainLayoutProps {
  children: ReactNode;
  search?: string;
  onSearchChange?: (value: string) => void;
  onRefresh?: () => void;
  onResetFilters?: () => void;
  onAddStore?: () => void;
  onBatchImport?: () => void;
  onBatchContactImport?: () => void;
  onDeleteStore?: () => void;
  onOpenAiConfig?: () => void;
  onExportStores?: () => void;
  onOpenExport?: () => void;
  onOpenFormat?: () => void;
  isDataMode?: boolean;
  onDataModeChange?: (isDataMode: boolean) => void;
  currentSystem?: StoreSystem;
  onSystemChange?: (system: StoreSystem) => void;
  // 智能筛选相关 props
  aiFilterQuery?: string;
  onAiFilterQueryChange?: (value: string) => void;
  onAiFilter?: () => void;
  aiFiltersCount?: number;
  onClearAiFilter?: () => void;
  isAiFiltering?: boolean;
  onOpenAdvancedFilter?: () => void;
  hasAdvancedFilters?: boolean;
}

export default function MainLayout({
  children,
  search,
  onSearchChange,
  onRefresh,
  onResetFilters,
  onAddStore,
  onBatchImport,
  onBatchContactImport,
  onDeleteStore,
  onOpenAiConfig,
  onExportStores,
  onOpenExport,
  onOpenFormat,
  isDataMode = false,
  onDataModeChange,
  currentSystem = 'mama',
  onSystemChange,
  onOpenOperationLogs,
  // 智能筛选相关 props
  aiFilterQuery = '',
  onAiFilterQueryChange,
  onAiFilter,
  aiFiltersCount = 0,
  onClearAiFilter,
  isAiFiltering = false,
  onOpenAdvancedFilter,
  hasAdvancedFilters = false,
}: MainLayoutProps & { onOpenOperationLogs?: () => void }) {
  const { isAuthenticated, user, logout } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 判断是否为管理员
  const isAdmin = user?.id === 'admin';

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <div className="min-h-screen" style={{ background: '#f7f8fa', position: 'relative' }}>
      {/* 水印 */}
      <div className="watermark">
        <div className="watermark-content">
          {Array.from({ length: 100 }).map((_, i) => (
            <span key={i} className="watermark-item">
              星海计划 {user?.name}
            </span>
          ))}
        </div>
      </div>

      {/* Header */}
      <header 
        style={{ 
          background: '#fff',
          borderBottom: '1px solid #f2f3f5',
          position: 'sticky',
          top: 0,
          zIndex: 100
        }}
      >
        <div style={{ 
          maxWidth: '100%', 
          margin: '0 auto', 
          padding: '0 20px',
          height: '56px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          {/* 左侧：Logo + 主导航 */}
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div className="nav-logo">
              <Image 
                src="/stars-logo.png" 
                alt="星海计划" 
                width={32} 
                height={32}
                style={{ borderRadius: '6px' }}
              />
              <span className="hide-mobile">星海计划</span>
            </div>
            
            {/* 门店体系切换Tab - 参考设计风格 */}
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              marginLeft: '24px',
              background: '#f7f8fa',
              borderRadius: '6px',
              padding: '4px',
              gap: '2px'
            }}>
              {STORE_SYSTEMS.map((system) => (
                <button
                  key={system.id}
                  onClick={() => onSystemChange?.(system.id)}
                  style={{
                    padding: '6px 16px',
                    borderRadius: '4px',
                    border: 'none',
                    background: currentSystem === system.id ? '#fff' : 'transparent',
                    color: currentSystem === system.id ? system.color : '#4e5969',
                    fontSize: '13px',
                    fontWeight: currentSystem === system.id ? '500' : '400',
                    cursor: 'pointer',
                    boxShadow: currentSystem === system.id ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                    transition: 'all 0.2s'
                  }}
                >
                  {system.name}
                </button>
              ))}
            </div>
            
            {/* 搜索框 - 参考设计风格 */}
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              marginLeft: '24px',
              background: '#f7f8fa',
              borderRadius: '6px',
              padding: '6px 12px',
              width: '280px'
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#86909c" strokeWidth="2" style={{ flexShrink: 0 }}>
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input
                type="text"
                placeholder="搜索门店名称、ID、地区..."
                value={search || ''}
                onChange={(e) => onSearchChange?.(e.target.value)}
                style={{ 
                  border: 'none', 
                  background: 'transparent', 
                  outline: 'none',
                  marginLeft: '8px',
                  fontSize: '13px',
                  width: '100%',
                  color: '#1d2129'
                }}
              />
            </div>
            
            {/* AI筛选输入框 - 单纯输入框，点击执行按钮或按回车筛选 */}
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              marginLeft: '24px',
              background: '#fff',
              borderRadius: '6px',
              padding: '4px 8px',
              border: '1px solid #e5e6eb',
              width: '320px'
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#165dff" strokeWidth="2" style={{ flexShrink: 0 }}>
                <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z"/>
                <path d="M12 6a1 1 0 0 0-1 1v5a1 1 0 0 0 .29.71l3 3a1 1 0 0 0 1.42-1.42L13 11.59V7a1 1 0 0 0-1-1z"/>
              </svg>
              <input
                type="text"
                placeholder="输入筛选条件"
                value={aiFilterQuery || ''}
                onChange={(e) => onAiFilterQueryChange?.(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && aiFilterQuery?.trim()) {
                    onAiFilter?.();
                  }
                }}
                style={{ 
                  border: 'none', 
                  background: 'transparent', 
                  outline: 'none',
                  marginLeft: '8px',
                  fontSize: '13px',
                  width: '200px',
                  color: '#1d2129'
                }}
              />
              <button
                onClick={onAiFilter}
                disabled={isAiFiltering || !aiFilterQuery?.trim()}
                style={{
                  background: aiFilterQuery?.trim() ? '#165dff' : '#e5e6eb',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '4px 10px',
                  fontSize: '12px',
                  cursor: aiFilterQuery?.trim() ? 'pointer' : 'not-allowed',
                  marginLeft: '8px',
                  whiteSpace: 'nowrap'
                }}
              >
                {isAiFiltering ? '执行中...' : '执行'}
              </button>
            </div>
            
            {/* 刷新按钮 */}
            <button
              onClick={onRefresh}
              title="刷新数据"
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '6px',
                border: '1px solid #e5e6eb',
                background: '#fff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginLeft: '8px',
                transition: 'all 0.2s',
                pointerEvents: 'auto',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#165dff';
                e.currentTarget.style.color = '#165dff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#e5e6eb';
                e.currentTarget.style.color = '#86909c';
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 4v6h-6"></path>
                <path d="M1 20v-6h6"></path>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
              </svg>
            </button>

            {/* 重置筛选按钮 */}
            {onResetFilters && (
              <button
                onClick={onResetFilters}
                title="重置所有筛选"
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '6px',
                  border: '1px solid #e5e6eb',
                  background: '#fff',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginLeft: '6px',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#ff7d00';
                  e.currentTarget.style.color = '#ff7d00';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#e5e6eb';
                  e.currentTarget.style.color = '#86909c';
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
                  <line x1="4" y1="21" x2="20" y2="5"></line>
                </svg>
              </button>
            )}

            {/* 清除筛选按钮 */}
            {aiFiltersCount > 0 && (
              <button
                onClick={onClearAiFilter}
                style={{
                  padding: '6px 12px',
                  fontSize: '13px',
                  borderRadius: '6px',
                  border: '1px solid #f53f3f',
                  background: '#fff',
                  color: '#f53f3f',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                清除
              </button>
            )}
          </div>

          {/* 右侧 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {/* 当前用户 - 带下拉菜单 */}
            <div 
              ref={userMenuRef}
              style={{ position: 'relative' }}
            >
              <div 
                onClick={() => setShowUserMenu(!showUserMenu)}
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '8px',
                  padding: '4px 8px 4px 4px',
                  background: '#e8f3ff',
                  borderRadius: '20px',
                  cursor: 'pointer'
                }}
              >
                <div 
                  style={{ 
                    width: '32px', 
                    height: '32px', 
                    borderRadius: '50%', 
                    background: '#165dff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontSize: '13px',
                    fontWeight: '500'
                  }}
                >
                  {user?.name?.charAt(0) || 'A'}
                </div>
                <span style={{ fontSize: '13px', color: '#165dff', fontWeight: '500' }} className="hide-mobile">
                  {user?.name}
                </span>
                <svg 
                  width="12" 
                  height="12" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  stroke="#165dff" 
                  strokeWidth="2"
                  style={{ 
                    transform: showUserMenu ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s'
                  }}
                >
                  <path d="M6 9l6 6 6-6"/>
                </svg>
              </div>

              {/* 下拉菜单 */}
              {showUserMenu && (
                <div 
                  style={{ 
                    position: 'absolute',
                    top: '100%',
                    right: 0,
                    marginTop: '8px',
                    background: '#fff',
                    borderRadius: '8px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    border: '1px solid #e5e6eb',
                    minWidth: '140px',
                    overflow: 'hidden',
                    zIndex: 1000
                  }}
                >
                  {/* 管理员功能 */}
                  {isAdmin && (
                    <>
                      <button
                        onClick={() => {
                          onBatchImport?.();
                          setShowUserMenu(false);
                        }}
                        style={{
                          width: '100%',
                          padding: '10px 16px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          border: 'none',
                          background: 'transparent',
                          cursor: 'pointer',
                          fontSize: '13px',
                          color: '#4e5969',
                          textAlign: 'left',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = '#f7f8fa';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                          <polyline points="17 8 12 3 7 8"></polyline>
                          <line x1="12" y1="3" x2="12" y2="15"></line>
                        </svg>
                        导入门店
                      </button>
                      <button
                        onClick={() => {
                          onBatchContactImport?.();
                          setShowUserMenu(false);
                        }}
                        style={{
                          width: '100%',
                          padding: '10px 16px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          border: 'none',
                          background: 'transparent',
                          cursor: 'pointer',
                          fontSize: '13px',
                          color: '#4e5969',
                          textAlign: 'left',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = '#f7f8fa';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                          <circle cx="9" cy="7" r="4"></circle>
                          <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                          <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                        </svg>
                        导入联系人
                      </button>
                      <button
                        onClick={() => {
                          onAddStore?.();
                          setShowUserMenu(false);
                        }}
                        style={{
                          width: '100%',
                          padding: '10px 16px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          border: 'none',
                          background: 'transparent',
                          cursor: 'pointer',
                          fontSize: '13px',
                          color: '#4e5969',
                          textAlign: 'left',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = '#f7f8fa';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="12" y1="5" x2="12" y2="19"></line>
                          <line x1="5" y1="12" x2="19" y2="12"></line>
                        </svg>
                        添加门店
                      </button>
                      <div style={{ height: '1px', background: '#e5e6eb', margin: '4px 0' }}></div>
                      <button
                        onClick={() => {
                          onOpenExport?.();
                          setShowUserMenu(false);
                        }}
                        style={{
                          width: '100%',
                          padding: '10px 16px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          border: 'none',
                          background: 'transparent',
                          cursor: 'pointer',
                          fontSize: '13px',
                          color: '#165dff',
                          textAlign: 'left',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'rgba(22, 93, 255, 0.1)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                          <polyline points="7 10 12 15 17 10"></polyline>
                          <line x1="12" y1="15" x2="12" y2="3"></line>
                        </svg>
                        导出数据
                      </button>
                      <button
                        onClick={() => {
                          onOpenFormat?.();
                          setShowUserMenu(false);
                        }}
                        style={{
                          width: '100%',
                          padding: '10px 16px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          border: 'none',
                          background: 'transparent',
                          cursor: 'pointer',
                          fontSize: '13px',
                          color: '#f53f3f',
                          textAlign: 'left',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'rgba(245, 63, 63, 0.1)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>
                        </svg>
                        格式化数据
                      </button>
                      {/* 分隔线 */}
                      <div style={{
                        height: '1px',
                        background: '#e5e6eb',
                        margin: '4px 0',
                      }} />
                      <button
                        onClick={() => {
                          onDeleteStore?.();
                          setShowUserMenu(false);
                        }}
                        style={{
                          width: '100%',
                          padding: '10px 16px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          border: 'none',
                          background: 'transparent',
                          cursor: 'pointer',
                          fontSize: '13px',
                          color: '#f53f3f',
                          textAlign: 'left',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = '#ffece8';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6"></polyline>
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                        删除门店
                      </button>
                      <button
                        onClick={() => {
                          onOpenAiConfig?.();
                          setShowUserMenu(false);
                        }}
                        style={{
                          width: '100%',
                          padding: '10px 16px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          border: 'none',
                          background: 'transparent',
                          cursor: 'pointer',
                          fontSize: '13px',
                          color: '#4e5969',
                          textAlign: 'left',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = '#f7f8fa';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z"></path>
                          <path d="M12 16v-4"></path>
                          <path d="M12 8h.01"></path>
                        </svg>
                        AI配置
                      </button>
                      <button
                        onClick={() => {
                          onOpenOperationLogs?.();
                          setShowUserMenu(false);
                        }}
                        style={{
                          width: '100%',
                          padding: '10px 16px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          border: 'none',
                          background: 'transparent',
                          cursor: 'pointer',
                          fontSize: '13px',
                          color: '#4e5969',
                          textAlign: 'left',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = '#f7f8fa';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                          <polyline points="14 2 14 8 20 8"></polyline>
                          <line x1="16" y1="13" x2="8" y2="13"></line>
                          <line x1="16" y1="17" x2="8" y2="17"></line>
                          <polyline points="10 9 9 9 8 9"></polyline>
                        </svg>
                        操作日志
                      </button>
                      <div style={{ height: '1px', background: '#e5e6eb', margin: '4px 0' }}></div>
                    </>
                  )}
                  
                  {/* 退出登录 */}
                  <button
                    onClick={() => {
                      logout();
                      setShowUserMenu(false);
                    }}
                    style={{
                      width: '100%',
                      padding: '10px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      fontSize: '13px',
                      color: '#4e5969',
                      textAlign: 'left',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#f7f8fa';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                      <polyline points="16 17 21 12 16 7"></polyline>
                      <line x1="21" y1="12" x2="9" y2="12"></line>
                    </svg>
                    退出登录
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ position: 'relative', zIndex: 1 }}>
        {children}
      </main>

      {/* 消息浮动按钮 */}
      <div className="message-float hide-mobile">
        <svg className="message-float-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
        </svg>
        <span className="message-float-badge">2</span>
      </div>
    </div>
  );
}
