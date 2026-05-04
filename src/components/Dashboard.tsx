'use client';

import { useState, useCallback, useEffect } from 'react';
import MainLayout, { StoreSystem } from './MainLayout';
import StoreList from './StoreList';

export default function Dashboard() {
  const [search, setSearch] = useState('');
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [showBatchContactModal, setShowBatchContactModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showAiConfigModal, setShowAiConfigModal] = useState(false);
  const [showOperationLogsModal, setShowOperationLogsModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [isDataMode, setIsDataMode] = useState(false);
  const [currentSystem, setCurrentSystem] = useState<StoreSystem>(() => {
    // 从localStorage读取门店体系，如果没有则默认为mama
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('currentSystem');
      return (saved === 'mama' || saved === 'meili') ? saved : 'mama';
    }
    return 'mama';
  });
  
  // 智能筛选状态 - 提升到 Dashboard 以便传递给 MainLayout
  const [aiFilterQuery, setAiFilterQuery] = useState('');
  const [aiFiltersCount, setAiFiltersCount] = useState(0);
  const [isAiFiltering, setIsAiFiltering] = useState(false);
  const [onAiFilterCallback, setOnAiFilterCallback] = useState<(() => void) | null>(null);
  const [onClearAiFilterCallback, setOnClearAiFilterCallback] = useState<(() => void) | null>(null);
  const [showAdvancedFilter, setShowAdvancedFilter] = useState(false);
  const [onAdvancedFilterCallback, setOnAdvancedFilterCallback] = useState<((filters: Array<{ field: string; operator: string; value: string | number }>) => void) | null>(null);

  // 全局关闭弹窗（Command+Z / Ctrl+Z / Escape）
  useEffect(() => {
    const handleGlobalClose = () => {
      setShowAddModal(false);
      setShowBatchModal(false);
      setShowBatchContactModal(false);
      setShowDeleteModal(false);
      setShowAiConfigModal(false);
      setShowOperationLogsModal(false);
      setShowExportModal(false);
      setShowAdvancedFilter(false);
    };

    window.addEventListener('global-close-modal', handleGlobalClose);
    return () => window.removeEventListener('global-close-modal', handleGlobalClose);
  }, []);

  const handleRefresh = useCallback(() => {
    setRefreshTrigger(prev => prev + 1);
  }, []);

  const handleAddStore = useCallback(() => {
    setShowAddModal(true);
  }, []);

  const handleBatchImport = useCallback(() => {
    setShowBatchModal(true);
  }, []);

  const handleBatchContactImport = useCallback(() => {
    setShowBatchContactModal(true);
  }, []);

  const handleDeleteStore = useCallback(() => {
    setShowDeleteModal(true);
  }, []);

  const handleOpenAiConfig = useCallback(() => {
    setShowAiConfigModal(true);
  }, []);

  const handleOpenOperationLogs = useCallback(() => {
    setShowOperationLogsModal(true);
  }, []);

  const handleDataModeChange = useCallback((mode: boolean) => {
    setIsDataMode(mode);
  }, []);

  const handleSystemChange = useCallback((system: StoreSystem) => {
    setCurrentSystem(system);
    // 保存到localStorage，供详情页面使用
    localStorage.setItem('currentSystem', system);
    setRefreshTrigger(prev => prev + 1); // 切换门店体系时刷新数据
  }, []);

  // 智能筛选相关处理
  const handleAiFilter = useCallback(() => {
    if (onAiFilterCallback) {
      onAiFilterCallback();
    }
  }, [onAiFilterCallback]);

  const handleClearAiFilter = useCallback(() => {
    if (onClearAiFilterCallback) {
      onClearAiFilterCallback();
    }
  }, [onClearAiFilterCallback]);

  const handleAiFilterQueryChange = useCallback((value: string) => {
    setAiFilterQuery(value);
  }, []);

  const handleAiFilterCountChange = useCallback((count: number) => {
    setAiFiltersCount(count);
  }, []);

  const handleIsAiFilteringChange = useCallback((value: boolean) => {
    setIsAiFiltering(value);
  }, []);

  const handleAiFilterCallbackRef = useCallback((callback: (() => void) | null) => {
    setOnAiFilterCallback(() => callback);
  }, []);

  const handleClearAiFilterCallbackRef = useCallback((callback: (() => void) | null) => {
    setOnClearAiFilterCallback(() => callback);
  }, []);

  // 高级筛选器相关处理
  const handleOpenAdvancedFilter = useCallback(() => {
    setShowAdvancedFilter(true);
  }, []);

  const handleAdvancedFilterCallbackRef = useCallback((callback: ((filters: Array<{ field: string; operator: string; value: string | number }>) => void) | null) => {
    setOnAdvancedFilterCallback(() => callback);
  }, []);

  const handleResetFiltersCallbackRef = useCallback((callback: (() => void) | null) => {
    // 保留回调注册接口，但重置筛选不再依赖回调
  }, []);

  const handleResetFilters = useCallback(() => {
    setSearch('');
    setAiFilterQuery('');
    setAiFiltersCount(0);
    // 清除 localStorage 中的标签筛选持久化数据
    try {
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('selectedTagFilters_')) {
          localStorage.removeItem(key);
        }
      });
    } catch {}
    // 刷新数据
    setRefreshTrigger(prev => prev + 1);
  }, []);

  const handleApplyAdvancedFilter = useCallback((filters: Array<{ field: string; operator: string; value: string | number }>) => {
    if (onAdvancedFilterCallback) {
      onAdvancedFilterCallback(filters);
    }
    // 更新筛选计数
    setAiFiltersCount(filters.length);
  }, [onAdvancedFilterCallback]);

  // 导出数据（一键导出）
  const handleOpenExport = useCallback(() => {
    setShowExportModal(true);
  }, []);

  // 执行一键导出
  const handleExport = useCallback(async () => {
    setExportLoading(true);
    try {
      const res = await fetch('/api/export-all');
      if (!res.ok) {
        alert('导出失败');
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      // 从响应头获取文件名
      const disposition = res.headers.get('content-disposition');
      let filename = `星海计划数据备份-${new Date().toISOString().slice(0, 10)}.zip`;
      if (disposition) {
        const match = disposition.match(/filename\*=UTF-8''(.+)/);
        if (match) filename = decodeURIComponent(match[1]);
      }
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setShowExportModal(false);
      alert('导出成功');
    } catch (error) {
      console.error('导出数据失败:', error);
      alert('导出数据失败');
    } finally {
      setExportLoading(false);
    }
  }, []);

  // 格式化数据（全部格式化）
  const handleOpenFormat = useCallback(async () => {
    // 弹出密码确认对话框
    const password = prompt(`确定要格式化所有门店数据吗？\n\n警告：此操作将清空系统的所有门店数据及相关数据（联系人、跟进记录、标签等）！\n\n此操作不可恢复，请谨慎操作。\n\n请输入管理密码确认：`);
    if (!password) return;

    // 验证密码
    if (password !== '996') {
      alert('密码错误，无法执行格式化操作');
      return;
    }

    // 二次确认
    const confirmed = confirm(`最后确认：\n\n您确定要清空所有门店数据吗？\n\n此操作不可恢复！`);
    if (!confirmed) return;

    try {
      const res = await fetch('/api/stores/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}) // 不传 storeSystem，格式化所有数据
      });
      const data = await res.json();

      if (data.success) {
        alert(data.message || '格式化成功');
        setRefreshTrigger(prev => prev + 1);
      } else {
        alert(data.message || '格式化失败');
      }
    } catch (error) {
      console.error('格式化门店数据失败:', error);
      alert('格式化门店数据失败');
    }
  }, []);

  return (
    <MainLayout
      search={search}
      onSearchChange={setSearch}
      onRefresh={handleRefresh}
      onResetFilters={handleResetFilters}
      onAddStore={handleAddStore}
      onBatchImport={handleBatchImport}
      onBatchContactImport={handleBatchContactImport}
      onDeleteStore={handleDeleteStore}
      onOpenAiConfig={handleOpenAiConfig}
      onOpenExport={handleOpenExport}
      onOpenFormat={handleOpenFormat}
      onOpenOperationLogs={handleOpenOperationLogs}
      isDataMode={isDataMode}
      onDataModeChange={handleDataModeChange}
      currentSystem={currentSystem}
      onSystemChange={handleSystemChange}
      // 智能筛选相关 props
      aiFilterQuery={aiFilterQuery}
      onAiFilterQueryChange={handleAiFilterQueryChange}
      onAiFilter={handleAiFilter}
      aiFiltersCount={aiFiltersCount}
      onClearAiFilter={handleClearAiFilter}
      isAiFiltering={isAiFiltering}
      onOpenAdvancedFilter={handleOpenAdvancedFilter}
      hasAdvancedFilters={aiFiltersCount > 0}
    >
      <StoreList
        refreshTrigger={refreshTrigger}
        externalSearch={search}
        showAddModal={showAddModal}
        showBatchModal={showBatchModal}
        showBatchContactModal={showBatchContactModal}
        showDeleteModal={showDeleteModal}
        showAiConfigModal={showAiConfigModal}
        showOperationLogsModal={showOperationLogsModal}
        onCloseAddModal={() => setShowAddModal(false)}
        onCloseBatchModal={() => setShowBatchModal(false)}
        onCloseBatchContactModal={() => setShowBatchContactModal(false)}
        onCloseDeleteModal={() => setShowDeleteModal(false)}
        onCloseAiConfigModal={() => setShowAiConfigModal(false)}
        onCloseOperationLogsModal={() => setShowOperationLogsModal(false)}
        isDataMode={isDataMode}
        onIsDataModeChange={handleDataModeChange}
        currentSystem={currentSystem}
        // 智能筛选回调
        onAiFilterQueryChange={handleAiFilterQueryChange}
        onAiFilterCountChange={handleAiFilterCountChange}
        onIsAiFilteringChange={handleIsAiFilteringChange}
        onAiFilterCallbackRef={handleAiFilterCallbackRef}
        onClearAiFilterCallbackRef={handleClearAiFilterCallbackRef}
        externalAiFilterQuery={aiFilterQuery}
        showAdvancedFilter={showAdvancedFilter}
        onCloseAdvancedFilter={() => setShowAdvancedFilter(false)}
        onAdvancedFilterCallbackRef={handleAdvancedFilterCallbackRef}
        onApplyAdvancedFilter={handleApplyAdvancedFilter}
        onResetFiltersCallbackRef={handleResetFiltersCallbackRef}
      />

      {/* 导出数据弹窗 */}
      {showExportModal && (
        <div className="modal-overlay" onClick={() => !exportLoading && setShowExportModal(false)}>
          <div className="modal-content" style={{ width: '420px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">导出数据</h3>
              <button
                onClick={() => !exportLoading && setShowExportModal(false)}
                disabled={exportLoading}
                style={{ background: 'transparent', border: 'none', cursor: exportLoading ? 'not-allowed' : 'pointer', padding: '4px', color: '#86909c' }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            <div className="modal-body" style={{ padding: '20px' }}>
              <div style={{ marginBottom: '20px' }}>
                <p style={{ color: '#4e5969', fontSize: '14px', marginBottom: '12px' }}>
                  一键导出所有数据，包含以下内容：
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  {['门店', '联系人', '跟进记录', '跟进图片', '机器人配置', '门店图片', '门店标签', '标签预设'].map(name => (
                    <div key={name} style={{
                      padding: '8px 12px',
                      background: '#f7f8fa',
                      borderRadius: '6px',
                      fontSize: '13px',
                      color: '#4e5969',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00b42a" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                      {name}
                    </div>
                  ))}
                </div>
              </div>
              <div style={{
                padding: '10px 12px',
                background: '#e8f3ff',
                borderRadius: '6px',
                fontSize: '12px',
                color: '#165dff',
                marginBottom: '20px',
              }}>
                数据将打包为ZIP文件，图片文件也会一并下载
              </div>
              <button
                onClick={handleExport}
                disabled={exportLoading}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: 'none',
                  borderRadius: '8px',
                  background: exportLoading ? '#94bfff' : '#165dff',
                  color: '#fff',
                  fontSize: '15px',
                  fontWeight: 500,
                  cursor: exportLoading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                {exportLoading ? (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" style={{ animation: 'spin 1s linear infinite' }}>
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" strokeDasharray="31.4 31.4" />
                    </svg>
                    导出中，请稍候...
                  </>
                ) : (
                  '一键导出全部数据'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  );
}
