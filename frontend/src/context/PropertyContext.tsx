import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { useAuth } from './AuthContext';

export interface Propriedade {
  id: number;
  nome: string;
  name?: string;
  descricao?: string;
  description?: string;
  poligono_geojson?: any;
  polygon_geojson?: any;
  criado_em?: string;
}

interface PropertyContextType {
  properties: Propriedade[];
  selectedPropertyId: number | null;
  selectedProperty: Propriedade | null;
  setSelectedPropertyId: (id: number | null) => void;
  loadingProperties: boolean;
  refreshProperties: () => Promise<void>;
}

const STORAGE_KEY = 'selected_property_id';

const PropertyContext = createContext<PropertyContextType>({
  properties: [],
  selectedPropertyId: null,
  selectedProperty: null,
  setSelectedPropertyId: () => {},
  loadingProperties: false,
  refreshProperties: async () => {},
});

export const PropertyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const auth = useAuth();
  const user = auth?.user;
  const token = auth?.token ?? (typeof window !== 'undefined' ? localStorage.getItem('token') : null);

  const getUserStorageKey = useCallback(() => {
    return user?.id ? `selected_property_id_u${user.id}` : 'selected_property_id';
  }, [user?.id]);

  const [properties, setProperties] = useState<Propriedade[]>([]);
  const [selectedPropertyId, setSelectedPropertyIdState] = useState<number | null>(() => {
    const saved = localStorage.getItem('selected_property_id');
    return saved ? Number(saved) : null;
  });
  const [loadingProperties, setLoadingProperties] = useState<boolean>(true);

  const setSelectedPropertyId = useCallback((id: number | null) => {
    setSelectedPropertyIdState(id);
    const userKey = getUserStorageKey();
    if (id !== null && id !== undefined) {
      localStorage.setItem('selected_property_id', String(id));
      localStorage.setItem(userKey, String(id));
    } else {
      localStorage.removeItem('selected_property_id');
      localStorage.removeItem(userKey);
    }
  }, [getUserStorageKey]);

  const refreshProperties = useCallback(async () => {
    try {
      setLoadingProperties(true);
      const res = await api.get('/propriedades');
      const data: Propriedade[] = Array.isArray(res.data) ? res.data : [];
      setProperties(data);

      const userKey = getUserStorageKey();
      if (data.length > 0) {
        // Tenta ler a chave isolada do usuário ou a chave padrão
        const saved = localStorage.getItem(userKey) || localStorage.getItem('selected_property_id');
        const savedId = saved ? Number(saved) : null;
        const exists = savedId ? data.some((p) => p.id === savedId) : false;

        if (exists && savedId !== null) {
          setSelectedPropertyIdState(savedId);
          localStorage.setItem('selected_property_id', String(savedId));
          localStorage.setItem(userKey, String(savedId));
        } else {
          // Seleciona a primeira fazenda válida pertencente a este usuário
          const firstId = data[0].id;
          setSelectedPropertyIdState(firstId);
          localStorage.setItem('selected_property_id', String(firstId));
          localStorage.setItem(userKey, String(firstId));
        }
      } else {
        setSelectedPropertyIdState(null);
        localStorage.removeItem('selected_property_id');
        localStorage.removeItem(userKey);
      }
    } catch (err) {
      console.error('Erro ao carregar propriedades:', err);
    } finally {
      setLoadingProperties(false);
    }
  }, [getUserStorageKey]);

  useEffect(() => {
    refreshProperties();
  }, [user?.id, token, refreshProperties]);

  const selectedProperty = properties.find((p) => p.id === selectedPropertyId) || null;

  return (
    <PropertyContext.Provider
      value={{
        properties,
        selectedPropertyId,
        selectedProperty,
        setSelectedPropertyId,
        loadingProperties,
        refreshProperties,
      }}
    >
      {children}
    </PropertyContext.Provider>
  );
};

export const useProperty = () => useContext(PropertyContext);
