import React, { useState, useMemo } from 'react';
import {
  Thermometer,
  Droplets,
  Gauge,
  Sun,
  Flame,
  Battery,
  Heart,
  Zap,
  Activity,
  LineChart,
  Calendar,
  Layers,
  ArrowUp,
  ArrowDown,
  BarChart2
} from 'lucide-react';

export interface MetricaDef {
  id: string;
  nome: string;
  unidade: string;
  icone: React.ComponentType<{ className?: string }>;
  cor: string;
  corFundo: string;
  corBorda: string;
  corGradiente: string;
  extrair: (m: any) => number | null;
  formataValor?: (v: number) => string;
}

interface GraficoTelemetriaProps {
  medicoes: any[];
  tipo: 'animal' | 'equipamento' | 'estacao_ambiental';
}

const METRICAS_ESTACAO: MetricaDef[] = [
  {
    id: 'temperatura_ar',
    nome: 'Temperatura do Ar',
    unidade: '°C',
    icone: Thermometer,
    cor: '#f97316',
    corFundo: 'bg-orange-50 text-orange-700',
    corBorda: 'border-orange-300',
    corGradiente: '#ea580c',
    extrair: (m) => {
      const v = m.temperatura_ar_C ?? m.temperatura ?? m.temperature;
      return typeof v === 'number' && !isNaN(v) ? v : null;
    },
    formataValor: (v) => `${v.toFixed(2)} °C`
  },
  {
    id: 'umidade_ar',
    nome: 'Umidade do Ar',
    unidade: '%',
    icone: Droplets,
    cor: '#0284c7',
    corFundo: 'bg-sky-50 text-sky-700',
    corBorda: 'border-sky-300',
    corGradiente: '#0369a1',
    extrair: (m) => {
      const v = m.umidade_ar_percentual ?? m.umidade ?? m.humidity;
      return typeof v === 'number' && !isNaN(v) ? v : null;
    },
    formataValor: (v) => `${v.toFixed(2)}%`
  },
  {
    id: 'pressao',
    nome: 'Pressão Atmosférica',
    unidade: 'hPa',
    icone: Gauge,
    cor: '#8b5cf6',
    corFundo: 'bg-purple-50 text-purple-700',
    corBorda: 'border-purple-300',
    corGradiente: '#7c3aed',
    extrair: (m) => {
      const v = m.pressao_hPa ?? m.pressao_atmosferica ?? m.atmospheric_pressure;
      return typeof v === 'number' && !isNaN(v) ? v : null;
    },
    formataValor: (v) => `${v.toFixed(2)} hPa`
  },
  {
    id: 'temperatura_solo',
    nome: 'Temperatura da Água',
    unidade: '°C',
    icone: Thermometer,
    cor: '#d97706',
    corFundo: 'bg-amber-50 text-amber-700',
    corBorda: 'border-amber-300',
    corGradiente: '#b45309',
    extrair: (m) => {
      const v = m.temperatura_solo_C ?? m.temperatura_solo;
      // -127 indica desconexão do sensor Dallas DS18B20
      return typeof v === 'number' && v > -100 ? v : null;
    },
    formataValor: (v) => `${v.toFixed(2)} °C`
  },
  {
    id: 'umidade_solo',
    nome: 'Umidade do Solo',
    unidade: '%',
    icone: Droplets,
    cor: '#10b981',
    corFundo: 'bg-emerald-50 text-emerald-700',
    corBorda: 'border-emerald-300',
    corGradiente: '#059669',
    extrair: (m) => {
      const v = m.umidade_solo ?? m.soil_moisture;
      return typeof v === 'number' && !isNaN(v) ? v : null;
    },
    formataValor: (v) => `${v.toFixed(1)}%`
  },
  {
    id: 'umidade_solo_adc',
    nome: 'Umidade Solo (ADC)',
    unidade: 'ADC',
    icone: Layers,
    cor: '#059669',
    corFundo: 'bg-teal-50 text-teal-700',
    corBorda: 'border-teal-300',
    corGradiente: '#047857',
    extrair: (m) => (typeof m.umidade_solo_adc === 'number' ? m.umidade_solo_adc : null),
    formataValor: (v) => `${Math.round(v)} ADC`
  },
  {
    id: 'luminosidade_adc',
    nome: 'Luminosidade (LDR ADC)',
    unidade: 'ADC',
    icone: Sun,
    cor: '#eab308',
    corFundo: 'bg-yellow-50 text-yellow-700',
    corBorda: 'border-yellow-300',
    corGradiente: '#ca8a04',
    extrair: (m) => (typeof m.luminosidade_adc === 'number' ? m.luminosidade_adc : null),
    formataValor: (v) => `${Math.round(v)} ADC`
  },
  {
    id: 'mq2_adc',
    nome: 'Gás / Fumaça (MQ-2 ADC)',
    unidade: 'ADC',
    icone: Flame,
    cor: '#ec4899',
    corFundo: 'bg-pink-50 text-pink-700',
    corBorda: 'border-pink-300',
    corGradiente: '#db2777',
    extrair: (m) => (typeof m.mq2_adc === 'number' ? m.mq2_adc : null),
    formataValor: (v) => `${Math.round(v)} ADC`
  },
  {
    id: 'bateria',
    nome: 'Bateria Simulada',
    unidade: '%',
    icone: Battery,
    cor: '#16a34a',
    corFundo: 'bg-green-50 text-green-700',
    corBorda: 'border-green-300',
    corGradiente: '#15803d',
    extrair: (m) => {
      const v = m.bateria_percentual_simulado ?? m.bateria ?? m.battery_level;
      return typeof v === 'number' && !isNaN(v) ? v : null;
    },
    formataValor: (v) => `${v.toFixed(1)}%`
  }
];

const METRICAS_ANIMAL: MetricaDef[] = [
  {
    id: 'temperatura_corporal',
    nome: 'Temperatura Corporal',
    unidade: '°C',
    icone: Thermometer,
    cor: '#ef4444',
    corFundo: 'bg-red-50 text-red-700',
    corBorda: 'border-red-300',
    corGradiente: '#dc2626',
    extrair: (m) => {
      // Ignora pontos em que o colar sinalizou falha no sensor DS18B20
      if (m.sensor_temp_ok === false) return null;
      const v = m.temperatura_corporal ?? m.body_temperature;
      return typeof v === 'number' ? v : null;
    },
    formataValor: (v) => `${v.toFixed(2)} °C`
  },
  {
    id: 'frequencia_cardiaca',
    nome: 'Frequência Cardíaca',
    unidade: 'bpm',
    icone: Heart,
    cor: '#ec4899',
    corFundo: 'bg-pink-50 text-pink-700',
    corBorda: 'border-pink-300',
    corGradiente: '#db2777',
    extrair: (m) => {
      const v = m.frequencia_cardiaca ?? m.heart_rate;
      return typeof v === 'number' ? v : null;
    },
    formataValor: (v) => `${Math.round(v)} bpm`
  }
];

const METRICAS_EQUIPAMENTO: MetricaDef[] = [
  {
    id: 'velocidade',
    nome: 'Velocidade',
    unidade: 'km/h',
    icone: Activity,
    cor: '#0284c7',
    corFundo: 'bg-sky-50 text-sky-700',
    corBorda: 'border-sky-300',
    corGradiente: '#0369a1',
    extrair: (m) => {
      const v = m.velocidade ?? m.speed;
      return typeof v === 'number' ? v : null;
    },
    formataValor: (v) => `${v.toFixed(1)} km/h`
  },
  {
    id: 'corrente',
    nome: 'Corrente Elétrica',
    unidade: 'A',
    icone: Zap,
    cor: '#f59e0b',
    corFundo: 'bg-amber-50 text-amber-700',
    corBorda: 'border-amber-300',
    corGradiente: '#d97706',
    extrair: (m) => {
      const v = m.corrente ?? m.current;
      return typeof v === 'number' ? v : null;
    },
    formataValor: (v) => `${v.toFixed(2)} A`
  }
];

export const GraficoTelemetria: React.FC<GraficoTelemetriaProps> = ({ medicoes, tipo }) => {
  const metricasDisponiveis = useMemo(() => {
    switch (tipo) {
      case 'animal':
        return METRICAS_ANIMAL;
      case 'equipamento':
        return METRICAS_EQUIPAMENTO;
      case 'estacao_ambiental':
      default:
        return METRICAS_ESTACAO;
    }
  }, [tipo]);

  const [metricaSelecionadaId, setMetricaSelecionadaId] = useState<string>(
    () => metricasDisponiveis[0]?.id || 'temperatura_ar'
  );

  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const metrica = useMemo(() => {
    return (
      metricasDisponiveis.find((m) => m.id === metricaSelecionadaId) || metricasDisponiveis[0]
    );
  }, [metricasDisponiveis, metricaSelecionadaId]);

  // Ordena cronologicamente (da medição mais antiga para a mais recente)
  const pontosProcessados = useMemo(() => {
    if (!medicoes || medicoes.length === 0 || !metrica) return [];

    const clonados = [...medicoes].sort((a, b) => {
      const tA = new Date(a.data_hora || a.timestamp || 0).getTime();
      const tB = new Date(b.data_hora || b.timestamp || 0).getTime();
      return tA - tB;
    });

    const resultado: { dataHora: Date; dataFormatada: string; horaFormatada: string; valor: number }[] = [];

    for (const m of clonados) {
      const rawDate = m.data_hora || m.timestamp;
      if (!rawDate) continue;
      const strUtc =
        typeof rawDate === 'string' && !rawDate.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(rawDate)
          ? `${rawDate}Z`
          : rawDate;
      const parsedDate = new Date(strUtc);
      if (isNaN(parsedDate.getTime())) continue;

      const valor = metrica.extrair(m);
      if (valor !== null && !isNaN(valor)) {
        resultado.push({
          dataHora: parsedDate,
          dataFormatada: parsedDate.toLocaleDateString('pt-BR'),
          horaFormatada: parsedDate.toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          }),
          valor
        });
      }
    }

    return resultado;
  }, [medicoes, metrica]);

  // Estatísticas calculadas
  const stats = useMemo(() => {
    if (pontosProcessados.length === 0) return null;
    const valores = pontosProcessados.map((p) => p.valor);
    const min = Math.min(...valores);
    const max = Math.max(...valores);
    const media = valores.reduce((acc, curr) => acc + curr, 0) / valores.length;
    const atual = valores[valores.length - 1];
    return { min, max, media, atual, total: valores.length };
  }, [pontosProcessados]);

  // Parâmetros geométricos do SVG
  const width = 850;
  const height = 300;
  const padding = { top: 25, right: 30, bottom: 45, left: 65 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const { minVal, maxVal, pontosCoord, pathLine, pathArea, gridY } = useMemo(() => {
    if (pontosProcessados.length === 0) {
      return { minVal: 0, maxVal: 100, pontosCoord: [], pathLine: '', pathArea: '', gridY: [] };
    }

    const valores = pontosProcessados.map((p) => p.valor);
    let min = Math.min(...valores);
    let max = Math.max(...valores);

    if (min === max) {
      min = min - 1;
      max = max + 1;
    } else {
      const margem = (max - min) * 0.12;
      min -= margem;
      max += margem;
    }

    // Calcula coordenadas X e Y de cada ponto
    const count = pontosProcessados.length;
    const pontos = pontosProcessados.map((p, idx) => {
      const x = count === 1 ? padding.left + chartWidth / 2 : padding.left + (idx / (count - 1)) * chartWidth;
      const y = padding.top + chartHeight - ((p.valor - min) / (max - min)) * chartHeight;
      return { ...p, x, y };
    });

    // Cria caminho em linha contínua
    let dLine = '';
    if (pontos.length === 1) {
      dLine = `M ${pontos[0].x - 10} ${pontos[0].y} L ${pontos[0].x + 10} ${pontos[0].y}`;
    } else {
      dLine = pontos.reduce((acc, curr, idx) => {
        if (idx === 0) return `M ${curr.x} ${curr.y}`;
        // Curva suave com Bezier
        const prev = pontos[idx - 1];
        const cx1 = prev.x + (curr.x - prev.x) / 3;
        const cy1 = prev.y;
        const cx2 = curr.x - (curr.x - prev.x) / 3;
        const cy2 = curr.y;
        return `${acc} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${curr.x} ${curr.y}`;
      }, '');
    }

    // Cria área sombreada abaixo da linha
    const baselineY = padding.top + chartHeight;
    const firstX = pontos[0]?.x ?? padding.left;
    const lastX = pontos[pontos.length - 1]?.x ?? padding.left + chartWidth;
    const dArea = `${dLine} L ${lastX} ${baselineY} L ${firstX} ${baselineY} Z`;

    // 5 linhas horizontais de grade
    const steps = 4;
    const gridYValues = [];
    for (let i = 0; i <= steps; i++) {
      const ratio = i / steps;
      const val = min + ratio * (max - min);
      const y = padding.top + chartHeight - ratio * chartHeight;
      gridYValues.push({ val, y });
    }

    return {
      minVal: min,
      maxVal: max,
      pontosCoord: pontos,
      pathLine: dLine,
      pathArea: dArea,
      gridY: gridYValues
    };
  }, [pontosProcessados, chartWidth, chartHeight, padding.left, padding.top]);

  return (
    <div className="flex flex-col space-y-4">
      {/* Seletor de Métricas (Pills com rolagem horizontal) */}
      <div className="flex items-center space-x-2 overflow-x-auto pb-1 pt-0.5 no-scrollbar">
        {metricasDisponiveis.map((m) => {
          const Icone = m.icone;
          const isAtiva = m.id === metricaSelecionadaId;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                setMetricaSelecionadaId(m.id);
                setHoverIndex(null);
              }}
              className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap border shadow-2xs ${
                isAtiva
                  ? `${m.corFundo} ${m.corBorda} ring-2 ring-offset-1`
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              <Icone className="h-3.5 w-3.5" />
              <span>{m.nome}</span>
            </button>
          );
        })}
      </div>

      {/* Cards de Resumo Estatístico (KPIs) */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white p-3 rounded-2xl border border-gray-200 shadow-2xs">
            <span className="text-[11px] font-semibold text-gray-500 block">Última Leitura</span>
            <span className="text-base font-extrabold text-graphiteText font-mono">
              {metrica.formataValor ? metrica.formataValor(stats.atual) : `${stats.atual} ${metrica.unidade}`}
            </span>
          </div>

          <div className="bg-white p-3 rounded-2xl border border-gray-200 shadow-2xs">
            <span className="text-[11px] font-semibold text-gray-500 block">Média do Período</span>
            <span className="text-base font-extrabold text-graphiteText font-mono">
              {metrica.formataValor ? metrica.formataValor(stats.media) : `${stats.media.toFixed(2)} ${metrica.unidade}`}
            </span>
          </div>

          <div className="bg-white p-3 rounded-2xl border border-gray-200 shadow-2xs flex items-center justify-between">
            <div>
              <span className="text-[11px] font-semibold text-gray-500 block">Mínima</span>
              <span className="text-base font-extrabold text-blue-700 font-mono">
                {metrica.formataValor ? metrica.formataValor(stats.min) : `${stats.min} ${metrica.unidade}`}
              </span>
            </div>
            <ArrowDown className="h-4 w-4 text-blue-500" />
          </div>

          <div className="bg-white p-3 rounded-2xl border border-gray-200 shadow-2xs flex items-center justify-between">
            <div>
              <span className="text-[11px] font-semibold text-gray-500 block">Máxima</span>
              <span className="text-base font-extrabold text-amber-700 font-mono">
                {metrica.formataValor ? metrica.formataValor(stats.max) : `${stats.max} ${metrica.unidade}`}
              </span>
            </div>
            <ArrowUp className="h-4 w-4 text-amber-500" />
          </div>
        </div>
      )}

      {/* Gráfico SVG Principal */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-2xs relative">
        {pontosProcessados.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center text-gray-400 space-y-2">
            <LineChart className="h-10 w-10 text-gray-300" />
            <p className="font-bold text-sm text-graphiteText">Sem registros para {metrica.nome}</p>
            <p className="text-xs text-gray-500 max-w-sm">
              Não foram encontrados pontos de telemetria válidos para este sensor no período selecionado.
            </p>
          </div>
        ) : (
          <div className="relative">
            <svg
              viewBox={`0 0 ${width} ${height}`}
              className="w-full h-auto overflow-visible select-none"
              onMouseLeave={() => setHoverIndex(null)}
            >
              <defs>
                <linearGradient id={`grad-${metrica.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={metrica.cor} stopOpacity="0.35" />
                  <stop offset="90%" stopColor={metrica.cor} stopOpacity="0.02" />
                </linearGradient>
              </defs>

              {/* Linhas de Grade Horizontais */}
              {gridY.map((g, i) => (
                <g key={`grid-${i}`}>
                  <line
                    x1={padding.left}
                    y1={g.y}
                    x2={width - padding.right}
                    y2={g.y}
                    stroke="#e5e7eb"
                    strokeDasharray="4 4"
                    strokeWidth="1"
                  />
                  <text
                    x={padding.left - 10}
                    y={g.y + 3.5}
                    textAnchor="end"
                    fontSize="10"
                    fill="#9ca3af"
                    fontFamily="monospace"
                  >
                    {metrica.formataValor ? metrica.formataValor(g.val) : `${g.val.toFixed(1)}`}
                  </text>
                </g>
              ))}

              {/* Área Sombreada */}
              <path d={pathArea} fill={`url(#grad-${metrica.id})`} />

              {/* Linha Curva de Dados */}
              <path
                d={pathLine}
                fill="none"
                stroke={metrica.cor}
                strokeWidth="2.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Pontos de Dados */}
              {pontosCoord.map((p, idx) => {
                const isHovered = hoverIndex === idx;
                return (
                  <circle
                    key={`point-${idx}`}
                    cx={p.x}
                    cy={p.y}
                    r={isHovered ? 6 : 3.5}
                    fill={isHovered ? '#ffffff' : metrica.cor}
                    stroke={metrica.cor}
                    strokeWidth={isHovered ? 3 : 2}
                    className="transition-all duration-150 cursor-pointer"
                    onMouseEnter={() => setHoverIndex(idx)}
                  />
                );
              })}

              {/* Linha Vertical Guia ao passar o mouse */}
              {hoverIndex !== null && pontosCoord[hoverIndex] && (
                <line
                  x1={pontosCoord[hoverIndex].x}
                  y1={padding.top}
                  x2={pontosCoord[hoverIndex].x}
                  y2={padding.top + chartHeight}
                  stroke={metrica.cor}
                  strokeDasharray="3 3"
                  strokeWidth="1.5"
                  opacity="0.75"
                />
              )}

              {/* Rótulos do Eixo X (Horários) */}
              {(() => {
                const total = pontosCoord.length;
                if (total <= 1) {
                  return (
                    <text
                      x={padding.left + chartWidth / 2}
                      y={height - 12}
                      textAnchor="middle"
                      fontSize="10"
                      fill="#6b7280"
                      fontFamily="monospace"
                    >
                      {pontosCoord[0]?.horaFormatada}
                    </text>
                  );
                }

                // Exibe até 6 marcadores no eixo X espaçados uniformemente
                const step = Math.max(1, Math.floor(total / 5));
                const rotulos = [];
                for (let i = 0; i < total; i += step) {
                  rotulos.push(pontosCoord[i]);
                }
                if (rotulos[rotulos.length - 1] !== pontosCoord[total - 1]) {
                  rotulos.push(pontosCoord[total - 1]);
                }

                return rotulos.map((p, i) => (
                  <text
                    key={`label-x-${i}`}
                    x={p.x}
                    y={height - 12}
                    textAnchor="middle"
                    fontSize="10"
                    fill="#6b7280"
                    fontFamily="monospace"
                  >
                    {p.horaFormatada}
                  </text>
                ));
              })()}
            </svg>

            {/* Tooltip Flutuante Moderno */}
            {hoverIndex !== null && pontosCoord[hoverIndex] && (
              <div
                className="absolute z-10 pointer-events-none bg-graphiteText/95 text-white px-3 py-2 rounded-xl shadow-xl text-xs backdrop-blur-xs transition-all duration-75"
                style={{
                  left: `${(pontosCoord[hoverIndex].x / width) * 100}%`,
                  top: `${Math.max(10, (pontosCoord[hoverIndex].y / height) * 100 - 30)}%`,
                  transform: 'translate(-50%, -100%)'
                }}
              >
                <p className="text-[10px] text-gray-300 font-mono">
                  {pontosCoord[hoverIndex].dataFormatada} às {pontosCoord[hoverIndex].horaFormatada}
                </p>
                <p className="font-bold text-white mt-0.5 flex items-center space-x-1">
                  <span>{metrica.nome}:</span>
                  <span className="font-mono text-natureGreen">
                    {metrica.formataValor
                      ? metrica.formataValor(pontosCoord[hoverIndex].valor)
                      : `${pontosCoord[hoverIndex].valor} ${metrica.unidade}`}
                  </span>
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

