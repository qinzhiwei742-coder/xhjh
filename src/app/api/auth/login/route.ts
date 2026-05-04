import { NextRequest, NextResponse } from 'next/server';

// 登录验证 - 单一密码登录
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { key } = body;

    if (!key) {
      return NextResponse.json(
        { success: false, error: '请输入密钥' },
        { status: 400 }
      );
    }

    // 验证密码
    const ACCESS_KEY = '996';
    if (key === ACCESS_KEY) {
      return NextResponse.json({
        success: true,
        data: {
          id: 'admin',
          name: '管理员',
        },
      });
    }

    return NextResponse.json(
      { success: false, error: '密钥错误' },
      { status: 401 }
    );
  } catch (error) {
    console.error('登录失败:', error);
    return NextResponse.json(
      { success: false, error: '登录失败' },
      { status: 500 }
    );
  }
}
