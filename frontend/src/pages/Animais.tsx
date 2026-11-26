import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../services/api';
import { useProperty } from '../context/PropertyContext';
import { PawPrint as Tag, Plus, Edit3, Trash2, Search, AlertCircle, Check, X, ShieldCheck, Activity, Radio, Cpu, Sprout, Zap, Power, Settings } from 'lucide-react';
import { HistoricoMedicoesModal } from '../components/HistoricoMedicoesModal';
import { obterInfoPosturaAnimal } from '../utils/postura';

export const Animais: React.FC = () => {
  const { selectedPropertyId, selectedProperty, loadingProperties } = useProperty();
  const [animals, setAnimals] = useState<any[]>([]);
  const [search, setSearch] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Form fields
  const [tagNumber, setTagNumber] = useState('');
  const [species, setSpecies] = useState('Bovino');
  const [breed, setBreed] = useState('Nelore');
  const [animalDeviceId, setAnimalDeviceId] = useState('');
  const [sendInterval, setSendInterval] = useState(30);
  const [economyMode, setEconomyMode] = useState(true);
  const [togglingEcoId, setTogglingEcoId] = useState<number | null>(null);
  const [historicoModal, setHistoricoModal] = useState<{ isOpen: boolean; dispositivoId: string; nome: string } | null>(null);

  // Modal de Configuração Remota OTA
  const [configAnimal, setConfigAnimal] = useState<any | null>(null);
  const [configLoading, setConfigLoading] = useState(false);
  const [configError, setConfigError] = useState('');

  useEffect(() => {
    if (selectedPropertyId) {
      fetchAnimals(selectedPropertyId);
    } else {
      setAnimals([]);
    }
  }, [selectedPropertyId]);

  const fetchAnimals = async (propId: number) => {
    try {
      const res = await api.get(`/animais/propriedade/${propId}`);
      setAnimals(res.data);
    } catch (err) {
      console.error('Erro ao buscar animais:', err);
    }
  };

  const handleOpenCreateModal = () => {
    setEditingId(null);
    setError('');
    setTagNumber('');
    setSpecies('Bovino');
    setBreed('Nelore');
    setAnimalDeviceId('');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (animal: any) => {
    setEditingId(animal.id);
    setError('');
    setTagNumber(animal.numero_brinco || animal.tag_number || '');
    setSpecies(animal.especie || animal.species || 'Bovino');
    setBreed(animal.raca || animal.breed || '');
    setAnimalDeviceId(animal.dispositivo_id || animal.device_id || '');
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
    setError('');
  };

  const handleOpenConfigModal = (animal: any) => {
    setConfigAnimal(animal);
    setConfigError('');
    setSendInterval(animal.intervalo_envio_segundos ?? animal.intervalo_gps_segundos ?? 30);
    setEconomyMode(animal.economia_energia !== false);
  };

  const handleCloseConfigModal = () => {
    setConfigAnimal(null);
    setConfigError('');
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!configAnimal || !selectedPropertyId) return;

    setConfigError('');
    setConfigLoading(true);
    try {
      await api.put(`/animais/${configAnimal.id}`, {
        intervalo_gps_segundos: Number(sendInterval),
        intervalo_envio_segundos: Number(sendInterval),
        economia_energia: economyMode,
      });
      handleCloseConfigModal();
      fetchAnimals(selectedPropertyId);
    } catch (err: any) {
      setConfigError(err.response?.data?.detail || 'Erro ao enviar configuração remota.');
    } finally {
      setConfigLoading(false);
    }
  };

  const handleToggleEconomiaEnergia = async (animalId: number) => {
    try {
      setTogglingEcoId(animalId);
      await api.patch(`/animais/${animalId}/economia-energia`);
      if (selectedPropertyId) {
        await fetchAnimals(selectedPropertyId);
      }
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Erro ao alterar modo de economia.');
    } finally {
      setTogglingEcoId(null);
    }
  };

  const handleSaveAnimal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPropertyId) return;

    setError('');
    setLoading(true);

    try {
      const payload = {
        numero_brinco: tagNumber,
        especie: species,
        raca: breed,
        dispositivo_id: animalDeviceId,
      };

      if (editingId) {
        await api.put(`/animais/${editingId}`, payload);
      } else {
        await api.post('/animais', {
          propriedade_id: selectedPropertyId,
          ...payload,
        });
      }
      handleCloseModal();
      fetchAnimals(selectedPropertyId);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao salvar os dados do animal.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAnimal = async (id: number) => {
    if (!window.confirm('Tem certeza que deseja remover este animal do rebanho?')) return;
    try {
      await api.delete(`/animais/${id}`);
      if (selectedPropertyId) fetchAnimals(selectedPropertyId);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Erro ao remover animal.');
    }
  };

  const filteredAnimals = animals.filter(
    (a) => {
      const brinco = a.numero_brinco || a.tag_number || '';
      const esp = a.especie || a.species || '';
      const rac = a.raca || a.breed || '';
      const dev = a.dispositivo_id || a.device_id || '';
      const termo = search.toLowerCase();
      return brinco.toLowerCase().includes(termo) ||
        esp.toLowerCase().includes(termo) ||
        rac.toLowerCase().includes(termo) ||
        dev.toLowerCase().includes(termo);
    }
  );

  const totalBovinos = animals.filter((a) => (a.especie || a.species) === 'Bovino').length;
  const totalOutros = animals.length - totalBovinos;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-200">
      {/* Header & Seletor de Propriedade */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
        <div>
          <h1 className="text-2xl font-extrabold text-graphiteText flex items-center space-x-2.5">
            <div className="bg-natureGreen/10 p-2 rounded-xl text-natureGreen">
              <Tag className="h-6 w-6" />
            </div>
            <span>Gestão de animais</span>
          </h1>
          <p className="text-sm text-gray-500 mt-1 font-medium">
            Acompanhamento de saúde, localização e identificação eletrônica do rebanho
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
          <p className="text-xs font-semibold text-gray-500">Total do rebanho</p>
          <p className="text-2xl font-black text-graphiteText mt-1">{animals.length} <span className="text-xs font-semibold text-gray-500">cabeças</span></p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs">
          <p className="text-xs font-semibold text-gray-500">Bovinos</p>
          <p className="text-2xl font-black text-natureGreen mt-1">{totalBovinos} <span className="text-xs font-semibold text-gray-500">animais</span></p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs">
          <p className="text-xs font-semibold text-gray-500">Outras espécies</p>
          <p className="text-2xl font-black text-iotBlue mt-1">{totalOutros} <span className="text-xs font-semibold text-gray-500">animais</span></p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-gray-500">Coleiras e sensores</p>
            <p className="text-2xl font-black text-trustBlue mt-1">{animals.length}</p>
          </div>
          <ShieldCheck className="h-8 w-8 text-natureGreen/30" />
        </div>
      </div>

      {/* Ações: Busca e Botão Cadastrar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por identificação, espécie ou sensor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-graphiteText shadow-xs focus:outline-none focus:ring-2 focus:ring-natureGreen/40"
          />
        </div>

        <button
          onClick={handleOpenCreateModal}
          className="w-full sm:w-auto bg-natureGreen hover:bg-natureGreen/90 text-white font-bold px-5 py-2.5 rounded-xl text-xs flex items-center justify-center space-x-2 shadow-sm transition transform active:scale-95"
        >
          <Plus className="h-4 w-4" />
          <span>Cadastrar novo animal</span>
        </button>
      </div>

      {/* Grid de Cards dos Animais */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredAnimals.length === 0 ? (
          <div className="col-span-full bg-white p-12 text-center rounded-2xl border border-gray-200 text-gray-400 font-medium">
            Nenhum animal encontrado para os filtros selecionados.
          </div>
        ) : (
          filteredAnimals.map((an) => {
            const brinco = an.numero_brinco || an.tag_number;
            const esp = an.especie || an.species;
            const rac = an.raca || an.breed;
            const devId = an.dispositivo_id || an.device_id;
            const telem = an.ultima_telemetria?.dados || an.latest_telemetry?.data || an.ultima_telemetria || an.latest_telemetry;
            const infoPostura = obterInfoPosturaAnimal(telem);

            return (
              <div
                key={an.id}
                className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs flex flex-col justify-between hover:shadow-md transition"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-xl">🐄</span>
                      <h4 className="font-extrabold text-graphiteText text-base">{brinco}</h4>
                    </div>
                    <p className="text-xs text-gray-500 font-medium mt-1">
                      Espécie: <span className="text-graphiteText font-semibold">{esp}</span>
                      {rac && (
                        <>
                          {' '}
                          | Raça: <span className="text-graphiteText font-semibold">{rac}</span>
                        </>
                      )}
                    </p>
                  </div>

                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => handleOpenConfigModal(an)}
                      className="text-trustBlue hover:text-graphiteText p-2 rounded-lg hover:bg-slate-100 transition"
                      title="Configurar Coleira"
                    >
                      <Settings className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleOpenEditModal(an)}
                      className="text-iotBlue hover:text-blue-800 p-2 rounded-lg hover:bg-blue-50 transition"
                      title="Editar Dados do Animal"
                    >
                      <Edit3 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteAnimal(an.id)}
                      className="text-criticalRed hover:text-red-800 p-2 rounded-lg hover:bg-red-50 transition"
                      title="Remover Animal"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {infoPostura && (
                  <div className="mt-3 flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-gray-500">Postura / Atividade</span>
                    <span
                      className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full font-bold border ${infoPostura.classes}`}
                    >
                      <span>{infoPostura.icone}</span>
                      <span>{infoPostura.texto}</span>
                    </span>
                  </div>
                )}

                <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-gray-500">Código da Coleira</span>
                  <span className="text-xs font-mono bg-natureGreen/10 text-natureGreen font-bold px-2.5 py-1 rounded-lg">
                    {devId}
                  </span>
                </div>

                <div className="mt-2.5 flex items-center justify-between text-[11px] bg-slate-50 p-2 rounded-xl border border-gray-100">
                  <div className="flex items-center space-x-1.5 text-gray-600">
                    <Radio className="h-3.5 w-3.5 text-natureGreen" />
                    <span>Coleta e Envio (Ciclo): <strong className="text-graphiteText">{an.intervalo_envio_segundos ?? an.intervalo_gps_segundos ?? 30}s</strong></span>
                  </div>
                </div>

                <div className="mt-2.5 flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-gray-500">Economia de Energia</span>
                  <button
                    type="button"
                    onClick={() => handleToggleEconomiaEnergia(an.id)}
                    disabled={togglingEcoId === an.id}
                    title={
                      an.economia_energia !== false
                        ? 'Economia de energia ativada: reduz o consumo da bateria entre as leituras. Clique para desativar.'
                        : 'Economia de energia desativada: o colar permanece ligado continuamente. Clique para ativar.'
                    }
                    className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition shadow-2xs ${
                      an.economia_energia !== false
                        ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200 border border-emerald-300'
                        : 'bg-amber-100 text-amber-800 hover:bg-amber-200 border border-amber-300'
                    }`}
                  >
                    {an.economia_energia !== false ? (
                      <>
                        <Zap className="h-3.5 w-3.5 text-emerald-600 fill-emerald-600" />
                        <span>{togglingEcoId === an.id ? 'Alterando...' : 'Ativado'}</span>
                      </>
                    ) : (
                      <>
                        <Power className="h-3.5 w-3.5 text-amber-600" />
                        <span>{togglingEcoId === an.id ? 'Alterando...' : 'Desativada'}</span>
                      </>
                    )}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setHistoricoModal({ isOpen: true, dispositivoId: devId, nome: String(brinco) })}
                  className="mt-3 w-full py-2 px-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200/70 rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 transition"
                >
                  <Activity className="h-3.5 w-3.5 text-natureGreen" />
                  <span>Ver histórico de medições</span>
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
                  <div className="bg-white p-2 rounded-xl text-natureGreen shadow-sm">
                    <Tag className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-extrabold tracking-wide">
                      {editingId ? `Editar animal (${tagNumber || editingId})` : 'Cadastrar novo animal'}
                    </h2>
                    <p className="text-xs text-fieldGreen font-medium">
                      Identificação do animal e associação do dispositivo
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
              <form onSubmit={handleSaveAnimal} className="p-6 space-y-4">
                {error && (
                  <div className="bg-red-50 border border-criticalRed/30 text-criticalRed p-3.5 rounded-xl flex items-center space-x-2 text-sm font-medium">
                    <AlertCircle className="h-5 w-5 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-graphiteText mb-1.5">
                    Identificação do Animal
                  </label>
                  <input
                    type="text"
                    required
                    value={tagNumber}
                    onChange={(e) => setTagNumber(e.target.value)}
                    className="w-full p-2.5 border border-gray-300 rounded-xl text-sm text-graphiteText focus:ring-2 focus:ring-natureGreen/50 focus:outline-none"
                    placeholder="Ex: BR-1001"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-graphiteText mb-1.5">Espécie</label>
                    <select
                      value={species}
                      onChange={(e) => setSpecies(e.target.value)}
                      className="w-full p-2.5 border border-gray-300 rounded-xl text-sm bg-white text-graphiteText focus:ring-2 focus:ring-natureGreen/50 focus:outline-none"
                    >
                      <option value="Bovino">Bovino</option>
                      <option value="Ovino">Ovino</option>
                      <option value="Caprino">Caprino</option>
                      <option value="Equino">Equino</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-graphiteText mb-1.5">Raça</label>
                    <input
                      type="text"
                      value={breed}
                      onChange={(e) => setBreed(e.target.value)}
                      className="w-full p-2.5 border border-gray-300 rounded-xl text-sm text-graphiteText focus:ring-2 focus:ring-natureGreen/50 focus:outline-none"
                      placeholder="Ex: Nelore / Angus"
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
                    value={animalDeviceId}
                    onChange={(e) => setAnimalDeviceId(e.target.value)}
                    className="w-full p-2.5 border border-gray-300 rounded-xl text-sm font-mono text-graphiteText focus:ring-2 focus:ring-natureGreen/50 focus:outline-none"
                    placeholder="Ex: ANIMAL_BOV_001"
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
                    className="bg-natureGreen hover:bg-natureGreen/90 text-white font-bold px-6 py-2.5 rounded-xl text-xs shadow-md transition disabled:opacity-50 flex items-center space-x-1.5"
                  >
                    <Check className="h-4 w-4" />
                    <span>{loading ? 'Salvando...' : editingId ? 'Salvar alterações' : 'Cadastrar'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {/* MODAL DE CONFIGURAÇÃO REMOTA OTA DO ANIMAL */}
      {configAnimal &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-graphiteText/80 backdrop-blur-xs p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl shadow-2xl border border-gray-200 w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
              {/* Header do Modal */}
              <div className="bg-trustBlue text-white px-6 py-4 flex items-center justify-between border-b border-gray-700">
                <div className="flex items-center space-x-3">
                  <div className="bg-white p-2 rounded-xl text-trustBlue shadow-sm">
                    <Settings className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-extrabold tracking-wide">
                      Configuração Remota ({configAnimal.numero_brinco || configAnimal.tag_number})
                    </h2>
                    <p className="text-xs text-fieldGreen font-mono font-medium">
                      Dispositivo: {configAnimal.dispositivo_id || configAnimal.device_id}
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
                      Ajustes da Coleira
                    </h3>
                  </div>
                  <p className="text-[11px] text-gray-500 leading-relaxed">
                    Escolha de quanto em quanto tempo a coleira envia informações e se deve economizar bateria. Ao salvar, a nova configuração é enviada automaticamente para o aparelho.
                  </p>

                  <div className="pt-1">
                    <label className="block text-xs font-semibold text-graphiteText mb-1 flex items-center space-x-1">
                      <Radio className="h-3.5 w-3.5 text-natureGreen" />
                      <span>Tempo de Coleta e Envio</span>
                    </label>
                    <select
                      value={sendInterval}
                      onChange={(e) => setSendInterval(Number(e.target.value))}
                      className="w-full p-2.5 border border-gray-300 rounded-xl text-xs font-semibold bg-white text-graphiteText focus:ring-2 focus:ring-natureGreen/50 focus:outline-none"
                    >
                      <option value={5}>A cada 5 segundos (tempo real)</option>
                      <option value={10}>A cada 10 segundos (padrão)</option>
                      <option value={15}>A cada 15 segundos</option>
                      <option value={30}>A cada 30 segundos (otimizado)</option>
                      <option value={45}>A cada 45 segundos</option>
                      <option value={60}>A cada 1 minuto</option>
                      <option value={300}>A cada 5 minutos</option>
                      <option value={900}>A cada 15 minutos</option>
                    </select>
                  </div>

                  {/* Toggle Economia de Energia */}
                  <div className="pt-3 border-t border-gray-200/80 flex items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <label className="text-xs font-bold text-graphiteText flex items-center space-x-1.5">
                        <Zap className="h-3.5 w-3.5 text-natureGreen" />
                        <span>Economia de Energia</span>
                      </label>
                      <p className="text-[11px] text-gray-500">
                        {economyMode
                          ? 'Ativado: reduz o consumo de energia entre as leituras para prolongar a duração da bateria.'
                          : 'Desativada: mantém o colar ligado continuamente (maior consumo de bateria).'}
                      </p>
                    </div>

                    <div className="flex items-center space-x-2 shrink-0">
                      <span className={`text-[11px] font-bold ${economyMode ? 'text-natureGreen' : 'text-amber-700'}`}>
                        {economyMode ? 'Ativado' : 'Desativada'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setEconomyMode(!economyMode)}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          economyMode ? 'bg-natureGreen' : 'bg-gray-300'
                        }`}
                        role="switch"
                        aria-checked={economyMode}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                            economyMode ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
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
                    className="bg-natureGreen hover:bg-natureGreen/90 text-white font-bold px-6 py-2.5 rounded-xl text-xs shadow-md transition disabled:opacity-50 flex items-center space-x-1.5"
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
          tipo="animal"
        />
      )}
    </div>
  );
};

export const PaginaAnimais = Animais;
export const AnimalsPage = Animais;

