import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { Lock, Mail, AlertCircle } from 'lucide-react';
import logoImg from '../assets/Logotipo.png';

export const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const params = new URLSearchParams();
      params.append('username', email);
      params.append('password', password);

      const res = await api.post('/autenticacao/login', params, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });
      await login(res.data.token_acesso || res.data.access_token);
      navigate('/dashboard');
    } catch (err: any) {
      if (err.response) {
        setError(err.response.data?.detail || 'Falha ao realizar login. Verifique seu e-mail e senha.');
      } else {
        setError('Não foi possível conectar ao servidor backend. Certifique-se de que a API FastAPI está em execução.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-trustBlue via-[#1e2f47] to-trustBlue flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 border border-gray-100">
        <div className="text-center mb-8">
          <div className="inline-flex bg-white p-2.5 rounded-2xl shadow-sm border border-gray-100 mb-3">
            <img src={logoImg} alt="Logotipo Plataforma IoT SmartFarm" className="h-14 w-14 object-contain" />
          </div>
          <h2 className="text-2xl font-extrabold text-graphiteText">Plataforma IoT SmartFarm</h2>
          <p className="text-sm text-gray-500 mt-1 font-medium">Gestão Rural & Monitoramento IoT</p>
        </div>

        {error && (
          <div className="mb-4 bg-red-50 border border-criticalRed/30 text-criticalRed p-3.5 rounded-xl flex items-center space-x-2 text-sm font-medium">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold text-graphiteText mb-1.5">E-mail</label>
            <div className="relative">
              <Mail className="h-5 w-5 absolute left-3 top-3 text-gray-400" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-natureGreen focus:border-transparent text-sm text-graphiteText"
                placeholder="seu.email@exemplo.com"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-graphiteText mb-1.5">Senha</label>
            <div className="relative">
              <Lock className="h-5 w-5 absolute left-3 top-3 text-gray-400" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-natureGreen focus:border-transparent text-sm text-graphiteText"
                placeholder="••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-natureGreen hover:bg-natureGreen/90 text-white font-bold py-3 rounded-xl shadow-md transition transform active:scale-[0.99] disabled:opacity-50"
          >
            {loading ? 'Entrando...' : 'Entrar no Sistema'}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-gray-600 font-medium">
          Ainda não possui conta?{' '}
          <Link to="/register" className="font-bold text-natureGreen hover:underline">
            Cadastre-se gratuitamente
          </Link>
        </div>
      </div>
    </div>
  );
};

export const LoginPage = Login;
