import { installAuthenticatedFetch } from './utils/authenticatedFetch';
import { installMarketTransport } from './utils/marketTransport';
import {StrictMode, useEffect, useState} from 'react';
import { PasswordResetPage } from './components/PasswordResetPage';
import { FirebasePasswordResetPage } from './components/FirebasePasswordResetPage';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { AuthProvider } from './context/AuthContext';
import { AlertsProvider } from './context/AlertsContext';
import { ArchiveProvider } from './context/ArchiveContext';
import { SurveillanceProvider } from './context/SurveillanceContext';
import { LanguageProvider } from './context/LanguageContext';
import { AccessProvider, useAccess } from './context/AccessContext';
import { RegistrationGate } from './components/AccessPanel';

// Firebase password action links use query parameters. Capture once at page
// startup and remove the bearer code from browser history before React loads.
const firebaseResetRequest = (() => {
  const query = new URLSearchParams(window.location.search);
  if (query.get('mode') !== 'resetPassword') return null;
  const code = query.get('oobCode');
  if (!code || code.length > 4096) return null;
  const apiKey = query.get('apiKey');
  const clean = new URL(window.location.href);
  for (const key of ['mode', 'oobCode', 'apiKey', 'continueUrl', 'lang'])
    clean.searchParams.delete(key);
  window.history.replaceState(window.history.state, '', clean.pathname + clean.search + '#firebase-reset');
  return { code, apiKey };
})();

installAuthenticatedFetch();
installMarketTransport();

function AccountApplication() {
  const { hasFullAccess } = useAccess();
  return <AlertsProvider enabled={hasFullAccess}><ArchiveProvider enabled={hasFullAccess}><SurveillanceProvider enabled={hasFullAccess}><App /></SurveillanceProvider></ArchiveProvider></AlertsProvider>;
}

function RouteEntry() {
  const readResetToken = () => {
    const found = window.location.hash.match(/^#reset-password\/([A-Za-z0-9_-]{43})$/);
    return found ? found[1] : null;
  };
  const [resetToken, setResetToken] = useState<string | null>(readResetToken);
  useEffect(() => {
    const onHashChange = () => setResetToken(readResetToken());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
  if (firebaseResetRequest) return <FirebasePasswordResetPage code={firebaseResetRequest.code} emailLinkApiKey={firebaseResetRequest.apiKey} />;
  if (resetToken) return <PasswordResetPage token={resetToken} />;
  return <RegistrationGate><AccountApplication /></RegistrationGate>;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <AccessProvider>
        <LanguageProvider>
          <RouteEntry />
        </LanguageProvider>
      </AccessProvider>
    </AuthProvider>
  </StrictMode>,
);

