import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PropertyProvider, useProperty } from '../context/PropertyContext';
import { Topbar } from '../components/Topbar';
import { AuthProvider } from '../context/AuthContext';
import { SystemStatusProvider } from '../context/SystemStatusContext';
import { api } from '../services/api';

const TestConsumer: React.FC = () => {
  const { properties, selectedPropertyId, selectedProperty, setSelectedPropertyId } = useProperty();

  return (
    <div>
      <span data-testid="selected-id">{selectedPropertyId}</span>
      <span data-testid="selected-name">{selectedProperty?.nome || selectedProperty?.name}</span>
      <span data-testid="properties-count">{properties.length}</span>
      <button data-testid="btn-select-2" onClick={() => setSelectedPropertyId(2)}>
        Selecionar 2
      </button>
    </div>
  );
};

describe('Contexto de propriedades e seletor global (PropertyContext & Topbar)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('carrega propriedades e seleciona a primeira por padrão quando não há id salvo', async () => {
    vi.spyOn(api, 'get').mockImplementation((url: string) => {
      if (url === '/propriedades') {
        return Promise.resolve({
          data: [
            { id: 1, nome: 'Fazenda Santa Inês' },
            { id: 2, nome: 'Sítio Boa Esperança' },
          ],
        });
      }
      return Promise.resolve({ data: [] });
    });

    render(
      <PropertyProvider>
        <TestConsumer />
      </PropertyProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('selected-id').textContent).toBe('1');
      expect(screen.getByTestId('selected-name').textContent).toBe('Fazenda Santa Inês');
      expect(screen.getByTestId('properties-count').textContent).toBe('2');
    });

    expect(localStorage.getItem('selected_property_id')).toBe('1');
  });

  it('restaura a propriedade selecionada a partir do localStorage', async () => {
    localStorage.setItem('selected_property_id', '2');

    vi.spyOn(api, 'get').mockImplementation((url: string) => {
      if (url === '/propriedades') {
        return Promise.resolve({
          data: [
            { id: 1, nome: 'Fazenda Santa Inês' },
            { id: 2, nome: 'Sítio Boa Esperança' },
          ],
        });
      }
      return Promise.resolve({ data: [] });
    });

    render(
      <PropertyProvider>
        <TestConsumer />
      </PropertyProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('selected-id').textContent).toBe('2');
      expect(screen.getByTestId('selected-name').textContent).toBe('Sítio Boa Esperança');
    });
  });

  it('atualiza localStorage ao alterar a propriedade ativa', async () => {
    vi.spyOn(api, 'get').mockImplementation((url: string) => {
      if (url === '/propriedades') {
        return Promise.resolve({
          data: [
            { id: 1, nome: 'Fazenda Santa Inês' },
            { id: 2, nome: 'Sítio Boa Esperança' },
          ],
        });
      }
      return Promise.resolve({ data: [] });
    });

    render(
      <PropertyProvider>
        <TestConsumer />
      </PropertyProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('selected-id').textContent).toBe('1');
    });

    fireEvent.click(screen.getByTestId('btn-select-2'));

    expect(screen.getByTestId('selected-id').textContent).toBe('2');
    expect(screen.getByTestId('selected-name').textContent).toBe('Sítio Boa Esperança');
    expect(localStorage.getItem('selected_property_id')).toBe('2');
  });

  it('exibe o seletor na topbar com a propriedade ativa selecionada', async () => {
    localStorage.setItem('token', 'fake-jwt-token');

    vi.spyOn(api, 'get').mockImplementation((url: string) => {
      if (url === '/autenticacao/eu') {
        return Promise.resolve({
          data: {
            id: 1,
            nome: 'Carlos Produtor',
            email: 'carlos@smartfarm.com',
            eh_administrador: true,
          },
        });
      }
      if (url === '/telemetria/status') {
        return Promise.resolve({
          data: {
            status: 'online',
            sensores_ativos: 14,
            ultima_atividade: '2026-09-15T08:00:00Z',
          },
        });
      }
      if (url === '/propriedades') {
        return Promise.resolve({
          data: [
            { id: 1, nome: 'Fazenda Santa Inês' },
            { id: 2, nome: 'Sítio Boa Esperança' },
          ],
        });
      }
      return Promise.resolve({ data: [] });
    });

    render(
      <MemoryRouter>
        <AuthProvider>
          <SystemStatusProvider>
            <PropertyProvider>
              <Topbar />
            </PropertyProvider>
          </SystemStatusProvider>
        </AuthProvider>
      </MemoryRouter>
    );

    // Aguarda carregar dados do usuário e status
    await waitFor(() => {
      expect(screen.getByText('Carlos Produtor')).toBeInTheDocument();
    });

    // Seletor de propriedade deve estar visível no Topbar
    const select = await screen.findByTestId('topbar-property-select') as HTMLSelectElement;
    expect(select).toBeInTheDocument();
    expect(select.value).toBe('1');

    // Altera seleção no Topbar
    fireEvent.change(select, { target: { value: '2' } });
    expect(select.value).toBe('2');
    expect(localStorage.getItem('selected_property_id')).toBe('2');
  });
});

