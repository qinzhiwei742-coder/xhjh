import { NextResponse } from 'next/server';
import JSZip from 'jszip';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET() {
  try {
    const supabase = getSupabaseClient();
    const zip = new JSZip();
    const dataFolder = zip.folder('data');
    const imagesFolder = zip.folder('images');

    // 需要导出的8个表
    const tables = [
      'stores',
      'contacts',
      'follow_records',
      'follow_images',
      'robot_configs',
      'store_images',
      'store_tags',
      'tag_presets',
    ];

    // 分页获取全量数据（突破1000条限制）
    const fetchAllData = async (tableName: string) => {
      const allData: any[] = [];
      let page = 0;
      const pageSize = 1000;
      while (true) {
        const { data, error } = await supabase
          .from(tableName)
          .select('*')
          .range(page * pageSize, (page + 1) * pageSize - 1)
          .order('created_at', { ascending: true });
        if (error) {
          console.error(`查询 ${tableName} 失败:`, error);
          break;
        }
        if (!data || data.length === 0) break;
        allData.push(...data);
        if (data.length < pageSize) break;
        page++;
      }
      return allData;
    };

    // 并行获取所有表数据
    const results = await Promise.all(tables.map(t => fetchAllData(t)));

    // 写入JSON文件
    tables.forEach((tableName, index) => {
      const data = results[index];
      if (dataFolder) {
        dataFolder.file(`${tableName}.json`, JSON.stringify(data, null, 2));
      }
    });

    // 下载图片文件
    const downloadedImages: string[] = [];
    const failedImages: string[] = [];

    // 下载 store_images
    const storeImages = results[tables.indexOf('store_images')];
    for (const img of storeImages) {
      if (img.image_url) {
        try {
          const res = await fetch(img.image_url, { signal: AbortSignal.timeout(15000) });
          if (res.ok) {
            const blob = await res.arrayBuffer();
            const fileName = img.image_key || `store_${img.store_id}/${img.id}.jpg`;
            if (imagesFolder) {
              imagesFolder.file(`store_images/${fileName}`, blob);
            }
            downloadedImages.push(img.image_url);
          } else {
            failedImages.push(img.image_url);
          }
        } catch {
          failedImages.push(img.image_url);
        }
      }
    }

    // 下载 follow_images
    const followImages = results[tables.indexOf('follow_images')];
    for (const img of followImages) {
      if (img.image_url) {
        try {
          const res = await fetch(img.image_url, { signal: AbortSignal.timeout(15000) });
          if (res.ok) {
            const blob = await res.arrayBuffer();
            const fileName = img.image_key || `follow_${img.follow_record_id}/${img.id}.jpg`;
            if (imagesFolder) {
              imagesFolder.file(`follow_images/${fileName}`, blob);
            }
            downloadedImages.push(img.image_url);
          } else {
            failedImages.push(img.image_url);
          }
        } catch {
          failedImages.push(img.image_url);
        }
      }
    }

    // 写入导出元信息
    zip.file('export_info.json', JSON.stringify({
      exportTime: new Date().toISOString(),
      tables: tables.map((t, i) => ({
        name: t,
        count: results[i].length,
      })),
      images: {
        downloaded: downloadedImages.length,
        failed: failedImages.length,
      },
    }, null, 2));

    // 生成zip
    const zipBuffer = await zip.generateAsync({ type: 'arraybuffer' });

    const date = new Date().toISOString().slice(0, 10);
    const filename = `星海计划数据备份-${date}.zip`;

    return new NextResponse(zipBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    });
  } catch (error) {
    console.error('导出全部数据失败:', error);
    return NextResponse.json({ error: '导出失败' }, { status: 500 });
  }
}
