import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  api,
  clearTokens,
  getAccessToken,
  getDeviceId,
  setTokens,
} from "./client";
import type { UserResponse } from "./generated/types.gen";

type User = UserResponse;

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isPremium: boolean;
  login: (email: string, password: string) => Promise<void>;
  sendCode: (email: string, password: string) => Promise<void>;
  verifyCode: (email: string, code: string, password?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setUser: (user: User | null) => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  isPremium: false,
  login: async () => {},
  sendCode: async (email, password) => {
    await api.sendCode(email, password);
  },
  verifyCode: async () => {},
  logout: async () => {},
  refreshUser: async () => {},
  setUser: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // При старте проверяем токены
  useEffect(() => {
    (async () => {
      try {
        const token = await getAccessToken();
        if (token) {
          // Пробуем получить информацию о пользователе
          try {
            const me = await api.getMe();
            setUser(me);
          } catch {
            // Токен недействителен
            await clearTokens();
          }
        }
      } catch {
        // ignore
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  // Обновление токена каждые 2 недели
  useEffect(() => {
    refreshTimer.current = setInterval(
      async () => {
        try {
          const token = await getAccessToken();
          if (token) {
            const me = await api.getMe();
            setUser(me);
          }
        } catch {
          /* ignore */
        }
      },
      14 * 24 * 60 * 60 * 1000,
    ); // 2 недели

    return () => {
      if (refreshTimer.current) {
        clearInterval(refreshTimer.current);
      }
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await api.login(email, password);
    await setTokens(data.accessToken, data.refreshToken);
    setUser(data.user);

    // Регистрируем устройство
    try {
      const deviceId = await getDeviceId();
      await api.registerDevice(deviceId, "React Native", "Expo");
    } catch {
      /* не критично */
    }
  }, []);

  const sendCode = useCallback(async (email: string, password: string) => {
    await api.sendCode(email, password);
  }, []);

  const verifyCode = useCallback(
    async (email: string, code: string, password?: string) => {
      const data = await api.verifyCode(email, code, password);
      await setTokens(data.accessToken, data.refreshToken);
      setUser(data.user);

      // Регистрируем устройство
      try {
        const deviceId = await getDeviceId();
        await api.registerDevice(deviceId, "React Native", "Expo");
      } catch {
        // не критично
      }
    },
    [],
  );

  const logout = useCallback(async () => {
    await clearTokens();
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const me = await api.getMe();
      setUser(me);
    } catch {
      // ignore
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: user !== null,
        isPremium: user?.premium ?? false,
        login,
        sendCode,
        verifyCode,
        logout,
        refreshUser,
        setUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
