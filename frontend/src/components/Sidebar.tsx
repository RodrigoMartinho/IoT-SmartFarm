import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Sprout, Map, PawPrint, Truck, CloudSun, Menu, X, Users } from 'lucide-react';
import logoImg from '../assets/Logotipo.png';

export const Sidebar: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (!user) return null;

  const isActive = (path: string) => location.pathname === path;

  const canManageProperties = Boolean(user?.eh_administrador || user?.pode_gerenciar_propriedades);

  const generalNavItems = [
    { label: 'Dashboard', path: '/dashboard', icon: Map },
    ...(canManageProperties ? [{ label: 'Propriedades Rurais', path: '/propriedades', icon: Sprout }] : []),
    ...(user?.eh_administrador ? [{ label: 'Gestão de Usuários', path: '/usuarios', icon: Users }] : []),
  ];

  const iotNavItems = [
    ...(user?.pode_acessar_animais !== false ? [{ label: 'Animais', path: '/animais', icon: PawPrint }] : []),
    ...(user?.pode_acessar_equipamentos !== false ? [{ label: 'Equipamentos', path: '/equipamentos', icon: Truck }] : []),
    ...(user?.pode_acessar_estacoes !== false ? [{ label: 'Estações Ambientais', path: '/estacoes-ambientais', icon: CloudSun }] : []),
  ];

  return (
    <>
      {/* Botão Hambúrguer para Telas Menores (Mobile) */}
      <div className="lg:hidden bg-trustBlue text-white p-4 flex justify-between items-center border-b border-gray-700">
        <div className="flex items-center space-x-2">
          <div className="bg-white p-1 rounded-lg shadow-xs flex items-center justify-center">
            <img src={logoImg} alt="SmartFarm Logo" className="h-6 w-6 object-contain" />
          </div>
          <span className="font-extrabold text-base tracking-wide">Plataforma IoT SmartFarm</span>
        </div>
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="p-2 rounded-lg bg-natureGreen text-white focus:outline-none"
        >
          {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* Overlay Escuro para Mobile */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
        />
      )}

      {/* Sidebar Principal Desktop e Mobile - Ultra Clean */}
      <aside
        className={`fixed lg:static top-0 left-0 bottom-0 z-50 w-64 bg-trustBlue text-white flex flex-col justify-between shadow-xl transition-transform duration-300 border-r border-gray-700/60 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div>
          {/* Logo & Marca Plataforma IoT SmartFarm */}
          <div className="p-6 border-b border-gray-700/60 flex items-center space-x-3">
            <div className="bg-white p-1.5 rounded-2xl shadow-md flex items-center justify-center">
              <img src={logoImg} alt="SmartFarm Logo" className="h-8 w-8 object-contain" />
            </div>
            <div>
              <h1 className="font-extrabold text-sm tracking-wide text-white leading-tight">Plataforma IoT</h1>
              <p className="text-[12px] font-bold text-fieldGreen">SmartFarm</p>
            </div>
          </div>

          {/* Links de Navegação Principal */}
          <div className="p-4 space-y-4">
            <div>
              <p className="px-3 text-xs font-semibold text-gray-400 mb-1.5">
                Visão Geral
              </p>
              <div className="space-y-1">
                {generalNavItems.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.path);
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => setMobileOpen(false)}
                      className={`flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition ${
                        active
                          ? 'bg-natureGreen text-white shadow-md font-bold'
                          : 'hover:bg-white/10 text-gray-200 hover:text-white'
                      }`}
                    >
                      <Icon className={`h-4.5 w-4.5 ${active ? 'text-white' : 'text-fieldGreen'}`} />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="px-3 text-xs font-semibold text-gray-400 mb-1.5">
                Monitoramento
              </p>
              <div className="space-y-1">
                {iotNavItems.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.path);
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => setMobileOpen(false)}
                      className={`flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition ${
                        active
                          ? 'bg-natureGreen text-white shadow-md font-bold'
                          : 'hover:bg-white/10 text-gray-200 hover:text-white'
                      }`}
                    >
                      <Icon className={`h-4.5 w-4.5 ${active ? 'text-white' : 'text-fieldGreen'}`} />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Rodapé Clean */}
        <div className="p-4 border-t border-gray-700/60 text-[10px] text-gray-400 text-center font-medium">
          Plataforma IoT SmartFarm v1.0.0
        </div>
      </aside>
    </>
  );
};
