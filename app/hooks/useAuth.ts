import { useState, useEffect } from 'react';
import { apiUrl, isNativeApp, getServerUrl } from '@/lib/mobileConfig';

export function useAuth() {
  const [setupComplete, setSetupComplete] = useState<boolean | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  // Null until the session probe answers, so the UI can hold off instead of
  // flashing the login screen at someone who is already signed in.
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    const checkSetup = async () => {
      if (isNativeApp()) {
        const serverUrl = getServerUrl();
        if (!serverUrl) {
          window.location.href = '/index.html';
          return;
        }
      }

      try {
        const res = await fetch(apiUrl('/api/setup'), { credentials: 'include' });
        const data = await res.json();
        setSetupComplete(data.setupComplete);
      } catch {
        setSetupComplete(false);
      }

      // Restore an existing session. Without this the cookie is effectively
      // useless: isAuthenticated started false on every load, so a refresh
      // demanded the PIN again even with a valid 7-day session.
      try {
        const res = await fetch(apiUrl('/api/auth/session'), { credentials: 'include' });
        setIsAuthenticated(res.ok);
      } catch {
        setIsAuthenticated(false);
      } finally {
        setAuthChecked(true);
      }
    };
    checkSetup();
  }, []);

  const logout = async () => {
    await fetch(apiUrl('/api/auth/logout'), { method: 'POST', credentials: 'same-origin' });
    setIsAuthenticated(false);
  };

  return { setupComplete, setSetupComplete, isAuthenticated, setIsAuthenticated, authChecked, logout };
}
