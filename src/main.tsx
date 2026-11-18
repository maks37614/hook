import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { LegalPage } from './components/LegalPage';
import './index.css';
import './components/replay/replayCoinPicker.css';
import './components/terminal/addChartModal.css';
import './components/fullscreen/fullscreenMultiChart.css';
import './components/watchlistDrawer.css';
import './styles/visualQuality.css';
import './styles/interfacePolish.css';
import './styles/dialogQuality.css';
import './styles/accessibilityControls.css';
// Keep the iOS focus-zoom safeguard last so component typography cannot override it.
import './styles/mobileInputFocus.css';
import { AuthProvider } from './context/AuthContext';
import { AlertsProvider } from './context/AlertsContext';
import { ArchiveProvider } from './context/ArchiveContext';
import { SurveillanceProvider } from './context/SurveillanceContext';
import { LanguageProvider } from './context/LanguageContext';
import { TelegramProvider } from './context/TelegramContext';
import { SiteNotificationsProvider } from './context/SiteNotificationsContext';
import { installChunkRecovery } from './utils/chunkRecovery';
import { initializeSiteAppearance } from './utils/siteAppearance';

installChunkRecovery(window);
initializeSiteAppearance();

const legalPath = window.location.pathname.replace(/\/+$/, '');
const publicLegalPage = legalPath === '/terms' ? 'terms' : legalPath === '/privacy' ? 'privacy' : null;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      {publicLegalPage ? (
        // Keep the account appearance without starting market or alert providers.
        <LanguageProvider>
          <LegalPage page={publicLegalPage} />
        </LanguageProvider>
      ) : (
        <AlertsProvider>
          <ArchiveProvider>
            <SurveillanceProvider>
              <LanguageProvider>
                <TelegramProvider>
                  <SiteNotificationsProvider>
                    <App />
                  </SiteNotificationsProvider>
                </TelegramProvider>
              </LanguageProvider>
            </SurveillanceProvider>
          </ArchiveProvider>
        </AlertsProvider>
      )}
    </AuthProvider>
  </StrictMode>,
);
