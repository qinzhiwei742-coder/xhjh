import React, { useState, useRef, useCallback, useEffect } from 'react';

export interface BasicInfoFileInfo {
  fileName: string;
  uploadTime: string;
  result: {
    updatedCount: number;
    notFoundCount: number;
    errorCount: number;
    totalRecords: number;
    notFoundStores: Array<{ rowNumber: number; storeId: string; storeName: string; sourceFile?: string; }>;
    averageBusinessScore?: number;
    totalPositiveReviews?: number;
    totalNegativeReviews?: number;
  };
}

export interface StaffFileInfo {
  fileName: string;
  uploadTime: string;
  result: {
    updatedCount: number;
    notFoundCount: number;
    errorCount: number;
    totalRecords: number;
    notFoundStores: Array<{ rowNumber: number; storeId: string; storeName: string; sourceFile?: string; }>;
    staffCount?: number;
    videoCount?: number;
    exposureCount?: number;
  };
}

export interface DouyinFileInfo {
  fileName: string;
  uploadTime: string;
  result: {
    updatedCount: number;
    notFoundCount: number;
    errorCount: number;
    totalRecords: number;
    notFoundStores: Array<{ rowNumber: number; storeId: string; storeName: string; sourceFile?: string; }>;
    totalVideoCount?: number;
    totalVideoPlayCount?: number;
    totalDealCount?: number;
  };
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  storeSystem: string;
  basicInfoFileInfo: BasicInfoFileInfo | null;
  douyinFileInfo: DouyinFileInfo | null;
  staffFileInfo: StaffFileInfo | null;
  staffFileInfo2: StaffFileInfo | null;
  onBasicInfoUploadSuccess?: (fileInfo: BasicInfoFileInfo) => void;
  onRemoveBasicInfoFile?: () => void;
  onDouyinUploadSuccess?: (fileInfo: DouyinFileInfo) => void;
  onRemoveDouyinFile?: () => void;
  onStaffUploadSuccess?: (fileInfo: StaffFileInfo | null, fileInfo2: StaffFileInfo | null) => void;
  onRemoveStaffFile?: () => void;
  onRemoveStaffFile2?: () => void;
}

export default function BasicInfoUploadModal({
  visible,
  onClose,
  onSuccess,
  storeSystem,
  basicInfoFileInfo,
  douyinFileInfo,
  staffFileInfo,
  staffFileInfo2,
  onBasicInfoUploadSuccess,
  onRemoveBasicInfoFile,
  onDouyinUploadSuccess,
  onRemoveDouyinFile,
  onStaffUploadSuccess,
  onRemoveStaffFile,
  onRemoveStaffFile2
}: Props) {
  const [basicInfoUploading, setBasicInfoUploading] = useState(false);
  const [douyinUploading, setDouyinUploading] = useState(false);
  const [staffUploading, setStaffUploading] = useState(false);
  const [staffUploading2, setStaffUploading2] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const basicInputRef = useRef<HTMLInputElement>(null);
  const douyinInputRef = useRef<HTMLInputElement>(null);
  const staffInputRef = useRef<HTMLInputElement>(null);
  const staffInputRef2 = useRef<HTMLInputElement>(null);

  const [basicInfoUploaded, setBasicInfoUploaded] = useState(false);
  const [staffUploaded, setStaffUploaded] = useState(false);

  useEffect(() => {
    if (visible) {
      setBasicInfoUploaded(!!basicInfoFileInfo);
      setStaffUploaded(!!staffFileInfo || !!staffFileInfo2);
    }
  }, [visible, basicInfoFileInfo, staffFileInfo, staffFileInfo2]);

  // 处理经营分/好评数文件选择
  const handleBasicInfoFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setBasicInfoUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('storeSystem', storeSystem);

      const response = await fetch('/api/stores/update-basic-info', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('text/html')) {
          throw new Error('服务器返回了非JSON响应，请稍后重试');
        }
        const errorText = await response.text();
        throw new Error(errorText || '上传失败');
      }

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || '上传失败');
      }

      const fileInfo = {
        fileName: file.name,
        uploadTime: new Date().toISOString(),
        result: {
          updatedCount: result.updatedCount,
          notFoundCount: result.notFoundCount,
          errorCount: result.errorCount,
          totalRecords: result.totalRecords,
          notFoundStores: result.notFoundStores || [],
          averageBusinessScore: result.averageBusinessScore,
          totalPositiveReviews: result.totalPositiveReviews,
          totalNegativeReviews: result.totalNegativeReviews,
        }
      };

      onBasicInfoUploadSuccess?.(fileInfo);
      onSuccess?.();
      setError(null);
    } catch (err: any) {
      console.error('上传失败:', err);
      setError(err.message || '上传失败');
    } finally {
      setBasicInfoUploading(false);
      if (e.target) {
        e.target.value = '';
      }
    }
  }, [storeSystem, onBasicInfoUploadSuccess, onSuccess]);

  // 处理抖音蓝V文件选择
  const handleDouyinFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setDouyinUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('storeSystem', storeSystem);

      const response = await fetch('/api/stores/update-douyin-data', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('text/html')) {
          throw new Error('服务器返回了非JSON响应，请稍后重试');
        }
        const errorText = await response.text();
        throw new Error(errorText || '上传失败');
      }

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || '上传失败');
      }

      const fileInfo = {
        fileName: file.name,
        uploadTime: new Date().toISOString(),
        result: {
          updatedCount: result.updatedCount,
          notFoundCount: result.notFoundCount,
          errorCount: result.errorCount,
          totalRecords: result.totalRecords,
          notFoundStores: result.notFoundStores || [],
          totalVideoCount: result.totalVideoCount,
          totalPlayCount: result.totalPlayCount,
          totalDealCount: result.totalDealCount,
        }
      };

      onDouyinUploadSuccess?.(fileInfo);
      onSuccess?.();
      setError(null);
    } catch (err: any) {
      console.error('上传失败:', err);
      setError(err.message || '上传失败');
    } finally {
      setDouyinUploading(false);
      if (e.target) {
        e.target.value = '';
      }
    }
  }, [storeSystem, onDouyinUploadSuccess, onSuccess]);

  // 处理职人数据文件选择
  const handleStaffFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setStaffUploading(true);

    try {
      const formData = new FormData();
      formData.append('file1', file);
      formData.append('storeSystem', storeSystem);

      const response = await fetch('/api/stores/update-staff-data', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('text/html')) {
          throw new Error('服务器返回了非JSON响应，请稍后重试');
        }
        const errorText = await response.text();
        throw new Error(errorText || '上传失败');
      }

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || '上传失败');
      }

      const fileInfo = {
        fileName: file.name,
        uploadTime: new Date().toISOString(),
        result: {
          updatedCount: result.updatedCount,
          notFoundCount: result.notFoundCount,
          errorCount: result.errorCount,
          totalRecords: result.totalRecords,
          notFoundStores: result.notFoundStores || [],
          staffCount: result.staffCount,
          videoCount: result.videoCount,
          exposureCount: result.exposureCount,
        }
      };

      onStaffUploadSuccess?.(fileInfo, staffFileInfo2);
      onSuccess?.();
      setError(null);
    } catch (err: any) {
      console.error('上传失败:', err);
      setError(err.message || '上传失败');
    } finally {
      setStaffUploading(false);
      if (e.target) {
        e.target.value = '';
      }
    }
  }, [storeSystem, onStaffUploadSuccess, onSuccess, staffFileInfo2]);

  // 处理职人数据文件2选择
  const handleStaffFileSelect2 = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setStaffUploading2(true);

    try {
      const formData = new FormData();
      formData.append('file2', file);
      formData.append('storeSystem', storeSystem);

      const response = await fetch('/api/stores/update-staff-data', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('text/html')) {
          throw new Error('服务器返回了非JSON响应，请稍后重试');
        }
        const errorText = await response.text();
        throw new Error(errorText || '上传失败');
      }

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || '上传失败');
      }

      const fileInfo2 = {
        fileName: file.name,
        uploadTime: new Date().toISOString(),
        result: {
          updatedCount: result.updatedCount,
          notFoundCount: result.notFoundCount,
          errorCount: result.errorCount,
          totalRecords: result.totalRecords,
          notFoundStores: result.notFoundStores || [],
          staffCount: result.staffCount,
          videoCount: result.videoCount,
          exposureCount: result.exposureCount,
        }
      };

      onStaffUploadSuccess?.(staffFileInfo, fileInfo2);
      onSuccess?.();
      setError(null);
    } catch (err: any) {
      console.error('上传失败:', err);
      setError(err.message || '上传失败');
    } finally {
      setStaffUploading2(false);
      if (e.target) {
        e.target.value = '';
      }
    }
  }, [storeSystem, onStaffUploadSuccess, onSuccess, staffFileInfo]);

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
        width: '1200px',
        maxWidth: '95vw',
        maxHeight: '85vh',
        overflow: 'auto'
      }}>
        {/* 标题栏 */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '20px 24px',
          borderBottom: '1px solid #e5e7eb'
        }}>
          <h2 style={{ fontSize: '18px', fontWeight: 600, margin: 0 }}>
            基础数据上传
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              color: '#6b7280'
            }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: '24px' }}>
          {/* 错误提示 */}
          {error && (
            <div style={{
              background: '#fee2e2',
              color: '#dc2626',
              padding: '12px 16px',
              borderRadius: '6px',
              marginBottom: '16px',
              fontSize: '13px'
            }}>
              {error}
            </div>
          )}

          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: '32px'
          }}>
            {/* 左侧：经营分/好评数/中差评数 */}
            <div>
              <div style={{
                fontSize: '16px',
                fontWeight: 600,
                marginBottom: '20px',
                paddingBottom: '8px',
                borderBottom: '3px solid #2563eb',
                display: 'inline-block'
              }}>
                经营分/好评数/中差评数
              </div>

              {!basicInfoFileInfo ? (
                <div
                  onClick={() => basicInputRef.current?.click()}
                  style={{
                    border: '2px dashed #d1d5db',
                    borderRadius: '8px',
                    padding: '32px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    background: basicInfoUploading ? '#f3f4f6' : '#f9fafb'
                  }}
                >
                  <input
                    ref={basicInputRef}
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleBasicInfoFileSelect}
                    style={{ display: 'none' }}
                  />
                  <div style={{ fontSize: '40px', marginBottom: '12px' }}>📁</div>
                  <div style={{ fontSize: '14px', color: '#374151', marginBottom: '4px' }}>
                    {basicInfoUploading ? '上传中...' : '点击选择Excel文件'}
                  </div>
                  <div style={{ fontSize: '12px', color: '#6b7280' }}>
                    支持 .xlsx, .xls 格式
                  </div>
                </div>
              ) : (
                <div>
                  {/* 文件显示区 */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    background: '#f3f4f6',
                    borderRadius: '6px',
                    marginBottom: '16px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '16px' }}>📄</span>
                      <span style={{ fontSize: '13px', color: '#374151' }}>
                        {basicInfoFileInfo.fileName}
                      </span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveBasicInfoFile?.();
                      }}
                      style={{
                        background: '#fee2e2',
                        border: 'none',
                        color: '#dc2626',
                        padding: '4px 12px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        cursor: 'pointer'
                      }}
                    >
                      删除
                    </button>
                  </div>

                  {/* 上传结果显示 */}
                  {basicInfoFileInfo.result && (
                    <div style={{ background: '#f9fafb', borderRadius: '6px', padding: '16px' }}>
                      {/* 核心数据统计 */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '16px' }}>
                        <div style={{ background: '#05966915', padding: '12px', borderRadius: '6px', textAlign: 'center' }}>
                          <div style={{ fontSize: '14px', color: '#059669', marginBottom: '4px' }}>更新成功</div>
                          <div style={{ fontSize: '18px', fontWeight: 600, color: '#059669' }}>
                            {basicInfoFileInfo.result.updatedCount}
                          </div>
                        </div>
                        <div style={{ background: '#dc262615', padding: '12px', borderRadius: '6px', textAlign: 'center' }}>
                          <div style={{ fontSize: '14px', color: '#dc2626', marginBottom: '4px' }}>未找到门店</div>
                          <div style={{ fontSize: '18px', fontWeight: 600, color: '#dc2626' }}>
                            {basicInfoFileInfo.result.notFoundCount}
                          </div>
                        </div>
                        <div style={{ background: '#f59e0b15', padding: '12px', borderRadius: '6px', textAlign: 'center' }}>
                          <div style={{ fontSize: '14px', color: '#f59e0b', marginBottom: '4px' }}>更新失败</div>
                          <div style={{ fontSize: '18px', fontWeight: 600, color: '#f59e0b' }}>
                            {basicInfoFileInfo.result.errorCount}
                          </div>
                        </div>
                      </div>

                      {/* 未找到门店列表 */}
                      {basicInfoFileInfo.result.notFoundStores.length > 0 && (
                        <div>
                          <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '8px', color: '#374151' }}>
                            未找到的门店：
                          </div>
                          <div style={{ 
                            maxHeight: '150px', 
                            overflowY: 'auto', 
                            background: 'white', 
                            border: '1px solid #e5e7eb', 
                            borderRadius: '6px',
                            padding: '8px'
                          }}>
                            {basicInfoFileInfo.result.notFoundStores.map((store, index) => (
                              <div key={index} style={{ 
                                fontSize: '12px', 
                                color: '#6b7280', 
                                padding: '6px 8px',
                                borderBottom: index < basicInfoFileInfo.result.notFoundStores.length - 1 ? '1px solid #f3f4f6' : 'none'
                              }}>
                                第{store.rowNumber}行：{store.storeName} (门店ID: {store.storeId})
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div style={{ fontSize: '13px', color: '#9ca3af', marginTop: '12px' }}>
                        共处理 {basicInfoFileInfo.result.totalRecords} 条数据
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 中间：抖音蓝V */}
            <div>
              <div style={{
                fontSize: '16px',
                fontWeight: 600,
                marginBottom: '20px',
                paddingBottom: '8px',
                borderBottom: '3px solid #7c3aed',
                display: 'inline-block'
              }}>
                抖音蓝V
              </div>

              {!douyinFileInfo ? (
                <div
                  onClick={() => douyinInputRef.current?.click()}
                  style={{
                    border: '2px dashed #d1d5db',
                    borderRadius: '8px',
                    padding: '32px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    background: douyinUploading ? '#f3f4f6' : '#f9fafb'
                  }}
                >
                  <input
                    ref={douyinInputRef}
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleDouyinFileSelect}
                    style={{ display: 'none' }}
                  />
                  <div style={{ fontSize: '40px', marginBottom: '12px' }}>📁</div>
                  <div style={{ fontSize: '14px', color: '#374151', marginBottom: '4px' }}>
                    {douyinUploading ? '上传中...' : '点击选择Excel文件'}
                  </div>
                  <div style={{ fontSize: '12px', color: '#6b7280' }}>
                    支持 .xlsx, .xls 格式
                  </div>
                </div>
              ) : (
                <div>
                  {/* 文件显示区 */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    background: '#f3f4f6',
                    borderRadius: '6px',
                    marginBottom: '16px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '16px' }}>📄</span>
                      <span style={{ fontSize: '13px', color: '#374151' }}>
                        {douyinFileInfo.fileName}
                      </span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveDouyinFile?.();
                      }}
                      style={{
                        background: '#fee2e2',
                        border: 'none',
                        color: '#dc2626',
                        padding: '4px 12px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        cursor: 'pointer'
                      }}
                    >
                      删除
                    </button>
                  </div>

                  {/* 上传结果显示 */}
                  {douyinFileInfo.result && (
                    <div style={{ background: '#f9fafb', borderRadius: '6px', padding: '16px' }}>
                      {/* 核心数据统计 */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '16px' }}>
                        <div style={{ background: '#05966915', padding: '12px', borderRadius: '6px', textAlign: 'center' }}>
                          <div style={{ fontSize: '14px', color: '#059669', marginBottom: '4px' }}>更新成功</div>
                          <div style={{ fontSize: '18px', fontWeight: 600, color: '#059669' }}>
                            {douyinFileInfo.result.updatedCount}
                          </div>
                        </div>
                        <div style={{ background: '#dc262615', padding: '12px', borderRadius: '6px', textAlign: 'center' }}>
                          <div style={{ fontSize: '14px', color: '#dc2626', marginBottom: '4px' }}>未找到门店</div>
                          <div style={{ fontSize: '18px', fontWeight: 600, color: '#dc2626' }}>
                            {douyinFileInfo.result.notFoundCount}
                          </div>
                        </div>
                        <div style={{ background: '#f59e0b15', padding: '12px', borderRadius: '6px', textAlign: 'center' }}>
                          <div style={{ fontSize: '14px', color: '#f59e0b', marginBottom: '4px' }}>更新失败</div>
                          <div style={{ fontSize: '18px', fontWeight: 600, color: '#f59e0b' }}>
                            {douyinFileInfo.result.errorCount}
                          </div>
                        </div>
                      </div>

                      {/* 未找到门店列表 */}
                      {douyinFileInfo.result.notFoundStores.length > 0 && (
                        <div>
                          <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '8px', color: '#374151' }}>
                            未找到的门店：
                          </div>
                          <div style={{ 
                            maxHeight: '150px', 
                            overflowY: 'auto', 
                            background: 'white', 
                            border: '1px solid #e5e7eb', 
                            borderRadius: '6px',
                            padding: '8px'
                          }}>
                            {douyinFileInfo.result.notFoundStores.map((store, index) => (
                              <div key={index} style={{ 
                                fontSize: '12px', 
                                color: '#6b7280', 
                                padding: '6px 8px',
                                borderBottom: index < douyinFileInfo.result.notFoundStores.length - 1 ? '1px solid #f3f4f6' : 'none'
                              }}>
                                第{store.rowNumber}行：{store.storeName}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div style={{ fontSize: '13px', color: '#9ca3af', marginTop: '12px' }}>
                        共处理 {douyinFileInfo.result.totalRecords} 条数据
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 右侧：商家职人数/视频数/职人曝光量 */}
            <div>
              <div style={{
                fontSize: '16px',
                fontWeight: 600,
                marginBottom: '20px',
                paddingBottom: '8px',
                borderBottom: '3px solid #7c3aed',
                display: 'inline-block'
              }}>
                商家职人数/视频数/职人曝光量
              </div>

              {/* 文件1 */}
              {!staffFileInfo ? (
                <div
                  onClick={() => staffInputRef.current?.click()}
                  style={{
                    border: '2px dashed #d1d5db',
                    borderRadius: '8px',
                    padding: '24px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    background: staffUploading ? '#f3f4f6' : '#f9fafb',
                    marginBottom: '12px'
                  }}
                >
                  <input
                    ref={staffInputRef}
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleStaffFileSelect}
                    style={{ display: 'none' }}
                  />
                  <div style={{ fontSize: '32px', marginBottom: '8px' }}>📁</div>
                  <div style={{ fontSize: '13px', color: '#374151', marginBottom: '2px' }}>
                    {staffUploading ? '上传中...' : '文件1：点击选择Excel文件'}
                  </div>
                  <div style={{ fontSize: '11px', color: '#6b7280' }}>
                    支持 .xlsx, .xls 格式
                  </div>
                </div>
              ) : (
                <div style={{ marginBottom: '12px' }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    background: '#f3f4f6',
                    borderRadius: '6px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '14px' }}>📄</span>
                      <span style={{ fontSize: '12px', color: '#374151' }}>
                        文件1：{staffFileInfo.fileName}
                      </span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveStaffFile?.();
                      }}
                      style={{
                        background: '#fee2e2',
                        border: 'none',
                        color: '#dc2626',
                        padding: '3px 10px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        cursor: 'pointer'
                      }}
                    >
                      删除
                    </button>
                  </div>
                </div>
              )}

              {/* 文件2 */}
              {!staffFileInfo2 ? (
                <div
                  onClick={() => staffInputRef2.current?.click()}
                  style={{
                    border: '2px dashed #d1d5db',
                    borderRadius: '8px',
                    padding: '24px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    background: staffUploading2 ? '#f3f4f6' : '#f9fafb'
                  }}
                >
                  <input
                    ref={staffInputRef2}
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleStaffFileSelect2}
                    style={{ display: 'none' }}
                  />
                  <div style={{ fontSize: '32px', marginBottom: '8px' }}>📁</div>
                  <div style={{ fontSize: '13px', color: '#374151', marginBottom: '2px' }}>
                    {staffUploading2 ? '上传中...' : '文件2：点击选择Excel文件'}
                  </div>
                  <div style={{ fontSize: '11px', color: '#6b7280' }}>
                    支持 .xlsx, .xls 格式
                  </div>
                </div>
              ) : (
                <div style={{ marginBottom: '16px' }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    background: '#f3f4f6',
                    borderRadius: '6px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '14px' }}>📄</span>
                      <span style={{ fontSize: '12px', color: '#374151' }}>
                        文件2：{staffFileInfo2.fileName}
                      </span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveStaffFile2?.();
                      }}
                      style={{
                        background: '#fee2e2',
                        border: 'none',
                        color: '#dc2626',
                        padding: '3px 10px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        cursor: 'pointer'
                      }}
                    >
                      删除
                    </button>
                  </div>
                </div>
              )}

              {/* 上传结果显示 - 合并两个文件 */}
              {(staffFileInfo || staffFileInfo2) && (
                <div style={{ background: '#f9fafb', borderRadius: '6px', padding: '16px' }}>
                  {/* 核心数据统计 - 合并两个文件 */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '16px' }}>
                    <div style={{ background: '#05966915', padding: '12px', borderRadius: '6px', textAlign: 'center' }}>
                      <div style={{ fontSize: '14px', color: '#059669', marginBottom: '4px' }}>表格内总条数</div>
                      <div style={{ fontSize: '18px', fontWeight: 600, color: '#059669' }}>
                        {((staffFileInfo?.result.totalRecords || 0) + (staffFileInfo2?.result.totalRecords || 0)).toLocaleString()}
                      </div>
                    </div>
                    <div style={{ background: '#7c3aed15', padding: '12px', borderRadius: '6px', textAlign: 'center' }}>
                      <div style={{ fontSize: '14px', color: '#7c3aed', marginBottom: '4px' }}>职人数</div>
                      <div style={{ fontSize: '18px', fontWeight: 600, color: '#7c3aed' }}>
                        {((staffFileInfo?.result.staffCount || 0) + (staffFileInfo2?.result.staffCount || 0)).toLocaleString()}
                      </div>
                    </div>
                    <div style={{ background: '#f59e0b15', padding: '12px', borderRadius: '6px', textAlign: 'center' }}>
                      <div style={{ fontSize: '14px', color: '#f59e0b', marginBottom: '4px' }}>更新成功</div>
                      <div style={{ fontSize: '18px', fontWeight: 600, color: '#f59e0b' }}>
                        {(staffFileInfo?.result.updatedCount || 0) + (staffFileInfo2?.result.updatedCount || 0)}
                      </div>
                    </div>
                  </div>

                  {/* 更新统计 - 合并两个文件 */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '16px' }}>
                    <div style={{ background: '#05966915', padding: '12px', borderRadius: '6px', textAlign: 'center' }}>
                      <div style={{ fontSize: '14px', color: '#059669', marginBottom: '4px' }}>视频数</div>
                      <div style={{ fontSize: '18px', fontWeight: 600, color: '#059669' }}>
                        {((staffFileInfo?.result.videoCount || 0) + (staffFileInfo2?.result.videoCount || 0)).toLocaleString()}
                      </div>
                    </div>
                    <div style={{ background: '#7c3aed15', padding: '12px', borderRadius: '6px', textAlign: 'center' }}>
                      <div style={{ fontSize: '14px', color: '#7c3aed', marginBottom: '4px' }}>职人曝光量</div>
                      <div style={{ fontSize: '18px', fontWeight: 600, color: '#7c3aed' }}>
                        {((staffFileInfo?.result.exposureCount || 0) + (staffFileInfo2?.result.exposureCount || 0)).toLocaleString()}
                      </div>
                    </div>
                    <div style={{ background: '#dc262615', padding: '12px', borderRadius: '6px', textAlign: 'center' }}>
                      <div style={{ fontSize: '14px', color: '#dc2626', marginBottom: '4px' }}>更新失败</div>
                      <div style={{ fontSize: '18px', fontWeight: 600, color: '#dc2626' }}>
                        {(staffFileInfo?.result.notFoundCount || 0) + (staffFileInfo2?.result.notFoundCount || 0)}
                      </div>
                    </div>
                  </div>

                  {/* 未找到门店列表 - 合并两个文件 */}
                  {((staffFileInfo?.result.notFoundStores?.length || 0) + (staffFileInfo2?.result.notFoundStores?.length || 0)) > 0 && (
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '8px', color: '#374151' }}>
                        失败原因：
                      </div>
                      <div style={{ 
                        maxHeight: '150px', 
                        overflowY: 'auto', 
                        background: 'white', 
                        border: '1px solid #e5e7eb', 
                        borderRadius: '6px',
                        padding: '8px'
                      }}>
                        {[
                          ...(staffFileInfo?.result.notFoundStores?.map(s => ({ ...s, file: 1 })) || []),
                          ...(staffFileInfo2?.result.notFoundStores?.map(s => ({ ...s, file: 2 })) || [])
                        ].map((store, index) => (
                          <div key={index} style={{ 
                            fontSize: '12px', 
                            color: '#6b7280', 
                            padding: '6px 8px',
                            borderBottom: index < ((staffFileInfo?.result.notFoundStores?.length || 0) + (staffFileInfo2?.result.notFoundStores?.length || 0)) - 1 ? '1px solid #f3f4f6' : 'none'
                          }}>
                            文件{store.file} 第{store.rowNumber}行：{store.storeName} (门店ID: {store.storeId})
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div style={{ fontSize: '13px', color: '#9ca3af', marginTop: '12px' }}>
                    共处理 {((staffFileInfo?.result.totalRecords || 0) + (staffFileInfo2?.result.totalRecords || 0))} 条数据
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 底部按钮 */}
        <div style={{
          display: 'flex',
          justifyContent: 'flex-end',
          padding: '16px 24px',
          borderTop: '1px solid #e5e7eb'
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 20px',
              borderRadius: '6px',
              border: '1px solid #d1d5db',
              background: 'white',
              fontSize: '14px',
              cursor: 'pointer'
            }}
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}