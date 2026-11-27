import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { apiFetch, UsuarioSesion } from './api';
import { IdiomaCode, MonedaCode, TEXTOS } from './i18n';
import { HeaderGlobal } from './components/HeaderGlobal';
import { RastreoEnvioView } from './components/RastreoEnvioView';
import { AuthPage } from './AuthPage';
import { TiendaPortal } from './TiendaPortal';
import { PanelOperativo } from './PanelOperativo';
import { PanelSeguridad } from './PanelSeguridad';
import { modalErrorValidacionOAduana, toastExito, toastInfo } from './utils/alerts';

type VistaActiva = 'TIENDA' | 'MIS_PEDIDOS' | 'RASTREO' | 'AUTH' | 'OPERATIVO' | 'SEGURIDAD';

export default function App() {
  const [idioma, setIdiomaState] = useState<IdiomaCode>('ES');
  const [moneda, setMonedaState] = useState<MonedaCode>('USD');
  const [token, setToken] = useState<string | null>(null);
  const [usuario, setUsuario] = useState<UsuarioSesion | null>(null);
  const [parametros, setParametros] = useState<any>(null);

  const [pestana, setPestana] = useState<VistaActiva>('TIENDA');
  const [destinoPostLogin, setDestinoPostLogin] = useState<'RASTREO' | null>(null);
  const [guiaRastreo, setGuiaRastreo] = useState<string>('');
  const [alerta, setAlerta] = useState<{ tipo: 'ok' | 'err'; msg: string } | null>(null);

  // Estado compartido del Header Marketplace (Búsqueda, Categorías y Drawer Carrito)
  const [busqueda, setBusqueda] = useState('');
  const [categoria, setCategoria] = useState('TODAS');
  const [categorias, setCategorias] = useState<string[]>(['TODAS', 'Textil', 'Tecnología', 'Alimentos', 'Artesanía']);
  const [busquedaTrigger, setBusquedaTrigger] = useState(0);
  const [carritoAbierto, setCarritoAbierto] = useState(false);
  const [cantidadCarrito, setCantidadCarrito] = useState(0);

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

  // Control de acceso estricto en navegación (incluyendo CU08 Rastrear Envío)
  const navegarConControl = (destino: VistaActiva) => {
    if (destino === 'RASTREO') {
      if (!usuario || !token) {
        setDestinoPostLogin('RASTREO');
        setPestana('AUTH');
        toastInfo('Debes iniciar sesión para rastrear tus envíos internacionales', 'CU08 • Acceso autenticado');
        return;
      }
      if (usuario.tipoCuenta === 'CLIENTE' || usuario.rol === 'LOGISTICA' || usuario.rol === 'GESTOR_PEDIDOS') {
        setPestana('RASTREO');
        return;
      }
      // Otros roles internos se redirigen a su panel correspondiente
      const panelDestino: VistaActiva = usuario.rol === 'OFICIAL_SEGURIDAD' ? 'SEGURIDAD' : 'OPERATIVO';
      setPestana(panelDestino);
      toastInfo(`Redirigido al panel asignado para ${usuario.rol}`, 'RBAC • RNF02');
      return;
    }

    if (destino !== 'AUTH') {
      setDestinoPostLogin(null);
    }
    setPestana(destino);
  };

  const ejecutarLogin = async (identificador: string, clave: string, tipoCuenta: string) => {
    try {
      const resp = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identificador, clave, tipoCuenta })
      });
      setToken(resp.token);
      setUsuario(resp.usuario);
      setAlerta(null);

      if (resp.usuario.tipoCuenta === 'CLIENTE') {
        if (resp.usuario.idioma) setIdiomaState(resp.usuario.idioma);
        if (resp.usuario.monedaPreferida) setMonedaState(resp.usuario.monedaPreferida);
        if (destinoPostLogin === 'RASTREO') {
          setDestinoPostLogin(null);
          setPestana('RASTREO');
        } else {
          setPestana('TIENDA');
        }
      } else if (resp.usuario.rol === 'OFICIAL_SEGURIDAD') {
        setDestinoPostLogin(null);
        setPestana('SEGURIDAD');
      } else if (destinoPostLogin === 'RASTREO' && (resp.usuario.rol === 'LOGISTICA' || resp.usuario.rol === 'GESTOR_PEDIDOS')) {
        setDestinoPostLogin(null);
        setPestana('RASTREO');
      } else {
        setDestinoPostLogin(null);
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

  const ejecutarRegistroCliente = async (regForm: any) => {
    try {
      const resp = await apiFetch('/api/auth/registro-cliente', {
        method: 'POST',
        body: JSON.stringify(regForm)
      });
      setToken(resp.token);
      setUsuario(resp.usuario);
      setIdiomaState(resp.usuario.idioma || 'ES');
      setMonedaState(resp.usuario.monedaPreferida || 'USD');
      if (destinoPostLogin === 'RASTREO') {
        setDestinoPostLogin(null);
        setPestana('RASTREO');
      } else {
        setPestana('TIENDA');
      }
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
      {/* HEADER ESTILO MARKETPLACE DE 3 NIVELES LIMPIOS (DESIGN.md §3.A) */}
      <HeaderGlobal
        idioma={idioma}
        moneda={moneda}
        setIdioma={cambiarIdiomaConToast}
        setMoneda={cambiarMonedaConToast}
        usuario={usuario}
        parametros={parametros}
        modoSeguridad={enModoSeguridad}
        pestanaActiva={pestana}
        onNavegar={(p) => navegarConControl(p)}
        busqueda={busqueda}
        setBusqueda={setBusqueda}
        categoria={categoria}
        setCategoria={setCategoria}
        categorias={categorias}
        onEjecutarBusqueda={() => setBusquedaTrigger((v) => v + 1)}
        cantidadCarrito={cantidadCarrito}
        onAbrirCarrito={() => {
          if (pestana !== 'TIENDA' && pestana !== 'MIS_PEDIDOS') {
            setPestana('TIENDA');
          }
          setCarritoAbierto(true);
        }}
        onCerrarSesion={cerrarSesion}
      />

      <main className="main-container">
        {alerta && (
          <div className={`alert ${alerta.tipo === 'ok' ? 'alert-ok' : 'alert-err'}`}>
            <span>{alerta.msg}</span>
            <button className="btn btn-sm btn-outline" onClick={() => setAlerta(null)} aria-label="Cerrar">
              <X size={14} />
            </button>
          </div>
        )}

        {/* PANTALLA DEDICADA DE LOGIN Y REGISTRO DIVIDIDA 50/50 (AuthPage.tsx) */}
        {pestana === 'AUTH' && (
          <AuthPage
            idioma={idioma}
            parametros={parametros}
            onLogin={ejecutarLogin}
            onRegistro={ejecutarRegistroCliente}
            onVolverTienda={() => setPestana('TIENDA')}
          />
        )}

        {/* PORTAL TIENDA (4 COLUMNAS + HERO + CHECKOUT DRAWER) Y MIS PEDIDOS */}
        {(pestana === 'TIENDA' || pestana === 'MIS_PEDIDOS') && (
          <TiendaPortal
            idioma={idioma}
            moneda={moneda}
            token={token}
            usuario={usuario}
            parametros={parametros}
            vista={pestana === 'MIS_PEDIDOS' ? 'MIS_PEDIDOS' : 'CATALOGO'}
            busqueda={busqueda}
            categoria={categoria}
            busquedaTrigger={busquedaTrigger}
            onCategoriasDetectadas={(cats) => {
              if (cats.length > 1) setCategorias(cats);
            }}
            carritoAbierto={carritoAbierto}
            setCarritoAbierto={setCarritoAbierto}
            onCantidadCarritoChange={setCantidadCarrito}
            onCambiarVista={(v) => navegarConControl(v)}
            onRastrearGuia={(guia) => {
              setGuiaRastreo(guia);
              navegarConControl('RASTREO');
            }}
            notificar={notificar}
            pedirLogin={() => {
              setCarritoAbierto(false);
              setPestana('AUTH');
            }}
          />
        )}

        {/* SEGUIMIENTO LOGÍSTICO DEDICADO (CU08) */}
        {pestana === 'RASTREO' && usuario && token && (
          <div className="view-animate">
            <RastreoEnvioView codigoInicial={guiaRastreo} usuario={usuario} token={token} />
          </div>
        )}

        {/* PANEL OPERATIVO RBAC */}
        {pestana === 'OPERATIVO' && token && usuario && usuario.tipoCuenta === 'INTERNO' && (
          <div className="view-animate">
            <PanelOperativo
              token={token}
              usuario={usuario}
              parametros={parametros}
              recargarParametros={cargarParametros}
              notificar={notificar}
            />
          </div>
        )}

        {/* CONSOLA AUTÓNOMA DEL OFICIAL DE SEGURIDAD (RN20) */}
        {pestana === 'SEGURIDAD' && token && usuario && usuario.rol === 'OFICIAL_SEGURIDAD' && (
          <div className="view-animate">
            <PanelSeguridad
              token={token}
              usuario={usuario}
              notificar={notificar}
            />
          </div>
        )}
      </main>
    </div>
  );
}
