'use client';

import { Telescope, Compass, Crown, Zap } from 'lucide-react';

interface TitleProps {
  title: string;
  subtitle: string;
  icon?: React.ReactNode;
  badge?: {
    icon: React.ReactNode;
    text: string;
  };
}

export default function Title({ title, subtitle, icon, badge }: TitleProps) {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className="relative">
            <div className="absolute inset-0 bg-green-400 rounded-2xl blur-md opacity-50 animate-pulse"></div>
            <div className="relative w-14 h-14 bg-gradient-to-br from-emerald-400 via-green-500 to-teal-600 rounded-2xl flex items-center justify-center shadow-xl shadow-green-200/50 rotate-3 hover:rotate-0 hover:scale-110 transition-all duration-300">
              {icon || <Telescope className="w-8 h-8 text-white drop-shadow-lg" />}
            </div>
          </div>
          <h2 className="text-4xl font-bold flex items-center gap-2">
            <span className="bg-gradient-to-r from-green-600 via-emerald-600 to-teal-600 bg-clip-text text-transparent drop-shadow-sm">
              {title}
            </span>
            <Crown className="w-6 h-6 text-amber-500 animate-pulse" />
          </h2>
        </div>
        <p className="text-green-600 text-lg font-semibold flex items-center gap-2">
          <Compass className="w-5 h-5 text-emerald-500 animate-pulse" />
          <span className="bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
            {subtitle}
          </span>
        </p>
      </div>
      {badge && (
        <div className="relative group">
          <div className="absolute inset-0 bg-gradient-to-r from-green-400 to-emerald-400 rounded-2xl blur-md opacity-40 group-hover:opacity-60 transition-opacity"></div>
          <div className="relative flex items-center gap-3 bg-white/90 backdrop-blur-sm px-5 py-3 rounded-2xl shadow-xl border border-green-100 hover:scale-105 hover:shadow-2xl transition-all duration-300 cursor-pointer">
            <div className="w-10 h-10 bg-gradient-to-br from-green-400 to-emerald-500 rounded-xl flex items-center justify-center shadow-lg">
              {badge.icon}
            </div>
            <span className="text-sm font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
              {badge.text}
            </span>
            <Zap className="w-4 h-4 text-yellow-500 animate-pulse" />
          </div>
        </div>
      )}
    </div>
  );
}
