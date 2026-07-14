'use client';

import { useState, useMemo } from 'react';
import { 
  format, startOfMonth, endOfMonth, eachDayOfInterval, 
  isSameMonth, isSameDay, isToday, parseISO,
  getDay, startOfWeek, endOfWeek
} from 'date-fns';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { JournalEditor } from '@/components/journal/journal-editor';
import { saveJournalEntry, linkTradeToJournal, unlinkTradeFromJournal, searchJournalEntries } from './actions';
import { Segmented } from '@/components/segmented';
import { cn } from '@/lib/utils';
import { formatPrice } from '@/lib/trades';

const MISTAKES_LIST = ['Moved stop', 'Oversized', 'Chased entry', 'Revenge traded'];

interface JournalEntryData {
  id: string;
  date: string;
  content: any;
  text_content?: string | null;
  mood: string | null;
  mistakes: string[];
}

interface TradeData {
  id: string;
  instrument: string;
  direction: string;
  pnl: number | string | null;
  r_multiple: number | string | null;
  entry_time: string | null;
}

interface LinkData {
  journal_entry_id: string;
  trade_id: string;
}

interface JournalClientProps {
  entries: JournalEntryData[];
  trades: TradeData[];
  links: LinkData[];
  emotions: string[];
}

export function JournalClient({ entries: initialEntries, trades, links: initialLinks, emotions }: JournalClientProps) {
  const [viewMode, setViewMode] = useState<'month' | 'week'>('month');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  
  const [entries, setEntries] = useState(initialEntries);
  const [links, setLinks] = useState(initialLinks);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[] | null>(null);

  const selectedDateStr = format(selectedDate, 'yyyy-MM-dd');
  const currentEntry = entries.find(e => e.date === selectedDateStr);
  const currentEntryId = currentEntry?.id;
  
  const tradesOnDate = useMemo(() => {
    return trades.filter(t => t.entry_time && t.entry_time.startsWith(selectedDateStr));
  }, [trades, selectedDateStr]);

  const linkedTradeIds = useMemo(() => {
    if (!currentEntryId) return new Set<string>();
    return new Set(links.filter(l => l.journal_entry_id === currentEntryId).map(l => l.trade_id));
  }, [links, currentEntryId]);

  const calendarDays = useMemo(() => {
    if (viewMode === 'month') {
      const start = startOfMonth(currentDate);
      const end = endOfMonth(currentDate);
      const days = eachDayOfInterval({ start, end });
      // Determine how many empty slots we need before the first day of the month (0 = Sunday)
      const leadingEmptyDays = getDay(start);
      return { days, leadingEmptyDays };
    } else {
      const start = startOfWeek(currentDate);
      const end = endOfWeek(currentDate);
      const days = eachDayOfInterval({ start, end });
      return { days, leadingEmptyDays: 0 };
    }
  }, [currentDate, viewMode]);

  // Helper to ensure TipTap content is a 100% plain object for Server Actions
  const sanitizeContent = (val: any) => {
    if (!val) return null;
    try {
      return JSON.parse(JSON.stringify(val));
    } catch {
      return null;
    }
  };

  const handleSave = async (content: any, textContent: string) => {
    const currentMood = currentEntry?.mood || null;
    const currentMistakes = currentEntry?.mistakes || [];
    const plainContent = sanitizeContent(content);
    const res = await saveJournalEntry(
      selectedDateStr,
      plainContent,
      textContent,
      currentMood,
      currentMistakes
    );
    if (res.error) return;

    const entryId = res.id;
    if (entryId) {
      if (!currentEntryId) {
        setEntries(prev => [...prev, { id: entryId, date: selectedDateStr, content: plainContent, mood: currentMood, mistakes: currentMistakes }]);
      } else {
        setEntries(prev => prev.map(e => e.id === currentEntryId ? { ...e, content: plainContent } : e));
      }

      // Sync matched day's trades to local links state
      const newLinks = tradesOnDate.map(t => ({
        journal_entry_id: entryId,
        trade_id: t.id
      }));
      setLinks(prev => [
        ...prev.filter(l => l.journal_entry_id !== entryId),
        ...newLinks
      ]);
    }
  };

  const handleMoodChange = async (mood: string) => {
    const newMood = mood === 'none' ? null : mood;
    if (!currentEntryId) {
      const res = await saveJournalEntry(selectedDateStr, null, '', newMood, []);
      if (res.id) {
        setEntries(prev => [...prev, { id: res.id!, date: selectedDateStr, content: null, mood: newMood, mistakes: [] }]);
        const newLinks = tradesOnDate.map(t => ({
          journal_entry_id: res.id!,
          trade_id: t.id
        }));
        setLinks(prev => [...prev, ...newLinks]);
      }
    } else {
      setEntries(prev => prev.map(e => e.id === currentEntryId ? { ...e, mood: newMood } : e));
      const res = await saveJournalEntry(selectedDateStr, sanitizeContent(currentEntry?.content), '', newMood, currentEntry?.mistakes || []);
      if (res.id) {
        const newLinks = tradesOnDate.map(t => ({
          journal_entry_id: res.id!,
          trade_id: t.id
        }));
        setLinks(prev => [
          ...prev.filter(l => l.journal_entry_id !== res.id),
          ...newLinks
        ]);
      }
    }
  };

  const handleMistakeToggle = async (mistake: string) => {
    const currentMistakes = currentEntry?.mistakes || [];
    const newMistakes = currentMistakes.includes(mistake)
      ? currentMistakes.filter((m: string) => m !== mistake)
      : [...currentMistakes, mistake];
    
    if (!currentEntryId) {
      const res = await saveJournalEntry(selectedDateStr, null, '', null, newMistakes);
      if (res.id) {
        setEntries(prev => [...prev, { id: res.id!, date: selectedDateStr, content: null, mood: null, mistakes: newMistakes }]);
        const newLinks = tradesOnDate.map(t => ({
          journal_entry_id: res.id!,
          trade_id: t.id
        }));
        setLinks(prev => [...prev, ...newLinks]);
      }
    } else {
      setEntries(prev => prev.map(e => e.id === currentEntryId ? { ...e, mistakes: newMistakes } : e));
      const res = await saveJournalEntry(selectedDateStr, sanitizeContent(currentEntry?.content), '', currentEntry?.mood || null, newMistakes);
      if (res.id) {
        const newLinks = tradesOnDate.map(t => ({
          journal_entry_id: res.id!,
          trade_id: t.id
        }));
        setLinks(prev => [
          ...prev.filter(l => l.journal_entry_id !== res.id),
          ...newLinks
        ]);
      }
    }
  };

  const toggleTradeLink = async (tradeId: string) => {
    if (!currentEntryId) return;
    
    if (linkedTradeIds.has(tradeId)) {
      setLinks(prev => prev.filter(l => !(l.journal_entry_id === currentEntryId && l.trade_id === tradeId)));
      await unlinkTradeFromJournal(currentEntryId, tradeId);
    } else {
      setLinks(prev => [...prev, { journal_entry_id: currentEntryId, trade_id: tradeId }]);
      await linkTradeToJournal(currentEntryId, tradeId);
    }
  };

  const handleSearch = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (!searchQuery.trim()) {
        setSearchResults(null);
        return;
      }
      const results = await searchJournalEntries(searchQuery);
      setSearchResults(results);
    }
  };

  const handlePrev = () => {
    if (viewMode === 'month') {
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1));
    } else {
      const newDate = new Date(currentDate);
      newDate.setDate(newDate.getDate() - 7);
      setCurrentDate(newDate);
    }
  };

  const handleNext = () => {
    if (viewMode === 'month') {
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1));
    } else {
      const newDate = new Date(currentDate);
      newDate.setDate(newDate.getDate() + 7);
      setCurrentDate(newDate);
    }
  };

  return (
    <div className="flex h-full flex-col gap-6 lg:flex-row">
      {/* Left Column: Calendar & Search */}
      <div className="w-full shrink-0 flex flex-col gap-6 lg:w-80 lg:no-scrollbar lg:overflow-y-auto">
        <h1 className="font-display text-primary text-xl">Journal</h1>
        
        {/* Search */}
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-tertiary" />
          <input 
            type="text" 
            placeholder="Search entries... (Enter)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleSearch}
            className="w-full bg-surface border border-hairline rounded-card py-2 pl-9 pr-4 text-sm text-primary focus:outline-none focus:border-accent-signal transition-colors"
          />
        </div>

        {/* Calendar */}
        {!searchResults && (
          <div className="bg-surface border border-hairline rounded-card p-4 flex flex-col gap-4">
            <Segmented 
               name="viewMode" 
               options={[{label: 'Month', value: 'month'}, {label: 'Week', value: 'week'}]} 
               value={viewMode} 
               onChange={(val) => setViewMode(val as 'month' | 'week')}
               aria-label="Calendar view mode"
            />
            
            <div className="flex items-center justify-between">
              <button 
                onClick={handlePrev}
                className="p-1 text-secondary hover:text-primary transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <h2 className="text-primary text-sm font-medium">
                {viewMode === 'month' ? format(currentDate, 'MMMM yyyy') : `${format(startOfWeek(currentDate), 'MMM d')} - ${format(endOfWeek(currentDate), 'MMM d, yyyy')}`}
              </h2>
              <button 
                onClick={handleNext}
                className="p-1 text-secondary hover:text-primary transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>
            
            <div className="grid grid-cols-7 gap-1 text-center text-xs text-tertiary">
              {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => <div key={d}>{d}</div>)}
            </div>
            
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: calendarDays.leadingEmptyDays }).map((_, i) => (
                <div key={`empty-${i}`} className="aspect-square" />
              ))}
              {calendarDays.days.map((day) => {
                const dayStr = format(day, 'yyyy-MM-dd');
                const entry = entries.find(e => e.date === dayStr);
                const hasSavedContent = !!(
                  entry &&
                  (
                    (entry.text_content && entry.text_content.trim().length > 0) ||
                    entry.mood ||
                    (entry.mistakes && entry.mistakes.length > 0)
                  )
                );
                const isSel = isSameDay(day, selectedDate);
                
                return (
                  <button
                    key={dayStr}
                    onClick={() => setSelectedDate(day)}
                    className={cn(
                      "relative aspect-square flex items-center justify-center text-sm rounded transition-colors",
                      isSel ? "bg-accent-signal/20 text-accent-signal font-bold" : "text-secondary hover:bg-surface-raised hover:text-primary",
                      viewMode === 'month' && !isSameMonth(day, currentDate) && "opacity-30"
                    )}
                  >
                    {format(day, 'd')}
                    {hasSavedContent && (
                      <span className="absolute bottom-1 w-1 h-1 bg-accent-signal rounded-full" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Search Results */}
        {searchResults && (
          <div className="no-scrollbar flex-1 overflow-auto bg-surface border border-hairline rounded-card p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-display text-primary uppercase tracking-wide">
                Search Results <span className="text-tertiary font-mono num">({searchResults.length})</span>
              </h3>
              <button onClick={() => {setSearchResults(null); setSearchQuery('');}} className="text-xs text-tertiary hover:text-primary">Clear</button>
            </div>
            {searchResults.length === 0 ? (
              <p className="text-sm text-tertiary">No entries found.</p>
            ) : (
              searchResults.map(res => (
                <button 
                  key={res.id} 
                  onClick={() => {
                    setSelectedDate(parseISO(res.date));
                    setSearchResults(null);
                    setSearchQuery('');
                  }}
                  className="text-left p-3 rounded-card border border-hairline bg-base hover:border-accent-signal transition-colors group"
                >
                  <div className="text-xs text-accent-signal font-mono mb-1">{format(parseISO(res.date), 'MMM d, yyyy')}</div>
                  <p className="text-sm text-secondary line-clamp-2 group-hover:text-primary transition-colors">
                    {res.text_content || 'No text content'}
                  </p>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Right Column: Editor & Meta */}
      <div className="flex-1 flex flex-col gap-6 min-w-0">
        <header className="flex flex-col gap-3 border-b border-hairline pb-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-xl sm:text-2xl font-display text-primary">
            {format(selectedDate, 'EEEE, MMMM d, yyyy')}
            {isToday(selectedDate) && <span className="ml-3 text-xs uppercase tracking-wide text-accent-signal bg-accent-signal/10 px-2 py-1 rounded">Today</span>}
          </h2>
          
          <div className="flex items-center gap-4">
             <div className="flex items-center gap-3">
               <span className="text-xs text-tertiary uppercase tracking-wide font-sans">Mood</span>
               <div className="flex flex-wrap items-center gap-1.5">
                 {emotions.map(moodOption => {
                   const isSelected = currentEntry?.mood === moodOption;
                   return (
                     <button
                       key={moodOption}
                       type="button"
                       onClick={() => handleMoodChange(isSelected ? 'none' : moodOption)}
                       className={cn(
                         "px-2.5 py-1 text-xs border rounded transition-colors duration-150 capitalize",
                         isSelected 
                           ? "border-accent-signal text-accent-signal bg-accent-signal/10 font-medium" 
                           : "border-hairline text-secondary hover:text-primary hover:border-primary bg-surface"
                       )}
                     >
                       {moodOption}
                     </button>
                   );
                 })}
               </div>
             </div>
          </div>
        </header>
        
        <div className="flex flex-col flex-1 overflow-hidden lg:flex-row gap-6">
          {/* Editor */}
          <div className="no-scrollbar flex-1 overflow-auto pr-2 pb-6 min-h-[300px]">
            <JournalEditor 
              key={selectedDateStr}
              initialContent={currentEntry?.content || null} 
              onSave={handleSave} 
            />
          </div>
          
          {/* Meta panel (Mistakes & Trades) */}
          <div className="no-scrollbar w-full shrink-0 flex flex-col gap-6 overflow-y-auto pb-6 lg:w-64">
            <section className="bg-surface border border-hairline p-4 rounded-card">
              <h3 className="text-xs font-display text-primary uppercase tracking-wide mb-3">Mistakes</h3>
              <div className="flex flex-col gap-2">
                {MISTAKES_LIST.map(mistake => (
                  <label key={mistake} className="flex items-center gap-2 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={currentEntry?.mistakes?.includes(mistake) || false}
                      onChange={() => handleMistakeToggle(mistake)}
                      className="hidden"
                    />
                    <div className={cn(
                      "w-4 h-4 rounded border flex items-center justify-center transition-colors",
                      currentEntry?.mistakes?.includes(mistake) ? "bg-accent-signal border-accent-signal text-black" : "border-hairline bg-base group-hover:border-primary"
                    )}>
                      {currentEntry?.mistakes?.includes(mistake) && (
                        <svg viewBox="0 0 14 14" fill="none" className="w-3 h-3 text-[#0B0D10]"><path d="M3 7.5L5.5 10L11 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      )}
                    </div>
                    <span className="text-sm text-secondary group-hover:text-primary transition-colors">{mistake}</span>
                  </label>
                ))}
              </div>
            </section>

            <section className="bg-surface border border-hairline p-4 rounded-card flex-1 flex flex-col min-h-[200px]">
              <h3 className="text-xs font-display text-primary uppercase tracking-wide mb-3">Linked Trades</h3>
              {tradesOnDate.length === 0 ? (
                <p className="text-xs text-tertiary">No trades logged on this date.</p>
              ) : (
                <div className="flex flex-col gap-2 overflow-y-auto flex-1">
                  {tradesOnDate.map(trade => {
                    const pnlNum = Number(trade.pnl);
                    const isGain = pnlNum >= 0;
                    const isLinked = linkedTradeIds.has(trade.id);
                    return (
                      <div 
                        key={trade.id} 
                        className={cn(
                          "flex items-center justify-between p-2 rounded border transition-colors cursor-pointer shrink-0",
                          isLinked ? "bg-accent-signal/10 border-accent-signal" : "bg-base border-hairline hover:border-primary",
                          !currentEntryId && "opacity-60 hover:opacity-100"
                        )}
                        onClick={async () => {
                          if (!currentEntryId) {
                            const res = await saveJournalEntry(selectedDateStr, null, '', null, []);
                            if (res.id) {
                              setEntries(prev => [...prev, { id: res.id!, date: selectedDateStr, content: null, mood: null, mistakes: [] }]);
                              const newLinks = tradesOnDate.map(t => ({
                                journal_entry_id: res.id!,
                                trade_id: t.id
                              }));
                              setLinks(prev => [...prev, ...newLinks]);
                            }
                          } else {
                            toggleTradeLink(trade.id);
                          }
                        }}
                      >
                        <div>
                          <p className="text-sm font-medium text-primary">{trade.instrument}</p>
                          <p className="text-xs text-secondary capitalize">{trade.direction}</p>
                        </div>
                        <div className={cn("text-right text-sm num", isGain ? "text-gain" : "text-loss")}>
                           {isGain ? '+' : '−'}{formatPrice(Math.abs(pnlNum))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
