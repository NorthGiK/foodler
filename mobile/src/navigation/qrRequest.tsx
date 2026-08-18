import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Linking } from "react-native";

type QrRequestContextValue = { requestId: number };
const QrRequestContext = createContext<QrRequestContextValue>({ requestId: 0 });

function isQrRequest(url: string | null): boolean {
  return url === "foodspendtracker://scan-qr";
}

export function QrRequestProvider({ children }: { children: ReactNode }) {
  const [requestId, setRequestId] = useState(0);
  const lastHandled = useRef<{ url: string; timestamp: number } | null>(null);

  useEffect(() => {
    const handleUrl = (url: string | null) => {
      if (!isQrRequest(url) || url === null) return;
      const now = Date.now();
      if (
        lastHandled.current?.url === url &&
        now - lastHandled.current.timestamp < 1000
      )
        return;
      lastHandled.current = { url, timestamp: now };
      setRequestId((value) => value + 1);
    };
    void Linking.getInitialURL().then(handleUrl);
    const subscription = Linking.addEventListener("url", ({ url }) =>
      handleUrl(url),
    );
    return () => subscription.remove();
  }, []);

  const value = useMemo(() => ({ requestId }), [requestId]);
  return (
    <QrRequestContext.Provider value={value}>
      {children}
    </QrRequestContext.Provider>
  );
}

export function useQrRequest(): QrRequestContextValue {
  return useContext(QrRequestContext);
}
