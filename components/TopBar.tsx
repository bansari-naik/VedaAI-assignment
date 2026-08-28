"use client";

import { useState, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import * as React from "react";

const LuminaAvatar = dynamic(
  () => import("lumina-ui").then((mod) => ({ default: mod.Avatar }) as unknown as { default: React.ComponentType<Record<string, unknown>> }),
  {
    ssr: false,
    loading: () => <div className="w-7 h-7 rounded-full bg-[#FFE9E0] border border-[#F97316]/20 flex items-center justify-center text-xs font-bold text-[#9A3412]">MR</div>,
  },
) as unknown as React.ComponentType<{
  firstName: string;
  lastName: string;
  imageUrl?: string;
  size: number;
  fontSizeChange: boolean;
}>;

function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6"/>
    </svg>
  );
}

function HelpIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  );
}

function BellIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  );
}

function SparkleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
    </svg>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  );
}

function UserIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  );
}

function LogOutIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
      <polyline points="16 17 21 12 16 7"/>
      <line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  );
}

interface TopBarProps {
  onBack?: () => void;
}

export default function TopBar({ onBack }: TopBarProps) {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const userBtnRef = useRef<HTMLButtonElement>(null);
  const notifBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node) &&
          userBtnRef.current && !userBtnRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node) &&
          notifBtnRef.current && !notifBtnRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className="sticky top-0 z-30 pt-3 px-3">
      <div className="h-12 px-3 md:px-4 flex items-center justify-between gap-4 bg-white rounded-2xl shadow-sm border border-zinc-100">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={onBack ? onBack : () => window.history.back()}
            className="w-8 h-8 rounded-full bg-zinc-50 hover:bg-zinc-100 flex items-center justify-center text-zinc-600 transition-colors"
            aria-label="Go back"
          >
            <ChevronLeftIcon className="w-4 h-4" />
          </button>
          <span className="w-8 h-8 rounded-lg bg-zinc-50 border border-zinc-100 flex items-center justify-center text-zinc-400">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          </span>
          <nav className="flex items-center gap-2" aria-label="Breadcrumb">
            <span className="text-sm font-medium text-zinc-500">Exams</span>
          </nav>
        </div>

        <div className="flex items-center gap-1.5 ml-auto">
          <button
            className="w-8 h-8 rounded-full bg-zinc-50 hover:bg-zinc-100 flex items-center justify-center text-zinc-600 transition-colors border border-zinc-100"
            aria-label="Help"
          >
            <HelpIcon className="w-4 h-4" />
          </button>
          <div className="relative">
            <button
              ref={notifBtnRef}
              onClick={() => { setShowNotifications(!showNotifications); setShowUserMenu(false); }}
              className="relative w-8 h-8 rounded-full bg-zinc-50 hover:bg-zinc-100 flex items-center justify-center text-zinc-600 transition-colors border border-zinc-100"
              aria-label="Notifications"
              aria-expanded={showNotifications}
              aria-haspopup="true"
            >
              <BellIcon className="w-4 h-4" />
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-[#FF3B30] rounded-full border-2 border-white" aria-hidden="true" />
            </button>
            {showNotifications && (
              <div
                ref={notificationsRef}
                className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-lg border border-zinc-200 py-2 z-50"
                role="menu"
              >
                <div className="px-4 py-2 border-b border-zinc-100">
                  <h3 className="font-semibold text-zinc-900">Notifications</h3>
                </div>
                <div className="py-2">
                  <p className="px-4 text-sm text-zinc-500">No new notifications</p>
                </div>
              </div>
            )}
          </div>

          <button
            className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-zinc-700 transition-colors border border-zinc-100 shadow-sm"
            aria-label="AI Assistant"
          >
            <SparkleIcon className="w-4 h-4" />
          </button>

          <div className="relative ml-1">
            <button
              ref={userBtnRef}
              onClick={() => { setShowUserMenu(!showUserMenu); setShowNotifications(false); }}
              className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-full hover:bg-zinc-50 transition-colors"
              aria-label="User menu"
              aria-expanded={showUserMenu}
              aria-haspopup="true"
            >
              <LuminaAvatar firstName="Madhur" lastName="Rastogi" imageUrl="/mascot.svg" size={28} fontSizeChange={false} />
              <span className="hidden sm:block text-sm font-medium text-zinc-900">Madhur Rastogi</span>
              <ChevronDownIcon className="w-3.5 h-3.5 text-zinc-400 hidden sm:block" />
            </button>
            {showUserMenu && (
              <div
                ref={userMenuRef}
                className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-lg border border-zinc-200 py-2 z-50"
                role="menu"
              >
                <div className="px-4 py-3 border-b border-zinc-100">
                  <p className="text-sm font-medium text-zinc-900">Madhur Rastogi</p>
                  <p className="text-xs text-zinc-500">madhur@delhipublic.edu</p>
                </div>
                <button className="w-full flex items-center gap-2 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50" role="menuitem">
                  <UserIcon className="w-4 h-4" />
                  Profile
                </button>
                <button className="w-full flex items-center gap-2 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50" role="menuitem">
                  <LogOutIcon className="w-4 h-4" />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}