import { describe, it, expect, beforeEach } from 'vitest';
import { api } from '../services/api';
import { InternalAxiosRequestConfig } from 'axios';

describe('Cliente HTTP Axios e interceptor de autenticação (api.ts)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('injeta o token Bearer no cabeçalho Authorization quando o token existe no localStorage', async () => {
    localStorage.setItem('token', 'token-jwt-teste-12345');

    const config = {
      headers: {},
    } as unknown as InternalAxiosRequestConfig;

    // Encontra o interceptor registrado no axios
    // @ts-expect-error acessando handlers do interceptor para teste unitário
    const requestInterceptor = api.interceptors.request.handlers[0].fulfilled;
    const resultado = await requestInterceptor(config);

    expect(resultado.headers.Authorization).toBe('Bearer token-jwt-teste-12345');
  });

  it('não adiciona o cabeçalho Authorization se o localStorage estiver vazio', async () => {
    const config = {
      headers: {},
    } as unknown as InternalAxiosRequestConfig;

    // @ts-expect-error acessando handlers do interceptor para teste unitário
    const requestInterceptor = api.interceptors.request.handlers[0].fulfilled;
    const resultado = await requestInterceptor(config);

    expect(resultado.headers.Authorization).toBeUndefined();
  });
});

