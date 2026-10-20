import React from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from '../../src/context/AuthContext';
import { ScalperDOMWidget } from '../../src/components/terminal/ScalperDOMWidget';
import '../../src/index.css';

const params = new URLSearchParams(window.location.search);
const exchange = params.get('exchange') === 'bybit' ? 'bybit' : 'binance';
const marketType = params.get('marketType') === 'spot' ? 'spot' : 'futures';
const symbol = params.get('symbol') || 'BTCUSDT';
createRoot(document.getElementById('root')).render(
  <AuthProvider>
    <ScalperDOMWidget
      symbol={symbol} baseAsset="BTC" quoteAsset="USDT"
      exchange={exchange} marketType={marketType}
      currentPrice={0} initialCompression={1} initialDepth="all"
      initialTimeframe="1m" initialSoundAlert={false}
      height="100%"
    />
  </AuthProvider>,
);
