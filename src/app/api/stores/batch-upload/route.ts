import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

interface StoreData {
  store_name: string;
  store_id?: string;
  category?: string;
  merchant_name?: string;
  region?: string;
  province?: string;
  city?: string;
  address?: string;
  business_status?: string;
  contact_phone?: string;
  store_system?: string;
  store_area?: string;
  staff_count?: string;
  customer_channel?: string;
}

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
  '新疆维吾尔自治区': ['乌鲁木齐市', '克拉玛依市', '吐鲁番市', '哈密市', '昌吉回族自治州', '博尔塔拉蒙古自治州', '巴音郭楞蒙古自治州', '阿克苏地区', '克孜勒苏柯尔克孜自治州', '喀什地区', '和田地区', '伊犁哈萨克自治州', '塔城地区', '阿勒泰地区'],
  '台湾省': ['台北市', '高雄市', '台南市', '台中市', '桃园市', '新北市', '基隆市', '新竹市', '嘉义市'],
  '香港特别行政区': ['香港'],
  '澳门特别行政区': ['澳门']
};

// 城市 -> 省份的反向映射
const CITY_TO_PROVINCE: Record<string, string> = {};
Object.entries(CITIES_BY_PROVINCE).forEach(([province, cities]) => {
  cities.forEach(city => {
    CITY_TO_PROVINCE[city] = province;
    if (city.endsWith('市')) {
      CITY_TO_PROVINCE[city.replace('市', '')] = province;
    }
  });
});

// 根据城市自动识别省份
function autoDetectProvince(city: string | undefined, province: string | undefined): { city: string | undefined; province: string | undefined } {
  if (province && city) {
    // 都有值，直接返回
    return { province, city };
  }
  
  if (city && !province) {
    // 只有城市，尝试自动识别省份
    const detectedProvince = CITY_TO_PROVINCE[city];
    if (detectedProvince) {
      return { province: detectedProvince, city };
    }
    // 尝试带"市"后缀
    const cityWithSuffix = city.endsWith('市') ? city : city + '市';
    const detectedProvince2 = CITY_TO_PROVINCE[cityWithSuffix];
    if (detectedProvince2) {
      return { province: detectedProvince2, city: cityWithSuffix };
    }
  }
  
  return { province, city };
}

// 批量上传门店
export async function POST(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    const body = await request.json();
    const { stores, store_system = 'hecha' } = body as { stores: StoreData[]; store_system?: string };

    if (!stores || !Array.isArray(stores) || stores.length === 0) {
      return NextResponse.json(
        { success: false, error: '请提供有效的门店数据' },
        { status: 400 }
      );
    }

    // 验证必填字段
    const invalidStores: number[] = [];
    stores.forEach((store, index) => {
      if (!store.store_name || store.store_name.trim() === '') {
        invalidStores.push(index + 1);
      }
    });

    if (invalidStores.length > 0) {
      return NextResponse.json(
        { success: false, error: `第 ${invalidStores.join(', ')} 行门店名称不能为空` },
        { status: 400 }
      );
    }

    // 清理数据
    const cleanedStores = stores.map(store => {
      // 自动识别省份
      const { province: detectedProvince, city: detectedCity } = autoDetectProvince(
        store.city?.trim() || undefined,
        store.province?.trim() || undefined
      );
      
      return {
        store_name: store.store_name?.trim() || '',
        store_id: store.store_id?.trim() || null,
        category: store.category?.trim() || null,
        merchant_name: store.merchant_name?.trim() || null,
        region: store.region?.trim() || null,
        province: detectedProvince || null,
        city: detectedCity || null,
        address: store.address?.trim() || null,
        business_status: store.business_status?.trim() || null,
        contact_phone: store.contact_phone?.trim() || null,
        store_system: store_system, // 添加门店体系
        store_area: store.store_area?.trim() || null,
        staff_count: store.staff_count?.trim() || null,
        customer_channel: store.customer_channel?.trim() || null,
      };
    });

    // 检查Excel内部的重复门店名称
    const nameSet = new Set<string>();
    const duplicateNames: string[] = [];
    cleanedStores.forEach((store, index) => {
      if (store.store_name) {
        if (nameSet.has(store.store_name)) {
          duplicateNames.push(`第${index + 1}行: ${store.store_name}`);
        } else {
          nameSet.add(store.store_name);
        }
      }
    });

    if (duplicateNames.length > 0) {
      return NextResponse.json(
        { success: false, error: `Excel中存在重复的门店名称：${duplicateNames.slice(0, 5).join('、')}${duplicateNames.length > 5 ? '...' : ''}` },
        { status: 400 }
      );
    }

    // 检查Excel内部的重复门店ID
    const idSet = new Set<string>();
    const duplicateIds: string[] = [];
    cleanedStores.forEach((store, index) => {
      if (store.store_id) {
        if (idSet.has(store.store_id)) {
          duplicateIds.push(`第${index + 1}行: ${store.store_id}`);
        } else {
          idSet.add(store.store_id);
        }
      }
    });

    if (duplicateIds.length > 0) {
      return NextResponse.json(
        { success: false, error: `Excel中存在重复的门店ID：${duplicateIds.slice(0, 5).join('、')}${duplicateIds.length > 5 ? '...' : ''}` },
        { status: 400 }
      );
    }

    // 检查数据库中已存在的门店名称
    const storeNames = cleanedStores.map(s => s.store_name).filter(Boolean);
    if (storeNames.length > 0) {
      const { data: existingNames } = await client
        .from('stores')
        .select('store_name')
        .in('store_name', storeNames);
      
      if (existingNames && existingNames.length > 0) {
        const names = existingNames.map((s: { store_name: string }) => s.store_name).slice(0, 5);
        return NextResponse.json(
          { success: false, error: `以下门店名称已存在：${names.join('、')}${existingNames.length > 5 ? '...' : ''}` },
          { status: 400 }
        );
      }
    }

    // 检查数据库中已存在的门店ID
    const storeIds = cleanedStores.map(s => s.store_id).filter(Boolean);
    if (storeIds.length > 0) {
      const { data: existingIds } = await client
        .from('stores')
        .select('store_id, store_name')
        .in('store_id', storeIds);
      
      if (existingIds && existingIds.length > 0) {
        const ids = existingIds.map((s: { store_id: string; store_name: string }) => `${s.store_id}(${s.store_name})`).slice(0, 5);
        return NextResponse.json(
          { success: false, error: `以下门店ID已存在：${ids.join('、')}${existingIds.length > 5 ? '...' : ''}` },
          { status: 400 }
        );
      }
    }

    // 批量插入
    const { data, error } = await client
      .from('stores')
      .insert(cleanedStores)
      .select();

    if (error) {
      throw new Error(`批量上传失败: ${error.message}`);
    }

    return NextResponse.json({
      success: true,
      message: `成功上传 ${data?.length || 0} 家门店`,
      data,
    });
  } catch (error) {
    console.error('批量上传门店失败:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '批量上传失败' },
      { status: 500 }
    );
  }
}
