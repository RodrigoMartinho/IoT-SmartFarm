import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../services/api';

export interface Usuario {
  id: number;
  nome: string;
  name?: string;
  email: string;
  eh_administrador?: boolean;
  pode_acessar_animais?: boolean;
  pode_acessar_equipamentos?: boolean;
  pode_acessar_estacoes?: boolean;
  pode_gerenciar_alarmes?: boolean;
  pode_gerenciar_propriedades?: boolean;
  administrador_id?: number | null;
  propriedades_ids?: number[];
}

interface AuthContextType {
  user: Usuario | null;
  token: string | null;
  login: (token: string) => Promise<void>;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<Usuario | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (token) {
      fetchCurrentUser();
    } else {
      setLoading(false);
    }
  }, [token]);

  const fetchCurrentUser = async () => {
    try {
      const res = await api.get('/autenticacao/eu');
      const dados = res.data;
      setUser({
        id: dados.id,
        nome: dados.nome || dados.name,
        name: dados.nome || dados.name,
        email: dados.email,
        eh_administrador: dados.eh_administrador,
        pode_acessar_animais: dados.pode_acessar_animais,
        pode_acessar_equipamentos: dados.pode_acessar_equipamentos,
        pode_acessar_estacoes: dados.pode_acessar_estacoes,
        pode_gerenciar_alarmes: dados.pode_gerenciar_alarmes,
        pode_gerenciar_propriedades: dados.pode_gerenciar_propriedades,
        administrador_id: dados.administrador_id,
        propriedades_ids: dados.propriedades_ids || []
      });
    } catch (err) {
      console.error('Erro ao buscar usuário logado:', err);
      logout();
    } finally {
      setLoading(false);
    }
  };

  const login = async (newToken: string) => {
    localStorage.setItem('token', newToken);
    setToken(newToken);
    await fetchCurrentUser();
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
    setLoading(false);
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
