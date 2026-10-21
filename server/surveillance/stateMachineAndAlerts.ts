import { SetupInstance, ThirdTouchTracker, DensityItem, OISnapshot } from './types';
import { notificationOutbox } from '../notificationOutbox';
import { getUserTelegram } from '../alertService';
import { notificationRouter, NotificationSource } from '../notificationRouter';
import { normalizeLanguage, telegramText, type SupportedLanguage } from '../../src/locales';

function formatCryptoPrice(val: number): string {
  if (!val && val !== 0) return '0.00';
  if (val >= 1000) return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (val >= 1) return val.toFixed(4);
  if (val >= 0.0001) return val.toFixed(6);
  return val.toFixed(8);
}

export interface AlertScope {
  userId: string;
  coinId?: string;
  symbol: string;
  exchange: string;
  marketType: string;
  source?: NotificationSource;
}

export class StateMachineAndAlerts {
  public canSendAlert(
    key: string,
    eventType: string,
    customCooldownMs?: number,
    scope?: AlertScope
  ): boolean {
    if (scope) {
      const scopedKey = notificationRouter.buildScopedKey({
        source: scope.source || 'SURVEILLANCE',
        userId: scope.userId,
        coinId: scope.coinId,
        symbol: scope.symbol,
        exchange: scope.exchange,
        marketType: scope.marketType,
        eventType,
        eventIdentity: key,
      });

      const res = notificationRouter.shouldNotify({
        source: scope.source || 'SURVEILLANCE',
        userId: scope.userId,
        coinId: scope.coinId,
        symbol: scope.symbol,
        exchange: scope.exchange,
        marketType: scope.marketType,
        eventType,
        eventIdentity: key,
        customCooldownMs,
      });

      if (res.allowed) {
        notificationRouter.recordAlertSent(scopedKey, Date.now());
        return true;
      }
      return false;
    }

    // Fallback un-scoped check via notificationRouter
    const scopedKey = `GLOBAL:${key}`;
    const now = Date.now();
    const last = notificationRouter.getLastAlertTime(scopedKey);
    const cooldown = customCooldownMs !== undefined ? customCooldownMs : 15 * 60 * 1000;
    if (now - last >= cooldown) {
      notificationRouter.recordAlertSent(scopedKey, now);
      return true;
    }
    return false;
  }

  public recordAlertSent(key: string, timestamp = Date.now(), scope?: AlertScope) {
    if (scope) {
      const scopedKey = notificationRouter.buildScopedKey({
        source: scope.source || 'SURVEILLANCE',
        userId: scope.userId,
        coinId: scope.coinId,
        symbol: scope.symbol,
        exchange: scope.exchange,
        marketType: scope.marketType,
        eventType: 'GENERAL',
        eventIdentity: key,
      });
      notificationRouter.recordAlertSent(scopedKey, timestamp);
    } else {
      notificationRouter.recordAlertSent(`GLOBAL:${key}`, timestamp);
    }
  }

  public getLastAlertTime(key: string, scope?: AlertScope): number {
    if (scope) {
      const scopedKey = notificationRouter.buildScopedKey({
        source: scope.source || 'SURVEILLANCE',
        userId: scope.userId,
        coinId: scope.coinId,
        symbol: scope.symbol,
        exchange: scope.exchange,
        marketType: scope.marketType,
        eventType: 'GENERAL',
        eventIdentity: key,
      });
      return notificationRouter.getLastAlertTime(scopedKey);
    }
    return notificationRouter.getLastAlertTime(`GLOBAL:${key}`);
  }

  // Telegram Support Retest formatted message (#83)
  public formatSupportRetestMessage(
    setup: SetupInstance,
    currentPrice: number,
    language: SupportedLanguage = 'uk'
  ): string {
    const selectedLanguage = normalizeLanguage(language);
    const entry = setup.preferredEntry || (setup.entryZone.low + setup.entryZone.high) / 2;
    return telegramText(selectedLanguage, 'supportRetest', {
      stageLabel: telegramText(selectedLanguage, setup.stage === 'CONFIRMED' ? 'stageConfirmed' : 'stageWatch'),
      symbol: setup.symbol,
      exchange: setup.exchange.toUpperCase(),
      marketLabel: telegramText(selectedLanguage, setup.marketType === 'futures' ? 'marketFutures' : 'marketSpot'),
      currentPrice: formatCryptoPrice(currentPrice),
      zoneLow: formatCryptoPrice(setup.entryZone.low),
      zoneHigh: formatCryptoPrice(setup.entryZone.high),
      entry: formatCryptoPrice(entry),
      levelStrength: setup.evidence.levelStrength,
      stage: setup.stage,
      htf: setup.evidence.htfStructure,
      waitingFor: setup.waitingFor,
      density: setup.evidence.densityPresence,
      oi: setup.evidence.oiContext,
      btc: setup.evidence.btcContext,
      formation: setup.evidence.formationScore > 0 ? `${setup.evidence.formationScore}/100` : telegramText(selectedLanguage, 'compression'),
      confirmations: setup.confirmations.map((item) => `• ✓ ${item}`).join('\n') || telegramText(selectedLanguage, 'waiting'),
      stop: formatCryptoPrice(setup.invalidationPrice),
      target: formatCryptoPrice(setup.targetPrice),
      confluence: setup.confluenceScore,
    });
  }

  // Telegram Resistance Retest / Rejection formatted message (SHORT)
  public formatResistanceRetestMessage(
    setup: SetupInstance,
    currentPrice: number,
    language: SupportedLanguage = 'uk'
  ): string {
    const selectedLanguage = normalizeLanguage(language);
    const entry = setup.preferredEntry || (setup.entryZone.low + setup.entryZone.high) / 2;
    return telegramText(selectedLanguage, 'resistanceRetest', {
      stageLabel: telegramText(selectedLanguage, setup.stage === 'CONFIRMED' ? 'stageConfirmed' : 'stageWatch'),
      symbol: setup.symbol,
      exchange: setup.exchange.toUpperCase(),
      marketLabel: telegramText(selectedLanguage, setup.marketType === 'futures' ? 'marketFutures' : 'marketSpot'),
      currentPrice: formatCryptoPrice(currentPrice),
      zoneLow: formatCryptoPrice(setup.entryZone.low),
      zoneHigh: formatCryptoPrice(setup.entryZone.high),
      entry: formatCryptoPrice(entry),
      levelStrength: setup.evidence.levelStrength,
      stage: setup.stage,
      htf: setup.evidence.htfStructure,
      waitingFor: setup.waitingFor,
      density: setup.evidence.densityPresence,
      oi: setup.evidence.oiContext,
      btc: setup.evidence.btcContext,
      formation: setup.evidence.formationScore > 0 ? `${setup.evidence.formationScore}/100` : telegramText(selectedLanguage, 'compression'),
      confirmations: setup.confirmations.map((item) => `• ✓ ${item}`).join('\n') || telegramText(selectedLanguage, 'waiting'),
      stop: formatCryptoPrice(setup.invalidationPrice),
      target: formatCryptoPrice(setup.targetPrice),
      confluence: setup.confluenceScore,
    });
  }

  // Telegram Breakout Retest message (LONG or SHORT)
  public formatBreakoutRetestMessage(
    setup: SetupInstance,
    currentPrice: number,
    language: SupportedLanguage = 'uk'
  ): string {
    const selectedLanguage = normalizeLanguage(language);
    const entry = setup.preferredEntry || (setup.entryZone.low + setup.entryZone.high) / 2;
    return telegramText(selectedLanguage, 'breakoutRetest', {
      icon: setup.direction === 'LONG' ? '🟢' : '🔴',
      stageLabel: telegramText(selectedLanguage, setup.stage === 'CONFIRMED' ? 'stageConfirmed' : 'stageWatch'),
      direction: setup.direction,
      symbol: setup.symbol,
      exchange: setup.exchange.toUpperCase(),
      marketLabel: telegramText(selectedLanguage, setup.marketType === 'futures' ? 'marketFutures' : 'marketSpot'),
      currentPrice: formatCryptoPrice(currentPrice),
      zoneLow: formatCryptoPrice(setup.entryZone.low),
      zoneHigh: formatCryptoPrice(setup.entryZone.high),
      entry: formatCryptoPrice(entry),
      stage: setup.stage,
      htf: setup.evidence.htfStructure,
      density: setup.evidence.densityPresence,
      oi: setup.evidence.oiContext,
      btc: setup.evidence.btcContext,
      stop: formatCryptoPrice(setup.invalidationPrice),
      target: formatCryptoPrice(setup.targetPrice),
      confluence: setup.confluenceScore,
    });
  }

  // Telegram Formation Setup message
  public formatFormationSetupMessage(
    setup: SetupInstance,
    currentPrice: number,
    language: SupportedLanguage = 'uk'
  ): string {
    const selectedLanguage = normalizeLanguage(language);
    const entry = setup.preferredEntry || (setup.entryZone.low + setup.entryZone.high) / 2;
    return telegramText(selectedLanguage, 'formationSetup', {
      icon: setup.direction === 'LONG' ? '🟢' : '🔴',
      stageLabel: telegramText(selectedLanguage, setup.stage === 'CONFIRMED' ? 'stageConfirmed' : 'stageWatch'),
      direction: setup.direction,
      symbol: setup.symbol,
      exchange: setup.exchange.toUpperCase(),
      marketLabel: telegramText(selectedLanguage, setup.marketType === 'futures' ? 'marketFutures' : 'marketSpot'),
      currentPrice: formatCryptoPrice(currentPrice),
      zoneLow: formatCryptoPrice(setup.entryZone.low),
      zoneHigh: formatCryptoPrice(setup.entryZone.high),
      entry: formatCryptoPrice(entry),
      formationScore: setup.evidence.formationScore,
      stop: formatCryptoPrice(setup.invalidationPrice),
      target: formatCryptoPrice(setup.targetPrice),
      confluence: setup.confluenceScore,
      stage: setup.stage,
    });
  }

  // Master helper routing to the correct specialized formatter
  public formatSetupAlertMessage(
    setup: SetupInstance,
    currentPrice: number,
    alertType: string,
    language: SupportedLanguage = 'uk'
  ): string {
    switch (alertType) {
      case 'RESISTANCE_RETEST_CONFIRMED':
        return this.formatResistanceRetestMessage(setup, currentPrice, language);
      case 'BREAKOUT_CONFIRMED':
        return this.formatBreakoutRetestMessage(setup, currentPrice, language);
      case 'FORMATION_SETUP_CONFIRMED':
        return this.formatFormationSetupMessage(setup, currentPrice, language);
      case 'SUPPORT_RETEST_CONFIRMED':
      default:
        return this.formatSupportRetestMessage(setup, currentPrice, language);
    }
  }

  // Telegram Third Touch message (#84)
  public formatThirdTouchMessage(
    item: ThirdTouchTracker,
    symbol: string,
    exchange: string,
    currentPrice: number,
    language: SupportedLanguage = 'uk'
  ): string {
    const selectedLanguage = normalizeLanguage(language);
    return telegramText(selectedLanguage, 'thirdTouch', {
      state: item.state === 'ACTIVE' ? 'ACTIVE' : 'APPROACHING',
      symbol,
      exchange: exchange.toUpperCase(),
      levelType: item.levelType,
      levelPrice: formatCryptoPrice(item.price),
      currentPrice: formatCryptoPrice(currentPrice),
      distance: item.distancePct,
      speed: item.approachSpeed,
      touches: item.touchCount,
      compression: telegramText(selectedLanguage, item.compression ? 'compressionYes' : 'compressionNo'),
      askLine: item.askDensityUsd ? `\n<b>Ask Density:</b> $${(item.askDensityUsd / 1000000).toFixed(2)}M` : '',
      bidLine: item.bidDensityUsd ? `\n<b>Bid Density:</b> $${(item.bidDensityUsd / 1000000).toFixed(2)}M` : '',
    });
  }

  // Telegram Density appeared message (#14)
  public formatDensityAppearedMessage(
    density: DensityItem,
    symbol: string,
    exchange: string,
    language: SupportedLanguage = 'uk'
  ): string {
    return telegramText(normalizeLanguage(language), 'densityAppeared', {
      symbol,
      exchange: exchange.toUpperCase(),
      side: density.side,
      price: formatCryptoPrice(density.price),
      volume: (density.notionalUsd / 1000000).toFixed(2),
      distance: density.distancePct,
      quality: density.qualityScore,
    });
  }

  // Telegram Density persistent message (#85)
  public formatDensityMessage(
    density: DensityItem,
    symbol: string,
    exchange: string,
    language: SupportedLanguage = 'uk'
  ): string {
    const selectedLanguage = normalizeLanguage(language);
    return telegramText(selectedLanguage, 'densityPersistent', {
      symbol,
      exchange: exchange.toUpperCase(),
      side: density.side,
      price: formatCryptoPrice(density.price),
      volume: (density.notionalUsd / 1000000).toFixed(2),
      distance: density.distancePct,
      duration: `${Math.floor(density.ageSeconds / 60)}${telegramText(selectedLanguage, 'minutesShort')} ${density.ageSeconds % 60}${telegramText(selectedLanguage, 'secondsShort')}`,
      classification: density.classification,
      quality: density.qualityScore,
    });
  }

  // Telegram OI message (#86)
  public formatOIMessage(
    oi: OISnapshot,
    symbol: string,
    currentPrice: number,
    language: SupportedLanguage = 'uk'
  ): string {
    return telegramText(normalizeLanguage(language), 'oiAnomaly', {
      symbol,
      change: `${oi.change15mPct >= 0 ? '+' : ''}${oi.change15mPct}`,
      oi: (oi.currentUsd / 1000000).toFixed(2),
      price: formatCryptoPrice(currentPrice),
      regime: oi.regime,
    });
  }

  // Telegram Structure message (#88)
  public formatStructureMessage(
    symbol: string,
    tf: string,
    eventName: string,
    price: number,
    language: SupportedLanguage = 'uk'
  ): string {
    return telegramText(normalizeLanguage(language), 'structureShift', {
      symbol,
      timeframe: tf.toUpperCase(),
      event: eventName,
      price: formatCryptoPrice(price),
    });
  }

  // Dispatch alert to user Telegram
  public async dispatchAlert(userId: string, htmlMessage: string, enabled = true) {
    if (!enabled) return;
    const userTg = getUserTelegram(userId);
    if (!userTg?.botToken || !userTg?.chatId) return;
    try {
      notificationOutbox.enqueue({ userId, htmlMessage });
      await notificationOutbox.drain();
    } catch (e) {
      console.error(`[AlertDispatcher] Error sending Telegram message to user ${userId}:`, e);
    }
  }
}

