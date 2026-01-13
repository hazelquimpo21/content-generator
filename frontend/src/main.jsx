/**
 * ============================================================================
 * MAIN ENTRY POINT
 * ============================================================================
 * React application entry point. Mounts the App component to the DOM.
 * ============================================================================
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';

// Import global styles
import './styles/global.css';

// Mount the application
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
