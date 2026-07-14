import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './auth';
import { WipeProvider } from './wipe';
import './global.css';

/* Provider order matters:
 *   BrowserRouter — WipeProvider calls useNavigate, so it must sit inside a router
 *   AuthProvider  — restores the session from the httpOnly refresh cookie on boot
 *   WipeProvider  — owns the transition overlay and the wipe-aware navigate
 */
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <WipeProvider>
          <App accentColor="#EDEDED" marketTempo="normal" ambientMotion={true} />
        </WipeProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
