import React from 'react';
import {
  Building2,
  Globe,
  LogOut,
  Package,
  Radar,
  Scale,
  Search,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  User
} from 'lucide-react';
import { UsuarioSesion } from '../api';
import { IdiomaCode, MonedaCode, TEXTOS } from '../i18n';
import { StatusBadge } from './StatusBadge';

interface HeaderGlobalProps {
  idioma: IdiomaCode;
  moneda: MonedaCode;
  setIdioma: (i: IdiomaCode) => void;
  setMoneda: (m: MonedaCode) => void;
  usuario: UsuarioSesion | null;
  parametros: any;
  modoSeguridad: boolean;
  pestanaActiva: 'TIENDA' | 'MIS_PEDIDOS' | 'RASTREO' | 'AUTH' | 'OPERATIVO' | 'SEGURIDAD';
  onNavegar: (p: 'TIENDA' | 'MIS_PEDIDOS' | 'RASTREO' | 'AUTH' | 'OPERATIVO' | 'SEGURIDAD') => void;
  busqueda: string;
  setBusqueda: (v: string) => void;
  categoria: string;
  setCategoria: (v: string) => void;
  categorias: string[];
  onEjecutarBusqueda: () => void;
  cantidadCarrito: number;
  onAbrirCarrito: () => void;
  onCerrarSesion: () => void;
}

export const HeaderGlobal: React.FC<HeaderGlobalProps> = ({
  idioma,
  moneda,
  setIdioma,
  setMoneda,
  usuario,
  parametros,
  modoSeguridad,
  pestanaActiva,
  onNavegar,
  busqueda,
  setBusqueda,
  categoria,
  setCategoria,
  categorias,
  onEjecutarBusqueda,
  cantidadCarrito,
  onAbrirCarrito,
  onCerrarSesion
}) => {
  const t = TEXTOS[idioma];

  const tasaObj = parametros?.tasasCambio?.find((tc: any) => tc.moneda_destino === moneda);
  const tasaValor = moneda === 'USD' ? '1.00' : tasaObj ? Number(tasaObj.tasa).toFixed(2) : '—';

  const handleSubmitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (pestanaActiva !== 'TIENDA') {
      onNavegar('TIENDA');
    }
    onEjecutarBusqueda();
  };

  return (
    <div className="mp-header-wrapper">
      {/* NIVEL 1: TOP BAR FINA (#0F172A, 32px alto) */}
      <div className="mp-topbar">
        <div className="mp-topbar-left">
          <span className="mp-topbar-item mono" title="Tipo de cambio sincronizado vigente (RN02 / RN03)">
            <span className="fx-dot" />
            <span>{t.vigenciaTasa}: <strong>1 USD = {tasaValor} {moneda}</strong></span>
          </span>
          <span className="mp-topbar-item" style={{ color: '#94A3B8' }}>•</span>
          <span className="mp-topbar-item">
            <Scale size={14} /> {t.avisoAduanaTopbar}
          </span>
        </div>

        <div className="mp-topbar-right">
          <select
            aria-label="Selector de Idioma"
            className="mp-topbar-select"
            value={idioma}
            onChange={(e) => setIdioma(e.target.value as IdiomaCode)}
          >
            <option value="ES">ES — Español</option>
            <option value="EN">EN — English</option>
            <option value="PT">PT — Português</option>
          </select>

          <select
            aria-label="Selector de Moneda"
            className="mp-topbar-select mono"
            value={moneda}
            onChange={(e) => setMoneda(e.target.value as MonedaCode)}
          >
            {parametros?.monedas?.map((m: any) => (
              <option key={m.codigo_moneda} value={m.codigo_moneda}>
                {m.codigo_moneda} ({m.simbolo})
              </option>
            )) || (
              <>
                <option value="USD">USD ($)</option>
                <option value="BRL">BRL (R$)</option>
                <option value="BOB">BOB (Bs)</option>
                <option value="EUR">EUR (€)</option>
              </>
            )}
          </select>
        </div>
      </div>

      {/* NIVEL 2: HEADER PRINCIPAL MARKETPLACE (#FFFFFF o #0F172A en Seguridad) */}
      <header className={`mp-main-header ${modoSeguridad ? 'security-mode' : ''}`}>
        <button className="mp-brand-btn" onClick={() => onNavegar('TIENDA')}>
          <span className="mp-brand-logo">
            {modoSeguridad ? <ShieldCheck size={20} /> : <Globe size={20} />}
          </span>
          <div>
            <div className="mp-brand-title">{t.marca}</div>
            <div className="mp-brand-sub">
              {modoSeguridad ? 'SEGURIDAD AUTÓNOMA (RN20)' : 'Global Marketplace • INF-241'}
            </div>
          </div>
        </button>

        {/* Barra de Búsqueda Central Redondeada con Categoría Integrada */}
        <form className="mp-search-pill" onSubmit={handleSubmitSearch}>
          <select
            aria-label="Categoría de búsqueda"
            className="mp-search-cat"
            value={categoria}
            onChange={(e) => {
              setCategoria(e.target.value);
              if (pestanaActiva !== 'TIENDA') onNavegar('TIENDA');
            }}
          >
            {categorias.map((c) => (
              <option key={c} value={c}>
                {c === 'TODAS' ? t.todasCategorias : c}
              </option>
            ))}
          </select>
          <input
            className="mp-search-input"
            value={busqueda}
            placeholder={t.buscarPlaceholder}
            onChange={(e) => setBusqueda(e.target.value)}
          />
          <button type="submit" className="mp-search-btn" aria-label={t.buscarBtn}>
            <Search size={16} /> <span>{t.buscarBtn}</span>
          </button>
        </form>

        {/* Acciones Derecha: Usuario/Pedidos, Rastreo CU08, Panel RBAC y Carrito */}
        <div className="mp-header-actions">
          <button
            className={`mp-action-btn ${pestanaActiva === 'RASTREO' ? 'active' : ''}`}
            onClick={() => onNavegar('RASTREO')}
          >
            <Radar size={16} /> {t.rastrearEnvioCorto}
          </button>

          {usuario ? (
            <>
              {usuario.tipoCuenta === 'CLIENTE' && (
                <button
                  className={`mp-action-btn ${pestanaActiva === 'MIS_PEDIDOS' ? 'active' : ''}`}
                  onClick={() => onNavegar('MIS_PEDIDOS')}
                >
                  <Package size={16} /> {t.misPedidosCorto}
                </button>
              )}

              {usuario.tipoCuenta === 'INTERNO' && usuario.rol !== 'OFICIAL_SEGURIDAD' && (
                <button
                  className={`mp-action-btn ${pestanaActiva === 'OPERATIVO' ? 'active' : ''}`}
                  onClick={() => onNavegar('OPERATIVO')}
                >
                  <Building2 size={16} /> {usuario.rol}
                </button>
              )}

              {usuario.rol === 'OFICIAL_SEGURIDAD' && (
                <button
                  className={`mp-action-btn ${pestanaActiva === 'SEGURIDAD' ? 'active' : ''}`}
                  onClick={() => onNavegar('SEGURIDAD')}
                >
                  <ShieldCheck size={16} /> Seguridad
                </button>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <StatusBadge
                  estado={usuario.rol === 'OFICIAL_SEGURIDAD' ? 'PENDIENTE' : 'APROBADO'}
                  texto={usuario.nombre.split(' ')[0]}
                />
                <button className="btn btn-sm btn-danger" onClick={onCerrarSesion} title={t.cerrarSesion}>
                  <LogOut size={14} /> Salir
                </button>
              </div>
            </>
          ) : (
            <button
              className={`mp-action-btn ${pestanaActiva === 'AUTH' ? 'active' : ''}`}
              onClick={() => onNavegar('AUTH')}
            >
              <User size={16} /> {t.iniciarSesion} / {t.accesoInterno}
            </button>
          )}

          {/* Carrito con contador animado */}
          <button className="mp-cart-btn" onClick={onAbrirCarrito} aria-label="Abrir carrito">
            <ShoppingCart size={17} />
            <span key={cantidadCarrito} className="cart-count-badge">
              {cantidadCarrito}
            </span>
          </button>
        </div>
      </header>

      {/* NIVEL 3: BARRA DE CATEGORÍAS HORIZONTAL RÁPIDA */}
      {!modoSeguridad && (pestanaActiva === 'TIENDA' || pestanaActiva === 'RASTREO' || pestanaActiva === 'MIS_PEDIDOS') && (
        <nav className="mp-cat-bar" aria-label="Categorías rápidas">
          <div className="mp-cat-list">
            {categorias.map((c) => (
              <button
                key={c}
                className={`mp-cat-chip icon-inline ${pestanaActiva === 'TIENDA' && categoria === c ? 'active' : ''}`}
                onClick={() => {
                  setCategoria(c);
                  if (pestanaActiva !== 'TIENDA') onNavegar('TIENDA');
                }}
              >
                {c === 'TODAS' ? (
                  <>
                    <Sparkles size={14} /> {t.todasCategorias}
                  </>
                ) : (
                  c
                )}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
            <button
              className={`mp-cat-chip icon-inline ${pestanaActiva === 'MIS_PEDIDOS' ? 'active' : ''}`}
              onClick={() => onNavegar('MIS_PEDIDOS')}
            >
              <Package size={14} /> {t.misPedidos}
            </button>
          </div>
        </nav>
      )}
    </div>
  );
};
