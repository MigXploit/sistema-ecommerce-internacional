import React from 'react';
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
  onAbrirAuth: () => void;
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
  onAbrirAuth,
  onCerrarSesion
}) => {
  const t = TEXTOS[idioma];

  // Buscar la tasa vigente para mostrar indicador discreto RN02/RN03
  const tasaObj = parametros?.tasasCambio?.find((tc: any) => tc.moneda_destino === moneda);
  const tasaValor = moneda === 'USD' ? '1.00' : tasaObj ? Number(tasaObj.tasa).toFixed(2) : '—';

  return (
    <header className={`header-global ${modoSeguridad ? 'security-mode' : ''}`}>
      <div className="header-brand">
        <div className="header-brand-row">
          <span>{modoSeguridad ? '🛡️' : '🌐'}</span>
          <span>{t.marca}</span>
          <StatusBadge
            estado={modoSeguridad ? 'PENDIENTE' : 'APROBADO'}
            texto={modoSeguridad ? 'SEGURIDAD AUTÓNOMA (RN20)' : 'INF-241 • Grupo 12'}
          />
        </div>
        <div className="header-subtitle">{t.subtitulo}</div>
      </div>

      <div className="header-controls">
        {/* Indicador discreto de vigencia de tipo de cambio (DESIGN.md §3.A / RN02 / RN03) */}
        <div className="fx-pill" title="Tipo de cambio sincronizado vigente (máx. 24h - RN03)">
          <span className="fx-dot" />
          <span>{t.vigenciaTasa}: 1 USD = {tasaValor} {moneda}</span>
        </div>

        {/* Selector de Idioma siempre visible en esquina superior derecha */}
        <select
          aria-label="Selector de Idioma"
          className="header-select"
          value={idioma}
          onChange={(e) => setIdioma(e.target.value as IdiomaCode)}
        >
          <option value="ES">🌐 ES — Español</option>
          <option value="EN">🌐 EN — English</option>
          <option value="PT">🌐 PT — Português</option>
        </select>

        {/* Selector de Moneda siempre visible en esquina superior derecha */}
        <select
          aria-label="Selector de Moneda"
          className="header-select mono"
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600 }}>
              👤 {usuario.nombre}
            </span>
            <StatusBadge estado={usuario.rol === 'OFICIAL_SEGURIDAD' ? 'PENDIENTE' : 'APROBADO'} texto={usuario.rol} />
            <button className="btn btn-sm btn-danger" onClick={onCerrarSesion}>
              {t.cerrarSesion}
            </button>
          </div>
        ) : (
          <button className="btn btn-sm btn-accent" onClick={onAbrirAuth}>
            {t.iniciarSesion} / {t.registrarse}
          </button>
        )}
      </div>
    </header>
  );
};
