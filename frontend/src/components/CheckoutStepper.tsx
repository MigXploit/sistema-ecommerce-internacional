import React from 'react';
import { IdiomaCode, MonedaCode, TEXTOS } from '../i18n';
import { StatusBadge } from './StatusBadge';

export interface ItemCarrito {
  producto: any;
  cantidad: number;
}

interface CheckoutStepperProps {
  idioma: IdiomaCode;
  moneda: MonedaCode;
  carrito: ItemCarrito[];
  paso: 1 | 2 | 3 | 4;
  setPaso: (p: 1 | 2 | 3 | 4) => void;
  tipoVenta: 'MINORISTA' | 'MAYORISTA' | 'PROMOCIONAL';
  setTipoVenta: (tv: 'MINORISTA' | 'MAYORISTA' | 'PROMOCIONAL') => void;
  onCambiarCantidad: (idProducto: number, delta: number) => void;
  autenticadoComoCliente: boolean;
  direcciones: any[];
  idDireccionSel: number | null;
  setIdDireccionSel: (id: number) => void;
  paisCotizacion: string;
  setPaisCotizacion: (pais: string) => void;
  operadorSel: string;
  setOperadorSel: (op: string) => void;
  parametros: any;
  mostrarFormDir: boolean;
  setMostrarFormDir: (v: boolean) => void;
  nuevaDir: { pais: string; ciudad: string; lineaDireccion: string; codigoPostal: string };
  setNuevaDir: (d: { pais: string; ciudad: string; lineaDireccion: string; codigoPostal: string }) => void;
  onGuardarDireccion: (e: React.FormEvent) => void;
  onCotizarPaso3: () => void;
  cotizacion: any | null;
  onConfirmarPedidoPaso3: () => void;
  pedidoCreado: any | null;
  medioPago: 'TARJETA' | 'TRANSFERENCIA' | 'BILLETERA_DIGITAL';
  setMedioPago: (m: 'TARJETA' | 'TRANSFERENCIA' | 'BILLETERA_DIGITAL') => void;
  simularRechazo: boolean;
  setSimularRechazo: (v: boolean) => void;
  onEjecutarPagoPaso4: () => void;
  pagoConfirmado: any | null;
  onIrAMisPedidos: () => void;
}

export const CheckoutStepper: React.FC<CheckoutStepperProps> = ({
  idioma,
  moneda,
  carrito,
  paso,
  setPaso,
  tipoVenta,
  setTipoVenta,
  onCambiarCantidad,
  autenticadoComoCliente,
  direcciones,
  idDireccionSel,
  setIdDireccionSel,
  paisCotizacion,
  setPaisCotizacion,
  operadorSel,
  setOperadorSel,
  parametros,
  mostrarFormDir,
  setMostrarFormDir,
  nuevaDir,
  setNuevaDir,
  onGuardarDireccion,
  onCotizarPaso3,
  cotizacion,
  onConfirmarPedidoPaso3,
  pedidoCreado,
  medioPago,
  setMedioPago,
  simularRechazo,
  setSimularRechazo,
  onEjecutarPagoPaso4,
  pagoConfirmado,
  onIrAMisPedidos
}) => {
  const t = TEXTOS[idioma];
  const unidadesTotales = carrito.reduce((acc, it) => acc + it.cantidad, 0);
  const subtotalLocal = carrito.reduce(
    (acc, it) => acc + Number(it.producto.precioConvertido || 0) * it.cantidad,
    0
  );

  return (
    <aside className="card checkout-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h3 className="section-subtitle" style={{ margin: 0 }}>{t.carritoTitulo}</h3>
        <span className="mono" style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
          {unidadesTotales} uds • {moneda}
        </span>
      </div>

      {/* Barra de 4 pasos (RNF12) */}
      <div className="stepper-header">
        <div className={`stepper-node ${paso === 1 ? 'active' : paso > 1 ? 'done' : ''}`}>{t.paso1Corto}</div>
        <div className={`stepper-node ${paso === 2 ? 'active' : paso > 2 ? 'done' : ''}`}>{t.paso2Corto}</div>
        <div className={`stepper-node ${paso === 3 ? 'active' : paso > 3 ? 'done' : ''}`}>{t.paso3Corto}</div>
        <div className={`stepper-node ${paso === 4 ? 'active' : ''}`}>{t.paso4Corto}</div>
      </div>

      {/* Confirmación inmediata post-pago con acceso a factura y tracking (DESIGN.md §3.C Paso 4) */}
      {pagoConfirmado ? (
        <div style={{ display: 'grid', gap: '12px' }}>
          <div className="alert alert-ok" style={{ margin: 0 }}>
            <div>
              <strong>{t.pagoConfirmadoTitulo}</strong>
              <div className="mono" style={{ fontSize: '12px', marginTop: '4px' }}>
                Ref: {pagoConfirmado.referenciaPasarela} • Factura: {pagoConfirmado.factura?.numero}
              </div>
              <div className="mono" style={{ fontSize: '12px' }}>
                Cobrado: {pagoConfirmado.montoCobrado} {pagoConfirmado.moneda} (Equiv. Base: ${pagoConfirmado.equivalenteBaseUsd} USD)
              </div>
            </div>
          </div>
          <button className="btn btn-primary" onClick={onIrAMisPedidos}>
            📦 {t.verFacturaTracking} →
          </button>
        </div>
      ) : carrito.length === 0 && !pedidoCreado ? (
        <p style={{ color: 'var(--color-text-muted)', fontSize: '14px', margin: 0 }}>{t.carritoVacio}</p>
      ) : (
        <div>
          {/* PASO 1: CARRITO Y DETECCIÓN DE TIPO DE VENTA */}
          {paso === 1 && (
            <div style={{ display: 'grid', gap: '12px' }}>
              <div>
                {carrito.map((it) => (
                  <div
                    key={it.producto.id_producto}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '8px 0',
                      borderBottom: '1px solid var(--color-border)'
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '14px' }}>{it.producto.nombre_localizado}</div>
                      <div className="mono" style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                        {it.producto.codigo} • {it.producto.simboloMoneda} {Number(it.producto.precioConvertido).toFixed(2)} × {it.cantidad}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <button className="btn btn-sm btn-outline mono" onClick={() => onCambiarCantidad(it.producto.id_producto, -1)}>−</button>
                      <strong className="mono" style={{ minWidth: '22px', textAlign: 'center' }}>{it.cantidad}</strong>
                      <button className="btn btn-sm btn-outline mono" onClick={() => onCambiarCantidad(it.producto.id_producto, 1)}>+</button>
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <label>{t.tipoVentaLabel}</label>
                <select value={tipoVenta} onChange={(e) => setTipoVenta(e.target.value as any)}>
                  <option value="MINORISTA">MINORISTA (&lt; 10 uds)</option>
                  <option value="MAYORISTA">MAYORISTA (≥ 10 uds / Corporativo)</option>
                  <option value="PROMOCIONAL">PROMOCIONAL (Campaña Internacional)</option>
                </select>
                <small style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{t.tipoVentaAutoHint}</small>
              </div>

              <div className="fiscal-summary-box" style={{ marginTop: 0 }}>
                <div className="fiscal-row">
                  <span>{t.subtotal}:</span>
                  <strong className="mono">{subtotalLocal.toFixed(2)} {moneda}</strong>
                </div>
              </div>

              <button className="btn btn-primary" onClick={() => setPaso(2)}>
                {t.irPaso2}
              </button>
            </div>
          )}

          {/* PASO 2: DIRECCIÓN INTERNACIONAL Y OPERADOR */}
          {paso === 2 && (
            <div style={{ display: 'grid', gap: '12px' }}>
              {autenticadoComoCliente && direcciones.length > 0 ? (
                <div>
                  <label>{t.direccionRegistrada}</label>
                  <select
                    value={idDireccionSel || ''}
                    onChange={(e) => {
                      const id = Number(e.target.value);
                      setIdDireccionSel(id);
                      const found = direcciones.find((d) => d.id_direccion === id);
                      if (found) setPaisCotizacion(found.pais);
                    }}
                  >
                    {direcciones.map((d) => (
                      <option key={d.id_direccion} value={d.id_direccion}>
                        [{d.pais}] {d.ciudad} — {d.linea_direccion} (CP {d.codigo_postal})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline"
                    style={{ marginTop: '8px', width: '100%' }}
                    onClick={() => setMostrarFormDir(!mostrarFormDir)}
                  >
                    {t.agregarOtraDireccion}
                  </button>
                </div>
              ) : (
                <div>
                  <label>{t.paisCotizacion}</label>
                  <select value={paisCotizacion} onChange={(e) => setPaisCotizacion(e.target.value)}>
                    {parametros?.paises?.map((p: any) => (
                      <option key={p.codigo_pais} value={p.codigo_pais}>
                        {p.nombre} ({p.codigo_pais}) {!p.habilitado ? '— [RESTRINGIDO RN12]' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {mostrarFormDir && (
                <form
                  onSubmit={onGuardarDireccion}
                  style={{
                    backgroundColor: 'var(--color-bg)',
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1px solid var(--color-border)',
                    display: 'grid',
                    gap: '8px'
                  }}
                >
                  <select value={nuevaDir.pais} onChange={(e) => setNuevaDir({ ...nuevaDir, pais: e.target.value })}>
                    {parametros?.paises?.map((p: any) => (
                      <option key={p.codigo_pais} value={p.codigo_pais}>{p.nombre} ({p.codigo_pais})</option>
                    ))}
                  </select>
                  <input placeholder="Ciudad" required value={nuevaDir.ciudad} onChange={(e) => setNuevaDir({ ...nuevaDir, ciudad: e.target.value })} />
                  <input placeholder="Línea de dirección" required value={nuevaDir.lineaDireccion} onChange={(e) => setNuevaDir({ ...nuevaDir, lineaDireccion: e.target.value })} />
                  <input className="mono" placeholder="Código Postal (ej. 01000-000 BR, 33131 US)" required value={nuevaDir.codigoPostal} onChange={(e) => setNuevaDir({ ...nuevaDir, codigoPostal: e.target.value })} />
                  <button type="submit" className="btn btn-sm btn-accent">{t.guardarDireccion}</button>
                </form>
              )}

              <div>
                <label>{t.operadorLogistico}</label>
                <select value={operadorSel} onChange={(e) => setOperadorSel(e.target.value)}>
                  {parametros?.operadores?.map((op: any) => (
                    <option key={op.codigo} value={op.codigo}>
                      {op.nombre} ({op.dias_transito_estimados} días est.)
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                <button className="btn btn-outline" onClick={() => setPaso(1)}>{t.volver}</button>
                <button className="btn btn-primary" onClick={onCotizarPaso3}>{t.irPaso3}</button>
              </div>
            </div>
          )}

          {/* PASO 3: DESGLOSE OBLIGATORIO RN07 Y CONGELAMIENTO RN02 */}
          {paso === 3 && cotizacion && (
            <div style={{ display: 'grid', gap: '12px' }}>
              <div className="fiscal-summary-box" style={{ marginTop: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <strong>{cotizacion.nombrePais} ({cotizacion.paisDestino})</strong>
                  <StatusBadge estado="PENDIENTE" texto={cotizacion.tipoVentaAplicado} />
                </div>

                <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '8px' }}>
                  <div>{t.pesoTasableInfo}:</div>
                  <div className="mono">
                    Físico: {cotizacion.pesoFisicoTotalKg} kg | Volumétrico: {cotizacion.pesoVolumetricoTotalKg} kg →{' '}
                    <b>Tasable: {cotizacion.pesoTasableKg} kg</b>
                  </div>
                  <div className="mono">
                    Operador: {cotizacion.operadorCotizado} ({cotizacion.diasTransitoEstimados} días) • 1 USD = {cotizacion.tasaCongelada} {cotizacion.moneda}
                  </div>
                </div>

                <div className="fiscal-row">
                  <span>{t.subtotal}:</span>
                  <strong className="mono">{Number(cotizacion.subtotal).toFixed(2)} {cotizacion.moneda}</strong>
                </div>
                <div className="fiscal-row">
                  <span>{t.impuestos}:</span>
                  <strong className="mono">{Number(cotizacion.impuestos).toFixed(2)} {cotizacion.moneda}</strong>
                </div>
                <div className="fiscal-row">
                  <span>{t.envio}:</span>
                  <strong className="mono">{Number(cotizacion.costoEnvio).toFixed(2)} {cotizacion.moneda}</strong>
                </div>

                <div className="fiscal-total-row">
                  <span>{t.totalCongelado}:</span>
                  <span className="mono">{Number(cotizacion.total).toFixed(2)} {cotizacion.moneda}</span>
                </div>

                <div className="mono" style={{ textAlign: 'right', fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                  {t.equivalenteUsd}: ${Number(cotizacion.equivalenteUsd).toFixed(2)} USD
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                <button className="btn btn-outline" onClick={() => setPaso(2)}>{t.volver}</button>
                <button className="btn btn-accent" onClick={onConfirmarPedidoPaso3}>
                  {t.confirmarPedido}
                </button>
              </div>
            </div>
          )}

          {/* PASO 4: PAGO SEGURO PCI DSS (RN11) */}
          {paso === 4 && pedidoCreado && (
            <div style={{ display: 'grid', gap: '12px' }}>
              <div className="fiscal-summary-box" style={{ marginTop: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="mono" style={{ fontWeight: 700 }}>Pedido #{pedidoCreado.idPedido}</span>
                  <StatusBadge estado="CREADO" />
                </div>
                <div className="fiscal-total-row" style={{ marginTop: '8px' }}>
                  <span>{t.totalCongelado}:</span>
                  <span className="mono">
                    {Number(pedidoCreado.desglose.total).toFixed(2)} {pedidoCreado.desglose.moneda}
                  </span>
                </div>
              </div>

              <div>
                <label>Método de Pago Internacional (CU05)</label>
                <select value={medioPago} onChange={(e) => setMedioPago(e.target.value as any)}>
                  <option value="TARJETA">TARJETA INTERNACIONAL (Tokenizada PCI DSS)</option>
                  <option value="TRANSFERENCIA">TRANSFERENCIA BANCARIA SWIFT / ACH</option>
                  <option value="BILLETERA_DIGITAL">BILLETERA DIGITAL / PIX / PAYPAL</option>
                </select>
              </div>

              <div className="pci-shield-box">
                <span style={{ fontSize: '18px' }}>🛡️</span>
                <div>{t.insigniaPci}</div>
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: 'var(--color-text)' }}>
                <input
                  type="checkbox"
                  style={{ width: 'auto' }}
                  checked={simularRechazo}
                  onChange={(e) => setSimularRechazo(e.target.checked)}
                />
                <span>Simular rechazo de pasarela (Excepción CU05 4a: mantiene estado CREADO)</span>
              </label>

              <button className="btn btn-accent" onClick={onEjecutarPagoPaso4}>
                🔒 {t.pagarAhora} ({Number(pedidoCreado.desglose.total).toFixed(2)} {pedidoCreado.desglose.moneda})
              </button>
            </div>
          )}
        </div>
      )}
    </aside>
  );
};
