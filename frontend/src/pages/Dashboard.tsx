import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useProperty } from '../context/PropertyContext';
import { useAuth } from '../context/AuthContext';
import { PropriedadeMapa } from '../components/PropriedadeMapa';
import { obterInfoPosturaAnimal, obterAcelerometroAnimal } from '../utils/postura';
import { Bell, AlertTriangle, CheckCircle, RefreshCw, PawPrint, Truck, CloudSun, Search, Activity, Sprout } from 'lucide-react';

export const Dashboard: React.FC = () => {
  const { selectedPropertyId, selectedProperty, loadingProperties } = useProperty();
  const { user } = useAuth();
  const canManageAlarms = user?.pode_gerenciar_alarmes !== false;
  const [overviewData, setOverviewData] = useState<any>(null);
  const [alarms, setAlarms] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (selectedPropertyId) {
      setLoading(true);
      fetchOverview(selectedPropertyId);
      fetchAlarms(selectedPropertyId);

      const interval = setInterval(() => {
        fetchOverview(selectedPropertyId);
        fetchAlarms(selectedPropertyId);
      }, 5000);

      return () => clearInterval(interval);
    } else {
      setOverviewData(null);
      setAlarms([]);
      setLoading(false);
    }
  }, [selectedPropertyId]);

  const fetchOverview = async (propId: number) => {
    try {
      const res = await api.get(`/telemetria/propriedade/${propId}/visao-geral`);
      setOverviewData(res.data);
    } catch (err) {
      console.error('Erro ao buscar telemetria da propriedade:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAlarms = async (propId: number) => {
    try {
      const res = await api.get(`/alertas/propriedade/${propId}?apenas_ativos=true`);
      setAlarms(res.data);
    } catch (err) {
      console.error('Erro ao buscar alarmes:', err);
    }
  };

  const handleDismissAlarm = async (alarmId: number) => {
    try {
      await api.put(`/alertas/${alarmId}/reconhecer`);
      if (selectedPropertyId) fetchAlarms(selectedPropertyId);
    } catch (err) {
      console.error('Erro ao resolver alarme:', err);
    }
  };

  if (loadingProperties) {
    return (
      <div className="h-[calc(100vh-64px)] flex items-center justify-center bg-offWhite text-natureGreen font-semibold">
        <RefreshCw className="h-8 w-8 animate-spin mr-2" />
        <span>Carregando dados da plataforma IoT SmartFarm...</span>
      </div>
    );
  }

  if (!selectedPropertyId) {
    return (
      <div className="p-8 max-w-4xl mx-auto text-center space-y-4">
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200">
          <p className="text-base font-semibold text-graphiteText">Nenhuma propriedade selecionada ou cadastrada.</p>
          <p className="text-xs text-gray-500 mt-1">Cadastre uma propriedade rural no menu lateral ou selecione uma na barra superior.</p>
        </div>
      </div>
    );
  }

  // Filtragem local dos animais da tabela baseada na busca
  const animalsList = overviewData?.animais || overviewData?.animals || [];
  const filteredAnimals = animalsList.filter((a: any) => {
    const brinco = a.numero_brinco || a.tag_number || '';
    const especie = a.especie || a.species || '';
    const raca = a.raca || a.breed || '';
    const devId = a.dispositivo_id || a.device_id || '';
    const termo = searchTerm.toLowerCase();

    return brinco.toLowerCase().includes(termo) ||
      especie.toLowerCase().includes(termo) ||
      raca.toLowerCase().includes(termo) ||
      devId.toLowerCase().includes(termo);
  });

  const criticalAlarm = alarms.find(a => (a.severidade === 'CRITICA' || a.severidade === 'CRITICAL' || a.severidade === 'ALTA' || a.severity === 'CRITICAL' || a.severity === 'HIGH'));

  const totalAnimais = (overviewData?.animais || overviewData?.animals || []).length;
  const totalEquipamentos = (overviewData?.equipamentos || overviewData?.equipments || []).length;
  const totalEstacoes = (overviewData?.estacoes_ambientais || overviewData?.environment_stations || []).length;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Barra de Filtro Local Dinâmico e Seleção de Propriedade */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-white p-4 rounded-2xl shadow-sm border border-gray-200">
        <div className="relative w-full md:w-96">
          <Search className="h-4 w-4 absolute left-3 top-3 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por animal, espécie, máquina ou sensor..."
            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-xl text-xs text-graphiteText focus:ring-2 focus:ring-natureGreen focus:border-transparent"
          />
        </div>

        <div className="flex items-center space-x-3 w-full md:w-auto justify-end">
          {selectedProperty && (
            <div className="flex items-center space-x-1.5 text-xs text-gray-600 bg-offWhite px-3 py-2 rounded-xl border border-gray-200">
              <Sprout className="h-4 w-4 text-natureGreen shrink-0" />
              <span>Propriedade ativa: <strong className="text-graphiteText">{selectedProperty.nome || selectedProperty.name}</strong></span>
            </div>
          )}

          <button
            onClick={() => selectedPropertyId && fetchOverview(selectedPropertyId)}
            className="p-2 bg-natureGreen/10 text-natureGreen rounded-xl hover:bg-natureGreen/20 transition shadow-xs"
            title="Atualizar dados"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* BANNER DE ALERTA CRÍTICO EM CAMPO */}
      {criticalAlarm && (
        <div className="bg-red-50 border-2 border-criticalRed text-criticalRed p-4 rounded-2xl shadow-md flex items-center justify-between animate-pulse">
          <div className="flex items-center space-x-3">
            <div className="bg-criticalRed text-white p-2 rounded-xl">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-bold text-criticalRed">Alerta crítico em campo</p>
              <p className="text-sm font-bold text-red-900">
                {String(criticalAlarm.mensagem || criticalAlarm.message || '').replace(/\((?:coleira|brinco)\s*#([^)]+)\)/gi, '($1)')}
              </p>
            </div>
          </div>
          {canManageAlarms && (
            <button
              onClick={() => handleDismissAlarm(criticalAlarm.id)}
              className="bg-criticalRed hover:bg-red-800 text-white font-bold px-4 py-2 rounded-xl text-xs shadow-sm transition shrink-0"
            >
              Reconhecer Alarme
            </button>
          )}
        </div>
      )}

      {/* CARDS DE METRICAS KPI */}
      {overviewData && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-500">Animais monitorados</p>
              <h3 className="text-2xl font-black text-graphiteText mt-1">{totalAnimais}</h3>
              <p className="text-[11px] font-bold text-natureGreen mt-1">↑ 98.4% com coleiras ativas</p>
            </div>
            <div className="bg-green-50 p-3.5 rounded-2xl text-natureGreen border border-natureGreen/20">
              <PawPrint className="h-6 w-6" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-500">Equipamentos em campo</p>
              <h3 className="text-2xl font-black text-graphiteText mt-1">{totalEquipamentos}</h3>
              <p className="text-[11px] font-bold text-iotBlue mt-1">Operando via WiFi</p>
            </div>
            <div className="bg-blue-50 p-3.5 rounded-2xl text-iotBlue border border-iotBlue/20">
              <Truck className="h-6 w-6" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-500">Estações ambientais</p>
              <h3 className="text-2xl font-black text-graphiteText mt-1">{totalEstacoes}</h3>
              <p className="text-[11px] font-bold text-alertAmber mt-1">Solo & Meteorologia</p>
            </div>
            <div className="bg-amber-50 p-3.5 rounded-2xl text-alertAmber border border-alertAmber/20">
              <CloudSun className="h-6 w-6" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-500">Alertas de saúde</p>
              <h3 className={`text-2xl font-black mt-1 ${alarms.length > 0 ? 'text-criticalRed' : 'text-graphiteText'}`}>
                {alarms.length}
              </h3>
              <p className="text-[11px] font-bold text-criticalRed mt-1">
                {alarms.length > 0 ? `${alarms.length} Alerta(s) pendente(s)` : 'Nenhum alerta pendente'}
              </p>
            </div>
            <div className={`p-3.5 rounded-2xl ${alarms.length > 0 ? 'bg-red-50 text-criticalRed animate-pulse border border-criticalRed/30' : 'bg-gray-100 text-gray-400'}`}>
              <Bell className="h-6 w-6" />
            </div>
          </div>
        </div>
      )}

      {/* Grid Principal: Mapa (passando searchTerm) e Painel de Alertas */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 h-[540px]">
          <PropriedadeMapa overviewData={overviewData} searchTerm={searchTerm} />
        </div>

        <div className="lg:col-span-4 bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex flex-col justify-between h-[540px]">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-gray-200 mb-4">
              <h3 className="font-extrabold text-graphiteText flex items-center space-x-2 text-base">
                <AlertTriangle className="h-5 w-5 text-criticalRed" />
                <span>Central de Alarmes IoT</span>
              </h3>
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${alarms.length > 0 ? 'bg-red-100 text-criticalRed' : 'bg-gray-100 text-gray-600'}`}>
                {alarms.length} Ativo(s)
              </span>
            </div>

            <div className="space-y-3 overflow-y-auto max-h-[420px] pr-1">
              {alarms.length === 0 ? (
                <div className="text-center py-16 text-gray-400">
                  <CheckCircle className="h-12 w-12 mx-auto text-natureGreen mb-2 opacity-80" />
                  <p className="text-sm font-bold text-graphiteText">Nenhum alarme detectado no momento.</p>
                  <p className="text-xs text-gray-400 mt-1">Todos os animais e sensores estão operando dentro do padrão.</p>
                </div>
              ) : (
                alarms.map((alarm) => {
                  const msg = String(alarm.mensagem || alarm.message || '').replace(/\((?:coleira|brinco)\s*#([^)]+)\)/gi, '($1)');
                  const devId = alarm.dispositivo_id || alarm.device_id;
                  const dataCriacao = alarm.criado_em || alarm.created_at;

                  return (
                    <div
                      key={alarm.id}
                      className="p-4 rounded-xl bg-red-50 border border-criticalRed/20 flex flex-col justify-between space-y-2 shadow-xs"
                    >
                      <div className="flex items-start space-x-2.5">
                        <AlertTriangle className="h-5 w-5 text-criticalRed shrink-0 mt-0.5" />
                        <div className="text-xs">
                          <p className="font-bold text-criticalRed">{msg}</p>
                          <p className="text-[10px] text-gray-500 mt-1">
                            Dispositivo: <span className="font-mono">{devId}</span> | {dataCriacao ? new Date(dataCriacao).toLocaleTimeString('pt-BR') : ''}
                          </p>
                        </div>
                      </div>

                      {canManageAlarms && (
                        <button
                          onClick={() => handleDismissAlarm(alarm.id)}
                          className="self-end text-xs font-bold text-criticalRed hover:text-red-900 bg-white px-3 py-1 rounded-lg border border-criticalRed/30 shadow-xs transition"
                        >
                          Reconhecer / Desativar
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* SEÇÃO DA TABELA DE SAÚDE DO REBANHO */}
      {overviewData && (
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4">
          <div className="flex justify-between items-center border-b pb-4">
            <h3 className="font-extrabold text-graphiteText text-base flex items-center space-x-2">
              <Activity className="h-5 w-5 text-natureGreen" />
              <span>Telemetria Biométrica do Rebanho</span>
            </h3>
            <span className="text-xs text-gray-500 font-semibold">
              Exibindo {filteredAnimals.length} de {totalAnimais} animais
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-offWhite text-gray-700 font-semibold border-b border-gray-200">
                  <th className="p-3 rounded-l-xl">Animal / Coleira</th>
                  <th className="p-3">Espécie & Raça</th>
                  <th className="p-3">Temp. Corporal</th>
                  <th className="p-3">Freq. Cardíaca</th>
                  <th className="p-3">Postura / Atividade</th>
                  <th className="p-3 rounded-r-xl">Status de Saúde</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-medium">
                {filteredAnimals.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-gray-400">
                      Nenhum animal encontrado para a busca "{searchTerm}".
                    </td>
                  </tr>
                ) : (
                  filteredAnimals.map((an: any) => {
                    const telem = an.ultima_telemetria?.dados || an.latest_telemetry?.data || an.ultima_telemetria || an.latest_telemetry;
                    const temp = telem?.temperatura_corporal ?? telem?.body_temperature;
                    const tempSensorFalhou = telem?.sensor_temp_ok === false;
                    const isFever = !tempSensorFalhou && temp > 39.5;
                    const brinco = an.numero_brinco || an.tag_number;
                    const devId = an.dispositivo_id || an.device_id;
                    const especie = an.especie || an.species;
                    const raca = an.raca || an.breed;
                    const bpm = telem?.frequencia_cardiaca ?? telem?.heart_rate;
                    const acel = obterAcelerometroAnimal(telem);
                    const infoPostura = obterInfoPosturaAnimal(telem);

                    return (
                      <tr key={an.id} className="hover:bg-gray-50 transition">
                        <td className="p-3 font-bold text-graphiteText flex items-center space-x-2">
                          <span className="text-base">🐄</span>
                          <div>
                            <p className="font-bold text-graphiteText">{brinco}</p>
                            <p className="text-[10px] text-gray-400 font-mono">ID: {devId}</p>
                          </div>
                        </td>
                        <td className="p-3 text-gray-700">{especie} ({raca || 'N/A'})</td>
                        <td className="p-3">
                          {!tempSensorFalhou && temp != null ? (
                            <span className={`font-bold ${isFever ? 'text-criticalRed' : 'text-graphiteText'}`}>
                              {temp} °C
                            </span>
                          ) : '-'}
                        </td>
                        <td className="p-3 font-bold text-graphiteText">
                          {bpm ? `${bpm} bpm` : '---'}
                        </td>
                        <td className="p-3">
                          {infoPostura ? (
                            <div className="flex flex-col items-start space-y-1">
                              <span
                                className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${infoPostura.classes}`}
                              >
                                <span>{infoPostura.icone}</span>
                                <span>{infoPostura.texto}</span>
                              </span>
                              {acel && (
                                <span className="text-[10px] text-gray-400 font-mono">
                                  X:{acel.x} Y:{acel.y} Z:{acel.z}
                                </span>
                              )}
                            </div>
                          ) : acel ? (
                            <span className="text-gray-500 font-mono text-[11px]">
                              X:{acel.x} Y:{acel.y}
                            </span>
                          ) : (
                            '---'
                          )}
                        </td>
                        <td className="p-3">
                          {isFever ? (
                            <span className="bg-red-100 text-criticalRed px-2.5 py-1 rounded-full text-[11px] font-bold inline-flex items-center space-x-1">
                              <span className="h-2 w-2 rounded-full bg-criticalRed animate-ping"></span>
                              <span>Crítico (Febre)</span>
                            </span>
                          ) : (
                            <span className="bg-green-100 text-natureGreen px-2.5 py-1 rounded-full text-[11px] font-bold inline-flex items-center space-x-1">
                              <span className="h-2 w-2 rounded-full bg-natureGreen"></span>
                              <span>Saudável</span>
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export const DashboardPage = Dashboard;
