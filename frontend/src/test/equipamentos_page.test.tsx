import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { Equipamentos } from '../pages/Equipamentos';
import { PropertyProvider } from '../context/PropertyContext';
import { api } from '../services/api';

describe('Página de gerenciamento de equipamentos (Equipamentos)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renderiza equipamentos e separa o modal de cadastro do modal de Configuração Remota', async () => {
    vi.spyOn(api, 'get').mockImplementation((url: string) => {
      if (url === '/propriedades') {
        return Promise.resolve({
          data: [{ id: 1, nome: 'Fazenda Modelo Catanduva' }],
        });
      }
      if (url === '/equipamentos/propriedade/1') {
        return Promise.resolve({
          data: [
            {
              id: 5,
              nome: 'Trator John Deere',
              tipo: 'Trator',
              modelo: '7230J',
              dispositivo_id: 'EQUIP_TRAC_01',
              intervalo_envio_segundos: 20,
            },
          ],
        });
      }
      return Promise.resolve({ data: [] });
    });

    const putSpy = vi.spyOn(api, 'put').mockResolvedValue({ data: { id: 5 } });

    render(
      <PropertyProvider>
        <Equipamentos />
      </PropertyProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Trator John Deere')).toBeInTheDocument();
    });

    expect(screen.getByText('EQUIP_TRAC_01')).toBeInTheDocument();
    expect(screen.getByText('a cada 20s')).toBeInTheDocument();

    // 1. Verifica que o modal de cadastro não exibe a seção de configuração remota
    const btnNovo = screen.getByText('Cadastrar Novo Equipamento');
    fireEvent.click(btnNovo);
    expect(screen.getByText('Dados da máquina e código do rastreador')).toBeInTheDocument();
    expect(screen.queryByText('Ajustes do Rastreador')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Cancelar'));

    // 2. Abre o modal dedicado de Configuração Remota pelo botão específico
    const btnConfig = screen.getByTitle('Configurar Rastreador');
    fireEvent.click(btnConfig);

    expect(screen.getByText('Configuração Remota (Trator John Deere)')).toBeInTheDocument();
    expect(screen.getByText('Ajustes do Rastreador')).toBeInTheDocument();

    const selectIntervalo = screen.getByRole('combobox') as HTMLSelectElement;
    fireEvent.change(selectIntervalo, { target: { value: '10' } });

    fireEvent.click(screen.getByText('Salvar Configurações'));

    await waitFor(() => {
      expect(putSpy).toHaveBeenCalledWith('/equipamentos/5', {
        intervalo_envio_segundos: 10,
      });
    });
  });
});
