import React, { useState, useEffect } from 'react';
import { X, Send, Bell, CheckCircle2, AlertCircle, Trash2, Plus, RefreshCw, ExternalLink, Play, Pause, Clock, ArrowUpRight, ArrowDownRight, Check, ShieldCheck, AlertTriangle, Lock, History, RotateCcw } from 'lucide-react';
import { PriceAlert, TelegramStatus, ExchangeId, MarketType, ScannedCoin, AlertHistoryItem } from '../types';
import { formatCryptoPrice } from '../utils/formatters';
import { useAuth } from '../context/AuthContext';
import { useAlerts } from '../context/AlertsContext';
import { useLanguage } from '../context/LanguageContext';
import { translatePhrase } from '../locales';
import { LogIn } from 'lucide-react';

interface TelegramAlertsModalProps {
  isOpen: boolean;
  onClose: () => void;
  scannedCoins?: ScannedCoin[];
  onAlertCreated?: (alert: PriceAlert) => void;
  onOpenAuth?: () => void;
  prefill?: any;
  initialCoin?: {
    symbol: string;
    exchange: ExchangeId;
    marketType: MarketType;
    currentPrice: number;
    targetPrice?: number;
    condition?: 'gte' | 'lte';
    formationName?: string;
    levelType?: 'entry' | 'target' | 'stop_loss' | 'custom';
    note?: string;
  } | null;
}

export const TelegramAlertsModal: React.FC<TelegramAlertsModalProps> = ({
  isOpen,
  onClose,
  scannedCoins = [],
  onAlertCreated,
  onOpenAuth,
  prefill,
  initialCoin,
}) => {
  const { user, profile, updateProfileData } = useAuth();
  const { language } = useLanguage();
  const tr = (value: string) => translatePhrase(language, value);
  const {
    alerts,
    history,
    loading: loadingAlerts,
    loadingHistory,
    notificationPermission,
    requestNotificationPermission,
    fetchHistory,
    clearHistory,
    deleteHistoryItem,
    reactivateAlert,
    addAlert,
    deleteAlert: removeAlert,
    toggleAlert: switchAlert,
    clearTriggered: removeTriggered,
    historyCount,
  } = useAlerts();

  const [activeTab, setActiveTab] = useState<'alerts' | 'history' | 'settings'>('alerts');
  const [clearingHistory, setClearingHistory] = useState<boolean>(false);
  const [reactivatingId, setReactivatingId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState<boolean>(false);
  const [cronStatus, setCronStatus] = useState<any>(null);
  const [testingCron, setTestingCron] = useState<boolean>(false);

  // New Alert Form State
  const [formSymbol, setFormSymbol] = useState<string>('BTCUSDT');
  const [formExchange, setFormExchange] = useState<ExchangeId>('binance');
  const [formMarketType, setFormMarketType] = useState<MarketType>('futures');
  const [formCondition, setFormCondition] = useState<'gte' | 'lte'>('gte');
  const [formTargetPrice, setFormTargetPrice] = useState<string>('');
  const [formNote, setFormNote] = useState<string>('');
  const [creatingAlert, setCreatingAlert] = useState<boolean>(false);
  const [createSuccessMsg, setCreateSuccessMsg] = useState<string | null>(null);
  const [createErrorMsg, setCreateErrorMsg] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [tgStatus, setTgStatus] = useState<TelegramStatus | null>(null);
  const [loadingTgStatus, setLoadingTgStatus] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [connectUrl, setConnectUrl] = useState<string | null>(null);
  const ownerRef = React.useRef(user?.uid);
  ownerRef.current = user?.uid;

  const fetchTelegramStatus = async () => {
    const owner = user?.uid;
    if (!owner) return;
    setLoadingTgStatus(true);
    try {
      const response = await fetch(`/api/telegram/status?userId=${encodeURIComponent(owner)}`);
      const data = await response.json();
      if (ownerRef.current === owner && data.success) {
        setTgStatus(data);
        if (data.isConfigured) setConnectUrl(null);
      }
    } finally { if (ownerRef.current === owner) setLoadingTgStatus(false); }
  };
  useEffect(() => {
    setTgStatus(null); setConnectUrl(null); setTestResult(null);
    if (!isOpen || !user) return;
    void fetchTelegramStatus().catch(() => {});
    void fetchHistory();
    const timer = setInterval(() => void fetchTelegramStatus().catch(() => {}), 4000);
    return () => clearInterval(timer);
  }, [isOpen, user?.uid]);

  const handleConnectTelegram = async () => {
    const owner = user?.uid;
    setConnecting(true); setTestResult(null);
    try {
      const response = await fetch('/api/telegram/connect', { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: owner, language }) });
      const data = await response.json();
      if (ownerRef.current !== owner) return;
      if (!response.ok || !data.success) throw new Error(data.error || 'Не вдалося підключити Telegram');
      setConnectUrl(data.url);
    } catch (error: any) { if (ownerRef.current === owner) setTestResult({ success: false, message: error.message }); }
    finally { if (ownerRef.current === owner) setConnecting(false); }
  };
  const handleDisconnectTelegram = async () => {
    const response = await fetch('/api/telegram/disconnect', { method: 'POST' });
    const data = await response.json();
    if (!response.ok || !data.success) { setTestResult({ success: false, message: data.error || 'Не вдалося відключити Telegram' }); return; }
    setConnectUrl(null); setTestResult(null); await fetchTelegramStatus();
  };

  const handleClearHistory = async () => {
    if (!confirm(tr('Ви впевнені, що хочете очистити історію сповіщень?'))) return;
    setClearingHistory(true);
    try {
      await clearHistory();
    } catch (err) {
      console.error('Failed to clear history:', err);
    } finally {
      setClearingHistory(false);
    }
  };

  const handleReactivateAlert = async (item: AlertHistoryItem) => {
    setReactivatingId(item.id);
    try {
      await reactivateAlert(item);
      setActiveTab('alerts');
    } catch (err) {
      console.error('Failed to reactivate alert:', err);
    } finally {
      setReactivatingId(null);
    }
  };

  // Handle Initial Coin or Prefill if passed
  useEffect(() => {
    const data = initialCoin || prefill;
    if (data) {
      if (data.symbol) setFormSymbol(data.symbol.toUpperCase().replace('/', ''));
      if (data.exchange) setFormExchange(data.exchange);
      if (data.marketType) setFormMarketType(data.marketType);
      if (data.targetPrice) {
        setFormTargetPrice(String(data.targetPrice));
      } else if (data.currentPrice) {
        setFormTargetPrice(String(data.currentPrice));
      }
      if (data.condition) {
        setFormCondition(data.condition);
      } else if (data.targetPrice && data.currentPrice) {
        setFormCondition(data.targetPrice >= data.currentPrice ? 'gte' : 'lte');
      }
      if (data.note) {
        setFormNote(data.note);
      } else if (data.formationName) {
        setFormNote(`${data.formationName} (${data.levelType || 'рівень'})`);
      }
      setShowCreateForm(true);
      setActiveTab('alerts');
    }
  }, [initialCoin, prefill]);

  const handleTestTelegram = async () => {
    setTestingCron(true); setTestResult(null);
    try {
      const response = await fetch('/api/telegram/test', { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ language }) });
      const data = await response.json();
      setTestResult({ success: !!data.success, message: data.success ? 'Тестове сповіщення надіслано у ваш Telegram' : data.error || 'Не вдалося надіслати тест' });
    } catch { setTestResult({ success: false, message: 'Не вдалося з’єднатися із сервером' }); }
    finally { setTestingCron(false); }
  };

  const fetchCronStatus = async () => {
    try {
      const res = await fetch('/api/cron/status');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setCronStatus(data);
        }
      }
    } catch {}
  };

  useEffect(() => {
    if (isOpen) {
      fetchCronStatus();
      const interval = setInterval(fetchCronStatus, 8000);
      return () => clearInterval(interval);
    }
  }, [isOpen]);

  const handleTestCronPipeline = async () => {
    setTestingCron(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/cron/test-alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user?.uid,
          language,
          symbol: formSymbol || 'BTCUSDT',
          note: 'Перевірка фонової системи CRON та доставки сповіщень',
        }),
      });
      const data = await res.json();
      if (data.success) {
        setTestResult({
          success: true,
          message: '✅ Сповіщення успішно надіслано в Telegram та підтверджено системою CRON!',
        });
        fetchHistory();
        fetchCronStatus();
      } else {
        setTestResult({
          success: false,
          message: data.error || 'Помилка надсилання тестового сповіщення CRON',
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err?.message || 'Не вдалося виконати запит до CRON',
      });
    } finally {
      setTestingCron(false);
    }
  };

  // Create New Price Alert
  const handleCreateAlert = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      setCreateErrorMsg('Встановлювати сповіщення можуть тільки зареєстровані користувачі. Будь ласка, увійдіть або зареєструйтесь.');
      onOpenAuth?.();
      return;
    }

    if (!formSymbol || !formTargetPrice) {
      setCreateErrorMsg('Вкажіть символ та цільову ціну');
      return;
    }

    const priceNum = parseFloat(formTargetPrice);
    if (isNaN(priceNum) || priceNum <= 0) {
      setCreateErrorMsg('Невірна цільова ціна');
      return;
    }

    setCreatingAlert(true);
    setCreateErrorMsg(null);
    setCreateSuccessMsg(null);

    try {
      const newAlert = await addAlert({
        symbol: formSymbol,
        exchange: formExchange,
        marketType: formMarketType,
        targetPrice: priceNum,
        condition: formCondition,
        note: formNote || undefined,
        formationName: initialCoin?.formationName,
        levelType: initialCoin?.levelType || 'custom',
      });

      setCreateSuccessMsg(tr(`Сповіщення для ${formSymbol} створено у вашому профілі!`));
      onAlertCreated?.(newAlert);
      setFormNote('');
      setTimeout(() => {
        setCreateSuccessMsg(null);
        setShowCreateForm(false);
      }, 1500);
    } catch (err: any) {
      setCreateErrorMsg(err.message || 'Помилка збереження сповіщення');
    } finally {
      setCreatingAlert(false);
    }
  };

  // Toggle Alert Active
  const handleToggleAlert = async (id: string) => {
    try {
      await switchAlert(id);
    } catch (err) {
      console.error('Failed to toggle alert:', err);
    }
  };

  // Delete Alert
  const handleDeleteAlert = async (id: string) => {
    setActionError(null);
    try {
      await removeAlert(id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : tr('Не вдалося видалити сповіщення'));
    }
  };

  // Clear Triggered Alerts
  const handleClearTriggered = async () => {
    setActionError(null);
    try {
      await removeTriggered();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : tr('Не вдалося очистити сповіщення'));
    }
  };

  if (!isOpen) return null;

  const activeAlerts = alerts.filter((a) => a.isActive && !a.triggered);
  const triggeredAlerts = alerts.filter((a) => a.triggered);
  const pausedAlerts = alerts.filter((a) => !a.isActive && !a.triggered);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto touch-scroll">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-auto">
        {actionError && <div role="alert" className="px-4 py-3 text-sm text-rose-300 bg-rose-950/50">{actionError}</div>}
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 bg-slate-950/90 border-b border-slate-800">
          <div className="flex items-center gap-2 sm:gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-sky-500/20 border border-sky-500/30 flex items-center justify-center text-sky-400 shrink-0">
              <Send className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <span>{tr("Сповіщення в Telegram")}</span>
                {activeAlerts.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-sky-500/20 border border-sky-500/30 text-sky-300 font-mono text-xs font-semibold">
                    {activeAlerts.length}
                  </span>
                )}
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-400 line-clamp-1">
                {tr("Миттєві сповіщення при досягненні ваших рівнів")}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* User Profile Isolation Banner */}
        {user ? (
          <div className="px-5 py-2 bg-slate-900/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 flex items-center justify-center font-bold text-[10px]">
                {(profile?.displayName || user.email || 'U')[0].toUpperCase()}
              </div>
              <span className="text-slate-300">
                {tr("Профіль:")} <strong className="text-white">{profile?.displayName || user.email}</strong>
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-mono">
                {tr("ХМАРА • ІЗОЛЬОВАНО")}
              </span>
            </div>
            <span className="text-[11px] text-slate-400 hidden sm:inline">
              {tr("Усі сповіщення та налаштування збережено у вашому обліковому записі")}
            </span>
          </div>
        ) : (
          <div className="px-5 py-3 bg-amber-500/10 border-b border-amber-500/20 flex flex-wrap items-center justify-between gap-3 text-xs text-amber-200">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400">
                <Lock className="w-4 h-4" />
              </div>
              <div>
                <p className="font-semibold text-white">{tr("Сповіщення доступні тільки для зареєстрованих користувачів")}</p>
                <p className="text-[11px] text-amber-300/80">{tr("Увійдіть або зареєструйтесь, щоб створювати сповіщення та отримувати сигнали в Telegram.")}</p>
              </div>
            </div>
            {onOpenAuth && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenAuth();
                }}
                className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-all shadow cursor-pointer active:scale-95"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>{tr("Увійти / Зареєструватися")}</span>
              </button>
            )}
          </div>
        )}

        {/* Telegram & CRON Status Banner */}
        <div className="px-5 py-2.5 bg-slate-950/50 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center flex-wrap gap-2 sm:gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">Telegram:</span>
              {tgStatus?.isConfigured ? (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 font-medium text-[11px]">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {tr('Підключено')} {tgStatus.botUsername ? `@${tgStatus.botUsername}` : ''}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-300 font-medium text-[11px]">
                  <AlertCircle className="w-3 h-3" />
                  {tr("Не налаштовано")}
                </span>
              )}
            </div>

            {/* CRON Live Indicator */}
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 font-mono text-[11px]" title={tr("Фоновий CRON активний: перевірка кожні 5 секунд")}>
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
              <span>CRON: 24/7 (5s)</span>
            </div>

            {/* Desktop Notification Prompt */}
            {notificationPermission !== 'granted' ? (
              <button
                type="button"
                onClick={requestNotificationPermission}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 text-indigo-300 text-[11px] font-medium transition-all cursor-pointer"
                title={tr("Отримувати сповіщення на робочий стіл навіть коли вкладка згорнута")}
              >
                <Bell className="w-3 h-3 text-indigo-400" />
                <span>{tr("Увімкнути Push браузера")}</span>
              </button>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-800/80 border border-slate-700 text-slate-300 text-[11px]" title={tr("Сповіщення браузера дозволено")}>
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                <span>{tr("Push: Активно")}</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              onClick={() => setActiveTab('alerts')}
              className={`px-3 py-1 rounded-lg font-medium transition-all ${
                activeTab === 'alerts'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {tr('Сповіщення')} ({alerts.length})
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-3 py-1 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
                activeTab === 'history'
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>{tr('Історія')} ({history.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`px-3 py-1 rounded-lg font-medium transition-all ${
                activeTab === 'settings'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {tr("Налаштування бота")}
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-3.5 sm:p-5 max-h-[72vh] sm:max-h-[75vh] overflow-y-auto touch-scroll space-y-4">
          {/* TAB 1: ALERTS LIST & CREATION */}
          {activeTab === 'alerts' && (
            <div className="space-y-4">
              {!user ? (
                <div className="p-6 sm:p-8 rounded-2xl bg-gradient-to-b from-slate-900/90 to-slate-950 border border-slate-800 text-center space-y-4 shadow-xl">
                  <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-amber-400 mx-auto flex items-center justify-center">
                    <Lock className="w-7 h-7 text-amber-400" />
                  </div>
                  <div className="max-w-md mx-auto space-y-1.5">
                    <h3 className="text-base sm:text-lg font-bold text-white">
                      {tr("Встановлення сповіщень вимагає реєстрації")}
                    </h3>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      {tr("Щоб створювати та отримувати сповіщення при досягненні цінових рівнів (входу, TP, SL), необхідно увійти у свій обліковий запис або зареєструватися.")}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 max-w-lg mx-auto text-left py-2">
                    <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800/80 text-xs">
                      <div className="font-semibold text-cyan-300 flex items-center gap-1.5">
                        <Bell className="w-3.5 h-3.5 text-cyan-400" /> {tr("24/7 Моніторинг")}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">{tr("Серверний трекінг цін навіть при вимкненому комп'ютері")}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800/80 text-xs">
                      <div className="font-semibold text-emerald-300 flex items-center gap-1.5">
                        <Send className="w-3.5 h-3.5 text-emerald-400" /> {tr("Telegram бот")}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">{tr("Миттєві сигнали прямо в особистий чат або групу")}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800/80 text-xs">
                      <div className="font-semibold text-amber-300 flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-amber-400" /> {tr("Персоналізація")}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">{tr("Приватне збереження ваших торгових сетапів")}</p>
                    </div>
                  </div>

                  {onOpenAuth && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenAuth();
                      }}
                      className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 inline-flex items-center gap-2 transition-all cursor-pointer active:scale-95"
                    >
                      <LogIn className="w-4 h-4" />
                      <span>{tr("Увійти / Зареєструватися")}</span>
                    </button>
                  )}
                </div>
              ) : (
                <>
                  {/* Action bar */}
                  <div className="flex items-center justify-between gap-2">
                    <button
                      onClick={() => setShowCreateForm((prev) => !prev)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold shadow-md shadow-cyan-900/30 transition-all cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>{tr(showCreateForm ? 'Сховати форму' : 'Нове сповіщення')}</span>
                    </button>

                    <div className="flex items-center gap-2">
                      {triggeredAlerts.length > 0 && (
                        <button
                          onClick={handleClearTriggered}
                          className="text-xs text-slate-400 hover:text-slate-200 px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-800 transition-colors"
                          title={tr("Очистити список уже спрацьованих сповіщень")}
                        >
                          {tr('Очистити спрацьовані')} ({triggeredAlerts.length})
                        </button>
                      )}
                      <button
                        onClick={() => fetchTelegramStatus()}
                        disabled={loadingAlerts}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                        title={tr("Оновити список")}
                      >
                        <RefreshCw className={`w-4 h-4 ${loadingAlerts ? 'animate-spin' : ''}`} />
                      </button>
                    </div>
                  </div>

              {/* Create Alert Form Accordion */}
              {showCreateForm && (
                <form
                  onSubmit={handleCreateAlert}
                  className="p-4 rounded-xl bg-slate-950/90 border border-cyan-500/30 space-y-3 shadow-inner"
                >
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                      <Bell className="w-3.5 h-3.5 text-cyan-400" />
                      {tr("Створити сповіщення ціни")}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {tr("Telegram надішле повідомлення миттєво")}
                    </span>
                  </div>

                  {createErrorMsg && (
                    <div className="p-2.5 rounded-lg bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{createErrorMsg}</span>
                    </div>
                  )}

                  {createSuccessMsg && (
                    <div className="p-2.5 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>{createSuccessMsg}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* Symbol */}
                    <div>
                      <label className="block text-[11px] text-slate-400 font-medium mb-1">
                        {tr("Монета / Символ")}
                      </label>
                      <input
                        type="text"
                        value={formSymbol}
                        onChange={(e) => setFormSymbol(e.target.value.toUpperCase())}
                        placeholder="BTCUSDT"
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono font-semibold focus:outline-none focus:border-cyan-500"
                        required
                      />
                    </div>

                    {/* Exchange & Market */}
                    <div>
                      <label className="block text-[11px] text-slate-400 font-medium mb-1">
                        {tr("Біржа та тип")}
                      </label>
                      <div className="flex gap-1.5">
                        <select
                          value={formExchange}
                          onChange={(e) => setFormExchange(e.target.value as ExchangeId)}
                          className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                        >
                          <option value="binance">Binance</option>
                          <option value="bybit">Bybit</option>
                        </select>
                        <select
                          value={formMarketType}
                          onChange={(e) => setFormMarketType(e.target.value as MarketType)}
                          className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                        >
                          <option value="futures">Futures</option>
                          <option value="spot">Spot</option>
                        </select>
                      </div>
                    </div>

                    {/* Condition */}
                    <div>
                      <label className="block text-[11px] text-slate-400 font-medium mb-1">
                        {tr("Умова спрацювання")}
                      </label>
                      <select
                        value={formCondition}
                        onChange={(e) => setFormCondition(e.target.value as 'gte' | 'lte')}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-medium focus:outline-none focus:border-cyan-500"
                      >
                        <option value="gte">{tr("≥ Ціна піднялась або досягла")}</option>
                        <option value="lte">{tr("≤ Ціна опустилась або досягла")}</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Target Price */}
                    <div>
                      <label className="block text-[11px] text-slate-400 font-medium mb-1">
                        {tr("Цільова ціна ($)")}
                      </label>
                      <input
                        type="number"
                        step="any"
                        value={formTargetPrice}
                        onChange={(e) => setFormTargetPrice(e.target.value)}
                        placeholder={tr("Наприклад: 78500")}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono font-bold focus:outline-none focus:border-cyan-500"
                        required
                      />
                    </div>

                    {/* Note / Label */}
                    <div>
                      <label className="block text-[11px] text-slate-400 font-medium mb-1">
                        {tr("Примітка (необов'язково)")}
                      </label>
                      <input
                        type="text"
                        value={formNote}
                        onChange={(e) => setFormNote(e.target.value)}
                        placeholder={tr("Наприклад: Пробій трикутника, тейк-профіт")}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowCreateForm(false)}
                      className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-200 transition-colors"
                    >
                      {tr("Скасувати")}
                    </button>
                    <button
                      type="submit"
                      disabled={creatingAlert}
                      className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold transition-all disabled:opacity-50 cursor-pointer shadow-sm"
                    >
                      {creatingAlert ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>{tr("Створення...")}</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>{tr("Зберегти алерт")}</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}

              {/* Alerts List */}
              {loadingAlerts && alerts.length === 0 ? (
                <div className="py-12 text-center text-slate-500 flex flex-col items-center justify-center gap-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-cyan-400" />
                  <span className="text-xs">{tr("Завантаження сповіщень...")}</span>
                </div>
              ) : alerts.length === 0 ? (
                <div className="py-10 text-center rounded-xl border border-dashed border-slate-800 bg-slate-950/40 p-6">
                  <Bell className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                  <h3 className="text-sm font-semibold text-slate-300 mb-1">
                    {tr("У вас ще немає встановлених сповіщень")}
                  </h3>
                  <p className="text-xs text-slate-500 max-w-md mx-auto mb-3">
                    {tr("Створіть нове сповіщення кнопкою вище або в 1 клік на картці монети чи у вікні детального графіка формації.")}
                  </p>
                  <button
                    onClick={() => setShowCreateForm(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600/20 text-cyan-300 border border-cyan-500/30 text-xs font-medium hover:bg-cyan-600/30 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{tr("Створити перше сповіщення")}</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {/* Active Alerts */}
                  {activeAlerts.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 px-1">
                        {tr('Активні сповіщення')} ({activeAlerts.length})
                      </div>
                      {activeAlerts.map((alert) => (
                        <div
                          key={alert.id}
                          className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-950/80 border border-slate-800 hover:border-slate-700 transition-all"
                        >
                          <div className="flex flex-1 items-center gap-2.5 min-w-0">
                            <div
                              className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                                alert.condition === 'gte'
                                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                  : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                              }`}
                            >
                              {alert.condition === 'gte' ? (
                                <ArrowUpRight className="w-4 h-4" />
                              ) : (
                                <ArrowDownRight className="w-4 h-4" />
                              )}
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-bold font-mono text-sm text-white">
                                  {alert.symbol}
                                </span>
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-mono">
                                  {alert.exchange} {alert.marketType}
                                </span>
                                {alert.levelType && alert.levelType !== 'custom' && (
                                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-800/50 font-medium">
                                    {tr(alert.levelType === 'entry' ? 'Вхід' : alert.levelType === 'target' ? 'Ціль (TP)' : 'Стоп (SL)')}
                                  </span>
                                )}
                              </div>
                              <div className="mt-1 min-w-0">
                                <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-xs text-slate-400">
                                  <span className="shrink-0 whitespace-nowrap">{tr("Умова:")}</span>
                                  <span className="font-mono font-bold text-slate-200 whitespace-nowrap">
                                    {alert.condition === 'gte' ? '≥' : '≤'} ${formatCryptoPrice(alert.targetPrice)}
                                  </span>
                                </div>
                                {alert.note && (
                                  <div className="mt-0.5 max-w-full truncate text-xs text-slate-500" title={tr(alert.note)}>
                                    • {tr(alert.note)}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() => handleToggleAlert(alert.id)}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                              title={tr("Призупинити сповіщення")}
                            >
                              <Pause className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteAlert(alert.id)}
                              className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition-colors"
                              title={tr("Видалити сповіщення")}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Paused Alerts */}
                  {pausedAlerts.length > 0 && (
                    <div className="space-y-1.5 pt-2">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 px-1">
                        {tr('Призупинені')} ({pausedAlerts.length})
                      </div>
                      {pausedAlerts.map((alert) => (
                        <div
                          key={alert.id}
                          className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-950/40 border border-slate-800/60 opacity-60 hover:opacity-100 transition-all"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center shrink-0 text-slate-500">
                              <Pause className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="font-bold font-mono text-sm text-slate-300">
                                {alert.symbol} {alert.condition === 'gte' ? '≥' : '≤'} ${formatCryptoPrice(alert.targetPrice)}
                              </div>
                              <div className="text-xs text-slate-500">{tr("Призупинено")}</div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() => handleToggleAlert(alert.id)}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-400 transition-colors"
                              title={tr("Відновити сповіщення")}
                            >
                              <Play className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteAlert(alert.id)}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 transition-colors"
                              title={tr("Видалити")}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Triggered Alerts History */}
                  {triggeredAlerts.length > 0 && (
                    <div className="space-y-1.5 pt-2">
                      <div className="flex items-center justify-between px-1">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-400/80 flex items-center gap-1.5">
                          <CheckCircle2 className="w-3 h-3" />
                          {tr('Спрацювали та надіслані в Telegram')} ({triggeredAlerts.length})
                        </div>
                        <button
                          type="button"
                          onClick={handleClearTriggered}
                          className="px-2 py-0.5 rounded text-[11px] text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 flex items-center gap-1 transition-colors cursor-pointer"
                          title={tr("Видалити всі спрацьовані сповіщення")}
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>{tr("Очистити всі")}</span>
                        </button>
                      </div>
                      {triggeredAlerts.map((alert) => (
                        <div
                          key={alert.id}
                          className="flex items-center justify-between gap-3 p-3 rounded-xl bg-emerald-950/20 border border-emerald-900/40 transition-all"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0 text-emerald-400">
                              <Check className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold font-mono text-sm text-emerald-300">
                                  {alert.symbol}
                                </span>
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-950 border border-emerald-800 text-emerald-400 font-medium">
                                  {tr("Виконано")}
                                </span>
                              </div>
                              <div className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                                <span>{tr('Ціль:')} ${formatCryptoPrice(alert.targetPrice)}</span>
                                {alert.triggeredPrice && (
                                  <span className="text-emerald-400 font-mono">
                                    • {tr('Зафіксовано:')} ${formatCryptoPrice(alert.triggeredPrice)}
                                  </span>
                                )}
                                {alert.triggeredAt && (
                                  <span className="text-slate-500 text-[11px]">
                                    ({new Date(alert.triggeredAt).toLocaleTimeString('uk-UA')})
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() => handleToggleAlert(alert.id)}
                              className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-colors"
                              title={tr("Перезапустити сповіщення")}
                            >
                              {tr("Перезапустити")}
                            </button>
                            <button
                              onClick={() => handleDeleteAlert(alert.id)}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 transition-colors"
                              title={tr("Видалити")}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* TAB: NOTIFICATION HISTORY */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          {!user ? (
            <div className="p-6 sm:p-8 rounded-2xl bg-gradient-to-b from-slate-900/90 to-slate-950 border border-slate-800 text-center space-y-4 shadow-xl">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-amber-400 mx-auto flex items-center justify-center">
                <Lock className="w-7 h-7 text-amber-400" />
              </div>
              <div className="max-w-md mx-auto space-y-1.5">
                <h3 className="text-base sm:text-lg font-bold text-white">
                  {tr("Історія сповіщень вимагає входу")}
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {tr("Увійдіть у свій обліковий запис, щоб переглядати історію всіх надісланих у Telegram сповіщень, збережених на сервері 24/7.")}
                </p>
              </div>
              {onOpenAuth && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenAuth();
                  }}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 inline-flex items-center gap-2 transition-all cursor-pointer active:scale-95"
                >
                  <LogIn className="w-4 h-4" />
                  <span>{tr("Увійти / Зареєструватися")}</span>
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Header & Controls */}
              <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                      <History className="w-4 h-4 text-cyan-400" />
                      {tr("Журнал спрацьованих сповіщень")}
                    </h3>
                    <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono text-xs font-semibold">
                      {history.length}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>{tr("Серверне збереження: повідомлення фіксуються навіть після закриття вкладки або браузера.")}</span>
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={fetchHistory}
                    disabled={loadingHistory}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium flex items-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer"
                    title={tr("Оновити історію із сервера")}
                  >
                    <RotateCcw className={`w-3.5 h-3.5 ${loadingHistory ? 'animate-spin' : ''}`} />
                    <span>{tr("Оновити")}</span>
                  </button>

                  {history.length > 0 && (
                    <button
                      type="button"
                      onClick={handleClearHistory}
                      disabled={clearingHistory}
                      className="px-2.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 text-xs font-medium flex items-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer"
                      title={tr("Очистити всю історію")}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{tr("Очистити все")}</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Loading State */}
              {loadingHistory && history.length === 0 && (
                <div className="p-8 text-center rounded-xl bg-slate-950/40 border border-slate-800/60 space-y-2">
                  <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-xs text-slate-400">{tr("Завантаження журналу сповіщень із сервера...")}</p>
                </div>
              )}

              {/* Empty History */}
              {!loadingHistory && history.length === 0 && (
                <div className="p-8 text-center rounded-2xl bg-slate-950/50 border border-slate-800/80 space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 mx-auto flex items-center justify-center">
                    <History className="w-6 h-6 text-cyan-400" />
                  </div>
                  <div className="max-w-sm mx-auto space-y-1">
                    <h4 className="text-sm font-bold text-white">{tr("Історія сповіщень порожня")}</h4>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      {tr("Коли ринкова ціна монети досягне встановленої цілі, сервер миттєво відправить сповіщення у ваш Telegram і зафіксує запис тут.")}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('alerts')}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-400 text-xs font-semibold inline-flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{tr("Створити перше сповіщення")}</span>
                  </button>
                </div>
              )}

              {/* History Items List */}
              {history.length > 0 && (
                <div className="space-y-2">
                  {history.map((item) => {
                    const isGte = item.condition === 'gte';
                    const isSent = Boolean(item.telegramSent || item.telegramStatus === 'sent');
                    const isReactivating = reactivatingId === item.id;
                    const dateStr = new Date(item.triggeredAt).toLocaleString('uk-UA', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    });

                    return (
                      <div
                        key={item.id}
                        className={`p-3.5 rounded-xl border transition-all ${
                          isSent
                            ? 'bg-slate-900/60 border-slate-800/90 hover:border-slate-700'
                            : 'bg-rose-950/10 border-rose-900/30'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                          {/* Left Info */}
                          <div className="flex items-start gap-3 min-w-0">
                            <div
                              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border mt-0.5 ${
                                isSent
                                  ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
                                  : 'bg-rose-500/10 border-rose-500/25 text-rose-400'
                              }`}
                            >
                              {isSent ? <Send className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                            </div>

                            <div className="space-y-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-bold font-mono text-sm text-white">
                                  {item.symbol}
                                </span>
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 uppercase font-semibold">
                                  {item.exchange}
                                </span>
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800/80 text-slate-400">
                                  {tr(item.marketType === 'futures' ? "Ф'ючерси" : 'Спот')}
                                </span>

                                {/* Telegram status pill */}
                                {isSent ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-medium">
                                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                    {tr("Надіслано в Telegram")}
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-300 text-[10px] font-medium">
                                    <AlertTriangle className="w-3 h-3 text-rose-400" />
                                    {tr("Помилка доставки")}
                                  </span>
                                )}
                              </div>

                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-300">
                                <span className="flex items-center gap-1 font-mono">
                                  <span className="text-slate-400">{tr("Ціль:")}</span>
                                  <span className={isGte ? 'text-emerald-400' : 'text-rose-400'}>
                                    {isGte ? '≥' : '≤'} ${formatCryptoPrice(item.targetPrice)}
                                  </span>
                                </span>

                                {item.triggeredPrice && (
                                  <span className="flex items-center gap-1 font-mono">
                                    <span className="text-slate-400">{tr("Спрацювало на:")}</span>
                                    <span className="text-amber-300 font-bold">
                                      ${formatCryptoPrice(item.triggeredPrice)}
                                    </span>
                                  </span>
                                )}

                                <span className="text-slate-500 text-[11px] flex items-center gap-1">
                                  <Clock className="w-3 h-3 text-slate-500" />
                                  {dateStr}
                                </span>
                              </div>

                              {(item.formationName || item.note || item.telegramError) && (
                                <div className="text-xs text-slate-400 flex flex-wrap items-center gap-2 pt-0.5">
                                  {item.formationName && (
                                    <span className="px-1.5 py-0.5 rounded bg-cyan-950/60 border border-cyan-800/50 text-cyan-300 text-[11px]">
                                      {item.formationName}
                                    </span>
                                  )}
                                  {item.note && (
                                    <span className="italic text-slate-400">
                                      "{item.note}"
                                    </span>
                                  )}
                                  {item.telegramError && (
                                    <span className="text-rose-400 text-[11px]">
                                      {tr('Помилка:')} {item.telegramError}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Right Actions */}
                          <div className="flex items-center gap-2 self-end sm:self-center shrink-0 pt-1 sm:pt-0">
                            <button
                              type="button"
                              onClick={() => handleReactivateAlert(item)}
                              disabled={isReactivating}
                              className="px-2.5 py-1.5 rounded-lg bg-sky-600/20 hover:bg-sky-600/30 text-sky-300 border border-sky-500/30 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                              title={tr("Відновити це сповіщення знову")}
                            >
                              <RotateCcw className={`w-3.5 h-3.5 ${isReactivating ? 'animate-spin' : ''}`} />
                              <span>{tr(isReactivating ? 'Відновлення...' : 'Відновити')}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteHistoryItem(item.id)}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-slate-700/60 hover:border-rose-500/30 transition-all cursor-pointer"
                              title={tr("Видалити з історії")}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* TAB 2: TELEGRAM BOT SETUP & CRON SYSTEM */}
          {activeTab === 'settings' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-950/90 border border-slate-800 space-y-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2"><Send className="w-4 h-4 text-cyan-400" />{tr('Ваш Telegram')}</h3>
                <p className="text-xs text-slate-300">{tr('Підключіть свій Telegram, відкрийте бота й натисніть Start. Сервер надсилатиме тільки ваші сповіщення, навіть коли сайт закрито.')}</p>
                <p className="text-xs text-slate-400">{loadingTgStatus && !tgStatus ? tr('Перевіряємо підключення…') : tgStatus?.isConfigured ? `${tr('Підключено')} · @${tgStatus.botUsername || 'Telegram'}` : tr('Telegram ще не підключено')}</p>
                <div className="flex gap-2 flex-wrap">
                  <button type="button" onClick={handleConnectTelegram} disabled={connecting} className="px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 text-xs font-semibold disabled:opacity-50">{connecting ? tr('Готуємо посилання…') : tgStatus?.isConfigured ? tr('Підключити інший Telegram') : tr('Підключити Telegram')}</button>
                  {tgStatus?.isConfigured && <>
                    <button type="button" onClick={handleTestTelegram} disabled={testingCron} className="px-4 py-2 rounded-lg bg-slate-800 text-white text-xs">{tr('Надіслати тест')}</button>
                    <button type="button" onClick={handleDisconnectTelegram} className="px-4 py-2 rounded-lg text-rose-300 text-xs">{tr('Відключити')}</button>
                  </>}
                </div>
                {connectUrl && <div className="p-3 rounded-lg bg-cyan-500/10 border border-cyan-500/20 space-y-2">
                  <a href={connectUrl} target="_blank" rel="noopener noreferrer" className="text-cyan-300 text-sm font-semibold inline-flex gap-2 items-center">{tr('Відкрити бота в Telegram')}<ExternalLink className="w-4 h-4" /></a>
                  <p className="text-xs text-slate-300">{tr('Натисніть Start у чаті. Підключення з’явиться тут автоматично. Посилання діє 10 хвилин.')}</p>
                </div>}
                {testResult && <p role="status" className={`text-xs ${testResult.success ? 'text-emerald-300' : 'text-rose-300'}`}>{testResult.message}</p>}
              </div>
              <div className="p-4 rounded-xl bg-slate-950/90 border border-slate-800 space-y-3">
                <h3 className="text-sm font-bold text-white">{tr('Фоновий моніторинг')}</h3>
                <p className="text-xs text-slate-300">{tr('Цінові правила перевіряються кожні 5 секунд. Стеження за монетами відновлюється після перезапуску сервера. Тимчасові помилки доставки повторюються автоматично.')}</p>
                <p className={`text-xs ${cronStatus?.isHealthy ? 'text-emerald-300' : 'text-amber-300'}`}>{cronStatus ? cronStatus.isHealthy ? tr('Моніторинг працює') : tr('Потрібна перевірка моніторингу') : tr('Перевіряємо стан сервера…')}</p>
                {cronStatus && <p className="text-xs text-slate-400">{tr('Активних цінових правил')}: {cronStatus.stats?.activeAlertsCount || 0} · {tr('Монет на стеженні')}: {cronStatus.stats?.surveillanceCoinsMonitored || 0}</p>}
                {cronStatus?.delivery?.pending > 0 && <p className="text-xs text-amber-300">{tr('Очікує доставки')}: {cronStatus.delivery.pending}</p>}
                {cronStatus?.delivery?.failed > 0 && <p className="text-xs text-rose-300">{tr('Не доставлено')}: {cronStatus.delivery.failed} · {cronStatus.delivery.lastError}</p>}
                {cronStatus?.telegramPolling?.lastError && <p className="text-xs text-amber-300">{tr('Підключення Telegram тимчасово недоступне. Адміністратор має перевірити бота.')}</p>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

