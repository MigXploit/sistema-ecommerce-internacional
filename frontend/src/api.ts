export interface UsuarioSesion {
  id: number;
  identificador: string;
  nombre: string;
  tipoCuenta: 'CLIENTE' | 'INTERNO';
  rol: string;
  pais?: string;
  idioma?: string;
  monedaPreferida?: string;
  datosFiscales?: string;
}

const API_BASE = import.meta.env.VITE_API_URL || '';

export async function apiFetch<T = any>(
  path: string,
  options: RequestInit = {},
  token?: string | null
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {})
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers
  });

  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { mensaje: text };
  }

  if (!res.ok) {
    const err: any = new Error(data?.mensaje || `Error HTTP ${res.status}`);
    err.status = res.status;
    err.payload = data;
    throw err;
  }
  return data as T;
}
