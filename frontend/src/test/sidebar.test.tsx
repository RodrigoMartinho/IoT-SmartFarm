import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar } from '../components/Sidebar';
import * as AuthContextModule from '../context/AuthContext';

describe('Barra lateral de navegação (Sidebar)', () => {
  it('renderiza o link de Gestão de Usuários para administradores', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: {
        id: 1,
        nome: 'Admin',
        email: 'admin@smartfarm.com',
        eh_administrador: true,
        pode_acessar_animais: true,
        pode_acessar_equipamentos: true,
        pode_acessar_estacoes: true,
      },
      token: 'jwt-admin',
      login: vi.fn(),
      logout: vi.fn(),
      loading: false,
    });

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Sidebar />
      </MemoryRouter>
    );

    expect(screen.getByText('Gestão de Usuários')).toBeInTheDocument();
    expect(screen.getByText('Animais')).toBeInTheDocument();
    expect(screen.getByText('Propriedades Rurais')).toBeInTheDocument();
  });

  it('oculta o link de Gestão de Usuários para colaboradores não-administradores', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: {
        id: 2,
        nome: 'Operador',
        email: 'operador@smartfarm.com',
        eh_administrador: false,
        pode_acessar_animais: true,
        pode_acessar_equipamentos: true,
        pode_acessar_estacoes: true,
      },
      token: 'jwt-operador',
      login: vi.fn(),
      logout: vi.fn(),
      loading: false,
    });

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Sidebar />
      </MemoryRouter>
    );

    expect(screen.queryByText('Gestão de Usuários')).not.toBeInTheDocument();
    expect(screen.queryByText('Propriedades Rurais')).not.toBeInTheDocument();
    expect(screen.getByText('Animais')).toBeInTheDocument();
  });

  it('exibe o link de Propriedades Rurais para colaborador não-admin com pode_gerenciar_propriedades ativo', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: {
        id: 4,
        nome: 'Gerente de Fazenda',
        email: 'gerente@smartfarm.com',
        eh_administrador: false,
        pode_gerenciar_propriedades: true,
        pode_acessar_animais: true,
        pode_acessar_equipamentos: true,
        pode_acessar_estacoes: true,
      },
      token: 'jwt-gerente',
      login: vi.fn(),
      logout: vi.fn(),
      loading: false,
    });

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Sidebar />
      </MemoryRouter>
    );

    expect(screen.queryByText('Gestão de Usuários')).not.toBeInTheDocument();
    expect(screen.getByText('Propriedades Rurais')).toBeInTheDocument();
  });

  it('oculta o módulo de animais quando o usuário não possui permissão', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: {
        id: 3,
        nome: 'Técnico Agrícola',
        email: 'tecnico@smartfarm.com',
        eh_administrador: false,
        pode_acessar_animais: false, // Sem acesso ao rebanho
        pode_acessar_equipamentos: true,
        pode_acessar_estacoes: true,
      },
      token: 'jwt-tecnico',
      login: vi.fn(),
      logout: vi.fn(),
      loading: false,
    });

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Sidebar />
      </MemoryRouter>
    );

    expect(screen.queryByText('Animais')).not.toBeInTheDocument();
    expect(screen.getByText('Equipamentos')).toBeInTheDocument();
  });
});

