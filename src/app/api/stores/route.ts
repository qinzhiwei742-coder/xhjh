import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 联系人类型
interface Contact {
  id: string;
  store_id: string;
  name: string;
  position: string;
  phone: string;
  wechat: string;
  remark: string;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
  wecom_id: string | null;
}

// 获取门店列表
export async function GET(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '20');
    const search = searchParams.get('search') || '';
    const province = searchParams.get('province') || '';
    const city = searchParams.get('city') || '';
    const followFilter = searchParams.get('follow_filter') || ''; // today, overdue
    const storeLevel = searchParams.get('store_level') || ''; // S, A, B, C
    const nextFollowStart = searchParams.get('next_follow_start') || '';
    const nextFollowEnd = searchParams.get('next_follow_end') || '';
    const storeSystem = searchParams.get('store_system') || 'mama'; // 门店体系筛选，默认妈妈盒子

    // 如果有跟进时间筛选，需要先查询每个门店最新的跟进记录
    let storeIdsForFollowFilter: string[] | null = null;
    
    // 联系人搜索结果
    let storeIdsForContactSearch: string[] | null = null;
    
    // 先搜索联系人（如果有搜索关键词）
    if (search) {
      const { data: contactsData } = await client
        .from('contacts')
        .select('store_id')
        .or(`name.ilike.%${search}%,phone.ilike.%${search}%,wechat.ilike.%${search}%`);
      
      if (contactsData && contactsData.length > 0) {
        storeIdsForContactSearch = [...new Set(contactsData.map((c: { store_id: string }) => c.store_id))];
      }
    }
    
    if (followFilter || nextFollowStart || nextFollowEnd) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      // 先获取所有有跟进记录的门店及其最新跟进记录
      const { data: allFollowRecords } = await client
        .from('follow_records')
        .select('store_id, next_follow_time, created_at')
        .not('next_follow_time', 'is', null)
        .order('created_at', { ascending: false });
      
      // 为每个门店找到最新的跟进记录（按 created_at 最新）
      const latestFollowByStore: Record<string, { next_follow_time: string; created_at: string }> = {};
      allFollowRecords?.forEach((f: { store_id: string; next_follow_time: string | null; created_at: string }) => {
        if (f.next_follow_time) {
          // 如果该门店还没有记录，或者这条记录更新，则更新
          if (!latestFollowByStore[f.store_id] || new Date(f.created_at) > new Date(latestFollowByStore[f.store_id].created_at)) {
            latestFollowByStore[f.store_id] = {
              next_follow_time: f.next_follow_time,
              created_at: f.created_at
            };
          }
        }
      });
      
      // 根据筛选条件过滤门店
      storeIdsForFollowFilter = [];
      for (const [storeId, follow] of Object.entries(latestFollowByStore)) {
        const nextFollowTime = new Date(follow.next_follow_time);
        let match = true;
        
        if (followFilter === 'today') {
          // 今天需要跟进的
          match = nextFollowTime >= today && nextFollowTime < tomorrow;
        } else if (followFilter === 'overdue') {
          // 已逾期的
          match = nextFollowTime < today;
        }
        
        // 日期范围筛选
        if (match && nextFollowStart) {
          const startDate = new Date(nextFollowStart);
          startDate.setHours(0, 0, 0, 0);
          match = nextFollowTime >= startDate;
        }
        if (match && nextFollowEnd) {
          const endDate = new Date(nextFollowEnd);
          endDate.setHours(23, 59, 59, 999);
          match = nextFollowTime <= endDate;
        }
        
        if (match) {
          storeIdsForFollowFilter.push(storeId);
        }
      }
      
      // 如果没有符合条件的门店，直接返回空结果
      if (storeIdsForFollowFilter.length === 0) {
        return NextResponse.json({
          success: true,
          data: [],
          pagination: { page, pageSize, total: 0, totalPages: 0 },
          filters: { provinces: {}, cities: {} },
        });
      }
    }

    let query = client
      .from('stores')
      .select('*', { count: 'exact' })
      .eq('store_system', storeSystem) // 按门店体系过滤
      .order('created_at', { ascending: false });

    // 搜索条件（门店名称、商户名称、地址、门店ID、省、市、联系人）
    if (search) {
      // 构建搜索条件
      const searchConditions = `store_name.ilike.%${search}%,merchant_name.ilike.%${search}%,address.ilike.%${search}%,store_id.ilike.%${search}%,province.ilike.%${search}%,city.ilike.%${search}%`;
      
      if (storeIdsForContactSearch && storeIdsForContactSearch.length > 0) {
        // 如果联系人搜索有结果，合并搜索条件
        query = query.or(`${searchConditions},id.in.(${storeIdsForContactSearch.join(',')})`);
      } else {
        query = query.or(searchConditions);
      }
    }

    // 省份筛选
    if (province) {
      query = query.eq('province', province);
    }

    // 城市筛选
    if (city) {
      query = query.eq('city', city);
    }

    // 等级筛选
    if (storeLevel) {
      if (storeLevel === 'empty') {
        // 筛选未设置等级的门店
        query = query.or('store_level.is.null,store_level.eq.');
      } else {
        query = query.eq('store_level', storeLevel);
      }
    }

    // 跟进时间筛选
    if (storeIdsForFollowFilter) {
      query = query.in('id', storeIdsForFollowFilter);
    }

    // 分页
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) {
      throw new Error(`查询门店失败: ${error.message}`);
    }

    // 获取每个门店的最新下次跟进时间
    let storesWithFollowTime = data || [];
    if (storesWithFollowTime.length > 0) {
      const storeIds = storesWithFollowTime.map((s: { id: string }) => s.id);
      console.log('[stores API] 查询跟进记录，门店数量:', storeIds.length);
      console.log('[stores API] 查询跟进记录，门店ID前5个:', storeIds.slice(0, 5));
      console.log('[stores API] 查询跟进记录，门店ID是否包含目标门店:', storeIds.includes('147287c9-ed82-4638-820d-23ee7bca1f3f'));

      // 分批查询跟进记录（每批最多100个ID，避免 .in() 方法限制）
      const batchSize = 100;
      const allFollowRecords: { store_id: string; next_follow_time: string | null; created_at: string }[] = [];

      for (let i = 0; i < storeIds.length; i += batchSize) {
        const batch = storeIds.slice(i, i + batchSize);
        const { data: followData } = await client
          .from('follow_records')
          .select('store_id, next_follow_time, created_at')
          .in('store_id', batch)
          .order('created_at', { ascending: false });

        if (followData) {
          allFollowRecords.push(...followData);
        }
      }

      console.log('[stores API] 跟进记录数据:', {
        totalRecords: allFollowRecords.length,
        firstRecord: allFollowRecords[0] || null
      });

      // 为每个门店找到最新的跟进记录（按 created_at 最新）
      const latestByStore: Record<string, { next_follow_time: string | null; created_at: string }> = {};
      allFollowRecords.forEach((f: { store_id: string; next_follow_time: string | null; created_at: string }) => {
        // 只考虑有 next_follow_time 的记录
        if (f.next_follow_time) {
          if (!latestByStore[f.store_id] || new Date(f.created_at) > new Date(latestByStore[f.store_id].created_at)) {
            latestByStore[f.store_id] = { next_follow_time: f.next_follow_time, created_at: f.created_at };
          }
        }
      });

      console.log('[stores API] 最新跟进记录汇总:', {
        storeCount: Object.keys(latestByStore).length,
        sample: Object.entries(latestByStore).slice(0, 3).map(([k, v]) => ({ storeId: k, nextFollowTime: v.next_follow_time }))
      });

      // 合并到门店数据
      storesWithFollowTime = storesWithFollowTime.map((store: { id: string }) => ({
        ...store,
        latest_next_follow_time: latestByStore[store.id]?.next_follow_time || null,
      }));
    }

    // 获取每个门店的联系人
    if (storesWithFollowTime.length > 0) {
      const storeIds = storesWithFollowTime.map((s: { id: string }) => s.id);

      // 分批查询联系人（每批最多100个ID，避免 .in() 方法限制）
      const batchSize = 100;
      const allContacts: Contact[] = [];

      for (let i = 0; i < storeIds.length; i += batchSize) {
        const batch = storeIds.slice(i, i + batchSize);
        const { data: contactsData } = await client
          .from('contacts')
          .select('*')
          .in('store_id', batch);
        if (contactsData) {
          allContacts.push(...contactsData);
        }
      }

      // 按门店ID分组联系人
      const contactsByStore: Record<string, Contact[]> = {};
      allContacts.forEach((c) => {
        if (!contactsByStore[c.store_id]) {
          contactsByStore[c.store_id] = [];
        }
        contactsByStore[c.store_id]!.push(c);
      });

      // 合并联系人到门店数据
      storesWithFollowTime = storesWithFollowTime.map((store: { id: string }) => ({
        ...store,
        contacts: contactsByStore[store.id] || [],
      }));
    }

    // 获取每个门店的标签
    if (storesWithFollowTime.length > 0) {
      const storeIds = storesWithFollowTime.map((s: { id: string }) => s.id);

      // 分批查询标签（每批最多100个ID）
      const batchSize = 100;
      const allTags: { id: string; store_id: string; tag_name: string; tag_color: string }[] = [];

      for (let i = 0; i < storeIds.length; i += batchSize) {
        const batch = storeIds.slice(i, i + batchSize);
        const { data: tagsData } = await client
          .from('store_tags')
          .select('id, store_id, tag_name, tag_color')
          .in('store_id', batch);
        if (tagsData) {
          allTags.push(...tagsData);
        }
      }

      // 按门店ID分组标签
      const tagsByStore: Record<string, typeof allTags> = {};
      allTags.forEach((t) => {
        if (!tagsByStore[t.store_id]) {
          tagsByStore[t.store_id] = [];
        }
        tagsByStore[t.store_id]!.push(t);
      });

      // 合并标签到门店数据
      storesWithFollowTime = storesWithFollowTime.map((store: { id: string }) => ({
        ...store,
        store_tags: tagsByStore[store.id] || [],
      }));
    }

    // 获取每个门店的资料图片
    if (storesWithFollowTime.length > 0) {
      const storeIds = storesWithFollowTime.map((s: { id: string }) => s.id);

      // 分批查询图片（每批最多100个ID）
      const batchSize = 100;
      const allImages: { id: string; store_id: string; image_key: string; image_url: string; created_at: string }[] = [];

      for (let i = 0; i < storeIds.length; i += batchSize) {
        const batch = storeIds.slice(i, i + batchSize);
        const { data: imagesData } = await client
          .from('store_images')
          .select('id, store_id, image_key, image_url, created_at')
          .in('store_id', batch)
          .order('created_at', { ascending: true });
        if (imagesData) {
          allImages.push(...imagesData);
        }
      }

      // 按门店ID分组图片
      const imagesByStore: Record<string, typeof allImages> = {};
      allImages.forEach((img) => {
        if (!imagesByStore[img.store_id]) {
          imagesByStore[img.store_id] = [];
        }
        imagesByStore[img.store_id]!.push(img);
      });

      // 合并图片到门店数据
      storesWithFollowTime = storesWithFollowTime.map((store: { id: string }) => ({
        ...store,
        store_images: imagesByStore[store.id] || [],
      }));
    }

    // 获取每个门店的职人明细统计
    if (storesWithFollowTime.length > 0) {
      const storeIds = storesWithFollowTime.map((s: { id: string }) => s.id);

      // 分批查询职人明细（每批最多100个ID）
      const batchSize = 100;
      const allStaffDetails: { store_id: string; video_count: number; exposure_count: number }[] = [];

      for (let i = 0; i < storeIds.length; i += batchSize) {
        const batch = storeIds.slice(i, i + batchSize);
        const { data: staffData } = await client
          .from('staff_details')
          .select('store_id, video_count, exposure_count')
          .in('store_id', batch);
        if (staffData) {
          allStaffDetails.push(...staffData);
        }
      }

      // 按门店ID分组统计
      const staffStatsByStore: Record<string, { staffCount: number; videoCount: number; exposureCount: number }> = {};
      allStaffDetails.forEach((detail) => {
        if (!staffStatsByStore[detail.store_id]) {
          staffStatsByStore[detail.store_id] = { staffCount: 0, videoCount: 0, exposureCount: 0 };
        }
        staffStatsByStore[detail.store_id].staffCount += 1;
        staffStatsByStore[detail.store_id].videoCount += detail.video_count || 0;
        staffStatsByStore[detail.store_id].exposureCount += detail.exposure_count || 0;
      });

      // 合并职人统计到门店数据
      storesWithFollowTime = storesWithFollowTime.map((store: { id: string }) => {
        const stats = staffStatsByStore[store.id];
        return {
          ...store,
          staff_count: stats ? String(stats.staffCount) : null,
          video_count: stats ? stats.videoCount : null,
          exposure_count: stats ? stats.exposureCount : null,
        };
      });
    }

    // 获取所有省份和城市的统计
    const { data: provinceData } = await client
      .from('stores')
      .select('province, city');

    const provinceStats: Record<string, number> = {};
    const cityStats: Record<string, Record<string, number>> = {};

    provinceData?.forEach((item: { province: string | null; city: string | null }) => {
      if (item.province) {
        provinceStats[item.province] = (provinceStats[item.province] || 0) + 1;
      }
      if (item.province && item.city) {
        if (!cityStats[item.province]) {
          cityStats[item.province] = {};
        }
        cityStats[item.province][item.city] = (cityStats[item.province][item.city] || 0) + 1;
      }
    });

    return NextResponse.json({
      success: true,
      data: storesWithFollowTime || [],
      pagination: {
        page,
        pageSize,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / pageSize),
      },
      filters: {
        provinces: provinceStats,
        cities: cityStats,
      },
    });
  } catch (error) {
    console.error('获取门店列表失败:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '获取门店列表失败' },
      { status: 500 }
    );
  }
}

// 创建门店
export async function POST(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    const body = await request.json();

    // 检查门店名称是否重复
    if (body.store_name) {
      const { data: existingName } = await client
        .from('stores')
        .select('id, store_name')
        .eq('store_name', body.store_name)
        .maybeSingle();
      
      if (existingName) {
        return NextResponse.json(
          { success: false, error: `门店名称"${body.store_name}"已存在，不能重复添加` },
          { status: 400 }
        );
      }
    }

    // 检查门店ID是否重复
    if (body.store_id) {
      const { data: existingId } = await client
        .from('stores')
        .select('id, store_id, store_name')
        .eq('store_id', body.store_id)
        .maybeSingle();
      
      if (existingId) {
        return NextResponse.json(
          { success: false, error: `门店ID"${body.store_id}"已被门店"${existingId.store_name}"使用，不能重复添加` },
          { status: 400 }
        );
      }
    }

    const { data, error } = await client
      .from('stores')
      .insert(body)
      .select()
      .single();

    if (error) {
      throw new Error(`创建门店失败: ${error.message}`);
    }

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('创建门店失败:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '创建门店失败' },
      { status: 500 }
    );
  }
}
