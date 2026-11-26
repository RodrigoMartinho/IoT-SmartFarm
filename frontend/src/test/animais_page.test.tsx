import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { Animais } from '../pages/Animais';
import { PropertyProvider } from '../context/PropertyContext';
import { api } from '../services/api';

describe('Página de gerenciamento de animais (Animais)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renderiza os cards de animais com os badges de ciclos operacionais GPS e Envio', async () => {
    // Mock de propriedades
    vi.spyOn(api, 'get').mockImplementation((url: string) => {
      if (url === '/propriedades') {
        return Promise.resolve({
          data: [{ id: 1, nome: 'Fazenda Modelo Catanduva' }],
        });
      }
      if (url === '/animais/propriedade/1') {
        return Promise.resolve({
          data: [
            {
              id: 10,
              numero_brinco: 'BR-1001',
              especie: 'Bovino',
              raca: 'Nelore',
              dispositivo_id: 'DEV_BOV_001',
              intervalo_gps_segundos: 15,
              intervalo_envio_segundos: 60,
              ultima_telemetria: {
                nivel_atividade: 'Em pé (Caminhada / Pastando)',
                acelerometro: { x: 0.12, y: 0.25, z: 0.95 },
              },
            },
          ],
        });
      }
      return Promise.resolve({ data: [] });
    });

    render(
      <PropertyProvider>
        <Animais />
      </PropertyProvider>
    );

    // Aguarda carregar o animal na tela
    await waitFor(() => {
      expect(screen.getByText('BR-1001')).toBeInTheDocument();
    });

    // Valida exibição do badge de ciclo unificado e postura do animal
    expect(screen.getByText('60s')).toBeInTheDocument();
    expect(screen.getByText('DEV_BOV_001')).toBeInTheDocument();
    expect(screen.getByText('Em pé (Caminhada / Pastando)')).toBeInTheDocument();
  });

  it('abre o modal de cadastro de animal ao clicar no botão correspondente', async () => {
    vi.spyOn(api, 'get').mockImplementation((url: string) => {
      if (url === '/propriedades') {
        return Promise.resolve({
          data: [{ id: 1, nome: 'Fazenda Modelo Catanduva' }],
        });
      }
      if (url === '/animais/propriedade/1') {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({ data: [] });
    });

    render(
      <PropertyProvider>
        <Animais />
      </PropertyProvider>
    );

    // Clica no botão de cadastrar novo animal
    const botaoNovo = await screen.findByText('Cadastrar novo animal');
    fireEvent.click(botaoNovo);

    // Modal deve abrir apenas com os campos cadastrais (sem configuração remota misturada)
    expect(screen.getByText('Identificação do animal e associação do dispositivo')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Ex: BR-1001')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Ex: ANIMAL_BOV_001')).toBeInTheDocument();
    expect(screen.queryByText('Ajustes da Coleira')).not.toBeInTheDocument();
  });

  it('abre o modal dedicado de Configuração Remota e envia parâmetros via PUT', async () => {
    vi.spyOn(api, 'get').mockImplementation((url: string) => {
      if (url === '/propriedades') {
        return Promise.resolve({
          data: [{ id: 1, nome: 'Fazenda Modelo Catanduva' }],
        });
      }
      if (url === '/animais/propriedade/1') {
        return Promise.resolve({
          data: [
            {
              id: 10,
              numero_brinco: 'BR-2002',
              especie: 'Bovino',
              raca: 'Angus',
              dispositivo_id: 'DEV_BOV_002',
              intervalo_gps_segundos: 10,
              intervalo_envio_segundos: 5,
              economia_energia: true,
            },
          ],
        });
      }
      return Promise.resolve({ data: [] });
    });

    const putSpy = vi.spyOn(api, 'put').mockResolvedValue({ data: { id: 10 } });

    render(
      <PropertyProvider>
        <Animais />
      </PropertyProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('BR-2002')).toBeInTheDocument();
    });

    // Verifica o rótulo atualizado da Economia de Energia no card
    expect(screen.getByText('Economia de Energia')).toBeInTheDocument();
    expect(screen.getByText('Ativado')).toBeInTheDocument();

    // Abre o modal de Configuração Remota pelo botão específico
    const btnConfig = screen.getByTitle('Configurar Coleira');
    fireEvent.click(btnConfig);

    expect(screen.getByText('Configuração Remota (BR-2002)')).toBeInTheDocument();
    expect(screen.getByText('Ajustes da Coleira')).toBeInTheDocument();
    expect(screen.getByText('Tempo de Coleta e Envio')).toBeInTheDocument();

    // Altera o toggle de Economia de Energia para Desativada e salva
    const switchEco = screen.getByRole('switch');
    fireEvent.click(switchEco);
    expect(screen.getByText('Desativada')).toBeInTheDocument();

    const btnSalvar = screen.getByText('Salvar Configurações');
    fireEvent.click(btnSalvar);

    await waitFor(() => {
      expect(putSpy).toHaveBeenCalledWith('/animais/10', {
        intervalo_gps_segundos: 5,
        intervalo_envio_segundos: 5,
        economia_energia: false,
      });
    });
  });
});
