/**
 * 比较订单文件和product数据库中的门店数据
 */

const XLSX = require('xlsx');
const path = require('path');

async function main() {
  console.log('=== 比较订单文件和product数据库中的门店数据 ===\n');

  // product数据库中的155家门店（已手动导出）
  const productStores = [
    'times茶馆', '一拙书院', '一片树叶的故事', '一瓢水茶生活馆', '一花一茶·花涧茶室', '一诚晏然',
    '万氏留香(济南东站店)山间雨舍', '三海集(万象天地店)', '世来缘普洱茶', '世跃茶庄', '东方国艺茶研社',
    '东极一品楼茶庄(东吴店)', '东润静雅茶馆', '中国茶叶(恒大御景湾店)', '乐艺棋牌室', '九凤茶舍', '云尚棋牌室',
    '云汐茶社', '云集茶空间', '五季茶社', '亿春茶艺居', '仙佰茗·茶体验', '众晶茶楼', '依家茶苑', '儒禾茶馆',
    '元来茶室', '几何茶室', '匠与信·茶话生活', '半月闲茶楼.棋牌.简餐', '半盏茗茶舍', '华腾园棋牌室(劲松店)',
    '南浔晃松茶馆', '南海茶苑', '原潮茶空间', '叄合茶舍(高新区广告园店)', '古树茶仓新中式茶馆', '古筠坞',
    '叩禅茶舍', '可以茶舍', '合茶', '和木元(红谷滩店)', '品·自在茶楼', '品品香春来茶馆', '品茗轩茶空间',
    '品藏轩茶缘馆', '品馨名茶', '哈哈共享茶室(华润万象店)', '喜舍茶馆(文体路)', '国普茶楼(熙和园店)',
    '圆芗茶楼-茶与咖啡', '大众棋牌', '大茶不茶(上海首店)', '天韵茶府(中铁银杏广场店)', '好友茶社', '寂可茗.茶书院',
    '小绿茶共享茶室(海安店)', '小罐茶拉菲酒庄', '岩湶号(竹林镜店)', '巷往花与茶', '御品茶汤(亚运村汇园公寓贵宾楼D座店)',
    '思源茶社(生态城店)', '悟和乐心·共享茶室(中央第五街店)', '悠然茶馆(T.I.T智慧园店)', '惠安县洱沐一芯茶馆',
    '慧女堂服装', '拾光茶舍', '拾木里', '拾玖新式茶饮', '故人茶叙', '日处口新人文茶空间', '明月堂茶艺', '春草轩茶事',
    '朝暮茶叙', '木鱼小满茶舍', '本然茶社(名居广场店)', '東游记茶馆(高新龙湖店)', '柒茶(渤海八路店)',
    '柳叶轩茗茶馆(大华锦绣嘉年华店)', '栖云茶叙·正山堂(未来科技城店)', '梵云社茶文化馆', '欢聚时光茶馆', '欧记共享茶室',
    '正诚茶堂', '永泰祥茶馆', '沁园春茗楼', '泽山茶道工作室', '测试门店', '涤尘茶社·茶馆', '涵元斋商务茶楼·棋牌休闲·私宴会所',
    '淳源茶舍', '淼源阁茶室(融创文旅城兰亭居店)', '清壹舍茶坊', '清禾茶舍', '清芯罐罐茶', '湠露', '源涌茶楼', '漫思茶茶室',
    '澜海棋牌室', '灼月御蜀秀合茶空间', '牧兰赋', '独霸茶叶(安华苑店)', '申时茶共享茶室', '留馀·心泉茶馆', '知晓茶轩',
    '碧轩阁餐厅', '福建·中信茶行(松岚苑店)', '福海茶·人文空间', '秋白茶咖', '精华茶楼', '素心生活空间', '紫光阁茶舍',
    '紫藤茶馆', '美丹泉茶馆·棋牌', '翠雨轩茶空间', '翡冷翠Florence·茶咖', '聊吧茶馆', '聊雨亭·茶事空间·心理疗愈',
    '舒静茶庄', '芊润茶空间', '茗和堂(中海·金沙馨园二期东区店)', '茗悦茶馆', '茗月茶坊', '茗缘居茶室', '茶三里(科源路店)',
    '茶呆子', '茶悦·一起分享好茶的地方', '茶所有智慧茶室', '茶源茶馆', '茶缘·茶馆(西客站店)', '茶隐·品品香',
    '莲境空间·茶事·画廊', '西山茶庄', '见山茶书院', '豪运来茶室', '贪心·茶空间', '身临棋境棋牌室(柳沙店)',
    '逸茗茶城', '遛茶雅上道共享茶馆(街道口店)', '鑫忆茶楼', '长虹茶庐', '问山半日闲茶馆', '闲藏茶馆臻选北纬30°好茶',
    '阅己的茶', '陶园茶府', '陶庐茶馆', '隐庐茶事安吉白茶', '雀友记', '雀谈风云共享棋牌室', '香聚茶空间共享茶室',
    '驴途雅集(南通壹城店)', '鹏春茶艺馆', '鹿隐茶舍', '麻上来棋牌室', '龙形冲茶米(中大天地店)', '龙隐茶寮'
  ];

  console.log(`product数据库中的门店数: ${productStores.length}\n`);

  // 读取订单文件
  const orderExcelPath = path.join(__dirname, '../assets/订单-成交明细-下单时间-2025-04-01_2026-04-30.xlsx');
  const orderWorkbook = XLSX.readFile(orderExcelPath);
  const orderData = XLSX.utils.sheet_to_json(orderWorkbook.Sheets[orderWorkbook.SheetNames[0]], { raw: false });

  const orderStoreNames = new Set();
  orderData.forEach(row => {
    const name = row['意向门店'];
    if (name && !name.startsWith('美丽妈妈')) {
      orderStoreNames.add(name);
    }
  });

  console.log(`订单文件中的门店数: ${orderStoreNames.size}\n`);

  // 找出在product数据库中但不在订单文件中的门店
  const inProductNotInOrder = productStores.filter(name => !orderStoreNames.has(name));
  console.log(`在product中但不在订单中的门店数: ${inProductNotInOrder.length}`);
  if (inProductNotInOrder.length > 0) {
    console.log('门店列表:');
    inProductNotInOrder.forEach(name => console.log(`  - ${name}`));
  }

  console.log('');

  // 找出在订单文件中但不在product数据库中的门店
  const inOrderNotInProduct = Array.from(orderStoreNames).filter(name => !productStores.includes(name));
  console.log(`在订单中但不在product中的门店数: ${inOrderNotInProduct.length}`);
  if (inOrderNotInProduct.length > 0) {
    console.log('门店列表:');
    inOrderNotInProduct.forEach(name => console.log(`  - ${name}`));
  }

  console.log('\n=== 分析完成 ===');
}

main().catch(console.error);
