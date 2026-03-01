'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/', label: 'Dashboard', icon: '概', description: 'Overview' },
  { href: '/vocab', label: 'Vocabulary', icon: '词', description: 'Manage words' },
  { href: '/flashcards', label: 'Flashcards', icon: '卡', description: 'Review cards' },
  { href: '/pronunciation', label: 'Pronunciation', icon: '音', description: 'Listen & speak' },
  { href: '/translate', label: 'Translate', icon: '译', description: 'Practice sentences' },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 h-full w-64 bg-white border-r border-ink-200/60 flex flex-col z-40">
      {/* Logo */}
      <div className="p-6 border-b border-ink-100">
        <h1 className="font-display text-xl font-bold text-ink-900 flex items-center gap-2">
          <span className="hanzi-display text-vermillion-600 text-2xl">学</span>
          <span>HanziFlow</span>
        </h1>
        <p className="text-xs text-ink-400 mt-1">Chinese Learning Hub</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`
                flex items-center gap-3 px-3 py-2.5 rounded-lg
                transition-all duration-150 group
                ${isActive
                  ? 'bg-vermillion-50 text-vermillion-700'
                  : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900'
                }
              `}
            >
              <span className={`
                hanzi-display text-lg w-7 text-center
                ${isActive ? 'text-vermillion-600' : 'text-ink-400 group-hover:text-ink-600'}
              `}>
                {item.icon}
              </span>
              <div>
                <div className="text-sm font-medium">{item.label}</div>
              </div>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-ink-100">
        <div className="text-xs text-ink-400">
          Daily streak: <span className="text-vermillion-600 font-semibold">—</span>
        </div>
      </div>
    </aside>
  );
}
