'use client';

import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { ChevronLeft, ChevronRight, Flame, BookOpen, Type, GraduationCap } from 'lucide-react';
import { ActivityDay, StreakInfo } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { Dialog } from './Dialog';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function Calendar() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [activityData, setActivityData] = useState<ActivityDay[]>([]);
  const [streak, setStreak] = useState<StreakInfo>({ current_streak: 0, longest_streak: 0 });
  const [selectedDay, setSelectedDay] = useState<ActivityDay | null>(null);

  const fetchActivity = useCallback(async () => {
    try {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth() + 1;
      const res = await axios.get(`http://localhost:8000/api/activity?year=${year}&month=${month}`);
      setActivityData(res.data);
    } catch (err) {
      console.error('Failed to fetch activity:', err);
    }
  }, [currentDate]);

  const fetchStreak = useCallback(async () => {
    try {
      const res = await axios.get(`http://localhost:8000/api/activity/streak`);
      setStreak(res.data);
    } catch (err) {
      console.error('Failed to fetch streak:', err);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchActivity();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchStreak();
  }, [fetchActivity, fetchStreak]);

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDay = firstDay.getDay();

    const days: (number | null)[] = [];
    for (let i = 0; i < startingDay; i++) {
      days.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i);
    }
    return days;
  };

  const formatDateString = (day: number) => {
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    return `${year}-${month}-${d}`;
  };

  const getActivityForDay = (day: number): ActivityDay | undefined => {
    const dateStr = formatDateString(day);
    return activityData.find(a => a.date === dateStr);
  };

  const isToday = (day: number): boolean => {
    const today = new Date();
    return (
      day === today.getDate() &&
      currentDate.getMonth() === today.getMonth() &&
      currentDate.getFullYear() === today.getFullYear()
    );
  };

  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const handleDayClick = (day: number) => {
    const activity = getActivityForDay(day);
    if (activity) {
      setSelectedDay(activity);
    }
  };

  const days = getDaysInMonth(currentDate);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={prevMonth}
          className="w-10 h-10 rounded-xl bg-green-100 hover:bg-green-200 flex items-center justify-center transition-colors text-green-700"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <h2 className="text-2xl font-bold text-green-800">
          {MONTHS[currentDate.getMonth()]} {currentDate.getFullYear()}
        </h2>

        <button
          onClick={nextMonth}
          className="w-10 h-10 rounded-xl bg-green-100 hover:bg-green-200 flex items-center justify-center transition-colors text-green-700"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      <div className="magic-card p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 bg-gradient-to-br from-orange-400 to-red-500 rounded-2xl flex items-center justify-center shadow-lg">
            <Flame className="w-7 h-7 text-white" />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium">Current Streak</p>
            <p className="text-3xl font-bold text-orange-600">{streak.current_streak} days</p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-sm text-gray-500 font-medium">Longest Streak</p>
            <p className="text-xl font-bold text-gray-600">{streak.longest_streak} days</p>
          </div>
        </div>
      </div>

      <div className="magic-card p-6">
        <div className="grid grid-cols-7 gap-2 mb-2">
          {DAYS.map(day => (
            <div key={day} className="text-center text-sm font-semibold text-gray-500 py-2">
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-2 overflow-hidden">
          {days.map((day, index) => {
            const activity = day ? getActivityForDay(day) : null;
            const hasActivity = activity && (activity.book_count > 0 || activity.word_count > 0 || activity.review_count > 0);
            const today = day && isToday(day);

            return (
              <motion.button
                key={index}
                onClick={() => day && handleDayClick(day)}
                disabled={!day}
                className={`
                  aspect-square rounded-xl flex flex-col items-center justify-center
                  transition-colors relative
                  ${day ? 'cursor-pointer' : 'cursor-default'}
                  ${today ? 'ring-2 ring-green-500 ring-offset-2' : ''}
                  ${hasActivity ? 'bg-gradient-to-br from-green-400 to-emerald-500 text-white shadow-lg' : 'bg-gray-50 hover:bg-gray-100 text-gray-700'}
                `}
                whileTap={day ? { scale: 0.95 } : {}}
              >
                {day && (
                  <>
                    <span className={`text-lg font-bold ${hasActivity ? 'text-white' : ''}`}>
                      {day}
                    </span>
                    {hasActivity && (
                      <div className="flex gap-0.5 mt-1">
                        {activity.book_count > 0 && (
                          <div className="w-1.5 h-1.5 rounded-full bg-white/80" />
                        )}
                        {activity.word_count > 0 && (
                          <div className="w-1.5 h-1.5 rounded-full bg-white/60" />
                        )}
                        {activity.review_count > 0 && (
                          <div className="w-1.5 h-1.5 rounded-full bg-white/40" />
                        )}
                      </div>
                    )}
                  </>
                )}
              </motion.button>
            );
          })}
        </div>

        <div className="flex items-center justify-center gap-6 mt-6 pt-4 border-t border-gray-100">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <div className="w-3 h-3 rounded-full bg-gradient-to-br from-green-400 to-emerald-500" />
            <span>Active days</span>
          </div>
          <div className="flex items-center gap-4 mt-2">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-white" />
              <span className="text-xs text-gray-400">Book</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-white/60" />
              <span className="text-xs text-gray-400">Words</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-white/40" />
              <span className="text-xs text-gray-400">Review</span>
            </div>
          </div>
        </div>
      </div>

      <Dialog isOpen={!!selectedDay} onClose={() => setSelectedDay(null)}>
        <div className="text-center mb-6 p-6 pb-0">
          <h3 className="text-xl font-bold text-gray-800">
            {MONTHS[currentDate.getMonth()]} {parseInt(selectedDay?.date.split('-')[2] || '1')}, {currentDate.getFullYear()}
          </h3>
          <p className="text-gray-500 text-sm">Reading Activity Summary</p>
        </div>

        <div className="px-6 pb-6">
          <div className="grid grid-cols-3 gap-4">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="bg-gradient-to-br from-blue-400 to-indigo-500 rounded-2xl p-4 text-white text-center"
            >
              <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-80" />
              <p className="text-3xl font-bold">{selectedDay?.book_count || 0}</p>
              <p className="text-sm opacity-80">Books Opened</p>
            </motion.div>

            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="bg-gradient-to-br from-purple-400 to-pink-500 rounded-2xl p-4 text-white text-center"
            >
              <Type className="w-8 h-8 mx-auto mb-2 opacity-80" />
              <p className="text-3xl font-bold">{selectedDay?.word_count || 0}</p>
              <p className="text-sm opacity-80">Words Looked Up</p>
            </motion.div>

            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="bg-gradient-to-br from-orange-400 to-red-500 rounded-2xl p-4 text-white text-center"
            >
              <GraduationCap className="w-8 h-8 mx-auto mb-2 opacity-80" />
              <p className="text-3xl font-bold">{selectedDay?.review_count || 0}</p>
              <p className="text-sm opacity-80">Reviews Done</p>
            </motion.div>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
