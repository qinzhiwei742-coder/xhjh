import { NextRequest, NextResponse } from 'next/server';
import { LLMClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';

interface StoreInfo {
  name: string;
  storeId?: string | null;
  category?: string | null;
  merchantName?: string | null;
  merchantPhone?: string | null;
  province?: string | null;
  city?: string | null;
  address?: string | null;
  businessStatus?: string | null;
}

// 生成商户AI总结
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { images, remarks, promptTemplate, customInput, storeInfo } = body as {
      images?: string[];
      remarks?: string;
      promptTemplate?: string;
      customInput?: string;
      storeInfo?: StoreInfo;
    };

    // 如果有自定义输入，优先使用
    if (!customInput?.trim() && !images?.length && !remarks) {
      return NextResponse.json(
        { success: false, error: '缺少分析内容' },
        { status: 400 }
      );
    }

    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const config = new Config();
    const llmClient = new LLMClient(config, customHeaders);

    // 构建消息内容
    const contentParts: Array<{ type: 'text' | 'image_url'; text?: string; image_url?: { url: string } }> = [];
    
    // 添加角色词模板
    const systemPrompt = promptTemplate || `你是一个专业的商户关系分析专家。请根据以下跟进记录和聊天截图，对这个商户进行全面分析。

请按以下格式输出分析结果：

## 一、商户基本情况
[简要描述商户的基本信息、行业特点等]

## 二、沟通内容摘要
[总结主要沟通内容和关键信息]

## 三、商户需求分析
[分析商户的核心需求和痛点]

## 四、跟进效果评估
[评估当前跟进的效果和进展]

## 五、后续建议
[提出具体的后续跟进策略和行动建议]`;

    let textContent = systemPrompt + '\n\n';
    
    // 添加门店基本信息（如果有）
    if (storeInfo) {
      const storeParts: string[] = [];
      storeParts.push(`门店名称：${storeInfo.name}`);
      if (storeInfo.storeId) storeParts.push(`门店ID：${storeInfo.storeId}`);
      if (storeInfo.category) storeParts.push(`品类：${storeInfo.category}`);
      if (storeInfo.merchantName) storeParts.push(`商户名：${storeInfo.merchantName}`);
      if (storeInfo.merchantPhone) storeParts.push(`商户电话：${storeInfo.merchantPhone}`);
      const location = [storeInfo.province, storeInfo.city, storeInfo.address].filter(Boolean).join(' ');
      if (location) storeParts.push(`地址：${location}`);
      if (storeInfo.businessStatus) storeParts.push(`营业状态：${storeInfo.businessStatus}`);
      
      textContent += `【门店基本信息】\n${storeParts.join('\n')}\n\n`;
    }
    
    // 如果有自定义输入，直接使用
    if (customInput?.trim()) {
      textContent += `【用户输入的分析内容】\n${customInput.trim()}`;
    } else {
      // 否则使用跟进记录和图片
      // 添加跟进备注
      if (remarks) {
        textContent += `【跟进备注记录】\n${remarks}\n\n`;
      }
      
      // 添加图片说明
      if (images && images.length > 0) {
        textContent += `【聊天截图】共有${images.length}张截图，请分析以下图片内容：`;
      }
    }

    contentParts.push({
      type: 'text',
      text: textContent,
    });

    // 添加图片（仅在没有自定义输入时）
    if (!customInput?.trim() && images && images.length > 0) {
      images.forEach((url: string) => {
        contentParts.push({
          type: 'image_url',
          image_url: { url },
        });
      });
    }

    const response = await llmClient.invoke([
      {
        role: 'user' as const,
        content: contentParts,
      },
    ], {
      model: 'doubao-seed-2-0-mini-260215',
      temperature: 0.7,
    });

    return NextResponse.json({
      success: true,
      summary: response.content || '',
    });
  } catch (error) {
    console.error('生成AI总结失败:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '生成AI总结失败' },
      { status: 500 }
    );
  }
}
