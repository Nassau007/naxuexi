'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

const navItems = [
  { href: '/', label: 'Dashboard', icon: '概', description: 'Overview' },
  { href: '/vocab', label: 'Vocabulary', icon: '词', description: 'Manage words' },
  { href: '/flashcards', label: 'Flashcards', icon: '卡', description: 'Review cards' },
  { href: '/pronunciation', label: 'Pronunciation', icon: '音', description: 'Listen & speak' },
  { href: '/translate', label: 'Translate', icon: '译', description: 'Practice sentences' },
  { href: '/converse', label: 'Converse', icon: '话', description: 'Role-play conversations' },
  { href: '/poems', label: 'Poèmes', icon: '📜', description: 'French poetry' },
];

export function Sidebar() {
  const pathname = usePathname();
  const [pendingCount, setPendingCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/converse/pending/count')
      .then(r => r.ok ? r.json() : { count: 0 })
      .then(data => {
        if (!cancelled) setPendingCount(data.count ?? 0);
      })
      .catch(() => {
        if (!cancelled) setPendingCount(0);
      });
    return () => { cancelled = true; };
  }, [pathname]);

  return (
    <>
      {/* ── Desktop sidebar (md+) ── */}
      <aside className="hidden md:flex fixed left-0 top-0 h-full w-64 bg-white border-r border-ink-200/60 flex-col z-40">
        <div className="p-6 border-b border-ink-100">
          <h1 className="font-display text-xl font-bold text-ink-900 flex items-center gap-2">
            <span className="hanzi-display text-vermillion-600 text-2xl">学</span>
            <span>HanziFlow</span>
          </h1>
          <p className="text-xs text-ink-400 mt-1">Chinese Learning Hub</p>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const showBadge = item.href === '/converse' && typeof pendingCount === 'number' && pendingCount > 0;
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
                <div className="flex-1 flex items-center justify-between">
                  <div className="text-sm font-medium">{item.label}</div>
                  {showBadge && (
                    <span className="text-[10px] font-semibold bg-amber-500 text-white rounded-full px-2 py-0.5 min-w-[20px] text-center">
                      {pendingCount}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-ink-100">
          <div className="text-xs text-ink-400">
            Daily streak: <span className="text-vermillion-600 font-semibold">—</span>
          </div>
        </div>
      </aside>

      {/* ── Mobile bottom tab bar (< md) ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-ink-200/60 flex">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const showBadge = item.href === '/converse' && typeof pendingCount === 'number' && pendingCount > 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`
                flex-1 flex flex-col items-center justify-center py-2 gap-0.5
                transition-colors duration-150 relative
                ${isActive ? 'text-vermillion-600' : 'text-ink-400'}
              `}
            >
              {showBadge && (
                <span className="absolute top-1 right-1/2 translate-x-3 text-[8px] font-semibold bg-amber-500 text-white rounded-full px-1 min-w-[14px] text-center leading-tight">
                  {pendingCount}
                </span>
              )}
              <span className="hanzi-display text-xl leading-none">{item.icon}</span>
              <span className="text-[9px] font-medium leading-none mt-0.5 truncate w-full text-center px-0.5">
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
