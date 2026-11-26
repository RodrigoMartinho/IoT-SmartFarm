import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../services/api';
import { useProperty } from '../context/PropertyContext';
import { useAuth } from '../context/AuthContext';
import { PropriedadeDemarcacao } from '../components/PropriedadeDemarcacao';
import { Sprout, Plus, Trash2, MapPin, AlertCircle, Edit3, Check, X, Maximize2 } from 'lucide-react';

export const Propriedades: React.FC = () => {
  const { refreshProperties } = useProperty();
  const { user } = useAuth();
  const canManageProperties = !user || Boolean(user.eh_administrador || user.pode_gerenciar_propriedades);
  const [properties, setProperties] = useState<any[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [polygonGeoJson, setPolygonGeoJson] = useState<any>(null);
  const [initialMapGeoJson, setInitialMapGeoJson] = useState<any>(null);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Conta a quantidade de vértices geométricos reais, desconsiderando repetição de fechamento
  const contarVerticesReais = (geojson: any): number => {
    const coords = geojson?.coordinates?.[0];
    if (!coords || !Array.isArray(coords)) return 0;
    if (
      coords.length > 3 &&
      coords[0][0] === coords[coords.length - 1][0] &&
      coords[0][1] === coords[coords.length - 1][1]
    ) {
      return coords.length - 1;
    }
    return coords.length;
  };

  useEffect(() => {
    fetchProperties();
  }, []);

  const fetchProperties = async () => {
    try {
      const res = await api.get('/propriedades');
      setProperties(res.data);
    } catch (err) {
      console.error('Erro ao listar propriedades:', err);
    }
  };

  const handleOpenCreateModal = () => {
    setEditingId(null);
    setName('');
    setDescription('');
    setPolygonGeoJson(null);
    setInitialMapGeoJson(null);
    setShowModal(true);
    setError('');
  };

  const handleOpenEditModal = (prop: any) => {
    setEditingId(prop.id);
    setName(prop.nome || prop.name);
    setDescription(prop.descricao || prop.description || '');
    const geo = prop.poligono_geojson || prop.polygon_geojson;
    setPolygonGeoJson(geo);
    setInitialMapGeoJson(geo);
    setShowModal(true);
    setError('');
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingId(null);
    setName('');
    setDescription('');
    setPolygonGeoJson(null);
    setInitialMapGeoJson(null);
  };

  const handleSaveProperty = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!polygonGeoJson) {
      setError('Por favor, delimite o perímetro da propriedade desenhando no mapa abaixo.');
      return;
    }

    setLoading(true);
    try {
      if (editingId) {
        await api.put(`/propriedades/${editingId}`, {
          nome: name,
          descricao: description,
          poligono_geojson: polygonGeoJson
        });
      } else {
        await api.post('/propriedades', {
          nome: name,
          descricao: description,
          poligono_geojson: polygonGeoJson
        });
      }

      handleCloseModal();
      await fetchProperties();
      await refreshProperties();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao salvar propriedade.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProperty = async (id: number) => {
    if (confirm('Tem certeza que deseja remover esta propriedade? Todos os animais e sensores vinculados a ela serão removidos.')) {
      try {
        await api.delete(`/propriedades/${id}`);
        await fetchProperties();
        await refreshProperties();
      } catch (err) {
        console.error('Erro ao deletar propriedade:', err);
      }
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header Principal da Página */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
        <div>
          <h1 className="text-2xl font-extrabold text-graphiteText flex items-center space-x-2">
            <Sprout className="h-7 w-7 text-natureGreen" />
            <span>Gestão de propriedades rurais</span>
          </h1>
          <p className="text-sm text-gray-500 mt-1 font-medium">
            Cadastre, edite a área e delimite os perímetros geográficos das suas fazendas no mapa
          </p>
        </div>

        {canManageProperties && (
          <button
            onClick={handleOpenCreateModal}
            className="bg-natureGreen hover:bg-natureGreen/90 text-white font-bold px-5 py-3 rounded-xl flex items-center space-x-2 shadow-md transition transform active:scale-95"
          >
            <Plus className="h-5 w-5" />
            <span>Nova propriedade</span>
          </button>
        )}
      </div>

      {/* MODAL Fundo Esmaecido / Foco Total */}
      {showModal && createPortal(
        <div className="fixed inset-0 bg-graphiteText/80 backdrop-blur-xs z-[9999] flex items-center justify-center p-4 sm:p-6 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl border border-gray-200 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            
            {/* Modal Header */}
            <div className="bg-trustBlue text-white px-6 py-4 flex items-center justify-between border-b border-gray-700">
              <div className="flex items-center space-x-3">
                <div className="bg-white p-2 rounded-xl text-natureGreen shadow-sm">
                  <Maximize2 className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-extrabold tracking-wide">
                    {editingId ? `Editar propriedade (ID #${editingId})` : 'Demarcar nova propriedade'}
                  </h2>
                  <p className="text-xs text-fieldGreen font-medium">
                    Desenhe no mapa os limites da sua propriedade
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

            {/* Modal Content / Form Body */}
            <div className="p-6 overflow-y-auto space-y-5 flex-1 bg-offWhite/30">
              {error && (
                <div className="bg-red-50 border border-criticalRed/30 text-criticalRed p-3.5 rounded-xl flex items-center space-x-2 text-sm font-medium">
                  <AlertCircle className="h-5 w-5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <form id="property-form" onSubmit={handleSaveProperty} className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white p-4 rounded-2xl border border-gray-200 shadow-xs">
                  <div>
                    <label className="block text-xs font-semibold text-graphiteText mb-1.5">Nome da propriedade / fazenda</label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full p-2.5 border border-gray-300 rounded-xl text-sm text-graphiteText"
                      placeholder="Ex: Fazenda Santa Maria"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-graphiteText mb-1.5">Descrição / observações</label>
                    <input
                      type="text"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="w-full p-2.5 border border-gray-300 rounded-xl text-sm text-graphiteText"
                      placeholder="Ex: Setor agrícola principal de plantio e pastagem"
                    />
                  </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs">
                  <label className="block text-xs font-semibold text-graphiteText mb-2">
                    Delimitação do perímetro no mapa (clique para criar os vértices)
                  </label>
                  <PropriedadeDemarcacao
                    key={editingId ? `edit-${editingId}` : 'new-modal'}
                    onPolygonChange={(geojson) => setPolygonGeoJson(geojson)}
                    initialGeoJson={initialMapGeoJson}
                  />
                </div>
              </form>
            </div>

            {/* Modal Footer */}
            <div className="bg-white px-6 py-4 border-t border-gray-200 flex justify-end space-x-3">
              <button
                type="button"
                onClick={handleCloseModal}
                className="bg-gray-100 hover:bg-gray-200 text-graphiteText font-bold px-5 py-2.5 rounded-xl text-xs transition"
              >
                Cancelar
              </button>
              <button
                type="submit"
                form="property-form"
                disabled={loading}
                className="bg-natureGreen hover:bg-natureGreen/90 text-white font-bold px-6 py-2.5 rounded-xl text-xs shadow-md transition disabled:opacity-50 flex items-center space-x-1.5"
              >
                <Check className="h-4 w-4" />
                <span>{loading ? 'Salvando...' : editingId ? 'Salvar alterações' : 'Cadastrar propriedade'}</span>
              </button>
            </div>

          </div>
        </div>,
        document.body
      )}

      {/* Lista de Propriedades Existentes */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {properties.map((p) => {
          const nomeProp = p.nome || p.name;
          const descProp = p.descricao || p.description;
          const geojsonProp = p.poligono_geojson || p.polygon_geojson;
          return (
            <div key={p.id} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200 space-y-4 hover:shadow-md transition">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-graphiteText text-lg">{nomeProp}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{descProp || 'Sem descrição'}</p>
                </div>
                {canManageProperties && (
                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => handleOpenEditModal(p)}
                      className="text-iotBlue hover:text-blue-800 p-1.5 rounded-lg hover:bg-blue-50 transition"
                      title="Editar propriedade"
                    >
                      <Edit3 className="h-5 w-5" />
                    </button>
                    <button
                      onClick={() => handleDeleteProperty(p.id)}
                      className="text-criticalRed hover:text-red-800 p-1.5 rounded-lg hover:bg-red-50 transition"
                      title="Remover propriedade"
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </div>
                )}
              </div>

              <div className="bg-offWhite p-3 rounded-xl text-xs text-graphiteText flex items-center justify-between border border-gray-200">
                <div className="flex items-center space-x-2">
                  <MapPin className="h-4 w-4 text-natureGreen shrink-0" />
                  <span className="font-semibold">Vértices: {contarVerticesReais(geojsonProp)} pontos</span>
                </div>
                {canManageProperties && (
                  <button
                    onClick={() => handleOpenEditModal(p)}
                    className="text-[11px] font-bold text-natureGreen hover:underline flex items-center space-x-1"
                  >
                    <span>Editar no mapa</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const PaginaPropriedades = Propriedades;
export const PropertiesPage = Propriedades;

