import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { Usuarios } from '../pages/Usuarios';
import * as AuthContextModule from '../context/AuthContext';
import { api } from '../services/api';

describe('Página de Gestão de Usuários e Acessos (Usuarios)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: {
        id: 1,
        nome: 'Admin Principal',
        email: 'admin@smartfarm.com',
        eh_administrador: true,
        pode_gerenciar_propriedades: true,
        pode_acessar_animais: true,
        pode_acessar_equipamentos: true,
        pode_acessar_estacoes: true,
        pode_gerenciar_alarmes: true,
      },
      token: 'jwt-admin',
      login: vi.fn(),
      logout: vi.fn(),
      loading: false,
    });

    vi.spyOn(api, 'get').mockImplementation((url: string) => {
      if (url === '/usuarios') {
        return Promise.resolve({
          data: [
            {
              id: 1,
              nome: 'Admin Principal',
              email: 'admin@smartfarm.com',
              eh_administrador: true,
              pode_gerenciar_propriedades: true,
              pode_acessar_animais: true,
              pode_acessar_equipamentos: true,
              pode_acessar_estacoes: true,
              pode_gerenciar_alarmes: true,
              propriedades_ids: [10],
            },
            {
              id: 2,
              nome: 'Veterinário Campo',
              email: 'vet@smartfarm.com',
              eh_administrador: false,
              pode_gerenciar_propriedades: false,
              pode_acessar_animais: true,
              pode_acessar_equipamentos: false,
              pode_acessar_estacoes: false,
              pode_gerenciar_alarmes: true,
              propriedades_ids: [10],
            },
          ],
        });
      }
      if (url === '/propriedades') {
        return Promise.resolve({
          data: [{ id: 10, nome: 'Fazenda Boa Vista', descricao: 'Pecuária' }],
        });
      }
      return Promise.resolve({ data: [] });
    });
  });

  it('lista colaboradores com seus módulos liberados e abre modal de novo cadastro', async () => {
    render(<Usuarios />);

    await waitFor(() => {
      expect(screen.getByText('Veterinário Campo')).toBeInTheDocument();
    });

    const btnNovo = screen.getByText('Cadastrar Novo Colaborador');
    fireEvent.click(btnNovo);

    expect(screen.getByRole('checkbox', { name: /Propriedades Rurais/i })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Animais/i })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Equipamentos/i })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Estações Ambientais/i })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Alarmes/i })).toBeInTheDocument();
  });

  it('valida obrigatoriedade de selecionar propriedade e envia payload com pode_gerenciar_propriedades', async () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue({ data: { id: 3 } });

    render(<Usuarios />);

    const btnNovo = await screen.findByText('Cadastrar Novo Colaborador');
    fireEvent.click(btnNovo);

    fireEvent.change(screen.getByPlaceholderText('Ex: Carlos Oliveira'), {
      target: { value: 'Dr. Marcos Vet' },
    });
    fireEvent.change(screen.getByPlaceholderText('carlos@smartfarm.com'), {
      target: { value: 'marcos@smartfarm.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('Mínimo 6 caracteres'), {
      target: { value: 'Senha123!' },
    });

    // Desmarca a única propriedade para testar validação
    const propCheckbox = screen.getByRole('checkbox', { name: /Fazenda Boa Vista/i });
    fireEvent.click(propCheckbox);

    const btnSubmit = screen.getByRole('button', { name: /Cadastrar Colaborador/i });
    fireEvent.click(btnSubmit);

    expect(
      await screen.findByText('Selecione pelo menos uma propriedade rural para este colaborador.')
    ).toBeInTheDocument();
    expect(postSpy).not.toHaveBeenCalled();

    // Marca a propriedade novamente e ativa Propriedades Rurais
    fireEvent.click(propCheckbox);
    const propPermCheckbox = screen.getByRole('checkbox', { name: /Propriedades Rurais/i });
    fireEvent.click(propPermCheckbox);

    fireEvent.click(btnSubmit);

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith(
        '/usuarios',
        expect.objectContaining({
          nome: 'Dr. Marcos Vet',
          email: 'marcos@smartfarm.com',
          eh_administrador: false,
          pode_gerenciar_propriedades: true,
          propriedades_ids: [10],
        })
      );
    });
  });
});

