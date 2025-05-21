import React from 'react';
import ReactDOM from 'react-dom/client';
// Hapus import SipProvider karena kita tidak menggunakan react-sip lagi
// import { SipProvider } from 'react-sip'; 
import App from './App.jsx';
import './index.css';

// Konfigurasi SIP tidak lagi di sini, akan pindah ke App.jsx atau komponen khusus

// --- Render Aplikasi --- 
// Render App secara langsung tanpa SipProvider
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
