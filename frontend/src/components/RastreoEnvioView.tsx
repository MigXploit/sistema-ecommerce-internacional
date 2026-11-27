import React, { useEffect, useState } from 'react';
import { AlertTriangle, MapPin, Package, Radar, Search } from 'lucide-react';
import { apiFetch, UsuarioSesion } from '../api';
import { StatusBadge } from './StatusBadge';

interface Props {
  codigoInicial?: string;
  usuario: UsuarioSesion;
  token: string;
}

const ETAPAS = [
  { id: 'PENDIENTE', label: '1. Preparado / Etiqueta CN23' },
  { id: 'EN_TRANSITO', label: '2. En Tránsito Internacional' },
  { id: 'EN_ADUANA', label: '3. Inspección Aduanera' },
  { id: 'ENTREGADO', label: '4. Entregado al Destinatario' }
];

export const RastreoEnvioView: React.FC<Props> = ({ codigoInicial, usuario, token }) => {
  const [codigo, setCodigo] = useState(codigoInicial || '');
  const [resultado, setResultado] = useState<any | null>(null);
  const [misGuias, setMisGuias] = useState<{ guia: string; idPedido: number; estado: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const esOperadorConsulta = usuario.rol === 'LOGISTICA' || usuario.rol === 'GESTOR_PEDIDOS';

  const buscarGuia = async (valor?: string) => {
    const q = (valor ?? codigo).trim();
    if (!q) return;
    setCargando(true);
    setError(null);
    try {
      const data = await apiFetch(`/api/envios/seguimiento/${encodeURIComponent(q)}`, {}, token);
      setResultado(data);
    } catch (err: any) {
      setResultado(null);
      setError(err.message);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    if (codigoInicial) {
      setCodigo(codigoInicial);
      buscarGuia(codigoInicial);
    }
  }, [codigoInicial]);

  // Si es CLIENTE, cargar automáticamente sus propias guías activas para rastreo en 1 clic
  useEffect(() => {
    if (usuario.tipoCuenta === 'CLIENTE' && token) {
      apiFetch<any[]>('/api/pedidos', {}, token)
        .then((peds) => {
          const guias = peds
            .filter((p) => p.envio?.numero_guia)
            .map((p) => ({
              guia: p.envio.numero_guia as string,
              idPedido: p.id_pedido as number,
              estado: p.envio.estado as string
            }));
          setMisGuias(guias);
          if (!codigoInicial && guias.length > 0) {
            setCodigo(guias[0].guia);
            buscarGuia(guias[0].guia);
          }
        })
        .catch(() => {});
    }
  }, [usuario, token]);

  const estadoActual = resultado?.estado || 'PENDIENTE';
  const idxActual = ETAPAS.findIndex((e) => e.id === estadoActual);

  return (
    <div>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '6px' }}>
          <h2 className="view-title icon-inline" style={{ margin: 0 }}>
            <Radar size={22} />
            {esOperadorConsulta
              ? 'Consulta Operativa de Seguimiento por Guía (CU08 / RF15)'
              : `Seguimiento Logístico de tus Envíos — ${usuario.nombre}`}
          </h2>
          <StatusBadge estado="APROBADO" texto={`ROL: ${usuario.rol}`} />
        </div>
        <p style={{ color: 'var(--color-text-muted)', marginTop: 0, fontSize: '13px' }}>
          {esOperadorConsulta
            ? 'Ingrese cualquier Número de Guía Internacional (ej. CG-2026-000731, DHL-2026-004192) o #ID de Pedido para auditar el estado aduanero en tiempo real.'
            : 'Consulta tus guías internacionales activas o ingresa un número de guía para ver hitos aduaneros, operador y fecha estimada de entrega.'}
        </p>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginTop: '12px' }}>
          <input
            className="mono"
            style={{ flex: '1 1 280px', maxWidth: '420px' }}
            placeholder="Ej. CG-2026-000731 o #1"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && buscarGuia()}
          />
          <button className="btn btn-primary" onClick={() => buscarGuia()} disabled={cargando}>
            <Search size={16} /> {cargando ? 'Consultando...' : 'Rastrear Envío'}
          </button>

          {esOperadorConsulta ? (
            <>
              <button
                className="btn btn-sm btn-outline mono"
                onClick={() => {
                  setCodigo('CG-2026-000731');
                  buscarGuia('CG-2026-000731');
                }}
              >
                Guía BR: CG-2026-000731
              </button>
              <button
                className="btn btn-sm btn-outline mono"
                onClick={() => {
                  setCodigo('DHL-2026-004192');
                  buscarGuia('DHL-2026-004192');
                }}
              >
                Guía ES: DHL-2026-004192
              </button>
            </>
          ) : (
            misGuias.map((g) => (
              <button
                key={g.guia}
                className={`btn btn-sm mono ${codigo === g.guia ? 'btn-accent' : 'btn-outline'}`}
                onClick={() => {
                  setCodigo(g.guia);
                  buscarGuia(g.guia);
                }}
              >
                <Package size={14} /> Pedido #{g.idPedido}: {g.guia}
              </button>
            ))
          )}
        </div>

        {error && (
          <div className="alert alert-err" style={{ marginTop: '14px', marginBottom: 0 }}>
            <span>{error}</span>
          </div>
        )}
      </div>

      {resultado && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <strong className="mono" style={{ fontSize: '18px', color: 'var(--color-brand)' }}>
                  Guía {resultado.numero_guia}
                </strong>
                <StatusBadge estado={resultado.estado} />
                <StatusBadge estado={resultado.estado_pedido} texto={`Pedido #${resultado.id_pedido}: ${resultado.estado_pedido}`} />
              </div>
              <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '6px' }}>
                <strong>Operador:</strong> {resultado.operador} •{' '}
                <strong>Etiqueta Exportación:</strong> <code className="mono">{resultado.etiqueta_exportacion}</code> •{' '}
                <strong>Entrega Estimada:</strong> <code className="mono">{String(resultado.fecha_estimada).substring(0, 10)}</code>
              </div>
              <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                <strong>Destinatario:</strong> {resultado.nombre_cliente} — {resultado.ciudad}, {resultado.nombre_pais} ({resultado.pais_destino}) CP <code className="mono">{resultado.codigo_postal}</code>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="mono" style={{ fontWeight: 700, fontSize: '15px' }}>
                {Number(resultado.total).toFixed(2)} {resultado.moneda}
              </div>
              <div className="mono" style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                Peso Tasable: {resultado.peso_tasable} kg
              </div>
            </div>
          </div>

          {/* Barra de progreso horizontal del ciclo logístico (Diagrama D09) */}
          <div className="tracking-steps-bar" style={{ marginTop: '18px' }}>
            {ETAPAS.map((etapa, i) => {
              let cls = '';
              if (estadoActual === 'DEVUELTO') {
                cls = 'returned';
              } else if (etapa.id === estadoActual) {
                cls = 'current';
              } else if (idxActual > i || estadoActual === 'ENTREGADO') {
                cls = 'reached';
              }
              return (
                <div key={etapa.id} className={`tracking-stage ${cls}`}>
                  {etapa.label}
                </div>
              );
            })}
          </div>

          {estadoActual === 'DEVUELTO' && (
            <div className="alert alert-err" style={{ marginTop: '12px' }}>
              <span className="icon-inline">
                <AlertTriangle size={16} /> Incidencia Aduanera: El paquete fue retornado (DEVUELTO). Contacte a soporte postventa.
              </span>
            </div>
          )}

          <div className="form-grid" style={{ marginTop: '18px' }}>
            <div style={{ backgroundColor: 'var(--color-bg)', padding: '16px', borderRadius: '12px', border: '1px solid var(--color-border)' }}>
              <strong className="icon-inline" style={{ marginBottom: '10px' }}>
                <MapPin size={16} /> Historial Cronológico de Eventos y Aduana
              </strong>
              {resultado.eventos?.length > 0 ? (
                resultado.eventos.map((ev: any, idx: number) => (
                  <div className="timeline-item" key={idx}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <StatusBadge estado={ev.estado} />
                      <span className="mono" style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{ev.fecha}</span>
                    </div>
                    <div style={{ fontSize: '13px', marginTop: '4px' }}>{ev.detalle}</div>
                  </div>
                ))
              ) : (
                <p style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Sin eventos registrados aún.</p>
              )}
            </div>

            <div style={{ backgroundColor: 'var(--color-bg)', padding: '16px', borderRadius: '12px', border: '1px solid var(--color-border)' }}>
              <strong className="icon-inline" style={{ marginBottom: '10px' }}>
                <Package size={16} /> Contenido Declarado en Aduana (Partidas HS)
              </strong>
              {resultado.detalles?.map((d: any, idx: number) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '8px 0',
                    borderBottom: '1px solid var(--color-border)',
                    fontSize: '13px'
                  }}
                >
                  <div>
                    <strong>{d.cantidad}× {d.nombre_producto}</strong>
                    <div className="mono" style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                      SKU: {d.codigo} • Partida HS: {d.codigo_arancelario}
                    </div>
                  </div>
                  <div className="mono" style={{ fontSize: '12px' }}>
                    {d.peso_kg} kg/u
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
