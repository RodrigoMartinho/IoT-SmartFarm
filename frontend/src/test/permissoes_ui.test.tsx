import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Dashboard } from '../pages/Dashboard';
import { AppContent } from '../App';
import * as AuthContextModule from '../context/AuthContext';
import * as PropertyContextModule from '../context/PropertyContext';
import * as SystemStatusModule from '../context/SystemStatusContext';
import { api } from '../services/api';

vi.mock('../components/PropriedadeMapa', () => ({
  PropriedadeMapa: () => <div data-testid="mock-property-map">Mapa Mock</div>,
}));

describe('Guardas de Permissão no Dashboard e Rotas (permissions_ui)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(SystemStatusModule, 'useSystemStatus').mockReturnValue({
      isOnline: true,
      activeSensorsCount: 2,
      lastActivity: null,
      mqttBrokerStatus: 'online',
      databaseStatus: 'online',
    } as any);

    vi.spyOn(PropertyContextModule, 'useProperty').mockReturnValue({
      properties: [{ id: 1, nome: 'Fazenda Experimental' }],
      selectedPropertyId: 1,
      selectedProperty: { id: 1, nome: 'Fazenda Experimental' },
      setSelectedPropertyId: vi.fn(),
      loadingProperties: false,
      refreshProperties: vi.fn(),
    } as any);

    vi.spyOn(api, 'get').mockImplementation((url: string) => {
      if (url.includes('/visao-geral')) {
        return Promise.resolve({
          data: {
            propriedade: { id: 1, nome: 'Fazenda Experimental', poligono_geojson: {} },
            animais: [
              {
                id: 101,
                numero_brinco: 'Animal_01',
                especie: 'Bovino',
                raca: 'Nelore',
                dispositivo_id: 'Animal_01',
                ultima_telemetria: {
                  temperatura_corporal: 38.4,
                  frequencia_cardiaca: 68,
                  nivel_atividade: 'Deitado (Repouso / Ruminação)',
                  acelerometro: { x: 0.92, y: 0.05, z: 0.18 },
                },
              },
            ],
            equipamentos: [],
            estacoes_ambientais: [],
          },
        });
      }
      if (url.includes('/alertas/propriedade/')) {
        return Promise.resolve({
          data: [
            {
              id: 55,
              dispositivo_id: 'Animal_01',
              tipo: 'CERCA_VIRTUAL',
              severidade: 'CRITICA',
              mensagem: 'Animal saiu do perímetro!',
              esta_ativo: true,
            },
          ],
        });
      }
      return Promise.resolve({ data: [] });
    });
  });

  it('oculta o botão Reconhecer Alarme quando pode_gerenciar_alarmes é false e exibe postura do animal', async () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: {
        id: 2,
        nome: 'Operador Sem Alarmes',
        email: 'op@smartfarm.com',
        eh_administrador: false,
        pode_gerenciar_alarmes: false,
        pode_acessar_animais: true,
      },
      token: 'jwt-op',
      login: vi.fn(),
      logout: vi.fn(),
      loading: false,
    });

    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getAllByText('Animal saiu do perímetro!').length).toBeGreaterThan(0);
    });

    // Não deve exibir os botões de reconhecer/desativar alarme
    expect(screen.queryByText('Reconhecer Alarme')).not.toBeInTheDocument();
    expect(screen.queryByText('Reconhecer / Desativar')).not.toBeInTheDocument();

    // Deve exibir o badge de postura real do animal vindo do acelerômetro
    expect(screen.getByText('Deitado (Repouso / Ruminação)')).toBeInTheDocument();
  });

  it('redireciona de /propriedades para /dashboard quando usuário não tem pode_gerenciar_propriedades', async () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: {
        id: 3,
        nome: 'Veterinário',
        email: 'vet@smartfarm.com',
        eh_administrador: false,
        pode_gerenciar_propriedades: false,
        pode_acessar_animais: true,
        pode_gerenciar_alarmes: true,
      },
      token: 'jwt-vet',
      login: vi.fn(),
      logout: vi.fn(),
      loading: false,
    });

    render(
      <MemoryRouter initialEntries={['/propriedades']}>
        <AppContent />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Telemetria Biométrica do Rebanho')).toBeInTheDocument();
    });
    expect(screen.queryByText('Gestão de propriedades rurais')).not.toBeInTheDocument();
  });
});

