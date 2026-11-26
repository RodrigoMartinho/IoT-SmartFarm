import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { api } from '../services/api';

// Componente auxiliar para inspecionar o contexto nos testes
const TestConsumer: React.FC = () => {
  const { user, token, logout, loading } = useAuth();

  if (loading) return <div>Carregando sessão...</div>;

  return (
    <div>
      <div data-testid="user-name">{user ? user.nome : 'Nenhum usuário'}</div>
      <div data-testid="user-role">{user?.eh_administrador ? 'Administrador' : 'Colaborador'}</div>
      <div data-testid="token-value">{token || 'Sem token'}</div>
      <button onClick={logout}>Sair do sistema</button>
    </div>
  );
};

describe('Contexto de autenticação (AuthContext)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('inicia deslogado quando não há token no localStorage', async () => {
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    expect(screen.getByTestId('user-name')).toHaveTextContent('Nenhum usuário');
    expect(screen.getByTestId('token-value')).toHaveTextContent('Sem token');
  });

  it('carrega o usuário quando há um token válido no localStorage', async () => {
    localStorage.setItem('token', 'fake-jwt-token-123');

    // Mock da chamada /autenticacao/eu
    vi.spyOn(api, 'get').mockResolvedValueOnce({
      data: {
        id: 1,
        nome: 'Carlos Produtor',
        email: 'carlos@fazenda.com.br',
        eh_administrador: true,
        pode_acessar_animais: true,
      },
    });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('user-name')).toHaveTextContent('Carlos Produtor');
    });

    expect(screen.getByTestId('user-role')).toHaveTextContent('Administrador');
    expect(screen.getByTestId('token-value')).toHaveTextContent('fake-jwt-token-123');
  });

  it('executa logout limpando o localStorage e o estado do usuário', async () => {
    localStorage.setItem('token', 'token-para-logout');

    vi.spyOn(api, 'get').mockResolvedValueOnce({
      data: {
        id: 2,
        nome: 'Maria Gerente',
        email: 'maria@fazenda.com.br',
        eh_administrador: false,
      },
    });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('user-name')).toHaveTextContent('Maria Gerente');
    });

    // Clica no botão de logout
    act(() => {
      screen.getByText('Sair do sistema').click();
    });

    expect(screen.getByTestId('user-name')).toHaveTextContent('Nenhum usuário');
    expect(screen.getByTestId('token-value')).toHaveTextContent('Sem token');
    expect(localStorage.getItem('token')).toBeNull();
  });
});

