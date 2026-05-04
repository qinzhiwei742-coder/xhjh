import { NextRequest, NextResponse } from 'next/server';
import { LLMClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';

interface FilterCondition {
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'in';
  value: string | number | boolean | string[];
  description?: string;
}

interface AIFilterRequest {
  query: string;
}

// 生成筛选条件
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query } = body as AIFilterRequest;

    if (!query?.trim()) {
      return NextResponse.json(
        { success: false, error: '请输入筛选条件' },
        { status: 400 }
      );
    }

    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const config = new Config();
    const llmClient = new LLMClient(config, customHeaders);

    // 构建系统提示词
    const systemPrompt = `你是一个智能筛选条件解析专家。你的任务是将用户的自然语言转换为结构化的筛选条件。

## 可用的筛选字段（字段名映射表）
### 基础信息字段
- store_name: 门店名称（字符串）
- store_level: 门店等级（S/A/B/C）
- business_status: 服务状态（搭建中/服务中/取消合作）
- next_follow_time: 下次跟进时间（日期，格式：YYYY-MM-DD）
- merchant_phone: 商户电话（字符串）
- category: 品类（字符串）
- province: 省份（字符串）
- city: 城市（字符串）
- address: 地址（字符串）

### 订单维度字段（别名：订单数/单数/订单量/总单数）
- totalOrders: 总订单数（所有订单）
- validOrders: 有效订单数（实收>10元）
- fakeOrders: 刷单数（实收<=10元）
- refundCount: 退款数

### 业绩维度字段（别名：核销率/有效核销率）
- verifyCount: 核销数
- validVerifyCount: 有效核销数（核销金额>10元）
- fakeVerifyCount: 虚假核销数（核销金额<=10元）
- verifyRate: 核销率（百分比，自动乘以100）
- validVerifyRate: 有效核销率（百分比，自动乘以100）
- verifyAmount: 核销金额
- validVerifyAmount: 有效核销金额

### 金额维度字段
- totalAmount: 总金额
- validOrderAmount: 有效订单金额
- refundAmount: 退款金额
- adInvestment: 广告费

## 自然语言到字段名的映射规则
- "订单数"/"单数"/"订单量"/"总单数"/"总订单" → totalOrders
- "有效单数"/"有效订单"/"有效订单数" → validOrders
- "核销数"/"核销单数" → verifyCount
- "有效核销"/"有效核销数"/"有效核销单" → validVerifyCount
- "核销率" → verifyRate（百分比，如用户说"超过10%"，value传10）
- "有效核销率" → validVerifyRate（百分比，如用户说"超过15%"，value传15）
- "广告费" → adInvestment

## 操作符说明
- eq: 等于
- ne: 不等于
- gt: 大于
- lt: 小于
- gte: 大于等于
- lte: 小于等于
- contains: 包含（用于字符串）
- in: 在列表中

## 时间处理规则
- "今天" = 当天日期（YYYY-MM-DD）
- "明天" = 明天日期（YYYY-MM-DD）
- "后天" = 后天日期（YYYY-MM-DD）
- "N天后" = 今天 + N天后的日期
- "下周" = 下周一到周日的日期范围
- "本周" = 本周一到周日的日期范围
- "3月1号到10号" = 日期范围 2025-03-01 到 2025-03-10（用于next_follow_time）
- "3月份" = 2025年3月（根据实际年份）

## 重要提示
1. 此筛选功能只参与数据字段筛选，不参与时间筛选
2. 订单、核销、广告费数据基于用户当前选中的时间范围（dataTimeStart到dataTimeEnd）
3. 不支持按时间范围筛选（如"3月核销率"理解为当前选中时间范围内的核销率）
4. 不支持下次跟进时间筛选
5. 百分比字段（verifyRate、validVerifyRate）的值传数字，不需要百分号，如"超过10%"传10
6. 金额字段的值传数字，如"超过10000元"传10000
7. 优先使用具体的字段名（totalOrders、validVerifyRate等），不要使用通用别名（order_count、verify_rate）
8. 筛选条件之间是 AND 关系，必须同时满足所有条件

## 响应格式
请以JSON格式返回筛选条件，格式如下：
{
  "filters": [
    {
      "field": "字段名",
      "operator": "操作符",
      "value": "值",
      "description": "中文描述"
    }
  ],
  "explanation": "整体解释"
}

## 示例
输入："核销率低于10%的门店"
输出：
{
  "filters": [
    {
      "field": "verifyRate",
      "operator": "lt",
      "value": 10,
      "description": "核销率低于10%"
    }
  ],
  "explanation": "筛选核销率低于10%的门店"
}

输入："订单数超过20单的门店"
输出：
{
  "filters": [
    {
      "field": "totalOrders",
      "operator": "gt",
      "value": 20,
      "description": "订单数超过20单"
    }
  ],
  "explanation": "筛选订单数超过20单的门店"
}

输入："有效核销率超过11.5%的门店"
输出：
{
  "filters": [
    {
      "field": "validVerifyRate",
      "operator": "gt",
      "value": 11.5,
      "description": "有效核销率超过11.5%"
    }
  ],
  "explanation": "筛选有效核销率超过11.5%的门店"
}

输入："订单数超过20单且有效核销率超过11.5%的门店"
输出：
{
  "filters": [
    {
      "field": "totalOrders",
      "operator": "gt",
      "value": 20,
      "description": "订单数超过20单"
    },
    {
      "field": "validVerifyRate",
      "operator": "gt",
      "value": 11.5,
      "description": "有效核销率超过11.5%"
    }
  ],
  "explanation": "筛选订单数超过20单且有效核销率超过11.5%的门店"
}

输入："下周要跟进的S级门店"
输出：
{
  "filters": [
    {
      "field": "store_level",
      "operator": "eq",
      "value": "S",
      "description": "门店等级为S级"
    },
    {
      "field": "next_follow_time",
      "operator": "gte",
      "value": "2025-03-10",
      "description": "下次跟进时间大于等于2025-03-10"
    },
    {
      "field": "next_follow_time",
      "operator": "lte",
      "value": "2025-03-16",
      "description": "下次跟进时间小于等于2025-03-16"
    }
  ],
  "explanation": "筛选下周（2025-03-10到2025-03-16）需要跟进的S级门店"
}

输入："包含美容的门店"
输出：
{
  "filters": [
    {
      "field": "store_name",
      "operator": "contains",
      "value": "美容",
      "description": "门店名称包含美容"
    }
  ],
  "explanation": "筛选名称包含'美容'的门店"
}

输入："广告费超过10000元的门店"
输出：
{
  "filters": [
    {
      "field": "adInvestment",
      "operator": "gt",
      "value": 10000,
      "description": "广告费超过10000元"
    }
  ],
  "explanation": "筛选广告费超过10000元的门店"
}

输入："有效单数少于10单的门店"
输出：
{
  "filters": [
    {
      "field": "validOrders",
      "operator": "lt",
      "value": 10,
      "description": "有效单数少于10单"
    }
  ],
  "explanation": "筛选有效单数少于10单的门店"
}
输出：
{
  "filters": [
    {
      "field": "next_follow_time",
      "operator": "gte",
      "value": "2025-03-01",
      "description": "下次跟进时间大于等于2025-03-01"
    },
    {
      "field": "next_follow_time",
      "operator": "lte",
      "value": "2025-03-10",
      "description": "下次跟进时间小于等于2025-03-10"
    },
    {
      "field": "verify_rate",
      "operator": "lt",
      "value": 10,
      "description": "核销率低于10%"
    }
  ],
  "explanation": "筛选3月1号到10号期间需要跟进且核销率低于10%的门店"
}

输入："北京的门店"
输出：
{
  "filters": [
    {
      "field": "city",
      "operator": "eq",
      "value": "北京",
      "description": "城市为北京"
    }
  ],
  "explanation": "筛选北京的门店"
}

输入："广东省的门店"
输出：
{
  "filters": [
    {
      "field": "province",
      "operator": "eq",
      "value": "广东省",
      "description": "省份为广东省"
    }
  ],
  "explanation": "筛选广东省的门店"
}

输入："深圳市美容行业的门店"
输出：
{
  "filters": [
    {
      "field": "city",
      "operator": "eq",
      "value": "深圳",
      "description": "城市为深圳"
    },
    {
      "field": "category",
      "operator": "contains",
      "value": "美容",
      "description": "品类包含美容"
    }
  ],
  "explanation": "筛选深圳市美容行业的门店"
}

**重要**：
1. 只返回有效的JSON，不要包含其他文字
2. 如果无法理解用户意图，返回 { "filters": [], "explanation": "无法理解该筛选条件" }
3. 日期格式必须是 YYYY-MM-DD
4. 数值类型不要用字符串`;

    const response = await llmClient.invoke([
      {
        role: 'user' as const,
        content: [
          {
            type: 'text',
            text: `${systemPrompt}\n\n用户输入：${query}\n\n请解析用户的筛选需求并返回JSON格式的筛选条件：`,
          },
        ],
      },
    ], {
      model: 'doubao-seed-2-0-mini-260215',
      temperature: 0.3, // 降低温度以获得更稳定的结果
    });

    // 解析AI返回的JSON
    let result;
    try {
      // 清理可能的markdown标记
      const cleanedContent = response.content
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .trim();

      result = JSON.parse(cleanedContent);
    } catch (parseError) {
      console.error('解析AI响应失败:', parseError);
      console.error('原始响应:', response.content);
      return NextResponse.json(
        {
          success: false,
          error: 'AI返回格式错误，请重试',
          rawResponse: response.content,
        },
        { status: 500 }
      );
    }

    // 验证返回格式
    if (!result.filters || !Array.isArray(result.filters)) {
      return NextResponse.json(
        {
          success: false,
          error: 'AI返回格式错误',
          explanation: '无法解析筛选条件',
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      filters: result.filters as FilterCondition[],
      explanation: result.explanation || '',
    });
  } catch (error) {
    console.error('AI筛选失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'AI筛选失败',
      },
      { status: 500 }
    );
  }
}
