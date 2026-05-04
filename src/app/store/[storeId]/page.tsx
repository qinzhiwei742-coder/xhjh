'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';

// 指标卡片类型
interface MetricCard {
  key: string;
  label: string;
  value: number | string;
  prefix?: string;
  suffix?: string;
  color?: string;
}

// 每日数据类型
interface DailyData {
  date: string;
  totalOrders: number;
  fakeOrders: number;
  refundCount: number;
  unverifiedCount: number;
  verifyCount: number;
  verifyRate: number;
  totalAmount: number;
  fakeAmount: number;
  refundAmount: number;
  unverifiedAmount: number;
  verifyAmount: number;
  amountVerifyRate: number;
}

// 月度数据类型
interface MonthlyData {
  year: number;
  month: number;
  metrics: {
    totalOrders: number;
    fakeOrders: number;
    refundCount: number;
    unverifiedCount: number;
    verifyCount: number;
    verifyRate: string;
    totalAmount: number;
    fakeAmount: number;
    refundAmount: number;
    unverifiedAmount: number;
    verifyAmount: number;
    amountVerifyRate: string;
  };
}

// 渠道数据类型
interface ChannelData {
  channel: string;
  orderCount: number;
  verifyCount: number;
  refundCount: number;
  refundRate: string;
  totalAmount: number;
  verifyAmount: number;
  refundAmount: number;
  percentage: string;
}

// 订单原始数据类型
interface OrderData {
  '订单ID': string;
  '成交渠道': string;
  '商户名称': string;
  '订单金额': number;
  // 其他字段...
}

// 核销原始数据类型
interface VerifyData {
  '订单ID': string;
  '状态': number;
  '核销金额': number;
  // 其他字段...
}

// 趋势图弹窗组件
function TrendChartModal({ isOpen, onClose, title, dailyData, dataKey, dataLabel }: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  dailyData: DailyData[];
  dataKey: keyof DailyData;
  dataLabel: string;
}) {
  if (!isOpen) return null;

  // 获取最近90天的数据
  const recent90Days = dailyData.slice(-90);

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999
    }} onClick={onClose}>
      <div style={{
        background: '#fff',
        padding: '24px',
        borderRadius: '8px',
        width: '900px',
        maxHeight: '90vh',
        overflow: 'auto',
        boxShadow: '0 8px 24px rgba(0,0,0,0.2)'
      }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#1d2129' }}>{title} - 最近90天趋势</h3>
          <button
            onClick={onClose}
            style={{
              border: 'none',
              background: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              color: '#86909c',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '4px',
              transition: 'background 0.2s'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#f2f3f5'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
          >
            ×
          </button>
        </div>
        <div style={{ height: '450px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={recent90Days}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e6eb" />
              <XAxis
                dataKey="date"
                style={{ fontSize: '12px', fill: '#86909c' }}
                tickFormatter={(value) => {
                  const date = new Date(value);
                  return `${date.getMonth() + 1}/${date.getDate()}`;
                }}
              />
              <YAxis style={{ fontSize: '12px', fill: '#86909c' }} />
              <Tooltip
                labelFormatter={(value) => {
                  const date = new Date(value);
                  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                }}
                formatter={(value: number) => {
                  if (typeof value === 'number') {
                    if (dataKey.includes('Amount') || dataKey.includes('Rate')) {
                      return [value.toFixed(2), dataLabel];
                    }
                    return [value.toLocaleString(), dataLabel];
                  }
                  return [value, dataLabel];
                }}
                contentStyle={{
                  background: '#fff',
                  border: '1px solid #e5e6eb',
                  borderRadius: '6px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                }}
              />
              <Line
                type="monotone"
                dataKey={dataKey}
                stroke="#165dff"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 5, fill: '#165dff', stroke: '#fff', strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

export default function StoreDetailPage() {
  const params = useParams();
  const router = useRouter();
  const storeId = params.storeId as string;
  const [loading, setLoading] = useState(true);
  const [store, setStore] = useState<any>(null);
  const [dailyData, setDailyData] = useState<DailyData[]>([]);
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([]);
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const [channelData, setChannelData] = useState<ChannelData[]>([]);
  const [chartModal, setChartModal] = useState<{ isOpen: boolean; title: string; dataKey: keyof DailyData; dataLabel: string }>({
    isOpen: false,
    title: '',
    dataKey: 'totalOrders',
    dataLabel: '订单数'
  });

  // 获取门店详细信息
  useEffect(() => {
    const fetchStoreData = async () => {
      try {
        const res = await fetch(`/api/stores/${storeId}`);
        const data = await res.json();
        if (data.success) {
          setStore(data.data);
        } else {
          // 如果获取失败，从门店列表localStorage读取
          const storesStr = localStorage.getItem('stores');
          if (storesStr) {
            const stores = JSON.parse(storesStr);
            const foundStore = stores.find((s: any) => s.id === storeId);
            if (foundStore) {
              setStore(foundStore);
            }
          }
        }
      } catch (error) {
        console.error('获取门店信息失败:', error);
      }
    };

    if (storeId) {
      fetchStoreData();
    }
  }, [storeId]);

  // 获取订单和核销数据
  useEffect(() => {
    const fetchMetricsData = async () => {
      try {
        // 从 localStorage 读取当前门店体系
        const currentSystem = localStorage.getItem('currentSystem') || 'hecha';

        // 从 localStorage 读取聚合数据（使用当前门店体系）
        const orderStatsStr = localStorage.getItem(`orderStats_${currentSystem}`);
        const verifyStatsStr = localStorage.getItem(`verifyStats_${currentSystem}`);

        // 从 localStorage 读取原始订单数据（用于渠道维度）
        const orderDataStr = localStorage.getItem(`orderData_${currentSystem}`);
        const verifyDataStr = localStorage.getItem(`verifyData_${currentSystem}`);

        if (orderStatsStr && verifyStatsStr) {
          const orderStats = JSON.parse(orderStatsStr);
          const verifyStats = JSON.parse(verifyStatsStr);

          const storeOrderStats = orderStats.storeStats[storeId];
          const storeVerifyStats = verifyStats.storeStats[storeId];

          if (storeOrderStats?.dailyStats && storeVerifyStats?.dailyStats) {
            // 计算每日数据
            const daily: DailyData[] = [];
            const allDates = new Set([
              ...Object.keys(storeOrderStats.dailyStats),
              ...Object.keys(storeVerifyStats.dailyStats)
            ]);

            allDates.forEach(date => {
              const orderDaily = storeOrderStats.dailyStats[date] || {};
              const verifyDaily = storeVerifyStats.dailyStats[date] || {};

              const totalOrders = orderDaily.orderCount || 0;
              const totalAmount = orderDaily.orderAmount || 0;
              const verifyCount = verifyDaily.verifyCount || 0;
              const verifyAmount = verifyDaily.verifyAmount || 0;

              daily.push({
                date,
                totalOrders: orderDaily.orderCount || 0,
                fakeOrders: orderDaily.fakeOrderCount || 0,
                refundCount: orderDaily.refundCount || 0,
                unverifiedCount: orderDaily.unverifiedCount || 0,
                verifyCount: verifyDaily.verifyCount || 0,
                verifyRate: totalOrders > 0 ? (verifyCount / totalOrders) * 100 : 0,
                totalAmount: orderDaily.orderAmount || 0,
                fakeAmount: orderDaily.fakeOrderAmount || 0,
                refundAmount: orderDaily.refundAmount || 0,
                unverifiedAmount: orderDaily.unverifiedAmount || 0,
                verifyAmount: verifyDaily.verifyAmount || 0,
                amountVerifyRate: totalAmount > 0 ? (verifyAmount / totalAmount) * 100 : 0,
              });
            });

            daily.sort((a, b) => a.date.localeCompare(b.date));
            setDailyData(daily);

            // 计算月度数据（2025-2026年）
            const monthly: MonthlyData[] = [];
            for (let year = 2025; year <= 2026; year++) {
              for (let month = 1; month <= 12; month++) {
                const monthKey = `${year}-${String(month).padStart(2, '0')}`;
                const monthDaily = daily.filter(d => d.date.startsWith(monthKey));

                const metrics = monthDaily.reduce((acc, d) => ({
                  totalOrders: acc.totalOrders + d.totalOrders,
                  fakeOrders: acc.fakeOrders + d.fakeOrders,
                  refundCount: acc.refundCount + d.refundCount,
                  unverifiedCount: acc.unverifiedCount + d.unverifiedCount,
                  verifyCount: acc.verifyCount + d.verifyCount,
                  totalAmount: acc.totalAmount + d.totalAmount,
                  fakeAmount: acc.fakeAmount + d.fakeAmount,
                  refundAmount: acc.refundAmount + d.refundAmount,
                  unverifiedAmount: acc.unverifiedAmount + d.unverifiedAmount,
                  verifyAmount: acc.verifyAmount + d.verifyAmount,
                }), {
                  totalOrders: 0,
                  fakeOrders: 0,
                  refundCount: 0,
                  unverifiedCount: 0,
                  verifyCount: 0,
                  totalAmount: 0,
                  fakeAmount: 0,
                  refundAmount: 0,
                  unverifiedAmount: 0,
                  verifyAmount: 0,
                });

                monthly.push({
                  year,
                  month,
                  metrics: {
                    ...metrics,
                    verifyRate: metrics.totalOrders > 0 ? ((metrics.verifyCount / metrics.totalOrders) * 100).toFixed(1) : '0',
                    amountVerifyRate: metrics.totalAmount > 0 ? ((metrics.verifyAmount / metrics.totalAmount) * 100).toFixed(1) : '0',
                  },
                });
              }
            }

            setMonthlyData(monthly);
          }
        }

        // 处理渠道维度数据
        if (orderDataStr && verifyDataStr && store) {
          const orderData: OrderData[] = JSON.parse(orderDataStr);
          const verifyData: VerifyData[] = JSON.parse(verifyDataStr);

          // 过滤当前门店的订单数据（按商户名称）
          const storeOrders = orderData.filter(order => order['商户名称'] === store.store_name);

          // 按渠道分组统计订单数据
          const channelMap = new Map<string, {
            orderIds: Set<string>;
            orderCount: number;
            totalAmount: number;
          }>();

          storeOrders.forEach(order => {
            const channel = order['成交渠道'] || '未知渠道';
            if (!channelMap.has(channel)) {
              channelMap.set(channel, {
                orderIds: new Set(),
                orderCount: 0,
                totalAmount: 0,
              });
            }
            const channelData = channelMap.get(channel)!;
            channelData.orderIds.add(order['订单ID']);
            channelData.orderCount++;
            channelData.totalAmount += order['订单金额'] || 0;
          });

          // 按订单ID对齐核销数据
          const verifyMap = new Map<string, {
            verifyCount: number;
            verifyAmount: number;
            refundCount: number;
            refundAmount: number;
          }>();

          verifyData.forEach(verify => {
            if (!verifyMap.has(verify['订单ID'])) {
              verifyMap.set(verify['订单ID'], {
                verifyCount: 0,
                verifyAmount: 0,
                refundCount: 0,
                refundAmount: 0,
              });
            }
            const data = verifyMap.get(verify['订单ID'])!;

            if (verify['状态'] === 11) {
              // 退款
              data.refundCount++;
              data.refundAmount += verify['核销金额'] || 0;
            } else if (verify['状态'] === 9) {
              // 核销
              data.verifyCount++;
              data.verifyAmount += verify['核销金额'] || 0;
            }
          });

          // 计算各渠道的核销和退款数据
          const channels: ChannelData[] = [];
          const totalOrderCount = storeOrders.length;

          channelMap.forEach((value, channel) => {
            let verifyCount = 0;
            let verifyAmount = 0;
            let refundCount = 0;
            let refundAmount = 0;

            value.orderIds.forEach(orderId => {
              const verifyData = verifyMap.get(orderId);
              if (verifyData) {
                verifyCount += verifyData.verifyCount;
                verifyAmount += verifyData.verifyAmount;
                refundCount += verifyData.refundCount;
                refundAmount += verifyData.refundAmount;
              }
            });

            const refundRate = value.orderCount > 0 ? (refundCount / value.orderCount) * 100 : 0;

            channels.push({
              channel,
              orderCount: value.orderCount,
              verifyCount,
              refundCount,
              refundRate: refundRate.toFixed(1),
              totalAmount: value.totalAmount,
              verifyAmount,
              refundAmount,
              percentage: totalOrderCount > 0 ? ((value.orderCount / totalOrderCount) * 100).toFixed(1) : '0',
            });
          });

          // 按订单数降序排序
          channels.sort((a, b) => b.orderCount - a.orderCount);
          setChannelData(channels);
        }

        setLoading(false);
      } catch (error) {
        console.error('获取指标数据失败:', error);
        setLoading(false);
      }
    };

    fetchMetricsData();
  }, [storeId, store]);

  // 切换月份展开/折叠
  const toggleMonth = (year: number, month: number) => {
    const key = `${year}-${month}`;
    setExpandedMonths(prev => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  };

  if (loading) {
    return (
      <div style={{
        padding: '24px',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '14px',
        color: '#86909c'
      }}>
        加载中...
      </div>
    );
  }

  // 按类别分组的指标卡片
  const quantityCards: MetricCard[] = [
    { key: 'totalOrders', label: '订单数', value: dailyData.reduce((sum, d) => sum + d.totalOrders, 0), color: '#165dff' },
    { key: 'fakeOrders', label: '刷单数', value: dailyData.reduce((sum, d) => sum + d.fakeOrders, 0), color: '#ff7d00' },
    { key: 'refundCount', label: '退款数', value: dailyData.reduce((sum, d) => sum + d.refundCount, 0), color: '#f53f3f' },
    { key: 'unverifiedCount', label: '未核销数', value: dailyData.reduce((sum, d) => sum + d.unverifiedCount, 0), color: '#f53f3f' },
    { key: 'verifyCount', label: '核销数', value: dailyData.reduce((sum, d) => sum + d.verifyCount, 0), color: '#00b42a' },
  ];

  const amountCards: MetricCard[] = [
    { key: 'totalAmount', label: '订单金额', value: dailyData.reduce((sum, d) => sum + d.totalAmount, 0), prefix: '¥', color: '#165dff' },
    { key: 'fakeAmount', label: '刷单金额', value: dailyData.reduce((sum, d) => sum + d.fakeAmount, 0), prefix: '¥', color: '#ff7d00' },
    { key: 'refundAmount', label: '退款金额', value: dailyData.reduce((sum, d) => sum + d.refundAmount, 0), prefix: '¥', color: '#f53f3f' },
    { key: 'unverifiedAmount', label: '未核销金额', value: dailyData.reduce((sum, d) => sum + d.unverifiedAmount, 0), prefix: '¥', color: '#f53f3f' },
    { key: 'verifyAmount', label: '核销金额', value: dailyData.reduce((sum, d) => sum + d.verifyAmount, 0), prefix: '¥', color: '#00b42a' },
  ];

  const rateCards: MetricCard[] = [
    { key: 'verifyRate', label: '核销率', value: dailyData.length > 0 ? (dailyData.reduce((sum, d) => sum + d.verifyCount, 0) / dailyData.reduce((sum, d) => sum + d.totalOrders, 0) * 100).toFixed(1) : 0, suffix: '%', color: '#165dff' },
    { key: 'amountVerifyRate', label: '金额核销率', value: dailyData.length > 0 ? (dailyData.reduce((sum, d) => sum + d.verifyAmount, 0) / dailyData.reduce((sum, d) => sum + d.totalAmount, 0) * 100).toFixed(1) : 0, suffix: '%', color: '#165dff' },
  ];

  return (
    <div style={{ padding: '24px', background: '#f7f8fa', minHeight: '100vh', maxWidth: '1600px', margin: '0 auto' }}>
      {/* 门店信息卡片 */}
      <div style={{
        background: '#fff',
        borderRadius: '8px',
        padding: '20px',
        marginBottom: '20px',
        boxShadow: '0 1px 2px rgba(0,0,0,0.06)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
              <button
                onClick={() => router.back()}
                style={{
                  border: '1px solid #e5e6eb',
                  background: '#fff',
                  padding: '6px 12px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  color: '#4e5969',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#165dff';
                  e.currentTarget.style.color = '#165dff';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#e5e6eb';
                  e.currentTarget.style.color = '#4e5969';
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M19 12H5M12 19l-7-7 7-7"/>
                </svg>
                返回
              </button>
              <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1d2129', margin: 0 }}>门店详情</h1>
            </div>

            <div style={{ display: 'flex', gap: '40px', fontSize: '13px', color: '#4e5969' }}>
              <div>
                <span style={{ color: '#86909c' }}>门店名称：</span>
                <span style={{ color: '#1d2129', fontWeight: 500 }}>{store?.store_name || '-'}</span>
              </div>
              <div>
                <span style={{ color: '#86909c' }}>门店ID：</span>
                <span style={{ color: '#1d2129', fontFamily: 'monospace' }}>{store?.store_id || store?.id || '-'}</span>
              </div>
              <div>
                <span style={{ color: '#86909c' }}>品类：</span>
                <span style={{ color: '#1d2129' }}>{store?.category || '-'}</span>
              </div>
              <div>
                <span style={{ color: '#86909c' }}>城市：</span>
                <span style={{ color: '#1d2129' }}>{store?.city || '-'}</span>
              </div>
            </div>

            {store?.address && (
              <div style={{ fontSize: '13px', color: '#4e5969', marginTop: '8px' }}>
                <span style={{ color: '#86909c' }}>地址：</span>
                <span style={{ color: '#1d2129' }}>{store.address}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 仪表盘 - 分类展示 */}
      <div style={{
        background: '#fff',
        borderRadius: '8px',
        padding: '20px',
        marginBottom: '20px',
        boxShadow: '0 1px 2px rgba(0,0,0,0.06)'
      }}>
        <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#1d2129', marginBottom: '16px', margin: 0 }}>数据概览</h2>

        {/* 数量类指标 */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '13px', color: '#86909c', marginBottom: '8px', fontWeight: 500 }}>数量指标</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px' }}>
            {quantityCards.map(card => (
              <div
                key={card.key}
                style={{
                  background: '#f7f8fa',
                  padding: '16px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  border: `1px solid ${card.color}20`,
                  borderLeft: `3px solid ${card.color}`
                }}
                onClick={() => {
                  const labelMap: Record<string, string> = {
                    totalOrders: '订单数',
                    fakeOrders: '刷单数',
                    refundCount: '退款数',
                    unverifiedCount: '未核销数',
                    verifyCount: '核销数',
                  };
                  setChartModal({
                    isOpen: true,
                    title: card.label,
                    dataKey: card.key as keyof DailyData,
                    dataLabel: labelMap[card.key] || card.label
                  });
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#fff';
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#f7f8fa';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div style={{ fontSize: '12px', color: '#86909c', marginBottom: '8px' }}>{card.label}</div>
                <div style={{ fontSize: '20px', fontWeight: 600, color: card.color }}>
                  {card.prefix && <span style={{ fontSize: '14px' }}>{card.prefix}</span>}
                  {typeof card.value === 'number' ? card.value.toLocaleString() : card.value}
                  {card.suffix && <span>{card.suffix}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 金额类指标 */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '13px', color: '#86909c', marginBottom: '8px', fontWeight: 500 }}>金额指标</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px' }}>
            {amountCards.map(card => (
              <div
                key={card.key}
                style={{
                  background: '#f7f8fa',
                  padding: '16px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  border: `1px solid ${card.color}20`,
                  borderLeft: `3px solid ${card.color}`
                }}
                onClick={() => {
                  const labelMap: Record<string, string> = {
                    totalAmount: '订单金额',
                    fakeAmount: '刷单金额',
                    refundAmount: '退款金额',
                    unverifiedAmount: '未核销金额',
                    verifyAmount: '核销金额',
                  };
                  setChartModal({
                    isOpen: true,
                    title: card.label,
                    dataKey: card.key as keyof DailyData,
                    dataLabel: labelMap[card.key] || card.label
                  });
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#fff';
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#f7f8fa';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div style={{ fontSize: '12px', color: '#86909c', marginBottom: '8px' }}>{card.label}</div>
                <div style={{ fontSize: '20px', fontWeight: 600, color: card.color }}>
                  {card.prefix && <span style={{ fontSize: '14px' }}>{card.prefix}</span>}
                  {typeof card.value === 'number' ? card.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : card.value}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 转化率指标 */}
        <div>
          <div style={{ fontSize: '13px', color: '#86909c', marginBottom: '8px', fontWeight: 500 }}>转化率指标</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
            {rateCards.map(card => (
              <div
                key={card.key}
                style={{
                  background: '#f7f8fa',
                  padding: '16px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  border: `1px solid ${card.color}20`,
                  borderLeft: `3px solid ${card.color}`
                }}
                onClick={() => {
                  const labelMap: Record<string, string> = {
                    verifyRate: '核销率',
                    amountVerifyRate: '金额核销率',
                  };
                  setChartModal({
                    isOpen: true,
                    title: card.label,
                    dataKey: card.key as keyof DailyData,
                    dataLabel: labelMap[card.key] || card.label
                  });
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#fff';
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#f7f8fa';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div style={{ fontSize: '12px', color: '#86909c', marginBottom: '8px' }}>{card.label}</div>
                <div style={{ fontSize: '20px', fontWeight: 600, color: card.color }}>
                  {typeof card.value === 'number' ? card.value.toLocaleString() : card.value}
                  {card.suffix && <span>{card.suffix}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 渠道维度 */}
      <div style={{
        background: '#fff',
        borderRadius: '8px',
        padding: '20px',
        marginBottom: '20px',
        boxShadow: '0 1px 2px rgba(0,0,0,0.06)'
      }}>
        <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#1d2129', marginBottom: '16px', margin: 0 }}>渠道维度</h2>
        {channelData.length > 0 ? (
          <div style={{ maxHeight: '400px', overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#f7f8fa' }}>
                  <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #e5e6eb', color: '#4e5969', fontWeight: 500 }}>渠道名称</th>
                  <th style={{ padding: '12px', textAlign: 'right', borderBottom: '2px solid #e5e6eb', color: '#4e5969', fontWeight: 500 }}>占比(%)</th>
                  <th style={{ padding: '12px', textAlign: 'right', borderBottom: '2px solid #e5e6eb', color: '#4e5969', fontWeight: 500 }}>订单数</th>
                  <th style={{ padding: '12px', textAlign: 'right', borderBottom: '2px solid #e5e6eb', color: '#4e5969', fontWeight: 500 }}>核销数</th>
                  <th style={{ padding: '12px', textAlign: 'right', borderBottom: '2px solid #e5e6eb', color: '#4e5969', fontWeight: 500 }}>退款数</th>
                  <th style={{ padding: '12px', textAlign: 'right', borderBottom: '2px solid #e5e6eb', color: '#4e5969', fontWeight: 500 }}>退款率(%)</th>
                  <th style={{ padding: '12px', textAlign: 'right', borderBottom: '2px solid #e5e6eb', color: '#4e5969', fontWeight: 500 }}>订单金额</th>
                  <th style={{ padding: '12px', textAlign: 'right', borderBottom: '2px solid #e5e6eb', color: '#4e5969', fontWeight: 500 }}>核销金额</th>
                  <th style={{ padding: '12px', textAlign: 'right', borderBottom: '2px solid #e5e6eb', color: '#4e5969', fontWeight: 500 }}>退款金额</th>
                </tr>
              </thead>
              <tbody>
                {channelData.map((channel, idx) => (
                  <tr key={idx} style={{ background: idx % 2 === 0 ? '#fff' : '#fafbfc' }}>
                    <td style={{ padding: '12px', borderBottom: '1px solid #f2f3f5', color: '#1d2129' }}>{channel.channel}</td>
                    <td style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: '#1d2129' }}>{channel.percentage}</td>
                    <td style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: '#1d2129' }}>{channel.orderCount}</td>
                    <td style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: '#1d2129' }}>{channel.verifyCount}</td>
                    <td style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: '#1d2129' }}>{channel.refundCount}</td>
                    <td style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: parseFloat(channel.refundRate) > 10 ? '#f53f3f' : '#1d2129', fontWeight: parseFloat(channel.refundRate) > 10 ? 600 : 400 }}>{channel.refundRate}</td>
                    <td style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: '#1d2129' }}>¥{channel.totalAmount.toFixed(2)}</td>
                    <td style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: '#1d2129' }}>¥{channel.verifyAmount.toFixed(2)}</td>
                    <td style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: '#1d2129' }}>¥{channel.refundAmount.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ fontSize: '14px', color: '#86909c', textAlign: 'center', padding: '40px 0' }}>
            暂无渠道数据，请先上传订单Excel文件
          </div>
        )}
      </div>

      {/* 月度趋势 - 简化版 */}
      <div style={{
        background: '#fff',
        borderRadius: '8px',
        padding: '20px',
        boxShadow: '0 1px 2px rgba(0,0,0,0.06)'
      }}>
        <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#1d2129', marginBottom: '16px', margin: 0 }}>月度趋势 (2025-2026)</h2>

        {/* 月度图表 */}
        <div style={{ marginBottom: '20px', height: '300px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthlyData.filter(m => m.metrics.totalOrders > 0)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e6eb" />
              <XAxis
                dataKey="month"
                tickFormatter={(value) => `${value}月`}
                style={{ fontSize: '12px', fill: '#86909c' }}
              />
              <YAxis style={{ fontSize: '12px', fill: '#86909c' }} />
              <Tooltip
                formatter={(value: number, name: string) => [
                  value,
                  name === 'totalOrders' ? '订单数' : name === 'refundCount' ? '退款数' : '核销数'
                ]}
                labelFormatter={(value, payload) => {
                  if (payload && payload[0]) {
                    return `${payload[0].payload.year}年${value}月`;
                  }
                  return `${value}月`;
                }}
                contentStyle={{
                  background: '#fff',
                  border: '1px solid #e5e6eb',
                  borderRadius: '6px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                }}
              />
              <Legend />
              <Bar dataKey="totalOrders" name="订单数" fill="#165dff" radius={[4, 4, 0, 0]} />
              <Bar dataKey="refundCount" name="退款数" fill="#f53f3f" radius={[4, 4, 0, 0]} />
              <Bar dataKey="verifyCount" name="核销数" fill="#00b42a" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* 月度表格 - 只显示有数据的月份 */}
        <div style={{ maxHeight: '400px', overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#f7f8fa', position: 'sticky', top: 0, zIndex: 10 }}>
                <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #e5e6eb', color: '#4e5969', fontWeight: 500 }}>月份</th>
                <th style={{ padding: '12px', textAlign: 'right', borderBottom: '2px solid #e5e6eb', color: '#4e5969', fontWeight: 500 }}>订单数</th>
                <th style={{ padding: '12px', textAlign: 'right', borderBottom: '2px solid #e5e6eb', color: '#4e5969', fontWeight: 500 }}>核销数</th>
                <th style={{ padding: '12px', textAlign: 'right', borderBottom: '2px solid #e5e6eb', color: '#4e5969', fontWeight: 500 }}>退款数</th>
                <th style={{ padding: '12px', textAlign: 'right', borderBottom: '2px solid #e5e6eb', color: '#4e5969', fontWeight: 500 }}>核销率</th>
                <th style={{ padding: '12px', textAlign: 'right', borderBottom: '2px solid #e5e6eb', color: '#4e5969', fontWeight: 500 }}>订单金额</th>
                <th style={{ padding: '12px', textAlign: 'right', borderBottom: '2px solid #e5e6eb', color: '#4e5969', fontWeight: 500 }}>核销金额</th>
              </tr>
            </thead>
            <tbody>
              {monthlyData.filter(m => m.metrics.totalOrders > 0).map((monthData, idx) => {
                const monthKey = `${monthData.year}-${String(monthData.month).padStart(2, '0')}`;
                const isExpanded = expandedMonths.has(monthKey);
                const monthDaily = dailyData.filter(d => d.date.startsWith(monthKey) && d.totalOrders > 0);

                return (
                  <React.Fragment key={idx}>
                    {/* 月度汇总行 */}
                    <tr style={{ background: '#fff' }}>
                      <td style={{ padding: '12px', borderBottom: '1px solid #f2f3f5' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {monthDaily.length > 0 && (
                            <button
                              onClick={() => toggleMonth(monthData.year, monthData.month)}
                              style={{
                                border: 'none',
                                background: 'none',
                                cursor: 'pointer',
                                padding: '0',
                                display: 'flex',
                                alignItems: 'center',
                                color: '#165dff',
                                transition: 'transform 0.2s'
                              }}
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                                style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                                <polyline points="9 18 15 12 9 6"/>
                              </svg>
                            </button>
                          )}
                          <span style={{ color: '#1d2129', fontWeight: 500 }}>{monthData.year}年{monthData.month}月</span>
                        </div>
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: '#1d2129' }}>{monthData.metrics.totalOrders}</td>
                      <td style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: '#1d2129' }}>{monthData.metrics.verifyCount}</td>
                      <td style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: '#1d2129' }}>{monthData.metrics.refundCount}</td>
                      <td style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: '#1d2129' }}>{monthData.metrics.verifyRate}%</td>
                      <td style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: '#1d2129' }}>¥{monthData.metrics.totalAmount.toFixed(2)}</td>
                      <td style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: '#1d2129' }}>¥{monthData.metrics.verifyAmount.toFixed(2)}</td>
                    </tr>

                    {/* 每日明细 */}
                    {isExpanded && monthDaily.length > 0 && (
                      <tr>
                        <td colSpan={7} style={{ padding: 0, background: '#fafbfc' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                            <tbody>
                              {monthDaily.map((day, dayIdx) => (
                                <tr key={dayIdx} style={{ background: '#fff' }}>
                                  <td style={{ padding: '8px 12px 8px 24px', textAlign: 'left', borderBottom: '1px solid #f2f3f5', color: '#86909c' }}>{day.date}</td>
                                  <td style={{ padding: '8px 12px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: '#1d2129' }}>{day.totalOrders}</td>
                                  <td style={{ padding: '8px 12px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: '#1d2129' }}>{day.verifyCount}</td>
                                  <td style={{ padding: '8px 12px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: '#1d2129' }}>{day.refundCount}</td>
                                  <td style={{ padding: '8px 12px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: '#1d2129' }}>{day.verifyRate.toFixed(1)}%</td>
                                  <td style={{ padding: '8px 12px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: '#1d2129' }}>¥{day.totalAmount.toFixed(2)}</td>
                                  <td style={{ padding: '8px 12px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: '#1d2129' }}>¥{day.verifyAmount.toFixed(2)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 趋势图弹窗 */}
      <TrendChartModal
        isOpen={chartModal.isOpen}
        onClose={() => setChartModal({ ...chartModal, isOpen: false })}
        title={chartModal.title}
        dailyData={dailyData}
        dataKey={chartModal.dataKey}
        dataLabel={chartModal.dataLabel}
      />
    </div>
  );
}
