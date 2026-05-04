'use client';

import { useEffect, useState } from 'react';

export default function DebugPage() {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    const currentSystem = localStorage.getItem('currentSystem') || 'hecha';

    const debugData = {
      currentSystem,
      orderStats: null as any,
      verifyStats: null as any,
      orderDataSample: null as any,
      verifyDataSample: null as any,
      stores: null as any,
      allLocalStorageKeys: [] as string[],
    };

    // 显示所有localStorage键
    debugData.allLocalStorageKeys = Object.keys(localStorage).filter(key =>
      key.startsWith('order') || key.startsWith('verify') || key === 'currentSystem' || key === 'stores'
    );

    // 读取聚合数据
    const orderStatsStr = localStorage.getItem(`orderStats_${currentSystem}`);
    const verifyStatsStr = localStorage.getItem(`verifyStats_${currentSystem}`);

    if (orderStatsStr) {
      debugData.orderStats = JSON.parse(orderStatsStr);
    }
    if (verifyStatsStr) {
      debugData.verifyStats = JSON.parse(verifyStatsStr);
    }

    // 读取原始数据（只取前5条）
    const orderDataStr = localStorage.getItem(`orderData_${currentSystem}`);
    const verifyDataStr = localStorage.getItem(`verifyData_${currentSystem}`);

    if (orderDataStr) {
      const orderData = JSON.parse(orderDataStr);
      debugData.orderDataSample = orderData.slice(0, 3);
    }
    if (verifyDataStr) {
      const verifyData = JSON.parse(verifyDataStr);
      debugData.verifyDataSample = verifyData.slice(0, 3);
    }

    // 读取门店列表
    const storesStr = localStorage.getItem('stores');
    if (storesStr) {
      debugData.stores = JSON.parse(storesStr);
    }

    setData(debugData);
  }, []);

  if (!data) {
    return <div style={{ padding: '20px' }}>加载中...</div>;
  }

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ marginBottom: '20px' }}>数据诊断页面</h1>

      <div style={{ marginBottom: '30px' }}>
        <h2 style={{ marginBottom: '10px' }}>当前门店体系</h2>
        <div style={{ background: '#f5f5f5', padding: '15px', borderRadius: '8px' }}>
          <strong>{data.currentSystem}</strong>
        </div>
      </div>

      {/* LocalStorage键列表 */}
      <div style={{ marginBottom: '30px' }}>
        <h2 style={{ marginBottom: '10px' }}>LocalStorage中的键</h2>
        <div style={{ background: '#f5f5f5', padding: '15px', borderRadius: '8px' }}>
          <pre style={{ fontSize: '12px', margin: 0 }}>
            {data.allLocalStorageKeys.length > 0 ? data.allLocalStorageKeys.join('\n') : '没有找到相关键'}
          </pre>
        </div>
      </div>

      {/* 门店数据 */}
      <div style={{ marginBottom: '30px' }}>
        <h2 style={{ marginBottom: '10px' }}>门店列表（前5个）</h2>
        {data.stores ? (
          <div style={{ background: '#f5f5f5', padding: '15px', borderRadius: '8px', overflow: 'auto' }}>
            <pre style={{ fontSize: '12px' }}>
              {JSON.stringify(data.stores.slice(0, 5).map((s: any) => ({
                id: s.id,
                store_id: s.store_id,
                store_name: s.store_name,
                city: s.city,
              })), null, 2)}
            </pre>
          </div>
        ) : (
          <div style={{ color: 'red' }}>❌ 没有门店数据</div>
        )}
      </div>

      {/* 订单聚合数据 */}
      <div style={{ marginBottom: '30px' }}>
        <h2 style={{ marginBottom: '10px' }}>订单聚合数据</h2>
        {data.orderStats ? (
          <div>
            <div style={{ marginBottom: '10px', background: '#e6f7ff', padding: '10px', borderRadius: '4px' }}>
              <strong>✓ 有订单聚合数据</strong>
            </div>
            <div style={{ marginBottom: '10px' }}>
              <strong>门店数量:</strong> {Object.keys(data.orderStats.storeStats).length}
            </div>
            <div style={{ background: '#f5f5f5', padding: '15px', borderRadius: '8px', overflow: 'auto' }}>
              <h3 style={{ marginTop: 0 }}>门店ID列表（前10个）:</h3>
              <pre style={{ fontSize: '11px' }}>
                {JSON.stringify(Object.keys(data.orderStats.storeStats).slice(0, 10), null, 2)}
              </pre>
            </div>
          </div>
        ) : (
          <div style={{ background: '#fff1f0', padding: '15px', borderRadius: '8px', color: 'red' }}>
            <strong>❌ 没有订单聚合数据</strong>
            <p style={{ marginTop: '10px' }}>请先上传订单文件</p>
          </div>
        )}
      </div>

      {/* 核销聚合数据 */}
      <div style={{ marginBottom: '30px' }}>
        <h2 style={{ marginBottom: '10px' }}>核销聚合数据</h2>
        {data.verifyStats ? (
          <div>
            <div style={{ marginBottom: '10px', background: '#e6f7ff', padding: '10px', borderRadius: '4px' }}>
              <strong>✓ 有核销聚合数据</strong>
            </div>
            <div style={{ marginBottom: '10px' }}>
              <strong>门店数量:</strong> {Object.keys(data.verifyStats.storeStats).length}
            </div>
          </div>
        ) : (
          <div style={{ background: '#fff1f0', padding: '15px', borderRadius: '8px', color: 'red' }}>
            <strong>❌ 没有核销聚合数据</strong>
            <p style={{ marginTop: '10px' }}>请先上传核销文件</p>
          </div>
        )}
      </div>

      {/* 订单原始数据样本 */}
      <div style={{ marginBottom: '30px' }}>
        <h2 style={{ marginBottom: '10px' }}>订单原始数据样本（前3条）</h2>
        {data.orderDataSample ? (
          <div style={{ background: '#f5f5f5', padding: '15px', borderRadius: '8px', overflow: 'auto' }}>
            <pre style={{ fontSize: '11px' }}>
              {JSON.stringify(data.orderDataSample, null, 2)}
            </pre>
          </div>
        ) : (
          <div style={{ color: 'red' }}>❌ 没有订单原始数据</div>
        )}
      </div>

      {/* 核销原始数据样本 */}
      <div style={{ marginBottom: '30px' }}>
        <h2 style={{ marginBottom: '10px' }}>核销原始数据样本（前3条）</h2>
        {data.verifyDataSample ? (
          <div style={{ background: '#f5f5f5', padding: '15px', borderRadius: '8px', overflow: 'auto' }}>
            <pre style={{ fontSize: '11px' }}>
              {JSON.stringify(data.verifyDataSample, null, 2)}
            </pre>
          </div>
        ) : (
          <div style={{ color: 'red' }}>❌ 没有核销原始数据</div>
        )}
      </div>

      {/* 诊断结果 */}
      <div style={{ marginBottom: '30px', padding: '20px', background: '#fff', border: '2px solid #165dff', borderRadius: '8px' }}>
        <h2 style={{ marginTop: 0, color: '#165dff' }}>诊断结果</h2>
        {!data.orderStats && !data.verifyStats && (
          <div style={{ color: '#ff7d00' }}>
            <strong>⚠️ 问题:</strong> 没有上传订单和核销文件
            <p style={{ marginTop: '10px' }}>
              <strong>解决方案:</strong> 请在门店列表页面上传订单和核销文件
            </p>
          </div>
        )}
        {data.orderStats && data.verifyStats && (
          <div style={{ color: '#00b42a' }}>
            <strong>✓ 已上传数据文件</strong>
            <p style={{ marginTop: '10px' }}>
              如果门店详情仍无数据，请检查：
            </p>
            <ul>
              <li>订单文件中的"意向门店ID"字段是否包含门店的 store_id</li>
              <li>门店的 store_id 字段是否有值</li>
              <li>门店数据与订单数据中的门店ID是否完全一致（包括空格等）</li>
            </ul>
          </div>
        )}
      </div>

      <button
        onClick={() => window.location.href = '/'}
        style={{
          padding: '10px 20px',
          background: '#165dff',
          color: '#fff',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer',
          fontSize: '14px'
        }}
      >
        返回首页
      </button>
    </div>
  );
}
