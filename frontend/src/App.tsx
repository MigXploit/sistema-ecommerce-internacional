import React, { useEffect, useState } from 'react';
import { apiFetch, UsuarioSesion } from './api';
import { IdiomaCode, MonedaCode, TEXTOS } from './i18n';
import { HeaderGlobal } from './components/HeaderGlobal';
import { TiendaPortal } from './TiendaPortal';
import { PanelOperativo } from './PanelOperativo';
import { PanelSeguridad } from './PanelSeguridad';
import { modalErrorValidacionOAduana, toastExito, toastInfo } from './utils/alerts';

const ACCESOS_RAPIDOS_PROTOTIPO = [
  { label: '🇧🇷 Carla Santos (BR • D13)', id: 'carla.santos@email.br', pass: 'Cliente2026!', tipo: 'CLIENTE' },
  { label: '🇪🇸 Sofía García (ES • Postventa)', id: 'sofia.garcia@importaciones.es', pass: 'Cliente2026!', tipo: 'CLIENTE' },
  { label: '🇺🇸 John Miller (US • Mayorista)', id: 'john.miller@globalcorp.us', pass: 'Cliente2026!', tipo: 'CLIENTE' },
  { label: '🇧🇴 Diego Rojas (BO • BOB)', id: 'diego.rojas@comercio.bo', pass: 'Cliente2026!', tipo: 'CLIENTE' },
  { label: '🛡️ Oficial de Seguridad (CU14)', id: 'seguridad', pass: 'Seguridad2026!', tipo: 'INTERNO', sec: true },
  { label: '⚙️ Admin Parámetros (CU13 / RN20)', id: 'admin.parametros', pass: 'AdminParam2026!', tipo: 'INTERNO' },
  { label: '📦 Gestor Catálogo (CU01)', id: 'catalogo', pass: 'Catalogo2026!', tipo: 'INTERNO' },
  { label: '🔍 Gestor Pedidos (CU06/11)', id: 'pedidos', pass: 'Pedidos2026!', tipo: 'INTERNO' },
  { label: '✈️ Logística / Aduana (CU07/08)', id: 'logistica', pass: 'Logistica2026!', tipo: 'INTERNO' },
  { label: '🧾 Facturación (CU09)', id: 'facturacion', pass: 'Factura2026!', tipo: 'INTERNO' },
  { label: '📊 Gerente Reportes (CU12)', id: 'gerencia', pass: 'Gerencia2026!', tipo: 'INTERNO' }
];

export default function App() {
  const [idioma, setIdiomaState] = useState<IdiomaCode>('ES');
  const [moneda, setMonedaState] = useState<MonedaCode>('USD');
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
  const enModoSeguridad = pestana === 'SEGURIDAD' || usuario?.rol === 'OFICIAL_SEGURIDAD';

  // Cambio de idioma con Toast rápido 3.5s (RNF07 / DESIGN.md §5.1)
  const cambiarIdiomaConToast = (nuevoIdioma: IdiomaCode) => {
    setIdiomaState(nuevoIdioma);
    toastInfo(TEXTOS[nuevoIdioma].toastIdiomaCambiado, `LOCALE: ${nuevoIdioma}`);
  };

  // Cambio de moneda con Toast rápido 3.5s (RNF07 / DESIGN.md §5.1)
  const cambiarMonedaConToast = (nuevaMoneda: MonedaCode) => {
    setMonedaState(nuevaMoneda);
    const tc = parametros?.tasasCambio?.find((x: any) => x.moneda_destino === nuevaMoneda);
    const tasaStr = nuevaMoneda === 'USD' ? '1.00' : tc ? Number(tc.tasa).toFixed(2) : '';
    toastInfo(
      `${TEXTOS[idioma].toastMonedaCambiada} ${nuevaMoneda}`,
      tasaStr ? `1 USD = ${tasaStr} ${nuevaMoneda}` : nuevaMoneda
    );
  };

  const notificar = (tipo: 'ok' | 'err', msg: string) => {
    if (tipo === 'ok') {
      toastExito(msg);
    } else {
      setAlerta({ tipo, msg });
    }
  };

  const cargarParametros = async () => {
    try {
      const p = await apiFetch('/api/parametros/publicos');
      setParametros(p);
    } catch (e: any) {
      setAlerta({ tipo: 'err', msg: 'No se pudo conectar al backend en http://localhost:8080: ' + e.message });
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
      setAlerta(null);

      if (resp.usuario.tipoCuenta === 'CLIENTE') {
        if (resp.usuario.idioma) setIdiomaState(resp.usuario.idioma);
        if (resp.usuario.monedaPreferida) setMonedaState(resp.usuario.monedaPreferida);
        setPestana('TIENDA');
      } else if (resp.usuario.rol === 'OFICIAL_SEGURIDAD') {
        setPestana('SEGURIDAD');
      } else {
        setPestana('OPERATIVO');
      }
      toastExito(
        `Sesión iniciada: ${resp.usuario.nombre}`,
        `JWT RS256 • ROL: ${resp.usuario.rol}`
      );
    } catch (err: any) {
      await modalErrorValidacionOAduana({
        idioma,
        titulo: 'Autenticación Rechazada (RNF01 / RN18)',
        mensaje: err.message,
        codigoRef: identificador
      });
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
      setIdiomaState(resp.usuario.idioma || 'ES');
      setMonedaState(resp.usuario.monedaPreferida || 'USD');
      setMostrarAuth(false);
      setPestana('TIENDA');
      toastExito(
        `Cliente internacional registrado (${resp.usuario.pais})`,
        `${resp.usuario.identificador} • bcrypt cost 12`
      );
    } catch (err: any) {
      await modalErrorValidacionOAduana({
        idioma,
        titulo: 'Error en Registro de Cliente (CU02)',
        mensaje: err.message,
        codigoRef: regForm.pais
      });
    }
  };

  const cerrarSesion = async () => {
    if (token) {
      apiFetch('/api/auth/logout', { method: 'POST' }, token).catch(() => {});
    }
    setToken(null);
    setUsuario(null);
    setPestana('TIENDA');
    toastInfo('Sesión finalizada correctamente');
  };

  return (
    <div>
      {/* A. BARRA SUPERIOR GLOBAL ESTANDARIZADA (DESIGN.md §3.A) */}
      <HeaderGlobal
        idioma={idioma}
        moneda={moneda}
        setIdioma={cambiarIdiomaConToast}
        setMoneda={cambiarMonedaConToast}
        usuario={usuario}
        parametros={parametros}
        modoSeguridad={enModoSeguridad}
        onAbrirAuth={() => {
          setModoAuth('LOGIN');
          setMostrarAuth(true);
        }}
        onCerrarSesion={cerrarSesion}
      />

      {/* BARRA DE CAMBIO RÁPIDO DE ACTOR (Escenarios D13, CU07, CU11, CU12, CU13, CU14) */}
      <div className="actor-switcher-bar">
        <strong style={{ color: 'var(--color-text-muted)' }}>Actor Prototipo:</strong>
        {ACCESOS_RAPIDOS_PROTOTIPO.map((ac) => (
          <button
            key={ac.id}
            className={`actor-chip ${ac.sec ? 'security' : ''} ${usuario?.identificador === ac.id ? 'active' : ''}`}
            onClick={() => ejecutarLogin(ac.id, ac.pass, ac.tipo)}
          >
            {ac.label}
          </button>
        ))}
      </div>

      <main className="main-container">
        {alerta && (
          <div className={`alert ${alerta.tipo === 'ok' ? 'alert-ok' : 'alert-err'}`}>
            <span>{alerta.msg}</span>
            <button className="btn btn-sm btn-outline" onClick={() => setAlerta(null)}>✕</button>
          </div>
        )}

        {/* NAVEGACIÓN ENTRE EXPERIENCIAS DIFERENCIADAS (DESIGN.md §1) */}
        <nav className="nav-tabs">
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
        </nav>

        {(pestana === 'TIENDA' || pestana === 'MIS_PEDIDOS') && (
          <TiendaPortal
            idioma={idioma}
            moneda={moneda}
            token={token}
            usuario={usuario}
            parametros={parametros}
            vista={pestana === 'MIS_PEDIDOS' ? 'MIS_PEDIDOS' : 'CATALOGO'}
            onCambiarVista={(v) => setPestana(v)}
            notificar={notificar}
            pedirLogin={() => {
              setModoAuth('LOGIN');
              setMostrarAuth(true);
            }}
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 className="section-subtitle" style={{ margin: 0 }}>
                {modoAuth === 'LOGIN' ? 'Autenticación Segura (Bcrypt + JWT RS256)' : 'Registro de Cliente Internacional (CU02)'}
              </h3>
              <button className="btn btn-sm btn-outline" onClick={() => setMostrarAuth(false)}>✕</button>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <button className={`btn ${modoAuth === 'LOGIN' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setModoAuth('LOGIN')}>
                {t.iniciarSesion}
              </button>
              <button className={`btn ${modoAuth === 'REGISTRO' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setModoAuth('REGISTRO')}>
                {t.registrarse}
              </button>
            </div>

            {modoAuth === 'LOGIN' ? (
              <form onSubmit={submitLoginManual} style={{ display: 'grid', gap: '12px' }}>
                <div>
                  <label>Tipo de Cuenta</label>
                  <select value={loginForm.tipoCuenta} onChange={(e) => setLoginForm({ ...loginForm, tipoCuenta: e.target.value })}>
                    <option value="CLIENTE">Cliente Internacional (Correo)</option>
                    <option value="INTERNO">Personal Interno / Oficial de Seguridad (Login)</option>
                  </select>
                </div>
                <div>
                  <label>{loginForm.tipoCuenta === 'CLIENTE' ? 'Correo Electrónico' : 'Login de Usuario (ej. seguridad, ex.operador)'}</label>
                  <input
                    required
                    className="mono"
                    value={loginForm.identificador}
                    onChange={(e) => setLoginForm({ ...loginForm, identificador: e.target.value })}
                    placeholder={loginForm.tipoCuenta === 'CLIENTE' ? 'carla.santos@email.br' : 'seguridad'}
                  />
                </div>
                <div>
                  <label>Contraseña (bloqueo automático tras 5 intentos fallidos - RNF01)</label>
                  <input
                    type="password"
                    required
                    value={loginForm.clave}
                    onChange={(e) => setLoginForm({ ...loginForm, clave: e.target.value })}
                  />
                </div>
                <button type="submit" className="btn btn-primary">{t.iniciarSesion}</button>
              </form>
            ) : (
              <form onSubmit={submitRegistroCliente} style={{ display: 'grid', gap: '12px' }}>
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
                  <div><label>ID Fiscal (NIT/CPF/EIN/NIF)</label><input className="mono" required value={regForm.datosFiscales} onChange={(e) => setRegForm({ ...regForm, datosFiscales: e.target.value })} /></div>
                </div>
                <div className="form-grid">
                  <div><label>Ciudad</label><input required value={regForm.ciudad} onChange={(e) => setRegForm({ ...regForm, ciudad: e.target.value })} /></div>
                  <div><label>Código Postal</label><input className="mono" required value={regForm.codigoPostal} onChange={(e) => setRegForm({ ...regForm, codigoPostal: e.target.value })} /></div>
                </div>
                <div><label>Línea de Dirección</label><input required value={regForm.lineaDireccion} onChange={(e) => setRegForm({ ...regForm, lineaDireccion: e.target.value })} /></div>
                <button type="submit" className="btn btn-accent">Registrar Cliente y Dirección</button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
