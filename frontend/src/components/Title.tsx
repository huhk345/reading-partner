'use client';

import { Sparkles, Heart, Star } from 'lucide-react';

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
        <h2 className="text-4xl flex items-center gap-3 mb-2">
          <Sparkles className="text-yellow-500 w-8 h-8 animate-pulse" />
          <span className="bg-gradient-to-r from-green-600 to-teal-500 bg-clip-text text-transparent">
            {title}
          </span>
        </h2>
        <p className="text-green-600 text-lg font-medium flex items-center gap-2">
          <Heart className="w-5 h-5 text-red-400 animate-pulse" />
          {subtitle}
        </p>
      </div>
      {badge && (
        <div className="flex items-center gap-2 bg-white/60 backdrop-blur-sm px-4 py-2 rounded-full shadow-sm">
          {badge.icon}
          <span className="text-sm font-bold text-amber-600">{badge.text}</span>
        </div>
      )}
    </div>
  );
}