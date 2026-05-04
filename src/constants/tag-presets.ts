// 自定义标签颜色常量
export const CUSTOM_TAG_COLOR = '#722ed1';

// 允许的预设标签名称列表（用于清理）
export const ALLOWED_TAG_PRESETS: string[] = [
  'S:核心店',
  'A:重点店',
  'B:一般店',
  'C:关注店',
  'C-:问题店',
  '美丽妈妈',
  '直营店',
];

// 预设标签名称列表
export const PRESET_TAG_NAMES: string[] = [
  'S:核心店',
  'A:重点店',
  'B:一般店',
  'C:关注店',
  'C-:问题店',
  '美丽妈妈',
  '直营店',
];

// 预设标签配置
export const PRESET_TAGS = [
  { tag_name: 'S:核心店', tag_color: '#f53f3f', sort_order: 0 },
  { tag_name: 'A:重点店', tag_color: '#f53f3f', sort_order: 1 },
  { tag_name: 'B:一般店', tag_color: '#165dff', sort_order: 2 },
  { tag_name: 'C:关注店', tag_color: '#00b42a', sort_order: 3 },
  { tag_name: 'C-:问题店', tag_color: '#86909c', sort_order: 4 },
  { tag_name: '美丽妈妈', tag_color: '#ff7d00', sort_order: 5 },
  { tag_name: '直营店', tag_color: '#722ed1', sort_order: 6 },
] as const;
