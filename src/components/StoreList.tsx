'use client';

import React, { useState, useEffect, useRef, useMemo, Fragment, useCallback, memo, startTransition, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { PRESET_TAGS, PRESET_TAG_NAMES, CUSTOM_TAG_COLOR } from '@/constants/tag-presets';
import { List } from 'react-window';
import { StoreSystem } from './MainLayout';
import StoreDetailModal from './StoreDetailModal';
import DataUploadModal from './DataUploadModal';
import BasicInfoUploadModal, { BasicInfoFileInfo, StaffFileInfo, DouyinFileInfo } from './BasicInfoUploadModal';

/*
╔═══════════════════════════════════════════════════════════════════════════════════════════════╗
║                           【重要】门店列表表格列顺序说明                                        ║
╠═══════════════════════════════════════════════════════════════════════════════════════════════╣
║  修改表格列时，必须同时修改以下3个地方，并保持顺序完全一致：                                       ║
║                                                                                              ║
║  1. 表头区域（约5512-5673行）                                                                 ║
║  2. 表体区域（约6891-6970行）                                                                 ║
║  3. 合计行区域（约6035-6128行）                                                               ║
║                                                                                              ║
║  【非数据模式列顺序 - 共12列】（固定列1 + 非固定列11）                                          ║
║  ┌──────────┬────────┬────┬────┬────────┬────────┬──────┬──────┬────────┬────────┬────────┬──────┐ ║
║  │ (固定列) │ 列2   │列3 │列4 │ 列5   │ 列6   │ 列7  │ 列8  │ 列9   │ 列10  │ 列11  │ 列12 │ ║
║  ├──────────┼────────┼────┼────┼────────┼────────┼──────┼──────┼────────┼────────┼────────┼──────┤ ║
║  │ 门店名称*│ 门店ID │地区│类别│服务状态│ 面积  │ 资料 │ 人数 │获客渠道│ 联系人 │下次跟进│ 操作 │ ║
║  │ *(入驻日期│        │    │    │        │        │      │      │        │        │        │      │ ║
║  │  在名称下)│        │    │    │        │        │      │      │        │        │        │      │ ║
║  └──────────┴────────┴────┴────┴────────┴────────┴──────┴──────┴────────┴────────┴────────┴──────┘ ║
║                                                                                              ║
║  【合计行对应位置】                                                                           ║
║  列1(固定): 共XX家门店  |  列2: 空  |  列3-11: 各类统计  | 列12: 空   ║
╚═══════════════════════════════════════════════════════════════════════════════════════════════╝
*/

// 根据门店体系获取localStorage key
const getStorageKey = (key: string, system: StoreSystem) => `${key}_${system}`;

// ========== IndexedDB 存储工具（支持大文件存储，不受 localStorage 5MB 限制）==========

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

// 保存数据到 IndexedDB（无大小限制）
const saveToIDB = async (key: string, value: any): Promise<boolean> => {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put({ key, value, updatedAt: Date.now() });
    
    return new Promise((resolve) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (error) {
    console.error('保存到 IndexedDB 失败:', error);
    return false;
  }
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

// 从 IndexedDB 删除数据
const deleteFromIDB = async (key: string): Promise<boolean> => {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(key);
    
    return new Promise((resolve) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (error) {
    console.error('从 IndexedDB 删除失败:', error);
    return false;
  }
};

// 获取 IndexedDB 存储使用情况
const getIDBUsage = async (): Promise<{ key: string; size: number }[]> => {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    
    return new Promise((resolve) => {
      request.onsuccess = () => {
        const results = request.result || [];
        const usage = results.map((item: any) => ({
          key: item.key,
          size: new Blob([JSON.stringify(item.value)]).size
        }));
        resolve(usage);
      };
      request.onerror = () => resolve([]);
    });
  } catch (error) {
    console.error('获取 IndexedDB 使用情况失败:', error);
    return [];
  }
};

// 获取 IndexedDB 键（根据门店体系）
const getIDBKey = (key: string, system: StoreSystem) => `idb_${key}_${system}`;

// ========== localStorage 工具（保留用于小数据）==========

// 安全地保存到 localStorage（仅用于小数据）
const safeSetItem = (key: string, value: any): boolean => {
  try {
    const jsonStr = JSON.stringify(value);
    localStorage.setItem(key, jsonStr);
    return true;
  } catch (error: any) {
    console.error('保存到 localStorage 失败:', error);
    return false;
  }
};

// 安全地读取 localStorage
const safeGetItem = (key: string, defaultValue: any = null): any => {
  try {
    const value = localStorage.getItem(key);
    if (value === null) return defaultValue;
    return JSON.parse(value);
  } catch (error) {
    console.error('从 localStorage 读取失败:', error);
    return defaultValue;
  }
};

// 保存大文件到 IndexedDB（广告费、订单、核销、退款等）
const saveBigData = async (key: string, system: StoreSystem, value: any): Promise<boolean> => {
  const idbKey = getIDBKey(key, system);
  return await saveToIDB(idbKey, value);
};

// 从 IndexedDB 读取大文件
const getBigData = async (key: string, system: StoreSystem): Promise<any> => {
  const idbKey = getIDBKey(key, system);
  return await getFromIDB(idbKey);
};

// 从 IndexedDB 删除大文件
const deleteBigData = async (key: string, system: StoreSystem): Promise<boolean> => {
  const idbKey = getIDBKey(key, system);
  return await deleteFromIDB(idbKey);
};

// 清理指定前缀的所有 localStorage 数据
const clearStorageByPrefix = (prefix: string) => {
  const keys = Object.keys(localStorage);
  keys.forEach(key => {
    if (key.startsWith(prefix)) {
      localStorage.removeItem(key);
    }
  });
};

// ========== 订单统计相关类型 ==========
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
  // 未匹配订单详情
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
  // 未匹配门店ID统计
  unmatchedStoreIdStats?: Array<{
    storeId: string;
    orderCount: number;
    totalAmount: number;
    reason: string;
  }>;
  orderMapping: Record<string, string>;
  // 渠道统计
  channelStats?: Record<string, number>;
  // 按日渠道统计（用于时间筛选）
  dailyChannelStats?: Record<string, Record<string, number>>;
  // 有效订单渠道统计（订单实收 > 10元）
  validChannelStats?: Record<string, number>;
  // 按日有效渠道统计
  dailyValidChannelStats?: Record<string, Record<string, number>>;
  // 套餐统计
  packageStats?: Record<string, number>;
  packageAmountStats?: Record<string, number>;  // 套餐金额统计
  // 按日套餐统计（用于时间筛选）
  dailyPackageStats?: Record<string, Record<string, number>>;
  dailyPackageAmountStats?: Record<string, Record<string, number>>;  // 按日套餐金额统计
  // 有效订单套餐统计（订单实收 > 10元）
  validPackageStats?: Record<string, number>;
  validPackageAmountStats?: Record<string, number>;  // 有效订单套餐金额统计
  // 按日有效套餐统计
  dailyValidPackageStats?: Record<string, Record<string, number>>;
  dailyValidPackageAmountStats?: Record<string, Record<string, number>>;  // 按日有效套餐金额统计
}

// ========== 核销统计相关类型 ==========
interface DailyVerifyStats {
  verifyCount: number;
  verifyAmount: number;
  fakeVerifyCount: number;    // 刷单核销数（核销金额 ≤ 10元，包含10元）
  validVerifyCount: number;    // 有效核销数（核销金额 > 10元）
  fakeVerifyAmount: number;   // 刷单核销金额（核销金额 ≤ 10元）
  validVerifyAmount: number;  // 有效核销金额（核销金额 > 10元）
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
  // 未匹配核销详情
  unmatchedVerifyDetails?: Array<{
    verifyId: string;
    storeId: string | null;
    reason: string;
    verifyTime: string;
    verifyCount: number;
    verifyAmount: number;
  }>;
  // 渠道统计
  channelStats?: Record<string, number>;
  // 按日渠道统计（用于时间筛选）
  dailyChannelStats?: Record<string, Record<string, number>>;
  // 有效核销渠道统计（核销金额 > 10元）
  validChannelStats?: Record<string, number>;
  // 按日有效渠道统计
  dailyValidChannelStats?: Record<string, Record<string, number>>;
  // 套餐统计
  packageStats?: Record<string, number>;
  packageAmountStats?: Record<string, number>;  // 套餐金额统计
  // 按日套餐统计（用于时间筛选）
  dailyPackageStats?: Record<string, Record<string, number>>;
  dailyPackageAmountStats?: Record<string, Record<string, number>>;  // 按日套餐金额统计
  // 有效核销套餐统计（核销金额 > 10元）
  validPackageStats?: Record<string, number>;
  validPackageAmountStats?: Record<string, number>;  // 有效核销套餐金额统计
  // 按日有效套餐统计
  dailyValidPackageStats?: Record<string, Record<string, number>>;
  dailyValidPackageAmountStats?: Record<string, Record<string, number>>;  // 按日有效套餐金额统计
}

// ========== 退款统计相关类型 ==========
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

// ========== 广告费统计相关类型 ==========
interface DailyAdStats {
  spend: number;     // 广告投入
  orders: number;    // 广告订单数
}

interface StoreAdStats {
  totalSpend: number;
  totalOrders: number;
  dailyStats: Record<string, DailyAdStats>;  // key: 日期字符串，和订单/核销保持一致
}

// 单个广告账户的统计数据
interface AdAccountData {
  accountIndex: number; // 0-3
  accountName: string;
  storeStats: Record<string, StoreAdStats>;
  timeRange: { minTime: string; maxTime: string; };
  stats: { totalRecords: number; matchedRecords: number; unmatchedRecords: number; totalSpend: number; totalOrders: number; };
}

interface AdAggregatedData {
  // 总计数据（由所有账户累计）
  storeStats: Record<string, StoreAdStats>;
  timeRange: { minTime: string | null; maxTime: string | null; };
  stats: {
    totalRecords: number;
    matchedRecords: number;
    unmatchedRecords: number;
    totalAdInvestment: number;
  };
  unmatchedDailyStats: Record<string, DailyAdStats>;
  unmatchedTotal: {
    spend: number;
    orders: number;
  };
  // 8个账户的独立数据
  accounts: [AdAccountData | null, AdAccountData | null, AdAccountData | null, AdAccountData | null, AdAccountData | null, AdAccountData | null, AdAccountData | null, AdAccountData | null];
}

// 广告账户文件信息类型
interface AdAccountFileInfo {
  accountIndex: number;
  accountName: string;
  fileName: string;
  minTime: string;
  maxTime: string;
}

// 单个广告账户的原始数据（解析后的文件数据）
interface AdAccountData {
  storeStats: Record<string, StoreAdStats>;
  timeRange: { minTime: string; maxTime: string; };
  stats: { totalRecords: number; matchedRecords: number; unmatchedRecords: number; totalSpend: number; totalOrders: number; };
}

// 格式化日期为 MM-DD HH:00 格式
const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  return `${month}-${day} ${hour}:00`;
};

// 中国省份数据
const PROVINCES = [
  '北京市', '天津市', '上海市', '重庆市',
  '河北省', '山西省', '辽宁省', '吉林省', '黑龙江省',
  '江苏省', '浙江省', '安徽省', '福建省', '江西省', '山东省',
  '河南省', '湖北省', '湖南省', '广东省', '海南省',
  '四川省', '贵州省', '云南省', '陕西省', '甘肃省', '青海省',
  '台湾省', '内蒙古自治区', '广西壮族自治区', '西藏自治区', 
  '宁夏回族自治区', '新疆维吾尔自治区', '香港特别行政区', '澳门特别行政区'
];

// 省份对应的城市数据
const CITIES_BY_PROVINCE: Record<string, string[]> = {
  '北京市': ['北京市'],
  '天津市': ['天津市'],
  '上海市': ['上海市'],
  '重庆市': ['重庆市', '万州区', '涪陵区', '渝中区', '大渡口区', '江北区', '沙坪坝区', '九龙坡区', '南岸区', '北碚区', '綦江区', '大足区', '渝北区', '巴南区', '黔江区', '长寿区', '江津区', '合川区', '永川区', '南川区', '璧山区', '铜梁区', '潼南区', '荣昌区'],
  '河北省': ['石家庄市', '唐山市', '秦皇岛市', '邯郸市', '邢台市', '保定市', '张家口市', '承德市', '沧州市', '廊坊市', '衡水市'],
  '山西省': ['太原市', '大同市', '阳泉市', '长治市', '晋城市', '朔州市', '晋中市', '运城市', '忻州市', '临汾市', '吕梁市'],
  '辽宁省': ['沈阳市', '大连市', '鞍山市', '抚顺市', '本溪市', '丹东市', '锦州市', '营口市', '阜新市', '辽阳市', '盘锦市', '铁岭市', '朝阳市', '葫芦岛市'],
  '吉林省': ['长春市', '吉林市', '四平市', '辽源市', '通化市', '白山市', '松原市', '白城市', '延边朝鲜族自治州'],
  '黑龙江省': ['哈尔滨市', '齐齐哈尔市', '鸡西市', '鹤岗市', '双鸭山市', '大庆市', '伊春市', '佳木斯市', '七台河市', '牡丹江市', '黑河市', '绥化市', '大兴安岭地区'],
  '江苏省': ['南京市', '无锡市', '徐州市', '常州市', '苏州市', '南通市', '连云港市', '淮安市', '盐城市', '扬州市', '镇江市', '泰州市', '宿迁市'],
  '浙江省': ['杭州市', '宁波市', '温州市', '嘉兴市', '湖州市', '绍兴市', '金华市', '衢州市', '舟山市', '台州市', '丽水市'],
  '安徽省': ['合肥市', '芜湖市', '蚌埠市', '淮南市', '马鞍山市', '淮北市', '铜陵市', '安庆市', '黄山市', '滁州市', '阜阳市', '宿州市', '六安市', '亳州市', '池州市', '宣城市'],
  '福建省': ['福州市', '厦门市', '莆田市', '三明市', '泉州市', '漳州市', '南平市', '龙岩市', '宁德市'],
  '江西省': ['南昌市', '景德镇市', '萍乡市', '九江市', '新余市', '鹰潭市', '赣州市', '吉安市', '宜春市', '抚州市', '上饶市'],
  '山东省': ['济南市', '青岛市', '淄博市', '枣庄市', '东营市', '烟台市', '潍坊市', '济宁市', '泰安市', '威海市', '日照市', '临沂市', '德州市', '聊城市', '滨州市', '菏泽市'],
  '河南省': ['郑州市', '开封市', '洛阳市', '平顶山市', '安阳市', '鹤壁市', '新乡市', '焦作市', '濮阳市', '许昌市', '漯河市', '三门峡市', '南阳市', '商丘市', '信阳市', '周口市', '驻马店市', '济源市'],
  '湖北省': ['武汉市', '黄石市', '十堰市', '宜昌市', '襄阳市', '鄂州市', '荆门市', '孝感市', '荆州市', '黄冈市', '咸宁市', '随州市', '恩施土家族苗族自治州', '仙桃市', '潜江市', '天门市', '神农架林区'],
  '湖南省': ['长沙市', '株洲市', '湘潭市', '衡阳市', '邵阳市', '岳阳市', '常德市', '张家界市', '益阳市', '郴州市', '永州市', '怀化市', '娄底市', '湘西土家族苗族自治州'],
  '广东省': ['广州市', '韶关市', '深圳市', '珠海市', '汕头市', '佛山市', '江门市', '湛江市', '茂名市', '肇庆市', '惠州市', '梅州市', '汕尾市', '河源市', '阳江市', '清远市', '东莞市', '中山市', '潮州市', '揭阳市', '云浮市'],
  '海南省': ['海口市', '三亚市', '三沙市', '儋州市', '五指山市', '琼海市', '文昌市', '万宁市', '东方市'],
  '四川省': ['成都市', '自贡市', '攀枝花市', '泸州市', '德阳市', '绵阳市', '广元市', '遂宁市', '内江市', '乐山市', '南充市', '眉山市', '宜宾市', '广安市', '达州市', '雅安市', '巴中市', '资阳市', '阿坝藏族羌族自治州', '甘孜藏族自治州', '凉山彝族自治州'],
  '贵州省': ['贵阳市', '六盘水市', '遵义市', '安顺市', '毕节市', '铜仁市', '黔西南布依族苗族自治州', '黔东南苗族侗族自治州', '黔南布依族苗族自治州'],
  '云南省': ['昆明市', '曲靖市', '玉溪市', '保山市', '昭通市', '丽江市', '普洱市', '临沧市', '楚雄彝族自治州', '红河哈尼族彝族自治州', '文山壮族苗族自治州', '西双版纳傣族自治州', '大理白族自治州', '德宏傣族景颇族自治州', '怒江傈僳族自治州', '迪庆藏族自治州'],
  '陕西省': ['西安市', '铜川市', '宝鸡市', '咸阳市', '渭南市', '延安市', '汉中市', '榆林市', '安康市', '商洛市'],
  '甘肃省': ['兰州市', '嘉峪关市', '金昌市', '白银市', '天水市', '武威市', '张掖市', '平凉市', '酒泉市', '庆阳市', '定西市', '陇南市', '临夏回族自治州', '甘南藏族自治州'],
  '青海省': ['西宁市', '海东市', '海北藏族自治州', '黄南藏族自治州', '海南藏族自治州', '果洛藏族自治州', '玉树藏族自治州', '海西蒙古族藏族自治州'],
  '内蒙古自治区': ['呼和浩特市', '包头市', '乌海市', '赤峰市', '通辽市', '鄂尔多斯市', '呼伦贝尔市', '巴彦淖尔市', '乌兰察布市', '兴安盟', '锡林郭勒盟', '阿拉善盟'],
  '广西壮族自治区': ['南宁市', '柳州市', '桂林市', '梧州市', '北海市', '防城港市', '钦州市', '贵港市', '玉林市', '百色市', '贺州市', '河池市', '来宾市', '崇左市'],
  '西藏自治区': ['拉萨市', '日喀则市', '昌都市', '林芝市', '山南市', '那曲市', '阿里地区'],
  '宁夏回族自治区': ['银川市', '石嘴山市', '吴忠市', '固原市', '中卫市'],
  '新疆维吾尔自治区': ['乌鲁木齐市', '克拉玛依市', '吐鲁番市', '哈密市', '昌吉回族自治州', '博尔塔拉蒙古自治州', '巴音郭楞蒙古自治州', '阿克苏地区', '克孜勒苏柯尔克孜自治州', '喀什地区', '和田地区', '伊犁哈萨克自治州', '塔城地区', '阿勒泰地区', '石河子市', '阿拉尔市', '图木舒克市', '五家渠市', '北屯市', '铁门关市', '双河市', '可克达拉市', '昆玉市', '胡杨河市'],
  '台湾省': ['台北市', '高雄市', '台南市', '台中市', '桃园市', '新北市', '基隆市', '新竹市', '嘉义市'],
  '香港特别行政区': ['香港'],
  '澳门特别行政区': ['澳门']
};

// 城市 -> 省份的反向映射（用于自动识别）
const CITY_TO_PROVINCE: Record<string, string> = {};
Object.entries(CITIES_BY_PROVINCE).forEach(([province, cities]) => {
  cities.forEach(city => {
    CITY_TO_PROVINCE[city] = province;
    // 也添加不带"市"后缀的版本
    if (city.endsWith('市')) {
      CITY_TO_PROVINCE[city.replace('市', '')] = province;
    }
  });
});

// 根据输入自动识别省份和城市
const parseLocation = (input: string): { province: string; city: string } => {
  if (!input) return { province: '', city: '' };
  
  // 尝试匹配完整城市名
  if (CITY_TO_PROVINCE[input]) {
    return { province: CITY_TO_PROVINCE[input], city: input };
  }
  
  // 尝试匹配不带"市"后缀的城市
  const cityWithSuffix = input.endsWith('市') ? input : input + '市';
  if (CITY_TO_PROVINCE[cityWithSuffix]) {
    return { province: CITY_TO_PROVINCE[cityWithSuffix], city: cityWithSuffix };
  }
  
  // 检查是否是省份
  if (PROVINCES.includes(input)) {
    return { province: input, city: '' };
  }
  
  // 检查是否包含"省"或"市"分隔符
  if (input.includes('·') || input.includes(' ') || input.includes('-')) {
    const parts = input.split(/[·\s\-]/).filter(Boolean);
    if (parts.length >= 2) {
      return { province: parts[0], city: parts[1] };
    }
  }
  
  // 无法识别，返回原始输入作为城市
  return { province: '', city: input };
};

// 城市等级分类
const CITY_TIERS: Record<string, { tier: string; tierNum: number }> = {
  // 一线城市
  '北京市': { tier: '一线城市', tierNum: 1 },
  '上海市': { tier: '一线城市', tierNum: 1 },
  '广州市': { tier: '一线城市', tierNum: 1 },
  '深圳市': { tier: '一线城市', tierNum: 1 },
  // 新一线城市
  '成都市': { tier: '新一线城市', tierNum: 2 },
  '杭州市': { tier: '新一线城市', tierNum: 2 },
  '重庆市': { tier: '新一线城市', tierNum: 2 },
  '武汉市': { tier: '新一线城市', tierNum: 2 },
  '西安市': { tier: '新一线城市', tierNum: 2 },
  '苏州市': { tier: '新一线城市', tierNum: 2 },
  '天津市': { tier: '新一线城市', tierNum: 2 },
  '南京市': { tier: '新一线城市', tierNum: 2 },
  '郑州市': { tier: '新一线城市', tierNum: 2 },
  '长沙市': { tier: '新一线城市', tierNum: 2 },
  '东莞市': { tier: '新一线城市', tierNum: 2 },
  '青岛市': { tier: '新一线城市', tierNum: 2 },
  '沈阳市': { tier: '新一线城市', tierNum: 2 },
  '宁波市': { tier: '新一线城市', tierNum: 2 },
  '佛山市': { tier: '新一线城市', tierNum: 2 },
  // 二线城市
  '合肥市': { tier: '二线城市', tierNum: 3 },
  '昆明市': { tier: '二线城市', tierNum: 3 },
  '福州市': { tier: '二线城市', tierNum: 3 },
  '无锡市': { tier: '二线城市', tierNum: 3 },
  '厦门市': { tier: '二线城市', tierNum: 3 },
  '济南市': { tier: '二线城市', tierNum: 3 },
  '大连市': { tier: '二线城市', tierNum: 3 },
  '哈尔滨市': { tier: '二线城市', tierNum: 3 },
  '长春市': { tier: '二线城市', tierNum: 3 },
  '石家庄市': { tier: '二线城市', tierNum: 3 },
  '南宁市': { tier: '二线城市', tierNum: 3 },
  '贵阳市': { tier: '二线城市', tierNum: 3 },
  '南昌市': { tier: '二线城市', tierNum: 3 },
  '太原市': { tier: '二线城市', tierNum: 3 },
  '珠海市': { tier: '二线城市', tierNum: 3 },
  '中山市': { tier: '二线城市', tierNum: 3 },
  '温州市': { tier: '二线城市', tierNum: 3 },
  '烟台市': { tier: '二线城市', tierNum: 3 },
  '嘉兴市': { tier: '二线城市', tierNum: 3 },
  '绍兴市': { tier: '二线城市', tierNum: 3 },
  '台州市': { tier: '二线城市', tierNum: 3 },
  '惠州市': { tier: '二线城市', tierNum: 3 },
  '常州市': { tier: '二线城市', tierNum: 3 },
  '南通市': { tier: '二线城市', tierNum: 3 },
  '徐州市': { tier: '二线城市', tierNum: 3 },
  '潍坊市': { tier: '二线城市', tierNum: 3 },
  '保定市': { tier: '二线城市', tierNum: 3 },
  '唐山市': { tier: '二线城市', tierNum: 3 },
  '兰州市': { tier: '二线城市', tierNum: 3 },
  '海口市': { tier: '二线城市', tierNum: 3 },
  // 三线城市及其他
  '呼和浩特市': { tier: '三线城市', tierNum: 4 },
  '银川市': { tier: '三线城市', tierNum: 4 },
  '西宁市': { tier: '三线城市', tierNum: 4 },
  '拉萨市': { tier: '三线城市', tierNum: 4 },
  '乌鲁木齐市': { tier: '三线城市', tierNum: 4 },
  '湛江市': { tier: '三线城市', tierNum: 4 },
  '茂名市': { tier: '三线城市', tierNum: 4 },
  '漳州市': { tier: '三线城市', tierNum: 4 },
  '莆田市': { tier: '三线城市', tierNum: 4 },
  '泉州市': { tier: '三线城市', tierNum: 4 },
  '金华市': { tier: '三线城市', tierNum: 4 },
  '湖州市': { tier: '三线城市', tierNum: 4 },
  '衢州市': { tier: '三线城市', tierNum: 4 },
  '丽水市': { tier: '三线城市', tierNum: 4 },
  '舟山市': { tier: '三线城市', tierNum: 4 },
  '淮安市': { tier: '三线城市', tierNum: 4 },
  '盐城市': { tier: '三线城市', tierNum: 4 },
  '扬州市': { tier: '三线城市', tierNum: 4 },
  '镇江市': { tier: '三线城市', tierNum: 4 },
  '泰州市': { tier: '三线城市', tierNum: 4 },
  '连云港市': { tier: '三线城市', tierNum: 4 },
  '宿迁市': { tier: '三线城市', tierNum: 4 },
  '芜湖市': { tier: '三线城市', tierNum: 4 },
  '蚌埠市': { tier: '三线城市', tierNum: 4 },
  '淮南市': { tier: '三线城市', tierNum: 4 },
  '马鞍山市': { tier: '三线城市', tierNum: 4 },
  '淮北市': { tier: '三线城市', tierNum: 4 },
  '铜陵市': { tier: '三线城市', tierNum: 4 },
  '安庆市': { tier: '三线城市', tierNum: 4 },
  '黄山市': { tier: '三线城市', tierNum: 4 },
  '滁州市': { tier: '三线城市', tierNum: 4 },
  '阜阳市': { tier: '三线城市', tierNum: 4 },
  '宿州市': { tier: '三线城市', tierNum: 4 },
  '六安市': { tier: '三线城市', tierNum: 4 },
  '亳州市': { tier: '三线城市', tierNum: 4 },
  '池州市': { tier: '三线城市', tierNum: 4 },
  '宣城市': { tier: '三线城市', tierNum: 4 },
  '九江市': { tier: '三线城市', tierNum: 4 },
  '赣州市': { tier: '三线城市', tierNum: 4 },
  '景德镇市': { tier: '三线城市', tierNum: 4 },
  '萍乡市': { tier: '三线城市', tierNum: 4 },
  '新余市': { tier: '三线城市', tierNum: 4 },
  '鹰潭市': { tier: '三线城市', tierNum: 4 },
  '吉安市': { tier: '三线城市', tierNum: 4 },
  '宜春市': { tier: '三线城市', tierNum: 4 },
  '抚州市': { tier: '三线城市', tierNum: 4 },
  '上饶市': { tier: '三线城市', tierNum: 4 },
  '淄博市': { tier: '三线城市', tierNum: 4 },
  '枣庄市': { tier: '三线城市', tierNum: 4 },
  '东营市': { tier: '三线城市', tierNum: 4 },
  '济宁市': { tier: '三线城市', tierNum: 4 },
  '泰安市': { tier: '三线城市', tierNum: 4 },
  '威海市': { tier: '三线城市', tierNum: 4 },
  '日照市': { tier: '三线城市', tierNum: 4 },
  '临沂市': { tier: '三线城市', tierNum: 4 },
  '德州市': { tier: '三线城市', tierNum: 4 },
  '聊城市': { tier: '三线城市', tierNum: 4 },
  '滨州市': { tier: '三线城市', tierNum: 4 },
  '菏泽市': { tier: '三线城市', tierNum: 4 },
  '开封市': { tier: '三线城市', tierNum: 4 },
  '洛阳市': { tier: '三线城市', tierNum: 4 },
  '平顶山市': { tier: '三线城市', tierNum: 4 },
  '安阳市': { tier: '三线城市', tierNum: 4 },
  '鹤壁市': { tier: '三线城市', tierNum: 4 },
  '新乡市': { tier: '三线城市', tierNum: 4 },
  '焦作市': { tier: '三线城市', tierNum: 4 },
  '濮阳市': { tier: '三线城市', tierNum: 4 },
  '许昌市': { tier: '三线城市', tierNum: 4 },
  '漯河市': { tier: '三线城市', tierNum: 4 },
  '三门峡市': { tier: '三线城市', tierNum: 4 },
  '南阳市': { tier: '三线城市', tierNum: 4 },
  '商丘市': { tier: '三线城市', tierNum: 4 },
  '信阳市': { tier: '三线城市', tierNum: 4 },
  '周口市': { tier: '三线城市', tierNum: 4 },
  '驻马店市': { tier: '三线城市', tierNum: 4 },
  '襄阳市': { tier: '三线城市', tierNum: 4 },
  '宜昌市': { tier: '三线城市', tierNum: 4 },
  '黄石市': { tier: '三线城市', tierNum: 4 },
  '十堰市': { tier: '三线城市', tierNum: 4 },
  '鄂州市': { tier: '三线城市', tierNum: 4 },
  '荆门市': { tier: '三线城市', tierNum: 4 },
  '孝感市': { tier: '三线城市', tierNum: 4 },
  '荆州市': { tier: '三线城市', tierNum: 4 },
  '黄冈市': { tier: '三线城市', tierNum: 4 },
  '咸宁市': { tier: '三线城市', tierNum: 4 },
  '随州市': { tier: '三线城市', tierNum: 4 },
  '株洲市': { tier: '三线城市', tierNum: 4 },
  '湘潭市': { tier: '三线城市', tierNum: 4 },
  '衡阳市': { tier: '三线城市', tierNum: 4 },
  '邵阳市': { tier: '三线城市', tierNum: 4 },
  '岳阳市': { tier: '三线城市', tierNum: 4 },
  '常德市': { tier: '三线城市', tierNum: 4 },
  '张家界市': { tier: '三线城市', tierNum: 4 },
  '益阳市': { tier: '三线城市', tierNum: 4 },
  '郴州市': { tier: '三线城市', tierNum: 4 },
  '永州市': { tier: '三线城市', tierNum: 4 },
  '怀化市': { tier: '三线城市', tierNum: 4 },
  '娄底市': { tier: '三线城市', tierNum: 4 },
  '三亚市': { tier: '三线城市', tierNum: 4 },
  '绵阳市': { tier: '三线城市', tierNum: 4 },
  '自贡市': { tier: '三线城市', tierNum: 4 },
  '攀枝花市': { tier: '三线城市', tierNum: 4 },
  '泸州市': { tier: '三线城市', tierNum: 4 },
  '德阳市': { tier: '三线城市', tierNum: 4 },
  '广元市': { tier: '三线城市', tierNum: 4 },
  '遂宁市': { tier: '三线城市', tierNum: 4 },
  '内江市': { tier: '三线城市', tierNum: 4 },
  '乐山市': { tier: '三线城市', tierNum: 4 },
  '南充市': { tier: '三线城市', tierNum: 4 },
  '眉山市': { tier: '三线城市', tierNum: 4 },
  '宜宾市': { tier: '三线城市', tierNum: 4 },
  '广安市': { tier: '三线城市', tierNum: 4 },
  '达州市': { tier: '三线城市', tierNum: 4 },
  '雅安市': { tier: '三线城市', tierNum: 4 },
  '巴中市': { tier: '三线城市', tierNum: 4 },
  '资阳市': { tier: '三线城市', tierNum: 4 },
  '遵义市': { tier: '三线城市', tierNum: 4 },
  '六盘水市': { tier: '三线城市', tierNum: 4 },
  '安顺市': { tier: '三线城市', tierNum: 4 },
  '曲靖市': { tier: '三线城市', tierNum: 4 },
  '玉溪市': { tier: '三线城市', tierNum: 4 },
  '保山市': { tier: '三线城市', tierNum: 4 },
  '昭通市': { tier: '三线城市', tierNum: 4 },
  '丽江市': { tier: '三线城市', tierNum: 4 },
  '普洱市': { tier: '三线城市', tierNum: 4 },
  '临沧市': { tier: '三线城市', tierNum: 4 },
  '宝鸡市': { tier: '三线城市', tierNum: 4 },
  '咸阳市': { tier: '三线城市', tierNum: 4 },
  '渭南市': { tier: '三线城市', tierNum: 4 },
  '延安市': { tier: '三线城市', tierNum: 4 },
  '汉中市': { tier: '三线城市', tierNum: 4 },
  '榆林市': { tier: '三线城市', tierNum: 4 },
  '安康市': { tier: '三线城市', tierNum: 4 },
  '商洛市': { tier: '三线城市', tierNum: 4 },
};

// 省份所属区域（商业5大区划分）
const PROVINCE_REGION: Record<string, string> = {
  // 华北区：华北+东北
  '北京市': '华北区', '天津市': '华北区', '河北省': '华北区', '山西省': '华北区', '内蒙古自治区': '华北区',
  '辽宁省': '华北区', '吉林省': '华北区', '黑龙江省': '华北区',
  // 华东区
  '上海市': '华东区', '江苏省': '华东区', '浙江省': '华东区', '安徽省': '华东区', '福建省': '华东区', '江西省': '华东区', '山东省': '华东区', '台湾省': '华东区',
  // 华中区
  '河南省': '华中区', '湖北省': '华中区', '湖南省': '华中区',
  // 华南区
  '广东省': '华南区', '广西壮族自治区': '华南区', '海南省': '华南区', '香港特别行政区': '华南区', '澳门特别行政区': '华南区',
  // 西部区：西南+西北
  '重庆市': '西部区', '四川省': '西部区', '贵州省': '西部区', '云南省': '西部区', '西藏自治区': '西部区',
  '陕西省': '西部区', '甘肃省': '西部区', '青海省': '西部区', '宁夏回族自治区': '西部区', '新疆维吾尔自治区': '西部区',
};

// 获取城市等级
const getCityTier = (city: string | null): { tier: string; tierNum: number } => {
  if (!city) return { tier: '其他', tierNum: 5 };
  // 处理带"市"后缀的情况
  const cityWithSuffix = city.endsWith('市') ? city : city + '市';
  return CITY_TIERS[cityWithSuffix] || { tier: '其他', tierNum: 5 };
};

// 获取省份所属区域
const getProvinceRegion = (province: string | null): string => {
  if (!province) return '其他';
  return PROVINCE_REGION[province] || '其他';
};

interface Store {
  id: string;
  store_name: string;
  store_id: string | null;
  category: string | null;
  merchant_name: string | null;
  merchant_phone: string | null;
  province: string | null;
  city: string | null;
  address: string | null;
  business_status: string | null;
  store_level?: string | null; // 商管（文博/老蔡/老叶/美丽妈妈/其他）
  store_system?: string | null; // 门店体系（hecha/meili/mama）
  created_at: string;
  robot_configs?: RobotConfig[];
  follow_records?: FollowRecord[];
  latest_next_follow_time?: string | null;
  contacts?: Contact[];
  store_tags?: StoreTag[]; // 门店标签列表
  storeData?: StoreData | null; // 绑定的门店数据
  store_area?: string | null; // 门店面积
  staff_count?: string | null; // 员工人数
  store_images?: StoreImage[]; // 门店资料图片
  customer_channel?: string | null; // 获客渠道
  attach_date?: string | null; // 入驻日期
  // 新增字段
  business_score?: number | null; // 经营分
  new_positive_review_count?: number | null; // 新增好评数
  new_negative_review_count?: number | null; // 新增中差评数
  merchant_account?: string | null; // 商家职人号
  video_count?: number | null; // 视频数
  talent_exposure?: number | null; // 职人曝光量
  exposure_count?: number | null; // 职人曝光量（数据库字段名）
  // 抖音蓝V相关字段
  douyin_account_ids?: string | null; // 门店蓝V（抖音号ID，多个用&连接）
  douyin_video_count?: number | null; // 蓝V发布数
  douyin_video_play_count?: number | null; // 蓝V播放量
  douyin_deal_count?: number | null; // 蓝V成交
}

interface Contact {
  id: string;
  store_id: string;
  name: string | null;
  position: string | null;
  phone: string | null;
  wechat: string | null;
  wecom_id: string | null;
  remark: string | null;
  is_primary: boolean;
  created_at: string;
  updated_at?: string;
}

interface StoreImage {
  id: string;
  store_id: string;
  image_key: string;
  image_url: string;
  created_at: string;
}

interface RobotConfig {
  id: string;
  store_id: string;
  webhook_url: string;
  robot_name: string | null;
  description: string | null;
  is_active: boolean;
  created_at: string;
}

interface FollowRecord {
  id: string;
  store_id: string;
  follow_time: string;
  remark: string | null;
  ai_analysis: string | null;
  next_follow_time: string | null;
  created_at: string;
  images: FollowImage[];
}

interface FollowImage {
  id: string;
  follow_record_id: string;
  image_key: string;
  image_url: string;
}

// 门店标签接口
interface StoreTag {
  id: string;
  store_id: string;
  tag_name: string;
  tag_color: string;
  created_at: string;
}

// 门店分组接口
interface StoreGroup {
  id: string;
  group_name: string;
  remark: string | null;
  store_ids: string; // 逗号分隔的门店ID
  store_system: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// 标签预设接口
interface TagPreset {
  id: string;
  tag_name: string;
  tag_color: string;
  sort_order: number;
  is_active: boolean;
}

// 操作日志接口
interface OperationLog {
  id: string;
  user_id: string;
  user_name: string | null;
  operation_type: string;
  resource_type: string;
  resource_id: string | null;
  resource_name: string | null;
  detail: string | null;
  store_system: string;
  created_at: string;
}

// 文件信息接口
interface FileInfo {
  fileName: string;
  minTime: string; // 最早时间
  maxTime: string; // 最晚时间
}

// 门店数据接口（数据模式下的统计数据）
interface StoreData {
  // 数量类字段
  adInvestment: number;         // 广告投入
  totalOrders: number;          // 订单数
  adOrders: number;             // 广告订单数
  adOrdersRate: string;         // 广告订单数占比
  fakeOrders: number;           // 刷单数
  validOrders: number;          // 有效订单数（订单实收 > 10元，不包含10元）
  refundCount: number | null;   // 退款数
  unverifiedCount: number;      // 未核销数
  verifyCount: number;          // 核销数
  fakeVerifyCount: number;      // 刷单核销数（核销金额 ≤ 10元，包含10元）
  validVerifyCount: number;     // 有效核销数（核销金额 > 10元，不包含10元）
  verifyRate: string;           // 核销率
  validVerifyRate: string;      // 有效核销率（有效核销数 / 有效订单数 × 100%）
  // 金额类字段
  totalAmount: number;          // 成交金额（订单实收金额合计）
  fakeAmount: number;           // 刷单金额（订单实收 ≤ 10元的订单金额合计）
  validOrderAmount: number;     // 有效订单金额（订单实收 > 10元的订单金额合计）
  refundAmount: number | null;  // 退款金额
  unverifiedAmount: number;     // 未核销金额
  verifyAmount: number;         // 核销金额
  fakeVerifyAmount: number;     // 刷单核销金额（核销金额 ≤ 10元的核销金额合计）
  validVerifyAmount: number;    // 有效核销金额（核销金额 > 10元的核销金额合计）
  amountVerifyRate: string;     // 金额核销率（核销金额 / 成交金额 × 100%）
  validAmountRate: string;      // 有效金额率（有效核销金额 / 有效订单金额 × 100%）
  // 文件状态标识
  hasOrderFile: boolean;
  hasVerifyFile: boolean;
  hasRefundFile: boolean;
  hasAdFile: boolean;
}

// 创建完整的metrics对象（用于合计数据的季度、月度、日数据计算）
function createFullMetrics() {
  return {
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
    adOrders: 0,
  };
}

export default function StoreList({ 
  externalSearch,
  showAddModal: externalShowAddModal,
  showBatchModal: externalShowBatchModal,
  showBatchContactModal: externalShowBatchContactModal,
  showDeleteModal: externalShowDeleteModal,
  showAiConfigModal: externalShowAiConfigModal,
  showOperationLogsModal: externalShowOperationLogsModal,
  onCloseAddModal,
  onCloseBatchModal,
  onCloseBatchContactModal,
  onCloseDeleteModal,
  onCloseAiConfigModal,
  onCloseOperationLogsModal,
  isDataMode: externalIsDataMode,
  onIsDataModeChange,
  currentSystem = 'mama',
  refreshTrigger = 0,
  // 智能筛选回调 - 用于更新 Dashboard 中的状态
  onAiFilterQueryChange,
  onAiFilterCountChange,
  onIsAiFilteringChange,
  onAiFilterCallbackRef,
  onClearAiFilterCallbackRef,
  externalAiFilterQuery, // 接收外部的查询值
  // 高级筛选器相关
  showAdvancedFilter,
  onCloseAdvancedFilter,
  onAdvancedFilterCallbackRef,
  onApplyAdvancedFilter,
  // 重置筛选回调
  onResetFiltersCallbackRef,
}: { 
  externalSearch?: string;
  refreshTrigger?: number;
  showAddModal?: boolean;
  showBatchModal?: boolean;
  showBatchContactModal?: boolean;
  showDeleteModal?: boolean;
  showAiConfigModal?: boolean;
  showOperationLogsModal?: boolean;
  onCloseAddModal?: () => void;
  onCloseBatchModal?: () => void;
  onCloseBatchContactModal?: () => void;
  onCloseDeleteModal?: () => void;
  onCloseAiConfigModal?: () => void;
  onCloseOperationLogsModal?: () => void;
  isDataMode?: boolean;
  onIsDataModeChange?: (isDataMode: boolean) => void;
  currentSystem?: StoreSystem;
  // 智能筛选回调
  onAiFilterQueryChange?: (value: string) => void;
  onAiFilterCountChange?: (count: number) => void;
  onIsAiFilteringChange?: (value: boolean) => void;
  onAiFilterCallbackRef?: (callback: (() => void) | null) => void;
  onClearAiFilterCallbackRef?: (callback: (() => void) | null) => void;
  externalAiFilterQuery?: string; // 接收外部的查询值
  // 高级筛选器相关
  showAdvancedFilter?: boolean;
  onCloseAdvancedFilter?: () => void;
  onAdvancedFilterCallbackRef?: (callback: ((filters: Array<{ field: string; operator: string; value: string | number }>) => void) | null) => void;
  onApplyAdvancedFilter?: (filters: Array<{ field: string; operator: string; value: string | number }>) => void;
  // 重置筛选回调
  onResetFiltersCallbackRef?: (callback: (() => void) | null) => void;
}) {
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingMessage, setLoadingMessage] = useState('正在加载数据...');
  const [search, setSearch] = useState('');
  const [internalShowAddModal, setInternalShowAddModal] = useState(false);
  const [internalShowBatchModal, setInternalShowBatchModal] = useState(false);
  const [internalShowBatchContactModal, setInternalShowBatchContactModal] = useState(false);
  const [internalShowDeleteStoreModal, setInternalShowDeleteStoreModal] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 更新单个门店的函数 - 用于可编辑单元格保存后直接更新本地状态
  const updateStore = useCallback((storeId: string, updates: Partial<Store>) => {
    setStores(prevStores => 
      prevStores.map(store => 
        store.id === storeId ? { ...store, ...updates } : store
      )
    );
  }, []);

  // 合并内部和外部控制的弹窗状态
  const showAddModalState = externalShowAddModal ?? internalShowAddModal;
  const showBatchModalState = externalShowBatchModal ?? internalShowBatchModal;
  const showBatchContactModalState = externalShowBatchContactModal ?? internalShowBatchContactModal;
  const showDeleteStoreModalState = externalShowDeleteModal ?? internalShowDeleteStoreModal;

  // 同步外部搜索状态
  useEffect(() => {
    if (externalSearch !== undefined) {
      setSearch(externalSearch);
    }
  }, [externalSearch]);

  // 监听 refreshTrigger 变化，刷新数据
  useEffect(() => {
    if (refreshTrigger !== undefined) {
      handleRefresh();
    }
  }, [refreshTrigger]);

  // 门店详情弹窗状态
  const [storeDetailModal, setStoreDetailModal] = useState<{
    isOpen: boolean;
    storeId: string;
    storeName?: string;
    storeData?: any;
    hideTags?: boolean;
  }>({
    isOpen: false,
    storeId: '',
  });

  // 多选状态
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);
  
  // 跟进时间筛选
  const [followTimeFilter, setFollowTimeFilter] = useState<'all' | 'today' | 'overdue' | 'pending' | 'noTime'>('all');
  
  // 类别筛选
  const [levelFilter, setLevelFilter] = useState<string>('all');
  
  // 服务状态筛选
  const [businessStatusFilter, setBusinessStatusFilter] = useState<string>('all');

  // 经营分筛选
  const [businessScoreFilter, setBusinessScoreFilter] = useState<string>('all');

  // 隐藏取消合作门店开关
  const [hideCancelledStores, setHideCancelledStores] = useState(false);
  
  // 隐藏标签开关（默认false，显示标签，从 localStorage 读取持久化状态）
  const [hideTags, setHideTags] = useState(() => {
    const saved = localStorage.getItem('hideTags');
    // 强制默认显示标签，忽略 localStorage 中的值
    // 如果需要隐藏，用户需要主动点击眼睛按钮
    return false;
  });
  
  // 下次跟进时间日期筛选
  const [nextFollowDateStart, setNextFollowDateStart] = useState('');
  const [nextFollowDateEnd, setNextFollowDateEnd] = useState('');
  
  // 智能时间输入（下次跟进筛选）
  const [smartTimeInput, setSmartTimeInput] = useState('');
  
  // 统一排序状态（切换视图时保持排序不变）
  // sortField: 'nextFollowTime' | 数据字段名 | ''（不排序）
  const [sortField, setSortField] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // 门店信息/门店数据模式切换：使用外部传入的状态
  const isDataMode = externalIsDataMode ?? false;
  
  // 数据模式下的标签页：配合/订单/业绩
  const [dataTab, setDataTab] = useState<'cooperation' | 'order' | 'performance'>('order');

  // 数据时间筛选
  const [dataTimeStart, setDataTimeStart] = useState('');
  const [dataTimeEnd, setDataTimeEnd] = useState('');
  const [dataTimeQuick, setDataTimeQuick] = useState<'all' | 'today' | 'yesterday' | 'dayBeforeYesterday' | 'last3Days' | 'last7Days' | 'last30Days' | 'last90Days' | 'thisMonth' | 'thisMonthExceptToday' | 'lastMonth' | 'twoMonthsAgo' | 'last3Months' | 'thisYear'>('all');

  // 主页加载时自动点击"本月"
  useEffect(() => {
    setDataTimeQuick('thisMonth');
  }, []);

  // 智能时间输入（数据时间筛选）
  const [smartDataTimeInput, setSmartDataTimeInput] = useState('');

  // 标签筛选（多选，且关系）- 从 localStorage 恢复
  const [selectedTagFilters, setSelectedTagFilters] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(`selectedTagFilters_${currentSystem}`);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            return parsed;
          }
        }
      } catch (e) {
        console.warn('恢复标签筛选状态失败:', e);
      }
    }
    return [];
  });

  // 标签筛选关系（且/或）- 从 localStorage 恢复
  const [tagFilterRelation, setTagFilterRelation] = useState<'AND' | 'OR'>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(`tagFilterRelation_${currentSystem}`);
        if (saved === 'AND' || saved === 'OR') {
          return saved;
        }
      } catch (e) {
        console.warn('恢复标签筛选关系失败:', e);
      }
    }
    return 'OR';
  });

  // 分组相关状态
  const [storeGroups, setStoreGroups] = useState<StoreGroup[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string>('');
  const [showGroupDropdown, setShowGroupDropdown] = useState(false);
  const [showGroupManageModal, setShowGroupManageModal] = useState(false);

  // 分组反向索引：storeId -> StoreGroup[]
  const storeGroupMap = useMemo(() => {
    const map = new Map<string, StoreGroup[]>();
    storeGroups.forEach(group => {
      const ids = group.store_ids.split(',').map(s => s.trim()).filter(Boolean);
      ids.forEach(sid => {
        const existing = map.get(sid) || [];
        existing.push(group);
        map.set(sid, existing);
      });
    });
    return map;
  }, [storeGroups]);

  // 加载分组数据
  const fetchStoreGroups = useCallback(async () => {
    try {
      const res = await fetch(`/api/store-groups?store_system=${currentSystem}`, { cache: 'no-store' });
      const data = await res.json();
      if (data.success) {
        setStoreGroups(data.data || []);
      }
    } catch (err) {
      console.error('加载分组数据失败:', err);
    }
  }, [currentSystem]);

  // 页面加载时获取分组数据
  useEffect(() => {
    setActiveGroupId('');
    fetchStoreGroups();
  }, [currentSystem]);

  // 默认标签预设（从常量文件导入）
  const DEFAULT_TAG_PRESETS: TagPreset[] = PRESET_TAGS.map(p => ({
    id: `default-${p.tag_name}`,
    tag_name: p.tag_name,
    tag_color: p.tag_color,
    sort_order: p.sort_order,
    is_active: true
  }));
  
  // 获取标签预设（带重试机制，失败时使用默认预设）
  const [tagPresets, setTagPresets] = useState<TagPreset[]>(DEFAULT_TAG_PRESETS);
  const tagPresetsLoadedRef = useRef(false);

  useEffect(() => {
    const fetchPresets = async () => {
      try {
        const res = await fetch('/api/tag-presets');
        if (res.ok) {
          const data = await res.json();
          if (data.data && data.data.length > 0) {
            setTagPresets(data.data);
          }
        }
      } catch (error) {
        console.warn('获取标签预设失败，使用默认预设');
      }
      tagPresetsLoadedRef.current = true;
    };
    
    // 延迟加载
    const timer = setTimeout(fetchPresets, 100);
    return () => clearTimeout(timer);
  }, []);

  // 标签筛选下拉显示状态
  const [showTagDropdown, setShowTagDropdown] = useState(false);

  // 标签等级筛选（SABCC）
  const [selectedTagLevel, setSelectedTagLevel] = useState<'all' | 'S' | 'A' | 'B' | 'C' | 'C-' | 'meili' | 'direct' | 'empty'>('all');
  
  // 计算每个等级的门店数量
  const tagLevelCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: stores.length,
      S: 0,
      A: 0,
      B: 0,
      C: 0,
      'C-': 0,
      meili: 0,
      direct: 0,
      empty: 0
    };
    
    stores.forEach(store => {
      // S:核心店
      if (store.store_tags?.some(tag => tag.tag_name === 'S:核心店')) {
        counts.S++;
      }
      // A:重点店
      if (store.store_tags?.some(tag => tag.tag_name === 'A:重点店')) {
        counts.A++;
      }
      // B:一般店
      if (store.store_tags?.some(tag => tag.tag_name === 'B:一般店')) {
        counts.B++;
      }
      // C:关注店
      if (store.store_tags?.some(tag => tag.tag_name === 'C:关注店')) {
        counts.C++;
      }
      // C-:问题店
      if (store.store_tags?.some(tag => tag.tag_name === 'C-:问题店')) {
        counts['C-']++;
      }
      // 美丽妈妈
      if (store.store_tags?.some(tag => tag.tag_name === '美丽妈妈')) {
        counts.meili++;
      }
      // 直营店
      if (store.store_tags?.some(tag => tag.tag_name === '直营店')) {
        counts.direct++;
      }
      // 空
      if (!store.store_tags || store.store_tags.length === 0) {
        counts.empty++;
      }
    });
    
    return counts;
  }, [stores]);

  // 保存标签筛选状态到 localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(`selectedTagFilters_${currentSystem}`, JSON.stringify(selectedTagFilters));
        localStorage.setItem(`tagFilterRelation_${currentSystem}`, tagFilterRelation);
      } catch (e) {
        console.warn('保存标签筛选状态失败:', e);
      }
    }
  }, [selectedTagFilters, tagFilterRelation, currentSystem]);

  // AI智能筛选
  const [aiFilterQuery, setAiFilterQuery] = useState('');
  const aiFilterQueryRef = useRef('');
  const [aiFilters, setAiFilters] = useState<Array<{ field: string; operator: string; value: string | number; description?: string }>>([]);
  const [aiFilterExplanation, setAiFilterExplanation] = useState('');
  const [isAiFiltering, setIsAiFiltering] = useState(false);

  // 同步 ref 值
  useEffect(() => {
    aiFilterQueryRef.current = aiFilterQuery;
  }, [aiFilterQuery]);

  // 同步外部查询值（来自 Dashboard 的智能筛选输入）
  useEffect(() => {
    if (externalAiFilterQuery !== undefined && externalAiFilterQuery !== aiFilterQuery) {
      setAiFilterQuery(externalAiFilterQuery);
      aiFilterQueryRef.current = externalAiFilterQuery;
    }
  }, [externalAiFilterQuery]);

  // 点击外部关闭标签筛选下拉
  useEffect(() => {
    if (!showTagDropdown) return;
    
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('#tag-filter-dropdown') && !target.closest('.tag-filter-button')) {
        setShowTagDropdown(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showTagDropdown]);

  // 全局关闭弹窗（Command+Z / Ctrl+Z / Escape）
  useEffect(() => {
    const handleGlobalClose = () => {
      // 关闭所有弹窗 - 使用 startTransition 避免卡顿
      startTransition(() => {
        setStoreDetailModal(prev => ({ ...prev, isOpen: false }));
        setInternalShowAddModal(false);
        setInternalShowBatchModal(false);
        setInternalShowBatchContactModal(false);
        setInternalShowDeleteStoreModal(false);
        setShowRobotModal(null);
        setShowFollowModal(null);
        setShowFollowViewModal(null);
        setShowAiConfigModal(false);
        setShowUnmatchedDetailsModal(null);
        setShowTotalDetailsModal(false);
        setShowChannelModal(false);
        setShowAllChannelModal(false);
        setShowAdUploadModal(false);
        setShowDataUploadModal(false);
        setShowDeleteConfirm(null);
        setShowTagDropdown(false);
      });
    };

    window.addEventListener('global-close-modal', handleGlobalClose);
    return () => window.removeEventListener('global-close-modal', handleGlobalClose);
  }, []);

  // 更新 Dashboard 中的筛选状态
  useEffect(() => {
    onAiFilterCountChange?.(aiFilters.length);
  }, [aiFilters.length]);

  useEffect(() => {
    onIsAiFilteringChange?.(isAiFiltering);
  }, [isAiFiltering]);

  // 预加载的聚合统计数据
  const orderDataRef = useRef<OrderAggregatedData | null>(null);
  const verifyDataRef = useRef<VerifyAggregatedData | null>(null);
  const refundDataRef = useRef<RefundAggregatedData | null>(null);
  const adDataRef = useRef<AdAggregatedData | null>(null);
  // 门店数据 ref，避免 useCallback 依赖 stores 数组
  const storesRef = useRef<Store[]>([]);

  // 合计数据缓存 ref（性能优化：预缓存合计数据，避免每次筛选都重新计算）
  const totalDataCacheRef = useRef<{
    daily: any[];
    monthly: any[];
    quarterly: any[];
  } | null>(null);

  // 数据版本号，用于强制刷新数据视图
  const [dataVersion, setDataVersion] = useState(0);
  // 数据刷新键，用于触发数据重新加载
  const [dataRefreshKey, setDataRefreshKey] = useState(0);

  // 初始化加载数据（直接从数据库加载）
  // 注意：依赖 stores.length 确保门店数据加载完成后再加载聚合数据
  useEffect(() => {
    // 等待门店数据加载完成
    if (stores.length === 0) return;
    
    const loadAllData = async () => {
      console.log('[数据加载] 开始加载订单、核销、退款、广告数据，门店数:', stores.length);
      try {
        // 并行加载所有数据
        const [orderRes, verifyRes, refundRes, adRes] = await Promise.all([
          fetch(`/api/order-records?store_system=${currentSystem}&aggregate=true`),
          fetch(`/api/verify-records?store_system=${currentSystem}&aggregate=true`),
          fetch(`/api/refund-records?store_system=${currentSystem}&aggregate=true`),
          fetch(`/api/ad-expense/store-stats?store_system=${currentSystem}`)
        ]);

        // 处理订单数据
        if (orderRes.ok) {
          const orderResult = await orderRes.json();
          if (orderResult.success && orderResult.storeStats) {
            orderDataRef.current = orderResult as OrderAggregatedData;
            if (orderResult.timeRange?.minTime && orderResult.timeRange?.maxTime) {
              setOrderFileInfo({
                fileName: '数据库',
                minTime: orderResult.timeRange.minTime,
                maxTime: orderResult.timeRange.maxTime
              });
            }
          }
        }

        // 处理核销数据
        if (verifyRes.ok) {
          const verifyResult = await verifyRes.json();
          if (verifyResult.success && verifyResult.storeStats) {
            verifyDataRef.current = verifyResult as VerifyAggregatedData;
            if (verifyResult.timeRange?.minTime && verifyResult.timeRange?.maxTime) {
              setVerifyFileInfo({
                fileName: '数据库',
                minTime: verifyResult.timeRange.minTime,
                maxTime: verifyResult.timeRange.maxTime
              });
            }
          }
        }

        // 处理退款数据
        if (refundRes.ok) {
          const refundResult = await refundRes.json();
          if (refundResult.success && refundResult.storeStats) {
            refundDataRef.current = refundResult as RefundAggregatedData;
            if (refundResult.timeRange?.minTime && refundResult.timeRange?.maxTime) {
              setRefundFileInfo({
                fileName: '数据库',
                minTime: refundResult.timeRange.minTime,
                maxTime: refundResult.timeRange.maxTime
              });
            }
          }
        }

        // 处理广告数据
        if (adRes.ok) {
          const adResult = await adRes.json();
          if (adResult.success && adResult.storeStats) {
            adDataRef.current = adResult as AdAggregatedData;
            console.log('[广告数据加载] 完成，门店数:', Object.keys(adResult.storeStats).length, 'totalSpend:', adResult.stats?.totalSpend);
          }
        }

        // 触发数据刷新
        storeDataCacheRef.current.clear();
        // 清除合计数据缓存，触发重新计算
        totalDataCacheRef.current = null;
        setDataRefreshKey(prev => prev + 1);
        setDataVersion(prev => prev + 1);
        console.log('[数据加载] 订单、核销、退款、广告数据加载完成，dataRefreshKey 已更新');
      } catch (err) {
        console.error('从数据库加载数据失败:', err);
      }
    };
    
    loadAllData();
  }, [currentSystem, stores.length]);

  // 初始化数据时间筛选为本月
  useEffect(() => {
    if (dataTimeQuick === 'thisMonth' && (!dataTimeStart || !dataTimeEnd)) {
      const { start, end } = getDateRange('thisMonth');
      setDataTimeStart(start);
      setDataTimeEnd(end);
    }
  }, [dataTimeQuick]);

  // 门店数据计算缓存
  const storeDataCacheRef = useRef<Map<string, any>>(new Map());
  // 旧数据缓存（预计算过程中使用，用于保持显示旧数据）
  const oldStoreDataCacheRef = useRef<Map<string, any>>(new Map());

  // 性能优化：门店数据绑定版本号
  // 只有数据时间范围或数据刷新时才更新版本号，避免筛选条件变化时重新绑定
  const storeBindVersionRef = useRef(0);
  useEffect(() => {
    storeBindVersionRef.current += 1;
    console.log('[门店数据绑定] 版本号更新:', storeBindVersionRef.current, '时间范围:', dataTimeStart, dataTimeEnd);
  }, [dataTimeStart, dataTimeEnd, dataRefreshKey]);
  
  // 预计算门店数据的存储（用于 storesWithBindData）
  const precomputedStoreDataRef = useRef<Map<string, any>>(new Map());
  
  // 预计算状态（用于追踪异步预计算进度）
  const [isPrecomputing, setIsPrecomputing] = useState(false);
  const [isDataReady, setIsDataReady] = useState(true); // 数据是否已准备好显示

  // 性能优化：合计数据缓存管理
  // 当数据加载完成后，计算并缓存合计数据（日、月、季）
  // 这样后续的筛选操作不会触发重新计算，大幅提升性能
  useEffect(() => {
    // 只有数据准备好且缓存不存在时才计算
    if (!isDataReady || totalDataCacheRef.current !== null) {
      return;
    }

    console.log('[合计数据缓存] 开始计算并缓存合计数据');

    // 触发合计数据计算（通过临时增加 dataRefreshKey）
    // 这里不直接计算，而是让 useMemo 在下次渲染时计算并存储结果
    // 由于有缓存检查，只有第一次会计算
  }, [isDataReady]);

  // 时间范围变化时清除合计数据缓存
  useEffect(() => {
    console.log('[合计数据缓存] 时间范围变化，清除缓存', dataTimeStart, dataTimeEnd);
    totalDataCacheRef.current = null;
  }, [dataTimeStart, dataTimeEnd]);

  // 预计算临时存储（计算过程中使用，计算完成后才更新到 precomputedStoreDataRef）
  const tempPrecomputedDataRef = useRef<Map<string, any>>(new Map());
  
  // 预计算所有门店数据（异步分片执行，避免阻塞UI）
  const precomputeAllStoreData = useCallback(() => {
    const currentStores = storesRef.current;
    if (!currentStores.length) return;
    
    const orderData = orderDataRef.current;
    const verifyData = verifyDataRef.current;
    const refundData = refundDataRef.current;
    const adData = adDataRef.current;
    
    // 判断文件是否存在
    const hasOrderFile = orderData !== null && Object.keys(orderData.storeStats).length > 0;
    const hasVerifyFile = verifyData !== null && Object.keys(verifyData.storeStats).length > 0;
    const hasRefundFile = refundData !== null && Object.keys(refundData.storeStats).length > 0;
    const hasAdFile = adData !== null && Object.keys(adData.storeStats).length > 0;
    
    // 如果所有文件都不存在，跳过预计算
    if (!hasOrderFile && !hasVerifyFile && !hasRefundFile && !hasAdFile) {
      precomputedStoreDataRef.current.clear();
      tempPrecomputedDataRef.current.clear();
      return;
    }
    
    // 时间筛选辅助函数
    const isInRange = (dateStr: string, start: string, end: string) => {
      if (!start && !end) return true;
      const date = dateStr?.split(' ')[0] || dateStr;
      if (!date) return false;
      if (start && date < start) return false;
      if (end && date > end) return false;
      return true;
    };
    
    // 使用 requestIdleCallback 分片执行，避免阻塞 UI
    const scheduleIdleCallback = window.requestIdleCallback || ((cb: IdleRequestCallback) => setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 50 }), 1));
    
    setIsPrecomputing(true);
    
    // 分批处理的批次大小
    const BATCH_SIZE = 100;
    const storesToProcess = currentStores.filter(s => s.store_id);
    let processedCount = 0;
    
    const processBatch = () => {
      const batch = storesToProcess.slice(processedCount, processedCount + BATCH_SIZE);
      
      for (const store of batch) {
        const storeId = store.store_id;
        if (!storeId) continue;
        
        const cacheKey = `${storeId}|${dataTimeStart || ''}|${dataTimeEnd || ''}`;
        
        // 检查缓存
        const cached = storeDataCacheRef.current.get(cacheKey);
        if (cached !== undefined) {
          // 写入临时存储，不是正式存储
          tempPrecomputedDataRef.current.set(storeId, cached);
          continue;
        }
      
      // ========== 数量类字段 ==========
      let adInvestment = 0;
      let adOrders = 0;
      
      if (adData && adData.storeStats[storeId]) {
        const storeAdStats = adData.storeStats[storeId];
        if (dataTimeStart || dataTimeEnd) {
          for (const [date, stats] of Object.entries(storeAdStats.dailyStats)) {
            if (isInRange(date, dataTimeStart || '', dataTimeEnd || '')) {
              adInvestment += stats.spend;
              adOrders += stats.orders;
            }
          }
        } else {
          adInvestment = storeAdStats.totalSpend;
          adOrders = storeAdStats.totalOrders;
        }
      }
      
      let totalOrders = 0;
      let fakeOrders = 0;
      let validOrders = 0;
      let unverifiedCount = 0;
      
      if (orderData && orderData.storeStats[storeId]) {
        const storeOrderStats = orderData.storeStats[storeId];
        if (dataTimeStart || dataTimeEnd) {
          for (const [date, stats] of Object.entries(storeOrderStats.dailyStats)) {
            if (isInRange(date, dataTimeStart || '', dataTimeEnd || '')) {
              totalOrders += stats.orderCount;
              fakeOrders += stats.fakeOrderCount;
              validOrders += (stats as any).validOrderCount || 0;
            }
          }
        } else {
          totalOrders = storeOrderStats.totalOrderCount;
          fakeOrders = storeOrderStats.totalFakeOrderCount;
          validOrders = (storeOrderStats as any).totalValidOrderCount || 0;
        }
        unverifiedCount = storeOrderStats.totalUnverifiedCount;
      }
      
      let verifyCount = 0;
      let fakeVerifyCount = 0;
      let validVerifyCount = 0;

      if (verifyData && verifyData.storeStats[storeId]) {
        const storeVerifyStats = verifyData.storeStats[storeId];
        if (dataTimeStart || dataTimeEnd) {
          for (const [date, stats] of Object.entries(storeVerifyStats.dailyStats)) {
            if (isInRange(date, dataTimeStart || '', dataTimeEnd || '')) {
              verifyCount += stats.verifyCount;
              fakeVerifyCount += (stats as any).fakeVerifyCount || 0;
              validVerifyCount += (stats as any).validVerifyCount || 0;
            }
          }
        } else {
          verifyCount = storeVerifyStats.totalVerifyCount;
          for (const stats of Object.values(storeVerifyStats.dailyStats)) {
            fakeVerifyCount += (stats as any).fakeVerifyCount || 0;
            validVerifyCount += (stats as any).validVerifyCount || 0;
          }
        }
      }
      
      let refundCount: number | null;
      if (hasRefundFile && refundData) {
        const storeRefundStats = refundData.storeStats[storeId];
        if (storeRefundStats) {
          if (dataTimeStart || dataTimeEnd) {
            refundCount = 0;
            for (const [date, stats] of Object.entries(storeRefundStats.dailyStats)) {
              if (isInRange(date, dataTimeStart || '', dataTimeEnd || '')) {
                refundCount += stats.refundCount;
              }
            }
          } else {
            refundCount = storeRefundStats.totalRefundCount;
          }
        } else {
          refundCount = 0;
        }
      } else {
        refundCount = null;
      }
      
      const verifyRate = totalOrders > 0 ? (verifyCount / totalOrders * 100).toFixed(2) : '0';
      const validVerifyRate = validOrders > 0 ? (validVerifyCount / validOrders * 100).toFixed(2) : '0';
      
      // ========== 金额类字段 ==========
      let totalAmount = 0;      // 成交金额（订单实收金额合计）
      let fakeAmount = 0;       // 刷单金额（订单实收 ≤ 10元的订单金额合计）
      let validOrderAmount = 0; // 有效订单金额（订单实收 > 10元的订单金额合计）
      let unverifiedAmount = 0;
      
      if (orderData && orderData.storeStats[storeId]) {
        const storeOrderStats = orderData.storeStats[storeId];
        if (dataTimeStart || dataTimeEnd) {
          for (const [date, stats] of Object.entries(storeOrderStats.dailyStats)) {
            if (isInRange(date, dataTimeStart || '', dataTimeEnd || '')) {
              totalAmount += stats.orderAmount || 0;
              fakeAmount += stats.fakeOrderAmount || 0;
              validOrderAmount += stats.validOrderAmount || 0; // 有效订单金额
              unverifiedAmount += stats.unverifiedAmount || 0;
            }
          }
        } else {
          totalAmount = storeOrderStats.totalOrderAmount || 0;
          fakeAmount = storeOrderStats.totalFakeOrderAmount || 0;
          validOrderAmount = (storeOrderStats as any).totalValidOrderAmount || (totalAmount - fakeAmount); // 有效订单金额
          unverifiedAmount = storeOrderStats.totalUnverifiedAmount || 0;
        }
      }
      
      // 核销金额、刷单核销金额、有效核销金额
      let verifyAmount = 0;
      let fakeVerifyAmount = 0;  // 刷单核销金额（核销金额 ≤ 10元）
      let validVerifyAmount = 0; // 有效核销金额（核销金额 > 10元）
      
      if (verifyData && verifyData.storeStats[storeId]) {
        const storeVerifyStats = verifyData.storeStats[storeId];
        if (dataTimeStart || dataTimeEnd) {
          for (const [date, stats] of Object.entries(storeVerifyStats.dailyStats)) {
            if (isInRange(date, dataTimeStart || '', dataTimeEnd || '')) {
              verifyAmount += stats.verifyAmount || 0;
              fakeVerifyAmount += (stats as any).fakeVerifyAmount || 0;
              validVerifyAmount += (stats as any).validVerifyAmount || 0;
            }
          }
        } else {
          verifyAmount = storeVerifyStats.totalVerifyAmount || 0;
          // 从每日统计中累加
          for (const stats of Object.values(storeVerifyStats.dailyStats)) {
            fakeVerifyAmount += (stats as any).fakeVerifyAmount || 0;
            validVerifyAmount += (stats as any).validVerifyAmount || 0;
          }
        }
      }
      
      let refundAmount: number | null = null;
      if (hasRefundFile && refundData) {
        const storeRefundStats = refundData.storeStats[storeId];
        if (storeRefundStats) {
          if (dataTimeStart || dataTimeEnd) {
            refundAmount = 0;
            for (const [date, stats] of Object.entries(storeRefundStats.dailyStats)) {
              if (isInRange(date, dataTimeStart || '', dataTimeEnd || '')) {
                refundAmount += stats.refundAmount || 0;
              }
            }
          } else {
            refundAmount = storeRefundStats.totalRefundAmount || 0;
          }
        } else {
          refundAmount = 0;
        }
      }
      
      const amountVerifyRate = totalAmount > 0 ? (verifyAmount / totalAmount * 100).toFixed(2) : '0';
      const validAmountRate = validOrderAmount > 0 ? (validVerifyAmount / validOrderAmount * 100).toFixed(2) : '0';
      const adOrdersRate = totalOrders > 0 ? (adOrders / totalOrders * 100).toFixed(2) : '0';
      
      const result = {
        adInvestment,
        totalOrders,
        adOrders,
        adOrdersRate,
        fakeOrders,
        validOrders,
        refundCount,
        unverifiedCount,
        verifyCount,
        fakeVerifyCount,
        validVerifyCount,
        verifyRate,
        validVerifyRate,
        // 金额类字段（number 类型）
        totalAmount,
        fakeAmount,
        validOrderAmount,
        refundAmount,
        unverifiedAmount,
        verifyAmount,
        fakeVerifyAmount,
        validVerifyAmount,
        amountVerifyRate,
        validAmountRate,
        hasOrderFile,
        hasVerifyFile,
        hasRefundFile,
        hasAdFile,
      };
      
      storeDataCacheRef.current.set(cacheKey, result);
      // 写入临时存储，不是正式存储
      tempPrecomputedDataRef.current.set(storeId, result);
      }

      processedCount += batch.length;

      // 如果还有未处理的门店，继续分片处理
      if (processedCount < storesToProcess.length) {
        scheduleIdleCallback(processBatch);
      } else {
        // 所有门店处理完成，将临时存储一次性复制到正式存储
        precomputedStoreDataRef.current.clear();
        tempPrecomputedDataRef.current.forEach((value, key) => {
          precomputedStoreDataRef.current.set(key, value);
        });
        tempPrecomputedDataRef.current.clear();
        oldStoreDataCacheRef.current.clear(); // 清除旧缓存
        setIsPrecomputing(false);
        setIsDataReady(true); // 数据已准备好
        // 触发数据刷新，确保UI显示最新数据
        setDataRefreshKey(prev => prev + 1);
      }
    };
    
    // 开始异步分片处理
    setIsPrecomputing(true);
    setIsDataReady(false); // 数据未准备好
    // 保存当前缓存到旧缓存
    oldStoreDataCacheRef.current.clear();
    storeDataCacheRef.current.forEach((value, key) => {
      oldStoreDataCacheRef.current.set(key, value);
    });
    // 清空临时存储
    tempPrecomputedDataRef.current.clear();
    scheduleIdleCallback(processBatch);
  }, [dataTimeStart, dataTimeEnd, dataVersion]);
  
  // 清理缓存（当数据版本或门店体系变化时）并触发预计算
  useEffect(() => {
    storeDataCacheRef.current.clear();
    precomputedStoreDataRef.current.clear();
    // 清理后重新预计算
    precomputeAllStoreData();
  }, [dataVersion, currentSystem, dataTimeStart, dataTimeEnd, precomputeAllStoreData]);

  // 刷新数据（从数据库重新加载）
  const handleRefreshFromDatabase = useCallback(async () => {
    try {
      // 并行重新加载所有数据
      const [orderRes, verifyRes, refundRes] = await Promise.all([
        fetch(`/api/order-records?store_system=${currentSystem}&aggregate=true`),
        fetch(`/api/verify-records?store_system=${currentSystem}&aggregate=true`),
        fetch(`/api/refund-records?store_system=${currentSystem}&aggregate=true`)
      ]);

      // 处理订单数据
      if (orderRes.ok) {
        const orderResult = await orderRes.json();
        if (orderResult.success && orderResult.storeStats) {
          orderDataRef.current = orderResult as OrderAggregatedData;
          if (orderResult.timeRange?.minTime && orderResult.timeRange?.maxTime) {
            setOrderFileInfo({
              fileName: '数据库',
              minTime: orderResult.timeRange.minTime,
              maxTime: orderResult.timeRange.maxTime
            });
          }
        }
      }

      // 处理核销数据
      if (verifyRes.ok) {
        const verifyResult = await verifyRes.json();
        if (verifyResult.success && verifyResult.storeStats) {
          verifyDataRef.current = verifyResult as VerifyAggregatedData;
          if (verifyResult.timeRange?.minTime && verifyResult.timeRange?.maxTime) {
            setVerifyFileInfo({
              fileName: '数据库',
              minTime: verifyResult.timeRange.minTime,
              maxTime: verifyResult.timeRange.maxTime
            });
          }
        }
      }

      // 处理退款数据
      if (refundRes.ok) {
        const refundResult = await refundRes.json();
        if (refundResult.success && refundResult.storeStats) {
          refundDataRef.current = refundResult as RefundAggregatedData;
          if (refundResult.timeRange?.minTime && refundResult.timeRange?.maxTime) {
            setRefundFileInfo({
              fileName: '数据库',
              minTime: refundResult.timeRange.minTime,
              maxTime: refundResult.timeRange.maxTime
            });
          }
        }
      }

      // 清除缓存并触发刷新
      storeDataCacheRef.current.clear();
      setDataVersion(prev => prev + 1);
      setDataRefreshKey(prev => prev + 1);
    } catch (err) {
      console.error('从数据库刷新数据失败:', err);
    }
  }, [currentSystem]);

  // 刷新数据函数（供快捷键调用）
  const handleRefresh = useCallback(async () => {
    // 先清除缓存
    storeDataCacheRef.current.clear();
    precomputedStoreDataRef.current.clear();
    // 从数据库重新加载所有数据
    await handleRefreshFromDatabase();
    // 增加版本号触发视图刷新
    setDataVersion(prev => prev + 1);
    setDataRefreshKey(prev => prev + 1);
    // 重新预计算
    precomputeAllStoreData();
  }, [handleRefreshFromDatabase, precomputeAllStoreData]);

  // Command+Z / Ctrl+Z 刷新数据快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 检测 Command+Z (Mac) 或 Ctrl+Z (Windows)
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        handleRefresh();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleRefresh]);

  // 智能时间解析函数 - 使用北京时间
  const parseNaturalTime = (input: string): { start: string; end: string; display: string } | null => {
    if (!input.trim()) return null;
    
    // 使用北京时间（UTC+8）
    const now = new Date();
    const beijingOffset = 8 * 60; // 北京时间比UTC快8小时
    const localOffset = now.getTimezoneOffset();
    const diffHours = (localOffset + beijingOffset) / 60;
    
    // 创建一个北京时间下的"今天"
    const today = new Date(now.getTime() + diffHours * 60 * 60 * 1000);
    today.setHours(0, 0, 0, 0);
    
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth(); // 0-11
    const currentDay = today.getDate();
    
    // 格式化日期为 YYYY-MM-DD
    const formatDate = (date: Date) => {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    };
    
    const cleanInput = input.trim().replace(/[月日号]/g, ' ').replace(/\s+/g, ' ').trim();
    const parts = cleanInput.split(/[到~\-]/).map(p => p.trim());
    
    // 解析单个月份或日期
    const parseDatePart = (part: string): { year: number; month: number; day?: number } | null => {
      const monthPatterns: Array<{ regex: RegExp; handler: (m: RegExpMatchArray) => { year: number; month: number; day?: number } }> = [
        { regex: /^(上上上?个月|往前?\d+个?月)/, handler: (m: RegExpMatchArray) => {
          const numMatch = part.match(/(\d+)个?月/);
          if (numMatch) {
            const num = parseInt(numMatch[1]);
            const targetMonth = currentMonth - num;
            return { 
              year: currentYear + Math.floor(targetMonth / 12),
              month: ((targetMonth % 12) + 12) % 12
            };
          }
          // 默认"上上上个月"
          const monthsBack = part.startsWith('上上上') ? 3 : (part.startsWith('上上') ? 2 : 1);
          const targetMonth = currentMonth - monthsBack;
          return { 
            year: currentYear + Math.floor(targetMonth / 12),
            month: ((targetMonth % 12) + 12) % 12
          };
        }},
        { regex: /^(上上上?年)/, handler: () => {
          const yearsBack = part.startsWith('上上上') ? 3 : (part.startsWith('上上') ? 2 : 1);
          return { year: currentYear - yearsBack, month: 0 };
        }},
        { regex: /^(今年|本年度)/, handler: () => ({ year: currentYear, month: 0 }) },
        { regex: /^(去年|上年度)/, handler: () => ({ year: currentYear - 1, month: 0 }) },
        { regex: /^(本季度)/, handler: () => {
          const quarter = Math.floor(currentMonth / 3);
          return { 
            year: currentYear, 
            month: quarter * 3
          };
        }},
        { regex: /^(上季度)/, handler: () => {
          const prevQuarter = Math.floor(currentMonth / 3) - 1;
          const year = prevQuarter < 0 ? currentYear - 1 : currentYear;
          const month = ((prevQuarter % 4) + 4) % 4 * 3;
          return { year, month };
        }},
        { regex: /^(\d+)月/, handler: (m: RegExpMatchArray) => {
          let month = parseInt(m[1]) - 1;
          let year = currentYear;
          // 如果指定的月份小于当前月份，认为是去年
          if (month < currentMonth && month >= 0) {
            // 12月的情况特殊处理
            if (month === 11) {
              year = currentYear - 1;
            }
          }
          return { year, month };
        }},
        { regex: /^(\d{4})[年\-\/](\d{1,2})(月)?$/, handler: (m: RegExpMatchArray) => ({ year: parseInt(m[1]), month: parseInt(m[2]) - 1 }) },
        { regex: /^(\d{1,2})[日号]?$/, handler: (m: RegExpMatchArray) => ({ year: currentYear, month: currentMonth, day: parseInt(m[1]) }) },
      ];
      
      for (const { regex, handler } of monthPatterns) {
        const match = part.match(regex);
        if (match) {
          return handler(match);
        }
      }
      return null;
    };
    
    // 如果只有一个部分
    if (parts.length === 1) {
      const part = parts[0];
      
      // 全文本匹配
      const fullTextPatterns: Record<string, () => { start: string; end: string; display: string }> = {
        '今天': () => ({ start: formatDate(today), end: formatDate(today), display: '今天' }),
        '昨天': () => {
          const d = new Date(today);
          d.setDate(d.getDate() - 1);
          return { start: formatDate(d), end: formatDate(d), display: '昨天' };
        },
        '前天': () => {
          const d = new Date(today);
          d.setDate(d.getDate() - 2);
          return { start: formatDate(d), end: formatDate(d), display: '前天' };
        },
        '明天': () => {
          const d = new Date(today);
          d.setDate(d.getDate() + 1);
          return { start: formatDate(d), end: formatDate(d), display: '明天' };
        },
        '本周': () => {
          const d = new Date(today);
          const dayOfWeek = d.getDay() || 7;
          d.setDate(d.getDate() - dayOfWeek + 1);
          return { start: formatDate(d), end: formatDate(today), display: '本周' };
        },
        '上周': () => {
          const d = new Date(today);
          const dayOfWeek = d.getDay() || 7;
          d.setDate(d.getDate() - dayOfWeek - 6);
          const endD = new Date(d);
          endD.setDate(endD.getDate() + 6);
          return { start: formatDate(d), end: formatDate(endD), display: '上周' };
        },
        '本月': () => {
          const start = new Date(currentYear, currentMonth, 1);
          const end = new Date(currentYear, currentMonth + 1, 0);
          return { start: formatDate(start), end: formatDate(end), display: '本月' };
        },
        '上月': () => {
          const start = new Date(currentYear, currentMonth - 1, 1);
          const end = new Date(currentYear, currentMonth, 0);
          return { start: formatDate(start), end: formatDate(end), display: '上月' };
        },
        '上上月': () => {
          const start = new Date(currentYear, currentMonth - 2, 1);
          const end = new Date(currentYear, currentMonth - 1, 0);
          return { start: formatDate(start), end: formatDate(end), display: '上上月' };
        },
        '最近三天': () => {
          const d = new Date(today);
          d.setDate(d.getDate() - 2);
          return { start: formatDate(d), end: formatDate(today), display: '最近三天' };
        },
        '最近七天': () => {
          const d = new Date(today);
          d.setDate(d.getDate() - 6);
          return { start: formatDate(d), end: formatDate(today), display: '最近七天' };
        },
        '最近一个月': () => {
          const d = new Date(currentYear, currentMonth - 1, currentDay);
          return { start: formatDate(d), end: formatDate(today), display: '最近一个月' };
        },
        '本年度': () => {
          const start = new Date(currentYear, 0, 1);
          const end = new Date(currentYear, 11, 31);
          return { start: formatDate(start), end: formatDate(end), display: `${currentYear}年度` };
        },
        '去年': () => {
          const start = new Date(currentYear - 1, 0, 1);
          const end = new Date(currentYear - 1, 11, 31);
          return { start: formatDate(start), end: formatDate(end), display: '去年' };
        },
        '本季度': () => {
          const quarterStart = Math.floor(currentMonth / 3) * 3;
          const quarterEnd = quarterStart + 2;
          const start = new Date(currentYear, quarterStart, 1);
          const end = new Date(currentYear, quarterEnd + 1, 0);
          return { start: formatDate(start), end: formatDate(end), display: `本季度` };
        },
        '上季度': () => {
          const prevQuarterStart = Math.floor(currentMonth / 3) * 3 - 3;
          const prevYear = prevQuarterStart < 0 ? currentYear - 1 : currentYear;
          const startMonth = ((prevQuarterStart % 12) + 12) % 12;
          const start = new Date(prevYear, startMonth, 1);
          const end = new Date(prevYear, startMonth + 3, 0);
          return { start: formatDate(start), end: formatDate(end), display: '上季度' };
        },
      };
      
      // 尝试全文本匹配
      for (const [key, handler] of Object.entries(fullTextPatterns)) {
        if (part.includes(key) || key.includes(part)) {
          return handler();
        }
      }
      
      // 尝试解析为单个日期
      const parsed = parseDatePart(part);
      if (parsed) {
        if (parsed.day !== undefined) {
          // 精确到某一天
          const d = new Date(parsed.year, parsed.month, parsed.day);
          return { start: formatDate(d), end: formatDate(d), display: `${parsed.month + 1}月${parsed.day}日` };
        } else {
          // 精确到某个月
          const start = new Date(parsed.year, parsed.month, 1);
          const end = new Date(parsed.year, parsed.month + 1, 0);
          return { start: formatDate(start), end: formatDate(end), display: `${parsed.month + 1}月` };
        }
      }
      
      return null;
    }
    
    // 两个部分的日期范围
    if (parts.length >= 2) {
      const startParsed = parseDatePart(parts[0]);
      const endParsed = parseDatePart(parts[1]);
      
      if (startParsed && endParsed) {
        let startDate: Date, endDate: Date;
        
        // 处理开始日期
        if (startParsed.day !== undefined) {
          startDate = new Date(startParsed.year, startParsed.month, startParsed.day);
        } else {
          startDate = new Date(startParsed.year, startParsed.month, 1);
        }
        
        // 处理结束日期
        if (endParsed.day !== undefined) {
          endDate = new Date(endParsed.year, endParsed.month, endParsed.day);
        } else {
          endDate = new Date(endParsed.year, endParsed.month + 1, 0);
        }
        
        // 如果开始日期在结束日期之后，交换
        if (startDate > endDate) {
          [startDate, endDate] = [endDate, startDate];
        }
        
        return { 
          start: formatDate(startDate), 
          end: formatDate(endDate), 
          display: `${startDate.getMonth() + 1}月${startDate.getDate()}日 - ${endDate.getMonth() + 1}月${endDate.getDate()}日` 
        };
      }
    }
    
    return null;
  };

  // 获取快捷时间范围的日期（供数据时间筛选使用）
  const getDateRange = (quick: 'all' | 'today' | 'yesterday' | 'dayBeforeYesterday' | 'last3Days' | 'last7Days' | 'last30Days' | 'last90Days' | 'thisMonth' | 'thisMonthExceptToday' | 'lastMonth' | 'twoMonthsAgo' | 'last3Months' | 'last3MonthsIncludingThisMonth' | 'thisYear') => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    // 格式化日期为 YYYY-MM-DD（使用本地时间，避免时区问题）
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
      case 'last90Days': {
        // 近90日（不包含今天）：过去90天，截止到昨天
        const end = new Date(today);
        end.setDate(end.getDate() - 1);
        const start = new Date(today);
        start.setDate(start.getDate() - 90);
        return { start: formatDate(start), end: formatDate(end) };
      }
      case 'thisMonth': {
        const start = formatDate(new Date(now.getFullYear(), now.getMonth(), 1));
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        const end = formatDate(lastDay);
        return { start, end };
      }
      case 'thisMonthExceptToday': {
        // 本月不含今天：本月1日到昨天
        const start = formatDate(new Date(now.getFullYear(), now.getMonth(), 1));
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const end = formatDate(yesterday);
        return { start, end };
      }
      case 'lastMonth': {
        const start = formatDate(new Date(now.getFullYear(), now.getMonth() - 1, 1));
        const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
        const end = formatDate(lastDay);
        return { start, end };
      }
      case 'twoMonthsAgo': {
        // 上上月
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
      case 'last3MonthsIncludingThisMonth': {
        // 近3月含本月：最近三个自然月，包含本月
        // 例如现在是4月，则范围是 2月1日 ~ 4月30日
        const start = formatDate(new Date(now.getFullYear(), now.getMonth() - 2, 1));
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
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

  // 计算单个门店数据（每次都重新计算，不使用缓存）
  const getStoreData = useCallback((storeId: string | null, timeStart?: string, timeEnd?: string) => {
    if (!storeId) return null;

    // 生成缓存键
    const cacheKey = `${storeId}|${timeStart || ''}|${timeEnd || ''}`;

    // 检查缓存
    const cached = storeDataCacheRef.current.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const orderData = orderDataRef.current;
    const verifyData = verifyDataRef.current;
    const refundData = refundDataRef.current;
    const adData = adDataRef.current;

    // 判断文件是否存在
    const hasOrderFile = orderData !== null && Object.keys(orderData.storeStats).length > 0;
    const hasVerifyFile = verifyData !== null && Object.keys(verifyData.storeStats).length > 0;
    const hasRefundFile = refundData !== null && Object.keys(refundData.storeStats).length > 0;
    const hasAdFile = adData !== null && Object.keys(adData.storeStats).length > 0;

    // 如果所有文件都不存在，返回null
    if (!hasOrderFile && !hasVerifyFile && !hasAdFile) {
      storeDataCacheRef.current.set(cacheKey, null);
      return null;
    }

    // 时间筛选辅助函数
    const isInRange = (dateStr: string, start: string, end: string) => {
      if (!start && !end) return true;
      const date = dateStr?.split(' ')[0] || dateStr;
      if (!date) return false;
      if (start && date < start) return false;
      if (end && date > end) return false;
      return true;
    };

    // ========== 数量类字段 ==========
    // 广告投入
    let adInvestment = 0;
    // 广告订单数
    let adOrders = 0;
    
    // 从广告费数据获取门店统计（和订单、核销保持一致）
    if (adData && adData.storeStats[storeId]) {
      const storeAdStats = adData.storeStats[storeId];
      
      if (timeStart || timeEnd) {
        // 有时间筛选，按日期累加
        for (const [date, stats] of Object.entries(storeAdStats.dailyStats)) {
          if (isInRange(date, timeStart || '', timeEnd || '')) {
            adInvestment += stats.spend;
            adOrders += stats.orders;
          }
        }
      } else {
        // 无时间筛选，使用总数
        adInvestment = storeAdStats.totalSpend;
        adOrders = storeAdStats.totalOrders;
      }
    }
    
    // 从聚合数据获取门店订单统计
    let totalOrders = 0;
    let fakeOrders = 0;
    let validOrders = 0;  // 有效订单数（订单实收 > 10元）
    let unverifiedCount = 0;
    
    if (orderData && orderData.storeStats[storeId]) {
      const storeOrderStats = orderData.storeStats[storeId];
      
      // 订单数、有效订单数等受时间筛选影响
      if (timeStart || timeEnd) {
        // 有时间筛选，按日期累加
        for (const [date, stats] of Object.entries(storeOrderStats.dailyStats)) {
          if (isInRange(date, timeStart || '', timeEnd || '')) {
            totalOrders += stats.orderCount;
            fakeOrders += stats.fakeOrderCount;
            validOrders += (stats as any).validOrderCount || 0;
          }
        }
      } else {
        // 无时间筛选，使用总数
        totalOrders = storeOrderStats.totalOrderCount;
        fakeOrders = storeOrderStats.totalFakeOrderCount;
        validOrders = (storeOrderStats as any).totalValidOrderCount || 0;
      }
      
      // 未核销数使用全部数据（导出的文件即为全部6个月数据），不受时间筛选影响
      unverifiedCount = storeOrderStats.totalUnverifiedCount;
    }
    
    // 从聚合数据获取门店核销统计
    let verifyCount = 0;
    let fakeVerifyCount = 0;  // 刷单核销数（核销金额 ≤ 10元，包含10元）
    let validVerifyCount = 0; // 有效核销数（核销金额 > 10元，不包含10元）

    if (verifyData && verifyData.storeStats[storeId]) {
      const storeVerifyStats = verifyData.storeStats[storeId];

      if (timeStart || timeEnd) {
        // 有时间筛选，按日期累加
        for (const [date, stats] of Object.entries(storeVerifyStats.dailyStats)) {
          if (isInRange(date, timeStart || '', timeEnd || '')) {
            const dailyFakeVerifyCount = (stats as any).fakeVerifyCount || 0;
            const dailyValidVerifyCount = (stats as any).validVerifyCount || 0;
            const dailyVerifyCount = stats.verifyCount || 0;

            // 数据一致性校验：确保 verifyCount = fakeVerifyCount + validVerifyCount
            const consistentVerifyCount = dailyVerifyCount === (dailyFakeVerifyCount + dailyValidVerifyCount)
              ? dailyVerifyCount
              : (dailyFakeVerifyCount + dailyValidVerifyCount);

            verifyCount += consistentVerifyCount;
            fakeVerifyCount += dailyFakeVerifyCount;
            validVerifyCount += dailyValidVerifyCount;
          }
        }
      } else {
        // 无时间筛选，从每日统计中累加所有数据
        for (const stats of Object.values(storeVerifyStats.dailyStats)) {
          const dailyFakeVerifyCount = (stats as any).fakeVerifyCount || 0;
          const dailyValidVerifyCount = (stats as any).validVerifyCount || 0;
          const dailyVerifyCount = stats.verifyCount || 0;

          // 数据一致性校验
          const consistentVerifyCount = dailyVerifyCount === (dailyFakeVerifyCount + dailyValidVerifyCount)
            ? dailyVerifyCount
            : (dailyFakeVerifyCount + dailyValidVerifyCount);

          verifyCount += consistentVerifyCount;
          fakeVerifyCount += dailyFakeVerifyCount;
          validVerifyCount += dailyValidVerifyCount;
        }
      }
    }
    
    // 退款数 - 仅从退款文件读取，无退款文件时显示*
    let refundCount: number | null;
    
    if (hasRefundFile && refundData) {
      const storeRefundStats = refundData.storeStats[storeId];
      
      if (storeRefundStats) {
        if (timeStart || timeEnd) {
          refundCount = 0;
          for (const [date, stats] of Object.entries(storeRefundStats.dailyStats)) {
            if (isInRange(date, timeStart || '', timeEnd || '')) {
              refundCount += stats.refundCount;
            }
          }
        } else {
          refundCount = storeRefundStats.totalRefundCount;
        }
      } else {
        refundCount = 0;
      }
    } else {
      refundCount = null;
    }
    
    // 核销率
    const verifyRate = totalOrders > 0 ? (verifyCount / totalOrders * 100).toFixed(2) : '0';

    // 有效核销率 = 有效核销数 / 有效订单数 × 100%
    const validVerifyRate = validOrders > 0 ? (validVerifyCount / validOrders * 100).toFixed(2) : '0';

    // ========== 金额类字段 ==========
    // 从聚合数据获取门店订单金额统计
    let totalAmount = 0;
    let fakeAmount = 0;
    let validOrderAmount = 0;  // 有效订单金额
    let unverifiedAmount = 0;
    
    if (orderData && orderData.storeStats[storeId]) {
      const storeOrderStats = orderData.storeStats[storeId];
      
      if (timeStart || timeEnd) {
        for (const [date, stats] of Object.entries(storeOrderStats.dailyStats)) {
          if (isInRange(date, timeStart || '', timeEnd || '')) {
            totalAmount += stats.orderAmount || 0;
            fakeAmount += stats.fakeOrderAmount || 0;
            validOrderAmount += (stats as any).validOrderAmount || 0;
            unverifiedAmount += stats.unverifiedAmount || 0;
          }
        }
      } else {
        totalAmount = storeOrderStats.totalOrderAmount || 0;
        fakeAmount = storeOrderStats.totalFakeOrderAmount || 0;
        validOrderAmount = (storeOrderStats as any).totalValidOrderAmount || 0;
        unverifiedAmount = storeOrderStats.totalUnverifiedAmount || 0;
      }
    }
    
    // 核销金额、刷单核销金额、有效核销金额
    let verifyAmount = 0;
    let fakeVerifyAmount = 0;
    let validVerifyAmount = 0;

    if (verifyData && verifyData.storeStats[storeId]) {
      const storeVerifyStats = verifyData.storeStats[storeId];

      if (timeStart || timeEnd) {
        for (const [date, stats] of Object.entries(storeVerifyStats.dailyStats)) {
          if (isInRange(date, timeStart || '', timeEnd || '')) {
            const dailyFakeVerifyAmount = (stats as any).fakeVerifyAmount || 0;
            const dailyValidVerifyAmount = (stats as any).validVerifyAmount || 0;
            const dailyVerifyAmount = stats.verifyAmount || 0;

            // 数据一致性校验：确保 verifyAmount = fakeVerifyAmount + validVerifyAmount
            // 如果不一致，使用后两者的和（因为它们是分别根据核销金额>10和<=10计算的）
            const consistentVerifyAmount = Math.abs(dailyVerifyAmount - (dailyFakeVerifyAmount + dailyValidVerifyAmount)) < 0.01
              ? dailyVerifyAmount
              : (dailyFakeVerifyAmount + dailyValidVerifyAmount);

            verifyAmount += consistentVerifyAmount;
            fakeVerifyAmount += dailyFakeVerifyAmount;
            validVerifyAmount += dailyValidVerifyAmount;
          }
        }
      } else {
        // 无时间筛选，从每日统计中累加所有金额
        for (const stats of Object.values(storeVerifyStats.dailyStats)) {
          const dailyFakeVerifyAmount = (stats as any).fakeVerifyAmount || 0;
          const dailyValidVerifyAmount = (stats as any).validVerifyAmount || 0;
          const dailyVerifyAmount = stats.verifyAmount || 0;

          // 数据一致性校验
          const consistentVerifyAmount = Math.abs(dailyVerifyAmount - (dailyFakeVerifyAmount + dailyValidVerifyAmount)) < 0.01
            ? dailyVerifyAmount
            : (dailyFakeVerifyAmount + dailyValidVerifyAmount);

          verifyAmount += consistentVerifyAmount;
          fakeVerifyAmount += dailyFakeVerifyAmount;
          validVerifyAmount += dailyValidVerifyAmount;
        }
      }
    }
    
    // 退款金额 - 仅从退款文件读取，无退款文件时显示*
    let refundAmount: number | null = null;
    
    if (hasRefundFile && refundData) {
      const storeRefundStats = refundData.storeStats[storeId];
      
      if (storeRefundStats) {
        if (timeStart || timeEnd) {
          refundAmount = 0;
          for (const [date, stats] of Object.entries(storeRefundStats.dailyStats)) {
            if (isInRange(date, timeStart || '', timeEnd || '')) {
              refundAmount += stats.refundAmount || 0;
            }
          }
        } else {
          refundAmount = storeRefundStats.totalRefundAmount || 0;
        }
      } else {
        refundAmount = 0;
      }
    }
    
    // 金额核销率
    const amountVerifyRate = totalAmount > 0 ? (verifyAmount / totalAmount * 100).toFixed(2) : '0';
    // 有效金额率
    const validAmountRate = validOrderAmount > 0 ? (validVerifyAmount / validOrderAmount * 100).toFixed(2) : '0';
    
    // 广告订单数占比
    const adOrdersRate = totalOrders > 0 ? (adOrders / totalOrders * 100).toFixed(2) : '0';

    const result = {
      // 数量类字段
      adInvestment,     // 广告投入
      totalOrders,
      adOrders,         // 广告订单数
      adOrdersRate,     // 广告订单数占比
      fakeOrders,
      validOrders, // 有效订单数（订单实收 > 10元，不包含10元）
      refundCount,
      unverifiedCount,
      verifyCount,
      fakeVerifyCount, // 刷单核销数（核销金额 ≤ 10元，包含10元）
      validVerifyCount, // 有效核销数（核销金额 > 10元，不包含10元）
      verifyRate,
      validVerifyRate, // 有效核销率（有效核销数 / 有效订单数 × 100%）
      // 金额类字段
      totalAmount: totalAmount.toFixed(2),
      fakeAmount: fakeAmount.toFixed(2),
      validOrderAmount: validOrderAmount.toFixed(2),  // 有效订单金额
      refundAmount: refundAmount !== null ? refundAmount.toFixed(2) : null,
      unverifiedAmount: unverifiedAmount.toFixed(2),
      verifyAmount: verifyAmount.toFixed(2),
      fakeVerifyAmount: fakeVerifyAmount.toFixed(2),
      validVerifyAmount: validVerifyAmount.toFixed(2),
      amountVerifyRate,
      validAmountRate,
      // 文件状态标识
      hasOrderFile,
      hasVerifyFile,
      hasRefundFile,
      hasAdFile,
    };

    // 缓存结果
    storeDataCacheRef.current.set(cacheKey, result);

    return result;
  }, [dataVersion]);

  // 计算未匹配数据（从聚合数据中获取未匹配统计）
  const unmatchedData = useMemo(() => {
    const orderData = orderDataRef.current;
    const verifyData = verifyDataRef.current;
    const refundData = refundDataRef.current;
    const adData = adDataRef.current;
    
    if (!orderData && !verifyData && !refundData && !adData) return null;
    
    // 时间筛选辅助函数
    const isInRange = (dateStr: string, start: string, end: string) => {
      if (!start && !end) return true;
      const date = dateStr?.split(' ')[0] || dateStr;
      if (!date) return false;
      if (start && date < start) return false;
      if (end && date > end) return false;
      return true;
    };
    
    // ========== 数量类字段 ==========
    // 从订单聚合数据获取未匹配统计
    let totalOrders = 0;
    let fakeOrders = 0;
    let unverifiedCount = 0;
    let totalOrderDataCount = 0;
    let matchedOrdersCount = 0;
    
    if (orderData) {
      totalOrderDataCount = orderData.stats.totalRecords;
      matchedOrdersCount = orderData.stats.matchedRecords;
      
      if (dataTimeStart || dataTimeEnd) {
        for (const [date, stats] of Object.entries(orderData.unmatchedDailyStats)) {
          if (isInRange(date, dataTimeStart || '', dataTimeEnd || '')) {
            totalOrders += stats.orderCount;
            fakeOrders += stats.fakeOrderCount;
            unverifiedCount += stats.unverifiedCount;
          }
        }
      } else {
        totalOrders = orderData.unmatchedTotal.orderCount;
        fakeOrders = orderData.unmatchedTotal.fakeOrderCount;
        unverifiedCount = orderData.unmatchedTotal.unverifiedCount;
      }
    }
    
    // 从核销聚合数据获取未匹配统计
    let verifyCount = 0;
    let fakeVerifyCount = 0;  // 刷单核销数（核销金额 ≤ 10元，包含10元）
    let validVerifyCount = 0; // 有效核销数（核销金额 > 10元，不包含10元）

    if (verifyData) {
      if (dataTimeStart || dataTimeEnd) {
        for (const [date, stats] of Object.entries(verifyData.unmatchedDailyStats)) {
          if (isInRange(date, dataTimeStart || '', dataTimeEnd || '')) {
            verifyCount += stats.verifyCount;
            fakeVerifyCount += stats.fakeVerifyCount || 0;
            validVerifyCount += stats.validVerifyCount || 0;
          }
        }
      } else {
        verifyCount = verifyData.unmatchedTotal.verifyCount;
        fakeVerifyCount = (verifyData as any).unmatchedTotal.fakeVerifyCount || 0;
        validVerifyCount = (verifyData as any).unmatchedTotal.validVerifyCount || 0;
      }
    }
    
    // 退款数（必须有退款文件才统计）
    let refundCount: number | null = null;
    let hasRefundFile = false;
    
    if (refundData && refundData.unmatchedTotal) {
      hasRefundFile = true;
      if (dataTimeStart || dataTimeEnd) {
        refundCount = 0;
        for (const [date, stats] of Object.entries(refundData.unmatchedDailyStats)) {
          if (isInRange(date, dataTimeStart || '', dataTimeEnd || '')) {
            refundCount += stats.refundCount;
          }
        }
      } else {
        refundCount = refundData.unmatchedTotal.refundCount;
      }
    }
    
    // 核销率
    const verifyRate = totalOrders > 0 ? (verifyCount / totalOrders * 100).toFixed(2) : '0';
    
    // ========== 金额类字段 ==========
    let totalAmount = 0;
    let fakeAmount = 0;
    let validOrderAmount = 0;  // 有效订单金额
    let unverifiedAmount = 0;
    
    if (orderData) {
      if (dataTimeStart || dataTimeEnd) {
        for (const [date, stats] of Object.entries(orderData.unmatchedDailyStats)) {
          if (isInRange(date, dataTimeStart || '', dataTimeEnd || '')) {
            totalAmount += stats.orderAmount || 0;
            fakeAmount += stats.fakeOrderAmount || 0;
            validOrderAmount += (stats as any).validOrderAmount || (stats.orderAmount - stats.fakeOrderAmount) || 0;
            unverifiedAmount += stats.unverifiedAmount || 0;
          }
        }
      } else {
        totalAmount = orderData.unmatchedTotal.orderAmount || 0;
        fakeAmount = orderData.unmatchedTotal.fakeOrderAmount || 0;
        validOrderAmount = (orderData.unmatchedTotal as any).validOrderAmount || (totalAmount - fakeAmount) || 0;
        unverifiedAmount = orderData.unmatchedTotal.unverifiedAmount || 0;
      }
    }
    
    // 核销金额、刷单核销金额、有效核销金额
    let verifyAmount = 0;
    let fakeVerifyAmount = 0;
    let validVerifyAmount = 0;

    if (verifyData) {
      if (dataTimeStart || dataTimeEnd) {
        for (const [date, stats] of Object.entries(verifyData.unmatchedDailyStats)) {
          if (isInRange(date, dataTimeStart || '', dataTimeEnd || '')) {
            const dailyFakeVerifyAmount = (stats as any).fakeVerifyAmount || 0;
            const dailyValidVerifyAmount = (stats as any).validVerifyAmount || 0;
            const dailyVerifyAmount = stats.verifyAmount || 0;

            // 数据一致性校验
            const consistentVerifyAmount = Math.abs(dailyVerifyAmount - (dailyFakeVerifyAmount + dailyValidVerifyAmount)) < 0.01
              ? dailyVerifyAmount
              : (dailyFakeVerifyAmount + dailyValidVerifyAmount);

            verifyAmount += consistentVerifyAmount;
            fakeVerifyAmount += dailyFakeVerifyAmount;
            validVerifyAmount += dailyValidVerifyAmount;
          }
        }
      } else {
        // 从每日统计中累加所有数据
        for (const stats of Object.values(verifyData.unmatchedDailyStats)) {
          const dailyFakeVerifyAmount = (stats as any).fakeVerifyAmount || 0;
          const dailyValidVerifyAmount = (stats as any).validVerifyAmount || 0;
          const dailyVerifyAmount = stats.verifyAmount || 0;

          // 数据一致性校验
          const consistentVerifyAmount = Math.abs(dailyVerifyAmount - (dailyFakeVerifyAmount + dailyValidVerifyAmount)) < 0.01
            ? dailyVerifyAmount
            : (dailyFakeVerifyAmount + dailyValidVerifyAmount);

          verifyAmount += consistentVerifyAmount;
          fakeVerifyAmount += dailyFakeVerifyAmount;
          validVerifyAmount += dailyValidVerifyAmount;
        }
      }
    }
    
    // 退款金额（必须有退款文件才统计）
    let refundAmount: number | null = null;
    
    if (refundData && refundData.unmatchedTotal) {
      if (dataTimeStart || dataTimeEnd) {
        refundAmount = 0;
        for (const [date, stats] of Object.entries(refundData.unmatchedDailyStats)) {
          if (isInRange(date, dataTimeStart || '', dataTimeEnd || '')) {
            refundAmount += stats.refundAmount || 0;
          }
        }
      } else {
        refundAmount = refundData.unmatchedTotal.refundAmount || 0;
      }
    }
    
    // ========== 广告费字段 ==========
    let adSpend = 0;
    let adOrders = 0;
    let hasAdFile = false;
    
    if (adData && adData.unmatchedTotal) {
      hasAdFile = true;
      if (dataTimeStart || dataTimeEnd) {
        for (const [date, stats] of Object.entries(adData.unmatchedDailyStats)) {
          if (isInRange(date, dataTimeStart || '', dataTimeEnd || '')) {
            adSpend += stats.spend;
            adOrders += stats.orders;
          }
        }
      } else {
        adSpend = adData.unmatchedTotal.spend;
        adOrders = adData.unmatchedTotal.orders;
      }
    }
    
    // 金额核销率、有效金额率
    const amountVerifyRate = totalAmount > 0 ? (verifyAmount / totalAmount * 100).toFixed(2) : '0';
    const validAmountRate = validOrderAmount > 0 ? (validVerifyAmount / validOrderAmount * 100).toFixed(2) : '0';
    
    return {
      hasUnmatched: totalOrders > 0 || verifyCount > 0 || (refundCount !== null && refundCount > 0) || adSpend > 0 || adOrders > 0 || totalAmount > 0 || verifyAmount > 0,
      // 数量类
      orderCount: totalOrders,
      fakeOrders,
      refundCount,
      unverifiedCount,
      verifyCount,
      fakeVerifyCount,  // 刷单核销数（核销金额 ≤ 10元，包含10元）
      validVerifyCount, // 有效核销数（核销金额 > 10元，不包含10元）
      verifyRate,
      // 广告费
      adSpend,
      adOrders,
      hasAdFile,
      // 金额类
      totalAmount,
      fakeAmount,
      validOrderAmount,
      refundAmount,
      unverifiedAmount,
      verifyAmount,
      fakeVerifyAmount,
      validVerifyAmount,
      amountVerifyRate,
      validAmountRate,
      // 状态
      hasRefundFile,
      // 有效订单数、有效订单金额
      validOrderCount: totalOrders - fakeOrders,
    };
  }, [dataTimeStart, dataTimeEnd, dataVersion]);

  // 统计未匹配原因（用于悬停提示）
  const unmatchedReasons = useMemo(() => {
    const orderData = orderDataRef.current;
    const verifyData = verifyDataRef.current;

    // 时间筛选辅助函数
    const isInRange = (dateStr: string, start: string, end: string) => {
      if (!start && !end) return true;
      const date = dateStr?.split(' ')[0] || dateStr;
      if (!date) return false;
      if (start && date < start) return false;
      if (end && date > end) return false;
      return true;
    };

    // 订单未匹配原因统计
    const orderReasons: Record<string, number> = {};
    const orderPayTime = (timeStart?: string, timeEnd?: string) => {
      if (!orderData?.unmatchedOrderDetails) return {};
      const reasons: Record<string, number> = {};
      for (const detail of orderData.unmatchedOrderDetails) {
        if (timeStart || timeEnd) {
          const detailDate = detail.payTime?.split(' ')[0] || '';
          if (!isInRange(detailDate, timeStart || '', timeEnd || '')) continue;
        }
        if (detail.reason) {
          reasons[detail.reason] = (reasons[detail.reason] || 0) + 1;
        }
      }
      return reasons;
    };

    // 核销未匹配原因统计
    const verifyReasons = (timeStart?: string, timeEnd?: string) => {
      if (!verifyData?.unmatchedVerifyDetails) return {};
      const reasons: Record<string, number> = {};
      for (const detail of verifyData.unmatchedVerifyDetails) {
        if (timeStart || timeEnd) {
          const detailDate = detail.verifyTime?.split(' ')[0] || '';
          if (!isInRange(detailDate, timeStart || '', timeEnd || '')) continue;
        }
        if (detail.reason) {
          reasons[detail.reason] = (reasons[detail.reason] || 0) + 1;
        }
      }
      return reasons;
    };

    return {
      order: orderPayTime(dataTimeStart, dataTimeEnd),
      verify: verifyReasons(dataTimeStart, dataTimeEnd),
    };
  }, [dataTimeStart, dataTimeEnd, dataVersion]);

  const [showRobotModal, setShowRobotModal] = useState<{ storeId: string; config?: RobotConfig } | null>(null);
  const [showFollowModal, setShowFollowModal] = useState<string | null>(null);
  const [showFollowViewModal, setShowFollowViewModal] = useState<string | null>(null);
  const [showAiConfigModal, setShowAiConfigModal] = useState(false);
  const [internalShowAdvancedFilter, setInternalShowAdvancedFilter] = useState(false);

  // 未匹配详情弹窗状态
  const [showUnmatchedDetailsModal, setShowUnmatchedDetailsModal] = useState<'order' | 'verify' | null>(null);

  // 合计详情弹窗状态
  const [showTotalDetailsModal, setShowTotalDetailsModal] = useState(false);

  // 渠道占比弹窗状态
  const [showChannelModal, setShowChannelModal] = useState(false);
  const [channelModalType, setChannelModalType] = useState<'order' | 'validOrder' | 'verify' | 'validVerify'>('order');

  // 全渠道弹窗状态（显示4个渠道数据）
  const [showAllChannelModal, setShowAllChannelModal] = useState(false);

  // 套餐分析弹窗状态（显示4个套餐数据）
  const [showPackageModal, setShowPackageModal] = useState(false);

  // 打开渠道弹窗
  const openChannelModal = (type: 'order' | 'validOrder' | 'verify' | 'validVerify') => {
    setChannelModalType(type);
    setShowChannelModal(true);
  };

  // 文件上传状态
  const [orderFile, setOrderFile] = useState<File | null>(null);
  const [verifyFile, setVerifyFile] = useState<File | null>(null);
  const [refundFile, setRefundFile] = useState<File | null>(null);
  const orderInputRef = useRef<HTMLInputElement>(null);
  const verifyInputRef = useRef<HTMLInputElement>(null);
  const refundInputRef = useRef<HTMLInputElement>(null);
  const adInputRef = useRef<HTMLInputElement>(null);
  
  // 文件信息状态
  const [orderFileInfo, setOrderFileInfo] = useState<FileInfo | null>(null);
  const [verifyFileInfo, setVerifyFileInfo] = useState<FileInfo | null>(null);
  const [refundFileInfo, setRefundFileInfo] = useState<FileInfo | null>(null);
  const [basicInfoFileInfo, setBasicInfoFileInfo] = useState<BasicInfoFileInfo | null>(null);
  const [staffFileInfo, setStaffFileInfo] = useState<StaffFileInfo | null>(null);
  const [staffFileInfo2, setStaffFileInfo2] = useState<StaffFileInfo | null>(null);
  const [douyinFileInfo, setDouyinFileInfo] = useState<DouyinFileInfo | null>(null);
  // 广告账户信息 - 8个独立账户
  const [adAccountInfos, setAdAccountInfos] = useState<[AdAccountFileInfo | null, AdAccountFileInfo | null, AdAccountFileInfo | null, AdAccountFileInfo | null, AdAccountFileInfo | null, AdAccountFileInfo | null, AdAccountFileInfo | null, AdAccountFileInfo | null]>([null, null, null, null, null, null, null, null]);
  // 广告账户自定义名称
  const [adAccountNames, setAdAccountNames] = useState<string[]>(['账户 1', '账户 2', '账户 3', '账户 4', '账户 5', '账户 6', '账户 7', '账户 8']);
  
  // 广告多文件上传弹窗状态
  const [showAdUploadModal, setShowAdUploadModal] = useState(false);
  const [showDataUploadModal, setShowDataUploadModal] = useState(false);
  const [showBasicInfoUploadModal, setShowBasicInfoUploadModal] = useState(false);
  
  // 删除确认弹窗状态
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<'ad' | null>(null);

  // ========== 弹窗操作函数（使用 startTransition 包裹，避免卡顿）==========
  // 弹窗开关状态更新属于低优先级 UI 更新，使用 startTransition 让 React 保持主列表响应
  const openDetailModal = useCallback((opts: { storeId: string; storeName: string; storeData?: any; hideTags?: boolean }) => {
    setStoreDetailModal({ ...opts, isOpen: true });
  }, []);
  const closeDetailModal = useCallback(() => {
    setStoreDetailModal(prev => ({ ...prev, isOpen: false }));
  }, []);
  const openRobotModal = useCallback((storeId: string, config?: RobotConfig) => {
    startTransition(() => setShowRobotModal({ storeId, config }));
  }, []);
  const closeRobotModal = useCallback(() => {
    startTransition(() => setShowRobotModal(null));
  }, []);
  const openFollowModal = useCallback((storeId: string) => {
    console.log('[openFollowModal] 打开跟进弹窗, storeId:', storeId, storeId?.length);
    startTransition(() => setShowFollowModal(storeId));
  }, []);
  const closeFollowModal = useCallback(() => {
    startTransition(() => setShowFollowModal(null));
  }, []);
  const openFollowViewModal = useCallback((storeId: string) => {
    startTransition(() => setShowFollowViewModal(storeId));
  }, []);
  const closeFollowViewModal = useCallback(() => {
    startTransition(() => setShowFollowViewModal(null));
  }, []);
  const openGroupManageModal = useCallback(() => {
    startTransition(() => setShowGroupManageModal(true));
  }, []);
  const closeGroupManageModal = useCallback(() => {
    startTransition(() => setShowGroupManageModal(false));
  }, []);
  const closeTotalDetailsModal = useCallback(() => {
    startTransition(() => setShowTotalDetailsModal(false));
  }, []);
  const closeAddModal = useCallback(() => {
    startTransition(() => setInternalShowAddModal(false));
  }, []);
  const closeBatchModal = useCallback(() => {
    startTransition(() => setInternalShowBatchModal(false));
  }, []);
  const closeDeleteStoreModal = useCallback(() => {
    startTransition(() => setInternalShowDeleteStoreModal(false));
  }, []);
  // ========== 弹窗操作函数结束 ==========
  
  // 初始化时从 IndexedDB 加载广告账户信息（包含锁定状态）
  useEffect(() => {
    const loadAdAccountInfos = async () => {
      // 从 IndexedDB 加载账户文件信息（用于显示上传状态）
      const idbAdInfos = await getBigData('adAccountInfos', currentSystem) as AdAccountFileInfo[] | null;
      if (idbAdInfos && idbAdInfos.length === 8) {
        const tuple: [AdAccountFileInfo | null, AdAccountFileInfo | null, AdAccountFileInfo | null, AdAccountFileInfo | null, AdAccountFileInfo | null, AdAccountFileInfo | null, AdAccountFileInfo | null, AdAccountFileInfo | null] = [
          idbAdInfos[0] || null,
          idbAdInfos[1] || null,
          idbAdInfos[2] || null,
          idbAdInfos[3] || null,
          idbAdInfos[4] || null,
          idbAdInfos[5] || null,
          idbAdInfos[6] || null,
          idbAdInfos[7] || null,
        ];
        setAdAccountInfos(tuple);
      } else {
        setAdAccountInfos([null, null, null, null, null, null, null, null]);
      }

      // 加载自定义账户名称
      const savedNames = await getBigData('adAccountNames', currentSystem) as string[] | null;
      if (savedNames && savedNames.length === 8) {
        setAdAccountNames(savedNames);
      }

      // 加载基础信息文件信息
      const savedBasicInfo = await getBigData('basicInfoFileInfo', currentSystem);
      if (savedBasicInfo) {
        setBasicInfoFileInfo(savedBasicInfo);
      }
      
      // 加载职人数据文件信息
      const savedStaff = await getBigData('staffFileInfo', currentSystem);
      if (savedStaff) {
        setStaffFileInfo(savedStaff);
      }
      
      const savedStaff2 = await getBigData('staffFileInfo2', currentSystem);
      if (savedStaff2) {
        setStaffFileInfo2(savedStaff2);
      }
    };
    loadAdAccountInfos();
  }, [currentSystem]);

  // 处理订单文件上传 - 使用 useCallback 优化
  const handleOrderUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setOrderFile(file);
    try {
      // 获取门店ID集合
      const storeIdSet = stores.map(s => String(s.store_id)).filter(Boolean);

      // 调用后端API处理文件
      const formData = new FormData();
      formData.append('file', file);
      formData.append('storeIdSet', JSON.stringify(storeIdSet));
      formData.append('storeSystem', currentSystem);

      const response = await fetch('/api/order-stats', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error('后端处理失败');
      }

      const result: OrderAggregatedData = await response.json();

      // 更新 ref（数据已保存到数据库）
      orderDataRef.current = result;
      setDataVersion(prev => prev + 1); // 触发数据视图刷新

      // 更新文件信息
      if (result.timeRange.minTime && result.timeRange.maxTime) {
        const fileInfo: FileInfo = {
          fileName: file.name,
          minTime: result.timeRange.minTime,
          maxTime: result.timeRange.maxTime
        };
        setOrderFileInfo(fileInfo);
      }

      setDataRefreshKey(prev => prev + 1); // 触发刷新

      const { totalRecords, matchedRecords, unmatchedRecords } = result.stats;
      
      // 构建未匹配数据统计信息
      let unmatchedInfo = '';
      if (unmatchedRecords > 0 && result.unmatchedStoreIdStats && result.unmatchedStoreIdStats.length > 0) {
        const topUnmatched = result.unmatchedStoreIdStats.slice(0, 3);
        const unmatchedDetails = topUnmatched.map(us => 
          `${us.storeId || '空ID'}(${us.orderCount}单)`
        ).join('、');
        unmatchedInfo = `，未匹配${unmatchedRecords}条（主要：${unmatchedDetails}${topUnmatched.length < result.unmatchedStoreIdStats.length ? '...' : ''}）`;
      } else if (unmatchedRecords > 0) {
        unmatchedInfo = `，未匹配${unmatchedRecords}条`;
      }
      
      setMessage({ 
        type: 'success', 
        text: `订单数据上传成功，匹配${matchedRecords}/${totalRecords}条${unmatchedInfo}` 
      });
      setTimeout(() => setMessage(null), 8000);
    } catch (error) {
      console.error('解析订单文件失败:', error);
      setMessage({ type: 'error', text: '文件解析失败' });
      setTimeout(() => setMessage(null), 5000);
    }
  }, [stores, currentSystem]);

  // 处理AI智能筛选
  const handleAiFilter = useCallback(async () => {
    const query = aiFilterQueryRef.current.trim();
    if (!query) return;

    setIsAiFiltering(true);
    try {
      const response = await fetch('/api/ai-filter', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: query,
        }),
      });

      if (!response.ok) {
        throw new Error('AI筛选失败');
      }

      const result = await response.json();

      if (result.success && result.filters && result.filters.length > 0) {
        console.log('AI筛选条件:', result.filters);
        setAiFilters(result.filters);
        setAiFilterExplanation(result.explanation || '');
        setMessage({ type: 'success', text: result.explanation || '筛选成功' });
        console.log('已设置 aiFilters，数量:', result.filters.length);
      } else {
        setMessage({ type: 'error', text: result.error || '无法理解该筛选条件' });
      }
      setTimeout(() => setMessage(null), 5000);
    } catch (error) {
      console.error('AI筛选失败:', error);
      setMessage({ type: 'error', text: 'AI筛选失败，请重试' });
      setTimeout(() => setMessage(null), 5000);
    } finally {
      setIsAiFiltering(false);
    }
  }, []); // 移除 aiFilterQuery 依赖，避免每次输入都重新创建函数

  // 注册智能筛选回调到 Dashboard
  useEffect(() => {
    // 注册 handleAiFilter 函数
    onAiFilterCallbackRef?.(handleAiFilter);
    // 注册 handleClearAiFilter 函数
    onClearAiFilterCallbackRef?.(() => {
      setAiFilters([]);
      setAiFilterExplanation('');
      setAiFilterQuery('');
      onAiFilterQueryChange?.('');
    });
    // 注册高级筛选器回调
    onAdvancedFilterCallbackRef?.((filters) => {
      setAiFilters(filters);
      if (filters.length === 0) {
        setAiFilterExplanation('已清除高级筛选');
      } else {
        setAiFilterExplanation(`已应用 ${filters.length} 个筛选条件`);
      }
      onAiFilterCountChange?.(filters.length);
    });
    return () => {
      onAiFilterCallbackRef?.(null);
      onClearAiFilterCallbackRef?.(null);
      onAdvancedFilterCallbackRef?.(null);
    };
  }, [handleAiFilter, onAiFilterCallbackRef, onClearAiFilterCallbackRef, onAdvancedFilterCallbackRef]);

  // 获取门店字段的值（支持嵌套和特殊字段）
  const getStoreFieldValue = useCallback((store: any, field: string): any => {
    const storeData = store.storeData;
    if (!storeData && (field.includes('order') || field.includes('verify'))) return null;

    // 处理通用字段（基于当前选中的时间范围）
    if (field === 'verify_rate') {
      return storeData ? parseFloat(storeData.verifyRate || '0') : 0;
    }
    if (field === 'order_count') {
      return storeData ? (storeData.totalOrders ?? 0) : 0;
    }

    // 处理特殊字段（带月份前缀）
    if (field.startsWith('order_count_') || field.startsWith('verify_rate_')) {
      if (!storeData) return null;

      const monthField = field.replace('order_count_', '').replace('verify_rate_', '');
      if (field.startsWith('order_count_')) {
        // 订单量字段：order_count_march -> storeData.marchOrders
        return storeData[`${monthField}Orders`] ?? 0;
      } else if (field.startsWith('verify_rate_')) {
        // 核销率字段：verify_rate_march -> storeData.marchVerifyRate
        return parseFloat(storeData[`${monthField}VerifyRate`] || '0');
      }
    }

    // 处理常用字段
    switch (field) {
      case 'store_name':
        return store.store_name || '';
      case 'business_status':
        return store.business_status || '';
      case 'next_follow_time':
        return store.next_follow_time || store.latest_next_follow_time || '';
      case 'merchant_phone':
        return store.merchant_phone || '';
      case 'category':
        return store.category || '';
      case 'province':
        return store.province || '';
      case 'city':
        return store.city || '';
      case 'address':
        return store.address || '';
      case 'merchant_name':
        return store.merchant_name || '';
      case 'store_tags':
        // 返回标签名称数组，用于 in 操作符筛选
        return store.store_tags?.map((t: StoreTag) => t.tag_name) || [];
      // 订单维度字段
      case 'totalOrders':
        return storeData?.totalOrders ?? 0;
      case 'validOrders':
        return storeData?.validOrders ?? 0;
      case 'fakeOrders':
        return storeData?.fakeOrders ?? 0;
      case 'refundCount':
        return storeData?.refundCount ?? 0;
      case 'unverifiedCount':
        return storeData?.unverifiedCount ?? 0;
      case 'totalAmount':
        return storeData?.totalAmount ?? 0;
      case 'validOrderAmount':
        return storeData?.validOrderAmount ?? 0;
      case 'refundAmount':
        return storeData?.refundAmount ?? 0;
      // 业绩维度字段
      case 'verifyCount':
        return storeData?.verifyCount ?? 0;
      case 'validVerifyCount':
        return storeData?.validVerifyCount ?? 0;
      case 'fakeVerifyCount':
        return storeData?.fakeVerifyCount ?? 0;
      case 'verifyRate':
        return parseFloat(storeData?.verifyRate || '0');
      case 'validVerifyRate':
        return parseFloat(storeData?.validVerifyRate || '0');
      case 'amountVerifyRate':
        return parseFloat(storeData?.amountVerifyRate || '0');
      case 'validAmountRate':
        return parseFloat(storeData?.validAmountRate || '0');
      case 'verifyAmount':
        return storeData?.verifyAmount ?? 0;
      case 'validVerifyAmount':
        return storeData?.validVerifyAmount ?? 0;
      case 'adInvestment':
        return storeData?.adInvestment ?? 0;
      default:
        return null;
    }
  }, []);

  // 应用AI筛选条件到单个门店
  const applyAiFiltersToStore = useCallback((store: any): boolean => {
    if (aiFilters.length === 0) return true;

    const results = aiFilters.map(filter => {
      const fieldValue = getStoreFieldValue(store, filter.field);
      const filterValue = filter.value;

      let passed = false;
      switch (filter.operator) {
        case 'eq':
          // 对于城市和省份字段，使用包含匹配而不是精确匹配
          if (filter.field === 'city' || filter.field === 'province') {
            passed = typeof fieldValue === 'string' &&
                     typeof filterValue === 'string' &&
                     fieldValue.includes(filterValue);
          } else {
            passed = fieldValue === filterValue;
          }
          break;
        case 'ne':
          passed = fieldValue !== filterValue;
          break;
        case 'gt':
          // 日期或数字比较
          if (filter.field === 'next_follow_time') {
            if (!fieldValue) {
              passed = false;
            } else {
              passed = new Date(fieldValue).getTime() > new Date(String(filterValue)).getTime();
            }
          } else {
            passed = typeof fieldValue === 'number' && typeof filterValue === 'number' && fieldValue > filterValue;
          }
          break;
        case 'lt':
          // 日期或数字比较
          if (filter.field === 'next_follow_time') {
            if (!fieldValue) {
              passed = false;
            } else {
              passed = new Date(fieldValue).getTime() < new Date(String(filterValue)).getTime();
            }
          } else {
            passed = typeof fieldValue === 'number' && typeof filterValue === 'number' && fieldValue < filterValue;
          }
          break;
        case 'gte':
          // 日期或数字比较
          if (filter.field === 'next_follow_time') {
            if (!fieldValue) {
              passed = false;
            } else {
              passed = new Date(fieldValue).getTime() >= new Date(String(filterValue)).getTime();
            }
          } else {
            passed = typeof fieldValue === 'number' && typeof filterValue === 'number' && fieldValue >= filterValue;
          }
          break;
        case 'lte':
          // 日期或数字比较
          if (filter.field === 'next_follow_time') {
            if (!fieldValue) {
              passed = false;
            } else {
              passed = new Date(fieldValue).getTime() <= new Date(String(filterValue)).getTime();
            }
          } else {
            passed = typeof fieldValue === 'number' && typeof filterValue === 'number' && fieldValue <= filterValue;
          }
          break;
        case 'contains':
          passed = typeof fieldValue === 'string' && typeof filterValue === 'string' && fieldValue.includes(filterValue);
          break;
        case 'in':
          if (!Array.isArray(filterValue)) {
            passed = false;
          } else if (filter.field === 'next_follow_time' && Array.isArray(filterValue)) {
            const followTime = store.next_follow_time || store.latest_next_follow_time;
            if (!followTime) {
              passed = false;
            } else {
              const followDate = new Date(followTime);
              passed = filterValue.some(dateStr => {
                const targetDate = new Date(String(dateStr));
                return followDate.toDateString() === targetDate.toDateString();
              });
            }
          } else {
            passed = Array.isArray(fieldValue)
              ? fieldValue.some(v => filterValue.includes(v))
              : filterValue.includes(fieldValue);
          }
          break;
        default:
          passed = true;
      }

      if (process.env.NODE_ENV === 'development') {
        console.log(`门店 ${store.store_name} 筛选条件:`, {
          field: filter.field,
          operator: filter.operator,
          fieldValue,
          filterValue,
          passed,
          description: filter.description
        });
      }

      return passed;
    });

    return results.every(r => r);
  }, [aiFilters, getStoreFieldValue]);

  // 处理核销文件上传 - 使用 useCallback 优化
  const handleVerifyUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setVerifyFile(file);
    try {
      // 获取门店ID集合
      const storeIdSet = stores.map(s => String(s.store_id)).filter(Boolean);

      // 调用后端API处理文件
      const formData = new FormData();
      formData.append('file', file);
      formData.append('storeIdSet', JSON.stringify(storeIdSet));

      const response = await fetch('/api/verify-stats', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error('后端处理失败');
      }

      const result: VerifyAggregatedData = await response.json();

      // 更新 ref（数据已保存到数据库）
      verifyDataRef.current = result;
      setDataVersion(prev => prev + 1); // 触发数据视图刷新

      // 更新文件信息
      if (result.timeRange.minTime && result.timeRange.maxTime) {
        const fileInfo: FileInfo = {
          fileName: file.name,
          minTime: result.timeRange.minTime,
          maxTime: result.timeRange.maxTime
        };
        setVerifyFileInfo(fileInfo);
      }

      setDataRefreshKey(prev => prev + 1); // 触发刷新

      const { totalRecords, matchedRecords, unmatchedRecords } = result.stats;
      
      // 构建未匹配数据统计信息
      let unmatchedInfo = '';
      if (unmatchedRecords > 0 && result.unmatchedVerifyDetails && result.unmatchedVerifyDetails.length > 0) {
        // 从未匹配详情中提取门店ID统计
        const unmatchedStoreIds: Record<string, number> = {};
        result.unmatchedVerifyDetails.forEach(detail => {
          const key = detail.storeId || '空ID';
          unmatchedStoreIds[key] = (unmatchedStoreIds[key] || 0) + 1;
        });
        
        // 取前3个主要的未匹配门店ID
        const topUnmatched = Object.entries(unmatchedStoreIds)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([storeId, count]) => `${storeId}(${count}单)`)
          .join('、');
          
        unmatchedInfo = `，未匹配${unmatchedRecords}条（主要：${topUnmatched}${Object.keys(unmatchedStoreIds).length > 3 ? '...' : ''}）`;
      } else if (unmatchedRecords > 0) {
        unmatchedInfo = `，未匹配${unmatchedRecords}条`;
      }
      
      setMessage({ 
        type: 'success', 
        text: `核销数据上传成功，匹配${matchedRecords}/${totalRecords}条${unmatchedInfo}` 
      });
      setTimeout(() => setMessage(null), 8000);
    } catch (error) {
      console.error('解析核销文件失败:', error);
      setMessage({ type: 'error', text: '文件解析失败' });
      setTimeout(() => setMessage(null), 5000);
    }
  }, [stores, currentSystem]);

  // 处理退款文件上传 - 使用 useCallback 优化
  const handleRefundUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // 从聚合订单数据获取订单ID到门店ID的映射
    const orderData = orderDataRef.current;
    const orderMapping: Record<string, string> = {};
    
    // 从聚合数据中提取订单ID映射
    if (orderData && orderData.orderMapping) {
      Object.assign(orderMapping, orderData.orderMapping);
    }
    
    // 获取当前门店体系的有效门店ID列表
    const validStoreIds = stores
      .filter(s => s.store_id)
      .map(s => s.store_id as string);
    
    setRefundFile(file);
    
    try {
      // 调用后端API处理文件
      const formData = new FormData();
      formData.append('file', file);
      formData.append('orderMapping', JSON.stringify(orderMapping));
      formData.append('validStoreIds', JSON.stringify(validStoreIds));
      
      const response = await fetch('/api/refund-stats', {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        throw new Error('后端处理失败');
      }
      
      const result: RefundAggregatedData = await response.json();
      
      // 更新 ref（数据已保存到数据库）
      refundDataRef.current = result;
      setDataVersion(prev => prev + 1); // 触发数据视图刷新
      
      // 更新文件信息
      if (result.timeRange.minTime && result.timeRange.maxTime) {
        const fileInfo: FileInfo = {
          fileName: file.name,
          minTime: result.timeRange.minTime,
          maxTime: result.timeRange.maxTime
        };
        setRefundFileInfo(fileInfo);
      }
      
      setDataRefreshKey(prev => prev + 1); // 触发刷新
      
      // 显示结果
      const { totalRecords, matchedRecords, unmatchedRecords } = result.stats;
      if (matchedRecords > 0 && unmatchedRecords > 0) {
        setMessage({ type: 'success', text: `退款数据上传成功，匹配${matchedRecords}/${totalRecords}条，${unmatchedRecords}条跨期退款归入未匹配` });
      } else if (matchedRecords > 0) {
        setMessage({ type: 'success', text: `退款数据上传成功，全部${totalRecords}条记录已匹配` });
      } else {
        setMessage({ type: 'success', text: `退款数据上传成功，${totalRecords}条记录（需上传订单文件关联门店）` });
      }
      setTimeout(() => setMessage(null), 5000);
    } catch (error) {
      console.error('处理退款文件失败:', error);
      setMessage({ type: 'error', text: '文件处理失败，请重试' });
      setTimeout(() => setMessage(null), 5000);
    }
  }, [stores, currentSystem]);

  // 处理广告账户文件上传 - 单个账户（数据库模式）
  const handleAdUpload = useCallback(async (accountIndex: number, file: File) => {
    console.log(`上传广告账户 ${accountIndex + 1} 文件:`, file.name);
    
    try {
      // 解析 Excel 文件
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(sheet, { defval: '' });

      if (!jsonData || jsonData.length === 0) {
        setMessage({ type: 'error', text: '文件为空或格式不正确' });
        setTimeout(() => setMessage(null), 5000);
        return;
      }

      // 获取门店ID集合
      const storeIdSet = stores.map(s => String(s.store_id)).filter(Boolean);

      // 解析并转换数据格式
      const records: any[] = [];
      let matchedCount = 0;

      for (const row of jsonData as any[]) {
        // 尝试多种可能的字段名
        const storeId = String(row['门店ID'] || row['门店id'] || row['store_id'] || row['ID'] || '').trim();
        const storeName = String(row['门店名称'] || row['store_name'] || row['名称'] || '').trim();
        // 消耗/广告费：支持"消耗(元)"、"广告费"、"花费"、"spend"等
        const spendRaw = row['消耗(元)'] || row['广告费'] || row['花费'] || row['spend'] || row['金额'] || row['cost'] || 0;
        const spend = parseFloat(String(spendRaw).replace(/,/g, '')) || 0;
        // 订单数：支持"全域成交订单数"、"订单数"、"订单"、"orders"等
        const orders = parseInt(row['全域成交订单数'] || row['订单数'] || row['订单'] || row['orders'] || row['count'] || 0) || 0;
        const date = row['日期'] || row['date'] || row['时间'] || null;

        if (!storeId && !storeName) continue;

        // 检查是否匹配门店
        if (storeId && storeIdSet.includes(storeId)) {
          matchedCount++;
        }

        records.push({
          storeId,
          storeName,
          spend,
          orders,
          date,
        });
      }

      // 调用数据库API上传
      const response = await fetch('/api/ad-expense', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_system: currentSystem,
          account_index: accountIndex,
          records,
        })
      });

      if (!response.ok) {
        throw new Error('上传到数据库失败');
      }

      const result = await response.json();

      // 更新账户文件信息
      const newAccountInfo: AdAccountFileInfo = {
        accountIndex,
        accountName: adAccountNames[accountIndex],
        fileName: file.name,
        minTime: result.data.minTime,
        maxTime: result.data.maxTime,
      };

      // 更新状态
      const newAccountInfos = [...adAccountInfos] as [AdAccountFileInfo | null, AdAccountFileInfo | null, AdAccountFileInfo | null, AdAccountFileInfo | null, AdAccountFileInfo | null, AdAccountFileInfo | null, AdAccountFileInfo | null, AdAccountFileInfo | null];
      newAccountInfos[accountIndex] = newAccountInfo;
      setAdAccountInfos(newAccountInfos);
      
      // 保存到 IndexedDB（只保存文件信息，不保存数据）
      await saveBigData('adAccountInfos', currentSystem, newAccountInfos);

      // 从数据库重新加载广告费聚合数据
      try {
        const adResponse = await fetch(`/api/ad-expense/store-stats?store_system=${currentSystem}`);
        if (adResponse.ok) {
          const adResult = await adResponse.json();
          if (adResult.success && adResult.storeStats) {
            adDataRef.current = adResult as AdAggregatedData;
            console.log('[广告数据更新] 完成，门店数:', Object.keys(adResult.storeStats).length, '总记录数:', adResult.stats?.totalRecords);

            // 立即清除缓存并刷新显示
            storeDataCacheRef.current.clear();
            setDataRefreshKey(prev => prev + 1);
            setDataVersion(prev => prev + 1);
          } else {
            console.error('[广告数据更新] API返回数据格式错误:', adResult);
          }
        } else {
          console.error('[广告数据更新] HTTP请求失败:', adResponse.status);
        }
      } catch (err) {
        console.error('[广告数据更新] 失败:', err);
      }

      setMessage({
        type: 'success',
        text: `账户${accountIndex + 1} 上传成功，共${result.data.insertedRecords}条记录`
      });
      setTimeout(() => setMessage(null), 8000);
    } catch (error) {
      console.error('解析广告费文件失败:', error);
      setMessage({ type: 'error', text: '文件解析失败' });
      setTimeout(() => setMessage(null), 5000);
    }
  }, [stores, currentSystem, adAccountInfos]);

  // 删除广告账户文件 - 数据库模式
  const removeAdFile = useCallback(async (accountIndex: number) => {
    const accountInfo = adAccountInfos[accountIndex];
    if (!accountInfo) return;

    try {
      // 调用数据库API删除数据
      const response = await fetch(`/api/ad-expense?store_system=${currentSystem}&account_index=${accountIndex}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error('删除失败');
      }

      // 更新状态
      const newAccountInfos = [...adAccountInfos] as [AdAccountFileInfo | null, AdAccountFileInfo | null, AdAccountFileInfo | null, AdAccountFileInfo | null, AdAccountFileInfo | null, AdAccountFileInfo | null, AdAccountFileInfo | null, AdAccountFileInfo | null];
      newAccountInfos[accountIndex] = null;
      setAdAccountInfos(newAccountInfos);
      await saveBigData('adAccountInfos', currentSystem, newAccountInfos);

      // 从数据库重新加载广告费聚合数据
      try {
        const adResponse = await fetch(`/api/ad-expense/store-stats?store_system=${currentSystem}`);
        if (adResponse.ok) {
          const adResult = await adResponse.json();
          if (adResult.success && adResult.storeStats) {
            adDataRef.current = adResult as AdAggregatedData;
            console.log('[广告数据更新] 完成，门店数:', Object.keys(adResult.storeStats).length, '总记录数:', adResult.stats?.totalRecords);
          }
        }
      } catch (err) {
        console.error('[广告数据更新] 失败:', err);
      }

      setMessage({ type: 'success', text: `账户${accountIndex + 1} 数据已清空` });
      setTimeout(() => setMessage(null), 5000);

      // 触发数据刷新
      storeDataCacheRef.current.clear();
      setDataRefreshKey(prev => prev + 1);
      setDataVersion(prev => prev + 1);
    } catch (error) {
      console.error('删除失败:', error);
      setMessage({ type: 'error', text: '删除失败，请重试' });
      setTimeout(() => setMessage(null), 5000);
    }
  }, [currentSystem, adAccountInfos]);

  // 清空所有广告费文件
  const clearAllAdFiles = useCallback(async () => {
    try {
      // 1. 调用 API 清空数据库
      const response = await fetch(`/api/ad-expense?store_system=${currentSystem}&delete_all=true`, {
        method: 'DELETE'
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || '清空失败');
      }

      // 2. 清空所有账户的 IndexedDB 状态
      const newAccountInfos = [null, null, null, null, null, null, null, null] as [null, null, null, null, null, null, null, null];
      setAdAccountInfos(newAccountInfos);
      await saveBigData('adAccountInfos', currentSystem, newAccountInfos);

      // 3. 从数据库重新加载空的统计数据
      try {
        const adResponse = await fetch(`/api/ad-expense/store-stats?store_system=${currentSystem}`);
        if (adResponse.ok) {
          const adResult = await adResponse.json();
          if (adResult.success) {
            adDataRef.current = adResult as AdAggregatedData;
            console.log('[广告数据清空] 完成，总记录数:', adResult.stats?.totalRecords || 0);
          }
        }
      } catch (err) {
        console.error('[广告数据清空] 重新加载失败:', err);
        // 即使重新加载失败，也清空本地数据
        adDataRef.current = {
          storeStats: {},
          timeRange: { minTime: null, maxTime: null },
          stats: { totalRecords: 0, matchedRecords: 0, unmatchedRecords: 0, totalAdInvestment: 0 },
          unmatchedDailyStats: {},
          unmatchedTotal: { spend: 0, orders: 0 },
          accounts: [null, null, null, null, null, null, null, null]
        };
      }

      // 4. 清除缓存
      storeDataCacheRef.current.clear();

      // 5. 刷新数据
      setDataRefreshKey(prev => prev + 1);
      setDataVersion(prev => prev + 1);

      // 6. 显示成功提示
      alert('所有广告费数据已清空！');

      // 7. 关闭弹窗
      setShowAdUploadModal(false);
    } catch (error) {
      console.error('清空失败:', error);
      alert(`清空失败：${error instanceof Error ? error.message : '未知错误'}`);
    }
  }, [currentSystem]);

  // 删除订单文件 - 使用 useCallback 优化
  const removeOrderFile = useCallback(() => {
    setOrderFile(null);
    setOrderFileInfo(null);
    deleteBigData('orderStats', currentSystem);
    deleteBigData('orderFileInfo', currentSystem);
    orderDataRef.current = null;
    storeDataCacheRef.current.clear(); // 清除缓存
    setDataVersion(prev => prev + 1); // 触发数据视图刷新
    if (orderInputRef.current) orderInputRef.current.value = '';
    setShowDeleteConfirm(null);
    setDataRefreshKey(prev => prev + 1); // 触发刷新
    setMessage({ type: 'success', text: '订单文件已删除' });
    setTimeout(() => setMessage(null), 5000);
  }, [currentSystem]);

  // 删除核销文件 - 使用 useCallback 优化
  const removeVerifyFile = useCallback(() => {
    setVerifyFile(null);
    setVerifyFileInfo(null);
    deleteBigData('verifyStats', currentSystem);
    deleteBigData('verifyFileInfo', currentSystem);
    verifyDataRef.current = null;
    storeDataCacheRef.current.clear(); // 清除缓存
    setDataVersion(prev => prev + 1); // 触发数据视图刷新
    if (verifyInputRef.current) verifyInputRef.current.value = '';
    setShowDeleteConfirm(null);
    setDataRefreshKey(prev => prev + 1); // 触发刷新
    setMessage({ type: 'success', text: '核销文件已删除' });
    setTimeout(() => setMessage(null), 5000);
  }, [currentSystem]);

  // 删除退款文件 - 使用 useCallback 优化
  const removeRefundFile = useCallback(() => {
    setRefundFile(null);
    setRefundFileInfo(null);
    deleteBigData('refundStats', currentSystem);
    deleteBigData('refundFileInfo', currentSystem);
    refundDataRef.current = null;
    storeDataCacheRef.current.clear(); // 清除缓存
    setDataVersion(prev => prev + 1); // 触发数据视图刷新
    if (refundInputRef.current) refundInputRef.current.value = '';
    setShowDeleteConfirm(null);
    setDataRefreshKey(prev => prev + 1); // 触发刷新
    setMessage({ type: 'success', text: '退款文件已删除' });
    setTimeout(() => setMessage(null), 5000);
  }, [currentSystem]);

  // 处理订单文件上传成功 - 使用 useCallback 优化
  const handleOrderUploadSuccess = useCallback((result: OrderAggregatedData, fileInfo: FileInfo | null) => {
    // 更新 ref（数据已保存到数据库）
    orderDataRef.current = result;
    storeDataCacheRef.current.clear(); // 清除缓存，确保新数据生效
    setDataVersion(prev => prev + 1); // 触发数据视图刷新

    setOrderFileInfo(fileInfo);
    setDataRefreshKey(prev => prev + 1); // 触发刷新
  }, [currentSystem]);

  // 处理核销文件上传成功 - 使用 useCallback 优化
  const handleVerifyUploadSuccess = useCallback((result: VerifyAggregatedData, fileInfo: FileInfo | null) => {
    // 更新 ref（数据已保存到数据库）
    verifyDataRef.current = result;
    storeDataCacheRef.current.clear(); // 清除缓存，确保新数据生效
    setDataVersion(prev => prev + 1); // 触发数据视图刷新

    setVerifyFileInfo(fileInfo);
    setDataRefreshKey(prev => prev + 1); // 触发刷新
  }, [currentSystem]);

  // 处理退款文件上传成功 - 使用 useCallback 优化
  const handleRefundUploadSuccess = useCallback((result: RefundAggregatedData, fileInfo: FileInfo | null) => {
    // 更新 ref（数据已保存到数据库）
    refundDataRef.current = result;
    storeDataCacheRef.current.clear(); // 清除缓存，确保新数据生效
    setDataVersion(prev => prev + 1); // 触发数据视图刷新

    setRefundFileInfo(fileInfo);
    setDataRefreshKey(prev => prev + 1); // 触发刷新
  }, [currentSystem]);

  // 处理基础信息上传成功 - 使用 useCallback 优化
  const handleBasicInfoUploadSuccess = useCallback((fileInfo: any) => {
    setBasicInfoFileInfo(fileInfo);
    saveBigData('basicInfoFileInfo', currentSystem, fileInfo);
  }, [currentSystem]);

  // 删除基础信息文件 - 使用 useCallback 优化
  const removeBasicInfoFile = useCallback(() => {
    setBasicInfoFileInfo(null);
    deleteBigData('basicInfoFileInfo', currentSystem);
    setMessage({ type: 'success', text: '基础信息文件已删除' });
    setTimeout(() => setMessage(null), 5000);
  }, [currentSystem]);
  
  
  // 处理抖音蓝V数据上传成功 - 使用 useCallback 优化
  const handleDouyinUploadSuccess = useCallback((fileInfo: any) => {
    if (fileInfo) {
      setDouyinFileInfo(fileInfo);
      saveBigData('douyinFileInfo', currentSystem, fileInfo);
      setMessage({ type: 'success', text: `抖音蓝V数据上传成功：更新成功 ${fileInfo.result?.updatedCount || 0} 家，未找到门店 ${fileInfo.result?.notFoundCount || 0} 家` });
      setTimeout(() => setMessage(null), 5000);
    }
  }, [currentSystem]);

  // 删除抖音蓝V文件
  const removeDouyinFile = useCallback(() => {
    setDouyinFileInfo(null);
  }, [currentSystem]);

  // 处理职人数据上传成功 - 使用 useCallback 优化
  const handleStaffUploadSuccess = useCallback((fileInfo: any, fileInfo2?: any) => {
    if (fileInfo) {
      setStaffFileInfo(fileInfo);
      saveBigData('staffFileInfo', currentSystem, fileInfo);
    }
    if (fileInfo2) {
      setStaffFileInfo2(fileInfo2);
      saveBigData('staffFileInfo2', currentSystem, fileInfo2);
    }
  }, [currentSystem]);
  
  // 删除职人数据文件1 - 使用 useCallback 优化
  const removeStaffFile = useCallback(() => {
    setStaffFileInfo(null);
    deleteBigData('staffFileInfo', currentSystem);
    setMessage({ type: 'success', text: '职人数据文件1已删除' });
    setTimeout(() => setMessage(null), 5000);
  }, [currentSystem]);
  
  // 删除职人数据文件2 - 使用 useCallback 优化
  const removeStaffFile2 = useCallback(() => {
    setStaffFileInfo2(null);
    deleteBigData('staffFileInfo2', currentSystem);
    setMessage({ type: 'success', text: '职人数据文件2已删除' });
    setTimeout(() => setMessage(null), 5000);
  }, [currentSystem]);

  // 刷新数据并重新匹配退款
  const handleRefreshAndRematch = useCallback(async () => {
    try {
      setMessage({ type: 'success', text: '正在重新匹配退款数据...' });

      // 1️⃣ 先调用退款重新匹配接口
      const rematchRes = await fetch('/api/refund-records/rematch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_system: currentSystem })
      });

      if (!rematchRes.ok) {
        setMessage({ type: 'error', text: '退款匹配失败，请重试' });
        setTimeout(() => setMessage(null), 3000);
        return;
      }

      const rematchResult = await rematchRes.json();

      // 2️⃣ 再从数据库重新加载所有数据
      const [orderRes, verifyRes, refundRes] = await Promise.all([
        fetch(`/api/order-records?store_system=${currentSystem}&aggregate=true`),
        fetch(`/api/verify-records?store_system=${currentSystem}&aggregate=true`),
        fetch(`/api/refund-records?store_system=${currentSystem}&aggregate=true`)
      ]);

      // 处理订单数据
      if (orderRes.ok) {
        const orderResult = await orderRes.json();
        if (orderResult.success && orderResult.storeStats) {
          orderDataRef.current = orderResult as OrderAggregatedData;
          if (orderResult.timeRange?.minTime && orderResult.timeRange?.maxTime) {
            setOrderFileInfo({
              fileName: '数据库',
              minTime: orderResult.timeRange.minTime,
              maxTime: orderResult.timeRange.maxTime
            });
          }
        }
      }

      // 处理核销数据
      if (verifyRes.ok) {
        const verifyResult = await verifyRes.json();
        if (verifyResult.success && verifyResult.storeStats) {
          verifyDataRef.current = verifyResult as VerifyAggregatedData;
          if (verifyResult.timeRange?.minTime && verifyResult.timeRange?.maxTime) {
            setVerifyFileInfo({
              fileName: '数据库',
              minTime: verifyResult.timeRange.minTime,
              maxTime: verifyResult.timeRange.maxTime
            });
          }
        }
      }

      // 处理退款数据
      if (refundRes.ok) {
        const refundResult = await refundRes.json();
        if (refundResult.success && refundResult.storeStats) {
          refundDataRef.current = refundResult as RefundAggregatedData;
          if (refundResult.timeRange?.minTime && refundResult.timeRange?.maxTime) {
            setRefundFileInfo({
              fileName: '数据库',
              minTime: refundResult.timeRange.minTime,
              maxTime: refundResult.timeRange.maxTime
            });
          }
        }
      }

      // 3️⃣ 清除缓存并触发刷新
      storeDataCacheRef.current.clear();
      setDataVersion(prev => prev + 1);
      setDataRefreshKey(prev => prev + 1);

      // 显示成功消息
      if (rematchResult.success && rematchResult.updatedCount > 0) {
        setMessage({
          type: 'success',
          text: `刷新成功！重新匹配 ${rematchResult.updatedCount}/${rematchResult.totalCount} 条退款数据`
        });
      } else if (rematchResult.success) {
        setMessage({ type: 'success', text: '数据已刷新，无需重新匹配' });
      }
      setTimeout(() => setMessage(null), 5000);
    } catch (err) {
      console.error('刷新数据失败:', err);
      setMessage({ type: 'error', text: '刷新失败，请重试' });
      setTimeout(() => setMessage(null), 3000);
    }
  }, [currentSystem]);

  // 一键删除订单、核销、退款文件
  const removeAllFiles = useCallback(() => {
    // 清空订单数据
    setOrderFile(null);
    setOrderFileInfo(null);
    orderDataRef.current = null;
    if (orderInputRef.current) orderInputRef.current.value = '';

    // 清空核销数据
    setVerifyFile(null);
    setVerifyFileInfo(null);
    verifyDataRef.current = null;
    if (verifyInputRef.current) verifyInputRef.current.value = '';

    // 清空退款数据
    setRefundFile(null);
    setRefundFileInfo(null);
    refundDataRef.current = null;
    if (refundInputRef.current) refundInputRef.current.value = '';

    // 注意：不删除广告费文件，广告费文件需要单独删除
    
    storeDataCacheRef.current.clear(); // 清除缓存
    setShowDeleteConfirm(null);
    setDataVersion(prev => prev + 1); // 触发数据视图刷新
    setDataRefreshKey(prev => prev + 1); // 触发刷新
    setMessage({ type: 'success', text: '订单、核销、退款文件已删除' });
    setTimeout(() => setMessage(null), 5000);
  }, [currentSystem]);

  // AI总结角色词模板（默认值）
  const defaultAiPrompt = `你是一个专业的商户关系分析专家。请根据以下跟进记录和聊天截图，对这个商户进行全面分析。

请按以下格式输出分析结果：

## 一、商户基本情况
[简要描述商户的基本信息、行业特点等]

## 二、沟通内容摘要
[总结主要沟通内容和关键信息]

## 三、商户需求分析
[分析商户的核心需求和痛点]

## 四、跟进效果评估
[评估当前跟进的效果和进展]

## 五、后续建议
[提出具体的后续跟进策略和行动建议]`;

  const [aiPromptTemplate, setAiPromptTemplate] = useState(defaultAiPrompt);

  // 从localStorage加载角色词模板
  useEffect(() => {
    const saved = localStorage.getItem('aiPromptTemplate');
    if (saved) {
      setAiPromptTemplate(saved);
    }
  }, []);

  const fullImportFileInputRef = useRef<HTMLInputElement>(null);

  // 缓存门店基本信息（只加载一次）
  const allStoresCacheRef = useRef<Store[]>([]);
  
  // 加载门店基本信息
  const fetchAllStores = useCallback(async () => {
    const params = new URLSearchParams({
      pageSize: '9999',
      store_system: currentSystem,
    });

    const res = await fetch(`/api/stores?${params}`, {
      cache: 'no-store',
    });
    const data = await res.json();

    if (data.success) {
      allStoresCacheRef.current = data.data || [];
      return data.data || [];
    }
    return [];
  }, [currentSystem]);

  // 加载门店数据
  useEffect(() => {
    setLoading(true);
    setLoadingProgress(0);
    setLoadingMessage('正在加载门店数据...');
    
    // 直接使用 await 确保状态更新顺序
    (async () => {
      try {
        const stores = await fetchAllStores();
        setStores(stores);
        storesRef.current = stores;
        // 门店数据加载完成后，触发数据重新计算
        setDataVersion(prev => prev + 1);
        setDataRefreshKey(prev => prev + 1); // 同时更新 dataRefreshKey，触发合计数据重新计算
      } catch (err) {
        console.error('[StoreList] 数据加载失败:', err);
      } finally {
        setLoading(false);
        setLoadingProgress(100);
        setLoadingMessage('数据加载完成');
      }
    })();
  }, [currentSystem, fetchAllStores]);

  // 计算标签统计数据（不包括"取消合作"的门店）
  const tagStats = useMemo(() => {
    // 过滤掉取消合作的门店
    const activeStores = stores.filter(store => store.business_status !== '取消合作');

    // 计算每个标签的门店数量
    const counts: Record<string, number> = {};
    activeStores.forEach(store => {
      const storeTags = store.store_tags || [];
      storeTags.forEach(tag => {
        const tagName = tag.tag_name;
        if (!counts[tagName]) {
          counts[tagName] = 0;
        }
        counts[tagName]++;
      });
    });

    // 计算没有标签的门店数量
    const emptyCount = activeStores.filter(store => {
      const storeTags = store.store_tags || [];
      return storeTags.length === 0;
    }).length;

    // 计算有标签的门店总数
    const withTagCount = activeStores.filter(store => {
      const storeTags = store.store_tags || [];
      return storeTags.length > 0;
    }).length;

    return {
      counts,
      emptyCount,
      withTagCount
    };
  }, [stores]);

  // 前端筛选函数（基于 stores 状态进行筛选）
  const filteredStores = useMemo(() => {
    // 包含所有门店（包括"取消合作"）
    let result = stores;

    // 搜索筛选
    if (search) {
      const keyword = search.toLowerCase();
      result = result.filter(store =>
        store.store_name?.toLowerCase().includes(keyword) ||
        store.store_id?.toLowerCase().includes(keyword) ||
        store.address?.toLowerCase().includes(keyword)
      );
    }

    // 类别筛选（排除"取消合作"的门店）
    if (levelFilter !== 'all') {
      if (levelFilter === 'empty') {
        result = result.filter(store => !store.store_level || store.store_level === '');
      } else {
        result = result.filter(store => store.store_level === levelFilter);
      }
      // 排除"取消合作"的门店
      result = result.filter(store => store.business_status !== '取消合作');
    }

    // 服务状态筛选
    if (businessStatusFilter !== 'all') {
      result = result.filter(store => store.business_status === businessStatusFilter);
    }

    // 经营分筛选
    if (businessScoreFilter !== 'all') {
      result = result.filter(store => {
        const score = store.business_score;
        // 排除没有经营分的门店
        if (score === null || score === undefined) return false;

        if (businessScoreFilter === '>=80') return score >= 80;
        if (businessScoreFilter === '>=70,<80') return score >= 70 && score < 80;
        if (businessScoreFilter === '>=60,<70') return score >= 60 && score < 70;
        if (businessScoreFilter === '<60') return score < 60;
        return false;
      });
    }

    // 下次跟进时间筛选
    if (followTimeFilter === 'today') {
      const today = new Date().toISOString().split('T')[0];
      result = result.filter(store => {
        if (!store.latest_next_follow_time) return false;
        const followDate = store.latest_next_follow_time.split('T')[0];
        return followDate === today;
      });
    } else if (followTimeFilter === 'overdue') {
      const today = new Date().toISOString().split('T')[0];
      result = result.filter(store => {
        if (!store.latest_next_follow_time) return false;
        const followDate = store.latest_next_follow_time.split('T')[0];
        return followDate < today;
      });
    } else if (followTimeFilter === 'pending') {
      const today = new Date().toISOString().split('T')[0];
      result = result.filter(store => {
        if (!store.latest_next_follow_time) return false;
        const followDate = store.latest_next_follow_time.split('T')[0];
        return followDate > today;
      });
    } else if (followTimeFilter === 'noTime') {
      result = result.filter(store => !store.latest_next_follow_time);
    }

    // 下次跟进日期范围筛选
    if (nextFollowDateStart) {
      result = result.filter(store => {
        if (!store.latest_next_follow_time) return false;
        const followDate = store.latest_next_follow_time.split('T')[0];
        return followDate >= nextFollowDateStart;
      });
    }
    if (nextFollowDateEnd) {
      result = result.filter(store => {
        if (!store.latest_next_follow_time) return false;
        const followDate = store.latest_next_follow_time.split('T')[0];
        return followDate <= nextFollowDateEnd;
      });
    }

    // 标签筛选（且/或关系）
    if (selectedTagFilters.length > 0) {
      result = result.filter(store => {
        // 特殊处理"空"选项：筛选没有标签的门店
        if (selectedTagFilters.includes('__EMPTY__')) {
          const storeTags = store.store_tags || [];
          return storeTags.length === 0;
        }

        const storeTags = store.store_tags || [];
        const storeTagNames = storeTags.map(t => t.tag_name);
        // 根据选择的关系使用不同的逻辑
        if (tagFilterRelation === 'AND') {
          // 且关系：必须同时包含所有选中的标签
          return selectedTagFilters.every(filterTag => storeTagNames.includes(filterTag));
        } else {
          // 或关系：只需包含任意一个选中的标签
          return selectedTagFilters.some(filterTag => storeTagNames.includes(filterTag));
        }
      });
    }

    // 分组筛选
    if (activeGroupId) {
      const group = storeGroups.find(g => g.id === activeGroupId);
      if (group) {
        const groupIdSet = new Set(group.store_ids.split(',').map(s => s.trim()).filter(Boolean));
        result = result.filter(store => store.store_id && groupIdSet.has(store.store_id));
      }
    }

    return result;
  }, [stores, search, followTimeFilter, levelFilter, businessStatusFilter, businessScoreFilter, nextFollowDateStart, nextFollowDateEnd, selectedTagFilters, tagFilterRelation, activeGroupId, storeGroups]);

  // 所有活跃门店（包含所有门店，用于合计统计）
  const allActiveStores = useMemo(() => {
    return stores;
  }, [stores]);

  // 门店列表 ref - 用于 storesWithBindData，避免门店基础字段变化触发数据重新绑定
  const filteredStoresRef = useRef<Store[]>([]);
  const allActiveStoresRef = useRef<Store[]>([]);
  useEffect(() => {
    filteredStoresRef.current = filteredStores;
    allActiveStoresRef.current = allActiveStores;
  }, [filteredStores, allActiveStores]);

  // 使用 useCallback 稳定 fetchStores 引用
  const fetchStores = useCallback(async (forceRefresh = false) => {
    console.log('[fetchStores] 调用，forceRefresh:', forceRefresh);

    // 强制刷新时重新获取
    if (forceRefresh) {
      setLoading(true);
      setLoadingProgress(0);
      setLoadingMessage('正在加载门店数据...');
      const stores = await fetchAllStores();

      console.log('[fetchStores] 获取到门店数据:', {
        count: stores.length,
        firstStore: stores[0] ? {
          name: stores[0].store_name,
          id: stores[0].id,
          nextFollowTime: stores[0].latest_next_follow_time
        } : null
      });

      setStores(stores);
      storesRef.current = stores;
      setLoading(false);
      setLoadingProgress(100);
      setLoadingMessage('数据加载完成');
    }
  }, [fetchAllStores]);

  // 完整导入（支持更新已有门店）
  const handleFullImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('store_system', currentSystem);

      const res = await fetch('/api/stores/import-full', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();

      if (data.success) {
        const { created, updated, errors } = data.data || {};
        let message = `导入完成：`;
        if (created > 0) message += ` 新增 ${created} 家门店`;
        if (updated > 0) message += ` 更新 ${updated} 家门店`;

        if (errors && errors.length > 0) {
          message += `，${errors.length} 行导入失败`;
          console.error('导入错误详情:', errors);
        }

        setMessage({ type: 'success', text: message });
        closeBatchModal();
        onCloseBatchModal?.();
        fetchStores();
      } else {
        setMessage({ type: 'error', text: data.error || '导入失败' });
      }
    } catch (error) {
      console.error('完整导入失败:', error);
      setMessage({ type: 'error', text: '文件解析失败，请检查文件格式' });
    }

    if (fullImportFileInputRef.current) {
      fullImportFileInputRef.current.value = '';
    }
    setTimeout(() => setMessage(null), 5000);
  };

  // 重置所有筛选条件
  const resetFilters = () => {
    setFollowTimeFilter('all');
    setLevelFilter('all');
    setBusinessStatusFilter('all');
    setNextFollowDateStart('');
    setNextFollowDateEnd('');
    fetchStores();
  };

  // 统一数据处理：将门店数据绑定到门店信息上（使用预计算数据和前端筛选结果）
  // 所有活跃门店（含绑定数据，用于合计统计）
  const allActiveStoresWithStoreData = useMemo(() => {
    // 使用 ref 获取门店列表，避免门店基础字段变化触发数据重新绑定
    const currentAllActiveStores = allActiveStoresRef.current;
    return currentAllActiveStores.map(store => {
      if (!store.store_id) return { ...store, storeData: null };

      // 优先从 storeDataCacheRef 获取（包含完整时间范围信息的缓存）
      const cacheKey = `${store.store_id}|${dataTimeStart || ''}|${dataTimeEnd || ''}`;
      const cached = storeDataCacheRef.current.get(cacheKey);

      if (cached !== undefined) {
        return { ...store, storeData: cached };
      }

      // 如果数据未准备好，尝试从旧缓存获取
      if (!isDataReady) {
        const oldCached = oldStoreDataCacheRef.current.get(cacheKey);
        if (oldCached !== undefined) {
          return { ...store, storeData: oldCached };
        }
      }

      // 缓存未命中，调用 getStoreData 计算（会自动写入缓存）
      return { ...store, storeData: getStoreData(store.store_id, dataTimeStart, dataTimeEnd) };
    });
  }, [storeBindVersionRef.current, getStoreData, dataTimeStart, dataTimeEnd, isDataReady]);

  const storesWithBindData = useMemo(() => {
    // 使用 ref 获取门店列表，避免门店基础字段变化触发数据重新绑定
    const currentFilteredStores = filteredStoresRef.current;
    return currentFilteredStores.map(store => {
      if (!store.store_id) return { ...store, storeData: null };

      // 优先从 storeDataCacheRef 获取（包含完整时间范围信息的缓存）
      const cacheKey = `${store.store_id}|${dataTimeStart || ''}|${dataTimeEnd || ''}`;
      const cached = storeDataCacheRef.current.get(cacheKey);

      if (cached !== undefined) {
        return { ...store, storeData: cached };
      }

      // 如果数据未准备好，尝试从旧缓存获取
      if (!isDataReady) {
        const oldCached = oldStoreDataCacheRef.current.get(cacheKey);
        if (oldCached !== undefined) {
          return { ...store, storeData: oldCached };
        }
      }

      // 缓存未命中，调用 getStoreData 计算（会自动写入缓存）
      return { ...store, storeData: getStoreData(store.store_id, dataTimeStart, dataTimeEnd) };
    });
  }, [storeBindVersionRef.current, getStoreData, dataTimeStart, dataTimeEnd, isDataReady]);

  // 计算所有门店的季度和月度合计数据
  const totalQuarterlyData = useMemo(() => {
    // 禁用缓存，因为需要根据 selectedTagLevel 动态筛选
    console.log('[totalQuarterlyData] 开始计算，dataRefreshKey:', dataRefreshKey, 'selectedTagLevel:', selectedTagLevel);

    if (!orderDataRef.current) return [];

    const quarterMap = new Map<string, {
      year: number;
      quarter: number;
      label: string;
      metrics: ReturnType<typeof createFullMetrics>;
    }>();

    // 辅助函数：设置季度数据
    const setQuarter = (year: number, quarter: number, label: string) => {
      quarterMap.set(`${year}-Q${quarter}`, {
        year,
        quarter,
        label,
        metrics: createFullMetrics()
      });
    };

    // 收集所有实际数据的日期范围
    const allDates = new Set<string>();
    // 记录有订单数据的日期
    const datesWithOrders = new Set<string>();

    // 收集订单数据日期
    Object.keys(orderDataRef.current.storeStats).forEach(storeId => {
      const storeStats = orderDataRef.current!.storeStats[storeId];
      Object.keys(storeStats.dailyStats).forEach(date => {
        allDates.add(date);
        datesWithOrders.add(date);
      });
    });
    Object.keys(orderDataRef.current.unmatchedDailyStats).forEach(date => {
      allDates.add(date);
      datesWithOrders.add(date);
    });

    // 收集核销数据日期
    if (verifyDataRef.current) {
      Object.keys(verifyDataRef.current.storeStats).forEach(storeId => {
        const storeStats = verifyDataRef.current!.storeStats[storeId];
        Object.keys(storeStats.dailyStats).forEach(date => {
          allDates.add(date);
        });
      });
      if (verifyDataRef.current.unmatchedDailyStats) {
        Object.keys(verifyDataRef.current.unmatchedDailyStats).forEach(date => {
          allDates.add(date);
        });
      }
    }

    // 收集广告数据日期
    if (adDataRef.current) {
      Object.keys(adDataRef.current.storeStats).forEach(storeId => {
        const storeStats = adDataRef.current!.storeStats[storeId];
        Object.keys(storeStats.dailyStats).forEach(date => {
          allDates.add(date);
        });
      });
      if (adDataRef.current.unmatchedDailyStats) {
        Object.keys(adDataRef.current.unmatchedDailyStats).forEach(date => {
          allDates.add(date);
        });
      }
    }

    // 如果没有数据，返回空数组
    if (allDates.size === 0) return [];

    // 计算最早和最晚的日期
    const sortedDates = Array.from(allDates).sort();
    const earliestDate = sortedDates[0];
    const latestDate = sortedDates[sortedDates.length - 1];

    // 解析最早和最晚日期的年份和季度
    const [earliestYear, earliestMonth] = earliestDate.split('-').map(Number);
    const [latestYear, latestMonth] = latestDate.split('-').map(Number);

    const earliestQuarter = Math.ceil(earliestMonth / 3);
    const latestQuarter = Math.ceil(latestMonth / 3);

    // 根据实际数据范围生成季度数据
    for (let year = earliestYear; year <= latestYear; year++) {
      const startQuarter = year === earliestYear ? earliestQuarter : 1;
      const endQuarter = year === latestYear ? latestQuarter : 4;

      for (let quarter = startQuarter; quarter <= endQuarter; quarter++) {
        setQuarter(year, quarter, `${year}年Q${quarter}`);
      }
    }

    // 累加实际数据（使用所有门店，不受筛选影响）
    allStoresCacheRef.current.forEach(store => {
      // 根据 selectedTagLevel 筛选门店
      let shouldInclude = true;
      if (selectedTagLevel !== 'all') {
        if (['S', 'A', 'B', 'C', 'C-'].includes(selectedTagLevel)) {
          const tagMap: Record<string, string> = {
            'S': 'S:核心店',
            'A': 'A:重点店',
            'B': 'B:一般店',
            'C': 'C:关注店',
            'C-': 'C-:问题店'
          };
          const targetTagName = tagMap[selectedTagLevel];
          // 检查门店是否有对应的标签
          const hasTag = store.store_tags?.some(tag => tag.tag_name === targetTagName) || false;
          shouldInclude = hasTag;
        } else if (selectedTagLevel === 'meili') {
          // 美丽妈妈：有"美丽妈妈"标签的门店
          const hasMeiliTag = store.store_tags?.some(tag => tag.tag_name === '美丽妈妈') || false;
          shouldInclude = hasMeiliTag;
        } else if (selectedTagLevel === 'direct') {
          // 直营店：有"直营店"标签的门店
          const hasDirectTag = store.store_tags?.some(tag => tag.tag_name === '直营店') || false;
          shouldInclude = hasDirectTag;
        } else if (selectedTagLevel === 'empty') {
          // 空：没有任何标签的门店
          const hasNoTags = !store.store_tags || store.store_tags.length === 0;
          shouldInclude = hasNoTags;
        }
      }
      
      // 根据 activeGroupId 筛选门店（分组筛选）
      if (shouldInclude && activeGroupId) {
        const group = storeGroups.find(g => g.id === activeGroupId);
        if (group) {
          const groupIdSet = new Set(group.store_ids.split(',').map(s => s.trim()).filter(Boolean));
          shouldInclude = !!(store.store_id && groupIdSet.has(store.store_id));
        }
      }
      
      if (!shouldInclude) {
        return; // 跳过不满足筛选条件的门店
      }
      
      if (!store.store_id) return;
      const storeStats = orderDataRef.current!.storeStats[store.store_id];
      if (!storeStats) return;

      Object.entries(storeStats.dailyStats).forEach(([date, dailyStats]) => {
        const stats = dailyStats as DailyOrderStats;
        const [year, month] = date.split('-').map(Number);
        const quarter = Math.ceil(month / 3);
        const quarterKey = `${year}-Q${quarter}`;

        if (quarterMap.has(quarterKey)) {
          const q = quarterMap.get(quarterKey)!;
          // 订单数据
          q.metrics.totalOrders += stats.orderCount;
          q.metrics.fakeOrders += stats.fakeOrderCount;
          q.metrics.refundCount += stats.refundCount || 0;
          q.metrics.unverifiedCount += stats.unverifiedCount;
          q.metrics.totalAmount += stats.orderAmount;
          q.metrics.fakeAmount += stats.fakeOrderAmount;
          q.metrics.refundAmount += stats.refundAmount || 0;
          q.metrics.unverifiedAmount += stats.unverifiedAmount;
          // 有效订单
          q.metrics.validOrders += stats.validOrderCount || 0;
          q.metrics.validOrderAmount += stats.validOrderAmount || 0;
        }
      });

      // 累加核销数据（核销数、核销金额、虚假核销和有效核销）
      const verifyStats = verifyDataRef.current?.storeStats[store.store_id];
      if (verifyStats) {
        Object.entries(verifyStats.dailyStats).forEach(([date, dailyStats]) => {
          const stats = dailyStats as DailyVerifyStats;
          const [year, month] = date.split("-").map(Number);
          const quarter = Math.ceil(month / 3);
          const quarterKey = `${year}-Q${quarter}`;

          if (quarterMap.has(quarterKey)) {
            const q = quarterMap.get(quarterKey)!;

            // 数据一致性校验
            const dailyVerifyCount = stats.verifyCount || 0;
            const dailyFakeVerifyCount = stats.fakeVerifyCount || 0;
            const dailyValidVerifyCount = stats.validVerifyCount || 0;
            const consistentVerifyCount = dailyVerifyCount === (dailyFakeVerifyCount + dailyValidVerifyCount)
              ? dailyVerifyCount
              : (dailyFakeVerifyCount + dailyValidVerifyCount);

            const dailyVerifyAmount = stats.verifyAmount || 0;
            const dailyFakeVerifyAmount = stats.fakeVerifyAmount || 0;
            const dailyValidVerifyAmount = stats.validVerifyAmount || 0;
            const consistentVerifyAmount = Math.abs(dailyVerifyAmount - (dailyFakeVerifyAmount + dailyValidVerifyAmount)) < 0.01
              ? dailyVerifyAmount
              : (dailyFakeVerifyAmount + dailyValidVerifyAmount);

            // 累加总数（使用校验后的数据）
            q.metrics.verifyCount += consistentVerifyCount;
            q.metrics.verifyAmount += consistentVerifyAmount;
            // 累加虚假核销（核销金额 ≤ 10元）
            q.metrics.fakeVerifyCount += dailyFakeVerifyCount;
            q.metrics.fakeVerifyAmount += dailyFakeVerifyAmount;
            // 累加有效核销（核销金额 > 10元）
            q.metrics.validVerifyCount += dailyValidVerifyCount;
            q.metrics.validVerifyAmount += dailyValidVerifyAmount;
          }
        });
      }

      // 累加广告数据（仅累加有订单数据的日期）
      const adStats = adDataRef.current?.storeStats[store.store_id];
      if (adStats) {
        Object.entries(adStats.dailyStats || adStats).forEach(([date, dailyStats]) => {
          // 只累加有订单数据的日期
          if (!datesWithOrders.has(date)) {
            return;
          }
          
          const stats = dailyStats as { spend?: number; orders?: number };
          const [year, month] = date.split('-').map(Number);
          const quarter = Math.ceil(month / 3);
          const quarterKey = `${year}-Q${quarter}`;

          if (quarterMap.has(quarterKey)) {
            const q = quarterMap.get(quarterKey)!;
            q.metrics.adSpend += stats.spend || 0;
          q.metrics.adOrders += stats.orders || 0;
            q.metrics.adOrders += stats.orders || 0;
          }
        });
      }
    });

    // 注意：当有门店等级筛选时，不移除未匹配数据，以保持数据一致性
    // 如果需要完全按门店筛选，可以取消下面代码的注释
    /*
    // 添加未匹配订单数据（仅在没有门店等级筛选时）
    if (selectedTagLevel === 'all') {
      Object.entries(orderDataRef.current.unmatchedDailyStats).forEach(([date, dailyStats]) => {
        const stats = dailyStats as DailyOrderStats;
        const [year, month] = date.split('-').map(Number);
        const quarter = Math.ceil(month / 3);
        const quarterKey = `${year}-Q${quarter}`;

        if (quarterMap.has(quarterKey)) {
          const q = quarterMap.get(quarterKey)!;
          q.metrics.totalOrders += stats.orderCount;
          q.metrics.fakeOrders += stats.fakeOrderCount;
          q.metrics.refundCount += stats.refundCount || 0;
          q.metrics.unverifiedCount += stats.unverifiedCount;
          q.metrics.totalAmount += stats.orderAmount;
          q.metrics.fakeAmount += stats.fakeOrderAmount;
          q.metrics.refundAmount += stats.refundAmount || 0;
          q.metrics.unverifiedAmount += stats.unverifiedAmount;
          q.metrics.validOrders += stats.validOrderCount || 0;
          q.metrics.validOrderAmount += stats.validOrderAmount || 0;
        }
      });
    }

    // 添加未匹配核销数据（仅在没有门店等级筛选时）
    if (selectedTagLevel === 'all' && verifyDataRef.current?.unmatchedDailyStats) {
      Object.entries(verifyDataRef.current.unmatchedDailyStats).forEach(([date, dailyStats]) => {
        const stats = dailyStats as DailyVerifyStats;
        const [year, month] = date.split("-").map(Number);
        const quarter = Math.ceil(month / 3);
        const quarterKey = `${year}-Q${quarter}`;

        if (quarterMap.has(quarterKey)) {
          const q = quarterMap.get(quarterKey)!;

          const dailyVerifyCount = stats.verifyCount || 0;
          const dailyFakeVerifyCount = stats.fakeVerifyCount || 0;
          const dailyValidVerifyCount = stats.validVerifyCount || 0;
          const consistentVerifyCount = dailyVerifyCount === (dailyFakeVerifyCount + dailyValidVerifyCount)
            ? dailyVerifyCount
            : (dailyFakeVerifyCount + dailyValidVerifyCount);

          const dailyVerifyAmount = stats.verifyAmount || 0;
          const dailyFakeVerifyAmount = stats.fakeVerifyAmount || 0;
          const dailyValidVerifyAmount = stats.validVerifyAmount || 0;
          const consistentVerifyAmount = Math.abs(dailyVerifyAmount - (dailyFakeVerifyAmount + dailyValidVerifyAmount)) < 0.01
            ? dailyVerifyAmount
            : (dailyFakeVerifyAmount + dailyValidVerifyAmount);

          q.metrics.verifyCount += consistentVerifyCount;
          q.metrics.verifyAmount += consistentVerifyAmount;
          q.metrics.fakeVerifyCount += dailyFakeVerifyCount;
          q.metrics.fakeVerifyAmount += dailyFakeVerifyAmount;
          q.metrics.validVerifyCount += dailyValidVerifyCount;
          q.metrics.validVerifyAmount += dailyValidVerifyAmount;
        }
      });
    }

    // 添加未匹配广告数据（仅在没有门店等级筛选时）
    if (selectedTagLevel === 'all' && adDataRef.current?.unmatchedDailyStats) {
      Object.entries(adDataRef.current.unmatchedDailyStats).forEach(([date, dailyStats]) => {
        const stats = dailyStats as { spend?: number; orders?: number };
        const [year, month] = date.split('-').map(Number);
        const quarter = Math.ceil(month / 3);
        const quarterKey = `${year}-Q${quarter}`;

        if (quarterMap.has(quarterKey)) {
          const q = quarterMap.get(quarterKey)!;
          q.metrics.adSpend += stats.spend || 0;
        }
      });
    }
    */

    // 计算比率
    quarterMap.forEach(q => {
      const total = q.metrics.totalOrders;
      if (total > 0) {
        q.metrics.verifyRate = (q.metrics.verifyCount / total) * 100;
      }
      const totalAmount = q.metrics.totalAmount;
      if (totalAmount > 0) {
        q.metrics.amountVerifyRate = (q.metrics.verifyAmount / totalAmount) * 100;
      }
      // 有效核销率
      if (q.metrics.validOrders > 0) {
        q.metrics.validVerifyRate = (q.metrics.validVerifyCount / q.metrics.validOrders) * 100;
      }
      if (q.metrics.validOrderAmount > 0) {
        q.metrics.validAmountRate = (q.metrics.validVerifyAmount / q.metrics.validOrderAmount) * 100;
      }
    });

    return Array.from(quarterMap.values())
      .filter(q => {
        // 只显示有数据的季度（与单门店详情一致）
        return q.metrics.totalOrders > 0 ||
               q.metrics.totalAmount > 0 ||
               q.metrics.verifyCount > 0 ||
               q.metrics.adSpend > 0;
      })
      .sort((a, b) => {
        if (a.year !== b.year) return a.year - b.year;
        return a.quarter - b.quarter;
      });
  }, [dataRefreshKey, selectedTagLevel, activeGroupId, storeGroups]);

  const totalMonthlyData = useMemo(() => {
    // 禁用缓存，因为需要根据 selectedTagLevel 动态筛选
    console.log('[totalMonthlyData] 开始计算，dataRefreshKey:', dataRefreshKey, 'selectedTagLevel:', selectedTagLevel);

    if (!orderDataRef.current) return [];

    const monthMap = new Map<string, {
      year: number;
      month: number;
      label: string;
      metrics: ReturnType<typeof createFullMetrics>;
    }>();

    // 收集所有实际数据的日期范围
    const allDates = new Set<string>();
    // 记录有订单数据的日期
    const datesWithOrders = new Set<string>();

    // 收集订单数据日期
    Object.keys(orderDataRef.current.storeStats).forEach(storeId => {
      const storeStats = orderDataRef.current!.storeStats[storeId];
      Object.keys(storeStats.dailyStats).forEach(date => {
        allDates.add(date);
        datesWithOrders.add(date);
      });
    });
    Object.keys(orderDataRef.current.unmatchedDailyStats).forEach(date => {
      allDates.add(date);
      datesWithOrders.add(date);
    });

    // 收集核销数据日期
    if (verifyDataRef.current) {
      Object.keys(verifyDataRef.current.storeStats).forEach(storeId => {
        const storeStats = verifyDataRef.current!.storeStats[storeId];
        Object.keys(storeStats.dailyStats).forEach(date => {
          allDates.add(date);
        });
      });
      if (verifyDataRef.current.unmatchedDailyStats) {
        Object.keys(verifyDataRef.current.unmatchedDailyStats).forEach(date => {
          allDates.add(date);
        });
      }
    }

    // 收集广告数据日期
    if (adDataRef.current) {
      Object.keys(adDataRef.current.storeStats).forEach(storeId => {
        const storeStats = adDataRef.current!.storeStats[storeId];
        Object.keys(storeStats.dailyStats).forEach(date => {
          allDates.add(date);
        });
      });
      if (adDataRef.current.unmatchedDailyStats) {
        Object.keys(adDataRef.current.unmatchedDailyStats).forEach(date => {
          allDates.add(date);
        });
      }
    }

    // 如果没有数据，返回空数组
    if (allDates.size === 0) return [];

    // 计算最早和最晚的日期（只以订单数据的时间为准）
    const sortedDates = Array.from(datesWithOrders).sort();
    const earliestDate = sortedDates[0];
    const latestDate = sortedDates[sortedDates.length - 1];

    // 解析最早和最晚日期的年份和月份
    const [earliestYear, earliestMonth] = earliestDate.split('-').map(Number);
    const [latestYear, latestMonth] = latestDate.split('-').map(Number);

    // 为每个月收集该月实际有订单数据的日期范围
    const monthDateRanges = new Map<string, { first: string; last: string }>();
    sortedDates.forEach(date => {
      const [year, month] = date.split('-').map(Number);
      const monthKey = `${year}-${String(month).padStart(2, '0')}`;
      const existing = monthDateRanges.get(monthKey);
      if (!existing) {
        monthDateRanges.set(monthKey, { first: date, last: date });
      } else {
        if (date < existing.first) {
          existing.first = date;
        }
        if (date > existing.last) {
          existing.last = date;
        }
      }
    });

    // 辅助函数：设置月度数据
    const setMonth = (year: number, month: number, label: string) => {
      monthMap.set(`${year}-${String(month).padStart(2, '0')}`, {
        year,
        month,
        label,
        metrics: createFullMetrics()
      });
    };

    // 根据实际数据范围生成月度数据
    for (let year = earliestYear; year <= latestYear; year++) {
      const startMonth = year === earliestYear ? earliestMonth : 1;
      const endMonth = year === latestYear ? latestMonth : 12;

      for (let month = startMonth; month <= endMonth; month++) {
        const monthKey = `${year}-${String(month).padStart(2, '0')}`;
        const dateRange = monthDateRanges.get(monthKey);
        
        // 格式化日期为 MM-DD 格式
        const formatMMDD = (dateStr: string) => {
          const [, m, d] = dateStr.split('-');
          return `${m}-${d}`;
        };
        
        // 生成标签：11月 (11-22 ~ 11-30)，如果是整月数据就只显示"11月"
        let label = `${month}月`;
        if (dateRange) {
          // 计算该月的第一天和最后一天
          const monthFirstDay = new Date(year, month - 1, 1);
          const monthLastDay = new Date(year, month, 0);
          const monthFirstDayStr = `${year}-${String(month).padStart(2, '0')}-01`;
          const monthLastDayStr = `${year}-${String(month).padStart(2, '0')}-${String(monthLastDay.getDate()).padStart(2, '0')}`;
          
          // 如果不是整月数据，才显示括号和日期
          if (dateRange.first !== monthFirstDayStr || dateRange.last !== monthLastDayStr) {
            label = `${month}月 (${formatMMDD(dateRange.first)} ~ ${formatMMDD(dateRange.last)})`;
          }
        }
        setMonth(year, month, label);
      }
    }

    // 累加实际数据（使用所有门店，不受筛选影响）
    allStoresCacheRef.current.forEach(store => {
      // 根据 selectedTagLevel 筛选门店
      let shouldInclude = true;
      if (selectedTagLevel !== 'all') {
        if (['S', 'A', 'B', 'C', 'C-'].includes(selectedTagLevel)) {
          const tagMap: Record<string, string> = {
            'S': 'S:核心店',
            'A': 'A:重点店',
            'B': 'B:一般店',
            'C': 'C:关注店',
            'C-': 'C-:问题店'
          };
          const targetTagName = tagMap[selectedTagLevel];
          // 检查门店是否有对应的标签
          const hasTag = store.store_tags?.some(tag => tag.tag_name === targetTagName) || false;
          shouldInclude = hasTag;
        } else if (selectedTagLevel === 'meili') {
          // 美丽妈妈：有"美丽妈妈"标签的门店
          const hasMeiliTag = store.store_tags?.some(tag => tag.tag_name === '美丽妈妈') || false;
          shouldInclude = hasMeiliTag;
        } else if (selectedTagLevel === 'direct') {
          // 直营店：有"直营店"标签的门店
          const hasDirectTag = store.store_tags?.some(tag => tag.tag_name === '直营店') || false;
          shouldInclude = hasDirectTag;
        } else if (selectedTagLevel === 'empty') {
          // 空：没有任何标签的门店
          const hasNoTags = !store.store_tags || store.store_tags.length === 0;
          shouldInclude = hasNoTags;
        }
      }
      
      // 根据 activeGroupId 筛选门店（分组筛选）
      if (shouldInclude && activeGroupId) {
        const group = storeGroups.find(g => g.id === activeGroupId);
        if (group) {
          const groupIdSet = new Set(group.store_ids.split(',').map(s => s.trim()).filter(Boolean));
          shouldInclude = !!(store.store_id && groupIdSet.has(store.store_id));
        }
      }
      
      if (!shouldInclude) {
        return; // 跳过不满足筛选条件的门店
      }
      
      if (!store.store_id) return;
      const storeStats = orderDataRef.current!.storeStats[store.store_id];
      if (!storeStats) return;

      Object.entries(storeStats.dailyStats).forEach(([date, dailyStats]) => {
        const stats = dailyStats as DailyOrderStats;
        const [year, month] = date.split('-').map(Number);
        const monthKey = `${year}-${String(month).padStart(2, '0')}`;

        if (monthMap.has(monthKey)) {
          const m = monthMap.get(monthKey)!;
          // 订单数据
          m.metrics.totalOrders += stats.orderCount;
          m.metrics.fakeOrders += stats.fakeOrderCount;
          m.metrics.refundCount += stats.refundCount || 0;
          m.metrics.unverifiedCount += stats.unverifiedCount;
          m.metrics.totalAmount += stats.orderAmount;
          m.metrics.fakeAmount += stats.fakeOrderAmount;
          m.metrics.refundAmount += stats.refundAmount || 0;
          m.metrics.unverifiedAmount += stats.unverifiedAmount;
          // 有效订单
          m.metrics.validOrders += stats.validOrderCount || 0;
          m.metrics.validOrderAmount += stats.validOrderAmount || 0;
        }
      });

      // 累加核销数据（核销数、核销金额、虚假核销和有效核销）
      const verifyStats = verifyDataRef.current?.storeStats[store.store_id];
      if (verifyStats) {
        Object.entries(verifyStats.dailyStats).forEach(([date, dailyStats]) => {
          const stats = dailyStats as DailyVerifyStats;
          const [year, month] = date.split("-").map(Number);
          const monthKey = `${year}-${String(month).padStart(2, "0")}`;

          if (monthMap.has(monthKey)) {
            const m = monthMap.get(monthKey)!;

            // 数据一致性校验
            const dailyVerifyCount = stats.verifyCount || 0;
            const dailyFakeVerifyCount = stats.fakeVerifyCount || 0;
            const dailyValidVerifyCount = stats.validVerifyCount || 0;
            const consistentVerifyCount = dailyVerifyCount === (dailyFakeVerifyCount + dailyValidVerifyCount)
              ? dailyVerifyCount
              : (dailyFakeVerifyCount + dailyValidVerifyCount);

            const dailyVerifyAmount = stats.verifyAmount || 0;
            const dailyFakeVerifyAmount = stats.fakeVerifyAmount || 0;
            const dailyValidVerifyAmount = stats.validVerifyAmount || 0;
            const consistentVerifyAmount = Math.abs(dailyVerifyAmount - (dailyFakeVerifyAmount + dailyValidVerifyAmount)) < 0.01
              ? dailyVerifyAmount
              : (dailyFakeVerifyAmount + dailyValidVerifyAmount);

            // 累加总数（使用校验后的数据）
            m.metrics.verifyCount += consistentVerifyCount;
            m.metrics.verifyAmount += consistentVerifyAmount;
            // 累加虚假核销（核销金额 ≤ 10元）
            m.metrics.fakeVerifyCount += dailyFakeVerifyCount;
            m.metrics.fakeVerifyAmount += dailyFakeVerifyAmount;
            // 累加有效核销（核销金额 > 10元）
            m.metrics.validVerifyCount += dailyValidVerifyCount;
            m.metrics.validVerifyAmount += dailyValidVerifyAmount;
          }
        });
      }

      // 累加广告数据（仅累加有订单数据的日期）
      const adStats = adDataRef.current?.storeStats[store.store_id];
      if (adStats) {
        Object.entries(adStats.dailyStats || adStats).forEach(([date, dailyStats]) => {
          // 只累加有订单数据的日期
          if (!datesWithOrders.has(date)) {
            return;
          }
          
          const stats = dailyStats as { spend?: number; orders?: number };
          const [year, month] = date.split('-').map(Number);
          const monthKey = `${year}-${String(month).padStart(2, '0')}`;

          if (monthMap.has(monthKey)) {
            const m = monthMap.get(monthKey)!;
            m.metrics.adSpend += stats.spend || 0;
          m.metrics.adOrders += stats.orders || 0;
            m.metrics.adOrders += stats.orders || 0;
          }
        });
      }
    });

    // 添加未匹配订单数据（仅在没有门店等级筛选时）
    if (selectedTagLevel === 'all') {
      Object.entries(orderDataRef.current.unmatchedDailyStats).forEach(([date, dailyStats]) => {
        const stats = dailyStats as DailyOrderStats;
        const [year, month] = date.split('-').map(Number);
        const monthKey = `${year}-${String(month).padStart(2, '0')}`;

        if (monthMap.has(monthKey)) {
          const m = monthMap.get(monthKey)!;
          m.metrics.totalOrders += stats.orderCount;
          m.metrics.fakeOrders += stats.fakeOrderCount;
          m.metrics.refundCount += stats.refundCount || 0;
          m.metrics.unverifiedCount += stats.unverifiedCount;
          m.metrics.totalAmount += stats.orderAmount;
          m.metrics.fakeAmount += stats.fakeOrderAmount;
          m.metrics.refundAmount += stats.refundAmount || 0;
          m.metrics.unverifiedAmount += stats.unverifiedAmount;
          m.metrics.validOrders += stats.validOrderCount || 0;
          m.metrics.validOrderAmount += stats.validOrderAmount || 0;
        }
      });
    }

    // 添加未匹配核销数据（仅在没有门店等级筛选时）
    if (selectedTagLevel === 'all' && verifyDataRef.current?.unmatchedDailyStats) {
      Object.entries(verifyDataRef.current.unmatchedDailyStats).forEach(([date, dailyStats]) => {
        const stats = dailyStats as DailyVerifyStats;
        const [year, month] = date.split('-').map(Number);
        const monthKey = `${year}-${String(month).padStart(2, '0')}`;

        if (monthMap.has(monthKey)) {
          const m = monthMap.get(monthKey)!;

          // 数据一致性校验
          const dailyVerifyCount = stats.verifyCount || 0;
          const dailyFakeVerifyCount = stats.fakeVerifyCount || 0;
          const dailyValidVerifyCount = stats.validVerifyCount || 0;
          const consistentVerifyCount = dailyVerifyCount === (dailyFakeVerifyCount + dailyValidVerifyCount)
            ? dailyVerifyCount
            : (dailyFakeVerifyCount + dailyValidVerifyCount);

          const dailyVerifyAmount = stats.verifyAmount || 0;
          const dailyFakeVerifyAmount = stats.fakeVerifyAmount || 0;
          const dailyValidVerifyAmount = stats.validVerifyAmount || 0;
          const consistentVerifyAmount = Math.abs(dailyVerifyAmount - (dailyFakeVerifyAmount + dailyValidVerifyAmount)) < 0.01
            ? dailyVerifyAmount
            : (dailyFakeVerifyAmount + dailyValidVerifyAmount);

          // 累加总数（使用校验后的数据）
          m.metrics.verifyCount += consistentVerifyCount;
          m.metrics.verifyAmount += consistentVerifyAmount;
          m.metrics.fakeVerifyCount += dailyFakeVerifyCount;
          m.metrics.fakeVerifyAmount += dailyFakeVerifyAmount;
          m.metrics.validVerifyCount += dailyValidVerifyCount;
          m.metrics.validVerifyAmount += dailyValidVerifyAmount;
        }
      });
    }

    // 添加未匹配广告数据（仅在没有门店等级筛选时）
    if (selectedTagLevel === 'all' && adDataRef.current?.unmatchedDailyStats) {
      Object.entries(adDataRef.current.unmatchedDailyStats).forEach(([date, dailyStats]) => {
        const stats = dailyStats as { spend?: number; orders?: number };
        const [year, month] = date.split('-').map(Number);
        const monthKey = `${year}-${String(month).padStart(2, '0')}`;

        if (monthMap.has(monthKey)) {
          const m = monthMap.get(monthKey)!;
          m.metrics.adSpend += stats.spend || 0;
        }
      });
    }

    // 计算比率
    monthMap.forEach(m => {
      const total = m.metrics.totalOrders;
      if (total > 0) {
        m.metrics.verifyRate = (m.metrics.verifyCount / total) * 100;
      }
      const totalAmount = m.metrics.totalAmount;
      if (totalAmount > 0) {
        m.metrics.amountVerifyRate = (m.metrics.verifyAmount / totalAmount) * 100;
      }
      // 有效核销率
      if (m.metrics.validOrders > 0) {
        m.metrics.validVerifyRate = (m.metrics.validVerifyCount / m.metrics.validOrders) * 100;
      }
      if (m.metrics.validOrderAmount > 0) {
        m.metrics.validAmountRate = (m.metrics.validVerifyAmount / m.metrics.validOrderAmount) * 100;
      }
    });

    return Array.from(monthMap.values())
      .filter(m => {
        // 只显示有数据的月份（与单门店详情一致）
        return m.metrics.totalOrders > 0 ||
               m.metrics.totalAmount > 0 ||
               m.metrics.verifyCount > 0 ||
               m.metrics.adSpend > 0;
      })
      .sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.month - b.month;
    });
  }, [dataRefreshKey, selectedTagLevel, activeGroupId, storeGroups]);

  // 计算所有门店的日数据合计
  const totalDailyData = useMemo(() => {
    // 禁用缓存，因为需要根据 selectedTagLevel 动态筛选
    console.log('[totalDailyData] 开始计算，dataRefreshKey:', dataRefreshKey, 'selectedTagLevel:', selectedTagLevel);

    if (!orderDataRef.current) return [];

    const dailyMap = new Map<string, {
      date: string;
      totalOrders: number;
      fakeOrders: number;
      refundCount: number;
      unverifiedCount: number;
      verifyCount: number;
      fakeVerifyCount: number;
      verifyRate: number;
      totalAmount: number;
      fakeAmount: number;
      refundAmount: number;
      unverifiedAmount: number;
      verifyAmount: number;
      fakeVerifyAmount: number;
      amountVerifyRate: number;
      validOrders: number;
      validOrderAmount: number;
      validVerifyCount: number;
      validVerifyAmount: number;
      validVerifyRate: number;
      validAmountRate: number;
      adSpend: number;
      adOrders: number;
    }>();

    // 辅助函数：设置日数据
    const setDay = (date: string) => {
      dailyMap.set(date, {
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
        adOrders: 0,
      });
    };

    // 收集所有实际数据的日期范围
    const allDates = new Set<string>();
    // 记录有订单数据的日期
    const datesWithOrders = new Set<string>();

    // 收集订单数据日期
    Object.keys(orderDataRef.current.storeStats).forEach(storeId => {
      const storeStats = orderDataRef.current!.storeStats[storeId];
      Object.keys(storeStats.dailyStats).forEach(date => {
        allDates.add(date);
        datesWithOrders.add(date);
      });
    });
    Object.keys(orderDataRef.current.unmatchedDailyStats).forEach(date => {
      allDates.add(date);
      datesWithOrders.add(date);
    });

    // 收集核销数据日期
    if (verifyDataRef.current) {
      Object.keys(verifyDataRef.current.storeStats).forEach(storeId => {
        const storeStats = verifyDataRef.current!.storeStats[storeId];
        Object.keys(storeStats.dailyStats).forEach(date => {
          allDates.add(date);
        });
      });
      if (verifyDataRef.current.unmatchedDailyStats) {
        Object.keys(verifyDataRef.current.unmatchedDailyStats).forEach(date => {
          allDates.add(date);
        });
      }
    }

    // 收集广告数据日期
    if (adDataRef.current) {
      Object.keys(adDataRef.current.storeStats).forEach(storeId => {
        const storeStats = adDataRef.current!.storeStats[storeId];
        Object.keys(storeStats.dailyStats).forEach(date => {
          allDates.add(date);
        });
      });
      if (adDataRef.current.unmatchedDailyStats) {
        Object.keys(adDataRef.current.unmatchedDailyStats).forEach(date => {
          allDates.add(date);
        });
      }
    }

    // 如果没有数据，返回空数组
    if (allDates.size === 0) return [];

    // 根据实际数据范围初始化日期
    const sortedDates = Array.from(allDates).sort();
    sortedDates.forEach(date => {
      setDay(date);
    });

    // 累加实际数据（使用所有门店，不受筛选影响）
    allStoresCacheRef.current.forEach(store => {
      // 根据 selectedTagLevel 筛选门店
      let shouldInclude = true;
      if (selectedTagLevel !== 'all') {
        if (['S', 'A', 'B', 'C', 'C-'].includes(selectedTagLevel)) {
          const tagMap: Record<string, string> = {
            'S': 'S:核心店',
            'A': 'A:重点店',
            'B': 'B:一般店',
            'C': 'C:关注店',
            'C-': 'C-:问题店'
          };
          const targetTagName = tagMap[selectedTagLevel];
          // 检查门店是否有对应的标签
          const hasTag = store.store_tags?.some(tag => tag.tag_name === targetTagName) || false;
          shouldInclude = hasTag;
        } else if (selectedTagLevel === 'meili') {
          // 美丽妈妈：有"美丽妈妈"标签的门店
          const hasMeiliTag = store.store_tags?.some(tag => tag.tag_name === '美丽妈妈') || false;
          shouldInclude = hasMeiliTag;
        } else if (selectedTagLevel === 'direct') {
          // 直营店：有"直营店"标签的门店
          const hasDirectTag = store.store_tags?.some(tag => tag.tag_name === '直营店') || false;
          shouldInclude = hasDirectTag;
        } else if (selectedTagLevel === 'empty') {
          // 空：没有任何标签的门店
          const hasNoTags = !store.store_tags || store.store_tags.length === 0;
          shouldInclude = hasNoTags;
        }
      }
      
      // 根据 activeGroupId 筛选门店（分组筛选）
      if (shouldInclude && activeGroupId) {
        const group = storeGroups.find(g => g.id === activeGroupId);
        if (group) {
          const groupIdSet = new Set(group.store_ids.split(',').map(s => s.trim()).filter(Boolean));
          shouldInclude = !!(store.store_id && groupIdSet.has(store.store_id));
        }
      }
      
      if (!shouldInclude) {
        return; // 跳过不满足筛选条件的门店
      }
      
      if (!store.store_id) return;
      const storeStats = orderDataRef.current!.storeStats[store.store_id];
      if (!storeStats) return;

      Object.entries(storeStats.dailyStats).forEach(([date, dailyStats]) => {
        const stats = dailyStats as DailyOrderStats;

        if (dailyMap.has(date)) {
          const d = dailyMap.get(date)!;
          // 订单数据
          d.totalOrders += stats.orderCount;
          d.fakeOrders += stats.fakeOrderCount;
          d.refundCount += stats.refundCount || 0;
          d.unverifiedCount += stats.unverifiedCount;
          d.totalAmount += stats.orderAmount;
          d.fakeAmount += stats.fakeOrderAmount;
          d.refundAmount += stats.refundAmount || 0;
          d.unverifiedAmount += stats.unverifiedAmount;
          // 有效订单
          d.validOrders += stats.validOrderCount || 0;
          d.validOrderAmount += stats.validOrderAmount || 0;
        }
      });

      // 累加核销数据（核销数、核销金额、虚假核销和有效核销）
      const verifyStats = verifyDataRef.current?.storeStats[store.store_id];
      if (verifyStats) {
        Object.entries(verifyStats.dailyStats).forEach(([date, dailyStats]) => {
          const stats = dailyStats as DailyVerifyStats;

          if (dailyMap.has(date)) {
            const d = dailyMap.get(date)!;

            // 数据一致性校验
            const dailyVerifyCount = stats.verifyCount || 0;
            const dailyFakeVerifyCount = stats.fakeVerifyCount || 0;
            const dailyValidVerifyCount = stats.validVerifyCount || 0;
            const consistentVerifyCount = dailyVerifyCount === (dailyFakeVerifyCount + dailyValidVerifyCount)
              ? dailyVerifyCount
              : (dailyFakeVerifyCount + dailyValidVerifyCount);

            const dailyVerifyAmount = stats.verifyAmount || 0;
            const dailyFakeVerifyAmount = stats.fakeVerifyAmount || 0;
            const dailyValidVerifyAmount = stats.validVerifyAmount || 0;
            const consistentVerifyAmount = Math.abs(dailyVerifyAmount - (dailyFakeVerifyAmount + dailyValidVerifyAmount)) < 0.01
              ? dailyVerifyAmount
              : (dailyFakeVerifyAmount + dailyValidVerifyAmount);

            // 累加总数（使用校验后的数据）
            d.verifyCount += consistentVerifyCount;
            d.verifyAmount += consistentVerifyAmount;
            // 累加虚假核销（核销金额 ≤ 10元）
            d.fakeVerifyCount += dailyFakeVerifyCount;
            d.fakeVerifyAmount += dailyFakeVerifyAmount;
            // 累加有效核销（核销金额 > 10元）
            d.validVerifyCount += dailyValidVerifyCount;
            d.validVerifyAmount += dailyValidVerifyAmount;
          }
        });
      }

      // 累加广告数据（仅累加有订单数据的日期）
      const adStats = adDataRef.current?.storeStats[store.store_id];
      if (adStats) {
        Object.entries(adStats.dailyStats || adStats).forEach(([date, dailyStats]) => {
          // 只累加有订单数据的日期
          if (!datesWithOrders.has(date)) {
            return;
          }
          
          const stats = dailyStats as { spend?: number; orders?: number };

          if (dailyMap.has(date)) {
            const d = dailyMap.get(date)!;
            d.adSpend += stats.spend || 0;
            d.adOrders += stats.orders || 0;
          }
        });
      }
    });

    // 添加未匹配订单数据（仅在没有门店等级筛选时）
    if (selectedTagLevel === 'all') {
      Object.entries(orderDataRef.current.unmatchedDailyStats).forEach(([date, dailyStats]) => {
      const stats = dailyStats as DailyOrderStats;

      if (dailyMap.has(date)) {
        const d = dailyMap.get(date)!;
        d.totalOrders += stats.orderCount;
        d.fakeOrders += stats.fakeOrderCount;
        d.refundCount += stats.refundCount || 0;
        d.unverifiedCount += stats.unverifiedCount;
        // 注意：核销数应该从核销数据表获取，不从订单数据推算
        d.totalAmount += stats.orderAmount;
        d.fakeAmount += stats.fakeOrderAmount;
        d.refundAmount += stats.refundAmount || 0;
        d.unverifiedAmount += stats.unverifiedAmount;
        // 注意：核销金额应该从核销数据表获取，不从订单数据推算
        d.validOrders += stats.validOrderCount || 0;
        d.validOrderAmount += stats.validOrderAmount || 0;
      }
      });
    }

    // 添加未匹配核销数据（仅在没有门店等级筛选时）
    if (selectedTagLevel === 'all' && verifyDataRef.current?.unmatchedDailyStats) {
      Object.entries(verifyDataRef.current.unmatchedDailyStats).forEach(([date, dailyStats]) => {
        const stats = dailyStats as DailyVerifyStats;

        if (dailyMap.has(date)) {
          const d = dailyMap.get(date)!;

          // 数据一致性校验
          const dailyVerifyCount = stats.verifyCount || 0;
          const dailyFakeVerifyCount = stats.fakeVerifyCount || 0;
          const dailyValidVerifyCount = stats.validVerifyCount || 0;
          const consistentVerifyCount = dailyVerifyCount === (dailyFakeVerifyCount + dailyValidVerifyCount)
            ? dailyVerifyCount
            : (dailyFakeVerifyCount + dailyValidVerifyCount);

          const dailyVerifyAmount = stats.verifyAmount || 0;
          const dailyFakeVerifyAmount = stats.fakeVerifyAmount || 0;
          const dailyValidVerifyAmount = stats.validVerifyAmount || 0;
          const consistentVerifyAmount = Math.abs(dailyVerifyAmount - (dailyFakeVerifyAmount + dailyValidVerifyAmount)) < 0.01
            ? dailyVerifyAmount
            : (dailyFakeVerifyAmount + dailyValidVerifyAmount);

          // 累加总数（使用校验后的数据）
          d.verifyCount += consistentVerifyCount;
          d.verifyAmount += consistentVerifyAmount;
          d.fakeVerifyCount += dailyFakeVerifyCount;
          d.fakeVerifyAmount += dailyFakeVerifyAmount;
          d.validVerifyCount += dailyValidVerifyCount;
          d.validVerifyAmount += dailyValidVerifyAmount;
        }
      });
    }

    // 添加未匹配广告数据（仅在没有门店等级筛选时）
    if (selectedTagLevel === 'all' && adDataRef.current?.unmatchedDailyStats) {
      Object.entries(adDataRef.current.unmatchedDailyStats).forEach(([date, dailyStats]) => {
        const stats = dailyStats as { spend?: number; orders?: number };

        if (dailyMap.has(date)) {
          const d = dailyMap.get(date)!;
          d.adSpend += stats.spend || 0;
          d.adOrders += stats.orders || 0;
        }
      });
    }

    // 打印 2026-04-21 的广告费总和（调试）
    if (dailyMap.has('2026-04-21')) {
      const dayData = dailyMap.get('2026-04-21')!;
      console.log('[totalDailyData] 2026-04-21 广告费合计:', dayData.adSpend);
    }

    // 计算比率
    dailyMap.forEach(d => {
      if (d.totalOrders > 0) {
        d.verifyRate = (d.verifyCount / d.totalOrders) * 100;
      }
      if (d.totalAmount > 0) {
        d.amountVerifyRate = (d.verifyAmount / d.totalAmount) * 100;
      }
      // 有效核销率
      if (d.validOrders > 0) {
        d.validVerifyRate = (d.validVerifyCount / d.validOrders) * 100;
      }
      if (d.validOrderAmount > 0) {
        d.validAmountRate = (d.validVerifyAmount / d.validOrderAmount) * 100;
      }
    });

    const result = Array.from(dailyMap.values())
      .filter(d => {
        // 只显示有数据的日期（与单门店详情一致）
        return d.totalOrders > 0 ||
               d.totalAmount > 0 ||
               d.verifyCount > 0 ||
               d.adSpend > 0;
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    return result;
  }, [dataRefreshKey, selectedTagLevel, activeGroupId, storeGroups]);

  // 统一排序后的结果（切换视图时保持排序不变）
  const displayStores = useMemo(() => {
    // 使用 filteredStores，已经包含了所有门店筛选条件（包括等级筛选排除"取消合作"门店）
    let filtered = filteredStores.map(store => {
      // 附加 storeData
      if (!store.store_id) return { ...store, storeData: null };

      const cacheKey = `${store.store_id}|${dataTimeStart || ''}|${dataTimeEnd || ''}`;
      const cached = storeDataCacheRef.current.get(cacheKey);

      if (cached !== undefined) {
        return { ...store, storeData: cached };
      }

      if (!isDataReady) {
        const oldCached = oldStoreDataCacheRef.current.get(cacheKey);
        if (oldCached !== undefined) {
          return { ...store, storeData: oldCached };
        }
      }

      return { ...store, storeData: getStoreData(store.store_id, dataTimeStart, dataTimeEnd) };
    });

    // 应用AI智能筛选
    if (aiFilters.length > 0) {
      filtered = filtered.filter(store => applyAiFiltersToStore(store));
    }

    // 如果没有设置排序，默认按有效单数从大到小排序，已取消合作的门店移到列表最后
    if (!sortField) {
      const withData = filtered.filter(s => s.storeData);
      const withoutData = filtered.filter(s => !s.storeData);
      // 按有效单数从大到小排序
      const sortedWithData = withData.sort((a, b) => {
        const validA = a.storeData?.validOrders ?? 0;
        const validB = b.storeData?.validOrders ?? 0;
        return validB - validA; // 降序
      });
      // 已取消合作的门店移到列表最后
      const normalStores = sortedWithData.filter(s => s.business_status !== '取消合作');
      const cancelledStores = sortedWithData.filter(s => s.business_status === '取消合作');
      return [...normalStores, ...cancelledStores, ...withoutData];
    }
    
    // 有排序字段时，所有门店一起排序
    return filtered.sort((a, b) => {
      let valueA: number = 0;
      let valueB: number = 0;

      if (sortField === 'nextFollowTime') {
        // 下次跟进时间排序
        valueA = a.latest_next_follow_time ? new Date(a.latest_next_follow_time).getTime() : Infinity;
        valueB = b.latest_next_follow_time ? new Date(b.latest_next_follow_time).getTime() : Infinity;
      } else {
        // 数据字段排序
        const dataA = a.storeData;
        const dataB = b.storeData;

        if (!dataA && !dataB) return 0;
        if (!dataA) return 1;
        if (!dataB) return -1;

        switch (sortField) {
            case 'adInvestment':
              valueA = parseFloat(dataA.adInvestment) || 0;
              valueB = parseFloat(dataB.adInvestment) || 0;
              break;
            case 'totalOrders':
              valueA = dataA.totalOrders ?? 0;
              valueB = dataB.totalOrders ?? 0;
              break;
            case 'adOrders':
              valueA = dataA.adOrders ?? 0;
              valueB = dataB.adOrders ?? 0;
              break;
            case 'adOrdersRate':
              valueA = parseFloat(dataA.adOrdersRate) || 0;
              valueB = parseFloat(dataB.adOrdersRate) || 0;
              break;
            case 'fakeOrders':
              valueA = dataA.fakeOrders ?? 0;
              valueB = dataB.fakeOrders ?? 0;
              break;
            case 'validOrders':
              valueA = dataA.validOrders ?? 0;
              valueB = dataB.validOrders ?? 0;
              break;
            case 'refundCount':
              // 退款数：null 值排在最后
              if (dataA.refundCount === null && dataB.refundCount === null) {
                valueA = valueB = 0;
              } else if (dataA.refundCount === null) {
                valueA = Infinity;
                valueB = dataB.refundCount ?? 0;
              } else if (dataB.refundCount === null) {
                valueA = dataA.refundCount;
                valueB = Infinity;
              } else {
                valueA = dataA.refundCount;
                valueB = dataB.refundCount;
              }
              break;
            case 'unverifiedCount':
              valueA = dataA.unverifiedCount ?? 0;
              valueB = dataB.unverifiedCount ?? 0;
              break;
            case 'verifyCount':
              valueA = dataA.verifyCount ?? 0;
              valueB = dataB.verifyCount ?? 0;
              break;
            case 'fakeVerifyCount':
              valueA = dataA.fakeVerifyCount ?? 0;
              valueB = dataB.fakeVerifyCount ?? 0;
              break;
            case 'validVerifyCount':
              valueA = dataA.validVerifyCount ?? 0;
              valueB = dataB.validVerifyCount ?? 0;
              break;
            case 'verifyRate':
              valueA = parseFloat(dataA.verifyRate || '0');
              valueB = parseFloat(dataB.verifyRate || '0');
              break;
            case 'totalAmount':
              valueA = parseFloat(dataA.totalAmount || '0');
              valueB = parseFloat(dataB.totalAmount || '0');
              break;
            case 'fakeAmount':
              valueA = parseFloat(dataA.fakeAmount || '0');
              valueB = parseFloat(dataB.fakeAmount || '0');
              break;
            case 'refundAmount':
              // 退款金额：null 值排在最后
              if (dataA.refundAmount === null && dataB.refundAmount === null) {
                valueA = valueB = 0;
              } else if (dataA.refundAmount === null) {
                valueA = Infinity;
                valueB = parseFloat(dataB.refundAmount || '0');
              } else if (dataB.refundAmount === null) {
                valueA = parseFloat(dataA.refundAmount);
                valueB = Infinity;
              } else {
                valueA = parseFloat(dataA.refundAmount);
                valueB = parseFloat(dataB.refundAmount);
              }
              break;
            case 'unverifiedAmount':
              valueA = parseFloat(dataA.unverifiedAmount || '0');
              valueB = parseFloat(dataB.unverifiedAmount || '0');
              break;
            case 'verifyAmount':
              valueA = parseFloat(dataA.verifyAmount || '0');
              valueB = parseFloat(dataB.verifyAmount || '0');
              break;
            case 'amountVerifyRate':
              valueA = parseFloat(dataA.amountVerifyRate || '0');
              valueB = parseFloat(dataB.amountVerifyRate || '0');
              break;
            case 'validVerifyRate':
              valueA = parseFloat(dataA.validVerifyRate || '0');
              valueB = parseFloat(dataB.validVerifyRate || '0');
              break;
            case 'validOrderCost':
              // 有效订单成本：广告投入 / 有效订单数
              const validOrdersA = dataA.validOrders > 0 ? dataA.adInvestment / dataA.validOrders : 0;
              const validOrdersB = dataB.validOrders > 0 ? dataB.adInvestment / dataB.validOrders : 0;
              valueA = validOrdersA;
              valueB = validOrdersB;
              break;
          }

          // 安全检查：如果值不是有效数字，则设为 0
          if (isNaN(valueA)) valueA = 0;
          if (isNaN(valueB)) valueB = 0;
        }

      return sortOrder === 'asc' ? valueA - valueB : valueB - valueA;
      });
  }, [storesWithBindData, sortField, sortOrder, hideCancelledStores, dataTimeStart, dataTimeEnd, aiFilters, applyAiFiltersToStore]);

  // 全选/取消全选 - 使用 useCallback 优化
  const handleSelectAll = useCallback((checked: boolean) => {
    setSelectAll(checked);
    if (checked) {
      setSelectedIds(new Set(displayStores.map(s => s.id)));
    } else {
      setSelectedIds(new Set());
    }
  }, [displayStores]);

  // 单选 - 使用 useCallback 优化
  const handleSelectOne = useCallback((id: string, checked: boolean) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (checked) {
        newSet.add(id);
      } else {
        newSet.delete(id);
      }
      return newSet;
    });
  }, []);

  // 计算各分类统计数量（基于所有门店，排除取消合作）
  const categoryStats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);

    const stats = {
      total: 0,
      todayFollow: 0,
      overdue: 0,
      pending: 0,
      noNextTime: 0,
    };

    // 排除"取消合作"状态的门店，使用所有门店数据
    const activeStores = stores.filter(store => store.business_status !== '取消合作');

    stats.total = activeStores.length;

    activeStores.forEach(store => {
      const nextTime = store.latest_next_follow_time;
      if (!nextTime) {
        stats.noNextTime++;
      } else {
        const nextDate = new Date(nextTime);
        if (nextDate < today) {
          stats.overdue++;
        } else if (nextDate >= today && nextDate <= todayEnd) {
          stats.todayFollow++;
        } else {
          stats.pending++;
        }
      }
    });

    return stats;
  }, [stores]);

  // 计算表头合计统计数据（基于筛选后的门店）
  const headerStats = useMemo(() => {
    // 服务状态统计
    let operatingCount = 0;
    // 联系人统计
    let totalContacts = 0;

    filteredStores.forEach(store => {
      // 服务状态统计
      if (store.business_status === '服务中') {
        operatingCount++;
      }

      // 联系人统计
      if (store.contacts && Array.isArray(store.contacts)) {
        totalContacts += store.contacts.length;
      }
    });

    // 数据模式合计
    let dataTotals = {
      // 数量类字段
      totalOrders: 0,
      fakeOrders: 0,
      validOrders: 0,
      refundCount: 0,
      unverifiedCount: 0,
      verifyCount: 0,
      fakeVerifyCount: 0,
      validVerifyCount: 0,
      verifyRate: 0,
      validVerifyRate: 0,
      // 广告费字段
      adInvestment: 0,
      adOrders: 0,
      adOrdersRate: 0,
      // 金额类字段（门店匹配）
      totalAmount: 0,
      fakeAmount: 0,
      validOrderAmount: 0,
      refundAmount: 0,
      unverifiedAmount: 0,
      verifyAmount: 0,
      fakeVerifyAmount: 0,
      validVerifyAmount: 0,
      amountVerifyRate: 0,
      validAmountRate: 0,
      // 金额类字段（未匹配）
      unmatchedTotalAmount: 0,
      unmatchedFakeAmount: 0,
      unmatchedValidOrderAmount: 0,
      unmatchedRefundAmount: 0,
      unmatchedUnverifiedAmount: 0,
      unmatchedVerifyAmount: 0,
      unmatchedFakeVerifyAmount: 0,
      unmatchedValidVerifyAmount: 0,
      // 原始数据统计
      rawOrderCount: 0,
      rawOrderAmount: 0,
      filteredOrderCount: 0,
      filteredOrderAmount: 0,
      // 文件状态
      hasRefundFile: false,
    };

    if (isDataMode) {
      // 直接统计聚合订单文件数据
      const orderData = orderDataRef.current;
      if (orderData) {
        // 原始数据总数和总额（从stats字段获取）
        dataTotals.rawOrderCount = orderData.stats.totalRecords;
        // 遍历所有门店统计金额
        let totalRawAmount = 0;
        Object.values(orderData.storeStats).forEach(stats => {
          totalRawAmount += stats.totalOrderAmount;
        });
        // 加上未匹配数据的金额
        totalRawAmount += orderData.unmatchedTotal.orderAmount;
        dataTotals.rawOrderAmount = totalRawAmount;
        
        // 按时间筛选后的数据
        const isInRange = (dateStr: string, start: string, end: string) => {
          if (!start && !end) return true;
          if (!dateStr) return false;
          if (start && dateStr < start) return false;
          if (end && dateStr > end) return false;
          return true;
        };
        
        // 计算筛选后的统计
        if (dataTimeStart || dataTimeEnd) {
          let filteredCount = 0;
          let filteredAmount = 0;
          
          // 遍历所有门店的每日统计
          Object.values(orderData.storeStats).forEach(storeStats => {
            Object.entries(storeStats.dailyStats).forEach(([date, dailyStats]) => {
              if (isInRange(date, dataTimeStart || '', dataTimeEnd || '')) {
                filteredCount += dailyStats.orderCount;
                filteredAmount += dailyStats.orderAmount;
              }
            });
          });
          
          // 遍历未匹配数据的每日统计
          Object.entries(orderData.unmatchedDailyStats).forEach(([date, dailyStats]) => {
            if (isInRange(date, dataTimeStart || '', dataTimeEnd || '')) {
              filteredCount += dailyStats.orderCount;
              filteredAmount += dailyStats.orderAmount;
            }
          });
          
          dataTotals.filteredOrderCount = filteredCount;
          dataTotals.filteredOrderAmount = filteredAmount;
        } else {
          dataTotals.filteredOrderCount = orderData.stats.totalRecords;
          dataTotals.filteredOrderAmount = totalRawAmount;
        }
      }
      
      // 遍历筛选后的门店计算合计（受筛选条件影响）
      storesWithBindData.forEach(store => {
        const data = store.storeData;
        if (data) {
          // 数量类
          dataTotals.totalOrders += data.totalOrders;
          dataTotals.fakeOrders += data.fakeOrders;
          dataTotals.validOrders += data.validOrders;
          dataTotals.refundCount += data.refundCount || 0;
          dataTotals.unverifiedCount += data.unverifiedCount;
          dataTotals.verifyCount += data.verifyCount;
          dataTotals.fakeVerifyCount += data.fakeVerifyCount;
          dataTotals.validVerifyCount += data.validVerifyCount;
          // 广告费
          dataTotals.adInvestment += parseFloat(String(data.adInvestment)) || 0;
          dataTotals.adOrders += data.adOrders || 0;
          // 金额类（门店匹配）- 注意：storeData中的金额是字符串，需要parseFloat
          dataTotals.totalAmount += parseFloat(String(data.totalAmount)) || 0;
          dataTotals.fakeAmount += parseFloat(String(data.fakeAmount)) || 0;
          dataTotals.validOrderAmount += parseFloat(String(data.validOrderAmount)) || 0;
          dataTotals.refundAmount += data.refundAmount ? parseFloat(String(data.refundAmount)) : 0;
          dataTotals.unverifiedAmount += parseFloat(String(data.unverifiedAmount)) || 0;
          dataTotals.verifyAmount += parseFloat(String(data.verifyAmount)) || 0;
          dataTotals.fakeVerifyAmount += parseFloat(String(data.fakeVerifyAmount)) || 0;
          dataTotals.validVerifyAmount += parseFloat(String(data.validVerifyAmount)) || 0;
          // 状态
          if (data.hasRefundFile) {
            dataTotals.hasRefundFile = true;
          }
        }
      });
      
      // 累加未匹配数据（仅金额类字段，不累加数量类）
      if (unmatchedData) {
        // 金额类字段（未匹配）
        dataTotals.unmatchedTotalAmount = unmatchedData.totalAmount || 0;
        dataTotals.unmatchedFakeAmount = unmatchedData.fakeAmount || 0;
        dataTotals.unmatchedValidOrderAmount = unmatchedData.validOrderAmount || 0;
        dataTotals.unmatchedRefundAmount = unmatchedData.refundAmount || 0;
        dataTotals.unmatchedUnverifiedAmount = unmatchedData.unverifiedAmount || 0;
        dataTotals.unmatchedVerifyAmount = unmatchedData.verifyAmount || 0;
        dataTotals.unmatchedFakeVerifyAmount = unmatchedData.fakeVerifyAmount || 0;
        dataTotals.unmatchedValidVerifyAmount = unmatchedData.validVerifyAmount || 0;
      }

      // 计算广告费占比
      dataTotals.adOrdersRate = dataTotals.totalOrders > 0
        ? (dataTotals.adOrders / dataTotals.totalOrders * 100)
        : 0;
      
      // 计算比率
      dataTotals.verifyRate = dataTotals.totalOrders > 0
        ? (dataTotals.verifyCount / dataTotals.totalOrders * 100)
        : 0;
      dataTotals.validVerifyRate = dataTotals.validOrders > 0
        ? (dataTotals.validVerifyCount / dataTotals.validOrders * 100)
        : 0;
      // 金额核销率 = 核销金额 / 成交金额
      const totalVerifyAmount = dataTotals.verifyAmount + (unmatchedData?.verifyAmount || 0);
      const totalTotalAmount = dataTotals.totalAmount + (unmatchedData?.totalAmount || 0);
      dataTotals.amountVerifyRate = totalTotalAmount > 0
        ? (totalVerifyAmount / totalTotalAmount * 100)
        : 0;
      // 有效金额率 = 有效核销金额 / 有效订单金额
      const totalValidVerifyAmount = dataTotals.validVerifyAmount + (unmatchedData?.validVerifyAmount || 0);
      const totalValidOrderAmount = dataTotals.validOrderAmount + (unmatchedData?.validOrderAmount || 0);
      dataTotals.validAmountRate = totalValidOrderAmount > 0
        ? (totalValidVerifyAmount / totalValidOrderAmount * 100)
        : 0;
    }

    return {
      operatingCount,
      totalContacts,
      dataTotals,
    };
  }, [filteredStores, storesWithBindData, isDataMode, unmatchedData]);

  // 计算未核销数合计（基于筛选后的门店）
  const last6MonthsUnverifiedCount = useMemo(() => {
    const orderData = orderDataRef.current;
    if (!orderData) return 0;

    let total = 0;
    
    // 遍历筛选后的门店，使用 totalUnverifiedCount
    for (const store of filteredStores) {
      if (!store.store_id) continue;
      const storeOrderStats = orderData.storeStats[store.store_id];
      if (!storeOrderStats) continue;
      total += storeOrderStats.totalUnverifiedCount || 0;
    }

    return total;
  }, [filteredStores, dataRefreshKey]);

  // 分类标签选择
  const [activeCategory, setActiveCategory] = useState<string>('all');

  return (
    <div>
      {/* 消息提示 */}
      {message && (
        <div 
          className={`message ${message.type === 'success' ? 'message-success' : 'message-error'}`}
          style={{ 
            position: 'fixed',
            top: '70px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1000,
            minWidth: '300px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
          }}
        >
          {message.text}
        </div>
      )}

      {/* 分类标签栏 */}
      <div className="category-tabs" style={{ position: 'relative', zIndex: showGroupDropdown ? 1001 : 1 }}>
        <button
          onClick={() => { 
            setActiveCategory('all'); 
            setActiveGroupId('');
            setFollowTimeFilter('all');
            setSortField('');
            setSortOrder('desc');
          }}
          className={`category-tab ${activeCategory === 'all' ? 'active' : ''}`}
        >
          全部门店
          <span className="category-tab-count">{categoryStats.total}</span>
        </button>
        

        
        <button
          onClick={() => {
            setActiveCategory('today');
            setFollowTimeFilter('today');
            setActiveGroupId('');
            setSortField('nextFollowTime');
            setSortOrder('asc');
          }}
          className={`category-tab ${activeCategory === 'today' ? 'active' : ''}`}
        >
          今日跟进
          <span className="category-tab-count">{categoryStats.todayFollow}</span>
        </button>
        <button
          onClick={() => {
            setActiveCategory('overdue');
            setFollowTimeFilter('overdue');
            setActiveGroupId('');
            setSortField('nextFollowTime');
            setSortOrder('asc');
          }}
          className={`category-tab ${activeCategory === 'overdue' ? 'active' : ''}`}
          style={activeCategory === 'overdue' ? { background: '#ffece8', color: '#f53f3f' } : {}}
        >
          已逾期
          <span className="category-tab-count" style={activeCategory === 'overdue' ? { background: '#f53f3f', color: '#fff' } : {}}>
            {categoryStats.overdue}
          </span>
        </button>
        <button
          onClick={() => {
            setActiveCategory('pending');
            setFollowTimeFilter('pending');
            setActiveGroupId('');
            setSortField('nextFollowTime');
            setSortOrder('asc');
          }}
          className={`category-tab ${activeCategory === 'pending' ? 'active' : ''}`}
        >
          待跟进
          <span className="category-tab-count">{categoryStats.pending}</span>
        </button>
        <button
          onClick={() => {
            setActiveCategory('noTime');
            setFollowTimeFilter('noTime');
            setActiveGroupId('');
          }}
          className={`category-tab ${activeCategory === 'noTime' ? 'active' : ''}`}
        >
          未设置
          <span className="category-tab-count">{categoryStats.noNextTime}</span>
        </button>

        {/* 分组下拉入口 */}
        <div style={{ position: 'relative', marginLeft: '4px' }}>
          <button
            onClick={() => setShowGroupDropdown(!showGroupDropdown)}
            className={`category-tab ${activeGroupId ? 'active' : ''}`}
            style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', padding: '6px 14px', borderRadius: '20px', border: activeGroupId ? '1px solid #165dff' : '1px solid #e5e6eb', background: activeGroupId ? '#e8f3ff' : '#fff', color: activeGroupId ? '#165dff' : '#4e5969', fontSize: '13px', fontWeight: 500 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>
            {activeGroupId ? storeGroups.find(g => g.id === activeGroupId)?.group_name || '分组' : '分组'}
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: '2px' }}>
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>

          {/* 分组下拉菜单 */}
          {showGroupDropdown && (
            <>
              <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 }} onClick={() => setShowGroupDropdown(false)} />
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                marginTop: '4px',
                background: '#fff',
                border: '1px solid #e5e6eb',
                borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                zIndex: 1000,
                minWidth: '200px',
                maxHeight: '320px',
                overflowY: 'auto',
              }}>
                {storeGroups.length === 0 ? (
                  <div style={{ padding: '16px', textAlign: 'center', color: '#86909c', fontSize: '13px' }}>
                    暂无分组，点击下方管理创建
                  </div>
                ) : (
                  storeGroups.map(group => {
                    const count = group.store_ids.split(',').map(s => s.trim()).filter(Boolean).length;
                    return (
                      <button
                        key={group.id}
                        onClick={() => {
                          if (activeGroupId === group.id) {
                            setActiveGroupId('');
                          } else {
                            setActiveGroupId(group.id);
                            setActiveCategory('all');
                            setFollowTimeFilter('all');
                          }
                          setShowGroupDropdown(false);
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          width: '100%',
                          padding: '10px 14px',
                          border: 'none',
                          background: activeGroupId === group.id ? '#e8f3ff' : 'transparent',
                          color: activeGroupId === group.id ? '#165dff' : '#1d2129',
                          cursor: 'pointer',
                          fontSize: '13px',
                          textAlign: 'left',
                          borderBottom: '1px solid #f2f3f5',
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={activeGroupId === group.id ? '#165dff' : '#86909c'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                        </svg>
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{group.group_name}</span>
                        <span style={{ fontSize: '11px', color: '#86909c', flexShrink: 0 }}>{count}家</span>
                      </button>
                    );
                  })
                )}
                <div style={{ borderTop: '1px solid #e5e6eb' }}>
                  <button
                    onClick={() => {
                      setShowGroupDropdown(false);
                      openGroupManageModal();
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      width: '100%',
                      padding: '10px 14px',
                      border: 'none',
                      background: 'transparent',
                      color: '#165dff',
                      cursor: 'pointer',
                      fontSize: '13px',
                      textAlign: 'left',
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="3"></circle>
                      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                    </svg>
                    管理分组
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 功能操作区 */}
      <div className="action-bar">
        {/* 标签筛选 - 多选下拉 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', position: 'relative' }}>
          <span style={{ fontSize: '13px', color: '#86909c', fontWeight: 500 }}>标签筛选</span>
          <div style={{ position: 'relative' }}>
            <button
              className="tag-filter-button"
              onClick={(e) => {
                e.stopPropagation();
                setShowTagDropdown(!showTagDropdown);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '6px 12px',
                fontSize: '13px',
                border: '1px solid #e5e6eb',
                borderRadius: '6px',
                background: '#fff',
                cursor: 'pointer',
                color: selectedTagFilters.length > 0 ? '#165dff' : '#4e5969',
                borderColor: selectedTagFilters.length > 0 ? '#165dff' : '#e5e6eb',
              }}
            >
              {selectedTagFilters.length > 0 ? `已选 ${selectedTagFilters.length} 个标签` : '选择标签'}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </button>
            {/* 标签选择下拉 */}
            <div
              id="tag-filter-dropdown"
              style={{
                display: showTagDropdown ? 'block' : 'none',
                position: 'absolute',
                top: '100%',
                left: 0,
                marginTop: '4px',
                background: '#fff',
                borderRadius: '6px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                border: '1px solid #e5e6eb',
                minWidth: '180px',
                zIndex: 1000,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{
                padding: '8px 12px',
                fontSize: '11px',
                color: '#86909c',
                borderBottom: '1px solid #e5e6eb',
                position: 'sticky',
                top: 0,
                background: '#fff',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span>选择标签（{tagStats.withTagCount}家门店）</span>
                {/* 且/或切换按钮 */}
                <div style={{
                  display: 'flex',
                  background: '#f2f3f5',
                  borderRadius: '4px',
                  padding: '2px',
                  fontSize: '11px'
                }}>
                  <span
                    onClick={() => setTagFilterRelation('AND')}
                    style={{
                      padding: '2px 8px',
                      borderRadius: '3px',
                      cursor: 'pointer',
                      background: tagFilterRelation === 'AND' ? '#fff' : 'transparent',
                      color: tagFilterRelation === 'AND' ? '#165dff' : '#86909c',
                      fontWeight: tagFilterRelation === 'AND' ? 500 : 400,
                      transition: 'all 0.2s'
                    }}
                  >
                    且
                  </span>
                  <span
                    onClick={() => setTagFilterRelation('OR')}
                    style={{
                      padding: '2px 8px',
                      borderRadius: '3px',
                      cursor: 'pointer',
                      background: tagFilterRelation === 'OR' ? '#fff' : 'transparent',
                      color: tagFilterRelation === 'OR' ? '#165dff' : '#86909c',
                      fontWeight: tagFilterRelation === 'OR' ? 500 : 400,
                      transition: 'all 0.2s'
                    }}
                  >
                    或
                  </span>
                </div>
              </div>
              {tagPresets.length === 0 ? (
                <div style={{ padding: '12px', textAlign: 'center', color: '#86909c', fontSize: '12px' }}>暂无预设标签</div>
              ) : (
                // 只显示这7个预设标签：S, A, B, C, C-, 美丽妈妈, 直营店
                (() => {
                  const filteredPresets = tagPresets.filter(preset =>
                    ['S:核心店', 'A:重点店', 'B:一般店', 'C:关注店', 'C-:问题店', '美丽妈妈', '直营店'].includes(preset.tag_name)
                  );
                  console.log('[标签筛选] 过滤后的预设标签:', filteredPresets.map(p => p.tag_name));
                  console.log('[标签筛选] tagPresets总数:', tagPresets.length);
                  return filteredPresets.map(preset => {
                    const isSelected = selectedTagFilters.includes(preset.tag_name);
                  return (
                    <div
                      key={preset.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isSelected) {
                          setSelectedTagFilters(prev => prev.filter(t => t !== preset.tag_name));
                        } else {
                          setSelectedTagFilters(prev => [...prev, preset.tag_name]);
                        }
                      }}
                      style={{
                        padding: '8px 12px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#f2f3f5'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <span
                        style={{
                          width: '16px',
                          height: '16px',
                          borderRadius: '4px',
                          border: isSelected ? 'none' : '1px solid #c9cdd4',
                          background: isSelected ? preset.tag_color : 'transparent',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        {isSelected && (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3">
                            <polyline points="20 6 9 17 4 12"></polyline>
                          </svg>
                        )}
                      </span>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: preset.tag_color, flexShrink: 0 }} />
                      <span style={{ flex: 1 }}>{preset.tag_name}</span>
                      <span style={{ fontSize: '11px', color: '#86909c' }}>
                        ({tagStats.counts[preset.tag_name] || 0})
                      </span>
                    </div>
                  );
                })
              })())}
                <div style={{ padding: '8px 12px', borderTop: '1px solid #e5e6eb', display: 'flex', justifyContent: 'space-between', position: 'sticky', bottom: 0, background: '#fff' }}>
                  <span onClick={() => { setSelectedTagFilters([]); }} style={{ fontSize: '11px', color: '#165dff', cursor: 'pointer' }}>清空</span>
                  <span
                    onClick={() => {
                      setSelectedTagFilters(['__EMPTY__']);
                      setShowTagDropdown(false);
                    }}
                    style={{ fontSize: '11px', color: '#86909c', cursor: 'pointer' }}
                  >
                    空 ({tagStats.emptyCount})
                  </span>
                  <span onClick={() => { setShowTagDropdown(false); }} style={{ fontSize: '11px', color: '#165dff', cursor: 'pointer' }}>关闭</span>
                </div>
            </div>
          </div>
          {/* 已选标签显示 */}
          {selectedTagFilters.length > 0 && (
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
              {selectedTagFilters.map(tagName => {
                const preset = tagPresets.find(p => p.tag_name === tagName);
                const color = preset?.tag_color || '#86909c';
                return (
                  <span
                    key={tagName}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      background: `${color}15`,
                      color: color,
                      border: `1px solid ${color}30`,
                    }}
                  >
                    {tagName}
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ cursor: 'pointer' }} onClick={() => setSelectedTagFilters(prev => prev.filter(t => t !== tagName))}>
                      <line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {/* 时间筛选 - 智能输入版 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '13px', color: '#86909c', fontWeight: 500 }}>时间筛选</span>
          {/* 智能时间输入框 */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <input
              type="text"
              value={smartDataTimeInput}
              onChange={(e) => setSmartDataTimeInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && smartDataTimeInput.trim()) {
                  const result = parseNaturalTime(smartDataTimeInput);
                  if (result) {
                    setDataTimeStart(result.start);
                    setDataTimeEnd(result.end);
                    setDataTimeQuick('all');
                    // 清空输入
                    setSmartDataTimeInput('');
                  }
                }
              }}
              placeholder="输入时间，如：3月、12月25到3月31"
              style={{
                width: '180px',
                padding: '6px 12px',
                paddingRight: smartDataTimeInput ? '60px' : '12px',
                fontSize: '13px',
                border: '1px solid #e5e6eb',
                borderRadius: '6px',
                outline: 'none',
                color: '#333',
                background: '#fff',
              }}
              onFocus={(e) => {
                e.target.style.borderColor = '#165dff';
                e.target.style.boxShadow = '0 0 0 2px rgba(22, 93, 255, 0.1)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = '#e5e6eb';
                e.target.style.boxShadow = 'none';
              }}
            />
            {smartDataTimeInput && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    const result = parseNaturalTime(smartDataTimeInput);
                    if (result) {
                      setDataTimeStart(result.start);
                      setDataTimeEnd(result.end);
                      setDataTimeQuick('all');
                      setSmartDataTimeInput('');
                    }
                  }}
                  style={{
                    position: 'absolute',
                    right: '28px',
                    padding: '4px',
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    color: '#165dff',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13"></line>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => setSmartDataTimeInput('')}
                  style={{
                    position: 'absolute',
                    right: '8px',
                    padding: '2px',
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    color: '#999',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </>
            )}
          </div>
          {/* 显示当前筛选状态 */}
          {dataTimeStart && dataTimeEnd && (
            <div style={{
              padding: '4px 10px',
              fontSize: '12px',
              background: '#e8f3ff',
              color: '#165dff',
              borderRadius: '4px',
              whiteSpace: 'nowrap',
            }}>
              {(() => {
                const [sy, sm, sd] = dataTimeStart.split('-').map(Number);
                const [ey, em, ed] = dataTimeEnd.split('-').map(Number);
                if (sy === ey && sm === em) {
                  return `${sm}月${sd}日 - ${ed}日`;
                }
                return `${sm}月${sd}日 - ${em}月${ed}日`;
              })()}
              <button
                type="button"
                onClick={() => {
                  setDataTimeStart('');
                  setDataTimeEnd('');
                  setDataTimeQuick('all');
                }}
                style={{
                  marginLeft: '6px',
                  padding: '0',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  color: '#165dff',
                  fontSize: '12px',
                }}
              >
                ×
              </button>
            </div>
          )}
          {/* 快捷筛选按钮 */}
          <div style={{ display: 'flex', gap: '4px', marginLeft: '8px', flexWrap: 'wrap' }}>
            {[
              { key: 'today', label: '今天' },
              { key: 'yesterday', label: '昨天' },
              { key: 'dayBeforeYesterday', label: '前天' },
              { key: 'last3Days', label: '近3日' },
              { key: 'last7Days', label: '近7日' },
              { key: 'last30Days', label: '近30日' },
              { key: 'last90Days', label: '近90日' },
              { key: 'thisMonth', label: '本月' },
              { key: 'thisMonthExceptToday', label: '本月不含今天' },
              { key: 'lastMonth', label: '上月' },
              { key: 'twoMonthsAgo', label: '上上月' },
              { key: 'last3Months', label: '近3月' },
              { key: 'last3MonthsIncludingThisMonth', label: '近3月含本月' },
            ].map(item => (
              <button
                type="button"
                key={item.key}
                onClick={() => {
                  setDataTimeQuick(item.key as typeof dataTimeQuick);
                  const { start, end } = getDateRange(item.key as typeof dataTimeQuick);
                  setDataTimeStart(start);
                  setDataTimeEnd(end);
                  setSmartDataTimeInput('');
                }}
                style={{
                  padding: '4px 10px',
                  fontSize: '12px',
                  borderRadius: '4px',
                  border: dataTimeQuick === item.key ? '1px solid #165dff' : '1px solid #e5e6eb',
                  background: dataTimeQuick === item.key ? '#e8f3ff' : '#fff',
                  color: dataTimeQuick === item.key ? '#165dff' : '#4e5969',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  whiteSpace: 'nowrap',
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* 右侧功能按钮 */}
        <div className="action-bar-right" style={{ marginLeft: 'auto' }}>
          {/* 数据文件上传按钮 */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* 已上传文件状态显示 */}
            {(orderFileInfo || verifyFileInfo || refundFileInfo) && (
              <div style={{ 
                display: 'flex', 
                alignItems: 'center',
                gap: '4px',
                padding: '6px 12px',
                background: '#e8f3ff',
                border: '1px solid #165dff',
                borderRadius: '6px',
                height: '44px',
                cursor: 'pointer'
              }}
              onClick={() => setShowDataUploadModal(true)}
              title="点击管理数据文件"
              >
                <div style={{ display: 'flex', gap: '6px' }}>
                  {orderFileInfo && (
                    <div style={{ 
                      width: '24px', 
                      height: '24px', 
                      borderRadius: '4px', 
                      background: '#00b42a', 
                      color: 'white',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '12px',
                      fontWeight: 600
                    }}>订</div>
                  )}
                  {verifyFileInfo && (
                    <div style={{ 
                      width: '24px', 
                      height: '24px', 
                      borderRadius: '4px', 
                      background: '#ff7d00', 
                      color: 'white',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '12px',
                      fontWeight: 600
                    }}>核</div>
                  )}
                  {refundFileInfo && (
                    <div style={{ 
                      width: '24px', 
                      height: '24px', 
                      borderRadius: '4px', 
                      background: '#f5222d', 
                      color: 'white',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '12px',
                      fontWeight: 600
                    }}>退</div>
                  )}
                </div>
              </div>
            )}
            
            {/* 数据文件上传按钮 */}
            <button 
              onClick={() => setShowDataUploadModal(true)}
              className="action-btn" 
              style={{ cursor: 'pointer' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="17 8 12 3 7 8"></polyline>
                <line x1="12" y1="3" x2="12" y2="15"></line>
              </svg>
              数据
            </button>
          </div>

          {/* 广告费 */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              ref={adInputRef}
              type="file"
              accept=".xlsx,.xls"
              multiple
              style={{ display: 'none' }}
              id="ad-upload-input"
            />
            
            {/* 广告费按钮 */}
            <button 
              onClick={() => setShowAdUploadModal(true)}
              className="action-btn" 
              style={{ cursor: 'pointer', background: '#e6f7ff', border: '1px solid #1890ff', color: '#1890ff' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="17 8 12 3 7 8"></polyline>
                <line x1="12" y1="3" x2="12" y2="15"></line>
              </svg>
              广告费
            </button>
          </div>

          {/* 基础信息按钮 */}
          <button 
            onClick={() => setShowBasicInfoUploadModal(true)}
            className="action-btn" 
            style={{ cursor: 'pointer' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
            基础信息
          </button>

        </div>
      </div>

      {/* 门店列表 */}
      <div className="card" style={{ borderRadius: 0, border: 'none', boxShadow: 'none' }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 48px' }}>
            <div className="loading-spinner loading-spinner-lg" style={{ marginBottom: '24px' }}></div>
            <div style={{ 
              width: '100%', 
              maxWidth: '400px',
              marginBottom: '16px'
            }}>
              <div style={{ 
                height: '8px', 
                background: '#f2f3f5', 
                borderRadius: '4px', 
                overflow: 'hidden',
                position: 'relative'
              }}>
                <div style={{ 
                  height: '100%', 
                  background: 'linear-gradient(90deg, #165dff, #4080ff)',
                  borderRadius: '4px',
                  width: `${loadingProgress}%`,
                  transition: 'width 0.3s ease',
                  position: 'absolute',
                  left: 0,
                  top: 0
                }}></div>
              </div>
            </div>
            <div style={{ 
              fontSize: '14px', 
              color: '#4e5969',
              marginBottom: '4px'
            }}>
              {loadingMessage}
            </div>
            <div style={{ 
              fontSize: '12px', 
              color: '#86909c',
              fontFamily: 'monospace'
            }}>
              {loadingProgress}%
            </div>
          </div>
        ) : filteredStores.length === 0 ? (
          <div className="empty-state">
            <svg className="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
              <polyline points="9 22 9 12 15 12 15 22"></polyline>
            </svg>
            <p className="empty-state-title">{search ? '没有找到匹配的门店' : '暂无门店数据'}</p>
            <p className="empty-state-desc">{search ? '请尝试其他关键词' : '联系管理员添加门店'}</p>
          </div>
        ) : (
          <>
            {/* 桌面端表格 */}
            <div className="table-container hide-mobile" style={{ maxHeight: 'calc(100vh - 200px)', overflow: 'auto' }}>
              <table className="crm-table">
                <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                  {/* 第一行：字段名 */}
                  <tr>
                    <th style={{ minWidth: '220px', textAlign: 'left', borderBottom: 'none', paddingBottom: 0, position: 'sticky', left: 0, zIndex: 30, background: 'var(--color-bg-3)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <HeaderWithTooltip label="门店名称" tooltip="门店的基本信息，包含门店名称、地址、品类等详细信息。点击可展开查看更多详情。" />
                        </div>
                        {/* 右侧控制按钮组 - 靠右对齐 */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {/* 模式切换：门店/配合/订单/业绩 */}
                          <div style={{ display: 'flex', background: '#f2f3f5', borderRadius: '6px', padding: '2px' }}>
                            <button
                              onClick={() => onIsDataModeChange?.(false)}
                              title="切换到门店信息"
                              style={{
                                padding: '4px 12px',
                                borderRadius: '4px',
                                border: 'none',
                                background: !isDataMode ? '#165dff' : '#fff',
                                color: !isDataMode ? '#fff' : '#1d2129',
                                cursor: 'pointer',
                                fontSize: '12px',
                                fontWeight: 500,
                                transition: 'all 0.2s',
                              }}
                            >
                              门店
                            </button>
                            <button
                              onClick={() => {
                                if (!isDataMode) {
                                  onIsDataModeChange?.(true);
                                }
                                setDataTab('cooperation');
                              }}
                              title="切换到配合数据"
                              style={{
                                padding: '4px 12px',
                                borderRadius: '4px',
                                border: 'none',
                                background: isDataMode && dataTab === 'cooperation' ? '#165dff' : '#fff',
                                color: isDataMode && dataTab === 'cooperation' ? '#fff' : '#1d2129',
                                cursor: 'pointer',
                                fontSize: '12px',
                                fontWeight: 500,
                                transition: 'all 0.2s',
                              }}
                            >
                              配合
                            </button>
                            <button
                              onClick={() => {
                                if (!isDataMode) {
                                  onIsDataModeChange?.(true);
                                }
                                setDataTab('order');
                              }}
                              title="切换到订单数据"
                              style={{
                                padding: '4px 12px',
                                borderRadius: '4px',
                                border: 'none',
                                background: isDataMode && dataTab === 'order' ? '#165dff' : '#fff',
                                color: isDataMode && dataTab === 'order' ? '#fff' : '#1d2129',
                                cursor: 'pointer',
                                fontSize: '12px',
                                fontWeight: 500,
                                transition: 'all 0.2s',
                              }}
                            >
                              订单
                            </button>
                            <button
                              onClick={() => {
                                if (!isDataMode) {
                                  onIsDataModeChange?.(true);
                                }
                                setDataTab('performance');
                              }}
                              title="切换到业绩数据"
                              style={{
                                padding: '4px 12px',
                                borderRadius: '4px',
                                border: 'none',
                                background: isDataMode && dataTab === 'performance' ? '#165dff' : '#fff',
                                color: isDataMode && dataTab === 'performance' ? '#fff' : '#1d2129',
                                cursor: 'pointer',
                                fontSize: '12px',
                                fontWeight: 500,
                                transition: 'all 0.2s',
                              }}
                            >
                              业绩
                            </button>
                          </div>
                          {/* 隐藏取消合作门店开关 */}
                          <button
                            onClick={() => setHideCancelledStores(!hideCancelledStores)}
                            title={hideCancelledStores ? '显示所有门店' : '隐藏取消合作的门店'}
                            style={{
                              width: '20px',
                              height: '11px',
                              borderRadius: '5.5px',
                              border: 'none',
                              background: hideCancelledStores ? '#00b42a' : '#c9cdd4',
                              cursor: 'pointer',
                              position: 'relative',
                              transition: 'background 0.2s',
                              display: 'inline-flex',
                              alignItems: 'center',
                              padding: '1px',
                              flexShrink: 0,
                            }}
                          >
                            <span
                              style={{
                                width: '9px',
                                height: '9px',
                                borderRadius: '50%',
                                background: '#fff',
                                transition: 'transform 0.2s',
                                transform: hideCancelledStores ? 'translateX(9px)' : 'translateX(0)',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                              }}
                            />
                          </button>
                          {/* 隐藏标签按钮 */}
                          <button
                            onClick={() => {
                              const newValue = !hideTags;
                              setHideTags(newValue);
                              localStorage.setItem('hideTags', String(newValue));
                            }}
                            title={hideTags ? '显示标签' : '隐藏标签'}
                            style={{
                              width: '20px',
                              height: '20px',
                              borderRadius: '4px',
                              border: 'none',
                              background: hideTags ? '#f53f3f' : '#f2f3f5',
                              color: hideTags ? '#fff' : '#86909c',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              padding: 0,
                              flexShrink: 0,
                              transition: 'all 0.2s',
                            }}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              {hideTags ? (
                                <>
                                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                  <circle cx="12" cy="12" r="3"></circle>
                                </>
                              ) : (
                                <>
                                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                                  <line x1="1" y1="1" x2="23" y2="23"></line>
                                </>
                              )}
                            </svg>
                          </button>
                        </div>
                      </div>
                    </th>
                    {!isDataMode && (
                      <>
                        {/* 【列2】门店ID - 显示门店系统ID（对齐到表体门店ID列） */}
                        <th style={{ minWidth: '70px', textAlign: 'left', borderBottom: 'none', paddingBottom: 0 }}>
                          <HeaderWithTooltip label="门店ID" tooltip="门店在系统中的唯一标识符，用于快速定位和搜索门店。" />
                        </th>
                        {/* 【列3】城市 - 显示城市等级（对齐到表体城市列） */}
                        <th style={{ minWidth: '40px', textAlign: 'left', borderBottom: 'none', paddingBottom: 0 }}>
                          <HeaderWithTooltip label="城市" tooltip="门店所在城市" />
                        </th>
                        {/* 【列4】商管 - 门店等级筛选（对齐到表体商管列） */}
                        <th style={{ minWidth: '70px', textAlign: 'left', borderBottom: 'none', paddingBottom: 0 }}>
                          <LevelHeader value={levelFilter} onChange={setLevelFilter} stores={filteredStores} />
                        </th>
                        {/* 【列5】服务状态 - 服务状态筛选（对齐到表体服务状态列） */}
                        <th style={{ textAlign: 'left', borderBottom: 'none', paddingBottom: 0 }}>
                          <BusinessStatusHeader value={businessStatusFilter} onChange={setBusinessStatusFilter} />
                        </th>
                        {/* 【列6】门店面积 - 门店面积（对齐到表体门店面积列） */}
                        <th style={{ minWidth: '70px', textAlign: 'center', borderBottom: 'none', paddingBottom: 0 }}>
                          <HeaderWithTooltip label="门店面积" tooltip="门店面积（平方米）" />
                        </th>
                        {/* 【列7】资料 - 门店资料图片（对齐到表体资料列） */}
                        <th style={{ minWidth: '140px', textAlign: 'center', borderBottom: 'none', paddingBottom: 0 }}>
                          <HeaderWithTooltip label="资料" tooltip="门店资料图片" />
                        </th>
                        {/* 【列8】人数 - 员工人数（对齐到表体人数列） */}
                        <th style={{ minWidth: '70px', textAlign: 'center', borderBottom: 'none', paddingBottom: 0 }}>
                          <HeaderWithTooltip label="人数" tooltip="员工人数" />
                        </th>
                        {/* 【列9】获客渠道 - 门店自身获客渠道（对齐到表体获客渠道列） */}
                        <th style={{ minWidth: '200px', textAlign: 'left', borderBottom: 'none', paddingBottom: 0 }}>
                          <HeaderWithTooltip label="获客渠道" tooltip="门店自身获客渠道" />
                        </th>
                        {/* 【列10】联系人 - 门店联系人信息（对齐到表体联系人列） */}
                        <th style={{ minWidth: '120px', textAlign: 'left', borderBottom: 'none', paddingBottom: 0 }}>
                          <HeaderWithTooltip label="联系人" tooltip="门店的联系人信息，包含姓名、职位、电话、微信等。可设置首选联系人。" />
                        </th>
                        {/* 【列11】下次跟进 - 下次跟进时间（对齐到表体下次跟进列） */}
                        <th className="sortable" style={{ textAlign: 'center', borderBottom: 'none', paddingBottom: 0 }} onClick={() => {
                          if (sortField !== 'nextFollowTime') {
                            setSortField('nextFollowTime');
                            setSortOrder('asc');
                          } else {
                            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                          }
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', width: '100%' }}>
                            <HeaderWithTooltip label="下次跟进" tooltip="最近一次跟进记录中设置的下一次跟进时间。点击可按时间排序。" />
                            <svg className="sort-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={sortField === 'nextFollowTime' ? '#165dff' : 'currentColor'} strokeWidth="2" style={{ position: 'absolute', right: 0, transform: sortField === 'nextFollowTime' && sortOrder === 'asc' ? 'rotate(0deg)' : 'rotate(180deg)', opacity: sortField === 'nextFollowTime' ? 1 : 0.3 }}><path d="M18 15l-6-6-6 6"/></svg>
                          </div>
                        </th>
                        {/* 【列12】操作 - 操作按钮（对齐到表体操作列） */}
                        <th style={{ textAlign: 'center', width: '100px', borderBottom: 'none', paddingBottom: 0 }}>操作</th>
                      </>
                    )}
                    {isDataMode && dataTab === 'cooperation' && (
                      <>
                        {/* ========== 配合数据模式 ========== */}
                        {/* 【列2】门店ID - 显示门店系统ID */}
                        <th style={{ minWidth: '70px', textAlign: 'left', borderBottom: 'none', paddingBottom: 0, background: '#f2f3f5' }}>
                          <HeaderWithTooltip label="门店ID" tooltip="门店在系统中的唯一标识符，用于快速定位和搜索门店。" />
                        </th>
                        {/* 【新增】经营分 */}
                        <th style={{ minWidth: '70px', textAlign: 'center', borderBottom: 'none', paddingBottom: 0, background: '#f2f3f5' }}>
                          <BusinessScoreHeader value={businessScoreFilter} onChange={setBusinessScoreFilter} />
                        </th>
                        {/* 【新增】新增好评数 */}
                        <th style={{ minWidth: '80px', textAlign: 'center', borderBottom: 'none', paddingBottom: 0, background: '#f2f3f5' }}>
                          <HeaderWithTooltip label="新增好评数" tooltip="新增好评数量" />
                        </th>
                        {/* 【新增】新增中差评数 */}
                        <th style={{ minWidth: '90px', textAlign: 'center', borderBottom: 'none', paddingBottom: 0, background: '#f2f3f5' }}>
                          <HeaderWithTooltip label="新增中差评数" tooltip="新增中差评数量" />
                        </th>
                        {/* 【新增】门店蓝V */}
                        <th style={{ minWidth: '120px', textAlign: 'center', borderBottom: 'none', paddingBottom: 0, background: '#f2f3f5' }}>
                          <HeaderWithTooltip label="门店蓝V" tooltip="门店的抖音账号ID，多个账号用&连接" />
                        </th>
                        {/* 【新增】蓝V发布数 */}
                        <th style={{ minWidth: '90px', textAlign: 'center', borderBottom: 'none', paddingBottom: 0, background: '#f2f3f5' }}>
                          <HeaderWithTooltip label="蓝V发布数" tooltip="蓝V账号发布的新视频数量" />
                        </th>
                        {/* 【新增】蓝V播放量 */}
                        <th style={{ minWidth: '100px', textAlign: 'center', borderBottom: 'none', paddingBottom: 0, background: '#f2f3f5' }}>
                          <HeaderWithTooltip label="蓝V播放量" tooltip="蓝V账号视频的新增播放量" />
                        </th>
                        {/* 【新增】蓝V成交 */}
                        <th style={{ minWidth: '90px', textAlign: 'center', borderBottom: 'none', paddingBottom: 0, background: '#f2f3f5' }}>
                          <HeaderWithTooltip label="蓝V成交" tooltip="蓝V账号的成交券数" />
                        </th>
                        {/* 【新增】商家职人数 */}
                        <th style={{ minWidth: '100px', textAlign: 'center', borderBottom: 'none', paddingBottom: 0, background: '#f2f3f5' }}>
                          <HeaderWithTooltip label="商家职人数" tooltip="商家职人数量" />
                        </th>
                        {/* 【新增】视频数 */}
                        <th style={{ minWidth: '70px', textAlign: 'center', borderBottom: 'none', paddingBottom: 0, background: '#f2f3f5' }}>
                          <HeaderWithTooltip label="视频数" tooltip="视频数量" />
                        </th>
                        {/* 【新增】职人曝光量 */}
                        <th style={{ minWidth: '90px', textAlign: 'center', borderBottom: 'none', paddingBottom: 0, background: '#f2f3f5' }}>
                          <HeaderWithTooltip label="职人曝光量" tooltip="职人曝光数量" />
                        </th>
                      </>
                    )}
                    {isDataMode && dataTab === 'order' && (
                      <>
                        {/* ========== 数量类字段（黑色字体）- 订单模式 ========== */}
                        {/* 广告投入 */}
                        <th className="sortable" style={{ textAlign: 'center', whiteSpace: 'nowrap', borderBottom: 'none', paddingBottom: 0, minWidth: '75px', background: '#f2f3f5' }} onClick={() => {
                          if (sortField === 'adInvestment') {
                            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                          } else { 
                            setSortField('adInvestment'); 
                            setSortOrder('desc'); 
                          }
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', width: '100%' }}>
                            <HeaderWithTooltip label="广告投入" tooltip="广告投入金额统计。" color="#1d2129" />
                            <svg className="sort-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={sortField === 'adInvestment' ? '#165dff' : 'currentColor'} strokeWidth="2" style={{ position: 'absolute', right: 0, transform: sortField === 'adInvestment' && sortOrder === 'asc' ? 'rotate(0deg)' : 'rotate(180deg)', opacity: sortField === 'adInvestment' ? 1 : 0.3 }}><path d="M18 15l-6-6-6 6"/></svg>
                          </div>
                        </th>
                        {/* 订单数 */}
                        <th className="sortable" style={{ textAlign: 'center', whiteSpace: 'nowrap', borderBottom: 'none', paddingBottom: 0, minWidth: '60px', background: '#f2f3f5' }} onClick={() => {
                          if (sortField === 'totalOrders') {
                            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                          } else { 
                            setSortField('totalOrders'); 
                            setSortOrder('desc'); 
                          }
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', width: '100%' }}>
                            <HeaderWithTooltip label="订单数" tooltip="从上传的订单文件中统计的订单总数。" color="#1d2129" />
                            <svg className="sort-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={sortField === 'totalOrders' ? '#165dff' : 'currentColor'} strokeWidth="2" style={{ position: 'absolute', right: 0, transform: sortField === 'totalOrders' && sortOrder === 'asc' ? 'rotate(0deg)' : 'rotate(180deg)', opacity: sortField === 'totalOrders' ? 1 : 0.3 }}><path d="M18 15l-6-6-6 6"/></svg>
                          </div>
                        </th>
                        {/* 广告订单数 */}
                        <th className="sortable" style={{ textAlign: 'center', whiteSpace: 'nowrap', borderBottom: 'none', paddingBottom: 0, minWidth: '65px', background: '#f2f3f5' }} onClick={() => {
                          if (sortField === 'adOrders') {
                            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                          } else { 
                            setSortField('adOrders'); 
                            setSortOrder('desc'); 
                          }
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', width: '100%' }}>
                            <HeaderWithTooltip label="广告订单数" tooltip="广告带来的订单数量。" color="#1d2129" />
                            <svg className="sort-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={sortField === 'adOrders' ? '#165dff' : 'currentColor'} strokeWidth="2" style={{ position: 'absolute', right: 0, transform: sortField === 'adOrders' && sortOrder === 'asc' ? 'rotate(0deg)' : 'rotate(180deg)', opacity: sortField === 'adOrders' ? 1 : 0.3 }}><path d="M18 15l-6-6-6 6"/></svg>
                          </div>
                        </th>
                        {/* 广告订单数占比 */}
                        <th className="sortable" style={{ textAlign: 'center', whiteSpace: 'nowrap', borderBottom: 'none', paddingBottom: 0, minWidth: '55px', background: '#f2f3f5' }} onClick={() => {
                          if (sortField === 'adOrdersRate') {
                            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                          } else { 
                            setSortField('adOrdersRate'); 
                            setSortOrder('desc'); 
                          }
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', width: '100%' }}>
                            <HeaderWithTooltip label="广告占比" tooltip="广告订单数占总订单数的百分比。" color="#1d2129" />
                            <svg className="sort-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={sortField === 'adOrdersRate' ? '#165dff' : 'currentColor'} strokeWidth="2" style={{ position: 'absolute', right: 0, transform: sortField === 'adOrdersRate' && sortOrder === 'asc' ? 'rotate(0deg)' : 'rotate(180deg)', opacity: sortField === 'adOrdersRate' ? 1 : 0.3 }}><path d="M18 15l-6-6-6 6"/></svg>
                          </div>
                        </th>
                        {/* 刷单数 */}
                        <th className="sortable" style={{ textAlign: 'center', whiteSpace: 'nowrap', borderBottom: 'none', paddingBottom: 0, minWidth: '55px', background: '#f2f3f5' }} onClick={() => {
                          if (sortField === 'fakeOrders') {
                            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                          } else { 
                            setSortField('fakeOrders'); 
                            setSortOrder('desc'); 
                          }
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', width: '100%' }}>
                            <HeaderWithTooltip label="刷单数" tooltip="订单实收 ≤ 10元的订单数（包含10元）。" color="#1d2129" />
                            <svg className="sort-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={sortField === 'fakeOrders' ? '#165dff' : 'currentColor'} strokeWidth="2" style={{ position: 'absolute', right: 0, transform: sortField === 'fakeOrders' && sortOrder === 'asc' ? 'rotate(0deg)' : 'rotate(180deg)', opacity: sortField === 'fakeOrders' ? 1 : 0.3 }}><path d="M18 15l-6-6-6 6"/></svg>
                          </div>
                        </th>
                        {/* 有效订单数 */}
                        <th className="sortable" style={{ textAlign: 'center', whiteSpace: 'nowrap', borderBottom: 'none', paddingBottom: 0, minWidth: '60px', background: '#f2f3f5' }} onClick={() => {
                          if (sortField === 'validOrders') {
                            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                          } else { 
                            setSortField('validOrders'); 
                            setSortOrder('desc'); 
                          }
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', width: '100%' }}>
                            <HeaderWithTooltip label="有效订单数" tooltip="订单实收 > 10元的订单数（不包含10元）。" color="#1d2129" />
                            <svg className="sort-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={sortField === 'validOrders' ? '#165dff' : 'currentColor'} strokeWidth="2" style={{ position: 'absolute', right: 0, transform: sortField === 'validOrders' && sortOrder === 'asc' ? 'rotate(0deg)' : 'rotate(180deg)', opacity: sortField === 'validOrders' ? 1 : 0.3 }}><path d="M18 15l-6-6-6 6"/></svg>
                          </div>
                        </th>
                        {/* 有效订单成本 */}
                        <th className="sortable" style={{ textAlign: 'center', whiteSpace: 'nowrap', borderBottom: 'none', paddingBottom: 0, minWidth: '80px', background: '#f2f3f5' }} onClick={() => {
                          if (sortField === 'validOrderCost') {
                            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                          } else { 
                            setSortField('validOrderCost'); 
                            setSortOrder('desc'); 
                          }
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', width: '100%' }}>
                            <HeaderWithTooltip label="有效订单成本" tooltip="广告投入 / 有效订单数。" color="#1d2129" />
                            <svg className="sort-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={sortField === 'validOrderCost' ? '#165dff' : 'currentColor'} strokeWidth="2" style={{ position: 'absolute', right: 0, transform: sortField === 'validOrderCost' && sortOrder === 'asc' ? 'rotate(0deg)' : 'rotate(180deg)', opacity: sortField === 'validOrderCost' ? 1 : 0.3 }}><path d="M18 15l-6-6-6 6"/></svg>
                          </div>
                        </th>
                        {/* 退款数 */}
                        <th className="sortable" style={{ textAlign: 'center', whiteSpace: 'nowrap', borderBottom: 'none', paddingBottom: 0, minWidth: '60px', background: '#f2f3f5' }} onClick={() => {
                          if (sortField === 'refundCount') {
                            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                          } else { 
                            setSortField('refundCount'); 
                            setSortOrder('desc'); 
                          }
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', width: '100%' }}>
                            <HeaderWithTooltip label="退款数" tooltip="需上传退款文件统计（仅统计售后状态为'已退款'的记录，按退款审核完成时间统计）" color="#1d2129" />
                            <svg className="sort-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={sortField === 'refundCount' ? '#165dff' : 'currentColor'} strokeWidth="2" style={{ position: 'absolute', right: 0, transform: sortField === 'refundCount' && sortOrder === 'asc' ? 'rotate(0deg)' : 'rotate(180deg)', opacity: sortField === 'refundCount' ? 1 : 0.3 }}><path d="M18 15l-6-6-6 6"/></svg>
                          </div>
                        </th>
                        {/* 未核销数 */}
                        <th className="sortable" style={{ textAlign: 'center', whiteSpace: 'nowrap', borderBottom: 'none', paddingBottom: 0, minWidth: '55px', background: '#f2f3f5' }} onClick={() => {
                          if (sortField === 'unverifiedCount') {
                            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                          } else { 
                            setSortField('unverifiedCount'); 
                            setSortOrder('desc'); 
                          }
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', width: '100%' }}>
                            <HeaderWithTooltip label="未核销数" tooltip="订单状态为'待使用'的订单数量（来自导出的全部6个月数据），不受时间筛选影响。" color="#1d2129" />
                            <svg className="sort-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={sortField === 'unverifiedCount' ? '#165dff' : 'currentColor'} strokeWidth="2" style={{ position: 'absolute', right: 0, transform: sortField === 'unverifiedCount' && sortOrder === 'asc' ? 'rotate(0deg)' : 'rotate(180deg)', opacity: sortField === 'unverifiedCount' ? 1 : 0.3 }}><path d="M18 15l-6-6-6 6"/></svg>
                          </div>
                        </th>
                        {/* 核销数 */}
                        <th className="sortable" style={{ textAlign: 'center', whiteSpace: 'nowrap', borderBottom: 'none', paddingBottom: 0, minWidth: '55px', background: '#f2f3f5' }} onClick={() => {
                          if (sortField === 'verifyCount') {
                            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                          } else { 
                            setSortField('verifyCount'); 
                            setSortOrder('desc'); 
                          }
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', width: '100%' }}>
                            <HeaderWithTooltip label="核销数" tooltip="核销记录数（已排除已撤销核销、核销后退款）。" color="#1d2129" />
                            <svg className="sort-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={sortField === 'verifyCount' ? '#165dff' : 'currentColor'} strokeWidth="2" style={{ position: 'absolute', right: 0, transform: sortField === 'verifyCount' && sortOrder === 'asc' ? 'rotate(0deg)' : 'rotate(180deg)', opacity: sortField === 'verifyCount' ? 1 : 0.3 }}><path d="M18 15l-6-6-6 6"/></svg>
                          </div>
                        </th>
                        {/* 刷单核销数 */}
                        <th className="sortable" style={{ textAlign: 'center', whiteSpace: 'nowrap', borderBottom: 'none', paddingBottom: 0, minWidth: '60px', background: '#f2f3f5' }} onClick={() => {
                          if (sortField === 'fakeVerifyCount') {
                            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                          } else { 
                            setSortField('fakeVerifyCount'); 
                            setSortOrder('desc'); 
                          }
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', width: '100%' }}>
                            <HeaderWithTooltip label="刷单核销数" tooltip="核销金额 ≤ 10元的核销数（包含10元）。" color="#1d2129" />
                            <svg className="sort-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={sortField === 'fakeVerifyCount' ? '#165dff' : 'currentColor'} strokeWidth="2" style={{ position: 'absolute', right: 0, transform: sortField === 'fakeVerifyCount' && sortOrder === 'asc' ? 'rotate(0deg)' : 'rotate(180deg)', opacity: sortField === 'fakeVerifyCount' ? 1 : 0.3 }}><path d="M18 15l-6-6-6 6"/></svg>
                          </div>
                        </th>
                        {/* 有效核销数 */}
                        <th className="sortable" style={{ textAlign: 'center', whiteSpace: 'nowrap', borderBottom: 'none', paddingBottom: 0, minWidth: '60px', background: '#f2f3f5' }} onClick={() => {
                          if (sortField === 'validVerifyCount') {
                            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                          } else { 
                            setSortField('validVerifyCount'); 
                            setSortOrder('desc'); 
                          }
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', width: '100%' }}>
                            <HeaderWithTooltip label="有效核销数" tooltip="核销金额 > 10元的核销数（不包含10元）。" color="#1d2129" />
                            <svg className="sort-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={sortField === 'validVerifyCount' ? '#165dff' : 'currentColor'} strokeWidth="2" style={{ position: 'absolute', right: 0, transform: sortField === 'validVerifyCount' && sortOrder === 'asc' ? 'rotate(0deg)' : 'rotate(180deg)', opacity: sortField === 'validVerifyCount' ? 1 : 0.3 }}><path d="M18 15l-6-6-6 6"/></svg>
                          </div>
                        </th>
                        {/* 核销率 */}
                        <th className="sortable" style={{ textAlign: 'center', whiteSpace: 'nowrap', borderBottom: 'none', paddingBottom: 0, minWidth: '50px', background: '#f2f3f5' }} onClick={() => {
                          if (sortField === 'verifyRate') {
                            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                          } else { 
                            setSortField('verifyRate'); 
                            setSortOrder('desc'); 
                          }
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', width: '100%' }}>
                            <HeaderWithTooltip label="核销率" tooltip="核销数 / 订单数 × 100%。" color="#1d2129" />
                            <svg className="sort-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={sortField === 'verifyRate' ? '#165dff' : 'currentColor'} strokeWidth="2" style={{ position: 'absolute', right: 0, transform: sortField === 'verifyRate' && sortOrder === 'asc' ? 'rotate(0deg)' : 'rotate(180deg)', opacity: sortField === 'verifyRate' ? 1 : 0.3 }}><path d="M18 15l-6-6-6 6"/></svg>
                          </div>
                        </th>
                        {/* 有效核销率 */}
                        <th className="sortable" style={{ textAlign: 'center', whiteSpace: 'nowrap', borderBottom: 'none', paddingBottom: 0, minWidth: '55px', background: '#f2f3f5' }} onClick={() => {
                          if (sortField === 'validVerifyRate') {
                            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                          } else { 
                            setSortField('validVerifyRate'); 
                            setSortOrder('desc'); 
                          }
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', width: '100%' }}>
                            <HeaderWithTooltip label="有效核销率" tooltip="有效核销数 / 有效订单数 × 100%。" color="#1d2129" />
                            <svg className="sort-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={sortField === 'validVerifyRate' ? '#165dff' : 'currentColor'} strokeWidth="2" style={{ position: 'absolute', right: 0, transform: sortField === 'validVerifyRate' && sortOrder === 'asc' ? 'rotate(0deg)' : 'rotate(180deg)', opacity: sortField === 'validVerifyRate' ? 1 : 0.3 }}><path d="M18 15l-6-6-6 6"/></svg>
                          </div>
                        </th>
                      </>
                    )}
                    {isDataMode && dataTab === 'performance' && (
                      <>
                        {/* ========== 金额类字段（灰色字体）- 业绩模式 ========== */}
                        {/* 广告投入 */}
                        <th className="sortable" style={{ textAlign: 'center', whiteSpace: 'nowrap', borderBottom: 'none', paddingBottom: 0, minWidth: '75px', background: '#f2f3f5' }} onClick={() => {
                          if (sortField === 'adInvestment') {
                            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                          } else { 
                            setSortField('adInvestment'); 
                            setSortOrder('desc'); 
                          }
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', width: '100%' }}>
                            <HeaderWithTooltip label="广告投入" tooltip="广告投入金额合计。" color="#86909c" />
                            <svg className="sort-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={sortField === 'adInvestment' ? '#165dff' : 'currentColor'} strokeWidth="2" style={{ position: 'absolute', right: 0, transform: sortField === 'adInvestment' && sortOrder === 'asc' ? 'rotate(0deg)' : 'rotate(180deg)', opacity: sortField === 'adInvestment' ? 1 : 0.3 }}><path d="M18 15l-6-6-6 6"/></svg>
                          </div>
                        </th>
                        {/* 订单金额 */}
                        <th className="sortable" style={{ textAlign: 'center', whiteSpace: 'nowrap', borderBottom: 'none', paddingBottom: 0, minWidth: '75px', background: '#f2f3f5' }} onClick={() => {
                          if (sortField === 'totalAmount') {
                            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                          } else { 
                            setSortField('totalAmount'); 
                            setSortOrder('desc'); 
                          }
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', width: '100%' }}>
                            <HeaderWithTooltip label="订单金额" tooltip="订单实收金额合计。" color="#86909c" />
                            <svg className="sort-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={sortField === 'totalAmount' ? '#165dff' : 'currentColor'} strokeWidth="2" style={{ position: 'absolute', right: 0, transform: sortField === 'totalAmount' && sortOrder === 'asc' ? 'rotate(0deg)' : 'rotate(180deg)', opacity: sortField === 'totalAmount' ? 1 : 0.3 }}><path d="M18 15l-6-6-6 6"/></svg>
                          </div>
                        </th>
                        {/* 刷单金额 */}
                        <th className="sortable" style={{ textAlign: 'center', whiteSpace: 'nowrap', borderBottom: 'none', paddingBottom: 0, minWidth: '75px', background: '#f2f3f5' }} onClick={() => {
                          if (sortField === 'fakeAmount') {
                            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                          } else { 
                            setSortField('fakeAmount'); 
                            setSortOrder('desc'); 
                          }
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', width: '100%' }}>
                            <HeaderWithTooltip label="刷单金额" tooltip="刷单订单的订单实收合计。" color="#86909c" />
                            <svg className="sort-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={sortField === 'fakeAmount' ? '#165dff' : 'currentColor'} strokeWidth="2" style={{ position: 'absolute', right: 0, transform: sortField === 'fakeAmount' && sortOrder === 'asc' ? 'rotate(0deg)' : 'rotate(180deg)', opacity: sortField === 'fakeAmount' ? 1 : 0.3 }}><path d="M18 15l-6-6-6 6"/></svg>
                          </div>
                        </th>
                        {/* 有效订单金额 */}
                        <th className="sortable" style={{ textAlign: 'center', whiteSpace: 'nowrap', borderBottom: 'none', paddingBottom: 0, minWidth: '80px', background: '#f2f3f5' }} onClick={() => {
                          if (sortField === 'validOrderAmount') {
                            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                          } else { 
                            setSortField('validOrderAmount'); 
                            setSortOrder('desc'); 
                          }
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', width: '100%' }}>
                            <HeaderWithTooltip label="有效订单金额" tooltip="有效订单（订单实收 > 10元）的金额合计。" color="#1d2129" />
                            <svg className="sort-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={sortField === 'validOrderAmount' ? '#165dff' : 'currentColor'} strokeWidth="2" style={{ position: 'absolute', right: 0, transform: sortField === 'validOrderAmount' && sortOrder === 'asc' ? 'rotate(0deg)' : 'rotate(180deg)', opacity: sortField === 'validOrderAmount' ? 1 : 0.3 }}><path d="M18 15l-6-6-6 6"/></svg>
                          </div>
                        </th>
                        {/* 退款金额 */}
                        <th className="sortable" style={{ textAlign: 'center', whiteSpace: 'nowrap', borderBottom: 'none', paddingBottom: 0, minWidth: '75px', background: '#f2f3f5' }} onClick={() => {
                          if (sortField === 'refundAmount') {
                            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                          } else { 
                            setSortField('refundAmount'); 
                            setSortOrder('desc'); 
                          }
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', width: '100%' }}>
                            <HeaderWithTooltip label="退款金额" tooltip="需上传退款文件统计（仅统计售后状态为'已退款'的记录，按退款审核完成时间统计，取退款金额）" color="#86909c" />
                            <svg className="sort-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={sortField === 'refundAmount' ? '#165dff' : 'currentColor'} strokeWidth="2" style={{ position: 'absolute', right: 0, transform: sortField === 'refundAmount' && sortOrder === 'asc' ? 'rotate(0deg)' : 'rotate(180deg)', opacity: sortField === 'refundAmount' ? 1 : 0.3 }}><path d="M18 15l-6-6-6 6"/></svg>
                          </div>
                        </th>
                        {/* 未核销金额 */}
                        <th className="sortable" style={{ textAlign: 'center', whiteSpace: 'nowrap', borderBottom: 'none', paddingBottom: 0, minWidth: '80px', background: '#f2f3f5' }} onClick={() => {
                          if (sortField === 'unverifiedAmount') {
                            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                          } else { 
                            setSortField('unverifiedAmount'); 
                            setSortOrder('desc'); 
                          }
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', width: '100%' }}>
                            <HeaderWithTooltip label="未核销金额" tooltip="未核销订单的订单实收合计。" color="#86909c" />
                            <svg className="sort-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={sortField === 'unverifiedAmount' ? '#165dff' : 'currentColor'} strokeWidth="2" style={{ position: 'absolute', right: 0, transform: sortField === 'unverifiedAmount' && sortOrder === 'asc' ? 'rotate(0deg)' : 'rotate(180deg)', opacity: sortField === 'unverifiedAmount' ? 1 : 0.3 }}><path d="M18 15l-6-6-6 6"/></svg>
                          </div>
                        </th>
                        {/* 核销金额 */}
                        <th className="sortable" style={{ textAlign: 'center', whiteSpace: 'nowrap', borderBottom: 'none', paddingBottom: 0, minWidth: '75px', background: '#f2f3f5' }} onClick={() => {
                          if (sortField === 'verifyAmount') {
                            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                          } else { 
                            setSortField('verifyAmount'); 
                            setSortOrder('desc'); 
                          }
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', width: '100%' }}>
                            <HeaderWithTooltip label="核销金额" tooltip="核销文件中的金额合计。" color="#86909c" />
                            <svg className="sort-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={sortField === 'verifyAmount' ? '#165dff' : 'currentColor'} strokeWidth="2" style={{ position: 'absolute', right: 0, transform: sortField === 'verifyAmount' && sortOrder === 'asc' ? 'rotate(0deg)' : 'rotate(180deg)', opacity: sortField === 'verifyAmount' ? 1 : 0.3 }}><path d="M18 15l-6-6-6 6"/></svg>
                          </div>
                        </th>
                        {/* 刷单核销金额 */}
                        <th className="sortable" style={{ textAlign: 'center', whiteSpace: 'nowrap', borderBottom: 'none', paddingBottom: 0, minWidth: '80px', background: '#f2f3f5' }} onClick={() => {
                          if (sortField === 'fakeVerifyAmount') {
                            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                          } else { 
                            setSortField('fakeVerifyAmount'); 
                            setSortOrder('desc'); 
                          }
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', width: '100%' }}>
                            <HeaderWithTooltip label="刷单核销金额" tooltip="核销金额 ≤ 10元的核销合计。" color="#86909c" />
                            <svg className="sort-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={sortField === 'fakeVerifyAmount' ? '#165dff' : 'currentColor'} strokeWidth="2" style={{ position: 'absolute', right: 0, transform: sortField === 'fakeVerifyAmount' && sortOrder === 'asc' ? 'rotate(0deg)' : 'rotate(180deg)', opacity: sortField === 'fakeVerifyAmount' ? 1 : 0.3 }}><path d="M18 15l-6-6-6 6"/></svg>
                          </div>
                        </th>
                        {/* 有效核销金额 */}
                        <th className="sortable" style={{ textAlign: 'center', whiteSpace: 'nowrap', borderBottom: 'none', paddingBottom: 0, minWidth: '80px', background: '#f2f3f5' }} onClick={() => {
                          if (sortField === 'validVerifyAmount') {
                            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                          } else { 
                            setSortField('validVerifyAmount'); 
                            setSortOrder('desc'); 
                          }
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', width: '100%' }}>
                            <HeaderWithTooltip label="有效核销金额" tooltip="核销金额 > 10元的核销合计。" color="#1d2129" />
                            <svg className="sort-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={sortField === 'validVerifyAmount' ? '#165dff' : 'currentColor'} strokeWidth="2" style={{ position: 'absolute', right: 0, transform: sortField === 'validVerifyAmount' && sortOrder === 'asc' ? 'rotate(0deg)' : 'rotate(180deg)', opacity: sortField === 'validVerifyAmount' ? 1 : 0.3 }}><path d="M18 15l-6-6-6 6"/></svg>
                          </div>
                        </th>
                        {/* 金额核销率 */}
                        <th className="sortable" style={{ textAlign: 'center', whiteSpace: 'nowrap', borderBottom: 'none', paddingBottom: 0, minWidth: '60px', background: '#f2f3f5' }} onClick={() => {
                          if (sortField === 'amountVerifyRate') {
                            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                          } else { 
                            setSortField('amountVerifyRate'); 
                            setSortOrder('desc'); 
                          }
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', width: '100%' }}>
                            <HeaderWithTooltip label="金额核销率" tooltip="核销金额 / 订单金额 × 100%。" color="#86909c" />
                            <svg className="sort-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={sortField === 'amountVerifyRate' ? '#165dff' : 'currentColor'} strokeWidth="2" style={{ position: 'absolute', right: 0, transform: sortField === 'amountVerifyRate' && sortOrder === 'asc' ? 'rotate(0deg)' : 'rotate(180deg)', opacity: sortField === 'amountVerifyRate' ? 1 : 0.3 }}><path d="M18 15l-6-6-6 6"/></svg>
                          </div>
                        </th>
                        {/* 有效金额率 */}
                        <th className="sortable" style={{ textAlign: 'center', whiteSpace: 'nowrap', borderBottom: 'none', paddingBottom: 0, minWidth: '55px', background: '#f2f3f5' }} onClick={() => {
                          if (sortField === 'validAmountRate') {
                            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                          } else { 
                            setSortField('validAmountRate'); 
                            setSortOrder('desc'); 
                          }
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', width: '100%' }}>
                            <HeaderWithTooltip label="有效金额率" tooltip="有效核销金额 / 有效订单金额 × 100%。" color="#1d2129" />
                            <svg className="sort-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={sortField === 'validAmountRate' ? '#165dff' : 'currentColor'} strokeWidth="2" style={{ position: 'absolute', right: 0, transform: sortField === 'validAmountRate' && sortOrder === 'asc' ? 'rotate(0deg)' : 'rotate(180deg)', opacity: sortField === 'validAmountRate' ? 1 : 0.3 }}><path d="M18 15l-6-6-6 6"/></svg>
                          </div>
                        </th>
                      </>
                    )}
                  </tr>
                  {/* 第二行：合计（显示全部合计 = 匹配 + 未匹配） */}
                  <tr style={{ background: '#f5f5f5' }}>
                    <th style={{ minWidth: '220px', textAlign: 'left', fontSize: '12px', fontWeight: 400, color: '#86909c', paddingTop: '8px', borderTop: '1px solid #e5e6eb', position: 'sticky', left: 0, zIndex: 30, background: '#f5f5f5' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span>共 <span style={{ color: '#165dff', fontWeight: 600 }}>{displayStores.length}</span> 家门店</span>
                      </div>
                    </th>
                    {!isDataMode && (
                      <>
                        {/* 【列2】门店ID - 空（对齐到表头门店ID列） */}
                        <th style={{ textAlign: 'left', fontSize: '12px', fontWeight: 400, color: '#86909c', paddingTop: '8px', borderTop: '1px solid #e5e6eb' }}></th>
                        {/* 【列3】地区 - 空（对齐到表头地区列） */}
                        <th style={{ textAlign: 'left', fontSize: '12px', fontWeight: 400, color: '#86909c', paddingTop: '8px', borderTop: '1px solid #e5e6eb' }}></th>
                        {/* 【列4】类别 - 类别统计（对齐到表头类别列） */}
                        <th style={{ textAlign: 'center', fontSize: '12px', fontWeight: 400, color: '#86909c', paddingTop: '8px', borderTop: '1px solid #e5e6eb' }}>
                          {(() => {
                            const levelCounts: Record<string, number> = {};
                            filteredStores.forEach(s => {
                              const level = s.store_level || '未设置';
                              levelCounts[level] = (levelCounts[level] || 0) + 1;
                            });
                            const total = Object.values(levelCounts).reduce((a, b) => a + b, 0);
                            return total > 0 ? `${total}家` : '-';
                          })()}
                        </th>
                        {/* 【列5】服务状态 - 服务中XX家（对齐到表头服务状态列） */}
                        <th style={{ textAlign: 'left', fontSize: '12px', fontWeight: 400, color: '#86909c', paddingTop: '8px', borderTop: '1px solid #e5e6eb' }}>
                          服务中 <span style={{ color: '#00b42a', fontWeight: 600 }}>{headerStats.operatingCount}</span> 家
                        </th>
                        {/* 【列6】面积 - 面积合计（对齐到表头面积列） */}
                        <th style={{ textAlign: 'center', fontSize: '12px', fontWeight: 400, color: '#86909c', paddingTop: '8px', borderTop: '1px solid #e5e6eb' }}>
                          {(() => {
                            const totalArea = filteredStores.reduce((sum, s) => sum + (parseFloat(s.store_area || '0') || 0), 0);
                            return totalArea > 0 ? `${totalArea.toLocaleString()}㎡` : '-';
                          })()}
                        </th>
                        {/* 【列7】资料 - 资料统计（对齐到表头资料列） */}
                        <th style={{ textAlign: 'center', fontSize: '12px', fontWeight: 400, color: '#86909c', paddingTop: '8px', borderTop: '1px solid #e5e6eb' }}>
                          {(() => {
                            const totalImages = filteredStores.reduce((sum, s) => sum + (s.store_images?.length || 0), 0);
                            return totalImages > 0 ? totalImages : '-';
                          })()}
                        </th>
                        {/* 【列8】人数 - 人数统计（对齐到表头人数列） */}
                        <th style={{ textAlign: 'center', fontSize: '12px', fontWeight: 400, color: '#86909c', paddingTop: '8px', borderTop: '1px solid #e5e6eb' }}>
                          {(() => {
                            const totalStaff = filteredStores.reduce((sum, s) => sum + (parseInt(s.staff_count || '0') || 0), 0);
                            return totalStaff > 0 ? totalStaff : '-';
                          })()}
                        </th>
                        {/* 【列9】获客渠道 - 获客渠道统计（对齐到表头获客渠道列） */}
                        <th style={{ textAlign: 'left', fontSize: '12px', fontWeight: 400, color: '#86909c', paddingTop: '8px', borderTop: '1px solid #e5e6eb' }}>
                          {(() => {
                            const count = filteredStores.filter(s => s.customer_channel).length;
                            return count > 0 ? `${count}家` : '-';
                          })()}
                        </th>
                        {/* 【列10】联系人 - 联系人统计（对齐到表头联系人列） */}
                        <th style={{ textAlign: 'center', fontSize: '12px', fontWeight: 400, color: '#86909c', paddingTop: '8px', borderTop: '1px solid #e5e6eb' }}>
                          {(() => {
                            const contactStoreCount = filteredStores.filter(s => s.contacts && s.contacts.length > 0).length;
                            const totalContacts = filteredStores.reduce((sum, s) => sum + (s.contacts?.length || 0), 0);
                            return totalContacts > 0 ? `${totalContacts}人/${contactStoreCount}家` : '-';
                          })()}
                        </th>
                        {/* 【列11】下次跟进 - 跟进统计（对齐到表头下次跟进列） */}
                        <th style={{ textAlign: 'center', fontSize: '12px', fontWeight: 400, color: '#86909c', paddingTop: '8px', borderTop: '1px solid #e5e6eb', width: '100px' }}>
                          {(() => {
                            const today = new Date();
                            today.setHours(0, 0, 0, 0);
                            const tomorrow = new Date(today);
                            tomorrow.setDate(tomorrow.getDate() + 1);
                            const todayCount = filteredStores.filter(s => {
                              if (!s.latest_next_follow_time) return false;
                              const t = new Date(s.latest_next_follow_time);
                              return t >= today && t < tomorrow;
                            }).length;
                            const overdueCount = filteredStores.filter(s => {
                              if (!s.latest_next_follow_time) return false;
                              return new Date(s.latest_next_follow_time) < today;
                            }).length;
                            return (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                {todayCount > 0 && <span style={{ color: '#165dff' }}>今日{todayCount}</span>}
                                {overdueCount > 0 && <span style={{ color: '#f53f3f' }}>逾期{overdueCount}</span>}
                              </div>
                            );
                          })()}
                        </th>
                        {/* 【列12】操作 - 空（对齐到表头操作列） */}
                        <th style={{ textAlign: 'center', fontSize: '12px', fontWeight: 400, color: '#86909c', paddingTop: '8px', borderTop: '1px solid #e5e6eb', width: '100px' }}></th>
                      </>
                    )}
                    {isDataMode && dataTab === 'cooperation' && (
                      <>
                        {/* ========== 配合数据模式 - 合计行 ========== */}
                        {/* 【列2】门店ID - 空 */}
                        <th style={{ textAlign: 'left', fontSize: '12px', fontWeight: 400, color: '#86909c', paddingTop: '8px', borderTop: '1px solid #e5e6eb', background: '#f5f5f5' }}></th>
                        {/* 【列1】经营分 - 显示上传日期 + 平均数 */}
                        <th style={{ textAlign: 'center', fontSize: '12px', fontWeight: 400, color: '#86909c', paddingTop: '8px', borderTop: '1px solid #e5e6eb', background: '#f5f5f5' }}>
                          <div>
                            {basicInfoFileInfo?.uploadTime ? (
                              <span style={{ color: '#165dff' }}>
                                {new Date(basicInfoFileInfo.uploadTime).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}上传
                              </span>
                            ) : '-'}
                          </div>
                          <div style={{ fontSize: '10px', color: '#86909c', marginTop: '2px' }}>
                            {(() => {
                              const validScores = filteredStores.filter(s => typeof s.business_score === 'number' && !isNaN(s.business_score));
                              if (validScores.length === 0) return '-';
                              const avg = validScores.reduce((sum, s) => sum + (s.business_score as number), 0) / validScores.length;
                              return avg.toFixed(1);
                            })()}
                          </div>
                        </th>
                        {/* 【列2】新增好评数 - 显示近30天 + 合计 */}
                        <th style={{ textAlign: 'center', fontSize: '12px', fontWeight: 400, color: '#86909c', paddingTop: '8px', borderTop: '1px solid #e5e6eb', background: '#f5f5f5' }}>
                          <div>
                            <span style={{ color: '#165dff' }}>近30天</span>
                          </div>
                          <div style={{ fontSize: '10px', color: '#86909c', marginTop: '2px' }}>
                            {(() => {
                              const total = filteredStores.reduce((sum, s) => sum + (typeof s.new_positive_review_count === 'number' ? s.new_positive_review_count : (parseInt(s.new_positive_review_count || '0') || 0)), 0);
                              if (basicInfoFileInfo) {
                                // 有上传文件：0显示0，大于0显示数值
                                return total === 0 ? '0' : (total > 0 ? total.toLocaleString() : '0');
                              } else {
                                // 没有上传文件：0显示*，大于0显示数值
                                return total === 0 ? '*' : (total > 0 ? total.toLocaleString() : '-');
                              }
                            })()}
                          </div>
                        </th>
                        {/* 【列3】新增中差评数 - 显示近30天 + 合计 */}
                        <th style={{ textAlign: 'center', fontSize: '12px', fontWeight: 400, color: '#86909c', paddingTop: '8px', borderTop: '1px solid #e5e6eb', background: '#f5f5f5' }}>
                          <div>
                            <span style={{ color: '#165dff' }}>近30天</span>
                          </div>
                          <div style={{ fontSize: '10px', color: '#86909c', marginTop: '2px' }}>
                            {(() => {
                              const total = filteredStores.reduce((sum, s) => sum + (typeof s.new_negative_review_count === 'number' ? s.new_negative_review_count : (parseInt(s.new_negative_review_count || '0') || 0)), 0);
                              if (basicInfoFileInfo) {
                                // 有上传文件：0显示0，大于0显示数值
                                return total === 0 ? '0' : (total > 0 ? total.toLocaleString() : '0');
                              } else {
                                // 没有上传文件：0显示*，大于0显示数值
                                return total === 0 ? '*' : (total > 0 ? total.toLocaleString() : '-');
                              }
                            })()}
                          </div>
                        </th>
                        {/* 【列4】门店蓝V - 显示合计 */}
                        <th style={{ textAlign: 'center', fontSize: '12px', fontWeight: 400, color: '#86909c', paddingTop: '8px', borderTop: '1px solid #e5e6eb', background: '#f5f5f5' }}>
                          {(() => {
                            // 统计所有门店的抖音ID总数
                            const totalIds = filteredStores.reduce((sum, store) => {
                              if (store.douyin_account_ids) {
                                // 按&分割，计算抖音ID数量
                                const ids = store.douyin_account_ids.split('&').filter(id => id.trim());
                                return sum + ids.length;
                              }
                              return sum;
                            }, 0);

                            if (douyinFileInfo) {
                              // 有上传文件：0显示0，大于0显示数值
                              return totalIds === 0 ? '0' : totalIds.toLocaleString();
                            } else {
                              // 没有上传文件：0显示*，大于0显示数值
                              return totalIds === 0 ? '*' : totalIds.toLocaleString();
                            }
                          })()}
                        </th>
                        {/* 【列5】蓝V发布数 - 显示近30天 + 合计 */}
                        <th style={{ textAlign: 'center', fontSize: '12px', fontWeight: 400, color: '#86909c', paddingTop: '8px', borderTop: '1px solid #e5e6eb', background: '#f5f5f5' }}>
                          <div>
                            <span style={{ color: '#165dff' }}>近30天</span>
                          </div>
                          <div style={{ fontSize: '10px', color: '#86909c', marginTop: '2px' }}>
                            {(() => {
                              const total = filteredStores.reduce((sum, s) => sum + (s.douyin_video_count || 0), 0);
                              if (douyinFileInfo) {
                                // 有上传文件：0显示0，大于0显示数值
                                return total === 0 ? '0' : (total > 0 ? total.toLocaleString() : '0');
                              } else {
                                // 没有上传文件：0显示*，大于0显示数值
                                return total === 0 ? '*' : (total > 0 ? total.toLocaleString() : '-');
                              }
                            })()}
                          </div>
                        </th>
                        {/* 【列6】蓝V播放量 - 显示近30天 + 合计 */}
                        <th style={{ textAlign: 'center', fontSize: '12px', fontWeight: 400, color: '#86909c', paddingTop: '8px', borderTop: '1px solid #e5e6eb', background: '#f5f5f5' }}>
                          <div>
                            <span style={{ color: '#165dff' }}>近30天</span>
                          </div>
                          <div style={{ fontSize: '10px', color: '#86909c', marginTop: '2px' }}>
                            {(() => {
                              const total = filteredStores.reduce((sum, s) => sum + (s.douyin_video_play_count || 0), 0);
                              if (douyinFileInfo) {
                                // 有上传文件：0显示0，大于0显示数值
                                return total === 0 ? '0' : (total > 0 ? total.toLocaleString() : '0');
                              } else {
                                // 没有上传文件：0显示*，大于0显示数值
                                return total === 0 ? '*' : (total > 0 ? total.toLocaleString() : '-');
                              }
                            })()}
                          </div>
                        </th>
                        {/* 【列7】蓝V成交 - 显示近30天 + 合计 */}
                        <th style={{ textAlign: 'center', fontSize: '12px', fontWeight: 400, color: '#86909c', paddingTop: '8px', borderTop: '1px solid #e5e6eb', background: '#f5f5f5' }}>
                          <div>
                            <span style={{ color: '#165dff' }}>近30天</span>
                          </div>
                          <div style={{ fontSize: '10px', color: '#86909c', marginTop: '2px' }}>
                            {(() => {
                              const total = filteredStores.reduce((sum, s) => sum + (s.douyin_deal_count || 0), 0);
                              if (douyinFileInfo) {
                                // 有上传文件：0显示0，大于0显示数值
                                return total === 0 ? '0' : (total > 0 ? total.toLocaleString() : '0');
                              } else {
                                // 没有上传文件：0显示*，大于0显示数值
                                return total === 0 ? '*' : (total > 0 ? total.toLocaleString() : '-');
                              }
                            })()}
                          </div>
                        </th>
                        {/* 【列8】商家职人数 - 显示上传时间 + 合计 */}
                        <th style={{ textAlign: 'center', fontSize: '12px', fontWeight: 400, color: '#86909c', paddingTop: '8px', borderTop: '1px solid #e5e6eb', background: '#f5f5f5' }}>
                          <div>
                            {staffFileInfo?.uploadTime ? (
                              <span style={{ color: '#165dff' }}>
                                {new Date(staffFileInfo.uploadTime).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}上传
                              </span>
                            ) : (
                              <span style={{ color: '#86909c' }}>-</span>
                            )}
                          </div>
                          <div style={{ fontSize: '10px', color: '#86909c', marginTop: '2px' }}>
                            {(() => {
                              const total = filteredStores.reduce((sum, s) => sum + (parseInt(s.staff_count || '0') || 0), 0);
                              if (staffFileInfo) {
                                // 有上传文件：0显示0，大于0显示数值
                                return total === 0 ? '0' : (total > 0 ? total.toLocaleString() : '0');
                              } else {
                                // 没有上传文件：0显示*，大于0显示数值
                                return total === 0 ? '*' : (total > 0 ? total.toLocaleString() : '-');
                              }
                            })()}
                          </div>
                        </th>
                        {/* 【列5】视频数 - 显示近30天 + 合计 */}
                        <th style={{ textAlign: 'center', fontSize: '12px', fontWeight: 400, color: '#86909c', paddingTop: '8px', borderTop: '1px solid #e5e6eb', background: '#f5f5f5' }}>
                          <div>
                            <span style={{ color: '#165dff' }}>近30天</span>
                          </div>
                          <div style={{ fontSize: '10px', color: '#86909c', marginTop: '2px' }}>
                            {(() => {
                              const total = filteredStores.reduce((sum, s) => sum + (typeof s.video_count === 'number' ? s.video_count : (parseInt(s.video_count || '0') || 0)), 0);
                              if (staffFileInfo) {
                                // 有上传文件：0显示0，大于0显示数值
                                return total === 0 ? '0' : (total > 0 ? total.toLocaleString() : '0');
                              } else {
                                // 没有上传文件：0显示*，大于0显示数值
                                return total === 0 ? '*' : (total > 0 ? total.toLocaleString() : '-');
                              }
                            })()}
                          </div>
                        </th>
                        {/* 【列6】职人曝光量 - 显示近30天 + 合计 */}
                        <th style={{ textAlign: 'center', fontSize: '12px', fontWeight: 400, color: '#86909c', paddingTop: '8px', borderTop: '1px solid #e5e6eb', background: '#f5f5f5' }}>
                          <div>
                            <span style={{ color: '#165dff' }}>近30天</span>
                          </div>
                          <div style={{ fontSize: '10px', color: '#86909c', marginTop: '2px' }}>
                            {(() => {
                              const total = filteredStores.reduce((sum, s) => sum + (typeof s.exposure_count === 'number' ? s.exposure_count : (parseInt(s.exposure_count || '0') || 0)), 0);
                              if (staffFileInfo) {
                                // 有上传文件：0显示0，大于0显示数值
                                return total === 0 ? '0' : (total > 0 ? total.toLocaleString() : '0');
                              } else {
                                // 没有上传文件：0显示*，大于0显示数值
                                return total === 0 ? '*' : (total > 0 ? total.toLocaleString() : '-');
                              }
                            })()}
                          </div>
                        </th>
                      </>
                    )}
                    {isDataMode && dataTab === 'order' && (
                      <>
                        {/* ========== 数量类字段（黑色字体）- 订单模式 ========== */}
                        {/* 广告投入 */}
                        <th style={{ textAlign: 'center', fontSize: '12px', fontWeight: 600, color: '#1d2129', paddingTop: '8px', borderTop: '1px solid #e5e6eb', whiteSpace: 'nowrap', background: '#f5f5f5' }}>
                          {(() => {
                            let totalAdSpend = headerStats.dataTotals.adInvestment;
                            if (unmatchedData && unmatchedData.hasAdFile) {
                              totalAdSpend += unmatchedData.adSpend;
                            }
                            return totalAdSpend > 0 ? `¥${totalAdSpend.toFixed(2)}` : '-';
                          })()}
                        </th>
                        {/* 订单数 */}
                        <th style={{ textAlign: 'center', fontSize: '12px', fontWeight: 600, color: '#1d2129', paddingTop: '8px', borderTop: '1px solid #e5e6eb', whiteSpace: 'nowrap', background: '#f5f5f5' }}>
                          {unmatchedData ? (headerStats.dataTotals.totalOrders + unmatchedData.orderCount).toLocaleString() : headerStats.dataTotals.totalOrders.toLocaleString()}
                        </th>
                        {/* 广告订单数 */}
                        <th style={{ textAlign: 'center', fontSize: '12px', fontWeight: 600, color: '#1d2129', paddingTop: '8px', borderTop: '1px solid #e5e6eb', whiteSpace: 'nowrap', background: '#f5f5f5' }}>
                          {(() => {
                            let totalAdOrders = headerStats.dataTotals.adOrders;
                            if (unmatchedData && unmatchedData.hasAdFile) {
                              totalAdOrders += unmatchedData.adOrders;
                            }
                            return totalAdOrders > 0 ? totalAdOrders.toLocaleString() : '-';
                          })()}
                        </th>
                        {/* 广告订单数占比 */}
                        <th style={{ textAlign: 'center', fontSize: '12px', fontWeight: 600, color: '#1d2129', paddingTop: '8px', borderTop: '1px solid #e5e6eb', whiteSpace: 'nowrap', background: '#f5f5f5' }}>
                          {(() => {
                            let totalAdOrders = headerStats.dataTotals.adOrders;
                            let totalOrders = headerStats.dataTotals.totalOrders;
                            if (unmatchedData) {
                              if (unmatchedData.hasAdFile) totalAdOrders += unmatchedData.adOrders;
                              totalOrders += unmatchedData.orderCount;
                            }
                            return totalOrders > 0 ? `${(totalAdOrders / totalOrders * 100).toFixed(2)}%` : '-';
                          })()}
                        </th>
                        {/* 刷单数 */}
                        <th style={{ textAlign: 'center', fontSize: '12px', fontWeight: 600, color: '#1d2129', paddingTop: '8px', borderTop: '1px solid #e5e6eb', whiteSpace: 'nowrap', background: '#f5f5f5' }}>
                          {unmatchedData ? (headerStats.dataTotals.fakeOrders + unmatchedData.fakeOrders).toLocaleString() : headerStats.dataTotals.fakeOrders.toLocaleString()}
                        </th>
                        {/* 有效订单数 */}
                        <th style={{ textAlign: 'center', fontSize: '12px', fontWeight: 600, color: '#1d2129', paddingTop: '8px', borderTop: '1px solid #e5e6eb', whiteSpace: 'nowrap', background: '#f5f5f5' }}>
                          {(() => {
                            const totalOrders = unmatchedData ? (headerStats.dataTotals.totalOrders + unmatchedData.orderCount) : headerStats.dataTotals.totalOrders;
                            const fakeOrders = unmatchedData ? (headerStats.dataTotals.fakeOrders + unmatchedData.fakeOrders) : headerStats.dataTotals.fakeOrders;
                            return (totalOrders - fakeOrders).toLocaleString();
                          })()}
                        </th>
                        {/* 有效订单成本 */}
                        <th style={{ textAlign: 'center', fontSize: '12px', fontWeight: 600, color: '#1d2129', paddingTop: '8px', borderTop: '1px solid #e5e6eb', whiteSpace: 'nowrap', background: '#f5f5f5' }}>
                          {(() => {
                            // 计算合计有效订单成本 = 合计广告投入 / 合计有效订单数
                            const totalAdSpend = (() => {
                              let total = headerStats.dataTotals.adInvestment;
                              if (unmatchedData && unmatchedData.hasAdFile) {
                                total += unmatchedData.adSpend;
                              }
                              return total;
                            })();
                            
                            const totalOrders = unmatchedData ? (headerStats.dataTotals.totalOrders + unmatchedData.orderCount) : headerStats.dataTotals.totalOrders;
                            const fakeOrders = unmatchedData ? (headerStats.dataTotals.fakeOrders + unmatchedData.fakeOrders) : headerStats.dataTotals.fakeOrders;
                            const totalValidOrderCount = totalOrders - fakeOrders;

                            return totalValidOrderCount > 0 && totalAdSpend > 0 
                              ? `¥${(totalAdSpend / totalValidOrderCount).toFixed(2)}` 
                              : '-';
                          })()}
                        </th>
                        {/* 退款数 */}
                        <th style={{ textAlign: 'center', fontSize: '12px', fontWeight: 600, color: '#1d2129', paddingTop: '8px', borderTop: '1px solid #e5e6eb', whiteSpace: 'nowrap', background: '#f5f5f5' }}>
                          {headerStats.dataTotals.hasRefundFile 
                            ? (unmatchedData && unmatchedData.hasRefundFile && unmatchedData.refundCount !== null
                              ? (headerStats.dataTotals.refundCount + unmatchedData.refundCount).toLocaleString()
                              : headerStats.dataTotals.refundCount.toLocaleString())
                            : <span style={{ color: '#f53f3f' }}>*</span>}
                        </th>
                        {/* 未核销数 */}
                        <th style={{ textAlign: 'center', fontSize: '12px', fontWeight: 600, color: '#1d2129', paddingTop: '8px', borderTop: '1px solid #e5e6eb', whiteSpace: 'nowrap', background: '#f5f5f5' }}>
                          {last6MonthsUnverifiedCount.toLocaleString()}
                        </th>
                        {/* 核销数 */}
                        <th style={{ textAlign: 'center', fontSize: '12px', fontWeight: 600, color: '#1d2129', paddingTop: '8px', borderTop: '1px solid #e5e6eb', whiteSpace: 'nowrap', background: '#f5f5f5' }}>
                          {unmatchedData ? (headerStats.dataTotals.verifyCount + unmatchedData.verifyCount).toLocaleString() : headerStats.dataTotals.verifyCount.toLocaleString()}
                        </th>
                        {/* 刷单核销数 */}
                        <th style={{ textAlign: 'center', fontSize: '12px', fontWeight: 600, color: '#1d2129', paddingTop: '8px', borderTop: '1px solid #e5e6eb', whiteSpace: 'nowrap', background: '#f5f5f5' }}>
                          {unmatchedData ? (headerStats.dataTotals.fakeVerifyCount + unmatchedData.fakeVerifyCount).toLocaleString() : headerStats.dataTotals.fakeVerifyCount.toLocaleString()}
                        </th>
                        {/* 有效核销数 */}
                        <th style={{ textAlign: 'center', fontSize: '12px', fontWeight: 600, color: '#1d2129', paddingTop: '8px', borderTop: '1px solid #e5e6eb', whiteSpace: 'nowrap', background: '#f5f5f5' }}>
                          {unmatchedData ? (headerStats.dataTotals.validVerifyCount + unmatchedData.validVerifyCount).toLocaleString() : headerStats.dataTotals.validVerifyCount.toLocaleString()}
                        </th>
                        {/* 核销率 */}
                        <th style={{ textAlign: 'center', fontSize: '12px', fontWeight: 600, color: '#1d2129', paddingTop: '8px', borderTop: '1px solid #e5e6eb', whiteSpace: 'nowrap', background: '#f5f5f5' }}>
                          {(() => {
                            const totalOrders = unmatchedData ? (headerStats.dataTotals.totalOrders + unmatchedData.orderCount) : headerStats.dataTotals.totalOrders;
                            const verifyCount = unmatchedData ? (headerStats.dataTotals.verifyCount + unmatchedData.verifyCount) : headerStats.dataTotals.verifyCount;
                            return totalOrders > 0 ? (verifyCount / totalOrders * 100).toFixed(2) + '%' : '0.0%';
                          })()}
                        </th>
                        {/* 有效核销率 */}
                        <th style={{ textAlign: 'center', fontSize: '12px', fontWeight: 600, color: '#1d2129', paddingTop: '8px', borderTop: '1px solid #e5e6eb', whiteSpace: 'nowrap', background: '#f5f5f5' }}>
                          {headerStats.dataTotals.validVerifyRate.toFixed(2) + '%'}
                        </th>
                      </>
                    )}
                    {isDataMode && dataTab === 'performance' && (
                      <>
                        {/* ========== 金额类字段（单行合计）- 业绩模式 ========== */}
                        {/* 广告投入 */}
                        <th style={{ textAlign: 'center', fontSize: '12px', fontWeight: 600, color: '#1d2129', paddingTop: '8px', borderTop: '1px solid #e5e6eb', whiteSpace: 'nowrap', background: '#f5f5f5' }}>
                          {(() => {
                            let totalAdSpend = parseFloat(String(headerStats.dataTotals.adInvestment)) || 0;
                            if (unmatchedData && unmatchedData.hasAdFile) {
                              totalAdSpend += parseFloat(String(unmatchedData.adSpend)) || 0;
                            }
                            // 确保是有效数字
                            totalAdSpend = isNaN(totalAdSpend) ? 0 : totalAdSpend;
                            return totalAdSpend > 0 ? `¥${totalAdSpend.toLocaleString(undefined, {maximumFractionDigits: 1})}` : '-';
                          })()}
                        </th>
                        {/* 订单金额 */}
                        <th style={{ textAlign: 'center', fontSize: '12px', fontWeight: 600, color: '#1d2129', paddingTop: '8px', borderTop: '1px solid #e5e6eb', whiteSpace: 'nowrap', background: '#f5f5f5' }}>
                          {(() => {
                            const val = (parseFloat(String(headerStats.dataTotals.totalAmount)) || 0) + (parseFloat(String(headerStats.dataTotals.unmatchedTotalAmount)) || 0);
                            return `¥${val.toLocaleString(undefined, {maximumFractionDigits: 1})}`;
                          })()}
                        </th>
                        {/* 刷单金额 */}
                        <th style={{ textAlign: 'center', fontSize: '12px', fontWeight: 600, color: '#1d2129', paddingTop: '8px', borderTop: '1px solid #e5e6eb', whiteSpace: 'nowrap', background: '#f5f5f5' }}>
                          {(() => {
                            const val = (parseFloat(String(headerStats.dataTotals.fakeAmount)) || 0) + (parseFloat(String(headerStats.dataTotals.unmatchedFakeAmount)) || 0);
                            return `¥${val.toLocaleString(undefined, {maximumFractionDigits: 1})}`;
                          })()}
                        </th>
                        {/* 有效订单金额 */}
                        <th style={{ textAlign: 'center', fontSize: '12px', fontWeight: 600, color: '#1d2129', paddingTop: '8px', borderTop: '1px solid #e5e6eb', whiteSpace: 'nowrap', background: '#f5f5f5' }}>
                          {(() => {
                            const val = (parseFloat(String(headerStats.dataTotals.validOrderAmount)) || 0) + (parseFloat(String(headerStats.dataTotals.unmatchedValidOrderAmount)) || 0);
                            return `¥${val.toLocaleString(undefined, {maximumFractionDigits: 1})}`;
                          })()}
                        </th>
                        {/* 退款金额 */}
                        <th style={{ textAlign: 'center', fontSize: '12px', fontWeight: 600, color: '#1d2129', paddingTop: '8px', borderTop: '1px solid #e5e6eb', whiteSpace: 'nowrap', background: '#f5f5f5' }}>
                          {headerStats.dataTotals.hasRefundFile ? (
                            (() => {
                              const val = (headerStats.dataTotals.refundAmount !== null && headerStats.dataTotals.refundAmount !== undefined ? parseFloat(String(headerStats.dataTotals.refundAmount)) || 0 : 0) + (parseFloat(String(headerStats.dataTotals.unmatchedRefundAmount)) || 0);
                              return `¥${val.toLocaleString(undefined, {maximumFractionDigits: 1})}`;
                            })()
                          ) : <span style={{ color: '#f53f3f' }}>*</span>}
                        </th>
                        {/* 未核销金额 */}
                        <th style={{ textAlign: 'center', fontSize: '12px', fontWeight: 600, color: '#1d2129', paddingTop: '8px', borderTop: '1px solid #e5e6eb', whiteSpace: 'nowrap', background: '#f5f5f5' }}>
                          {(() => {
                            const val = (parseFloat(String(headerStats.dataTotals.unverifiedAmount)) || 0) + (parseFloat(String(headerStats.dataTotals.unmatchedUnverifiedAmount)) || 0);
                            return `¥${val.toLocaleString(undefined, {maximumFractionDigits: 1})}`;
                          })()}
                        </th>
                        {/* 核销金额 */}
                        <th style={{ textAlign: 'center', fontSize: '12px', fontWeight: 600, color: '#1d2129', paddingTop: '8px', borderTop: '1px solid #e5e6eb', whiteSpace: 'nowrap', background: '#f5f5f5' }}>
                          {(() => {
                            const val = (parseFloat(String(headerStats.dataTotals.verifyAmount)) || 0) + (parseFloat(String(headerStats.dataTotals.unmatchedVerifyAmount)) || 0);
                            return `¥${val.toLocaleString(undefined, {maximumFractionDigits: 1})}`;
                          })()}
                        </th>
                        {/* 刷单核销金额 */}
                        <th style={{ textAlign: 'center', fontSize: '12px', fontWeight: 600, color: '#1d2129', paddingTop: '8px', borderTop: '1px solid #e5e6eb', whiteSpace: 'nowrap', background: '#f5f5f5' }}>
                          {(() => {
                            const val = (parseFloat(String(headerStats.dataTotals.fakeVerifyAmount)) || 0) + (parseFloat(String(headerStats.dataTotals.unmatchedFakeVerifyAmount)) || 0);
                            return `¥${val.toLocaleString(undefined, {maximumFractionDigits: 1})}`;
                          })()}
                        </th>
                        {/* 有效核销金额 */}
                        <th style={{ textAlign: 'center', fontSize: '12px', fontWeight: 600, color: '#1d2129', paddingTop: '8px', borderTop: '1px solid #e5e6eb', whiteSpace: 'nowrap', background: '#f5f5f5' }}>
                          {(() => {
                            const val = (parseFloat(String(headerStats.dataTotals.validVerifyAmount)) || 0) + (parseFloat(String(headerStats.dataTotals.unmatchedValidVerifyAmount)) || 0);
                            return `¥${val.toLocaleString(undefined, {maximumFractionDigits: 1})}`;
                          })()}
                        </th>
                        {/* 金额核销率 */}
                        <th style={{ textAlign: 'center', fontSize: '12px', fontWeight: 600, color: '#1d2129', paddingTop: '8px', borderTop: '1px solid #e5e6eb', whiteSpace: 'nowrap', background: '#f5f5f5' }}>
                          {headerStats.dataTotals.amountVerifyRate.toFixed(2) + '%'}
                        </th>
                        {/* 有效金额率 */}
                        <th style={{ textAlign: 'center', fontSize: '12px', fontWeight: 600, color: '#1d2129', paddingTop: '8px', borderTop: '1px solid #e5e6eb', whiteSpace: 'nowrap', background: '#f5f5f5' }}>
                          {headerStats.dataTotals.validAmountRate.toFixed(2) + '%'}
                        </th>
                      </>
                    )}
                  </tr>
                  {/* 第三行：门店匹配/未匹配明细（独立一行，与订单模式结构一致） */}
                  {isDataMode && dataTab !== 'cooperation' && (
                    <tr style={{ background: '#f5f5f5' }}>
                      <th style={{ minWidth: '220px', textAlign: 'left', fontSize: '12px', fontWeight: 400, color: '#86909c', paddingTop: '8px', paddingBottom: '8px', position: 'sticky', left: 0, zIndex: 15, background: '#f5f5f5' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {/* 合计行：左侧有放大镜图标 */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            {/* 放大镜图标 - 点击查看合计详情 */}
                            <div
                              style={{
                                flexShrink: 0,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                color: '#165dff',
                              }}
                              onClick={() => {
                                // 直接设置弹窗为true，避免调用后面才定义的函数
                                setShowTotalDetailsModal(true);
                              }}
                              title="查看合计详情"
                            >
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                              >
                                <circle cx="11" cy="11" r="8"></circle>
                                <path d="M21 21l-4.35-4.35"></path>
                              </svg>
                            </div>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#165dff" strokeWidth="2">
                              <path d="M9 12l2 2 4-4"/>
                              <circle cx="12" cy="12" r="10"/>
                            </svg>
                            <span style={{ color: '#165dff' }}>门店匹配数据</span>
                            {dataTab === 'order' && (orderDataRef.current?.channelStats || verifyDataRef.current?.channelStats) && (
                              <button
                                onClick={() => setShowAllChannelModal(true)}
                                style={{
                                  padding: '1px 4px',
                                  borderRadius: '3px',
                                  border: 'none',
                                  background: '#e6f4ff',
                                  color: '#165dff',
                                  fontSize: '9px',
                                  cursor: 'pointer',
                                  marginLeft: '4px',
                                }}
                              >
                                渠道
                              </button>
                            )}
                            {dataTab === 'order' && (orderDataRef.current?.packageStats || verifyDataRef.current?.packageStats) && (
                              <button
                                onClick={() => setShowPackageModal(true)}
                                style={{
                                  padding: '1px 4px',
                                  borderRadius: '3px',
                                  border: 'none',
                                  background: '#e6f4ff',
                                  color: '#165dff',
                                  fontSize: '9px',
                                  cursor: 'pointer',
                                  marginLeft: '4px',
                                }}
                              >
                                套餐
                              </button>
                            )}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', paddingLeft: '18px' }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f53f3f" strokeWidth="2">
                              <circle cx="12" cy="12" r="10"></circle>
                              <line x1="12" y1="8" x2="12" y2="12"></line>
                              <line x1="12" y1="16" x2="12.01" y2="16"></line>
                            </svg>
                            <span style={{ color: '#f53f3f' }}>未匹配数据</span>
                          </div>
                        </div>
                      </th>
                      {dataTab === 'order' && (
                        <>
                        {/* ========== 数量类字段（黑色字体，非加粗） - 门店匹配在上，未匹配在下 - 订单模式 ========== */}
                      {/* 广告投入 */}
                      <th style={{ textAlign: 'center', fontSize: '12px', fontWeight: 400, paddingTop: '8px', paddingBottom: '8px', whiteSpace: 'nowrap', background: '#f5f5f5' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <div style={{ color: '#165dff' }}>
                            {headerStats.dataTotals.adInvestment > 0 ? `¥${headerStats.dataTotals.adInvestment.toFixed(2)}` : '-'}
                          </div>
                          <div>
                            {unmatchedData && unmatchedData.hasAdFile && unmatchedData.adSpend > 0 ? (
                              <span style={{ color: '#f53f3f' }}>{`¥${unmatchedData.adSpend.toFixed(2)}`}</span>
                            ) : <span style={{ color: '#86909c' }}>-</span>}
                          </div>
                        </div>
                      </th>
                      {/* 订单数 */}
                      <th style={{ textAlign: 'center', fontSize: '12px', fontWeight: 400, paddingTop: '8px', paddingBottom: '8px', whiteSpace: 'nowrap', background: '#f5f5f5' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', width: '100%' }}>
                            <span style={{ color: '#165dff' }}>{headerStats.dataTotals.totalOrders.toLocaleString()}</span>
                            {orderDataRef.current?.channelStats && Object.keys(orderDataRef.current.channelStats).length > 0 && (
                              <button
                                onClick={() => {
                                  setChannelModalType('order');
                                  setShowChannelModal(true);
                                }}
                                style={{
                                  position: 'absolute',
                                  right: 0,
                                  padding: '2px',
                                  border: 'none',
                                  background: 'transparent',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                }}
                                title="查看订单渠道占比"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#165dff" strokeWidth="2">
                                  <line x1="18" y1="20" x2="18" y2="10"></line>
                                  <line x1="12" y1="20" x2="12" y2="4"></line>
                                  <line x1="6" y1="20" x2="6" y2="14"></line>
                                </svg>
                              </button>
                            )}
                          </div>
                          <div>
                            {unmatchedData && unmatchedData.hasUnmatched ? (
                              <UnmatchedReasonTooltip 
                                reasons={unmatchedReasons.order} 
                                title="订单未匹配原因"
                                onClick={() => setShowUnmatchedDetailsModal('order')}
                              >
                                <span style={{ color: '#f53f3f', textDecorationLine: 'underline', textUnderlineOffset: '2px' }}>
                                  {unmatchedData.orderCount.toLocaleString()}
                                </span>
                              </UnmatchedReasonTooltip>
                            ) : <span style={{ color: '#86909c' }}>-</span>}
                          </div>
                        </div>
                      </th>
                      {/* 广告订单数 */}
                      <th style={{ textAlign: 'center', fontSize: '12px', fontWeight: 400, paddingTop: '8px', paddingBottom: '8px', whiteSpace: 'nowrap', background: '#f5f5f5' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <div style={{ color: '#165dff' }}>
                            {headerStats.dataTotals.adOrders > 0 ? headerStats.dataTotals.adOrders.toLocaleString() : '-'}
                          </div>
                          <div>
                            {unmatchedData && unmatchedData.hasAdFile && unmatchedData.adOrders > 0 ? (
                              <span style={{ color: '#f53f3f' }}>{unmatchedData.adOrders.toLocaleString()}</span>
                            ) : <span style={{ color: '#86909c' }}>-</span>}
                          </div>
                        </div>
                      </th>
                      {/* 广告订单数占比 */}
                      <th style={{ textAlign: 'center', fontSize: '12px', fontWeight: 400, paddingTop: '8px', paddingBottom: '8px', whiteSpace: 'nowrap', background: '#f5f5f5' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <div style={{ color: '#165dff' }}>
                            {headerStats.dataTotals.adOrdersRate > 0 ? `${headerStats.dataTotals.adOrdersRate.toFixed(2)}%` : '-'}
                          </div>
                          <div style={{ color: '#86909c' }}>-</div>
                        </div>
                      </th>
                      {/* 刷单数 */}
                      <th style={{ textAlign: 'center', fontSize: '12px', fontWeight: 400, paddingTop: '8px', paddingBottom: '8px', whiteSpace: 'nowrap', background: '#f5f5f5' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <div style={{ color: '#165dff' }}>{headerStats.dataTotals.fakeOrders.toLocaleString()}</div>
                          <div>
                            {unmatchedData && unmatchedData.hasUnmatched ? (
                              <UnmatchedReasonTooltip 
                                reasons={unmatchedReasons.order} 
                                title="刷单未匹配原因"
                                onClick={() => setShowUnmatchedDetailsModal('order')}
                              >
                                <span style={{ color: '#f53f3f', textDecorationLine: 'underline', textUnderlineOffset: '2px' }}>
                                  {unmatchedData.fakeOrders.toLocaleString()}
                                </span>
                              </UnmatchedReasonTooltip>
                            ) : <span style={{ color: '#86909c' }}>-</span>}
                          </div>
                        </div>
                      </th>
                      {/* 有效订单数 */}
                      <th style={{ textAlign: 'center', fontSize: '12px', fontWeight: 400, paddingTop: '8px', paddingBottom: '8px', whiteSpace: 'nowrap', background: '#f5f5f5' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', width: '100%' }}>
                            <span style={{ color: '#f53f3f' }}>
                              {headerStats.dataTotals.validOrders.toLocaleString()}
                            </span>
                            {orderDataRef.current?.validChannelStats && Object.keys(orderDataRef.current.validChannelStats).length > 0 && (
                              <button
                                onClick={() => {
                                  setChannelModalType('validOrder');
                                  setShowChannelModal(true);
                                }}
                                style={{
                                  position: 'absolute',
                                  right: 0,
                                  padding: '2px',
                                  border: 'none',
                                  background: 'transparent',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                }}
                                title="查看有效订单渠道占比"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#165dff" strokeWidth="2">
                                  <line x1="18" y1="20" x2="18" y2="10"></line>
                                  <line x1="12" y1="20" x2="12" y2="4"></line>
                                  <line x1="6" y1="20" x2="6" y2="14"></line>
                                </svg>
                              </button>
                            )}
                          </div>
                          <div>
                            {unmatchedData && unmatchedData.hasUnmatched ? (
                              <span style={{ color: '#f53f3f' }}>
                                {((unmatchedData as any).validOrderCount || 0).toLocaleString()}
                              </span>
                            ) : <span style={{ color: '#86909c' }}>-</span>}
                          </div>
                        </div>
                      </th>
                      {/* 有效订单成本 */}
                      <th style={{ textAlign: 'center', fontSize: '12px', fontWeight: 400, paddingTop: '8px', paddingBottom: '8px', whiteSpace: 'nowrap', background: '#f5f5f5' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <div style={{ color: '#165dff' }}>
                            {(() => {
                              // 门店匹配的有效订单成本 = 门店匹配广告投入 / 门店匹配有效订单数
                              // 使用 headerStats.dataTotals（只包含有订单绑定关系的门店）计算
                              const matchedAdInvestment = headerStats.dataTotals.adInvestment || 0;
                              const matchedTotalOrders = headerStats.dataTotals.totalOrders || 0;
                              const matchedFakeOrders = headerStats.dataTotals.fakeOrders || 0;
                              const matchedValidOrders = matchedTotalOrders - matchedFakeOrders;
                              
                              return matchedValidOrders > 0 && matchedAdInvestment > 0 
                                ? `¥${(matchedAdInvestment / matchedValidOrders).toFixed(2)}` 
                                : '-';
                            })()}
                          </div>
                          <div style={{ color: '#86909c' }}>-</div>
                        </div>
                      </th>
                      {/* 退款数 */}
                      <th style={{ textAlign: 'center', fontSize: '12px', fontWeight: 400, paddingTop: '8px', paddingBottom: '8px', whiteSpace: 'nowrap', background: '#f5f5f5' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <div style={{ color: '#165dff' }}>
                            {headerStats.dataTotals.hasRefundFile ? headerStats.dataTotals.refundCount.toLocaleString() : <span style={{ color: '#f53f3f' }}>*</span>}
                          </div>
                          <div>
                            {unmatchedData && unmatchedData.hasUnmatched
                              ? (unmatchedData.hasRefundFile && unmatchedData.refundCount !== null
                                  ? <span style={{ color: '#f53f3f' }}>{unmatchedData.refundCount.toLocaleString()}</span>
                                  : <span style={{ color: '#f53f3f' }}>*</span>)
                              : <span style={{ color: '#86909c' }}>-</span>}
                          </div>
                        </div>
                      </th>
                      {/* 未核销数 */}
                      <th style={{ textAlign: 'center', fontSize: '12px', fontWeight: 400, paddingTop: '8px', paddingBottom: '8px', whiteSpace: 'nowrap', background: '#f5f5f5' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <div style={{ color: '#165dff' }}>{last6MonthsUnverifiedCount.toLocaleString()}</div>
                          <div>
                            {unmatchedData && unmatchedData.hasUnmatched ? (
                              <UnmatchedReasonTooltip 
                                reasons={unmatchedReasons.order} 
                                title="未核销未匹配原因"
                                onClick={() => setShowUnmatchedDetailsModal('order')}
                              >
                                <span style={{ color: '#f53f3f', textDecorationLine: 'underline', textUnderlineOffset: '2px' }}>
                                  {unmatchedData.unverifiedCount.toLocaleString()}
                                </span>
                              </UnmatchedReasonTooltip>
                            ) : <span style={{ color: '#86909c' }}>-</span>}
                          </div>
                        </div>
                      </th>
                      {/* 核销数 */}
                      <th style={{ textAlign: 'center', fontSize: '12px', fontWeight: 400, paddingTop: '8px', paddingBottom: '8px', whiteSpace: 'nowrap', background: '#f5f5f5' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', width: '100%' }}>
                            <span style={{ color: '#165dff' }}>{headerStats.dataTotals.verifyCount.toLocaleString()}</span>
                            {verifyDataRef.current?.channelStats && Object.keys(verifyDataRef.current.channelStats).length > 0 && (
                              <button
                                onClick={() => {
                                  setChannelModalType('verify');
                                  setShowChannelModal(true);
                                }}
                                style={{
                                  position: 'absolute',
                                  right: 0,
                                  padding: '2px',
                                  border: 'none',
                                  background: 'transparent',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                }}
                                title="查看核销渠道占比"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#165dff" strokeWidth="2">
                                  <line x1="18" y1="20" x2="18" y2="10"></line>
                                  <line x1="12" y1="20" x2="12" y2="4"></line>
                                  <line x1="6" y1="20" x2="6" y2="14"></line>
                                </svg>
                              </button>
                            )}
                          </div>
                          <div>
                            {unmatchedData && unmatchedData.hasUnmatched ? (
                              <UnmatchedReasonTooltip 
                                reasons={unmatchedReasons.verify} 
                                title="核销未匹配原因"
                                onClick={() => setShowUnmatchedDetailsModal('verify')}
                              >
                                <span style={{ color: '#f53f3f', textDecorationLine: 'underline', textUnderlineOffset: '2px' }}>
                                  {unmatchedData.verifyCount.toLocaleString()}
                                </span>
                              </UnmatchedReasonTooltip>
                            ) : <span style={{ color: '#86909c' }}>-</span>}
                          </div>
                        </div>
                      </th>
                      {/* 刷单核销数 */}
                      <th style={{ textAlign: 'center', fontSize: '12px', fontWeight: 400, paddingTop: '8px', paddingBottom: '8px', whiteSpace: 'nowrap', background: '#f5f5f5' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <div style={{ color: '#165dff' }}>
                            {unmatchedData ? (headerStats.dataTotals.fakeVerifyCount + unmatchedData.fakeVerifyCount).toLocaleString() : headerStats.dataTotals.fakeVerifyCount.toLocaleString()}
                          </div>
                          <div style={{ color: '#86909c' }}>-</div>
                        </div>
                      </th>
                      {/* 有效核销数 */}
                      <th style={{ textAlign: 'center', fontSize: '12px', fontWeight: 400, paddingTop: '8px', paddingBottom: '8px', whiteSpace: 'nowrap', background: '#f5f5f5' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', width: '100%' }}>
                            <span style={{ color: '#f53f3f' }}>
                              {unmatchedData ? (headerStats.dataTotals.validVerifyCount + unmatchedData.validVerifyCount).toLocaleString() : headerStats.dataTotals.validVerifyCount.toLocaleString()}
                            </span>
                            {verifyDataRef.current?.validChannelStats && Object.keys(verifyDataRef.current.validChannelStats).length > 0 && (
                              <button
                                onClick={() => {
                                  setChannelModalType('validVerify');
                                  setShowChannelModal(true);
                                }}
                                style={{
                                  position: 'absolute',
                                  right: 0,
                                  padding: '2px',
                                  border: 'none',
                                  background: 'transparent',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                }}
                                title="查看有效核销渠道占比"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#165dff" strokeWidth="2">
                                  <line x1="18" y1="20" x2="18" y2="10"></line>
                                  <line x1="12" y1="20" x2="12" y2="4"></line>
                                  <line x1="6" y1="20" x2="6" y2="14"></line>
                                </svg>
                              </button>
                            )}
                          </div>
                          <div style={{ color: '#86909c' }}>-</div>
                        </div>
                      </th>
                      {/* 核销率 */}
                      <th style={{ textAlign: 'center', fontSize: '12px', fontWeight: 400, paddingTop: '8px', paddingBottom: '8px', whiteSpace: 'nowrap', background: '#f5f5f5' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <div style={{ color: '#165dff' }}>{headerStats.dataTotals.verifyRate.toFixed(2) + '%'}</div>
                          <div style={{ color: '#86909c' }}>-</div>
                        </div>
                      </th>
                      {/* 有效核销率 */}
                      <th style={{ textAlign: 'center', fontSize: '12px', fontWeight: 400, paddingTop: '8px', paddingBottom: '8px', whiteSpace: 'nowrap', background: '#f5f5f5' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <div style={{ color: '#f53f3f' }}>{headerStats.dataTotals.validVerifyRate.toFixed(2) + '%'}</div>
                          <div style={{ color: '#86909c' }}>-</div>
                        </div>
                      </th>
                        </>
                      )}
                      {dataTab === 'performance' && (
                        <>
                        {/* ========== 金额类字段（门店匹配在上，未匹配在下）- 业绩模式 ========== */}
                        {/* 广告投入 */}
                        <th style={{ textAlign: 'center', fontSize: '12px', fontWeight: 400, paddingTop: '8px', paddingBottom: '8px', borderTop: '1px solid #e5e6eb', whiteSpace: 'nowrap', background: '#f5f5f5' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', justifyContent: 'center', alignItems: 'center' }}>
                            <div style={{ color: '#165dff' }}>
                              {(() => {
                                const val = parseFloat(String(headerStats.dataTotals.adInvestment)) || 0;
                                return val > 0 ? `¥${val.toLocaleString(undefined, {maximumFractionDigits: 1})}` : '-';
                              })()}
                            </div>
                            <div>
                              {unmatchedData && unmatchedData.hasAdFile ? (
                                (() => {
                                  const val = parseFloat(String(unmatchedData.adSpend)) || 0;
                                  return val > 0 ? (
                                    <span style={{ color: '#f53f3f' }}>{`¥${val.toLocaleString(undefined, {maximumFractionDigits: 1})}`}</span>
                                  ) : <span style={{ color: '#86909c' }}>-</span>;
                                })()
                              ) : <span style={{ color: '#86909c' }}>-</span>}
                            </div>
                          </div>
                        </th>
                        {/* 订单金额 */}
                        <th style={{ textAlign: 'center', fontSize: '12px', fontWeight: 400, paddingTop: '8px', paddingBottom: '8px', borderTop: '1px solid #e5e6eb', whiteSpace: 'nowrap', background: '#f5f5f5' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', justifyContent: 'center', alignItems: 'center' }}>
                            <div style={{ color: '#165dff' }}>{(() => {
                              const val = parseFloat(String(headerStats.dataTotals.totalAmount)) || 0;
                              return '¥' + val.toLocaleString(undefined, {maximumFractionDigits: 1});
                            })()}</div>
                            <div style={{ color: headerStats.dataTotals.unmatchedTotalAmount > 0 ? '#f53f3f' : '#86909c' }}>
                              {(() => {
                                const val = parseFloat(String(headerStats.dataTotals.unmatchedTotalAmount)) || 0;
                                return val > 0 ? `¥${val.toLocaleString(undefined, {maximumFractionDigits: 1})}` : '-';
                              })()}
                            </div>
                          </div>
                        </th>
                        {/* 刷单金额 */}
                        <th style={{ textAlign: 'center', fontSize: '12px', fontWeight: 400, paddingTop: '8px', paddingBottom: '8px', borderTop: '1px solid #e5e6eb', whiteSpace: 'nowrap', background: '#f5f5f5' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', justifyContent: 'center', alignItems: 'center' }}>
                            <div style={{ color: '#165dff' }}>{(() => {
                              const val = parseFloat(String(headerStats.dataTotals.fakeAmount)) || 0;
                              return '¥' + val.toLocaleString(undefined, {maximumFractionDigits: 1});
                            })()}</div>
                            <div style={{ color: headerStats.dataTotals.unmatchedFakeAmount > 0 ? '#f53f3f' : '#86909c' }}>
                              {(() => {
                                const val = parseFloat(String(headerStats.dataTotals.unmatchedFakeAmount)) || 0;
                                return val > 0 ? `¥${val.toLocaleString(undefined, {maximumFractionDigits: 1})}` : '-';
                              })()}
                            </div>
                          </div>
                        </th>
                        {/* 有效订单金额 */}
                        <th style={{ textAlign: 'center', fontSize: '12px', fontWeight: 400, paddingTop: '8px', paddingBottom: '8px', borderTop: '1px solid #e5e6eb', whiteSpace: 'nowrap', background: '#f5f5f5' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', justifyContent: 'center', alignItems: 'center' }}>
                            <div style={{ color: '#165dff' }}>{(() => {
                              const val = parseFloat(String(headerStats.dataTotals.validOrderAmount)) || 0;
                              return '¥' + val.toLocaleString(undefined, {maximumFractionDigits: 1});
                            })()}</div>
                            <div style={{ color: headerStats.dataTotals.unmatchedValidOrderAmount > 0 ? '#f53f3f' : '#86909c' }}>
                              {(() => {
                                const val = parseFloat(String(headerStats.dataTotals.unmatchedValidOrderAmount)) || 0;
                                return val > 0 ? `¥${val.toLocaleString(undefined, {maximumFractionDigits: 1})}` : '-';
                              })()}
                            </div>
                          </div>
                        </th>
                        {/* 退款金额 */}
                        <th style={{ textAlign: 'center', fontSize: '12px', fontWeight: 400, paddingTop: '8px', paddingBottom: '8px', borderTop: '1px solid #e5e6eb', whiteSpace: 'nowrap', background: '#f5f5f5' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', justifyContent: 'center', alignItems: 'center' }}>
                            <div style={{ color: headerStats.dataTotals.hasRefundFile ? '#165dff' : '#f53f3f' }}>
                              {headerStats.dataTotals.hasRefundFile ? (
                                (() => {
                                  const val = parseFloat(String(headerStats.dataTotals.refundAmount)) || 0;
                                  return `¥${val.toLocaleString(undefined, {maximumFractionDigits: 1})}`;
                                })()
                              ) : '*'}
                            </div>
                            <div style={{ color: headerStats.dataTotals.unmatchedRefundAmount > 0 ? '#f53f3f' : '#86909c' }}>
                              {headerStats.dataTotals.hasRefundFile && headerStats.dataTotals.unmatchedRefundAmount > 0 ? (
                                (() => {
                                  const val = parseFloat(String(headerStats.dataTotals.unmatchedRefundAmount)) || 0;
                                  return `¥${val.toLocaleString(undefined, {maximumFractionDigits: 1})}`;
                                })()
                              ) : '-'}
                            </div>
                          </div>
                        </th>
                        {/* 未核销金额 */}
                        <th style={{ textAlign: 'center', fontSize: '12px', fontWeight: 400, paddingTop: '8px', paddingBottom: '8px', borderTop: '1px solid #e5e6eb', whiteSpace: 'nowrap', background: '#f5f5f5' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', justifyContent: 'center', alignItems: 'center' }}>
                            <div style={{ color: '#165dff' }}>{(() => {
                              const val = parseFloat(String(headerStats.dataTotals.unverifiedAmount)) || 0;
                              return '¥' + val.toLocaleString(undefined, {maximumFractionDigits: 1});
                            })()}</div>
                            <div style={{ color: headerStats.dataTotals.unmatchedUnverifiedAmount > 0 ? '#f53f3f' : '#86909c' }}>
                              {(() => {
                                const val = parseFloat(String(headerStats.dataTotals.unmatchedUnverifiedAmount)) || 0;
                                return val > 0 ? `¥${val.toLocaleString(undefined, {maximumFractionDigits: 1})}` : '-';
                              })()}
                            </div>
                          </div>
                        </th>
                        {/* 核销金额 */}
                        <th style={{ textAlign: 'center', fontSize: '12px', fontWeight: 400, paddingTop: '8px', paddingBottom: '8px', borderTop: '1px solid #e5e6eb', whiteSpace: 'nowrap', background: '#f5f5f5' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', justifyContent: 'center', alignItems: 'center' }}>
                            <div style={{ color: '#165dff' }}>{(() => {
                              const val = parseFloat(String(headerStats.dataTotals.verifyAmount)) || 0;
                              return '¥' + val.toLocaleString(undefined, {maximumFractionDigits: 1});
                            })()}</div>
                            <div style={{ color: headerStats.dataTotals.unmatchedVerifyAmount > 0 ? '#f53f3f' : '#86909c' }}>
                              {(() => {
                                const val = parseFloat(String(headerStats.dataTotals.unmatchedVerifyAmount)) || 0;
                                return val > 0 ? `¥${val.toLocaleString(undefined, {maximumFractionDigits: 1})}` : '-';
                              })()}
                            </div>
                          </div>
                        </th>
                        {/* 刷单核销金额 */}
                        <th style={{ textAlign: 'center', fontSize: '12px', fontWeight: 400, paddingTop: '8px', paddingBottom: '8px', borderTop: '1px solid #e5e6eb', whiteSpace: 'nowrap', background: '#f5f5f5' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', justifyContent: 'center', alignItems: 'center' }}>
                            <div style={{ color: '#165dff' }}>{(() => {
                              const val = parseFloat(String(headerStats.dataTotals.fakeVerifyAmount)) || 0;
                              return '¥' + val.toLocaleString(undefined, {maximumFractionDigits: 1});
                            })()}</div>
                            <div style={{ color: headerStats.dataTotals.unmatchedFakeVerifyAmount > 0 ? '#f53f3f' : '#86909c' }}>
                              {(() => {
                                const val = parseFloat(String(headerStats.dataTotals.unmatchedFakeVerifyAmount)) || 0;
                                return val > 0 ? `¥${val.toLocaleString(undefined, {maximumFractionDigits: 1})}` : '-';
                              })()}
                            </div>
                          </div>
                        </th>
                        {/* 有效核销金额 */}
                        <th style={{ textAlign: 'center', fontSize: '12px', fontWeight: 400, paddingTop: '8px', paddingBottom: '8px', borderTop: '1px solid #e5e6eb', whiteSpace: 'nowrap', background: '#f5f5f5' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', justifyContent: 'center', alignItems: 'center' }}>
                            <div style={{ color: '#165dff' }}>{(() => {
                              const val = parseFloat(String(headerStats.dataTotals.validVerifyAmount)) || 0;
                              return '¥' + val.toLocaleString(undefined, {maximumFractionDigits: 1});
                            })()}</div>
                            <div style={{ color: headerStats.dataTotals.unmatchedValidVerifyAmount > 0 ? '#f53f3f' : '#86909c' }}>
                              {(() => {
                                const val = parseFloat(String(headerStats.dataTotals.unmatchedValidVerifyAmount)) || 0;
                                return val > 0 ? `¥${val.toLocaleString(undefined, {maximumFractionDigits: 1})}` : '-';
                              })()}
                            </div>
                          </div>
                        </th>
                        {/* 金额核销率 */}
                        <th style={{ textAlign: 'center', fontSize: '12px', fontWeight: 400, paddingTop: '8px', paddingBottom: '8px', borderTop: '1px solid #e5e6eb', whiteSpace: 'nowrap', background: '#f5f5f5' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', justifyContent: 'center', alignItems: 'center' }}>
                            <div style={{ color: '#f53f3f' }}>{headerStats.dataTotals.amountVerifyRate.toFixed(2)}%</div>
                            <div style={{ color: '#86909c' }}>-</div>
                          </div>
                        </th>
                        {/* 有效金额率 */}
                        <th style={{ textAlign: 'center', fontSize: '12px', fontWeight: 400, paddingTop: '8px', paddingBottom: '8px', borderTop: '1px solid #e5e6eb', whiteSpace: 'nowrap', background: '#f5f5f5' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', justifyContent: 'center', alignItems: 'center' }}>
                            <div style={{ color: '#165dff' }}>{headerStats.dataTotals.validAmountRate.toFixed(2)}%</div>
                            <div style={{ color: '#86909c' }}>-</div>
                          </div>
                        </th>
                        </>
                      )}
                    </tr>
                  )}
                </thead>
                <tbody>
                  {displayStores.map((store, index) => {
                    const storeData = isDataMode ? store.storeData : null;
                    const isCancelled = store.business_status === '取消合作';
                    // 使用稳定的关键字避免内联函数导致子组件重渲染
                    const storeId = store.id;
                    const handleRobotClick = () => openRobotModal(storeId);
                    const handleViewDetail = () => openDetailModal({
                      storeId: store.id,  // 修复：使用UUID主键，而不是门店编号
                      storeName: store.store_name,
                      storeData: store,
                      hideTags: hideTags
                    });
                    return (
                    <Fragment key={store.id}>
                      <tr className={isCancelled ? 'cancelled' : ''}>
                      <td style={{ textAlign: 'left', position: 'sticky', left: 0, zIndex: 5, background: isDataMode ? '#f5f5f5' : 'var(--color-bg-1)', minWidth: '220px' }}>
                        <StoreNameCell
                          store={store}
                          onRobotClick={handleRobotClick}
                          onUpdate={fetchStores}
                          onViewDetail={handleViewDetail}
                          hideTags={hideTags}
                          storeGroups={storeGroups}
                          onGroupClick={(groupId) => {
                            setActiveGroupId(groupId);
                            setActiveCategory('all');
                            setFollowTimeFilter('all');
                          }}
                        />
                      </td>
                      {!isDataMode && (
                        <>
                          <td style={{ textAlign: 'left', fontFamily: 'monospace', fontSize: '10px', color: '#86909c', minWidth: '70px' }}>
                            {store.store_id || '-'}
                          </td>
                          <td style={{ textAlign: 'left', minWidth: '100px', width: '100px', maxWidth: '100px' }}>
                            <LocationCell store={store} updateStore={updateStore} />
                          </td>
                          <td style={{ textAlign: 'center', fontSize: '12px', color: '#4e5969', padding: '4px 8px', minWidth: '70px' }}>
                            <LevelCell store={store} updateStore={updateStore} />
                          </td>
                          <td style={{ textAlign: 'left' }}><BusinessStatusCell store={store} updateStore={updateStore} /></td>
                          <td style={{ textAlign: 'center', fontSize: '12px', color: '#4e5969', padding: '4px 8px', minWidth: '70px' }}>
                            <EditableCell
                              value={store.store_area ? `${store.store_area}㎡` : '-'}
                              onSave={async (newValue) => {
                                const numericValue = newValue.replace('㎡', '');
                                const res = await fetch(`/api/stores/${store.id}`, {
                                  method: 'PUT',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ store_area: numericValue })
                                });
                                if (res.ok) {
                                  updateStore(store.id, { store_area: numericValue });
                                  return true;
                                }
                                return false;
                              }}
                              placeholder="面积"
                              suffix="㎡"
                              inputWidth={50}
                            />
                          </td>
                          <td style={{ textAlign: 'center', padding: '4px 8px', minWidth: '140px' }}>
                            <StoreImagesCell store={store} onUpdate={fetchStores} />
                          </td>
                          <td style={{ textAlign: 'center', fontSize: '12px', color: '#4e5969', padding: '4px 8px', minWidth: '70px' }}>
                            <EditableCell
                              value={store.staff_count || '-'}
                              onSave={async (newValue) => {
                                const res = await fetch(`/api/stores/${store.id}`, {
                                  method: 'PUT',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ staff_count: newValue })
                                });
                                if (res.ok) {
                                  updateStore(store.id, { staff_count: newValue });
                                  return true;
                                }
                                return false;
                              }}
                              placeholder="人数"
                              inputWidth={50}
                            />
                          </td>
                          <td style={{ textAlign: 'left', fontSize: '12px', color: '#4e5969', padding: '4px 8px' }}>
                            <EditableCell
                              value={store.customer_channel || '-'}
                              onSave={async (newValue) => {
                                const res = await fetch(`/api/stores/${store.id}`, {
                                  method: 'PUT',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ customer_channel: newValue === '-' ? '' : newValue })
                                });
                                if (res.ok) {
                                  updateStore(store.id, { customer_channel: newValue === '-' ? '' : newValue });
                                  return true;
                                }
                                return false;
                              }}
                              placeholder="获客渠道"
                              textAlign="left"
                              inputWidth={150}
                              multiline
                              textareaHeight={36}
                            />
                          </td>
                          <td style={{ textAlign: 'left', verticalAlign: 'middle' }}><ContactsCell store={store} onUpdate={fetchStores} /></td>
                          <td style={{ textAlign: 'left', verticalAlign: 'middle' }}><NextFollowTimeCell store={store} /></td>
                          <td style={{ textAlign: 'center' }}>
                            <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                              <button
                              onClick={() => openFollowModal(store.id)}
                              className="btn btn-text btn-sm"
                              title="填写跟进记录"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                              </svg>
                            </button>
                            <FollowRecordPreviewButton 
                              store={store} 
                              onClick={() => openFollowViewModal(store.id)} 
                            />
                          </div>
                        </td>
                        </>
                      )}
                      {isDataMode && dataTab === 'cooperation' && (
                        <>
                          {/* ========== 配合数据模式 ========== */}
                          {/* 【列2】门店ID */}
                          <td style={{ textAlign: 'left', fontFamily: 'monospace', fontSize: '10px', color: '#86909c', minWidth: '70px', background: 'white' }}>
                            {store.store_id || '-'}
                          </td>
                          {/* 【新增】经营分 */}
                          <td style={{ textAlign: 'center', fontSize: '12px', color: '#4e5969', padding: '4px 8px', minWidth: '70px', background: 'white' }}>
                            {(() => {
                              if (basicInfoFileInfo) {
                                // 有上传文件：null显示*，0显示0，大于0显示数值
                                if (store.business_score === null || store.business_score === undefined) return '*';
                                const val = Number(store.business_score);
                                if (isNaN(val)) return '0';
                                return val.toFixed(1);
                              } else {
                                // 没有上传文件：null显示*，0显示0，大于0显示数值
                                if (store.business_score === null || store.business_score === undefined) return '*';
                                const val = Number(store.business_score);
                                if (isNaN(val)) return '-';
                                return val.toFixed(1);
                              }
                            })()}
                          </td>
                          {/* 【新增】新增好评数 */}
                          <td style={{ textAlign: 'center', fontSize: '12px', color: '#4e5969', padding: '4px 8px', minWidth: '80px', background: 'white' }}>
                            {(() => {
                              const val = typeof store.new_positive_review_count === 'number' ? store.new_positive_review_count : (parseInt(store.new_positive_review_count || '0') || 0);
                              if (basicInfoFileInfo) {
                                // 有上传文件：0显示0，大于0显示数值，null显示0
                                return val === 0 ? '0' : (val > 0 ? val.toLocaleString() : '0');
                              } else {
                                // 没有上传文件：null显示*，0显示0，大于0显示数值
                                return store.new_positive_review_count === null ? '*' : (val === 0 ? '0' : (val > 0 ? val.toLocaleString() : '-'));
                              }
                            })()}
                          </td>
                          {/* 【新增】新增中差评数 */}
                          <td style={{ textAlign: 'center', fontSize: '12px', color: '#4e5969', padding: '4px 8px', minWidth: '90px', background: 'white' }}>
                            {(() => {
                              const val = typeof store.new_negative_review_count === 'number' ? store.new_negative_review_count : (parseInt(store.new_negative_review_count || '0') || 0);
                              if (basicInfoFileInfo) {
                                // 有上传文件：0显示0，大于0显示数值，null显示0
                                return val === 0 ? '0' : (val > 0 ? val.toLocaleString() : '0');
                              } else {
                                // 没有上传文件：null显示*，0显示0，大于0显示数值
                                return store.new_negative_review_count === null ? '*' : (val === 0 ? '0' : (val > 0 ? val.toLocaleString() : '-'));
                              }
                            })()}
                          </td>
                          {/* 【新增】门店蓝V */}
                          <td style={{ textAlign: 'left', fontFamily: 'monospace', fontSize: '10px', color: '#86909c', minWidth: '50px', background: 'white' }}>
                            {store.douyin_account_ids || (douyinFileInfo ? '-' : '*')}
                          </td>
                          {/* 【新增】蓝V发布数 */}
                          <td style={{ textAlign: 'center', fontSize: '12px', color: '#4e5969', padding: '4px 8px', minWidth: '90px', background: 'white' }}>
                            {(() => {
                              const val = typeof store.douyin_video_count === 'number' ? store.douyin_video_count : (parseInt(store.douyin_video_count || '0') || 0);
                              if (douyinFileInfo) {
                                // 有上传文件：0显示0，大于0显示数值，null显示0
                                return val === 0 ? '0' : (val > 0 ? val.toLocaleString() : '0');
                              } else {
                                // 没有上传文件：null显示*，0显示0，大于0显示数值
                                return store.douyin_video_count === null ? '*' : (val === 0 ? '0' : (val > 0 ? val.toLocaleString() : '-'));
                              }
                            })()}
                          </td>
                          {/* 【新增】蓝V播放量 */}
                          <td style={{ textAlign: 'center', fontSize: '12px', color: '#4e5969', padding: '4px 8px', minWidth: '90px', background: 'white' }}>
                            {(() => {
                              const val = typeof store.douyin_video_play_count === 'number' ? store.douyin_video_play_count : (parseInt(store.douyin_video_play_count || '0') || 0);
                              if (douyinFileInfo) {
                                // 有上传文件：0显示0，大于0显示数值，null显示0
                                return val === 0 ? '0' : (val > 0 ? val.toLocaleString() : '0');
                              } else {
                                // 没有上传文件：null显示*，0显示0，大于0显示数值
                                return store.douyin_video_play_count === null ? '*' : (val === 0 ? '0' : (val > 0 ? val.toLocaleString() : '-'));
                              }
                            })()}
                          </td>
                          {/* 【新增】蓝V成交 */}
                          <td style={{ textAlign: 'center', fontSize: '12px', color: '#4e5969', padding: '4px 8px', minWidth: '80px', background: 'white' }}>
                            {(() => {
                              const val = typeof store.douyin_deal_count === 'number' ? store.douyin_deal_count : (parseInt(store.douyin_deal_count || '0') || 0);
                              if (douyinFileInfo) {
                                // 有上传文件：0显示0，大于0显示数值，null显示0
                                return val === 0 ? '0' : (val > 0 ? val.toLocaleString() : '0');
                              } else {
                                // 没有上传文件：null显示*，0显示0，大于0显示数值
                                return store.douyin_deal_count === null ? '*' : (val === 0 ? '0' : (val > 0 ? val.toLocaleString() : '-'));
                              }
                            })()}
                          </td>
                          {/* 【新增】商家职人数 */}
                          <td style={{ textAlign: 'center', fontSize: '12px', color: '#4e5969', padding: '4px 8px', minWidth: '100px', background: 'white' }}>
                            {(() => {
                              // 如果三个字段都为0，显示*
                              if (!store.staff_count && !store.video_count && !store.exposure_count) return '*';

                              const val = parseInt(store.staff_count || '0') || 0;
                              if (staffFileInfo) {
                                // 有上传文件：0显示0，大于0显示数值，null显示0
                                return val === 0 ? '0' : (val > 0 ? val.toLocaleString() : '0');
                              } else {
                                // 没有上传文件：null显示*，0显示0，大于0显示数值
                                return store.staff_count === null ? '*' : (val === 0 ? '0' : (val > 0 ? val.toLocaleString() : '-'));
                              }
                            })()}
                          </td>
                          {/* 【新增】视频数 */}
                          <td style={{ textAlign: 'center', fontSize: '12px', color: '#4e5969', padding: '4px 8px', minWidth: '70px', background: 'white' }}>
                            {(() => {
                              // 如果三个字段都为0，显示*
                              if (!store.staff_count && !store.video_count && !store.exposure_count) return '*';

                              const val = typeof store.video_count === 'number' ? store.video_count : (parseInt(store.video_count || '0') || 0);
                              if (staffFileInfo) {
                                // 有上传文件：0显示0，大于0显示数值，null显示0
                                return val === 0 ? '0' : (val > 0 ? val.toLocaleString() : '0');
                              } else {
                                // 没有上传文件：null显示*，0显示0，大于0显示数值
                                return store.video_count === null ? '*' : (val === 0 ? '0' : (val > 0 ? val.toLocaleString() : '-'));
                              }
                            })()}
                          </td>
                          {/* 【新增】职人曝光量 */}
                          <td style={{ textAlign: 'center', fontSize: '12px', color: '#4e5969', padding: '4px 8px', minWidth: '90px', background: 'white' }}>
                            {(() => {
                              // 如果三个字段都为0，显示*
                              if (!store.staff_count && !store.video_count && !store.exposure_count) return '*';

                              const val = typeof store.exposure_count === 'number' ? store.exposure_count : (parseInt(store.exposure_count || '0') || 0);
                              if (staffFileInfo) {
                                // 有上传文件：0显示0，大于0显示数值，null显示0
                                return val === 0 ? '0' : (val > 0 ? val.toLocaleString() : '0');
                              } else {
                                // 没有上传文件：null显示*，0显示0，大于0显示数值
                                return store.exposure_count === null ? '*' : (val === 0 ? '0' : (val > 0 ? val.toLocaleString() : '-'));
                              }
                            })()}
                          </td>
                        </>
                      )}
                      {isDataMode && dataTab === 'order' && storeData && (
                        <>
                          {/* ========== 数量类字段（浅绿色背景，黑色字体）- 订单模式 ========== */}
                          {/* 广告投入 */}
                          <td style={{ textAlign: 'center', color: storeData.hasAdFile ? '#1d2129' : '#ff7d00', background: '#f7fbf7' }}>
                            {storeData.hasAdFile ? `¥${storeData.adInvestment.toFixed(2)}` : '*'}
                          </td>
                          {/* 订单数 */}
                          <td style={{ textAlign: 'center', color: storeData.hasOrderFile ? '#1d2129' : '#f53f3f', background: '#f7fbf7' }}>
                            {storeData.hasOrderFile ? storeData.totalOrders : '*'}
                          </td>
                          {/* 广告订单数 */}
                          <td style={{ textAlign: 'center', color: storeData.hasAdFile ? '#1d2129' : '#ff7d00', background: '#f7fbf7' }}>
                            {storeData.hasAdFile ? storeData.adOrders : '*'}
                          </td>
                          {/* 广告订单数占比 */}
                          <td style={{ textAlign: 'center', color: storeData.hasAdFile && storeData.hasOrderFile ? '#1d2129' : '#ff7d00', background: '#f7fbf7' }}>
                            {storeData.hasAdFile && storeData.hasOrderFile ? `${storeData.adOrdersRate}%` : '*'}
                          </td>
                          {/* 刷单数 */}
                          <td style={{ textAlign: 'center', color: storeData.hasOrderFile ? '#1d2129' : '#f53f3f', background: '#f7fbf7' }}>
                            {storeData.hasOrderFile ? storeData.fakeOrders : '*'}
                          </td>
                          {/* 有效订单数 */}
                          <td style={{ textAlign: 'center', color: storeData.hasOrderFile ? '#1d2129' : '#f53f3f', background: '#fef0f2', fontWeight: 700 }}>
                            {storeData.hasOrderFile ? storeData.validOrders : '*'}
                          </td>
                          {/* 有效订单成本 */}
                          <td style={{ textAlign: 'center', color: storeData.hasAdFile && storeData.hasOrderFile ? '#1d2129' : '#ff7d00', background: '#f7fbf7' }}>
                            {storeData.hasAdFile && storeData.hasOrderFile 
                              ? (storeData.validOrders > 0 
                                  ? `¥${(storeData.adInvestment / storeData.validOrders).toFixed(2)}` 
                                  : '-')
                              : '*'}
                          </td>
                          {/* 退款数 */}
                          <td style={{ textAlign: 'center', color: storeData.hasRefundFile ? '#1d2129' : '#f53f3f', background: '#f7fbf7' }}>
                            {storeData.hasRefundFile ? storeData.refundCount : '*'}
                          </td>
                          {/* 未核销数 */}
                          <td style={{ textAlign: 'center', color: storeData.hasOrderFile ? '#1d2129' : '#f53f3f', background: '#f7fbf7' }}>
                            {storeData.hasOrderFile ? storeData.unverifiedCount : '*'}
                          </td>
                          {/* 核销数 */}
                          <td style={{ textAlign: 'center', color: storeData.hasVerifyFile ? '#1d2129' : '#f53f3f', background: '#f7fbf7' }}>
                            {storeData.hasVerifyFile ? storeData.verifyCount : '*'}
                          </td>
                          {/* 刷单核销数 */}
                          <td style={{ textAlign: 'center', color: storeData.hasVerifyFile ? '#1d2129' : '#f53f3f', background: '#f7fbf7' }}>
                            {storeData.hasVerifyFile ? storeData.fakeVerifyCount : '*'}
                          </td>
                          {/* 有效核销数 */}
                          <td style={{ textAlign: 'center', color: storeData.hasVerifyFile ? '#1d2129' : '#f53f3f', background: '#fef0f2', fontWeight: 700 }}>
                            {storeData.hasVerifyFile ? storeData.validVerifyCount : '*'}
                          </td>
                          {/* 核销率 */}
                          <td style={{ textAlign: 'center', color: storeData.hasVerifyFile ? '#1d2129' : '#f53f3f', background: '#f7fbf7' }}>
                            {storeData.hasVerifyFile ? `${storeData.verifyRate}%` : '*'}
                          </td>
                          {/* 有效核销率 */}
                          <td style={{ textAlign: 'center', color: storeData.hasVerifyFile ? '#1d2129' : '#f53f3f', background: '#fef0f2', fontWeight: 700 }}>
                            {storeData.hasVerifyFile ? `${storeData.validVerifyRate}%` : '*'}
                          </td>
                        </>
                      )}
                      {isDataMode && dataTab === 'performance' && storeData && (
                        <>
                          {/* ========== 金额类字段（浅蓝色背景，灰色字体）- 业绩模式 ========== */}
                          {/* 广告投入 */}
                          <td style={{ textAlign: 'center', color: storeData.hasAdFile ? '#86909c' : '#ff7d00', background: '#f5fafd' }}>
                            {storeData.hasAdFile ? (
                              (() => {
                                const val = parseFloat(String(storeData.adInvestment)) || 0;
                                return `¥${val.toLocaleString(undefined, {maximumFractionDigits: 1})}`;
                              })()
                            ) : '*'}
                          </td>
                          {/* 订单金额 */}
                          <td style={{ textAlign: 'center', color: storeData.hasOrderFile ? '#86909c' : '#f53f3f', background: '#f5fafd' }}>
                            {storeData.hasOrderFile ? (
                              (() => {
                                const val = parseFloat(String(storeData.totalAmount)) || 0;
                                return `¥${val.toLocaleString(undefined, {maximumFractionDigits: 1})}`;
                              })()
                            ) : '*'}
                          </td>
                          {/* 刷单金额 */}
                          <td style={{ textAlign: 'center', color: storeData.hasOrderFile ? '#86909c' : '#f53f3f', background: '#f5fafd' }}>
                            {storeData.hasOrderFile ? (
                              (() => {
                                const val = parseFloat(String(storeData.fakeAmount)) || 0;
                                return `¥${val.toLocaleString(undefined, {maximumFractionDigits: 1})}`;
                              })()
                            ) : '*'}
                          </td>
                          {/* 有效订单金额 */}
                          <td style={{ textAlign: 'center', color: storeData.hasOrderFile ? '#86909c' : '#f53f3f', background: '#f5fafd' }}>
                            {storeData.hasOrderFile ? (
                              (() => {
                                const val = parseFloat(String(storeData.validOrderAmount)) || 0;
                                return `¥${val.toLocaleString(undefined, {maximumFractionDigits: 1})}`;
                              })()
                            ) : '*'}
                          </td>
                          {/* 退款金额 */}
                          <td style={{ textAlign: 'center', color: storeData.hasRefundFile ? '#86909c' : '#f53f3f', background: '#f5fafd' }}>
                            {storeData.hasRefundFile ? (
                              (() => {
                                const val = storeData.refundAmount !== null && storeData.refundAmount !== undefined ? parseFloat(String(storeData.refundAmount)) || 0 : 0;
                                return `¥${val.toLocaleString(undefined, {maximumFractionDigits: 1})}`;
                              })()
                            ) : '*'}
                          </td>
                          {/* 未核销金额 */}
                          <td style={{ textAlign: 'center', color: storeData.hasOrderFile ? '#86909c' : '#f53f3f', background: '#f5fafd' }}>
                            {storeData.hasOrderFile ? (
                              (() => {
                                const val = parseFloat(String(storeData.unverifiedAmount)) || 0;
                                return `¥${val.toLocaleString(undefined, {maximumFractionDigits: 1})}`;
                              })()
                            ) : '*'}
                          </td>
                          {/* 核销金额 */}
                          <td style={{ textAlign: 'center', color: storeData.hasVerifyFile ? '#86909c' : '#f53f3f', background: '#fef0f2' }}>
                            {storeData.hasVerifyFile ? (
                              (() => {
                                const val = parseFloat(String(storeData.verifyAmount)) || 0;
                                return `¥${val.toLocaleString(undefined, {maximumFractionDigits: 1})}`;
                              })()
                            ) : '*'}
                          </td>
                          {/* 刷单核销金额 */}
                          <td style={{ textAlign: 'center', color: storeData.hasVerifyFile ? '#86909c' : '#f53f3f', background: '#f5fafd' }}>
                            {storeData.hasVerifyFile ? (
                              (() => {
                                const val = parseFloat(String(storeData.fakeVerifyAmount)) || 0;
                                return `¥${val.toLocaleString(undefined, {maximumFractionDigits: 1})}`;
                              })()
                            ) : '*'}
                          </td>
                          {/* 有效核销金额 */}
                          <td style={{ textAlign: 'center', color: storeData.hasVerifyFile ? '#86909c' : '#f53f3f', background: '#f5fafd' }}>
                            {storeData.hasVerifyFile ? (
                              (() => {
                                const val = parseFloat(String(storeData.validVerifyAmount)) || 0;
                                return `¥${val.toLocaleString(undefined, {maximumFractionDigits: 1})}`;
                              })()
                            ) : '*'}
                          </td>
                          {/* 金额核销率 */}
                          <td style={{ textAlign: 'center', color: storeData.hasVerifyFile ? '#86909c' : '#f53f3f', background: '#f5fafd' }}>
                            {storeData.hasVerifyFile ? `${storeData.amountVerifyRate}%` : '*'}
                          </td>
                          {/* 有效金额率 */}
                          <td style={{ textAlign: 'center', color: storeData.hasVerifyFile ? '#86909c' : '#f53f3f', background: '#f5fafd' }}>
                            {storeData.hasVerifyFile ? `${storeData.validAmountRate}%` : '*'}
                          </td>
                        </>
                      )}
                      {isDataMode && dataTab === 'order' && !storeData && (
                        <>
                          {/* 数量类字段 - 订单模式 */}
                          <td style={{ textAlign: 'center', color: '#f53f3f', background: '#f7fbf7' }}>*</td>
                          <td style={{ textAlign: 'center', color: '#f53f3f', background: '#f7fbf7' }}>*</td>
                          <td style={{ textAlign: 'center', color: '#f53f3f', background: '#f7fbf7' }}>*</td>
                          <td style={{ textAlign: 'center', color: '#f53f3f', background: '#f7fbf7' }}>*</td>
                          <td style={{ textAlign: 'center', color: '#f53f3f', background: '#f7fbf7' }}>*</td>
                          <td style={{ textAlign: 'center', color: '#f53f3f', background: '#f7fbf7' }}>*</td>
                          <td style={{ textAlign: 'center', color: '#f53f3f', background: '#f7fbf7' }}>*</td>
                          <td style={{ textAlign: 'center', color: '#f53f3f', background: '#f7fbf7' }}>*</td>
                          <td style={{ textAlign: 'center', color: '#f53f3f', background: '#f7fbf7' }}>*</td>
                          <td style={{ textAlign: 'center', color: '#f53f3f', background: '#f7fbf7' }}>*</td>
                          <td style={{ textAlign: 'center', color: '#f53f3f', background: '#f7fbf7' }}>*</td>
                          <td style={{ textAlign: 'center', color: '#f53f3f', background: '#f7fbf7' }}>*</td>
                          <td style={{ textAlign: 'center', color: '#f53f3f', background: '#f7fbf7' }}>*</td>
                          <td style={{ textAlign: 'center', color: '#f53f3f', background: '#f7fbf7' }}>*</td>
                        </>
                      )}
                      {isDataMode && dataTab === 'performance' && !storeData && (
                        <>
                          {/* 金额类字段 - 业绩模式 */}
                          <td style={{ textAlign: 'center', color: '#f53f3f', background: '#f5fafd' }}>*</td>
                          <td style={{ textAlign: 'center', color: '#f53f3f', background: '#f5fafd' }}>*</td>
                          <td style={{ textAlign: 'center', color: '#f53f3f', background: '#f5fafd' }}>*</td>
                          <td style={{ textAlign: 'center', color: '#f53f3f', background: '#f5fafd' }}>*</td>
                          <td style={{ textAlign: 'center', color: '#f53f3f', background: '#f5fafd' }}>*</td>
                          <td style={{ textAlign: 'center', color: '#f53f3f', background: '#f5fafd' }}>*</td>
                          <td style={{ textAlign: 'center', color: '#f53f3f', background: '#f5fafd' }}>*</td>
                          <td style={{ textAlign: 'center', color: '#f53f3f', background: '#f5fafd' }}>*</td>
                          <td style={{ textAlign: 'center', color: '#f53f3f', background: '#f5fafd' }}>*</td>
                          <td style={{ textAlign: 'center', color: '#f53f3f', background: '#f5fafd' }}>*</td>
                          <td style={{ textAlign: 'center', color: '#f53f3f', background: '#f5fafd' }}>*</td>
                        </>
                      )}
                      </tr>
                    </Fragment>
                    );
                  })}
                  </tbody>
              </table>
            </div>
            
            {/* 移动端卡片列表 */}
            <div className="mobile-card-list hide-desktop">
              {displayStores.map((store) => (
                <div key={store.id} className="mobile-card">
                  <div className="mobile-card-header">
                    <div className="mobile-card-title">{store.store_name}</div>
                    <BusinessStatusCell store={store} updateStore={updateStore} />
                  </div>
                  <div className="mobile-card-body">
                    <div className="mobile-card-item">
                      <span className="mobile-card-label">门店ID</span>
                      <span className="mobile-card-value font-mono text-xs">{store.store_id || '-'}</span>
                    </div>
                    <div className="mobile-card-item">
                      <span className="mobile-card-label">服务状态</span>
                      <span className="mobile-card-value"><BusinessStatusCell store={store} updateStore={updateStore} /></span>
                    </div>
                    <div className="mobile-card-item">
                      <span className="mobile-card-label">面积</span>
                      <span className="mobile-card-value">{store.store_area ? `${store.store_area}㎡` : '-'}</span>
                    </div>
                    <div className="mobile-card-item">
                      <span className="mobile-card-label">人数</span>
                      <span className="mobile-card-value">{store.staff_count || '-'}</span>
                    </div>
                    <div className="mobile-card-item">
                      <span className="mobile-card-label">获客渠道</span>
                      <span className="mobile-card-value">{store.customer_channel || '-'}</span>
                    </div>
                    <div className="mobile-card-item">
                      <span className="mobile-card-label">联系人</span>
                      <span className="mobile-card-value"><ContactsCell store={store} onUpdate={fetchStores} /></span>
                    </div>
                    <div className="mobile-card-item">
                      <span className="mobile-card-label">下次跟进</span>
                      <span className="mobile-card-value"><NextFollowTimeCell store={store} /></span>
                    </div>
                  </div>
                    <div className="mobile-card-actions">
                      <button
                        onClick={() => openFollowModal(store.id)}
                        className="btn btn-primary"
                        style={{ flex: 1 }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                        跟进
                      </button>
                      <button
                        onClick={() => openFollowViewModal(store.id)}
                        className="btn btn-secondary"
                        style={{ flex: 1 }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                          <circle cx="12" cy="12" r="3"></circle>
                        </svg>
                        记录
                      </button>
                      <button
                        onClick={() => openRobotModal(store.id)}
                        className="btn btn-secondary"
                        style={{ flex: 1 }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="11" width="18" height="10" rx="2"></rect>
                          <circle cx="12" cy="5" r="2"></circle>
                          <path d="M12 7v4"></path>
                          <line x1="8" y1="16" x2="8" y2="16"></line>
                          <line x1="16" y1="16" x2="16" y2="16"></line>
                        </svg>
                        机器人
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </>
        )}
      </div>

      {/* 批量上传弹窗 */}
      {showBatchModalState && (
        <BatchUploadModal
          onClose={() => {
            closeBatchModal();
            onCloseBatchModal?.();
          }}
          onFullImport={handleFullImport}
          fullImportFileInputRef={fullImportFileInputRef}
        />
      )}

      {/* 批量导入联系人弹窗 */}
      {showBatchContactModalState && (
        <BatchImportContactModal
          onClose={() => {
            setInternalShowBatchContactModal(false);
            onCloseBatchContactModal?.();
          }}
          onSuccess={() => {
            setInternalShowBatchContactModal(false);
            onCloseBatchContactModal?.();
            setMessage({ type: 'success', text: '联系人导入成功' });
            setTimeout(() => setMessage(null), 5000);
          }}
        />
      )}

      {/* 添加门店弹窗 */}
      {showAddModalState && (
        <AddStoreModal
          onClose={() => {
            closeAddModal();
            onCloseAddModal?.();
          }}
          onSuccess={() => {
            closeAddModal();
            onCloseAddModal?.();
            fetchStores();
          }}
          currentSystem={currentSystem}
        />
      )}

      {/* 分组管理弹窗 */}
      {showGroupManageModal && (
        <GroupManageModal
          onClose={() => closeGroupManageModal()}
          onSuccess={() => fetchStoreGroups()}
          currentSystem={currentSystem}
          stores={stores}
        />
      )}

      {/* 删除门店弹窗 */}
      {showDeleteStoreModalState && (
        <DeleteStoreModal
          onClose={() => {
            closeDeleteStoreModal();
            onCloseDeleteModal?.();
          }}
          onSuccess={() => {
            closeDeleteStoreModal();
            onCloseDeleteModal?.();
            fetchStores();
            setMessage({ type: 'success', text: '门店删除成功' });
            setTimeout(() => setMessage(null), 5000);
          }}
        />
      )}

      {/* 机器人配置弹窗 */}
      {showRobotModal && (
        <RobotConfigListModal
          storeId={showRobotModal.storeId}
          onClose={() => closeRobotModal()}
          setMessage={setMessage}
        />
      )}

      {/* 添加跟进弹窗 */}
      {showFollowModal && (
        <FollowRecordModal
          storeId={showFollowModal}
          onClose={() => closeFollowModal()}
          onSuccess={() => {
            closeFollowModal();
            setMessage({ type: 'success', text: '添加成功' });
            fetchStores(true);
            setTimeout(() => setMessage(null), 3000);
          }}
        />
      )}

      {/* 查看跟进记录弹窗 */}
      {showFollowViewModal && (
        <FollowRecordViewModal
          storeId={showFollowViewModal}
          onClose={() => closeFollowViewModal()}
          aiPromptTemplate={aiPromptTemplate}
        />
      )}

      {/* AI配置弹窗 */}
      {(externalShowAiConfigModal ?? showAiConfigModal) && (
        <AiConfigModal
          template={aiPromptTemplate}
          defaultTemplate={defaultAiPrompt}
          onSave={(template) => {
            setAiPromptTemplate(template);
            if (!safeSetItem('aiPromptTemplate', template)) {
              console.warn('AI模板存储失败');
            }
            setShowAiConfigModal(false);
            onCloseAiConfigModal?.();
            setMessage({ type: 'success', text: 'AI配置已保存' });
            setTimeout(() => setMessage(null), 3000);
          }}
          onClose={() => {
            startTransition(() => setShowAiConfigModal(false));
            onCloseAiConfigModal?.();
          }}
        />
      )}

      {/* 高级筛选器弹窗 */}
      {(showAdvancedFilter ?? internalShowAdvancedFilter) && (
        <AdvancedFilterModal
          onClose={() => {
            setInternalShowAdvancedFilter(false);
            onCloseAdvancedFilter?.();
          }}
          onApply={onApplyAdvancedFilter || (() => {})}
          currentFilters={aiFilters}
        />
      )}

      {/* 操作日志弹窗 */}
      {externalShowOperationLogsModal && (
        <OperationLogsModal 
          onClose={() => onCloseOperationLogsModal?.()} 
          currentSystem={currentSystem}
        />
      )}

      {/* 删除文件确认弹窗 - 仅用于广告费文件 */}
      {showDeleteConfirm && showDeleteConfirm === 'ad' && (
        <div className="modal-overlay" onClick={() => setShowDeleteConfirm(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ width: '400px' }}>
            <div className="modal-header">
              <h3 className="modal-title">确认删除</h3>
              <button className="modal-close" onClick={() => setShowDeleteConfirm(null)}>×</button>
            </div>
            <div className="modal-body" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                <div style={{ 
                  width: '48px', 
                  height: '48px', 
                  borderRadius: '50%', 
                  background: '#ffece8', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center' 
                }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f53f3f" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                  </svg>
                </div>
                <div>
                  <div style={{ fontWeight: 500, marginBottom: '4px' }}>
                    删除全部广告费文件
                  </div>
                  <div style={{ fontSize: '13px', color: '#86909c' }}>
                    将删除所有广告费文件，删除后数据将无法恢复，确定要删除吗？
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button 
                className="btn btn-secondary" 
                onClick={() => setShowDeleteConfirm(null)}
              >
                取消
              </button>
              <button 
                className="btn" 
                style={{ background: '#f53f3f', color: '#fff' }}
                onClick={async () => {
                  // 调用数据库API删除所有账户数据
                  for (let i = 0; i < 4; i++) {
                    await fetch('/api/ad-expense', {
                      method: 'DELETE',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        store_system: currentSystem,
                        account_index: i,
                      })
                    });
                  }
                  
                  // 删除所有本地数据
                  for (let i = 0; i < 4; i++) {
                    deleteBigData(`adAccount_${i}`, currentSystem);
                  }
                  deleteBigData('adStats', currentSystem);
                  deleteBigData('adAccountInfos', currentSystem);
                  adDataRef.current = null;
                  storeDataCacheRef.current.clear();
                  setAdAccountInfos([null, null, null, null, null, null, null, null]);
                  setDataVersion(prev => prev + 1);
                  setDataRefreshKey(prev => prev + 1);
                  setShowDeleteConfirm(null);
                  setMessage({ type: 'success', text: '广告费文件已删除' });
                  setTimeout(() => setMessage(null), 5000);
                }}
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* 广告多文件上传弹窗 */}
      {showAdUploadModal && (
        <AdUploadModal
          onClose={() => setShowAdUploadModal(false)}
          onUpload={handleAdUpload}
          onRemoveFile={removeAdFile}
          onClearAllFiles={clearAllAdFiles}
          adAccountInfos={adAccountInfos}
          adAccountNames={adAccountNames}
          setAdAccountNames={setAdAccountNames}
          currentSystem={currentSystem}
        />
      )}
      
      {/* 数据文件上传弹窗 */}
      {showDataUploadModal && (
        <DataUploadModal
          visible={showDataUploadModal}
          onClose={() => setShowDataUploadModal(false)}
          stores={stores.filter(s => s.store_id !== null).map(s => ({ store_id: s.store_id as string, store_name: s.store_name || '' }))}
          currentSystem={currentSystem}
          orderFileInfo={orderFileInfo}
          verifyFileInfo={verifyFileInfo}
          refundFileInfo={refundFileInfo}
          onOrderUploadSuccess={handleOrderUploadSuccess}
          onVerifyUploadSuccess={handleVerifyUploadSuccess}
          onRefundUploadSuccess={handleRefundUploadSuccess}
          orderDataRef={orderDataRef}
          onRemoveAllFiles={removeAllFiles}
          onRemoveOrderFile={removeOrderFile}
          onRemoveVerifyFile={removeVerifyFile}
          onRemoveRefundFile={removeRefundFile}
          onRefreshFromDatabase={handleRefreshFromDatabase}
        />
      )}
      
      {/* 基础信息上传弹窗 */}
      {showBasicInfoUploadModal && (
        <BasicInfoUploadModal
          visible={showBasicInfoUploadModal}
          onClose={() => setShowBasicInfoUploadModal(false)}
          storeSystem={currentSystem}
          onSuccess={fetchStores}
          basicInfoFileInfo={basicInfoFileInfo}
          onBasicInfoUploadSuccess={handleBasicInfoUploadSuccess}
          onRemoveBasicInfoFile={removeBasicInfoFile}
          douyinFileInfo={douyinFileInfo}
          onDouyinUploadSuccess={handleDouyinUploadSuccess}
          onRemoveDouyinFile={removeDouyinFile}
          staffFileInfo={staffFileInfo}
          staffFileInfo2={staffFileInfo2}
          onStaffUploadSuccess={handleStaffUploadSuccess}
          onRemoveStaffFile={removeStaffFile}
          onRemoveStaffFile2={removeStaffFile2}
        />
      )}
      
      {/* 未匹配详情弹窗 */}
      {showUnmatchedDetailsModal && (
        <UnmatchedDetailsModal
          type={showUnmatchedDetailsModal}
          orderDetails={orderDataRef.current?.unmatchedOrderDetails}
          orderStoreIdStats={orderDataRef.current?.unmatchedStoreIdStats}
          verifyDetails={verifyDataRef.current?.unmatchedVerifyDetails}
          dataTimeStart={dataTimeStart}
          dataTimeEnd={dataTimeEnd}
          onClose={() => setShowUnmatchedDetailsModal(null)}
        />
      )}

      {/* 合计详情弹窗 */}
      {showTotalDetailsModal && (
        <TotalDetailsModal
          quarterlyData={totalQuarterlyData}
          monthlyData={totalMonthlyData}
          dailyData={totalDailyData}
          dataTimeStart={dataTimeStart}
          dataTimeEnd={dataTimeEnd}
          onClose={() => closeTotalDetailsModal()}
          onTimeChange={(start, end, quick) => {
            setDataTimeStart(start);
            setDataTimeEnd(end);
            setDataTimeQuick(quick as typeof dataTimeQuick);
          }}
          selectedTagLevel={selectedTagLevel}
          onTagLevelChange={setSelectedTagLevel}
          tagLevelCounts={tagLevelCounts}
        />
      )}

      {/* 门店详情弹窗 */}
      {storeDetailModal.isOpen && (
        <StoreDetailModal
          isOpen={storeDetailModal.isOpen}
          onClose={() => closeDetailModal()}
          storeId={storeDetailModal.storeId}
          storeName={storeDetailModal.storeName}
          storeData={storeDetailModal.storeData}
          hideTags={hideTags}
          onHideTagsChange={(value) => {
            setHideTags(value);
          }}
          onFollow={(storeId) => openFollowModal(storeId)}
          onViewFollow={(storeId) => openFollowViewModal(storeId)}
          onUpdate={() => {
            // 刷新门店数据以更新标签
            fetchStores(true);
          }}
          preloadedOrderStats={orderDataRef.current}
          preloadedVerifyStats={verifyDataRef.current}
          preloadedRefundStats={refundDataRef.current}
          preloadedAdStats={adDataRef.current}
        />
      )}

      {/* 渠道占比弹框 */}
      {showChannelModal && (
        <div className="modal-overlay" onClick={() => setShowChannelModal(false)}>
          <div className="modal-content" style={{ width: '560px', maxWidth: '90vw' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">
                {channelModalType === 'order' ? '订单渠道占比' : 
                 channelModalType === 'validOrder' ? '有效订单渠道占比' :
                 channelModalType === 'verify' ? '核销渠道占比' : '有效核销渠道占比'}
              </h3>
              <button onClick={() => setShowChannelModal(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', color: '#86909c' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
              {(() => {
                // 根据类型获取对应的渠道数据
                let dailyChannelStats: Record<string, Record<string, number>> | undefined;
                let totalChannelStats: Record<string, number> | undefined;
                
                if (channelModalType === 'order') {
                  dailyChannelStats = orderDataRef.current?.dailyChannelStats;
                  totalChannelStats = orderDataRef.current?.channelStats;
                } else if (channelModalType === 'validOrder') {
                  dailyChannelStats = orderDataRef.current?.dailyValidChannelStats;
                  totalChannelStats = orderDataRef.current?.validChannelStats;
                } else if (channelModalType === 'verify') {
                  dailyChannelStats = verifyDataRef.current?.dailyChannelStats;
                  totalChannelStats = verifyDataRef.current?.channelStats;
                } else if (channelModalType === 'validVerify') {
                  dailyChannelStats = verifyDataRef.current?.dailyValidChannelStats;
                  totalChannelStats = verifyDataRef.current?.validChannelStats;
                }
                
                // 获取外部时间筛选
                const startDate = dataTimeStart || '';
                const endDate = dataTimeEnd || '';
                
                // 根据时间筛选计算渠道数据
                let filteredChannelStats: Record<string, number> = {};
                
                if (dailyChannelStats && Object.keys(dailyChannelStats).length > 0) {
                  // 筛选日期范围内的渠道数据
                  for (const [date, channels] of Object.entries(dailyChannelStats)) {
                    // 判断日期是否在筛选范围内
                    let isInRange = true;
                    if (startDate && date < startDate) isInRange = false;
                    if (endDate && date > endDate) isInRange = false;
                    
                    if (isInRange) {
                      for (const [channel, count] of Object.entries(channels)) {
                        filteredChannelStats[channel] = (filteredChannelStats[channel] || 0) + count;
                      }
                    }
                  }
                  // 如果有筛选条件但结果为空，说明没有匹配数据
                  if ((startDate || endDate) && Object.keys(filteredChannelStats).length === 0) {
                    return <p style={{ color: '#86909c', textAlign: 'center' }}>筛选范围内暂无渠道数据</p>;
                  }
                } else {
                  // 降级：使用总渠道统计（全部数据），提示用户重新上传文件
                  filteredChannelStats = totalChannelStats || {};
                  if (startDate || endDate) {
                    // 有筛选条件但无法筛选，显示提示
                    const typeName = channelModalType === 'order' ? '订单' : 
                                     channelModalType === 'validOrder' ? '有效订单' :
                                     channelModalType === 'verify' ? '核销' : '有效核销';
                    return (
                      <div style={{ textAlign: 'center', padding: '20px' }}>
                        <p style={{ color: '#ff7d00', marginBottom: '8px' }}>当前数据不支持时间筛选</p>
                        <p style={{ color: '#86909c', fontSize: '12px' }}>请重新上传{typeName}文件</p>
                      </div>
                    );
                  }
                }
                
                if (!filteredChannelStats || Object.keys(filteredChannelStats).length === 0) {
                  return <p style={{ color: '#86909c', textAlign: 'center' }}>暂无渠道数据</p>;
                }
                const total = Object.values(filteredChannelStats).reduce((sum, count) => sum + count, 0);
                const sortedChannels = Object.entries(filteredChannelStats)
                  .sort((a, b) => b[1] - a[1]);
                
                // 字节风格配色
                const colors = ['#165dff', '#00b42a', '#ff7d00', '#f53f3f', '#722ed1', '#eb2f96', '#13c2c2', '#faad14'];
                
                return (
                  <div>
                    {/* 表头 */}
                    <div style={{ display: 'flex', padding: '8px 12px', background: '#f7f8fa', borderRadius: '6px', marginBottom: '8px', fontSize: '12px', color: '#4e5969', fontWeight: 500 }}>
                      <div style={{ width: '100px' }}>渠道</div>
                      <div style={{ flex: 1, textAlign: 'center' }}>占比</div>
                      <div style={{ width: '100px', textAlign: 'right' }}>数量</div>
                      <div style={{ width: '80px', textAlign: 'right' }}>百分比</div>
                    </div>
                    {/* 数据行 */}
                    {sortedChannels.map(([channel, count], index) => {
                      const percentage = total > 0 ? (count / total * 100).toFixed(2) : '0.0';
                      const color = colors[index % colors.length];
                      return (
                        <div 
                          key={channel} 
                          style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            padding: '10px 12px',
                            borderRadius: '6px',
                            marginBottom: '4px',
                            background: index % 2 === 0 ? '#fff' : '#fafbfc',
                            transition: 'background 0.2s'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = '#f0f5ff'}
                          onMouseLeave={(e) => e.currentTarget.style.background = index % 2 === 0 ? '#fff' : '#fafbfc'}
                        >
                          <div style={{ width: '100px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: color }} />
                            <span style={{ fontSize: '13px', color: '#1d2129' }}>{channel}</span>
                          </div>
                          <div style={{ flex: 1, margin: '0 12px' }}>
                            <div style={{ height: '8px', background: '#f2f3f5', borderRadius: '4px', overflow: 'hidden' }}>
                              <div
                                style={{
                                  width: `${percentage}%`,
                                  height: '100%',
                                  background: color,
                                  borderRadius: '4px',
                                  transition: 'width 0.3s ease'
                                }}
                              />
                            </div>
                          </div>
                          <div style={{ width: '100px', textAlign: 'right', fontSize: '13px', color: '#1d2129', fontWeight: 500 }}>
                            {count.toLocaleString()}
                          </div>
                          <div style={{ width: '80px', textAlign: 'right', fontSize: '13px', color: color, fontWeight: 500 }}>
                            {percentage}%
                          </div>
                        </div>
                      );
                    })}
                    {/* 合计行 */}
                    <div style={{ display: 'flex', padding: '12px', background: '#165dff', borderRadius: '6px', marginTop: '8px', color: '#fff' }}>
                      <div style={{ width: '100px', fontWeight: 500 }}>合计</div>
                      <div style={{ flex: 1 }}></div>
                      <div style={{ width: '100px', textAlign: 'right', fontWeight: 600 }}>
                        {total.toLocaleString()}
                      </div>
                      <div style={{ width: '80px', textAlign: 'right', fontWeight: 600 }}>
                        100%
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* 全渠道弹窗 - 同时显示4个渠道数据 */}
      {showAllChannelModal && (
        <div className="modal-overlay" onClick={() => setShowAllChannelModal(false)}>
          <div className="modal-content" style={{ width: '1280px', maxWidth: '95vw', maxHeight: '90vh', background: 'linear-gradient(145deg, #f8fafc 0%, #ffffff 100%)' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ 
              background: 'linear-gradient(135deg, #165dff 0%, #4080ff 100%)',
              padding: '20px 24px',
              borderBottom: 'none'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ 
                  width: '36px', 
                  height: '36px', 
                  background: 'rgba(255,255,255,0.2)', 
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                    <circle cx="11" cy="11" r="3"></circle>
                  </svg>
                </div>
                <h3 className="modal-title" style={{ color: 'white', fontSize: '18px', fontWeight: 700 }}>渠道分析</h3>
              </div>
              <button 
                onClick={() => setShowAllChannelModal(false)} 
                style={{ 
                  background: 'rgba(255,255,255,0.2)', 
                  border: 'none', 
                  cursor: 'pointer', 
                  padding: '8px', 
                  color: 'white',
                  borderRadius: '8px',
                  transition: 'all 0.2s ease'
                }}
                onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.3)'}
                onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            <div className="modal-body" style={{ height: 'calc(90vh - 100px)', overflow: 'hidden', padding: '20px', background: 'linear-gradient(145deg, #f8fafc 0%, #f1f5f9 100%)' }}>
              {/* 4个渠道数据并排显示 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', height: '100%' }}>
                {/* 订单渠道 */}
                {renderChannelCard('订单渠道', orderDataRef.current?.dailyChannelStats, orderDataRef.current?.channelStats, dataTimeStart, dataTimeEnd)}
                {/* 有效订单渠道 */}
                {renderChannelCard('有效订单渠道', orderDataRef.current?.dailyValidChannelStats, orderDataRef.current?.validChannelStats, dataTimeStart, dataTimeEnd)}
                {/* 核销渠道 */}
                {renderChannelCard('核销渠道', verifyDataRef.current?.dailyChannelStats, verifyDataRef.current?.channelStats, dataTimeStart, dataTimeEnd)}
                {/* 有效核销渠道 */}
                {renderChannelCard('有效核销渠道', verifyDataRef.current?.dailyValidChannelStats, verifyDataRef.current?.validChannelStats, dataTimeStart, dataTimeEnd)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 全套餐弹窗 - 同时显示4个套餐数据 */}
      {showPackageModal && (
        <div className="modal-overlay" onClick={() => setShowPackageModal(false)}>
          <div className="modal-content" style={{ width: '1280px', maxWidth: '95vw', maxHeight: '90vh', background: 'linear-gradient(145deg, #f8fafc 0%, #ffffff 100%)' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ 
              background: 'linear-gradient(135deg, #165dff 0%, #4080ff 100%)',
              padding: '20px 24px',
              borderBottom: 'none'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ 
                  width: '36px', 
                  height: '36px', 
                  background: 'rgba(255,255,255,0.2)', 
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="3" y1="9" x2="21" y2="9"></line>
                    <line x1="9" y1="21" x2="9" y2="9"></line>
                  </svg>
                </div>
                <h3 className="modal-title" style={{ color: 'white', fontSize: '18px', fontWeight: 700 }}>套餐分析</h3>
              </div>
              <button 
                onClick={() => setShowPackageModal(false)} 
                style={{ 
                  background: 'rgba(255,255,255,0.2)', 
                  border: 'none', 
                  cursor: 'pointer', 
                  padding: '8px', 
                  color: 'white',
                  borderRadius: '8px',
                  transition: 'all 0.2s ease'
                }}
                onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.3)'}
                onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            <div className="modal-body" style={{ height: 'calc(90vh - 100px)', overflow: 'hidden', padding: '20px', background: 'linear-gradient(145deg, #f8fafc 0%, #f1f5f9 100%)' }}>
              {/* 4个套餐数据并排显示 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', height: '100%' }}>
                {/* 订单套餐 */}
                {renderPackageCard('订单套餐分析', orderDataRef.current?.dailyPackageStats, orderDataRef.current?.dailyPackageAmountStats, orderDataRef.current?.packageStats, orderDataRef.current?.packageAmountStats, dataTimeStart, dataTimeEnd, 'order')}
                {/* 有效订单套餐 */}
                {renderPackageCard('有效订单套餐分析', orderDataRef.current?.dailyValidPackageStats, orderDataRef.current?.dailyValidPackageAmountStats, orderDataRef.current?.validPackageStats, orderDataRef.current?.validPackageAmountStats, dataTimeStart, dataTimeEnd, 'order')}
                {/* 核销套餐 */}
                {renderPackageCard('核销套餐分析', verifyDataRef.current?.dailyPackageStats, verifyDataRef.current?.dailyPackageAmountStats, verifyDataRef.current?.packageStats, verifyDataRef.current?.packageAmountStats, dataTimeStart, dataTimeEnd, 'verify')}
                {/* 有效核销套餐 */}
                {renderPackageCard('有效核销套餐分析', verifyDataRef.current?.dailyValidPackageStats, verifyDataRef.current?.dailyValidPackageAmountStats, verifyDataRef.current?.validPackageStats, verifyDataRef.current?.validPackageAmountStats, dataTimeStart, dataTimeEnd, 'verify')}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// 渠道卡片组件
function renderChannelCard(
  title: string,
  dailyStats: Record<string, Record<string, number>> | undefined,
  totalStats: Record<string, number> | undefined,
  startDate: string,
  endDate: string
) {
  // 根据时间筛选计算渠道数据
  let filteredChannelStats: Record<string, number> = {};
  
  if (dailyStats && Object.keys(dailyStats).length > 0) {
    for (const [date, channels] of Object.entries(dailyStats)) {
      let isInRange = true;
      if (startDate && date < startDate) isInRange = false;
      if (endDate && date > endDate) isInRange = false;
      
      if (isInRange) {
        for (const [channel, count] of Object.entries(channels)) {
          filteredChannelStats[channel] = (filteredChannelStats[channel] || 0) + count;
        }
      }
    }
  } else {
    filteredChannelStats = totalStats || {};
  }
  
  if (!filteredChannelStats || Object.keys(filteredChannelStats).length === 0) {
    return (
      <div style={{
        background: 'linear-gradient(145deg, #ffffff 0%, #f8fafc 100%)',
        borderRadius: '16px',
        padding: '20px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)',
        border: '1px solid #f1f5f9'
      }}>
        <div className="analytics-card-title" style={{ marginBottom: '12px' }}>{title}</div>
        <div style={{
          textAlign: 'center',
          padding: '32px 16px',
          color: '#94a3b8',
          fontSize: '13px',
          background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
          borderRadius: '12px'
        }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginBottom: '8px', opacity: 0.5 }}>
            <path d="M9 19v-6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2zm0 0V9a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v10m-6 0a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2m0 0V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2z"></path>
          </svg>
          <p>暂无数据</p>
        </div>
      </div>
    );
  }

  const total = Object.values(filteredChannelStats).reduce((sum, count) => sum + count, 0);
  const sortedChannels = Object.entries(filteredChannelStats).sort((a, b) => b[1] - a[1]);
  const colors = ['#165dff', '#00b42a', '#ff7d00', '#f53f3f', '#722ed1', '#eb0aa4'];

  return (
    <div style={{
      background: 'linear-gradient(145deg, #ffffff 0%, #f8fafc 100%)',
      borderRadius: '16px',
      padding: '20px',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      boxShadow: '0 4px 20px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)',
      border: '1px solid #f1f5f9'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexShrink: 0 }}>
        <div className="analytics-card-title">{title}</div>
        <div className="analytics-total-badge">
          合计: {total.toLocaleString()}
        </div>
      </div>
      {/* 表头 */}
      <div className="analytics-header">
        <div style={{ width: '90px' }} className="analytics-header-cell">渠道</div>
        <div style={{ flex: 1 }}></div>
        <div style={{ width: '65px', textAlign: 'right' }} className="analytics-header-cell">数量</div>
        <div style={{ width: '55px', textAlign: 'right' }} className="analytics-header-cell">占比</div>
      </div>
      {/* 可滚动的列表区域 */}
      <div style={{
        height: '280px',
        overflowY: 'auto',
        minHeight: 0,
        position: 'relative',
        paddingRight: '6px'
      }}
      className="custom-scrollbar scroll-optimized"
      >
        {sortedChannels.map(([channel, count], index) => {
          const percentage = total > 0 ? (count / total * 100).toFixed(2) : '0.0';
          const percentageNum = parseFloat(percentage);
          const color = colors[index % colors.length];
          return (
            <div key={channel} className="stats-row list-item">
              <div style={{ width: '90px' }} className="stats-name">
                <div className="stats-dot" style={{ 
                  background: `linear-gradient(135deg, ${color} 0%, ${color}dd 100%)`,
                  boxShadow: `0 2px 8px ${color}33`
                }} />
                <span style={{ fontWeight: 500 }}>{channel}</span>
              </div>
              <div className="stats-bar-container">
                <div
                  className="stats-bar"
                  style={{
                    width: `${Math.min(percentageNum, 100)}%`,
                    background: `linear-gradient(90deg, ${color}22 0%, ${color}55 100%)`,
                    borderRadius: '3px'
                  }}
                />
              </div>
              <div style={{ width: '65px', textAlign: 'right', fontSize: '12px', fontWeight: 600, color: '#1d2129' }}>
                {count.toLocaleString()}
              </div>
              <div style={{ width: '55px', textAlign: 'right', fontSize: '12px', fontWeight: 600, color: color }}>
                {percentage}%
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// 套餐卡片组件
function renderPackageCard(
  title: string,
  dailyStats: Record<string, Record<string, number>> | undefined,
  dailyAmountStats: Record<string, Record<string, number>> | undefined,
  totalStats: Record<string, number> | undefined,
  totalAmountStats: Record<string, number> | undefined,
  startDate: string,
  endDate: string,
  type: 'order' | 'verify'
) {
  // 根据时间筛选计算套餐数据
  let filteredPackageStats: Record<string, number> = {};
  let filteredPackageAmountStats: Record<string, number> = {};

  if (dailyStats && Object.keys(dailyStats).length > 0) {
    for (const [date, packages] of Object.entries(dailyStats)) {
      let isInRange = true;
      if (startDate && date < startDate) isInRange = false;
      if (endDate && date > endDate) isInRange = false;

      if (isInRange) {
        for (const [packageName, count] of Object.entries(packages)) {
          filteredPackageStats[packageName] = (filteredPackageStats[packageName] || 0) + count;
        }
      }
    }
  } else {
    filteredPackageStats = totalStats || {};
  }

  // 计算金额统计
  if (dailyAmountStats && Object.keys(dailyAmountStats).length > 0) {
    for (const [date, packages] of Object.entries(dailyAmountStats)) {
      let isInRange = true;
      if (startDate && date < startDate) isInRange = false;
      if (endDate && date > endDate) isInRange = false;

      if (isInRange) {
        for (const [packageName, amount] of Object.entries(packages)) {
          filteredPackageAmountStats[packageName] = (filteredPackageAmountStats[packageName] || 0) + amount;
        }
      }
    }
  } else {
    filteredPackageAmountStats = totalAmountStats || {};
  }

  if (!filteredPackageStats || Object.keys(filteredPackageStats).length === 0) {
    return (
      <div style={{
        background: 'linear-gradient(145deg, #ffffff 0%, #f8fafc 100%)',
        borderRadius: '16px',
        padding: '20px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)',
        border: '1px solid #f1f5f9'
      }}>
        <div className="analytics-card-title" style={{ marginBottom: '12px' }}>{title}</div>
        <div style={{
          textAlign: 'center',
          padding: '32px 16px',
          color: '#94a3b8',
          fontSize: '13px',
          background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
          borderRadius: '12px'
        }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginBottom: '8px', opacity: 0.5 }}>
            <path d="M9 19v-6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2zm0 0V9a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v10m-6 0a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2m0 0V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2z"></path>
          </svg>
          <p>暂无数据</p>
        </div>
      </div>
    );
  }

  const total = Object.values(filteredPackageStats).reduce((sum, count) => sum + count, 0);
  const totalAmount = Object.values(filteredPackageAmountStats).reduce((sum, amount) => sum + amount, 0);
  const sortedPackages = Object.entries(filteredPackageStats).sort((a, b) => b[1] - a[1]);
  const colors = ['#165dff', '#00b42a', '#ff7d00', '#f53f3f', '#722ed1', '#eb0aa4'];

  // 计算均价
  const avgPrice: Record<string, number> = {};
  for (const [packageName, count] of Object.entries(filteredPackageStats)) {
    const amount = filteredPackageAmountStats[packageName] || 0;
    avgPrice[packageName] = count > 0 ? amount / count : 0;
  }

  return (
    <div style={{
      background: 'linear-gradient(145deg, #ffffff 0%, #f8fafc 100%)',
      borderRadius: '16px',
      padding: '20px',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      boxShadow: '0 4px 20px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)',
      border: '1px solid #f1f5f9'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexShrink: 0 }}>
        <div className="analytics-card-title">{title}</div>
        <div className="analytics-total-badge">
          合计: {total.toLocaleString()} | ¥{totalAmount.toLocaleString()}
        </div>
      </div>
      {/* 表头 */}
      <div className="analytics-header">
        <div style={{ width: '300px' }} className="analytics-header-cell">套餐</div>
        <div style={{ width: '55px', textAlign: 'right' }} className="analytics-header-cell">
          {type === 'order' ? '订单数' : '核销数'}
        </div>
        <div style={{ width: '75px', textAlign: 'right' }} className="analytics-header-cell">
          {type === 'order' ? '订单金额' : '核销金额'}
        </div>
        <div style={{ width: '65px', textAlign: 'right' }} className="analytics-header-cell">
          {type === 'order' ? '订单均价' : '核销均价'}
        </div>
        <div style={{ width: '55px', textAlign: 'right' }} className="analytics-header-cell">占比</div>
      </div>
      {/* 可滚动的列表区域 */}
      <div style={{
        height: '280px',
        overflowY: 'auto',
        minHeight: 0,
        position: 'relative',
        paddingRight: '6px'
      }}
      className="custom-scrollbar scroll-optimized"
      >
        {sortedPackages.map(([packageName, count], index) => {
          const amount = filteredPackageAmountStats[packageName] || 0;
          const avg = avgPrice[packageName] || 0;
          const percentage = total > 0 ? (count / total * 100).toFixed(2) : '0.0';
          const color = colors[index % colors.length];
          return (
            <div key={packageName} className="stats-row list-item">
              <div style={{ width: '300px' }} className="stats-name">
                <span style={{ fontWeight: 500 }}>{packageName}</span>
              </div>
              <div style={{ width: '55px', textAlign: 'right', fontSize: '12px', fontWeight: 600, color: '#1d2129' }}>
                {count.toLocaleString()}
              </div>
              <div style={{ width: '75px', textAlign: 'right', fontSize: '12px', fontWeight: 600, color: color }}>
                ¥{amount.toLocaleString()}
              </div>
              <div style={{ width: '65px', textAlign: 'right', fontSize: '12px', color: '#64748b' }}>
                ¥{avg.toFixed(2)}
              </div>
              <div style={{ width: '55px', textAlign: 'right', fontSize: '12px', fontWeight: 600, color: color }}>
                {percentage}%
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// 门店月度趋势组件（最近6个月）
function StoreMonthlyTrend({ storeId, currentSystem = 'mama', refreshKey }: {
  storeId: string | null;
  currentSystem?: StoreSystem;
  refreshKey?: number;
}) {
  // 格式化日期函数（定义在组件顶部，确保所有地方都能访问）
  const formatDateForTrend = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // 月度数据类型定义
  interface MonthlyMetrics {
    totalOrders: number;
    fakeOrders: number;
    validOrders: number;
    avgPrice: number;
    totalAmount: number;
    fakeAmount: number;
    refundCount: number;
    refundRate: string;
    refundAmount: number;
    sameDayRefundCount: number;
    sameDayRefundRate: string;
    unverifiedCount: number;
    unverifiedRate: string;
    unverifiedAmount: number;
    verifyCount: number;
    verifyRate: string;
    verifyAvgPrice: number;
    verifyAmount: number;
    amountVerifyRate: string;
    hasOrderFile: boolean;
    hasVerifyFile: boolean;
  }

  interface MonthlyData {
    year: number;
    month: number;
    startDate: string;
    endDate: string;
    metrics: MonthlyMetrics;
  }

  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>(() => {
    // 初始化时生成6个月的空数据，避免渲染时访问undefined
    const now = new Date();
    const emptyMonths: MonthlyData[] = [];

    for (let i = 5; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const firstDay = new Date(year, month - 1, 1);
      const lastDay = new Date(year, month, 0);

      // 内联日期格式化逻辑，避免调用未定义的函数
      const formatDateInline = (d: Date) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      };

      emptyMonths.push({
        year,
        month,
        startDate: formatDateInline(firstDay),
        endDate: formatDateInline(lastDay),
        metrics: {
          totalOrders: 0,
          fakeOrders: 0,
          validOrders: 0,
          avgPrice: 0,
          totalAmount: 0,
          fakeAmount: 0,
          refundCount: 0,
          refundRate: '0',
          refundAmount: 0,
          sameDayRefundCount: 0,
          sameDayRefundRate: '0',
          unverifiedCount: 0,
          unverifiedRate: '0',
          unverifiedAmount: 0,
          verifyCount: 0,
          verifyRate: '0',
          verifyAvgPrice: 0,
          verifyAmount: 0,
          amountVerifyRate: '0',
          hasOrderFile: false,
          hasVerifyFile: false,
        },
      });
    }
    return emptyMonths;
  });

  // 展开的月份列表
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());

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

  // 获取某月的每日明细数据
  const getDailyDetails = (year: number, month: number) => {
    let orderStats: OrderAggregatedData | null = null;
    let verifyStats: VerifyAggregatedData | null = null;

    const orderStatsStr = localStorage.getItem(getStorageKey('orderStats', currentSystem));
    const verifyStatsStr = localStorage.getItem(getStorageKey('verifyStats', currentSystem));

    if (orderStatsStr) {
      orderStats = JSON.parse(orderStatsStr);
    }
    if (verifyStatsStr) {
      verifyStats = JSON.parse(verifyStatsStr);
    }

    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const startDate = formatDateForTrend(firstDay);
    const endDate = formatDateForTrend(lastDay);

    const dailyDetails: Array<{
      date: string;
      totalOrders: number;
      totalAmount: number;
      fakeOrders: number;
      fakeAmount: number;
      refundCount: number;
      refundAmount: number;
      unverifiedCount: number;
      unverifiedAmount: number;
      verifyCount: number;
      verifyAmount: number;
    }> = [];

    const storeOrderStats = orderStats?.storeStats[storeId || ''];
    const storeVerifyStats = verifyStats?.storeStats[storeId || ''];

    // 获取该月的所有日期
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      
      let totalOrders = 0;
      let fakeOrders = 0;
      let fakeAmount = 0;
      let refundCount = 0;
      let unverifiedCount = 0;
      let unverifiedAmount = 0;

      if (storeOrderStats?.dailyStats[dateStr]) {
        const dailyStats = storeOrderStats.dailyStats[dateStr];
        totalOrders = dailyStats.orderCount;
        fakeOrders = dailyStats.fakeOrderCount;
        fakeAmount = dailyStats.fakeOrderAmount;
        refundCount = dailyStats.refundCount;
        unverifiedCount = dailyStats.unverifiedCount;
        unverifiedAmount = dailyStats.unverifiedAmount;
      }

      let verifyCount = 0;
      let verifyAmount = 0;

      if (storeVerifyStats?.dailyStats[dateStr]) {
        const dailyStats = storeVerifyStats.dailyStats[dateStr];
        verifyCount = dailyStats.verifyCount;
        verifyAmount = dailyStats.verifyAmount;
      }

      // 退款金额估算
      const avgPrice = totalOrders > 0 ? 
        (storeOrderStats?.dailyStats[dateStr]?.orderAmount || 0) / totalOrders : 0;
      const refundAmount = refundCount * avgPrice;
      const totalAmount = storeOrderStats?.dailyStats[dateStr]?.orderAmount || 0;

      dailyDetails.push({
        date: dateStr,
        totalOrders,
        totalAmount,
        fakeOrders,
        fakeAmount,
        refundCount,
        refundAmount,
        unverifiedCount,
        unverifiedAmount,
        verifyCount,
        verifyAmount,
      });
    }

    return dailyDetails;
  };

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!storeId) return;

    const fetchMonthlyData = () => {
      setLoading(true);
      try {
        // 从localStorage读取聚合数据
        let orderStats: OrderAggregatedData | null = null;
        let verifyStats: VerifyAggregatedData | null = null;

        const orderStatsStr = localStorage.getItem(getStorageKey('orderStats', currentSystem));
        const verifyStatsStr = localStorage.getItem(getStorageKey('verifyStats', currentSystem));

        if (orderStatsStr) {
          orderStats = JSON.parse(orderStatsStr);
        }
        if (verifyStatsStr) {
          verifyStats = JSON.parse(verifyStatsStr);
        }

        const hasOrderFile = !!orderStats;
        const hasVerifyFile = !!verifyStats;

        // 计算最近6个月的自然月（包含当月）
        const now = new Date();
        const months: Array<{ year: number; month: number; startDate: string; endDate: string }> = [];

        for (let i = 5; i >= 0; i--) {
          const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const year = date.getFullYear();
          const month = date.getMonth() + 1;

          // 计算该月的第一天和最后一天
          const firstDay = new Date(year, month - 1, 1);
          const lastDay = new Date(year, month, 0);

          months.push({
            year,
            month,
            startDate: formatDateForTrend(firstDay),
            endDate: formatDateForTrend(lastDay),
          });
        }

        // 获取该门店的统计数据
        const storeOrderStats = orderStats?.storeStats[String(storeId)];
        const storeVerifyStats = verifyStats?.storeStats[String(storeId)];

        // 计算每个月的数据
        const monthlyMetrics = months.map(({ year, month, startDate, endDate }) => {
          // 初始化该月的数据
          let totalOrders = 0;
          let fakeOrders = 0;
          let totalAmount = 0;
          let fakeAmount = 0;
          let refundCount = 0;
          let sameDayRefundCount = 0;
          let unverifiedCount = 0;
          let unverifiedAmount = 0;

          // 从聚合数据中汇总该月的订单数据
          if (storeOrderStats?.dailyStats) {
            for (const [dateStr, dailyStats] of Object.entries(storeOrderStats.dailyStats)) {
              if (dateStr >= startDate && dateStr <= endDate) {
                totalOrders += dailyStats.orderCount;
                fakeOrders += dailyStats.fakeOrderCount;
                totalAmount += dailyStats.orderAmount;
                fakeAmount += dailyStats.fakeOrderAmount;
                refundCount += dailyStats.refundCount;
                sameDayRefundCount += dailyStats.sameDayRefundCount;
                unverifiedCount += dailyStats.unverifiedCount;
                unverifiedAmount += dailyStats.unverifiedAmount;
              }
            }
          }

          const refundRate = totalOrders > 0 ? (refundCount / totalOrders * 100).toFixed(2) : '0';
          const sameDayRefundRate = refundCount > 0 ? (sameDayRefundCount / refundCount * 100).toFixed(2) : '0';
          const validOrders = Math.max(0, totalOrders - refundCount - fakeOrders);
          const avgPrice = totalOrders > 0 ? totalAmount / totalOrders : 0;
          const unverifiedRate = totalOrders > 0 ? (unverifiedCount / totalOrders * 100).toFixed(2) : '0';
          
          // 退款金额：假设退款订单的平均价格与总订单均价相同，简单估算
          const refundAmount = refundCount * avgPrice;

          // 核销数据
          let verifyCount = 0;
          let verifyAmount = 0;

          if (storeVerifyStats?.dailyStats) {
            for (const [dateStr, dailyStats] of Object.entries(storeVerifyStats.dailyStats)) {
              if (dateStr >= startDate && dateStr <= endDate) {
                verifyCount += dailyStats.verifyCount; // 核销数
                verifyAmount += dailyStats.verifyAmount; // 核销金额
              }
            }
          }

          const verifyRate = totalOrders > 0 ? (verifyCount / totalOrders * 100).toFixed(2) : '0';
          const verifyAvgPrice = verifyCount > 0 ? verifyAmount / verifyCount : 0;
          const amountVerifyRate = totalAmount > 0 ? (verifyAmount / totalAmount * 100).toFixed(2) : '0';

          return {
            year,
            month,
            startDate,
            endDate,
            metrics: {
              totalOrders,
              fakeOrders,
              validOrders,
              avgPrice,
              totalAmount,
              fakeAmount,
              refundCount,
              refundRate,
              refundAmount,
              sameDayRefundCount,
              sameDayRefundRate,
              unverifiedCount,
              unverifiedRate,
              unverifiedAmount,
              verifyCount,
              verifyRate,
              verifyAvgPrice,
              verifyAmount,
              amountVerifyRate,
              hasOrderFile,
              hasVerifyFile,
            },
          };
        });

        setMonthlyData(monthlyMetrics);
      } catch (error) {
        console.error('获取月度数据失败:', error);
        // 即使出错也生成6个月的空数据结构
        const now = new Date();
        const emptyMonths: Array<{
          year: number;
          month: number;
          startDate: string;
          endDate: string;
          metrics: {
            totalOrders: number;
            fakeOrders: number;
            validOrders: number;
            avgPrice: number;
            totalAmount: number;
            fakeAmount: number;
            refundCount: number;
            refundRate: string;
            refundAmount: number;
            sameDayRefundCount: number;
            sameDayRefundRate: string;
            unverifiedCount: number;
            unverifiedRate: string;
            unverifiedAmount: number;
            verifyCount: number;
            verifyRate: string;
            verifyAvgPrice: number;
            verifyAmount: number;
            amountVerifyRate: string;
            hasOrderFile: boolean;
            hasVerifyFile: boolean;
          };
        }> = [];

        for (let i = 5; i >= 0; i--) {
          const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const year = date.getFullYear();
          const month = date.getMonth() + 1;
          const firstDay = new Date(year, month - 1, 1);
          const lastDay = new Date(year, month, 0);

          emptyMonths.push({
            year,
            month,
            startDate: formatDateForTrend(firstDay),
            endDate: formatDateForTrend(lastDay),
            metrics: {
              totalOrders: 0,
              fakeOrders: 0,
              validOrders: 0,
              avgPrice: 0,
              totalAmount: 0,
              fakeAmount: 0,
              refundCount: 0,
              refundRate: '0',
              refundAmount: 0,
              sameDayRefundCount: 0,
              sameDayRefundRate: '0',
              unverifiedCount: 0,
              unverifiedRate: '0',
              unverifiedAmount: 0,
              verifyCount: 0,
              verifyRate: '0',
              verifyAvgPrice: 0,
              verifyAmount: 0,
              amountVerifyRate: '0',
              hasOrderFile: false,
              hasVerifyFile: false,
            },
          });
        }
        setMonthlyData(emptyMonths);
      } finally {
        setLoading(false);
      }
    };

    fetchMonthlyData();
  }, [storeId, currentSystem, refreshKey]);

  // 表格始终显示，不再有提前返回逻辑

  // 数据列定义
  const columns = [
    { key: 'month', label: '月份', align: 'left' },
    { key: 'totalOrders', label: '订单数', align: 'right' },
    { key: 'fakeOrders', label: '刷单数', align: 'right' },
    { key: 'refundCount', label: '退款数', align: 'right' },
    { key: 'unverifiedCount', label: '未核销数', align: 'right' },
    { key: 'verifyCount', label: '核销数', align: 'right' },
    { key: 'verifyRate', label: '核销率', align: 'right', suffix: '%' },
    { key: 'totalAmount', label: '订单金额', align: 'right', prefix: '¥' },
    { key: 'fakeAmount', label: '刷单金额', align: 'right', prefix: '¥' },
    { key: 'refundAmount', label: '退款金额', align: 'right', prefix: '¥' },
    { key: 'unverifiedAmount', label: '未核销金额', align: 'right', prefix: '¥' },
    { key: 'verifyAmount', label: '核销金额', align: 'right', prefix: '¥' },
    { key: 'amountVerifyRate', label: '金额核销率', align: 'right', suffix: '%' },
  ];

  // 计算日期范围（最早的月第一天 到 最晚的月最后一天）
  const dateRange = monthlyData.length > 0
    ? `${monthlyData[0].startDate} 至 ${monthlyData[monthlyData.length - 1].endDate}`
    : '暂无数据';

  return (
    <div style={{ 
      padding: '16px 24px',
      background: '#fafbfc',
      borderBottom: '1px solid #f2f3f5',
      overflowX: 'auto'
    }}>
      {/* 日期范围说明 */}
      <div style={{ 
        marginBottom: '12px',
        fontSize: '12px',
        color: '#86909c',
        fontWeight: 500
      }}>
        {dateRange}
      </div>

      {/* 月度数据表格 */}
      <table style={{
        width: '100%',
        borderCollapse: 'collapse',
        fontSize: '12px',
        minWidth: '1400px'
      }}>
        <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
          <tr style={{ background: '#f5f5f5' }}>
            {columns.map((col) => (
              <th
                key={col.key}
                style={{
                  padding: '8px 12px',
                  textAlign: col.align as 'left' | 'right' | 'center',
                  fontSize: '12px',
                  fontWeight: 400,
                  color: '#86909c',
                  borderBottom: '2px solid #e5e6eb',
                  borderRight: '1px solid #e5e6eb',
                  whiteSpace: 'nowrap'
                }}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {monthlyData.map((row, rowIndex) => {
            const monthKey = `${row.year}-${row.month}`;
            const isExpanded = expandedMonths.has(monthKey);
            const dailyDetails = isExpanded ? getDailyDetails(row.year, row.month) : [];

            return (
              <React.Fragment key={rowIndex}>
                {/* 月度汇总行 */}
                <tr style={{ background: '#fff' }}>
                  <td style={{ 
                    padding: '8px 12px',
                    textAlign: 'left',
                    borderBottom: '1px solid #f2f3f5',
                    borderRight: '1px solid #f2f3f5',
                    fontWeight: 500,
                    color: '#1d2129'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button
                        onClick={() => toggleMonth(row.year, row.month)}
                        style={{
                          border: 'none',
                          background: 'none',
                          cursor: 'pointer',
                          padding: '0',
                          display: 'flex',
                          alignItems: 'center',
                          color: '#165dff'
                        }}
                      >
                        {isExpanded ? '▼' : '▶'}
                      </button>
                      <span>{row.year}年{row.month}月</span>
                    </div>
                  </td>
              {columns.slice(1).map((col) => {
                const metrics = row.metrics;
                const key = col.key as keyof typeof metrics;
                const value = metrics[key];

                const isOrderColumn = ['totalOrders', 'fakeOrders', 'validOrders', 'avgPrice', 'totalAmount',
                                       'refundCount', 'refundRate', 'sameDayRefundCount', 'sameDayRefundRate',
                                       'unverifiedCount', 'unverifiedRate'].includes(col.key);
                const isVerifyColumn = ['verifyCount', 'verifyRate', 'verifyAvgPrice', 'verifyAmount', 'amountVerifyRate'].includes(col.key);

                const hasData = isOrderColumn ? metrics.hasOrderFile : metrics.hasVerifyFile;
                
                // 如果没有数据，显示 *
                if (!hasData) {
                  return (
                    <td 
                      key={col.key} 
                      style={{ 
                        padding: '8px 12px',
                        textAlign: col.align as 'left' | 'right' | 'center',
                        borderBottom: '1px solid #f2f3f5',
                        borderRight: '1px solid #f2f3f5',
                        color: '#ff7d00'
                      }}
                    >
                      *
                    </td>
                  );
                }

                // 有数据，正常显示
                const displayValue = typeof value === 'number' && col.prefix 
                  ? `${col.prefix}${typeof value === 'number' ? value.toFixed(2) : value}`
                  : typeof value === 'number' && col.suffix
                  ? `${value.toFixed(2)}${col.suffix}`
                  : col.prefix
                  ? `${col.prefix}${value}`
                  : col.suffix
                  ? `${value}${col.suffix}`
                  : typeof value === 'number' && (col.key === 'avgPrice' || col.key === 'verifyAvgPrice' || col.key === 'totalAmount' || col.key === 'verifyAmount')
                  ? value.toFixed(2)
                  : typeof value === 'number' && (col.key === 'refundRate' || col.key === 'sameDayRefundRate' || col.key === 'unverifiedRate' || col.key === 'verifyRate' || col.key === 'amountVerifyRate')
                  ? value
                  : value;

                return (
                  <td 
                    key={col.key} 
                    style={{ 
                      padding: '8px 12px',
                      textAlign: col.align as 'left' | 'right' | 'center',
                      borderBottom: '1px solid #f2f3f5',
                      borderRight: '1px solid #f2f3f5',
                      color: '#1d2129',
                      fontFamily: 'monospace'
                    }}
                  >
                    {displayValue}
                  </td>
                );
              })}
                </tr>

                {/* 每日明细数据行 */}
                {isExpanded && dailyDetails.length > 0 && (
                  <tr>
                    <td colSpan={columns.length} style={{ padding: 0, background: '#fff' }}>
                      <div style={{ padding: '12px', background: '#fafbfc' }}>
                        <table style={{
                          width: '100%',
                          borderCollapse: 'collapse',
                          fontSize: '12px'
                        }}>
                          <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                            <tr style={{ background: '#f5f5f5' }}>
                              <th style={{
                                padding: '6px 8px',
                                textAlign: 'left',
                                fontSize: '11px',
                                fontWeight: 400,
                                color: '#86909c',
                                borderBottom: '1px solid #e5e6eb'
                              }}>日期</th>
                              <th style={{
                                padding: '6px 8px',
                                textAlign: 'right',
                                fontSize: '11px',
                                fontWeight: 400,
                                color: '#86909c',
                                borderBottom: '1px solid #e5e6eb'
                              }}>订单数</th>
                              <th style={{
                                padding: '6px 8px',
                                textAlign: 'right',
                                fontSize: '11px',
                                fontWeight: 400,
                                color: '#86909c',
                                borderBottom: '1px solid #e5e6eb'
                              }}>刷单数</th>
                              <th style={{
                                padding: '6px 8px',
                                textAlign: 'right',
                                fontSize: '11px',
                                fontWeight: 400,
                                color: '#86909c',
                                borderBottom: '1px solid #e5e6eb'
                              }}>退款数</th>
                              <th style={{
                                padding: '6px 8px',
                                textAlign: 'right',
                                fontSize: '11px',
                                fontWeight: 400,
                                color: '#86909c',
                                borderBottom: '1px solid #e5e6eb'
                              }}>未核销数</th>
                              <th style={{
                                padding: '6px 8px',
                                textAlign: 'right',
                                fontSize: '11px',
                                fontWeight: 400,
                                color: '#86909c',
                                borderBottom: '1px solid #e5e6eb'
                              }}>核销数</th>
                              <th style={{
                                padding: '6px 8px',
                                textAlign: 'right',
                                fontSize: '11px',
                                fontWeight: 400,
                                color: '#86909c',
                                borderBottom: '1px solid #e5e6eb'
                              }}>核销率</th>
                              <th style={{
                                padding: '6px 8px',
                                textAlign: 'right',
                                fontSize: '11px',
                                fontWeight: 400,
                                color: '#86909c',
                                borderBottom: '1px solid #e5e6eb'
                              }}>订单金额</th>
                              <th style={{
                                padding: '6px 8px',
                                textAlign: 'right',
                                fontSize: '11px',
                                fontWeight: 400,
                                color: '#86909c',
                                borderBottom: '1px solid #e5e6eb'
                              }}>刷单金额</th>
                              <th style={{
                                padding: '6px 8px',
                                textAlign: 'right',
                                fontSize: '11px',
                                fontWeight: 400,
                                color: '#86909c',
                                borderBottom: '1px solid #e5e6eb'
                              }}>退款金额</th>
                              <th style={{
                                padding: '6px 8px',
                                textAlign: 'right',
                                fontSize: '11px',
                                fontWeight: 400,
                                color: '#86909c',
                                borderBottom: '1px solid #e5e6eb'
                              }}>未核销金额</th>
                              <th style={{
                                padding: '6px 8px',
                                textAlign: 'right',
                                fontSize: '11px',
                                fontWeight: 400,
                                color: '#86909c',
                                borderBottom: '1px solid #e5e6eb'
                              }}>核销金额</th>
                              <th style={{
                                padding: '6px 8px',
                                textAlign: 'right',
                                fontSize: '11px',
                                fontWeight: 400,
                                color: '#86909c',
                                borderBottom: '1px solid #e5e6eb'
                              }}>金额核销率</th>
                            </tr>
                          </thead>
                          <tbody>
                            {dailyDetails.map((detail, idx) => {
                              const totalOrders = detail.totalOrders;
                              const totalAmount = detail.totalAmount;
                              const verifyRate = totalOrders > 0 ? ((detail.verifyCount / totalOrders) * 100).toFixed(2) : '0';
                              const amountVerifyRate = totalAmount > 0 ? ((detail.verifyAmount / totalAmount) * 100).toFixed(2) : '0';

                              return (
                                <tr key={idx} style={{ background: '#fff' }}>
                                  <td style={{ 
                                    padding: '6px 8px',
                                    textAlign: 'left',
                                    borderBottom: '1px solid #f2f3f5',
                                    color: '#1d2129'
                                  }}>
                                    {detail.date}
                                  </td>
                                  <td style={{ 
                                    padding: '6px 8px',
                                    textAlign: 'right',
                                    borderBottom: '1px solid #f2f3f5',
                                    color: '#1d2129',
                                    fontFamily: 'monospace'
                                  }}>
                                    {detail.totalOrders}
                                  </td>
                                  <td style={{ 
                                    padding: '6px 8px',
                                    textAlign: 'right',
                                    borderBottom: '1px solid #f2f3f5',
                                    color: detail.fakeOrders > 0 ? '#ff7d00' : '#1d2129',
                                    fontFamily: 'monospace'
                                  }}>
                                    {detail.fakeOrders}
                                  </td>
                                  <td style={{ 
                                    padding: '6px 8px',
                                    textAlign: 'right',
                                    borderBottom: '1px solid #f2f3f5',
                                    color: detail.refundCount > 0 ? '#f53f3f' : '#1d2129',
                                    fontFamily: 'monospace'
                                  }}>
                                    {detail.refundCount}
                                  </td>
                                  <td style={{ 
                                    padding: '6px 8px',
                                    textAlign: 'right',
                                    borderBottom: '1px solid #f2f3f5',
                                    color: detail.unverifiedCount > 0 ? '#ff7d00' : '#1d2129',
                                    fontFamily: 'monospace'
                                  }}>
                                    {detail.unverifiedCount}
                                  </td>
                                  <td style={{ 
                                    padding: '6px 8px',
                                    textAlign: 'right',
                                    borderBottom: '1px solid #f2f3f5',
                                    color: '#1d2129',
                                    fontFamily: 'monospace'
                                  }}>
                                    {detail.verifyCount}
                                  </td>
                                  <td style={{ 
                                    padding: '6px 8px',
                                    textAlign: 'right',
                                    borderBottom: '1px solid #f2f3f5',
                                    color: '#1d2129',
                                    fontFamily: 'monospace'
                                  }}>
                                    {verifyRate}%
                                  </td>
                                  <td style={{ 
                                    padding: '6px 8px',
                                    textAlign: 'right',
                                    borderBottom: '1px solid #f2f3f5',
                                    color: '#1d2129',
                                    fontFamily: 'monospace'
                                  }}>
                                    ¥{totalAmount.toFixed(2)}
                                  </td>
                                  <td style={{ 
                                    padding: '6px 8px',
                                    textAlign: 'right',
                                    borderBottom: '1px solid #f2f3f5',
                                    color: detail.fakeAmount > 0 ? '#ff7d00' : '#1d2129',
                                    fontFamily: 'monospace'
                                  }}>
                                    ¥{detail.fakeAmount.toFixed(2)}
                                  </td>
                                  <td style={{ 
                                    padding: '6px 8px',
                                    textAlign: 'right',
                                    borderBottom: '1px solid #f2f3f5',
                                    color: detail.refundAmount > 0 ? '#f53f3f' : '#1d2129',
                                    fontFamily: 'monospace'
                                  }}>
                                    ¥{detail.refundAmount.toFixed(2)}
                                  </td>
                                  <td style={{ 
                                    padding: '6px 8px',
                                    textAlign: 'right',
                                    borderBottom: '1px solid #f2f3f5',
                                    color: detail.unverifiedAmount > 0 ? '#ff7d00' : '#1d2129',
                                    fontFamily: 'monospace'
                                  }}>
                                    ¥{detail.unverifiedAmount.toFixed(2)}
                                  </td>
                                  <td style={{ 
                                    padding: '6px 8px',
                                    textAlign: 'right',
                                    borderBottom: '1px solid #f2f3f5',
                                    color: '#1d2129',
                                    fontFamily: 'monospace'
                                  }}>
                                    ¥{detail.verifyAmount.toFixed(2)}
                                  </td>
                                  <td style={{ 
                                    padding: '6px 8px',
                                    textAlign: 'right',
                                    borderBottom: '1px solid #f2f3f5',
                                    color: '#1d2129',
                                    fontFamily: 'monospace'
                                  }}>
                                    {amountVerifyRate}%
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// 未匹配原因悬停气泡组件
function UnmatchedReasonTooltip({
  reasons,
  title,
  children,
  onClick
}: {
  reasons: Record<string, number>;
  title: string;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseEnter = (e: React.MouseEvent) => {
    // 使用 event.target 确保获取正确的元素位置
    const target = e.currentTarget;
    const rect = target.getBoundingClientRect();
    setPosition({
      top: rect.bottom + 8,
      left: rect.left
    });
    setIsVisible(true);
  };

  const handleMouseLeave = () => {
    setIsVisible(false);
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onClick) {
      onClick();
    }
  };

  const reasonEntries = Object.entries(reasons);
  const hasReasons = reasonEntries.length > 0;

  return (
    <>
      <div
        ref={containerRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={hasReasons ? handleClick : undefined}
        style={{
          display: 'inline-block',
          cursor: hasReasons ? (onClick ? 'pointer' : 'help') : 'default',
          position: 'relative'
        }}
      >
        {children}
      </div>
      {isVisible && hasReasons && createPortal(
        <div
          style={{
            position: 'fixed',
            top: position.top,
            left: position.left,
            zIndex: 99999,
            background: '#fff',
            border: '1px solid #e5e6eb',
            borderRadius: '6px',
            padding: '12px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            fontSize: '12px',
            maxWidth: '320px',
            minWidth: '200px'
          }}
          onMouseEnter={() => setIsVisible(true)}
          onMouseLeave={() => setIsVisible(false)}
        >
          <div style={{ fontWeight: 600, marginBottom: '8px', color: '#1d2129' }}>{title}</div>
          {reasonEntries.map(([reason, count], index) => (
            <div key={index} style={{ marginBottom: '4px', lineHeight: '1.6', color: '#4e5969' }}>
              <span style={{ color: '#f53f3f', fontWeight: 600 }}>{count}</span>
              <span style={{ marginLeft: '8px' }}>{reason}</span>
            </div>
          ))}
          <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #e5e6eb', fontSize: '11px', color: '#86909c' }}>
            共 {reasonEntries.reduce((sum, [_, count]) => sum + count, 0)} 条记录，{reasonEntries.length} 种原因
          </div>
          {onClick && (
            <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #e5e6eb' }}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsVisible(false);
                  onClick();
                }}
                style={{
                  width: '100%',
                  padding: '6px 12px',
                  fontSize: '12px',
                  border: '1px solid #165dff',
                  borderRadius: '4px',
                  background: '#e8f3ff',
                  color: '#165dff',
                  cursor: 'pointer',
                  fontWeight: 500
                }}
              >
                查看详情
              </button>
            </div>
          )}
        </div>,
        document.body
      )}
    </>
  );
}

// 未匹配详情弹窗组件
function UnmatchedDetailsModal({
  type,
  orderDetails,
  orderStoreIdStats,
  verifyDetails,
  dataTimeStart,
  dataTimeEnd,
  onClose
}: {
  type: 'order' | 'verify';
  orderDetails?: OrderAggregatedData['unmatchedOrderDetails'];
  orderStoreIdStats?: Array<{ storeId: string; orderCount: number; totalAmount: number; reason: string }>;
  verifyDetails?: VerifyAggregatedData['unmatchedVerifyDetails'];
  dataTimeStart?: string;
  dataTimeEnd?: string;
  onClose: () => void;
}) {
  // 添加一个状态来切换视图：'stats' | 'details'
  const [viewMode, setViewMode] = useState<'stats' | 'details'>('stats');
  
  // 时间筛选辅助函数
  const isInRange = (dateStr: string, start?: string, end?: string) => {
    if (!start && !end) return true;
    const date = dateStr?.split(' ')[0] || dateStr;
    if (!date) return false;
    if (start && date < start) return false;
    if (end && date > end) return false;
    return true;
  };

  if (type === 'order') {
    // 根据时间筛选过滤未匹配门店ID统计
    const filteredStoreIdStats = orderStoreIdStats?.filter(stat => {
      // 门店ID统计不需要时间筛选，因为已经聚合了
      return true;
    }) || [];

    // 根据时间筛选过滤未匹配订单详情
    const filteredDetails = orderDetails?.filter(detail => {
      if (!dataTimeStart && !dataTimeEnd) return true;
      return isInRange(detail.payTime, dataTimeStart, dataTimeEnd);
    }) || [];

    if (!orderDetails || orderDetails.length === 0) {
      return (
        <div className="modal-overlay" onClick={onClose}>
          <div className="modal-content" style={{ width: '640px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">未匹配订单详情</h3>
              <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', color: '#86909c' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            <div className="modal-body" style={{ padding: '16px' }}>
              <p style={{ color: '#86909c', textAlign: 'center' }}>暂无未匹配订单数据</p>
            </div>
          </div>
        </div>
      );
    }

    if (filteredDetails.length === 0) {
      return (
        <div className="modal-overlay" onClick={onClose}>
          <div className="modal-content" style={{ width: '640px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">未匹配订单详情</h3>
              <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', color: '#86909c' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            <div className="modal-body" style={{ padding: '16px' }}>
              <p style={{ color: '#86909c', textAlign: 'center' }}>
                当前时间范围内暂无未匹配订单数据<br/>
                <span style={{ fontSize: '12px' }}>（总共有 {orderDetails.length} 条未匹配订单）</span>
              </p>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content" style={{ width: '900px', maxHeight: '80vh' }} onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <h3 className="modal-title">
                未匹配订单详情
                {viewMode === 'details' && ` (${filteredDetails.length}条)`}
                {viewMode === 'stats' && ` (${filteredStoreIdStats.length}个门店ID)`}
              </h3>
              {/* 视图切换按钮 */}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => setViewMode('stats')}
                  style={{
                    padding: '4px 12px',
                    fontSize: '12px',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    background: viewMode === 'stats' ? '#165dff' : '#f2f3f5',
                    color: viewMode === 'stats' ? '#fff' : '#666'
                  }}
                >
                  门店ID统计
                </button>
                <button
                  onClick={() => setViewMode('details')}
                  style={{
                    padding: '4px 12px',
                    fontSize: '12px',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    background: viewMode === 'details' ? '#165dff' : '#f2f3f5',
                    color: viewMode === 'details' ? '#fff' : '#666'
                  }}
                >
                  订单详情
                </button>
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', color: '#86909c' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
          <div className="modal-body" style={{ padding: '0', maxHeight: '60vh', overflowY: 'auto' }}>
            {viewMode === 'stats' ? (
              // 门店ID统计视图
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead style={{ position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
                  <tr style={{ borderBottom: '1px solid #e5e6eb' }}>
                    <th style={{ padding: '12px', textAlign: 'left', background: '#f7f8fa', color: '#1d2129', fontWeight: 600 }}>
                      序号
                    </th>
                    <th style={{ padding: '12px', textAlign: 'left', background: '#f7f8fa', color: '#1d2129', fontWeight: 600 }}>
                      门店ID
                    </th>
                    <th style={{ padding: '12px', textAlign: 'right', background: '#f7f8fa', color: '#1d2129', fontWeight: 600 }}>
                      订单数
                    </th>
                    <th style={{ padding: '12px', textAlign: 'right', background: '#f7f8fa', color: '#1d2129', fontWeight: 600 }}>
                      总金额
                    </th>
                    <th style={{ padding: '12px', textAlign: 'left', background: '#f7f8fa', color: '#1d2129', fontWeight: 600 }}>
                      未匹配原因
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStoreIdStats.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: '#86909c' }}>
                        暂无数据
                      </td>
                    </tr>
                  ) : (
                    filteredStoreIdStats.map((stat, index) => (
                      <tr key={index} style={{ borderBottom: '1px solid #f2f3f5' }}>
                        <td style={{ padding: '12px', color: '#1d2129' }}>
                          {index + 1}
                        </td>
                        <td style={{ padding: '12px', color: stat.storeId ? '#00b42a' : '#f53f3f', fontFamily: 'monospace' }}>
                          {stat.storeId || '(空)'}
                        </td>
                        <td style={{ padding: '12px', color: '#1d2129', textAlign: 'right' }}>
                          {stat.orderCount}
                        </td>
                        <td style={{ padding: '12px', color: '#1d2129', textAlign: 'right' }}>
                          ¥{stat.totalAmount.toFixed(2)}
                        </td>
                        <td style={{ padding: '12px', color: '#f53f3f' }}>
                          {stat.reason}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            ) : (
              // 订单详情视图
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead style={{ position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
                  <tr style={{ borderBottom: '1px solid #e5e6eb' }}>
                    <th style={{ padding: '12px', textAlign: 'left', background: '#f7f8fa', color: '#1d2129', fontWeight: 600 }}>
                      订单ID
                    </th>
                    <th style={{ padding: '12px', textAlign: 'left', background: '#f7f8fa', color: '#1d2129', fontWeight: 600 }}>
                      门店ID
                    </th>
                    <th style={{ padding: '12px', textAlign: 'left', background: '#f7f8fa', color: '#1d2129', fontWeight: 600 }}>
                      未匹配原因
                    </th>
                    <th style={{ padding: '12px', textAlign: 'left', background: '#f7f8fa', color: '#1d2129', fontWeight: 600 }}>
                      支付时间
                    </th>
                    <th style={{ padding: '12px', textAlign: 'left', background: '#f7f8fa', color: '#1d2129', fontWeight: 600 }}>
                      订单状态
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDetails.map((item, index) => (
                    <tr key={index} style={{ borderBottom: '1px solid #f2f3f5' }}>
                      <td style={{ padding: '12px', color: '#1d2129', fontFamily: 'monospace' }}>
                        {item.orderId}
                      </td>
                      <td style={{ padding: '12px', color: item.storeId ? '#00b42a' : '#f53f3f' }}>
                        {item.storeId || '-'}
                      </td>
                      <td style={{ padding: '12px', color: '#f53f3f' }}>
                        {item.reason}
                      </td>
                      <td style={{ padding: '12px', color: '#1d2129' }}>
                        {item.payTime}
                      </td>
                      <td style={{ padding: '12px', color: '#1d2129' }}>
                        {item.orderStatus}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    );
  } else {
    // 根据时间筛选过滤未匹配核销详情
    const filteredDetails = verifyDetails?.filter(detail => {
      if (!dataTimeStart && !dataTimeEnd) return true;
      return isInRange(detail.verifyTime, dataTimeStart, dataTimeEnd);
    }) || [];

    if (!verifyDetails || verifyDetails.length === 0) {
      return (
        <div className="modal-overlay" onClick={onClose}>
          <div className="modal-content" style={{ width: '640px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">未匹配核销详情</h3>
              <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', color: '#86909c' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            <div className="modal-body" style={{ padding: '16px' }}>
              <p style={{ color: '#86909c', textAlign: 'center' }}>暂无未匹配核销数据</p>
            </div>
          </div>
        </div>
      );
    }

    if (filteredDetails.length === 0) {
      return (
        <div className="modal-overlay" onClick={onClose}>
          <div className="modal-content" style={{ width: '640px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">未匹配核销详情</h3>
              <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', color: '#86909c' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            <div className="modal-body" style={{ padding: '16px' }}>
              <p style={{ color: '#86909c', textAlign: 'center' }}>
                当前时间范围内暂无未匹配核销数据<br/>
                <span style={{ fontSize: '12px' }}>（总共有 {verifyDetails.length} 条未匹配核销）</span>
              </p>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content" style={{ width: '900px', maxHeight: '80vh' }} onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h3 className="modal-title">
              未匹配核销详情 ({filteredDetails.length}条)
            </h3>
            <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', color: '#86909c' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
          <div className="modal-body" style={{ padding: '0', maxHeight: '60vh', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead style={{ position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
                <tr style={{ borderBottom: '1px solid #e5e6eb' }}>
                  <th style={{ padding: '12px', textAlign: 'left', background: '#f7f8fa', color: '#1d2129', fontWeight: 600 }}>
                    核销ID
                  </th>
                  <th style={{ padding: '12px', textAlign: 'left', background: '#f7f8fa', color: '#1d2129', fontWeight: 600 }}>
                    门店ID
                  </th>
                  <th style={{ padding: '12px', textAlign: 'left', background: '#f7f8fa', color: '#1d2129', fontWeight: 600 }}>
                    未匹配原因
                  </th>
                  <th style={{ padding: '12px', textAlign: 'left', background: '#f7f8fa', color: '#1d2129', fontWeight: 600 }}>
                    核销时间
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredDetails.map((item, index) => (
                  <tr key={index} style={{ borderBottom: '1px solid #f2f3f5' }}>
                    <td style={{ padding: '12px', color: '#1d2129', fontFamily: 'monospace' }}>
                      {item.verifyId}
                    </td>
                    <td style={{ padding: '12px', color: item.storeId ? '#00b42a' : '#f53f3f' }}>
                      {item.storeId || '-'}
                    </td>
                    <td style={{ padding: '12px', color: '#f53f3f' }}>
                      {item.reason}
                    </td>
                    <td style={{ padding: '12px', color: '#1d2129' }}>
                      {item.verifyTime}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }
}

// 合计详情弹窗组件
function TotalDetailsModal({
  quarterlyData,
  monthlyData,
  dailyData,
  dataTimeStart,
  dataTimeEnd,
  onClose,
  onTimeChange,
  selectedTagLevel,
  onTagLevelChange,
  tagLevelCounts
}: {
  quarterlyData: Array<{
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
      verifyRate: number;
      totalAmount: number;
      fakeAmount: number;
      refundAmount: number;
      unverifiedAmount: number;
      verifyAmount: number;
      fakeVerifyAmount: number;
      amountVerifyRate: number;
      validOrders: number;
      validOrderAmount: number;
      validVerifyCount: number;
      validVerifyAmount: number;
      validVerifyRate: number;
      validAmountRate: number;
      adSpend: number;
    };
  }>;
  monthlyData: Array<{
    year: number;
    month: number;
    label: string;
    metrics: {
      totalOrders: number;
      fakeOrders: number;
      refundCount: number;
      unverifiedCount: number;
      verifyCount: number;
      fakeVerifyCount: number;
      verifyRate: number;
      totalAmount: number;
      fakeAmount: number;
      refundAmount: number;
      unverifiedAmount: number;
      verifyAmount: number;
      fakeVerifyAmount: number;
      amountVerifyRate: number;
      validOrders: number;
      validOrderAmount: number;
      validVerifyCount: number;
      validVerifyAmount: number;
      validVerifyRate: number;
      validAmountRate: number;
      adSpend: number;
    };
  }>;
  dailyData: Array<{
    date: string;
    totalOrders: number;
    fakeOrders: number;
    refundCount: number;
    unverifiedCount: number;
    verifyCount: number;
    fakeVerifyCount: number;
    verifyRate: number;
    totalAmount: number;
    fakeAmount: number;
    refundAmount: number;
    unverifiedAmount: number;
    verifyAmount: number;
    fakeVerifyAmount: number;
    amountVerifyRate: number;
    validOrders: number;
    validOrderAmount: number;
    validVerifyCount: number;
    validVerifyAmount: number;
    validVerifyRate: number;
    validAmountRate: number;
    adSpend: number;
  }>;
  dataTimeStart?: string;
  dataTimeEnd?: string;
  onClose: () => void;
  onTimeChange?: (start: string, end: string, quick: string) => void;
  selectedTagLevel: 'S' | 'A' | 'B' | 'C' | 'C-' | 'all' | 'meili' | 'direct' | 'empty';
  onTagLevelChange: (level: 'S' | 'A' | 'B' | 'C' | 'C-' | 'all' | 'meili' | 'direct' | 'empty') => void;
  tagLevelCounts: Record<string, number>;
}) {
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
    metrics: {
      adSpend: number;
      totalOrders: number;
      fakeOrders: number;
      refundCount: number;
      unverifiedCount: number;
      verifyCount: number;
      fakeVerifyCount: number;
      totalAmount: number;
      fakeAmount: number;
      refundAmount: number;
      unverifiedAmount: number;
      verifyAmount: number;
      fakeVerifyAmount: number;
      validOrders: number;
      validOrderAmount: number;
      validVerifyCount: number;
      validVerifyAmount: number;
      verifyRate: string;
      validVerifyRate: string;
      amountVerifyRate: string;
      validAmountRate: string;
    };
    days?: Array<{
      date: string;
      totalOrders: number;
      fakeOrders: number;
      refundCount: number;
      unverifiedCount: number;
      verifyCount: number;
      fakeVerifyCount: number;
      verifyRate: number;
      totalAmount: number;
      fakeAmount: number;
      refundAmount: number;
      unverifiedAmount: number;
      verifyAmount: number;
      fakeVerifyAmount: number;
      amountVerifyRate: number;
      validOrders: number;
      validOrderAmount: number;
      validVerifyCount: number;
      validVerifyAmount: number;
      validVerifyRate: number;
      validAmountRate: number;
      adSpend: number;
    }>;
  }

  // 展开状态
  const [expandedQuarters, setExpandedQuarters] = useState<Set<string>>(new Set());
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(new Set());

  // 视图模式：'month' 表示月视图，'week' 表示周视图，'day' 表示日视图
  const [viewMode, setViewMode] = useState<'month' | 'week' | 'day'>('month');

  type DataTimeQuick = 'all' | 'today' | 'yesterday' | 'thisMonth' | 'thisMonthExceptToday' | 'lastMonth' | 'twoMonthsAgo' | 'lastThreeMonths' | 'lastThreeMonthsIncludingThisMonth' | 'thisYear';

  // 时间筛选状态 - 根据视图模式初始化
  const [dataTimeQuick, setDataTimeQuick] = useState<DataTimeQuick>('all');
  const [highlightDate, setHighlightDate] = useState<string>('');

  // 初始化时间筛选状态
  useEffect(() => {
    // 月视图默认为'全部'，周视图默认为'本月'，日视图默认为'今日'
    if (viewMode === 'week') {
      setDataTimeQuick('thisMonth');
    } else if (viewMode === 'day') {
      setDataTimeQuick('today');
    } else {
      setDataTimeQuick('all');
    }
  }, [viewMode]); // 视图模式改变时重新设置时间筛选

  const toggleQuarter = (year: number, quarter: number) => {
    const key = `${year}-Q${quarter}`;
    const newExpanded = new Set(expandedQuarters);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedQuarters(newExpanded);
  };

  const toggleMonth = (year: number, month: number) => {
    const key = `${year}-${String(month).padStart(2, '0')}`;
    const newExpanded = new Set(expandedMonths);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedMonths(newExpanded);
  };

  const toggleWeek = (weekKey: string) => {
    const newExpanded = new Set(expandedWeeks);
    if (newExpanded.has(weekKey)) {
      newExpanded.delete(weekKey);
    } else {
      newExpanded.add(weekKey);
    }
    setExpandedWeeks(newExpanded);
  };

  // 获取一年中的第几周（周一为一周开始）
  const getWeekNumber = (date: Date): { year: number, week: number } => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return { year: d.getUTCFullYear(), week };
  };

  // 格式化日期
  const formatDateForWeek = (date: Date): string => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  // 创建空的 metrics 对象
  const createEmptyMetrics = () => ({
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
    validOrderAmount: 0,
    validVerifyCount: 0,
    validVerifyAmount: 0,
    verifyRate: 0,
    validVerifyRate: 0,
    amountVerifyRate: 0,
    validAmountRate: 0
  });

  // 合并两个 metrics 对象
  const mergeMetrics = (target: any, source: any) => {
    target.adSpend += source.adSpend || 0;
    target.totalOrders += source.totalOrders || 0;
    target.fakeOrders += source.fakeOrders || 0;
    target.refundCount += source.refundCount || 0;
    target.unverifiedCount += source.unverifiedCount || 0;
    target.verifyCount += source.verifyCount || 0;
    target.fakeVerifyCount += source.fakeVerifyCount || 0;
    target.totalAmount += source.totalAmount || 0;
    target.fakeAmount += source.fakeAmount || 0;
    target.refundAmount += source.refundAmount || 0;
    target.unverifiedAmount += source.unverifiedAmount || 0;
    target.verifyAmount += source.verifyAmount || 0;
    target.fakeVerifyAmount += source.fakeVerifyAmount || 0;
    target.validOrders += source.validOrders || 0;
    target.validOrderAmount += source.validOrderAmount || 0;
    target.validVerifyCount += source.validVerifyCount || 0;
    target.validVerifyAmount += source.validVerifyAmount || 0;

    // 重新计算比率
    target.verifyRate = target.totalOrders > 0 ? (target.verifyCount / target.totalOrders) * 100 : 0;
    target.validVerifyRate = target.validOrders > 0 ? (target.validVerifyCount / target.validOrders) * 100 : 0;
    target.amountVerifyRate = target.totalAmount > 0 ? (target.verifyAmount / target.totalAmount) * 100 : 0;
    target.validAmountRate = target.validOrderAmount > 0 ? (target.validVerifyAmount / target.validOrderAmount) * 100 : 0;
  };

  // 按自然周聚合数据
  const aggregateDataByWeek = (dailyDataList: Array<{
    date: string;
    totalOrders: number;
    fakeOrders: number;
    refundCount: number;
    unverifiedCount: number;
    verifyCount: number;
    fakeVerifyCount: number;
    verifyRate: number;
    totalAmount: number;
    fakeAmount: number;
    refundAmount: number;
    unverifiedAmount: number;
    verifyAmount: number;
    fakeVerifyAmount: number;
    amountVerifyRate: number;
    validOrders: number;
    validOrderAmount: number;
    validVerifyCount: number;
    validVerifyAmount: number;
    validVerifyRate: number;
    validAmountRate: number;
    adSpend: number;
  }>) => {
    const weekMap = new Map<string, any>();

    dailyDataList.forEach(dayData => {
      const date = new Date(dayData.date);
      const { year, week } = getWeekNumber(date);

      // 计算周一的日期（用于显示范围）
      const dayOfWeek = date.getDay() || 7; // 周日为0，改为7
      const monday = new Date(date);
      monday.setDate(date.getDate() - (dayOfWeek - 1));
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);

      const weekKey = `${year}-W${String(week).padStart(2, '0')}`;

      if (!weekMap.has(weekKey)) {
        weekMap.set(weekKey, {
          year,
          week,
          label: `${year % 100}年第${week}周`,
          dateRange: `${formatDateForWeek(monday)} 至 ${formatDateForWeek(sunday)}`,
          metrics: createEmptyMetrics()
        });
      }

      const weekData = weekMap.get(weekKey)!;
      mergeMetrics(weekData.metrics, dayData);
    });

    return Array.from(weekMap.values()).sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.week - b.week;
    });
  };

  // 生成周数据（周一到周日）
  const generateWeeklyDataForMonth = (allDaily: Array<{
    date: string;
    totalOrders: number;
    fakeOrders: number;
    refundCount: number;
    unverifiedCount: number;
    verifyCount: number;
    fakeVerifyCount: number;
    verifyRate: number;
    totalAmount: number;
    fakeAmount: number;
    refundAmount: number;
    unverifiedAmount: number;
    verifyAmount: number;
    fakeVerifyAmount: number;
    amountVerifyRate: number;
    validOrders: number;
    validOrderAmount: number;
    validVerifyCount: number;
    validVerifyAmount: number;
    validVerifyRate: number;
    validAmountRate: number;
    adSpend: number;
  }>, year: number, month: number): WeeklyData[] => {
    const weeks: WeeklyData[] = [];

    // 辅助函数：获取日期所在周的周一
    const getMonday = (dateStr: string): Date => {
      const date = new Date(dateStr);
      const day = date.getDay();
      const diff = day === 0 ? -6 : 1 - day;
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
    const completeWeekMap = new Map<string, typeof allDaily>();
    const currentDays: typeof allDaily = [];

    allDaily.forEach(day => {
      const dayDate = new Date(day.date);
      dayDate.setHours(0, 0, 0, 0);

      // 只处理当前月份的数据
      if (dayDate.getFullYear() !== year || (dayDate.getMonth() + 1) !== month) {
        return;
      }

      if (dayDate > today) {
        return;
      }

      const weekNumber = getMonthWeekNumber(dayDate);
      const { start: startDay, end: endDay } = getWeekDateRange(dayDate.getFullYear(), dayDate.getMonth() + 1, weekNumber);

      const lastDayOfMonth = new Date(dayDate.getFullYear(), dayDate.getMonth() + 1, 0).getDate();
      const actualEndDay = Math.min(endDay, lastDayOfMonth);
      const weekEndDate = new Date(dayDate.getFullYear(), dayDate.getMonth(), actualEndDay);
      weekEndDate.setHours(23, 59, 59, 999);

      const isWeekComplete = weekEndDate <= today;

      if (isWeekComplete) {
        const weekKey = `${dayDate.getFullYear()}-${String(dayDate.getMonth() + 1).padStart(2, '0')}-W${weekNumber}`;
        if (!completeWeekMap.has(weekKey)) {
          completeWeekMap.set(weekKey, []);
        }
        completeWeekMap.get(weekKey)!.push(day);
      } else {
        currentDays.push(day);
      }
    });

    // 生成完整周的数据
    completeWeekMap.forEach((days, weekKey) => {
      const [yearStr, monthStr, weekStr] = weekKey.split('-');
      const year = parseInt(yearStr);
      const month = parseInt(monthStr);
      const weekNumber = parseInt(weekStr.replace('W', ''));

      const { start: startDay, end: endDay } = getWeekDateRange(year, month, weekNumber);

      const startDateObj = new Date(year, month - 1, startDay);
      const endDateObj = new Date(year, month - 1, endDay);

      const lastDayOfMonth = new Date(year, month, 0).getDate();
      const actualEndDay = Math.min(endDay, lastDayOfMonth);
      endDateObj.setDate(actualEndDay);

      const startDate = formatDate(startDateObj);
      const endDate = formatDate(endDateObj);
      const startDateShort = formatShortDate(startDateObj);
      const endDateShort = formatShortDate(endDateObj);

      let label: string;
      let dateRange: string;

      if (weekNumber === 5) {
        label = `${startDateShort}-${endDateShort}`;
        dateRange = `${startDateShort} 至 ${endDateShort}`;
      } else {
        label = `第${weekNumber}周`;
        dateRange = `${startDateShort} 至 ${endDateShort}`;
      }

      const metrics = {
        ...days.reduce((acc, day) => ({
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
        }),
        verifyRate: days.length > 0 && days.reduce((sum, day) => sum + day.verifyCount, 0) > 0 ?
          ((days.reduce((sum, day) => sum + day.verifyCount, 0) / days.reduce((sum, day) => sum + day.totalOrders, 0)) * 100).toFixed(2) : '0',
        amountVerifyRate: days.length > 0 && days.reduce((sum, day) => sum + day.totalAmount, 0) > 0 ?
          ((days.reduce((sum, day) => sum + day.verifyAmount, 0) / days.reduce((sum, day) => sum + day.totalAmount, 0)) * 100).toFixed(2) : '0',
        validVerifyRate: days.length > 0 && days.reduce((sum, day) => sum + day.validOrders, 0) > 0 ?
          ((days.reduce((sum, day) => sum + day.validVerifyCount, 0) / days.reduce((sum, day) => sum + day.validOrders, 0)) * 100).toFixed(2) : '0',
        validAmountRate: days.length > 0 && days.reduce((sum, day) => sum + day.validOrderAmount, 0) > 0 ?
          ((days.reduce((sum, day) => sum + day.validVerifyAmount, 0) / days.reduce((sum, day) => sum + day.validOrderAmount, 0)) * 100).toFixed(2) : '0',
      };

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
        metrics,
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
        weekNumber: 0,
        startDate: day.date,
        endDate: day.date,
        label: dateShort,
        dateRange: dateShort,
        isCrossMonth: false,
        metrics: {
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
          validOrderAmount: day.validOrderAmount,
          validVerifyCount: day.validVerifyCount,
          validVerifyAmount: day.validVerifyAmount,
          verifyRate: day.totalOrders > 0 ? ((day.verifyCount / day.totalOrders) * 100).toFixed(2) : '0',
          amountVerifyRate: day.totalAmount > 0 ? ((day.verifyAmount / day.totalAmount) * 100).toFixed(2) : '0',
          validVerifyRate: day.validOrders > 0 ? ((day.validVerifyCount / day.validOrders) * 100).toFixed(2) : '0',
          validAmountRate: day.validOrderAmount > 0 ? ((day.validVerifyAmount / day.validOrderAmount) * 100).toFixed(2) : '0',
        },
        days: [day],
      });
    });

    return weeks;
  };

  // 根据快捷筛选获取日期范围
  const getDateRange = (quick: DataTimeQuick) => {
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
      case 'thisMonth': {
        const start = formatDate(new Date(now.getFullYear(), now.getMonth(), 1));
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        const end = formatDate(lastDay);
        return { start, end };
      }
      case 'thisMonthExceptToday': {
        const start = formatDate(new Date(now.getFullYear(), now.getMonth(), 1));
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const end = formatDate(yesterday);
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
      case 'lastThreeMonths': {
        const start = formatDate(new Date(now.getFullYear(), now.getMonth() - 3, 1));
        const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
        const end = formatDate(lastDay);
        return { start, end };
      }
      case 'lastThreeMonthsIncludingThisMonth': {
        // 近三月含本月：计算三个自然月，例如4月份显示2、3、4月
        const start = formatDate(new Date(now.getFullYear(), now.getMonth() - 2, 1));
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
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
  const getExpandedDates = (quick: DataTimeQuick) => {
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
  const handleTimeFilterChange = (quick: DataTimeQuick) => {
    setDataTimeQuick(quick);
    const { quarters, months, highlight } = getExpandedDates(quick);
    setExpandedQuarters(quarters);
    setExpandedMonths(months);
    setHighlightDate(highlight);
    
    // 同步到父组件
    if (onTimeChange) {
      const range = getDateRange(quick);
      onTimeChange(range.start, range.end, quick);
    }
  };

  // 根据时间筛选过滤数据（直接根据 dataTimeQuick 计算范围）
  const filteredQuarterlyData = useMemo(() => {
    // 【关键修复】如果 dataTimeQuick 是 'all'，直接返回所有数据，完全忽略 dataTimeStart 和 dataTimeEnd
    if (dataTimeQuick === 'all') {
      return quarterlyData;
    }
    
    // 获取时间范围
    let rangeStart = dataTimeStart || '';
    let rangeEnd = dataTimeEnd || '';
    
    // 如果没有传入的时间范围，则根据 dataTimeQuick 计算
    if (!rangeStart && !rangeEnd) {
      const range = getDateRange(dataTimeQuick);
      rangeStart = range.start || '';
      rangeEnd = range.end || '';
    }
    
    if (!rangeStart && !rangeEnd) return quarterlyData;

    return quarterlyData.filter(q => {
      const quarterStart = new Date(q.year, (q.quarter - 1) * 3, 1);
      const quarterEnd = new Date(q.year, q.quarter * 3, 0);
      const startDate = new Date(rangeStart);
      const endDate = new Date(rangeEnd);

      return quarterEnd >= startDate && quarterStart <= endDate;
    });
  }, [quarterlyData, dataTimeQuick, dataTimeStart, dataTimeEnd]);

  const filteredMonthlyData = useMemo(() => {
    // 【关键修复】如果 dataTimeQuick 是 'all'，直接返回所有数据，完全忽略 dataTimeStart 和 dataTimeEnd
    if (dataTimeQuick === 'all') {
      return monthlyData;
    }
    
    // 获取时间范围
    let rangeStart = dataTimeStart || '';
    let rangeEnd = dataTimeEnd || '';
    
    // 如果没有传入的时间范围，则根据 dataTimeQuick 计算
    if (!rangeStart && !rangeEnd) {
      const range = getDateRange(dataTimeQuick);
      rangeStart = range.start || '';
      rangeEnd = range.end || '';
    }
    
    if (!rangeStart && !rangeEnd) return monthlyData;

    return monthlyData.filter(m => {
      const monthStart = new Date(m.year, m.month - 1, 1);
      const monthEnd = new Date(m.year, m.month, 0);
      const startDate = new Date(rangeStart);
      const endDate = new Date(rangeEnd);

      return monthEnd >= startDate && monthStart <= endDate;
    });
  }, [monthlyData, dataTimeQuick, dataTimeStart, dataTimeEnd]);

  const filteredDailyData = useMemo(() => {
    // 【关键修复】如果 dataTimeQuick 是 'all'，直接返回所有数据，完全忽略 dataTimeStart 和 dataTimeEnd
    if (dataTimeQuick === 'all') {
      return dailyData;
    }
    
    // 获取时间范围
    let rangeStart = dataTimeStart || '';
    let rangeEnd = dataTimeEnd || '';
    
    // 如果没有传入的时间范围，则根据 dataTimeQuick 计算
    if (!rangeStart && !rangeEnd) {
      const range = getDateRange(dataTimeQuick);
      rangeStart = range.start || '';
      rangeEnd = range.end || '';
    }
    
    if (!rangeStart && !rangeEnd) return dailyData;

    return dailyData.filter(d => {
      return d.date >= rangeStart && d.date <= rangeEnd;
    });
  }, [dailyData, dataTimeQuick, dataTimeStart, dataTimeEnd]);

  // 根据视图模式计算要展示的数据
  const displayData = useMemo(() => {
    // 【终极保护】如果 dataTimeQuick 是 'all'，直接返回原始数据，完全绕过所有过滤逻辑
    if (dataTimeQuick === 'all') {
      if (viewMode === 'month') {
        return monthlyData;
      } else if (viewMode === 'week') {
        return aggregateDataByWeek(dailyData);
      } else {
        // 日视图 - 直接返回每日数据
        return dailyData;
      }
    }
    
    if (viewMode === 'month') {
      return filteredMonthlyData;
    } else if (viewMode === 'week') {
      // 周视图 - 按自然周聚合数据
      return aggregateDataByWeek(filteredDailyData);
    } else {
      // 日视图 - 直接返回过滤后的每日数据
      return filteredDailyData;
    }
  }, [viewMode, filteredMonthlyData, filteredDailyData, dataTimeQuick, monthlyData, dailyData]);

  // 合计数据计算（基于展示的数据）
  const totalMetrics = displayData.reduce((acc, m) => {
    // 判断数据是否有 metrics 属性
    const data = 'metrics' in m ? m.metrics : m;
    return {
      totalOrders: acc.totalOrders + data.totalOrders,
      fakeOrders: acc.fakeOrders + data.fakeOrders,
      refundCount: acc.refundCount + data.refundCount,
      unverifiedCount: acc.unverifiedCount + data.unverifiedCount,
      verifyCount: acc.verifyCount + data.verifyCount,
      fakeVerifyCount: acc.fakeVerifyCount + data.fakeVerifyCount,
      totalAmount: acc.totalAmount + data.totalAmount,
      fakeAmount: acc.fakeAmount + data.fakeAmount,
      refundAmount: acc.refundAmount + data.refundAmount,
      unverifiedAmount: acc.unverifiedAmount + data.unverifiedAmount,
      verifyAmount: acc.verifyAmount + data.verifyAmount,
      fakeVerifyAmount: acc.fakeVerifyAmount + data.fakeVerifyAmount,
      validOrders: acc.validOrders + data.validOrders,
      validOrderAmount: acc.validOrderAmount + data.validOrderAmount,
      validVerifyCount: acc.validVerifyCount + data.validVerifyCount,
      validVerifyAmount: acc.validVerifyAmount + data.validVerifyAmount,
      adSpend: acc.adSpend + data.adSpend,
    };
  }, {
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
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1 }}>
            <div>
              <div style={{ fontSize: '16px', color: '#1d2129', fontWeight: 600, marginBottom: '6px' }}>
                所有门店合计数据
              </div>
              {(dataTimeStart || dataTimeEnd) && (
                <div style={{ fontSize: '12px', color: '#86909c' }}>
                  筛选范围：{dataTimeStart || '不限'} 至 {dataTimeEnd || '不限'}
                </div>
              )}
            </div>

            {/* 视图切换按钮 */}
            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                onClick={() => {
                  setViewMode('month');
                  if (onTimeChange) {
                    onTimeChange('', '', 'all');
                  }
                }}
                style={{
                  padding: '4px 12px',
                  borderRadius: '4px',
                  border: '1px solid #e5e6eb',
                  background: viewMode === 'month' ? '#165dff' : '#fff',
                  color: viewMode === 'month' ? '#fff' : '#4e5969',
                  fontSize: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  if (viewMode !== 'month') {
                    e.currentTarget.style.background = '#f2f3f5';
                  }
                }}
                onMouseLeave={(e) => {
                  if (viewMode !== 'month') {
                    e.currentTarget.style.background = '#fff';
                  }
                }}
              >
                月周日
              </button>
              <button
                onClick={() => {
                  setViewMode('week');
                  if (onTimeChange) {
                    onTimeChange('', '', 'thisMonth');
                  }
                }}
                style={{
                  padding: '4px 12px',
                  borderRadius: '4px',
                  border: '1px solid #e5e6eb',
                  background: viewMode === 'week' ? '#165dff' : '#fff',
                  color: viewMode === 'week' ? '#fff' : '#4e5969',
                  fontSize: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  if (viewMode !== 'week') {
                    e.currentTarget.style.background = '#f2f3f5';
                  }
                }}
                onMouseLeave={(e) => {
                  if (viewMode !== 'week') {
                    e.currentTarget.style.background = '#fff';
                  }
                }}
              >
                周
              </button>
              <button
                onClick={() => {
                  setViewMode('day');
                  if (onTimeChange) {
                    onTimeChange('', '', 'today');
                  }
                }}
                style={{
                  padding: '4px 12px',
                  borderRadius: '4px',
                  border: '1px solid #e5e6eb',
                  background: viewMode === 'day' ? '#165dff' : '#fff',
                  color: viewMode === 'day' ? '#fff' : '#4e5969',
                  fontSize: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  if (viewMode !== 'day') {
                    e.currentTarget.style.background = '#f2f3f5';
                  }
                }}
                onMouseLeave={(e) => {
                  if (viewMode !== 'day') {
                    e.currentTarget.style.background = '#fff';
                  }
                }}
              >
                日
              </button>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
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
        </div>

        {/* 内容区域 */}
        <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
          <div style={{
            background: '#fff',
            borderRadius: '6px',
            padding: '16px',
            boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
            display: 'flex',
            flexDirection: 'column',
            height: '100%'
          }}>
            {/* SABCC 五个维度选择 */}
            <div style={{ flexShrink: 0, marginBottom: '12px', paddingBottom: '12px', borderBottom: '1px solid #f2f3f5' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '11px', color: '#86909c', whiteSpace: 'nowrap' }}>门店等级</span>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => onTagLevelChange('all')}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '4px',
                      border: '1px solid #e5e6eb',
                      background: selectedTagLevel === 'all' ? '#165dff' : '#fff',
                      color: selectedTagLevel === 'all' ? '#fff' : '#4e5969',
                      fontSize: '11px',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      if (selectedTagLevel !== 'all') {
                        e.currentTarget.style.background = '#f2f3f5';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (selectedTagLevel !== 'all') {
                        e.currentTarget.style.background = '#fff';
                      }
                    }}
                  >
                    全部 ({tagLevelCounts.all})
                  </button>
                  <button
                    onClick={() => onTagLevelChange('S')}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '4px',
                      border: '1px solid #e5e6eb',
                      background: selectedTagLevel === 'S' ? '#165dff' : '#fff',
                      color: selectedTagLevel === 'S' ? '#fff' : '#4e5969',
                      fontSize: '11px',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      if (selectedTagLevel !== 'S') {
                        e.currentTarget.style.background = '#f2f3f5';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (selectedTagLevel !== 'S') {
                        e.currentTarget.style.background = '#fff';
                      }
                    }}
                  >
                    S: 核心店 ({tagLevelCounts.S})
                  </button>
                  <button
                    onClick={() => onTagLevelChange('A')}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '4px',
                      border: '1px solid #e5e6eb',
                      background: selectedTagLevel === 'A' ? '#165dff' : '#fff',
                      color: selectedTagLevel === 'A' ? '#fff' : '#4e5969',
                      fontSize: '11px',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      if (selectedTagLevel !== 'A') {
                        e.currentTarget.style.background = '#f2f3f5';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (selectedTagLevel !== 'A') {
                        e.currentTarget.style.background = '#fff';
                      }
                    }}
                  >
                    A: 重点店 ({tagLevelCounts.A})
                  </button>
                  <button
                    onClick={() => onTagLevelChange('B')}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '4px',
                      border: '1px solid #e5e6eb',
                      background: selectedTagLevel === 'B' ? '#165dff' : '#fff',
                      color: selectedTagLevel === 'B' ? '#fff' : '#4e5969',
                      fontSize: '11px',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      if (selectedTagLevel !== 'B') {
                        e.currentTarget.style.background = '#f2f3f5';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (selectedTagLevel !== 'B') {
                        e.currentTarget.style.background = '#fff';
                      }
                    }}
                  >
                    B: 一般店 ({tagLevelCounts.B})
                  </button>
                  <button
                    onClick={() => onTagLevelChange('C')}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '4px',
                      border: '1px solid #e5e6eb',
                      background: selectedTagLevel === 'C' ? '#165dff' : '#fff',
                      color: selectedTagLevel === 'C' ? '#fff' : '#4e5969',
                      fontSize: '11px',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      if (selectedTagLevel !== 'C') {
                        e.currentTarget.style.background = '#f2f3f5';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (selectedTagLevel !== 'C') {
                        e.currentTarget.style.background = '#fff';
                      }
                    }}
                  >
                    C: 关注店 ({tagLevelCounts.C})
                  </button>
                  <button
                    onClick={() => onTagLevelChange('C-')}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '4px',
                      border: '1px solid #e5e6eb',
                      background: selectedTagLevel === 'C-' ? '#165dff' : '#fff',
                      color: selectedTagLevel === 'C-' ? '#fff' : '#4e5969',
                      fontSize: '11px',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      if (selectedTagLevel !== 'C-') {
                        e.currentTarget.style.background = '#f2f3f5';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (selectedTagLevel !== 'C-') {
                        e.currentTarget.style.background = '#fff';
                      }
                    }}
                  >
                    C-: 问题店 ({tagLevelCounts['C-']})
                  </button>
                  <button
                    onClick={() => onTagLevelChange('meili')}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '4px',
                      border: '1px solid #e5e6eb',
                      background: selectedTagLevel === 'meili' ? '#165dff' : '#fff',
                      color: selectedTagLevel === 'meili' ? '#fff' : '#4e5969',
                      fontSize: '11px',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      if (selectedTagLevel !== 'meili') {
                        e.currentTarget.style.background = '#f2f3f5';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (selectedTagLevel !== 'meili') {
                        e.currentTarget.style.background = '#fff';
                      }
                    }}
                  >
                    美丽妈妈 ({tagLevelCounts.meili})
                  </button>
                  <button
                    onClick={() => onTagLevelChange('direct')}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '4px',
                      border: '1px solid #e5e6eb',
                      background: selectedTagLevel === 'direct' ? '#165dff' : '#fff',
                      color: selectedTagLevel === 'direct' ? '#fff' : '#4e5969',
                      fontSize: '11px',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      if (selectedTagLevel !== 'direct') {
                        e.currentTarget.style.background = '#f2f3f5';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (selectedTagLevel !== 'direct') {
                        e.currentTarget.style.background = '#fff';
                      }
                    }}
                  >
                    直营店 ({tagLevelCounts.direct})
                  </button>
                  <button
                    onClick={() => onTagLevelChange('empty')}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '4px',
                      border: '1px solid #e5e6eb',
                      background: selectedTagLevel === 'empty' ? '#165dff' : '#fff',
                      color: selectedTagLevel === 'empty' ? '#fff' : '#4e5969',
                      fontSize: '11px',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      if (selectedTagLevel !== 'empty') {
                        e.currentTarget.style.background = '#f2f3f5';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (selectedTagLevel !== 'empty') {
                        e.currentTarget.style.background = '#fff';
                      }
                    }}
                  >
                    空 ({tagLevelCounts.empty})
                  </button>
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
                    onClick={() => handleTimeFilterChange('thisMonthExceptToday')}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '4px',
                      border: '1px solid #e5e6eb',
                      background: dataTimeQuick === 'thisMonthExceptToday' ? '#165dff' : '#fff',
                      color: dataTimeQuick === 'thisMonthExceptToday' ? '#fff' : '#4e5969',
                      fontSize: '11px',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      if (dataTimeQuick !== 'thisMonthExceptToday') {
                        e.currentTarget.style.background = '#f2f3f5';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (dataTimeQuick !== 'thisMonthExceptToday') {
                        e.currentTarget.style.background = '#fff';
                      }
                    }}
                  >
                    本月不含今天
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
                    两个月前
                  </button>
                  <button
                    onClick={() => handleTimeFilterChange('lastThreeMonths')}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '4px',
                      border: '1px solid #e5e6eb',
                      background: dataTimeQuick === 'lastThreeMonths' ? '#165dff' : '#fff',
                      color: dataTimeQuick === 'lastThreeMonths' ? '#fff' : '#4e5969',
                      fontSize: '11px',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      if (dataTimeQuick !== 'lastThreeMonths') {
                        e.currentTarget.style.background = '#f2f3f5';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (dataTimeQuick !== 'lastThreeMonths') {
                        e.currentTarget.style.background = '#fff';
                      }
                    }}
                  >
                    近三个月
                  </button>
                  <button
                    onClick={() => handleTimeFilterChange('lastThreeMonthsIncludingThisMonth')}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '4px',
                      border: '1px solid #e5e6eb',
                      background: dataTimeQuick === 'lastThreeMonthsIncludingThisMonth' ? '#165dff' : '#fff',
                      color: dataTimeQuick === 'lastThreeMonthsIncludingThisMonth' ? '#fff' : '#4e5969',
                      fontSize: '11px',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      if (dataTimeQuick !== 'lastThreeMonthsIncludingThisMonth') {
                        e.currentTarget.style.background = '#f2f3f5';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (dataTimeQuick !== 'lastThreeMonthsIncludingThisMonth') {
                        e.currentTarget.style.background = '#fff';
                      }
                    }}
                  >
                    近三月含本月
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
                  <col style={{ width: '80px' }} />
                  <col style={{ width: '100px' }} />
                  <col style={{ width: '100px' }} />
                  <col style={{ width: '100px' }} />
                  <col style={{ width: '100px' }} />
                  <col style={{ width: '80px' }} />
                </colgroup>
                <thead>
                  <tr style={{ background: '#f7f8fa' }}>
                    <th style={{ padding: '12px 8px', textAlign: 'left', borderBottom: '2px solid #e5e6eb', color: '#4e5969', fontWeight: 500 }}>日期</th>
                    <th style={{ padding: '12px 8px', textAlign: 'right', borderBottom: '2px solid #e5e6eb', color: '#4e5969', fontWeight: 500 }}>广告费</th>
                    <th style={{ padding: '12px 8px', textAlign: 'right', borderBottom: '2px solid #e5e6eb', color: '#4e5969', fontWeight: 500 }}>总单数</th>
                    <th style={{ padding: '12px 8px', textAlign: 'right', borderBottom: '2px solid #e5e6eb', color: '#4e5969', fontWeight: 500 }}>刷单数</th>
                    <th style={{ padding: '12px 8px', textAlign: 'right', borderBottom: '2px solid #e5e6eb', color: '#4e5969', fontWeight: 500 }}>未核销</th>
                    <th style={{ padding: '12px 8px', textAlign: 'right', borderBottom: '2px solid #e5e6eb', color: '#4e5969', fontWeight: 500 }}>核销数</th>
                    <th style={{ padding: '12px 8px', textAlign: 'right', borderBottom: '2px solid #e5e6eb', color: '#4e5969', fontWeight: 500 }}>有效单数</th>
                    <th style={{ padding: '12px 8px', textAlign: 'right', borderBottom: '2px solid #e5e6eb', color: '#4e5969', fontWeight: 500 }}>有效成本</th>
                    <th style={{ padding: '12px 8px', textAlign: 'right', borderBottom: '2px solid #e5e6eb', color: '#4e5969', fontWeight: 500 }}>有效核销</th>
                    <th style={{ padding: '12px 8px', textAlign: 'right', borderBottom: '2px solid #e5e6eb', color: '#4e5969', fontWeight: 500 }}>核销率</th>
                    <th style={{ padding: '12px 8px', textAlign: 'right', borderBottom: '2px solid #e5e6eb', color: '#4e5969', fontWeight: 500 }}>有效核销率</th>
                    <th style={{ padding: '12px 8px', textAlign: 'right', borderBottom: '2px solid #e5e6eb', color: '#4e5969', fontWeight: 500 }}>总金额</th>
                    <th style={{ padding: '12px 8px', textAlign: 'right', borderBottom: '2px solid #e5e6eb', color: '#4e5969', fontWeight: 500 }}>刷单金额</th>
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
                  <col style={{ width: '80px' }} />
                  <col style={{ width: '100px' }} />
                  <col style={{ width: '100px' }} />
                  <col style={{ width: '100px' }} />
                  <col style={{ width: '100px' }} />
                  <col style={{ width: '80px' }} />
                </colgroup>
                <tbody>
                  <tr style={{ background: '#f7f8fa', fontWeight: 600, borderBottom: '2px solid #e5e6eb' }}>
                    <td style={{ padding: '12px 8px', color: '#4e5969', fontWeight: 600 }}>
                      {dataTimeQuick === 'all' ? '合计' : `${dataTimeQuick}合计`}
                    </td>
                    <td style={{ padding: '12px 8px', textAlign: 'right' }}>¥{totalMetrics.adSpend.toFixed(2)}</td>
                    <td style={{ padding: '12px 8px', textAlign: 'right' }}>{totalMetrics.totalOrders}</td>
                    <td style={{ padding: '12px 8px', textAlign: 'right' }}>{totalMetrics.fakeOrders}</td>
                    <td style={{ padding: '12px 8px', textAlign: 'right' }}>{totalMetrics.unverifiedCount}</td>
                    <td style={{ padding: '12px 8px', textAlign: 'right' }}>{totalMetrics.verifyCount}</td>
                    <td style={{ padding: '12px 8px', textAlign: 'right', color: '#f53f3f' }}>{totalMetrics.validOrders}</td>
                    <td style={{ padding: '12px 8px', textAlign: 'right', color: '#1d2129' }}>¥{totalMetrics.validOrders > 0 ? (totalMetrics.adSpend / totalMetrics.validOrders).toFixed(2) : '-'}</td>
                    <td style={{ padding: '12px 8px', textAlign: 'right', color: '#f53f3f' }}>{totalMetrics.validVerifyCount}</td>
                    <td style={{ padding: '12px 8px', textAlign: 'right' }}>{verifyRate}%</td>
                    <td style={{ padding: '12px 8px', textAlign: 'right', color: '#f53f3f' }}>{validVerifyRate}%</td>
                    <td style={{ padding: '12px 8px', textAlign: 'right' }}>¥{totalMetrics.totalAmount.toFixed(2)}</td>
                    <td style={{ padding: '12px 8px', textAlign: 'right' }}>¥{totalMetrics.fakeAmount.toFixed(2)}</td>
                    <td style={{ padding: '12px 8px', textAlign: 'right' }}>¥{totalMetrics.unverifiedAmount.toFixed(2)}</td>
                    <td style={{ padding: '12px 8px', textAlign: 'right' }}>¥{totalMetrics.verifyAmount.toFixed(2)}</td>
                    <td style={{ padding: '12px 8px', textAlign: 'right', color: '#f53f3f' }}>{amountVerifyRate}%</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* 表格内容 - 可滚动 */}
            <div style={{ flex: 1, overflow: 'auto' }}>
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
                  <col style={{ width: '80px' }} />
                  <col style={{ width: '100px' }} />
                  <col style={{ width: '100px' }} />
                  <col style={{ width: '100px' }} />
                  <col style={{ width: '100px' }} />
                  <col style={{ width: '80px' }} />
                </colgroup>
                <tbody>
                  {viewMode === 'month' ? (
                    displayData.map((monthData, monthIdx) => {
                      const monthKey = `${monthData.year}-${String(monthData.month).padStart(2, '0')}`;
                      const isMonthExpanded = expandedMonths.has(monthKey);

                      // 生成周数据
                      const weeklyData = generateWeeklyDataForMonth(filteredDailyData, monthData.year, monthData.month);

                      return (
                        <React.Fragment key={monthIdx}>
                          {/* 月级行 */}
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
                              <span style={{ color: '#165dff', fontWeight: 600 }}>{monthData.label}</span>
                            </div>
                          </td>
                          <td style={{ padding: '12px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#165dff' }}>¥{monthData.metrics.adSpend.toFixed(2)}</td>
                          <td style={{ padding: '12px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#165dff' }}>{monthData.metrics.totalOrders}</td>
                          <td style={{ padding: '12px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#165dff' }}>{monthData.metrics.fakeOrders}</td>
                          <td style={{ padding: '12px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#165dff' }}>{monthData.metrics.unverifiedCount}</td>
                          <td style={{ padding: '12px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#165dff' }}>{monthData.metrics.verifyCount}</td>
                          <td style={{ padding: '12px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#f53f3f' }}>{monthData.metrics.validOrders}</td>
                          <td style={{ padding: '12px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#165dff' }}>¥{monthData.metrics.validOrders > 0 ? (monthData.metrics.adSpend / monthData.metrics.validOrders).toFixed(2) : '-'}</td>
                          <td style={{ padding: '12px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#f53f3f' }}>{monthData.metrics.validVerifyCount}</td>
                          <td style={{ padding: '12px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#165dff' }}>{monthData.metrics.verifyRate.toFixed(2)}%</td>
                          <td style={{ padding: '12px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#f53f3f' }}>{monthData.metrics.validVerifyRate.toFixed(2)}%</td>
                          <td style={{ padding: '12px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#165dff' }}>¥{monthData.metrics.totalAmount.toFixed(2)}</td>
                          <td style={{ padding: '12px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#165dff' }}>¥{monthData.metrics.fakeAmount.toFixed(2)}</td>
                          <td style={{ padding: '12px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#165dff' }}>¥{monthData.metrics.unverifiedAmount.toFixed(2)}</td>
                          <td style={{ padding: '12px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#165dff' }}>¥{monthData.metrics.verifyAmount.toFixed(2)}</td>
                          <td style={{ padding: '12px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#f53f3f' }}>{monthData.metrics.amountVerifyRate.toFixed(2)}%</td>
                        </tr>

                        {/* 周数据 - 跟随月份展开/折叠 */}
                        {isMonthExpanded && weeklyData.map((week, weekIdx) => {
                          const isWeekExpanded = expandedWeeks.has(week.weekNumber === 0 ? week.weekKey : `${week.year}-${String(week.month).padStart(2, '0')}-W${week.weekNumber}`);

                          if (week.weekNumber === 0) {
                            // 按天显示的数据（当前进行中的周的天）
                            return week.days?.map((day, dayIdx) => (
                              <tr
                                key={`${week.weekKey}-${dayIdx}`}
                                style={{
                                  background: day.date === highlightDate ? '#fff7e6' : '#fafbfc',
                                  fontWeight: day.date === highlightDate ? 600 : 'normal'
                                }}
                              >
                                <td style={{ padding: '10px 8px 10px 48px', textAlign: 'left', borderBottom: '1px solid #f2f3f5', color: '#86909c' }}>{day.date}</td>
                                <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: '#1d2129', fontSize: '10px' }}>¥{day.adSpend.toFixed(2)}</td>
                                <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: '#1d2129', fontSize: '10px' }}>{day.totalOrders}</td>
                                <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: '#1d2129', fontSize: '10px' }}>{day.fakeOrders}</td>
                                <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: '#1d2129', fontSize: '10px' }}>{day.refundCount}</td>
                                <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: '#1d2129', fontSize: '10px' }}>{day.unverifiedCount}</td>
                                <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: '#1d2129', fontSize: '10px' }}>{day.verifyCount}</td>
                                <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: '#f53f3f', fontSize: '10px' }}>{day.validOrders}</td>
                                <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: '#f53f3f', fontSize: '10px' }}>{day.validVerifyCount}</td>
                                <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: '#1d2129', fontSize: '10px' }}>{day.verifyRate.toFixed(2)}%</td>
                                <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: '#f53f3f', fontSize: '10px' }}>{day.validVerifyRate.toFixed(2)}%</td>
                                <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: '#1d2129', fontSize: '10px' }}>¥{day.totalAmount.toFixed(2)}</td>
                                <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: '#1d2129', fontSize: '10px' }}>¥{day.fakeAmount.toFixed(2)}</td>
                                <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: '#1d2129', fontSize: '10px' }}>¥{day.refundAmount.toFixed(2)}</td>
                                <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: '#1d2129', fontSize: '10px' }}>¥{day.unverifiedAmount.toFixed(2)}</td>
                                <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: '#1d2129', fontSize: '10px' }}>¥{day.verifyAmount.toFixed(2)}</td>
                                <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: '#f53f3f', fontSize: '10px' }}>{day.amountVerifyRate.toFixed(2)}%</td>
                              </tr>
                            ));
                          }

                          // 正常周数据 - 保持下拉/展开结构
                          const weekBgColor = week.isCrossMonth ? '#fafafa' : (highlightDate >= week.startDate && highlightDate <= week.endDate ? '#e8f3ff' : '#fff');

                          return (
                            <React.Fragment key={weekIdx}>
                              {/* 周行 */}
                              <tr
                                onClick={() => toggleWeek(`${week.year}-${String(week.month).padStart(2, '0')}-W${week.weekNumber}`)}
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
                                <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#165dff', fontSize: '10px' }}>¥{week.metrics.adSpend.toFixed(2)}</td>
                                <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#165dff', fontSize: '10px' }}>{week.metrics.totalOrders}</td>
                                <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#165dff', fontSize: '10px' }}>{week.metrics.fakeOrders}</td>
                                <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#165dff', fontSize: '10px' }}>{week.metrics.unverifiedCount}</td>
                                <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#165dff', fontSize: '10px' }}>{week.metrics.verifyCount}</td>
                                <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#f53f3f', fontSize: '10px' }}>{week.metrics.validOrders}</td>
                                <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#165dff', fontSize: '10px' }}>¥{week.metrics.validOrders > 0 ? (week.metrics.adSpend / week.metrics.validOrders).toFixed(2) : '-'}</td>
                                <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#f53f3f', fontSize: '10px' }}>{week.metrics.validVerifyCount}</td>
                                <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#165dff', fontSize: '10px' }}>{week.metrics.verifyRate}%</td>
                                <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#f53f3f', fontSize: '10px' }}>{week.metrics.validVerifyRate}%</td>
                                <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#165dff', fontSize: '10px' }}>¥{week.metrics.totalAmount.toFixed(2)}</td>
                                <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#165dff', fontSize: '10px' }}>¥{week.metrics.fakeAmount.toFixed(2)}</td>
                                <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#165dff', fontSize: '10px' }}>¥{week.metrics.unverifiedAmount.toFixed(2)}</td>
                                <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#165dff', fontSize: '10px' }}>¥{week.metrics.verifyAmount.toFixed(2)}</td>
                                <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#f53f3f', fontSize: '10px' }}>{week.metrics.amountVerifyRate}%</td>
                              </tr>

                              {/* 日数据 - 跟随周展开/折叠 */}
                              {isWeekExpanded && week.days?.map((day, dayIdx) => (
                                <tr
                                  key={dayIdx}
                                  style={{
                                    background: day.date === highlightDate ? '#fff7e6' : '#fafbfc',
                                    fontWeight: day.date === highlightDate ? 600 : 'normal'
                                  }}
                                >
                                  <td style={{ padding: '10px 8px 10px 48px', textAlign: 'left', borderBottom: '1px solid #f2f3f5', color: '#86909c' }}>{day.date}</td>
                                  <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: '#1d2129', fontSize: '10px' }}>¥{day.adSpend.toFixed(2)}</td>
                                  <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: '#1d2129', fontSize: '10px' }}>{day.totalOrders}</td>
                                  <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: '#1d2129', fontSize: '10px' }}>{day.fakeOrders}</td>
                                  <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: '#1d2129', fontSize: '10px' }}>{day.unverifiedCount}</td>
                                  <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: '#1d2129', fontSize: '10px' }}>{day.verifyCount}</td>
                                  <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: '#f53f3f', fontSize: '10px' }}>{day.validOrders}</td>
                                  <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: '#1d2129', fontSize: '10px' }}>¥{day.validOrders > 0 ? (day.adSpend / day.validOrders).toFixed(2) : '-'}</td>
                                  <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: '#f53f3f', fontSize: '10px' }}>{day.validVerifyCount}</td>
                                  <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: '#1d2129', fontSize: '10px' }}>{day.verifyRate.toFixed(2)}%</td>
                                  <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: '#f53f3f', fontSize: '10px' }}>{day.validVerifyRate.toFixed(2)}%</td>
                                  <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: '#1d2129', fontSize: '10px' }}>¥{day.totalAmount.toFixed(2)}</td>
                                  <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: '#1d2129', fontSize: '10px' }}>¥{day.fakeAmount.toFixed(2)}</td>
                                  <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: '#1d2129', fontSize: '10px' }}>¥{day.unverifiedAmount.toFixed(2)}</td>
                                  <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: '#1d2129', fontSize: '10px' }}>¥{day.verifyAmount.toFixed(2)}</td>
                                  <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #f2f3f5', color: '#f53f3f', fontSize: '10px' }}>{day.amountVerifyRate.toFixed(2)}%</td>
                                </tr>
                              ))}
                            </React.Fragment>
                          );
                        })}
                      </React.Fragment>
                    );
                  })
                  ) : viewMode === 'week' ? (
                    // 周视图
                    displayData.map((weekData, weekIdx) => (
                      <tr key={weekIdx} style={{ background: '#fff' }}>
                        <td style={{ padding: '10px 8px', borderBottom: '1px solid #e5e6eb' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <span style={{ color: '#1d2129', fontWeight: 600, fontSize: '9px' }}>{weekData.label}</span>
                            <span style={{ fontSize: '9px', color: '#86909c' }}>{weekData.dateRange}</span>
                          </div>
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#165dff' }}>
                          ¥{weekData.metrics.adSpend.toFixed(2)}
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#165dff' }}>
                          {weekData.metrics.totalOrders}
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#165dff' }}>
                          {weekData.metrics.fakeOrders}
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#165dff' }}>
                          {weekData.metrics.unverifiedCount}
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#165dff' }}>
                          {weekData.metrics.verifyCount}
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#f53f3f' }}>
                          {weekData.metrics.validOrders}
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#165dff' }}>
                          ¥{weekData.metrics.validOrders > 0 ? (weekData.metrics.adSpend / weekData.metrics.validOrders).toFixed(2) : '-'}
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#f53f3f' }}>
                          {weekData.metrics.validVerifyCount}
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#165dff' }}>
                          {weekData.metrics.verifyRate.toFixed(2)}%
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#f53f3f' }}>
                          {weekData.metrics.validVerifyRate.toFixed(2)}%
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#165dff' }}>
                          ¥{weekData.metrics.totalAmount.toFixed(2)}
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#165dff' }}>
                          ¥{weekData.metrics.fakeAmount.toFixed(2)}
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#165dff' }}>
                          ¥{weekData.metrics.unverifiedAmount.toFixed(2)}
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#165dff' }}>
                          ¥{weekData.metrics.verifyAmount.toFixed(2)}
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#f53f3f' }}>
                          {weekData.metrics.amountVerifyRate.toFixed(2)}%
                        </td>
                      </tr>
                    ))
                  ) : (
                    // 日视图 - 直接显示每天的数据
                    displayData.map((dayData, dayIdx) => (
                      <tr 
                        key={dayIdx} 
                        style={{ 
                          background: dayData.date === highlightDate ? '#fff7e6' : '#fff',
                          fontWeight: dayData.date === highlightDate ? 600 : 'normal'
                        }}
                      >
                        <td style={{ padding: '10px 8px', borderBottom: '1px solid #e5e6eb' }}>
                          <span style={{ color: '#1d2129', fontWeight: 600, fontSize: '10px' }}>{dayData.date}</span>
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#165dff' }}>
                          ¥{dayData.adSpend.toFixed(2)}
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#165dff' }}>
                          {dayData.totalOrders}
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#165dff' }}>
                          {dayData.fakeOrders}
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#165dff' }}>
                          {dayData.unverifiedCount}
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#165dff' }}>
                          {dayData.verifyCount}
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#f53f3f' }}>
                          {dayData.validOrders}
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#165dff' }}>
                          ¥{dayData.validOrders > 0 ? (dayData.adSpend / dayData.validOrders).toFixed(2) : '-'}
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#f53f3f' }}>
                          {dayData.validVerifyCount}
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#165dff' }}>
                          {dayData.verifyRate.toFixed(2)}%
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#f53f3f' }}>
                          {dayData.validVerifyRate.toFixed(2)}%
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#165dff' }}>
                          ¥{dayData.totalAmount.toFixed(2)}
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#165dff' }}>
                          ¥{dayData.fakeAmount.toFixed(2)}
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#165dff' }}>
                          ¥{dayData.unverifiedAmount.toFixed(2)}
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#165dff' }}>
                          ¥{dayData.verifyAmount.toFixed(2)}
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid #e5e6eb', color: '#f53f3f' }}>
                          {dayData.amountVerifyRate.toFixed(2)}%
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>

              {displayData.length === 0 && (
                <div style={{ textAlign: 'center', padding: '40px', color: '#86909c' }}>
                  暂无数据
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// 操作日志弹窗组件
function OperationLogsModal({ 
  onClose, 
  currentSystem 
}: { 
  onClose: () => void;
  currentSystem: StoreSystem;
}) {
  const [logs, setLogs] = useState<OperationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({
    operation_type: '',
    resource_type: '',
  });
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 50,
    total: 0,
    totalPages: 0,
  });

  const fetchLogs = async (page = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        store_system: currentSystem,
        page: String(page),
        page_size: String(pagination.pageSize),
      });
      if (filter.operation_type) {
        params.set('operation_type', filter.operation_type);
      }
      if (filter.resource_type) {
        params.set('resource_type', filter.resource_type);
      }

      const res = await fetch(`/api/operation-logs?${params}`);
      const data = await res.json();
      if (data.success) {
        setLogs(data.data);
        setPagination(prev => ({ ...prev, ...data.pagination }));
      }
    } catch (error) {
      console.error('获取操作日志失败:', error);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchLogs(1);
  }, [currentSystem, filter]);

  // 操作类型映射
  const operationTypeMap: Record<string, string> = {
    create: '创建',
    update: '更新',
    delete: '删除',
    import: '导入',
    login: '登录',
  };

  // 资源类型映射
  const resourceTypeMap: Record<string, string> = {
    store: '门店',
    contact: '联系人',
    follow_record: '跟进记录',
    robot_config: '机器人配置',
    tag: '标签',
  };

  // 格式化时间
  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    return `${month}-${day} ${hour}:${minute}`;
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ width: '900px', maxWidth: '95vw' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">操作日志</h3>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', color: '#86909c' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        {/* 筛选器 */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #f2f3f5', display: 'flex', gap: '12px' }}>
          <select
            value={filter.operation_type}
            onChange={(e) => setFilter(prev => ({ ...prev, operation_type: e.target.value }))}
            style={{ padding: '6px 12px', borderRadius: '4px', border: '1px solid #e5e6eb', fontSize: '13px' }}
          >
            <option value="">全部操作</option>
            {Object.entries(operationTypeMap).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          <select
            value={filter.resource_type}
            onChange={(e) => setFilter(prev => ({ ...prev, resource_type: e.target.value }))}
            style={{ padding: '6px 12px', borderRadius: '4px', border: '1px solid #e5e6eb', fontSize: '13px' }}
          >
            <option value="">全部资源</option>
            {Object.entries(resourceTypeMap).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>

        <div className="modal-body" style={{ padding: 0, maxHeight: '60vh', overflowY: 'auto' }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px' }}>
              <div className="loading-spinner"></div>
            </div>
          ) : logs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px', color: '#86909c' }}>暂无操作日志</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ background: '#f7f8fa', position: 'sticky', top: 0 }}>
                <tr>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: '12px', color: '#86909c', fontWeight: '500' }}>时间</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: '12px', color: '#86909c', fontWeight: '500' }}>操作人</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: '12px', color: '#86909c', fontWeight: '500' }}>操作</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: '12px', color: '#86909c', fontWeight: '500' }}>资源</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: '12px', color: '#86909c', fontWeight: '500' }}>详情</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} style={{ borderBottom: '1px solid #f2f3f5' }}>
                    <td style={{ padding: '10px 12px', fontSize: '12px', color: '#4e5969', whiteSpace: 'nowrap' }}>
                      {formatTime(log.created_at)}
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: '13px' }}>
                      {log.user_name || log.user_id}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        background: log.operation_type === 'delete' ? '#ffece8' : log.operation_type === 'create' ? '#e8ffea' : '#f2f3f5',
                        color: log.operation_type === 'delete' ? '#f53f3f' : log.operation_type === 'create' ? '#00b42a' : '#4e5969',
                      }}>
                        {operationTypeMap[log.operation_type] || log.operation_type}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: '13px' }}>
                      <span style={{ color: '#86909c', marginRight: '4px' }}>{resourceTypeMap[log.resource_type] || log.resource_type}</span>
                      {log.resource_name && <span style={{ color: '#1d2129' }}>{log.resource_name}</span>}
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: '12px', color: '#86909c', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {log.detail ? JSON.parse(log.detail).summary || '-' : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* 分页 */}
        {pagination.totalPages > 1 && (
          <div style={{ padding: '12px 16px', borderTop: '1px solid #f2f3f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: '#86909c' }}>
              共 {pagination.total} 条记录
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => fetchLogs(pagination.page - 1)}
                disabled={pagination.page <= 1}
                style={{
                  padding: '4px 12px',
                  borderRadius: '4px',
                  border: '1px solid #e5e6eb',
                  background: '#fff',
                  cursor: pagination.page <= 1 ? 'not-allowed' : 'pointer',
                  opacity: pagination.page <= 1 ? 0.5 : 1,
                  fontSize: '12px',
                }}
              >
                上一页
              </button>
              <span style={{ fontSize: '12px', color: '#4e5969', lineHeight: '28px' }}>
                {pagination.page} / {pagination.totalPages}
              </span>
              <button
                onClick={() => fetchLogs(pagination.page + 1)}
                disabled={pagination.page >= pagination.totalPages}
                style={{
                  padding: '4px 12px',
                  borderRadius: '4px',
                  border: '1px solid #e5e6eb',
                  background: '#fff',
                  cursor: pagination.page >= pagination.totalPages ? 'not-allowed' : 'pointer',
                  opacity: pagination.page >= pagination.totalPages ? 0.5 : 1,
                  fontSize: '12px',
                }}
              >
                下一页
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// 门店标签管理组件 - 简化版本，使用 position: absolute
const StoreTagsCell = memo(function StoreTagsCell({ 
  store, 
  onUpdate 
}: { 
  store: Store; 
  onUpdate?: () => void;
}) {
  const [tags, setTags] = useState<StoreTag[]>([]);
  const [presets, setPresets] = useState<TagPreset[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [loadingTagId, setLoadingTagId] = useState<string | null>(null);
  const [newTagName, setNewTagName] = useState('');
  const [creatingTag, setCreatingTag] = useState(false);
  const [editingAttachDate, setEditingAttachDate] = useState(false);
  const [attachDateValue, setAttachDateValue] = useState('');
  const [loadingAttachDate, setLoadingAttachDate] = useState(false);

  // 使用 ref 存储 store.id，避免闭包问题
  const storeIdRef = useRef(store.id);
  storeIdRef.current = store.id;

  // 同步 tags 与 store.store_tags
  useEffect(() => {
    setTags(store.store_tags || []);
  }, [store.id, JSON.stringify(store.store_tags)]);

  // 获取标签预设
  useEffect(() => {
    if (!showModal) return;
    const fetchTags = async () => {
      try {
        const [tagsRes, presetsRes] = await Promise.all([
          fetch(`/api/store-tags?store_id=${store.id}`),
          fetch('/api/tag-presets'),
        ]);
        if (tagsRes.ok && presetsRes.ok) {
          const [tagsData, presetsData] = await Promise.all([tagsRes.json(), presetsRes.json()]);
          if (tagsData.data) setTags(tagsData.data);
          if (presetsData.data) setPresets(presetsData.data);
        }
      } catch (error) { /* 静默 */ }
    };
    fetchTags();
  }, [store.id, showModal]);

  // 创建自定义标签并添加到门店
  const handleCreateCustomTag = async () => {
    const tagName = newTagName.trim();
    if (!tagName || creatingTag) return;

    const currentStoreId = storeIdRef.current;
    setCreatingTag(true);
    
    try {
      // 随机生成一个颜色
      const colors = ['#165dff', '#ff7d00', '#00b42a', '#f53f3f', '#722ed1', '#eb2f96', '#13c2c2', '#faad14'];
      const tagColor = colors[Math.floor(Math.random() * colors.length)];
      
      // 先创建标签预设
      const presetRes = await fetch('/api/tag-presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag_name: tagName, tag_color: tagColor }),
      });
      
      if (presetRes.ok) {
        const presetData = await presetRes.json();
        if (presetData.data) {
          setPresets(prev => [...prev, presetData.data]);
        }
      }
      
      // 再添加到门店
      const res = await fetch('/api/store-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_id: currentStoreId, tag_name: tagName, tag_color: tagColor }),
      });
      
      if (res.ok) {
        const data = await res.json();
        if (data.data) {
          setTags(prev => [...prev, data.data]);
          onUpdate?.();
          setNewTagName('');
        }
      }
    } catch (error) { /* 静默 */ }
    setCreatingTag(false);
  };

  // 添加或删除标签
  const handleToggleTag = async (tagName: string, tagColor: string) => {
    const currentStoreId = storeIdRef.current;
    const existingTag = tags.find(t => t.tag_name === tagName);
    
    if (existingTag) {
      setLoadingTagId(existingTag.id);
      try {
        const res = await fetch(`/api/store-tags?id=${existingTag.id}`, { method: 'DELETE' });
        if (res.ok) {
          setTags(prev => prev.filter(t => t.id !== existingTag.id));
          onUpdate?.();
        }
      } catch (error) { /* 静默 */ }
      setLoadingTagId(null);
    } else {
      setLoadingTagId(tagName);
      try {
        const res = await fetch('/api/store-tags', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ store_id: currentStoreId, tag_name: tagName, tag_color: tagColor }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.data) {
            setTags(prev => [...prev, data.data]);
            onUpdate?.();
          }
        }
      } catch (error) { /* 静默 */ }
      setLoadingTagId(null);
    }
  };

  const addedTagNames = tags.map(t => t.tag_name);

  // 弹窗内容
  const modalContent = showModal ? (
    <div 
      style={{ 
        position: 'fixed', 
        top: 0, 
        left: 0, 
        right: 0, 
        bottom: 0, 
        background: 'rgba(0,0,0,0.5)', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        zIndex: 99999 
      }}
      onClick={() => setShowModal(false)}
    >
      <div 
        style={{ 
          background: '#fff', 
          borderRadius: '8px', 
          width: '320px', 
          maxHeight: '400px',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #e5e6eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '14px', fontWeight: 500, color: '#1d2129' }}>
            管理标签 - {store.store_name?.slice(0, 10)}{store.store_name && store.store_name.length > 10 ? '...' : ''}
          </span>
          <svg 
            width="16" 
            height="16" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="#86909c" 
            strokeWidth="2" 
            style={{ cursor: 'pointer' }}
            onClick={() => setShowModal(false)}
          >
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </div>
        
        {/* 新建标签 */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #e5e6eb' }}>
          <div style={{ fontSize: '11px', color: '#86909c', marginBottom: '8px' }}>新建标签</div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreateCustomTag(); }}
              placeholder="输入标签名，按回车添加"
              style={{ flex: 1, height: '32px', padding: '0 12px', fontSize: '12px', border: '1px solid #e5e6eb', borderRadius: '6px', outline: 'none' }}
            />
            <button
              onClick={handleCreateCustomTag}
              disabled={!newTagName.trim() || creatingTag}
              style={{ height: '32px', padding: '0 12px', fontSize: '12px', background: newTagName.trim() ? '#165dff' : '#f2f3f5', color: newTagName.trim() ? '#fff' : '#86909c', border: 'none', borderRadius: '6px', cursor: newTagName.trim() ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap' }}
            >
              {creatingTag ? '添加中...' : '添加'}
            </button>
          </div>
        </div>
        
        {/* 当前标签 */}
        {tags.length > 0 && (
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #e5e6eb' }}>
            <div style={{ fontSize: '11px', color: '#86909c', marginBottom: '8px' }}>当前标签（点击删除）</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {tags.map(tag => {
                const isPreset = PRESET_TAG_NAMES.includes(tag.tag_name);
                const displayColor = isPreset ? tag.tag_color : CUSTOM_TAG_COLOR;
                return (
                  <span
                    key={tag.id}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '12px',
                      background: `${displayColor}15`,
                      color: displayColor,
                      border: `1px solid ${displayColor}30`,
                      cursor: loadingTagId === tag.id ? 'wait' : 'pointer'
                    }}
                    onClick={() => !loadingTagId && handleToggleTag(tag.tag_name, tag.tag_color)}
                  >
                    {loadingTagId === tag.id ? (
                      <svg width="12" height="12" viewBox="0 0 24 24" style={{ animation: 'spin 1s linear infinite' }}>
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" strokeDasharray="31.4 31.4" />
                      </svg>
                    ) : (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                      </svg>
                    )}
                    {tag.tag_name}
                  </span>
                );
              })}
            </div>
          </div>
        )}
        
        {/* 预设标签 */}
        <div style={{ padding: '12px 16px', flex: 1, overflowY: 'auto' }}>
          <div style={{ fontSize: '11px', color: '#86909c', marginBottom: '8px' }}>选择预设标签（点击添加/移除）</div>
          {presets.filter(p => !addedTagNames.includes(p.tag_name)).length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {presets.filter(p => !addedTagNames.includes(p.tag_name)).map(preset => {
                const isLoading = loadingTagId === preset.tag_name;
                return (
                  <span 
                    key={preset.id} 
                    style={{ 
                      display: 'inline-flex', 
                      alignItems: 'center', 
                      gap: '4px', 
                      padding: '4px 8px', 
                      borderRadius: '4px', 
                      fontSize: '12px', 
                      background: '#f2f3f5', 
                      color: '#4e5969', 
                      border: '1px solid #e5e6eb',
                      cursor: isLoading ? 'wait' : 'pointer'
                    }}
                    onClick={() => !isLoading && handleToggleTag(preset.tag_name, preset.tag_color)}
                  >
                    {isLoading ? (
                      <svg width="12" height="12" viewBox="0 0 24 24" style={{ animation: 'spin 1s linear infinite' }}>
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" strokeDasharray="31.4 31.4" />
                      </svg>
                    ) : (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                      </svg>
                    )}
                    {preset.tag_name}
                  </span>
                );
              })}
            </div>
          ) : (
            <div style={{ textAlign: 'center', color: '#86909c', fontSize: '12px', padding: '20px 0' }}>所有预设标签已添加</div>
          )}
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
        {tags.map(tag => {
          const isPreset = PRESET_TAG_NAMES.includes(tag.tag_name);
          const displayColor = isPreset ? tag.tag_color : CUSTOM_TAG_COLOR;
          return (
            <span key={tag.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', background: `${displayColor}15`, color: displayColor, border: `1px solid ${displayColor}30` }}>
              {tag.tag_name}
            </span>
          );
        })}
        <button 
          onClick={(e) => { e.stopPropagation(); setShowModal(true); }} 
          style={{ 
            width: '20px', 
            height: '20px', 
            borderRadius: '4px', 
            border: '1px dashed #c9cdd4', 
            background: 'transparent', 
            cursor: 'pointer', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            color: '#86909c', 
            padding: 0 
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </button>
      </div>
      {typeof document !== 'undefined' && createPortal(modalContent, document.body)}
    </>
  );
});

// 城市等级映射
const CITY_TIER_MAP: Record<string, string> = {
  // 一线城市
  '北京': '一线',
  '上海': '一线',
  '广州': '一线',
  '深圳': '一线',
  // 新一线城市
  '成都': '新一线',
  '杭州': '新一线',
  '重庆': '新一线',
  '武汉': '新一线',
  '西安': '新一线',
  '咸阳': '二线',
  '宝鸡': '二线',
  '渭南': '二线',
  '延安': '二线',
  '榆林': '二线',
  '汉中': '二线',
  '安康': '二线',
  '商洛': '二线',
  '铜川': '二线',
  '苏州': '新一线',
  '天津': '新一线',
  '南京': '新一线',
  '长沙': '新一线',
  '郑州': '新一线',
  '东莞': '新一线',
  '青岛': '新一线',
  '沈阳': '新一线',
  '宁波': '新一线',
  '昆明': '新一线',
  '大连': '新一线',
  '无锡': '新一线',
  '合肥': '新一线',
  '佛山': '新一线',
  // 二线城市
  '哈尔滨': '二线',
  '长春': '二线',
  '石家庄': '二线',
  '南昌': '二线',
  '贵阳': '二线',
  '南宁': '二线',
  '福州': '二线',
  '厦门': '二线',
  '泉州': '二线',
  '珠海': '二线',
  '中山': '二线',
  '惠州': '二线',
  '徐州': '二线',
  '常州': '二线',
  '南通': '二线',
  '温州': '二线',
  '金华': '二线',
  '台州': '二线',
  '绍兴': '二线',
  '嘉兴': '二线',
  '烟台': '二线',
  '潍坊': '二线',
  '临沂': '二线',
  '济宁': '二线',
  '洛阳': '二线',
  '唐山': '二线',
  '保定': '二线',
  '廊坊': '二线',
  '邯郸': '二线',
  '秦皇岛': '二线',
  '沧州': '二线',
  '德州': '二线',
  '威海': '二线',
  '镇江': '二线',
  '扬州': '二线',
  '盐城': '二线',
  '淮安': '二线',
  '连云港': '二线',
  '泰州': '二线',
  '宿迁': '二线',
  '湖州': '二线',
  '衢州': '二线',
  '丽水': '二线',
  '舟山': '二线',
  '漳州': '二线',
  '龙岩': '二线',
  '三明': '二线',
  '莆田': '二线',
  '宁德': '二线',
  '汕头': '二线',
  '湛江': '二线',
  '肇庆': '二线',
  '江门': '二线',
  '茂名': '二线',
  '梅州': '二线',
  '清远': '二线',
  '揭阳': '二线',
  '阳江': '二线',
  '潮州': '二线',
  '河源': '二线',
  '韶关': '二线',
  '汕尾': '二线',
  '云浮': '二线',
  '柳州': '二线',
  '桂林': '二线',
  '梧州': '二线',
  '北海': '二线',
  '钦州': '二线',
  '贵港': '二线',
  '玉林': '二线',
  '百色': '二线',
  '贺州': '二线',
  '河池': '二线',
  '来宾': '二线',
  '崇左': '二线',
  '三亚': '二线',
  '海口': '二线',
  '绵阳': '二线',
  '德阳': '二线',
  '南充': '二线',
  '宜宾': '二线',
  '泸州': '二线',
  '达州': '二线',
  '乐山': '二线',
  '内江': '二线',
  '自贡': '二线',
  '遂宁': '二线',
  '眉山': '二线',
  '广安': '二线',
  '资阳': '二线',
  '攀枝花': '二线',
  '雅安': '二线',
  '遵义': '二线',
  '安顺': '二线',
  '黔南': '二线',
  '黔东南': '二线',
  '黔西南': '二线',
  '六盘水': '二线',
  '曲靖': '二线',
  '玉溪': '二线',
  '大理': '二线',
  '红河': '二线',
  '文山': '二线',
  '楚雄': '二线',
  '普洱': '二线',
  '保山': '二线',
  '西双版纳': '二线',
  '昭通': '二线',
  '丽江': '二线',
  '临沧': '二线',
  '迪庆': '二线',
  '德宏': '二线',
  '怒江': '二线',
  '兰州': '二线',
  '天水': '二线',
  '白银': '二线',
  '定西': '二线',
  '陇南': '二线',
  '平凉': '二线',
  '庆阳': '二线',
  '张掖': '二线',
  '酒泉': '二线',
  '嘉峪关': '二线',
  '武威': '二线',
  '金昌': '二线',
  '临夏': '二线',
  '甘南': '二线',
  '西宁': '二线',
  '海东': '二线',
  '海南': '二线',
  '海西': '二线',
  '海北': '二线',
  '黄南': '二线',
  '果洛': '二线',
  '玉树': '二线',
  '银川': '二线',
  '石嘴山': '二线',
  '吴忠': '二线',
  '固原': '二线',
  '中卫': '二线',
  '乌鲁木齐': '二线',
  '克拉玛依': '二线',
  '吐鲁番': '二线',
  '哈密': '二线',
  '昌吉': '二线',
  '博尔塔拉': '二线',
  '巴音郭楞': '二线',
  '阿克苏': '二线',
  '克孜勒苏': '二线',
  '喀什': '二线',
  '和田': '二线',
  '伊犁': '二线',
  '塔城': '二线',
  '阿勒泰': '二线',
  '石河子': '二线',
  '阿拉尔': '二线',
  '图木舒克': '二线',
  '五家渠': '二线',
  '北屯': '二线',
  '铁门关': '二线',
  '双河': '二线',
  '可克达拉': '二线',
  '昆玉': '二线',
  '拉萨': '二线',
  '日喀则': '二线',
  '林芝': '二线',
  '昌都': '二线',
  '那曲': '二线',
  '山南': '二线',
  '阿里': '二线',
  '呼和浩特': '二线',
  '包头': '二线',
  '鄂尔多斯': '二线',
  '乌海': '二线',
  '赤峰': '二线',
  '通辽': '二线',
  '呼伦贝尔': '二线',
  '巴彦淖尔': '二线',
  '乌兰察布': '二线',
  '兴安': '二线',
  '锡林郭勒': '二线',
  '阿拉善': '二线',
  '开封': '二线',
  '新乡': '二线',
  '焦作': '二线',
  '濮阳': '二线',
  '许昌': '二线',
  '漯河': '二线',
  '三门峡': '二线',
  '南阳': '二线',
  '商丘': '二线',
  '信阳': '二线',
  '周口': '二线',
  '驻马店': '二线',
  '平顶山': '二线',
  '鹤壁': '二线',
  '安阳': '二线',
  '济源': '二线',
  '襄阳': '二线',
  '宜昌': '二线',
  '黄石': '二线',
  '十堰': '二线',
  '荆州': '二线',
  '荆门': '二线',
  '孝感': '二线',
  '黄冈': '二线',
  '咸宁': '二线',
  '随州': '二线',
  '恩施': '二线',
  '仙桃': '二线',
  '潜江': '二线',
  '天门': '二线',
  '神农架': '二线',
  '株洲': '二线',
  '湘潭': '二线',
  '衡阳': '二线',
  '岳阳': '二线',
  '常德': '二线',
  '张家界': '二线',
  '益阳': '二线',
  '郴州': '二线',
  '永州': '二线',
  '怀化': '二线',
  '娄底': '二线',
  '邵阳': '二线',
  '湘西': '二线',
  '九江': '二线',
  '上饶': '二线',
  '赣州': '二线',
  '吉安': '二线',
  '宜春': '二线',
  '抚州': '二线',
  '景德镇': '二线',
  '萍乡': '二线',
  '新余': '二线',
  '鹰潭': '二线',
  '芜湖': '二线',
  '蚌埠': '二线',
  '淮南': '二线',
  '马鞍山': '二线',
  '淮北': '二线',
  '铜陵': '二线',
  '安庆': '二线',
  '黄山': '二线',
  '滁州': '二线',
  '阜阳': '二线',
  '宿州': '二线',
  '六安': '二线',
  '亳州': '二线',
  '池州': '二线',
  '宣城': '二线',
  '太原': '二线',
  '大同': '二线',
  '阳泉': '二线',
  '长治': '二线',
  '晋城': '二线',
  '朔州': '二线',
  '晋中': '二线',
  '运城': '二线',
  '忻州': '二线',
  '临汾': '二线',
  '吕梁': '二线',
  '吉林': '二线',
  '四平': '二线',
  '辽源': '二线',
  '通化': '二线',
  '白山': '二线',
  '松原': '二线',
  '白城': '二线',
  '延边': '二线',
  '齐齐哈尔': '二线',
  '鸡西': '二线',
  '鹤岗': '二线',
  '双鸭山': '二线',
  '大庆': '二线',
  '伊春': '二线',
  '佳木斯': '二线',
  '七台河': '二线',
  '牡丹江': '二线',
  '黑河': '二线',
  '绥化': '二线',
  '大兴安岭': '二线',
};

// 可编辑单元格组件 - 局部状态，避免全局状态导致性能问题
interface EditableCellProps {
  value: string | null | undefined;
  onSave: (newValue: string) => Promise<boolean>;
  textAlign?: 'center' | 'left';
  displayFormat?: (value: string) => string;
  inputWidth?: number;
  minWidth?: number;
  placeholder?: string;
  suffix?: string;
  multiline?: boolean;
  textareaHeight?: number;
}

const EditableCell = memo(function EditableCell({ 
  value, 
  onSave, 
  textAlign = 'center',
  displayFormat,
  inputWidth = 50,
  minWidth = 70,
  multiline = false,
  textareaHeight = 40
}: EditableCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const displayValue = useMemo(() => {
    if (displayFormat && value) {
      return displayFormat(value);
    }
    return value || '-';
  }, [value, displayFormat]);

  const startEdit = useCallback(() => {
    setInputValue(value || '');
    setIsEditing(true);
  }, [value]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSave = useCallback(async () => {
    const trimmedValue = inputValue.trim();
    if (trimmedValue === (value || '')) {
      setIsEditing(false);
      return;
    }

    setSaving(true);
    try {
      const success = await onSave(trimmedValue);
      if (success) {
        setIsEditing(false);
      }
    } catch (err) {
      // 保存失败，保持编辑状态
    } finally {
      setSaving(false);
    }
  }, [inputValue, value, onSave]);

  const handleCancel = useCallback(() => {
    setIsEditing(false);
    setInputValue(value || '');
  }, [value]);

  if (isEditing) {
    return (
      <div style={{ display: 'flex', alignItems: multiline ? 'flex-start' : 'center', justifyContent: multiline ? 'flex-start' : 'center', width: '100%', boxSizing: 'border-box' }}>
        {multiline ? (
          <textarea
            ref={inputRef as any}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                handleCancel();
              }
            }}
            disabled={saving}
            style={{ 
              width: `${inputWidth}px`, 
              height: `${textareaHeight}px`,
              lineHeight: '18px',
              border: '1px solid #165dff', 
              borderRadius: '4px', 
              padding: '4px 6px', 
              textAlign: 'left', 
              fontSize: '12px',
              background: saving ? '#f5f5f5' : '#fff',
              outline: 'none',
              resize: 'vertical',
              fontFamily: 'inherit'
            }}
          />
        ) : (
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSave();
              } else if (e.key === 'Escape') {
                handleCancel();
              }
            }}
            disabled={saving}
            style={{ 
              width: `${inputWidth}px`, 
              height: '22px',
              lineHeight: '22px',
              border: '1px solid #165dff', 
              borderRadius: '4px', 
              padding: '0 4px', 
              textAlign: textAlign, 
              fontSize: '12px',
              background: saving ? '#f5f5f5' : '#fff',
              outline: 'none'
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div
      onDoubleClick={startEdit}
      style={{ 
        cursor: 'pointer',
        padding: '0 8px',
        height: '24px',
        lineHeight: '24px',
        minWidth: `${minWidth}px`,
        textAlign,
        fontSize: '12px',
        color: '#4e5969',
        display: 'flex',
        alignItems: 'center',
        justifyContent: textAlign === 'center' ? 'center' : 'flex-start',
        width: '100%',
        boxSizing: 'border-box'
      }}
      title="双击编辑"
    >
      {displayValue}
    </div>
  );
});

// 地区单元格组件（支持编辑省份、城市、地址）
const LocationCell = memo(function LocationCell({ store, updateStore }: { 
  store: Store; 
  updateStore: (storeId: string, updates: Partial<Store>) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editProvince, setEditProvince] = useState(store.province || '');
  const [editCity, setEditCity] = useState(store.city || '');
  const [editAddress, setEditAddress] = useState(store.address || '');
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [showTooltip, setShowTooltip] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 获取所有城市列表（带省份信息）
  const allCitiesWithProvince = useMemo(() => {
    const list: { city: string; province: string; display: string }[] = [];
    Object.entries(CITIES_BY_PROVINCE).forEach(([province, cities]) => {
      cities.forEach(city => {
        list.push({ city, province, display: `${city}（${province}）` });
      });
    });
    return list;
  }, []);

  // 过滤城市（根据输入搜索）
  const filteredOptions = useMemo(() => {
    if (!searchValue) {
      // 显示当前选中的城市（如果有）
      if (editCity && editProvince) {
        const others = allCitiesWithProvince.filter(c => !(c.city === editCity && c.province === editProvince)).slice(0, 99);
        return [{ city: editCity, province: editProvince, display: `${editCity}（${editProvince}）` }, ...others];
      }
      return allCitiesWithProvince.slice(0, 100);
    }
    
    return allCitiesWithProvince.filter(c => 
      c.city.includes(searchValue) || 
      c.province.includes(searchValue) ||
      searchValue.includes(c.city.replace('市', '')) ||
      searchValue.includes(c.province.replace('省', '').replace('市', '').replace('自治区', ''))
    ).slice(0, 100);
  }, [searchValue, allCitiesWithProvince, editCity, editProvince]);

  // 点击外部关闭下拉框
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSave = async () => {
    const newProvince = editProvince.trim();
    const newCity = editCity.trim();
    const newAddress = editAddress.trim();
    
    if (newProvince === (store.province || '') && 
        newCity === (store.city || '') && 
        newAddress === (store.address || '')) {
      setIsEditing(false);
      return;
    }
    
    setLoading(true);
    try {
      const res = await fetch(`/api/stores/${store.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          province: newProvince, 
          city: newCity, 
          address: newAddress 
        }),
      });
      const data = await res.json();
      if (data.success) {
        setIsEditing(false);
        updateStore(store.id, { 
          province: newProvince, 
          city: newCity, 
          address: newAddress 
        });
      }
    } catch (error) {
      console.error('更新地区信息失败:', error);
      setEditProvince(store.province || '');
      setEditCity(store.city || '');
      setEditAddress(store.address || '');
    }
    setLoading(false);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditProvince(store.province || '');
    setEditCity(store.city || '');
    setEditAddress(store.address || '');
    setSearchValue('');
  };

  const handleSelect = (city: string, province: string) => {
    setEditCity(city);
    setEditProvince(province);
    setSearchValue('');
    setShowDropdown(false);
  };

  // 处理输入变化，自动识别省份
  const handleInputChange = (value: string) => {
    setSearchValue(value);
    
    // 自动识别：如果输入的是城市名，自动填充省份
    const parsed = parseLocation(value);
    if (parsed.province && parsed.city) {
      setEditProvince(parsed.province);
      setEditCity(parsed.city);
    } else if (parsed.city) {
      setEditCity(parsed.city);
    }
  };

  if (isEditing) {
    return (
      <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '240px' }} onClick={(e) => e.stopPropagation()}>
        {/* 省市合一选择器 */}
        <div style={{ position: 'relative' }}>
          <input
            type="text"
            placeholder="输入城市名，如：杭州"
            value={searchValue || (editCity && editProvince ? `${editCity}（${editProvince}）` : '')}
            onChange={(e) => handleInputChange(e.target.value)}
            onFocus={() => setShowDropdown(true)}
            disabled={loading}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              border: '1px solid #165dff',
              borderRadius: '4px',
              padding: '6px 10px',
              fontSize: '12px',
              outline: 'none',
            }}
          />
          {showDropdown && (
            <div style={{ 
              position: 'absolute', 
              top: '100%', 
              left: 0, 
              zIndex: 1000,
              background: '#fff',
              border: '1px solid #e5e6eb',
              borderRadius: '4px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              width: '240px',
              maxHeight: '200px',
              overflow: 'auto',
            }}>
              {filteredOptions.map((item, index) => (
                <div
                  key={`${item.city}-${item.province}-${index}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelect(item.city, item.province);
                  }}
                  style={{
                    padding: '6px 10px',
                    fontSize: '12px',
                    cursor: 'pointer',
                    background: editCity === item.city && editProvince === item.province ? '#f2f3f5' : '#fff',
                    color: editCity === item.city && editProvince === item.province ? '#165dff' : '#1d2129',
                  }}
                  onMouseEnter={(e) => {
                    (e.target as HTMLElement).style.background = '#f2f3f5';
                  }}
                  onMouseLeave={(e) => {
                    (e.target as HTMLElement).style.background = editCity === item.city && editProvince === item.province ? '#f2f3f5' : '#fff';
                  }}
                >
                  {item.display}
                </div>
              ))}
              {filteredOptions.length === 0 && (
                <div style={{ padding: '10px', fontSize: '12px', color: '#86909c', textAlign: 'center' }}>
                  未找到匹配城市
                </div>
              )}
            </div>
          )}
        </div>
        
        {/* 详细地址 */}
        <input
          type="text"
          value={editAddress}
          onChange={(e) => setEditAddress(e.target.value)}
          placeholder="详细地址"
          disabled={loading}
          style={{
            border: '1px solid #e5e6eb',
            borderRadius: '4px',
            padding: '4px 8px',
            fontSize: '10px',
            color: '#86909c',
            outline: 'none',
            width: '100%',
            boxSizing: 'border-box',
          }}
        />
        
        {/* 确认/取消按钮 */}
        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
          <button
            onClick={handleCancel}
            disabled={loading}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '24px',
              height: '24px',
              border: '1px solid #e5e6eb',
              borderRadius: '4px',
              background: '#fff',
              cursor: 'pointer',
              color: '#86909c',
            }}
            title="取消"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '24px',
              height: '24px',
              border: 'none',
              borderRadius: '4px',
              background: '#165dff',
              cursor: 'pointer',
              color: '#fff',
            }}
            title="保存"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </button>
        </div>
      </div>
    );
  }

  // 完整地址（用于气泡显示）
  const fullAddress = `${[store.province, store.city].filter(Boolean).join(' · ')}${store.address ? ' · ' + store.address : ''}`;
  // 截断的省市（用于单元格显示）
  const shortAddress = [store.province, store.city].filter(Boolean).join(' · ') || '-';

  return (
    <div 
      style={{ cursor: 'pointer', position: 'relative' }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        setIsEditing(true);
        setSearchValue('');
      }}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <div style={{ fontSize: '12px', color: '#1d2129', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px', maxWidth: '100px' }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }} title={fullAddress}>
          {shortAddress}
        </span>
        {store.city && (() => {
          const cityName = store.city!.endsWith('市') ? store.city!.slice(0, -1) : store.city!;
          const tier = CITY_TIER_MAP[cityName];
          if (!tier) return null;
          return (
            <span style={{ 
              fontSize: '10px', 
              padding: '1px 4px', 
              borderRadius: '3px', 
              background: tier === '一线' ? '#f53f3f' : 
                          tier === '新一线' ? '#ff7d00' : '#00b42a',
              color: '#fff',
              flexShrink: 0
            }}>
              {tier}
            </span>
          );
        })()}
      </div>
      {/* 悬停气泡显示完整地址 */}
      {showTooltip && store.address && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: '0',
          zIndex: 9999,
          background: '#fff',
          border: '1px solid #e5e6eb',
          borderRadius: '6px',
          padding: '8px 12px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          fontSize: '12px',
          color: '#1d2129',
          whiteSpace: 'nowrap',
          maxWidth: '300px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {fullAddress}
        </div>
      )}
    </div>
  );
});

// 门店名称单元格组件 - 简化版本
const StoreNameCell = memo(function StoreNameCell({ store, onRobotClick, onUpdate, onViewDetail, hideTags, storeGroups, onGroupClick }: {
  store: Store;
  onRobotClick?: () => void;
  onUpdate?: () => void;
  onViewDetail: (store: Store) => void;
  hideTags?: boolean;
  storeGroups?: StoreGroup[];
  onGroupClick?: (groupId: string) => void;
}) {
  const hasRobotConfig = store.robot_configs && store.robot_configs.length > 0;
  const [tags, setTags] = useState<StoreTag[]>([]);
  const [presets, setPresets] = useState<TagPreset[]>([]);
  const [showSelect, setShowSelect] = useState(false);
  const [loadingTagId, setLoadingTagId] = useState<string | null>(null);
  const [newTagName, setNewTagName] = useState('');
  const [creatingTag, setCreatingTag] = useState(false);
  const [editingAttachDate, setEditingAttachDate] = useState(false);
  const [attachDateValue, setAttachDateValue] = useState('');
  const [loadingAttachDate, setLoadingAttachDate] = useState(false);

  // 使用 ref 存储 store.id，避免闭包问题
  const storeIdRef = useRef(store.id);
  storeIdRef.current = store.id;

  // 同步 tags 与 store.store_tags
  useEffect(() => {
    setTags(store.store_tags || []);
  }, [store.id, JSON.stringify(store.store_tags)]);

  // 获取标签预设
  useEffect(() => {
    if (!showSelect) return;
    const fetchPresets = async () => {
      try {
        const res = await fetch('/api/tag-presets');
        if (res.ok) {
          const data = await res.json();
          if (data.data) setPresets(data.data);
        }
      } catch (error) { /* 静默 */ }
    };
    fetchPresets();
  }, [showSelect]);

  // 添加或删除标签
  const handleToggleTag = async (tagName: string, tagColor: string) => {
    const currentStoreId = storeIdRef.current;
    const existingTag = tags.find(t => t.tag_name === tagName);
    
    if (existingTag) {
      setLoadingTagId(existingTag.id);
      try {
        const res = await fetch(`/api/store-tags?id=${existingTag.id}`, { method: 'DELETE' });
        if (res.ok) {
          setTags(prev => prev.filter(t => t.id !== existingTag.id));
          onUpdate?.();
        }
      } catch (error) { /* 静默 */ }
      setLoadingTagId(null);
    } else {
      setLoadingTagId(tagName);
      try {
        const res = await fetch('/api/store-tags', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ store_id: currentStoreId, tag_name: tagName, tag_color: tagColor }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.data) {
            setTags(prev => [...prev, data.data]);
            onUpdate?.();
          }
        }
      } catch (error) { /* 静默 */ }
      setLoadingTagId(null);
    }
  };


  // 创建自定义标签并添加到门店
  const handleCreateCustomTag = async () => {
    const tagName = newTagName.trim();
    if (!tagName || creatingTag) return;

    const currentStoreId = storeIdRef.current;
    setCreatingTag(true);
    
    try {
      const colors = ['#165dff', '#ff7d00', '#00b42a', '#f53f3f', '#722ed1', '#eb2f96', '#13c2c2', '#faad14'];
      const tagColor = colors[Math.floor(Math.random() * colors.length)];
      
      // 先创建标签预设
      const presetRes = await fetch('/api/tag-presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag_name: tagName, tag_color: tagColor }),
      });
      
      if (presetRes.ok) {
        const presetData = await presetRes.json();
        if (presetData.data) {
          setPresets(prev => [...prev, presetData.data]);
        }
      }
      
      // 再添加到门店
      const res = await fetch('/api/store-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_id: currentStoreId, tag_name: tagName, tag_color: tagColor }),
      });
      
      if (res.ok) {
        const data = await res.json();
        if (data.data) {
          setTags(prev => [...prev, data.data]);
          onUpdate?.();
          setNewTagName('');
        }
      }
    } catch (error) { /* 静默 */ }
    setCreatingTag(false);
  };

  // 处理入驻时间保存
  const handleSaveAttachDate = async () => {
    const normalizedDate = normalizeDate(attachDateValue);
    if (!normalizedDate) {
      alert('入驻时间格式错误，请使用格式：2026/04/16 或 2026-04-16');
      return;
    }

    setLoadingAttachDate(true);
    try {
      const res = await fetch(`/api/stores/${store.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attach_date: normalizedDate }),
      });
      const data = await res.json();
      if (data.success) {
        setEditingAttachDate(false);
        onUpdate?.();
      } else {
        alert('保存失败：' + (data.error || '未知错误'));
      }
    } catch (error) {
      console.error('更新入驻时间失败:', error);
      alert('保存失败，请重试');
    } finally {
      setLoadingAttachDate(false);
    }
  };

  // 验证并规范化日期格式
  const normalizeDate = (dateStr: string): string | null => {
    if (!dateStr || !dateStr.trim()) return null;

    // 支持两种格式：2026/04/16 或 2026-04-16
    const match = dateStr.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
    if (!match) return null;

    const [, year, month, day] = match;
    const m = parseInt(month);
    const d = parseInt(day);

    if (m < 1 || m > 12) return null;
    if (d < 1 || d > 31) return null;

    // 统一转换为 YYYY/MM-DD 格式
    return `${year}/${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}`;
  };

  // 弹窗内容

  const addedTagNames = tags.map(t => t.tag_name);

  const modalContent = showSelect ? (
    <div 
      style={{ 
        position: 'fixed', 
        top: 0, 
        left: 0, 
        right: 0, 
        bottom: 0, 
        background: 'rgba(0,0,0,0.5)', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        zIndex: 99999 
      }}
      onClick={(e) => { e.stopPropagation(); setShowSelect(false); }}
    >
      <div 
        style={{ 
          background: '#fff', 
          borderRadius: '8px', 
          width: '320px', 
          maxHeight: '400px',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #e5e6eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '14px', fontWeight: 500, color: '#1d2129' }}>
            管理标签
          </span>
          <svg 
            width="16" 
            height="16" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="#86909c" 
            strokeWidth="2" 
            style={{ cursor: 'pointer' }}
            onClick={() => setShowSelect(false)}
          >
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </div>
        
        {/* 新建标签 */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #e5e6eb' }}>
          <div style={{ fontSize: '11px', color: '#86909c', marginBottom: '8px' }}>新建标签</div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreateCustomTag(); }}
              placeholder="输入标签名，按回车添加"
              style={{ flex: 1, height: '32px', padding: '0 12px', fontSize: '12px', border: '1px solid #e5e6eb', borderRadius: '6px', outline: 'none' }}
            />
            <button
              onClick={handleCreateCustomTag}
              disabled={!newTagName.trim() || creatingTag}
              style={{ height: '32px', padding: '0 12px', fontSize: '12px', background: newTagName.trim() ? '#165dff' : '#f2f3f5', color: newTagName.trim() ? '#fff' : '#86909c', border: 'none', borderRadius: '6px', cursor: newTagName.trim() ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap' }}
            >
              {creatingTag ? '添加中...' : '添加'}
            </button>
          </div>
        </div>
        
        {/* 合并后的标签列表 */}
        <div style={{ padding: '12px 16px', flex: 1, overflowY: 'auto' }}>
          <div style={{ fontSize: '11px', color: '#86909c', marginBottom: '8px' }}>点击标签添加/移除</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {/* 已添加的标签（带删除图标） */}
            {tags.map(tag => {
              const isLoading = loadingTagId === tag.id;
              const isPreset = PRESET_TAG_NAMES.includes(tag.tag_name);
              const displayColor = isPreset ? tag.tag_color : CUSTOM_TAG_COLOR;
              return (
                <span
                  key={tag.id}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    background: `${displayColor}15`,
                    color: displayColor,
                    border: `1px solid ${displayColor}30`,
                    cursor: isLoading ? 'wait' : 'pointer'
                  }}
                  onClick={() => !isLoading && handleToggleTag(tag.tag_name, tag.tag_color)}
                >
                  {isLoading ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" style={{ animation: 'spin 1s linear infinite' }}>
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" strokeDasharray="31.4 31.4" />
                    </svg>
                  ) : (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18"></line>
                      <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                  )}
                  {tag.tag_name}
                </span>
              );
            })}
            {/* 未添加的预设标签（带添加图标） */}
            {presets.filter(p => !addedTagNames.includes(p.tag_name)).map(preset => {
              const isLoading = loadingTagId === preset.tag_name;
              return (
                <span 
                  key={preset.id} 
                  style={{ 
                    display: 'inline-flex', 
                    alignItems: 'center', 
                    gap: '4px', 
                    padding: '4px 8px', 
                    borderRadius: '4px', 
                    fontSize: '12px', 
                    background: '#f2f3f5', 
                    color: '#4e5969', 
                    border: '1px solid #e5e6eb',
                    cursor: isLoading ? 'wait' : 'pointer'
                  }}
                  onClick={() => !isLoading && handleToggleTag(preset.tag_name, preset.tag_color)}
                >
                  {isLoading ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" style={{ animation: 'spin 1s linear infinite' }}>
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" strokeDasharray="31.4 31.4" />
                    </svg>
                  ) : (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="12" y1="5" x2="12" y2="19"></line>
                      <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                  )}
                  {preset.tag_name}
                </span>
              );
            })}
            {tags.length === 0 && presets.filter(p => !addedTagNames.includes(p.tag_name)).length === 0 && (
              <div style={{ textAlign: 'center', color: '#86909c', fontSize: '12px', padding: '20px 0', width: '100%' }}>暂无标签</div>
            )}
          </div>
        </div>
      </div>
    </div>
  ) : null;
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
        {/* 放大镜图标 */}
        <div style={{ flexShrink: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#165dff' }} onClick={(e) => { e.stopPropagation(); onViewDetail(store); }} title="查看门店详情">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"></circle><path d="M21 21l-4.35-4.35"></path>
          </svg>
        </div>

        {/* 机器人状态图标 */}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={hasRobotConfig ? '#165dff' : '#c9cdd4'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); onRobotClick?.(); }}>
          <rect x="3" y="11" width="18" height="10" rx="2"></rect><circle cx="12" cy="5" r="2"></circle><path d="M12 7v4"></path><line x1="8" y1="16" x2="8" y2="16"></line><line x1="16" y1="16" x2="16" y2="16"></line>
        </svg>
          
        {/* 门店名称 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
          <span style={{ fontWeight: '500', fontSize: '13px', cursor: 'default', background: store.business_status === '搭建中' ? '#fff7e8' : 'transparent', padding: store.business_status === '搭建中' ? '2px 6px' : 0, borderRadius: store.business_status === '搭建中' ? '4px' : 0, textDecoration: store.business_status === '取消合作' ? 'line-through' : 'none', color: store.business_status === '取消合作' ? '#c9cdd4' : '#1d2129' }}>
            {store.store_name}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
            {editingAttachDate ? (
              <input
                type="text"
                defaultValue={store.attach_date || ''}
                autoFocus
                onChange={(e) => setAttachDateValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSaveAttachDate();
                  } else if (e.key === 'Escape') {
                    setEditingAttachDate(false);
                    setAttachDateValue('');
                  }
                }}
                onBlur={handleSaveAttachDate}
                disabled={loadingAttachDate}
                placeholder="格式：2026/04/16"
                style={{
                  fontSize: '10px',
                  color: '#1d2129',
                  lineHeight: 1.2,
                  border: '1px solid #165dff',
                  borderRadius: '3px',
                  padding: '2px 6px',
                  outline: 'none',
                  width: 'fit-content',
                  minWidth: '80px'
                }}
              />
            ) : store.attach_date ? (
              <span
                style={{ fontSize: '10px', color: '#86909c', lineHeight: 1.2, cursor: 'pointer' }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  setEditingAttachDate(true);
                  setAttachDateValue(store.attach_date || '');
                }}
                title="双击编辑入驻时间"
              >
                入驻: {store.attach_date}
              </span>
            ) : null}

            {/* 分组标签 */}
            {storeGroups && store.store_id && (() => {
              const groups = storeGroups.filter(g => g.store_ids.split(',').map(s => s.trim()).includes(store.store_id!));
              if (groups.length === 0) return null;
              return (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px', alignItems: 'center' }}>
                  {groups.slice(0, 2).map(g => (
                    <span
                      key={g.id}
                      onClick={(e) => { e.stopPropagation(); onGroupClick?.(g.id); }}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '2px',
                        padding: '1px 5px',
                        borderRadius: '3px',
                        fontSize: '10px',
                        background: 'rgba(22,93,255,0.08)',
                        color: '#165dff',
                        border: '1px solid rgba(22,93,255,0.2)',
                        flexShrink: 0,
                        fontWeight: 'normal',
                        cursor: 'pointer',
                      }}
                      title={`${g.group_name}${g.remark ? ' - ' + g.remark : ''}`}
                    >
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="#165dff" stroke="none">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                      </svg>
                      {g.group_name}
                    </span>
                  ))}
                  {groups.length > 2 && (
                    <span style={{ fontSize: '10px', color: '#86909c', flexShrink: 0 }}>+{groups.length - 2}</span>
                  )}
                </div>
              );
            })()}
          </div>
        </div>

        {/* 分组标签 - 移除，已在上面显示 */}

        {/* 标签 - 根据 hideTags 状态决定是否显示 */}
        {!hideTags && (
          <>
            {tags.map(tag => {
              const isPreset = PRESET_TAG_NAMES.includes(tag.tag_name);
              const displayColor = isPreset ? tag.tag_color : CUSTOM_TAG_COLOR;
              return (
                <span key={tag.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', padding: '1px 5px', borderRadius: '3px', fontSize: '10px', background: `${displayColor}15`, color: displayColor, border: `1px solid ${displayColor}30`, flexShrink: 0, fontWeight: 'normal' }} title={tag.tag_name}>
                  {tag.tag_name}
                </span>
              );
            })}
          
            {/* 添加标签按钮 - 改为打开弹窗 */}
            <button onClick={(e) => { e.stopPropagation(); setShowSelect(true); }} style={{ width: '16px', height: '16px', borderRadius: '3px', border: '1px dashed #d3d6da', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#86909c', padding: 0, flexShrink: 0 }} title="添加标签">
              {loadingTagId ? (
                <svg width="8" height="8" viewBox="0 0 24 24" style={{ animation: 'spin 1s linear infinite' }}><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" strokeDasharray="31.4 31.4" /></svg>
              ) : (
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              )}
            </button>
          </>
        )}
      </div>
      {typeof document !== 'undefined' && createPortal(modalContent, document.body)}
    </>
  );
});

// 机器人配置列表弹窗
function RobotConfigListModal({
  storeId,
  onClose,
  setMessage,
}: {
  storeId: string;
  onClose: () => void;
  setMessage: (msg: { type: 'success' | 'error'; text: string } | null) => void;
}) {
  const [configs, setConfigs] = useState<RobotConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState<RobotConfig | null>(null);

  const fetchConfigs = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/robot-configs?store_id=${storeId}`);
      const data = await res.json();
      if (data.success) {
        setConfigs(data.data || []);
      }
    } catch (error) {
      console.error('获取机器人配置失败:', error);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchConfigs();
  }, [storeId]);

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除此机器人配置吗？')) return;
    
    try {
      const res = await fetch(`/api/robot-configs/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: '删除成功' });
        fetchConfigs();
      } else {
        setMessage({ type: 'error', text: data.error || '删除失败' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: '删除失败' });
    }
    setTimeout(() => setMessage(null), 3000);
  };

  const handleToggleActive = async (config: RobotConfig) => {
    try {
      const res = await fetch(`/api/robot-configs/${config.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !config.is_active }),
      });
      const data = await res.json();
      if (data.success) {
        fetchConfigs();
      }
    } catch (error) {
      console.error('更新失败:', error);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 10000 }}>
      <div className="modal-content" style={{ width: '560px' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">机器人配置</h3>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', color: '#86909c' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div className="modal-body">
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
            <button onClick={() => setShowEditModal({} as RobotConfig)} className="btn btn-primary btn-sm">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              添加配置
            </button>
          </div>

          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px' }}>
              <div className="loading-spinner"></div>
            </div>
          ) : configs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 24px', background: '#f7f8fa', borderRadius: '8px' }}>
              <p style={{ color: '#86909c', fontSize: '13px' }}>暂无机器人配置</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '12px' }}>
              {configs.map((config) => (
                <div key={config.id} style={{ background: '#f7f8fa', borderRadius: '8px', padding: '16px', border: '1px solid #e5e6eb' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                        <span style={{ fontWeight: '500', color: '#1d2129', fontSize: '14px' }}>
                          {config.robot_name || '未命名机器人'}
                        </span>
                        <div 
                          className={`switch ${config.is_active ? 'active' : ''}`}
                          onClick={() => handleToggleActive(config)}
                          style={{ cursor: 'pointer' }}
                        />
                        <span style={{ fontSize: '12px', color: config.is_active ? '#00b42a' : '#86909c' }}>
                          {config.is_active ? '已启用' : '已禁用'}
                        </span>
                      </div>
                      <p style={{ fontSize: '12px', color: '#86909c', wordBreak: 'break-all' }}>
                        {config.webhook_url}
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', marginLeft: '16px' }}>
                      <button onClick={() => setShowEditModal(config)} className="btn btn-text btn-sm">编辑</button>
                      <button onClick={() => handleDelete(config.id)} className="btn btn-text btn-sm" style={{ color: '#f53f3f' }}>删除</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 编辑弹窗 */}
        {showEditModal && (
          <RobotConfigModal
            storeId={storeId}
            config={showEditModal.id ? showEditModal : null}
            onClose={() => setShowEditModal(null)}
            onSuccess={() => {
              setShowEditModal(null);
              fetchConfigs();
            }}
          />
        )}
      </div>
    </div>
  );
}

// 机器人配置弹窗
function RobotConfigModal({
  storeId,
  config,
  onClose,
  onSuccess,
}: {
  storeId: string;
  config: RobotConfig | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState({
    robot_name: config?.robot_name || '',
    webhook_url: config?.webhook_url || '',
    description: config?.description || '',
    is_active: config?.is_active ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.webhook_url.trim()) {
      setError('请输入Webhook地址');
      return;
    }

    setSaving(true);
    try {
      const url = config ? `/api/robot-configs/${config.id}` : '/api/robot-configs';
      const method = config ? 'PUT' : 'POST';
      const body = config ? form : { ...form, store_id: storeId };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        onSuccess();
      } else {
        setError(data.error || '操作失败');
      }
    } catch (err) {
      setError('操作失败');
    }
    setSaving(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ width: '480px' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{config ? '编辑机器人配置' : '添加机器人配置'}</h3>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', color: '#86909c' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="message message-error" style={{ marginBottom: '16px' }}>{error}</div>}

            <div className="form-item">
              <label className="form-label">机器人名称</label>
              <input type="text" value={form.robot_name} onChange={(e) => setForm({ ...form, robot_name: e.target.value })} className="input" placeholder="如：门店客服机器人" />
            </div>

            <div className="form-item">
              <label className="form-label">Webhook地址 <span className="required">*</span></label>
              <input type="text" value={form.webhook_url} onChange={(e) => setForm({ ...form, webhook_url: e.target.value })} className="input" placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx" />
              <p className="form-tip">在企业微信群聊中添加机器人后获取</p>
            </div>

            <div className="form-item">
              <label className="form-label">描述</label>
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input" style={{ minHeight: '80px' }} placeholder="机器人的用途说明" />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input type="checkbox" id="is_active" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} style={{ width: '16px', height: '16px', accentColor: '#165dff' }} />
              <label htmlFor="is_active" style={{ fontSize: '14px', color: '#4e5969' }}>启用此机器人</label>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" onClick={onClose} className="btn btn-secondary">取消</button>
            <button type="submit" disabled={saving} className="btn btn-primary">{saving ? '保存中...' : '保存'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// 跟进记录弹窗
function FollowRecordModal({
  storeId,
  onClose,
  onSuccess,
}: {
  storeId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  // 获取当前时间的日期和小时
  const now = new Date();
  const currentDate = now.toISOString().slice(0, 10);
  const currentHour = String(now.getHours()).padStart(2, '0');

  const [form, setForm] = useState({
    follow_date: currentDate,
    follow_hour: currentHour,
    remark: '',
    next_follow_date: '',
    next_follow_hour: '10',
  });
  const [images, setImages] = useState<{ file: File; preview: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [hoverImage, setHoverImage] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 快捷选择下次跟进时间
  const setNextFollowQuick = (days: number) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    setForm({
      ...form,
      next_follow_date: date.toISOString().slice(0, 10),
      next_follow_hour: '10',
    });
  };

  // 处理粘贴事件
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      // 只在备注输入框有焦点时才拦截粘贴
      if (document.activeElement !== textareaRef.current) {
        return;
      }

      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) {
            const preview = URL.createObjectURL(file);
            setImages(prev => [...prev, { file, preview }]);
          }
        }
      }
    };

    // 监听整个文档的粘贴事件
    document.addEventListener('paste', handlePaste);
    return () => {
      document.removeEventListener('paste', handlePaste);
      // 清理预览URL
      images.forEach(img => URL.revokeObjectURL(img.preview));
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 调试：打印 storeId
    console.log('[FollowRecordModal] 提交跟进记录, storeId:', storeId, storeId?.length);

    // 只有备注必填
    if (!form.remark.trim()) {
      setError('请输入跟进备注');
      return;
    }

    setSaving(true);
    setError('');

    try {
      // 组合日期和小时为完整时间
      const followTime = new Date(`${form.follow_date}T${form.follow_hour}:00:00`);
      
      const formData = new FormData();
      formData.append('store_id', storeId);
      formData.append('follow_time', followTime.toISOString());
      formData.append('remark', form.remark);
      
      // 添加下次跟进时间（如果有选择）
      if (form.next_follow_date) {
        const nextFollowTime = new Date(`${form.next_follow_date}T${form.next_follow_hour}:00:00`);
        formData.append('next_follow_time', nextFollowTime.toISOString());
      }
      
      images.forEach((img) => {
        formData.append('images', img.file);
      });

      const res = await fetch('/api/follow-records', { method: 'POST', body: formData });
      const data = await res.json();
      
      if (data.success) {
        onSuccess();
      } else {
        setError(data.error || '添加失败');
      }
    } catch (err) {
      setError('添加失败');
    }
    setSaving(false);
  };

  const removeImage = (index: number) => {
    setImages(prev => {
      URL.revokeObjectURL(prev[index].preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 10000 }}>
      <div className="modal-content" style={{ width: '560px' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">添加跟进记录</h3>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', color: '#86909c' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="message message-error" style={{ marginBottom: '16px' }}>{error}</div>}

            {/* 跟进时间 */}
            <div className="form-item">
              <label className="form-label">跟进时间 <span className="required">*</span></label>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <input 
                  type="date" 
                  value={form.follow_date} 
                  onChange={(e) => setForm({ ...form, follow_date: e.target.value })} 
                  className="input" 
                  style={{ flex: 1 }}
                  required 
                />
                <select 
                  value={form.follow_hour} 
                  onChange={(e) => setForm({ ...form, follow_hour: e.target.value })} 
                  className="input select"
                  style={{ width: '100px' }}
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={String(i).padStart(2, '0')}>
                      {String(i).padStart(2, '0')}:00
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* 下次跟进时间 */}
            <div className="form-item">
              <label className="form-label">下次跟进时间（可选）</label>
              {/* 快捷选择按钮 */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                <button
                  type="button"
                  onClick={() => setNextFollowQuick(1)}
                  className="btn btn-secondary"
                  style={{ padding: '6px 12px', fontSize: '12px' }}
                >
                  明天
                </button>
                <button
                  type="button"
                  onClick={() => setNextFollowQuick(3)}
                  className="btn btn-secondary"
                  style={{ padding: '6px 12px', fontSize: '12px' }}
                >
                  3天后
                </button>
                <button
                  type="button"
                  onClick={() => setNextFollowQuick(5)}
                  className="btn btn-secondary"
                  style={{ padding: '6px 12px', fontSize: '12px' }}
                >
                  5天后
                </button>
                <button
                  type="button"
                  onClick={() => setNextFollowQuick(7)}
                  className="btn btn-secondary"
                  style={{ padding: '6px 12px', fontSize: '12px' }}
                >
                  7天后
                </button>
                <button
                  type="button"
                  onClick={() => setNextFollowQuick(10)}
                  className="btn btn-secondary"
                  style={{ padding: '6px 12px', fontSize: '12px' }}
                >
                  10天后
                </button>
                <button
                  type="button"
                  onClick={() => setNextFollowQuick(15)}
                  className="btn btn-secondary"
                  style={{ padding: '6px 12px', fontSize: '12px' }}
                >
                  15天后
                </button>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, next_follow_date: '', next_follow_hour: '10' })}
                  className="btn btn-text"
                  style={{ padding: '6px 12px', fontSize: '12px', color: '#86909c' }}
                >
                  清除
                </button>
              </div>
              {/* 手动选择 */}
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <input 
                  type="date" 
                  value={form.next_follow_date} 
                  onChange={(e) => setForm({ ...form, next_follow_date: e.target.value })} 
                  className="input" 
                  style={{ flex: 1 }}
                />
                <select 
                  value={form.next_follow_hour} 
                  onChange={(e) => setForm({ ...form, next_follow_hour: e.target.value })} 
                  className="input select"
                  style={{ width: '100px' }}
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={String(i).padStart(2, '0')}>
                      {String(i).padStart(2, '0')}:00
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* 跟进备注 */}
            <div className="form-item">
              <label className="form-label" style={{ textAlign: 'center', display: 'block', marginBottom: '12px', fontWeight: '500' }}>跟进备注 <span className="required">*</span></label>
              <textarea 
                ref={textareaRef}
                value={form.remark} 
                onChange={(e) => setForm({ ...form, remark: e.target.value })} 
                className="input" 
                style={{ minHeight: '100px', resize: 'vertical' }} 
                placeholder="请输入跟进备注..." 
              />
            </div>

            {/* 微信聊天截图 */}
            <div className="form-item">
              <label className="form-label" style={{ textAlign: 'center', display: 'block', marginBottom: '8px', fontWeight: '500' }}>微信聊天截图</label>
              <p className="form-tip" style={{ textAlign: 'center', marginBottom: '12px' }}>
                按 Ctrl+V 直接粘贴截图，系统将自动进行AI分析（选填）
              </p>
              
              {/* 粘贴区域提示 */}
              <div 
                style={{ 
                  border: '2px dashed #e5e6eb', 
                  borderRadius: '8px', 
                  padding: '24px', 
                  textAlign: 'center',
                  background: '#fafbfc',
                  transition: 'all 0.2s',
                  cursor: 'text'
                }}
                onClick={() => textareaRef.current?.focus()}
              >
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#c9cdd4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 8px' }}>
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                  <circle cx="8.5" cy="8.5" r="1.5"></circle>
                  <polyline points="21 15 16 10 5 21"></polyline>
                </svg>
                <p style={{ color: '#86909c', fontSize: '13px' }}>点击此处或按 Ctrl+V 粘贴图片</p>
              </div>
              
              {/* 图片预览 */}
              {images.length > 0 && (
                <div style={{ marginTop: '16px' }}>
                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(4, 1fr)', 
                    gap: '12px',
                    maxHeight: '300px',
                    overflowY: 'auto',
                    padding: '4px'
                  }}
                  className="custom-scrollbar"
                  >
                    {images.map((img, index) => (
                      <div 
                        key={index} 
                        style={{ 
                          position: 'relative',
                          aspectRatio: '1',
                          borderRadius: '8px',
                          overflow: 'hidden',
                          border: '2px solid #f2f3f5',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease'
                        }}
                        onClick={() => setHoverImage(img.preview)}
                        onMouseOver={(e) => {
                          e.currentTarget.style.borderColor = '#165dff';
                          e.currentTarget.style.transform = 'scale(1.02)';
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.borderColor = '#f2f3f5';
                          e.currentTarget.style.transform = 'scale(1)';
                        }}
                      >
                        <img 
                          src={img.preview} 
                          alt={`截图 ${index + 1}`} 
                          style={{ 
                            width: '100%', 
                            height: '100%', 
                            objectFit: 'cover' 
                          }} 
                        />
                        <div style={{
                          position: 'absolute',
                          top: '6px',
                          left: '6px',
                          background: '#165dff',
                          color: 'white',
                          fontSize: '11px',
                          fontWeight: '600',
                          padding: '2px 8px',
                          borderRadius: '10px'
                        }}>
                          {index + 1}
                        </div>
                        <button 
                          type="button" 
                          onClick={(e) => { e.stopPropagation(); removeImage(index); }} 
                          style={{ 
                            position: 'absolute', 
                            top: '6px', 
                            right: '6px', 
                            width: '24px', 
                            height: '24px', 
                            borderRadius: '50%', 
                            background: 'linear-gradient(135deg, #f53f3f 0%, #ff6b6b 100%)', 
                            color: '#fff', 
                            border: 'none', 
                            cursor: 'pointer', 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center', 
                            fontSize: '16px',
                            fontWeight: 'bold',
                            boxShadow: '0 2px 8px rgba(245, 63, 63, 0.3)',
                            transition: 'all 0.2s ease'
                          }}
                          onMouseOver={(e) => {
                            e.currentTarget.style.transform = 'scale(1.1)';
                          }}
                          onMouseOut={(e) => {
                            e.currentTarget.style.transform = 'scale(1)';
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                  <div style={{ 
                    marginTop: '8px', 
                    textAlign: 'center', 
                    fontSize: '12px', 
                    color: '#86909c' 
                  }}>
                    已添加 {images.length} 张图片（可继续粘贴）
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" onClick={onClose} className="btn btn-secondary">取消</button>
            <button type="submit" disabled={saving} className="btn btn-primary">{saving ? '添加中...' : '添加'}</button>
          </div>
        </form>

        {/* 图片放大预览 */}
        {hoverImage && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0,0,0,0.8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
              padding: '40px'
            }}
            onClick={() => setHoverImage(null)}
          >
            <img 
              src={hoverImage} 
              alt="预览" 
              style={{ 
                maxWidth: '100%', 
                maxHeight: '100%', 
                borderRadius: '8px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.3)'
              }} 
            />
          </div>
        )}
      </div>
    </div>
  );
}

// 批量上传弹窗
function BatchUploadModal({
  onClose,
  onFullImport,
  fullImportFileInputRef
}: {
  onClose: () => void;
  onFullImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
  fullImportFileInputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const [importMode, setImportMode] = useState<'full' | 'database'>('full');
  const [dbImportLoading, setDbImportLoading] = useState(false);
  const [dbImportResult, setDbImportResult] = useState<{ success: boolean; message: string; results?: Record<string, { imported: number; skipped: number }> } | null>(null);
  const dbImportFileRef = useRef<HTMLInputElement>(null);

  const handleDbImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setDbImportLoading(true);
    setDbImportResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/import-all', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (data.success) {
        const totalImported = (Object.values(data.results || {}) as { imported: number }[]).reduce((sum, r) => sum + r.imported, 0);
        setDbImportResult({ success: true, message: `导入完成，共导入 ${totalImported} 条记录`, results: data.results });
      } else {
        setDbImportResult({ success: false, message: data.error || '导入失败' });
      }
    } catch (err) {
      setDbImportResult({ success: false, message: '网络错误，请重试' });
    } finally {
      setDbImportLoading(false);
      // 重置 file input
      if (dbImportFileRef.current) dbImportFileRef.current.value = '';
    }
  };

  // 下载Excel模板
  const handleDownloadTemplate = async () => {
    try {
      const XLSX = await import('xlsx');

      // 创建模板数据（只包含前端显示的字段）
      const templateData = [
        {
          '门店名称': '示例门店',
          '门店ID': 'ST001',
          '区域': '四川省成都市',
          '入驻时间': '2024/01/01',
          '面积': '100',
          '人数': '10',
          '获客渠道': '线上推广',
        },
      ];

      // 创建工作簿
      const ws = XLSX.utils.json_to_sheet(templateData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '门店导入模板');

      // 下载文件
      XLSX.writeFile(wb, '门店导入模板.xlsx');
    } catch (error) {
      console.error('下载模板失败:', error);
      alert('下载模板失败，请重试');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ width: '580px' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">批量导入门店</h3>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', color: '#86909c' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div className="modal-body">
          {/* 导入模式选择 */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ fontSize: '13px', color: '#1d2129', marginBottom: '8px', display: 'block', fontWeight: 500 }}>
              选择导入模式：
            </label>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <button
                type="button"
                onClick={() => setImportMode('full')}
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  border: importMode === 'full' ? '2px solid #165dff' : '1px solid #e5e6eb',
                  borderRadius: '6px',
                  background: importMode === 'full' ? '#e8f3ff' : '#fff',
                  color: importMode === 'full' ? '#165dff' : '#4e5969',
                  fontSize: '13px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                完整导入
              </button>
              <button
                type="button"
                onClick={() => setImportMode('database')}
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  border: importMode === 'database' ? '2px solid #00b42a' : '1px solid #e5e6eb',
                  borderRadius: '6px',
                  background: importMode === 'database' ? '#e8fffb' : '#fff',
                  color: importMode === 'database' ? '#00b42a' : '#4e5969',
                  fontSize: '13px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                数据库导入
              </button>
            </div>
          </div>

          {importMode === 'database' ? (
            <>
              <div style={{ background: '#e8fffb', borderRadius: '8px', padding: '16px', marginBottom: '20px' }}>
                <p style={{ fontSize: '13px', color: '#00b42a', fontWeight: 500, marginBottom: '12px' }}>
                  从ZIP备份文件一键恢复全部数据
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                  {['门店', '联系人', '跟进记录', '跟进图片', '机器人配置', '门店图片', '门店标签', '标签预设'].map(name => (
                    <span key={name} style={{ fontSize: '12px', color: '#4e5969', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#00b42a" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                      {name}
                    </span>
                  ))}
                </div>
              </div>
              <div style={{ padding: '8px 12px', background: '#fff7e6', borderRadius: '6px', marginBottom: '16px', fontSize: '12px', color: '#d46b08' }}>
                注意：已有记录会跳过，图片文件会重新上传到对象存储
              </div>
              <input
                ref={dbImportFileRef}
                type="file"
                accept=".zip"
                onChange={handleDbImport}
                disabled={dbImportLoading}
                className="input"
                style={{ padding: '10px 12px', marginBottom: '12px' }}
              />
              {dbImportLoading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#165dff', fontSize: '13px' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" style={{ animation: 'spin 1s linear infinite' }}>
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" strokeDasharray="31.4 31.4" />
                  </svg>
                  正在导入，请稍候...
                </div>
              )}
              {dbImportResult && (
                <div style={{
                  padding: '12px',
                  borderRadius: '6px',
                  background: dbImportResult.success ? '#f0fff4' : '#fff2f0',
                  border: `1px solid ${dbImportResult.success ? '#b7eb8f' : '#ffccc7'}`,
                  fontSize: '13px',
                  color: dbImportResult.success ? '#389e0d' : '#cf1322',
                }}>
                  <p style={{ fontWeight: 500, marginBottom: dbImportResult.results ? '8px' : '0' }}>
                    {dbImportResult.message}
                  </p>
                  {dbImportResult.results && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', fontSize: '12px', color: '#4e5969' }}>
                      {Object.entries(dbImportResult.results).map(([table, r]: [string, any]) => (
                        <span key={table}>
                          {table === 'stores' ? '门店' : table === 'contacts' ? '联系人' : table === 'follow_records' ? '跟进记录' : table === 'follow_images' ? '跟进图片' : table === 'robot_configs' ? '机器人配置' : table === 'store_images' ? '门店图片' : table === 'store_tags' ? '门店标签' : '标签预设'}
                          ：导入 {r.imported} 条{r.skipped > 0 ? `，跳过 ${r.skipped} 条` : ''}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              <div style={{ background: '#f7f8fa', borderRadius: '8px', padding: '16px', marginBottom: '20px' }}>
                <p style={{ fontSize: '13px', color: '#4e5969', marginBottom: '8px' }}>请上传 Excel 文件（.xlsx格式），支持完整门店信息导入：</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px', marginBottom: '12px' }}>
                  {[
                    '门店名称 *', '门店ID *', '区域', '入驻时间', '面积', '人数', '获客渠道',
                  ].map((field, i) => (
                    <span key={i} style={{ fontSize: '12px', color: '#1d2129', fontWeight: i < 2 ? 500 : 400 }}>
                      {field}
                    </span>
                  ))}
                </div>
                <p style={{ fontSize: '12px', color: '#86909c', marginTop: '12px' }}>
                  注：所有导入的门店服务状态统一为"服务中"
                </p>
              </div>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '16px' }}>
                <input ref={fullImportFileInputRef} type="file" accept=".xlsx,.xls" onChange={onFullImport} className="input" style={{ flex: 1, padding: '10px 12px' }} />
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  style={{
                    padding: '10px 16px',
                    background: '#fff',
                    border: '1px solid #165dff',
                    borderRadius: '6px',
                    color: '#165dff',
                    fontSize: '13px',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#e8f3ff';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#fff';
                  }}
                >
                  📥 下载模板
                </button>
              </div>
              <p className="form-tip">仅支持新增门店，首次导入后，后续仅支持手动添加门店</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// 批量导入联系人弹窗
function BatchImportContactModal({
  onClose,
  onSuccess
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
    details?: { total: number; inserted: number; updated: number; failed: number };
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setResult(null);

    try {
      // 读取 Excel 文件
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(sheet, { defval: '' });

      // 解析联系人数据
      const contacts = data.map((row: any) => ({
        storeId: String(row['门店ID'] || '').trim(),
        name: String(row['姓名'] || '').trim(),
        position: String(row['职位'] || '').trim(),
        phone: String(row['投资人电话'] || row['电话'] || '').trim(),
      })).filter((c: any) => c.storeId && c.name);

      if (contacts.length === 0) {
        setResult({
          success: false,
          message: '文件中没有找到有效的联系人数据'
        });
        setUploading(false);
        return;
      }

      // 调用 API 导入
      const res = await fetch('/api/contacts/batch-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contacts })
      });

      const resData = await res.json();

      if (resData.success) {
        setResult({
          success: true,
          message: `导入完成！`,
          details: resData.data
        });
      } else {
        setResult({
          success: false,
          message: resData.error || '导入失败'
        });
      }
    } catch (error) {
      console.error('导入联系人失败:', error);
      setResult({
        success: false,
        message: error instanceof Error ? error.message : '导入失败'
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ width: '520px' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">批量导入联系人</h3>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', color: '#86909c' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div className="modal-body">
          {result?.success ? (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#d9f7be', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#52c41a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </div>
              <h4 style={{ fontSize: '16px', color: '#1d2129', marginBottom: '16px' }}>{result.message}</h4>
              {result.details && (
                <div style={{ background: '#f7f8fa', borderRadius: '8px', padding: '16px', textAlign: 'left' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '24px', fontWeight: 600, color: '#165dff' }}>{result.details.total}</div>
                      <div style={{ fontSize: '12px', color: '#86909c' }}>总记录数</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '24px', fontWeight: 600, color: '#52c41a' }}>{result.details.inserted}</div>
                      <div style={{ fontSize: '12px', color: '#86909c' }}>新增</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '24px', fontWeight: 600, color: '#faad14' }}>{result.details.updated}</div>
                      <div style={{ fontSize: '12px', color: '#86909c' }}>更新</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '24px', fontWeight: 600, color: '#f53f3f' }}>{result.details.failed}</div>
                      <div style={{ fontSize: '12px', color: '#86909c' }}>失败</div>
                    </div>
                  </div>
                </div>
              )}
              <button
                onClick={onSuccess}
                style={{
                  marginTop: '20px',
                  padding: '10px 32px',
                  background: '#165dff',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  cursor: 'pointer'
                }}
              >
                确定
              </button>
            </div>
          ) : (
            <>
              <div style={{ background: '#f7f8fa', borderRadius: '8px', padding: '16px', marginBottom: '20px' }}>
                <p style={{ fontSize: '13px', color: '#4e5969', marginBottom: '12px' }}>请上传 Excel 文件（.xlsx格式），文件格式需包含以下列：</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                  {['门店ID *', '姓名 *', '职位', '投资人电话/电话'].map((field, i) => (
                    <span key={i} style={{ fontSize: '12px', color: '#86909c' }}>
                      {i < 2 ? <span style={{ color: '#f53f3f' }}>●</span> : ''} {field}
                    </span>
                  ))}
                </div>
                <p style={{ fontSize: '12px', color: '#86909c', marginTop: '12px' }}>
                  * 为必填字段。导入时根据门店ID匹配到对应门店。
                </p>
              </div>

              {result && !result.success && (
                <div style={{ background: '#fff2f0', border: '1px solid #ffccc7', borderRadius: '6px', padding: '12px', marginBottom: '16px' }}>
                  <p style={{ fontSize: '13px', color: '#f53f3f', margin: 0 }}>{result.message}</p>
                </div>
              )}

              <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFileUpload} className="input" style={{ padding: '10px 12px' }} />

              {uploading && (
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <div className="loading-spinner" style={{ width: '32px', height: '32px', border: '3px solid #e5e6eb', borderTopColor: '#165dff', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 12px' }}></div>
                  <p style={{ fontSize: '13px', color: '#86909c' }}>正在导入联系人数据...</p>
                </div>
              )}

              <style jsx>{`
                @keyframes spin {
                  to { transform: rotate(360deg); }
                }
              `}</style>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// 添加门店弹窗
function AddStoreModal({ 
  onClose, 
  onSuccess,
  currentSystem = 'mama'
}: { 
  onClose: () => void; 
  onSuccess: () => void;
  currentSystem?: StoreSystem;
}) {
  const [form, setForm] = useState({
    store_name: '',
    store_id: '',
    settle_date: '',
    region: '',
    business_status: '服务中',
    store_area: '',
    staff_count: '',
    customer_channel: '',
    store_level: '',
  });
  const [contacts, setContacts] = useState<Array<{
    name: string;
    position: string;
    phone: string;
    wechat: string;
    remark: string;
    is_primary: boolean;
  }>>([{ name: '', position: '', phone: '', wechat: '', remark: '', is_primary: true }]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 日期格式验证和转换：支持 YYYY/MM/DD 和 YYYY-MM-DD 格式
  const normalizeDate = (dateStr: string): string => {
    if (!dateStr.trim()) return '';
    
    // 支持 YYYY/MM/DD 或 YYYY-MM-DD 格式
    const match = dateStr.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
    if (!match) return dateStr; // 格式不匹配，返回原值
    
    const [, year, month, day] = match;
    // 补零
    const paddedMonth = month.padStart(2, '0');
    const paddedDay = day.padStart(2, '0');
    
    // 返回标准格式 YYYY-MM-DD
    return `${year}-${paddedMonth}-${paddedDay}`;
  };

  const addContact = () => {
    setContacts([...contacts, { name: '', position: '', phone: '', wechat: '', remark: '', is_primary: false }]);
  };

  const removeContact = (index: number) => {
    if (contacts.length <= 1) return;
    const newContacts = contacts.filter((_, i) => i !== index);
    setContacts(newContacts);
  };

  const updateContact = (index: number, field: string, value: string | boolean) => {
    const newContacts = [...contacts];
    newContacts[index] = { ...newContacts[index], [field]: value };
    // 如果设置了首选联系人，取消其他的首选
    if (field === 'is_primary' && value === true) {
      newContacts.forEach((c, i) => {
        if (i !== index) c.is_primary = false;
      });
    }
    setContacts(newContacts);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.store_name.trim()) {
      setError('请输入门店名称');
      return;
    }
    if (!form.store_id.trim()) {
      setError('请输入门店ID');
      return;
    }
    // 验证入驻时间格式（如果填写了）
    if (form.settle_date.trim()) {
      const dateMatch = form.settle_date.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
      if (!dateMatch) {
        setError('入驻时间格式错误，请使用格式：2026/04/16 或 2026-04-16');
        return;
      }
      const [, year, month, day] = dateMatch;
      const monthNum = parseInt(month, 10);
      const dayNum = parseInt(day, 10);
      if (monthNum < 1 || monthNum > 12) {
        setError('入驻时间的月份必须在 1-12 之间');
        return;
      }
      // 简单验证日期有效性（不考虑不同月份的天数差异）
      if (dayNum < 1 || dayNum > 31) {
        setError('入驻时间的日期必须在 1-31 之间');
        return;
      }
    }

    setLoading(true);
    try {
      // 转换日期格式为标准格式 YYYY-MM-DD
      const normalizedSettleDate = normalizeDate(form.settle_date);
      const { settle_date, ...formData } = form;
      const res = await fetch('/api/stores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, store_system: currentSystem, attach_date: normalizedSettleDate }),
      });
      const data = await res.json();
      if (data.success) {
        // 创建门店后，添加联系人
        const storeId = data.data?.id;
        if (storeId) {
          const validContacts = contacts.filter(c => c.name.trim() || c.phone.trim());
          for (const contact of validContacts) {
            await fetch('/api/contacts', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...contact, store_id: storeId }),
            });
          }
        }
        onSuccess();
      } else {
        setError(data.error || '添加失败');
      }
    } catch (err) {
      setError('添加失败');
    }
    setLoading(false);
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    border: '1px solid #e5e6eb',
    borderRadius: '6px',
    fontSize: '14px',
    outline: 'none',
    transition: 'border-color 0.2s',
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '13px',
    color: '#4e5969',
    marginBottom: '6px',
    fontWeight: 500,
  };

  const rowStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
    marginBottom: '16px',
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ width: '640px' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">添加门店</h3>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', color: '#86909c' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        
        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
            {error && <div className="message message-error" style={{ marginBottom: '16px' }}>{error}</div>}

            {/* 必填信息 */}
            <div style={rowStyle}>
              <div>
                <label style={labelStyle}>门店名称 <span style={{ color: '#f53f3f' }}>*</span></label>
                <input type="text" value={form.store_name} onChange={(e) => setForm({ ...form, store_name: e.target.value })} style={inputStyle} placeholder="请输入门店名称" />
              </div>
              <div>
                <label style={labelStyle}>门店ID <span style={{ color: '#f53f3f' }}>*</span></label>
                <input type="text" value={form.store_id} onChange={(e) => setForm({ ...form, store_id: e.target.value })} style={inputStyle} placeholder="请输入门店ID" />
              </div>
            </div>

            {/* 区域和入驻时间 */}
            <div style={rowStyle}>
              <div>
                <label style={labelStyle}>区域</label>
                <input type="text" value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} style={inputStyle} placeholder="如：四川省眉山市" />
              </div>
              <div>
                <label style={labelStyle}>入驻时间</label>
                <input
                  type="text"
                  value={form.settle_date}
                  onChange={(e) => setForm({ ...form, settle_date: e.target.value })}
                  style={inputStyle}
                  placeholder="格式：2026/04/16"
                />
              </div>
            </div>

            {/* 服务状态、面积、人数 */}
            <div style={rowStyle}>
              <div>
                <label style={labelStyle}>服务状态</label>
                <select value={form.business_status} onChange={(e) => setForm({ ...form, business_status: e.target.value })} style={inputStyle}>
                  <option value="搭建中">搭建中</option>
                  <option value="服务中">服务中</option>
                  <option value="取消合作">取消合作</option>
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>
                  <label style={labelStyle}>面积</label>
                  <input type="text" value={form.store_area} onChange={(e) => setForm({ ...form, store_area: e.target.value })} style={inputStyle} placeholder="㎡" />
                </div>
                <div>
                  <label style={labelStyle}>人数</label>
                  <input type="text" value={form.staff_count} onChange={(e) => setForm({ ...form, staff_count: e.target.value })} style={inputStyle} placeholder="人" />
                </div>
              </div>
            </div>

            {/* 获客渠道、商管 */}
            <div style={rowStyle}>
              <div>
                <label style={labelStyle}>获客渠道</label>
                <input type="text" value={form.customer_channel} onChange={(e) => setForm({ ...form, customer_channel: e.target.value })} style={inputStyle} placeholder="请输入获客渠道" />
              </div>
              <div>
                <label style={labelStyle}>商管</label>
                <select value={form.store_level} onChange={(e) => setForm({ ...form, store_level: e.target.value })} style={inputStyle}>
                  <option value="">请选择商管</option>
                  <option value="文博">文博</option>
                  <option value="老蔡">老蔡</option>
                  <option value="老叶">老叶</option>
                  <option value="美丽妈妈">美丽妈妈</option>
                  <option value="其他">其他</option>
                </select>
              </div>
            </div>

            {/* 联系人 */}
            <div style={{ borderTop: '1px solid #f2f3f5', paddingTop: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <label style={{ ...labelStyle, marginBottom: 0, fontSize: '14px', color: '#1d2129', fontWeight: 600 }}>联系人</label>
                <button type="button" onClick={addContact} style={{ background: 'transparent', border: '1px solid #165dff', color: '#165dff', padding: '4px 12px', borderRadius: '4px', fontSize: '12px', cursor: 'pointer' }}>
                  + 添加联系人
                </button>
              </div>
              {contacts.map((contact, index) => (
                <div key={index} style={{ background: '#fafafa', borderRadius: '8px', padding: '12px', marginBottom: '8px', position: 'relative' }}>
                  {contacts.length > 1 && (
                    <button type="button" onClick={() => removeContact(index)} style={{ position: 'absolute', top: '8px', right: '8px', background: 'transparent', border: 'none', color: '#c9cdd4', cursor: 'pointer', fontSize: '16px', lineHeight: 1 }}>×</button>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                    <div>
                      <label style={{ ...labelStyle, marginBottom: '4px', fontSize: '12px' }}>姓名</label>
                      <input type="text" value={contact.name} onChange={(e) => updateContact(index, 'name', e.target.value)} style={{ ...inputStyle, padding: '6px 10px', fontSize: '13px' }} placeholder="姓名" />
                    </div>
                    <div>
                      <label style={{ ...labelStyle, marginBottom: '4px', fontSize: '12px' }}>职位</label>
                      <input type="text" value={contact.position} onChange={(e) => updateContact(index, 'position', e.target.value)} style={{ ...inputStyle, padding: '6px 10px', fontSize: '13px' }} placeholder="职位" />
                    </div>
                    <div>
                      <label style={{ ...labelStyle, marginBottom: '4px', fontSize: '12px' }}>电话</label>
                      <input type="text" value={contact.phone} onChange={(e) => updateContact(index, 'phone', e.target.value)} style={{ ...inputStyle, padding: '6px 10px', fontSize: '13px' }} placeholder="电话" />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '8px', alignItems: 'end' }}>
                    <div>
                      <label style={{ ...labelStyle, marginBottom: '4px', fontSize: '12px' }}>微信</label>
                      <input type="text" value={contact.wechat} onChange={(e) => updateContact(index, 'wechat', e.target.value)} style={{ ...inputStyle, padding: '6px 10px', fontSize: '13px' }} placeholder="微信号" />
                    </div>
                    <div>
                      <label style={{ ...labelStyle, marginBottom: '4px', fontSize: '12px' }}>备注</label>
                      <input type="text" value={contact.remark} onChange={(e) => updateContact(index, 'remark', e.target.value)} style={{ ...inputStyle, padding: '6px 10px', fontSize: '13px' }} placeholder="备注" />
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#86909c', cursor: 'pointer', paddingBottom: '4px' }}>
                      <input type="checkbox" checked={contact.is_primary} onChange={(e) => updateContact(index, 'is_primary', e.target.checked)} style={{ margin: 0 }} />
                      首选
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" onClick={onClose} className="btn btn-secondary">取消</button>
            <button type="submit" disabled={loading} className="btn btn-primary">{loading ? '添加中...' : '添加门店'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// 分组管理弹窗
function GroupManageModal({
  onClose,
  onSuccess,
  currentSystem = 'mama',
  stores,
}: {
  onClose: () => void;
  onSuccess: () => void;
  currentSystem?: string;
  stores: Store[];
}) {
  const [groups, setGroups] = useState<StoreGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingGroup, setEditingGroup] = useState<StoreGroup | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ group_name: '', remark: '', store_ids: '' });
  const [storeIdInputs, setStoreIdInputs] = useState<string[]>(['', '', '', '', '']);
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // 加载分组
  const fetchGroups = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/store-groups?store_system=${currentSystem}`, { cache: 'no-store' });
      const data = await res.json();
      if (data.success) {
        setGroups(data.data || []);
      }
    } catch (err) {
      console.error('加载分组失败:', err);
    }
    setLoading(false);
  }, [currentSystem]);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  // 构建 store_id -> store_name 的映射
  const storeIdNameMap = useMemo(() => {
    const map = new Map<string, string>();
    stores.forEach(s => {
      if (s.store_id) {
        map.set(s.store_id, s.store_name);
      }
    });
    return map;
  }, [stores]);

  // 从 storeIdInputs 提取有效的门店ID列表
  const validStoreIds = useMemo(() => {
    return storeIdInputs.map(s => s.trim()).filter(Boolean);
  }, [storeIdInputs]);

  const handleSave = async () => {
    if (!form.group_name.trim()) {
      setFormError('分组名称不能为空');
      return;
    }
    const idList = storeIdInputs.map(s => s.trim()).filter(Boolean);
    if (idList.length === 0) {
      setFormError('请至少输入一个门店ID');
      return;
    }
    if (idList.length > 20) {
      setFormError('单个分组最多包含20家门店');
      return;
    }

    setFormLoading(true);
    setFormError('');
    try {
      const url = '/api/store-groups';
      const method = editingGroup ? 'PUT' : 'POST';
      const body = editingGroup
        ? { id: editingGroup.id, group_name: form.group_name, remark: form.remark, store_ids: idList.join(',') }
        : { group_name: form.group_name, remark: form.remark, store_ids: idList.join(','), store_system: currentSystem };

      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (data.success) {
        setShowForm(false);
        setEditingGroup(null);
        setForm({ group_name: '', remark: '', store_ids: '' });
        setStoreIdInputs(['', '', '', '', '']);
        fetchGroups();
        onSuccess();
      } else {
        setFormError(data.error || '保存失败');
      }
    } catch (err) {
      console.error('保存失败:', err);
      setFormError('保存失败');
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async (groupId: string) => {
    try {
      const res = await fetch(`/api/store-groups?id=${groupId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setDeleteConfirm(null);
        fetchGroups();
        onSuccess();
      }
    } catch (err) {
      console.error('删除分组失败:', err);
    }
  };

  const startEdit = (group: StoreGroup) => {
    console.log('[GroupManageModal] startEdit 被调用', group);
    setEditingGroup(group);
    setForm({ group_name: group.group_name, remark: group.remark || '', store_ids: group.store_ids });
    const ids = group.store_ids.split(',').map(s => s.trim()).filter(Boolean);
    console.log('[GroupManageModal] 解析到的门店ID', ids);
    // 编辑时：填充已有ID，不足5个补空行，超出5个也全部显示
    const inputs = ids.length < 5 ? [...ids, ...Array(5 - ids.length).fill('')] : [...ids];
    console.log('[GroupManageModal] 设置的输入框', inputs);
    setStoreIdInputs(inputs);
    setShowForm(true);
    setFormError('');
  };

  const startCreate = () => {
    setEditingGroup(null);
    setForm({ group_name: '', remark: '', store_ids: '' });
    setStoreIdInputs(['', '', '', '', '']);
    setShowForm(true);
    setFormError('');
  };

  const addStoreIdInput = () => {
    if (storeIdInputs.filter(s => s.trim()).length >= 20) return;
    setStoreIdInputs([...storeIdInputs, '']);
  };

  const removeStoreIdInput = (index: number) => {
    const newInputs = storeIdInputs.filter((_, i) => i !== index);
    // 至少保留1个输入框
    if (newInputs.length === 0) {
      setStoreIdInputs(['']);
    } else {
      setStoreIdInputs(newInputs);
    }
  };

  const updateStoreIdInput = (index: number, value: string) => {
    const newInputs = [...storeIdInputs];
    newInputs[index] = value;
    setStoreIdInputs(newInputs);
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    border: '1px solid #e5e6eb',
    borderRadius: '6px',
    fontSize: '14px',
    outline: 'none',
    transition: 'border-color 0.2s',
    boxSizing: 'border-box',
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ width: '560px' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">分组管理</h3>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', color: '#86909c' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div className="modal-body" style={{ maxHeight: '65vh', overflowY: 'auto' }}>
          {/* 新建/编辑表单 */}
          {showForm && (
            <div style={{ background: '#f7f8fa', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#1d2129', marginBottom: '12px' }}>
                {editingGroup ? '编辑分组' : '新建分组'}
              </div>
              {formError && <div className="message message-error" style={{ marginBottom: '12px' }}>{formError}</div>}
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '13px', color: '#4e5969', marginBottom: '6px', fontWeight: 500 }}>分组名称 <span style={{ color: '#f53f3f' }}>*</span></label>
                <input type="text" value={form.group_name} onChange={e => setForm({ ...form, group_name: e.target.value })} style={inputStyle} placeholder="如：张总门店" />
              </div>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '13px', color: '#4e5969', marginBottom: '6px', fontWeight: 500 }}>分组备注</label>
                <input type="text" value={form.remark} onChange={e => setForm({ ...form, remark: e.target.value })} style={inputStyle} placeholder="如：张总名下3家店" />
              </div>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '13px', color: '#4e5969', marginBottom: '6px', fontWeight: 500 }}>
                  门店ID <span style={{ color: '#86909c', fontWeight: 400 }}>(已填 {validStoreIds.length}/20)</span>
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {storeIdInputs.map((sid, index) => {
                    const matchedName = sid.trim() ? storeIdNameMap.get(sid.trim()) : null;
                    const hasValue = sid.trim().length > 0;
                    const isUnmatched = hasValue && !matchedName;
                    return (
                      <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '11px', color: '#86909c', width: '18px', textAlign: 'right', flexShrink: 0 }}>{index + 1}</span>
                        <div style={{ flex: 1, position: 'relative' }}>
                          <input
                            type="text"
                            value={sid}
                            onChange={e => updateStoreIdInput(index, e.target.value)}
                            style={{
                              ...inputStyle,
                              borderColor: isUnmatched ? '#ff7d00' : hasValue && matchedName ? '#165dff' : '#e5e6eb',
                              paddingRight: matchedName ? '8px' : '12px',
                            }}
                            placeholder="输入门店ID"
                          />
                          {matchedName && (
                            <span style={{
                              position: 'absolute',
                              right: '8px',
                              top: '50%',
                              transform: 'translateY(-50%)',
                              fontSize: '11px',
                              color: '#165dff',
                              background: '#e8f3ff',
                              padding: '1px 6px',
                              borderRadius: '3px',
                              maxWidth: '180px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              pointerEvents: 'none',
                            }}>
                              {matchedName.slice(0, 16)}{matchedName.length > 16 ? '...' : ''}
                            </span>
                          )}
                        </div>
                        {isUnmatched && (
                          <span style={{ fontSize: '10px', color: '#ff7d00', flexShrink: 0, whiteSpace: 'nowrap' }}>⚠️未匹配</span>
                        )}
                        {storeIdInputs.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeStoreIdInput(index)}
                            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#c9cdd4', padding: '2px', flexShrink: 0, fontSize: '14px', lineHeight: 1 }}
                          >×</button>
                        )}
                      </div>
                    );
                  })}
                </div>
                {validStoreIds.length < 20 && (
                  <button
                    type="button"
                    onClick={addStoreIdInput}
                    style={{
                      marginTop: '8px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                      width: '100%',
                      padding: '6px',
                      borderRadius: '6px',
                      border: '1px dashed #c9cdd4',
                      background: 'transparent',
                      color: '#86909c',
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    添加门店ID
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => { setShowForm(false); setEditingGroup(null); setFormError(''); }}
                  className="btn btn-secondary"
                >取消</button>
                <button onClick={handleSave} disabled={formLoading} className="btn btn-primary">
                  {formLoading ? '保存中...' : '保存'}
                </button>
              </div>
            </div>
          )}

          {/* 新建按钮 */}
          {!showForm && (
            <button
              onClick={startCreate}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '8px 16px', borderRadius: '6px',
                border: '1px dashed #165dff', background: 'transparent',
                color: '#165dff', fontSize: '13px', cursor: 'pointer',
                width: '100%', justifyContent: 'center', marginBottom: '16px',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              新建分组
            </button>
          )}

          {/* 分组列表 */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: '24px', color: '#86909c', fontSize: '13px' }}>加载中...</div>
          ) : groups.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px', color: '#86909c', fontSize: '13px' }}>暂无分组，点击上方按钮创建</div>
          ) : (
            groups.map(group => {
              const idList = group.store_ids.split(',').map(s => s.trim()).filter(Boolean);
              return (
                <div key={group.id} style={{
                  background: '#fafafa',
                  borderRadius: '8px',
                  padding: '14px',
                  marginBottom: '8px',
                  border: '1px solid #f2f3f5',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: group.remark ? '4px' : '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="#165dff" stroke="none">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                      </svg>
                      <span style={{ fontSize: '14px', fontWeight: 600, color: '#1d2129' }}>{group.group_name}</span>
                      <span style={{ fontSize: '11px', color: '#86909c', background: '#f2f3f5', padding: '1px 6px', borderRadius: '3px' }}>{idList.length}家</span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          // 直接设置所有状态，不通过中间函数
                          setEditingGroup(group);
                          setForm({ group_name: group.group_name, remark: group.remark || '', store_ids: group.store_ids });
                          const ids = group.store_ids.split(',').map(s => s.trim()).filter(Boolean);
                          // 编辑时：填充已有ID，不足5个补空行，超出5个也全部显示
                          const inputs = ids.length < 5 ? [...ids, ...Array(5 - ids.length).fill('')] : [...ids];
                          setStoreIdInputs(inputs);
                          setShowForm(true);
                          setFormError('');
                        }} 
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#86909c', padding: '2px' }} 
                        title="编辑"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                      </button>
                      {deleteConfirm === group.id ? (
                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                          <button onClick={() => handleDelete(group.id)} style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '3px', border: 'none', background: '#f53f3f', color: '#fff', cursor: 'pointer' }}>确认</button>
                          <button onClick={() => setDeleteConfirm(null)} style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '3px', border: '1px solid #e5e6eb', background: '#fff', color: '#4e5969', cursor: 'pointer' }}>取消</button>
                        </div>
                      ) : (
                        <button onClick={() => setDeleteConfirm(group.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#c9cdd4', padding: '2px' }} title="删除">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                  {group.remark && (
                    <div style={{ fontSize: '12px', color: '#86909c', marginBottom: '8px' }}>{group.remark}</div>
                  )}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {idList.map((sid, i) => {
                      const name = storeIdNameMap.get(sid);
                      return (
                        <span key={i} style={{
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          background: name ? '#fff' : '#fff7e8',
                          color: name ? '#4e5969' : '#ff7d00',
                          border: `1px solid ${name ? '#e5e6eb' : '#ffe4ba'}`,
                        }}>
                          {name ? name : `${sid} ⚠️未匹配`}
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="modal-footer">
          <button onClick={onClose} className="btn btn-secondary">关闭</button>
        </div>
      </div>
    </div>
  );
}

// 删除门店弹窗
function DeleteStoreModal({ onClose, onSuccess }: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [storeId, setStoreId] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!storeId.trim()) {
      setError('请输入门店ID');
      return;
    }

    if (!password.trim()) {
      setError('请输入密码');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // 验证密码
      if (password !== '996') {
        setError('密码错误');
        setLoading(false);
        return;
      }

      // 查找门店ID对应的门店记录ID
      const searchRes = await fetch(`/api/stores?search=${encodeURIComponent(storeId.trim())}`);
      const searchData = await searchRes.json();

      if (!searchData.success || !searchData.data || searchData.data.length === 0) {
        setError('门店ID不存在');
        setLoading(false);
        return;
      }

      // 找到匹配的门店
      const store = searchData.data.find((s: any) => s.store_id === storeId.trim());
      if (!store) {
        setError('门店ID不存在');
        setLoading(false);
        return;
      }

      // 删除门店
      const res = await fetch(`/api/stores/${store.id}`, {
        method: 'DELETE',
      });

      const data = await res.json();

      if (data.success) {
        onSuccess();
      } else {
        setError(data.error || '删除失败');
      }
    } catch (err) {
      setError('网络错误，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ width: '400px' }}>
        <div className="modal-header">
          <h3 className="modal-title">删除门店</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ padding: '24px' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              marginBottom: '20px',
              padding: '12px',
              background: '#ffece8',
              borderRadius: '8px'
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f53f3f" strokeWidth="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
              <div style={{ fontSize: '13px', color: '#c9302c' }}>
                此操作将删除指定门店，且无法恢复！
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label className="form-label">请输入门店ID</label>
              <input
                type="text"
                className="form-input"
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
                placeholder="请输入要删除的门店ID"
                autoFocus
              />
            </div>

            <div className="form-group">
              <label className="form-label">请输入密码确认</label>
              <input
                type="password"
                className="form-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入密码"
              />
            </div>

            {error && (
              <div style={{ color: '#f53f3f', fontSize: '13px', marginTop: '8px' }}>
                {error}
              </div>
            )}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              取消
            </button>
            <button 
              type="submit" 
              className="btn" 
              style={{ background: '#f53f3f', color: '#fff' }}
              disabled={loading}
            >
              {loading ? '删除中...' : '确认删除'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// 门店类别单元格
const LevelCell = React.memo(function LevelCell({ store, updateStore }: { store: Store; updateStore: (storeId: string, updates: Partial<Store>) => void }) {
  const [isEditing, setIsEditing] = useState(false);
  const [selectedLevel, setSelectedLevel] = useState(store.store_level || '');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const levelOptions = [
    { value: '文博', label: '文博', color: '#f53f3f', bg: '#ffece8' },
    { value: '老蔡', label: '老蔡', color: '#ff7d00', bg: '#fff7e8' },
    { value: '老叶', label: '老叶', color: '#00b8b0', bg: '#e8fffb' },
    { value: '美丽妈妈', label: '美丽妈妈', color: '#165dff', bg: '#e8f3ff' },
    { value: '其他', label: '其他', color: '#86909c', bg: '#f2f3f5' },
  ];

  // 点击外部关闭下拉
  useEffect(() => {
    if (!isEditing) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsEditing(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isEditing]);

  const handleSelect = async (level: string) => {
    setSelectedLevel(level);
    setIsEditing(false);
    const res = await fetch(`/api/stores/${store.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ store_level: level })
    });
    if (res.ok) {
      updateStore(store.id, { store_level: level });
    }
  };

  const currentOption = levelOptions.find(opt => opt.value === selectedLevel);
  const displayText = selectedLevel || '-';

  return (
    <div style={{ position: 'relative', display: 'inline-block' }} ref={dropdownRef}>
      {isEditing ? (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: '50%',
          transform: 'translateX(-50%)',
          marginTop: '4px',
          background: '#fff',
          borderRadius: '6px',
          padding: '4px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
          border: '1px solid #e5e6eb',
          zIndex: 1000,
          minWidth: '100px',
        }}>
          {levelOptions.map(opt => (
            <button
              key={opt.value}
              onClick={() => handleSelect(opt.value)}
              style={{
                display: 'block',
                width: '100%',
                padding: '6px 12px',
                background: selectedLevel === opt.value ? opt.bg : 'transparent',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                textAlign: 'left',
                fontSize: '12px',
                color: opt.color,
                fontWeight: '600',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      ) : (
        <span
          onClick={() => setIsEditing(true)}
          style={{
            cursor: 'pointer',
            color: currentOption?.color || '#86909c',
            fontWeight: currentOption ? '600' : '400',
            background: currentOption?.bg || 'transparent',
            padding: '2px 6px',
            borderRadius: '4px',
          }}
        >
          {displayText}
        </span>
      )}
    </div>
  );
});

// 门店类别表头组件
function LevelFilterHeader({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [showFilter, setShowFilter] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [customLevels, setCustomLevels] = useState<string[]>([]);
  const [newLevel, setNewLevel] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭
  useEffect(() => {
    if (!showFilter) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowFilter(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showFilter]);

  const defaultLevelOptions = [
    { value: 'all', label: '全部', color: '#1d2129', bg: '#f7f8fa' },
    { value: 'empty', label: '未设置', color: '#86909c', bg: '#f2f3f5' },
    { value: '文博', label: '文博', color: '#f53f3f', bg: '#ffece8' },
    { value: '老蔡', label: '老蔡', color: '#ff7d00', bg: '#fff7e8' },
    { value: '老叶', label: '老叶', color: '#00b8b0', bg: '#e8fffb' },
    { value: '美丽妈妈', label: '美丽妈妈', color: '#165dff', bg: '#e8f3ff' },
    { value: '其他', label: '其他', color: '#86909c', bg: '#f2f3f5' },
  ];

  // 添加自定义类别
  const addLevel = () => {
    if (newLevel.trim() && !customLevels.includes(newLevel.trim())) {
      setCustomLevels([...customLevels, newLevel.trim()]);
      setNewLevel('');
    }
  };

  // 删除自定义类别
  const removeLevel = (level: string) => {
    setCustomLevels(customLevels.filter(l => l !== level));
  };

  // 合并默认类别和自定义类别
  const allLevelOptions = [
    ...defaultLevelOptions,
    ...customLevels.map(level => ({
      value: level,
      label: level,
      color: '#4e5969',
      bg: '#f7f8fa',
    })),
  ];

  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: '4px' }} ref={containerRef}>
      <span>类别</span>
      <button
        onClick={() => setShowFilter(!showFilter)}
        style={{
          background: value !== 'all' ? '#e8f3ff' : 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: '2px',
          color: value !== 'all' ? '#165dff' : '#86909c',
          display: 'flex',
          alignItems: 'center',
          borderRadius: '2px',
        }}
        title="筛选类别"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
        </svg>
      </button>

      {showFilter && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: '0',
            marginTop: '4px',
            background: '#fff',
            borderRadius: '6px',
            padding: '8px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
            border: '1px solid #e5e6eb',
            zIndex: 100,
            minWidth: '120px',
          }}
        >
          {allLevelOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => {
                onChange(opt.value);
                setShowFilter(false);
              }}
              style={{
                display: 'block',
                width: '100%',
                padding: '6px 12px',
                marginBottom: '2px',
                background: value === opt.value ? opt.bg : 'transparent',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                textAlign: 'left',
                fontSize: '13px',
                color: opt.color,
                fontWeight: opt.value !== 'all' && opt.value !== 'empty' ? '600' : '400',
                transition: 'all 0.15s',
              }}
            >
              {opt.label}
            </button>
          ))}
          
          {/* 分隔线和自定义选项按钮 */}
          <div style={{ borderTop: '1px solid #f2f3f5', marginTop: '8px', paddingTop: '8px' }}>
            <button
              onClick={() => setShowSettings(!showSettings)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                width: '100%',
                padding: '6px 12px',
                background: 'transparent',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '13px',
                color: '#86909c',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
              </svg>
              自定义选项
            </button>
          </div>
          
          {/* 自定义选项面板 */}
          {showSettings && (
            <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #f2f3f5' }}>
              {customLevels.map((level) => (
                <div key={level} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ fontSize: '13px', color: '#1d2129', fontWeight: '600', flex: 1 }}>{level}</span>
                  <button
                    onClick={() => removeLevel(level)}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#c9cdd4', padding: '2px' }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18"></line>
                      <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                  </button>
                </div>
              ))}
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <input
                  type="text"
                  value={newLevel}
                  onChange={(e) => setNewLevel(e.target.value)}
                  placeholder="添加类别"
                  className="input"
                  style={{ fontSize: '12px', padding: '4px 8px', flex: 1, height: '28px' }}
                  onKeyDown={(e) => e.key === 'Enter' && addLevel()}
                />
                <button onClick={addLevel} className="btn btn-primary btn-sm" style={{ padding: '4px 8px', fontSize: '12px' }}>添加</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// 服务状态表头组件（可筛选和自定义选项）
function BusinessStatusHeader({ 
  value, 
  onChange 
}: { 
  value: string; 
  onChange: (v: string) => void;
}) {
  const [showDropdown, setShowDropdown] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭
  useEffect(() => {
    if (!showDropdown) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDropdown]);

  const statusOptions = [
    { value: 'all', label: '全部', color: '#1d2129', bg: '#f7f8fa' },
    { value: 'empty', label: '未设置', color: '#86909c', bg: '#f2f3f5' },
    { value: '搭建中', label: '搭建中', color: '#ff7d00', bg: '#fff7e8' },
    { value: '服务中', label: '服务中', color: '#00b42a', bg: '#e8ffea' },
    { value: '取消合作', label: '取消合作', color: '#f53f3f', bg: '#ffece8' },
  ];

  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: '4px' }} ref={containerRef}>
      <span>服务状态</span>
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        style={{
          background: value !== 'all' ? '#e8f3ff' : 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: '2px',
          color: value !== 'all' ? '#165dff' : '#86909c',
          display: 'flex',
          alignItems: 'center',
          borderRadius: '2px',
        }}
        title="筛选服务状态"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
        </svg>
      </button>

      {showDropdown && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: '0',
            marginTop: '4px',
            background: '#fff',
            borderRadius: '6px',
            padding: '8px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
            border: '1px solid #e5e6eb',
            zIndex: 100,
            minWidth: '140px',
          }}
        >
          {statusOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => {
                onChange(opt.value);
                setShowDropdown(false);
              }}
              style={{
                display: 'block',
                width: '100%',
                padding: '6px 12px',
                marginBottom: '2px',
                background: value === opt.value ? opt.bg : 'transparent',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                textAlign: 'left',
                fontSize: '13px',
                color: opt.color,
                transition: 'all 0.15s',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}


// 商管筛选表头
function LevelHeader({ value, onChange, stores }: {
  value: string;
  onChange: (v: string) => void;
  stores: any[];
}) {
  const [showDropdown, setShowDropdown] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 统计每个商管的门店数量
  const getLevelCount = (levelValue: string) => {
    if (levelValue === 'all') return stores.length;
    if (levelValue === 'empty') {
      return stores.filter(s => !s.store_level || s.store_level === '未设置').length;
    }
    return stores.filter(s => s.store_level === levelValue).length;
  };

  useEffect(() => {
    if (!showDropdown) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDropdown]);

  const levelOptions = [
    { value: 'all', label: '全部', color: '#1d2129', bg: '#f7f8fa' },
    { value: 'empty', label: '未设置', color: '#86909c', bg: '#f2f3f5' },
    { value: '文博', label: '文博', color: '#f53f3f', bg: '#ffece8' },
    { value: '老蔡', label: '老蔡', color: '#ff7d00', bg: '#fff7e8' },
    { value: '老叶', label: '老叶', color: '#00b8b0', bg: '#e8fffb' },
    { value: '美丽妈妈', label: '美丽妈妈', color: '#165dff', bg: '#e8f3ff' },
    { value: '其他', label: '其他', color: '#86909c', bg: '#f2f3f5' },
  ];

  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: '4px' }} ref={containerRef}>
      <span>商管</span>
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        style={{
          background: value !== 'all' ? '#e8f3ff' : 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: '2px',
          color: value !== 'all' ? '#165dff' : '#86909c',
          display: 'flex',
          alignItems: 'center',
          borderRadius: '2px',
        }}
        title="筛选商管"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
        </svg>
      </button>

      {showDropdown && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: '0',
            marginTop: '4px',
            background: '#fff',
            borderRadius: '6px',
            padding: '8px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
            border: '1px solid #e5e6eb',
            zIndex: 100,
            minWidth: '140px',
          }}
        >
          {levelOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => {
                onChange(opt.value);
                setShowDropdown(false);
              }}
              style={{
                display: 'block',
                width: '100%',
                padding: '6px 12px',
                marginBottom: '2px',
                background: value === opt.value ? opt.bg : 'transparent',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                textAlign: 'left',
                fontSize: '13px',
                color: opt.color,
                transition: 'all 0.15s',
              }}
            >
              {opt.label} ({getLevelCount(opt.value)})
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// 经营分筛选表头
function BusinessScoreHeader({ value, onChange }: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [showDropdown, setShowDropdown] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭
  useEffect(() => {
    if (!showDropdown) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDropdown]);

  const scoreOptions = [
    { value: 'all', label: '全部', color: '#1d2129', bg: '#f7f8fa' },
    { value: '>=80', label: '门店经营分≥80分', color: '#00b42a', bg: '#e8ffea' },
    { value: '>=70,<80', label: '70分≤门店经营分＜80分', color: '#165dff', bg: '#e8f3ff' },
    { value: '>=60,<70', label: '60分≤门店经营分＜70分', color: '#ff7d00', bg: '#fff7e8' },
    { value: '<60', label: '门店经营分＜60分', color: '#f53f3f', bg: '#ffece8' },
  ];

  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: '4px' }} ref={containerRef}>
      <span>经营分</span>
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        style={{
          background: value !== 'all' ? '#e8f3ff' : 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: '2px',
          color: value !== 'all' ? '#165dff' : '#86909c',
          display: 'flex',
          alignItems: 'center',
          borderRadius: '2px',
        }}
        title="筛选经营分"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
        </svg>
      </button>

      {showDropdown && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: '0',
            marginTop: '4px',
            background: '#fff',
            borderRadius: '6px',
            padding: '8px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
            border: '1px solid #e5e6eb',
            zIndex: 100,
            minWidth: '160px',
          }}
        >
          {scoreOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => {
                onChange(opt.value);
                setShowDropdown(false);
              }}
              style={{
                display: 'block',
                width: '100%',
                padding: '6px 12px',
                marginBottom: '2px',
                background: value === opt.value ? opt.bg : 'transparent',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                textAlign: 'left',
                fontSize: '13px',
                color: opt.color,
                transition: 'all 0.15s',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// 服务状态单元格（下拉选择）
const BusinessStatusCell = React.memo(function BusinessStatusCell({ store, updateStore }: { store: Store; updateStore: (storeId: string, updates: Partial<Store>) => void }) {
  const [status, setStatus] = useState(store.business_status || '');
  const [saving, setSaving] = useState(false);

  const handleChange = async (newStatus: string) => {
    if (newStatus === status) return;
    setStatus(newStatus);
    setSaving(true);
    try {
      const res = await fetch(`/api/stores/${store.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_status: newStatus }),
      });
      const data = await res.json();
      if (data.success) {
        updateStore(store.id, { business_status: newStatus });
      }
    } catch (error) {
      console.error('更新服务状态失败:', error);
    }
    setSaving(false);
  };

  const getStatusStyle = () => {
    if (status === '搭建中') {
      return { bg: '#fff7e8', color: '#ff7d00', border: '#ffdcc2' };
    } else if (status === '服务中') {
      return { bg: '#e8ffea', color: '#00b42a', border: '#b8f5c6' };
    } else if (status === '取消合作') {
      return { bg: '#ffece8', color: '#f53f3f', border: '#fccfc6' };
    }
    return { bg: '#fff', color: '#1d2129', border: '#e5e6eb' };
  };

  const style = getStatusStyle();

  return (
    <select
      value={status}
      onChange={(e) => handleChange(e.target.value)}
      disabled={saving}
      style={{
        fontSize: '12px',
        padding: '2px 20px 2px 6px',
        width: '70px',
        height: '22px',
        lineHeight: '18px',
        backgroundColor: style.bg,
        border: `1px solid ${style.border}`,
        color: style.color,
        borderRadius: '2px',
        cursor: 'pointer',
        outline: 'none',
        appearance: 'none',
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='${encodeURIComponent(style.color)}' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 4px center',
        backgroundSize: '10px',
      }}
    >
      <option value="">选择</option>
      <option value="搭建中">搭建中</option>
      <option value="服务中">服务中</option>
      <option value="取消合作">取消合作</option>
    </select>
  );
});

// 下次跟进时间单元格
const NextFollowTimeCell = function NextFollowTimeCell({ store }: { store: Store }) {
  const nextFollowTime = store.latest_next_follow_time;

  console.log('[NextFollowTimeCell] 渲染门店:', {
    storeName: store.store_name,
    storeId: store.id,
    nextFollowTime: nextFollowTime,
    nextFollowTimeType: typeof nextFollowTime,
  });

  if (!nextFollowTime) {
    return <span style={{ color: '#c9cdd4', fontSize: '13px' }}>-</span>;
  }
  
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const followDate = new Date(nextFollowTime);
  followDate.setHours(0, 0, 0, 0);
  
  const diffTime = followDate.getTime() - now.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
  
  // 格式化日期为"X月X日"格式
  const month = followDate.getMonth() + 1;
  const day = followDate.getDate();
  const dateStr = `${month}月${day}日`;
  
  // 计算显示文本和样式
  const getStatusInfo = () => {
    if (diffDays < 0) {
      // 已逾期
      return {
        text: `逾期${Math.abs(diffDays)}天`,
        bgColor: '#ffece8',
        textColor: '#f53f3f',
        borderColor: '#f53f3f',
      };
    } else if (diffDays === 0) {
      // 今天
      return {
        text: '今天联系',
        bgColor: '#e8fffb',
        textColor: '#00b42a',
        borderColor: '#00b42a',
      };
    } else if (diffDays === 1) {
      // 明天 - 加上日期
      return {
        text: `明天联系 ${dateStr}`,
        bgColor: '#e8f4ff',
        textColor: '#165dff',
        borderColor: '#165dff',
      };
    } else if (diffDays <= 7) {
      // 一周内 - 加上日期
      return {
        text: `${diffDays}天后 ${dateStr}`,
        bgColor: '#e8f4ff',
        textColor: '#165dff',
        borderColor: '#165dff',
      };
    } else {
      // 超过一周 - 加上日期
      return {
        text: `${diffDays}天后 ${dateStr}`,
        bgColor: '#f7f8fa',
        textColor: '#86909c',
        borderColor: '#c9cdd4',
      };
    }
  };
  
  const status = getStatusInfo();
  
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
      <span
        style={{
          background: status.bgColor,
          color: status.textColor,
          padding: '2px 8px',
          borderRadius: '4px',
          fontSize: '11px',
          fontWeight: '500',
          border: `1px solid ${status.borderColor}`,
          whiteSpace: 'nowrap',
        }}
      >
        {status.text}
      </span>
    </div>
  );
};

// 跟进记录预览气泡按钮
const FollowRecordPreviewButton = React.memo(function FollowRecordPreviewButton({
  store,
  onClick
}: {
  store: Store;
  onClick: () => void;
}) {
  const [show, setShow] = useState(false);
  const [records, setRecords] = useState<FollowRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const hoverRef = useRef<NodeJS.Timeout | null>(null);

  const fetchRecords = async () => {
    if (records.length > 0) return; // 已有数据不重复获取
    setLoading(true);
    try {
      const res = await fetch(`/api/stores/${store.id}`);
      const data = await res.json();
      if (data.success) {
        setRecords(data.data.follow_records || []);
      }
    } catch (error) {
      console.error('获取跟进记录失败:', error);
    }
    setLoading(false);
  };

  // 组件加载时立即获取跟进记录，用于显示徽标
  useEffect(() => {
    fetchRecords();
  }, []);

  return (
    <div 
      style={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={() => {
        hoverRef.current = setTimeout(() => {
          setShow(true);
        }, 300);
      }}
      onMouseLeave={() => {
        if (hoverRef.current) clearTimeout(hoverRef.current);
        setShow(false);
      }}
    >
      <button
        onClick={onClick}
        className="btn btn-text btn-sm"
        title="查看跟进记录"
        style={{ position: 'relative' }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
          <circle cx="12" cy="12" r="3"></circle>
        </svg>
        {records.length > 0 && (
          <span
            style={{
              position: 'absolute',
              top: '-6px',
              right: '-6px',
              backgroundColor: '#f53f3f',
              color: '#fff',
              fontSize: '10px',
              fontWeight: 'bold',
              minWidth: '16px',
              height: '16px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 4px',
              lineHeight: '1',
              zIndex: 1
            }}
          >
            {records.length}
          </span>
        )}
      </button>
      
      {show && (
        <div
          style={{
            position: 'absolute',
            right: '100%',
            top: '50%',
            transform: 'translateY(-50%)',
            marginRight: '8px',
            background: '#fff',
            borderRadius: '8px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
            border: '1px solid #e5e6eb',
            minWidth: '280px',
            maxWidth: '360px',
            maxHeight: '300px',
            overflow: 'auto',
            zIndex: 100,
          }}
        >
          <div style={{ 
            padding: '12px', 
            borderBottom: '1px solid #f2f3f5',
            fontWeight: '500',
            fontSize: '13px',
            color: '#1d2129',
          }}>
            跟进记录 ({records.length})
          </div>
          
          {loading ? (
            <div style={{ padding: '20px', textAlign: 'center' }}>
              <div className="loading-spinner" style={{ width: '16px', height: '16px', margin: '0 auto' }}></div>
            </div>
          ) : records.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: '#86909c', fontSize: '13px' }}>
              暂无跟进记录
            </div>
          ) : (
            <div style={{ padding: '8px 0' }}>
              {records.slice(0, 5).map((record, index) => (
                <div 
                  key={record.id}
                  style={{ 
                    padding: '8px 12px',
                    borderBottom: index < Math.min(records.length, 5) - 1 ? '1px solid #f2f3f5' : 'none',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{
                      background: '#165dff',
                      color: '#fff',
                      width: '16px',
                      height: '16px',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '10px',
                      fontWeight: '600',
                    }}>
                      {index + 1}
                    </span>
                    <span style={{ fontSize: '12px', color: '#4e5969' }}>{formatDate(record.follow_time)}</span>
                    {record.images && record.images.length > 0 && (
                      <span style={{ fontSize: '11px', color: '#86909c' }}>📷{record.images.length}</span>
                    )}
                  </div>
                  <p style={{ fontSize: '12px', color: '#1d2129', margin: 0, lineHeight: '1.5', textAlign: 'left' }}>
                    跟进备注：{record.remark ? (record.remark.length > 50 ? record.remark.slice(0, 50) + '...' : record.remark) : '无'}
                  </p>
                </div>
              ))}
              {records.length > 5 && (
                <div style={{ padding: '8px 12px', textAlign: 'center', color: '#86909c', fontSize: '12px' }}>
                  还有 {records.length - 5} 条记录...
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

// 查看跟进记录弹窗（全屏）
const FollowRecordViewModal = React.memo(function FollowRecordViewModal({
  storeId,
  onClose,
  aiPromptTemplate,
}: {
  storeId: string;
  onClose: () => void;
  aiPromptTemplate: string;
}) {
  const [records, setRecords] = useState<FollowRecord[]>([]);
  const [store, setStore] = useState<Store | null>(null);
  const [loading, setLoading] = useState(true);
  const [aiSummary, setAiSummary] = useState<string>('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiExpanded, setAiExpanded] = useState(false);
  const [aiInput, setAiInput] = useState<string>('');
  
  // 编辑模式状态
  const [editingRecord, setEditingRecord] = useState<FollowRecord | null>(null);
  const [editForm, setEditForm] = useState({
    remark: '',
    follow_time: '',
    next_follow_time: '',
  });
  
  // 图片预览状态
  const [hoverPreview, setHoverPreview] = useState<{ url: string; x: number; y: number } | null>(null);
  const [fullScreenImage, setFullScreenImage] = useState<{ urls: string[]; index: number } | null>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // 获取门店详情
        const storeRes = await fetch(`/api/stores/${storeId}`);
        const storeData = await storeRes.json();
        if (storeData.success) {
          setStore(storeData.data);
          setRecords(storeData.data.follow_records || []);
        }
      } catch (error) {
        console.error('获取数据失败:', error);
      }
      setLoading(false);
    };
    fetchData();
  }, [storeId]);

  // 键盘事件监听 - 全屏图片切换
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!fullScreenImage) return;
      
      if (e.key === 'ArrowLeft') {
        // 上一张
        setFullScreenImage(prev => prev ? { ...prev, index: Math.max(0, prev.index - 1) } : null);
      } else if (e.key === 'ArrowRight') {
        // 下一张
        setFullScreenImage(prev => prev ? { ...prev, index: Math.min(prev.urls.length - 1, prev.index + 1) } : null);
      } else if (e.key === 'Escape') {
        setFullScreenImage(null);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [fullScreenImage]);

  // 获取所有图片列表
  const getAllImages = (): string[] => {
    const images: string[] = [];
    records.forEach(record => {
      if (record.images) {
        record.images.forEach(img => images.push(img.image_url));
      }
    });
    return images;
  };

  const generateAiSummary = async () => {
    if (records.length === 0 && !aiInput.trim()) return;
    setAiLoading(true);
    setAiSummary('');
    
    // 构建门店基本信息
    const storeInfo = store ? {
      name: store.store_name,
      storeId: store.store_id,
      category: store.category,
      merchantName: store.merchant_name,
      merchantPhone: store.merchant_phone,
      province: store.province,
      city: store.city,
      address: store.address,
      businessStatus: store.business_status,
    } : null;
    
    // 如果有手动输入内容，优先使用手动输入
    if (aiInput.trim()) {
      try {
        const response = await fetch('/api/ai-summary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            customInput: aiInput.trim(),
            promptTemplate: aiPromptTemplate,
            storeInfo,
          }),
        });
        const data = await response.json();
        if (data.success) {
          setAiSummary(data.summary || '');
        } else {
          setAiSummary('AI总结生成失败：' + (data.error || '未知错误'));
        }
      } catch (error) {
        console.error('生成AI总结失败:', error);
        setAiSummary('AI总结生成失败');
      }
      setAiLoading(false);
      return;
    }
    
    // 否则走原来的逻辑：收集图片和备注分析
    // 收集所有图片URL
    const allImages: string[] = [];
    records.forEach(record => {
      if (record.images && record.images.length > 0) {
        record.images.forEach(img => {
          allImages.push(img.image_url);
        });
      }
    });

    // 收集所有跟进备注
    const remarks = records
      .filter(r => r.remark)
      .map(r => `【${formatDate(r.follow_time)}】${r.remark}`)
      .join('\n\n');

    if (allImages.length > 0 || remarks) {
      try {
        const response = await fetch('/api/ai-summary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            images: allImages,
            remarks: remarks,
            promptTemplate: aiPromptTemplate,
            storeInfo,
          }),
        });
        const data = await response.json();
        if (data.success) {
          setAiSummary(data.summary || '');
        } else {
          setAiSummary('AI总结生成失败：' + (data.error || '未知错误'));
        }
      } catch (error) {
        console.error('生成AI总结失败:', error);
        setAiSummary('AI总结生成失败');
      }
    } else {
      setAiSummary('暂无足够数据生成总结');
    }
    setAiLoading(false);
  };

  return (
    <div className="modal-overlay" style={{ background: 'rgba(0,0,0,0.6)', zIndex: 10000 }} onClick={onClose}>
      <div
        style={{
          background: '#fff',
          width: '90%',
          maxWidth: '1200px',
          height: '90vh',
          borderRadius: '12px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* 头部 */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid #e5e6eb',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#fafbfc',
        }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#1d2129', margin: 0 }}>
              跟进记录详情
            </h2>
            {store && (
              <p style={{ fontSize: '13px', color: '#86909c', margin: '4px 0 0' }}>
                {store.store_name} {store.merchant_phone && `· ${store.merchant_phone}`}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '8px',
              color: '#86909c',
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        {/* 内容区 */}
        <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
              <div className="loading-spinner loading-spinner-lg"></div>
            </div>
          ) : records.length === 0 ? (
            <div className="empty-state">
              <svg className="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <circle cx="8.5" cy="8.5" r="1.5"></circle>
                <polyline points="21 15 16 10 5 21"></polyline>
              </svg>
              <p className="empty-state-title">暂无跟进记录</p>
            </div>
          ) : (
            <>
              {/* AI总结卡片 */}
              <div style={{
                background: 'linear-gradient(135deg, #e8f4ff 0%, #f0f5ff 100%)',
                borderRadius: '12px',
                padding: '12px 16px',
                marginBottom: '24px',
                border: '1px solid #d4e5ff',
              }}>
                {/* 标题栏 - 可点击折叠 */}
                <div 
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                  }}
                  onClick={() => setAiExpanded(!aiExpanded)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#165dff" strokeWidth="2">
                      <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
                      <polyline points="2 17 12 22 22 17"></polyline>
                      <polyline points="2 12 12 17 22 12"></polyline>
                    </svg>
                    <span style={{ fontSize: '14px', fontWeight: '600', color: '#165dff' }}>AI 商户总结</span>
                    <span style={{ fontSize: '12px', color: '#86909c' }}>
                      {aiSummary ? '（已生成）' : '（点击展开）'}
                    </span>
                  </div>
                  <svg 
                    width="14" 
                    height="14" 
                    viewBox="0 0 24 24" 
                    fill="none" 
                    stroke="#165dff" 
                    strokeWidth="2"
                    style={{ 
                      transform: aiExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s',
                    }}
                  >
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                </div>
                
                {/* 展开内容 */}
                {aiExpanded && (
                  <div style={{ marginTop: '12px' }}>
                    {/* 输入区域 */}
                    <div style={{ marginBottom: '10px' }}>
                      <textarea
                        value={aiInput}
                        onChange={(e) => setAiInput(e.target.value)}
                        placeholder="可选：手动输入需要分析的内容，留空则自动分析跟进记录和聊天截图..."
                        style={{
                          width: '100%',
                          minHeight: '60px',
                          padding: '10px',
                          border: '1px solid #d4e5ff',
                          borderRadius: '6px',
                          fontSize: '13px',
                          lineHeight: '1.5',
                          resize: 'vertical',
                          background: '#fff',
                          color: '#1d2129',
                        }}
                      />
                    </div>
                    
                    {/* 生成按钮 */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: aiSummary || aiLoading ? '12px' : '0' }}>
                      <button
                        onClick={generateAiSummary}
                        disabled={aiLoading}
                        className="btn btn-primary"
                        style={{ 
                          padding: '6px 16px',
                          fontSize: '13px',
                          opacity: aiLoading ? 0.6 : 1,
                        }}
                      >
                        {aiLoading ? (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <div className="loading-spinner" style={{ width: '12px', height: '12px' }}></div>
                            生成中...
                          </span>
                        ) : (
                          '生成总结'
                        )}
                      </button>
                    </div>
                    
                    {/* 结果展示 */}
                    {(aiLoading || aiSummary) && (
                      <div style={{
                        background: '#fff',
                        borderRadius: '6px',
                        padding: '12px',
                        border: '1px solid #e5e6eb',
                      }}>
                        {aiLoading ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#86909c', fontSize: '13px' }}>
                            <div className="loading-spinner" style={{ width: '14px', height: '14px' }}></div>
                            <span>正在生成AI总结...</span>
                          </div>
                        ) : (
                          <div style={{ fontSize: '13px', color: '#1d2129', lineHeight: '1.7', whiteSpace: 'pre-wrap' }}>
                            {aiSummary}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 跟进记录列表 */}
              <div style={{ display: 'grid', gap: '10px' }}>
                {records.map((record, index) => (
                  <div
                    key={record.id}
                    style={{
                      background: '#fff',
                      borderRadius: '8px',
                      border: editingRecord?.id === record.id ? '1px solid #165dff' : '1px solid #e5e6eb',
                      padding: '12px 16px',
                    }}
                  >
                    {/* 编辑模式 */}
                    {editingRecord?.id === record.id ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                          <span style={{
                            background: '#165dff',
                            color: '#fff',
                            width: '20px',
                            height: '20px',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '11px',
                            fontWeight: '600',
                            flexShrink: 0,
                          }}>
                            {index + 1}
                          </span>
                          <span style={{ fontSize: '13px', color: '#86909c' }}>编辑跟进记录</span>
                        </div>
                        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                          <div>
                            <label style={{ fontSize: '12px', color: '#86909c', display: 'block', marginBottom: '4px' }}>跟进时间</label>
                            <input
                              type="datetime-local"
                              value={editForm.follow_time}
                              onChange={(e) => setEditForm({ ...editForm, follow_time: e.target.value })}
                              style={{
                                padding: '6px 10px',
                                border: '1px solid #e5e6eb',
                                borderRadius: '6px',
                                fontSize: '13px',
                              }}
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: '12px', color: '#86909c', display: 'block', marginBottom: '4px' }}>下次跟进时间</label>
                            <input
                              type="datetime-local"
                              value={editForm.next_follow_time}
                              onChange={(e) => setEditForm({ ...editForm, next_follow_time: e.target.value })}
                              style={{
                                padding: '6px 10px',
                                border: '1px solid #e5e6eb',
                                borderRadius: '6px',
                                fontSize: '13px',
                              }}
                            />
                          </div>
                        </div>
                        <div>
                          <label style={{ fontSize: '12px', color: '#86909c', display: 'block', marginBottom: '4px' }}>跟进备注</label>
                          <textarea
                            value={editForm.remark}
                            onChange={(e) => setEditForm({ ...editForm, remark: e.target.value })}
                            placeholder="请输入跟进备注..."
                            style={{
                              width: '100%',
                              minHeight: '80px',
                              padding: '8px 12px',
                              border: '1px solid #e5e6eb',
                              borderRadius: '6px',
                              fontSize: '13px',
                              lineHeight: '1.5',
                              resize: 'vertical',
                            }}
                          />
                        </div>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                          <button
                            onClick={() => setEditingRecord(null)}
                            style={{
                              padding: '6px 16px',
                              border: '1px solid #e5e6eb',
                              borderRadius: '6px',
                              background: '#fff',
                              fontSize: '13px',
                              cursor: 'pointer',
                            }}
                          >
                            取消
                          </button>
                          <button
                            onClick={async () => {
                              try {
                                const updateData: Record<string, string | undefined> = {
                                  remark: editForm.remark,
                                };
                                if (editForm.follow_time) {
                                  updateData.follow_time = new Date(editForm.follow_time).toISOString();
                                }
                                if (editForm.next_follow_time) {
                                  updateData.next_follow_time = new Date(editForm.next_follow_time).toISOString();
                                }
                                
                                const res = await fetch(`/api/follow-records/${record.id}`, {
                                  method: 'PUT',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify(updateData),
                                });
                                const data = await res.json();
                                if (data.success) {
                                  setRecords(prev => prev.map(r => r.id === record.id ? { ...r, ...updateData } : r));
                                  setEditingRecord(null);
                                }
                              } catch (error) {
                                console.error('更新跟进记录失败:', error);
                              }
                            }}
                            className="btn btn-primary"
                            style={{ padding: '6px 16px', fontSize: '13px' }}
                          >
                            保存
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>


                        {/* 单行布局：序号 + 时间 + 备注 + 截图 + 操作按钮 */}
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                          {/* 序号 */}
                          <span style={{
                            background: '#165dff',
                            color: '#fff',
                            width: '20px',
                            height: '20px',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '11px',
                            fontWeight: '600',
                            flexShrink: 0,
                            marginTop: '2px',
                          }}>
                            {index + 1}
                          </span>
                          
                          {/* 时间 */}
                          <span style={{ 
                            fontSize: '13px', 
                            fontWeight: '500', 
                            color: '#1d2129',
                            flexShrink: 0,
                            minWidth: '70px',
                            marginTop: '2px',
                          }}>
                            {formatDate(record.follow_time)}
                          </span>
                          
                          {/* 下次跟进时间 */}
                          {record.next_follow_time && (
                            <span style={{ 
                              fontSize: '12px', 
                              color: '#86909c',
                              flexShrink: 0,
                              marginTop: '3px',
                              background: '#f7f8fa',
                              padding: '2px 8px',
                              borderRadius: '4px',
                            }}>
                              下次: {formatDate(record.next_follow_time)}
                            </span>
                          )}
                          
                          {/* 备注和截图 */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            {record.remark && (
                              <p style={{ 
                                fontSize: '13px', 
                                color: '#4e5969', 
                                lineHeight: '1.5', 
                                margin: '0 0 8px 0',
                              }}>
                                {record.remark}
                              </p>
                            )}

                            {/* 图片缩略图 - 缩小70% */}
                            {record.images && record.images.length > 0 && (
                              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                {record.images.map((img, imgIndex) => {
                                  const allImages = getAllImages();
                                  const globalIndex = records.slice(0, records.indexOf(record)).reduce((sum, r) => sum + (r.images?.length || 0), 0) + imgIndex;
                                  
                                  return (
                                    <div
                                      key={img.id}
                                      style={{
                                        width: '36px',
                                        height: '36px',
                                        borderRadius: '4px',
                                        overflow: 'hidden',
                                        cursor: 'pointer',
                                        border: '1px solid #e5e6eb',
                                        flexShrink: 0,
                                      }}
                                      onMouseEnter={(e) => {
                                        const rect = e.currentTarget.getBoundingClientRect();
                                        hoverTimeoutRef.current = setTimeout(() => {
                                          setHoverPreview({
                                            url: img.image_url,
                                            x: rect.right + 10,
                                            y: rect.top,
                                          });
                                        }, 200);
                                      }}
                                      onMouseLeave={() => {
                                        if (hoverTimeoutRef.current) {
                                          clearTimeout(hoverTimeoutRef.current);
                                        }
                                        setHoverPreview(null);
                                      }}
                                      onClick={() => {
                                        setFullScreenImage({ urls: allImages, index: globalIndex });
                                        setHoverPreview(null);
                                      }}
                                    >
                                      <img
                                        src={img.image_url}
                                        alt="聊天截图"
                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                      />
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                          
                          {/* 操作按钮 */}
                          <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                            <button
                              onClick={() => {
                                setEditingRecord(record);
                                setEditForm({
                                  remark: record.remark || '',
                                  follow_time: record.follow_time ? new Date(record.follow_time).toISOString().slice(0, 16) : '',
                                  next_follow_time: record.next_follow_time ? new Date(record.next_follow_time).toISOString().slice(0, 16) : '',
                                });
                              }}
                              style={{
                                padding: '4px 8px',
                                border: '1px solid #e5e6eb',
                                borderRadius: '4px',
                                background: '#fff',
                                fontSize: '12px',
                                color: '#4e5969',
                                cursor: 'pointer',
                              }}
                            >
                              编辑
                            </button>
                            <button
                              onClick={async () => {
                                if (!confirm('确定要删除这条跟进记录吗？')) return;
                                try {
                                  const res = await fetch(`/api/follow-records/${record.id}`, { method: 'DELETE' });
                                  const data = await res.json();
                                  if (data.success) {
                                    setRecords(prev => prev.filter(r => r.id !== record.id));
                                  }
                                } catch (error) {
                                  console.error('删除跟进记录失败:', error);
                                }
                              }}
                              style={{
                                padding: '4px 8px',
                                border: '1px solid #f53f3f',
                                borderRadius: '4px',
                                background: '#fff',
                                fontSize: '12px',
                                color: '#f53f3f',
                                cursor: 'pointer',
                              }}
                            >
                              删除
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* 悬停预览 */}
        {hoverPreview && (
          <div
            style={{
              position: 'fixed',
              left: hoverPreview.x,
              top: hoverPreview.y,
              zIndex: 1001,
              pointerEvents: 'none',
            }}
          >
            <img
              src={hoverPreview.url}
              alt="预览"
              style={{
                width: '200px',
                borderRadius: '8px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
                border: '2px solid #fff',
              }}
            />
          </div>
        )}

        {/* 全屏预览 */}
        {fullScreenImage && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0,0,0,0.9)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1002,
              padding: '60px',
            }}
            onClick={() => setFullScreenImage(null)}
          >
            {/* 左箭头 */}
            {fullScreenImage.index > 0 && (
              <div
                style={{
                  position: 'absolute',
                  left: '20px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  background: 'rgba(255,255,255,0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setFullScreenImage(prev => prev ? { ...prev, index: prev.index - 1 } : null);
                }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
                  <polyline points="15 18 9 12 15 6"></polyline>
                </svg>
              </div>
            )}
            
            <img
              src={fullScreenImage.urls[fullScreenImage.index]}
              alt="预览"
              style={{
                maxWidth: '100%',
                maxHeight: '100%',
                borderRadius: '8px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              }}
              onClick={(e) => e.stopPropagation()}
            />
            
            {/* 右箭头 */}
            {fullScreenImage.index < fullScreenImage.urls.length - 1 && (
              <div
                style={{
                  position: 'absolute',
                  right: '20px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  background: 'rgba(255,255,255,0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setFullScreenImage(prev => prev ? { ...prev, index: prev.index + 1 } : null);
                }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
                  <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
              </div>
            )}
            
            {/* 图片计数 */}
            <div style={{
              position: 'absolute',
              bottom: '20px',
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'rgba(0,0,0,0.6)',
              padding: '6px 16px',
              borderRadius: '20px',
              color: '#fff',
              fontSize: '14px',
            }}>
              {fullScreenImage.index + 1} / {fullScreenImage.urls.length}
            </div>
            
            {/* 提示 */}
            <div style={{
              position: 'absolute',
              top: '20px',
              left: '50%',
              transform: 'translateX(-50%)',
              color: 'rgba(255,255,255,0.6)',
              fontSize: '13px',
            }}>
              按 ← → 切换图片，ESC 关闭
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

// 重建广告聚合数据（从各账户数据累计）
async function rebuildAdAggregatedData(currentSystem: StoreSystem, adAccountInfos: AdAccountFileInfo[]) {
  const aggregated: AdAggregatedData = {
    storeStats: {},
    timeRange: { minTime: '', maxTime: '' },
    stats: { totalRecords: 0, matchedRecords: 0, unmatchedRecords: 0, totalAdInvestment: 0 },
    unmatchedDailyStats: {},
    unmatchedTotal: { spend: 0, orders: 0 },
    accounts: [null, null, null, null, null, null, null, null],
  };

  const minTimeList: string[] = [];
  const maxTimeList: string[] = [];

  for (let i = 0; i < 8; i++) {
    const accountInfo = adAccountInfos[i];
    if (!accountInfo) {
      aggregated.accounts[i] = null;
      continue;
    }
    
    // 从 IndexedDB 读取账户数据
    const accountData = await getBigData(`adAccount_${i}`, currentSystem) as AdAccountData | null;
    
    if (accountData) {
      // 累计 storeStats
      for (const [storeId, stats] of Object.entries(accountData.storeStats)) {
        if (!aggregated.storeStats[storeId]) {
          aggregated.storeStats[storeId] = { totalSpend: 0, totalOrders: 0, dailyStats: {} };
        }
        aggregated.storeStats[storeId].totalSpend += stats.totalSpend;
        aggregated.storeStats[storeId].totalOrders += stats.totalOrders;
        
        // 合并每日数据
        for (const [date, daily] of Object.entries(stats.dailyStats)) {
          if (!aggregated.storeStats[storeId].dailyStats[date]) {
            aggregated.storeStats[storeId].dailyStats[date] = { spend: 0, orders: 0 };
          }
          aggregated.storeStats[storeId].dailyStats[date].spend += daily.spend;
          aggregated.storeStats[storeId].dailyStats[date].orders += daily.orders;
        }
      }
      
      // 累计时间范围
      if (accountData.timeRange.minTime) minTimeList.push(accountData.timeRange.minTime);
      if (accountData.timeRange.maxTime) maxTimeList.push(accountData.timeRange.maxTime);
      
      // 累计统计
      aggregated.stats.totalRecords += accountData.stats.totalRecords;
      aggregated.stats.matchedRecords += accountData.stats.matchedRecords;
      aggregated.stats.unmatchedRecords += accountData.stats.unmatchedRecords;
      aggregated.stats.totalAdInvestment += accountData.stats.totalSpend;
      
      // 设置账户数据
      aggregated.accounts[i] = {
        accountIndex: i,
        accountName: accountInfo.accountName,
        storeStats: accountData.storeStats,
        timeRange: accountData.timeRange,
        stats: accountData.stats,
      };
    } else {
      aggregated.accounts[i] = null;
    }
  }
  
  // 设置总时间范围
  if (minTimeList.length > 0) {
    aggregated.timeRange.minTime = minTimeList.reduce((a, b) => a < b ? a : b);
  }
  if (maxTimeList.length > 0) {
    aggregated.timeRange.maxTime = maxTimeList.reduce((a, b) => a > b ? a : b);
  }
  
  // 存储聚合结果
  await saveBigData('adStats', currentSystem, aggregated);
  return aggregated;
}

// 广告上传弹窗组件 - 8个独立账户
function AdUploadModal({
  onClose,
  onUpload,
  onRemoveFile,
  onClearAllFiles,
  adAccountInfos,
  adAccountNames,
  setAdAccountNames,
  currentSystem
}: {
  onClose: () => void;
  onUpload: (accountIndex: number, file: File) => void;
  onRemoveFile: (accountIndex: number) => void;
  onClearAllFiles: () => void;
  adAccountInfos: [AdAccountFileInfo | null, AdAccountFileInfo | null, AdAccountFileInfo | null, AdAccountFileInfo | null, AdAccountFileInfo | null, AdAccountFileInfo | null, AdAccountFileInfo | null, AdAccountFileInfo | null];
  adAccountNames: string[];
  setAdAccountNames: React.Dispatch<React.SetStateAction<string[]>>;
  currentSystem: StoreSystem;
}) {
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);
  const [editingAccountIndex, setEditingAccountIndex] = useState<number | null>(null);

  // 选择文件后上传
  const handleFileChange = async (accountIndex: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setUploadingIndex(accountIndex);
    try {
      await onUpload(accountIndex, file);
    } catch (error) {
      console.error('上传失败:', error);
    } finally {
      setUploadingIndex(null);
    }
  };
  
  // 删除文件
  const handleRemove = (accountIndex: number) => {
    onRemoveFile(accountIndex);
  };

  // 保存自定义账户名称
  const handleSaveAccountName = async (index: number, newName: string) => {
    const newNames = [...adAccountNames];
    newNames[index] = newName.trim() || `账户 ${index + 1}`;
    setAdAccountNames(newNames);
    await saveBigData('adAccountNames', currentSystem, newNames);
  };

  // 计算总计
  const totalAccounts = adAccountInfos.filter(Boolean).length;
  
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{
        width: '800px',
        maxHeight: '85vh',
        borderRadius: '12px',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column'
      }} onClick={(e) => e.stopPropagation()}>
        {/* 标题栏 */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 20px',
          borderBottom: '1px solid #e5e6eb',
          background: '#fff',
          flexShrink: 0
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#1d2129' }}>广告费文件管理</h3>
            <div style={{ fontSize: '12px', color: '#86909c', marginTop: '2px' }}>
              已上传 {totalAccounts}/8 个账户
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '4px',
            color: '#86909c'
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        {/* 内容区 - 可滚动 */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px 20px',
          background: '#f7f8fa',
          minHeight: 0
        }}>
          {/* 8个账户卡片 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            {adAccountNames.map((name, index) => {
              const accountInfo = adAccountInfos[index];
              const hasFile = !!accountInfo;
              const isUploading = uploadingIndex === index;
              
              return (
                <div key={index} style={{
                  background: '#fff',
                  borderRadius: '8px',
                  padding: '12px',
                  border: '1px solid #e5e6eb',
                  position: 'relative'
                }}>
                  {/* 账户标题 */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '8px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1 }}>
                      {editingAccountIndex === index ? (
                        <input
                          type="text"
                          defaultValue={adAccountNames[index]}
                          autoFocus
                          onBlur={(e) => {
                            handleSaveAccountName(index, e.target.value);
                            setEditingAccountIndex(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleSaveAccountName(index, e.currentTarget.value);
                              setEditingAccountIndex(null);
                            } else if (e.key === 'Escape') {
                              setEditingAccountIndex(null);
                            }
                          }}
                          style={{
                            fontSize: '13px',
                            fontWeight: 600,
                            color: '#1d2129',
                            border: '1px solid #165dff',
                            borderRadius: '4px',
                            padding: '4px 8px',
                            outline: 'none',
                            width: '100%',
                            maxWidth: '150px'
                          }}
                        />
                      ) : (
                        <>
                          <span style={{
                            fontSize: '13px',
                            fontWeight: 600,
                            color: '#1d2129'
                          }}>
                            {adAccountNames[index]}
                          </span>
                          <button
                            onClick={() => setEditingAccountIndex(index)}
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              padding: '2px',
                              color: '#86909c',
                              display: 'flex',
                              alignItems: 'center'
                            }}
                            title="编辑账户名称"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  
                  {hasFile ? (
                    // 有文件的情况
                    <div>
                      {/* 文件信息 */}
                      <div style={{ marginBottom: '8px' }}>
                        <div style={{
                          fontSize: '12px',
                          color: '#1d2129',
                          fontWeight: 500,
                          marginBottom: '2px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="#52c41a">
                            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
                          </svg>
                          {accountInfo.fileName}
                        </div>
                        <div style={{ 
                          fontSize: '11px', 
                          color: '#86909c',
                          fontFamily: 'monospace'
                        }}>
                          {accountInfo.minTime} ~ {accountInfo.maxTime}
                        </div>
                      </div>
                      
                      {/* 操作按钮 */}
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          onClick={() => handleRemove(index)}
                          style={{
                            flex: 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '4px',
                            padding: '6px 10px',
                            background: '#fff1f0',
                            border: '1px solid #ffccc7',
                            borderRadius: '4px',
                            fontSize: '12px',
                            color: '#f53f3f',
                            cursor: 'pointer'
                          }}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                          </svg>
                          清空数据
                        </button>
                      </div>
                    </div>
                  ) : (
                    // 无文件的情况 - 显示上传按钮
                    <div>
                      <input
                        type="file"
                        accept=".xlsx,.xls"
                        onChange={(e) => handleFileChange(index, e)}
                        style={{ display: 'none' }}
                        id={`ad-upload-${index}`}
                        disabled={isUploading}
                      />
                      <label 
                        htmlFor={`ad-upload-${index}`}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          padding: '14px',
                          background: isUploading ? '#f5f5f5' : '#f7f8fa',
                          border: '1px dashed #d9d9d9',
                          borderRadius: '6px',
                          cursor: isUploading ? 'not-allowed' : 'pointer',
                          transition: 'all 0.2s'
                        }}
                      >
                        {isUploading ? (
                          <>
                            <div style={{ width: '20px', height: '20px', border: '2px solid #d9d9d9', borderTopColor: '#165dff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}></div>
                            <span style={{ fontSize: '12px', color: '#86909c' }}>上传中...</span>
                          </>
                        ) : (
                          <>
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="#86909c">
                              <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z"/>
                            </svg>
                            <span style={{ fontSize: '12px', color: '#86909c' }}>点击上传文件</span>
                          </>
                        )}
                      </label>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          
          {/* 底部提示 */}
          <div style={{
            marginTop: '12px',
            padding: '10px 12px',
            background: '#f0f5ff',
            borderRadius: '6px',
            fontSize: '12px',
            color: '#597ef7'
          }}>
            <div style={{ fontWeight: 500, marginBottom: '3px' }}>使用说明</div>
            <div style={{ lineHeight: '1.5' }}>
              • 每个账户可上传独立的广告费文件<br/>
              • 删除数据将清空该账户的所有广告费记录<br/>
              • 各账户广告费数据会自动累计相加
            </div>
          </div>
        </div>

        {/* 底部按钮 - 固定 */}
        <div style={{
          padding: '10px 20px',
          borderTop: '1px solid #e5e6eb',
          background: '#fff',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexShrink: 0
        }}>
          {/* 清空全部按钮 */}
          <button
            onClick={async () => {
              if (confirm('确定要清空所有账户的广告费数据吗？清空后数据将无法恢复！')) {
                await onClearAllFiles();
              }
            }}
            style={{
              background: '#fff1f0',
              border: '1px solid #ffccc7',
              color: '#f53f3f',
              borderRadius: '6px',
              padding: '8px 16px',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer'
            }}
          >
            清空全部
          </button>
          
          <button 
            onClick={onClose} 
            style={{
              background: '#165dff',
              border: 'none',
              color: '#fff',
              borderRadius: '6px',
              padding: '8px 20px',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer'
            }}
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
}

// AI配置弹窗
function AiConfigModal({
  template,
  defaultTemplate,
  onSave,
  onClose,
}: {
  template: string;
  defaultTemplate: string;
  onSave: (template: string) => void;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState(template);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ width: '640px' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">AI总结角色词配置</h3>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', color: '#86909c' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div className="modal-body">
          <div style={{ marginBottom: '16px' }}>
            <p style={{ fontSize: '13px', color: '#86909c', marginBottom: '12px' }}>
              编辑AI总结的角色词模板，系统将根据此模板对商户进行综合分析。
            </p>
            <textarea
              value={editing}
              onChange={(e) => setEditing(e.target.value)}
              className="input"
              style={{
                width: '100%',
                minHeight: '300px',
                fontFamily: 'monospace',
                fontSize: '13px',
                lineHeight: '1.6',
                resize: 'vertical',
              }}
              placeholder="请输入角色词模板..."
            />
          </div>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button
              onClick={() => setEditing(defaultTemplate)}
              className="btn btn-secondary"
              style={{ fontSize: '13px' }}
            >
              恢复默认
            </button>
          </div>
        </div>
        <div className="modal-footer">
          <button onClick={onClose} className="btn btn-secondary">取消</button>
          <button onClick={() => onSave(editing)} className="btn btn-primary">保存配置</button>
        </div>
      </div>
    </div>
  );
}


// 资料图片单元格
const StoreImagesCell = React.memo(function StoreImagesCell({ store, onUpdate }: { store: Store; onUpdate: () => void }) {
  const [images, setImages] = useState<StoreImage[]>(store.store_images || []);
  const [uploading, setUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [previewImage, setPreviewImage] = useState<{ urls: string[]; index: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 同步 store.store_images 变化到本地状态
  useEffect(() => {
    setImages(store.store_images || []);
  }, [store.store_images]);

  // 极速图片压缩
  // - 30MB以内：1200px + 质量0.5 + WebP
  // - 超过30MB：抛出错误提示
  const compressImage = (file: File): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const maxSize = 30 * 1024 * 1024; // 30MB

      if (file.size > maxSize) {
        reject(new Error('图片太大，请压缩后再上传（最大30MB）'));
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          // 固定缩放到1200px
          const maxDim = 1200;
          const scale = Math.min(maxDim / img.width, maxDim / img.height, 1);
          const width = Math.round(img.width * scale);
          const height = Math.round(img.height * scale);

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');

          if (!ctx) {
            reject(new Error('无法创建 canvas'));
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);

          // 一步到位：WebP + 质量0.5
          canvas.toBlob(
            blob => blob ? resolve(blob) : reject(new Error('压缩失败')),
            'image/webp',
            0.5
          );
        };
        img.onerror = () => reject(new Error('图片加载失败'));
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error('文件读取失败'));
      reader.readAsDataURL(file);
    });
  };

  // 处理粘贴图片
  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    console.log('[StoreImagesCell] 粘贴事件触发');
    const items = e.clipboardData?.items;
    if (!items) {
      console.log('[StoreImagesCell] 没有剪贴板数据');
      return;
    }

    const imageItems = Array.from(items).filter(item => item.type.startsWith('image/'));
    if (imageItems.length === 0) {
      console.log('[StoreImagesCell] 剪贴板中没有图片');
      return;
    }

    e.preventDefault();
    console.log('[StoreImagesCell] 检测到', imageItems.length, '张图片，开始处理上传');

    const files = imageItems.map(item => item.getAsFile()).filter(Boolean) as File[];

    // 直接在这里处理上传逻辑
    (async () => {
      if (files.length === 0) return;

      setUploading(true);
      try {
        for (const file of files) {
          console.log(`[压缩开始] ${file.name}: ${(file.size / 1024 / 1024).toFixed(2)} MB`);

          const compressedBlob = await compressImage(file);

          console.log(`[压缩完成] ${(compressedBlob.size / 1024).toFixed(2)} KB (压缩率: ${((1 - compressedBlob.size / file.size) * 100).toFixed(1)}%)`);

          const formData = new FormData();
          const fileName = file.name.replace(/\.[^.]+$/, '.webp');
          formData.append('file', compressedBlob, fileName);
          formData.append('store_id', store.id);

          const res = await fetch('/api/store-images', {
            method: 'POST',
            body: formData,
          });
          const data = await res.json();
          console.log('[上传结果]', data);
          if (data.success && data.data) {
            setImages(prev => [...prev, data.data]);
          }
        }
        onUpdate();
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : '上传图片失败';
        console.error('[上传失败]', errorMsg);
        alert(errorMsg);
      } finally {
        setUploading(false);
      }
    })();
  };

  const activatePasteMode = () => {
    console.log('[激活粘贴模式] 点击灰框');
    setIsActive(true);
    // 获得焦点以便接收粘贴事件
    containerRef.current?.focus();
  };

  // 点击其他地方取消激活状态
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsActive(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 键盘事件监听 - 预览弹窗图片切换
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!previewImage) return;
      
      if (e.key === 'ArrowLeft') {
        setPreviewImage(prev => prev ? { ...prev, index: Math.max(0, prev.index - 1) } : null);
      } else if (e.key === 'ArrowRight') {
        setPreviewImage(prev => prev ? { ...prev, index: Math.min(prev.urls.length - 1, prev.index + 1) } : null);
      } else if (e.key === 'Escape') {
        setPreviewImage(null);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewImage]);

  // 先压缩再上传
  const handleUploadWithCompress = async (files: File[]) => {
    if (files.length === 0) return;

    setUploading(true);
    try {
      for (const file of files) {
        console.log(`[压缩开始] ${file.name}: ${(file.size / 1024 / 1024).toFixed(2)} MB`);

        const compressedBlob = await compressImage(file);

        console.log(`[压缩完成] ${(compressedBlob.size / 1024).toFixed(2)} KB (压缩率: ${((1 - compressedBlob.size / file.size) * 100).toFixed(1)}%)`);

        const formData = new FormData();
        const fileName = file.name.replace(/\.[^.]+$/, '.webp');
        formData.append('file', compressedBlob, fileName);
        formData.append('store_id', store.id);

        const res = await fetch('/api/store-images', {
          method: 'POST',
          body: formData,
        });
        const data = await res.json();
        if (data.success && data.data) {
          setImages(prev => [...prev, data.data]);
        }
      }
      onUpdate();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '上传图片失败';
      console.error(errorMsg);
      alert(errorMsg);
    }
    setUploading(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    handleUploadWithCompress(Array.from(files));
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (imageId: string) => {
    if (!confirm('确定删除这张图片？')) return;

    try {
      const res = await fetch(`/api/store-images/${imageId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        setImages(prev => prev.filter(img => img.id !== imageId));
        setPreviewImage(null);
        onUpdate();
      }
    } catch (error) {
      console.error('删除图片失败:', error);
    }
  };

  const handlePreview = (index: number) => {
    const urls = images.map(img => img.image_url);
    setPreviewImage({ urls, index });
  };

  return (
    <>
      <div
        ref={containerRef}
        tabIndex={0}
        style={{ display: 'flex', alignItems: 'center', gap: '4px', width: '100%', outline: 'none' }}
        onPaste={handlePaste}
      >
        {/* 灰框区域，点击激活粘贴模式 */}
        <div
          onClick={activatePasteMode}
          style={{
            flex: 1,
            height: '24px',
            background: isActive ? '#e8f3ff' : '#f2f3f5',
            border: isActive ? '1px solid #165dff' : '1px dashed #e5e6eb',
            borderRadius: '4px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            padding: '0 6px',
            gap: '4px',
            overflow: 'hidden',
            transition: 'all 0.2s',
          }}
          title={isActive ? '已激活，按 Ctrl+V 粘贴图片' : '点击激活，然后按 Ctrl+V 粘贴图片'}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragOver(false);
            const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
            if (files.length > 0) handleUploadWithCompress(files);
          }}
        >
          {/* 图片缩略图 - 高度填满整个单元格 */}
          {images.slice(0, 3).map((img, index) => (
            <div
              key={img.id}
              onClick={(e) => {
                e.stopPropagation();
                handlePreview(index);
              }}
              style={{
                width: '24px',
                height: '18px',
                borderRadius: '2px',
                background: '#fff',
                overflow: 'hidden',
                border: '1px solid #e5e6eb',
                position: 'relative',
                flexShrink: 0,
              }}
            >
              <img
                src={img.image_url}
                alt="资料"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
          ))}
          {images.length > 3 && (
            <span style={{ fontSize: '10px', color: '#86909c', flexShrink: 0 }}>+{images.length - 3}</span>
          )}
          {uploading && (
            <span style={{ fontSize: '10px', color: '#165dff', flexShrink: 0 }}>上传中...</span>
          )}
        </div>
        {/* 加号按钮 */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          style={{
            width: '20px',
            height: '20px',
            border: '1px dashed #c9cdd4',
            borderRadius: '4px',
            background: '#f7f8fa',
            cursor: uploading ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#86909c',
            fontSize: '14px',
            padding: 0,
            flexShrink: 0,
          }}
          title="添加图片（点击或 Ctrl+V 粘贴）"
        >
          +
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileUpload}
          style={{ display: 'none' }}
        />
      </div>

      {/* 图片预览弹窗 */}
      {previewImage && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.95)',
            zIndex: 99999,
          }}
          onClick={() => setPreviewImage(null)}
        >
          {/* 顶部标题栏 */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: '48px',
              background: 'rgba(0,0,0,0.8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 2,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <span style={{ color: '#fff', fontSize: '14px' }}>
              {previewImage.index + 1} / {previewImage.urls.length}
            </span>
          </div>

          {/* 图片区域 - 点击关闭 */}
          <div
            style={{
              position: 'absolute',
              top: '48px',
              left: 0,
              right: 0,
              bottom: '64px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
            onClick={() => setPreviewImage(null)}
          >
            {/* 上一张按钮 */}
            {previewImage.index > 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setPreviewImage(prev => prev ? { ...prev, index: prev.index - 1 } : null);
                }}
                style={{
                  position: 'absolute',
                  left: '16px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'rgba(255,255,255,0.2)',
                  border: 'none',
                  borderRadius: '50%',
                  width: '56px',
                  height: '56px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  zIndex: 3,
                }}
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="15 18 9 12 15 6"></polyline>
                </svg>
              </button>
            )}

            <img
              src={previewImage.urls[previewImage.index]}
              alt="预览"
              style={{
                maxWidth: '100%',
                maxHeight: '100%',
                objectFit: 'contain',
              }}
              onClick={(e) => e.stopPropagation()}
            />

            {/* 下一张按钮 */}
            {previewImage.index < previewImage.urls.length - 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setPreviewImage(prev => prev ? { ...prev, index: prev.index + 1 } : null);
                }}
                style={{
                  position: 'absolute',
                  right: '16px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'rgba(255,255,255,0.2)',
                  border: 'none',
                  borderRadius: '50%',
                  width: '56px',
                  height: '56px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  zIndex: 3,
                }}
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
              </button>
            )}
          </div>

          {/* 底部操作栏 */}
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: '64px',
              background: 'rgba(0,0,0,0.8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '20px',
              zIndex: 2,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 删除按钮 */}
            <button
              onClick={() => {
                const currentImageId = images[previewImage.index].id;
                handleDelete(currentImageId);
              }}
              style={{
                background: '#f53f3f',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                padding: '12px 32px',
                fontSize: '15px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontWeight: 500,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
              删除图片
            </button>
            {/* 关闭按钮 */}
            <button
              onClick={() => setPreviewImage(null)}
              style={{
                background: 'transparent',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.4)',
                borderRadius: '6px',
                padding: '12px 32px',
                fontSize: '15px',
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              关闭
            </button>
          </div>
        </div>
      )}
    </>
  );
});
// 联系人单元格（可展开）
const ContactsCell = React.memo(function ContactsCell({ store, onUpdate }: { store: Store; onUpdate: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [localContacts, setLocalContacts] = useState<Contact[]>(store.contacts || []);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const contacts = localContacts;
  const primaryContact = contacts.find(c => c.is_primary) || contacts[0];

  // 同步 store.contacts 变化到本地状态
  useEffect(() => {
    setLocalContacts(store.contacts || []);
  }, [store.contacts]);

  // 计算下拉菜单位置
  const getDropdownStyle = (): React.CSSProperties => {
    if (!containerRef.current) return { display: 'none' };
    const rect = containerRef.current.getBoundingClientRect();
    return {
      position: 'fixed' as const,
      top: rect.bottom + 4,
      left: rect.left,
      zIndex: 99999,
    };
  };

  // 点击外部区域关闭
  useEffect(() => {
    if (!expanded) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        // 检查是否点击了下拉菜单
        if (dropdownRef.current && dropdownRef.current.contains(event.target as Node)) {
          return;
        }
        setExpanded(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [expanded]);

  // 下拉菜单内容
  const dropdownContent = expanded && (
    <div
      ref={dropdownRef}
      style={{
        ...getDropdownStyle(),
        background: '#fff',
        border: '1px solid #e5e6eb',
        borderRadius: '6px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        padding: '8px',
        minWidth: '240px',
      }}
    >
      {contacts.length > 0 ? (
        <>
          {contacts.map((contact) => (
            <div 
              key={contact.id} 
              style={{ 
                padding: '8px', 
                borderBottom: '1px solid #f2f3f5',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                  <span style={{ fontWeight: '500', fontSize: '13px', color: '#1d2129' }}>
                    {contact.name || '未命名'}
                  </span>
                  {contact.is_primary && (
                    <span style={{
                      fontSize: '10px',
                      color: '#165dff',
                      background: '#e8f3ff',
                      padding: '1px 4px',
                      borderRadius: '2px',
                    }}>
                      首选
                    </span>
                  )}
                  {contact.position && (
                    <span style={{ fontSize: '11px', color: '#86909c' }}>{contact.position}</span>
                  )}
                </div>
                <div style={{ fontSize: '12px', color: '#4e5969', lineHeight: '1.6' }}>
                  {contact.phone && <div>手机号：{contact.phone}</div>}
                  {contact.wechat && <div>微信号：{contact.wechat}</div>}
                  {contact.wecom_id && <div>企微ID：{contact.wecom_id}</div>}
                </div>
                {contact.remark && (
                  <div style={{ fontSize: '11px', color: '#86909c', marginTop: '4px' }}>
                    {contact.remark}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingContact(contact);
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '2px',
                    color: '#86909c',
                  }}
                  title="编辑"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                  </svg>
                </button>
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (confirm('确定删除此联系人？')) {
                      await fetch(`/api/contacts/${contact.id}`, { method: 'DELETE' });
                      onUpdate();
                    }
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '2px',
                    color: '#f53f3f',
                  }}
                  title="删除"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                  </svg>
                </button>
              </div>
            </div>
          ))}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowAddModal(true);
            }}
            style={{
              width: '100%',
              padding: '6px',
              marginTop: '8px',
              background: '#f7f8fa',
              border: '1px dashed #c9cdd4',
              borderRadius: '4px',
              cursor: 'pointer',
              color: '#4e5969',
              fontSize: '12px',
            }}
          >
            + 添加联系人
          </button>
        </>
      ) : (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowAddModal(true);
          }}
          style={{
            width: '100%',
            padding: '8px',
            background: '#f7f8fa',
            border: '1px dashed #c9cdd4',
            borderRadius: '4px',
            cursor: 'pointer',
            color: '#4e5969',
            fontSize: '12px',
          }}
        >
          + 添加联系人
        </button>
      )}
    </div>
  );

  return (
    <>
      <div style={{ position: 'relative' }} ref={containerRef}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            cursor: 'pointer',
            minWidth: '100px',
          }}
          onClick={() => setExpanded(!expanded)}
        >
          {contacts.length > 0 ? (
            <>
              <span style={{
                fontSize: '13px',
                color: '#1d2129',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {primaryContact?.name || primaryContact?.phone || '联系人'}
              </span>
              {contacts.length > 1 && (
                <span style={{
                  fontSize: '11px',
                  color: '#fff',
                  background: '#165dff',
                  borderRadius: '10px',
                  padding: '0 5px',
                  height: '16px',
                  lineHeight: '16px',
                }}>
                  +{contacts.length - 1}
                </span>
              )}
            </>
          ) : (
            <span style={{ color: '#c9cdd4', fontSize: '13px' }}>-</span>
          )}
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#86909c"
            strokeWidth="2"
            style={{
              transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s',
            }}
          >
            <path d="M6 9l6 6 6-6"/>
          </svg>
        </div>
      </div>

      {/* 使用 Portal 渲染下拉菜单到 body，置顶显示 */}
      {typeof document !== 'undefined' && createPortal(dropdownContent, document.body)}

      {/* 添加/编辑联系人弹窗 */}
      {(showAddModal || editingContact) && (
        <ContactModal
          storeId={store.id}
          contact={editingContact}
          onClose={() => {
            setShowAddModal(false);
            setEditingContact(null);
          }}
          onSuccess={(updatedContact) => {
            setShowAddModal(false);
            setEditingContact(null);
            if (updatedContact) {
              // 如果是编辑模式，更新现有联系人
              if (editingContact) {
                setLocalContacts(prev => prev.map(c => 
                  c.id === editingContact.id ? { ...c, ...updatedContact } : c
                ));
              } else {
                // 新增模式，添加联系人
                setLocalContacts(prev => [...prev, updatedContact as Contact]);
              }
            }
            onUpdate();
          }}
        />
      )}
    </>
  );
});

// 联系人编辑弹窗
const ContactModal = React.memo(function ContactModal({
  storeId,
  contact,
  onClose,
  onSuccess
}: {
  storeId: string;
  contact: Contact | null;
  onClose: () => void;
  onSuccess: (updatedContact?: Partial<Contact>) => void;
}) {
  const [form, setForm] = useState({
    name: contact?.name || '',
    position: contact?.position || '',
    phone: contact?.phone || '',
    wechat: contact?.wechat || '',
    wecom_id: contact?.wecom_id || '',
    remark: contact?.remark || '',
    is_primary: contact?.is_primary || false,
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    setSaving(true);
    try {
      if (contact) {
        // 编辑
        const res = await fetch(`/api/contacts/${contact.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
        const data = await res.json();
        if (data.success) {
          onSuccess({ ...contact, ...form, updated_at: new Date().toISOString() });
        }
      } else {
        // 新增
        const res = await fetch('/api/contacts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ store_id: storeId, ...form }),
        });
        const data = await res.json();
        if (data.success && data.data) {
          onSuccess(data.data);
        } else {
          onSuccess();
        }
      }
    } catch (error) {
      console.error('保存联系人失败:', error);
    }
    setSaving(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ width: '400px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{contact ? '编辑联系人' : '添加联系人'}</h3>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', color: '#86909c' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'grid', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', color: '#4e5969', marginBottom: '4px' }}>姓名</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="input"
                placeholder="请输入姓名"
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', color: '#4e5969', marginBottom: '4px' }}>职位</label>
              <input
                value={form.position}
                onChange={(e) => setForm({ ...form, position: e.target.value })}
                className="input"
                placeholder="请输入职位"
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', color: '#4e5969', marginBottom: '4px' }}>电话</label>
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="input"
                placeholder="请输入电话"
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', color: '#4e5969', marginBottom: '4px' }}>微信</label>
              <input
                value={form.wechat}
                onChange={(e) => setForm({ ...form, wechat: e.target.value })}
                className="input"
                placeholder="请输入微信号"
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', color: '#4e5969', marginBottom: '4px' }}>企业微信ID</label>
              <input
                value={form.wecom_id}
                onChange={(e) => setForm({ ...form, wecom_id: e.target.value })}
                className="input"
                placeholder="请输入企业微信ID"
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', color: '#4e5969', marginBottom: '4px' }}>备注</label>
              <textarea
                value={form.remark}
                onChange={(e) => setForm({ ...form, remark: e.target.value })}
                className="input"
                placeholder="请输入备注"
                rows={2}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="checkbox"
                checked={form.is_primary}
                onChange={(e) => setForm({ ...form, is_primary: e.target.checked })}
                id="is_primary"
              />
              <label htmlFor="is_primary" style={{ fontSize: '13px', color: '#4e5969' }}>设为首选联系人</label>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button onClick={onClose} className="btn btn-secondary">取消</button>
          <button onClick={handleSubmit} className="btn btn-primary" disabled={saving}>
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
});

// 地区统计表头组件（带气泡显示区域和城市等级统计）
const LocationHeaderWithStats = React.memo(function LocationHeaderWithStats({ stores }: { stores: Store[] }) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [activeTab, setActiveTab] = useState<'region' | 'tier'>('region');
  const containerRef = useRef<HTMLDivElement>(null);

  // 计算区域统计
  const regionStats = useMemo(() => {
    const stats: Record<string, { total: number; operating: number; closed: number; paused: number }> = {};
    const regions = ['华北区', '华东区', '华中区', '华南区', '西部区', '其他'];
    
    regions.forEach(region => {
      stats[region] = { total: 0, operating: 0, closed: 0, paused: 0 };
    });

    stores.forEach(store => {
      const region = getProvinceRegion(store.province);
      if (!stats[region]) {
        stats[region] = { total: 0, operating: 0, closed: 0, paused: 0 };
      }
      stats[region].total++;
      if (store.business_status === '服务中') {
        stats[region].operating++;
      } else if (store.business_status === '取消合作') {
        stats[region].closed++;
      } else {
        stats[region].paused++;
      }
    });

    return stats;
  }, [stores]);

  // 计算城市等级统计
  const tierStats = useMemo(() => {
    const stats: Record<string, { total: number; operating: number; closed: number; paused: number }> = {};
    const tiers = ['一线城市', '新一线城市', '二线城市', '三线城市', '其他'];
    
    tiers.forEach(tier => {
      stats[tier] = { total: 0, operating: 0, closed: 0, paused: 0 };
    });

    stores.forEach(store => {
      const { tier } = getCityTier(store.city);
      if (!stats[tier]) {
        stats[tier] = { total: 0, operating: 0, closed: 0, paused: 0 };
      }
      stats[tier].total++;
      if (store.business_status === '服务中') {
        stats[tier].operating++;
      } else if (store.business_status === '取消合作') {
        stats[tier].closed++;
      } else {
        stats[tier].paused++;
      }
    });

    return stats;
  }, [stores]);

  const handleMouseEnter = (e: React.MouseEvent) => {
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setPosition({ x: rect.left, y: rect.bottom + 4 });
    setShowTooltip(true);
  };

  const renderStats = (stats: Record<string, { total: number; operating: number; closed: number; paused: number }>) => {
    return Object.entries(stats)
      .filter(([_, data]) => data.total > 0)
      .map(([name, data]) => (
        <div key={name} style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          padding: '8px 0',
          borderBottom: '1px solid #f2f3f5',
        }}>
          <span style={{ fontSize: '13px', color: '#1d2129', fontWeight: 500 }}>{name}</span>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: '#1d2129', fontWeight: 600 }}>{data.total}家</span>
            <span style={{ fontSize: '11px', color: '#00b42a' }}>服务{data.operating}</span>
            <span style={{ fontSize: '11px', color: '#f53f3f' }}>取消合作{data.closed}</span>
            {data.paused > 0 && <span style={{ fontSize: '11px', color: '#86909c' }}>其他{data.paused}</span>}
          </div>
        </div>
      ));
  };

  return (
    <div 
      ref={containerRef}
      style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <span style={{ fontSize: '12px', color: '#86909c' }}>地区</span>
      {showTooltip && createPortal(
        <div
          style={{
            position: 'fixed',
            left: position.x,
            top: position.y,
            background: '#fff',
            color: '#1d2129',
            padding: '12px 16px',
            borderRadius: '8px',
            fontSize: '12px',
            minWidth: '320px',
            maxWidth: '400px',
            zIndex: 9999,
            boxShadow: '0 6px 20px rgba(0,0,0,0.12)',
            border: '1px solid #e5e6eb',
          }}
        >
          {/* 标签切换 */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            <button
              onClick={() => setActiveTab('region')}
              style={{
                padding: '6px 12px',
                border: 'none',
                borderRadius: '4px',
                fontSize: '12px',
                cursor: 'pointer',
                background: activeTab === 'region' ? '#165dff' : '#f2f3f5',
                color: activeTab === 'region' ? '#fff' : '#86909c',
                fontWeight: 500,
              }}
            >
              按区域
            </button>
            <button
              onClick={() => setActiveTab('tier')}
              style={{
                padding: '6px 12px',
                border: 'none',
                borderRadius: '4px',
                fontSize: '12px',
                cursor: 'pointer',
                background: activeTab === 'tier' ? '#165dff' : '#f2f3f5',
                color: activeTab === 'tier' ? '#fff' : '#86909c',
                fontWeight: 500,
              }}
            >
              按城市等级
            </button>
          </div>
          
          {/* 统计内容 */}
          <div>
            {activeTab === 'region' ? renderStats(regionStats) : renderStats(tierStats)}
          </div>
          
          {/* 说明 */}
          <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px solid #e5e6eb', fontSize: '11px', color: '#86909c' }}>
            {activeTab === 'region' ? '按商业5大区划分：华北区、华东区、华中区、华南区、西部区' : '按一线、新一线、二线等城市等级划分'}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
});

// 带悬停气泡的表头组件
const HeaderWithTooltip = React.memo(function HeaderWithTooltip({ label, tooltip, color }: { label: string; tooltip: string; color?: string }) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseEnter = (e: React.MouseEvent) => {
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setPosition({ x: rect.left, y: rect.bottom + 4 });
    setShowTooltip(true);
    setIsHovered(true);
  };

  return (
    <div 
      ref={containerRef}
      style={{ display: 'inline', color: color || 'inherit' }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => { setShowTooltip(false); setIsHovered(false); }}
    >
      <span style={{ textDecorationLine: isHovered ? 'underline' : 'none', textDecorationStyle: 'dotted', textUnderlineOffset: '2px' }}>{label}</span>
      {showTooltip && createPortal(
        <div
          style={{
            position: 'fixed',
            left: position.x,
            top: position.y,
            background: '#1d2129',
            color: '#fff',
            padding: '8px 12px',
            borderRadius: '6px',
            fontSize: '12px',
            lineHeight: '1.5',
            maxWidth: '280px',
            zIndex: 9999,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            whiteSpace: 'pre-wrap',
          }}
        >
          {tooltip}
        </div>,
        document.body
      )}
    </div>
  );
});
// 字节风格日期范围选择器 - 左侧快捷栏 + 右侧双月日历 (置顶版)
const DateRangePicker = React.memo(function DateRangePicker({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
}: {
  startDate: string;
  endDate: string;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // 格式化显示文本
  const displayText = useMemo(() => {
    if (startDate && endDate) {
      const parseLocalDate = (dateStr: string) => {
        const [year, month, day] = dateStr.split('-').map(Number);
        return new Date(year, month - 1, day);
      };
      const start = parseLocalDate(startDate);
      const end = parseLocalDate(endDate);
      const formatDate = (d: Date) => `${d.getMonth() + 1}月${d.getDate()}日`;
      return `${formatDate(start)} - ${formatDate(end)}`;
    } else if (startDate) {
      const [year, month, day] = startDate.split('-').map(Number);
      const start = new Date(year, month - 1, day);
      return `${start.getMonth() + 1}月${start.getDate()}日 - 选择结束`;
    } else if (endDate) {
      const [year, month, day] = endDate.split('-').map(Number);
      const end = new Date(year, month - 1, day);
      return `选择开始 - ${end.getMonth() + 1}月${end.getDate()}日`;
    }
    return '选择日期范围';
  }, [startDate, endDate]);

  // 生成单个月份的日历数据
  const generateCalendarDays = (year: number, month: number) => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startPadding = firstDay.getDay();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const days: { date: Date; isCurrentMonth: boolean; isToday: boolean; isStart: boolean; isEnd: boolean; isInRange: boolean }[] = [];
    
    // 上月填充
    const prevMonth = new Date(year, month, 0);
    for (let i = startPadding - 1; i >= 0; i--) {
      const date = new Date(year, month - 1, prevMonth.getDate() - i);
      days.push({ date, isCurrentMonth: false, isToday: false, isStart: false, isEnd: false, isInRange: false });
    }
    
    // 当月
    for (let i = 1; i <= lastDay.getDate(); i++) {
      const date = new Date(year, month, i);
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      const isStart = dateStr === startDate;
      const isEnd = dateStr === endDate;
      const isInRange = !!(startDate && endDate && dateStr > startDate && dateStr < endDate);
      days.push({ 
        date, 
        isCurrentMonth: true, 
        isToday: date.getTime() === today.getTime(),
        isStart,
        isEnd,
        isInRange
      });
    }
    
    // 下月填充
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      const date = new Date(year, month + 1, i);
      days.push({ date, isCurrentMonth: false, isToday: false, isStart: false, isEnd: false, isInRange: false });
    }
    
    return days;
  };

  const currentYear = currentMonth.getFullYear();
  const currentMonthIndex = currentMonth.getMonth();
  const nextMonthIndex = currentMonthIndex === 11 ? 0 : currentMonthIndex + 1;
  const nextMonthYear = currentMonthIndex === 11 ? currentYear + 1 : currentYear;

  const calendarDays1 = generateCalendarDays(currentYear, currentMonthIndex);
  const calendarDays2 = generateCalendarDays(nextMonthYear, nextMonthIndex);

  const handleDayClick = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    
    if (!startDate || (startDate && endDate)) {
      onStartDateChange(dateStr);
      onEndDateChange('');
    } else {
      if (dateStr < startDate) {
        onEndDateChange(startDate);
        onStartDateChange(dateStr);
      } else {
        onEndDateChange(dateStr);
      }
    }
  };

  const navigateMonth = (delta: number) => {
    const newMonth = new Date(currentYear, currentMonthIndex + delta, 1);
    setCurrentMonth(newMonth);
  };

  const handleQuickSelect = (type: string) => {
    const today = new Date();
    let start: Date, end: Date;
    
    switch (type) {
      case 'today':
        start = end = today;
        break;
      case 'yesterday':
        start = end = new Date(today);
        start.setDate(start.getDate() - 1);
        break;
      case 'last3days':
        start = new Date(today);
        start.setDate(start.getDate() - 2);
        end = today;
        break;
      case 'lastWeek':
        start = new Date(today);
        start.setDate(start.getDate() - 7);
        end = today;
        break;
      case 'thisMonth':
        start = new Date(today.getFullYear(), today.getMonth(), 1);
        end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        break;
      case 'lastMonth':
        start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        end = new Date(today.getFullYear(), today.getMonth(), 0);
        break;
      default:
        return;
    }
    
    onStartDateChange(start.toISOString().slice(0, 10));
    onEndDateChange(end.toISOString().slice(0, 10));
  };

  const clearDates = (e: React.MouseEvent) => {
    e.stopPropagation();
    onStartDateChange('');
    onEndDateChange('');
  };

  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];

  // 点击外部关闭 - 使用fixed定位后用click事件
  useEffect(() => {
    if (!isOpen) return;
    
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    
    // 使用setTimeout确保在当前点击事件之后执行
    const timer = setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
    }, 0);
    
    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleClickOutside);
    };
  }, [isOpen]);

  // 计算下拉面板位置
  const updateDropdownPosition = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 8,
        left: rect.left,
      });
    }
  };

  const handleToggle = () => {
    if (!isOpen) {
      updateDropdownPosition();
    }
    setIsOpen(!isOpen);
  };

  const renderCalendar = (days: ReturnType<typeof generateCalendarDays>, year: number, month: number) => (
    <div style={{ flex: 1, minWidth: '220px' }}>
      {/* 月份标题 */}
      <div style={{ textAlign: 'center', fontSize: '16px', fontWeight: 600, color: '#222', marginBottom: '12px' }}>
        {year}年{month + 1}月
      </div>
      
      {/* 星期头 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: '4px' }}>
        {weekDays.map(day => (
          <div key={day} style={{ textAlign: 'center', fontSize: '12px', color: '#999', padding: '8px 0' }}>{day}</div>
        ))}
      </div>
      
      {/* 日期网格 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
        {days.map((day, index) => {
          const isSelected = day.isStart || day.isEnd;
          
          return (
            <button
              key={index}
              type="button"
              onClick={() => handleDayClick(day.date)}
              style={{
                width: '100%',
                aspectRatio: '1',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '14px',
                border: 'none',
                borderRadius: '50%',
                background: isSelected ? '#165dff' : 'transparent',
                color: isSelected ? '#fff' : !day.isCurrentMonth ? '#ccc' : '#333',
                fontWeight: day.isToday && !isSelected ? 600 : 400,
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => {
                if (!isSelected && day.isCurrentMonth) {
                  e.currentTarget.style.background = '#f5f5f5';
                }
              }}
              onMouseLeave={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.background = 'transparent';
                }
              }}
            >
              {day.date.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block' }}>
      {/* 触发器 */}
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 12px',
          fontSize: '13px',
          border: '1px solid #e5e6eb',
          borderRadius: '6px',
          background: '#fff',
          color: '#333',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="16" y1="2" x2="16" y2="6"></line>
          <line x1="8" y1="2" x2="8" y2="6"></line>
          <line x1="3" y1="10" x2="21" y2="10"></line>
        </svg>
        <span>{displayText}</span>
        {(startDate || endDate) && (
          <span 
            onClick={clearDates} 
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              color: '#999',
              cursor: 'pointer',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </span>
        )}
      </button>

      {/* 下拉面板 - 使用fixed定位置顶 */}
      {isOpen && (
        <div 
          style={{
            position: 'fixed',
            top: `${dropdownPosition.top}px`,
            left: `${dropdownPosition.left}px`,
            zIndex: 999999,
            background: '#fff',
            border: '1px solid #e5e6eb',
            borderRadius: '8px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12)',
            padding: '20px',
            display: 'flex',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* 左侧快捷选择栏 */}
          <div style={{ 
            borderRight: '1px solid #eee', 
            paddingRight: '20px', 
            marginRight: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
            minWidth: '80px',
          }}>
            {[
              { key: 'today', label: '今天' },
              { key: 'yesterday', label: '昨天' },
              { key: 'last3days', label: '近3天' },
              { key: 'lastWeek', label: '近7天' },
              { key: 'thisMonth', label: '本月' },
              { key: 'lastMonth', label: '上月' },
            ].map(item => (
              <button
                key={item.key}
                type="button"
                onClick={() => handleQuickSelect(item.key)}
                style={{
                  padding: '10px 12px',
                  fontSize: '14px',
                  border: 'none',
                  borderRadius: '4px',
                  background: 'transparent',
                  color: '#333',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#f5f5f5';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* 中间月份导航 */}
          <div style={{ 
            display: 'flex', 
            flexDirection: 'column',
            justifyContent: 'center',
            marginRight: '24px',
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                type="button"
                onClick={() => navigateMonth(-2)}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '8px', color: '#666', fontSize: '14px' }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#165dff'}
                onMouseLeave={(e) => e.currentTarget.style.color = '#666'}
              >
                &lt;&lt;
              </button>
              <button
                type="button"
                onClick={() => navigateMonth(-1)}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '8px', color: '#666', fontSize: '14px' }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#165dff'}
                onMouseLeave={(e) => e.currentTarget.style.color = '#666'}
              >
                &lt;
              </button>
              <button
                type="button"
                onClick={() => navigateMonth(1)}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '8px', color: '#666', fontSize: '14px' }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#165dff'}
                onMouseLeave={(e) => e.currentTarget.style.color = '#666'}
              >
                &gt;
              </button>
              <button
                type="button"
                onClick={() => navigateMonth(2)}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '8px', color: '#666', fontSize: '14px' }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#165dff'}
                onMouseLeave={(e) => e.currentTarget.style.color = '#666'}
              >
                &gt;&gt;
              </button>
            </div>
          </div>

          {/* 右侧双月日历 */}
          <div style={{ display: 'flex', gap: '32px' }}>
            {renderCalendar(calendarDays1, currentYear, currentMonthIndex)}
            {renderCalendar(calendarDays2, nextMonthYear, nextMonthIndex)}
          </div>
        </div>
      )}
    </div>
  );
});

// 门店数据分析面板
const StoreAnalyticsPanel = React.memo(function StoreAnalyticsPanel({ storeId, refreshKey, timeStart, timeEnd, currentSystem = 'mama' }: {
  storeId: string | null;
  refreshKey?: number;
  timeStart?: string;
  timeEnd?: string;
  currentSystem?: StoreSystem;
}) {
  const [analytics, setAnalytics] = useState<{
    totalOrders: number;
    fakeOrders: number;
    validOrders: number;
    avgPrice: string;
    totalAmount: string;
    refundCount: number;
    refundRate: string;
    sameDayRefundCount: number;
    sameDayRefundRate: string;
    unverifiedCount: number;
    unverifiedRate: string;
    verifyCount: number;
    verifyRate: string;
    verifyAvgPrice: string;
    verifyAmount: string;
    amountVerifyRate: string;
    hasOrderFile: boolean;
    hasVerifyFile: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!storeId) return;
    
    const fetchData = () => {
      setLoading(true);
      try {
        // 从localStorage读取聚合数据
        let orderStats: OrderAggregatedData | null = null;
        let verifyStats: VerifyAggregatedData | null = null;

        const orderStatsStr = localStorage.getItem(getStorageKey('orderStats', currentSystem));
        const verifyStatsStr = localStorage.getItem(getStorageKey('verifyStats', currentSystem));

        if (orderStatsStr) {
          orderStats = JSON.parse(orderStatsStr);
        }
        if (verifyStatsStr) {
          verifyStats = JSON.parse(verifyStatsStr);
        }

        // 判断文件是否存在
        const hasOrderFile = !!orderStats;
        const hasVerifyFile = !!verifyStats;

        // 如果两个文件都不存在，不显示分析
        if (!hasOrderFile && !hasVerifyFile) {
          setAnalytics(null);
          setLoading(false);
          return;
        }

        // 获取该门店的统计数据
        const storeOrderStats = orderStats?.storeStats[String(storeId)];
        const storeVerifyStats = verifyStats?.storeStats[String(storeId)];
        
        // 时间筛选辅助函数
        const isInRange = (dateStr: string, start: string, end: string) => {
          if (!start && !end) return true;
          if (!dateStr) return false;
          if (start && dateStr < start) return false;
          if (end && dateStr > end) return false;
          return true;
        };

        // 从聚合数据中汇总指标
        let totalOrders = 0;
        let fakeOrders = 0;
        let totalAmount = 0;
        let refundCount = 0;
        let sameDayRefundCount = 0;
        let unverifiedCount = 0;
        let verifyCount = 0;
        let verifyAmount = 0;

        // 汇总订单数据
        if (storeOrderStats?.dailyStats) {
          for (const [dateStr, dailyStats] of Object.entries(storeOrderStats.dailyStats)) {
            if (isInRange(dateStr, timeStart || '', timeEnd || '')) {
              totalOrders += dailyStats.orderCount;
              fakeOrders += dailyStats.fakeOrderCount;
              totalAmount += dailyStats.orderAmount;
              refundCount += dailyStats.refundCount;
              sameDayRefundCount += dailyStats.sameDayRefundCount;
              unverifiedCount += dailyStats.unverifiedCount;
            }
          }
        }

        // 汇总核销数据
        if (storeVerifyStats?.dailyStats) {
          for (const [dateStr, dailyStats] of Object.entries(storeVerifyStats.dailyStats)) {
            if (isInRange(dateStr, timeStart || '', timeEnd || '')) {
              verifyCount += dailyStats.verifyCount;
              verifyAmount += dailyStats.verifyAmount;
            }
          }
        }
        
        // ========== 按照用户提供的计算公式计算指标 ==========

        // 1. 抖音订单数（成交券数）
        // 2. 刷单数量
        // 5. 退款数
        // 6. 退款率 = (退款数 / 订单数) × 100%
        const refundRate = totalOrders > 0 ? (refundCount / totalOrders * 100).toFixed(2) : '0';

        // 7. 当天退款数
        // 8. 当天退款率 = (当天退款数 / 退款数) × 100%
        const sameDayRefundRate = refundCount > 0 ? (sameDayRefundCount / refundCount * 100).toFixed(2) : '0';

        // 3. 有效订单数 = 订单数 - 退款数 - 刷单数量
        const validOrders = Math.max(0, totalOrders - refundCount - fakeOrders);

        // 14. 订单总额
        // 4. 订单均价 = 订单总额 / 订单数
        const avgPrice = totalOrders > 0 ? (totalAmount / totalOrders).toFixed(2) : '0';

        // 9. 未核销数
        // 10. 未核销率 = (未核销数 / 订单数) × 100%
        const unverifiedRate = totalOrders > 0 ? (unverifiedCount / totalOrders * 100).toFixed(2) : '0';

        // 11. 核销数
        // 12. 核销率 = (核销数 / 订单数) × 100%
        const verifyRate = totalOrders > 0 ? (verifyCount / totalOrders * 100).toFixed(2) : '0';

        // 13. 核销均价 = 核销金额 / 核销数
        const verifyAvgPrice = verifyCount > 0 ? (verifyAmount / verifyCount).toFixed(2) : '0';

        // 15. 核销总额
        // 16. 金额核销率 = (核销金额 / 订单金额) × 100%
        const amountVerifyRate = totalAmount > 0 ? (verifyAmount / totalAmount * 100).toFixed(2) : '0';
        
        setAnalytics({
          totalOrders,
          fakeOrders,
          validOrders,
          avgPrice,
          totalAmount: totalAmount.toFixed(2),
          refundCount,
          refundRate,
          sameDayRefundCount,
          sameDayRefundRate,
          unverifiedCount,
          unverifiedRate,
          verifyCount,
          verifyRate,
          verifyAvgPrice,
          verifyAmount: verifyAmount.toFixed(2),
          amountVerifyRate,
          hasOrderFile,
          hasVerifyFile,
        });
      } catch (error) {
        console.error('获取分析数据失败:', error);
        setAnalytics(null);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [storeId, refreshKey, timeStart, timeEnd, currentSystem]);

  if (loading) {
    return (
      <div style={{ padding: '16px', color: '#86909c', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div className="loading-spinner" style={{ width: '14px', height: '14px' }}></div>
        加载数据中...
      </div>
    );
  }

  // 如果没有数据，显示提示
  if (!analytics) {
    return (
      <div style={{ padding: '16px', color: '#86909c', fontSize: '13px' }}>
        暂无该门店数据
      </div>
    );
  }

  // 根据文件状态显示指标
  const metrics = [
    { label: '抖音订单数', value: analytics.hasOrderFile ? analytics.totalOrders : '*', color: analytics.hasOrderFile ? undefined : '#ff7d00' },
    { label: '刷单数量', value: analytics.hasOrderFile ? analytics.fakeOrders : '*', color: analytics.hasOrderFile ? '#86909c' : '#ff7d00' },
    { label: '有效订单数', value: analytics.hasOrderFile ? analytics.validOrders : '*', color: analytics.hasOrderFile ? '#00b42a' : '#ff7d00' },
    { label: '订单均价', value: analytics.hasOrderFile ? `¥${analytics.avgPrice}` : '*', color: analytics.hasOrderFile ? undefined : '#ff7d00' },
    { label: '订单总额', value: analytics.hasOrderFile ? `¥${analytics.totalAmount}` : '*', color: analytics.hasOrderFile ? undefined : '#ff7d00' },
    { label: '退款数', value: analytics.hasOrderFile ? analytics.refundCount : '*', color: analytics.hasOrderFile ? (analytics.refundCount > 0 ? '#f53f3f' : '#86909c') : '#ff7d00' },
    { label: '退款率', value: analytics.hasOrderFile ? `${analytics.refundRate}%` : '*', color: analytics.hasOrderFile ? (analytics.refundRate !== '0' ? '#f53f3f' : '#86909c') : '#ff7d00' },
    { label: '当天退款数', value: analytics.hasOrderFile ? analytics.sameDayRefundCount : '*', color: analytics.hasOrderFile ? (analytics.sameDayRefundCount > 0 ? '#f53f3f' : '#86909c') : '#ff7d00' },
    { label: '当天退款率', value: analytics.hasOrderFile ? `${analytics.sameDayRefundRate}%` : '*', color: analytics.hasOrderFile ? (analytics.sameDayRefundRate !== '0' ? '#f53f3f' : '#86909c') : '#ff7d00' },
    { label: '未核销数', value: analytics.hasOrderFile ? analytics.unverifiedCount : '*', color: analytics.hasOrderFile ? (analytics.unverifiedCount > 0 ? '#ff7d00' : '#86909c') : '#ff7d00' },
    { label: '未核销率', value: analytics.hasOrderFile ? `${analytics.unverifiedRate}%` : '*', color: analytics.hasOrderFile ? '#86909c' : '#ff7d00' },
    { label: '核销数', value: analytics.hasVerifyFile ? analytics.verifyCount : '*', color: analytics.hasVerifyFile ? '#165dff' : '#ff7d00' },
    { label: '核销率', value: analytics.hasVerifyFile ? `${analytics.verifyRate}%` : '*', color: analytics.hasVerifyFile ? '#165dff' : '#ff7d00' },
    { label: '核销均价', value: analytics.hasVerifyFile ? `¥${analytics.verifyAvgPrice}` : '*', color: analytics.hasVerifyFile ? '#165dff' : '#ff7d00' },
    { label: '核销总额', value: analytics.hasVerifyFile ? `¥${analytics.verifyAmount}` : '*', color: analytics.hasVerifyFile ? '#165dff' : '#ff7d00' },
    { label: '金额核销率', value: analytics.hasVerifyFile ? `${analytics.amountVerifyRate}%` : '*', color: analytics.hasVerifyFile ? '#165dff' : '#ff7d00' },
  ];

  return (
    <div style={{ 
      padding: '12px 24px',
      background: '#fafbfc',
      borderBottom: '1px solid #f2f3f5',
      overflowX: 'auto'
    }}>
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(16, minmax(80px, 1fr))',
        gap: '8px',
        minWidth: '1280px'
      }}>
        {metrics.map((m, i) => (
          <div key={i} style={{ 
            textAlign: 'center',
            padding: '8px 4px',
            background: '#fff',
            borderRadius: '6px',
            border: '1px solid #f2f3f5'
          }}>
            <div style={{ fontSize: '11px', color: '#86909c', marginBottom: '4px', whiteSpace: 'nowrap' }}>{m.label}</div>
            <div style={{ 
              fontSize: '14px', 
              fontWeight: '600',
              color: m.color || '#1d2129'
            }}>{m.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
});

// ========== 高级筛选器组件 ==========

// 筛选维度定义
type FilterDimension = 'store' | 'order' | 'performance';

// 字段定义
interface FilterField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'date';
  options?: { value: string; label: string }[];
  dimension: FilterDimension;
}

// 筛选条件类型
interface AdvancedFilterCondition {
  id: number;
  dimension: FilterDimension;
  field: string;
  operator: string;
  value: string | number;
}

// 维度配置
const DIMENSION_CONFIG: Record<FilterDimension, { label: string; color: string }> = {
  store: { label: '门店', color: '#165dff' },
  order: { label: '订单', color: '#00b42a' },
  performance: { label: '业绩', color: '#ff7d00' },
};

// 门店维度字段
const STORE_FIELDS: FilterField[] = [
  { key: 'store_name', label: '门店名称', type: 'text', dimension: 'store' },
  { key: 'business_status', label: '服务状态', type: 'select', dimension: 'store', options: [
    { value: '服务中', label: '服务中' },
    { value: '搭建中', label: '搭建中' },
    { value: '取消合作', label: '取消合作' },
  ]},
  { key: 'category', label: '商管', type: 'text', dimension: 'store' },
  { key: 'province', label: '省份', type: 'text', dimension: 'store' },
  { key: 'city', label: '城市', type: 'text', dimension: 'store' },
  { key: 'address', label: '地址', type: 'text', dimension: 'store' },
  { key: 'merchant_name', label: '商户名称', type: 'text', dimension: 'store' },
  { key: 'merchant_phone', label: '商户电话', type: 'text', dimension: 'store' },
];

// 订单维度字段
const ORDER_FIELDS: FilterField[] = [
  { key: 'totalOrders', label: '订单总数', type: 'number', dimension: 'order' },
  { key: 'validOrders', label: '有效订单数', type: 'number', dimension: 'order' },
  { key: 'fakeOrders', label: '刷单数', type: 'number', dimension: 'order' },
  { key: 'refundCount', label: '退款数', type: 'number', dimension: 'order' },
  { key: 'unverifiedCount', label: '未核销数', type: 'number', dimension: 'order' },
  { key: 'totalAmount', label: '成交金额', type: 'number', dimension: 'order' },
  { key: 'validOrderAmount', label: '有效订单金额', type: 'number', dimension: 'order' },
  { key: 'refundAmount', label: '退款金额', type: 'number', dimension: 'order' },
];

// 业绩维度字段
const PERFORMANCE_FIELDS: FilterField[] = [
  { key: 'verifyCount', label: '核销数', type: 'number', dimension: 'performance' },
  { key: 'validVerifyCount', label: '有效核销数', type: 'number', dimension: 'performance' },
  { key: 'fakeVerifyCount', label: '虚假核销数', type: 'number', dimension: 'performance' },
  { key: 'verifyRate', label: '核销率', type: 'number', dimension: 'performance' },
  { key: 'validVerifyRate', label: '有效核销率', type: 'number', dimension: 'performance' },
  { key: 'amountVerifyRate', label: '金额核销率', type: 'number', dimension: 'performance' },
  { key: 'validAmountRate', label: '有效金额率', type: 'number', dimension: 'performance' },
  { key: 'verifyAmount', label: '核销金额', type: 'number', dimension: 'performance' },
  { key: 'validVerifyAmount', label: '有效核销金额', type: 'number', dimension: 'performance' },
  { key: 'adInvestment', label: '广告投入', type: 'number', dimension: 'performance' },
];

// 操作符定义
const OPERATORS: Record<string, { value: string; label: string }[]> = {
  text: [
    { value: 'eq', label: '等于' },
    { value: 'ne', label: '不等于' },
    { value: 'contains', label: '包含' },
  ],
  number: [
    { value: 'eq', label: '等于' },
    { value: 'ne', label: '不等于' },
    { value: 'gt', label: '大于' },
    { value: 'gte', label: '大于等于' },
    { value: 'lt', label: '小于' },
    { value: 'lte', label: '小于等于' },
  ],
  select: [
    { value: 'eq', label: '等于' },
    { value: 'ne', label: '不等于' },
  ],
  date: [
    { value: 'eq', label: '等于' },
    { value: 'gt', label: '晚于' },
    { value: 'lt', label: '早于' },
    { value: 'gte', label: '不早于' },
    { value: 'lte', label: '不晚于' },
  ],
};

// 高级筛选器组件
function AdvancedFilterModal({
  onClose,
  onApply,
  currentFilters,
}: {
  onClose: () => void;
  onApply: (filters: Array<{ field: string; operator: string; value: string | number }>) => void;
  currentFilters: Array<{ field: string; operator: string; value: string | number }>;
}) {
  const [conditions, setConditions] = useState<AdvancedFilterCondition[]>(
    currentFilters.length > 0
      ? currentFilters.map((f, i) => ({
          id: i,
          dimension: getFieldDimension(f.field),
          field: f.field,
          operator: f.operator,
          value: f.value,
        }))
      : [{ id: Date.now(), dimension: 'store', field: '', operator: 'eq', value: '' }]
  );

  // 获取字段的维度
  function getFieldDimension(fieldKey: string): FilterDimension {
    if (STORE_FIELDS.some(f => f.key === fieldKey)) return 'store';
    if (ORDER_FIELDS.some(f => f.key === fieldKey)) return 'order';
    if (PERFORMANCE_FIELDS.some(f => f.key === fieldKey)) return 'performance';
    return 'store';
  }

  // 获取字段定义
  function getFieldDef(key: string): FilterField | undefined {
    return [...STORE_FIELDS, ...ORDER_FIELDS, ...PERFORMANCE_FIELDS].find(f => f.key === key);
  }

  // 获取某维度下的字段
  function getFieldsForDimension(dimension: FilterDimension): FilterField[] {
    switch (dimension) {
      case 'store': return STORE_FIELDS;
      case 'order': return ORDER_FIELDS;
      case 'performance': return PERFORMANCE_FIELDS;
    }
  }

  // 添加筛选条件
  const addCondition = () => {
    if (conditions.length >= 2) return;
    setConditions([...conditions, { id: Date.now(), dimension: 'store', field: '', operator: 'eq', value: '' }]);
  };

  // 移除筛选条件
  const removeCondition = (id: number) => {
    if (conditions.length <= 1) return;
    setConditions(conditions.filter(c => c.id !== id));
  };

  // 更新筛选条件
  const updateCondition = (id: number, updates: Partial<AdvancedFilterCondition>) => {
    setConditions(conditions.map(c => {
      if (c.id !== id) return c;
      const updated = { ...c, ...updates };
      // 如果更改了维度，清空字段
      if (updates.dimension && updates.dimension !== c.dimension) {
        updated.field = '';
        updated.value = '';
      }
      // 如果更改了字段，重置操作符和值
      if (updates.field && updates.field !== c.field) {
        const fieldDef = getFieldDef(updates.field);
        updated.operator = fieldDef ? OPERATORS[fieldDef.type][0].value : 'eq';
        updated.value = '';
      }
      return updated;
    }));
  };

  // 应用筛选
  const handleApply = () => {
    const validFilters = conditions
      .filter(c => c.field && c.value !== '')
      .map(c => ({
        field: c.field,
        operator: c.operator,
        value: c.value,
      }));
    onApply(validFilters);
    onClose();
  };

  // 清除筛选
  const handleClear = () => {
    setConditions([{ id: Date.now(), dimension: 'store', field: '', operator: 'eq', value: '' }]);
    onApply([]);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ width: '720px', maxHeight: '85vh', borderRadius: '12px', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        {/* 标题栏 */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: '1px solid #e5e6eb',
          background: '#fff'
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#1d2129' }}>高级筛选</h3>
            <div style={{ fontSize: '12px', color: '#86909c', marginTop: '2px' }}>
              支持门店、订单、业绩三个维度的筛选，最多设置2个条件
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: '4px',
            color: '#86909c'
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        {/* 内容区 */}
        <div style={{ overflowY: 'auto', padding: '20px', background: '#f7f8fa' }}>
          {conditions.map((condition, index) => {
            const fieldDef = getFieldDef(condition.field);
            const availableFields = getFieldsForDimension(condition.dimension);
            const operators = fieldDef ? OPERATORS[fieldDef.type] : OPERATORS.text;

            return (
              <div key={condition.id} style={{
                background: '#fff',
                borderRadius: '8px',
                padding: '16px',
                marginBottom: index < conditions.length - 1 ? '12px' : 0,
                border: '1px solid #e5e6eb',
              }}>
                {/* 条件行 */}
                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                  {/* 维度选择 */}
                  <div style={{ flex: '0 0 100px' }}>
                    <label style={{ fontSize: '12px', color: '#86909c', display: 'block', marginBottom: '4px' }}>维度</label>
                    <select
                      value={condition.dimension}
                      onChange={e => updateCondition(condition.id, { dimension: e.target.value as FilterDimension })}
                      style={{
                        width: '100%',
                        padding: '8px',
                        fontSize: '13px',
                        borderRadius: '6px',
                        border: '1px solid #e5e6eb',
                        background: DIMENSION_CONFIG[condition.dimension].color + '10',
                        color: DIMENSION_CONFIG[condition.dimension].color,
                        fontWeight: 500,
                      }}
                    >
                      {(Object.keys(DIMENSION_CONFIG) as FilterDimension[]).map(dim => (
                        <option key={dim} value={dim}>{DIMENSION_CONFIG[dim].label}</option>
                      ))}
                    </select>
                  </div>

                  {/* 字段选择 */}
                  <div style={{ flex: '0 0 140px' }}>
                    <label style={{ fontSize: '12px', color: '#86909c', display: 'block', marginBottom: '4px' }}>字段</label>
                    <select
                      value={condition.field}
                      onChange={e => updateCondition(condition.id, { field: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '8px',
                        fontSize: '13px',
                        borderRadius: '6px',
                        border: '1px solid #e5e6eb',
                      }}
                    >
                      <option value="">请选择字段</option>
                      {availableFields.map(field => (
                        <option key={field.key} value={field.key}>{field.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* 操作符选择 */}
                  <div style={{ flex: '0 0 100px' }}>
                    <label style={{ fontSize: '12px', color: '#86909c', display: 'block', marginBottom: '4px' }}>条件</label>
                    <select
                      value={condition.operator}
                      onChange={e => updateCondition(condition.id, { operator: e.target.value })}
                      disabled={!condition.field}
                      style={{
                        width: '100%',
                        padding: '8px',
                        fontSize: '13px',
                        borderRadius: '6px',
                        border: '1px solid #e5e6eb',
                        opacity: condition.field ? 1 : 0.5,
                      }}
                    >
                      {operators.map(op => (
                        <option key={op.value} value={op.value}>{op.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* 值输入 */}
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '12px', color: '#86909c', display: 'block', marginBottom: '4px' }}>值</label>
                    {fieldDef?.type === 'select' ? (
                      <select
                        value={condition.value as string}
                        onChange={e => updateCondition(condition.id, { value: e.target.value })}
                        disabled={!condition.field}
                        style={{
                          width: '100%',
                          padding: '8px',
                          fontSize: '13px',
                          borderRadius: '6px',
                          border: '1px solid #e5e6eb',
                          opacity: condition.field ? 1 : 0.5,
                        }}
                      >
                        <option value="">请选择</option>
                        {fieldDef.options?.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={fieldDef?.type === 'number' ? 'number' : 'text'}
                        value={condition.value as string}
                        onChange={e => updateCondition(condition.id, { value: e.target.value })}
                        disabled={!condition.field}
                        placeholder={!condition.field ? '请先选择字段' : '请输入值'}
                        style={{
                          width: '100%',
                          padding: '8px',
                          fontSize: '13px',
                          borderRadius: '6px',
                          border: '1px solid #e5e6eb',
                          opacity: condition.field ? 1 : 0.5,
                        }}
                      />
                    )}
                  </div>

                  {/* 删除按钮 */}
                  {conditions.length > 1 && (
                    <button
                      onClick={() => removeCondition(condition.id)}
                      style={{
                        marginTop: '24px',
                        padding: '6px',
                        background: '#fff',
                        border: '1px solid #ffccc7',
                        borderRadius: '4px',
                        color: '#f53f3f',
                        cursor: 'pointer',
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"/>
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {/* 添加条件按钮 */}
          {conditions.length < 2 && (
            <button
              onClick={addCondition}
              style={{
                width: '100%',
                padding: '10px',
                marginTop: '12px',
                background: '#fff',
                border: '1px dashed #d9d9d9',
                borderRadius: '8px',
                color: '#86909c',
                fontSize: '13px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
              </svg>
              添加筛选条件
            </button>
          )}
        </div>

        {/* 底部按钮 */}
        <div style={{
          padding: '12px 20px',
          borderTop: '1px solid #e5e6eb',
          background: '#fff',
          display: 'flex',
          justifyContent: 'space-between'
        }}>
          <button
            onClick={handleClear}
            style={{
              padding: '8px 16px',
              background: '#fff',
              border: '1px solid #e5e6eb',
              borderRadius: '6px',
              color: '#86909c',
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            清除筛选
          </button>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={onClose}
              style={{
                padding: '8px 16px',
                background: '#fff',
                border: '1px solid #e5e6eb',
                borderRadius: '6px',
                color: '#1d2129',
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              取消
            </button>
            <button
              onClick={handleApply}
              style={{
                padding: '8px 20px',
                background: '#165dff',
                border: 'none',
                borderRadius: '6px',
                color: '#fff',
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              应用筛选
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
