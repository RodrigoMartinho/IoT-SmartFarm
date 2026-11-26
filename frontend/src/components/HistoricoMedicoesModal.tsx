import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { MapContainer, TileLayer, Marker, Popup, Polygon, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { 
  X, 
  RefreshCw, 
  History, 
  Activity, 
  Radio, 
  MapPin, 
  Thermometer, 
  Heart, 
  Gauge, 
  Droplets, 
  Compass, 
  AlertTriangle,
  Clock,
  Calendar,
  Trash2,
  Zap,
  CloudRain,
  Sun,
  Flame,
  Battery,
  Table,
  LineChart,
  Navigation,
  CheckSquare,
  Maximize2,
  Minimize2,
  Download
} from 'lucide-react';
import { api } from '../services/api';
import { obterInfoPosturaAnimal, obterAcelerometroAnimal } from '../utils/postura';
import { GraficoTelemetria } from './GraficoTelemetria';
import { useProperty } from '../context/PropertyContext';

const temCoordenadaGpsValida = (m: any): boolean => {
  if (!m || m.latitude === undefined || m.longitude === undefined || m.latitude === null || m.longitude === null) {
    return false;
  }
  const lat = Number(m.latitude);
  const lng = Number(m.longitude);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return false;
  if (lat === 0 && lng === 0) return false;
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
};

const calcularDistanciaHaversineMetros = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371000; // Raio médio da Terra em metros
  const toRad = (graus: number) => (graus * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const formatarDistanciaMetros = (metros: number): string => {
  if (metros < 1000) {
    return `${metros.toFixed(1)} m`;
  }
  return `${(metros / 1000).toFixed(2)} km (${Math.round(metros)} m)`;
};

const criarIconePontoRota = (ordem: number, total: number) => {
  const ehInicio = ordem === 1;
  const ehFim = ordem === total;
  const corFundo = ehInicio ? '#2E7D32' : ehFim ? '#D32F2F' : '#1976D2';
  const tamanho = ehInicio || ehFim ? 32 : 26;
  const texto = ehInicio ? `1` : ehFim ? `${ordem}` : `${ordem}`;

  return L.divIcon({
    className: 'custom-route-point-icon',
    html: `<div style="background-color: ${corFundo}; color: white; width: ${tamanho}px; height: ${tamanho}px; border-radius: 50%; border: 2.5px solid white; display: flex; align-items: center; justify-content: center; box-shadow: 0 3px 8px rgba(0,0,0,0.4); font-weight: 800; font-size: 11px; font-family: monospace;">${texto}</div>`,
    iconSize: [tamanho, tamanho],
    iconAnchor: [tamanho / 2, tamanho / 2],
  });
};

const AjustarBoundsRota: React.FC<{ posicoes: [number, number][]; maximizado?: boolean }> = ({ posicoes, maximizado }) => {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
      if (posicoes.length >= 2) {
        const bounds = L.latLngBounds(posicoes);
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 18 });
      }
    }, 60);
    return () => clearTimeout(timer);
  }, [map, posicoes, maximizado]);
  return null;
};

const RedimensionarMapa: React.FC<{ maximizado: boolean }> = ({ maximizado }) => {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 60);
    return () => clearTimeout(timer);
  }, [map, maximizado]);
  return null;
};

const criarIconeMapaHistorico = (tipo: 'animal' | 'equipamento' | 'estacao_ambiental') => {
  const config =
    tipo === 'animal'
      ? { cor: '#2E7D32', emoji: '🐄' }
      : tipo === 'equipamento'
      ? { cor: '#1976D2', emoji: '🚜' }
      : { cor: '#F9A825', emoji: '🌤️' };

  return L.divIcon({
    className: 'custom-history-map-icon',
    html: `<div style="background-color: ${config.cor}; width: 36px; height: 36px; border-radius: 50%; border: 3px solid white; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 10px rgba(0,0,0,0.35); font-size: 18px;">${config.emoji}</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
};

interface HistoricoMedicoesModalProps {
  isOpen: boolean;
  onClose: () => void;
  dispositivoId: string;
  nomeItem: string;
  tipo: 'animal' | 'equipamento' | 'estacao_ambiental';
}

const obterDataLocalHoje = () => {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = String(hoje.getMonth() + 1).padStart(2, '0');
  const dia = String(hoje.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
};

export const HistoricoMedicoesModal: React.FC<HistoricoMedicoesModalProps> = ({
  isOpen,
  onClose,
  dispositivoId,
  nomeItem,
  tipo,
}) => {
  const { selectedProperty } = useProperty();
  const [medicoes, setMedicoes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limite, setLimite] = useState(50);
  const [totalGeral, setTotalGeral] = useState<number | null>(null);
  const [temMais, setTemMais] = useState(false);
  const [loadingMais, setLoadingMais] = useState(false);
  const [dataFiltro, setDataFiltro] = useState<string>(() => obterDataLocalHoje());
  const [clearing, setClearing] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [abaAtiva, setAbaAtiva] = useState<'tabela' | 'grafico'>('tabela');
  const [pontoMapa, setPontoMapa] = useState<{
    lat: number;
    lng: number;
    dataHora: string;
    medicao: any;
  } | null>(null);
  const [indicesSelecionados, setIndicesSelecionados] = useState<number[]>([]);
  const [exibirMapaRota, setExibirMapaRota] = useState(false);
  const [mapaMaximizado, setMapaMaximizado] = useState(false);

  const PALAVRA_CONFIRMACAO = 'apagar definitivamente';

  const carregarHistorico = async () => {
    if (!dispositivoId) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('limite', String(limite));
      params.set('pular', '0');
      if (dataFiltro) {
        const [ano, mes, dia] = dataFiltro.split('-').map(Number);
        if (ano && mes && dia) {
          const inicioLocal = new Date(ano, mes - 1, dia, 0, 0, 0, 0);
          const fimLocal = new Date(ano, mes - 1, dia, 23, 59, 59, 999);
          params.set('data', dataFiltro);
          params.set('data_inicio', inicioLocal.toISOString());
          params.set('data_fim', fimLocal.toISOString());
        }
      }
      const res = await api.get(`/telemetria/historico/${dispositivoId}?${params.toString()}`);
      const dados = res.data.medicoes || res.data.records || [];
      setMedicoes(dados);
      setTotalGeral(res.data.total_geral ?? null);
      setTemMais(Boolean(res.data.tem_mais));
      setIndicesSelecionados([]);
    } catch (err: any) {
      console.error('Erro ao buscar histórico de telemetria:', err);
      setError(err.response?.data?.detail || 'Erro ao carregar medições do banco de dados MongoDB.');
    } finally {
      setLoading(false);
    }
  };

  const carregarMais = async () => {
    if (!dispositivoId || loadingMais) return;
    setLoadingMais(true);
    try {
      const params = new URLSearchParams();
      const loteTamanho = Math.min(limite, 200);
      params.set('limite', String(loteTamanho));
      params.set('pular', String(medicoes.length));
      if (dataFiltro) {
        const [ano, mes, dia] = dataFiltro.split('-').map(Number);
        if (ano && mes && dia) {
          const inicioLocal = new Date(ano, mes - 1, dia, 0, 0, 0, 0);
          const fimLocal = new Date(ano, mes - 1, dia, 23, 59, 59, 999);
          params.set('data', dataFiltro);
          params.set('data_inicio', inicioLocal.toISOString());
          params.set('data_fim', fimLocal.toISOString());
        }
      }
      const res = await api.get(`/telemetria/historico/${dispositivoId}?${params.toString()}`);
      const novos = res.data.medicoes || res.data.records || [];
      if (novos.length > 0) {
        setMedicoes((prev) => [...prev, ...novos]);
      }
      setTotalGeral(res.data.total_geral ?? null);
      setTemMais(Boolean(res.data.tem_mais));
    } catch (err: any) {
      console.error('Erro ao carregar mais medições:', err);
    } finally {
      setLoadingMais(false);
    }
  };

  const exportarCSV = () => {
    if (medicoes.length === 0) return;

    let headers: string[] = ['Data/Hora', 'Latitude', 'Longitude'];
    if (tipo === 'animal') {
      headers = [
        'Data/Hora',
        'Temperatura Corporal (°C)',
        'Frequência Cardíaca (BPM)',
        'Postura/Atividade',
        'Força G',
        'Latitude',
        'Longitude',
        'Satélites',
      ];
    } else if (tipo === 'equipamento') {
      headers = [
        'Data/Hora',
        'Status Motor',
        'Velocidade (km/h)',
        'Corrente (A)',
        'Latitude',
        'Longitude',
        'Satélites',
      ];
    } else if (tipo === 'estacao_ambiental') {
      headers = [
        'Data/Hora',
        'Temp. Ar (°C)',
        'Umidade Ar (%)',
        'Pressão (hPa)',
        'Temp. Água (°C)',
        'Umid. Solo (%)',
        'Chuva',
        'Luz (LDR ADC)',
        'Fumaça (MQ-2 ADC)',
        'Latitude',
        'Longitude',
      ];
    }

    const linhas = medicoes.map((m) => {
      const dt = m.data_hora || m.timestamp || '';
      const lat = m.latitude ?? '';
      const lng = m.longitude ?? '';

      if (tipo === 'animal') {
        const infoPostura = obterInfoPosturaAnimal(m);
        return [
          `"${dt}"`,
          m.temperatura_corporal ?? m.body_temperature ?? '',
          m.frequencia_cardiaca ?? m.heart_rate ?? '',
          `"${infoPostura?.texto || ''}"`,
          m.forca_g ?? '',
          lat,
          lng,
          m.satelites ?? m.satellites ?? '',
        ].join(';');
      } else if (tipo === 'equipamento') {
        const isLigado =
          String(m.status || m.status_motor || '').toLowerCase() === 'ligado' || m.ligado === true;
        return [
          `"${dt}"`,
          isLigado ? 'Ligado' : 'Desligado',
          m.velocidade ?? m.speed ?? '0.0',
          m.corrente_a ?? '',
          lat,
          lng,
          m.satelites ?? m.satellites ?? '',
        ].join(';');
      } else if (tipo === 'estacao_ambiental') {
        const tempAr = m.temperatura_ar_C ?? m.temperatura ?? '';
        const umidAr = m.umidade_ar_percentual ?? m.umidade ?? '';
        const pressao = m.pressao_hPa ?? m.pressao_atmosferica ?? '';
        const tempSolo = m.temperatura_solo_C ?? m.temperatura_solo ?? '';
        const umidSolo = m.umidade_solo ?? m.soil_moisture ?? '';
        const isChovendo =
          m.chuva === true || String(m.chuva).toUpperCase() === 'SIM' ? 'Sim' : 'Não';
        const lumAdc = m.luminosidade_adc ?? '';
        const mq2Adc = m.mq2_adc ?? '';
        return [
          `"${dt}"`,
          tempAr,
          umidAr,
          pressao,
          tempSolo,
          umidSolo,
          isChovendo,
          lumAdc,
          mq2Adc,
          lat,
          lng,
        ].join(';');
      }

      return [`"${dt}"`, lat, lng].join(';');
    });

    const csvContent = '\uFEFF' + [headers.join(';'), ...linhas].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute(
      'download',
      `historico_${tipo}_${dispositivoId}_${dataFiltro || 'todas_datas'}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const executarExclusao = async () => {
    if (!dispositivoId) return;
    if (confirmText.trim().toLowerCase() !== PALAVRA_CONFIRMACAO) return;

    setClearing(true);
    setError(null);
    try {
      await api.delete(`/telemetria/historico/${dispositivoId}`);
      setMedicoes([]);
      setIndicesSelecionados([]);
      setShowConfirmModal(false);
      setConfirmText('');
    } catch (err: any) {
      console.error('Erro ao limpar histórico:', err);
      setError(err.response?.data?.detail || 'Erro ao apagar histórico do banco de dados.');
    } finally {
      setClearing(false);
    }
  };

  useEffect(() => {
    if (isOpen && dispositivoId) {
      carregarHistorico();
    } else if (!isOpen) {
      setMedicoes([]);
      setError(null);
      setShowConfirmModal(false);
      setConfirmText('');
      setPontoMapa(null);
      setIndicesSelecionados([]);
      setExibirMapaRota(false);
      setDataFiltro(obterDataLocalHoje());
    }
  }, [isOpen, dispositivoId, limite, dataFiltro]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (pontoMapa) {
          setPontoMapa(null);
        } else if (exibirMapaRota) {
          setExibirMapaRota(false);
        } else if (showConfirmModal) {
          setShowConfirmModal(false);
        } else {
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, pontoMapa, exibirMapaRota, showConfirmModal, onClose]);

  if (!isOpen) return null;

  const indicesComGps = medicoes
    .map((m, idx) => (temCoordenadaGpsValida(m) ? idx : -1))
    .filter((idx) => idx !== -1);

  const todosGpsSelecionados =
    indicesComGps.length > 0 && indicesComGps.every((idx) => indicesSelecionados.includes(idx));

  const alternarSelecaoLinha = (idx: number) => {
    setIndicesSelecionados((prev) =>
      prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]
    );
  };

  const alternarTodosComGps = () => {
    if (todosGpsSelecionados) {
      setIndicesSelecionados([]);
    } else {
      setIndicesSelecionados(indicesComGps);
    }
  };

  const calcularDadosRotaSelecionada = () => {
    const selecionadas = indicesSelecionados
      .map((idx) => ({ idx, medicao: medicoes[idx] }))
      .filter((item) => item.medicao && temCoordenadaGpsValida(item.medicao));

    // Ordena do mais antigo para o mais recente para traçar a rota na ordem cronológica real
    selecionadas.sort((a, b) => {
      const tA = new Date(a.medicao.data_hora || a.medicao.timestamp || 0).getTime();
      const tB = new Date(b.medicao.data_hora || b.medicao.timestamp || 0).getTime();
      if (!Number.isNaN(tA) && !Number.isNaN(tB) && tA !== tB) {
        return tA - tB;
      }
      return b.idx - a.idx;
    });

    let distanciaTotalMetros = 0;
    const pontos = selecionadas.map((item, i) => {
      const lat = Number(item.medicao.latitude);
      const lng = Number(item.medicao.longitude);
      let distanciaTrechoMetros = 0;
      if (i > 0) {
        const ant = selecionadas[i - 1].medicao;
        distanciaTrechoMetros = calcularDistanciaHaversineMetros(
          Number(ant.latitude),
          Number(ant.longitude),
          lat,
          lng
        );
        distanciaTotalMetros += distanciaTrechoMetros;
      }

      const rawDt = item.medicao.data_hora || item.medicao.timestamp;
      let dataHoraFormatada = 'N/D';
      if (rawDt) {
        const strUtc =
          typeof rawDt === 'string' && !rawDt.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(rawDt)
            ? `${rawDt}Z`
            : rawDt;
        const parsed = new Date(strUtc);
        dataHoraFormatada = Number.isNaN(parsed.getTime())
          ? String(rawDt)
          : parsed.toLocaleString('pt-BR', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            });
      }

      return {
        ordem: i + 1,
        lat,
        lng,
        dataHora: dataHoraFormatada,
        distanciaTrechoMetros,
        distanciaAcumuladaMetros: distanciaTotalMetros,
        medicao: item.medicao,
      };
    });

    return {
      pontos,
      posicoes: pontos.map((p) => [p.lat, p.lng] as [number, number]),
      distanciaTotalMetros,
    };
  };

  const dadosRota = calcularDadosRotaSelecionada();

  const getTipoLabel = () => {
    switch (tipo) {
      case 'animal':
        return { label: 'Animal (Coleira)', icon: '🐄', color: 'bg-natureGreen/10 text-natureGreen' };
      case 'equipamento':
        return { label: 'Máquina Agrícola (GPS)', icon: '🚜', color: 'bg-iotBlue/10 text-iotBlue' };
      case 'estacao_ambiental':
        return { label: 'Estação Meteorológica e Solo', icon: '🌤️', color: 'bg-alertAmber/10 text-amber-800' };
    }
  };

  const tipoInfo = getTipoLabel();
  const hojeStr = obterDataLocalHoje();
  const dataFormatadaFiltro = dataFiltro ? dataFiltro.split('-').reverse().join('/') : 'Todas as datas';

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-graphiteText/80 backdrop-blur-xs p-4 sm:p-6 animate-in fade-in duration-200">
      <div className={`bg-white rounded-3xl shadow-2xl border border-gray-200 w-full ${tipo === 'estacao_ambiental' ? 'max-w-7xl' : 'max-w-5xl'} max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200`}>
        
        {/* Cabeçalho */}
        <div className="bg-trustBlue text-white px-6 py-4 flex items-center justify-between border-b border-gray-700">
          <div className="flex items-center space-x-3">
            <div className="bg-white/10 p-2.5 rounded-2xl text-natureGreen">
              <History className="h-6 w-6 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-extrabold text-lg text-white">Histórico de Medições IoT</h3>
                <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-white/20 text-white">
                  {tipoInfo.icon} {nomeItem}
                </span>
              </div>
              <p className="text-xs text-gray-300 font-mono mt-0.5 flex items-center space-x-1.5">
                <Radio className="h-3.5 w-3.5 text-natureGreen" />
                <span>Sensor ID: <strong>{dispositivoId}</strong></span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-gray-300 hover:text-white p-2 rounded-xl hover:bg-white/10 transition"
            title="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Barra de Controles e Filtros */}
        <div className="bg-gray-50 border-b border-gray-200 px-6 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-semibold text-gray-600">
              Total exibido: <strong className="text-graphiteText">{medicoes.length}</strong>
              {totalGeral !== null && totalGeral > medicoes.length && (
                <span> de <strong className="text-natureGreen font-bold">{totalGeral}</strong> no banco</span>
              )} medições
            </span>
            <span className="text-gray-300">|</span>

            {/* Filtro por Data */}
            <div className="flex items-center space-x-1.5 text-gray-600">
              <Calendar className="h-3.5 w-3.5 text-natureGreen" />
              <span className="font-semibold">Data:</span>
              <input
                type="date"
                aria-label="Filtrar por data"
                value={dataFiltro}
                onChange={(e) => setDataFiltro(e.target.value)}
                className="bg-white border border-gray-300 rounded-lg px-2.5 py-1 text-xs font-semibold text-graphiteText focus:outline-none focus:ring-2 focus:ring-natureGreen/30"
              />
              {dataFiltro !== hojeStr && (
                <button
                  type="button"
                  onClick={() => setDataFiltro(hojeStr)}
                  className="px-2 py-1 rounded-lg bg-natureGreen/10 hover:bg-natureGreen/20 text-natureGreen font-bold transition"
                  title="Voltar para o dia atual"
                >
                  Hoje
                </button>
              )}
              {dataFiltro !== '' && (
                <button
                  type="button"
                  onClick={() => setDataFiltro('')}
                  className="px-2 py-1 rounded-lg bg-gray-200/80 hover:bg-gray-300 text-gray-700 font-semibold transition"
                  title="Exibir medições de todas as datas"
                >
                  Todas
                </button>
              )}
            </div>

            <span className="text-gray-300">|</span>
            <div className="flex items-center space-x-1.5 text-gray-600">
              <span>Carregar:</span>
              <select
                value={limite}
                onChange={(e) => setLimite(Number(e.target.value))}
                className="bg-white border border-gray-300 rounded-lg px-2.5 py-1 text-xs font-semibold text-graphiteText focus:outline-none focus:ring-2 focus:ring-natureGreen/30"
              >
                <option value={20}>20 registros</option>
                <option value={50}>50 registros</option>
                <option value={100}>100 registros</option>
                <option value={200}>200 registros</option>
                <option value={500}>500 registros</option>
                <option value={1000}>1.000 registros</option>
              </select>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* Alternador de visualização: Tabela ou Gráficos */}
            <div className="flex items-center bg-gray-200/80 p-0.5 rounded-xl border border-gray-300">
              <button
                type="button"
                onClick={() => setAbaAtiva('tabela')}
                className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition ${
                  abaAtiva === 'tabela'
                    ? 'bg-white text-graphiteText shadow-2xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Table className="h-3.5 w-3.5" />
                <span>Tabela</span>
              </button>
              <button
                type="button"
                onClick={() => setAbaAtiva('grafico')}
                className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition ${
                  abaAtiva === 'grafico'
                    ? 'bg-white text-graphiteText shadow-2xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <LineChart className="h-3.5 w-3.5 text-natureGreen" />
                <span>Gráficos</span>
              </button>
            </div>

            <button
              onClick={exportarCSV}
              disabled={loading || clearing || medicoes.length === 0}
              className="bg-white hover:bg-gray-100 text-graphiteText font-semibold px-3 py-1.5 rounded-xl border border-gray-300 shadow-2xs flex items-center space-x-1.5 transition disabled:opacity-40"
              title="Baixar medições exibidas em arquivo CSV compatível com Excel"
            >
              <Download className="h-3.5 w-3.5 text-iotBlue" />
              <span>Exportar CSV</span>
            </button>

            <button
              onClick={carregarHistorico}
              disabled={loading || clearing}
              className="bg-white hover:bg-gray-100 text-graphiteText font-semibold px-3 py-1.5 rounded-xl border border-gray-300 shadow-2xs flex items-center space-x-1.5 transition disabled:opacity-50"
              title="Recarregar medições"
            >
              <RefreshCw className={`h-3.5 w-3.5 text-natureGreen ${loading ? 'animate-spin' : ''}`} />
              <span>{loading ? 'Atualizando...' : 'Atualizar Dados'}</span>
            </button>

            <button
              onClick={() => {
                setConfirmText('');
                setShowConfirmModal(true);
              }}
              disabled={loading || clearing || medicoes.length === 0}
              className="bg-red-50 hover:bg-red-100 text-criticalRed font-semibold px-3 py-1.5 rounded-xl border border-red-200 shadow-2xs flex items-center space-x-1.5 transition disabled:opacity-40 disabled:cursor-not-allowed"
              title="Apagar permanentemente todo o histórico deste dispositivo no banco"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Limpar Histórico</span>
            </button>
          </div>
        </div>

        {/* Barra Fixa de Seleção de Pontos para Rota e Distância (sempre visível ao rolar a tabela) */}
        {abaAtiva === 'tabela' && !error && medicoes.length > 0 && indicesComGps.length > 0 && (
          <div className="bg-blue-50/90 border-b border-iotBlue/20 px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
            <div className="flex flex-wrap items-center gap-2 text-graphiteText">
              <Navigation className="h-4 w-4 text-iotBlue shrink-0" />
              <span>
                Selecione <strong>2 ou mais medições com GPS</strong> na tabela para traçar a rota e calcular a distância percorrida.
              </span>
              {dadosRota.pontos.length >= 2 && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-natureGreen/15 text-natureGreen font-bold font-mono text-[11px]">
                  Distância estimada: {formatarDistanciaMetros(dadosRota.distanciaTotalMetros)}
                </span>
              )}
            </div>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={alternarTodosComGps}
                className="px-3 py-1.5 rounded-xl bg-white hover:bg-gray-100 text-gray-700 border border-gray-300 font-semibold transition flex items-center space-x-1.5 cursor-pointer"
              >
                <CheckSquare className="h-3.5 w-3.5 text-iotBlue" />
                <span>
                  {todosGpsSelecionados
                    ? 'Desmarcar todos'
                    : `Selecionar todos com GPS (${indicesComGps.length})`}
                </span>
              </button>

              <button
                type="button"
                disabled={dadosRota.pontos.length < 2}
                onClick={() => setExibirMapaRota(true)}
                className="px-3.5 py-1.5 rounded-xl bg-iotBlue hover:bg-blue-700 text-white font-bold shadow-xs transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center space-x-1.5 cursor-pointer"
              >
                <MapPin className="h-3.5 w-3.5" />
                <span>Ver Rota no Mapa ({dadosRota.pontos.length} pts)</span>
              </button>
            </div>
          </div>
        )}

        {/* Conteúdo Principal (Tabela Rolável) */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading && medicoes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400 space-y-3">
              <RefreshCw className="h-8 w-8 animate-spin text-natureGreen" />
              <p className="font-medium text-sm">Consultando histórico no MongoDB...</p>
            </div>
          ) : error ? (
            <div className="p-6 bg-red-50 border border-red-200 rounded-2xl text-criticalRed flex items-center space-x-3">
              <AlertTriangle className="h-6 w-6 shrink-0" />
              <div>
                <p className="font-bold text-sm">Falha ao obter telemetrias</p>
                <p className="text-xs text-red-700 mt-0.5">{error}</p>
              </div>
            </div>
          ) : medicoes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-gray-400 space-y-3 bg-gray-50/50 rounded-2xl border border-dashed border-gray-200">
              <Activity className="h-10 w-10 text-gray-300" />
              <div>
                <p className="font-bold text-graphiteText text-sm">
                  {dataFiltro
                    ? `Nenhuma medição registrada em ${dataFormatadaFiltro}`
                    : 'Nenhuma medição registrada ainda'}
                </p>
                <p className="text-xs text-gray-500 max-w-md mt-1">
                  Não foram encontradas telemetrias para o identificador <strong>{dispositivoId}</strong>
                  {dataFiltro ? ` na data ${dataFormatadaFiltro}.` : '.'}
                </p>
                {dataFiltro && (
                  <button
                    type="button"
                    onClick={() => setDataFiltro('')}
                    className="mt-3 inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl bg-trustBlue text-white font-bold text-xs hover:bg-trustBlue/90 transition"
                  >
                    <Calendar className="h-3.5 w-3.5" />
                    <span>Ver histórico de todas as datas</span>
                  </button>
                )}
              </div>
            </div>
          ) : abaAtiva === 'grafico' ? (
            <GraficoTelemetria medicoes={medicoes} tipo={tipo} />
          ) : (
            <div className="space-y-3">
              <div className="overflow-x-auto rounded-2xl border border-gray-200 shadow-2xs">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-gray-100/80 text-gray-600 font-bold border-b border-gray-200">
                      <th className="py-3 px-3 w-10 text-center">
                        <input
                          type="checkbox"
                          aria-label="Selecionar todas as medições com GPS para rota"
                          checked={todosGpsSelecionados}
                          disabled={indicesComGps.length === 0}
                          onChange={alternarTodosComGps}
                          title="Selecionar/desmarcar todas as medições com GPS válido"
                          className="h-3.5 w-3.5 rounded border-gray-300 text-iotBlue focus:ring-iotBlue cursor-pointer disabled:opacity-40"
                        />
                      </th>
                      <th className="py-3 px-4">
                        <div className="flex items-center space-x-1.5">
                          <Clock className="h-3.5 w-3.5 text-gray-500" />
                          <span>Data e hora</span>
                        </div>
                      </th>

                    {tipo === 'animal' && (
                      <>
                        <th className="py-3 px-4">
                          <div className="flex items-center space-x-1.5">
                            <Thermometer className="h-3.5 w-3.5 text-criticalRed" />
                            <span>Temperatura corporal</span>
                          </div>
                        </th>
                        <th className="py-3 px-4">
                          <div className="flex items-center space-x-1.5">
                            <Heart className="h-3.5 w-3.5 text-red-500" />
                            <span>Frequência cardíaca</span>
                          </div>
                        </th>
                        <th className="py-3 px-4">
                          <div className="flex items-center space-x-1.5">
                            <MapPin className="h-3.5 w-3.5 text-natureGreen" />
                            <span>Localização GPS</span>
                          </div>
                        </th>
                        <th className="py-3 px-4">
                          <div className="flex items-center space-x-1.5">
                            <Compass className="h-3.5 w-3.5 text-iotBlue" />
                            <span>Postura / Acelerômetro</span>
                          </div>
                        </th>
                      </>
                    )}

                    {tipo === 'equipamento' && (
                      <>
                        <th className="py-3 px-4">
                          <div className="flex items-center space-x-1.5">
                            <Activity className="h-3.5 w-3.5 text-natureGreen" />
                            <span>Status do motor</span>
                          </div>
                        </th>
                        <th className="py-3 px-4">
                          <div className="flex items-center space-x-1.5">
                            <Gauge className="h-3.5 w-3.5 text-iotBlue" />
                            <span>Velocidade</span>
                          </div>
                        </th>
                        <th className="py-3 px-4">
                          <div className="flex items-center space-x-1.5">
                            <Zap className="h-3.5 w-3.5 text-amber-500" />
                            <span>Corrente (A)</span>
                          </div>
                        </th>
                        <th className="py-3 px-4">
                          <div className="flex items-center space-x-1.5">
                            <MapPin className="h-3.5 w-3.5 text-natureGreen" />
                            <span>Localização GPS</span>
                          </div>
                        </th>
                      </>
                    )}

                    {tipo === 'estacao_ambiental' && (
                      <>
                        <th className="py-3 px-2.5 whitespace-nowrap cursor-help" title="Temperatura do Ar (°C)">
                          <div className="flex items-center space-x-1">
                            <Thermometer className="h-3.5 w-3.5 text-alertAmber shrink-0" />
                            <span>Temp. Ar</span>
                          </div>
                        </th>
                        <th className="py-3 px-2.5 whitespace-nowrap cursor-help" title="Umidade Relativa do Ar (%)">
                          <div className="flex items-center space-x-1">
                            <Droplets className="h-3.5 w-3.5 text-iotBlue shrink-0" />
                            <span>Umid. Ar</span>
                          </div>
                        </th>
                        <th className="py-3 px-2.5 whitespace-nowrap cursor-help" title="Pressão Atmosférica (hPa)">
                          <div className="flex items-center space-x-1">
                            <Gauge className="h-3.5 w-3.5 text-purple-600 shrink-0" />
                            <span>Pressão</span>
                          </div>
                        </th>
                        <th className="py-3 px-2.5 whitespace-nowrap cursor-help" title="Temperatura da Água (°C)">
                          <div className="flex items-center space-x-1">
                            <Thermometer className="h-3.5 w-3.5 text-cyan-600 shrink-0" />
                            <span>Temp. Água</span>
                          </div>
                        </th>
                        <th className="py-3 px-2.5 whitespace-nowrap cursor-help" title="Umidade do Solo (% e leitura ADC)">
                          <div className="flex items-center space-x-1">
                            <Droplets className="h-3.5 w-3.5 text-natureGreen shrink-0" />
                            <span>Umid. Solo</span>
                          </div>
                        </th>
                        <th className="py-3 px-2.5 whitespace-nowrap cursor-help" title="Detector de Chuva">
                          <div className="flex items-center space-x-1">
                            <CloudRain className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                            <span>Chuva</span>
                          </div>
                        </th>
                        <th className="py-3 px-2.5 whitespace-nowrap cursor-help" title="Luminosidade (Sensor LDR - leitura ADC)">
                          <div className="flex items-center space-x-1">
                            <Sun className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                            <span>Luz</span>
                          </div>
                        </th>
                        <th className="py-3 px-2.5 whitespace-nowrap cursor-help" title="Gás / Fumaça (Sensor MQ-2 - leitura ADC)">
                          <div className="flex items-center space-x-1">
                            <Flame className="h-3.5 w-3.5 text-pink-500 shrink-0" />
                            <span>Fumaça</span>
                          </div>
                        </th>
                        <th className="py-3 px-3 whitespace-nowrap">
                          <div className="flex items-center space-x-1">
                            <MapPin className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                            <span>GPS / Altitude</span>
                          </div>
                        </th>
                        <th className="py-3 px-3 whitespace-nowrap">
                          <div className="flex items-center space-x-1">
                            <Battery className="h-3.5 w-3.5 text-natureGreen shrink-0" />
                            <span>Bateria & Modo</span>
                          </div>
                        </th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-medium">
                  {medicoes.map((m, idx) => {
                    const dataHoraRaw = m.data_hora || m.timestamp;
                    let dataFormatada = 'N/D';
                    let dataParte = '';
                    let horaParte = '';
                    if (dataHoraRaw) {
                      // Se a string não contiver fuso (Z ou +00:00 / -03:00), força a interpretação como UTC
                      const strUtc = typeof dataHoraRaw === 'string' && !dataHoraRaw.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(dataHoraRaw)
                        ? `${dataHoraRaw}Z`
                        : dataHoraRaw;
                      const parsed = new Date(strUtc);
                      if (isNaN(parsed.getTime())) {
                        dataFormatada = String(dataHoraRaw);
                      } else {
                        dataParte = parsed.toLocaleDateString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                        });
                        horaParte = parsed.toLocaleTimeString('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        });
                        dataFormatada = `${dataParte}, ${horaParte}`;
                      }
                    }

                    const temGpsLinha = temCoordenadaGpsValida(m);
                    const linhaSelecionada = indicesSelecionados.includes(idx);

                    return (
                      <tr
                        key={m._id || idx}
                        className={`transition ${
                          linhaSelecionada ? 'bg-blue-50/70 hover:bg-blue-100/60' : 'hover:bg-blue-50/40'
                        }`}
                      >
                        {/* Checkbox de seleção para Rota */}
                        <td className="py-3 px-3 text-center">
                          <input
                            type="checkbox"
                            aria-label={`Selecionar medição ${idx + 1} para rota`}
                            checked={linhaSelecionada}
                            disabled={!temGpsLinha}
                            onChange={() => alternarSelecaoLinha(idx)}
                            title={
                              temGpsLinha
                                ? 'Incluir este ponto na rota do mapa'
                                : 'Esta medição não possui coordenada GPS válida'
                            }
                            className="h-3.5 w-3.5 rounded border-gray-300 text-iotBlue focus:ring-iotBlue cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                          />
                        </td>

                        {/* Data e Hora */}
                        <td className="py-3 px-3 font-mono text-gray-600 whitespace-nowrap">
                          {dataParte && horaParte ? (
                            <div className="flex flex-col leading-tight">
                              <span className="font-semibold text-gray-700 text-[11px]">{dataParte}</span>
                              <span className="text-[11px] text-gray-500">{horaParte}</span>
                            </div>
                          ) : (
                            dataFormatada
                          )}
                        </td>

                        {/* Colunas do Animal */}
                        {tipo === 'animal' && (
                          <>
                            <td className="py-3 px-4">
                              {m.sensor_temp_ok !== false && (m.temperatura_corporal != null || m.body_temperature != null) ? (
                                (() => {
                                  const val = m.temperatura_corporal ?? m.body_temperature;
                                  const isFebre = val > 39.5;
                                  return (
                                    <span
                                      className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold font-mono ${
                                        isFebre
                                          ? 'bg-criticalRed/15 text-criticalRed animate-pulse'
                                          : 'bg-gray-100 text-gray-800'
                                      }`}
                                    >
                                      {val.toFixed(1)} °C {isFebre ? '🔥 Febre' : ''}
                                    </span>
                                  );
                                })()
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                            <td className="py-3 px-4">
                              {m.frequencia_cardiaca != null || m.heart_rate != null ? (
                                (() => {
                                  const val = m.frequencia_cardiaca ?? m.heart_rate;
                                  const isAnormal = val > 120 || val < 45;
                                  return (
                                    <span
                                      className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold font-mono ${
                                        isAnormal
                                          ? 'bg-amber-100 text-amber-800'
                                          : 'bg-gray-100 text-gray-800'
                                      }`}
                                    >
                                      {val} bpm
                                    </span>
                                  );
                                })()
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                            <td className="py-3 px-4 font-mono text-gray-600">
                              {(() => {
                                const hasCoords = m.latitude !== undefined && m.longitude !== undefined && m.latitude !== null && m.longitude !== null;
                                const sat = m.satelites ?? m.satellites;
                                return (
                                  <div className="flex flex-col text-xs space-y-0.5">
                                    {hasCoords ? (
                                      <div className="flex items-center space-x-2">
                                        <span>{Number(m.latitude).toFixed(5)}, {Number(m.longitude).toFixed(5)}</span>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setPontoMapa({
                                              lat: Number(m.latitude),
                                              lng: Number(m.longitude),
                                              dataHora: dataFormatada,
                                              medicao: m,
                                            })
                                          }
                                          className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-natureGreen/10 hover:bg-natureGreen/20 text-natureGreen font-sans font-bold text-[11px] transition shadow-2xs cursor-pointer"
                                          title="Visualizar ponto no mapa integrado"
                                        >
                                          <MapPin className="h-3 w-3" />
                                          <span>Mapa</span>
                                        </button>
                                      </div>
                                    ) : (
                                      <span className="text-gray-400">-</span>
                                    )}
                                    {sat !== undefined && sat !== null && (
                                      <span className="text-[10px] text-gray-500 font-mono">
                                        🛰️ Sat: {sat}
                                      </span>
                                    )}
                                  </div>
                                );
                              })()}
                            </td>
                            <td className="py-3 px-4 text-gray-600">
                              {(() => {
                                const a = obterAcelerometroAnimal(m);
                                const infoPostura = obterInfoPosturaAnimal(m);
                                if (!a && !infoPostura) {
                                  return <span className="text-gray-400">-</span>;
                                }
                                return (
                                  <div className="flex flex-col items-start space-y-1">
                                    {infoPostura && (
                                      <span
                                        className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${infoPostura.classes}`}
                                      >
                                        <span>{infoPostura.icone}</span>
                                        <span>{infoPostura.texto}</span>
                                      </span>
                                    )}
                                    {a && (
                                      <span className="text-[11px] font-mono bg-gray-100 px-2 py-0.5 rounded text-gray-700">
                                        x: {a.x}, y: {a.y}, z: {a.z}
                                      </span>
                                    )}
                                  </div>
                                );
                              })()}
                            </td>
                          </>
                        )}

                        {/* Colunas do Equipamento */}
                        {tipo === 'equipamento' && (
                          <>
                            <td className="py-3 px-4">
                              {(() => {
                                const rawStatus = String(m.status || m.status_motor || m.engine_status || '').trim().toUpperCase();
                                const isLigado = rawStatus === 'LIGADO' || rawStatus === 'ON' || rawStatus === 'OPERANDO' || rawStatus === 'TRUE';
                                return (
                                  <span
                                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                                      isLigado
                                        ? 'bg-natureGreen/15 text-natureGreen'
                                        : 'bg-gray-100 text-gray-600'
                                    }`}
                                  >
                                    {isLigado ? '● Ligado' : '○ Desligado'}
                                  </span>
                                );
                              })()}
                            </td>
                            <td className="py-3 px-4 font-mono font-bold text-gray-700">
                              {m.velocidade !== undefined || m.speed !== undefined ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-xs bg-blue-50 text-iotBlue border border-blue-200">
                                  {Number(m.velocidade ?? m.speed).toFixed(1)} km/h
                                </span>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                            <td className="py-3 px-4 font-mono font-bold text-gray-700">
                              {m.corrente_a !== undefined ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-xs bg-amber-50 text-amber-800 border border-amber-200">
                                  {Number(m.corrente_a).toFixed(2)} A
                                </span>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                            <td className="py-3 px-4 font-mono text-gray-600">
                              {(() => {
                                const hasCoords = m.latitude !== undefined && m.longitude !== undefined && m.latitude !== null && m.longitude !== null;
                                const sat = m.satelites ?? m.satellites;
                                return (
                                  <div className="flex flex-col text-xs space-y-0.5">
                                    {hasCoords ? (
                                      <div className="flex items-center space-x-2">
                                        <span>{Number(m.latitude).toFixed(5)}, {Number(m.longitude).toFixed(5)}</span>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setPontoMapa({
                                              lat: Number(m.latitude),
                                              lng: Number(m.longitude),
                                              dataHora: dataFormatada,
                                              medicao: m,
                                            })
                                          }
                                          className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-natureGreen/10 hover:bg-natureGreen/20 text-natureGreen font-sans font-bold text-[11px] transition shadow-2xs cursor-pointer"
                                          title="Visualizar ponto no mapa integrado"
                                        >
                                          <MapPin className="h-3 w-3" />
                                          <span>Mapa</span>
                                        </button>
                                      </div>
                                    ) : (
                                      <span className="text-gray-400">-</span>
                                    )}
                                    {sat !== undefined && sat !== null && (
                                      <span className="text-[10px] text-gray-500 font-mono">
                                        🛰️ Sat: {sat}
                                      </span>
                                    )}
                                  </div>
                                );
                              })()}
                            </td>
                          </>
                        )}

                        {/* Colunas da Estação Ambiental */}
                        {tipo === 'estacao_ambiental' && (
                          <>
                            <td className="py-3 px-2.5 whitespace-nowrap">
                              {(() => {
                                const tempAr = m.temperatura_ar_C ?? m.temperatura ?? m.temperature;
                                return (
                                  <div className="flex flex-col text-xs font-mono space-y-0.5">
                                    <span className="font-bold text-gray-800">
                                      {tempAr !== undefined && tempAr !== null
                                        ? `${Number(tempAr).toFixed(2)} °C`
                                        : '-'}
                                    </span>
                                  </div>
                                );
                              })()}
                            </td>
                            <td className="py-3 px-2.5 whitespace-nowrap font-mono text-gray-700">
                              {(() => {
                                const umidAr = m.umidade_ar_percentual ?? m.umidade ?? m.humidity;
                                return umidAr !== undefined && umidAr !== null
                                  ? `${Number(umidAr).toFixed(2)}%`
                                  : '-';
                              })()}
                            </td>
                            <td className="py-3 px-2.5 whitespace-nowrap font-mono text-gray-600">
                              {(() => {
                                const pressao = m.pressao_hPa ?? m.pressao_atmosferica ?? m.atmospheric_pressure;
                                return pressao !== undefined && pressao !== null
                                  ? `${Number(pressao).toFixed(2)} hPa`
                                  : '-';
                              })()}
                            </td>
                            <td className="py-3 px-2.5 whitespace-nowrap">
                              {(() => {
                                const tempAgua = m.temperatura_solo_C ?? m.temperatura_solo;
                                const isDesconectado = tempAgua !== undefined && tempAgua !== null && (tempAgua === -127 || tempAgua < -100);
                                if (tempAgua === undefined || tempAgua === null) {
                                  return <span className="font-mono text-gray-400">-</span>;
                                }
                                return (
                                  <span className={`font-mono font-bold text-xs ${isDesconectado ? 'text-amber-600 text-[11px]' : 'text-gray-800'}`}>
                                    {isDesconectado ? `${Number(tempAgua).toFixed(1)} °C (Desc.)` : `${Number(tempAgua).toFixed(2)} °C`}
                                  </span>
                                );
                              })()}
                            </td>
                            <td className="py-3 px-2.5 whitespace-nowrap">
                              {(() => {
                                const umidSolo = m.umidade_solo ?? m.soil_moisture;
                                const umidSoloAdc = m.umidade_solo_adc;

                                return (
                                  <div className="flex flex-col text-xs space-y-0.5">
                                    {umidSolo !== undefined && umidSolo !== null ? (
                                      <span
                                        className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold font-mono w-fit ${
                                          umidSolo < 20.0
                                            ? 'bg-amber-100 text-amber-800'
                                            : 'bg-emerald-50 text-emerald-800'
                                        }`}
                                      >
                                        {Number(umidSolo).toFixed(1)}% {umidSolo < 20.0 ? '⚠️ Seco' : ''}
                                      </span>
                                    ) : (
                                      <span className="font-mono text-gray-400">-</span>
                                    )}
                                    {umidSoloAdc !== undefined && umidSoloAdc !== null && (
                                      <span className="text-[10px] font-mono text-gray-400">
                                        ADC: {umidSoloAdc}
                                      </span>
                                    )}
                                  </div>
                                );
                              })()}
                            </td>
                            <td className="py-3 px-3">
                              {(() => {
                                const chuva = m.chuva;
                                const isChovendo = chuva === true || String(chuva).toUpperCase() === 'SIM' || String(chuva).toUpperCase() === 'TRUE';

                                return chuva !== undefined && chuva !== null ? (
                                  <span
                                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold w-fit ${
                                      isChovendo ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'
                                    }`}
                                  >
                                    {isChovendo ? '🌧️ SIM' : '☀️ NÃO'}
                                  </span>
                                ) : (
                                  <span className="text-gray-400">-</span>
                                );
                              })()}
                            </td>
                            <td className="py-3 px-3 font-mono">
                              {(() => {
                                const lumAdc = m.luminosidade_adc;
                                return lumAdc !== undefined && lumAdc !== null ? (
                                  <span className="text-xs font-semibold text-amber-700" title="Luminosidade (LDR ADC)">
                                    {lumAdc} <span className="text-[10px] font-normal text-gray-400">ADC</span>
                                  </span>
                                ) : (
                                  <span className="text-gray-400">-</span>
                                );
                              })()}
                            </td>
                            <td className="py-3 px-3 font-mono">
                              {(() => {
                                const mq2Adc = m.mq2_adc;
                                return mq2Adc !== undefined && mq2Adc !== null ? (
                                  <span className="text-xs font-semibold text-pink-700" title="Gás / Fumaça (MQ-2 ADC)">
                                    {mq2Adc} <span className="text-[10px] font-normal text-gray-400">ADC</span>
                                  </span>
                                ) : (
                                  <span className="text-gray-400">-</span>
                                );
                              })()}
                            </td>
                            <td className="py-3 px-4 font-mono text-gray-600">
                              {(() => {
                                const hasCoords = m.latitude !== undefined && m.longitude !== undefined && m.latitude !== null && m.longitude !== null;
                                const alt = m.altitude_m ?? m.altitude;
                                const sat = m.satelites;

                                return (
                                  <div className="flex flex-col text-xs space-y-0.5">
                                    {hasCoords ? (
                                      <div className="flex items-center space-x-1.5">
                                        <span className="font-mono text-gray-700 text-[11px]">
                                          {Number(m.latitude).toFixed(5)}, {Number(m.longitude).toFixed(5)}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setPontoMapa({
                                              lat: Number(m.latitude),
                                              lng: Number(m.longitude),
                                              dataHora: dataFormatada,
                                              medicao: m,
                                            })
                                          }
                                          className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-natureGreen/10 hover:bg-natureGreen/20 text-natureGreen font-sans font-bold text-[11px] transition shadow-2xs cursor-pointer"
                                          title="Visualizar ponto no mapa integrado"
                                        >
                                          <MapPin className="h-3 w-3" />
                                          <span>Mapa</span>
                                        </button>
                                      </div>
                                    ) : (
                                      <span className="text-gray-400 text-xs">Sem GPS</span>
                                    )}
                                    <div className="flex items-center space-x-2 text-[10px] text-gray-500 font-mono">
                                      {alt !== undefined && alt !== null && (
                                        <span>Alt: {Number(alt).toFixed(1)}m</span>
                                      )}
                                      {sat !== undefined && sat !== null && (
                                        <span>Sat: {sat}</span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })()}
                            </td>
                            <td className="py-3 px-4">
                              {(() => {
                                const modo = m.modo || (m.tipo ? String(m.tipo).toUpperCase() : null);
                                const batVal = m.bateria_percentual_simulado ?? m.bateria ?? m.battery_level;
                                const isBaixa = batVal !== undefined && batVal !== null && batVal < 20;
                                const batStatus = m.bateria_status || (batVal !== undefined && batVal !== null ? (isBaixa ? 'BAIXA' : 'NORMAL') : null);

                                return (
                                  <div className="flex flex-col text-xs space-y-1">
                                    {modo && (
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-purple-100 text-purple-700 w-fit">
                                        {modo}
                                      </span>
                                    )}
                                    {batVal !== undefined && batVal !== null ? (
                                      <div className="flex items-center space-x-1.5 font-mono text-[11px]">
                                        <span className={isBaixa ? 'text-red-600 font-bold' : 'text-emerald-700 font-bold'}>
                                          {Number(batVal).toFixed(1)}%
                                        </span>
                                        {batStatus && (
                                          <span className={`text-[10px] font-sans px-1 rounded ${isBaixa ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
                                            {batStatus}
                                          </span>
                                        )}
                                      </div>
                                    ) : (
                                      <span className="text-gray-400">-</span>
                                    )}
                                  </div>
                                );
                              })()}
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>

              {/* Botão de Paginação / Carregar Mais */}
              {temMais && (
                <div className="pt-3 pb-2 flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-gray-200 shadow-2xs">
                  <div className="text-xs text-gray-600">
                    Exibindo <strong className="text-graphiteText font-bold">{medicoes.length}</strong>
                    {totalGeral !== null && (
                      <span> de <strong className="text-natureGreen font-bold">{totalGeral}</strong></span>
                    )}{' '}
                    medições registradas no banco de dados MongoDB.
                  </div>
                  <button
                    type="button"
                    onClick={carregarMais}
                    disabled={loadingMais}
                    className="w-full sm:w-auto px-4 py-2 bg-trustBlue hover:bg-trustBlue/90 text-white font-bold text-xs rounded-xl shadow-xs flex items-center justify-center space-x-2 transition disabled:opacity-50 cursor-pointer"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${loadingMais ? 'animate-spin' : ''}`} />
                    <span>{loadingMais ? 'Carregando registros...' : 'Carregar mais medições (+100)'}</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Rodapé do Modal */}
        <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-gray-500 font-medium">
            {totalGeral !== null ? (
              <span>
                Total no banco: <strong className="text-graphiteText font-bold">{totalGeral}</strong> medições{' '}
                (Carregadas: <strong className="text-graphiteText">{medicoes.length}</strong>)
              </span>
            ) : (
              <span>{medicoes.length} medições carregadas</span>
            )}
          </div>

          <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
            {temMais && (
              <button
                type="button"
                onClick={carregarMais}
                disabled={loadingMais}
                className="px-4 py-2 bg-natureGreen hover:bg-natureGreen/90 text-white font-bold text-xs rounded-xl shadow-2xs flex items-center space-x-1.5 transition disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loadingMais ? 'animate-spin' : ''}`} />
                <span>{loadingMais ? 'Buscando...' : 'Carregar Mais'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 bg-gray-200 hover:bg-gray-300 text-graphiteText font-bold text-xs rounded-xl transition cursor-pointer"
            >
              Fechar
            </button>
          </div>
        </div>

      </div>

      {/* MODAL DE CONFIRMAÇÃO ESTILO AWS (Digitar frase para confirmar) */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl border border-red-200 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Header de Alerta */}
            <div className="bg-criticalRed text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <AlertTriangle className="h-5 w-5 text-white" />
                <h4 className="font-extrabold text-base tracking-wide">Exclusão Permanente</h4>
              </div>
              <button
                onClick={() => setShowConfirmModal(false)}
                className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Conteúdo Explicativo */}
            <div className="p-6 space-y-4 text-xs text-graphiteText">
              <p className="font-semibold text-gray-700 leading-relaxed">
                Esta ação é irreversível. Todas as medições de telemetria gravadas no banco de dados MongoDB para o dispositivo <strong className="font-mono bg-red-50 text-criticalRed px-1.5 py-0.5 rounded border border-red-200">{dispositivoId}</strong> serão eliminadas.
              </p>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-amber-900 leading-normal">
                Para confirmar a exclusão definitiva, digite exatamente a frase abaixo:
                <p className="mt-1 font-mono font-bold text-criticalRed select-all bg-white/80 px-2 py-1 rounded border border-amber-300 text-center">
                  {PALAVRA_CONFIRMACAO}
                </p>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-600 mb-1">
                  Confirmação de segurança:
                </label>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder={`Digite "${PALAVRA_CONFIRMACAO}"`}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs font-mono focus:ring-2 focus:ring-criticalRed focus:border-transparent outline-none"
                  autoFocus
                />
              </div>
            </div>

            {/* Botões de Ação */}
            <div className="bg-gray-50 px-6 py-3.5 border-t border-gray-200 flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                disabled={clearing}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold text-xs rounded-xl transition"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={executarExclusao}
                disabled={confirmText.trim().toLowerCase() !== PALAVRA_CONFIRMACAO || clearing}
                className="px-4 py-2 bg-criticalRed hover:bg-red-800 text-white font-bold text-xs rounded-xl transition shadow-xs disabled:opacity-40 disabled:cursor-not-allowed flex items-center space-x-1.5"
              >
                <Trash2 className={`h-3.5 w-3.5 ${clearing ? 'animate-bounce' : ''}`} />
                <span>{clearing ? 'Apagando dados...' : 'Confirmar e Apagar'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PAINEL ENCAPSULADO DO MAPA LEAFLET PARA O PONTO DA MEDIÇÃO */}
      {pontoMapa && (
        <div
          className={`fixed inset-0 z-[10002] flex items-center justify-center bg-black/65 backdrop-blur-xs animate-in fade-in duration-150 ${
            mapaMaximizado ? 'p-0' : 'p-3 sm:p-6'
          }`}
        >
          <div
            className={`bg-white shadow-2xl border border-gray-200 overflow-hidden flex flex-col animate-in zoom-in-95 duration-150 transition-all ${
              mapaMaximizado
                ? 'w-screen h-screen rounded-none border-0'
                : 'w-full max-w-6xl h-[85vh] rounded-3xl'
            }`}
          >
            {/* Cabeçalho do Painel do Mapa */}
            <div className="bg-trustBlue text-white px-6 py-4 flex items-center justify-between border-b border-gray-700 shrink-0">
              <div className="flex items-center space-x-3">
                <div className="bg-natureGreen/20 p-2 rounded-xl text-natureGreen">
                  <MapPin className="h-5 w-5 text-natureGreen" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h4 className="font-extrabold text-sm sm:text-base text-white">
                      Localização da Medição no Mapa
                    </h4>
                    <span className="text-[11px] px-2 py-0.5 rounded-full font-bold bg-white/15 text-white">
                      {tipoInfo.icon} {nomeItem}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-300 font-mono mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                    <span>Horário: <strong>{pontoMapa.dataHora}</strong></span>
                    <span>•</span>
                    <span>
                      Coordenadas: <strong>{pontoMapa.lat.toFixed(6)}, {pontoMapa.lng.toFixed(6)}</strong>
                    </span>
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setMapaMaximizado((prev) => !prev)}
                  className="text-gray-200 hover:text-white px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 transition cursor-pointer flex items-center space-x-1.5 text-xs font-semibold"
                  title={mapaMaximizado ? 'Restaurar tamanho do painel' : 'Maximizar em tela cheia'}
                >
                  {mapaMaximizado ? (
                    <>
                      <Minimize2 className="h-4 w-4" />
                      <span className="hidden sm:inline">Restaurar</span>
                    </>
                  ) : (
                    <>
                      <Maximize2 className="h-4 w-4" />
                      <span className="hidden sm:inline">Maximizar</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setPontoMapa(null);
                    setMapaMaximizado(false);
                  }}
                  className="text-gray-300 hover:text-white p-1.5 rounded-xl hover:bg-white/10 transition cursor-pointer"
                  title="Fechar mapa"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Mapa Leaflet */}
            <div className="relative w-full flex-1 min-h-[380px] bg-gray-100">
              <MapContainer
                key={`${pontoMapa.lat}-${pontoMapa.lng}`}
                center={[pontoMapa.lat, pontoMapa.lng]}
                zoom={16}
                scrollWheelZoom={true}
                className="h-full w-full z-0"
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                <RedimensionarMapa maximizado={mapaMaximizado} />

                {selectedProperty?.poligono_geojson?.coordinates && (
                  <Polygon
                    positions={selectedProperty.poligono_geojson.coordinates[0].map((c: number[]) => [c[1], c[0]])}
                    pathOptions={{
                      color: '#2E7D32',
                      fillColor: '#2E7D32',
                      fillOpacity: 0.12,
                      weight: 2,
                      dashArray: '5, 5',
                    }}
                  />
                )}

                <Marker
                  position={[pontoMapa.lat, pontoMapa.lng]}
                  icon={criarIconeMapaHistorico(tipo)}
                >
                  <Popup>
                    <div className="font-sans text-xs space-y-1 min-w-[180px]">
                      <div className="font-extrabold text-graphiteText border-b border-gray-200 pb-1 flex items-center justify-between">
                        <span>{tipoInfo.icon} {nomeItem}</span>
                      </div>
                      <p className="text-[11px] text-gray-600">
                        <strong>Data/Hora:</strong> {pontoMapa.dataHora}
                      </p>
                      <p className="text-[11px] font-mono text-gray-700">
                        <strong>Lat/Lng:</strong> {pontoMapa.lat.toFixed(5)}, {pontoMapa.lng.toFixed(5)}
                        {(pontoMapa.medicao.satelites ?? pontoMapa.medicao.satellites) !== undefined &&
                          (pontoMapa.medicao.satelites ?? pontoMapa.medicao.satellites) !== null && (
                            <> | <strong>Sat:</strong> {pontoMapa.medicao.satelites ?? pontoMapa.medicao.satellites}</>
                          )}
                      </p>
                      {tipo === 'animal' && (
                        <p className="text-[11px] text-gray-700">
                          <strong>Temp:</strong>{' '}
                          {pontoMapa.medicao.temperatura !== undefined
                            ? `${Number(pontoMapa.medicao.temperatura).toFixed(1)} °C`
                            : '-'}{' '}
                          | <strong>BPM:</strong> {pontoMapa.medicao.batimentos ?? '-'}
                        </p>
                      )}
                      {tipo === 'equipamento' && (
                        <p className="text-[11px] text-gray-700">
                          <strong>Vel:</strong>{' '}
                          {pontoMapa.medicao.velocidade !== undefined
                            ? `${Number(pontoMapa.medicao.velocidade).toFixed(1)} km/h`
                            : '-'}{' '}
                          | <strong>Corrente:</strong>{' '}
                          {pontoMapa.medicao.corrente_a !== undefined
                            ? `${Number(pontoMapa.medicao.corrente_a).toFixed(2)} A`
                            : '-'}
                        </p>
                      )}
                      {tipo === 'estacao_ambiental' && (
                        <p className="text-[11px] text-gray-700">
                          <strong>Temp Ar:</strong>{' '}
                          {(pontoMapa.medicao.temperatura_ar_C ?? pontoMapa.medicao.temperatura) !== undefined
                            ? `${Number(pontoMapa.medicao.temperatura_ar_C ?? pontoMapa.medicao.temperatura).toFixed(1)} °C`
                            : '-'}{' '}
                          | <strong>Umid:</strong>{' '}
                          {(pontoMapa.medicao.umidade_ar_percentual ?? pontoMapa.medicao.umidade) !== undefined
                            ? `${Number(pontoMapa.medicao.umidade_ar_percentual ?? pontoMapa.medicao.umidade).toFixed(1)}%`
                            : '-'}
                        </p>
                      )}
                    </div>
                  </Popup>
                </Marker>
              </MapContainer>
            </div>

            {/* Rodapé do Painel do Mapa */}
            <div className="bg-gray-50 px-6 py-3.5 border-t border-gray-200 flex items-center justify-between text-xs shrink-0">
              <div className="text-gray-500 flex items-center space-x-2">
                <Compass className="h-4 w-4 text-natureGreen" />
                <span>
                  Mapa interativo integrado (Leaflet / OpenStreetMap)
                  {selectedProperty ? ` • Propriedade: ${selectedProperty.nome}` : ''}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPontoMapa(null);
                  setMapaMaximizado(false);
                }}
                className="px-4 py-2 bg-trustBlue hover:bg-gray-800 text-white font-bold text-xs rounded-xl transition cursor-pointer"
              >
                Voltar à Tabela
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PAINEL ENCAPSULADO DO MAPA LEAFLET PARA TRAÇADO DE ROTA E DISTÂNCIA PERCORRIDA */}
      {exibirMapaRota && dadosRota.pontos.length >= 2 && (
        <div
          className={`fixed inset-0 z-[10002] flex items-center justify-center bg-black/65 backdrop-blur-xs animate-in fade-in duration-150 ${
            mapaMaximizado ? 'p-0' : 'p-3 sm:p-6'
          }`}
        >
          <div
            className={`bg-white shadow-2xl border border-gray-200 overflow-hidden flex flex-col animate-in zoom-in-95 duration-150 transition-all ${
              mapaMaximizado
                ? 'w-screen h-screen rounded-none border-0'
                : 'w-full max-w-6xl h-[88vh] rounded-3xl'
            }`}
          >
            {/* Cabeçalho do Painel de Rota */}
            <div className="bg-trustBlue text-white px-6 py-4 flex items-center justify-between border-b border-gray-700 shrink-0">
              <div className="flex items-center space-x-3">
                <div className="bg-iotBlue/30 p-2.5 rounded-xl text-white">
                  <Navigation className="h-5 w-5 text-fieldGreen" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="font-extrabold text-sm sm:text-base text-white">
                      Traçado de Rota e Deslocamento no Mapa
                    </h4>
                    <span className="text-[11px] px-2.5 py-0.5 rounded-full font-bold bg-white/15 text-white">
                      {tipoInfo.icon} {nomeItem}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-300 font-mono mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                    <span>
                      Início (#1): <strong>{dadosRota.pontos[0].dataHora}</strong>
                    </span>
                    <span>→</span>
                    <span>
                      Fim (#{dadosRota.pontos.length}):{' '}
                      <strong>{dadosRota.pontos[dadosRota.pontos.length - 1].dataHora}</strong>
                    </span>
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setMapaMaximizado((prev) => !prev)}
                  className="text-gray-200 hover:text-white px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 transition cursor-pointer flex items-center space-x-1.5 text-xs font-semibold"
                  title={mapaMaximizado ? 'Restaurar tamanho do painel' : 'Maximizar em tela cheia'}
                >
                  {mapaMaximizado ? (
                    <>
                      <Minimize2 className="h-4 w-4" />
                      <span className="hidden sm:inline">Restaurar</span>
                    </>
                  ) : (
                    <>
                      <Maximize2 className="h-4 w-4" />
                      <span className="hidden sm:inline">Maximizar</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setExibirMapaRota(false);
                    setMapaMaximizado(false);
                  }}
                  className="text-gray-300 hover:text-white p-1.5 rounded-xl hover:bg-white/10 transition cursor-pointer"
                  title="Fechar rota"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Faixa de Resumo de Métricas da Rota */}
            <div className="bg-slate-50 border-b border-gray-200 px-6 py-3 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs shrink-0">
              <div className="bg-white px-3.5 py-2 rounded-xl border border-gray-200 flex items-center justify-between">
                <span className="text-gray-500 font-semibold">Distância Total Percorrida:</span>
                <span className="font-extrabold font-mono text-sm text-natureGreen">
                  {formatarDistanciaMetros(dadosRota.distanciaTotalMetros)}
                </span>
              </div>
              <div className="bg-white px-3.5 py-2 rounded-xl border border-gray-200 flex items-center justify-between">
                <span className="text-gray-500 font-semibold">Pontos no Traçado:</span>
                <span className="font-extrabold font-mono text-sm text-iotBlue">
                  {dadosRota.pontos.length} medições
                </span>
              </div>
              <div className="bg-white px-3.5 py-2 rounded-xl border border-gray-200 flex items-center justify-between">
                <span className="text-gray-500 font-semibold">Legenda da Rota:</span>
                <span className="flex items-center space-x-2 text-[11px] font-bold">
                  <span className="inline-flex items-center space-x-1 text-natureGreen">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#2E7D32] inline-block" />
                    <span>#1 Início</span>
                  </span>
                  <span className="inline-flex items-center space-x-1 text-iotBlue">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#1976D2] inline-block" />
                    <span>Meio</span>
                  </span>
                  <span className="inline-flex items-center space-x-1 text-criticalRed">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#D32F2F] inline-block" />
                    <span>#{dadosRota.pontos.length} Fim</span>
                  </span>
                </span>
              </div>
            </div>

            {/* Mapa Leaflet com Polyline e Marcadores Numerados */}
            <div className="relative w-full flex-1 min-h-[380px] bg-gray-100">
              <MapContainer
                key={`rota-${dadosRota.pontos.length}-${dadosRota.distanciaTotalMetros.toFixed(2)}`}
                center={dadosRota.posicoes[0]}
                zoom={16}
                scrollWheelZoom={true}
                className="h-full w-full z-0"
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                <AjustarBoundsRota posicoes={dadosRota.posicoes} maximizado={mapaMaximizado} />

                {selectedProperty?.poligono_geojson?.coordinates && (
                  <Polygon
                    positions={selectedProperty.poligono_geojson.coordinates[0].map((c: number[]) => [c[1], c[0]])}
                    pathOptions={{
                      color: '#2E7D32',
                      fillColor: '#2E7D32',
                      fillOpacity: 0.1,
                      weight: 2,
                      dashArray: '5, 5',
                    }}
                  />
                )}

                {/* Linha de contorno e linha principal da rota */}
                <Polyline
                  positions={dadosRota.posicoes}
                  pathOptions={{
                    color: '#1976D2',
                    weight: 4,
                    opacity: 0.85,
                  }}
                />

                {dadosRota.pontos.map((pt) => (
                  <Marker
                    key={`pt-rota-${pt.ordem}`}
                    position={[pt.lat, pt.lng]}
                    icon={criarIconePontoRota(pt.ordem, dadosRota.pontos.length)}
                  >
                    <Popup>
                      <div className="font-sans text-xs space-y-1 min-w-[200px]">
                        <div className="font-extrabold text-graphiteText border-b border-gray-200 pb-1 flex items-center justify-between">
                          <span>
                            Ponto #{pt.ordem}{' '}
                            {pt.ordem === 1
                              ? '(Início)'
                              : pt.ordem === dadosRota.pontos.length
                              ? '(Posição Final)'
                              : ''}
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-600">
                          <strong>Horário:</strong> {pt.dataHora}
                        </p>
                        <p className="text-[11px] font-mono text-gray-700">
                          <strong>Lat/Lng:</strong> {pt.lat.toFixed(5)}, {pt.lng.toFixed(5)}
                        </p>
                        {pt.ordem > 1 && (
                          <p className="text-[11px] text-iotBlue font-semibold">
                            <strong>Trecho anterior:</strong> +{formatarDistanciaMetros(pt.distanciaTrechoMetros)}
                          </p>
                        )}
                        <p className="text-[11px] text-natureGreen font-bold">
                          <strong>Acumulado:</strong> {formatarDistanciaMetros(pt.distanciaAcumuladaMetros)}
                        </p>
                      </div>
                    </Popup>
                  </Marker>
                ))}
              </MapContainer>
            </div>

            {/* Rodapé do Painel de Rota */}
            <div className="bg-gray-50 px-6 py-3.5 border-t border-gray-200 flex items-center justify-between text-xs shrink-0">
              <div className="text-gray-500 flex items-center space-x-2">
                <Compass className="h-4 w-4 text-iotBlue" />
                <span>
                  Clique em qualquer ponto numerado no mapa para ver o horário e a distância de cada trecho.
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setExibirMapaRota(false);
                  setMapaMaximizado(false);
                }}
                className="px-4 py-2 bg-trustBlue hover:bg-gray-800 text-white font-bold text-xs rounded-xl transition cursor-pointer"
              >
                Voltar à Tabela
              </button>
            </div>
          </div>
        </div>
      )}

    </div>,
    document.body
  );
};
