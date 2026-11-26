import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../services/api';
import { useAuth } from './AuthContext';

interface SystemStatusContextType {
  isOnline: boolean;
  activeSensorsCount: number;
  lastActivity: string | null;
  checkStatus: () => Promise<void>;
}

const SystemStatusContext = createContext<SystemStatusContextType>({} as SystemStatusContextType);

export const SystemStatusProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [activeSensorsCount, setActiveSensorsCount] = useState<number>(0);
  const [lastActivity, setLastActivity] = useState<string | null>(null);

  const checkStatus = async () => {
    try {
      const res = await api.get('/telemetria/status');
      if (res.data && res.data.status === 'online') {
        setIsOnline(true);
        setActiveSensorsCount(res.data.sensores_ativos ?? res.data.active_sensors_count ?? 0);
        setLastActivity(res.data.ultima_atividade || res.data.last_activity);
      } else {
        setIsOnline(false);
      }
    } catch (err) {
      setIsOnline(false);
    }
  };

  useEffect(() => {
    if (!user) {
      setActiveSensorsCount(0);
      setLastActivity(null);
    }
    checkStatus();
    const interval = setInterval(checkStatus, 4000);
    return () => clearInterval(interval);
  }, [user?.id]);

  return (
    <SystemStatusContext.Provider value={{ isOnline, activeSensorsCount, lastActivity, checkStatus }}>
      {children}
    </SystemStatusContext.Provider>
  );
};

export const useSystemStatus = () => useContext(SystemStatusContext);
