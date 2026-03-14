import type { Metadata } from 'next';
import { Sidebar } from '@/components/Sidebar';
import './globals.css';

export const metadata: Metadata = {
  title: 'HanziFlow — Chinese Learning Hub',
  description: 'Personal Chinese learning platform with spaced repetition, pronunciation, and daily practice.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Sidebar />
        {/* Desktop: offset by sidebar. Mobile: no left margin, pad bottom for tab bar */}
        <main className="md:ml-64 min-h-screen pb-20 md:pb-0">
          {children}
        </main>
      </body>
    </html>
  );
}
