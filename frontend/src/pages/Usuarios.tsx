import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { 
  Users, 
  UserPlus, 
  Shield, 
  ShieldCheck, 
  Edit3, 
  Trash2, 
  Search, 
  Check, 
  X, 
  Building2, 
  Sprout,
  PawPrint,
  Truck, 
  CloudSun, 
  BellRing, 
  Lock, 
  Mail, 
  User,
  AlertCircle
} from 'lucide-react';

export const Usuarios: React.FC = () => {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [properties, setProperties] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [error, setError] = useState('');

  // Form State
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [ehAdmin, setEhAdmin] = useState(false);
  const [podePropriedades, setPodePropriedades] = useState(false);
  const [podeAnimais, setPodeAnimais] = useState(true);
  const [podeEquipamentos, setPodeEquipamentos] = useState(true);
  const [podeEstacoes, setPodeEstacoes] = useState(true);
  const [podeAlarmes, setPodeAlarmes] = useState(true);
  const [selectedPropIds, setSelectedPropIds] = useState<number[]>([]);

  useEffect(() => {
    fetchUsers();
    fetchProperties();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await api.get('/usuarios');
      setUsers(res.data);
    } catch (err: any) {
      console.error('Erro ao buscar usuários:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchProperties = async () => {
    try {
      const res = await api.get('/propriedades');
      setProperties(res.data);
    } catch (err: any) {
      console.error('Erro ao buscar propriedades:', err);
    }
  };

  const handleOpenCreateModal = () => {
    setEditingId(null);
    setNome('');
    setEmail('');
    setSenha('');
    setEhAdmin(false);
    setPodePropriedades(false);
    setPodeAnimais(true);
    setPodeEquipamentos(true);
    setPodeEstacoes(true);
    setPodeAlarmes(true);
    // Seleciona todas as propriedades por padrão
    setSelectedPropIds(properties.map((p) => p.id));
    setError('');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (u: any) => {
    setEditingId(u.id);
    setNome(u.nome || '');
    setEmail(u.email || '');
    setSenha(''); // senha vazia significa manter a atual
    setEhAdmin(u.eh_administrador || false);
    setPodePropriedades(Boolean(u.eh_administrador || u.pode_gerenciar_propriedades));
    setPodeAnimais(u.pode_acessar_animais !== false);
    setPodeEquipamentos(u.pode_acessar_equipamentos !== false);
    setPodeEstacoes(u.pode_acessar_estacoes !== false);
    setPodeAlarmes(u.pode_gerenciar_alarmes !== false);
    setSelectedPropIds(u.propriedades_ids || []);
    setError('');
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
    setError('');
  };

  const togglePropertySelection = (propId: number) => {
    if (selectedPropIds.includes(propId)) {
      setSelectedPropIds(selectedPropIds.filter((id) => id !== propId));
    } else {
      setSelectedPropIds([...selectedPropIds, propId]);
    }
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setModalLoading(true);

    if (!editingId && !senha) {
      setError('A senha é obrigatória para cadastrar um novo usuário.');
      setModalLoading(false);
      return;
    }

    if (!ehAdmin && selectedPropIds.length === 0) {
      setError('Selecione pelo menos uma propriedade rural para este colaborador.');
      setModalLoading(false);
      return;
    }

    try {
      const payload: any = {
        nome,
        email,
        eh_administrador: ehAdmin,
        pode_gerenciar_propriedades: ehAdmin ? true : podePropriedades,
        pode_acessar_animais: podeAnimais,
        pode_acessar_equipamentos: podeEquipamentos,
        pode_acessar_estacoes: podeEstacoes,
        pode_gerenciar_alarmes: podeAlarmes,
        propriedades_ids: selectedPropIds,
      };

      if (senha) {
        payload.senha = senha;
      }

      if (editingId) {
        await api.put(`/usuarios/${editingId}`, payload);
      } else {
        await api.post('/usuarios', payload);
      }

      handleCloseModal();
      fetchUsers();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao salvar dados do usuário.');
    } finally {
      setModalLoading(false);
    }
  };

  const handleDeleteUser = async (userId: number, userName: string) => {
    if (userId === currentUser?.id) {
      alert('Você não pode excluir sua própria conta.');
      return;
    }

    if (!window.confirm(`Tem certeza que deseja revogar o acesso e remover o usuário "${userName}"?`)) {
      return;
    }

    try {
      await api.delete(`/usuarios/${userId}`);
      fetchUsers();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Erro ao remover usuário.');
    }
  };

  const filteredUsers = users.filter((u) => {
    const q = search.toLowerCase();
    return (
      (u.nome && u.nome.toLowerCase().includes(q)) ||
      (u.email && u.email.toLowerCase().includes(q))
    );
  });

  const totalAdmins = users.filter((u) => u.eh_administrador).length;
  const totalOperadores = users.filter((u) => !u.eh_administrador).length;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Cabeçalho da Página */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <h2 className="text-2xl font-black text-graphiteText tracking-tight flex items-center space-x-2">
            <Users className="h-7 w-7 text-natureGreen" />
            <span>Gestão de Usuários e Acessos</span>
          </h2>
          <p className="text-xs text-gray-500 font-medium mt-1">
            Controle de acesso baseado em papéis (RBAC): defina quais fazendas e módulos cada colaborador pode visualizar
          </p>
        </div>

        <button
          onClick={handleOpenCreateModal}
          className="bg-natureGreen hover:bg-natureGreen/90 text-white font-bold px-5 py-2.5 rounded-xl text-xs flex items-center justify-center space-x-2 shadow-sm transition transform active:scale-95 self-start md:self-auto"
        >
          <UserPlus className="h-4 w-4" />
          <span>Cadastrar Novo Colaborador</span>
        </button>
      </div>

      {/* Cards de Métricas Rápidas */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-gray-500">Total de Usuários</p>
            <h3 className="text-2xl font-extrabold text-graphiteText mt-0.5">{users.length}</h3>
          </div>
          <div className="p-3 bg-blue-50 text-iotBlue rounded-xl">
            <Users className="h-6 w-6" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-gray-500">Administradores</p>
            <h3 className="text-2xl font-extrabold text-graphiteText mt-0.5">{totalAdmins}</h3>
          </div>
          <div className="p-3 bg-emerald-50 text-natureGreen rounded-xl">
            <ShieldCheck className="h-6 w-6" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-gray-500">Colaboradores de Campo</p>
            <h3 className="text-2xl font-extrabold text-graphiteText mt-0.5">{totalOperadores}</h3>
          </div>
          <div className="p-3 bg-amber-50 text-amber-700 rounded-xl">
            <Shield className="h-6 w-6" />
          </div>
        </div>
      </div>

      {/* Busca */}
      <div className="relative max-w-md">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          placeholder="Buscar colaborador por nome ou e-mail..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-graphiteText shadow-2xs focus:outline-none focus:ring-2 focus:ring-natureGreen/40"
        />
      </div>

      {/* Grid de Cards dos Usuários */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {loading && users.length === 0 ? (
          <div className="col-span-full bg-white p-12 text-center rounded-2xl border border-gray-200 text-gray-400 font-medium">
            Carregando usuários...
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="col-span-full bg-white p-12 text-center rounded-2xl border border-gray-200 text-gray-400 font-medium">
            Nenhum usuário encontrado para a busca.
          </div>
        ) : (
          filteredUsers.map((u) => {
            const isSelf = u.id === currentUser?.id;
            const propsAssociadas = properties.filter((p) =>
              (u.propriedades_ids || []).includes(p.id)
            );

            return (
              <div
                key={u.id}
                className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs flex flex-col justify-between hover:shadow-md transition"
              >
                <div>
                  {/* Topo do Card */}
                  <div className="flex justify-between items-start">
                    <div className="flex items-center space-x-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shadow-2xs ${
                        u.eh_administrador ? 'bg-amber-100 text-amber-900' : 'bg-natureGreen/15 text-natureGreen'
                      }`}>
                        {u.eh_administrador ? '👑' : u.nome.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h4 className="font-extrabold text-graphiteText text-sm flex items-center space-x-1.5">
                          <span>{u.nome}</span>
                          {isSelf && (
                            <span className="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.2 rounded-full font-bold">
                              Você
                            </span>
                          )}
                        </h4>
                        <p className="text-xs text-gray-500 font-mono mt-0.5">{u.email}</p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() => handleOpenEditModal(u)}
                        className="text-iotBlue hover:text-blue-800 p-2 rounded-lg hover:bg-blue-50 transition"
                        title="Editar Permissões do Usuário"
                      >
                        <Edit3 className="h-4 w-4" />
                      </button>
                      {!isSelf && (
                        <button
                          onClick={() => handleDeleteUser(u.id, u.nome)}
                          className="text-criticalRed hover:text-red-800 p-2 rounded-lg hover:bg-red-50 transition"
                          title="Remover Acesso do Usuário"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Cargo / Perfil */}
                  <div className="mt-3.5">
                    <span
                      className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-bold ${
                        u.eh_administrador
                          ? 'bg-amber-50 text-amber-900 border border-amber-200/80'
                          : 'bg-emerald-50 text-emerald-900 border border-emerald-200/80'
                      }`}
                    >
                      {u.eh_administrador ? '👑 Administrador (Acesso Total)' : '👷 Colaborador de Campo'}
                    </span>
                  </div>

                  {/* Fazendas Autorizadas */}
                  <div className="mt-4 pt-3 border-t border-gray-100">
                    <p className="text-[11px] font-bold text-gray-500 flex items-center space-x-1 mb-1.5">
                      <Building2 className="h-3.5 w-3.5 text-natureGreen" />
                      <span>Propriedades Permitidas:</span>
                    </p>
                    {u.eh_administrador && !u.administrador_id ? (
                      <span className="text-[11px] font-medium text-gray-600 italic">
                        Acesso irrestrito a todas as fazendas da conta
                      </span>
                    ) : propsAssociadas.length === 0 ? (
                      <span className="text-[11px] text-gray-400 italic">Nenhuma fazenda vinculada</span>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {propsAssociadas.map((p) => (
                          <span
                            key={p.id}
                            className="bg-gray-100 text-graphiteText text-[11px] font-semibold px-2 py-0.5 rounded-md border border-gray-200"
                          >
                            📍 {p.nome}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Módulos Liberados */}
                  <div className="mt-3.5 pt-3 border-t border-gray-100">
                    <p className="text-[11px] font-bold text-gray-500 mb-1.5">Módulos Liberados:</p>
                    <div className="flex flex-wrap gap-1.5">
                      <span
                        className={`text-[11px] px-2 py-0.5 rounded-md font-bold flex items-center space-x-1 ${
                          u.eh_administrador || u.pode_gerenciar_propriedades
                            ? 'bg-emerald-100/80 text-emerald-900'
                            : 'bg-gray-100 text-gray-400 line-through'
                        }`}
                      >
                        <Sprout className="h-3 w-3" />
                        <span>Propriedades Rurais</span>
                      </span>

                      <span
                        className={`text-[11px] px-2 py-0.5 rounded-md font-bold flex items-center space-x-1 ${
                          u.pode_acessar_animais !== false
                            ? 'bg-natureGreen/10 text-natureGreen'
                            : 'bg-gray-100 text-gray-400 line-through'
                        }`}
                      >
                        <PawPrint className="h-3 w-3" />
                        <span>Animais</span>
                      </span>

                      <span
                        className={`text-[11px] px-2 py-0.5 rounded-md font-bold flex items-center space-x-1 ${
                          u.pode_acessar_equipamentos !== false
                            ? 'bg-iotBlue/10 text-iotBlue'
                            : 'bg-gray-100 text-gray-400 line-through'
                        }`}
                      >
                        <Truck className="h-3 w-3" />
                        <span>Equipamentos</span>
                      </span>

                      <span
                        className={`text-[11px] px-2 py-0.5 rounded-md font-bold flex items-center space-x-1 ${
                          u.pode_acessar_estacoes !== false
                            ? 'bg-alertAmber/15 text-amber-800'
                            : 'bg-gray-100 text-gray-400 line-through'
                        }`}
                      >
                        <CloudSun className="h-3 w-3" />
                        <span>Estações Ambientais</span>
                      </span>

                      <span
                        className={`text-[11px] px-2 py-0.5 rounded-md font-bold flex items-center space-x-1 ${
                          u.pode_gerenciar_alarmes !== false
                            ? 'bg-red-50 text-criticalRed'
                            : 'bg-gray-100 text-gray-400 line-through'
                        }`}
                      >
                        <BellRing className="h-3 w-3" />
                        <span>Alarmes</span>
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* MODAL DE CADASTRO / EDIÇÃO DE USUÁRIO */}
      {isModalOpen &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-graphiteText/80 backdrop-blur-xs p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl shadow-2xl border border-gray-200 w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
              
              {/* Header */}
              <div className="bg-trustBlue text-white px-6 py-4 flex items-center justify-between border-b border-gray-700">
                <div className="flex items-center space-x-3">
                  <div className="bg-white p-2 rounded-xl text-natureGreen shadow-xs">
                    <UserPlus className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-extrabold text-white">
                      {editingId ? 'Editar Permissões do Colaborador' : 'Cadastrar Novo Colaborador'}
                    </h3>
                    <p className="text-xs text-gray-300 font-medium">
                      Escolha quais fazendas e áreas do sistema este colaborador pode acessar
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="text-gray-300 hover:text-white p-2 rounded-xl hover:bg-white/10 transition"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Formulário com Scroll */}
              <form onSubmit={handleSaveUser} className="flex-1 overflow-y-auto p-6 space-y-6">
                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center space-x-2 text-criticalRed text-xs font-semibold">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                {/* Seção 1: Dados Básicos */}
                <div className="space-y-4">
                  <h4 className="text-xs font-bold text-graphiteText flex items-center space-x-1.5 border-b border-gray-100 pb-2">
                    <User className="h-4 w-4 text-natureGreen" />
                    <span>1. Dados de acesso</span>
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-graphiteText mb-1">
                        Nome completo
                      </label>
                      <input
                        type="text"
                        required
                        value={nome}
                        onChange={(e) => setNome(e.target.value)}
                        placeholder="Ex: Carlos Oliveira"
                        className="w-full px-3.5 py-2.5 bg-offWhite border border-gray-200 rounded-xl text-xs font-semibold text-graphiteText focus:outline-none focus:ring-2 focus:ring-natureGreen/40"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-graphiteText mb-1">
                        E-mail de acesso
                      </label>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="carlos@smartfarm.com"
                        className="w-full px-3.5 py-2.5 bg-offWhite border border-gray-200 rounded-xl text-xs font-semibold text-graphiteText focus:outline-none focus:ring-2 focus:ring-natureGreen/40"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-graphiteText mb-1">
                      {editingId ? 'Nova senha (deixe em branco para manter a atual)' : 'Senha de acesso'}
                    </label>
                    <input
                      type="password"
                      required={!editingId}
                      value={senha}
                      onChange={(e) => setSenha(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                      className="w-full px-3.5 py-2.5 bg-offWhite border border-gray-200 rounded-xl text-xs font-semibold text-graphiteText focus:outline-none focus:ring-2 focus:ring-natureGreen/40"
                    />
                  </div>
                </div>

                {/* Seção 2: Propriedades Permitidas */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-graphiteText flex items-center space-x-1.5 border-b border-gray-100 pb-2">
                    <Building2 className="h-4 w-4 text-natureGreen" />
                    <span>2. Propriedades autorizadas</span>
                  </h4>

                  <p className="text-xs text-gray-500">
                    O colaborador terá acesso exclusivo às fazendas marcadas abaixo:
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {properties.map((prop) => {
                      const isChecked = selectedPropIds.includes(prop.id);
                      return (
                        <label
                          key={prop.id}
                          className={`flex items-center space-x-3 p-3 rounded-xl border cursor-pointer transition ${
                            isChecked
                              ? 'bg-emerald-50/60 border-natureGreen/60 text-graphiteText'
                              : 'bg-offWhite border-gray-200 text-gray-500 hover:bg-gray-50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => togglePropertySelection(prop.id)}
                            className="h-4 w-4 rounded text-natureGreen focus:ring-natureGreen/40 border-gray-300"
                          />
                          <div className="text-xs">
                            <span className="font-bold block text-graphiteText">{prop.nome}</span>
                            {prop.descricao && (
                              <span className="text-[11px] text-gray-500 line-clamp-1">
                                {prop.descricao}
                              </span>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Seção 3: Permissões de Módulos */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-graphiteText flex items-center space-x-1.5 border-b border-gray-100 pb-2">
                    <Lock className="h-4 w-4 text-natureGreen" />
                    <span>3. Módulos e permissões</span>
                  </h4>

                  <div className="space-y-2.5">
                    {/* Perfil de Administrador */}
                    <label className="flex items-center justify-between p-3 rounded-xl bg-amber-50 border border-amber-200 cursor-pointer">
                      <div>
                        <span className="text-xs font-extrabold text-amber-950 flex items-center space-x-1.5">
                          <span>👑 É Administrador da Conta?</span>
                        </span>
                        <p className="text-[11px] text-amber-800 mt-0.5">
                          Concede acesso total, incluindo cadastro de propriedades e gestão de outros colaboradores.
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={ehAdmin}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setEhAdmin(checked);
                          if (checked) {
                            setPodePropriedades(true);
                          }
                        }}
                        className="h-4 w-4 rounded text-natureGreen focus:ring-natureGreen/40 border-gray-300"
                      />
                    </label>

                    {/* Propriedades Rurais */}
                    <label className="flex items-center justify-between p-3 rounded-xl bg-offWhite border border-gray-200 cursor-pointer">
                      <div>
                        <span className="text-xs font-bold text-graphiteText flex items-center space-x-1.5">
                          <Sprout className="h-3.5 w-3.5 text-emerald-700" />
                          <span>Propriedades Rurais</span>
                        </span>
                        <p className="text-[11px] text-gray-500 mt-0.5">
                          Permite cadastrar novas fazendas, editar perímetros geográficos e remover propriedades.
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={ehAdmin || podePropriedades}
                        disabled={ehAdmin}
                        onChange={(e) => setPodePropriedades(e.target.checked)}
                        className="h-4 w-4 rounded text-natureGreen focus:ring-natureGreen/40 border-gray-300 disabled:opacity-50"
                      />
                    </label>

                    {/* Animais */}
                    <label className="flex items-center justify-between p-3 rounded-xl bg-offWhite border border-gray-200 cursor-pointer">
                      <div>
                        <span className="text-xs font-bold text-graphiteText flex items-center space-x-1.5">
                          <PawPrint className="h-3.5 w-3.5 text-natureGreen" />
                          <span>Animais</span>
                        </span>
                        <p className="text-[11px] text-gray-500 mt-0.5">
                          Visualização, cadastro e telemetria de coleiras inteligentes.
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={podeAnimais}
                        onChange={(e) => setPodeAnimais(e.target.checked)}
                        className="h-4 w-4 rounded text-natureGreen focus:ring-natureGreen/40 border-gray-300"
                      />
                    </label>

                    {/* Equipamentos */}
                    <label className="flex items-center justify-between p-3 rounded-xl bg-offWhite border border-gray-200 cursor-pointer">
                      <div>
                        <span className="text-xs font-bold text-graphiteText flex items-center space-x-1.5">
                          <Truck className="h-3.5 w-3.5 text-iotBlue" />
                          <span>Equipamentos</span>
                        </span>
                        <p className="text-[11px] text-gray-500 mt-0.5">
                          Rastreamento de tratores, velocidade, telemetria de motor e implementos agrícolas.
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={podeEquipamentos}
                        onChange={(e) => setPodeEquipamentos(e.target.checked)}
                        className="h-4 w-4 rounded text-natureGreen focus:ring-natureGreen/40 border-gray-300"
                      />
                    </label>

                    {/* Estações Ambientais */}
                    <label className="flex items-center justify-between p-3 rounded-xl bg-offWhite border border-gray-200 cursor-pointer">
                      <div>
                        <span className="text-xs font-bold text-graphiteText flex items-center space-x-1.5">
                          <CloudSun className="h-3.5 w-3.5 text-alertAmber" />
                          <span>Estações Ambientais</span>
                        </span>
                        <p className="text-[11px] text-gray-500 mt-0.5">
                          Monitoramento agroclimático, umidade de solo, temperatura e pressão.
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={podeEstacoes}
                        onChange={(e) => setPodeEstacoes(e.target.checked)}
                        className="h-4 w-4 rounded text-natureGreen focus:ring-natureGreen/40 border-gray-300"
                      />
                    </label>

                    {/* Alarmes */}
                    <label className="flex items-center justify-between p-3 rounded-xl bg-offWhite border border-gray-200 cursor-pointer">
                      <div>
                        <span className="text-xs font-bold text-graphiteText flex items-center space-x-1.5">
                          <BellRing className="h-3.5 w-3.5 text-criticalRed" />
                          <span>Alarmes</span>
                        </span>
                        <p className="text-[11px] text-gray-500 mt-0.5">
                          Permite confirmar e encerrar alertas de saída da cerca e saúde do rebanho.
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={podeAlarmes}
                        onChange={(e) => setPodeAlarmes(e.target.checked)}
                        className="h-4 w-4 rounded text-natureGreen focus:ring-natureGreen/40 border-gray-300"
                      />
                    </label>
                  </div>
                </div>

                {/* Rodapé do Modal com Botões de Ação */}
                <div className="pt-4 border-t border-gray-200 flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={handleCloseModal}
                    className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-graphiteText font-bold text-xs rounded-xl transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={modalLoading}
                    className="px-6 py-2.5 bg-natureGreen hover:bg-natureGreen/90 text-white font-bold text-xs rounded-xl shadow-md transition disabled:opacity-50 flex items-center space-x-1.5"
                  >
                    <Check className="h-4 w-4" />
                    <span>{modalLoading ? 'Salvando...' : editingId ? 'Salvar Alterações' : 'Cadastrar Colaborador'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

export const PaginaUsuarios = Usuarios;

