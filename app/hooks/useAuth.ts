import { useState, useEffect } from 'react';
import { apiUrl, isNativeApp, getServerUrl } from '@/lib/mobileConfig';

export function useAuth() {
  const [setupComplete, setSetupComplete] = useState<boolean | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

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
    };
    checkSetup();
  }, []);

  const logout = async () => {
    await fetch(apiUrl('/api/auth/logout'), { method: 'POST', credentials: 'same-origin' });
    setIsAuthenticated(false);
  };

  return { setupComplete, setSetupComplete, isAuthenticated, setIsAuthenticated, logout };
}
