'use client';

import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { StoreSystem } from './MainLayout';

// ========== 广告费统计相关类型 ==========
interface DailyAdStats {
  spend: number;     // 广告投入
  orders: number;    // 广告订单数
}

interface StoreAdStats {
  totalSpend: number;
  totalOrders: number;
  dailyStats: Record<string, DailyAdStats>;  // key: 日期字符串
}

interface AdAggregatedData {
  storeStats: Record<string, StoreAdStats>;
  timeRange: { minTime: string; maxTime: string };
  stats: { totalRecords: number; matchedRecords: number; unmatchedRecords: number };
  unmatchedDailyStats: Record<string, DailyAdStats>;
  unmatchedTotal: {
    spend: number;
    orders: number;
  };
}

// 格式化日期为 YYYY-MM-DD 格式
const formatDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// 解析日期，支持多种格式
const parseDate = (dateValue: any): string | null => {
  if (!dateValue) return null;
  
  // 如果是 Excel 日期序列号
  if (typeof dateValue === 'number') {
    const date = new Date((dateValue - 25569) * 86400 * 1000);
    return formatDate(date);
  }
  
  // 如果是字符串
  const dateStr = String(dateValue).trim();
  
  // 尝试多种格式解析
  const formats = [
    // YYYY-MM-DD, YYYY/MM/DD
    /^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/,
    // MM-DD-YYYY, MM/DD/YYYY
    /^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/,
    // DD-MM-YYYY, DD/MM/YYYY (先尝试这个，因为常见)
    /^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/
  ];
  
  for (const format of formats) {
    const match = dateStr.match(format);
    if (match) {
      let year: number, month: number, day: number;
      
      if (match[1].length === 4) {
        // YYYY-MM-DD
        year = parseInt(match[1]);
        month = parseInt(match[2]) - 1;
        day = parseInt(match[3]);
      } else if (match[3].length === 4) {
        // 假设是 DD-MM-YYYY（欧洲格式）
        year = parseInt(match[3]);
        month = parseInt(match[2]) - 1;
        day = parseInt(match[1]);
      } else {
        continue;
      }
      
      const date = new Date(year, month, day);
      if (!isNaN(date.getTime())) {
        return formatDate(date);
      }
    }
  }
  
  // 尝试直接用 Date 解析
  const date = new Date(dateStr);
  if (!isNaN(date.getTime())) {
    return formatDate(date);
  }
  
  return null;
};

// 解析数字，支持多种格式
const parseNumber = (value: any): number => {
  if (typeof value === 'number') return value;
  if (!value) return 0;
  const str = String(value).replace(/[^\d.-]/g, '');
  return parseFloat(str) || 0;
};

// 文件上传区域组件
function FileUploadZone({
  label,
  file,
  onFileSelect,
  onClear,
  accept = ".xlsx,.xls"
}: {
  label: string;
  file: File | null;
  onFileSelect: (file: File | null) => void;
  onClear: () => void;
  accept?: string;
}) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  return (
    <div style={{ 
      border: '2px dashed #e5e6eb', 
      borderRadius: '8px', 
      padding: '16px',
      textAlign: 'center',
      cursor: 'pointer',
      transition: 'all 0.2s'
    }}
    onClick={() => fileInputRef.current?.click()}
    onMouseEnter={(e) => {
      e.currentTarget.style.borderColor = '#165dff';
      e.currentTarget.style.background = '#f7f8fa';
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.borderColor = '#e5e6eb';
      e.currentTarget.style.background = 'transparent';
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
      />
      {file ? (
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
          <div style={{ fontSize: '14px', color: '#4e5969' }}>{label}</div>
          <div style={{ fontSize: '12px', color: '#86909c', marginTop: '4px' }}>
            点击或拖拽上传
          </div>
        </div>
      )}
    </div>
  );
}

interface AdUploadModalProps {
  visible: boolean;
  onClose: () => void;
  onUploadSuccess: (data: AdAggregatedData) => void;
  stores: Array<{ store_id: string; store_name: string }>;
}

export default function AdUploadModal({
  visible,
  onClose,
  onUploadSuccess,
  stores
}: AdUploadModalProps) {
  const [files, setFiles] = useState<Record<string, File | null>>({
    'account1': null,
    'account2': null,
    'account3': null,
    'account4': null,
    'account5': null,
    'account6': null
  });
  
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accounts = [
    { key: 'account1', label: '广告账户1' },
    { key: 'account2', label: '广告账户2' },
    { key: 'account3', label: '广告账户3' },
    { key: 'account4', label: '广告账户4' },
    { key: 'account5', label: '广告账户5' },
    { key: 'account6', label: '广告账户6' }
  ];

  // 构建门店匹配映射
  const buildStoreMapping = () => {
    const idToStore: Record<string, string> = {};
    const nameToStore: Record<string, string> = {};
    
    stores.forEach(store => {
      if (store.store_id) {
        idToStore[String(store.store_id).trim()] = store.store_id;
      }
      if (store.store_name) {
        nameToStore[String(store.store_name).trim()] = store.store_id;
      }
    });
    
    return { idToStore, nameToStore };
  };

  // 匹配门店
  const matchStore = (
    row: any, 
    idToStore: Record<string, string>, 
    nameToStore: Record<string, string>,
    possibleColumnNames: { id: string[], name: string[] }
  ): string | null => {
    console.log('尝试匹配门店行:', row);
    
    // 尝试通过门店ID匹配
    for (const colName of possibleColumnNames.id) {
      const value = row[colName];
      if (value !== undefined && value !== null && value !== '') {
        const storeId = String(value).trim();
        console.log('尝试门店ID匹配:', { colName, value, storeId, idToStoreKeys: Object.keys(idToStore) });
        if (idToStore[storeId]) {
          console.log('门店ID匹配成功:', storeId);
          return idToStore[storeId];
        }
      }
    }
    
    // 尝试通过门店名称匹配
    for (const colName of possibleColumnNames.name) {
      const value = row[colName];
      if (value) {
        const storeName = String(value).trim();
        if (nameToStore[storeName]) {
          return nameToStore[storeName];
        }
      }
    }
    
    return null;
  };

  // 解析单个 Excel 文件
  const parseExcelFile = async (file: File): Promise<any[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet);
          resolve(jsonData);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('文件读取失败'));
      reader.readAsArrayBuffer(file);
    });
  };

  const handleUpload = async () => {
    const selectedFiles = Object.values(files).filter(f => f !== null) as File[];
    if (selectedFiles.length === 0) {
      setError('请至少选择一个文件');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      // 可能的列名
      const possibleColumnNames = {
        id: ['门店ID', 'store_id', '门店id', 'StoreId', 'store id', 'ID'],
        name: ['门店名称', 'store_name', '门店名', 'StoreName', 'store name', '名称'],
        spend: ['消耗', '花费', '支出', '广告投入', 'spend', 'amount', '费用'],
        orders: ['订单数', '订单', 'orders', 'order_count', '成交数', '下单数']
      };

      // 存储所有解析的数据行
      const allRows: any[] = [];

      // 解析所有文件
      for (const file of selectedFiles) {
        const data = await parseExcelFile(file);
        allRows.push(...data);
      }

      console.log('广告费数据解析结果预览:', allRows.slice(0, 5));
      console.log('门店列表:', stores.map(s => ({ store_id: s.store_id, store_name: s.store_name })));
      
      const { idToStore, nameToStore } = buildStoreMapping();
      console.log('门店映射:', { idToStore, nameToStore });

      // 聚合数据
      const storeStats: Record<string, StoreAdStats> = {};
      const unmatchedDailyStats: Record<string, DailyAdStats> = {};
      const unmatchedTotal = { spend: 0, orders: 0 };
      let minTime = '';
      let maxTime = '';
      let matchedRecords = 0;
      let unmatchedRecords = 0;

      for (const row of allRows) {
        // 查找日期列
        let dateStr = '';
        const dateColumns = ['日期', 'date', '时间', 'day', 'Date'];
        for (const col of dateColumns) {
          if (row[col]) {
            const parsed = parseDate(row[col]);
            if (parsed) {
              dateStr = parsed;
              break;
            }
          }
        }

        if (!dateStr) {
          console.warn('跳过无法解析日期的行:', row);
          continue;
        }

        // 更新时间范围
        if (!minTime || dateStr < minTime) minTime = dateStr;
        if (!maxTime || dateStr > maxTime) maxTime = dateStr;

        // 查找消耗和订单数
        let spend = 0;
        let orders = 0;
        
        for (const col of possibleColumnNames.spend) {
          if (row[col] !== undefined) {
            spend = parseNumber(row[col]);
            break;
          }
        }
        
        for (const col of possibleColumnNames.orders) {
          if (row[col] !== undefined) {
            orders = parseNumber(row[col]);
            break;
          }
        }

        // 匹配门店
        const matchedStoreId = matchStore(row, idToStore, nameToStore, {
          id: possibleColumnNames.id,
          name: possibleColumnNames.name
        });

        if (matchedStoreId) {
          matchedRecords++;
          
          // 初始化门店统计
          if (!storeStats[matchedStoreId]) {
            storeStats[matchedStoreId] = {
              totalSpend: 0,
              totalOrders: 0,
              dailyStats: {}
            };
          }
          
          const storeStat = storeStats[matchedStoreId];
          
          // 更新日统计
          if (!storeStat.dailyStats[dateStr]) {
            storeStat.dailyStats[dateStr] = { spend: 0, orders: 0 };
          }
          storeStat.dailyStats[dateStr].spend += spend;
          storeStat.dailyStats[dateStr].orders += orders;
          
          // 更新总统计
          storeStat.totalSpend += spend;
          storeStat.totalOrders += orders;
        } else {
          unmatchedRecords++;
          
          // 更新未匹配统计
          if (!unmatchedDailyStats[dateStr]) {
            unmatchedDailyStats[dateStr] = { spend: 0, orders: 0 };
          }
          unmatchedDailyStats[dateStr].spend += spend;
          unmatchedDailyStats[dateStr].orders += orders;
          unmatchedTotal.spend += spend;
          unmatchedTotal.orders += orders;
        }
      }

      console.log('广告费数据聚合结果:', {
        storeStats: Object.keys(storeStats).length,
        matchedRecords,
        unmatchedRecords,
        timeRange: { minTime, maxTime }
      });

      const result: AdAggregatedData = {
        storeStats,
        timeRange: { minTime, maxTime },
        stats: { totalRecords: allRows.length, matchedRecords, unmatchedRecords },
        unmatchedDailyStats,
        unmatchedTotal
      };

      onUploadSuccess(result);
      onClose();
      
      // 重置
      setFiles({
        'account1': null,
        'account2': null,
        'account3': null,
        'account4': null,
        'account5': null,
        'account6': null
      });
      
    } catch (err) {
      console.error('广告费文件解析失败:', err);
      setError(err instanceof Error ? err.message : '文件解析失败，请检查文件格式');
    } finally {
      setUploading(false);
    }
  };

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
            广告费数据上传
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
            请上传6个广告账户的数据文件（Excel格式），支持通过门店ID或门店名称匹配数据。
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
            {accounts.map(account => (
              <FileUploadZone
                key={account.key}
                label={account.label}
                file={files[account.key]}
                onFileSelect={(file) => setFiles(prev => ({ ...prev, [account.key]: file }))}
                onClear={() => setFiles(prev => ({ ...prev, [account.key]: null }))}
              />
            ))}
          </div>

          {error && (
            <div style={{ marginTop: '16px', padding: '12px', background: '#fff2f0', border: '1px solid #ff7d7d', borderRadius: '6px', color: '#f53f3f', fontSize: '14px' }}>
              {error}
            </div>
          )}

          <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button
              onClick={onClose}
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
              onClick={handleUpload}
              disabled={uploading}
              style={{
                padding: '8px 16px',
                fontSize: '14px',
                border: 'none',
                borderRadius: '6px',
                background: uploading ? '#c9cdd4' : '#165dff',
                color: 'white',
                cursor: uploading ? 'not-allowed' : 'pointer'
              }}
            >
              {uploading ? '解析中...' : '确定上传'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
