import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

// 广告费按日统计
interface DailyAdStats {
  spend: number;     // 广告投入
  orders: number;    // 广告订单数
}

// 门店广告费统计
interface StoreAdStats {
  totalSpend: number;
  totalOrders: number;
  dailyStats: Record<string, DailyAdStats>;
}

// 单个账户结果
interface AccountResult {
  storeStats: Record<string, StoreAdStats>;
  timeRange: {
    minTime: string;
    maxTime: string;
  };
  stats: {
    totalRecords: number;
    matchedRecords: number;
    unmatchedRecords: number;
    totalSpend: number;
    totalOrders: number;
  };
}

// 辅助函数：解析日期，支持多种格式
const parseDate = (dateValue: any): string | null => {
  if (!dateValue) return null;
  
  // 如果是 Excel 日期序列号
  if (typeof dateValue === 'number') {
    const date = new Date((dateValue - 25569) * 86400 * 1000);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  
  // 如果是字符串
  const dateStr = String(dateValue).trim();
  
  // 尝试多种格式解析
  const formats = [
    // YYYY-MM-DD, YYYY/MM/DD
    /^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/,
    // MM-DD-YYYY, MM/DD/YYYY
    /^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/,
    // DD-MM-YYYY, DD/MM/YYYY
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
        // 假设是 DD-MM-YYYY
        year = parseInt(match[3]);
        month = parseInt(match[2]) - 1;
        day = parseInt(match[1]);
      } else {
        continue;
      }
      
      const date = new Date(year, month, day);
      if (!isNaN(date.getTime())) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
      }
    }
  }
  
  // 尝试直接用 Date 解析
  const date = new Date(dateStr);
  if (!isNaN(date.getTime())) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  
  return null;
};

// 辅助函数：解析数字
const parseNumber = (value: any): number => {
  if (typeof value === 'number') return value;
  if (!value) return 0;
  const str = String(value).replace(/[^\d.-]/g, '');
  return parseFloat(str) || 0;
};

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const accountIndexStr = formData.get('accountIndex') as string;
    
    // 新的单文件上传模式
    if (file && accountIndexStr !== null) {
      const accountIndex = parseInt(accountIndexStr);
      const storeIdSetStr = formData.get('storeIdSet') as string;
      
      if (!file) {
        return NextResponse.json({ error: '文件未上传' }, { status: 400 });
      }

      const storeIdSet = new Set<string>(storeIdSetStr ? JSON.parse(storeIdSetStr) : []);
      
      // 读取文件
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: null, blankrows: false }) as Record<string, unknown>[];
      
      console.log(`[广告费账户${accountIndex + 1}文件解析] 记录数: ${jsonData.length}`);
      
      // 聚合结果
      const storeStats: Record<string, StoreAdStats> = {};
      let minTime = '';
      let maxTime = '';
      let matchedCount = 0;
      let totalSpend = 0;
      let totalOrders = 0;
      
      // 辅助函数：添加到日期统计
      const addToDailyStats = (
        dailyStats: Record<string, DailyAdStats>,
        date: string,
        spend: number,
        orders: number
      ) => {
        if (!date) return;
        if (!dailyStats[date]) {
          dailyStats[date] = { spend: 0, orders: 0 };
        }
        dailyStats[date].spend += spend;
        dailyStats[date].orders += orders;
      };
      
      // 可能的列名
      const possibleColumnNames = {
        id: ['门店ID', 'store_id', '门店id', 'StoreId', 'store id', 'ID'],
        name: ['门店名称', 'store_name', '门店名', 'StoreName', 'store name', '名称'],
        spend: ['消耗(元)', '消耗'],
        orders: ['全域成交订单数', '订单数'],
        date: ['日期', 'date', '时间', 'day', 'Date']
      };
      
      // 处理每条记录
      for (const row of jsonData) {
        // 查找日期
        let dateStr = '';
        for (const colName of possibleColumnNames.date) {
          if (row[colName]) {
            const parsed = parseDate(row[colName]);
            if (parsed) {
              dateStr = parsed;
              break;
            }
          }
        }
        
        if (!dateStr) continue;
        
        // 更新时间范围
        if (!minTime || dateStr < minTime) minTime = dateStr;
        if (!maxTime || dateStr > maxTime) maxTime = dateStr;
        
        // 查找门店ID
        let storeId = '';
        for (const colName of possibleColumnNames.id) {
          if (row[colName] !== undefined && row[colName] !== null && row[colName] !== '') {
            storeId = String(row[colName]).trim();
            break;
          }
        }
        
        // 查找消耗和订单数
        let spend = 0;
        let orders = 0;
        
        for (const colName of possibleColumnNames.spend) {
          if (row[colName] !== undefined) {
            spend = parseNumber(row[colName]);
            break;
          }
        }
        
        for (const colName of possibleColumnNames.orders) {
          if (row[colName] !== undefined) {
            orders = parseNumber(row[colName]);
            break;
          }
        }
        
        // 累计总计
        totalSpend += spend;
        totalOrders += orders;
        
        // 判断是否匹配门店
        const isMatched = storeId && storeIdSet.has(storeId);
        
        if (isMatched) {
          matchedCount++;
          
          if (!storeStats[storeId]) {
            storeStats[storeId] = {
              totalSpend: 0,
              totalOrders: 0,
              dailyStats: {}
            };
          }
          
          // 累加总数
          storeStats[storeId].totalSpend += spend;
          storeStats[storeId].totalOrders += orders;
          
          // 按日统计
          addToDailyStats(storeStats[storeId].dailyStats, dateStr, spend, orders);
        }
      }
      
      const result: AccountResult = {
        storeStats,
        timeRange: { minTime, maxTime },
        stats: {
          totalRecords: jsonData.length,
          matchedRecords: matchedCount,
          unmatchedRecords: jsonData.length - matchedCount,
          totalSpend,
          totalOrders
        }
      };
      
      console.log(`[广告费账户${accountIndex + 1}解析] 完成: 匹配${matchedCount}/${jsonData.length}条, 门店数${Object.keys(storeStats).length}`);
      
      return NextResponse.json(result);
    }
    
    // 旧的多文件兼容模式（保留但标记为 deprecated）
    const files: File[] = [];
    for (let i = 1; i <= 6; i++) {
      const f = formData.get(`account${i}`) as File;
      if (f) files.push(f);
    }
    
    const storeIdSetStr = formData.get('storeIdSet') as string;
    
    if (files.length === 0) {
      return NextResponse.json({ error: '文件未上传' }, { status: 400 });
    }

    const storeIdSet = new Set<string>(storeIdSetStr ? JSON.parse(storeIdSetStr) : []);
    
    // 存储所有解析的数据
    const allRows: any[] = [];
    
    for (const f of files) {
      const arrayBuffer = await f.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: null, blankrows: false }) as Record<string, unknown>[];
      allRows.push(...jsonData);
    }
    
    console.log(`[广告费文件解析] 总记录数: ${allRows.length}`);
    
    // 聚合结果
    const storeStats: Record<string, StoreAdStats> = {};
    const unmatchedDailyStats: Record<string, DailyAdStats> = {};
    let minTime = '';
    let maxTime = '';
    let matchedCount = 0;
    let unmatchedSpend = 0;
    let unmatchedOrders = 0;
    
    // 辅助函数
    const addToDailyStats = (
      dailyStats: Record<string, DailyAdStats>,
      date: string,
      spend: number,
      orders: number
    ) => {
      if (!date) return;
      if (!dailyStats[date]) {
        dailyStats[date] = { spend: 0, orders: 0 };
      }
      dailyStats[date].spend += spend;
      dailyStats[date].orders += orders;
    };
    
    // 可能的列名
    const possibleColumnNames = {
      id: ['门店ID', 'store_id', '门店id', 'StoreId', 'store id', 'ID'],
      name: ['门店名称', 'store_name', '门店名', 'StoreName', 'store name', '名称'],
      spend: ['消耗(元)', '消耗'],
      orders: ['全域成交订单数', '订单数'],
      date: ['日期', 'date', '时间', 'day', 'Date']
    };
    
    // 处理每条记录
    for (const row of allRows) {
      let dateStr = '';
      for (const colName of possibleColumnNames.date) {
        if (row[colName]) {
          const parsed = parseDate(row[colName]);
          if (parsed) {
            dateStr = parsed;
            break;
          }
        }
      }
      
      if (!dateStr) continue;
      
      if (!minTime || dateStr < minTime) minTime = dateStr;
      if (!maxTime || dateStr > maxTime) maxTime = dateStr;
      
      let storeId = '';
      for (const colName of possibleColumnNames.id) {
        if (row[colName] !== undefined && row[colName] !== null && row[colName] !== '') {
          storeId = String(row[colName]).trim();
          break;
        }
      }
      
      let spend = 0;
      let orders = 0;
      
      for (const colName of possibleColumnNames.spend) {
        if (row[colName] !== undefined) {
          spend = parseNumber(row[colName]);
          break;
        }
      }
      
      for (const colName of possibleColumnNames.orders) {
        if (row[colName] !== undefined) {
          orders = parseNumber(row[colName]);
          break;
        }
      }
      
      const isMatched = storeId && storeIdSet.has(storeId);
      
      if (isMatched) {
        matchedCount++;
        
        if (!storeStats[storeId]) {
          storeStats[storeId] = { totalSpend: 0, totalOrders: 0, dailyStats: {} };
        }
        
        storeStats[storeId].totalSpend += spend;
        storeStats[storeId].totalOrders += orders;
        addToDailyStats(storeStats[storeId].dailyStats, dateStr, spend, orders);
      } else {
        unmatchedSpend += spend;
        unmatchedOrders += orders;
        addToDailyStats(unmatchedDailyStats, dateStr, spend, orders);
      }
    }
    
    const result = {
      storeStats,
      timeRange: { minTime, maxTime },
      stats: {
        totalRecords: allRows.length,
        matchedRecords: matchedCount,
        unmatchedRecords: allRows.length - matchedCount,
        totalAdInvestment: unmatchedSpend
      },
      unmatchedDailyStats,
      unmatchedTotal: { spend: unmatchedSpend, orders: unmatchedOrders }
    };
    
    console.log(`[广告费文件解析] 完成: 匹配${matchedCount}/${allRows.length}条, 门店数${Object.keys(storeStats).length}`);
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('广告费文件解析错误:', error);
    return NextResponse.json({ 
      error: '文件解析失败',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
