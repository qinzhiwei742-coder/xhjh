import type { Metadata } from 'next';
import { Inspector } from 'react-dev-inspector';
import { AuthProvider } from '@/contexts/AuthContext';
import GlobalKeyboardHandler from '@/components/GlobalKeyboardHandler';
import './globals.css';

export const metadata: Metadata = {
  title: '星海计划【1.1】',
  description: 'B端门店客户关系管理系统',
  keywords: ['SCRM', '门店管理', '客户关系'],
  authors: [{ name: 'Coze Code Team' }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isDev = process.env.COZE_PROJECT_ENV === 'DEV';

  return (
    <html lang="zh-CN">
      <body className="antialiased">
        <AuthProvider>
          <GlobalKeyboardHandler />
          {isDev && <Inspector />}
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
