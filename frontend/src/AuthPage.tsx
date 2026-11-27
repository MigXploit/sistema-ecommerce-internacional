import React, { useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Coins,
  Globe,
  Lock,
  Scale,
  ShieldCheck,
  ShoppingBag,
  Zap
} from 'lucide-react';
import { IdiomaCode, TEXTOS } from './i18n';
import { StatusBadge } from './components/StatusBadge';

export const ACCESOS_RAPIDOS_PROTOTIPO = [
  { label: 'BR • Carla Santos (D13)', id: 'carla.santos@email.br', pass: 'Cliente2026!', tipo: 'CLIENTE' },
  { label: 'ES • Sofía García (Postventa)', id: 'sofia.garcia@importaciones.es', pass: 'Cliente2026!', tipo: 'CLIENTE' },
  { label: 'US • John Miller (Mayorista)', id: 'john.miller@globalcorp.us', pass: 'Cliente2026!', tipo: 'CLIENTE' },
  { label: 'BO • Diego Rojas (BOB)', id: 'diego.rojas@comercio.bo', pass: 'Cliente2026!', tipo: 'CLIENTE' },
  { label: 'Oficial de Seguridad (CU14)', id: 'seguridad', pass: 'Seguridad2026!', tipo: 'INTERNO', sec: true },
  { label: 'Admin Parámetros (CU13 / RN20)', id: 'admin.parametros', pass: 'AdminParam2026!', tipo: 'INTERNO' },
  { label: 'Gestor Catálogo (CU01)', id: 'catalogo', pass: 'Catalogo2026!', tipo: 'INTERNO' },
  { label: 'Gestor Pedidos (CU06/11)', id: 'pedidos', pass: 'Pedidos2026!', tipo: 'INTERNO' },
  { label: 'Logística / Aduana (CU07/08)', id: 'logistica', pass: 'Logistica2026!', tipo: 'INTERNO' },
  { label: 'Facturación (CU09)', id: 'facturacion', pass: 'Factura2026!', tipo: 'INTERNO' },
  { label: 'Gerente Reportes (CU12)', id: 'gerencia', pass: 'Gerencia2026!', tipo: 'INTERNO' }
];

interface AuthPageProps {
  idioma: IdiomaCode;
  parametros: any;
  modoInicial?: 'LOGIN' | 'REGISTRO';
  tipoInicial?: 'CLIENTE' | 'INTERNO';
  onLogin: (identificador: string, clave: string, tipoCuenta: string) => Promise<void>;
  onRegistro: (regForm: any) => Promise<void>;
  onVolverTienda: () => void;
}

export const AuthPage: React.FC<AuthPageProps> = ({
  idioma,
  parametros,
  modoInicial = 'LOGIN',
  tipoInicial = 'CLIENTE',
  onLogin,
  onRegistro,
  onVolverTienda
}) => {
  const t = TEXTOS[idioma];
  const [tipoCuenta, setTipoCuenta] = useState<'CLIENTE' | 'INTERNO'>(tipoInicial);
  const [modo, setModo] = useState<'LOGIN' | 'REGISTRO'>(tipoInicial === 'INTERNO' ? 'LOGIN' : modoInicial);

  const [identificador, setIdentificador] = useState('');
  const [clave, setClave] = useState('');
  const [cargando, setCargando] = useState(false);

  const [regForm, setRegForm] = useState({
    nombres: '',
    apellidos: '',
    correo: '',
    clave: '',
    pais: 'BR',
    idioma: idioma,
    monedaPreferida: 'BRL',
    datosFiscales: '',
    ciudad: '',
    lineaDireccion: '',
    codigoPostal: ''
  });

  const handleSubmitLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setCargando(true);
    try {
      await onLogin(identificador, clave, tipoCuenta);
    } finally {
      setCargando(false);
    }
  };

  const handleSubmitRegistro = async (e: React.FormEvent) => {
    e.preventDefault();
    setCargando(true);
    try {
      await onRegistro(regForm);
    } finally {
      setCargando(false);
    }
  };

  return (
    <div style={{ maxWidth: '1120px', margin: '8px auto 24px' }}>
      <div style={{ marginBottom: '12px' }}>
        <button className="btn btn-sm btn-outline" onClick={onVolverTienda}>
          <ArrowLeft size={15} /> {t.tienda}
        </button>
      </div>

      <section className="auth-split-shell">
        {/* COLUMNA IZQUIERDA (50%): MARCA, CONFIANZA Y VISTA PREVIA */}
        <div className="auth-brand-pane">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '18px' }}>
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '12px',
                  background: 'rgba(255,255,255,0.16)',
                  border: '1px solid rgba(255,255,255,0.28)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <Globe size={22} />
              </div>
              <div>
                <div style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em' }}>{t.marca}</div>
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.78)' }}>INF-241 • Grupo 12 • B2C / B2B Global</div>
              </div>
            </div>

            <h1 style={{ margin: '0 0 12px', fontSize: '28px', fontWeight: 800, lineHeight: 1.2 }}>
              {t.authHeroTitulo}
            </h1>
            <p style={{ margin: 0, fontSize: '14px', color: 'rgba(255,255,255,0.84)', lineHeight: 1.55 }}>
              {t.authHeroDesc}
            </p>

            <div className="auth-trust-badges">
              <span className="auth-trust-pill"><Lock size={13} /> PCI DSS Tokenizado (RN11)</span>
              <span className="auth-trust-pill"><Scale size={13} /> Cálculo Aduanero HS (RN07)</span>
              <span className="auth-trust-pill"><Coins size={13} /> Multimoneda 24h (RN02)</span>
              <span className="auth-trust-pill"><ShieldCheck size={13} /> Bcrypt Cost 12 + JWT RS256</span>
            </div>
          </div>

          {/* Vista Previa Estilizada de Operación Internacional */}
          <div className="auth-preview-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span className="mono" style={{ fontSize: '11px', color: '#93C5FD', fontWeight: 700 }}>
                OPERACIÓN VERIFICADA • D13
              </span>
              <StatusBadge estado="ENTREGADO" texto="ADUANA LIBERADA" />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '14px' }}>Chaqueta de Alpaca Premium</div>
                <div className="mono" style={{ fontSize: '11px', color: '#CBD5E1' }}>
                  Guía CG-2026-000731 • São Paulo (BR)
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="mono" style={{ fontSize: '16px', fontWeight: 800, color: '#34D399' }}>
                  R$ 1,590.00
                </div>
                <div className="mono" style={{ fontSize: '11px', color: '#CBD5E1' }}>
                  Equiv. $318.00 USD
                </div>
              </div>
            </div>
            <div
              className="mono"
              style={{
                marginTop: '12px',
                paddingTop: '10px',
                borderTop: '1px dashed rgba(255,255,255,0.2)',
                fontSize: '11px',
                color: '#E2E8F0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <span>Factura FAC-BR-2026-0088</span>
              <span className="icon-inline"><Lock size={12} /> INMUTABLE RN16</span>
            </div>
          </div>
        </div>

        {/* COLUMNA DERECHA (50%): SELECTOR PÍLDORA + FORMULARIOS + DEMO COLAPSABLE */}
        <div className="auth-form-pane">
          {/* Selector tipo píldora: Cliente Internacional | Personal Interno / Seguridad */}
          <div className="auth-pill-switcher" role="tablist">
            <button
              type="button"
              className={`auth-pill-btn icon-inline ${tipoCuenta === 'CLIENTE' ? 'active' : ''}`}
              style={{ justifyContent: 'center' }}
              onClick={() => setTipoCuenta('CLIENTE')}
            >
              <ShoppingBag size={15} /> {t.authClientePill}
            </button>
            <button
              type="button"
              className={`auth-pill-btn icon-inline ${tipoCuenta === 'INTERNO' ? 'active-sec' : ''}`}
              style={{ justifyContent: 'center' }}
              onClick={() => {
                setTipoCuenta('INTERNO');
                setModo('LOGIN');
              }}
            >
              <ShieldCheck size={15} /> {t.authInternoPill}
            </button>
          </div>

          {/* Pestañas Iniciar Sesión / Crear Cuenta */}
          <div className="auth-mode-tabs">
            <button
              type="button"
              className={`auth-mode-tab ${modo === 'LOGIN' ? 'active' : ''}`}
              onClick={() => setModo('LOGIN')}
            >
              {t.iniciarSesion}
            </button>
            {tipoCuenta === 'CLIENTE' && (
              <button
                type="button"
                className={`auth-mode-tab ${modo === 'REGISTRO' ? 'active' : ''}`}
                onClick={() => setModo('REGISTRO')}
              >
                {t.crearCuenta} (CU02)
              </button>
            )}
          </div>

          {modo === 'LOGIN' ? (
            <form onSubmit={handleSubmitLogin} style={{ display: 'grid', gap: '14px' }}>
              <div>
                <label>
                  {tipoCuenta === 'CLIENTE'
                    ? 'Correo Electrónico Internacional'
                    : 'Usuario Interno / Oficial de Seguridad (ej. seguridad, logistica)'}
                </label>
                <input
                  required
                  className="mono"
                  value={identificador}
                  onChange={(e) => setIdentificador(e.target.value)}
                  placeholder={tipoCuenta === 'CLIENTE' ? 'carla.santos@email.br' : 'seguridad'}
                />
              </div>
              <div>
                <label>Contraseña (protección anti-fuerza bruta: 5 intentos — RNF01)</label>
                <input
                  type="password"
                  required
                  value={clave}
                  onChange={(e) => setClave(e.target.value)}
                  placeholder="••••••••••••"
                />
              </div>
              <button
                type="submit"
                disabled={cargando}
                className={`btn ${tipoCuenta === 'INTERNO' ? 'btn-amber' : 'btn-primary'}`}
                style={{ padding: '11px 16px' }}
              >
                <Lock size={16} /> {cargando ? 'Verificando credencial bcrypt...' : t.iniciarSesion}
              </button>
            </form>
          ) : (
            <form onSubmit={handleSubmitRegistro} style={{ display: 'grid', gap: '10px' }}>
              <div className="form-grid">
                <div>
                  <label>Nombres</label>
                  <input required value={regForm.nombres} onChange={(e) => setRegForm({ ...regForm, nombres: e.target.value })} />
                </div>
                <div>
                  <label>Apellidos</label>
                  <input required value={regForm.apellidos} onChange={(e) => setRegForm({ ...regForm, apellidos: e.target.value })} />
                </div>
              </div>
              <div className="form-grid">
                <div>
                  <label>Correo Único (RN04)</label>
                  <input type="email" required value={regForm.correo} onChange={(e) => setRegForm({ ...regForm, correo: e.target.value })} />
                </div>
                <div>
                  <label>Contraseña (bcrypt costo 12)</label>
                  <input type="password" required minLength={6} value={regForm.clave} onChange={(e) => setRegForm({ ...regForm, clave: e.target.value })} />
                </div>
              </div>
              <div className="form-grid">
                <div>
                  <label>País Residencia (RN12)</label>
                  <select value={regForm.pais} onChange={(e) => setRegForm({ ...regForm, pais: e.target.value })}>
                    {parametros?.paises?.map((p: any) => (
                      <option key={p.codigo_pais} value={p.codigo_pais}>
                        {p.nombre} ({p.codigo_pais})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label>ID Fiscal (CPF/NIT/EIN/NIF)</label>
                  <input className="mono" required value={regForm.datosFiscales} onChange={(e) => setRegForm({ ...regForm, datosFiscales: e.target.value })} />
                </div>
              </div>
              <div className="form-grid">
                <div>
                  <label>Idioma Preferido</label>
                  <select value={regForm.idioma} onChange={(e) => setRegForm({ ...regForm, idioma: e.target.value as IdiomaCode })}>
                    <option value="ES">ES — Español</option>
                    <option value="EN">EN — English</option>
                    <option value="PT">PT — Português</option>
                  </select>
                </div>
                <div>
                  <label>Moneda Preferida</label>
                  <select value={regForm.monedaPreferida} onChange={(e) => setRegForm({ ...regForm, monedaPreferida: e.target.value })}>
                    <option value="USD">USD ($)</option>
                    <option value="BRL">BRL (R$)</option>
                    <option value="BOB">BOB (Bs)</option>
                    <option value="EUR">EUR (€)</option>
                  </select>
                </div>
              </div>
              <div className="form-grid">
                <div>
                  <label>Ciudad</label>
                  <input required value={regForm.ciudad} onChange={(e) => setRegForm({ ...regForm, ciudad: e.target.value })} />
                </div>
                <div>
                  <label>Código Postal</label>
                  <input className="mono" required value={regForm.codigoPostal} onChange={(e) => setRegForm({ ...regForm, codigoPostal: e.target.value })} />
                </div>
              </div>
              <div>
                <label>Línea de Dirección Postal</label>
                <input required value={regForm.lineaDireccion} onChange={(e) => setRegForm({ ...regForm, lineaDireccion: e.target.value })} />
              </div>
              <button type="submit" disabled={cargando} className="btn btn-accent" style={{ padding: '11px 16px' }}>
                <CheckCircle2 size={16} /> {cargando ? 'Registrando cuenta...' : t.crearCuenta}
              </button>
            </form>
          )}

          {/* SECCIÓN COLAPSABLE / COMPACTA DE ACCESO RÁPIDO DE DEMOSTRACIÓN (INF-241) */}
          <details className="demo-access-accordion">
            <summary>
              <span className="icon-inline"><Zap size={14} /> Acceso Rápido de Demostración (INF-241 — 11 Actores)</span>
              <span className="mono" style={{ fontSize: '11px', color: 'var(--color-brand)' }}>Expandir ▾</span>
            </summary>
            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '6px' }}>
              Inicio de sesión real con JWT RS256 para validar escenarios D13, CU07, CU11, CU12, CU13 y CU14:
            </div>
            <div className="demo-access-grid">
              {ACCESOS_RAPIDOS_PROTOTIPO.map((ac) => (
                <button
                  key={ac.id}
                  type="button"
                  className={`actor-chip ${ac.sec ? 'security' : ''}`}
                  onClick={() => onLogin(ac.id, ac.pass, ac.tipo)}
                >
                  {ac.label}
                </button>
              ))}
            </div>
          </details>
        </div>
      </section>
    </div>
  );
};
