import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { HistoricoMedicoesModal } from '../components/HistoricoMedicoesModal';
import { api } from '../services/api';

describe('Modal de Histórico de Telemetria (HistoricoMedicoesModal)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exibe as medições do animal com postura (Deitado / Em pé) e permite limpar histórico com confirmação', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      data: {
        dispositivo_id: 'Animal_01',
        tipo: 'animal',
        total: 2,
        medicoes: [
          {
            _id: 'm1',
            data_hora: '2026-10-16T12:00:00Z',
            temperatura_corporal: 38.6,
            frequencia_cardiaca: 72,
            latitude: -21.137,
            longitude: -48.973,
            nivel_atividade: 'Em pé (Caminhada / Pastando)',
            acelerometro: { x: 0.15, y: 0.22, z: 0.96 },
          },
          {
            _id: 'm2',
            data_hora: '2026-10-16T11:55:00Z',
            temperatura_corporal: 38.3,
            frequencia_cardiaca: 64,
            latitude: -21.1371,
            longitude: -48.9731,
            acelerometro: { x: 0.94, y: 0.08, z: 0.12 }, // Fallback eixo Z < 0.65 -> Deitado
          },
        ],
      },
    });

    const deleteSpy = vi.spyOn(api, 'delete').mockResolvedValue({
      data: { total_removido: 2 },
    });

    render(
      <HistoricoMedicoesModal
        isOpen={true}
        onClose={vi.fn()}
        dispositivoId="Animal_01"
        nomeItem="Coleira #Animal_01"
        tipo="animal"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Em pé (Caminhada / Pastando)')).toBeInTheDocument();
    });

    // Verifica que o segundo registro sem nivel_atividade explícito calculou Deitado pelo eixo Z
    expect(screen.getByText('Deitado (Repouso / Ruminação)')).toBeInTheDocument();

    // Testa abertura do modal de confirmação de limpeza de histórico
    const btnLimpar = screen.getByRole('button', { name: /Limpar Histórico/i });
    fireEvent.click(btnLimpar);

    const inputConfirm = await screen.findByPlaceholderText(/apagar definitivamente/i);
    fireEvent.change(inputConfirm, { target: { value: 'apagar definitivamente' } });

    const btnConfirmarExclusao = screen.getByRole('button', { name: /Confirmar e Apagar/i });
    fireEvent.click(btnConfirmarExclusao);

    await waitFor(() => {
      expect(deleteSpy).toHaveBeenCalledWith('/telemetria/historico/Animal_01');
    });
  });

  it('traz por padrão a data atual no filtro e permite buscar histórico de outra data ou de todas as datas', async () => {
    const getSpy = vi.spyOn(api, 'get').mockResolvedValue({
      data: {
        dispositivo_id: 'Animal_01',
        tipo: 'animal',
        total: 0,
        medicoes: [],
      },
    });

    const hoje = new Date();
    const hojeEsperado = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;

    render(
      <HistoricoMedicoesModal
        isOpen={true}
        onClose={vi.fn()}
        dispositivoId="Animal_01"
        nomeItem="Coleira #Animal_01"
        tipo="animal"
      />
    );

    const inputData = screen.getByLabelText('Filtrar por data') as HTMLInputElement;
    expect(inputData.value).toBe(hojeEsperado);

    await waitFor(() => {
      expect(getSpy).toHaveBeenCalledWith(expect.stringContaining(`data=${hojeEsperado}`));
    });

    // Muda para uma data específica
    fireEvent.change(inputData, { target: { value: '2026-10-15' } });
    await waitFor(() => {
      expect(getSpy).toHaveBeenCalledWith(expect.stringContaining('data=2026-10-15'));
    });

    // Clica em "Todas" para ver histórico sem restrição de dia
    const btnTodas = screen.getByRole('button', { name: 'Todas' });
    fireEvent.click(btnTodas);
    await waitFor(() => {
      expect(getSpy).toHaveBeenLastCalledWith('/telemetria/historico/Animal_01?limite=50&pular=0');
    });
  });

  it('exibe todos os dados da estação ambiental no histórico', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      data: {
        dispositivo_id: 'Ambiental_01',
        tipo: 'estacao_ambiental',
        total: 1,
        medicoes: [
          {
            _id: 'env1',
            data_hora: '2026-10-28T13:50:00Z',
            modo: 'AUTOMATICO',
            bateria_percentual_simulado: 100.0,
            temperatura_solo_C: 27.87,
            chuva: false,
            temperatura_ar_C: 28.10,
            umidade_ar_percentual: 79.23,
            temperatura_bmp_C: 28.44,
            pressao_hPa: 951.51,
            luminosidade_adc: 0,
            umidade_solo_adc: 3094,
            umidade_solo: 38.6,
            mq2_adc: 0,
            latitude: -21.187126,
            longitude: -48.909596,
            satelites: 9,
            altitude_m: 538.9,
          },
        ],
      },
    });

    render(
      <HistoricoMedicoesModal
        isOpen={true}
        onClose={vi.fn()}
        dispositivoId="Ambiental_01"
        nomeItem="Estação Meteorológica Norte"
        tipo="estacao_ambiental"
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/AUTOMATICO/i)).toBeInTheDocument();
    });

    // Colunas abreviadas com tooltip completo (sem BMP280 no título e sem valores BMP na tabela)
    expect(screen.getByText('Temp. Ar')).toBeInTheDocument();
    expect(screen.getByTitle('Temperatura do Ar (°C)')).toBeInTheDocument();
    expect(screen.getByText('Umid. Ar')).toBeInTheDocument();
    expect(screen.getByText('Temp. Água')).toBeInTheDocument();
    expect(screen.getByTitle('Temperatura da Água (°C)')).toBeInTheDocument();
    expect(screen.getByText('Umid. Solo')).toBeInTheDocument();
    expect(screen.getByText('28.10 °C')).toBeInTheDocument();
    expect(screen.queryByText(/BMP280/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/BMP:/i)).not.toBeInTheDocument();

    // Umidade Ar e Pressão
    expect(screen.getByText('79.23%')).toBeInTheDocument();
    expect(screen.getByText('951.51 hPa')).toBeInTheDocument();

    // Chuva, Luz (LDR) e Fumaça (MQ-2) em colunas separadas
    expect(screen.getByText('Chuva')).toBeInTheDocument();
    expect(screen.getByText('Luz')).toBeInTheDocument();
    expect(screen.getByText('Fumaça')).toBeInTheDocument();
    expect(screen.queryByText(/Chuva & Sensores/i)).not.toBeInTheDocument();
    expect(screen.getByText(/NÃO/i)).toBeInTheDocument();
    expect(screen.getByTitle('Luminosidade (LDR ADC)')).toHaveTextContent('0 ADC');
    expect(screen.getByTitle('Gás / Fumaça (MQ-2 ADC)')).toHaveTextContent('0 ADC');

    // Bateria
    expect(screen.getByText('100.0%')).toBeInTheDocument();
    expect(screen.getByText('NORMAL')).toBeInTheDocument();

    // Solo
    expect(screen.getByText('27.87 °C')).toBeInTheDocument();
    expect(screen.getByText(/ADC: 3094/i)).toBeInTheDocument();

    // GPS e Altitude
    expect(screen.getByText(/Alt: 538.9m/i)).toBeInTheDocument();
    expect(screen.getByText(/Sat: 9/i)).toBeInTheDocument();

    // Alterna para a aba de Gráficos
    const btnGraficos = screen.getByRole('button', { name: /Gráficos/i });
    fireEvent.click(btnGraficos);

    // Deve exibir os seletores de métricas (incluindo Temperatura da Água) e os KPIs
    expect(screen.getByRole('button', { name: /Temperatura da Água/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Luminosidade \(LDR ADC\)/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Gás \/ Fumaça \(MQ-2 ADC\)/i })).toBeInTheDocument();
    expect(screen.getByText('Média do Período')).toBeInTheDocument();
    expect(screen.getByText('Última Leitura')).toBeInTheDocument();
  });

  it('mantém a barra de seleção de rota fixa e calcula distância ao selecionar 2 pontos com GPS', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      data: {
        dispositivo_id: 'Animal_Rota',
        tipo: 'animal',
        total: 2,
        medicoes: [
          {
            _id: 'p2',
            data_hora: '2026-11-12T15:05:00Z',
            temperatura_corporal: 38.6,
            frequencia_cardiaca: 72,
            latitude: -21.1370,
            longitude: -48.9730,
          },
          {
            _id: 'p1',
            data_hora: '2026-11-12T15:00:00Z',
            temperatura_corporal: 38.4,
            frequencia_cardiaca: 70,
            latitude: -21.1380,
            longitude: -48.9740,
          },
        ],
      },
    });

    render(
      <HistoricoMedicoesModal
        isOpen={true}
        onClose={vi.fn()}
        dispositivoId="Animal_Rota"
        nomeItem="Boi Rota"
        tipo="animal"
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Selecionar todos com GPS \(2\)/i)).toBeInTheDocument();
    });

    const btnSelecionarTodos = screen.getByRole('button', { name: /Selecionar todos com GPS/i });
    fireEvent.click(btnSelecionarTodos);

    expect(screen.getByText(/Distância estimada:/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ver Rota no Mapa \(2 pts\)/i })).not.toBeDisabled();
  });
});

