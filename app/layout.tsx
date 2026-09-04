import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Model Deck Core',
  description: 'Cross-platform local control plane for OpenAI-compatible models and personas.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
