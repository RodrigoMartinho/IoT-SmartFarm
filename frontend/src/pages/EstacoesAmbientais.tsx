import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../services/api';
import { useProperty } from '../context/PropertyContext';
import { CloudSun, Plus, Edit3, Trash2, Search, AlertCircle, Check, X, MapPin, Droplets, ThermometerSun, Activity, Sprout } from 'lucide-react';
import { HistoricoMedicoesModal } from '../components/HistoricoMedicoesModal';

export const EstacoesAmbientais: React.FC = () => {
  const { selectedPropertyId, selectedProperty, loadingProperties } = useProperty();
  const [stations, setStations] = useState<any[]>([]);
  const [search, setSearch] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Form fields
  const [envName, setEnvName] = useState('');
  const [envDeviceId, setEnvDeviceId] = useState('');
  const [historicoModal, setHistoricoModal] = useState<{ isOpen: boolean; dispositivoId: string; nome: string } | null>(null);

  useEffect(() => {
    if (selectedPropertyId) {
      fetchStations(selectedPropertyId);
    } else {
      setStations([]);
    }
  }, [selectedPropertyId]);

  const fetchStations = async (propId: number) => {
    try {
      const res = await api.get(`/estacoes-ambientais/propriedade/${propId}`);
      setStations(res.data);
    } catch (err) {
      console.error('Erro ao buscar estações:', err);
    }
  };

  const handleOpenCreateModal = () => {
    setEditingId(null);
    setError('');
    setEnvName('');
    setEnvDeviceId('');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (st: any) => {
    setEditingId(st.id);
    setError('');
    setEnvName(st.nome || st.name || '');
    setEnvDeviceId(st.dispositivo_id || st.device_id || '');
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
    setError('');
  };

  const handleSaveStation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPropertyId) return;

    setError('');
    setLoading(true);

    try {
      if (editingId) {
        await api.put(`/estacoes-ambientais/${editingId}`, {
          nome: envName,
          dispositivo_id: envDeviceId,
        });
      } else {
        await api.post('/estacoes-ambientais', {
          propriedade_id: selectedPropertyId,
          nome: envName,
          dispositivo_id: envDeviceId,
        });
      }
      handleCloseModal();
      fetchStations(selectedPropertyId);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao salvar os dados da estação.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteStation = async (id: number) => {
    if (!window.confirm('Tem certeza que deseja remover esta estação ambiental?')) return;
    try {
      await api.delete(`/estacoes-ambientais/${id}`);
      if (selectedPropertyId) fetchStations(selectedPropertyId);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Erro ao remover estação.');
    }
  };

  const filteredStations = stations.filter(
    (st) => {
      const nome = st.nome || st.name || '';
      const dev = st.dispositivo_id || st.device_id || '';
      const termo = search.toLowerCase();
      return nome.toLowerCase().includes(termo) || dev.toLowerCase().includes(termo);
    }
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-200">
      {/* Header & Seletor de Propriedade */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
        <div>
          <h1 className="text-2xl font-extrabold text-graphiteText flex items-center space-x-2.5">
            <div className="bg-alertAmber/10 p-2 rounded-xl text-alertAmber">
              <CloudSun className="h-6 w-6" />
            </div>
            <span>Estações meteorológicas</span>
          </h1>
          <p className="text-sm text-gray-500 mt-1 font-medium">
            Acompanhamento do clima e do solo: temperatura, chuva, umidade do ar e umidade do solo
          </p>
        </div>

        {selectedProperty && (
          <div className="flex items-center space-x-2 bg-natureGreen/10 text-natureGreen border border-natureGreen/20 px-3.5 py-2 rounded-xl text-xs font-semibold">
            <Sprout className="h-4 w-4 shrink-0" />
            <span>Propriedade ativa: <strong>{selectedProperty.nome || selectedProperty.name}</strong></span>
          </div>
        )}
      </div>

      {/* KPI Cards de Resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs">
          <p className="text-xs font-semibold text-gray-500">Estações instaladas</p>
          <p className="text-2xl font-black text-graphiteText mt-1">
            {stations.length} <span className="text-xs font-semibold text-gray-500">estações ativas</span>
          </p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-gray-500">Sensores de solo</p>
            <p className="text-2xl font-black text-natureGreen mt-1">{stations.length}</p>
          </div>
          <Droplets className="h-8 w-8 text-natureGreen/30" />
        </div>
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-gray-500">Clima e temperatura</p>
            <p className="text-2xl font-black text-alertAmber mt-1">{stations.length}</p>
          </div>
          <ThermometerSun className="h-8 w-8 text-alertAmber/30" />
        </div>
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-gray-500">Com posição no mapa</p>
            <p className="text-2xl font-black text-trustBlue mt-1">{stations.length}</p>
          </div>
          <MapPin className="h-8 w-8 text-trustBlue/30" />
        </div>
      </div>

      {/* Ações: Busca e Botão Cadastrar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar estação ou ID do módulo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-graphiteText shadow-xs focus:outline-none focus:ring-2 focus:ring-alertAmber/40"
          />
        </div>

        <button
          onClick={handleOpenCreateModal}
          className="w-full sm:w-auto bg-alertAmber hover:bg-alertAmber/90 text-white font-bold px-5 py-2.5 rounded-xl text-xs flex items-center justify-center space-x-2 shadow-sm transition transform active:scale-95"
        >
          <Plus className="h-4 w-4" />
          <span>Cadastrar Nova Estação</span>
        </button>
      </div>

      {/* Grid de Cards das Estações */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredStations.length === 0 ? (
          <div className="col-span-full bg-white p-12 text-center rounded-2xl border border-gray-200 text-gray-400 font-medium">
            Nenhuma estação ambiental cadastrada nesta propriedade.
          </div>
        ) : (
          filteredStations.map((st) => {
            const nome = st.nome || st.name;
            const devId = st.dispositivo_id || st.device_id;
            const lat = st.ultima_telemetria?.latitude ?? st.latitude;
            const lng = st.ultima_telemetria?.longitude ?? st.longitude;

            return (
              <div
                key={st.id}
                className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs flex flex-col justify-between hover:shadow-md transition"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-xl">🌤️</span>
                      <h4 className="font-extrabold text-graphiteText text-base">{nome}</h4>
                    </div>
                    <p className="text-xs text-gray-500 font-medium mt-1 flex items-center space-x-1">
                      <MapPin className="h-3.5 w-3.5 text-natureGreen" />
                      <span>
                        {lat !== undefined && lng !== undefined && lat !== null && lng !== null
                          ? `${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)} (GPS)`
                          : 'Localização automática via GPS do módulo'}
                      </span>
                    </p>
                  </div>

                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => handleOpenEditModal(st)}
                      className="text-iotBlue hover:text-blue-800 p-2 rounded-lg hover:bg-blue-50 transition"
                      title="Editar Dados da Estação"
                    >
                      <Edit3 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteStation(st.id)}
                      className="text-criticalRed hover:text-red-800 p-2 rounded-lg hover:bg-red-50 transition"
                      title="Remover Estação"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-gray-500">Módulo Clima e Solo</span>
                  <span className="text-xs font-mono bg-alertAmber/10 text-amber-800 font-bold px-2.5 py-1 rounded-lg">
                    {devId}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setHistoricoModal({ isOpen: true, dispositivoId: devId, nome })}
                  className="mt-3 w-full py-2 px-3 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200/70 rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 transition"
                >
                  <Activity className="h-3.5 w-3.5 text-amber-700" />
                  <span>Ver Histórico de Medições</span>
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* MODAL (React Portal) */}
      {isModalOpen &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-graphiteText/80 backdrop-blur-xs p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl shadow-2xl border border-gray-200 w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
              {/* Header do Modal */}
              <div className="bg-trustBlue text-white px-6 py-4 flex items-center justify-between border-b border-gray-700">
                <div className="flex items-center space-x-3">
                  <div className="bg-white p-2 rounded-xl text-alertAmber shadow-sm">
                    <CloudSun className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-extrabold tracking-wide">
                      {editingId ? `Editar Estação (${envName || editingId})` : 'Cadastrar Nova Estação Ambiental'}
                    </h2>
                    <p className="text-xs text-fieldGreen font-medium">
                      Localização no mapa e código da estação
                    </p>
                  </div>
                </div>

                <button
                  onClick={handleCloseModal}
                  className="p-2 rounded-xl bg-white/10 hover:bg-criticalRed transition text-white"
                  title="Fechar"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Corpo do Formulário */}
              <form onSubmit={handleSaveStation} className="p-6 space-y-4">
                {error && (
                  <div className="bg-red-50 border border-criticalRed/30 text-criticalRed p-3.5 rounded-xl flex items-center space-x-2 text-sm font-medium">
                    <AlertCircle className="h-5 w-5 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-graphiteText mb-1.5">
                    Nome da estação meteorológica
                  </label>
                  <input
                    type="text"
                    required
                    value={envName}
                    onChange={(e) => setEnvName(e.target.value)}
                    className="w-full p-2.5 border border-gray-300 rounded-xl text-sm text-graphiteText focus:ring-2 focus:ring-alertAmber/50 focus:outline-none"
                    placeholder="Ex: Estação Meteorológica Norte"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-graphiteText mb-1.5">
                    Identificação do dispositivo
                  </label>
                  <input
                    type="text"
                    required
                    value={envDeviceId}
                    onChange={(e) => setEnvDeviceId(e.target.value)}
                    className="w-full p-2.5 border border-gray-300 rounded-xl text-sm font-mono text-graphiteText focus:ring-2 focus:ring-alertAmber/50 focus:outline-none"
                    placeholder="Ex: ENV_STATION_01"
                  />
                </div>

                {/* Footer do Modal */}
                <div className="pt-4 border-t border-gray-200 flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={handleCloseModal}
                    className="bg-gray-100 hover:bg-gray-200 text-graphiteText font-bold px-5 py-2.5 rounded-xl text-xs transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="bg-alertAmber hover:bg-alertAmber/90 text-white font-bold px-6 py-2.5 rounded-xl text-xs shadow-md transition disabled:opacity-50 flex items-center space-x-1.5"
                  >
                    <Check className="h-4 w-4" />
                    <span>{loading ? 'Salvando...' : editingId ? 'Salvar Alterações' : 'Cadastrar'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {/* MODAL DE HISTÓRICO DE MEDIÇÕES IOT */}
      {historicoModal && (
        <HistoricoMedicoesModal
          isOpen={historicoModal.isOpen}
          onClose={() => setHistoricoModal(null)}
          dispositivoId={historicoModal.dispositivoId}
          nomeItem={historicoModal.nome}
          tipo="estacao_ambiental"
        />
      )}
    </div>
  );
};

export const PaginaEstacoesAmbientais = EstacoesAmbientais;
export const EnvironmentsPage = EstacoesAmbientais;

