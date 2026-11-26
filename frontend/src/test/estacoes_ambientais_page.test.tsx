import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { EstacoesAmbientais } from '../pages/EstacoesAmbientais';
import { PropertyProvider } from '../context/PropertyContext';
import { api } from '../services/api';

describe('Página de Estações Ambientais (EstacoesAmbientais)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renderiza os cards das estações ambientais e filtra pela busca', async () => {
    vi.spyOn(api, 'get').mockImplementation((url: string) => {
      if (url === '/propriedades') {
        return Promise.resolve({
          data: [{ id: 1, nome: 'Fazenda Modelo Catanduva' }],
        });
      }
      if (url === '/estacoes-ambientais/propriedade/1') {
        return Promise.resolve({
          data: [
            {
              id: 1,
              nome: 'Estação Norte',
              dispositivo_id: 'Ambiental_01',
              latitude: -21.18715,
              longitude: -48.90958,
            },
            {
              id: 2,
              nome: 'Estação Sul',
              dispositivo_id: 'Ambiental_02',
              latitude: null,
              longitude: null,
            },
          ],
        });
      }
      return Promise.resolve({ data: [] });
    });

    render(
      <PropertyProvider>
        <EstacoesAmbientais />
      </PropertyProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Estação Norte')).toBeInTheDocument();
    });

    expect(screen.getByText('Ambiental_01')).toBeInTheDocument();
    expect(screen.getByText('-21.18715, -48.90958 (GPS)')).toBeInTheDocument();
    expect(screen.getByText('Estação Sul')).toBeInTheDocument();
    expect(screen.getByText('Localização automática via GPS do módulo')).toBeInTheDocument();

    // Filtra pelo ID do módulo
    const inputBusca = screen.getByPlaceholderText('Buscar estação ou ID do módulo...');
    fireEvent.change(inputBusca, { target: { value: 'Ambiental_01' } });

    expect(screen.getByText('Estação Norte')).toBeInTheDocument();
    expect(screen.queryByText('Estação Sul')).not.toBeInTheDocument();
  });

  it('abre o modal de cadastro de estação e envia os dados via POST', async () => {
    vi.spyOn(api, 'get').mockImplementation((url: string) => {
      if (url === '/propriedades') {
        return Promise.resolve({
          data: [{ id: 1, nome: 'Fazenda Modelo Catanduva' }],
        });
      }
      if (url === '/estacoes-ambientais/propriedade/1') {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({ data: [] });
    });

    const postSpy = vi.spyOn(api, 'post').mockResolvedValue({ data: { id: 3 } });

    render(
      <PropertyProvider>
        <EstacoesAmbientais />
      </PropertyProvider>
    );

    const btnNova = await screen.findByText('Cadastrar Nova Estação');
    fireEvent.click(btnNova);

    expect(screen.getByText('Cadastrar Nova Estação Ambiental')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Ex: Estação Meteorológica Norte'), {
      target: { value: 'Estação Leste' },
    });
    fireEvent.change(screen.getByPlaceholderText('Ex: ENV_STATION_01'), {
      target: { value: 'Ambiental_03' },
    });

    fireEvent.click(screen.getByText('Cadastrar'));

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith('/estacoes-ambientais', {
        propriedade_id: 1,
        nome: 'Estação Leste',
        dispositivo_id: 'Ambiental_03',
      });
    });
  });
});
