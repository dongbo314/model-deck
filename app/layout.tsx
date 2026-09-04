import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Model Deck Core · 本地模型控制中心',
  description: '面向 OpenAI 兼容模型与可复用角色的跨平台本地控制中心。',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
