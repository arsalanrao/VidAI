import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

const AUTO_RETRY_KEY = 'vidaipro_auto_retry';
const AUTO_RETRY_DELAY_MS = 1000;

type SettingsContextValue = {
  autoRetryEnabled: boolean;
  autoRetryDelayMs: number;
  setAutoRetryEnabled: (enabled: boolean) => Promise<void>;
  loading: boolean;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [autoRetryEnabled, setAutoRetryEnabledState] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(AUTO_RETRY_KEY)
      .then((value) => {
        setAutoRetryEnabledState(value === '1');
      })
      .finally(() => setLoading(false));
  }, []);

  const setAutoRetryEnabled = useCallback(async (enabled: boolean) => {
    setAutoRetryEnabledState(enabled);
    await AsyncStorage.setItem(AUTO_RETRY_KEY, enabled ? '1' : '0');
  }, []);

  const value = useMemo(
    () => ({
      autoRetryEnabled,
      autoRetryDelayMs: AUTO_RETRY_DELAY_MS,
      setAutoRetryEnabled,
      loading,
    }),
    [autoRetryEnabled, setAutoRetryEnabled, loading],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);

  if (!ctx) {
    throw new Error('useSettings must be used within SettingsProvider');
  }

  return ctx;
}
