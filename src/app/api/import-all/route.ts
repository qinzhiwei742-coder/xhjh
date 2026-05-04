import { NextRequest, NextResponse } from 'next/server';
import JSZip from 'jszip';
import { getSupabaseClient, S3Storage } from '@/storage/database/supabase-client';

const storage = new S3Storage({
  bucketName: 'local',
});

// 导入顺序：先导入被依赖的表
const TABLE_ORDER = [
  'tag_presets',
  'stores',
  'contacts',
  'follow_records',
  'follow_images',
  'robot_configs',
  'store_tags',
  'store_images',
] as const;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ success: false, error: '请上传ZIP文件' }, { status: 400 });
    }

    const supabase = getSupabaseClient();
    const bytes = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(bytes);

    // 读取 data 文件夹中的 JSON 数据
    const tableData: Record<string, any[]> = {};
    for (const tableName of TABLE_ORDER) {
      const zipFile = zip.file(`data/${tableName}.json`);
      if (zipFile) {
        const content = await zipFile.async('string');
        try {
          tableData[tableName] = JSON.parse(content);
        } catch {
          console.error(`解析 ${tableName}.json 失败`);
          tableData[tableName] = [];
        }
      } else {
        tableData[tableName] = [];
      }
    }

    const results: Record<string, { imported: number; skipped: number; error?: string }> = {};

    // 导入 tag_presets
    {
      const data = tableData['tag_presets'] || [];
      let imported = 0;
      let skipped = 0;
      if (data.length > 0) {
        const { data: existing } = await (supabase.from('tag_presets').select('id') as Promise<{ data: { id: string }[] | null }>);
        const existingIds = new Set((existing || []).map((e: { id: string }) => e.id));

        const toInsert = data.filter((row: { id: string }) => !existingIds.has(row.id));
        skipped = data.length - toInsert.length;

        if (toInsert.length > 0) {
          const batchSize = 100;
          for (let i = 0; i < toInsert.length; i += batchSize) {
            const batch = toInsert.slice(i, i + batchSize);
            const { error } = await supabase.from('tag_presets').insert(batch);
            if (error) {
              console.error('导入 tag_presets 失败:', error);
              results['tag_presets'] = { imported, skipped, error: error.message };
              break;
            }
            imported += batch.length;
          }
        }
      }
      results['tag_presets'] = { imported, skipped };
    }

    // 导入 stores
    {
      const data = tableData['stores'] || [];
      let imported = 0;
      let skipped = 0;
      if (data.length > 0) {
        const { data: existing } = await (supabase.from('stores').select('id') as Promise<{ data: { id: string }[] | null }>);
        const existingIds = new Set((existing || []).map((e: { id: string }) => e.id));

        const toInsert = data.filter((row: { id: string }) => !existingIds.has(row.id));
        const toUpdate = data.filter((row: { id: string }) => existingIds.has(row.id));
        skipped = 0;

        if (toInsert.length > 0) {
          const batchSize = 100;
          for (let i = 0; i < toInsert.length; i += batchSize) {
            const batch = toInsert.slice(i, i + batchSize);
            const { error } = await supabase.from('stores').insert(batch);
            if (!error) imported += batch.length;
            else console.error('插入 stores 失败:', error);
          }
        }

        for (const row of toUpdate) {
          const { id, ...updateData } = row;
          const { error } = await (supabase.from('stores').update(updateData).eq('id', id) as Promise<{ error: any }>);
          if (!error) imported++;
          else console.error('更新 stores 失败:', error);
        }
      }
      results['stores'] = { imported, skipped };
    }

    // 导入 contacts
    {
      const data = tableData['contacts'] || [];
      let imported = 0;
      let skipped = 0;
      if (data.length > 0) {
        const { data: existing } = await (supabase.from('contacts').select('id') as Promise<{ data: { id: string }[] | null }>);
        const existingIds = new Set((existing || []).map((e: { id: string }) => e.id));

        const toInsert = data.filter((row: { id: string }) => !existingIds.has(row.id));
        const toUpdate = data.filter((row: { id: string }) => existingIds.has(row.id));

        if (toInsert.length > 0) {
          const batchSize = 100;
          for (let i = 0; i < toInsert.length; i += batchSize) {
            const batch = toInsert.slice(i, i + batchSize);
            const { error } = await supabase.from('contacts').insert(batch);
            if (!error) imported += batch.length;
            else console.error('插入 contacts 失败:', error);
          }
        }

        for (const row of toUpdate) {
          const { id, ...updateData } = row;
          const { error } = await (supabase.from('contacts').update(updateData).eq('id', id) as Promise<{ error: any }>);
          if (!error) imported++;
        }
      }
      results['contacts'] = { imported, skipped };
    }

    // 导入 follow_records
    {
      const data = tableData['follow_records'] || [];
      let imported = 0;
      if (data.length > 0) {
        const { data: existing } = await (supabase.from('follow_records').select('id') as Promise<{ data: { id: string }[] | null }>);
        const existingIds = new Set((existing || []).map((e: { id: string }) => e.id));

        const toInsert = data.filter((row: { id: string }) => !existingIds.has(row.id));

        if (toInsert.length > 0) {
          const batchSize = 100;
          for (let i = 0; i < toInsert.length; i += batchSize) {
            const batch = toInsert.slice(i, i + batchSize);
            const { error } = await supabase.from('follow_records').insert(batch);
            if (!error) imported += batch.length;
            else console.error('插入 follow_records 失败:', error);
          }
        }
      }
      results['follow_records'] = { imported, skipped: data.length - imported };
    }

    // 导入 follow_images
    {
      const data = tableData['follow_images'] || [];
      let imported = 0;
      if (data.length > 0) {
        const { data: existing } = await (supabase.from('follow_images').select('id') as Promise<{ data: { id: string }[] | null }>);
        const existingIds = new Set((existing || []).map((e: { id: string }) => e.id));

        const toInsert = data.filter((row: { id: string }) => !existingIds.has(row.id));

        if (toInsert.length > 0) {
          const batchSize = 100;
          for (let i = 0; i < toInsert.length; i += batchSize) {
            const batch = toInsert.slice(i, i + batchSize);
            const { error } = await supabase.from('follow_images').insert(batch);
            if (!error) imported += batch.length;
            else console.error('插入 follow_images 失败:', error);
          }
        }
      }
      results['follow_images'] = { imported, skipped: data.length - imported };
    }

    // 导入 robot_configs
    {
      const data = tableData['robot_configs'] || [];
      let imported = 0;
      if (data.length > 0) {
        const { data: existing } = await (supabase.from('robot_configs').select('id') as Promise<{ data: { id: string }[] | null }>);
        const existingIds = new Set((existing || []).map((e: { id: string }) => e.id));

        const toInsert = data.filter((row: { id: string }) => !existingIds.has(row.id));
        const toUpdate = data.filter((row: { id: string }) => existingIds.has(row.id));

        if (toInsert.length > 0) {
          const batchSize = 100;
          for (let i = 0; i < toInsert.length; i += batchSize) {
            const batch = toInsert.slice(i, i + batchSize);
            const { error } = await supabase.from('robot_configs').insert(batch);
            if (!error) imported += batch.length;
            else console.error('插入 robot_configs 失败:', error);
          }
        }

        for (const row of toUpdate) {
          const { id, ...updateData } = row;
          const { error } = await (supabase.from('robot_configs').update(updateData).eq('id', id) as Promise<{ error: any }>);
          if (!error) imported++;
        }
      }
      results['robot_configs'] = { imported, skipped: data.length - imported };
    }

    // 导入 store_tags
    {
      const data = tableData['store_tags'] || [];
      let imported = 0;
      if (data.length > 0) {
        const { data: existing } = await (supabase.from('store_tags').select('id') as Promise<{ data: { id: string }[] | null }>);
        const existingIds = new Set((existing || []).map((e: { id: string }) => e.id));

        const toInsert = data.filter((row: { id: string }) => !existingIds.has(row.id));

        if (toInsert.length > 0) {
          const batchSize = 100;
          for (let i = 0; i < toInsert.length; i += batchSize) {
            const batch = toInsert.slice(i, i + batchSize);
            const { error } = await supabase.from('store_tags').insert(batch);
            if (!error) imported += batch.length;
            else console.error('插入 store_tags 失败:', error);
          }
        }
      }
      results['store_tags'] = { imported, skipped: data.length - imported };
    }

    // 导入 store_images（本地存储）
    {
      const data = tableData['store_images'] || [];
      let imported = 0;
      let skipped = 0;

      const { data: existing } = await (supabase.from('store_images').select('id') as Promise<{ data: { id: string }[] | null }>);
      const existingIds = new Set((existing || []).map((e: { id: string }) => e.id));

      for (const row of data) {
        if (existingIds.has(row.id)) {
          skipped++;
          continue;
        }

        let imageBuffer: Buffer | null = null;
        if (row.image_key) {
          const imgFile = zip.file(`images/store_images/${row.image_key}`);
          if (imgFile) {
            const arrBuf = await imgFile.async('arraybuffer');
            imageBuffer = Buffer.from(arrBuf);
          }
        }

        let imageKey = row.image_key;
        let imageUrl = row.image_url;

        if (imageBuffer) {
          try {
            const ext = imageKey?.split('.').pop() || 'jpg';
            const newKey = `store-images/${row.store_id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
            imageKey = await storage.uploadFile({
              fileContent: imageBuffer,
              fileName: newKey,
              contentType: 'image/jpeg',
            });
            imageUrl = await storage.generatePresignedUrl({
              key: imageKey,
              expireTime: 86400 * 365,
            });
          } catch (e) {
            console.error('上传图片失败，使用原URL:', e);
          }
        }

        const { error } = await supabase.from('store_images').insert({
          id: row.id,
          store_id: row.store_id,
          image_key: imageKey,
          image_url: imageUrl,
          created_at: row.created_at,
        });

        if (!error) imported++;
        else {
          console.error('插入 store_images 失败:', error);
          skipped++;
        }
      }
      results['store_images'] = { imported, skipped };
    }

    return NextResponse.json({
      success: true,
      message: '导入完成',
      results,
    });
  } catch (error) {
    console.error('导入全部数据失败:', error);
    return NextResponse.json({ success: false, error: '导入失败' }, { status: 500 });
  }
}
