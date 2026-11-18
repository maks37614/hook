import React, { useState, useMemo } from 'react';
import {
  X,
  Search,
  Trash2,
  ExternalLink,
  Clock,
  TrendingUp,
  TrendingDown,
  Shield,
  Target,
  LogIn,
  SlidersHorizontal,
  CheckCircle2,
  Sparkles,
  MapPin,
  Calendar,
  Layers,
  Download,
  CircleHelp,
  AlertTriangle,
  Lock,
} from 'lucide-react';
import { FormationArchiveIcon } from './FormationArchiveIcon';
import { useArchive } from '../context/ArchiveContext';
import { useAuth } from '../context/AuthContext';
import { ArchivedFormation, ExchangeId, PatternBias } from '../types';
import { formatCryptoPrice } from '../utils/formatters';
import { formatArchivePercent } from '../utils/archiveDisplayPercent';
import { apiFetch } from '../utils/apiFetch';
import { useLanguage } from '../context/LanguageContext';

interface ArchiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectFormation: (archived: ArchivedFormation) => void;
  onOpenAuth?: () => void;
}

export const ArchiveModal: React.FC<ArchiveModalProps> = ({
  isOpen,
  onClose,
  onSelectFormation,
  onOpenAuth,
}) => {
  const { archivedFormations, removeFromArchive, clearUserArchive, loading } = useArchive();
  const { user, profile } = useAuth();
  const { language, t } = useLanguage();
  const manualArchiveCopy = ({
    uk: 'Збережена монета · без автоматичного сигналу',
    en: 'Saved coin · no automatic signal',
    pl: 'Zapisana moneta · bez automatycznego sygnału',
    ru: 'Сохранённая монета · без автоматического сигнала',
  } as const)[language];

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [exchangeFilter, setExchangeFilter] = useState<'all' | ExchangeId>('all');
  const [biasFilter, setBiasFilter] = useState<'all' | PatternBias>('all');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState<boolean>(false);
  const [isClearing, setIsClearing] = useState<boolean>(false);
  const [scoreInfoId, setScoreInfoId] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [archiveActionError, setArchiveActionError] = useState('');
  const archiveActionCopy = ({
    uk: { load:'Не вдалося відкрити повну збережену формацію. Спробуйте ще раз.', export:'Не вдалося експортувати архів. Спробуйте ще раз.' },
    en: { load:'Could not open the complete saved formation. Please try again.', export:'Could not export the archive. Please try again.' },
    pl: { load:'Nie można otworzyć pełnej zapisanej formacji. Spróbuj ponownie.', export:'Nie udało się wyeksportować archiwum. Spróbuj ponownie.' },
    ru: { load:'Не удалось открыть полную сохранённую формацию. Повторите попытку.', export:'Не удалось экспортировать архив. Повторите попытку.' },
  } as const)[language];


  const filteredFormations = useMemo(() => {
    return archivedFormations.filter((item) => {
      // Search
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchesSymbol = item.symbol.toLowerCase().includes(query);
        const matchesName = item.formationName.toLowerCase().includes(query);
        const matchesBase = item.baseAsset.toLowerCase().includes(query);
        const matchesReason = item.entryReason?.toLowerCase().includes(query) || false;
        if (!matchesSymbol && !matchesName && !matchesBase && !matchesReason) {
          return false;
        }
      }

      // Exchange
      if (exchangeFilter !== 'all' && item.exchange !== exchangeFilter) {
        return false;
      }

      // Bias
      if (biasFilter !== 'all' && item.bias !== biasFilter) {
        return false;
      }

      return true;
    });
  }, [archivedFormations, searchQuery, exchangeFilter, biasFilter]);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeletingId(id);
    try {
      await removeFromArchive(id);
    } catch (err) {
      console.error('Failed to delete archived item:', err);
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  };

  const handleClearAll = async () => {
    if (isClearing) return;
    setIsClearing(true);
    try {
      await clearUserArchive();
      setShowClearConfirm(false);
    } catch (err) {
      console.error('Failed to clear user archive:', err);
    } finally {
      setIsClearing(false);
    }
  };

  // The default archive list intentionally omits large drawing/density arrays.
  // Fetch only the selected full record, retaining every saved annotation.
  const handleOpenArchived = async (item: ArchivedFormation) => {
    if (openingId !== null) return;
    setOpeningId(item.id);
    setArchiveActionError('');
    try {
      const response = await apiFetch('/api/account/archive/' + encodeURIComponent(item.id));
      if (!response.ok) throw new Error('Archive detail request failed');
      const result = await response.json();
      if (!result?.item || result.item.id !== item.id) throw new Error('Invalid archive detail');
      onSelectFormation(result.item as ArchivedFormation);
    } catch (error) {
      console.error('Failed to open archived formation:', error);
      setArchiveActionError(archiveActionCopy.load);
    } finally {
      setOpeningId(null);
    }
  };

  // Explicit export retains all archived drawing/scalper/density geometry.
  // A Blob URL avoids tripling memory via data: URL percent encoding.
  const handleExportJson = async () => {
    if (exporting) return;
    setExporting(true);
    setArchiveActionError('');
    try {
      const response = await apiFetch('/api/account/archive/export');
      if (!response.ok) throw new Error('Archive export request failed');
      const archiveBlob = await response.blob();
      const blobUrl = URL.createObjectURL(archiveBlob);
      try {
        const downloadAnchor = document.createElement('a');
        downloadAnchor.href = blobUrl;
        downloadAnchor.download = `signalhook_archive_${user?.uid || 'user'}_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
      } finally {
        // Allow the download to start before releasing the browser object URL.
        window.setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
      }
    } catch (error) {
      console.error('Failed to export archive:', error);
      setArchiveActionError(archiveActionCopy.export);
    } finally {
      setExporting(false);
    }
  };

  const formatDate = (isoStringOrTimestamp: string | number) => {
    try {
      const d = new Date(isoStringOrTimestamp);
      return d.toLocaleString(({ uk: 'uk-UA', en: 'en-GB', pl: 'pl-PL', ru: 'ru-RU' } as const)[language], {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return t('archive.recent');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 box-border flex w-full max-w-full items-center justify-center overflow-x-hidden overflow-y-auto bg-black/80 p-2 backdrop-blur-sm sm:p-4 md:p-6">
      <div data-ui-a11y="archive-modal" role="dialog" aria-modal="true" aria-label={t("archive.title")} className="vq-modal-shell relative my-auto flex w-full min-w-0 max-w-[calc(100dvw-16px)] flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl max-h-[92dvh] sm:max-w-5xl sm:rounded-3xl">
        {/* Header */}
        <div className="vq-modal-header sticky top-0 z-10 flex min-w-0 items-center justify-between gap-2 border-b border-slate-800 bg-slate-950/80 px-3 py-3.5 sm:gap-3 sm:px-6 sm:py-4">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-purple-500/15 border border-purple-500/40 text-purple-400 flex items-center justify-center shrink-0 shadow-sm">
              <FormationArchiveIcon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold text-white tracking-tight flex items-center gap-2">
                  {t('archive.title')}
                  <span className="text-xs px-2 py-0.5 rounded-full font-mono bg-purple-950/80 text-purple-300 border border-purple-800/60 font-semibold">
                    {archivedFormations.length}
                  </span>
                </h3>
                <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <Lock className="w-2.5 h-2.5" />
                  <span>{t('archive.privateStorage')}</span>
                </span>
              </div>
              <p className="min-w-0 truncate text-xs text-slate-400">
                {user ? (
                  <span className="flex min-w-0 items-center gap-1.5 overflow-hidden text-emerald-400">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 inline" />
                    {t('archive.linkedTo')} <strong className="min-w-0 truncate text-white font-medium">{profile?.displayName || user.email}</strong>
                  </span>
                ) : (
                  <span className="text-amber-400 flex items-center gap-1">
                    <span>{t('archive.localOnly')}</span>
                  </span>
                )}
              </p>
            </div>
          </div>

          {archiveActionError && <p role="alert" className="max-w-xs text-xs text-amber-300">{archiveActionError}</p>}
          <div className="flex shrink-0 items-center gap-2">
            {archivedFormations.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => void handleExportJson()}
                  disabled={exporting}
                  className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/60 text-xs font-semibold transition-all cursor-pointer"
                  title={t("archive.exportTitle")}
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{t('archive.export')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowClearConfirm(true)}
                  className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 hover:text-rose-200 border border-rose-500/30 text-xs font-semibold transition-all cursor-pointer"
                  title={t("archive.clearTitle")}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{t('archive.clear')}</span>
                </button>
              </>
            )}

            {!user && onOpenAuth && (
              <button
                type="button"
                onClick={onOpenAuth}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 text-xs font-semibold transition-all cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>{t('archive.signIn')}</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 sm:p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
              title={t("archive.close")}
              aria-label={t("archive.close")}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Clear All Confirmation Banner */}
        {showClearConfirm && (
          <div className="p-3 sm:px-6 bg-rose-950/40 border-b border-rose-800/60 flex flex-wrap items-center justify-between gap-2 animate-in fade-in">
            <div className="flex items-center gap-2 text-xs text-rose-200">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>
                {t('archive.clearConfirm', { count: archivedFormations.length })}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleClearAll}
                disabled={isClearing}
                className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
              >
                {t(isClearing ? 'archive.clearing' : 'archive.clearYes')}
              </button>
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-colors cursor-pointer"
              >
                {t('archive.cancel')}
              </button>
            </div>
          </div>
        )}

        {/* Search & Filter Toolbar */}
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2.5 border-b border-slate-800/80 bg-slate-950/60 px-3 py-3 sm:px-6">
          <div className="relative w-full min-w-0 flex-1 sm:min-w-[200px] sm:max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("archive.searchPlaceholder")}
              aria-label={t("archive.searchPlaceholder")}
              // iOS Safari checks computed pixels, not Tailwind rem: html is 13.5px here.
              style={{ fontSize: '16px' }}
              className="w-full min-w-0 pl-9 pr-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-[16px] leading-6 text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-purple-500/60 transition-colors touch-manipulation"
            />
          </div>

          <div className="flex w-full min-w-0 flex-wrap items-center gap-2 text-xs sm:w-auto">
            {/* Exchange Filter */}
            <div className="flex items-center bg-slate-900 p-0.5 rounded-lg border border-slate-800">
              {(['all', 'binance', 'bybit'] as const).map((ex) => (
                <button
                  key={ex}
                  type="button"
                  aria-pressed={exchangeFilter === ex}
                  onClick={() => setExchangeFilter(ex)}
                  className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                    exchangeFilter === ex
                      ? 'bg-purple-600 text-white font-bold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {ex === 'all' ? t('archive.allExchanges') : ex === 'binance' ? 'Binance' : 'Bybit'}
                </button>
              ))}
            </div>

            {/* Bias Filter */}
            <div className="flex items-center bg-slate-900 p-0.5 rounded-lg border border-slate-800">
              {(['all', 'bullish', 'bearish'] as const).map((b) => (
                <button
                  key={b}
                  type="button"
                  aria-pressed={biasFilter === b}
                  onClick={() => setBiasFilter(b)}
                  className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                    biasFilter === b
                      ? 'bg-purple-600 text-white font-bold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {t(b === 'all' ? 'archive.allTypes' : b === 'bullish' ? 'archive.bullishPlural' : 'archive.bearishPlural')}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Formations List Container */}
        <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain p-4 sm:p-6 space-y-3 sm:space-y-4 sm:min-h-[300px]">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
              <div className="w-8 h-8 rounded-full border-2 border-purple-500 border-t-transparent animate-spin" />
              <p className="text-xs">{t('archive.loading')}</p>
            </div>
          ) : filteredFormations.length === 0 ? (
            <div className="mx-auto flex max-w-full min-w-0 flex-col items-center justify-center space-y-3 break-words py-12 text-center sm:max-w-md sm:py-16">
              <div className="w-14 h-14 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center">
                <FormationArchiveIcon className="w-7 h-7" />
              </div>
              <h4 className="text-base font-bold text-white">
                {t(archivedFormations.length === 0 ? 'archive.empty' : 'archive.noResults')}
              </h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                {archivedFormations.length === 0
                  ? t('archive.emptyHelp')
                  : t('archive.noResultsHelp')}
              </p>
            </div>
          ) : (
            filteredFormations.map((item) => {
              const isBull = item.bias === 'bullish';
              const isBear = item.bias === 'bearish';
              const isManual = item.formation?.patternKey === 'manual';
              const profitPct = item.formation?.potentialProfitPct || 0;
              const riskPct = item.formation?.potentialRiskPct || 0;

              return (
                <div
                  key={item.id}
                  onClick={() => { void handleOpenArchived(item); }}
                  className="group relative rounded-2xl bg-slate-950/70 hover:bg-slate-950 border border-slate-800 hover:border-purple-500/50 p-4 transition-all shadow-md hover:shadow-purple-500/10 cursor-pointer space-y-3"
                >
                  {/* Top Bar: Coin Info, Badges, and Action Buttons */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center flex-wrap gap-2">
                      <span data-no-translate className="font-mono font-extrabold text-white text-sm sm:text-base">
                        {item.baseAsset}/{item.quoteAsset}
                      </span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${
                          item.exchange === 'binance'
                            ? 'bg-amber-500/10 text-amber-300 border border-amber-500/30'
                            : 'bg-orange-500/10 text-orange-300 border border-orange-500/30'
                        }`}
                      >
                        {item.exchange}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                        {item.marketType === 'futures' ? 'USDT-M' : 'Spot'}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-cyan-300 font-mono font-bold">
                        {item.timeframe}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-500 flex items-center gap-1 font-mono">
                        <Calendar className="w-3 h-3 text-slate-500" />
                        {formatDate(item.savedAtTimestamp || item.createdAt)}
                      </span>

                      {/* Delete Button with quick confirmation */}
                      {confirmDeleteId === item.id ? (
                        <div
                          className="flex items-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span className="text-[10px] text-rose-300">{t('archive.deleteConfirm')}</span>
                          <button
                            type="button"
                            onClick={(e) => handleDelete(item.id, e)}
                            disabled={deletingId === item.id}
                            className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold transition-colors cursor-pointer"
                          >
                            {t('archive.yes')}
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmDeleteId(null);
                            }}
                            className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] transition-colors cursor-pointer"
                          >
                            {t('archive.no')}
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDeleteId(item.id);
                          }}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                          title={t("archive.deleteTitle")}
                          aria-label={`${t("archive.deleteTitle")}: ${item.baseAsset}/${item.quoteAsset}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Direction and saved confluence only; omit the long formation title in archive cards. */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-semibold flex items-center gap-1 ${
                          isBull
                            ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                            : isBear
                            ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                            : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                        }`}
                      >
                        {isManual ? (
                          <FormationArchiveIcon className="w-3 h-3 text-purple-300" />
                        ) : isBull ? (
                          <TrendingUp className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <TrendingDown className="w-3 h-3 text-rose-400" />
                        )}
                        <span>{isManual ? manualArchiveCopy : t(isBull ? 'archive.bullish' : isBear ? 'archive.bearish' : 'archive.neutral')}</span>
                      </span>

                      {!isManual && typeof item.confidence === 'number' && Number.isFinite(item.confidence) && (
                        <div className="relative inline-flex items-center gap-1 rounded border border-purple-500/20 bg-purple-500/10 px-1.5 py-0.5 text-[10px] text-purple-300">
                          <span className="font-mono">{Math.round(item.confidence)}%</span>
                          <span>{t('archive.confluenceLabel')}</span>
                          <button type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setScoreInfoId(current => current === item.id ? null : item.id);
                            }}
                            aria-label={t('archive.confluenceHelpTitle')}
                            title={t('archive.confluenceHelpTitle')}
                            aria-expanded={scoreInfoId === item.id}
                            aria-controls={`archive-confluence-help-${item.id}`}
                            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-purple-200 hover:bg-purple-500/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-purple-300"
                          >
                            <CircleHelp className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={(event) => { event.stopPropagation(); void handleOpenArchived(item); }}
                      disabled={openingId !== null}
                      className="flex items-center gap-1 px-3 py-1 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 group-hover:text-purple-100 border border-purple-500/40 text-xs font-semibold transition-all cursor-pointer active:scale-95"
                    >
                      <span>{t('archive.openChart')}</span>
                      <ExternalLink className="w-3 h-3 text-purple-400" />
                    </button>
                  </div>

                  {/* In-flow help is not clipped by the modal's mobile scroll viewport. */}
                  {scoreInfoId === item.id && (
                    <div id={`archive-confluence-help-${item.id}`} role="tooltip"
                      onClick={(event) => event.stopPropagation()}
                      className="min-w-0 w-full rounded-xl border border-purple-500/40 bg-slate-900 px-3 py-2 text-left text-xs font-normal leading-relaxed text-slate-200 shadow-md">
                      {t('archive.confluenceHelp')}
                    </div>
                  )}

                  {/* Hide the entire entry reason section for records with no meaningful reason. */}
                  {item.entryReason?.trim() && (
                    <section
                      data-archive-entry-reason
                      aria-label={t('archive.entryReason')}
                      className="min-w-0 rounded-xl border border-purple-500/30 bg-purple-500/10 px-3 py-3"
                    >
                      <p className="mb-1 text-xs font-bold text-purple-300">
                        {t('archive.entryReason')}
                      </p>
                      <p data-no-translate className="min-w-0 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-100 [overflow-wrap:anywhere]">
                        {item.entryReason}
                      </p>
                    </section>
                  )}

                  {/* Saved Entry Points Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-900 text-xs font-mono">
                    <div className="p-2 rounded-xl bg-slate-900/80 border border-slate-800/80">
                      <span className="text-[10px] text-slate-400 block font-sans">{t('archive.entry')}</span>
                      <span className="text-sky-300 font-bold text-xs sm:text-sm">
                        {isManual ? '—' : '$' + formatCryptoPrice(item.entryPrice)}
                      </span>
                    </div>

                    <div className="min-w-0 overflow-hidden rounded-xl border border-emerald-800/30 bg-emerald-950/20 p-2">
                      <span className="block font-sans text-[10px] text-emerald-400">{t('archive.target')}</span>
                      <span className="block min-w-0 break-all text-xs font-bold leading-tight text-emerald-300 sm:text-sm">
                        {isManual ? '—' : '$' + formatCryptoPrice(item.targetPrice)}
                      </span>
                      {!isManual && Number.isFinite(profitPct) && profitPct > 0 && (
                        <span className="mt-1 block whitespace-nowrap font-mono text-[11px] text-emerald-400">
                          (+{formatArchivePercent(profitPct)}%)
                        </span>
                      )}
                    </div>

                    <div className="min-w-0 overflow-hidden rounded-xl border border-rose-800/30 bg-rose-950/20 p-2">
                      <span className="block font-sans text-[10px] text-rose-400">{t('archive.stopLoss')}</span>
                      <span className="block min-w-0 break-all text-xs font-bold leading-tight text-rose-300 sm:text-sm">
                        {isManual ? '—' : '$' + formatCryptoPrice(item.stopLossPrice)}
                      </span>
                      {!isManual && Number.isFinite(riskPct) && riskPct !== 0 && (
                        <span className="mt-1 block whitespace-nowrap font-mono text-[11px] text-rose-400">
                          (-{formatArchivePercent(riskPct)}%)
                        </span>
                      )}
                    </div>

                    <div className="p-2 rounded-xl bg-slate-900/80 border border-slate-800/80">
                      <span className="text-[10px] text-slate-400 block font-sans">
                        {t('archive.savedPrice')}
                      </span>
                      <span className="text-slate-200 font-bold text-xs sm:text-sm">
                        ${formatCryptoPrice(item.savedPrice)}
                      </span>
                    </div>
                  </div>

                  {/* Markers & Chart Coordinates Info Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-slate-400">
                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-1 text-purple-300">
                        <MapPin className="w-3 h-3 text-purple-400" />
                        <span>{t('archive.markers', { count: item.markers?.length ?? (isManual ? 0 : 3) })}</span>
                      </span>
                      {item.necklinePrice && (
                        <span className="text-[10px] font-mono text-amber-400 bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-900/40">
                          {t('archive.neck')}: ${formatCryptoPrice(item.necklinePrice)}
                        </span>
                      )}
                      {item.supportPrice && (
                        <span className="text-[10px] font-mono text-purple-400 bg-purple-950/40 px-1.5 py-0.5 rounded border border-purple-900/40">
                          {t('archive.support')}: ${formatCryptoPrice(item.supportPrice)}
                        </span>
                      )}
                      {item.resistancePrice && (
                        <span className="text-[10px] font-mono text-orange-400 bg-orange-950/40 px-1.5 py-0.5 rounded border border-orange-900/40">
                          {t('archive.resistance')}: ${formatCryptoPrice(item.resistancePrice)}
                        </span>
                      )}
                    </div>

                    <span className="text-[10px] text-slate-500 font-mono">
                      ID: {item.id.slice(-8)}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-t border-slate-800 bg-slate-950/90 px-3 py-3 text-xs text-slate-400 sm:px-6">
          <div className="flex items-center gap-2">
            <span>
              {t('archive.total')}: <strong className="text-white font-mono">{archivedFormations.length}</strong>
            </span>
            {user && (
              <span className="text-slate-600 hidden sm:inline">•</span>
            )}
            {user && (
              <span className="text-[11px] text-slate-400 hidden sm:inline">
                {t('archive.privacy')}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {archivedFormations.length > 0 && (
              <button
                type="button"
                onClick={() => void handleExportJson()}
                  disabled={exporting}
                className="md:hidden flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{t('archive.export')}</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
            >
              {t('archive.close')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
