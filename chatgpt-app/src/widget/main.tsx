import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.js';
import './styles.css';

const root = document.getElementById('koki-root');
if (!root) throw new Error('KOKI_ROOT_MISSING');

createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
