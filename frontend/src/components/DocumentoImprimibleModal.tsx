import React from 'react';
import { Lock, Printer, X } from 'lucide-react';
import { ImmutableTag, StatusBadge } from './StatusBadge';

interface Props {
  tipo: 'COMPROBANTE' | 'ETIQUETA_CN23';
  datos: any;
  onCerrar: () => void;
}

export const DocumentoImprimibleModal: React.FC<Props> = ({ tipo, datos, onCerrar }) => {
  if (!datos) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal-box" style={{ maxWidth: '680px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid var(--color-brand)', paddingBottom: '12px', marginBottom: '16px' }}>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
              AndesGlobal Trade • Comercio Electrónico Internacional
            </div>
            <h3 style={{ margin: '4px 0 0', fontSize: '18px', color: 'var(--color-brand)' }}>
              {tipo === 'COMPROBANTE'
                ? `${datos.tipo_documento === 'NOTA_CREDITO' ? 'Nota de Crédito Tributaria' : 'Factura Comercial Internacional'} ${datos.numero}`
                : `Etiqueta de Exportación / Declaración CN23 — ${datos.numero_guia}`}
            </h3>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-sm btn-primary" onClick={() => window.print()}>
              <Printer size={15} /> Imprimir / PDF
            </button>
            <button className="btn btn-sm btn-outline" onClick={onCerrar} aria-label="Cerrar">
              <X size={15} />
            </button>
          </div>
        </div>

        {tipo === 'COMPROBANTE' ? (
          <div style={{ display: 'grid', gap: '14px', fontSize: '13px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', backgroundColor: 'var(--color-bg)', padding: '12px', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
              <div>
                <div><strong>Número:</strong> <code className="mono">{datos.numero}</code></div>
                <div><strong>Pedido Asociado:</strong> <code className="mono">#{datos.id_pedido}</code></div>
                {datos.factura_origen_numero && (
                  <div><strong>Factura Origen:</strong> <code className="mono">{datos.factura_origen_numero}</code></div>
                )}
              </div>
              <div style={{ textAlign: 'right' }}>
                <StatusBadge estado={datos.tipo_documento} />
                <div style={{ marginTop: '6px' }}>
                  <ImmutableTag />
                </div>
              </div>
            </div>

            <div className="form-grid">
              <div>
                <label>Cliente / Destinatario</label>
                <div><strong>{datos.nombre_cliente || 'Cliente Internacional'}</strong></div>
              </div>
              <div>
                <label>Jurisdicción / ID Fiscal</label>
                <div className="mono">{datos.pais} — {datos.datos_fiscales_cliente}</div>
              </div>
              <div>
                <label>Fecha de Emisión</label>
                <div className="mono">{String(datos.fecha_emision || '').replace('T', ' ').substring(0, 19)}</div>
              </div>
              <div>
                <label>Moneda Congelada (RN02)</label>
                <div className="mono">{datos.moneda}</div>
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '12px', display: 'grid', gap: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Subtotal Neto:</span>
                <strong className="mono">{Number(datos.subtotal).toFixed(2)} {datos.moneda}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Impuestos y Aranceles Aplicados:</span>
                <strong className="mono">{Number(datos.impuestos).toFixed(2)} {datos.moneda}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '16px', color: 'var(--color-brand)', borderTop: '2px solid var(--color-border)', paddingTop: '8px', marginTop: '4px' }}>
                <strong>TOTAL {datos.tipo_documento === 'NOTA_CREDITO' ? 'ACREDITADO' : 'FACTURADO'}:</strong>
                <strong className="mono">{Number(datos.total).toFixed(2)} {datos.moneda}</strong>
              </div>
            </div>

            <div className="icon-inline" style={{ fontSize: '11px', color: 'var(--color-text-muted)', backgroundColor: 'var(--color-bg)', padding: '10px', borderRadius: '8px' }}>
              <Lock size={14} style={{ flexShrink: 0 }} />
              <span>Documento tributario inmutable conforme a <strong>RN15 / RN16</strong>. Protegido contra alteración o eliminación física mediante triggers de integridad en base de datos.</span>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '14px', fontSize: '13px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', backgroundColor: 'var(--color-bg)', padding: '12px', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
              <div>
                <div><strong>Airwaybill (Guía Única RN13):</strong> <code className="mono" style={{ fontSize: '15px', fontWeight: 800 }}>{datos.numero_guia}</code></div>
                <div><strong>Código Etiqueta CN23:</strong> <code className="mono">{datos.etiqueta_exportacion}</code></div>
                <div><strong>Operador Logístico:</strong> {datos.operador}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <StatusBadge estado={datos.estado} />
                <div className="mono" style={{ fontSize: '12px', marginTop: '6px' }}>
                  Estimada: {String(datos.fecha_estimada || '').substring(0, 10)}
                </div>
              </div>
            </div>

            <div className="form-grid">
              <div>
                <label>Destinatario Internacional</label>
                <div><strong>{datos.nombre_cliente}</strong></div>
                <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>ID Fiscal: {datos.datos_fiscales || 'N/A'}</div>
              </div>
              <div>
                <label>Destino Postal</label>
                <div>{datos.linea_direccion || ''}, {datos.ciudad}</div>
                <div className="mono" style={{ fontSize: '12px' }}>{datos.nombre_pais || datos.pais_destino} ({datos.pais_destino}) — CP {datos.codigo_postal || ''}</div>
              </div>
            </div>

            <div className="form-grid" style={{ backgroundColor: 'var(--color-bg)', padding: '10px', borderRadius: '8px' }}>
              <div><label>Peso Físico</label><div className="mono">{datos.peso_fisico_total || '—'} kg</div></div>
              <div><label>Peso Volumétrico</label><div className="mono">{datos.peso_volumetrico_total || '—'} kg</div></div>
              <div><label>Peso Tasable (RN07)</label><div className="mono"><strong>{datos.peso_tasable} kg</strong></div></div>
            </div>

            {datos.detalles?.length > 0 && (
              <div>
                <label>Declaración Aduanera de Contenido (Partidas HS - RN14)</label>
                <div className="table-wrap" style={{ marginTop: '6px' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>SKU</th>
                        <th>Descripción</th>
                        <th>Partida HS</th>
                        <th>Cant.</th>
                        <th>Peso u.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {datos.detalles.map((d: any, i: number) => (
                        <tr key={i}>
                          <td className="mono">{d.codigo}</td>
                          <td>{d.nombre_producto}</td>
                          <td className="mono"><strong>{d.codigo_arancelario}</strong></td>
                          <td className="mono">{d.cantidad}</td>
                          <td className="mono">{d.peso_kg} kg</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
