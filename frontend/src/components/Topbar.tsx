import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSystemStatus } from '../context/SystemStatusContext';
import { useProperty } from '../context/PropertyContext';
import { useNavigate } from 'react-router-dom';
import { LogOut, Wifi, WifiOff, ChevronDown, UserCheck, Mail, Shield, Sprout } from 'lucide-react';

export const Topbar: React.FC = () => {
  const { user, logout } = useAuth();
  const { isOnline, activeSensorsCount } = useSystemStatus();
  const { properties, selectedPropertyId, setSelectedPropertyId, loadingProperties } = useProperty();
  const navigate = useNavigate();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fechar dropdown ao clicar fora do componente
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!user) return null;

  const handleLogout = () => {
    setDropdownOpen(false);
    logout();
    navigate('/login');
  };

  const userInitial = user.name ? user.name.charAt(0).toUpperCase() : 'U';

  return (
    <header className="bg-trustBlue text-white border-b border-gray-700/60 px-3 sm:px-6 py-2.5 sm:py-3.5 flex items-center justify-between shadow-sm sticky top-0 z-30 gap-2">
      {/* Lado esquerdo: Indicador compacto e responsivo de conectividade IoT */}
      <div className="flex items-center shrink-0">
        {isOnline ? (
          <div className="bg-natureGreen/20 text-fieldGreen border border-natureGreen/40 px-2 sm:px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1.5 sm:space-x-2 shadow-xs">
            <Wifi className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-fieldGreen shrink-0" />
            <span className="hidden lg:inline">Rede IoT online ({activeSensorsCount} sensores ativos)</span>
            <span className="hidden sm:inline lg:hidden">Rede IoT ({activeSensorsCount})</span>
            <span className="sm:hidden text-[11px]">Online</span>
            <span className="h-2 w-2 rounded-full bg-fieldGreen animate-ping shrink-0"></span>
          </div>
        ) : (
          <div className="bg-criticalRed/20 text-red-300 border border-criticalRed/50 px-2 sm:px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1.5 sm:space-x-2 shadow-xs animate-pulse">
            <WifiOff className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-red-400 shrink-0" />
            <span className="hidden sm:inline">Broker MQTT / Sistema offline</span>
            <span className="sm:hidden text-[11px]">Offline</span>
          </div>
        )}
      </div>

      {/* Lado direito: Seletor global de propriedade + Perfil do usuário */}
      <div className="flex items-center space-x-2 sm:space-x-4 min-w-0 justify-end">
        {/* Seletor global de propriedade responsivo */}
        <div className="flex items-center space-x-1.5 sm:space-x-2 bg-white/10 hover:bg-white/15 px-2 sm:px-3 py-1 sm:py-1.5 rounded-2xl border border-white/20 transition shadow-xs min-w-0">
          <Sprout className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-fieldGreen shrink-0" />
          <label htmlFor="topbar-property-select" className="text-xs text-gray-200 font-medium hidden md:inline shrink-0">
            Propriedade:
          </label>
          {loadingProperties ? (
            <span className="text-[11px] sm:text-xs text-gray-300 italic">Carregando...</span>
          ) : properties.length > 0 ? (
            <select
              id="topbar-property-select"
              data-testid="topbar-property-select"
              aria-label="Selecionar propriedade ativa"
              value={selectedPropertyId || ''}
              onChange={(e) => setSelectedPropertyId(Number(e.target.value))}
              className="bg-[#1B365D] text-white text-[11px] sm:text-xs font-bold rounded-lg px-1.5 sm:px-2 py-1 border border-white/20 focus:outline-none cursor-pointer max-w-[120px] sm:max-w-[190px] md:max-w-[260px] truncate"
            >
              {properties.map((p) => (
                <option key={p.id} value={p.id} className="bg-[#1B365D] text-white font-medium py-1">
                  {p.nome || p.name}
                </option>
              ))}
            </select>
          ) : user.eh_administrador || user.pode_gerenciar_propriedades ? (
            <button
              onClick={() => navigate('/propriedades')}
              className="text-[11px] sm:text-xs text-yellow-300 hover:text-yellow-200 font-semibold underline underline-offset-2 whitespace-nowrap"
              title="Cadastrar uma propriedade rural"
            >
              Cadastrar propriedade
            </button>
          ) : (
            <span className="text-[11px] sm:text-xs text-gray-300 italic whitespace-nowrap">
              Nenhuma fazenda atribuída
            </span>
          )}
        </div>

        {/* Menu do perfil */}
        <div className="relative shrink-0" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center space-x-1.5 sm:space-x-3 bg-white/10 hover:bg-white/15 px-2 sm:px-3.5 py-1 sm:py-1.5 rounded-2xl border border-white/15 transition focus:outline-none shadow-xs text-white"
          >
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-natureGreen text-white font-bold flex items-center justify-center text-xs shadow-xs border border-white/20 shrink-0">
              {userInitial}
            </div>
            <div className="text-left hidden md:block">
              <h4 className="text-xs font-semibold text-white leading-tight flex items-center space-x-1.5">
                <span>{user.name}</span>
                <UserCheck className="h-3.5 w-3.5 text-fieldGreen inline" />
              </h4>
              <span className="text-[10px] font-medium text-gray-300">Gestor IoT</span>
            </div>
            <ChevronDown className={`h-3.5 w-3.5 sm:h-4 sm:w-4 text-gray-300 transition-transform shrink-0 ${dropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Menu popup dropdown do perfil */}
          {dropdownOpen && (
            <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-gray-200 p-3 z-50 animate-in fade-in slide-in-from-top-2 duration-150 text-graphiteText">
              <div className="p-3 bg-offWhite rounded-xl mb-2 border border-gray-100">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-xl bg-trustBlue text-white font-bold flex items-center justify-center text-base shadow-sm">
                    {userInitial}
                  </div>
                  <div className="overflow-hidden">
                    <p className="text-sm font-semibold text-graphiteText truncate">{user.name}</p>
                    <p className="text-xs text-gray-500 truncate flex items-center space-x-1 mt-0.5">
                      <Mail className="h-3 w-3 shrink-0" />
                      <span>{user.email}</span>
                    </p>
                  </div>
                </div>

                <div className="mt-2.5 pt-2 border-t border-gray-200/60 flex items-center justify-between text-[11px] text-gray-500 font-medium">
                  <span className="flex items-center space-x-1">
                    <Shield className="h-3.5 w-3.5 text-natureGreen" />
                    <span>Nível: Admin</span>
                  </span>
                  <span className="text-natureGreen bg-green-100 px-2 py-0.5 rounded-full font-semibold">Ativo</span>
                </div>
              </div>

              <button
                onClick={handleLogout}
                className="w-full flex items-center space-x-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-criticalRed hover:bg-red-50 transition"
              >
                <LogOut className="h-4 w-4 shrink-0" />
                <span>Sair do sistema</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
