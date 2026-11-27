import React, { useEffect, useState } from 'react';
import { apiFetch, UsuarioSesion } from './api';
import { IdiomaCode, MonedaCode, TEXTOS } from './i18n';
import { ProductCard } from './components/ProductCard';
import { CheckoutStepper, ItemCarrito } from './components/CheckoutStepper';
import { ImmutableTag, StatusBadge } from './components/StatusBadge';
import { OperationalTable } from './components/OperationalTable';
import {
  modalConfirmarEnvioReclamo,
  modalConfirmarPagoCongelado,
  modalErrorValidacionOAduana,
  modalExitoReclamo,
  modalPagoAprobadoExito,
  toastExito,
  toastInfo
} from './utils/alerts';

interface Props {
  idioma: IdiomaCode;
  moneda: MonedaCode;
  token: string | null;
  usuario: UsuarioSesion | null;
  parametros: any;
  vista: 'CATALOGO' | 'MIS_PEDIDOS';
  onCambiarVista: (v: 'TIENDA' | 'MIS_PEDIDOS') => void;
  notificar: (tipo: 'ok' | 'err', msg: string) => void;
  pedirLogin: () => void;
}

const ETAPAS_ENVIO = ['PENDIENTE', 'EN_TRANSITO', 'EN_ADUANA', 'ENTREGADO'];

export const TiendaPortal: React.FC<Props> = ({
  idioma,
  moneda,
  token,
  usuario,
  parametros,
  vista,
  onCambiarVista,
  notificar,
  pedirLogin
}) => {
  const t = TEXTOS[idioma];
  const [productos, setProductos] = useState<any[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [categoria, setCategoria] = useState('TODAS');
  const [precioMax, setPrecioMax] = useState<string>('');
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);

  // Flujo de compra en máximo 4 pasos (RNF12)
  const [pasoCheckout, setPasoCheckout] = useState<1 | 2 | 3 | 4>(1);
  const [tipoVenta, setTipoVenta] = useState<'MINORISTA' | 'MAYORISTA' | 'PROMOCIONAL'>('MINORISTA');
  const [direcciones, setDirecciones] = useState<any[]>([]);
  const [idDireccionSel, setIdDireccionSel] = useState<number | null>(null);
  const [paisCotizacion, setPaisCotizacion] = useState<string>(usuario?.pais || 'BR');
  const [operadorSel, setOperadorSel] = useState<string>('COURIER_GLOBAL');
  const [cotizacion, setCotizacion] = useState<any | null>(null);
  const [pedidoCreado, setPedidoCreado] = useState<any | null>(null);
  const [pagoConfirmado, setPagoConfirmado] = useState<any | null>(null);
  const [medioPago, setMedioPago] = useState<'TARJETA' | 'TRANSFERENCIA' | 'BILLETERA_DIGITAL'>('TARJETA');
  const [simularRechazo, setSimularRechazo] = useState(false);

  // Formulario rápida nueva dirección
  const [mostrarFormDir, setMostrarFormDir] = useState(false);
  const [nuevaDir, setNuevaDir] = useState({ pais: 'BR', ciudad: '', lineaDireccion: '', codigoPostal: '' });

  // Mis pedidos y postventa
  const [misPedidos, setMisPedidos] = useState<any[]>([]);
  const [notificaciones, setNotificaciones] = useState<any[]>([]);
  const [devolucionModal, setDevolucionModal] = useState<any | null>(null);
  const [formDev, setFormDev] = useState({
    idProductoAfectado: 0,
    causalDevolucion: 'PRODUCTO_DEFECTUOSO',
    unidadesDefectuosas: 1,
    motivo: '',
    evidenciaRef: 'EVID-FOTO-CLIENTE-2026.jpg'
  });

  const cargarCatalogo = async () => {
    try {
      const qs = new URLSearchParams({
        idioma,
        moneda,
        ...(categoria !== 'TODAS' ? { categoria } : {}),
        ...(busqueda.trim() ? { q: busqueda.trim() } : {}),
        ...(precioMax.trim() && Number(precioMax) > 0 ? { precioMax: precioMax.trim() } : {}),
        ...(usuario?.pais ? { paisCliente: usuario.pais } : {})
      });
      const data = await apiFetch<any[]>(`/api/catalogo?${qs.toString()}`);
      setProductos(data);
    } catch (e: any) {
      notificar('err', e.message);
    }
  };

  useEffect(() => {
    if (vista === 'CATALOGO') {
      cargarCatalogo();
    }
  }, [idioma, moneda, categoria, vista]);

  // Al cambiar moneda o idioma, actualizar precios de los productos dentro del carrito sin perderlo (CU03)
  useEffect(() => {
    if (productos.length > 0 && carrito.length > 0) {
      setCarrito((prev) =>
        prev.map((item) => {
          const actualizado = productos.find((p) => p.id_producto === item.producto.id_producto);
          return actualizado ? { ...item, producto: actualizado } : item;
        })
      );
    }
  }, [productos]);

  // Detección automática de MAYORISTA a partir de 10 unidades (DESIGN.md §3.C Paso 1)
  useEffect(() => {
    const totalUds = carrito.reduce((acc, it) => acc + it.cantidad, 0);
    if (totalUds >= 10 && tipoVenta === 'MINORISTA') {
      setTipoVenta('MAYORISTA');
    } else if (totalUds > 0 && totalUds < 10 && tipoVenta === 'MAYORISTA') {
      setTipoVenta('MINORISTA');
    }
  }, [carrito]);

  useEffect(() => {
    if (token && usuario?.tipoCuenta === 'CLIENTE') {
      apiFetch<any[]>('/api/clientes/mis-direcciones', {}, token)
        .then((dirs) => {
          setDirecciones(dirs);
          if (dirs.length > 0) {
            setIdDireccionSel(dirs[0].id_direccion);
            setPaisCotizacion(dirs[0].pais);
          }
        })
        .catch(() => {});
      if (vista === 'MIS_PEDIDOS') {
        cargarMisPedidos();
      }
    }
  }, [token, usuario, vista]);

  const cargarMisPedidos = async () => {
    if (!token) return;
    try {
      const [peds, notifs] = await Promise.all([
        apiFetch<any[]>('/api/pedidos', {}, token),
        apiFetch<any[]>('/api/clientes/mis-notificaciones', {}, token)
      ]);
      setMisPedidos(peds);
      setNotificaciones(notifs);
    } catch (e: any) {
      notificar('err', e.message);
    }
  };

  const agregarAlCarrito = (prod: any) => {
    setPagoConfirmado(null);
    const existente = carrito.find((i) => i.producto.id_producto === prod.id_producto);
    const cantActual = existente ? existente.cantidad : 0;

    if (cantActual + 1 > prod.stock) {
      modalErrorValidacionOAduana({
        idioma,
        titulo: 'Stock Máximo Alcanzado (RN06)',
        mensaje: `RN06: No es posible agregar más unidades de ${prod.nombre_localizado}. Stock vendible disponible: ${prod.stock} uds.`,
        codigoRef: prod.codigo
      });
      return;
    }

    apiFetch(`/api/auth/demanda-producto/${prod.id_producto}?tipo=AGREGADO_CARRITO&idioma=${idioma}&moneda=${moneda}`, {
      method: 'POST'
    }).catch(() => {});

    setCarrito((prev) => {
      const idx = prev.findIndex((i) => i.producto.id_producto === prod.id_producto);
      if (idx >= 0) {
        const copia = [...prev];
        copia[idx] = { ...copia[idx], producto: prod, cantidad: copia[idx].cantidad + 1 };
        return copia;
      }
      return [...prev, { producto: prod, cantidad: 1 }];
    });

    // Toast rápido 3.5s (CU03 - DESIGN.md §5.1)
    toastExito(
      `${prod.nombre_localizado} ${t.toastCarritoAgregado}`,
      `${prod.codigo} • ${prod.simboloMoneda} ${Number(prod.precioConvertido).toFixed(2)} ${prod.moneda}`
    );
  };

  const cambiarCantidad = (idProd: number, delta: number) => {
    const target = carrito.find((i) => i.producto.id_producto === idProd);
    if (!target) return;

    const nueva = target.cantidad + delta;
    if (nueva > target.producto.stock) {
      modalErrorValidacionOAduana({
        idioma,
        titulo: 'Límite de Stock Vendible (RN06)',
        mensaje: `RN06: La cantidad solicitada supera el stock disponible (${target.producto.stock} uds).`,
        codigoRef: target.producto.codigo
      });
      return;
    }

    setCarrito((prev) =>
      prev
        .map((item) => (item.producto.id_producto === idProd ? { ...item, cantidad: nueva } : item))
        .filter((i) => i.cantidad > 0)
    );
    setCotizacion(null);

    if (nueva <= 0) {
      toastInfo(t.toastCarritoEliminado, target.producto.codigo);
    } else {
      toastInfo(`${t.toastCarritoActualizado}: ${nueva} uds`, target.producto.codigo);
    }
  };

  const cotizarPaso3 = async () => {
    try {
      const dirObj = direcciones.find((d) => d.id_direccion === idDireccionSel);
      const pais = dirObj ? dirObj.pais : paisCotizacion;
      const resp = await apiFetch('/api/pedidos/cotizar', {
        method: 'POST',
        body: JSON.stringify({
          idDireccion: idDireccionSel,
          codigoPaisDestino: pais,
          moneda,
          idiomaOperacion: idioma,
          tipoVenta,
          codigoOperador: operadorSel,
          items: carrito.map((c) => ({ idProducto: c.producto.id_producto, cantidad: c.cantidad }))
        })
      }, token);
      setCotizacion(resp);
      setPasoCheckout(3);
      toastInfo(
        `Cotización aduanera calculada (${resp.paisDestino})`,
        `Total: ${Number(resp.total).toFixed(2)} ${resp.moneda}`
      );
    } catch (e: any) {
      // Modal de restricción aduanera o validación (RN12 / RN06 - DESIGN.md §5.2)
      await modalErrorValidacionOAduana({
        idioma,
        mensaje: e.message,
        codigoRef: 'RN12 / CU04'
      });
    }
  };

  const confirmarPedidoPaso3 = async () => {
    if (!token || usuario?.tipoCuenta !== 'CLIENTE') {
      pedirLogin();
      return;
    }
    if (!idDireccionSel) {
      await modalErrorValidacionOAduana({
        idioma,
        mensaje: 'RN06: Seleccione o registre una dirección internacional de envío válida.',
        codigoRef: 'RN06'
      });
      return;
    }
    try {
      const resp = await apiFetch('/api/pedidos', {
        method: 'POST',
        body: JSON.stringify({
          idDireccion: idDireccionSel,
          moneda,
          idiomaOperacion: idioma,
          tipoVenta,
          codigoOperador: operadorSel,
          items: carrito.map((c) => ({ idProducto: c.producto.id_producto, cantidad: c.cantidad }))
        })
      }, token);
      setPedidoCreado(resp);
      setPasoCheckout(4);
      toastExito(
        `Pedido #${resp.idPedido} confirmado en estado CREADO`,
        `Congelado (RN02): ${Number(resp.desglose.total).toFixed(2)} ${resp.desglose.moneda}`
      );
    } catch (e: any) {
      await modalErrorValidacionOAduana({
        idioma,
        mensaje: e.message,
        codigoRef: 'RN06 / RN12'
      });
    }
  };

  const ejecutarPagoPaso4 = async () => {
    if (!pedidoCreado || !token) return;

    // Modal de Confirmación de Pago Congelado antes de cobrar (DESIGN.md §5.2 - CU05 / RN02)
    const confirmado = await modalConfirmarPagoCongelado({
      idioma,
      idPedido: pedidoCreado.idPedido,
      total: pedidoCreado.desglose.total,
      moneda: pedidoCreado.desglose.moneda,
      equivalenteUsd: pedidoCreado.desglose.equivalenteUsd,
      medioPago
    });
    if (!confirmado) return;

    try {
      const tokenSeguro = simularRechazo
        ? 'tok_rechazar_fondos_demo'
        : `tok_${medioPago.toLowerCase()}_${Date.now()}`;
      const resp = await apiFetch('/api/pagos/procesar', {
        method: 'POST',
        body: JSON.stringify({
          idPedido: pedidoCreado.idPedido,
          medioPago,
          tokenPago: tokenSeguro,
          claveIdempotencia: `IDEMP-${pedidoCreado.idPedido}-${simularRechazo ? 'REJ' : 'OK'}`
        })
      }, token);

      setPagoConfirmado(resp);
      setCarrito([]);
      setCotizacion(null);
      setPedidoCreado(null);
      setPasoCheckout(1);
      cargarCatalogo();

      // Modal con ícono animado de éxito mostrando referencia y factura (CU05 / CU09)
      await modalPagoAprobadoExito({
        idioma,
        referenciaPasarela: resp.referenciaPasarela,
        numeroFactura: resp.factura?.numero || 'EMITIDA',
        monto: resp.montoCobrado,
        moneda: resp.moneda,
        equivalenteUsd: resp.equivalenteBaseUsd
      });
    } catch (e: any) {
      // Modal con ícono animado de error en rechazo de pasarela (CU05 4a)
      await modalErrorValidacionOAduana({
        idioma,
        titulo: 'Cobro Internacional Rechazado (CU05 4a)',
        mensaje: e.message,
        codigoRef: e.payload?.referenciaPasarela || 'ESTADO: CREADO'
      });
    }
  };

  const guardarNuevaDireccion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    try {
      await apiFetch('/api/clientes/direcciones', {
        method: 'POST',
        body: JSON.stringify({ tipo: 'ENVIO', ...nuevaDir })
      }, token);
      const dirs = await apiFetch<any[]>('/api/clientes/mis-direcciones', {}, token);
      setDirecciones(dirs);
      if (dirs.length > 0) setIdDireccionSel(dirs[0].id_direccion);
      setMostrarFormDir(false);
      toastExito('Dirección internacional validada y registrada', `${nuevaDir.ciudad} (${nuevaDir.pais})`);
    } catch (err: any) {
      await modalErrorValidacionOAduana({
        idioma,
        mensaje: err.message,
        codigoRef: 'CU02 4b / RN12'
      });
    }
  };

  const abrirModalDevolucion = (ped: any) => {
    const primerItem = ped.detalles?.[0];
    setFormDev({
      idProductoAfectado: primerItem?.id_producto || 0,
      causalDevolucion: 'PRODUCTO_DEFECTUOSO',
      unidadesDefectuosas: 1,
      motivo: '',
      evidenciaRef: 'EVID-FOTO-CLIENTE-2026.jpg'
    });
    setDevolucionModal(ped);
  };

  const enviarSolicitudDevolucion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!devolucionModal || !token) return;

    const ok = await modalConfirmarEnvioReclamo({
      idioma,
      idPedido: devolucionModal.id_pedido,
      causal: formDev.causalDevolucion,
      unidades: Number(formDev.unidadesDefectuosas),
      evidenciaRef: formDev.evidenciaRef
    });
    if (!ok) return;

    try {
      const resp = await apiFetch('/api/postventa/solicitar-devolucion', {
        method: 'POST',
        body: JSON.stringify({
          idPedido: devolucionModal.id_pedido,
          idProductoAfectado: formDev.idProductoAfectado || devolucionModal.detalles?.[0]?.id_producto || null,
          unidadesDefectuosas: Number(formDev.unidadesDefectuosas),
          montoSolicitado: devolucionModal.total,
          causalDevolucion: formDev.causalDevolucion,
          motivo: formDev.motivo,
          evidenciaRef: formDev.evidenciaRef
        })
      }, token);
      setDevolucionModal(null);
      cargarMisPedidos();
      await modalExitoReclamo(idioma, resp.idReembolso, resp.mensaje);
    } catch (err: any) {
      await modalErrorValidacionOAduana({
        idioma,
        mensaje: err.message,
        codigoRef: 'RN19 / CU11'
      });
    }
  };

  // Validación previa del modal de devolución (DESIGN.md §3.D / RN19)
  const reclamoListoParaEnviar =
    formDev.motivo.trim().length >= 5 &&
    (formDev.causalDevolucion !== 'PRODUCTO_DEFECTUOSO' || formDev.evidenciaRef.trim().length > 0);

  if (vista === 'MIS_PEDIDOS') {
    if (!token || usuario?.tipoCuenta !== 'CLIENTE') {
      return (
        <div className="card">
          <h2 className="view-title" style={{ marginBottom: '8px' }}>{t.misPedidos}</h2>
          <p style={{ color: 'var(--color-text-muted)' }}>
            Seleccione un cliente internacional en la barra superior (por ejemplo, <b>Carla Santos</b> de Brasil o <b>Sofía García</b> de España) o inicie sesión para consultar sus pedidos, seguimiento aduanero, facturas inmutables y canal de devoluciones.
          </p>
          <button className="btn btn-primary" onClick={pedirLogin}>{t.iniciarSesion}</button>
        </div>
      );
    }

    return (
      <div>
        <div className="view-header">
          <div>
            <h1 className="view-title">{t.misPedidos} — {usuario.nombre} ({usuario.pais})</h1>
            <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
              ID Fiscal: <code className="mono">{usuario.datosFiscales}</code> • {t.misPedidosSub}
            </div>
          </div>
          <button className="btn btn-outline" onClick={cargarMisPedidos}>{t.actualizarEstado}</button>
        </div>

        {misPedidos.map((ped) => {
          let eventos: any[] = [];
          try {
            eventos = ped.envio?.eventos_tracking ? JSON.parse(ped.envio.eventos_tracking) : [];
          } catch {
            eventos = [];
          }
          const estadoEnvio = ped.envio?.estado || 'PENDIENTE';
          const idxActual = ETAPAS_ENVIO.indexOf(estadoEnvio);

          return (
            <div className="card" key={ped.id_pedido}>
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <strong className="mono" style={{ fontSize: '16px' }}>Pedido #{ped.id_pedido}</strong>
                  <StatusBadge estado={ped.estado} />
                  <StatusBadge estado="PENDIENTE" texto={ped.tipo_venta} />
                  <span className="mono" style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                    Idioma: {ped.idioma_operacion} • Tasa congelada: {ped.tasa_aplicada}
                  </span>
                </div>
                <div className="mono" style={{ fontSize: '16px', fontWeight: 800, color: 'var(--color-brand)' }}>
                  {t.totalCongelado}: {Number(ped.total).toFixed(2)} {ped.moneda}
                  <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--color-text-muted)' }}>
                    Subtotal: {ped.subtotal} | Impuestos: {ped.impuestos} | Envío: {ped.costo_envio}
                  </div>
                </div>
              </div>

              <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '12px' }}>
                <strong>Destino:</strong> {ped.linea_direccion}, {ped.ciudad} ({ped.pais_destino}) — CP <code className="mono">{ped.codigo_postal}</code> |{' '}
                <strong>Peso tasable:</strong> <code className="mono">{ped.peso_tasable} kg</code>
              </div>

              {ped.detalles?.length > 0 && (
                <div style={{ marginBottom: '16px', fontSize: '13px' }}>
                  <strong>Ítems:</strong>{' '}
                  {ped.detalles.map((d: any) => (
                    <span key={d.id_detalle} className="mono" style={{ marginRight: '12px' }}>
                      {d.cantidad}× {d.nombre_producto} [HS {d.codigo_arancelario}] ({d.precio_unitario} {ped.moneda})
                    </span>
                  ))}
                </div>
              )}

              <div className="form-grid">
                {/* LÍNEA DE TIEMPO VISUAL HORIZONTAL + VERTICAL (DESIGN.md §3.D) */}
                <div style={{ backgroundColor: 'var(--color-bg)', padding: '16px', borderRadius: '12px', border: '1px solid var(--color-border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                    <strong>{t.seguimientoTitulo}</strong>
                    {ped.envio && <StatusBadge estado={ped.envio.estado} />}
                  </div>

                  {ped.envio ? (
                    <div style={{ marginTop: '8px' }}>
                      <div className="mono" style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                        Guía: <b>{ped.envio.numero_guia}</b> • Operador: {ped.envio.operador}
                      </div>

                      <div className="tracking-steps-bar">
                        {ETAPAS_ENVIO.map((etapa, i) => {
                          let cls = '';
                          if (estadoEnvio === 'DEVUELTO') {
                            cls = 'returned';
                          } else if (etapa === estadoEnvio) {
                            cls = 'current';
                          } else if (idxActual > i || estadoEnvio === 'ENTREGADO') {
                            cls = 'reached';
                          }
                          return (
                            <div key={etapa} className={`tracking-stage ${cls}`}>
                              {etapa}
                            </div>
                          );
                        })}
                      </div>

                      <div style={{ marginTop: '8px' }}>
                        {eventos.map((ev, i) => (
                          <div className="timeline-item" key={i}>
                            <strong className="mono">{ev.estado}</strong> <span className="mono">({ev.fecha})</span>: {ev.detalle}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', margin: '8px 0 0' }}>
                      Pedido pagado en cola de despacho logístico para generación de guía internacional.
                    </p>
                  )}
                </div>

                {/* DOCUMENTOS TRIBUTARIOS INMUTABLES Y POSTVENTA */}
                <div style={{ backgroundColor: 'var(--color-bg)', padding: '16px', borderRadius: '12px', border: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div>
                    <strong>{t.documentosTitulo}</strong>
                    {ped.facturas?.length > 0 ? (
                      <div style={{ display: 'grid', gap: '8px', marginTop: '10px' }}>
                        {ped.facturas.map((f: any) => (
                          <div
                            key={f.id_factura}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              flexWrap: 'wrap',
                              gap: '8px',
                              backgroundColor: 'var(--color-surface)',
                              padding: '8px 12px',
                              borderRadius: '8px',
                              border: '1px solid var(--color-border)'
                            }}
                          >
                            <div>
                              <StatusBadge estado={f.tipo_documento} />{' '}
                              <code className="mono" style={{ fontWeight: 700 }}>{f.numero}</code>
                              <div className="mono" style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                                Total: {Number(f.total).toFixed(2)} {f.moneda}
                              </div>
                            </div>
                            <ImmutableTag label={t.inmutableLabel} />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Pendiente de pago.</p>
                    )}
                  </div>

                  {ped.reembolsos?.length > 0 && (
                    <div style={{ marginTop: '12px', borderTop: '1px dashed var(--color-border-strong)', paddingTop: '10px' }}>
                      <strong style={{ fontSize: '12px' }}>Solicitudes de Devolución / Reembolso (CU11 / CU06):</strong>
                      {ped.reembolsos.map((r: any) => (
                        <div
                          key={r.id_reembolso}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginTop: '6px',
                            fontSize: '12px'
                          }}
                        >
                          <span className="mono">
                            #{r.id_reembolso} • {r.causal_devolucion} ({Number(r.monto).toFixed(2)} {ped.moneda})
                          </span>
                          <StatusBadge estado={r.estado} />
                        </div>
                      ))}
                    </div>
                  )}

                  {ped.estado === 'ENTREGADO' && (!ped.reembolsos || ped.reembolsos.length === 0) && (
                    <div style={{ marginTop: '16px' }}>
                      <button className="btn btn-amber" style={{ width: '100%' }} onClick={() => abrirModalDevolucion(ped)}>
                        ⚠️ {t.reportarDefectoBtn}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {notificaciones.length > 0 && (
          <OperationalTable
            titulo={t.notificacionesTitulo}
            columnas={[
              { key: 'idioma', titulo: 'Idioma', render: (n) => <StatusBadge estado="APROBADO" texto={n.idioma} /> },
              { key: 'evento', titulo: 'Hito', mono: true },
              { key: 'asunto', titulo: 'Asunto', render: (n) => <strong>{n.asunto}</strong> },
              { key: 'cuerpo', titulo: 'Mensaje Localizado' }
            ]}
            datos={notificaciones}
          />
        )}

        {/* MODAL GUIADO DE DEVOLUCIÓN POR PRODUCTO DEFECTUOSO (DESIGN.md §3.D / RN19) */}
        {devolucionModal && (
          <div className="modal-backdrop">
            <div className="modal-box">
              <h3 className="section-subtitle">{t.modalDevolucionTitulo} — Pedido #{devolucionModal.id_pedido}</h3>
              <div className="alert alert-err" style={{ fontSize: '12px' }}>
                <span>{t.modalDevolucionAviso}</span>
              </div>
              <form onSubmit={enviarSolicitudDevolucion} style={{ display: 'grid', gap: '12px' }}>
                <div>
                  <label>{t.itemAfectadoLabel}</label>
                  <select
                    value={formDev.idProductoAfectado}
                    onChange={(e) => setFormDev({ ...formDev, idProductoAfectado: Number(e.target.value) })}
                  >
                    {devolucionModal.detalles?.map((d: any) => (
                      <option key={d.id_producto} value={d.id_producto}>
                        {d.nombre_producto} (SKU: {d.codigo} — Cant: {d.cantidad})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-grid">
                  <div>
                    <label>{t.causalLabel}</label>
                    <select
                      value={formDev.causalDevolucion}
                      onChange={(e) => setFormDev({ ...formDev, causalDevolucion: e.target.value })}
                    >
                      <option value="PRODUCTO_DEFECTUOSO">PRODUCTO_DEFECTUOSO</option>
                      <option value="DANO_TRANSPORTE">DANO_TRANSPORTE</option>
                      <option value="ERROR_ENVIO">ERROR_ENVIO</option>
                    </select>
                  </div>
                  <div>
                    <label>{t.unidadesLabel}</label>
                    <input
                      type="number"
                      min={1}
                      className="mono"
                      value={formDev.unidadesDefectuosas}
                      onChange={(e) => setFormDev({ ...formDev, unidadesDefectuosas: Number(e.target.value) })}
                    />
                  </div>
                </div>
                <div>
                  <label>{t.evidenciaLabel}</label>
                  <input
                    className="mono"
                    value={formDev.evidenciaRef}
                    placeholder="Ej. EVID-FOTO-DEFECTO-01.jpg"
                    onChange={(e) => setFormDev({ ...formDev, evidenciaRef: e.target.value })}
                  />
                </div>
                <div>
                  <label>{t.motivoLabel}</label>
                  <textarea
                    rows={3}
                    required
                    value={formDev.motivo}
                    placeholder="Describa el defecto físico comprobable (mín. 5 caracteres)..."
                    onChange={(e) => setFormDev({ ...formDev, motivo: e.target.value })}
                  />
                </div>
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button type="button" className="btn btn-outline" onClick={() => setDevolucionModal(null)}>
                    {t.cancelar}
                  </button>
                  <button type="submit" className="btn btn-amber" disabled={!reclamoListoParaEnviar}>
                    {t.enviarReclamo}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  const categoriasUnicas = ['TODAS', ...Array.from(new Set(productos.map((p) => p.categoria)))];

  return (
    <div className="store-layout">
      {/* CATÁLOGO LOCALIZADO Y MULTIMONEDA CON FILTROS (DESIGN.md §3.B) */}
      <div>
        <div className="card card-compact">
          <div className="filter-toolbar">
            <div>
              <label>{t.buscarPlaceholder}</label>
              <input
                value={busqueda}
                placeholder={t.buscarPlaceholder}
                onChange={(e) => setBusqueda(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && cargarCatalogo()}
              />
            </div>
            <div>
              <label>{t.categoriaLabel}</label>
              <select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
                {categoriasUnicas.map((c) => (
                  <option key={c} value={c}>{c === 'TODAS' ? t.todasCategorias : c}</option>
                ))}
              </select>
            </div>
            <div>
              <label>{t.precioMaxLabel} ({moneda})</label>
              <input
                type="number"
                className="mono"
                placeholder={t.sinLimite}
                value={precioMax}
                onChange={(e) => setPrecioMax(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && cargarCatalogo()}
              />
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button className="btn btn-primary" onClick={cargarCatalogo}>{t.buscarBtn}</button>
              {(busqueda || categoria !== 'TODAS' || precioMax) && (
                <button
                  className="btn btn-outline"
                  onClick={() => {
                    setBusqueda('');
                    setCategoria('TODAS');
                    setPrecioMax('');
                    setTimeout(cargarCatalogo, 0);
                  }}
                >
                  {t.limpiarFiltros}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="grid-products">
          {productos.map((p) => (
            <ProductCard
              key={p.id_producto}
              producto={p}
              idioma={idioma}
              onAgregar={agregarAlCarrito}
            />
          ))}
        </div>
      </div>

      {/* STEPPER DE CHECKOUT EN 4 PASOS CON DESGLOSE FISCAL STICKY (DESIGN.md §3.C) */}
      <CheckoutStepper
        idioma={idioma}
        moneda={moneda}
        carrito={carrito}
        paso={pasoCheckout}
        setPaso={setPasoCheckout}
        tipoVenta={tipoVenta}
        setTipoVenta={setTipoVenta}
        onCambiarCantidad={cambiarCantidad}
        autenticadoComoCliente={Boolean(token && usuario?.tipoCuenta === 'CLIENTE')}
        direcciones={direcciones}
        idDireccionSel={idDireccionSel}
        setIdDireccionSel={setIdDireccionSel}
        paisCotizacion={paisCotizacion}
        setPaisCotizacion={setPaisCotizacion}
        operadorSel={operadorSel}
        setOperadorSel={setOperadorSel}
        parametros={parametros}
        mostrarFormDir={mostrarFormDir}
        setMostrarFormDir={setMostrarFormDir}
        nuevaDir={nuevaDir}
        setNuevaDir={setNuevaDir}
        onGuardarDireccion={guardarNuevaDireccion}
        onCotizarPaso3={cotizarPaso3}
        cotizacion={cotizacion}
        onConfirmarPedidoPaso3={confirmarPedidoPaso3}
        pedidoCreado={pedidoCreado}
        medioPago={medioPago}
        setMedioPago={setMedioPago}
        simularRechazo={simularRechazo}
        setSimularRechazo={setSimularRechazo}
        onEjecutarPagoPaso4={ejecutarPagoPaso4}
        pagoConfirmado={pagoConfirmado}
        onIrAMisPedidos={() => {
          setPagoConfirmado(null);
          onCambiarVista('MIS_PEDIDOS');
        }}
      />
    </div>
  );
};
