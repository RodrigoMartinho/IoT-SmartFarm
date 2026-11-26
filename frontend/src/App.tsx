import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SystemStatusProvider } from './context/SystemStatusContext';
import { PropertyProvider } from './context/PropertyContext';
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { Login } from './pages/Login';
import { Registro } from './pages/Registro';
import { Dashboard } from './pages/Dashboard';
import { Propriedades } from './pages/Propriedades';
import { Animais } from './pages/Animais';
import { Equipamentos } from './pages/Equipamentos';
import { EstacoesAmbientais } from './pages/EstacoesAmbientais';
import { Usuarios } from './pages/Usuarios';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="p-8 text-center text-graphiteText font-semibold">Verificando sessão...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

export const AppContent: React.FC = () => {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-offWhite flex flex-col lg:flex-row">
      {user && <Sidebar />}
      <div className="flex-1 flex flex-col min-h-screen overflow-hidden">
        {user && <Topbar />}
        <main className="flex-1 overflow-y-auto bg-offWhite">
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Registro />} />

            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />

            <Route
              path="/propriedades"
              element={
                <ProtectedRoute>
                  {user?.eh_administrador || user?.pode_gerenciar_propriedades ? (
                    <Propriedades />
                  ) : (
                    <Navigate to="/dashboard" replace />
                  )}
                </ProtectedRoute>
              }
            />

            <Route
              path="/usuarios"
              element={
                <ProtectedRoute>
                  {user?.eh_administrador ? (
                    <Usuarios />
                  ) : (
                    <Navigate to="/dashboard" replace />
                  )}
                </ProtectedRoute>
              }
            />

            <Route
              path="/animais"
              element={
                <ProtectedRoute>
                  {user?.pode_acessar_animais !== false ? (
                    <Animais />
                  ) : (
                    <Navigate to="/dashboard" replace />
                  )}
                </ProtectedRoute>
              }
            />

            <Route
              path="/equipamentos"
              element={
                <ProtectedRoute>
                  {user?.pode_acessar_equipamentos !== false ? (
                    <Equipamentos />
                  ) : (
                    <Navigate to="/dashboard" replace />
                  )}
                </ProtectedRoute>
              }
            />

            <Route
              path="/estacoes-ambientais"
              element={
                <ProtectedRoute>
                  {user?.pode_acessar_estacoes !== false ? (
                    <EstacoesAmbientais />
                  ) : (
                    <Navigate to="/dashboard" replace />
                  )}
                </ProtectedRoute>
              }
            />

            {/* Rotas legadas para compatibilidade */}
            <Route path="/users" element={<Navigate to="/usuarios" replace />} />
            <Route path="/animals" element={<Navigate to="/animais" replace />} />
            <Route path="/equipments" element={<Navigate to="/equipamentos" replace />} />
            <Route path="/environments" element={<Navigate to="/estacoes-ambientais" replace />} />
            <Route path="/properties" element={<Navigate to="/propriedades" replace />} />

            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <SystemStatusProvider>
        <PropertyProvider>
          <Router>
            <AppContent />
          </Router>
        </PropertyProvider>
      </SystemStatusProvider>
    </AuthProvider>
  );
}
