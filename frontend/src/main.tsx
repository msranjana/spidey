import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import InvestigationHistory from './components/InvestigationHistory';
import './components/InvestigationHistory.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

createRoot(root).render(
  <StrictMode>
    <div className="app-shell">
      <InvestigationHistory />
      <App />
    </div>
  </StrictMode>,
);
