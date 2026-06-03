/**
 * React App Entry Point
 * Mounts React app to DOM
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

console.log('🚀 Badge System - Initializing...');
console.log('🔍 Root element:', document.getElementById('root'));

const rootElement = document.getElementById('root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
  console.log('✅ App rendered successfully');
} else {
  console.error('❌ Root element not found!');
}
