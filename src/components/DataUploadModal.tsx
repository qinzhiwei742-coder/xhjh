'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { StoreSystem } from './MainLayout';

// 重新定义必要的类型
interface FileInfo {
  fileName: string;
  minTime: string;
  maxTime: string;
}

// ========== 简化后的上传响应类型 ==========
interface SimpleUploadResponse {
  success: boolean;
  storeSystem: string;
  fileName: string;
  recordCount: number;
  timeRange: { minTime: string; maxTime: string };
  stats: {
    totalRecords: number;
    matchedRecords: number;
    unmatchedRecords: number;
  };
}

// 复制订单统计相关类型
interface DailyOrderStats {
  orderCount: number;
  fakeOrderCount: number;
  validOrderCount: number;
  fakeOrderAmount: number;
  validOrderAmount: number;
  orderAmount: number;
  refundCount: number;
  refundAmount: number;
  sameDayRefundCount: number;
  sameDayRefundAmount: number;
  unverifiedCount: number;
  unverifiedAmount: number;
}

interface StoreOrderStats {
  totalOrderCount: number;
  totalFakeOrderCount: number;
  totalValidOrderCount: number;
  totalFakeOrderAmount: number;
  totalValidOrderAmount: number;
  totalOrderAmount: number;
  totalRefundCount: number;
  totalRefundAmount: number;
  totalSameDayRefundCount: number;
  totalSameDayRefundAmount: number;
  totalUnverifiedCount: number;
  totalUnverifiedAmount: number;
  dailyStats: Record<string, DailyOrderStats>;
  orderIdToStoreId: Record<string, string>;
}

interface OrderAggregatedData {
  storeStats: Record<string, StoreOrderStats>;
  timeRange: { minTime: string; maxTime: string; };
  stats: { totalRecords: number; matchedRecords: number; unmatchedRecords: number; };
  unmatchedDailyStats: Record<string, DailyOrderStats>;
  unmatchedTotal: {
    orderCount: number;
    fakeOrderCount: number;
    validOrderCount: number;
    fakeOrderAmount: number;
    validOrderAmount: number;
    orderAmount: number;
    refundCount: number;
    refundAmount: number;
    sameDayRefundCount: number;
    sameDayRefundAmount: number;
    unverifiedCount: number;
    unverifiedAmount: number;
  };
  unmatchedOrderDetails?: Array<{
    orderId: string;
    storeId: string | null;
    reason: string;
    payTime: string;
    quantity: number;
    amount: number;
    orderAmount: number;
    orderStatus: string;
  }>;
  unmatchedStoreIdStats?: Array<{
    storeId: string;
    orderCount: number;
    totalAmount: number;
    reason: string;
  }>;
  orderMapping: Record<string, string>;
  channelStats?: Record<string, number>;
  dailyChannelStats?: Record<string, Record<string, number>>;
  validChannelStats?: Record<string, number>;
  dailyValidChannelStats?: Record<string, Record<string, number>>;
}

// 复制核销统计相关类型
interface DailyVerifyStats {
  verifyCount: number;
  verifyAmount: number;
  fakeVerifyCount: number;
  validVerifyCount: number;
  fakeVerifyAmount: number;
  validVerifyAmount: number;
}

interface StoreVerifyStats {
  totalVerifyCount: number;
  totalVerifyAmount: number;
  dailyStats: Record<string, DailyVerifyStats>;
}

interface VerifyAggregatedData {
  storeStats: Record<string, StoreVerifyStats>;
  timeRange: { minTime: string; maxTime: string; };
  stats: { totalRecords: number; matchedRecords: number; unmatchedRecords: number; };
  unmatchedDailyStats: Record<string, DailyVerifyStats>;
  unmatchedTotal: {
    verifyCount: number;
    verifyAmount: number;
  };
  unmatchedVerifyDetails?: Array<{
    verifyId: string;
    storeId: string | null;
    reason: string;
    verifyTime: string;
    verifyCount: number;
    verifyAmount: number;
  }>;
  channelStats?: Record<string, number>;
  dailyChannelStats?: Record<string, Record<string, number>>;
  validChannelStats?: Record<string, number>;
  dailyValidChannelStats?: Record<string, Record<string, number>>;
}

// 复制退款统计相关类型
interface DailyRefundStats {
  refundCount: number;
  refundAmount: number;
  sameDayRefundCount: number;
  sameDayRefundAmount: number;
}

interface StoreRefundStats {
  totalRefundCount: number;
  totalRefundAmount: number;
  totalSameDayRefundCount: number;
  totalSameDayRefundAmount: number;
  dailyStats: Record<string, DailyRefundStats>;
}

interface RefundAggregatedData {
  storeStats: Record<string, StoreRefundStats>;
  timeRange: { minTime: string; maxTime: string; };
  stats: { totalRecords: number; matchedRecords: number; unmatchedRecords: number; };
  unmatchedDailyStats: Record<string, DailyRefundStats>;
  unmatchedTotal: {
    refundCount: number;
    refundAmount: number;
    sameDayRefundCount: number;
    sameDayRefundAmount: number;
  };
}

const getStorageKey = (key: string, system: StoreSystem) => `${key}_${system}`;

// 文件上传区域组件
function FileUploadZone({
  label,
  file,
  onFileSelect,
  onClear,
  color,
  uploading,
  accept = ".xlsx,.xls"
}: {
  label: string;
  file: File | null;
  onFileSelect: (file: File | null) => void;
  onClear: () => void;
  color: string;
  uploading: boolean;
  accept?: string;
}) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  return (
    <div style={{ 
      border: uploading ? `2px solid ${color}` : `2px dashed ${color}`, 
      borderRadius: '8px', 
      padding: '16px',
      textAlign: 'center',
      cursor: uploading ? 'not-allowed' : 'pointer',
      transition: 'all 0.2s',
      background: uploading ? `${color}10` : file ? `${color}15` : 'transparent',
      opacity: uploading ? 0.7 : 1
    }}
    onClick={() => !uploading && fileInputRef.current?.click()}
    onMouseEnter={(e) => {
      if (!uploading) {
        e.currentTarget.style.borderColor = color;
        e.currentTarget.style.background = `${color}10`;
      }
    }}
    onMouseLeave={(e) => {
      if (!uploading) {
        e.currentTarget.style.borderColor = uploading ? color : `2px dashed ${color}`;
        e.currentTarget.style.background = uploading ? `${color}10` : file ? `${color}15` : 'transparent';
      }
    }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        style={{ display: 'none' }}
        onChange={(e) => {
          const selectedFile = e.target.files?.[0];
          if (selectedFile) {
            onFileSelect(selectedFile);
          }
        }}
        disabled={uploading}
      />
      {uploading ? (
        <div>
          <div style={{ fontSize: '14px', color: color, fontWeight: 500 }}>上传中...</div>
          <div style={{ 
            marginTop: '8px',
            width: '100%',
            height: '4px',
            background: `${color}20`,
            borderRadius: '2px',
            overflow: 'hidden'
          }}>
            <div style={{
              width: '60%',
              height: '100%',
              background: color,
              borderRadius: '2px',
              animation: 'pulse 1.5s ease-in-out infinite'
            }}></div>
          </div>
          <style jsx>{`
            @keyframes pulse {
              0%, 100% { transform: translateX(-50%); }
              50% { transform: translateX(50%); }
            }
          `}</style>
        </div>
      ) : file ? (
        <div>
          <div style={{ fontSize: '14px', color: '#1d2129', fontWeight: 500 }}>{file.name}</div>
          <div style={{ fontSize: '12px', color: '#86909c', marginTop: '4px' }}>
            {(file.size / 1024).toFixed(1)} KB
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClear();
            }}
            style={{
              marginTop: '8px',
              padding: '4px 12px',
              fontSize: '12px',
              color: '#f53f3f',
              background: 'none',
              border: '1px solid #f53f3f',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            删除
          </button>
        </div>
      ) : (
        <div>
          <div style={{ fontSize: '14px', color: color, fontWeight: 500 }}>{label}</div>
          <div style={{ fontSize: '12px', color: '#86909c', marginTop: '4px' }}>
            点击或拖拽上传
          </div>
        </div>
      )}
    </div>
  );
}

interface DataUploadModalProps {
  visible: boolean;
  onClose: () => void;
  stores: Array<{ store_id: string; store_name: string }>;
  currentSystem: StoreSystem;
  orderFileInfo: FileInfo | null;
  verifyFileInfo: FileInfo | null;
  refundFileInfo: FileInfo | null;
  onOrderUploadSuccess: (data: OrderAggregatedData, fileInfo: FileInfo | null) => void;
  onVerifyUploadSuccess: (data: VerifyAggregatedData, fileInfo: FileInfo | null) => void;
  onRefundUploadSuccess: (data: RefundAggregatedData, fileInfo: FileInfo | null) => void;
  orderDataRef: React.MutableRefObject<OrderAggregatedData | null>;
  onRemoveAllFiles: () => void;
  onRemoveOrderFile: () => void;
  onRemoveVerifyFile: () => void;
  onRemoveRefundFile: () => void;
  onRefreshFromDatabase?: () => void;
}

export default function DataUploadModal({
  visible,
  onClose,
  stores,
  currentSystem,
  orderFileInfo,
  verifyFileInfo,
  refundFileInfo,
  onOrderUploadSuccess,
  onVerifyUploadSuccess,
  onRefundUploadSuccess,
  orderDataRef,
  onRemoveAllFiles,
  onRemoveOrderFile,
  onRemoveVerifyFile,
  onRemoveRefundFile,
  onRefreshFromDatabase
}: DataUploadModalProps) {
  const [uploadingType, setUploadingType] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fileTypes = [
    { key: 'order', label: '订单文件', color: '#00b42a' },
    { key: 'verify', label: '核销文件', color: '#ff7d00' },
    { key: 'refund', label: '退款文件', color: '#f53f3f' }
  ];

  // 处理订单文件上传
  const handleOrderUpload = useCallback(async (file: File) => {
    try {
      setUploadingType('order');
      setError(null);
      setSuccessMessage(null);

      const storeIdSet = stores.map(s => String(s.store_id)).filter(Boolean);
      const formData = new FormData();
      formData.append('file', file);
      formData.append('storeIdSet', JSON.stringify(storeIdSet));
      formData.append('storeSystem', currentSystem);

      const response = await fetch('/api/order-stats', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: '订单文件处理失败' }));
        throw new Error(errorData.error || errorData.details || '订单文件处理失败');
      }

      // 接收简化响应
      const uploadResult: SimpleUploadResponse = await response.json();

      // 构建文件信息
      let fileInfo: FileInfo | null = null;
      if (uploadResult.timeRange.minTime && uploadResult.timeRange.maxTime) {
        fileInfo = {
          fileName: file.name,
          minTime: uploadResult.timeRange.minTime,
          maxTime: uploadResult.timeRange.maxTime
        };
      }

      // 从 store-stats API 获取聚合数据
      try {
        const statsResponse = await fetch(`/api/store-stats?store_system=${currentSystem}`);
        if (statsResponse.ok) {
          const statsData = await statsResponse.json();
          if (statsData.success && statsData.data) {
            // 转换为 OrderAggregatedData 格式
            const aggregatedData: OrderAggregatedData = {
              storeStats: {},
              timeRange: uploadResult.timeRange,
              stats: uploadResult.stats,
              unmatchedDailyStats: {},
              unmatchedTotal: {
                orderCount: 0,
                fakeOrderCount: 0,
                validOrderCount: 0,
                fakeOrderAmount: 0,
                validOrderAmount: 0,
                orderAmount: 0,
                refundCount: 0,
                refundAmount: 0,
                sameDayRefundCount: 0,
                sameDayRefundAmount: 0,
                unverifiedCount: 0,
                unverifiedAmount: 0
              },
              unmatchedOrderDetails: [],
              unmatchedStoreIdStats: [],
              orderMapping: {},
              channelStats: {},
              dailyChannelStats: {},
              validChannelStats: {},
              dailyValidChannelStats: {}
            };

            // 转换 stores 数据到 storeStats 格式
            if (statsData.data.stores) {
              statsData.data.stores.forEach((store: any) => {
                aggregatedData.storeStats[store.store_id] = {
                  totalOrderCount: store.total_orders || 0,
                  totalFakeOrderCount: store.fake_orders || 0,
                  totalValidOrderCount: store.valid_orders || 0,
                  totalFakeOrderAmount: store.fake_amount || 0,
                  totalValidOrderAmount: store.valid_amount || 0,
                  totalOrderAmount: store.total_amount || 0,
                  totalRefundCount: store.refund_count || 0,
                  totalRefundAmount: store.refund_amount || 0,
                  totalSameDayRefundCount: 0,
                  totalSameDayRefundAmount: 0,
                  totalUnverifiedCount: 0,
                  totalUnverifiedAmount: 0,
                  dailyStats: {},
                  orderIdToStoreId: {}
                };
              });
            }

            // 转换 dailyOrderStats
            if (statsData.data.dailyOrderStats) {
              Object.entries(statsData.data.dailyOrderStats).forEach(([date, stats]: [string, any]) => {
                aggregatedData.unmatchedDailyStats[date] = {
                  orderCount: stats.orderCount || 0,
                  fakeOrderCount: stats.fakeOrderCount || 0,
                  validOrderCount: stats.validOrderCount || 0,
                  fakeOrderAmount: stats.fakeOrderAmount || 0,
                  validOrderAmount: stats.validOrderAmount || 0,
                  orderAmount: stats.orderAmount || 0,
                  refundCount: 0,
                  refundAmount: 0,
                  sameDayRefundCount: 0,
                  sameDayRefundAmount: 0,
                  unverifiedCount: stats.unverifiedCount || 0,
                  unverifiedAmount: stats.unverifiedAmount || 0
                };
              });
            }

            // 调用上传成功回调
            onOrderUploadSuccess(aggregatedData, fileInfo);
          }
        }
      } catch (statsError) {
        console.error('获取订单统计数据失败:', statsError);
      }

      const { totalRecords, matchedRecords, unmatchedRecords } = uploadResult.stats;
      const message = `订单数据上传成功，匹配${matchedRecords}/${totalRecords}条${unmatchedRecords > 0 ? `，未匹配${unmatchedRecords}条` : ''}`;
      setSuccessMessage(message);
      
      // 2秒后清除成功消息
      setTimeout(() => {
        setSuccessMessage(null);
      }, 2000);
      
    } catch (error) {
      console.error('解析订单文件失败:', error);
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      console.error('详细错误信息:', errorMessage);
      setError(`订单文件解析失败: ${errorMessage}`);
    } finally {
      setUploadingType(null);
    }
  }, [stores, onOrderUploadSuccess, currentSystem]);

  // 处理核销文件上传
  const handleVerifyUpload = useCallback(async (file: File) => {
    try {
      setUploadingType('verify');
      setError(null);
      setSuccessMessage(null);

      const storeIdSet = stores.map(s => String(s.store_id)).filter(Boolean);
      const formData = new FormData();
      formData.append('file', file);
      formData.append('storeIdSet', JSON.stringify(storeIdSet));
      formData.append('storeSystem', currentSystem);

      const response = await fetch('/api/verify-stats', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: '核销文件处理失败' }));
        throw new Error(errorData.error || errorData.details || '核销文件处理失败');
      }

      // 接收简化响应
      const uploadResult: SimpleUploadResponse = await response.json();

      // 构建文件信息
      let fileInfo: FileInfo | null = null;
      if (uploadResult.timeRange.minTime && uploadResult.timeRange.maxTime) {
        fileInfo = {
          fileName: file.name,
          minTime: uploadResult.timeRange.minTime,
          maxTime: uploadResult.timeRange.maxTime
        };
      }

      // 从 store-stats API 获取聚合数据
      try {
        const statsResponse = await fetch(`/api/store-stats?store_system=${currentSystem}`);
        if (statsResponse.ok) {
          const statsData = await statsResponse.json();
          if (statsData.success && statsData.data) {
            // 转换为 VerifyAggregatedData 格式
            const aggregatedData: VerifyAggregatedData = {
              storeStats: {},
              timeRange: uploadResult.timeRange,
              stats: uploadResult.stats,
              unmatchedDailyStats: {},
              unmatchedTotal: { verifyCount: 0, verifyAmount: 0 },
              unmatchedVerifyDetails: [],
              channelStats: {},
              dailyChannelStats: {},
              validChannelStats: {},
              dailyValidChannelStats: {}
            };

            // 转换 stores 数据到 storeStats 格式
            if (statsData.data.stores) {
              statsData.data.stores.forEach((store: any) => {
                aggregatedData.storeStats[store.store_id] = {
                  totalVerifyCount: store.total_verifies || 0,
                  totalVerifyAmount: store.total_verify_amount || 0,
                  dailyStats: {}
                };
              });
            }

            // 转换 dailyVerifyStats
            if (statsData.data.dailyVerifyStats) {
              Object.entries(statsData.data.dailyVerifyStats).forEach(([date, stats]: [string, any]) => {
                aggregatedData.unmatchedDailyStats[date] = {
                  verifyCount: stats.verifyCount || 0,
                  fakeVerifyCount: stats.fakeVerifyCount || 0,
                  validVerifyCount: stats.validVerifyCount || 0,
                  fakeVerifyAmount: stats.fakeVerifyAmount || 0,
                  validVerifyAmount: stats.validVerifyAmount || 0,
                  verifyAmount: stats.verifyAmount || 0
                };
              });
            }

            // 调用上传成功回调
            onVerifyUploadSuccess(aggregatedData, fileInfo);
          }
        }
      } catch (statsError) {
        console.error('获取核销统计数据失败:', statsError);
      }

      const { totalRecords, matchedRecords, unmatchedRecords } = uploadResult.stats;
      const message = `核销数据上传成功，匹配${matchedRecords}/${totalRecords}条${unmatchedRecords > 0 ? `，未匹配${unmatchedRecords}条` : ''}`;
      setSuccessMessage(message);
      
      // 2秒后清除成功消息
      setTimeout(() => {
        setSuccessMessage(null);
      }, 2000);
      
    } catch (error) {
      console.error('解析核销文件失败:', error);
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      console.error('详细错误信息:', errorMessage);
      setError(`核销文件解析失败: ${errorMessage}`);
    } finally {
      setUploadingType(null);
    }
  }, [stores, onVerifyUploadSuccess]);

  // 处理退款文件上传
  const handleRefundUpload = useCallback(async (file: File) => {
    try {
      setUploadingType('refund');
      setError(null);
      setSuccessMessage(null);

      // 1️⃣ 检查订单数据是否存在
      const orderData = orderDataRef.current;
      if (!orderData) {
        setError('请先上传订单文件');
        setUploadingType(null);
        return;
      }

      // 2️⃣ 获取订单映射（可能为空）
      const orderMapping = orderData.orderMapping || {};

      const validStoreIds = stores
        .filter(s => s.store_id)
        .map(s => s.store_id as string);

      const formData = new FormData();
      formData.append('file', file);
      formData.append('orderMapping', JSON.stringify(orderMapping));
      formData.append('validStoreIds', JSON.stringify(validStoreIds));
      formData.append('storeSystem', currentSystem);
      
      const response = await fetch('/api/refund-stats', {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: '退款文件处理失败' }));
        throw new Error(errorData.error || errorData.details || '退款文件处理失败');
      }

      // 接收简化响应
      const uploadResult: SimpleUploadResponse = await response.json();
      
      // 构建文件信息
      let fileInfo: FileInfo | null = null;
      if (uploadResult.timeRange.minTime && uploadResult.timeRange.maxTime) {
        fileInfo = {
          fileName: file.name,
          minTime: uploadResult.timeRange.minTime,
          maxTime: uploadResult.timeRange.maxTime
        };
      }

      // 从 store-stats API 获取聚合数据
      try {
        const statsResponse = await fetch(`/api/store-stats?store_system=${currentSystem}`);
        if (statsResponse.ok) {
          const statsData = await statsResponse.json();
          if (statsData.success && statsData.data) {
            // 转换为 RefundAggregatedData 格式
            const aggregatedData: RefundAggregatedData = {
              storeStats: {},
              timeRange: uploadResult.timeRange,
              stats: uploadResult.stats,
              unmatchedDailyStats: {},
              unmatchedTotal: { refundCount: 0, refundAmount: 0, sameDayRefundCount: 0, sameDayRefundAmount: 0 }
            };

            // 转换 stores 数据到 storeStats 格式
            if (statsData.data.stores) {
              statsData.data.stores.forEach((store: any) => {
                aggregatedData.storeStats[store.store_id] = {
                  totalRefundCount: store.refund_count || 0,
                  totalRefundAmount: store.refund_amount || 0,
                  totalSameDayRefundCount: 0,
                  totalSameDayRefundAmount: 0,
                  dailyStats: {}
                };
              });
            }

            // 转换 dailyRefundStats
            if (statsData.data.dailyRefundStats) {
              Object.entries(statsData.data.dailyRefundStats).forEach(([date, stats]: [string, any]) => {
                aggregatedData.unmatchedDailyStats[date] = {
                  refundCount: stats.refundCount || 0,
                  refundAmount: stats.refundAmount || 0,
                  sameDayRefundCount: 0,
                  sameDayRefundAmount: 0
                };
              });
            }

            // 调用上传成功回调
            onRefundUploadSuccess(aggregatedData, fileInfo);
          }
        }
      } catch (statsError) {
        console.error('获取退款统计数据失败:', statsError);
      }

      const { totalRecords, matchedRecords, unmatchedRecords } = uploadResult.stats;
      let message: string;
      if (matchedRecords > 0 && unmatchedRecords > 0) {
        message = `退款数据上传成功，匹配${matchedRecords}/${totalRecords}条，${unmatchedRecords}条跨期退款归入未匹配`;
      } else if (matchedRecords > 0) {
        message = `退款数据上传成功，全部${totalRecords}条记录已匹配`;
      } else {
        message = `退款数据上传成功，${totalRecords}条记录（需上传订单文件关联门店）`;
      }
      
      setSuccessMessage(message);
      
      // 2秒后清除成功消息
      setTimeout(() => {
        setSuccessMessage(null);
      }, 2000);
      
    } catch (error) {
      console.error('处理退款文件失败:', error);
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      console.error('详细错误信息:', errorMessage);
      setError(`退款文件处理失败: ${errorMessage}`);
    } finally {
      setUploadingType(null);
    }
  }, [stores, onRefundUploadSuccess, orderDataRef, currentSystem, uploadingType]);

  // 处理文件选择
  const handleFileSelect = useCallback((type: string, file: File) => {
    if (type === 'order') {
      handleOrderUpload(file);
    } else if (type === 'verify') {
      handleVerifyUpload(file);
    } else if (type === 'refund') {
      handleRefundUpload(file);
    }
  }, [handleOrderUpload, handleVerifyUpload, handleRefundUpload]);

  if (!visible) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
      <div style={{
        background: 'white',
        borderRadius: '12px',
        width: '600px',
        maxWidth: '90vw',
        maxHeight: '80vh',
        overflow: 'auto'
      }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e5e6eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '16px', fontWeight: 600, color: '#1d2129' }}>
            数据文件上传
          </div>
          <button 
            onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#86909c' }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: '24px' }}>
          <div style={{ marginBottom: '16px', fontSize: '14px', color: '#4e5969' }}>
            请上传订单、核销、退款数据文件（Excel格式），选择文件后自动上传。
          </div>

          {/* 显示已上传文件的信息 */}
          {(orderFileInfo || verifyFileInfo || refundFileInfo) && (
            <div style={{ marginBottom: '16px', padding: '12px', background: '#f7f8fa', borderRadius: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div style={{ fontSize: '13px', color: '#4e5969', fontWeight: 500 }}>已上传文件：</div>
                <button
                  onClick={() => setShowDeleteConfirm('all')}
                  style={{
                    fontSize: '12px',
                    color: '#f53f3f',
                    background: 'none',
                    border: '1px solid #f53f3f',
                    borderRadius: '4px',
                    padding: '4px 10px',
                    cursor: 'pointer'
                  }}
                >
                  清空全部
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {orderFileInfo && (
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    padding: '8px',
                    background: '#e8ffea',
                    borderRadius: '4px'
                  }}>
                    <div style={{ fontSize: '12px', color: '#00b42a' }}>
                      ✓ 订单：{orderFileInfo.minTime} ~ {orderFileInfo.maxTime}
                    </div>
                    <button
                      onClick={() => setShowDeleteConfirm('order')}
                      style={{
                        fontSize: '11px',
                        color: '#f53f3f',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '2px 6px'
                      }}
                    >
                      删除
                    </button>
                  </div>
                )}
                {verifyFileInfo && (
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    padding: '8px',
                    background: '#fff7e8',
                    borderRadius: '4px'
                  }}>
                    <div style={{ fontSize: '12px', color: '#ff7d00' }}>
                      ✓ 核销：{verifyFileInfo.minTime} ~ {verifyFileInfo.maxTime}
                    </div>
                    <button
                      onClick={() => setShowDeleteConfirm('verify')}
                      style={{
                        fontSize: '11px',
                        color: '#f53f3f',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '2px 6px'
                      }}
                    >
                      删除
                    </button>
                  </div>
                )}
                {refundFileInfo && (
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    padding: '8px',
                    background: '#fff1f0',
                    borderRadius: '4px'
                  }}>
                    <div style={{ fontSize: '12px', color: '#f53f3f' }}>
                      ✓ 退款：{refundFileInfo.minTime} ~ {refundFileInfo.maxTime}
                    </div>
                    <button
                      onClick={() => setShowDeleteConfirm('refund')}
                      style={{
                        fontSize: '11px',
                        color: '#f53f3f',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '2px 6px'
                      }}
                    >
                      删除
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
            {fileTypes.map(fileType => (
              <FileUploadZone
                key={fileType.key}
                label={fileType.label}
                file={null}
                color={fileType.color}
                uploading={uploadingType === fileType.key}
                onFileSelect={(file) => file && handleFileSelect(fileType.key, file)}
                onClear={() => {}}
              />
            ))}
          </div>

          {successMessage && (
            <div style={{ marginTop: '16px', padding: '12px', background: '#e8ffea', border: '1px solid #00b42a', borderRadius: '6px', color: '#00b42a', fontSize: '14px' }}>
              {successMessage}
            </div>
          )}

          {error && (
            <div style={{ marginTop: '16px', padding: '12px', background: '#fff2f0', border: '1px solid #ff7d7d', borderRadius: '6px', color: '#f53f3f', fontSize: '14px' }}>
              {error}
            </div>
          )}

          <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button
              onClick={onClose}
              disabled={uploadingType !== null}
              style={{
                padding: '8px 16px',
                fontSize: '14px',
                border: '1px solid #e5e6eb',
                borderRadius: '6px',
                background: 'white',
                color: uploadingType !== null ? '#c9cdd4' : '#1d2129',
                cursor: uploadingType !== null ? 'not-allowed' : 'pointer'
              }}
            >
              关闭
            </button>
          </div>
        </div>

        {/* 删除确认弹窗 */}
        {showDeleteConfirm && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100
          }}>
            <div style={{
              background: 'white',
              borderRadius: '12px',
              width: '400px',
              maxWidth: '90vw',
              padding: '24px'
            }}>
              <div style={{ fontSize: '16px', fontWeight: 600, color: '#1d2129', marginBottom: '12px' }}>
                {showDeleteConfirm === 'all' ? '删除订单、核销、退款文件' : 
                 showDeleteConfirm === 'order' ? '删除订单文件' :
                 showDeleteConfirm === 'verify' ? '删除核销文件' : '删除退款文件'}
              </div>
              <div style={{ fontSize: '14px', color: '#4e5969', marginBottom: '24px' }}>
                {showDeleteConfirm === 'all' ? '将删除订单、核销、退款三个文件，删除后数据将无法恢复，确定要删除吗？' : '删除后数据将无法恢复，确定要删除吗？'}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button
                  onClick={() => setShowDeleteConfirm(null)}
                  style={{
                    padding: '8px 16px',
                    fontSize: '14px',
                    border: '1px solid #e5e6eb',
                    borderRadius: '6px',
                    background: 'white',
                    color: '#1d2129',
                    cursor: 'pointer'
                  }}
                >
                  取消
                </button>
                <button
                  onClick={() => {
                    if (showDeleteConfirm === 'all') {
                      onRemoveAllFiles();
                    } else if (showDeleteConfirm === 'order') {
                      onRemoveOrderFile();
                    } else if (showDeleteConfirm === 'verify') {
                      onRemoveVerifyFile();
                    } else if (showDeleteConfirm === 'refund') {
                      onRemoveRefundFile();
                    }
                    setShowDeleteConfirm(null);
                  }}
                  style={{
                    padding: '8px 16px',
                    fontSize: '14px',
                    border: 'none',
                    borderRadius: '6px',
                    background: '#f53f3f',
                    color: 'white',
                    cursor: 'pointer'
                  }}
                >
                  确定删除
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
