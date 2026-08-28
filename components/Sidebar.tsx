"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "Home", icon: HomeIcon },
  { href: "/classroom", label: "My Classroom", icon: UsersIcon },
  { href: "/assignments", label: "Assignments", icon: ClipboardIcon },
  { href: "/exams", label: "Exams", icon: ExamIcon },
  { href: "/library", label: "My Library", icon: BookIcon },
];

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  );
}

function UsersIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  );
}

function ClipboardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
    </svg>
  );
}

function ExamIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
      <polyline points="10 9 9 9 8 9"/>
    </svg>
  );
}

function BookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
    </svg>
  );
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  );
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  );
}

function VedaLogo({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="16" fill="#F97316"/>
      <path d="M10 16l4 4 8-8" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

interface SidebarProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export default function Sidebar({ collapsed = false, onToggleCollapse }: SidebarProps) {
  const pathname = usePathname();

  if (collapsed) {
    return (
      <aside className="fixed left-0 top-0 z-40 h-screen w-16 bg-white border-r border-zinc-200 flex flex-col shadow-sm transition-all duration-200">
        <div className="flex flex-col items-center pt-6 pb-4 px-2">
          <Link href="/exams" className="flex items-center justify-center w-10 h-10 rounded-xl bg-zinc-900 hover:bg-zinc-800 transition-colors" aria-label="VedaAI Home">
            <VedaLogo className="w-6 h-6" />
          </Link>
        </div>
        <nav className="flex-1 flex flex-col items-center px-2 space-y-1" aria-label="Main navigation">
          {navItems.map((item) => {
            const isActive = pathname === item.href || (item.href === "/exams" && pathname.startsWith("/exams"));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center justify-center w-10 h-10 rounded-xl transition-colors ${
                  isActive
                    ? "bg-zinc-100 text-zinc-900"
                    : "text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100"
                }`}
                aria-current={isActive ? "page" : undefined}
                aria-label={item.label}
              >
                <item.icon className="w-5 h-5" />
              </Link>
            );
          })}
        </nav>
        <div className="p-2">
          <button
            onClick={onToggleCollapse}
            className="flex items-center justify-center w-10 h-10 rounded-xl text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
            aria-label="Expand sidebar"
            aria-expanded="false"
          >
            <ChevronRightIcon className="w-5 h-5" />
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 bg-white border-r border-zinc-200 flex flex-col shadow-sm transition-all duration-200">
      <div className="flex flex-col items-start p-4 space-y-4">
        <Link href="/exams" className="flex items-center gap-3 w-full" aria-label="VedaAI Home">
          <VedaLogo className="w-8 h-8 flex-shrink-0" />
          <span className="text-xl font-bold text-zinc-900 tracking-tight">VedaAI</span>
          <span className="ml-1 w-6 h-6 rounded border border-zinc-200 flex items-center justify-center text-zinc-400">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18" /></svg>
          </span>
        </Link>
        <span className="inline-flex items-center gap-1.5 bg-zinc-900 text-white text-xs px-3 py-1.5 rounded-full border-2 border-[#F97316] font-medium">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
          AI Teacher&apos;s Toolkit
        </span>
      </div>
      <nav className="flex-1 px-3 space-y-1" aria-label="Main navigation">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href === "/exams" && pathname.startsWith("/exams"));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors ${
                isActive
                  ? "bg-zinc-100 text-zinc-900 font-medium"
                  : "text-zinc-500 hover:text-zinc-700 hover:bg-zinc-50"
              }`}
              aria-current={isActive ? "page" : undefined}
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="p-3 space-y-2">
        <Link
          href="/settings"
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-zinc-500 hover:text-zinc-700 hover:bg-zinc-50 transition-colors"
        >
          <SettingsIcon className="w-4 h-4 flex-shrink-0" />
          <span>Settings</span>
        </Link>
        <div className="mx-2 p-3 rounded-xl bg-zinc-50 border border-zinc-100 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-white border border-zinc-200 flex items-center justify-center overflow-hidden shrink-0">
            <span className="text-[8px] font-bold text-green-800 text-center leading-none">DELHI<br/>PUBLIC<br/>SCHOOL</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-zinc-900 truncate">Delhi Public School</p>
            <p className="text-xs text-zinc-500 truncate">Bokaro Steel City</p>
          </div>
        </div>
      </div>
    </aside>
  );
}