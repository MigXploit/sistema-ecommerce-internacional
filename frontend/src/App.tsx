import React, { useEffect, useState } from 'react';
import { apiFetch, UsuarioSesion } from './api';
import { IdiomaCode, MonedaCode, TEXTOS } from './i18n';
import { TiendaPortal } from './TiendaPortal';
import { PanelOperativo } from './PanelOperativo';
import { PanelSeguridad } from './PanelSeguridad';

const ACCESOS_RAPIDOS_PROTOTIPO = [
  { label: '🇧🇷 Cliente Brasil (Carla - D13)', id: 'carla.santos@email.br', pass: 'Cliente2026!', tipo: 'CLIENTE' },
  { label: '🇪🇸 Cliente España (Sofía - Postventa)', id: 'sofia.garcia@importaciones.es', pass: 'Cliente2026!', tipo: 'CLIENTE' },
  { label: '🛡️ Oficial de Seguridad (CU14)', id: 'seguridad', pass: 'Seguridad2026!', tipo: 'INTERNO', sec: true },
  { label: '⚙️ Admin Parámetros (CU13 / RN20)', id: 'admin.parametros', pass: 'AdminParam2026!', tipo: 'INTERNO' },
  { label: '📦 Gestor Catálogo (CU01)', id: 'catalogo', pass: 'Catalogo2026!', tipo: 'INTERNO' },
  { label: '🔍 Gestor Pedidos / Reembolsos (CU06/11)', id: 'pedidos', pass: 'Pedidos2026!', tipo: 'INTERNO' },
  { label: '✈️ Logística / Aduana (CU07/08)', id: 'logistica', pass: 'Logistica2026!', tipo: 'INTERNO' },
  { label: '🧾 Facturación (CU09)', id: 'facturacion', pass: 'Factura2026!', tipo: 'INTERNO' },
  { label: '📊 Gerente Reportes (CU12)', id: 'gerencia', pass: 'Gerencia2026!', tipo: 'INTERNO' }
];

export default function App() {
  const [idioma, setIdioma] = useState<IdiomaCode>('ES');
  const [moneda, setMoneda] = useState<MonedaCode>('USD');
  const [token, setToken] = useState<string | null>(null);
  const [usuario, setUsuario] = useState<UsuarioSesion | null>(null);
  const [parametros, setParametros] = useState<any>(null);

  const [pestana, setPestana] = useState<'TIENDA' | 'MIS_PEDIDOS' | 'OPERATIVO' | 'SEGURIDAD'>('TIENDA');
  const [alerta, setAlerta] = useState<{ tipo: 'ok' | 'err'; msg: string } | null>(null);

  // Modal Login / Registro Cliente
  const [mostrarAuth, setMostrarAuth] = useState(false);
  const [modoAuth, setModoAuth] = useState<'LOGIN' | 'REGISTRO'>('LOGIN');
  const [loginForm, setLoginForm] = useState({ identificador: '', clave: '', tipoCuenta: 'CLIENTE' });
  const [regForm, setRegForm] = useState({
    nombres: '',
    apellidos: '',
    correo: '',
    clave: '',
    pais: 'BR',
    idioma: 'PT',
    monedaPreferida: 'BRL',
    datosFiscales: '',
    ciudad: '',
    lineaDireccion: '',
    codigoPostal: ''
  });

  const t = TEXTOS[idioma];

  const notificar = (tipo: 'ok' | 'err', msg: string) => {
    setAlerta({ tipo, msg });
  };

  const cargarParametros = async () => {
    try {
      const p = await apiFetch('/api/parametros/publicos');
      setParametros(p);
    } catch (e: any) {
      notificar('err', 'No se pudo conectar al backend en http://localhost:8080: ' + e.message);
    }
  };

  useEffect(() => {
    cargarParametros();
  }, []);

  const ejecutarLogin = async (identificador: string, clave: string, tipoCuenta: string) => {
    try {
      const resp = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identificador, clave, tipoCuenta })
      });
      setToken(resp.token);
      setUsuario(resp.usuario);
      setMostrarAuth(false);

      if (resp.usuario.tipoCuenta === 'CLIENTE') {
        if (resp.usuario.idioma) setIdioma(resp.usuario.idioma);
        if (resp.usuario.monedaPreferida) setMoneda(resp.usuario.monedaPreferida);
        setPestana('TIENDA');
      } else if (resp.usuario.rol === 'OFICIAL_SEGURIDAD') {
        setPestana('SEGURIDAD');
      } else {
        setPestana('OPERATIVO');
      }
      notificar('ok', `Sesión autenticada con JWT RS256: ${resp.usuario.nombre} [${resp.usuario.rol}]`);
    } catch (err: any) {
      notificar('err', err.message);
    }
  };

  const submitLoginManual = async (e: React.FormEvent) => {
    e.preventDefault();
    await ejecutarLogin(loginForm.identificador, loginForm.clave, loginForm.tipoCuenta);
  };

  const submitRegistroCliente = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const resp = await apiFetch('/api/auth/registro-cliente', {
        method: 'POST',
        body: JSON.stringify(regForm)
      });
      setToken(resp.token);
      setUsuario(resp.usuario);
      setIdioma(resp.usuario.idioma || 'ES');
      setMoneda(resp.usuario.monedaPreferida || 'USD');
      setMostrarAuth(false);
      setPestana('TIENDA');
      notificar('ok', 'Cuenta internacional creada con contraseña hasheada en bcrypt (costo 12).');
    } catch (err: any) {
      notificar('err', err.message);
    }
  };

  const cerrarSesion = async () => {
    if (token) {
      apiFetch('/api/auth/logout', { method: 'POST' }, token).catch(() => {});
    }
    setToken(null);
    setUsuario(null);
    setPestana('TIENDA');
    notificar('ok', 'Sesión cerrada.');
  };

  return (
    <div>
      {/* CABECERA GLOBAL CON SELECTOR DINÁMICO DE IDIOMA Y MONEDA */}
      <header className="topbar">
        <div>
          <div className="brand-title">🌐 {t.marca} <span className="badge badge-blue">INF-241 • Grupo 12</span></div>
          <div className="brand-sub">{t.subtitulo}</div>
        </div>

        <div className="controls-row">
          <select
            style={{ width: 'auto', background: '#1e293b', color: '#fff', borderColor: '#475569' }}
            value={idioma}
            onChange={(e) => setIdioma(e.target.value as IdiomaCode)}
          >
            <option value="ES">🌐 ES — Español</option>
            <option value="EN">🌐 EN — English</option>
            <option value="PT">🌐 PT — Português</option>
          </select>

          <select
            style={{ width: 'auto', background: '#1e293b', color: '#fff', borderColor: '#475569' }}
            value={moneda}
            onChange={(e) => setMoneda(e.target.value as MonedaCode)}
          >
            {parametros?.monedas?.map((m: any) => (
              <option key={m.codigo_moneda} value={m.codigo_moneda}>
                💱 {m.codigo_moneda} ({m.simbolo})
              </option>
            )) || (
              <>
                <option value="USD">💱 USD ($)</option>
                <option value="BRL">💱 BRL (R$)</option>
                <option value="BOB">💱 BOB (Bs)</option>
                <option value="EUR">💱 EUR (€)</option>
              </>
            )}
          </select>

          {usuario ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.82rem' }}>
                👤 <b>{usuario.nombre}</b> <span className="badge badge-amber">{usuario.rol}</span>
              </span>
              <button className="btn btn-danger" onClick={cerrarSesion}>{t.cerrarSesion}</button>
            </div>
          ) : (
            <button className="btn btn-primary" onClick={() => { setModoAuth('LOGIN'); setMostrarAuth(true); }}>
              {t.iniciarSesion} / {t.registrarse}
            </button>
          )}
        </div>
      </header>

      {/* BARRA DE ACCESO RÁPIDO PARA VALIDACIÓN DE ROLES EN DEFENSA DE PROTOTIPO */}
      <div className="demo-bar">
        <strong>Cambio rápido de Actor (Prototipo Sección 11.2):</strong>
        {ACCESOS_RAPIDOS_PROTOTIPO.map((ac) => (
          <button
            key={ac.id}
            className={`demo-chip ${ac.sec ? 'security' : ''}`}
            onClick={() => ejecutarLogin(ac.id, ac.pass, ac.tipo)}
          >
            {ac.label}
          </button>
        ))}
      </div>

      <main className="container">
        {alerta && (
          <div className={`alert ${alerta.tipo === 'ok' ? 'alert-ok' : 'alert-err'}`}>
            <span>{alerta.msg}</span>
            <button className="btn btn-outline" style={{ padding: '0.2rem 0.55rem' }} onClick={() => setAlerta(null)}>✕</button>
          </div>
        )}

        {/* NAVEGACIÓN PRINCIPAL SEGREGADA */}
        <div className="nav-tabs">
          <button className={`tab-btn ${pestana === 'TIENDA' ? 'active' : ''}`} onClick={() => setPestana('TIENDA')}>
            🛍️ {t.tienda}
          </button>
          <button className={`tab-btn ${pestana === 'MIS_PEDIDOS' ? 'active' : ''}`} onClick={() => setPestana('MIS_PEDIDOS')}>
            📦 {t.misPedidos}
          </button>
          {usuario && usuario.tipoCuenta === 'INTERNO' && usuario.rol !== 'OFICIAL_SEGURIDAD' && (
            <button className={`tab-btn ${pestana === 'OPERATIVO' ? 'active' : ''}`} onClick={() => setPestana('OPERATIVO')}>
              🏢 {t.panelOperativo} ({usuario.rol})
            </button>
          )}
          {usuario && usuario.rol === 'OFICIAL_SEGURIDAD' && (
            <button className={`tab-btn ${pestana === 'SEGURIDAD' ? 'sec-active' : ''}`} onClick={() => setPestana('SEGURIDAD')}>
              🛡️ {t.panelSeguridad}
            </button>
          )}
        </div>

        {(pestana === 'TIENDA' || pestana === 'MIS_PEDIDOS') && (
          <TiendaPortal
            idioma={idioma}
            moneda={moneda}
            token={token}
            usuario={usuario}
            parametros={parametros}
            vista={pestana === 'MIS_PEDIDOS' ? 'MIS_PEDIDOS' : 'CATALOGO'}
            notificar={notificar}
            pedirLogin={() => { setModoAuth('LOGIN'); setMostrarAuth(true); }}
          />
        )}

        {pestana === 'OPERATIVO' && token && usuario && usuario.tipoCuenta === 'INTERNO' && (
          <PanelOperativo
            token={token}
            usuario={usuario}
            parametros={parametros}
            recargarParametros={cargarParametros}
            notificar={notificar}
          />
        )}

        {pestana === 'SEGURIDAD' && token && usuario && usuario.rol === 'OFICIAL_SEGURIDAD' && (
          <PanelSeguridad
            token={token}
            usuario={usuario}
            notificar={notificar}
          />
        )}
      </main>

      {/* MODAL DE AUTENTICACIÓN REAL BCRYPT + BLOQUEO 5 INTENTOS Y REGISTRO DE CLIENTE */}
      {mostrarAuth && (
        <div className="modal-backdrop">
          <div className="modal-box">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
              <h3 style={{ margin: 0 }}>
                {modoAuth === 'LOGIN' ? 'Autenticación Segura (Bcrypt + JWT RS256)' : 'Registro de Cliente Internacional (CU02)'}
              </h3>
              <button className="btn btn-outline" onClick={() => setMostrarAuth(false)}>✕</button>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.9rem' }}>
              <button className={`btn ${modoAuth === 'LOGIN' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setModoAuth('LOGIN')}>
                Iniciar Sesión
              </button>
              <button className={`btn ${modoAuth === 'REGISTRO' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setModoAuth('REGISTRO')}>
                Crear Cuenta de Cliente
              </button>
            </div>

            {modoAuth === 'LOGIN' ? (
              <form onSubmit={submitLoginManual} style={{ display: 'grid', gap: '0.7rem' }}>
                <div>
                  <label>Tipo de Acceso</label>
                  <select value={loginForm.tipoCuenta} onChange={(e) => setLoginForm({ ...loginForm, tipoCuenta: e.target.value })}>
                    <option value="CLIENTE">Cliente Internacional (Correo)</option>
                    <option value="INTERNO">Personal Interno / Seguridad (Login)</option>
                  </select>
                </div>
                <div>
                  <label>{loginForm.tipoCuenta === 'CLIENTE' ? 'Correo Electrónico' : 'Login de Usuario (ej. seguridad, ex.operador)'}</label>
                  <input
                    required
                    value={loginForm.identificador}
                    onChange={(e) => setLoginForm({ ...loginForm, identificador: e.target.value })}
                    placeholder={loginForm.tipoCuenta === 'CLIENTE' ? 'carla.santos@email.br' : 'seguridad'}
                  />
                </div>
                <div>
                  <label>Contraseña (bloqueo tras 5 intentos fallidos - RNF01)</label>
                  <input
                    type="password"
                    required
                    value={loginForm.clave}
                    onChange={(e) => setLoginForm({ ...loginForm, clave: e.target.value })}
                  />
                </div>
                <button type="submit" className="btn btn-primary">Autenticar</button>
              </form>
            ) : (
              <form onSubmit={submitRegistroCliente} style={{ display: 'grid', gap: '0.65rem' }}>
                <div className="form-grid">
                  <div><label>Nombres</label><input required value={regForm.nombres} onChange={(e) => setRegForm({ ...regForm, nombres: e.target.value })} /></div>
                  <div><label>Apellidos</label><input required value={regForm.apellidos} onChange={(e) => setRegForm({ ...regForm, apellidos: e.target.value })} /></div>
                </div>
                <div className="form-grid">
                  <div><label>Correo Único (RN04)</label><input type="email" required value={regForm.correo} onChange={(e) => setRegForm({ ...regForm, correo: e.target.value })} /></div>
                  <div><label>Contraseña</label><input type="password" required minLength={6} value={regForm.clave} onChange={(e) => setRegForm({ ...regForm, clave: e.target.value })} /></div>
                </div>
                <div className="form-grid">
                  <div>
                    <label>País Residencia</label>
                    <select value={regForm.pais} onChange={(e) => setRegForm({ ...regForm, pais: e.target.value })}>
                      {parametros?.paises?.map((p: any) => (
                        <option key={p.codigo_pais} value={p.codigo_pais}>{p.nombre} ({p.codigo_pais})</option>
                      ))}
                    </select>
                  </div>
                  <div><label>ID Fiscal (NIT/CPF/EIN/NIF)</label><input required value={regForm.datosFiscales} onChange={(e) => setRegForm({ ...regForm, datosFiscales: e.target.value })} /></div>
                </div>
                <div className="form-grid">
                  <div><label>Ciudad</label><input required value={regForm.ciudad} onChange={(e) => setRegForm({ ...regForm, ciudad: e.target.value })} /></div>
                  <div><label>Código Postal</label><input required value={regForm.codigoPostal} onChange={(e) => setRegForm({ ...regForm, codigoPostal: e.target.value })} /></div>
                </div>
                <div><label>Línea de Dirección</label><input required value={regForm.lineaDireccion} onChange={(e) => setRegForm({ ...regForm, lineaDireccion: e.target.value })} /></div>
                <button type="submit" className="btn btn-emerald">Registrar Cliente y Dirección</button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
