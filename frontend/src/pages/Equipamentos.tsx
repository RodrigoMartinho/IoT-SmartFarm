import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../services/api';
import { useProperty } from '../context/PropertyContext';
import { Truck, Plus, Edit3, Trash2, Search, AlertCircle, Check, X, Navigation, Activity, Sprout, Radio, Clock, Cpu, Settings } from 'lucide-react';
import { HistoricoMedicoesModal } from '../components/HistoricoMedicoesModal';

export const Equipamentos: React.FC = () => {
  const { selectedPropertyId, selectedProperty, loadingProperties } = useProperty();
  const [equipments, setEquipments] = useState<any[]>([]);
  const [search, setSearch] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Form fields
  const [equipName, setEquipName] = useState('');
  const [equipType, setEquipType] = useState('Trator');
  const [equipModel, setEquipModel] = useState('');
  const [equipDeviceId, setEquipDeviceId] = useState('');
  const [sendInterval, setSendInterval] = useState(20);
  const [historicoModal, setHistoricoModal] = useState<{ isOpen: boolean; dispositivoId: string; nome: string } | null>(null);

  // Modal de Configuração Remota OTA
  const [configEquip, setConfigEquip] = useState<any | null>(null);
  const [configLoading, setConfigLoading] = useState(false);
  const [configError, setConfigError] = useState('');

  useEffect(() => {
    if (selectedPropertyId) {
      fetchEquipments(selectedPropertyId);
    } else {
      setEquipments([]);
    }
  }, [selectedPropertyId]);

  const fetchEquipments = async (propId: number) => {
    try {
      const res = await api.get(`/equipamentos/propriedade/${propId}`);
      setEquipments(res.data);
    } catch (err) {
      console.error('Erro ao buscar equipamentos:', err);
    }
  };

  const handleOpenCreateModal = () => {
    setEditingId(null);
    setError('');
    setEquipName('');
    setEquipType('Trator');
    setEquipModel('');
    setEquipDeviceId('');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (eq: any) => {
    setEditingId(eq.id);
    setError('');
    setEquipName(eq.nome || eq.name || '');
    setEquipType(eq.tipo || eq.type || 'Trator');
    setEquipModel(eq.modelo || eq.model || '');
    setEquipDeviceId(eq.dispositivo_id || eq.device_id || '');
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
    setError('');
  };

  const handleOpenConfigModal = (eq: any) => {
    setConfigEquip(eq);
    setConfigError('');
    setSendInterval(eq.intervalo_envio_segundos ?? 20);
  };

  const handleCloseConfigModal = () => {
    setConfigEquip(null);
    setConfigError('');
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!configEquip || !selectedPropertyId) return;

    setConfigError('');
    setConfigLoading(true);
    try {
      await api.put(`/equipamentos/${configEquip.id}`, {
        intervalo_envio_segundos: Number(sendInterval),
      });
      handleCloseConfigModal();
      fetchEquipments(selectedPropertyId);
    } catch (err: any) {
      setConfigError(err.response?.data?.detail || 'Erro ao enviar configuração remota.');
    } finally {
      setConfigLoading(false);
    }
  };

  const handleSaveEquipment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPropertyId) return;

    setError('');
    setLoading(true);

    try {
      const payload = {
        nome: equipName,
        tipo: equipType,
        modelo: equipModel,
        dispositivo_id: equipDeviceId,
      };

      if (editingId) {
        await api.put(`/equipamentos/${editingId}`, payload);
      } else {
        await api.post('/equipamentos', {
          propriedade_id: selectedPropertyId,
          ...payload,
        });
      }
      handleCloseModal();
      fetchEquipments(selectedPropertyId);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao salvar os dados do equipamento.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteEquipment = async (id: number) => {
    if (!window.confirm('Tem certeza que deseja remover este maquinário/equipamento?')) return;
    try {
      await api.delete(`/equipamentos/${id}`);
      if (selectedPropertyId) fetchEquipments(selectedPropertyId);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Erro ao remover equipamento.');
    }
  };

  const filteredEquipments = equipments.filter(
    (eq) => {
      const nome = eq.nome || eq.name || '';
      const tipo = eq.tipo || eq.type || '';
      const mod = eq.modelo || eq.model || '';
      const dev = eq.dispositivo_id || eq.device_id || '';
      const termo = search.toLowerCase();
      return nome.toLowerCase().includes(termo) ||
        tipo.toLowerCase().includes(termo) ||
        mod.toLowerCase().includes(termo) ||
        dev.toLowerCase().includes(termo);
    }
  );

  const totalTratores = equipments.filter((e) => (e.tipo || e.type) === 'Trator').length;
  const totalColheitadeiras = equipments.filter((e) => (e.tipo || e.type) === 'Colheitadeira').length;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-200">
      {/* Header & Seletor de Propriedade */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
        <div>
          <h1 className="text-2xl font-extrabold text-graphiteText flex items-center space-x-2.5">
            <div className="bg-iotBlue/10 p-2 rounded-xl text-iotBlue">
              <Truck className="h-6 w-6" />
            </div>
            <span>Gestão de equipamentos agrícolas</span>
          </h1>
          <p className="text-sm text-gray-500 mt-1 font-medium">
            Acompanhe no mapa onde suas máquinas estão, se estão ligadas e a velocidade
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
          <p className="text-xs font-semibold text-gray-500">Frota total</p>
          <p className="text-2xl font-black text-graphiteText mt-1">
            {equipments.length} <span className="text-xs font-semibold text-gray-500">veículos/máquinas</span>
          </p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs">
          <p className="text-xs font-semibold text-gray-500">Tratores</p>
          <p className="text-2xl font-black text-iotBlue mt-1">
            {totalTratores} <span className="text-xs font-semibold text-gray-500">unidades</span>
          </p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs">
          <p className="text-xs font-semibold text-gray-500">Colheitadeiras</p>
          <p className="text-2xl font-black text-natureGreen mt-1">
            {totalColheitadeiras} <span className="text-xs font-semibold text-gray-500">unidades</span>
          </p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-gray-500">Rastreadores GPS</p>
            <p className="text-2xl font-black text-trustBlue mt-1">{equipments.length}</p>
          </div>
          <Navigation className="h-8 w-8 text-iotBlue/30" />
        </div>
      </div>

      {/* Ações: Busca e Botão Cadastrar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar máquina, tipo ou rastreador..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-graphiteText shadow-xs focus:outline-none focus:ring-2 focus:ring-iotBlue/40"
          />
        </div>

        <button
          onClick={handleOpenCreateModal}
          className="w-full sm:w-auto bg-iotBlue hover:bg-iotBlue/90 text-white font-bold px-5 py-2.5 rounded-xl text-xs flex items-center justify-center space-x-2 shadow-sm transition transform active:scale-95"
        >
          <Plus className="h-4 w-4" />
          <span>Cadastrar Novo Equipamento</span>
        </button>
      </div>

      {/* Grid de Cards dos Equipamentos */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredEquipments.length === 0 ? (
          <div className="col-span-full bg-white p-12 text-center rounded-2xl border border-gray-200 text-gray-400 font-medium">
            Nenhum equipamento cadastrado ou encontrado com este filtro.
          </div>
        ) : (
          filteredEquipments.map((eq) => {
            const nome = eq.nome || eq.name;
            const tipo = eq.tipo || eq.type;
            const modelo = eq.modelo || eq.model;
            const devId = eq.dispositivo_id || eq.device_id;

            return (
              <div
                key={eq.id}
                className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs flex flex-col justify-between hover:shadow-md transition"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-xl">🚜</span>
                      <h4 className="font-extrabold text-graphiteText text-base">{nome}</h4>
                    </div>
                    <p className="text-xs text-gray-500 font-medium mt-1">
                      Tipo: <span className="text-graphiteText font-semibold">{tipo}</span>
                      {modelo && (
                        <>
                          {' '}
                          | Modelo: <span className="text-graphiteText font-semibold">{modelo}</span>
                        </>
                      )}
                    </p>
                  </div>

                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => handleOpenConfigModal(eq)}
                      className="text-trustBlue hover:text-graphiteText p-2 rounded-lg hover:bg-slate-100 transition"
                      title="Configurar Rastreador"
                    >
                      <Settings className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleOpenEditModal(eq)}
                      className="text-iotBlue hover:text-blue-800 p-2 rounded-lg hover:bg-blue-50 transition"
                      title="Editar Dados do Equipamento"
                    >
                      <Edit3 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteEquipment(eq.id)}
                      className="text-criticalRed hover:text-red-800 p-2 rounded-lg hover:bg-red-50 transition"
                      title="Remover Equipamento"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-gray-500">Rastreador GPS</span>
                  <span className="text-xs font-mono bg-iotBlue/10 text-iotBlue font-bold px-2.5 py-1 rounded-lg">
                    {devId}
                  </span>
                </div>

                <div className="mt-2.5 flex items-center justify-between text-[11px] bg-slate-50 p-2 rounded-xl border border-gray-100">
                  <div className="flex items-center space-x-1.5 text-gray-600">
                    <Radio className="h-3.5 w-3.5 text-iotBlue" />
                    <span>Envio de sinal:</span>
                  </div>
                  <span className="text-xs font-bold text-graphiteText">
                    a cada {eq.intervalo_envio_segundos ?? 20}s
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setHistoricoModal({ isOpen: true, dispositivoId: devId, nome })}
                  className="mt-3 w-full py-2 px-3 bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-200/70 rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 transition"
                >
                  <Activity className="h-3.5 w-3.5 text-iotBlue" />
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
                  <div className="bg-white p-2 rounded-xl text-iotBlue shadow-sm">
                    <Truck className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-extrabold tracking-wide">
                      {editingId ? `Editar Equipamento (${equipName || editingId})` : 'Cadastrar Novo Equipamento'}
                    </h2>
                    <p className="text-xs text-fieldGreen font-medium">
                      Dados da máquina e código do rastreador
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
              <form onSubmit={handleSaveEquipment} className="p-6 space-y-4">
                {error && (
                  <div className="bg-red-50 border border-criticalRed/30 text-criticalRed p-3.5 rounded-xl flex items-center space-x-2 text-sm font-medium">
                    <AlertCircle className="h-5 w-5 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-graphiteText mb-1.5">
                    Nome do equipamento
                  </label>
                  <input
                    type="text"
                    required
                    value={equipName}
                    onChange={(e) => setEquipName(e.target.value)}
                    className="w-full p-2.5 border border-gray-300 rounded-xl text-sm text-graphiteText focus:ring-2 focus:ring-iotBlue/50 focus:outline-none"
                    placeholder="Ex: Trator John Deere 7230J"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-graphiteText mb-1.5">Tipo de máquina</label>
                    <select
                      value={equipType}
                      onChange={(e) => setEquipType(e.target.value)}
                      className="w-full p-2.5 border border-gray-300 rounded-xl text-sm bg-white text-graphiteText focus:ring-2 focus:ring-iotBlue/50 focus:outline-none"
                    >
                      <option value="Trator">Trator</option>
                      <option value="Colheitadeira">Colheitadeira</option>
                      <option value="Pulverizador">Pulverizador</option>
                      <option value="Veículo Utilitário">Veículo Utilitário</option>
                      <option value="Outro">Outro</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-graphiteText mb-1.5">Modelo / observações</label>
                    <input
                      type="text"
                      value={equipModel}
                      onChange={(e) => setEquipModel(e.target.value)}
                      className="w-full p-2.5 border border-gray-300 rounded-xl text-sm text-graphiteText focus:ring-2 focus:ring-iotBlue/50 focus:outline-none"
                      placeholder="Ex: 7230J - 230 CV"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-graphiteText mb-1.5">
                    Identificação do dispositivo
                  </label>
                  <input
                    type="text"
                    required
                    value={equipDeviceId}
                    onChange={(e) => setEquipDeviceId(e.target.value)}
                    className="w-full p-2.5 border border-gray-300 rounded-xl text-sm font-mono text-graphiteText focus:ring-2 focus:ring-iotBlue/50 focus:outline-none"
                    placeholder="Ex: EQUIP_TRAC_01"
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
                    className="bg-iotBlue hover:bg-iotBlue/90 text-white font-bold px-6 py-2.5 rounded-xl text-xs shadow-md transition disabled:opacity-50 flex items-center space-x-1.5"
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

      {/* MODAL DE CONFIGURAÇÃO REMOTA OTA DO EQUIPAMENTO */}
      {configEquip &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-graphiteText/80 backdrop-blur-xs p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl shadow-2xl border border-gray-200 w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
              {/* Header do Modal */}
              <div className="bg-trustBlue text-white px-6 py-4 flex items-center justify-between border-b border-gray-700">
                <div className="flex items-center space-x-3">
                  <div className="bg-white p-2 rounded-xl text-iotBlue shadow-sm">
                    <Settings className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-extrabold tracking-wide">
                      Configuração Remota ({configEquip.nome || configEquip.name})
                    </h2>
                    <p className="text-xs text-fieldGreen font-mono font-medium">
                      Dispositivo: {configEquip.dispositivo_id || configEquip.device_id}
                    </p>
                  </div>
                </div>

                <button
                  onClick={handleCloseConfigModal}
                  className="p-2 rounded-xl bg-white/10 hover:bg-criticalRed transition text-white"
                  title="Fechar"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleSaveConfig} className="p-6 space-y-4">
                {configError && (
                  <div className="bg-red-50 border border-criticalRed/30 text-criticalRed p-3.5 rounded-xl flex items-center space-x-2 text-sm font-medium">
                    <AlertCircle className="h-5 w-5 shrink-0" />
                    <span>{configError}</span>
                  </div>
                )}

                <div className="bg-slate-50 p-4 rounded-2xl border border-gray-200 space-y-3">
                  <div className="flex items-center space-x-2 text-trustBlue">
                    <Cpu className="h-4 w-4" />
                    <h3 className="text-xs font-bold text-trustBlue">
                      Ajustes do Rastreador
                    </h3>
                  </div>
                  <p className="text-[11px] text-gray-500 leading-relaxed">
                    Escolha de quanto em quanto tempo o rastreador desta máquina envia a localização. Ao salvar, a configuração é enviada automaticamente para o aparelho.
                  </p>

                  <div>
                    <label className="block text-xs font-semibold text-graphiteText mb-1 flex items-center space-x-1">
                      <Radio className="h-3.5 w-3.5 text-iotBlue" />
                      <span>Intervalo de envio do sinal</span>
                    </label>
                    <select
                      value={sendInterval}
                      onChange={(e) => setSendInterval(Number(e.target.value))}
                      className="w-full p-2.5 border border-gray-300 rounded-xl text-xs font-semibold bg-white text-graphiteText focus:ring-2 focus:ring-iotBlue/50 focus:outline-none"
                    >
                      <option value={5}>A cada 5 segundos (tempo real / manobra)</option>
                      <option value={10}>A cada 10 segundos (alta precisão)</option>
                      <option value={20}>A cada 20 segundos (padrão de campo)</option>
                      <option value={30}>A cada 30 segundos (otimizado)</option>
                      <option value={60}>A cada 1 minuto</option>
                      <option value={120}>A cada 2 minutos</option>
                    </select>
                  </div>
                </div>

                <div className="pt-4 border-t border-gray-200 flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={handleCloseConfigModal}
                    className="bg-gray-100 hover:bg-gray-200 text-graphiteText font-bold px-5 py-2.5 rounded-xl text-xs transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={configLoading}
                    className="bg-iotBlue hover:bg-iotBlue/90 text-white font-bold px-6 py-2.5 rounded-xl text-xs shadow-md transition disabled:opacity-50 flex items-center space-x-1.5"
                  >
                    <Check className="h-4 w-4" />
                    <span>{configLoading ? 'Enviando...' : 'Salvar Configurações'}</span>
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
          tipo="equipamento"
        />
      )}
    </div>
  );
};

export const PaginaEquipamentos = Equipamentos;
export const EquipmentsPage = Equipamentos;

