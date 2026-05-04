import { NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';

// 美丽妈妈门店数据
const MEILI_STORES = [
  { id: '01ed774b-c925-4a0e-8ee2-e38a18c64419', store_name: '美丽妈妈产后恢复中心(川沙店)', store_id: '7002284377954584579', category: '产后恢复' },
  { id: '5ebcb673-4d74-4284-ad47-a62174f9e6ae', store_name: '美丽妈妈产后恢复中心(娄星店)', store_id: '7162422642388797455', category: '产后恢复' },
  { id: '344c19b8-aba6-40a3-84af-5e588bf04b4f', store_name: '美丽妈妈产后管理中心(东营店)', store_id: '7222851908707289091', category: '产后恢复' },
  { id: 'ec84b77e-3bb9-46f9-b1f1-a658d952c95a', store_name: '美丽妈妈产后恢复中心(金桥店)', store_id: '7381425744406120500', category: '产后恢复' },
  { id: '952751ac-5360-4629-8670-75ecb1adb1e1', store_name: '美丽妈妈产后恢复中心(晋城店)', store_id: '7161364443727661069', category: '产后恢复' },
  { id: 'c85c209d-ee16-436d-9b0c-0de949d72186', store_name: '美丽妈妈产后护理(通惠门路店)', store_id: '7483328609139034112', category: '产后恢复' },
  { id: 'ab2c1cb2-c840-4fb4-a13e-19692f950ed1', store_name: '美丽妈妈产后恢复中心(瑞安店)', store_id: '7162360802635155497', category: '产后恢复' },
  { id: '6f330b7d-db58-42c2-bb37-913180ce37d5', store_name: '美丽妈妈产后恢复中心(海湖新华联店)', store_id: '7232990458329172007', category: '产后恢复' },
  { id: '1334b91f-4d6d-4fda-8610-1356f880da6a', store_name: '美丽妈妈产后管理中心(海宁旗舰店)', store_id: '6762660527140374531', category: '产后恢复' },
  { id: '313ce724-c4dd-4b93-a228-eb808a49b808', store_name: '美丽妈妈产后恢复中心(烟台店)', store_id: '6906237947087947776', category: '产后恢复' },
  { id: 'f0bff09d-a9df-48c6-9021-85ea42eef924', store_name: '美丽妈妈产后恢复中心(悦东汇店)', store_id: '7155749300046301215', category: '产后恢复' },
  { id: 'ee2aee64-3ee5-41d6-9737-6d9802b9289e', store_name: '美丽妈妈产后恢复中心(宿州店)', store_id: '6601167394356332557', category: '产后恢复' },
  { id: '39d5fd52-16a7-4092-9f9d-626b585116a0', store_name: '美丽妈妈产后健康管理中心(万达店)', store_id: '7496805461493844018', category: '产后恢复' },
  { id: '01dea4aa-4d10-42ea-ba10-c3b4c9d962ef', store_name: '美丽妈妈产后管理中心(番禺店)', store_id: '6601165040198354947', category: '产后恢复' },
  { id: '7e48f60e-4b67-4d49-ba65-0728f2379cfe', store_name: '美丽妈妈产后恢复中心(月荷店)', store_id: '7275222995142969405', category: '产后恢复' },
  { id: '665f69a3-0f76-4c22-bded-adf2fb1a207e', store_name: '美丽妈妈产后管理中心(普宁店)', store_id: '7509733720186685477', category: '产后恢复' },
  { id: '88713281-591d-4b18-b4d0-025d10b4df89', store_name: '美丽妈妈产后管理中心(太仓万达广场店)', store_id: '6639925868984616964', category: '产后恢复' },
  { id: 'b1d9d18d-ac78-4dde-949d-45da112b2dbf', store_name: '美丽妈妈产后管理中心(长垣店)', store_id: '6601148578494679043', category: '产后恢复' },
  { id: '30eba4a0-0b4a-4667-a86e-7660d8b97c35', store_name: '美丽妈妈产后恢复中心(万象会员店)', store_id: '7457421338697795636', category: '产后恢复' },
  { id: 'ac16c8cf-c2ce-4ccc-bdff-de68db6899b5', store_name: '美丽妈妈产后恢复中心(仲盛世界商城)', store_id: '7198099411723880481', category: '产后恢复' },
  { id: '1fad92e3-4ce6-4110-893f-d4847faf59a6', store_name: '美丽妈妈产后恢复中心(宜昌万达店)', store_id: '7262667154938398761', category: '产后恢复' },
  { id: '6919df3f-0095-48c0-9c23-d1a05c7e0f52', store_name: '美丽妈妈产后恢复中心(友谊阳光城店)', store_id: '7238538621748250657', category: '产后恢复' },
  { id: '12a167be-e87f-4ae6-95db-291118b690d5', store_name: '美丽妈妈产后恢复中心(西昌店)', store_id: '7160971577104795663', category: '产后恢复' },
  { id: 'a0acf246-81bc-40a1-9c0f-5ed488f31b5e', store_name: '美丽妈妈产后修复中心(葛洲坝店)', store_id: '6601171646717888515', category: '产后恢复' },
  { id: '82b4a698-305a-4a18-9396-d2c36601b102', store_name: '美丽妈妈mamabox产后管理中心(松岗店)', store_id: '7342762799200503820', category: '产后恢复' },
  { id: 'bb707e91-e3e4-40fc-b043-523e2ddb603b', store_name: '美丽妈妈产后管理中心(壹城中心店)', store_id: '7048149489395173390', category: '产后恢复' },
  { id: '3d61e348-b6d3-4597-a9b7-4f3ab44cf293', store_name: '美丽妈妈(安阳店)', store_id: '7216248539305740348', category: '产后恢复' },
  { id: '92046aa2-8d36-4eb0-8592-a873fb86f293', store_name: '美丽妈妈产后恢复中心(新沂店)', store_id: '7281098924243290148', category: '产后恢复' },
  { id: 'b99f2705-68b3-4005-bd74-1026ec43e698', store_name: '美丽妈妈产后恢复中心(万风新天地购物中心店)', store_id: '6971671785938880519', category: '产后恢复' },
  { id: '6ac41830-2cdf-48ed-b501-5f67c3a95b82', store_name: '美丽妈妈产后健康管理中心(力盟纺织品店)', store_id: '6867706597376837639', category: '产后恢复' },
  { id: 'cc5ef41f-c159-479e-90af-0cf764bf709d', store_name: '美丽妈妈产后恢复(鸳鸯店)', store_id: '6601232719995209741', category: '产后恢复' },
  { id: 'f1dd336b-ae75-4ec4-805e-fa9c5e721b9e', store_name: '美丽妈妈产后恢复中心(石厦店)', store_id: '7446641465817565225', category: '产后恢复' },
  { id: '355ead93-5b3e-4cae-a9f6-4ee946eac10c', store_name: '美丽妈妈产后恢复中心(下沙总店)', store_id: '6601239561500624909', category: '产后恢复' },
  { id: 'c659bf3a-b198-43ac-89a8-29cfe5bc3730', store_name: '美丽妈妈产后恢复中心(邯郸店)', store_id: '7161338785475594272', category: '产后恢复' },
  { id: '4d877ee8-20fb-41e8-81b6-bf4e05d4965d', store_name: '美丽妈妈产后恢复中心(高平店)', store_id: '7161256802699446272', category: '产后恢复' },
  { id: 'fc231562-d754-4c6a-bc95-705d79ab8f5b', store_name: '美丽妈妈产后恢复中心(长治店)', store_id: '6601161509923997710', category: '产后恢复' },
  { id: '1e16d4c6-b708-4829-a05a-558a263b5b79', store_name: '美丽妈妈mambox产后管理中心(桐乡店)', store_id: '7436632200759478284', category: '产后恢复' },
  { id: '83d54e0e-d81b-49dd-b255-d0cb77a636b2', store_name: '美丽妈妈产后管理中心(望江店)', store_id: '7215418844498642996', category: '产后恢复' },
  { id: '4e1f7d23-a205-45f4-9e51-190504c15c19', store_name: '美丽妈妈产后恢复(布吉店)', store_id: '7446690904942839808', category: '产后恢复' },
  { id: '2fa0e00b-e468-43f7-9316-4e2b9177e0a3', store_name: '美丽妈妈产后管理中心(碧桂园店)', store_id: '6661163449411782669', category: '产后恢复' },
  { id: '402ee52e-77aa-4419-8d22-b3d03377d071', store_name: '美丽妈妈产后恢复中心(融和园店)', store_id: '7281874256877586490', category: '产后恢复' },
  { id: '3a36cfa8-f752-47bb-8d12-2749b94f9173', store_name: '美丽妈妈产后恢复中心(吉阳店)', store_id: '7325422969025464371', category: '产后恢复' },
  { id: '2e58726e-56c3-4336-850f-bb710520e567', store_name: '美丽妈妈(移民广场中心店)', store_id: '6601145758806706183', category: '产后恢复' },
  { id: '645a1dad-963a-4375-b30f-e5273d5454d3', store_name: '美丽妈妈(超华城市广场店)', store_id: '7081119158859761696', category: '产后恢复' },
  { id: 'f1a7e61d-fa65-4958-8307-9a2bd994521c', store_name: '美丽妈妈产后管理中心(金山店)', store_id: '7458887011002009634', category: '产后恢复' },
  { id: '82dd65eb-315e-4a53-8d11-c499b7f72a41', store_name: '美丽妈妈产后恢复中心(滨江店)', store_id: '7156131916826019873', category: '产后恢复' },
  { id: '7eb63816-f908-4930-a7b7-7375c28baeff', store_name: '美丽妈妈产后恢复中心(泗阳店)', store_id: '6601171315711805444', category: '产后恢复' },
  { id: 'db67bc78-8ee8-4ba3-b839-6501db0ef650', store_name: '美丽妈妈产后管理中心(平湖旗舰店)', store_id: '7072906211519105038', category: '产后恢复' },
  { id: '4df5bb44-09f1-45db-8507-337c796377c2', store_name: '美丽妈妈产后管理中心(德清店)', store_id: '7160896020145162248', category: '产后恢复' },
  { id: 'fdff0b62-d945-4781-8e20-8213ab9af506', store_name: '美丽妈妈产后管理中心(无锡海岸城店)', store_id: '6891554150673287182', category: '产后恢复' },
  { id: '80a8e33f-81eb-4e3f-94ff-cbc8f29679a6', store_name: '美丽妈妈产后恢复中心(台江店)', store_id: '7161693295268071439', category: '产后恢复' },
  { id: '172d01e7-ca8d-44d1-bee3-d19e61a84f5c', store_name: '美丽妈妈产后管理中心(唐山店)', store_id: '6601132018757535758', category: '产后恢复' },
  { id: '40eb0342-f479-468e-a780-6adb260e8829', store_name: '美丽妈妈产后恢复中心(银川店)', store_id: '7208415588316612641', category: '产后恢复' },
  { id: 'bc68a5d3-da8a-488e-87b9-9f33b1ba0372', store_name: '美丽妈妈产后恢复中心(铜梁店)', store_id: '6812017181912483840', category: '产后恢复' },
  { id: '9a2633d5-11a8-4e56-b667-3d755ac12852', store_name: '佳美亲美丽妈妈产后恢复中心(东城店)', store_id: '7319738140011268131', category: '产后恢复' },
  { id: '1a162d2d-bfe6-4a9e-b6df-461b7516bda8', store_name: '美丽妈妈产后恢复中心(天河店)', store_id: '7297444211773687827', category: '产后恢复' },
  { id: '22311104-e4b5-4f97-b6cf-85158314043f', store_name: '美丽妈妈产后恢复中心(南山大道店)', store_id: '6601145837919668228', category: '产后恢复' },
  { id: '2b868e78-34a9-4527-8d9e-905e7fc35b4e', store_name: '美丽妈妈产后管理中心(南开店)', store_id: '7161612007840417832', category: '产后恢复' },
  { id: '15322836-5fca-45c5-8231-e2fea9b1bc18', store_name: '美丽妈妈产后恢复中心(封丘店)', store_id: '7433734031743420466', category: '产后恢复' },
  { id: 'e438690d-b13e-458a-a69c-5b598c77a09b', store_name: '美丽妈妈mamabox产后管理中心(翡翠店)', store_id: '7418442601881143308', category: '产后恢复' },
  { id: '45a6bfe1-d803-4a23-9a84-78d955a90e28', store_name: '美丽妈妈产后恢复中心(昆山店)', store_id: '7207708508173633573', category: '产后恢复' },
  { id: 'c09b17b1-fc0d-416f-8dba-300be8c16443', store_name: '美丽妈妈(太阳宫凯德MALL店)', store_id: '6740168083865864196', category: '产后恢复' },
  { id: '7323b0e8-7a42-45be-a078-3c98cdcbf654', store_name: '美丽妈妈产后恢复中心(全椒店)', store_id: '6822079506346412046', category: '产后恢复' },
  { id: 'd2bca0b8-1dcb-433e-a977-9b531c248256', store_name: '美丽妈妈产后恢复中心(世纪金源购物中心店)', store_id: '6601164130344765443', category: '产后恢复' },
  { id: '2d061c82-eb43-44b0-b47f-9970b66ed4c6', store_name: '美丽妈妈产后恢复中心(临平总店)', store_id: '6892235334466144256', category: '产后恢复' },
  { id: '7a479619-b839-4a2c-9e7c-55e2604b8784', store_name: '美丽妈妈产后管理中心(婺城店)', store_id: '7275219776186615847', category: '产后恢复' },
  { id: '1fa8c1ef-44fe-41a2-abad-b76c30f4b720', store_name: '美丽妈妈产后恢复中心(龙阳店)', store_id: '7163596289832945671', category: '产后恢复' },
  { id: 'fccc490f-ddb4-4846-97e7-bdc8c6471bc0', store_name: '美丽妈妈产后恢复中心(丰乐大道店)', store_id: '6601150266005784590', category: '产后恢复' },
  { id: '424e41bd-c831-48c1-ba7c-3c89cd25202e', store_name: '美丽妈妈产后恢复中心(乾州店)', store_id: '7291559513327405091', category: '产后恢复' },
  { id: '12adfad0-2645-4ee3-8f03-d64fec4a9981', store_name: '美丽妈妈健康管理中心(铁岭店)', store_id: '6601226900981417988', category: '产后恢复' },
  { id: '91080c13-f996-4d27-a3f1-6352d15d68e7', store_name: '美丽妈妈产后恢复中心(飘鹰世纪大厦店)', store_id: '7197998866963105826', category: '产后恢复' },
  { id: 'e2b46f42-52b6-4799-b7f1-7084adb9b204', store_name: '美丽妈妈产后恢复中心(塘厦店)', store_id: '6970436966588352512', category: '产后恢复' },
  { id: '02e3fa4a-f04f-4ca7-8022-3c0ebf8b4aee', store_name: '美丽妈妈产后恢复中心(三林店)', store_id: '7124571155356518439', category: '产后恢复' },
  { id: 'abffa0f9-0b30-4fc2-b03e-6e8420784cf2', store_name: '美丽妈妈健康中心(星河国际店)', store_id: '6633954243902441485', category: '产后恢复' },
  { id: '95670d34-8c7d-48e9-acea-c61a7c0b9424', store_name: '美丽妈妈产后恢复中心(新北区店)', store_id: '7161376685921224711', category: '产后恢复' },
  { id: 'c95d51d5-2408-4d21-932b-e5b799db0bad', store_name: '美丽妈妈产后恢复中心(徐汇店)', store_id: '7197608506836158502', category: '产后恢复' },
  { id: 'ee3e91a3-93ee-40a8-9ae7-c2b3bf9c133a', store_name: '美丽妈妈产后恢复中心(华建店)', store_id: '7136043701356234760', category: '产后恢复' },
  { id: '50c2c6fa-2e03-491a-a22c-3c1143ca9ba5', store_name: '美丽妈妈产后管理中心(萧山店)', store_id: '7275198962138384444', category: '产后恢复' },
  { id: '8bddc942-dacd-4c13-beaf-b7640a299eed', store_name: '美丽妈妈产后恢复中心(华强北店)', store_id: '7444469292462147584', category: '产后恢复' },
  { id: 'f63056eb-12b1-48ca-bff7-d79a38085d90', store_name: '美丽妈妈产后恢复中心(温岭店)', store_id: '7161673219051620365', category: '产后恢复' },
  { id: '58dff063-be3f-479d-a52d-61baf84d231b', store_name: '美丽妈妈产后恢复中心(新华广场店)', store_id: '6861819656169162763', category: '产后恢复' },
  { id: '4e917479-3700-4b75-baac-2b3c40b94df7', store_name: '美丽妈妈产后恢复中心(南桥店)', store_id: '7202092485466654760', category: '产后恢复' },
  { id: '67b06bdf-8260-4574-8a71-a760659a87ca', store_name: '美丽妈妈产后管理中心(包头店)', store_id: '7290081198523549755', category: '产后恢复' },
  { id: '00a85a75-4906-40a0-a138-ad426a4c7d19', store_name: '美丽妈妈产后恢复中心(盛泽店)', store_id: '6628639168975079427', category: '产后恢复' },
  { id: '846dec04-7ce3-4ce1-beb5-69f4b3e43d64', store_name: '美丽妈妈产后管理中心(中央公园店)', store_id: '7216989216893306914', category: '产后恢复' },
  { id: '5f443259-5fdc-4e60-af51-aedef712c246', store_name: '美丽妈妈产后管理中心(花溪区店)', store_id: '7161364443837696036', category: '产后恢复' },
  { id: 'd1c2c071-90ae-41ec-87a6-7524d5334884', store_name: '美丽妈妈产后管理中心(南山店)', store_id: '6899929412792223747', category: '产后恢复' },
  { id: '868860d9-4c43-405a-811d-2200f33db123', store_name: '美丽妈妈产后恢复中心(长寿路店)', store_id: '6734933813295712268', category: '产后恢复' },
  { id: 'dfcf8fdd-b47d-469e-998b-23b1db931782', store_name: '美丽妈妈产后恢复中心(常德旗舰店)', store_id: '6731563219015501827', category: '产后恢复' },
  { id: 'b80afb6f-68ba-4f69-80a9-ab426cb926f1', store_name: '美丽妈妈产后管理中心(盐城店)', store_id: '7101463083800856616', category: '产后恢复' },
  { id: '54f2d810-2c2b-4464-89c0-230aae2f6f13', store_name: '美丽妈妈产后恢复中心(江桥万达店)', store_id: '7161749212374239240', category: '产后恢复' },
  { id: '3363ccaa-8e92-4608-8338-7dd2fb191e65', store_name: '美丽妈妈产后恢复中心(高笋塘店)', store_id: '7199845017627428923', category: '产后恢复' },
  { id: 'de58941b-bc1d-4340-93f1-fd1cfebb4609', store_name: '美丽妈妈产后管理中心(宏大店)', store_id: '7272988586780133416', category: '产后恢复' },
  { id: 'c055ba96-80db-4a3e-be7c-27c2b96badf6', store_name: '美丽妈妈产后恢复中心(长泰广场店)', store_id: '7236575746771126312', category: '产后恢复' },
  { id: '17422dc5-801f-45ef-bf5b-d000cdb0a606', store_name: '美丽妈妈产后恢复中心(江南店)', store_id: '7159443601389258785', category: '产后恢复' },
  { id: 'c7f20d82-2f9a-42e0-985a-01487abd4ce6', store_name: '美丽妈妈产后恢复中心(丽水店)', store_id: '7165770119551911973', category: '产后恢复' },
  { id: 'a8f38a47-6e65-4bbd-94d1-998733e41e12', store_name: '美丽妈妈产后恢复中心(天山店)', store_id: '6601219990018344963', category: '产后恢复' },
  { id: 'ebea1b0d-a0fd-46a9-9c62-fa990247b7c5', store_name: '美丽妈妈产后管理中心(西宁店)', store_id: '7262191581170501672', category: '产后恢复' },
  { id: '62049ae1-b982-4380-82b9-9c9b16507648', store_name: '美丽妈妈产后恢复中心(自贡旗舰店)', store_id: '7433727191629875263', category: '产后恢复' },
  { id: 'd4a42927-d80a-4589-a00c-0c2fd8b68d00', store_name: '美丽妈妈(古城店)', store_id: '7169545905526278156', category: '产后恢复' },
  { id: 'f227914b-5734-4a2b-8701-995481bef2b4', store_name: '美丽妈妈产后恢复中心(普陀店)', store_id: '6636896474183583751', category: '产后恢复' },
];

export async function POST(request: Request) {
  try {
    // 使用 service role client 以获得完整的写权限
    const supabase = getSupabaseServiceClient();

    // 获取环境信息
    const currentEnv = process.env.COZE_PROJECT_ENV || 'unknown';
    const dbUrl = process.env.COZE_SUPABASE_URL || 'unknown';

    // 检查是否已经初始化过
    const { count, error: countError } = await supabase
      .from('stores')
      .select('*', { count: 'exact', head: true })
      .eq('store_system', 'meili');

    if (countError) {
      console.error('查询美丽妈妈门店失败:', countError);
      return NextResponse.json(
        {
          success: false,
          error: `数据库查询失败: ${countError.message}`,
          environment: currentEnv,
        },
        { status: 500 }
      );
    }

    if (count && count > 0) {
      return NextResponse.json({
        success: true,
        message: '美丽妈妈门店数据已存在',
        existingCount: count,
        environment: currentEnv,
        database: dbUrl,
      });
    }

    // 批量插入门店数据
    let successCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    for (const store of MEILI_STORES) {
      try {
        const { error } = await supabase.from('stores').insert({
          id: store.id,
          store_name: store.store_name,
          store_id: store.store_id,
          category: store.category,
          business_status: '服务中',
          store_system: 'meili',
        });

        if (error) {
          failedCount++;
          errors.push(`${store.store_name}: ${error.message}`);
        } else {
          successCount++;
        }
      } catch (err) {
        failedCount++;
        errors.push(`${store.store_name}: ${err}`);
      }
    }

    return NextResponse.json({
      success: true,
      message: `美丽妈妈门店初始化完成，成功 ${successCount} 家，失败 ${failedCount} 家`,
      successCount,
      failedCount,
      errors: errors.slice(0, 10), // 只返回前10个错误
      environment: currentEnv,
      database: dbUrl,
    });
  } catch (error) {
    console.error('初始化美丽妈妈门店失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '未知错误',
        environment: process.env.COZE_PROJECT_ENV || 'unknown',
      },
      { status: 500 }
    );
  }
}
