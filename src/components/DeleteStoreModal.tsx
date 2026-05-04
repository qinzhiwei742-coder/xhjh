'use client';

import { useState } from 'react';

interface DeleteStoreModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export default function DeleteStoreModal({ onClose, onSuccess }: DeleteStoreModalProps) {
  const [password, setPassword] = useState('');
  const [storeIdInput, setStoreIdInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [storeInfo, setStoreInfo] = useState<{ id: string; store_name: string; store_id: string } | null>(null);
  const [verifying, setVerifying] = useState(false);

  // 验证门店ID并获取门店信息
  const handleVerifyStore = async () => {
    if (!storeIdInput.trim()) {
      setError('请输入门店ID');
      return;
    }

    setVerifying(true);
    setError('');
    setStoreInfo(null);

    try {
      // 通过store_id查找门店
      const res = await fetch(`/api/stores?search=${encodeURIComponent(storeIdInput.trim())}`);
      const data = await res.json();

      if (!data.success || !data.data || data.data.length === 0) {
        setError('未找到该门店ID对应的门店');
        setVerifying(false);
        return;
      }

      // 精确匹配store_id
      const store = data.data.find((s: { store_id: string }) => s.store_id === storeIdInput.trim());
      if (!store) {
        setError('未找到该门店ID对应的门店');
        setVerifying(false);
        return;
      }

      setStoreInfo(store);
      setVerifying(false);
    } catch (err) {
      console.error('验证门店失败:', err);
      setError('验证门店失败，请重试');
      setVerifying(false);
    }
  };

  const handleDelete = async () => {
    if (!password.trim()) {
      setError('请输入密码');
      return;
    }

    if (!storeInfo) {
      setError('请先验证门店ID');
      return;
    }

    // 验证密码
    if (password !== '996') {
      setError('密码错误');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const deleteRes = await fetch(`/api/stores/${storeInfo.id}`, {
        method: 'DELETE',
      });
      const deleteData = await deleteRes.json();

      if (deleteData.success) {
        setLoading(false);
        onSuccess();
      } else {
        setError(deleteData.error || '删除失败');
        setLoading(false);
      }
    } catch (err) {
      console.error('删除失败:', err);
      setError('删除失败，请重试');
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: '12px',
          padding: '24px',
          width: '440px',
          maxWidth: '90%',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.15)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            background: '#ffece8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f53f3f" strokeWidth="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </div>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#1d2129' }}>
            删除门店
          </h3>
        </div>

        {/* 门店ID输入 */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: '#4e5969', fontWeight: 500 }}>
            门店ID
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              value={storeIdInput}
              onChange={(e) => {
                setStoreIdInput(e.target.value);
                setStoreInfo(null);
                setError('');
              }}
              placeholder="请输入要删除的门店ID"
              style={{
                flex: 1,
                padding: '10px 12px',
                border: '1px solid #e5e6eb',
                borderRadius: '6px',
                fontSize: '13px',
                outline: 'none',
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleVerifyStore();
                }
              }}
            />
            <button
              onClick={handleVerifyStore}
              disabled={verifying || !storeIdInput.trim()}
              style={{
                padding: '10px 16px',
                border: 'none',
                borderRadius: '6px',
                background: '#165dff',
                color: '#fff',
                cursor: verifying ? 'not-allowed' : 'pointer',
                fontSize: '13px',
                fontWeight: 500,
                opacity: verifying || !storeIdInput.trim() ? 0.6 : 1,
                whiteSpace: 'nowrap',
              }}
            >
              {verifying ? '验证中...' : '验证'}
            </button>
          </div>
        </div>

        {/* 门店信息展示 */}
        {storeInfo && (
          <div style={{
            marginBottom: '16px',
            padding: '12px',
            background: '#e8ffea',
            border: '1px solid #00b42a',
            borderRadius: '6px',
          }}>
            <div style={{ fontSize: '13px', color: '#00b42a', marginBottom: '4px' }}>
              已找到门店：
            </div>
            <div style={{ fontSize: '14px', color: '#1d2129', fontWeight: 500 }}>
              {storeInfo.store_name}
            </div>
            <div style={{ fontSize: '12px', color: '#4e5969', marginTop: '4px' }}>
              门店ID: {storeInfo.store_id}
            </div>
          </div>
        )}

        {/* 密码输入 */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: '#4e5969', fontWeight: 500 }}>
            验证密码
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="请输入密码（默认996）"
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1px solid #e5e6eb',
              borderRadius: '6px',
              fontSize: '13px',
              outline: 'none',
            }}
            disabled={!storeInfo}
          />
        </div>

        {error && (
          <div
            style={{
              marginBottom: '16px',
              padding: '10px 12px',
              background: '#ffece8',
              borderRadius: '6px',
              fontSize: '13px',
              color: '#f53f3f',
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
          <button
            onClick={onClose}
            disabled={loading}
            style={{
              padding: '10px 20px',
              border: '1px solid #e5e6eb',
              borderRadius: '6px',
              background: '#fff',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '13px',
              color: '#4e5969',
              opacity: loading ? 0.5 : 1,
            }}
          >
            取消
          </button>
          <button
            onClick={handleDelete}
            disabled={loading || !storeInfo}
            style={{
              padding: '10px 20px',
              border: 'none',
              borderRadius: '6px',
              background: '#f53f3f',
              cursor: loading || !storeInfo ? 'not-allowed' : 'pointer',
              fontSize: '13px',
              color: '#fff',
              opacity: loading || !storeInfo ? 0.5 : 1,
            }}
          >
            {loading ? '删除中...' : '确认删除'}
          </button>
        </div>
      </div>
    </div>
  );
}
