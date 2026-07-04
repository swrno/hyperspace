import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import App from './App';
import NotFound from './NotFound';
import './index.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<App />} />
        <Route path="/" element={<App />} />
        <Route path="/app" element={<App />} />
        <Route path="/app/:appId" element={<App />} />
        <Route path="/kb" element={<App />} />
        <Route path="/kb/:kbId" element={<App />} />
        <Route path="/integration" element={<App />} />
        <Route path="/keys" element={<App />} />
        <Route path="/c/:chatId" element={<App />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
