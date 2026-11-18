import type { LocalizedGuides } from './guideTypes.ts';

export const en: LocalizedGuides = {
  languageNavigation: 'Page language',
  breadcrumbNavigation: 'Guide navigation',
  moreGuides: 'More h00k tools and guides',
  screener: 'Crypto Screener',
  terms: 'Terms of Use',
  privacy: 'Privacy Policy',
  pages: {
    scalping: {
      label: 'Crypto scalping',
      title: 'Crypto Scalping Screener for Binance and Bybit',
      description: 'Find active crypto pairs by trading volume and volatility. Inspect short timeframes, order-book depth and executed trades in HookChart.',
      heading: 'Crypto screener for scalping',
      lead: 'Use h00k to narrow the Binance or Bybit market to a short list of active pairs, then open HookChart to inspect what is happening on each one.',
      open: 'Open the screener',
      sections: [
        {
          heading: 'Find active crypto pairs by volume and volatility',
          text: 'Select Binance or Bybit and choose spot or futures. Set the screener’s 24-hour volume filter to “from” and enter a threshold to focus on more actively traded pairs. Sort by volatility and open a 5-minute chart to see when a move occurred. Daily trading volume and a short-term price range describe different aspects of activity.',
        },
        {
          heading: 'Short timeframes and order-book depth',
          text: 'Check recent candles, bar volume and nearby price levels. Where available, order-book depth shows resting bids and asks. The large-trade totals below candles show executed market buys and sells above the configured threshold. The separate Liq markers show reported forced position closures.',
        },
        {
          heading: 'A watchlist for the next session',
          text: 'Try sorting futures from one exchange by volume. Open a few active pairs on 5-minute charts and compare how price behaves near each local range. Keep the pairs you want to watch side by side in the Terminal.',
        },
      ],
      related: ['hookchart', 'terminal', 'liquidations', 'day-trading'],
    },
    'day-trading': {
      label: 'Crypto day trading',
      title: 'Crypto Day Trading Tools and Market Replay',
      description: 'Build an intraday watchlist, compare timeframes in the h00k Terminal and review past trading sessions candle by candle with Market Replay.',
      heading: 'Tools for crypto day trading',
      lead: 'Build a list of pairs for the session, mark useful levels on a higher timeframe and keep the charts you are following together in the Terminal.',
      open: 'Open Market Replay',
      sections: [
        {
          heading: 'Build a list before the session',
          text: 'Look at 24-hour volume and price change in the screener. Open interesting pairs on an hourly chart and mark their current ranges. Check the selected exchange and market. Spot and perpetual futures for the same symbol have their own prices.',
        },
        {
          heading: 'Put hourly context beside the intraday chart',
          text: 'Add the same pair twice in the Terminal with different timeframes. For example, keep a one-hour chart for the session range and a 15-minute chart for candles around a marked level. If you want a reminder when price reaches that level, create an alert with the appropriate threshold condition.',
        },
        {
          heading: 'Review a session in Market Replay',
          text: 'Choose a pair and a historical starting point. Advance one candle at a time, mark the levels you see and revisit your notes after the move develops. You can compare your reading of the chart with the information that was available at each step.',
        },
      ],
      related: ['terminal', 'crypto-patterns', 'market-replay', 'alerts'],
    },
    hookchart: {
      label: 'HookChart',
      title: 'HookChart Crypto Charts for Binance and Bybit',
      description: 'Explore crypto candlestick charts with drawing tools, volume, order-book depth, open interest and liquidations where data is available.',
      heading: 'HookChart candlestick charts for crypto',
      lead: 'HookChart is the charting tool built into h00k. Sign in and open a pair from the screener to inspect its price history, draw levels and review the available market data.',
      open: 'Find a pair in the screener',
      sections: [
        {
          heading: 'Mark levels on the chart',
          text: 'Use the crosshair to read a candle’s time and price. Open the drawing toolbar to add a horizontal level or trend line. Expand the chart when you need more room for the price history and your drawings.',
        },
        {
          heading: 'Trade volume, market depth and liquidations',
          text: 'Candle volume shows how much traded during an interval. Large-trade totals show executed market buys and sells above the configured threshold. Liq markers represent reported forced closures of long or short positions. Modeled liquidation zones, where available, estimate levels where liquidations could occur.',
        },
        {
          heading: 'Open interest (OI) on futures charts',
          text: 'Open interest describes outstanding contracts in a futures market. Depth, liquidation markers and other overlays depend on the exchange and instrument. If a chart shows candle volume but has no open interest value, first check whether you are looking at spot or futures.',
        },
      ],
      related: ['scalping', 'crypto-patterns', 'liquidations', 'terminal'],
    },
    'crypto-patterns': {
      label: 'Crypto chart patterns',
      title: 'Crypto Chart Pattern Scanner for W and M',
      description: 'Scan for double bottoms and double tops, review early W/M candidates and inspect the neckline and scenario levels in HookChart.',
      heading: 'Scan crypto markets for W and M chart patterns',
      lead: 'Sign in and open Patterns to look for double bottoms (W) and double tops (M). Choose an exchange, market and timeframe to review candidates for the instruments you follow.',
      open: 'Open Patterns',
      sections: [
        {
          heading: 'Double bottom (W) and double top (M)',
          text: 'A W has two lows separated by a local high. An M has two highs separated by a local low. The middle swing defines the neckline. Open the chart to see how candles and volume behave near that level, including whether price revisits it after a break.',
        },
        {
          heading: 'Review regular scans and early candidates',
          text: 'The regular scan shows detected structures and their scores. Early W/M detection runs separately on closed candles to surface possible patterns before a confirmed breakout. Its chart preview shows the neckline and the levels calculated for that scenario.',
        },
        {
          heading: 'Inspect the signal on the chart',
          text: 'Open a candidate in HookChart and compare the drawing with the candle sequence. Check the exchange, timeframe and available data. Use the score to compare structures. The entry, stop and target levels describe the calculated scenario.',
        },
        {
          heading: 'Open interest, volume delta and CVD',
          text: 'In the regular Patterns view, the change in open interest (OI) tracks outstanding futures contracts. Volume delta compares aggressive buying and selling on the last closed candle. Cumulative volume delta (CVD) aggregates delta across 20 closed candles. The delta and CVD filters in this view use Binance spot or futures data.',
        },
      ],
      related: ['hookchart', 'day-trading', 'market-replay', 'alerts'],
    },
    terminal: {
      label: 'Multi-chart Terminal',
      title: 'Multi-Chart Crypto Terminal with HookChart',
      description: 'Monitor Binance and Bybit charts in one workspace. Compare pairs, exchanges and timeframes in a configurable h00k Terminal grid.',
      heading: 'Multi-chart crypto Terminal',
      lead: 'Keep several HookChart views on one screen. Compare markets side by side, or use multiple timeframes for the same pair.',
      open: 'Open the Terminal',
      sections: [
        {
          heading: 'Build a grid of instruments',
          text: 'Sign in, open the Terminal and use the coin picker to add charts. Each block has its own exchange, market and timeframe. For example, you can watch Binance Futures BTCUSDT alongside a pair from Bybit.',
        },
        {
          heading: 'Compare the same interval across charts',
          text: 'Select the same timeframe in two blocks to compare candle sequences. To see a move in context, add the same pair twice and use a 5-minute chart in one block and a one-hour chart in the other. Use the fit control to frame the candles in the visible area.',
        },
        {
          heading: 'Set up a workspace for later',
          text: 'Move frequently watched charts into the part of the grid you look at most, or start from an available layout. Keep the pairs you revisit in your favorites so you can find them quickly in another session.',
        },
      ],
      related: ['hookchart', 'scalping', 'day-trading'],
    },
    alerts: {
      label: 'Crypto price alerts',
      title: 'Telegram Crypto Price Alerts for Binance and Bybit',
      description: 'Set a price threshold for a crypto pair, connect Telegram in h00k and review alert triggers and delivery status in your history.',
      heading: 'Crypto price alerts on Telegram',
      lead: 'Create an alert for a price you want to follow on Binance or Bybit. Sign in to set up thresholds and connect your Telegram chat.',
      open: 'Open the screener',
      sections: [
        {
          heading: 'Set an instrument and a threshold',
          text: 'Open the alerts menu in the h00k header. Select the exchange, spot or futures market, symbol and target price. Use “at or above” for an upper threshold and “at or below” for a lower threshold. To monitor both sides of a range, create two alerts.',
        },
        {
          heading: 'Connect Telegram and check the alert history',
          text: 'Follow the Telegram connection instructions in h00k and confirm that your chat is connected. After an alert triggers, the history shows the recorded price and time. You can also check whether delivery succeeded or is awaiting another attempt.',
        },
        {
          heading: 'Choose between price thresholds and market events',
          text: 'A price alert watches one level for one instrument. SignalHook monitors selected event types for the coins you add to it. When a notification arrives, open the corresponding market in HookChart to review the candles around the event.',
        },
        {
          heading: 'Browser notifications on h00k',
          text: 'Select the bell in the header to open the site notification center. In its settings, choose categories such as triggered price alerts or liquidation events, and enable sound if you use it. Telegram delivery is configured in the price alerts menu.',
        },
      ],
      related: ['hookchart', 'day-trading', 'crypto-patterns'],
    },
    'market-replay': {
      label: 'Market Replay simulator',
      title: 'Crypto Bar Replay and Trading Simulator',
      description: 'Replay Binance and Bybit candlesticks on historical charts. Practice manual backtesting in Market Replay with simulated orders and balances.',
      heading: 'Crypto Bar Replay and trading simulator',
      lead: 'Pick a historical date and replay the chart at your own pace. Market Replay lets you test a trading idea on past crypto candles with virtual orders.',
      open: 'Open Market Replay',
      sections: [
        {
          heading: 'Start Bar Replay on a historical crypto chart',
          text: 'Select an exchange, market, pair, timeframe and start date in Market Replay. After the historical candles load, play the replay at the speed you choose or advance one candle at a time to reveal how the move unfolded.',
        },
        {
          heading: 'Set virtual orders, fees and slippage',
          text: 'Configure the simulated balance, fees and slippage. Place a virtual order and review how your stop and target levels would have behaved in that session. Use the simulation history to compare the executions in the exercise.',
        },
        {
          heading: 'Practice a breakout scenario on past candles',
          text: 'Pause near a local range and mark its boundaries. Reveal the next candles individually. Then try the same exercise on another date with the same fee and slippage settings to compare the two sessions.',
        },
      ],
      related: ['day-trading', 'hookchart', 'crypto-patterns', 'scalping'],
    },
    liquidations: {
      label: 'Crypto liquidation heatmap',
      title: 'Binance and Bybit Crypto Liquidation Heatmap',
      description: 'Explore long and short liquidation markers on futures charts and the HookChart heatmap of reported events for 24 hours or 7 days.',
      heading: 'Crypto liquidation heatmap in HookChart',
      lead: 'HookChart displays reported liquidation events on Binance and Bybit futures charts. Open the Liq heatmap to compare past events with the chart’s price range.',
      open: 'Find a futures pair',
      sections: [
        {
          heading: 'Long and short liquidations on futures charts',
          text: 'The L and S markers represent reported forced closures of long and short positions. HookChart settings let you switch each side on or off and set its own minimum display amount.',
        },
        {
          heading: 'Read the liquidation heatmap',
          text: 'Open the futures pair and select the map icon. When archive data is available, switch between 24 hours and 7 days. Brighter price bands represent a larger total value of reported events in those bands. Check the coverage status when the map shows a partial dataset.',
        },
        {
          heading: 'Reported events and modeled liquidation zones',
          text: 'The Liq archive groups past exchange events by price. Optional modeled zones use recurring patterns in the recorded history when sufficient data is available. When reviewing a past move, read the reported liquidations alongside candles and volume for the same period.',
        },
      ],
      related: ['hookchart', 'scalping', 'alerts'],
    },
  },
};
