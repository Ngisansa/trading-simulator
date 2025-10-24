import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';

// CRITICAL FIX 1: Imports the mock configuration for Firebase.
// This resolves the "Database Error: Firebase configuration is missing" message.
import './globals.js';

// CRITICAL FIX 2: Ensures both CSS files, including the one with the Tailwind directives, are loaded.
// This resolves the "Poor styling" issue.
import './index.css';
import './App.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
