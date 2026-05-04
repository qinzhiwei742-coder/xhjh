import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/storage/database/local-pg';
import * as XLSX from 'xlsx';

interface ImportStoreData {
  '门店名称': string;
  '门店ID': string;
  '区域': string;
  '入驻时间': string;
  '门店面积': string;
  '员工人数': string;
  '获客渠道': string;
  '品类'?: string;
  '商户名称'?: string;
  '商户ID'?: string;
  '省份'?: string;
  '城市'?: string;
  '地址'?: string;
  '入驻状态'?: string;
  '营业电话1'?: string;
  '营业电话2'?: string;
  '营业电话3'?: string;
  '商户电话'?: string;
  '商务人员'?: string;
  '门店体系'?: string;
}

interface ImportResult {
  success: boolean;
  message: string;
  data?: {
    created: number;
    updated: number;
    errors: Array<{ row: number; message: string; storeName: string }>;
  };
}

const FIELD_MAPPING: Record<string, string> = {
  '面积': '门店面积',
  '人数': '员工人数',
};

const CITIES_BY_PROVINCE: Record<string, string[]> = {
  '北京市': ['北京市'],
  '天津市': ['天津市'],
  '上海市': ['上海市'],
  '重庆市': ['重庆市'],
  '河北省': ['石家庄市', '唐山市', '秦皇岛市', '邯郸市', '邢台市', '保定市', '张家口市', '承德市', '沧州市', '廊坊市', '衡水市'],
  '江苏省': ['南京市', '无锡市', '徐州市', '常州市', '苏州市', '南通市', '连云港市', '淮安市', '盐城市', '扬州市', '镇江市', '泰州市', '宿迁市'],
  '浙江省': ['杭州市', '宁波市', '温州市', '嘉兴市', '湖州市', '绍兴市', '金华市', '衢州市', '舟山市', '台州市', '丽水市'],
  '广东省': ['广州市', '韶关市', '深圳市', '珠海市', '汕头市', '佛山市', '江门市', '湛江市', '茂名市', '肇庆市', '惠州市', '梅州市', '汕尾市', '河源市', '阳江市', '清远市', '东莞市', '中山市', '潮州市', '揭阳市', '云浮市'],
};

const CITY_TO_PROVINCE: Record<string, string> = {};
Object.entries(CITIES_BY_PROVINCE).forEach(([province, cities]) => {
  cities.forEach(city => {
    CITY_TO_PROVINCE[city] = province;
    if (city.endsWith('市')) {
      CITY_TO_PROVINCE[city.replace('市', '')] = province;
    }
  });
});

function autoDetectProvince(city: string | undefined, province: string | undefined): { city: string | undefined; province: string | undefined } {
  if (province && city) return { province, city };
  if (city && !province) {
    const detectedProvince = CITY_TO_PROVINCE[city] || CITY_TO_PROVINCE[city + '市'];
    if (detectedProvince) return { province: detectedProvince, city: city.endsWith('市') ? city : city + '市' };
  }
  return { province, city };
}

function normalizeFields(row: any): ImportStoreData {
  const normalized: any = {};
  for (const key in row) {
    const standardKey = FIELD_MAPPING[key] || key;
    normalized[standardKey] = row[key];
  }
  return normalized;
}

const SYSTEM_NAME_MAP: Record<string, string> = {
  '和茶时代': 'hecha',
  '美丽妈妈': 'meili',
  '妈妈盒子': 'mama',
};

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const storeSystem = (formData.get('store_system') as string) || 'hecha';

    if (!file) {
      return NextResponse.json({ success: false, error: '请上传文件' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData: ImportStoreData[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

    if (!jsonData || jsonData.length === 0) {
      return NextResponse.json({ success: false, error: 'Excel文件中没有数据' }, { status: 400 });
    }

    const result = { created: 0, updated: 0, errors: [] as Array<{ row: number; message: string; storeName: string }> };

    for (let i = 0; i < jsonData.length; i++) {
      const row = normalizeFields(jsonData[i]);
      const rowNum = i + 2;

      try {
        if (!row['门店名称'] || row['门店名称'].trim() === '') {
          result.errors.push({ row: rowNum, message: '门店名称不能为空', storeName: '' });
          continue;
        }
        if (!row['门店ID'] || row['门店ID'].trim() === '') {
          result.errors.push({ row: rowNum, message: '门店ID不能为空', storeName: row['门店名称'] || '' });
          continue;
        }

        let province: string | undefined;
        let city: string | undefined;
        const region = row['区域']?.trim();
        if (region) {
          const match = region.match(/(.+省|.+自治区|.+市)(.+)/);
          if (match) { province = match[1]; city = match[2]; }
          else { city = region; }
        }
        const { city: detectedCity, province: detectedProvince } = autoDetectProvince(city, province);
        city = detectedCity;
        province = detectedProvince;

        const storeSystemValue = row['门店体系'] ? SYSTEM_NAME_MAP[row['门店体系']] || 'hecha' : storeSystem;

        const existingResult = await pool.query(
          'SELECT id FROM stores WHERE store_id = $1',
          [row['门店ID'].trim()]
        );

        if (existingResult.rows.length > 0) {
          await pool.query(
            `UPDATE stores SET store_name = $1, store_id = $2, category = $3, merchant_name = $4,
             merchant_id = $5, province = $6, city = $7, address = $8, attach_status = $9,
             business_status = $10, merchant_phone = $11, phone1 = $12, phone2 = $13,
             phone3 = $14, store_area = $15, staff_count = $16, customer_channel = $17,
             store_system = $18 WHERE id = $19`,
            [
              row['门店名称'].trim(), row['门店ID'].trim(), row['品类']?.trim() || null,
              row['商户名称']?.trim() || null, row['商户ID']?.trim() || null,
              province || null, city || null, row['地址']?.trim() || null,
              row['入驻状态']?.trim() || null, '服务中', row['商户电话']?.trim() || null,
              row['营业电话1']?.trim() || null, row['营业电话2']?.trim() || null,
              row['营业电话3']?.trim() || null, row['门店面积']?.trim() || null,
              row['员工人数']?.trim() || null, row['获客渠道']?.trim() || null,
              storeSystemValue, existingResult.rows[0].id
            ]
          );
          result.updated++;
        } else {
          const insertResult = await pool.query(
            `INSERT INTO stores (store_name, store_id, category, merchant_name, merchant_id,
             province, city, address, attach_status, business_status, merchant_phone,
             phone1, phone2, phone3, store_area, staff_count, customer_channel, store_system)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18) RETURNING id`,
            [
              row['门店名称'].trim(), row['门店ID'].trim(), row['品类']?.trim() || null,
              row['商户名称']?.trim() || null, row['商户ID']?.trim() || null,
              province || null, city || null, row['地址']?.trim() || null,
              row['入驻状态']?.trim() || null, '服务中', row['商户电话']?.trim() || null,
              row['营业电话1']?.trim() || null, row['营业电话2']?.trim() || null,
              row['营业电话3']?.trim() || null, row['门店面积']?.trim() || null,
              row['员工人数']?.trim() || null, row['获客渠道']?.trim() || null,
              storeSystemValue
            ]
          );
          result.created++;
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : '未知错误';
        console.error(`导入第 ${rowNum} 行失败:`, errorMsg);
        result.errors.push({ row: rowNum, message: errorMsg, storeName: row['门店名称'] || '' });
      }
    }

    console.log('导入结果:', { total: jsonData.length, created: result.created, updated: result.updated, failed: result.errors.length });

    return NextResponse.json({
      success: true,
      message: `导入完成：新增 ${result.created} 家门店，更新 ${result.updated} 家门店`,
      data: result,
    });
  } catch (error) {
    console.error('导入门店数据失败:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '导入失败' },
      { status: 500 }
    );
  }
}
