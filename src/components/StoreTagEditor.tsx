import React, { useState, useEffect, useRef, memo, useCallback } from 'react';
import { PRESET_TAG_NAMES, CUSTOM_TAG_COLOR } from '@/constants/tag-presets';

interface StoreTag {
  id: string;
  store_id: string;
  tag_name: string;
  tag_color: string;
  created_at: string;
}

interface TagPreset {
  id: string;
  tag_name: string;
  tag_color: string;
  sort_order: number;
  is_active?: boolean;
}

interface StoreTagEditorProps {
  storeId: string;
  storeName?: string;
  storeTags?: StoreTag[];
  onUpdate?: () => void;
  renderTrigger?: (onClick: () => void, tags: StoreTag[]) => React.ReactNode;
  buttonOnly?: boolean;
  hideTags?: boolean;
  setHideTags?: (value: boolean) => void;
}

// 预设标签缓存
let presetsCache: TagPreset[] | null = null;
let presetsCacheTime = 0;
const PRESETS_CACHE_DURATION = 5 * 60 * 1000; // 5分钟

// 门店标签缓存
const storeTagsCache = new Map<string, { tags: StoreTag[]; time: number }>();
const TAGS_CACHE_DURATION = 2 * 60 * 1000; // 2分钟

const StoreTagEditor = memo(function StoreTagEditor({
  storeId,
  storeName,
  storeTags = [],
  onUpdate,
  renderTrigger,
  buttonOnly = false,
  hideTags = false,
  setHideTags
}: StoreTagEditorProps) {
  // 预设标签状态
  const [tags, setTags] = useState<StoreTag[]>(storeTags);
  const [presets, setPresets] = useState<TagPreset[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [loadingTagId, setLoadingTagId] = useState<string | null>(null);
  const [newTagName, setNewTagName] = useState('');
  const [creatingTag, setCreatingTag] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // 记录是否已加载过数据
  const hasLoadedRef = useRef(false);

  // 初始化标签（当 storeTags prop 变化时）
  useEffect(() => {
    setTags(storeTags);
  }, [storeTags]);

  // 获取预设标签（带缓存）
  const fetchPresets = useCallback(async () => {
    const now = Date.now();
    if (presetsCache && now - presetsCacheTime < PRESETS_CACHE_DURATION) {
      return presetsCache;
    }
    
    try {
      const res = await fetch('/api/tag-presets');
      const data = await res.json();
      if (data.data) {
        presetsCache = data.data;
        presetsCacheTime = now;
        return data.data;
      }
    } catch (e) {
      console.error('获取预设标签失败:', e);
    }
    return [];
  }, []);

  // 获取门店标签（带缓存）
  const fetchStoreTags = useCallback(async (sid: string) => {
    const now = Date.now();
    const cached = storeTagsCache.get(sid);
    if (cached && now - cached.time < TAGS_CACHE_DURATION) {
      return cached.tags;
    }
    
    try {
      const res = await fetch(`/api/store-tags?store_id=${sid}`);
      const data = await res.json();
      if (data.success && data.data) {
        storeTagsCache.set(sid, { tags: data.data, time: now });
        return data.data;
      }
    } catch (e) {
      console.error('获取门店标签失败:', e);
    }
    return [];
  }, []);

  // 打开弹窗时加载数据
  const handleOpenModal = useCallback(async () => {
    setShowModal(true);
    setError(null);
    hasLoadedRef.current = false;
    
    // 并行加载预设和门店标签
    const [presetsData, tagsData] = await Promise.all([
      fetchPresets(),
      fetchStoreTags(storeId)
    ]);
    
    if (presetsData.length > 0) {
      setPresets(presetsData);
    }
    if (tagsData.length > 0) {
      setTags(tagsData);
    }
    hasLoadedRef.current = true;
  }, [storeId, fetchPresets, fetchStoreTags]);

  // 创建自定义标签并添加到门店
  const handleCreateCustomTag = useCallback(async () => {
    const tagName = newTagName.trim();
    if (!tagName || creatingTag || !storeId) return;

    setCreatingTag(true);
    setError(null);
    
    try {
      // 新创建的自定义标签统一使用自定义标签颜色
      const tagColor = CUSTOM_TAG_COLOR;

      // 添加标签到门店
      const res = await fetch('/api/store-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_id: storeId, tag_name: tagName, tag_color: tagColor }),
      });
      
      const data = await res.json();
      
      if (data.success && data.data) {
        // 更新缓存
        const cached = storeTagsCache.get(storeId);
        if (cached) {
          cached.tags = [...cached.tags, data.data];
        }
        
        setTags(prev => [...prev, data.data]);
        setNewTagName('');
        onUpdate?.();
      } else {
        setError(data.error || '添加标签失败');
      }
    } catch (err) {
      setError('网络错误，请重试');
      console.error('添加标签失败:', err);
    }
    setCreatingTag(false);
  }, [newTagName, creatingTag, storeId, onUpdate]);

  // 添加或删除预设标签
  const handleToggleTag = useCallback(async (preset: TagPreset) => {
    if (!storeId || loadingTagId) return;
    
    const existingTag = tags.find(t => t.tag_name === preset.tag_name);
    
    if (existingTag) {
      setLoadingTagId(existingTag.id);
      try {
        const res = await fetch(`/api/store-tags?id=${existingTag.id}`, { method: 'DELETE' });
        if (res.ok) {
          // 更新缓存
          const cached = storeTagsCache.get(storeId);
          if (cached) {
            cached.tags = cached.tags.filter(t => t.id !== existingTag.id);
          }
          
          setTags(prev => prev.filter(t => t.id !== existingTag.id));
          onUpdate?.();
        }
      } catch (err) {
        console.error('删除标签失败:', err);
      }
    } else {
      setLoadingTagId(preset.tag_name);
      try {
        const res = await fetch('/api/store-tags', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ store_id: storeId, tag_name: preset.tag_name, tag_color: preset.tag_color }),
        });
        const data = await res.json();
        if (data.success && data.data) {
          // 更新缓存
          const cached = storeTagsCache.get(storeId);
          if (cached) {
            cached.tags = [...cached.tags, data.data];
          }
          
          setTags(prev => [...prev, data.data]);
          onUpdate?.();
        }
      } catch (err) {
        console.error('添加标签失败:', err);
      }
    }
    setLoadingTagId(null);
  }, [storeId, loadingTagId, tags, onUpdate]);

  const addedTagNames = tags.map(t => t.tag_name);
  const availablePresets = presets.filter(p => !addedTagNames.includes(p.tag_name));

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
          width: '360px', 
          maxHeight: '500px',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div style={{ padding: '16px', borderBottom: '1px solid #e5e6eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '15px', fontWeight: 500, color: '#1d2129' }}>
            管理标签
          </span>
          <span style={{ fontSize: '12px', color: '#86909c', marginLeft: '8px' }}>
            {storeName?.slice(0, 12)}{storeName && storeName.length > 12 ? '...' : ''}
          </span>
          <svg 
            width="16" 
            height="16" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="#86909c" 
            strokeWidth="2"
            style={{ cursor: 'pointer', marginLeft: 'auto' }}
            onClick={() => setShowModal(false)}
          >
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </div>
        
        {/* 错误提示 */}
        {error && (
          <div style={{ padding: '8px 16px', background: '#fff2f0', color: '#f53f3f', fontSize: '12px' }}>
            {error}
          </div>
        )}
        
        {/* 新建标签 */}
        <div style={{ padding: '16px', borderBottom: '1px solid #e5e6eb' }}>
          <div style={{ fontSize: '12px', color: '#86909c', marginBottom: '10px', fontWeight: 500 }}>新建标签</div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreateCustomTag(); }}
              placeholder="输入标签名"
              style={{ 
                flex: 1, 
                height: '36px', 
                padding: '0 12px', 
                fontSize: '13px', 
                border: '1px solid #e5e6eb', 
                borderRadius: '6px', 
                outline: 'none'
              }}
            />
            <button
              onClick={handleCreateCustomTag}
              disabled={!newTagName.trim() || creatingTag}
              style={{ 
                height: '36px', 
                padding: '0 16px', 
                fontSize: '13px', 
                background: newTagName.trim() && !creatingTag ? '#165dff' : '#f2f3f5', 
                color: newTagName.trim() && !creatingTag ? '#fff' : '#86909c', 
                border: 'none', 
                borderRadius: '6px', 
                cursor: newTagName.trim() && !creatingTag ? 'pointer' : 'not-allowed',
                whiteSpace: 'nowrap'
              }}
            >
              {creatingTag ? '添加中...' : '添加'}
            </button>
          </div>
        </div>
        
        {/* 当前标签 */}
        {tags.length > 0 && (
          <div style={{ padding: '16px', borderBottom: '1px solid #e5e6eb' }}>
            <div style={{ fontSize: '12px', color: '#86909c', marginBottom: '10px', fontWeight: 500 }}>
              已添加标签（点击删除）
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {tags.map(tag => {
                // 判断是否为预设标签
                const isPreset = PRESET_TAG_NAMES.includes(tag.tag_name);
                // 自定义标签统一使用紫色
                const displayColor = isPreset ? tag.tag_color : CUSTOM_TAG_COLOR;

                return (
                  <span
                    key={tag.id}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '4px 10px',
                      borderRadius: '4px',
                      fontSize: '13px',
                      background: `${displayColor}15`,
                      color: displayColor,
                      border: `1px solid ${displayColor}30`,
                      cursor: loadingTagId === tag.id ? 'wait' : 'pointer'
                    }}
                    onClick={() => !loadingTagId && handleToggleTag({ id: tag.id, tag_name: tag.tag_name, tag_color: tag.tag_color, sort_order: 0 })}
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
        <div style={{ padding: '16px', flex: 1, overflowY: 'auto' }}>
          <div style={{ fontSize: '12px', color: '#86909c', marginBottom: '10px', fontWeight: 500 }}>
            预设标签（点击添加）
          </div>
          {availablePresets.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {availablePresets.map(preset => {
                const isLoading = loadingTagId === preset.tag_name;
                return (
                  <span 
                    key={preset.id} 
                    style={{ 
                      display: 'inline-flex', 
                      alignItems: 'center', 
                      gap: '4px',
                      padding: '4px 10px', 
                      borderRadius: '4px', 
                      fontSize: '13px', 
                      background: '#f2f3f5', 
                      color: '#4e5969', 
                      border: '1px solid #e5e6eb',
                      cursor: isLoading ? 'wait' : 'pointer'
                    }}
                    onClick={() => !isLoading && handleToggleTag(preset)}
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
            <div style={{ textAlign: 'center', color: '#86909c', fontSize: '13px', padding: '24px 0' }}>
              所有预设标签已添加
            </div>
          )}
        </div>
      </div>
    </div>
  ) : null;

  // 如果提供了 renderTrigger，使用自定义触发器
  if (renderTrigger) {
    return (
      <>
        {renderTrigger(handleOpenModal, tags)}
        {modalContent}
      </>
    );
  }

  // 默认触发器：标签 + 按钮
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        {!hideTags && tags.length > 0 ? (
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            {tags.map(tag => {
              const isPreset = PRESET_TAG_NAMES.includes(tag.tag_name);
              const displayColor = isPreset ? tag.tag_color : CUSTOM_TAG_COLOR;
              return (
                <span key={tag.id} style={{
                  padding: '2px 8px',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontWeight: '500',
                  background: `${displayColor}15`,
                  color: displayColor,
                  border: `1px solid ${displayColor}40`
                }}>
                  {tag.tag_name}
                </span>
              );
            })}
          </div>
        ) : null}
        <button
          onClick={handleOpenModal}
          style={{
            border: '1px solid #e5e6eb',
            background: '#fff',
            padding: '2px 8px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px',
            color: '#165dff',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#f2f3f5';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#fff';
          }}
        >
          +标签
        </button>

        {/* 标签隐藏按钮 */}
        {setHideTags && (
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
              display: 'flex',
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
        )}
      </div>
      {modalContent}
    </>
  );
});

export default StoreTagEditor;
