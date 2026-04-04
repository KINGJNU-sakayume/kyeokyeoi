import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Capture Android Chrome install prompt for later use (e.g. an install button in SettingsTab)
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  (window as Window & { _deferredInstallPrompt?: Event })._deferredInstallPrompt = e;
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
