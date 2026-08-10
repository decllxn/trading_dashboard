'use client';

import React, { useState, useEffect, useTransition, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { createBrowserClient } from '@supabase/ssr';
import {
  Flame,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  BookOpen,
  FileText,
  Clock,
  Sparkles,
  TrendingUp,
  Layers,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  UploadCloud,
  X,
  Loader2,
  ImageIcon,
  Eye,
  RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/button';
import { Field, Input, Label, Select } from '@/components/field';
import { cn } from '@/lib/utils';
import {
  createGoodHabit,
  incrementHabitStreak,
  deleteGoodHabit,
  startPunishment,
  saveEssayText,
  completePunishment,
  reactivatePunishment,
  logPunishmentTrade,
  deletePunishmentTrade,
} from './actions';

export interface SerializedGoodHabit {
  id: string;
  title: string;
  streakDays: number;
  createdAt: string;
}

export interface SerializedPunishment {
  id: string;
  reason: string;
  taskDescription: string;
  targetTradeCount: number;
  targetEssayWordCount: number;
  essayText: string;
  status: 'active' | 'completed';
  createdAt: string;
  completedAt: string | null;
}

export interface SerializedPunishmentTrade {
  id: string;
  punishmentId: string;
  pair: string;
  direction: 'long' | 'short';
  timeFormed: string;
  dailyPdArray: string;
  entryPdArray: string;
  timeTakenToTap: string;
  entryPrice: string | null;
  stopLoss: string | null;
  takeProfit: string | null;
  plannedRr: string | null;
  realizedRr: string | null;
  pnl: string | null;
  timeInDrawdown: string | null;
  killzone: string | null;
  displacementScore: number | null;
  liquiditySwept: string | null;
  notes: string | null;
  images?: string[];
  createdAt: string;
}

interface PunishmentsContainerProps {
  goodHabitsList: SerializedGoodHabit[];
  activePunishment: SerializedPunishment | null;
  allPunishmentTradesList: SerializedPunishmentTrade[];
  pastPunishmentsList: SerializedPunishment[];
}

export function PunishmentsContainer({
  goodHabitsList,
  activePunishment,
  allPunishmentTradesList,
  pastPunishmentsList,
}: PunishmentsContainerProps) {
  const [isPending, startTransition] = useTransition();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Active punishment trades
  const punishmentTradesList = allPunishmentTradesList.filter(
    (t) => activePunishment && t.punishmentId === activePunishment.id
  );

  // Habit State
  const [newHabitTitle, setNewHabitTitle] = useState('');
  const [showAddHabit, setShowAddHabit] = useState(false);
  const [habitError, setHabitError] = useState<string | null>(null);

  // Start Punishment State
  const [startReason, setStartReason] = useState('');
  const [startTask, setStartTask] = useState(
    'Log 30 trades from GBPCAD and EURCAD using strategy: Daily liquidity sweep/FVG/OB + 1H or 30m FVG/OB'
  );
  const [targetTradeCount, setTargetTradeCount] = useState(30);
  const [targetEssayWordCount, setTargetEssayWordCount] = useState(3000);
  const [startError, setStartError] = useState<string | null>(null);

  // Essay State
  const [essayContent, setEssayContent] = useState(activePunishment?.essayText || '');
  const [essaySaveStatus, setEssaySaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // Trade Logging Form State
  const [tradeForm, setTradeForm] = useState({
    pair: 'GBPCAD',
    direction: 'long' as 'long' | 'short',
    timeFormed: new Date().toISOString().slice(0, 16),
    dailyPdArray: 'Daily Liquidity Sweep',
    entryPdArray: '1H FVG',
    timeTakenToTap: '4 candles / 20 mins',
    entryPrice: '',
    stopLoss: '',
    takeProfit: '',
    plannedRr: '3.00',
    realizedRr: '3.00',
    pnl: '',
    timeInDrawdown: '15 mins',
    killzone: 'London Open',
    displacementScore: '4',
    liquiditySwept: 'BSL (Buy-side Liquidity)',
    notes: '',
  });
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [tradeError, setTradeError] = useState<string | null>(null);
  const [showLogTradeForm, setShowLogTradeForm] = useState(true);

  // Modals State
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [selectedTradeDetails, setSelectedTradeDetails] = useState<SerializedPunishmentTrade | null>(null);
  const [selectedPastPunishment, setSelectedPastPunishment] = useState<SerializedPunishment | null>(null);

  // Supabase Client for Image Uploads
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
  );

  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      setIsUploading(true);
      setUploadError('');

      try {
        const newUrls: string[] = [...uploadedImages];

        const { data: userData } = await supabase.auth.getUser();
        const userId = userData?.user?.id || 'anonymous';

        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const fileExt = file.name ? file.name.split('.').pop() : 'png';
          const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
          const filePath = `${userId}/punishments/${fileName}`;

          let publicUrl = '';
          try {
            const { data, error } = await supabase.storage
              .from('trade-screenshots')
              .upload(filePath, file);

            if (!error && data) {
              const res = supabase.storage.from('trade-screenshots').getPublicUrl(data.path);
              publicUrl = res.data.publicUrl;
            }
          } catch (storageErr) {
            console.warn('Storage bucket upload failed, using DataURL fallback:', storageErr);
          }

          if (!publicUrl) {
            const reader = new FileReader();
            publicUrl = await new Promise<string>((resolve) => {
              reader.onload = (e) => resolve(e.target?.result as string);
              reader.readAsDataURL(file);
            });
          }

          if (publicUrl) {
            newUrls.push(publicUrl);
          }
        }
        setUploadedImages(newUrls);
      } catch (error: any) {
        console.error('Upload error:', error);
        setUploadError(error.message || 'Failed to upload image.');
      } finally {
        setIsUploading(false);
      }
    },
    [supabase, uploadedImages]
  );

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      uploadFiles(files);
    }
  };

  const removeUploadedImage = (indexToRemove: number) => {
    setUploadedImages(uploadedImages.filter((_, idx) => idx !== indexToRemove));
  };

  // Clipboard Paste Event Listener for Images (Ctrl+V / Cmd+V)
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const filesToUpload: File[] = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            filesToUpload.push(file);
          }
        }
      }

      if (filesToUpload.length > 0) {
        e.preventDefault();
        uploadFiles(filesToUpload);
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('paste', handlePaste);
    };
  }, [uploadFiles]);

  // Calculate essay word count
  const calculateWordCount = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return 0;
    return trimmed.split(/\s+/).filter(Boolean).length;
  };

  const essayWordCount = calculateWordCount(essayContent);
  const essayTarget = activePunishment?.targetEssayWordCount || 3000;
  const essayPercent = Math.min(100, Math.round((essayWordCount / essayTarget) * 100));

  const tradesCount = punishmentTradesList.length;
  const tradesTarget = activePunishment?.targetTradeCount || 30;
  const tradesPercent = Math.min(100, Math.round((tradesCount / tradesTarget) * 100));

  // Habit Handlers
  const handleAddHabit = (e: React.FormEvent) => {
    e.preventDefault();
    setHabitError(null);
    if (!newHabitTitle.trim()) return;

    startTransition(async () => {
      const res = await createGoodHabit(newHabitTitle);
      if (res.success) {
        setNewHabitTitle('');
        setShowAddHabit(false);
      } else {
        setHabitError(res.error || 'Failed to add habit.');
      }
    });
  };

  const handleIncrementStreak = (id: string) => {
    startTransition(async () => {
      await incrementHabitStreak(id);
    });
  };

  const handleDeleteHabit = (id: string) => {
    startTransition(async () => {
      await deleteGoodHabit(id);
    });
  };

  // Start Punishment Handler
  const handleStartPunishment = (e: React.FormEvent) => {
    e.preventDefault();
    setStartError(null);

    const formData = new FormData();
    formData.append('reason', startReason);
    formData.append('taskDescription', startTask);
    formData.append('targetTradeCount', String(targetTradeCount));
    formData.append('targetEssayWordCount', String(targetEssayWordCount));

    startTransition(async () => {
      const res = await startPunishment(formData);
      if (res.success) {
        setStartReason('');
      } else {
        setStartError(res.error || 'Failed to initiate punishment.');
      }
    });
  };

  // Save Essay Handler
  const handleSaveEssay = () => {
    if (!activePunishment) return;
    setEssaySaveStatus('saving');

    startTransition(async () => {
      const res = await saveEssayText(activePunishment.id, essayContent);
      if (res.success) {
        setEssaySaveStatus('saved');
        setTimeout(() => setEssaySaveStatus('idle'), 3000);
      } else {
        setEssaySaveStatus('error');
      }
    });
  };

  // Complete Punishment Handler
  const handleCompletePunishment = () => {
    if (!activePunishment) return;

    startTransition(async () => {
      await completePunishment(activePunishment.id);
    });
  };

  // Reactivate Punishment Session Handler
  const handleReactivateSession = (punishmentId: string) => {
    startTransition(async () => {
      const res = await reactivatePunishment(punishmentId);
      if (res.success) {
        setSelectedPastPunishment(null);
      }
    });
  };

  // Log Punishment Trade Handler
  const handleLogTrade = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePunishment) return;
    setTradeError(null);

    const formData = new FormData();
    formData.append('punishmentId', activePunishment.id);
    formData.append('pair', tradeForm.pair);
    formData.append('direction', tradeForm.direction);
    formData.append('timeFormed', tradeForm.timeFormed);
    formData.append('dailyPdArray', tradeForm.dailyPdArray);
    formData.append('entryPdArray', tradeForm.entryPdArray);
    formData.append('timeTakenToTap', tradeForm.timeTakenToTap);
    formData.append('entryPrice', tradeForm.entryPrice);
    formData.append('stopLoss', tradeForm.stopLoss);
    formData.append('takeProfit', tradeForm.takeProfit);
    formData.append('plannedRr', tradeForm.plannedRr);
    formData.append('realizedRr', tradeForm.realizedRr);
    formData.append('pnl', tradeForm.pnl);
    formData.append('timeInDrawdown', tradeForm.timeInDrawdown);
    formData.append('killzone', tradeForm.killzone);
    formData.append('displacementScore', tradeForm.displacementScore);
    formData.append('liquiditySwept', tradeForm.liquiditySwept);
    formData.append('notes', tradeForm.notes);
    formData.append('images', JSON.stringify(uploadedImages));

    startTransition(async () => {
      const res = await logPunishmentTrade(formData);
      if (res.success) {
        setTradeForm((prev) => ({
          ...prev,
          notes: '',
          entryPrice: '',
          stopLoss: '',
          takeProfit: '',
          pnl: '',
        }));
        setUploadedImages([]);
      } else {
        setTradeError(res.error || 'Failed to log punishment trade.');
      }
    });
  };

  const handleDeleteTrade = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    startTransition(async () => {
      await deletePunishmentTrade(id);
      if (selectedTradeDetails?.id === id) {
        setSelectedTradeDetails(null);
      }
    });
  };

  return (
    <div className="space-y-8">
      {/* TOP HEADER & GOOD HABITS DEVELOPED SECTION */}
      <section className="border-hairline bg-surface rounded-card p-6 space-y-6">
        {/* Quote Banner */}
        <div className="border-hairline/80 bg-surface-raised/60 rounded-card p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="font-display text-primary text-base sm:text-lg italic tracking-tight">
              &ldquo;Being a good trader is about stacking up proper habits&rdquo;
            </p>
            <p className="text-secondary text-xs uppercase tracking-widest font-sans">
              &mdash; <span className="text-accent-signal font-medium">Neoh Yong</span>
            </p>
          </div>
          <Button
            variant="primary"
            onClick={() => setShowAddHabit(!showAddHabit)}
            className="shrink-0 flex items-center gap-1.5 self-start sm:self-auto"
          >
            <Plus size={16} />
            <span>Add Good Habit</span>
          </Button>
        </div>

        {/* Add Habit Inline Form */}
        {showAddHabit && (
          <form onSubmit={handleAddHabit} className="border-hairline bg-base/60 p-4 rounded-card space-y-3">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="habitTitle">Habit Name / Protocol</Label>
                <Input
                  id="habitTitle"
                  type="text"
                  placeholder="e.g. Daily pre-market HTF bias review & killzone countdown"
                  value={newHabitTitle}
                  onChange={(e) => setNewHabitTitle(e.target.value)}
                  required
                />
              </div>
              <div className="flex items-center gap-2">
                <Button type="submit" disabled={isPending}>
                  Save Habit
                </Button>
                <Button variant="ghost" onClick={() => setShowAddHabit(false)}>
                  Cancel
                </Button>
              </div>
            </div>
            {habitError && <p className="text-loss text-xs">{habitError}</p>}
          </form>
        )}

        {/* Good Habits Display Cards */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-primary text-sm uppercase tracking-wider flex items-center gap-2">
              <Sparkles size={16} className="text-accent-signal" />
              Good Habits Developed
            </h2>
            <span className="num text-tertiary text-xs">
              {goodHabitsList.length} Active Habits
            </span>
          </div>

          {goodHabitsList.length === 0 ? (
            <div className="border-hairline bg-base/40 p-6 text-center rounded-card space-y-1">
              <p className="text-secondary text-xs">No habits logged yet.</p>
              <p className="text-tertiary text-xs">
                Click <span className="text-accent-signal font-medium">&quot;Add Good Habit&quot;</span> above to start building your discipline stack.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {goodHabitsList.map((habit) => (
                <div
                  key={habit.id}
                  className="border-hairline bg-surface-raised/40 hover:bg-surface-raised/80 transition-colors p-3.5 rounded-card flex items-center justify-between gap-3 group"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="font-sans text-primary text-sm font-medium leading-snug truncate">
                      {habit.title}
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="num text-accent-signal text-xs font-semibold bg-accent-signal/10 border border-accent-signal/30 px-2 py-0.5 rounded-card">
                        {habit.streakDays} {habit.streakDays === 1 ? 'day streak' : 'days streak'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleIncrementStreak(habit.id)}
                      disabled={isPending}
                      title="Increment streak by +1 day"
                      className="h-8 w-8 rounded-card border border-hairline bg-surface hover:border-accent-signal text-secondary hover:text-accent-signal flex items-center justify-center transition-colors"
                    >
                      <Plus size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteHabit(habit.id)}
                      disabled={isPending}
                      title="Delete habit"
                      className="h-8 w-8 rounded-card border border-hairline bg-surface hover:border-loss text-tertiary hover:text-loss flex items-center justify-center transition-colors opacity-80 group-hover:opacity-100"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* NO ACTIVE PUNISHMENT — INITIATE PUNISHMENT SECTION */}
      {!activePunishment ? (
        <section className="border-hairline bg-surface rounded-card p-6 space-y-6">
          <div className="flex items-start justify-between gap-4 border-b border-hairline pb-4">
            <div>
              <h2 className="font-display text-primary text-lg flex items-center gap-2">
                <ShieldAlert size={20} className="text-accent-signal" />
                Initiate Discipline Punishment
              </h2>
              <p className="text-secondary text-xs mt-1">
                Acknowledge your mistake, set strict backtest requirements, and write a reflection essay to restore discipline.
              </p>
            </div>
          </div>

          <form onSubmit={handleStartPunishment} className="space-y-4">
            <Field id="startReason" label="Punishment Reason / Indiscipline Trigger">
              <textarea
                id="startReason"
                rows={3}
                className="w-full rounded-card border border-hairline bg-surface px-3 py-2 text-sm text-primary placeholder:text-tertiary focus:border-accent-signal focus:outline-none focus:ring-1 focus:ring-accent-signal font-sans"
                placeholder="e.g. Felt extremely indisciplined this week. Took 3 impulse trades outside of killzone hours, violated risk rules, and traded without HTF alignment."
                value={startReason}
                onChange={(e) => setStartReason(e.target.value)}
                required
              />
            </Field>

            <Field id="startTask" label="Backtest Task & Protocol To Perform">
              <textarea
                id="startTask"
                rows={2}
                className="w-full rounded-card border border-hairline bg-surface px-3 py-2 text-sm text-primary placeholder:text-tertiary focus:border-accent-signal focus:outline-none focus:ring-1 focus:ring-accent-signal font-sans"
                value={startTask}
                onChange={(e) => setStartTask(e.target.value)}
                required
              />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field id="targetTradeCount" label="Target Trade Backtest Count">
                <Input
                  id="targetTradeCount"
                  type="number"
                  min={1}
                  max={500}
                  value={targetTradeCount}
                  onChange={(e) => setTargetTradeCount(parseInt(e.target.value, 10) || 30)}
                  required
                />
              </Field>

              <Field id="targetEssayWordCount" label="Target Essay Word Count">
                <Input
                  id="targetEssayWordCount"
                  type="number"
                  min={100}
                  max={20000}
                  step={100}
                  value={targetEssayWordCount}
                  onChange={(e) => setTargetEssayWordCount(parseInt(e.target.value, 10) || 3000)}
                  required
                />
              </Field>
            </div>

            {startError && <p className="text-loss text-xs">{startError}</p>}

            <div className="pt-2">
              <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
                <Flame size={16} className="mr-2" />
                Start Punishment Session
              </Button>
            </div>
          </form>
        </section>
      ) : (
        /* ACTIVE PUNISHMENT DASHBOARD */
        <div className="space-y-8">
          {/* ACTIVE PUNISHMENT STATUS BAR */}
          <section className="border-hairline bg-surface rounded-card p-6 space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-hairline pb-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="num text-xs font-semibold uppercase tracking-wider text-accent-signal bg-accent-signal/10 border border-accent-signal/30 px-2 py-0.5 rounded-card">
                    Active Punishment
                  </span>
                  <span className="num text-tertiary text-xs">
                    Started {new Date(activePunishment.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <h2 className="font-display text-primary text-lg mt-1">
                  {activePunishment.reason}
                </h2>
                <p className="text-secondary text-xs">
                  <strong className="text-primary font-medium">Required Task:</strong> {activePunishment.taskDescription}
                </p>
              </div>

              <div className="shrink-0 flex items-center gap-2">
                <Button
                  variant="primary"
                  onClick={handleCompletePunishment}
                  disabled={isPending}
                  className="flex items-center gap-2"
                >
                  <CheckCircle2 size={16} />
                  <span>Complete Punishment</span>
                </Button>
              </div>
            </div>

            {/* Progress Meters */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Trade Log Progress */}
              <div className="border-hairline bg-base/50 p-4 rounded-card space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-secondary font-medium uppercase tracking-wider flex items-center gap-1.5">
                    <TrendingUp size={14} className="text-accent-signal" />
                    Trades Backtested & Logged
                  </span>
                  <span className="num text-primary font-bold">
                    {tradesCount} / {tradesTarget} trades ({tradesPercent}%)
                  </span>
                </div>
                <div className="h-2 w-full bg-surface-raised rounded-card overflow-hidden">
                  <div
                    className="h-full bg-accent-signal transition-all duration-300"
                    style={{ width: `${tradesPercent}%` }}
                  />
                </div>
              </div>

              {/* Essay Word Count Progress */}
              <div className="border-hairline bg-base/50 p-4 rounded-card space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-secondary font-medium uppercase tracking-wider flex items-center gap-1.5">
                    <FileText size={14} className="text-accent-signal" />
                    Reflection Essay Word Count
                  </span>
                  <span className="num text-primary font-bold">
                    {essayWordCount.toLocaleString()} / {essayTarget.toLocaleString()} words ({essayPercent}%)
                  </span>
                </div>
                <div className="h-2 w-full bg-surface-raised rounded-card overflow-hidden">
                  <div
                    className="h-full bg-accent-signal transition-all duration-300"
                    style={{ width: `${essayPercent}%` }}
                  />
                </div>
              </div>
            </div>
          </section>

          {/* SECTION 1: TEDIOUS STRATEGY TRADE BACKTEST LOGGING */}
          <section className="border-hairline bg-surface rounded-card p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-hairline pb-4">
              <div>
                <h3 className="font-display text-primary text-base flex items-center gap-2">
                  <Layers size={18} className="text-accent-signal" />
                  Tedious Trade Backtest Logger
                </h3>
                <p className="text-secondary text-xs mt-0.5">
                  Log every trade meticulously: Daily liquidity sweep/FVG/OB + 1H or 30m entry PD array, time taken to tap, drawdown, and execution stats.
                </p>
              </div>

              <Button
                variant="ghost"
                onClick={() => setShowLogTradeForm(!showLogTradeForm)}
                className="text-xs flex items-center gap-1"
              >
                {showLogTradeForm ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                <span>{showLogTradeForm ? 'Hide Form' : 'Show Form'}</span>
              </Button>
            </div>

            {/* Trade Log Form */}
            {showLogTradeForm && (
              <form onSubmit={handleLogTrade} className="border-hairline bg-base/50 p-4 sm:p-5 rounded-card space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Field id="pair" label="Pair / Instrument">
                    <Select
                      id="pair"
                      value={tradeForm.pair}
                      onChange={(e) => setTradeForm({ ...tradeForm, pair: e.target.value })}
                    >
                      <option value="GBPCAD">GBPCAD</option>
                      <option value="EURCAD">EURCAD</option>
                      <option value="GBPUSD">GBPUSD</option>
                      <option value="EURUSD">EURUSD</option>
                      <option value="AUDUSD">AUDUSD</option>
                      <option value="USDJPY">USDJPY</option>
                    </Select>
                  </Field>

                  <Field id="direction" label="Direction">
                    <Select
                      id="direction"
                      value={tradeForm.direction}
                      onChange={(e) => setTradeForm({ ...tradeForm, direction: e.target.value as 'long' | 'short' })}
                    >
                      <option value="long">Long</option>
                      <option value="short">Short</option>
                    </Select>
                  </Field>

                  <Field id="timeFormed" label="Time Setup Formed">
                    <Input
                      id="timeFormed"
                      type="datetime-local"
                      value={tradeForm.timeFormed}
                      onChange={(e) => setTradeForm({ ...tradeForm, timeFormed: e.target.value })}
                      required
                    />
                  </Field>

                  <Field id="killzone" label="ICT Session / Killzone">
                    <Select
                      id="killzone"
                      value={tradeForm.killzone}
                      onChange={(e) => setTradeForm({ ...tradeForm, killzone: e.target.value })}
                    >
                      <option value="London Open">London Open (2:00 - 5:00 AM NY)</option>
                      <option value="NY AM Session">NY AM Session (8:00 - 11:00 AM NY)</option>
                      <option value="NY PM Session">NY PM Session (1:00 - 3:00 PM NY)</option>
                      <option value="Asian Session">Asian Session (7:00 - 10:00 PM NY)</option>
                      <option value="London Close">London Close (10:00 AM - 12:00 PM NY)</option>
                    </Select>
                  </Field>

                  <Field id="dailyPdArray" label="Daily HTF PD Array">
                    <Select
                      id="dailyPdArray"
                      value={tradeForm.dailyPdArray}
                      onChange={(e) => setTradeForm({ ...tradeForm, dailyPdArray: e.target.value })}
                    >
                      <option value="Daily Liquidity Sweep">Daily Liquidity Sweep</option>
                      <option value="Daily Fair Value Gap (FVG)">Daily Fair Value Gap (FVG)</option>
                      <option value="Daily Order Block (OB)">Daily Order Block (OB)</option>
                      <option value="Daily Liquidity Void">Daily Liquidity Void</option>
                      <option value="Daily Breaker Block">Daily Breaker Block</option>
                    </Select>
                  </Field>

                  <Field id="entryPdArray" label="1H / 30m Entry PD Array">
                    <Select
                      id="entryPdArray"
                      value={tradeForm.entryPdArray}
                      onChange={(e) => setTradeForm({ ...tradeForm, entryPdArray: e.target.value })}
                    >
                      <option value="1H FVG">1H FVG</option>
                      <option value="1H Order Block">1H Order Block</option>
                      <option value="30m FVG">30m FVG</option>
                      <option value="30m Order Block">30m Order Block</option>
                      <option value="1H Breaker Block">1H Breaker Block</option>
                    </Select>
                  </Field>

                  <Field id="timeTakenToTap" label="Candles / Time to Tap Entry">
                    <Input
                      id="timeTakenToTap"
                      type="text"
                      placeholder="e.g. 4 candles / 20 mins"
                      value={tradeForm.timeTakenToTap}
                      onChange={(e) => setTradeForm({ ...tradeForm, timeTakenToTap: e.target.value })}
                      required
                    />
                  </Field>

                  <Field id="timeInDrawdown" label="Est. Time in Drawdown">
                    <Input
                      id="timeInDrawdown"
                      type="text"
                      placeholder="e.g. 15 mins / 3 candles"
                      value={tradeForm.timeInDrawdown}
                      onChange={(e) => setTradeForm({ ...tradeForm, timeInDrawdown: e.target.value })}
                    />
                  </Field>

                  <Field id="plannedRr" label="Planned Trade R:R">
                    <Input
                      id="plannedRr"
                      type="number"
                      step="0.01"
                      placeholder="e.g. 3.00"
                      value={tradeForm.plannedRr}
                      onChange={(e) => setTradeForm({ ...tradeForm, plannedRr: e.target.value })}
                    />
                  </Field>

                  <Field id="realizedRr" label="Realized Trade R:R">
                    <Input
                      id="realizedRr"
                      type="number"
                      step="0.01"
                      placeholder="e.g. 3.00 or -1.00"
                      value={tradeForm.realizedRr}
                      onChange={(e) => setTradeForm({ ...tradeForm, realizedRr: e.target.value })}
                    />
                  </Field>

                  <Field id="pnl" label="Net P&L ($ magnitude)">
                    <Input
                      id="pnl"
                      type="number"
                      step="0.01"
                      placeholder="e.g. 450.00 or -150.00"
                      value={tradeForm.pnl}
                      onChange={(e) => setTradeForm({ ...tradeForm, pnl: e.target.value })}
                    />
                  </Field>

                  <Field id="liquiditySwept" label="Pre-entry Liquidity Swept">
                    <Select
                      id="liquiditySwept"
                      value={tradeForm.liquiditySwept}
                      onChange={(e) => setTradeForm({ ...tradeForm, liquiditySwept: e.target.value })}
                    >
                      <option value="BSL (Buy-side Liquidity)">BSL (Buy-side Liquidity)</option>
                      <option value="SSL (Sell-side Liquidity)">SSL (Sell-side Liquidity)</option>
                      <option value="EQH (Equal Highs)">EQH (Equal Highs)</option>
                      <option value="EQL (Equal Lows)">EQL (Equal Lows)</option>
                      <option value="Previous Day High (PDH)">Previous Day High (PDH)</option>
                      <option value="Previous Day Low (PDL)">Previous Day Low (PDL)</option>
                    </Select>
                  </Field>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field id="displacementScore" label="Displacement Score (1-5)">
                    <Select
                      id="displacementScore"
                      value={tradeForm.displacementScore}
                      onChange={(e) => setTradeForm({ ...tradeForm, displacementScore: e.target.value })}
                    >
                      <option value="1">1 - Weak / sluggish displacement</option>
                      <option value="2">2 - Moderate displacement</option>
                      <option value="3">3 - Clean energetic expansion</option>
                      <option value="4">4 - Strong aggressive institutional displacement</option>
                      <option value="5">5 - Exceptional violent displacement with FVG gap</option>
                    </Select>
                  </Field>

                  <Field id="notes" label="Execution & Setup Notes">
                    <Input
                      id="notes"
                      type="text"
                      placeholder="e.g. Perfect HTF liquidity raid + M5 MSS into 1H FVG entry."
                      value={tradeForm.notes}
                      onChange={(e) => setTradeForm({ ...tradeForm, notes: e.target.value })}
                    />
                  </Field>
                </div>

                {/* CHART SCREENSHOTS & COPY-PASTE ZONE */}
                <div className="space-y-2 pt-2 border-t border-hairline/60">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="punishmentTradeImages">
                      Chart Screenshots & Backtest Proof (Copy & Paste Supported)
                    </Label>
                    <span className="text-[10px] text-accent-signal font-mono">
                      Tip: Press Ctrl+V / Cmd+V anywhere to paste screenshot
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-3 items-center">
                    {uploadedImages.map((url, idx) => (
                      <div
                        key={url}
                        className="relative h-20 w-28 rounded-card border border-hairline bg-base overflow-hidden group shrink-0"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={url}
                          alt={`Screenshot ${idx + 1}`}
                          className="h-full w-full object-cover cursor-pointer"
                          onClick={() => setLightboxImage(url)}
                        />
                        <button
                          type="button"
                          onClick={() => removeUploadedImage(idx)}
                          className="absolute right-1 top-1 bg-base/90 border border-hairline rounded-sm p-0.5 text-secondary hover:text-loss transition-colors cursor-pointer"
                          title="Remove image"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}

                    <label
                      className={cn(
                        'flex flex-col items-center justify-center h-20 w-36 rounded-card border border-dashed border-hairline hover:border-accent-signal/50 bg-base transition-colors cursor-pointer text-tertiary hover:text-secondary p-2 text-center',
                        isUploading && 'pointer-events-none opacity-60'
                      )}
                    >
                      {isUploading ? (
                        <Loader2 size={18} className="animate-spin text-accent-signal" />
                      ) : (
                        <>
                          <UploadCloud size={18} className="text-accent-signal mb-1" />
                          <span className="text-[10px] font-sans font-medium text-primary">Upload or Paste</span>
                          <span className="text-[9px] text-tertiary">Ctrl+V / Drop file</span>
                        </>
                      )}
                      <input
                        id="punishmentTradeImages"
                        type="file"
                        multiple
                        accept="image/*"
                        className="hidden"
                        onChange={handleImageUpload}
                        disabled={isUploading}
                      />
                    </label>
                  </div>
                  {uploadError && <p className="text-loss text-xs">{uploadError}</p>}
                </div>

                {tradeError && <p className="text-loss text-xs">{tradeError}</p>}

                <div className="flex justify-end pt-2">
                  <Button type="submit" disabled={isPending || isUploading}>
                    <Plus size={16} className="mr-1.5" />
                    Log Trade Entry
                  </Button>
                </div>
              </form>
            )}

            {/* Punishment Logged Trades Table */}
            <div className="space-y-2">
              <h4 className="text-secondary text-xs uppercase tracking-wider font-sans font-medium">
                Logged Punishment Backtests ({punishmentTradesList.length})
              </h4>

              {punishmentTradesList.length === 0 ? (
                <div className="border-hairline bg-base/40 p-6 text-center rounded-card">
                  <p className="text-tertiary text-xs">
                    No backtested trades logged yet for this punishment session. Fill out the form above or paste screenshot to log your trade.
                  </p>
                </div>
              ) : (
                <div className="border-hairline bg-base overflow-x-auto rounded-card no-scrollbar">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-hairline bg-surface-raised/60 text-secondary uppercase font-display text-[11px] tracking-wider">
                        <th className="py-2.5 px-3">#</th>
                        <th className="py-2.5 px-3">Pair</th>
                        <th className="py-2.5 px-3">Dir</th>
                        <th className="py-2.5 px-3">Daily PD Array</th>
                        <th className="py-2.5 px-3">Entry PD Array</th>
                        <th className="py-2.5 px-3">Time To Tap</th>
                        <th className="py-2.5 px-3 text-right">Planned RR</th>
                        <th className="py-2.5 px-3 text-right">Realized RR</th>
                        <th className="py-2.5 px-3 text-right">P&L</th>
                        <th className="py-2.5 px-3">Drawdown</th>
                        <th className="py-2.5 px-3">Charts</th>
                        <th className="py-2.5 px-3 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-hairline/60 text-primary">
                      {punishmentTradesList.map((tr, index) => {
                        const pnlVal = tr.pnl != null ? Number(tr.pnl) : null;
                        const imgs = tr.images || [];

                        return (
                          <tr
                            key={tr.id}
                            onClick={() => setSelectedTradeDetails(tr)}
                            className="hover:bg-surface-raised/60 transition-colors cursor-pointer group"
                          >
                            <td className="num py-2.5 px-3 text-tertiary">{index + 1}</td>
                            <td className="num py-2.5 px-3 font-semibold text-primary">{tr.pair}</td>
                            <td className="py-2.5 px-3 uppercase font-mono text-[11px]">
                              <span
                                className={cn(
                                  tr.direction === 'long' ? 'text-accent-signal' : 'text-loss'
                                )}
                              >
                                {tr.direction}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-secondary truncate max-w-[130px]">{tr.dailyPdArray}</td>
                            <td className="py-2.5 px-3 text-secondary truncate max-w-[130px]">{tr.entryPdArray}</td>
                            <td className="num py-2.5 px-3 text-tertiary">{tr.timeTakenToTap}</td>
                            <td className="num py-2.5 px-3 text-right font-medium">
                              {tr.plannedRr ? `${Number(tr.plannedRr).toFixed(2)}R` : '-'}
                            </td>
                            <td className="num py-2.5 px-3 text-right font-medium">
                              {tr.realizedRr ? `${Number(tr.realizedRr).toFixed(2)}R` : '-'}
                            </td>
                            <td className="num py-2.5 px-3 text-right font-medium">
                              {pnlVal != null ? (
                                <span className={pnlVal > 0 ? 'text-gain' : pnlVal < 0 ? 'text-loss' : 'text-secondary'}>
                                  {pnlVal >= 0 ? `+$${pnlVal.toFixed(2)}` : `-$${Math.abs(pnlVal).toFixed(2)}`}
                                </span>
                              ) : (
                                '-'
                              )}
                            </td>
                            <td className="num py-2.5 px-3 text-tertiary">{tr.timeInDrawdown || '-'}</td>
                            <td className="py-2.5 px-3" onClick={(e) => e.stopPropagation()}>
                              {imgs.length > 0 ? (
                                <div className="flex items-center gap-1.5">
                                  {imgs.map((imgUrl, i) => (
                                    <button
                                      key={i}
                                      type="button"
                                      onClick={() => setLightboxImage(imgUrl)}
                                      className="relative h-7 w-9 rounded overflow-hidden border border-hairline hover:border-accent-signal transition-colors group/img shrink-0"
                                      title="Click to view chart screenshot"
                                    >
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img src={imgUrl} alt={`Chart ${i + 1}`} className="h-full w-full object-cover" />
                                    </button>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-tertiary text-[11px]">-</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => setSelectedTradeDetails(tr)}
                                  className="text-tertiary hover:text-accent-signal transition-colors p-1"
                                  title="View full trade details"
                                >
                                  <Eye size={14} />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => handleDeleteTrade(tr.id, e)}
                                  disabled={isPending}
                                  className="text-tertiary hover:text-loss transition-colors p-1"
                                  title="Delete trade entry"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>

          {/* SECTION 2: 3000-WORD SELF-REFLECTION ESSAY */}
          <section className="border-hairline bg-surface rounded-card p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-hairline pb-4">
              <div>
                <h3 className="font-display text-primary text-base flex items-center gap-2">
                  <FileText size={18} className="text-accent-signal" />
                  Self-Reflection & Indiscipline Essay ({essayTarget.toLocaleString()} Words Target)
                </h3>
                <p className="text-secondary text-xs mt-0.5">
                  Reflect in depth on what you did wrong, why you broke your trading rules, psychological triggers, and your strict action plan.
                </p>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <span className="num text-xs font-semibold text-primary bg-surface-raised border border-hairline px-3 py-1.5 rounded-card">
                  {essayWordCount.toLocaleString()} / {essayTarget.toLocaleString()} words
                </span>
                <Button variant="primary" onClick={handleSaveEssay} disabled={isPending} className="text-xs">
                  {essaySaveStatus === 'saving' ? 'Saving...' : essaySaveStatus === 'saved' ? 'Saved!' : 'Save Essay'}
                </Button>
              </div>
            </div>

            {/* Essay Guidelines / Prompts */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div className="border-hairline bg-base/40 p-3 rounded-card space-y-1">
                <span className="font-display text-accent-signal font-medium">1. Root Cause Trigger</span>
                <p className="text-tertiary">Identify the exact emotional or psychological spark (e.g. FOMO, revenge trading, greed).</p>
              </div>
              <div className="border-hairline bg-base/40 p-3 rounded-card space-y-1">
                <span className="font-display text-accent-signal font-medium">2. Rules Violated</span>
                <p className="text-tertiary">Document risk limits, HTF alignment, or killzone rules that were broken.</p>
              </div>
              <div className="border-hairline bg-base/40 p-3 rounded-card space-y-1">
                <span className="font-display text-accent-signal font-medium">3. Equity Impact</span>
                <p className="text-tertiary">Calculate drawdowns and psychological damage caused by indiscipline.</p>
              </div>
              <div className="border-hairline bg-base/40 p-3 rounded-card space-y-1">
                <span className="font-display text-accent-signal font-medium">4. Non-Negotiable Protocol</span>
                <p className="text-tertiary">State concrete steps and checklist rules to eliminate repeat mistakes.</p>
              </div>
            </div>

            {/* Essay Textarea */}
            <div className="space-y-2">
              <textarea
                rows={16}
                className="w-full rounded-card border border-hairline bg-base p-4 text-sm text-primary placeholder:text-tertiary focus:border-accent-signal focus:outline-none focus:ring-1 focus:ring-accent-signal font-sans leading-relaxed resize-y no-scrollbar"
                placeholder="Write your reflection essay here... (Detail your trading mistakes, root causes, strategy rules broken, and your commitment to proper habits)"
                value={essayContent}
                onChange={(e) => setEssayContent(e.target.value)}
              />
              <div className="flex items-center justify-between text-xs text-tertiary">
                <span>Auto-calculates exact word count on edit.</span>
                <span className="num">
                  {essayWordCount >= essayTarget ? (
                    <span className="text-gain font-medium">Target Reached! ({essayWordCount} words)</span>
                  ) : (
                    <span>{essayTarget - essayWordCount} words remaining</span>
                  )}
                </span>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* PAST PUNISHMENTS ARCHIVE */}
      {pastPunishmentsList.length > 0 && (
        <section className="border-hairline bg-surface rounded-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-primary text-base flex items-center gap-2">
              <Clock size={18} className="text-tertiary" />
              Completed Punishments Archive ({pastPunishmentsList.length})
            </h3>
            <span className="text-tertiary text-xs">Click any row to view details or continue session</span>
          </div>

          <div className="border-hairline bg-base overflow-x-auto rounded-card no-scrollbar">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-hairline bg-surface-raised/60 text-secondary uppercase font-display text-[11px] tracking-wider">
                  <th className="py-2.5 px-3">Reason</th>
                  <th className="py-2.5 px-3">Task Completed</th>
                  <th className="py-2.5 px-3 text-right">Trades Logged</th>
                  <th className="py-2.5 px-3 text-right">Essay Length</th>
                  <th className="py-2.5 px-3 text-right">Date Completed</th>
                  <th className="py-2.5 px-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline/60 text-primary">
                {pastPunishmentsList.map((p) => {
                  const pTrades = allPunishmentTradesList.filter((t) => t.punishmentId === p.id);
                  return (
                    <tr
                      key={p.id}
                      onClick={() => setSelectedPastPunishment(p)}
                      className="hover:bg-surface-raised/60 transition-colors cursor-pointer group"
                    >
                      <td className="py-2.5 px-3 font-medium text-primary max-w-[220px] truncate">{p.reason}</td>
                      <td className="py-2.5 px-3 text-secondary max-w-[240px] truncate">{p.taskDescription}</td>
                      <td className="num py-2.5 px-3 text-right text-accent-signal font-semibold">
                        {pTrades.length} / {p.targetTradeCount}
                      </td>
                      <td className="num py-2.5 px-3 text-right font-mono">
                        {calculateWordCount(p.essayText).toLocaleString()} words
                      </td>
                      <td className="num py-2.5 px-3 text-right text-tertiary">
                        {p.completedAt ? new Date(p.completedAt).toLocaleDateString() : '-'}
                      </td>
                      <td className="py-2.5 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedPastPunishment(p)}
                            className="text-secondary hover:text-primary inline-flex items-center gap-1 font-medium text-[11px]"
                            title="View session details"
                          >
                            <Eye size={13} /> View
                          </button>
                          <button
                            type="button"
                            onClick={() => handleReactivateSession(p.id)}
                            disabled={isPending}
                            className="text-accent-signal hover:underline inline-flex items-center gap-1 font-medium text-[11px]"
                            title="Continue / Reopen this punishment session"
                          >
                            <RotateCcw size={12} /> Continue
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* MODAL 1: PAST PUNISHMENT SESSION FULL DETAILS MODAL */}
      {mounted && selectedPastPunishment && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-base/80 backdrop-blur-md p-4 sm:p-6 w-screen h-screen"
          onClick={() => setSelectedPastPunishment(null)}
        >
          <div
            className="w-full max-w-4xl border border-hairline bg-surface rounded-card max-h-[90vh] flex flex-col overflow-hidden relative shadow-none"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-hairline bg-surface px-6 py-4 shrink-0">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="num text-xs font-semibold uppercase tracking-wider text-gain bg-gain/10 border border-gain/30 px-2 py-0.5 rounded-card">
                    Completed Session
                  </span>
                  <span className="num text-tertiary text-xs">
                    Completed {selectedPastPunishment.completedAt ? new Date(selectedPastPunishment.completedAt).toLocaleDateString() : ''}
                  </span>
                </div>
                <h3 className="font-display text-primary text-base font-bold">
                  {selectedPastPunishment.reason}
                </h3>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  variant="primary"
                  onClick={() => handleReactivateSession(selectedPastPunishment.id)}
                  disabled={isPending}
                  className="text-xs flex items-center gap-1.5"
                >
                  <RotateCcw size={14} />
                  <span>Continue Session</span>
                </Button>
                <button
                  type="button"
                  onClick={() => setSelectedPastPunishment(null)}
                  className="text-secondary hover:text-primary p-1.5 rounded-card border border-hairline bg-base transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar">
              {/* Task Protocol */}
              <div className="border-hairline bg-base/50 p-4 rounded-card space-y-1">
                <span className="text-tertiary text-xs uppercase tracking-wider font-sans font-medium">Required Task Protocol</span>
                <p className="text-primary text-sm font-sans">{selectedPastPunishment.taskDescription}</p>
              </div>

              {/* Backtested Trades Table under this session */}
              {(() => {
                const pastTrades = allPunishmentTradesList.filter(
                  (t) => t.punishmentId === selectedPastPunishment.id
                );

                return (
                  <div className="space-y-3">
                    <h4 className="font-display text-primary text-sm uppercase tracking-wider flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <Layers size={16} className="text-accent-signal" /> Logged Backtested Trades ({pastTrades.length})
                      </span>
                      <span className="text-tertiary text-xs font-sans">Click trade row for deep parameters</span>
                    </h4>

                    {pastTrades.length === 0 ? (
                      <p className="text-tertiary text-xs italic">No trades logged under this punishment session.</p>
                    ) : (
                      <div className="border-hairline bg-base overflow-x-auto rounded-card no-scrollbar">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="border-b border-hairline bg-surface-raised/60 text-secondary uppercase font-display text-[11px] tracking-wider">
                              <th className="py-2.5 px-3">#</th>
                              <th className="py-2.5 px-3">Pair</th>
                              <th className="py-2.5 px-3">Dir</th>
                              <th className="py-2.5 px-3">Daily PD Array</th>
                              <th className="py-2.5 px-3">Entry PD Array</th>
                              <th className="py-2.5 px-3">Time To Tap</th>
                              <th className="py-2.5 px-3 text-right">Planned RR</th>
                              <th className="py-2.5 px-3 text-right">Realized RR</th>
                              <th className="py-2.5 px-3 text-right">P&L</th>
                              <th className="py-2.5 px-3">Drawdown</th>
                              <th className="py-2.5 px-3 text-center">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-hairline/60 text-primary">
                            {pastTrades.map((tr, idx) => {
                              const pnlVal = tr.pnl != null ? Number(tr.pnl) : null;
                              return (
                                <tr
                                  key={tr.id}
                                  onClick={() => setSelectedTradeDetails(tr)}
                                  className="hover:bg-surface-raised/60 transition-colors cursor-pointer"
                                >
                                  <td className="num py-2.5 px-3 text-tertiary">{idx + 1}</td>
                                  <td className="num py-2.5 px-3 font-semibold text-primary">{tr.pair}</td>
                                  <td className="py-2.5 px-3 uppercase font-mono text-[11px]">
                                    <span className={cn(tr.direction === 'long' ? 'text-accent-signal' : 'text-loss')}>
                                      {tr.direction}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 text-secondary truncate max-w-[130px]">{tr.dailyPdArray}</td>
                                  <td className="py-2.5 px-3 text-secondary truncate max-w-[130px]">{tr.entryPdArray}</td>
                                  <td className="num py-2.5 px-3 text-tertiary">{tr.timeTakenToTap}</td>
                                  <td className="num py-2.5 px-3 text-right font-medium">
                                    {tr.plannedRr ? `${Number(tr.plannedRr).toFixed(2)}R` : '-'}
                                  </td>
                                  <td className="num py-2.5 px-3 text-right font-medium">
                                    {tr.realizedRr ? `${Number(tr.realizedRr).toFixed(2)}R` : '-'}
                                  </td>
                                  <td className="num py-2.5 px-3 text-right font-medium">
                                    {pnlVal != null ? (
                                      <span className={pnlVal > 0 ? 'text-gain' : pnlVal < 0 ? 'text-loss' : 'text-secondary'}>
                                        {pnlVal >= 0 ? `+$${pnlVal.toFixed(2)}` : `-$${Math.abs(pnlVal).toFixed(2)}`}
                                      </span>
                                    ) : (
                                      '-'
                                    )}
                                  </td>
                                  <td className="num py-2.5 px-3 text-tertiary">{tr.timeInDrawdown || '-'}</td>
                                  <td className="py-2.5 px-3 text-center">
                                    <button
                                      type="button"
                                      onClick={() => setSelectedTradeDetails(tr)}
                                      className="text-accent-signal hover:underline p-1 text-[11px] font-medium"
                                    >
                                      Details
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Reflection Essay */}
              <div className="space-y-3 pt-4 border-t border-hairline">
                <h4 className="font-display text-primary text-sm uppercase tracking-wider flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <FileText size={16} className="text-accent-signal" /> Self-Reflection Essay Document
                  </span>
                  <span className="num text-tertiary text-xs font-sans">
                    {calculateWordCount(selectedPastPunishment.essayText).toLocaleString()} Words Total
                  </span>
                </h4>

                <div className="border-hairline bg-base p-5 rounded-card text-sm text-primary leading-relaxed whitespace-pre-wrap font-sans no-scrollbar max-h-96 overflow-y-auto">
                  {selectedPastPunishment.essayText || 'No reflection essay recorded.'}
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* MODAL 2: LOGGED TRADE DETAILED VIEW MODAL */}
      {mounted && selectedTradeDetails && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-base/80 backdrop-blur-md p-4 sm:p-6 w-screen h-screen"
          onClick={() => setSelectedTradeDetails(null)}
        >
          <div
            className="w-full max-w-3xl border border-hairline bg-surface rounded-card max-h-[90vh] flex flex-col overflow-hidden relative shadow-none"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-hairline bg-surface px-6 py-4 shrink-0">
              <div className="flex items-center gap-3">
                <span className="num font-display text-xl font-bold text-primary">
                  {selectedTradeDetails.pair}
                </span>
                <span
                  className={cn(
                    'num text-xs font-mono font-semibold uppercase tracking-wider px-2 py-0.5 rounded-card border',
                    selectedTradeDetails.direction === 'long'
                      ? 'bg-accent-signal/10 border-accent-signal/30 text-accent-signal'
                      : 'bg-loss/10 border-loss/30 text-loss'
                  )}
                >
                  {selectedTradeDetails.direction}
                </span>
                <span className="num text-tertiary text-xs">
                  Formed: {new Date(selectedTradeDetails.timeFormed).toLocaleString()}
                </span>
              </div>

              <button
                type="button"
                onClick={() => setSelectedTradeDetails(null)}
                className="text-secondary hover:text-primary p-1.5 rounded-card border border-hairline bg-base transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar">
              {/* Stat Highlights */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="border-hairline bg-base p-3 rounded-card space-y-1">
                  <span className="text-tertiary text-[10px] uppercase font-sans tracking-wider block">Planned R:R</span>
                  <span className="num text-primary text-base font-bold block">
                    {selectedTradeDetails.plannedRr ? `${Number(selectedTradeDetails.plannedRr).toFixed(2)}R` : '-'}
                  </span>
                </div>
                <div className="border-hairline bg-base p-3 rounded-card space-y-1">
                  <span className="text-tertiary text-[10px] uppercase font-sans tracking-wider block">Realized R:R</span>
                  <span className="num text-primary text-base font-bold block">
                    {selectedTradeDetails.realizedRr ? `${Number(selectedTradeDetails.realizedRr).toFixed(2)}R` : '-'}
                  </span>
                </div>
                <div className="border-hairline bg-base p-3 rounded-card space-y-1">
                  <span className="text-tertiary text-[10px] uppercase font-sans tracking-wider block">Net P&L</span>
                  <span className="num text-base font-bold block">
                    {selectedTradeDetails.pnl != null ? (
                      <span className={Number(selectedTradeDetails.pnl) > 0 ? 'text-gain' : Number(selectedTradeDetails.pnl) < 0 ? 'text-loss' : 'text-secondary'}>
                        {Number(selectedTradeDetails.pnl) >= 0 ? `+$${Number(selectedTradeDetails.pnl).toFixed(2)}` : `-$${Math.abs(Number(selectedTradeDetails.pnl)).toFixed(2)}`}
                      </span>
                    ) : (
                      '-'
                    )}
                  </span>
                </div>
                <div className="border-hairline bg-base p-3 rounded-card space-y-1">
                  <span className="text-tertiary text-[10px] uppercase font-sans tracking-wider block">Time to Tap</span>
                  <span className="num text-primary text-sm font-semibold block truncate">
                    {selectedTradeDetails.timeTakenToTap}
                  </span>
                </div>
              </div>

              {/* Strategy Parameters Grid */}
              <div className="space-y-3">
                <h4 className="font-display text-primary text-sm uppercase tracking-wider flex items-center gap-2">
                  <Layers size={16} className="text-accent-signal" /> Strategy Parameters & Setup Details
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-hairline bg-base/40 p-4 rounded-card text-xs">
                  <div>
                    <span className="text-tertiary block">Daily HTF PD Array:</span>
                    <span className="text-primary font-medium">{selectedTradeDetails.dailyPdArray}</span>
                  </div>
                  <div>
                    <span className="text-tertiary block">1H / 30m Entry PD Array:</span>
                    <span className="text-primary font-medium">{selectedTradeDetails.entryPdArray}</span>
                  </div>
                  <div>
                    <span className="text-tertiary block">Pre-entry Liquidity Swept:</span>
                    <span className="text-primary font-medium">{selectedTradeDetails.liquiditySwept || '-'}</span>
                  </div>
                  <div>
                    <span className="text-tertiary block">ICT Session / Killzone:</span>
                    <span className="text-primary font-medium">{selectedTradeDetails.killzone || '-'}</span>
                  </div>
                  <div>
                    <span className="text-tertiary block">Estimated Time in Drawdown:</span>
                    <span className="num text-primary font-medium">{selectedTradeDetails.timeInDrawdown || '-'}</span>
                  </div>
                  <div>
                    <span className="text-tertiary block">Displacement Score:</span>
                    <span className="num text-primary font-medium">
                      {selectedTradeDetails.displacementScore ? `${selectedTradeDetails.displacementScore} / 5` : '-'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Execution Notes */}
              {selectedTradeDetails.notes && (
                <div className="space-y-2">
                  <h4 className="font-display text-primary text-sm uppercase tracking-wider">Execution Notes</h4>
                  <div className="border-hairline bg-base/50 p-4 rounded-card text-xs text-primary leading-relaxed font-sans">
                    {selectedTradeDetails.notes}
                  </div>
                </div>
              )}

              {/* Chart Screenshots Gallery */}
              {selectedTradeDetails.images && selectedTradeDetails.images.length > 0 && (
                <div className="space-y-3">
                  <h4 className="font-display text-primary text-sm uppercase tracking-wider flex items-center gap-2">
                    <ImageIcon size={16} className="text-accent-signal" /> Chart Screenshots & Backtest Proof
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {selectedTradeDetails.images.map((url, idx) => (
                      <div
                        key={url}
                        onClick={() => setLightboxImage(url)}
                        className="relative h-32 rounded-card border border-hairline bg-base overflow-hidden group cursor-pointer"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={url}
                          alt={`Chart screenshot ${idx + 1}`}
                          className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-200"
                        />
                        <div className="absolute inset-0 bg-base/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                          <Eye size={18} className="text-primary" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* LIGHTBOX MODAL FOR CHART SCREENSHOTS */}
      {mounted && lightboxImage && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-base/90 backdrop-blur-md p-4 sm:p-6 w-screen h-screen"
          onClick={() => setLightboxImage(null)}
        >
          <div
            className="relative max-w-5xl max-h-[90vh] border border-hairline bg-surface rounded-card overflow-hidden p-2 space-y-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-3 py-1 border-b border-hairline">
              <span className="font-display text-xs text-primary uppercase tracking-wider flex items-center gap-1.5">
                <ImageIcon size={14} className="text-accent-signal" /> Chart Screenshot Preview
              </span>
              <button
                type="button"
                onClick={() => setLightboxImage(null)}
                className="text-secondary hover:text-primary p-1 rounded-card transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="max-h-[80vh] overflow-auto flex items-center justify-center bg-base rounded p-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={lightboxImage} alt="Full resolution chart screenshot" className="max-h-[78vh] w-auto object-contain rounded" />
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
