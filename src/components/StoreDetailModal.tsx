'use client';

import React, { useEffect, useState, useMemo, useRef } from 'react';
import StoreTagEditor from './StoreTagEditor';

// ========== IndexedDB 存储工具（与 StoreList.tsx 保持一致）==========

// IndexedDB 数据库名称和版本
const DB_NAME = 'StoreDataDB';
const DB_VERSION = 1;
const STORE_NAME = 'dataStore';

// 打开 IndexedDB
const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };
  });
};

// 从 IndexedDB 读取数据
const getFromIDB = async (key: string): Promise<any> => {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(key);
    
    return new Promise((resolve) => {
      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? result.value : null);
      };
      request.onerror = () => resolve(null);
    });
  } catch (error) {
    console.error('从 IndexedDB 读取失败:', error);
    return null;
  }
};

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
  fakeVerifyCount: number; // 刷单核销数（核销金额 ≤ 10元）
  verifyRate: number;
  totalAmount: number;
  fakeAmount: number;
  refundAmount: number;
  unverifiedAmount: number;
  verifyAmount: number;
  fakeVerifyAmount: number; // 刷单核销金额（核销金额 ≤ 10元）
  amountVerifyRate: number;
  // 有效订单数（订单实收 > 10元）
  validOrders: number;
  validOrderAmount: number; // 有效订单金额（订单实收 > 10元）
  // 有效核销数（核销金额 > 10元）
  validVerifyCount: number;
  validVerifyAmount: number; // 有效核销金额（核销金额 > 10元）
  // 有效核销率（有效核销数 / 有效订单数）
  validVerifyRate: number;
  validAmountRate: number; // 有效金额核销率（有效核销金额 / 有效订单金额）
  // 广告投入
  adSpend: number;
  // 是否是数据截止日期之后的日期（数值变灰）
  isAfterDataEnd: boolean;
}

// 月度数据类型
interface MonthlyData {
  year: number;
  month: number;
  hasData: boolean; // 是否有数据
  firstDataDay: number; // 第一个有数据的日期
  lastDataDay: number; // 最后一个有数据的日期
  metrics: {
    totalOrders: number;
    fakeOrders: number;
    refundCount: number;
    unverifiedCount: number;
    verifyCount: number;
    fakeVerifyCount: number;
    verifyRate: string;
    totalAmount: number;
    fakeAmount: number;
    refundAmount: number;
    unverifiedAmount: number;
    verifyAmount: number;
    fakeVerifyAmount: number;
    amountVerifyRate: string;
    validOrders: number;
    validOrderAmount: number;
    validVerifyCount: number;
    validVerifyAmount: number;
    validVerifyRate: string;
    validAmountRate: string;
    adSpend: number;
  };
}

// 周数据类型
interface WeeklyData {
  weekKey: string;
  year: number;
  month: number;
  weekNumber: number;
  startDate: string;
  endDate: string;
  label: string;
  dateRange: string;
  isCrossMonth: boolean;
  adSpend: number;
  totalOrders: number;
  fakeOrders: number;
  refundCount: number;
  unverifiedCount: number;
  verifyCount: number;
  fakeVerifyCount: number;
  verifyRate: string;
  totalAmount: number;
  fakeAmount: number;
  refundAmount: number;
  unverifiedAmount: number;
  verifyAmount: number;
  fakeVerifyAmount: number;
  amountVerifyRate: string;
  validOrders: number;
  validOrderAmount: number;
  validVerifyCount: number;
  validVerifyAmount: number;
  validVerifyRate: string;
  validAmountRate: string;
  days: DailyData[];
}

// 季度数据类型
interface QuarterlyData {
  year: number;
  quarter: number;
  label: string;
  metrics: {
    totalOrders: number;
    fakeOrders: number;
    refundCount: number;
    unverifiedCount: number;
    verifyCount: number;
    fakeVerifyCount: number;
    verifyRate: string;
    totalAmount: number;
    fakeAmount: number;
    refundAmount: number;
    unverifiedAmount: number;
    verifyAmount: number;
    fakeVerifyAmount: number;
    amountVerifyRate: string;
    validOrders: number;
    validOrderAmount: number;
    validVerifyCount: number;
    validVerifyAmount: number;
    validVerifyRate: string;
    validAmountRate: string;
    adSpend: number;
  };
}

// 年度数据类型
interface YearlyData {
  year: number;
  metrics: {
    totalOrders: number;
    fakeOrders: number;
    refundCount: number;
    unverifiedCount: number;
    verifyCount: number;
    fakeVerifyCount: number;
    verifyRate: string;
    totalAmount: number;
    fakeAmount: number;
    refundAmount: number;
    unverifiedAmount: number;
    verifyAmount: number;
    fakeVerifyAmount: number;
    amountVerifyRate: string;
    validOrders: number;
    validOrderAmount: number;
    validVerifyCount: number;
    validVerifyAmount: number;
    validVerifyRate: string;
    validAmountRate: string;
    adSpend: number;
  };
}

// 订单原始数据类型
interface OrderData {
  '订单ID': string;
  '成交渠道': string;
  '商户名称': string;
  '订单金额': number;
}

// 核销原始数据类型
interface VerifyData {
  '订单ID': string;
  '状态': number;
  '核销金额': number;
}

interface StoreDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  storeId: string;
  storeName?: string;
  storeData?: any;
  onFollow?: (storeId: string) => void;
  onViewFollow?: (storeId: string) => void;
  onUpdate?: () => void;
  onHideTagsChange?: (value: boolean) => void;
  // 预加载的数据（来自 StoreList 缓存）
  preloadedOrderStats?: any;
  preloadedVerifyStats?: any;
  preloadedRefundStats?: any;
  preloadedAdStats?: any;
  // 标签隐藏状态（用于控制详情页字段显示）
  hideTags?: boolean;
}

export default function StoreDetailModal({
  isOpen,
  onClose,
  storeId,
  storeName,
  storeData,
  onFollow,
  onViewFollow,
  onUpdate,
  onHideTagsChange,
  preloadedOrderStats,
  preloadedVerifyStats,
  preloadedRefundStats,
  preloadedAdStats,
  hideTags = false
}: StoreDetailModalProps) {
  const [loading, setLoading] = useState(true);
  const [store, setStore] = useState<any>(storeData || null);
  const [dailyData, setDailyData] = useState<DailyData[]>([]);
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([]);
  const [quarterlyData, setQuarterlyData] = useState<QuarterlyData[]>([]);
  const [yearlyData, setYearlyData] = useState<YearlyData[]>([]);
  // 默认折叠所有季度，只展开本月
  const [expandedQuarters, setExpandedQuarters] = useState<Set<string>>(new Set());
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(() => {
    const now = new Date();
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return new Set([currentMonthKey]);
  });
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(new Set());

  // 时间筛选状态
  const [dataTimeQuick, setDataTimeQuick] = useState<'all' | 'today' | 'yesterday' | 'dayBeforeYesterday' | 'last3Days' | 'last7Days' | 'last30Days' | 'thisMonth' | 'lastMonth' | 'twoMonthsAgo' | 'last3Months' | 'thisYear'>('all');
  const [highlightDate, setHighlightDate] = useState<string>(''); // 高亮显示的日期
  // 标签直接使用 storeData.store_tags，通过 StoreTagEditor 组件管理
  // hideTags 参数由父组件传入，控制详情页字段显示

  // 记录上次打开的门店ID，避免重复计算
  const lastStoreIdRef = useRef<string | null>(null);
  
  // 用ref存储最新的hideTags和onHideTagsChange，避免useEffect频繁重新执行
  const hideTagsRef = useRef(hideTags);
  const onHideTagsChangeRef = useRef(onHideTagsChange);
  
  // 更新ref
  useEffect(() => {
    hideTagsRef.current = hideTags;
  }, [hideTags]);
  
  useEffect(() => {
    onHideTagsChangeRef.current = onHideTagsChange;
  }, [onHideTagsChange]);

  // 根据快捷筛选获取日期范围
  const getDateRange = (quick: 'all' | 'today' | 'yesterday' | 'dayBeforeYesterday' | 'last3Days' | 'last7Days' | 'last30Days' | 'thisMonth' | 'lastMonth' | 'twoMonthsAgo' | 'last3Months' | 'thisYear') => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const formatDate = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    switch (quick) {
      case 'today': {
        const start = formatDate(today);
        const end = formatDate(today);
        return { start, end };
      }
      case 'yesterday': {
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const start = formatDate(yesterday);
        const end = formatDate(yesterday);
        return { start, end };
      }
      case 'dayBeforeYesterday': {
        const dayBeforeYesterday = new Date(today);
        dayBeforeYesterday.setDate(dayBeforeYesterday.getDate() - 2);
        const start = formatDate(dayBeforeYesterday);
        const end = formatDate(dayBeforeYesterday);
        return { start, end };
      }
      case 'last3Days': {
        // 近3日（不包含今天）：昨天、前天、大前天
        const end = new Date(today);
        end.setDate(end.getDate() - 1);
        const start = new Date(today);
        start.setDate(start.getDate() - 3);
        return { start: formatDate(start), end: formatDate(end) };
      }
      case 'last7Days': {
        // 近7日（不包含今天）：过去7天，截止到昨天
        const end = new Date(today);
        end.setDate(end.getDate() - 1);
        const start = new Date(today);
        start.setDate(start.getDate() - 7);
        return { start: formatDate(start), end: formatDate(end) };
      }
      case 'last30Days': {
        // 近30日（不包含今天）：过去30天，截止到昨天
        const end = new Date(today);
        end.setDate(end.getDate() - 1);
        const start = new Date(today);
        start.setDate(start.getDate() - 30);
        return { start: formatDate(start), end: formatDate(end) };
      }
      case 'thisMonth': {
        const start = formatDate(new Date(now.getFullYear(), now.getMonth(), 1));
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        const end = formatDate(lastDay);
        return { start, end };
      }
      case 'lastMonth': {
        const start = formatDate(new Date(now.getFullYear(), now.getMonth() - 1, 1));
        const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
        const end = formatDate(lastDay);
        return { start, end };
      }
      case 'twoMonthsAgo': {
        const start = formatDate(new Date(now.getFullYear(), now.getMonth() - 2, 1));
        const lastDay = new Date(now.getFullYear(), now.getMonth() - 1, 0);
        const end = formatDate(lastDay);
        return { start, end };
      }
      case 'last3Months': {
        // 近3月（不包含本月）：最近三个自然月，不算本月
        // 例如现在是12月，则范围是 9月1日 ~ 11月30日
        const start = formatDate(new Date(now.getFullYear(), now.getMonth() - 3, 1));
        const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
        const end = formatDate(lastDay);
        return { start, end };
      }
      case 'thisYear': {
        const start = formatDate(new Date(now.getFullYear(), 0, 1));
        const end = formatDate(new Date(now.getFullYear(), 11, 31));
        return { start, end };
      }
      default:
        return { start: '', end: '' };
    }
  };

  // 根据时间筛选获取应该展开的年月日
  const getExpandedDates = (quick: 'all' | 'today' | 'yesterday' | 'dayBeforeYesterday' | 'last3Days' | 'last7Days' | 'last30Days' | 'thisMonth' | 'lastMonth' | 'twoMonthsAgo' | 'last3Months' | 'thisYear') => {
    const range = getDateRange(quick);
    if (!range.start || !range.end) return { quarters: new Set<string>(), months: new Set<string>(), highlight: '' };

    const quarters = new Set<string>();
    const months = new Set<string>();

    // 解析开始和结束日期
    const [startYear, startMonth, startDay] = range.start.split('-').map(Number);
    const [endYear, endMonth, endDay] = range.end.split('-').map(Number);

    // 展开所有涉及的季度
    for (let year = startYear; year <= endYear; year++) {
      const quarterStart = year === startYear ? Math.ceil(startMonth / 3) : 1;
      const quarterEnd = year === endYear ? Math.ceil(endMonth / 3) : 4;
      for (let quarter = quarterStart; quarter <= quarterEnd; quarter++) {
        quarters.add(`${year}-Q${quarter}`);
      }
    }

    // 展开所有涉及的月份
    for (let year = startYear; year <= endYear; year++) {
      const monthStart = year === startYear ? startMonth : 1;
      const monthEnd = year === endYear ? endMonth : 12;
      for (let month = monthStart; month <= monthEnd; month++) {
        months.add(`${year}-${String(month).padStart(2, '0')}`);
      }
    }

    // 如果是单日，高亮该日期
    if (range.start === range.end) {
      return { quarters, months, highlight: range.start };
    }

    // 如果是单月，高亮该月
    const [startY, startM] = range.start.split('-').map(Number);
    const [endY, endM] = range.end.split('-').map(Number);
    if (startY === endY && startM === endM) {
      return { quarters, months, highlight: `${startY}-${String(startM).padStart(2, '0')}` };
    }

    return { quarters, months, highlight: '' };
  };

  // 处理时间筛选变化
  const handleTimeFilterChange = (quick: 'all' | 'today' | 'yesterday' | 'dayBeforeYesterday' | 'last3Days' | 'last7Days' | 'last30Days' | 'thisMonth' | 'lastMonth' | 'twoMonthsAgo' | 'last3Months' | 'thisYear') => {
    setDataTimeQuick(quick);
    const { quarters, highlight } = getExpandedDates(quick);
    setExpandedQuarters(quarters);
    setExpandedMonths(new Set()); // 点击筛选时所有月份默认折叠
    setHighlightDate(highlight);
  };

  // 生成周数据（周一到周日）
  const generateWeeklyDataForMonth = (allDaily: DailyData[], year: number, month: number): WeeklyData[] => {
    const weeks: WeeklyData[] = [];
    
    // 辅助函数：获取日期所在周的周一
    const getMonday = (dateStr: string): Date => {
      const date = new Date(dateStr);
      const day = date.getDay(); // 0=周日, 1=周一, ..., 6=周六
      const diff = day === 0 ? -6 : 1 - day; // 周日的话回退6天到周一
      const monday = new Date(date);
      monday.setDate(date.getDate() + diff);
      monday.setHours(0, 0, 0, 0);
      return monday;
    };
    
    // 辅助函数：格式化日期
    const formatDate = (date: Date): string => {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    };
    
    // 辅助函数：格式化日期为 MM-DD
    const formatShortDate = (date: Date): string => {
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      return `${m}-${d}`;
    };
    
    // 辅助函数：获取月份内的第几周（1-5）
    const getMonthWeekNumber = (date: Date): number => {
      const day = date.getDate();
      if (day <= 7) return 1;
      if (day <= 14) return 2;
      if (day <= 21) return 3;
      if (day <= 28) return 4;
      return 5;
    };
    
    // 辅助函数：获取月份内某周的日期范围
    const getWeekDateRange = (year: number, month: number, weekNumber: number): { start: number, end: number } => {
      switch (weekNumber) {
        case 1: return { start: 1, end: 7 };
        case 2: return { start: 8, end: 14 };
        case 3: return { start: 15, end: 21 };
        case 4: return { start: 22, end: 28 };
        case 5: return { start: 29, end: 31 };
        default: return { start: 1, end: 7 };
      }
    };
    
    // 获取今天的日期（用于判断周是否结束）
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // 分组处理：完整周 + 当前进行中的天
    const completeWeekMap = new Map<string, DailyData[]>(); // 完整结束的周
    const currentDays: DailyData[] = []; // 当前正在进行的周的天（单独显示）
    
    allDaily.forEach(day => {
      const dayDate = new Date(day.date);
      dayDate.setHours(0, 0, 0, 0);
      
      // 如果是未来时间，跳过
      if (dayDate > today) {
        return;
      }
      
      const weekNumber = getMonthWeekNumber(dayDate);
      const { start: startDay, end: endDay } = getWeekDateRange(dayDate.getFullYear(), dayDate.getMonth() + 1, weekNumber);
      
      // 构造该周的最后一天
      const lastDayOfMonth = new Date(dayDate.getFullYear(), dayDate.getMonth() + 1, 0).getDate();
      const actualEndDay = Math.min(endDay, lastDayOfMonth);
      const weekEndDate = new Date(dayDate.getFullYear(), dayDate.getMonth(), actualEndDay);
      weekEndDate.setHours(23, 59, 59, 999);
      
      // 判断该周是否完整结束（周的最后一天 <= 今天）
      const isWeekComplete = weekEndDate <= today;
      
      if (isWeekComplete) {
        // 完整结束的周，按周分组
        const weekKey = `${dayDate.getFullYear()}-${String(dayDate.getMonth() + 1).padStart(2, '0')}-W${weekNumber}`;
        if (!completeWeekMap.has(weekKey)) {
          completeWeekMap.set(weekKey, []);
        }
        completeWeekMap.get(weekKey)!.push(day);
      } else {
        // 当前正在进行的周，按天单独保存
        currentDays.push(day);
      }
    });
    
    // 生成完整周的数据
    completeWeekMap.forEach((days, weekKey) => {
      const [yearStr, monthStr, weekStr] = weekKey.split('-');
      const year = parseInt(yearStr);
      const month = parseInt(monthStr);
      const weekNumber = parseInt(weekStr.replace('W', ''));
      
      // 获取该周的日期范围
      const { start: startDay, end: endDay } = getWeekDateRange(year, month, weekNumber);
      
      // 构造开始和结束日期
      const startDateObj = new Date(year, month - 1, startDay);
      const endDateObj = new Date(year, month - 1, endDay);
      
      // 调整结束日期为该月实际最后一天
      const lastDayOfMonth = new Date(year, month, 0).getDate();
      const actualEndDay = Math.min(endDay, lastDayOfMonth);
      endDateObj.setDate(actualEndDay);
      
      const startDate = formatDate(startDateObj);
      const endDate = formatDate(endDateObj);
      const startDateShort = formatShortDate(startDateObj);
      const endDateShort = formatShortDate(endDateObj);
      
      // 周标签：第5周直接显示日期范围
      let label: string;
      let dateRange: string;
      
      if (weekNumber === 5) {
        // 第5周：直接显示日期范围
        label = `${startDateShort}-${endDateShort}`;
        dateRange = `${startDateShort} 至 ${endDateShort}`;
      } else {
        // 其他周：显示"第X周"
        label = `第${weekNumber}周`;
        dateRange = `${startDateShort} 至 ${endDateShort}`;
      }
      
      // 聚合周数据
      const metrics = days.reduce((acc, day) => ({
        adSpend: acc.adSpend + day.adSpend,
        totalOrders: acc.totalOrders + day.totalOrders,
        fakeOrders: acc.fakeOrders + day.fakeOrders,
        refundCount: acc.refundCount + day.refundCount,
        unverifiedCount: acc.unverifiedCount + day.unverifiedCount,
        verifyCount: acc.verifyCount + day.verifyCount,
        fakeVerifyCount: acc.fakeVerifyCount + (day.fakeVerifyCount || 0),
        totalAmount: acc.totalAmount + day.totalAmount,
        fakeAmount: acc.fakeAmount + day.fakeAmount,
        refundAmount: acc.refundAmount + day.refundAmount,
        unverifiedAmount: acc.unverifiedAmount + day.unverifiedAmount,
        verifyAmount: acc.verifyAmount + day.verifyAmount,
        fakeVerifyAmount: acc.fakeVerifyAmount + (day.fakeVerifyAmount || 0),
        validOrders: acc.validOrders + day.validOrders,
        validVerifyCount: acc.validVerifyCount + day.validVerifyCount,
        validOrderAmount: acc.validOrderAmount + day.validOrderAmount,
        validVerifyAmount: acc.validVerifyAmount + day.validVerifyAmount,
      }), {
        adSpend: 0,
        totalOrders: 0,
        fakeOrders: 0,
        refundCount: 0,
        unverifiedCount: 0,
        verifyCount: 0,
        fakeVerifyCount: 0,
        totalAmount: 0,
        fakeAmount: 0,
        refundAmount: 0,
        unverifiedAmount: 0,
        verifyAmount: 0,
        fakeVerifyAmount: 0,
        validOrders: 0,
        validVerifyCount: 0,
        validOrderAmount: 0,
        validVerifyAmount: 0,
      });
      
      weeks.push({
        weekKey,
        year,
        month,
        weekNumber,
        startDate,
        endDate,
        label,
        dateRange,
        isCrossMonth: false,
        ...metrics,
        verifyRate: metrics.totalOrders > 0 ? ((metrics.verifyCount / metrics.totalOrders) * 100).toFixed(2) : '0',
        amountVerifyRate: metrics.totalAmount > 0 ? ((metrics.verifyAmount / metrics.totalAmount) * 100).toFixed(2) : '0',
        validVerifyRate: metrics.validOrders > 0 ? ((metrics.validVerifyCount / metrics.validOrders) * 100).toFixed(2) : '0',
        validAmountRate: metrics.validOrderAmount > 0 ? ((metrics.validVerifyAmount / metrics.validOrderAmount) * 100).toFixed(2) : '0',
        days: days.sort((a, b) => a.date.localeCompare(b.date)),
      });
    });
    
    // 添加当前正在进行的天（按天单独显示）
    currentDays.sort((a, b) => a.date.localeCompare(b.date)).forEach(day => {
      const dayDate = new Date(day.date);
      const dayKey = `${dayDate.getFullYear()}-${String(dayDate.getMonth() + 1).padStart(2, '0')}-${String(dayDate.getDate()).padStart(2, '0')}`;
      const dateShort = formatShortDate(dayDate);
      
      weeks.push({
        weekKey: dayKey,
        year: dayDate.getFullYear(),
        month: dayDate.getMonth() + 1,
        weekNumber: 0, // 标记为按天显示
        startDate: day.date,
        endDate: day.date,
        label: dateShort,
        dateRange: dateShort,
        isCrossMonth: false,
        adSpend: day.adSpend,
        totalOrders: day.totalOrders,
        fakeOrders: day.fakeOrders,
        refundCount: day.refundCount,
        unverifiedCount: day.unverifiedCount,
        verifyCount: day.verifyCount,
        fakeVerifyCount: day.fakeVerifyCount || 0,
        totalAmount: day.totalAmount,
        fakeAmount: day.fakeAmount,
        refundAmount: day.refundAmount,
        unverifiedAmount: day.unverifiedAmount,
        verifyAmount: day.verifyAmount,
        fakeVerifyAmount: day.fakeVerifyAmount || 0,
        validOrders: day.validOrders,
        validVerifyCount: day.validVerifyCount,
        validOrderAmount: day.validOrderAmount,
        validVerifyAmount: day.validVerifyAmount,
        verifyRate: day.totalOrders > 0 ? ((day.verifyCount / day.totalOrders) * 100).toFixed(2) : '0',
        amountVerifyRate: day.totalAmount > 0 ? ((day.verifyAmount / day.totalAmount) * 100).toFixed(2) : '0',
        validVerifyRate: day.validOrders > 0 ? ((day.validVerifyCount / day.validOrders) * 100).toFixed(2) : '0',
        validAmountRate: day.validOrderAmount > 0 ? ((day.validVerifyAmount / day.validOrderAmount) * 100).toFixed(2) : '0',
        days: [day],
      });
    });
    
    // 只返回当前年和月的数据，并排序：完整周按周号，然后是按天的数据
    return weeks
      .filter(w => w.month === month && w.year === year)
      .sort((a, b) => {
        // 完整周（weekNumber > 0）排在前面，按周号排序
        // 按天的数据（weekNumber === 0）排在后面，按日期排序
        if (a.weekNumber > 0 && b.weekNumber > 0) {
          return a.weekNumber - b.weekNumber;
        }
        if (a.weekNumber > 0) return -1;
        if (b.weekNumber > 0) return 1;
        return a.startDate.localeCompare(b.startDate);
      });
  };

  useEffect(() => {
    if (!isOpen) return;

    // 每次打开弹窗时都重置展开状态，确保只有本月展开
    setDataTimeQuick('all');
    setHighlightDate('');
    setExpandedQuarters(new Set());
    setExpandedMonths(new Set()); // 先清空，由后面的useEffect来展开最后一个月份
    setExpandedWeeks(new Set());
    lastStoreIdRef.current = storeId;

    const fetchStoreData = async () => {
      try {
        if (!store) {
          // 从门店列表localStorage读取
          const storesStr = localStorage.getItem('stores');
          if (storesStr) {
            const stores = JSON.parse(storesStr);
            // 尝试通过id或store_id查找
            const foundStore = stores.find((s: any) => s.id === storeId || s.store_id === storeId);
            if (foundStore) {
              setStore(foundStore);
            }
          }
        }
      } catch (error) {
        console.error('获取门店信息失败:', error);
      }
    };

    fetchStoreData();
  }, [isOpen, storeId, store]);

  // 空格键快捷键：切换标签隐藏功能
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        onHideTagsChange?.(!hideTags);
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, hideTags, onHideTagsChange]);

  useEffect(() => {
    if (!isOpen) return;

    const fetchMetricsData = async () => {
      try {
        const currentSystem = localStorage.getItem('currentSystem') || 'mama';
        console.log('[StoreDetailModal] 开始加载数据，storeId:', storeId, '门店体系:', currentSystem);
        
        // 优先使用预加载数据，否则从 API 获取
        let orderStats = preloadedOrderStats;
        let verifyStats = preloadedVerifyStats;
        let refundStats = preloadedRefundStats;
        let adStats = preloadedAdStats;
        
        // 如果没有预加载数据，从 API 获取
        if (!orderStats || !verifyStats) {
          console.log('[StoreDetailModal] 无预加载数据，从 API 获取');
          const [orderRes, verifyRes, refundRes, adRes] = await Promise.all([
            fetch(`/api/order-records?store_system=${currentSystem}&aggregate=true`),
            fetch(`/api/verify-records?store_system=${currentSystem}&aggregate=true`),
            fetch(`/api/refund-records?store_system=${currentSystem}&aggregate=true`),
            fetch(`/api/ad-expense/store-stats?store_system=${currentSystem}`)
          ]);

          orderStats = orderRes.ok ? await orderRes.json() : null;
          verifyStats = verifyRes.ok ? await verifyRes.json() : null;
          refundStats = refundRes.ok ? await refundRes.json() : null;
          adStats = adRes.ok ? await adRes.json() : null;
        } else {
          console.log('[StoreDetailModal] 使用预加载数据');
        }

        console.log('[StoreDetailModal] API 响应:', {
          orderSuccess: orderStats?.success,
          orderStoreCount: orderStats?.storeStats ? Object.keys(orderStats.storeStats).length : 0,
          verifySuccess: verifyStats?.success,
          verifyStoreCount: verifyStats?.storeStats ? Object.keys(verifyStats.storeStats).length : 0
        });

        if (orderStats?.success && verifyStats?.success) {
          const possibleKeys = [storeId, store?.store_id, store?.id].filter(Boolean);
          console.log('[StoreDetailModal] 查找门店数据，可能的键:', possibleKeys);

          let storeOrderStats: any = null;
          let storeVerifyStats: any = null;
          let storeRefundStats: any = null;
          let storeAdStats: any = null;

          for (const key of possibleKeys) {
            if (orderStats.storeStats[key]) {
              storeOrderStats = orderStats.storeStats[key];
              console.log('[StoreDetailModal] 找到订单数据，键:', key);
              break;
            }
          }

          for (const key of possibleKeys) {
            if (verifyStats.storeStats[key]) {
              storeVerifyStats = verifyStats.storeStats[key];
              console.log('[StoreDetailModal] 找到核销数据，键:', key);
              break;
            }
          }

          for (const key of possibleKeys) {
            if (refundStats?.storeStats?.[key]) {
              storeRefundStats = refundStats.storeStats[key];
              break;
            }
          }

          for (const key of possibleKeys) {
            if (adStats?.storeStats?.[key]) {
              storeAdStats = adStats.storeStats[key];
              break;
            }
          }
          
          console.log('[StoreDetailModal] 门店数据:', {
            storeOrderStats: storeOrderStats ? { orderCount: storeOrderStats.totalOrderCount, unverifiedCount: storeOrderStats.totalUnverifiedCount } : null,
            storeVerifyStats: storeVerifyStats ? { verifyCount: storeVerifyStats.totalVerifyCount } : null
          });
          
          const daily: DailyData[] = [];

          // 找到有数据的最后一天
          let dataEndDate = '';
          const allDatesWithData = new Set<string>();
          
          if (storeOrderStats?.dailyStats) {
            Object.keys(storeOrderStats.dailyStats).forEach(date => {
              const stats = storeOrderStats.dailyStats[date];
              if (stats.orderCount > 0 || stats.orderAmount > 0) {
                allDatesWithData.add(date);
              }
            });
          }
          if (storeVerifyStats?.dailyStats) {
            Object.keys(storeVerifyStats.dailyStats).forEach(date => {
              const stats = storeVerifyStats.dailyStats[date];
              if (stats.verifyCount > 0 || stats.verifyAmount > 0) {
                allDatesWithData.add(date);
              }
            });
          }
          if (storeAdStats?.dailyStats) {
            Object.keys(storeAdStats.dailyStats).forEach(date => {
              const stats = storeAdStats.dailyStats[date];
              if (stats.spend > 0 || stats.orders > 0) {
                allDatesWithData.add(date);
              }
            });
          }
          if (storeRefundStats?.dailyStats) {
            Object.keys(storeRefundStats.dailyStats).forEach(date => {
              const stats = storeRefundStats.dailyStats[date];
              if (stats.refundCount > 0 || stats.refundAmount > 0) {
                allDatesWithData.add(date);
              }
            });
          }
          
          if (allDatesWithData.size > 0) {
            dataEndDate = Array.from(allDatesWithData).sort().pop() || '';
          }

          // 动态计算日期范围：从数据的最早日期到今天（或数据结束日期）
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

          const allDates = Array.from(allDatesWithData);
          const dataStartDate = allDates.length > 0 ? allDates.sort()[0] : '2025-01-01';
          const displayStartDate = dataStartDate;
          const displayEndDate = dataEndDate && dataEndDate > todayStr ? dataEndDate : todayStr;

          // 解析开始和结束日期
          const startParts = displayStartDate.split('-').map(Number);
          const endParts = displayEndDate.split('-').map(Number);
          const startYear = startParts[0];
          const startMonth = startParts[1];
          const endYear = endParts[0];
          const endMonth = endParts[1];

          // 生成动态日期范围的数据（包括零数据）
          for (let year = startYear; year <= endYear; year++) {
            for (let month = (year === startYear ? startMonth : 1); month <= (year === endYear ? endMonth : 12); month++) {
              const daysInMonth = new Date(year, month, 0).getDate();
              for (let day = 1; day <= daysInMonth; day++) {
                const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const orderDaily = storeOrderStats?.dailyStats?.[date] || {};
                const verifyDaily = storeVerifyStats?.dailyStats?.[date] || {};
                const refundDaily = storeRefundStats?.dailyStats?.[date] || {};
                
                // 判断是否是数据截止日期之后的日期
                const isAfterDataEnd = !!dataEndDate && date > dataEndDate;

                const totalOrders = orderDaily.orderCount || 0;
                const totalAmount = orderDaily.orderAmount || 0;
                const verifyCount = verifyDaily.verifyCount || 0;
                const verifyAmount = verifyDaily.verifyAmount || 0;
                const fakeOrders = orderDaily.fakeOrderCount || 0;
                // 优先使用退款文件的退款数据，其次使用订单状态计算的退款数据
                const refundCount = (storeRefundStats ? (refundDaily.refundCount || 0) : (orderDaily.refundCount || 0));
                const fakeAmount = orderDaily.fakeOrderAmount || 0;
                const refundAmount = (storeRefundStats ? (refundDaily.refundAmount || 0) : (orderDaily.refundAmount || 0));
                const fakeVerifyCount = (verifyDaily as any).fakeVerifyCount || 0;
                const fakeVerifyAmount = (verifyDaily as any).fakeVerifyAmount || 0;
                
                // 使用后端计算的有效订单数（订单实收 > 10元）和有效核销数（核销金额 > 10元）
                const validOrders = orderDaily.validOrderCount || 0;
                const validOrderAmount = orderDaily.validOrderAmount || 0;
                const validVerifyCount = verifyDaily.validVerifyCount || 0;
                const validVerifyAmount = (verifyDaily as any).validVerifyAmount || 0;
                const validVerifyRate = validOrders > 0 ? (validVerifyCount / validOrders) * 100 : 0;
                const validAmountRate = validOrderAmount > 0 ? (validVerifyAmount / validOrderAmount) * 100 : 0;
                
                // 获取广告费数据
                const adDaily = storeAdStats?.dailyStats?.[date] || {};
                const adSpend = adDaily.spend || 0;

                daily.push({
                  date,
                  totalOrders: orderDaily.orderCount || 0,
                  fakeOrders: orderDaily.fakeOrderCount || 0,
                  refundCount,
                  unverifiedCount: orderDaily.unverifiedCount || 0,
                  verifyCount: verifyDaily.verifyCount || 0,
                  fakeVerifyCount,
                  verifyRate: totalOrders > 0 ? (verifyCount / totalOrders) * 100 : 0,
                  totalAmount: orderDaily.orderAmount || 0,
                  fakeAmount: orderDaily.fakeOrderAmount || 0,
                  refundAmount,
                  unverifiedAmount: orderDaily.unverifiedAmount || 0,
                  verifyAmount: verifyDaily.verifyAmount || 0,
                  fakeVerifyAmount,
                  amountVerifyRate: totalAmount > 0 ? (verifyAmount / totalAmount) * 100 : 0,
                  validOrders,
                  validOrderAmount,
                  validVerifyCount,
                  validVerifyAmount,
                  validVerifyRate,
                  validAmountRate,
                  adSpend,
                  isAfterDataEnd,
                });
              }
            }
          }

          daily.sort((a, b) => a.date.localeCompare(b.date));
          setDailyData(daily);

          const monthly: MonthlyData[] = [];
          for (let year = startYear; year <= endYear; year++) {
            for (let month = (year === startYear ? startMonth : 1); month <= (year === endYear ? endMonth : 12); month++) {
              const monthKey = `${year}-${String(month).padStart(2, '0')}`;
              const monthDaily = daily.filter(d => d.date.startsWith(monthKey));

              // 计算该月有数据的日期范围
              const daysWithData = monthDaily.filter(d => 
                d.totalOrders > 0 || d.totalAmount > 0 || d.verifyCount > 0 || d.adSpend > 0
              );
              const firstDataDay = daysWithData.length > 0 
                ? Math.min(...daysWithData.map(d => parseInt(d.date.split('-')[2])))
                : 0;
              const lastDataDay = daysWithData.length > 0 
                ? Math.max(...daysWithData.map(d => parseInt(d.date.split('-')[2])))
                : 0;
              const daysInMonth = new Date(year, month, 0).getDate();
              const hasData = daysWithData.length > 0;
              // 是否是整月数据（从1号到最后一天都有数据）
              const isFullMonth = hasData && firstDataDay === 1 && lastDataDay === daysInMonth;

              const metrics = monthDaily.reduce((acc, d) => ({
                totalOrders: acc.totalOrders + d.totalOrders,
                fakeOrders: acc.fakeOrders + d.fakeOrders,
                refundCount: acc.refundCount + d.refundCount,
                unverifiedCount: acc.unverifiedCount + d.unverifiedCount,
                verifyCount: acc.verifyCount + d.verifyCount,
                fakeVerifyCount: acc.fakeVerifyCount + (d.fakeVerifyCount || 0),
                totalAmount: acc.totalAmount + d.totalAmount,
                fakeAmount: acc.fakeAmount + d.fakeAmount,
                refundAmount: acc.refundAmount + d.refundAmount,
                unverifiedAmount: acc.unverifiedAmount + d.unverifiedAmount,
                verifyAmount: acc.verifyAmount + d.verifyAmount,
                fakeVerifyAmount: acc.fakeVerifyAmount + (d.fakeVerifyAmount || 0),
                validOrders: acc.validOrders + (d.validOrders || 0),
                validOrderAmount: acc.validOrderAmount + (d.validOrderAmount || 0),
                validVerifyCount: acc.validVerifyCount + (d.validVerifyCount || 0),
                validVerifyAmount: acc.validVerifyAmount + (d.validVerifyAmount || 0),
                adSpend: acc.adSpend + (d.adSpend || 0),
              }), {
                totalOrders: 0,
                fakeOrders: 0,
                refundCount: 0,
                unverifiedCount: 0,
                verifyCount: 0,
                fakeVerifyCount: 0,
                totalAmount: 0,
                fakeAmount: 0,
                refundAmount: 0,
                unverifiedAmount: 0,
                verifyAmount: 0,
                fakeVerifyAmount: 0,
                validOrders: 0,
                validOrderAmount: 0,
                validVerifyCount: 0,
                validVerifyAmount: 0,
                adSpend: 0,
              });

              monthly.push({
                year,
                month,
                hasData,
                firstDataDay,
                lastDataDay,
                metrics: {
                  ...metrics,
                  verifyRate: metrics.totalOrders > 0 ? ((metrics.verifyCount / metrics.totalOrders) * 100).toFixed(2) : '0',
                  amountVerifyRate: metrics.totalAmount > 0 ? ((metrics.verifyAmount / metrics.totalAmount) * 100).toFixed(2) : '0',
                  validVerifyRate: metrics.validOrders > 0 ? ((metrics.validVerifyCount / metrics.validOrders) * 100).toFixed(2) : '0',
                  validAmountRate: metrics.validOrderAmount > 0 ? ((metrics.validVerifyAmount / metrics.validOrderAmount) * 100).toFixed(2) : '0',
                },
              });
            }
          }

          setMonthlyData(monthly);

          // 计算季度数据
          const quarterly: QuarterlyData[] = [];
          for (let year = startYear; year <= endYear; year++) {
            for (let quarter = 1; quarter <= 4; quarter++) {
              const startMonth = (quarter - 1) * 3 + 1;
              const endMonth = quarter * 3;
              const quarterMonthly = monthly.filter(m =>
                m.year === year && m.month >= startMonth && m.month <= endMonth
              );

              const metrics = quarterMonthly.reduce((acc, m) => ({
                totalOrders: acc.totalOrders + m.metrics.totalOrders,
                fakeOrders: acc.fakeOrders + m.metrics.fakeOrders,
                refundCount: acc.refundCount + m.metrics.refundCount,
                unverifiedCount: acc.unverifiedCount + m.metrics.unverifiedCount,
                verifyCount: acc.verifyCount + m.metrics.verifyCount,
                fakeVerifyCount: acc.fakeVerifyCount + (m.metrics.fakeVerifyCount || 0),
                totalAmount: acc.totalAmount + m.metrics.totalAmount,
                fakeAmount: acc.fakeAmount + m.metrics.fakeAmount,
                refundAmount: acc.refundAmount + m.metrics.refundAmount,
                unverifiedAmount: acc.unverifiedAmount + m.metrics.unverifiedAmount,
                verifyAmount: acc.verifyAmount + m.metrics.verifyAmount,
                fakeVerifyAmount: acc.fakeVerifyAmount + (m.metrics.fakeVerifyAmount || 0),
                validOrders: acc.validOrders + (m.metrics.validOrders || 0),
                validOrderAmount: acc.validOrderAmount + (m.metrics.validOrderAmount || 0),
                validVerifyCount: acc.validVerifyCount + (m.metrics.validVerifyCount || 0),
                validVerifyAmount: acc.validVerifyAmount + (m.metrics.validVerifyAmount || 0),
                adSpend: acc.adSpend + (m.metrics.adSpend || 0),
              }), {
                totalOrders: 0,
                fakeOrders: 0,
                refundCount: 0,
                unverifiedCount: 0,
                verifyCount: 0,
                fakeVerifyCount: 0,
                totalAmount: 0,
                fakeAmount: 0,
                refundAmount: 0,
                unverifiedAmount: 0,
                verifyAmount: 0,
                fakeVerifyAmount: 0,
                validOrders: 0,
                validOrderAmount: 0,
                validVerifyCount: 0,
                validVerifyAmount: 0,
                adSpend: 0,
              });

              quarterly.push({
                year,
                quarter,
                label: `${year}年Q${quarter}`,
                metrics: {
                  ...metrics,
                  verifyRate: metrics.totalOrders > 0 ? ((metrics.verifyCount / metrics.totalOrders) * 100).toFixed(2) : '0',
                  amountVerifyRate: metrics.totalAmount > 0 ? ((metrics.verifyAmount / metrics.totalAmount) * 100).toFixed(2) : '0',
                  validVerifyRate: metrics.validOrders > 0 ? ((metrics.validVerifyCount / metrics.validOrders) * 100).toFixed(2) : '0',
                  validAmountRate: metrics.validOrderAmount > 0 ? ((metrics.validVerifyAmount / metrics.validOrderAmount) * 100).toFixed(2) : '0',
                },
              });
            }
          }

          // 根据当前日期过滤季度数据（动态显示）
          const currentDate = new Date();
          const currentYear = currentDate.getFullYear();
          const currentMonth = currentDate.getMonth() + 1; // 1-12

          const filteredQuarterlyData = quarterly.filter(q => {
            // 如果是起始年份，只显示从起始月份开始的季度
            if (q.year === startYear) {
              const quarterStartMonth = (q.quarter - 1) * 3 + 1;
              const quarterEndMonth = q.quarter * 3;
              // 只要该季度的结束月份 >= 起始月份就显示
              return quarterEndMonth >= startMonth;
            }
            // 如果是结束年份，只显示到结束月份的季度
            if (q.year === endYear) {
              const quarterStartMonth = (q.quarter - 1) * 3 + 1;
              // 只要该季度的开始月份 <= 结束月份就显示
              return quarterStartMonth <= endMonth;
            }
            // 中间年份显示所有季度
            return true;
          });

          setQuarterlyData(filteredQuarterlyData);

          // 计算年度数据
          const yearly: YearlyData[] = [];
          for (let year = startYear; year <= endYear; year++) {
            const yearDaily = daily.filter(d => d.date.startsWith(String(year)));
            const yearMonthly = monthly.filter(m => m.year === year);

            const metrics = yearDaily.reduce((acc, d) => ({
              totalOrders: acc.totalOrders + d.totalOrders,
              fakeOrders: acc.fakeOrders + d.fakeOrders,
              refundCount: acc.refundCount + d.refundCount,
              unverifiedCount: acc.unverifiedCount + d.unverifiedCount,
              verifyCount: acc.verifyCount + d.verifyCount,
              fakeVerifyCount: acc.fakeVerifyCount + (d.fakeVerifyCount || 0),
              totalAmount: acc.totalAmount + d.totalAmount,
              fakeAmount: acc.fakeAmount + d.fakeAmount,
              refundAmount: acc.refundAmount + d.refundAmount,
              unverifiedAmount: acc.unverifiedAmount + d.unverifiedAmount,
              verifyAmount: acc.verifyAmount + d.verifyAmount,
              fakeVerifyAmount: acc.fakeVerifyAmount + (d.fakeVerifyAmount || 0),
              validOrders: acc.validOrders + (d.validOrders || 0),
              validOrderAmount: acc.validOrderAmount + (d.validOrderAmount || 0),
              validVerifyCount: acc.validVerifyCount + (d.validVerifyCount || 0),
              validVerifyAmount: acc.validVerifyAmount + (d.validVerifyAmount || 0),
              adSpend: acc.adSpend + (d.adSpend || 0),
            }), {
              totalOrders: 0,
              fakeOrders: 0,
              refundCount: 0,
              unverifiedCount: 0,
              verifyCount: 0,
              fakeVerifyCount: 0,
              totalAmount: 0,
              fakeAmount: 0,
              refundAmount: 0,
              unverifiedAmount: 0,
              verifyAmount: 0,
              fakeVerifyAmount: 0,
              validOrders: 0,
              validOrderAmount: 0,
              validVerifyCount: 0,
              validVerifyAmount: 0,
              adSpend: 0,
            });

            yearly.push({
              year,
              metrics: {
                ...metrics,
                verifyRate: metrics.totalOrders > 0 ? ((metrics.verifyCount / metrics.totalOrders) * 100).toFixed(2) : '0',
                amountVerifyRate: metrics.totalAmount > 0 ? ((metrics.verifyAmount / metrics.totalAmount) * 100).toFixed(2) : '0',
                validVerifyRate: metrics.validOrders > 0 ? ((metrics.validVerifyCount / metrics.validOrders) * 100).toFixed(2) : '0',
                validAmountRate: metrics.validOrderAmount > 0 ? ((metrics.validVerifyAmount / metrics.validOrderAmount) * 100).toFixed(2) : '0',
              },
            });
          }

          setYearlyData(yearly);
        } else {
          // 即使没有统计数据，也生成空的年月日数据（动态显示到今天）
          const daily: DailyData[] = [];

          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

          const startYear = 2025;
          const startMonth = 1;
          const endYear = today.getFullYear();
          const endMonth = today.getMonth() + 1;

          for (let year = startYear; year <= endYear; year++) {
            for (let month = (year === startYear ? startMonth : 1); month <= (year === endYear ? endMonth : 12); month++) {
              const daysInMonth = new Date(year, month, 0).getDate();
              for (let day = 1; day <= daysInMonth; day++) {
                const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                daily.push({
                  date,
                  totalOrders: 0,
                  fakeOrders: 0,
                  refundCount: 0,
                  unverifiedCount: 0,
                  verifyCount: 0,
                  fakeVerifyCount: 0,
                  verifyRate: 0,
                  totalAmount: 0,
                  fakeAmount: 0,
                  refundAmount: 0,
                  unverifiedAmount: 0,
                  verifyAmount: 0,
                  fakeVerifyAmount: 0,
                  amountVerifyRate: 0,
                  validOrders: 0,
                  validOrderAmount: 0,
                  validVerifyCount: 0,
                  validVerifyAmount: 0,
                  validVerifyRate: 0,
                  validAmountRate: 0,
                  adSpend: 0,
                  isAfterDataEnd: false,
                });
              }
            }
          }
          daily.sort((a, b) => a.date.localeCompare(b.date));
          setDailyData(daily);

          const monthly: MonthlyData[] = [];
          for (let year = 2025; year <= 2026; year++) {
            for (let month = 1; month <= 12; month++) {
              monthly.push({
                year,
                month,
                hasData: false,
                firstDataDay: 0,
                lastDataDay: 0,
                metrics: {
                  totalOrders: 0,
                  fakeOrders: 0,
                  refundCount: 0,
                  unverifiedCount: 0,
                  verifyCount: 0,
                  fakeVerifyCount: 0,
                  verifyRate: '0',
                  totalAmount: 0,
                  fakeAmount: 0,
                  refundAmount: 0,
                  unverifiedAmount: 0,
                  verifyAmount: 0,
                  fakeVerifyAmount: 0,
                  amountVerifyRate: '0',
                  validOrders: 0,
                  validOrderAmount: 0,
                  validVerifyCount: 0,
                  validVerifyAmount: 0,
                  validVerifyRate: '0',
                  validAmountRate: '0',
                  adSpend: 0,
                },
              });
            }
          }
          setMonthlyData(monthly);

          const yearly: YearlyData[] = [];
          for (let year = startYear; year <= endYear; year++) {
            yearly.push({
              year,
              metrics: {
                totalOrders: 0,
                fakeOrders: 0,
                refundCount: 0,
                unverifiedCount: 0,
                verifyCount: 0,
                fakeVerifyCount: 0,
                verifyRate: '0',
                totalAmount: 0,
                fakeAmount: 0,
                refundAmount: 0,
                unverifiedAmount: 0,
                verifyAmount: 0,
                fakeVerifyAmount: 0,
                amountVerifyRate: '0',
                validOrders: 0,
                validOrderAmount: 0,
                validVerifyCount: 0,
                validVerifyAmount: 0,
                validVerifyRate: '0',
                validAmountRate: '0',
                adSpend: 0,
              },
            });
          }
          setYearlyData(yearly);
        }

        setLoading(false);
      } catch (error) {
        console.error('获取指标数据失败:', error);
        setLoading(false);
      }
    };

    fetchMetricsData();
  }, [isOpen, storeId, store]);

  const toggleMonth = (year: number, month: number) => {
    const key = `${year}-${String(month).padStart(2, '0')}`;
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

  const toggleWeek = (weekKey: string) => {
    setExpandedWeeks(prev => {
      const newSet = new Set(prev);
      if (newSet.has(weekKey)) {
        newSet.delete(weekKey);
      } else {
        newSet.add(weekKey);
      }
      return newSet;
    });
  };

  const toggleQuarter = (year: number, quarter: number) => {
    const key = `${year}-Q${quarter}`;
    setExpandedQuarters(prev => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  };

  const collapseAll = () => {
    setExpandedQuarters(new Set());
    setExpandedMonths(new Set());
  };

  // 键盘快捷键处理
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Command+Z 或 Ctrl+Z：折叠所有年月日
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        collapseAll();
      }
      // 空格键：关闭弹窗（已移除，避免误触）
      // if (e.key === ' ' && !e.repeat) {
      //   e.preventDefault();
      //   onClose();
      // }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

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
        background: '#f7f8fa',
        width: '95vw',
        maxWidth: '1600px',
        height: '90vh',
        borderRadius: '12px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }} onClick={(e) => e.stopPropagation()}>
        {/* 头部 */}
        <div style={{
          background: '#fff',
          padding: '16px 20px',
          borderBottom: '1px solid #e5e6eb',
          position: 'relative'
        }}>
          {/* 关闭按钮 - 右上角 */}
          <button
            onClick={onClose}
            style={{
              position: 'absolute',
              top: '16px',
              right: '20px',
              border: 'none',
              background: '#f2f3f5',
              width: '29px',
              height: '29px',
              borderRadius: '50%',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#e5e6eb';
              e.currentTarget.style.transform = 'rotate(90deg)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#f2f3f5';
              e.currentTarget.style.transform = 'rotate(0deg)';
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#86909c" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>

          {/* 第一行：门店名称 + 操作按钮 + 标签 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', paddingRight: '50px' }}>
            <span style={{ color: '#86909c', fontSize: '13px' }}>门店名称：</span>
            <span style={{ color: '#1d2129', fontWeight: 500, fontSize: '14px' }}>{store?.store_name || storeName || '-'}</span>
            
            {/* 操作按钮 */}
            <div style={{ display: 'flex', gap: '6px', marginLeft: '8px' }}>
              {onFollow && (
                <button
                  onClick={() => onFollow(storeId)}
                  style={{
                    border: '1px solid #e5e6eb',
                    background: '#fff',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '13px',
                    color: '#1d2129',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#f2f3f5';
                    e.currentTarget.style.borderColor = '#165dff';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#fff';
                    e.currentTarget.style.borderColor = '#e5e6eb';
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                  </svg>
                  跟进
                </button>
              )}
              {onViewFollow && (
                <button
                  onClick={() => onViewFollow(storeId)}
                  style={{
                    border: '1px solid #e5e6eb',
                    background: '#fff',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '13px',
                    color: '#1d2129',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#f2f3f5';
                    e.currentTarget.style.borderColor = '#165dff';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#fff';
                    e.currentTarget.style.borderColor = '#e5e6eb';
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </svg>
                  查看
                </button>
              )}
            </div>

            {/* 标签 */}
            <StoreTagEditor
              storeId={store?.id || storeId}
              storeName={store?.store_name}
              storeTags={store?.store_tags || storeData?.store_tags || []}
              onUpdate={onUpdate}
              hideTags={hideTags}
              setHideTags={(value) => {
                localStorage.setItem('hideTags', String(value));
                onHideTagsChange?.(value);
              }}
            />

            <span style={{ marginLeft: 'auto', fontSize: '12px', color: '#86909c' }}>
              门店ID：<span style={{ fontFamily: 'monospace' }}>{store?.store_id || storeId || '-'}</span>
            </span>
          </div>

          {/* 第二行：门店基本信息 */}
          <div style={{ display: 'flex', gap: '16px', fontSize: '13px', color: '#4e5969', flexWrap: 'wrap', marginTop: '10px' }}>
            {store?.category && (
              <div><span style={{ color: '#86909c' }}>品类：</span><span>{store.category}</span></div>
            )}
            {store?.city && (
              <div><span style={{ color: '#86909c' }}>城市：</span><span>{store.city}</span></div>
            )}
            {!hideTags && store?.store_area && (
              <div><span style={{ color: '#86909c' }}>门店面积：</span><span>{store.store_area}</span></div>
            )}
            {!hideTags && store?.staff_count && (
              <div><span style={{ color: '#86909c' }}>员工人数：</span><span>{store.staff_count}</span></div>
            )}
            {store?.address && (
              <div><span style={{ color: '#86909c' }}>地址：</span><span>{store.address}</span></div>
            )}
            {!hideTags && store?.customer_channel && (
              <div><span style={{ color: '#86909c' }}>获客渠道：</span><span>{store.customer_channel}</span></div>
            )}
          </div>
        </div>

        {/* 内容区域 */}
        <div style={{ flex: 1, overflow: 'hidden', padding: '16px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {loading ? (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              fontSize: '11px',
              color: '#86909c'
            }}>
              加载中...
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1, minHeight: 0 }}>
              {/* 月度趋势 */}
              <div style={{
                background: '#fff',
                borderRadius: '6px',
                padding: '16px',
                boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                display: 'flex',
                flexDirection: 'column',
                flex: 1,
                minHeight: 0
              }}>
                {/* 新增经营数据区域 */}
                <div style={{ 
                  flexShrink: 0, 
                  marginBottom: '12px', 
                  paddingBottom: '12px', 
                  borderBottom: '1px solid #f2f3f5',
                  background: '#fff',
                  borderRadius: '6px',
                  padding: '16px',
                  maxWidth: '1000px'
                }}>
                  <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                    {/* 店铺经营 */}
                    <div style={{ flex: 0.9, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ 
                        textAlign: 'center', 
                        fontSize: '12px', 
                        fontWeight: 600, 
                        color: '#1d2129',
                        marginBottom: '4px'
                      }}>
                        店铺经营（近30天）
                      </div>
                      <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'nowrap' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                          <span style={{ fontSize: '11px', color: '#86909c' }}>经营分</span>
                          <span style={{ fontSize: '14px', fontWeight: 600, color: '#1d2129' }}>{store?.business_score ?? '-'}</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                          <span style={{ fontSize: '11px', color: '#86909c' }}>新增好评数</span>
                          <span style={{ fontSize: '14px', fontWeight: 600, color: '#1d2129' }}>{store?.new_positive_review_count ?? '-'}</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                          <span style={{ fontSize: '11px', color: '#86909c' }}>新增中差评数</span>
                          <span style={{ fontSize: '14px', fontWeight: 600, color: '#1d2129' }}>{store?.new_negative_review_count ?? '-'}</span>
                        </div>
                      </div>
                    </div>

                    {/* 蓝V经营（近30天） */}
                    <div style={{ flex: 1.3, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{
                        textAlign: 'center',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: '#1d2129',
                        marginBottom: '4px'
                      }}>
                        蓝V经营（近30天）
                      </div>
                      <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                          <span style={{ fontSize: '11px', color: '#86909c' }}>门店蓝V</span>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '20px' }}>
                            <span style={{ fontSize: '10px', fontWeight: 400, color: '#1d2129', fontFamily: 'monospace', textAlign: 'center' }}>
                              {store?.douyin_account_ids || '-'}
                            </span>
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                          <span style={{ fontSize: '11px', color: '#86909c' }}>蓝V发布数</span>
                          <span style={{ fontSize: '14px', fontWeight: 600, color: '#1d2129' }}>
                            {store?.douyin_video_count ?? '-'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                          <span style={{ fontSize: '11px', color: '#86909c' }}>蓝V播放量</span>
                          <span style={{ fontSize: '14px', fontWeight: 600, color: '#1d2129' }}>
                            {(() => {
                              const val = store?.douyin_video_play_count;
                              const num = typeof val === 'number' ? val : (parseInt(val || '0') || 0);
                              return num > 0 ? num.toLocaleString() : '-';
                            })()}
                          </span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                          <span style={{ fontSize: '11px', color: '#86909c' }}>蓝V成交</span>
                          <span style={{ fontSize: '14px', fontWeight: 600, color: '#1d2129' }}>
                            {store?.douyin_deal_count ?? '-'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* 职人经营 */}
                    <div style={{ flex: 0.9, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ 
                        textAlign: 'center', 
                        fontSize: '12px', 
                        fontWeight: 600, 
                        color: '#1d2129',
                        marginBottom: '4px'
                      }}>
                        职人经营（近30天）
                      </div>
                      <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                          <span style={{ fontSize: '11px', color: '#86909c' }}>商家职人数</span>
                          <span style={{ fontSize: '14px', fontWeight: 600, color: '#1d2129' }}>
                            {(() => {
                              const val = store?.staff_count;
                              const num = typeof val === 'number' ? val : (parseInt(val || '0') || 0);
                              return num > 0 ? num.toLocaleString() : '-';
                            })()}
                          </span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                          <span style={{ fontSize: '11px', color: '#86909c' }}>视频数</span>
                          <span style={{ fontSize: '14px', fontWeight: 600, color: '#1d2129' }}>
                            {(() => {
                              const val = store?.video_count;
                              const num = typeof val === 'number' ? val : (parseInt(val || '0') || 0);
                              return num > 0 ? num.toLocaleString() : '-';
                            })()}
                          </span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                          <span style={{ fontSize: '11px', color: '#86909c' }}>职人曝光量</span>
                          <span style={{ fontSize: '14px', fontWeight: 600, color: '#1d2129' }}>
                            {(() => {
                              const val = store?.talent_exposure ?? store?.exposure_count;
                              const num = typeof val === 'number' ? val : (parseInt(val || '0') || 0);
                              return num > 0 ? num.toLocaleString() : '-';
                            })()}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    {/* 直播 */}
                    <div style={{ flex: 0.9, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ 
                        textAlign: 'center', 
                        fontSize: '12px', 
                        fontWeight: 600, 
                        color: '#c9cdd4',
                        marginBottom: '4px'
                      }}>
                        直播（待开发）
                      </div>
                      <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                          <span style={{ fontSize: '11px', color: '#c9cdd4' }}>场次</span>
                          <span style={{ fontSize: '14px', fontWeight: 600, color: '#c9cdd4' }}>-</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                          <span style={{ fontSize: '11px', color: '#c9cdd4' }}>时长</span>
                          <span style={{ fontSize: '14px', fontWeight: 600, color: '#c9cdd4' }}>-</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                          <span style={{ fontSize: '11px', color: '#c9cdd4' }}>支付GMV</span>
                          <span style={{ fontSize: '14px', fontWeight: 600, color: '#c9cdd4' }}>-</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* 时间筛选 - 固定 */}
                <div style={{ flexShrink: 0, marginBottom: '12px', paddingBottom: '12px', borderBottom: '1px solid #f2f3f5' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '11px', color: '#86909c', whiteSpace: 'nowrap' }}>时间筛选</span>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      <button
                        onClick={() => handleTimeFilterChange('all')}
                        style={{
                          padding: '4px 10px',
                          borderRadius: '4px',
                          border: '1px solid #e5e6eb',
                          background: dataTimeQuick === 'all' ? '#165dff' : '#fff',
                          color: dataTimeQuick === 'all' ? '#fff' : '#4e5969',
                          fontSize: '11px',
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                          if (dataTimeQuick !== 'all') {
                            e.currentTarget.style.background = '#f2f3f5';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (dataTimeQuick !== 'all') {
                            e.currentTarget.style.background = '#fff';
                          }
                        }}
                      >
                        全部
                      </button>
                      <button
                        onClick={() => handleTimeFilterChange('today')}
                        style={{
                          padding: '4px 10px',
                          borderRadius: '4px',
                          border: '1px solid #e5e6eb',
                          background: dataTimeQuick === 'today' ? '#165dff' : '#fff',
                          color: dataTimeQuick === 'today' ? '#fff' : '#4e5969',
                          fontSize: '11px',
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                          if (dataTimeQuick !== 'today') {
                            e.currentTarget.style.background = '#f2f3f5';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (dataTimeQuick !== 'today') {
                            e.currentTarget.style.background = '#fff';
                          }
                        }}
                      >
                        今日
                      </button>
                      <button
                        onClick={() => handleTimeFilterChange('yesterday')}
                        style={{
                          padding: '4px 10px',
                          borderRadius: '4px',
                          border: '1px solid #e5e6eb',
                          background: dataTimeQuick === 'yesterday' ? '#165dff' : '#fff',
                          color: dataTimeQuick === 'yesterday' ? '#fff' : '#4e5969',
                          fontSize: '11px',
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                          if (dataTimeQuick !== 'yesterday') {
                            e.currentTarget.style.background = '#f2f3f5';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (dataTimeQuick !== 'yesterday') {
                            e.currentTarget.style.background = '#fff';
                          }
                        }}
                      >
                        昨日
                      </button>
                      <button
                        onClick={() => handleTimeFilterChange('dayBeforeYesterday')}
                        style={{
                          padding: '4px 10px',
                          borderRadius: '4px',
                          border: '1px solid #e5e6eb',
                          background: dataTimeQuick === 'dayBeforeYesterday' ? '#165dff' : '#fff',
                          color: dataTimeQuick === 'dayBeforeYesterday' ? '#fff' : '#4e5969',
                          fontSize: '11px',
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                          if (dataTimeQuick !== 'dayBeforeYesterday') {
                            e.currentTarget.style.background = '#f2f3f5';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (dataTimeQuick !== 'dayBeforeYesterday') {
                            e.currentTarget.style.background = '#fff';
                          }
                        }}
                      >
                        前天
                      </button>
                      <button
                        onClick={() => handleTimeFilterChange('last3Days')}
                        style={{
                          padding: '4px 10px',
                          borderRadius: '4px',
                          border: '1px solid #e5e6eb',
                          background: dataTimeQuick === 'last3Days' ? '#165dff' : '#fff',
                          color: dataTimeQuick === 'last3Days' ? '#fff' : '#4e5969',
                          fontSize: '11px',
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                          if (dataTimeQuick !== 'last3Days') {
                            e.currentTarget.style.background = '#f2f3f5';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (dataTimeQuick !== 'last3Days') {
                            e.currentTarget.style.background = '#fff';
                          }
                        }}
                      >
                        近3日
                      </button>
                      <button
                        onClick={() => handleTimeFilterChange('last7Days')}
                        style={{
                          padding: '4px 10px',
                          borderRadius: '4px',
                          border: '1px solid #e5e6eb',
                          background: dataTimeQuick === 'last7Days' ? '#165dff' : '#fff',
                          color: dataTimeQuick === 'last7Days' ? '#fff' : '#4e5969',
                          fontSize: '11px',
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                          if (dataTimeQuick !== 'last7Days') {
                            e.currentTarget.style.background = '#f2f3f5';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (dataTimeQuick !== 'last7Days') {
                            e.currentTarget.style.background = '#fff';
                          }
                        }}
                      >
                        近7日
                      </button>
                      <button
                        onClick={() => handleTimeFilterChange('last30Days')}
                        style={{
                          padding: '4px 10px',
                          borderRadius: '4px',
                          border: '1px solid #e5e6eb',
                          background: dataTimeQuick === 'last30Days' ? '#165dff' : '#fff',
                          color: dataTimeQuick === 'last30Days' ? '#fff' : '#4e5969',
                          fontSize: '11px',
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                          if (dataTimeQuick !== 'last30Days') {
                            e.currentTarget.style.background = '#f2f3f5';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (dataTimeQuick !== 'last30Days') {
                            e.currentTarget.style.background = '#fff';
                          }
                        }}
                      >
                        近30日
                      </button>
                      <button
                        onClick={() => handleTimeFilterChange('thisMonth')}
                        style={{
                          padding: '4px 10px',
                          borderRadius: '4px',
                          border: '1px solid #e5e6eb',
                          background: dataTimeQuick === 'thisMonth' ? '#165dff' : '#fff',
                          color: dataTimeQuick === 'thisMonth' ? '#fff' : '#4e5969',
                          fontSize: '11px',
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                          if (dataTimeQuick !== 'thisMonth') {
                            e.currentTarget.style.background = '#f2f3f5';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (dataTimeQuick !== 'thisMonth') {
                            e.currentTarget.style.background = '#fff';
                          }
                        }}
                      >
                        本月
                      </button>
                      <button
                        onClick={() => handleTimeFilterChange('lastMonth')}
                        style={{
                          padding: '4px 10px',
                          borderRadius: '4px',
                          border: '1px solid #e5e6eb',
                          background: dataTimeQuick === 'lastMonth' ? '#165dff' : '#fff',
                          color: dataTimeQuick === 'lastMonth' ? '#fff' : '#4e5969',
                          fontSize: '11px',
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                          if (dataTimeQuick !== 'lastMonth') {
                            e.currentTarget.style.background = '#f2f3f5';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (dataTimeQuick !== 'lastMonth') {
                            e.currentTarget.style.background = '#fff';
                          }
                        }}
                      >
                        上月
                      </button>
                      <button
                        onClick={() => handleTimeFilterChange('twoMonthsAgo')}
                        style={{
                          padding: '4px 10px',
                          borderRadius: '4px',
                          border: '1px solid #e5e6eb',
                          background: dataTimeQuick === 'twoMonthsAgo' ? '#165dff' : '#fff',
                          color: dataTimeQuick === 'twoMonthsAgo' ? '#fff' : '#4e5969',
                          fontSize: '11px',
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                          if (dataTimeQuick !== 'twoMonthsAgo') {
                            e.currentTarget.style.background = '#f2f3f5';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (dataTimeQuick !== 'twoMonthsAgo') {
                            e.currentTarget.style.background = '#fff';
                          }
                        }}
                      >
                        上上月
                      </button>
                      <button
                        onClick={() => handleTimeFilterChange('last3Months')}
                        style={{
                          padding: '4px 10px',
                          borderRadius: '4px',
                          border: '1px solid #e5e6eb',
                          background: dataTimeQuick === 'last3Months' ? '#165dff' : '#fff',
                          color: dataTimeQuick === 'last3Months' ? '#fff' : '#4e5969',
                          fontSize: '11px',
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                          if (dataTimeQuick !== 'last3Months') {
                            e.currentTarget.style.background = '#f2f3f5';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (dataTimeQuick !== 'last3Months') {
                            e.currentTarget.style.background = '#fff';
                          }
                        }}
                      >
                        近3月
                      </button>
                      <button
                        onClick={() => handleTimeFilterChange('thisYear')}
                        style={{
                          padding: '4px 10px',
                          borderRadius: '4px',
                          border: '1px solid #e5e6eb',
                          background: dataTimeQuick === 'thisYear' ? '#165dff' : '#fff',
                          color: dataTimeQuick === 'thisYear' ? '#fff' : '#4e5969',
                          fontSize: '11px',
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                          if (dataTimeQuick !== 'thisYear') {
                            e.currentTarget.style.background = '#f2f3f5';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (dataTimeQuick !== 'thisYear') {
                            e.currentTarget.style.background = '#fff';
                          }
                        }}
                      >
                        本年度
                      </button>
                    </div>
                  </div>
                </div>

                {/* 表头 - 固定 */}
                <div style={{ flexShrink: 0 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px', tableLayout: 'fixed' }}>
                    <colgroup>
                      <col style={{ width: '160px' }} />
                      <col style={{ width: '80px' }} />
                      <col style={{ width: '80px' }} />
                      <col style={{ width: '80px' }} />
                      <col style={{ width: '80px' }} />
                      <col style={{ width: '80px' }} />
                      <col style={{ width: '80px' }} />
                      <col style={{ width: '80px' }} />
                      <col style={{ width: '80px' }} />
                      <col style={{ width: '80px' }} />
                      <col style={{ width: '100px' }} />
                      <col style={{ width: '100px' }} />
                      <col style={{ width: '100px' }} />
                      <col style={{ width: '100px' }} />
                      <col style={{ width: '100px' }} />
                      <col style={{ width: '80px' }} />
                    </colgroup>
                    <thead>
                      <tr style={{ background: '#f7f8fa' }}>
                        <th style={{ padding: '12px 8px', textAlign: 'left', borderBottom: '2px solid #e5e6eb', color: '#4e5969', fontWeight: 500 }}>日期</th>
                        {!hideTags && <th style={{ padding: '12px 8px', textAlign: 'right', borderBottom: '2px solid #e5e6eb', color: '#4e5969', fontWeight: 500 }}>广告投入</th>}
                        <th style={{ padding: '12px 8px', textAlign: 'right', borderBottom: '2px solid #e5e6eb', color: '#4e5969', fontWeight: 500 }}>订单数</th>
                        <th style={{ padding: '12px 8px', textAlign: 'right', borderBottom: '2px solid #e5e6eb', color: '#4e5969', fontWeight: 500 }}>刷单数</th>
                        <th style={{ padding: '12px 8px', textAlign: 'right', borderBottom: '2px solid #e5e6eb', color: '#4e5969', fontWeight: 500 }}>退款数</th>
                        <th style={{ padding: '12px 8px', textAlign: 'right', borderBottom: '2px solid #e5e6eb', color: '#4e5969', fontWeight: 500 }}>未核销数</th>
                        <th style={{ padding: '12px 8px', textAlign: 'right', borderBottom: '2px solid #e5e6eb', color: '#4e5969', fontWeight: 500 }}>核销数</th>
                        <th style={{ padding: '12px 8px', textAlign: 'right', borderBottom: '2px solid #e5e6eb', color: '#4e5969', fontWeight: 500 }}>有效订单</th>
                        <th style={{ padding: '12px 8px', textAlign: 'right', borderBottom: '2px solid #e5e6eb', color: '#4e5969', fontWeight: 500 }}>有效核销</th>
                        <th style={{ padding: '12px 8px', textAlign: 'right', borderBottom: '2px solid #e5e6eb', color: '#4e5969', fontWeight: 500 }}>核销率</th>
                        <th style={{ padding: '12px 8px', textAlign: 'right', borderBottom: '2px solid #e5e6eb', color: '#4e5969', fontWeight: 500 }}>有效核销率</th>
                        <th style={{ padding: '12px 8px', textAlign: 'right', borderBottom: '2px solid #e5e6eb', color: '#4e5969', fontWeight: 500 }}>订单金额</th>
                        <th style={{ padding: '12px 8px', textAlign: 'right', borderBottom: '2px solid #e5e6eb', color: '#4e5969', fontWeight: 500 }}>刷单金额</th>
                        <th style={{ padding: '12px 8px', textAlign: 'right', borderBottom: '2px solid #e5e6eb', color: '#4e5969', fontWeight: 500 }}>退款金额</th>
                        <th style={{ padding: '12px 8px', textAlign: 'right', borderBottom: '2px solid #e5e6eb', color: '#4e5969', fontWeight: 500 }}>未核销金额</th>
                        <th style={{ padding: '12px 8px', textAlign: 'right', borderBottom: '2px solid #e5e6eb', color: '#4e5969', fontWeight: 500 }}>核销金额</th>
                        <th style={{ padding: '12px 8px', textAlign: 'right', borderBottom: '2px solid #e5e6eb', color: '#4e5969', fontWeight: 500 }}>金额核销率</th>
                      </tr>
                    </thead>
                  </table>
                </div>

                {/* 合计行 - 固定 */}
                <div style={{ flexShrink: 0 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px', tableLayout: 'fixed' }}>
                    <colgroup>
                      <col style={{ width: '160px' }} />
                      <col style={{ width: '80px' }} />
                      <col style={{ width: '80px' }} />
                      <col style={{ width: '80px' }} />
                      <col style={{ width: '80px' }} />
                      <col style={{ width: '80px' }} />
                      <col style={{ width: '80px' }} />
                      <col style={{ width: '80px' }} />
                      <col style={{ width: '80px' }} />
                      <col style={{ width: '80px' }} />
                      <col style={{ width: '100px' }} />
                      <col style={{ width: '100px' }} />
                      <col style={{ width: '100px' }} />
                      <col style={{ width: '100px' }} />
                      <col style={{ width: '100px' }} />
                      <col style={{ width: '80px' }} />
                    </colgroup>
                    <tbody>
                      {/* 合计行 - 根据时间筛选计算 */}
                      {(() => {
                        // 根据时间筛选过滤数据
                        const filteredData = dataTimeQuick === 'all'
                          ? dailyData
                          : dailyData.filter(d => {
                              const range = getDateRange(dataTimeQuick);
                              if (!range.start || !range.end) return true;
                              return d.date >= range.start && d.date <= range.end;
                            });

                        const totalMetrics = filteredData.reduce((acc, d) => ({
                          totalOrders: acc.totalOrders + d.totalOrders,
                          fakeOrders: acc.fakeOrders + d.fakeOrders,
                          refundCount: acc.refundCount + d.refundCount,
                          unverifiedCount: acc.unverifiedCount + d.unverifiedCount,
                          verifyCount: acc.verifyCount + d.verifyCount,
                          fakeVerifyCount: acc.fakeVerifyCount + (d.fakeVerifyCount || 0),
                          totalAmount: acc.totalAmount + d.totalAmount,
                          fakeAmount: acc.fakeAmount + d.fakeAmount,
                          refundAmount: acc.refundAmount + d.refundAmount,
                          unverifiedAmount: acc.unverifiedAmount + d.unverifiedAmount,
                          verifyAmount: acc.verifyAmount + d.verifyAmount,
                          fakeVerifyAmount: acc.fakeVerifyAmount + (d.fakeVerifyAmount || 0),
                          validOrders: acc.validOrders + (d.validOrders || 0),
                          validOrderAmount: acc.validOrderAmount + (d.validOrderAmount || 0),
                          validVerifyCount: acc.validVerifyCount + (d.validVerifyCount || 0),
                          validVerifyAmount: acc.validVerifyAmount + (d.validVerifyAmount || 0),
                          adSpend: acc.adSpend + (d.adSpend || 0),
                        }), {
                          totalOrders: 0,
                          fakeOrders: 0,
                          refundCount: 0,
                          unverifiedCount: 0,
                          verifyCount: 0,
                          fakeVerifyCount: 0,
                          totalAmount: 0,
                          fakeAmount: 0,
                          refundAmount: 0,
                          unverifiedAmount: 0,
                          verifyAmount: 0,
                          fakeVerifyAmount: 0,
                          validOrders: 0,
                          validOrderAmount: 0,
                          validVerifyCount: 0,
                          validVerifyAmount: 0,
                          adSpend: 0,
                        });

                        const verifyRate = totalMetrics.totalOrders > 0 ? (totalMetrics.verifyCount / totalMetrics.totalOrders * 100).toFixed(2) : '0';
                        const amountVerifyRate = totalMetrics.totalAmount > 0 ? (totalMetrics.verifyAmount / totalMetrics.totalAmount * 100).toFixed(2) : '0';
                        const validVerifyRate = totalMetrics.validOrders > 0 ? (totalMetrics.validVerifyCount / totalMetrics.validOrders * 100).toFixed(2) : '0';
                        const validAmountRate = totalMetrics.validOrderAmount > 0 ? (totalMetrics.validVerifyAmount / totalMetrics.validOrderAmount * 100).toFixed(2) : '0';

                        return (
                          <tr style={{ background: '#f7f8fa', fontWeight: 600, borderBottom: '2px solid #e5e6eb' }}>
                            <td style={{ padding: '12px 8px', color: '#4e5969', fontWeight: 600 }}>
                              {dataTimeQuick === 'all' ? '合计' : `${dataTimeQuick}合计`}
                            </td>
                            {!hideTags && <td style={{ padding: '12px 8px', textAlign: 'right', color: '#4e5969' }}>¥{totalMetrics.adSpend.toFixed(2)}</td>}
                            <td style={{ padding: '12px 8px', textAlign: 'right', color: '#4e5969' }}>{totalMetrics.totalOrders}</td>
                            <td style={{ padding: '12px 8px', textAlign: 'right', color: '#4e5969' }}>{totalMetrics.fakeOrders}</td>
                            <td style={{ padding: '12px 8px', textAlign: 'right', color: '#4e5969' }}>{totalMetrics.refundCount}</td>
                            <td style={{ padding: '12px 8px', textAlign: 'right', color: '#4e5969' }}>{totalMetrics.unverifiedCount}</td>
                            <td style={{ padding: '12px 8px', textAlign: 'right', color: '#4e5969' }}>{totalMetrics.verifyCount}</td>
                            <td style={{ padding: '12px 8px', textAlign: 'right', color: '#f53f3f' }}>{totalMetrics.validOrders}</td>
                            <td style={{ padding: '12px 8px', textAlign: 'right', color: '#f53f3f' }}>{totalMetrics.validVerifyCount}</td>
                            <td style={{ padding: '12px 8px', textAlign: 'right', color: '#4e5969' }}>{verifyRate}%</td>
                            <td style={{ padding: '12px 8px', textAlign: 'right', color: '#f53f3f' }}>{validVerifyRate}%</td>
                            <td style={{ padding: '12px 8px', textAlign: 'right', color: '#4e5969' }}>¥{totalMetrics.totalAmount.toFixed(2)}</td>
                            <td style={{ padding: '12px 8px', textAlign: 'right', color: '#4e5969' }}>¥{totalMetrics.fakeAmount.toFixed(2)}</td>
                            <td style={{ padding: '12px 8px', textAlign: 'right', color: '#4e5969' }}>¥{totalMetrics.refundAmount.toFixed(2)}</td>
                            <td style={{ padding: '12px 8px', textAlign: 'right', color: '#4e5969' }}>¥{totalMetrics.unverifiedAmount.toFixed(2)}</td>
                            <td style={{ padding: '12px 8px', textAlign: 'right', color: '#4e5969' }}>¥{totalMetrics.verifyAmount.toFixed(2)}</td>
                            <td style={{ padding: '12px 8px', textAlign: 'right', color: '#f53f3f' }}>{amountVerifyRate}%</td>
                          </tr>
                        );
                      })()}
                    </tbody>
                  </table>
                </div>

                {/* 表格内容 - 可滚动 */}
                <div style={{
                  flex: 1,
                  overflowX: 'auto',
                  overflowY: 'auto',
                  minHeight: 0
                }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px', tableLayout: 'fixed' }}>
                    <colgroup>
                      <col style={{ width: '160px' }} />
                      <col style={{ width: '80px' }} />
                      <col style={{ width: '80px' }} />
                      <col style={{ width: '80px' }} />
                      <col style={{ width: '80px' }} />
                      <col style={{ width: '80px' }} />
                      <col style={{ width: '80px' }} />
                      <col style={{ width: '80px' }} />
                      <col style={{ width: '80px' }} />
                      <col style={{ width: '80px' }} />
                      <col style={{ width: '100px' }} />
                      <col style={{ width: '100px' }} />
                      <col style={{ width: '100px' }} />
                      <col style={{ width: '100px' }} />
                      <col style={{ width: '100px' }} />
                      <col style={{ width: '80px' }} />
                    </colgroup>
                    <tbody>
                      {/* 根据时间筛选过滤月份数据 */}
                      {(() => {
                        // 获取时间筛选范围
                        const range = dataTimeQuick === 'all' ? null : getDateRange(dataTimeQuick);
                        
                        // 过滤并计算筛选范围内的月份数据
                        const filteredMonths = monthlyData
                          .filter(m => m.hasData)
                          .map(m => {
                            const monthStart = `${m.year}-${String(m.month).padStart(2, '0')}-01`;
                            const daysInMonth = new Date(m.year, m.month, 0).getDate();
                            const monthEnd = `${m.year}-${String(m.month).padStart(2, '0')}-${daysInMonth}`;
                            
                            // 如果有筛选范围，计算该月在筛选范围内的数据
                            let filteredMetrics = m.metrics;
                            let firstDay = m.firstDataDay;
                            let lastDay = m.lastDataDay;
                            
                            if (range) {
                              // 计算该月在筛选范围内的实际日期
                              const effectiveStart = monthStart < range.start ? range.start : monthStart;
                              const effectiveEnd = monthEnd > range.end ? range.end : monthEnd;
                              firstDay = parseInt(effectiveStart.split('-')[2]);
                              lastDay = parseInt(effectiveEnd.split('-')[2]);
                              
                              // 过滤该月的数据
                              const monthDaily = dailyData.filter(d => {
                                return d.date >= effectiveStart && d.date <= effectiveEnd && d.date.startsWith(`${m.year}-${String(m.month).padStart(2, '0')}`);
                              });
                              
                              // 重新计算 metrics
                              const metrics = monthDaily.reduce((acc, d) => ({
                                totalOrders: acc.totalOrders + d.totalOrders,
                                fakeOrders: acc.fakeOrders + d.fakeOrders,
                                refundCount: acc.refundCount + d.refundCount,
                                unverifiedCount: acc.unverifiedCount + d.unverifiedCount,
                                verifyCount: acc.verifyCount + d.verifyCount,
                                fakeVerifyCount: acc.fakeVerifyCount + (d.fakeVerifyCount || 0),
                                totalAmount: acc.totalAmount + d.totalAmount,
                                fakeAmount: acc.fakeAmount + d.fakeAmount,
                                refundAmount: acc.refundAmount + d.refundAmount,
                                unverifiedAmount: acc.unverifiedAmount + d.unverifiedAmount,
                                verifyAmount: acc.verifyAmount + d.verifyAmount,
                                fakeVerifyAmount: acc.fakeVerifyAmount + (d.fakeVerifyAmount || 0),
                                validOrders: acc.validOrders + (d.validOrders || 0),
                                validOrderAmount: acc.validOrderAmount + (d.validOrderAmount || 0),
                                validVerifyCount: acc.validVerifyCount + (d.validVerifyCount || 0),
                                validVerifyAmount: acc.validVerifyAmount + (d.validVerifyAmount || 0),
                                adSpend: acc.adSpend + (d.adSpend || 0),
                              }), {
                                totalOrders: 0,
                                fakeOrders: 0,
                                refundCount: 0,
                                unverifiedCount: 0,
                                verifyCount: 0,
                                fakeVerifyCount: 0,
                                totalAmount: 0,
                                fakeAmount: 0,
                                refundAmount: 0,
                                unverifiedAmount: 0,
                                verifyAmount: 0,
                                fakeVerifyAmount: 0,
                                validOrders: 0,
                                validOrderAmount: 0,
                                validVerifyCount: 0,
                                validVerifyAmount: 0,
                                adSpend: 0,
                              });
                              
                              filteredMetrics = {
                                ...metrics,
                                verifyRate: metrics.totalOrders > 0 ? ((metrics.verifyCount / metrics.totalOrders) * 100).toFixed(2) : '0',
                                amountVerifyRate: metrics.totalAmount > 0 ? ((metrics.verifyAmount / metrics.totalAmount) * 100).toFixed(2) : '0',
                                validVerifyRate: metrics.validOrders > 0 ? ((metrics.validVerifyCount / metrics.validOrders) * 100).toFixed(2) : '0',
                                validAmountRate: metrics.validOrderAmount > 0 ? ((metrics.validVerifyAmount / metrics.validOrderAmount) * 100).toFixed(2) : '0',
                              };
                            }
                            
                            return { ...m, filteredMetrics, firstDay, lastDay };
                          })
                          .filter(m => {
                            // 如果有筛选范围，检查该月份是否与筛选范围有交集
                            if (range) {
                              const monthStart = `${m.year}-${String(m.month).padStart(2, '0')}-01`;
                              const daysInMonth = new Date(m.year, m.month, 0).getDate();
                              const monthEnd = `${m.year}-${String(m.month).padStart(2, '0')}-${daysInMonth}`;
                              // 如果该月份与筛选范围完全没有交集，则不显示
                              if (monthEnd < range.start || monthStart > range.end) {
                                return false;
                              }
                            }
                            // 过滤掉没有数据的月份
                            if (!range) return true;
                            return m.filteredMetrics.totalOrders > 0 || m.filteredMetrics.totalAmount > 0 || m.filteredMetrics.adSpend > 0;
                          });

                        const firstMonthIdx = 0;
                        const lastMonthIdx = filteredMonths.length - 1;

                        return filteredMonths.map((monthData, monthIdx) => {
                          const monthKey = `${monthData.year}-${String(monthData.month).padStart(2, '0')}`;
                          const isLastMonth = monthIdx === lastMonthIdx;
                          const isMonthExpanded = expandedMonths.has(monthKey);
                          const daysInMonth = new Date(monthData.year, monthData.month, 0).getDate();
                          
                          // 判断是否是第一个或最后一个月份
                          const isFirstMonth = monthIdx === firstMonthIdx;
                          const isEdgeMonth = isFirstMonth || isLastMonth;
                          
                          // 生成月份标签
                          let monthLabel: string;
                          if (isEdgeMonth) {
                            // 边缘月份：显示日期范围
                            monthLabel = `${monthData.month}月${monthData.firstDataDay}-${monthData.lastDataDay}号`;
                          } else {
                            // 中间月份：只显示月份
                            monthLabel = `${monthData.month}月`;
                          }

                          return (
                            <React.Fragment key={monthIdx}>
                              {/* 月份行 */}
                              <tr
                                onClick={() => toggleMonth(monthData.year, monthData.month)}
                                style={{
                                  background: highlightDate.startsWith(`${monthData.year}-${String(monthData.month).padStart(2, '0')}`) ? '#e8f3ff' : '#fff',
                                  cursor: 'pointer',
                                  fontWeight: 600
                                }}
                                onMouseEnter={(e) => {
                                  if (!highlightDate.startsWith(`${monthData.year}-${String(monthData.month).padStart(2, '0')}`)) {
                                    e.currentTarget.style.background = '#f0f5ff';
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  if (!highlightDate.startsWith(`${monthData.year}-${String(monthData.month).padStart(2, '0')}`)) {
                                    e.currentTarget.style.background = '#fff';
                                  }
                                }}
                              >
                                <td style={{ padding: '12px 8px', borderBottom: '1px solid #e5e6eb' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <div
                                      style={{
                                        padding: '6px',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: '#165dff',
                                        transition: 'transform 0.2s'
                                      }}
                                    >
                                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                                        style={{ transform: isMonthExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                                        <polyline points="9 18 15 12 9 6"/>
                                      </svg>
                                    </div>
                                    <span style={{ color: '#165dff', fontWeight: 600 }}>{monthLabel}</span>
                                  </div>
                                </td>
                                {!hideTags && <td style={{ padding: '12px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#165dff' }}>¥{monthData.filteredMetrics.adSpend.toFixed(2)}</td>}
                                <td style={{ padding: '12px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#165dff' }}>{monthData.filteredMetrics.totalOrders}</td>
                                <td style={{ padding: '12px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#165dff' }}>{monthData.filteredMetrics.fakeOrders}</td>
                                <td style={{ padding: '12px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#165dff' }}>{monthData.filteredMetrics.refundCount}</td>
                                <td style={{ padding: '12px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#165dff' }}>{monthData.filteredMetrics.unverifiedCount}</td>
                                <td style={{ padding: '12px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#165dff' }}>{monthData.filteredMetrics.verifyCount}</td>
                                <td style={{ padding: '12px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#f53f3f' }}>{monthData.filteredMetrics.validOrders}</td>
                                <td style={{ padding: '12px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#f53f3f' }}>{monthData.filteredMetrics.validVerifyCount}</td>
                                <td style={{ padding: '12px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#165dff' }}>{monthData.filteredMetrics.verifyRate}%</td>
                                <td style={{ padding: '12px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#f53f3f' }}>{monthData.filteredMetrics.validVerifyRate}%</td>
                                <td style={{ padding: '12px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#165dff' }}>¥{monthData.filteredMetrics.totalAmount.toFixed(2)}</td>
                                <td style={{ padding: '12px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#165dff' }}>¥{monthData.filteredMetrics.fakeAmount.toFixed(2)}</td>
                                <td style={{ padding: '12px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#165dff' }}>¥{monthData.filteredMetrics.refundAmount.toFixed(2)}</td>
                                <td style={{ padding: '12px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#165dff' }}>¥{monthData.filteredMetrics.unverifiedAmount.toFixed(2)}</td>
                                <td style={{ padding: '12px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#165dff' }}>¥{monthData.filteredMetrics.verifyAmount.toFixed(2)}</td>
                                <td style={{ padding: '12px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#f53f3f' }}>{monthData.filteredMetrics.amountVerifyRate}%</td>
                              </tr>

                              {/* 周数据 - 跟随月份展开/折叠 */}
                              {isMonthExpanded && (() => {
                                // 生成周数据（使用完整的日数据，让周数据生成函数处理跨月周）
                                // 先根据筛选范围过滤数据
                                const filteredDaily = range 
                                  ? dailyData.filter(d => d.date >= range.start && d.date <= range.end)
                                  : dailyData;
                                
                                // 生成周数据
                                const weeklyData = generateWeeklyDataForMonth(filteredDaily, monthData.year, monthData.month);
                                
                                return weeklyData.map((week, weekIdx) => {
                                  // 判断是否是按天显示的数据（weekNumber === 0）
                                  const isDayOnly = week.weekNumber === 0;
                                  
                                  if (isDayOnly) {
                                    // 按天显示的数据 - 直接显示，不需要下拉/展开
                                    return week.days.map((day, dayIdx) => {
                                      const valueColor = day.isAfterDataEnd ? '#c9cdd4' : '#1d2129';
                                      return (
                                        <tr 
                                          key={`${week.weekKey}-${dayIdx}`} 
                                          style={{ 
                                            background: day.date === highlightDate ? '#fff7e6' : '#fafbfc',
                                            fontWeight: day.date === highlightDate ? 600 : 'normal'
                                          }}
                                        >
                                          <td style={{ padding: '10px 8px 10px 48px', textAlign: 'left', borderBottom: '1px solid #f2f3f5', color: day.isAfterDataEnd ? '#c9cdd4' : '#86909c' }}>{day.date}</td>
                                          {!hideTags && <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: valueColor }}>¥{day.adSpend.toFixed(2)}</td>}
                                          <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: valueColor }}>{day.totalOrders}</td>
                                          <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: valueColor }}>{day.fakeOrders}</td>
                                          <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: valueColor }}>{day.refundCount}</td>
                                          <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: valueColor }}>{day.unverifiedCount}</td>
                                          <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: valueColor }}>{day.verifyCount}</td>
                                          <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: '#f53f3f' }}>{day.validOrders}</td>
                                          <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: '#f53f3f' }}>{day.validVerifyCount}</td>
                                          <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: valueColor }}>{day.verifyRate.toFixed(2)}%</td>
                                          <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: '#f53f3f' }}>{day.validVerifyRate.toFixed(2)}%</td>
                                          <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: valueColor }}>¥{day.totalAmount.toFixed(2)}</td>
                                          <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: valueColor }}>¥{day.fakeAmount.toFixed(2)}</td>
                                          <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: valueColor }}>¥{day.refundAmount.toFixed(2)}</td>
                                          <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: valueColor }}>¥{day.unverifiedAmount.toFixed(2)}</td>
                                          <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: valueColor }}>¥{day.verifyAmount.toFixed(2)}</td>
                                          <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: '#f53f3f' }}>{day.amountVerifyRate.toFixed(2)}%</td>
                                        </tr>
                                      );
                                    });
                                  }
                                  
                                  // 正常周数据 - 保持下拉/展开结构
                                  const isWeekExpanded = expandedWeeks.has(week.weekKey);
                                  const weekBgColor = week.isCrossMonth ? '#fafafa' : (highlightDate >= week.startDate && highlightDate <= week.endDate ? '#e8f3ff' : '#fff');
                                  
                                  return (
                                    <React.Fragment key={weekIdx}>
                                      {/* 周行 */}
                                      <tr
                                        onClick={() => toggleWeek(week.weekKey)}
                                        style={{
                                          background: weekBgColor,
                                          cursor: 'pointer',
                                          fontWeight: 500
                                        }}
                                        onMouseEnter={(e) => {
                                          if (!(highlightDate >= week.startDate && highlightDate <= week.endDate)) {
                                            e.currentTarget.style.background = '#f0f5ff';
                                          }
                                        }}
                                        onMouseLeave={(e) => {
                                          if (!(highlightDate >= week.startDate && highlightDate <= week.endDate)) {
                                            e.currentTarget.style.background = week.isCrossMonth ? '#fafafa' : '#fff';
                                          }
                                        }}
                                      >
                                        <td style={{ padding: '10px 8px 10px 24px', borderBottom: '1px solid #e5e6eb' }}>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <div
                                              style={{
                                                padding: '4px',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                color: '#165dff',
                                                transition: 'transform 0.2s'
                                              }}
                                            >
                                              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                                                style={{ transform: isWeekExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                                                <polyline points="9 18 15 12 9 6"/>
                                              </svg>
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                                              <span style={{ color: '#1d2129', fontWeight: 500, fontSize: '10px', lineHeight: '1.2' }}>{week.label}</span>
                                              <span style={{ color: '#86909c', fontSize: '9px', lineHeight: '1.2' }}>{week.dateRange}</span>
                                            </div>
                                          </div>
                                        </td>
                                        {!hideTags && <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#165dff', fontSize: '10px' }}>¥{week.adSpend.toFixed(2)}</td>}
                                        <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#165dff', fontSize: '10px' }}>{week.totalOrders}</td>
                                        <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#165dff', fontSize: '10px' }}>{week.fakeOrders}</td>
                                        <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#165dff', fontSize: '10px' }}>{week.refundCount}</td>
                                        <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#165dff', fontSize: '10px' }}>{week.unverifiedCount}</td>
                                        <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#165dff', fontSize: '10px' }}>{week.verifyCount}</td>
                                        <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#f53f3f', fontSize: '10px' }}>{week.validOrders}</td>
                                        <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#f53f3f', fontSize: '10px' }}>{week.validVerifyCount}</td>
                                        <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#165dff', fontSize: '10px' }}>{week.verifyRate}%</td>
                                        <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#f53f3f', fontSize: '10px' }}>{week.validVerifyRate}%</td>
                                        <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#165dff', fontSize: '10px' }}>¥{week.totalAmount.toFixed(2)}</td>
                                        <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#165dff', fontSize: '10px' }}>¥{week.fakeAmount.toFixed(2)}</td>
                                        <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#165dff', fontSize: '10px' }}>¥{week.refundAmount.toFixed(2)}</td>
                                        <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#165dff', fontSize: '10px' }}>¥{week.unverifiedAmount.toFixed(2)}</td>
                                        <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#165dff', fontSize: '10px' }}>¥{week.verifyAmount.toFixed(2)}</td>
                                        <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#f53f3f', fontSize: '10px' }}>{week.amountVerifyRate}%</td>
                                      </tr>

                                      {/* 日数据 - 跟随周展开/折叠 */}
                                      {isWeekExpanded && week.days.map((day, dayIdx) => {
                                        const valueColor = day.isAfterDataEnd ? '#c9cdd4' : '#1d2129';
                                        return (
                                          <tr 
                                            key={dayIdx} 
                                            style={{ 
                                              background: day.date === highlightDate ? '#fff7e6' : '#fafbfc',
                                              fontWeight: day.date === highlightDate ? 600 : 'normal'
                                            }}
                                          >
                                            <td style={{ padding: '10px 8px 10px 48px', textAlign: 'left', borderBottom: '1px solid #f2f3f5', color: day.isAfterDataEnd ? '#c9cdd4' : '#86909c' }}>{day.date}</td>
                                            {!hideTags && <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: valueColor }}>¥{day.adSpend.toFixed(2)}</td>}
                                            <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: valueColor }}>{day.totalOrders}</td>
                                            <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: valueColor }}>{day.fakeOrders}</td>
                                            <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: valueColor }}>{day.refundCount}</td>
                                            <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: valueColor }}>{day.unverifiedCount}</td>
                                            <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: valueColor }}>{day.verifyCount}</td>
                                            <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: '#f53f3f' }}>{day.validOrders}</td>
                                            <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: '#f53f3f' }}>{day.validVerifyCount}</td>
                                            <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: valueColor }}>{day.verifyRate.toFixed(2)}%</td>
                                            <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: '#f53f3f' }}>{day.validVerifyRate.toFixed(2)}%</td>
                                            <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: valueColor }}>¥{day.totalAmount.toFixed(2)}</td>
                                            <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: valueColor }}>¥{day.fakeAmount.toFixed(2)}</td>
                                            <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: valueColor }}>¥{day.refundAmount.toFixed(2)}</td>
                                            <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: valueColor }}>¥{day.unverifiedAmount.toFixed(2)}</td>
                                            <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: valueColor }}>¥{day.verifyAmount.toFixed(2)}</td>
                                            <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: '#f53f3f' }}>{day.amountVerifyRate.toFixed(2)}%</td>
                                          </tr>
                                        );
                                      })}
                                    </React.Fragment>
                                  );
                                });
                              })()}
                            </React.Fragment>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
