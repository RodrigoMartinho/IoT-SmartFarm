import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { Lock, Mail, User, KeyRound, AlertCircle, CheckCircle } from 'lucide-react';
import logoImg from '../assets/Logotipo.png';

export const Registro: React.FC = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await api.post('/autenticacao/registro', {
        nome: name,
        email,
        senha: password,
        codigo_convite: inviteCode,
        honeypot
      });
      setSuccess(true);
      setTimeout(() => {
        navigate('/login');
      }, 1500);
    } catch (err: any) {
      if (err.response) {
        setError(err.response.data?.detail || 'Erro ao realizar cadastro.');
      } else {
        setError('Não foi possível conectar ao servidor backend. Certifique-se de que o backend FastAPI esteja rodando.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-trustBlue via-[#1e2f47] to-trustBlue flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 border border-gray-100">
        <div className="text-center mb-6">
          <div className="inline-flex bg-white p-2.5 rounded-2xl shadow-sm border border-gray-100 mb-2">
            <img src={logoImg} alt="Logotipo Plataforma IoT SmartFarm" className="h-14 w-14 object-contain" />
          </div>
          <h2 className="text-2xl font-extrabold text-graphiteText">Criar Nova Conta</h2>
          <p className="text-sm text-gray-500 font-medium">Plataforma IoT SmartFarm</p>
        </div>

        {error && (
          <div className="mb-4 bg-red-50 border border-criticalRed/30 text-criticalRed p-3.5 rounded-xl flex items-center space-x-2 text-sm font-medium">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="mb-4 bg-green-50 border border-natureGreen/30 text-natureGreen p-3.5 rounded-xl flex items-center space-x-2 text-sm font-medium">
            <CheckCircle className="h-5 w-5 shrink-0" />
            <span>Cadastro realizado com sucesso! Redirecionando...</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-graphiteText mb-1.5">Nome completo</label>
            <div className="relative">
              <User className="h-5 w-5 absolute left-3 top-3 text-gray-400" />
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-natureGreen text-graphiteText"
                placeholder="Seu Nome"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-graphiteText mb-1.5">E-mail</label>
            <div className="relative">
              <Mail className="h-5 w-5 absolute left-3 top-3 text-gray-400" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-natureGreen text-graphiteText"
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
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-natureGreen text-graphiteText"
                placeholder="••••••••"
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="block text-xs font-semibold text-graphiteText">Código de Convite / Autorização</label>
              <span className="text-[11px] text-gray-400 font-normal">Fornecido pelo administrador</span>
            </div>
            <div className="relative">
              <KeyRound className="h-5 w-5 absolute left-3 top-3 text-gray-400" />
              <input
                type="text"
                required
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl text-sm uppercase tracking-wider focus:ring-2 focus:ring-natureGreen text-graphiteText font-mono"
                placeholder="Insira a chave de autorização"
              />
            </div>
          </div>

          {/* Campo Honeypot invisível: robôs preenchem automaticamente e são bloqueados */}
          <div style={{ display: 'none' }} aria-hidden="true">
            <input
              type="text"
              name="b_extra_company_field"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
              tabIndex={-1}
              autoComplete="off"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-natureGreen hover:bg-natureGreen/90 text-white font-bold py-3 rounded-xl shadow-md transition disabled:opacity-50"
          >
            {loading ? 'Cadastrando...' : 'Cadastrar'}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-gray-600 font-medium">
          Já possui conta?{' '}
          <Link to="/login" className="font-bold text-natureGreen hover:underline">
            Faça login aqui
          </Link>
        </div>
      </div>
    </div>
  );
};

export const RegisterPage = Registro;
