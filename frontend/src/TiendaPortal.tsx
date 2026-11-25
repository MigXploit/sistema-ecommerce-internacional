import React, { useEffect, useState } from 'react';
import { apiFetch, UsuarioSesion } from './api';
import { IdiomaCode, MonedaCode, TEXTOS } from './i18n';

interface Props {
  idioma: IdiomaCode;
  moneda: MonedaCode;
  token: string | null;
  usuario: UsuarioSesion | null;
  parametros: any;
  vista: 'CATALOGO' | 'MIS_PEDIDOS';
  notificar: (tipo: 'ok' | 'err', msg: string) => void;
  pedirLogin: () => void;
}

interface ItemCarrito {
  producto: any;
  cantidad: number;
}

export const TiendaPortal: React.FC<Props> = ({
  idioma,
  moneda,
  token,
  usuario,
  parametros,
  vista,
  notificar,
  pedirLogin
}) => {
  const t = TEXTOS[idioma];
  const [productos, setProductos] = useState<any[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [categoria, setCategoria] = useState('TODAS');
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
        ...(usuario?.pais ? { paisCliente: usuario.pais } : {})
      });
      const data = await apiFetch<any[]>(`/api/catalogo?${qs.toString()}`);
      setProductos(data);
    } catch (e: any) {
      notificar('err', e.message);
    }
  };

  useEffect(() => {
    cargarCatalogo();
  }, [idioma, moneda, categoria]);

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
    setCarrito((prev) => {
      const idx = prev.findIndex((i) => i.producto.id_producto === prod.id_producto);
      const actual = idx >= 0 ? prev[idx].cantidad : 0;
      if (actual + 1 > prod.stock) {
        notificar('err', `RN06: Stock máximo disponible alcanzado (${prod.stock} uds).`);
        return prev;
      }
      apiFetch(`/api/auth/demanda-producto/${prod.id_producto}?tipo=AGREGADO_CARRITO&idioma=${idioma}&moneda=${moneda}`, {
        method: 'POST'
      }).catch(() => {});
      if (idx >= 0) {
        const copia = [...prev];
        copia[idx] = { ...copia[idx], producto: prod, cantidad: actual + 1 };
        return copia;
      }
      return [...prev, { producto: prod, cantidad: 1 }];
    });
  };

  const cambiarCantidad = (idProd: number, delta: number) => {
    setCarrito((prev) =>
      prev
        .map((item) => {
          if (item.producto.id_producto !== idProd) return item;
          const nueva = item.cantidad + delta;
          if (nueva > item.producto.stock) {
            notificar('err', `RN06: No puede superar el stock disponible (${item.producto.stock}).`);
            return item;
          }
          return { ...item, cantidad: nueva };
        })
        .filter((i) => i.cantidad > 0)
    );
    setCotizacion(null);
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
    } catch (e: any) {
      notificar('err', e.message);
    }
  };

  const confirmarPedidoPaso3 = async () => {
    if (!token || usuario?.tipoCuenta !== 'CLIENTE') {
      pedirLogin();
      return;
    }
    if (!idDireccionSel) {
      notificar('err', 'RN06: Seleccione o registre una dirección internacional de envío.');
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
      notificar('ok', resp.mensaje);
    } catch (e: any) {
      notificar('err', e.message);
    }
  };

  const ejecutarPagoPaso4 = async () => {
    if (!pedidoCreado || !token) return;
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
      notificar('ok', resp.mensaje);
      setCarrito([]);
      setCotizacion(null);
      setPedidoCreado(null);
      setPasoCheckout(1);
      cargarCatalogo();
    } catch (e: any) {
      notificar('err', e.message);
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
      notificar('ok', 'Dirección postal validada y guardada.');
    } catch (err: any) {
      notificar('err', err.message);
    }
  };

  const enviarSolicitudDevolucion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!devolucionModal || !token) return;
    try {
      const primerItem = devolucionModal.detalles?.[0];
      const resp = await apiFetch('/api/postventa/solicitar-devolucion', {
        method: 'POST',
        body: JSON.stringify({
          idPedido: devolucionModal.id_pedido,
          idProductoAfectado: primerItem?.id_producto || null,
          unidadesDefectuosas: Number(formDev.unidadesDefectuosas),
          montoSolicitado: devolucionModal.total,
          causalDevolucion: formDev.causalDevolucion,
          motivo: formDev.motivo,
          evidenciaRef: formDev.evidenciaRef
        })
      }, token);
      notificar('ok', resp.mensaje);
      setDevolucionModal(null);
      cargarMisPedidos();
    } catch (err: any) {
      notificar('err', err.message);
    }
  };

  if (vista === 'MIS_PEDIDOS') {
    if (!token || usuario?.tipoCuenta !== 'CLIENTE') {
      return (
        <div className="card">
          <h3>{t.misPedidos}</h3>
          <p>Inicie sesión como cliente internacional (por ejemplo, <b>Carla Santos</b> de Brasil o <b>Sofía García</b> de España) para ver sus pedidos, seguimiento aduanero, facturas y postventa.</p>
          <button className="btn btn-primary" onClick={pedirLogin}>{t.iniciarSesion}</button>
        </div>
      );
    }

    return (
      <div>
        <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: 0 }}>{t.misPedidos} — {usuario.nombre} ({usuario.pais})</h3>
            <small style={{ color: '#64748b' }}>ID Fiscal: {usuario.datosFiscales} • Seguimiento internacional 24×7 y canal formal de devoluciones (CU08 / CU11)</small>
          </div>
          <button className="btn btn-outline" onClick={cargarMisPedidos}>Actualizar estado</button>
        </div>

        {misPedidos.map((ped) => {
          let eventos: any[] = [];
          try {
            eventos = ped.envio?.eventos_tracking ? JSON.parse(ped.envio.eventos_tracking) : [];
          } catch {
            eventos = [];
          }
          return (
            <div className="card" key={ped.id_pedido}>
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.6rem' }}>
                <div>
                  <strong>Pedido #{ped.id_pedido}</strong> • <span className="badge badge-blue">{ped.estado}</span>{' '}
                  <span className="badge badge-purple">{ped.tipo_venta}</span>{' '}
                  <span className="badge badge-amber">Idioma: {ped.idioma_operacion}</span>
                </div>
                <div>
                  <strong>Total congelado: {ped.total} {ped.moneda}</strong> (Subtotal: {ped.subtotal} | Impuestos: {ped.impuestos} | Envío: {ped.costo_envio})
                </div>
              </div>

              <div style={{ fontSize: '0.83rem', color: '#475569', marginBottom: '0.6rem' }}>
                <strong>Destino:</strong> {ped.linea_direccion}, {ped.ciudad} ({ped.pais_destino}) — CP {ped.codigo_postal} |{' '}
                <strong>Peso tasable:</strong> {ped.peso_tasable} kg
              </div>

              {ped.detalles?.length > 0 && (
                <div style={{ marginBottom: '0.65rem', fontSize: '0.83rem' }}>
                  <strong>Ítems:</strong>{' '}
                  {ped.detalles.map((d: any) => `${d.cantidad}x ${d.nombre_producto} [HS ${d.codigo_arancelario}] (${d.precio_unitario} ${ped.moneda})`).join(' • ')}
                </div>
              )}

              <div className="form-grid" style={{ marginTop: '0.5rem' }}>
                <div style={{ background: '#f8fafc', padding: '0.65rem', borderRadius: '0.5rem' }}>
                  <strong>Seguimiento Logístico y Aduana (CU08)</strong>
                  {ped.envio ? (
                    <div style={{ marginTop: '0.4rem' }}>
                      <div>Guía única: <code>{ped.envio.numero_guia}</code> ({ped.envio.operador}) — <span className="badge badge-green">{ped.envio.estado}</span></div>
                      <div style={{ marginTop: '0.45rem' }}>
                        {eventos.map((ev, i) => (
                          <div className="timeline-item" key={i}>
                            <strong>{ev.estado}</strong> ({ev.fecha}): {ev.detalle}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0.3rem 0 0' }}>En cola de despacho logístico.</p>
                  )}
                </div>

                <div style={{ background: '#f8fafc', padding: '0.65rem', borderRadius: '0.5rem' }}>
                  <strong>Documentos Tributarios Inmutables (CU09)</strong>
                  {ped.facturas?.length > 0 ? (
                    ped.facturas.map((f: any) => (
                      <div key={f.id_factura} style={{ fontSize: '0.82rem', marginTop: '0.35rem' }}>
                        <span className={f.tipo_documento === 'NOTA_CREDITO' ? 'badge badge-amber' : 'badge badge-green'}>
                          {f.tipo_documento}
                        </span>{' '}
                        <code>{f.numero}</code> — {f.total} {f.moneda} ({f.estado})
                      </div>
                    ))
                  ) : (
                    <p style={{ fontSize: '0.8rem', color: '#64748b' }}>Pendiente de pago.</p>
                  )}

                  {ped.estado === 'ENTREGADO' && (
                    <div style={{ marginTop: '0.65rem' }}>
                      <button className="btn btn-amber" onClick={() => setDevolucionModal(ped)}>
                        Reportar Producto Defectuoso / Devolución (CU11)
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {notificaciones.length > 0 && (
          <div className="card">
            <h4 style={{ marginTop: 0 }}>Bandeja de Notificaciones Automáticas en Idioma del Cliente (CU10 / RF18)</h4>
            <table>
              <thead>
                <tr>
                  <th>Idioma</th>
                  <th>Evento</th>
                  <th>Asunto</th>
                  <th>Mensaje</th>
                </tr>
              </thead>
              <tbody>
                {notificaciones.map((n) => (
                  <tr key={n.id_notificacion}>
                    <td><span className="badge badge-blue">{n.idioma}</span></td>
                    <td>{n.evento}</td>
                    <td><strong>{n.asunto}</strong></td>
                    <td>{n.cuerpo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {devolucionModal && (
          <div className="modal-backdrop">
            <div className="modal-box">
              <h3 style={{ marginTop: 0 }}>Solicitar Devolución Postventa — Pedido #{devolucionModal.id_pedido}</h3>
              <p style={{ fontSize: '0.83rem', color: '#475569' }}>
                RN19: Los reclamos por <code>PRODUCTO_DEFECTUOSO</code> exigen adjuntar referencia de evidencia para inspección de calidad y aislamiento de stock.
              </p>
              <form onSubmit={enviarSolicitudDevolucion} style={{ display: 'grid', gap: '0.7rem' }}>
                <div>
                  <label>Causal tipificada (RF19)</label>
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
                  <label>Unidades afectadas</label>
                  <input
                    type="number"
                    min={1}
                    value={formDev.unidadesDefectuosas}
                    onChange={(e) => setFormDev({ ...formDev, unidadesDefectuosas: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label>Evidencia fotográfica / informe técnico (deje vacío para probar bloqueo RN19)</label>
                  <input
                    value={formDev.evidenciaRef}
                    placeholder="Ej. EVID-FOTO-DEFECTO-01.jpg"
                    onChange={(e) => setFormDev({ ...formDev, evidenciaRef: e.target.value })}
                  />
                </div>
                <div>
                  <label>Descripción detallada del defecto</label>
                  <textarea
                    rows={3}
                    required
                    value={formDev.motivo}
                    placeholder="Describa el daño o defecto comprobable..."
                    onChange={(e) => setFormDev({ ...formDev, motivo: e.target.value })}
                  />
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                  <button type="button" className="btn btn-outline" onClick={() => setDevolucionModal(null)}>Cancelar</button>
                  <button type="submit" className="btn btn-amber">Enviar Solicitud a Inspección</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  const categoriasUnicas = ['TODAS', ...Array.from(new Set(productos.map((p) => p.categoria)))];
  const subtotalLocal = carrito.reduce(
    (acc, it) => acc + Number(it.producto.precioConvertido || 0) * it.cantidad,
    0
  );

  return (
    <div className="split-layout">
      {/* CATÁLOGO LOCALIZADO Y MULTIMONEDA */}
      <div>
        <div className="card">
          <div className="form-grid" style={{ alignItems: 'end' }}>
            <div>
              <label>{t.buscarPlaceholder}</label>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <input
                  value={busqueda}
                  placeholder={t.buscarPlaceholder}
                  onChange={(e) => setBusqueda(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && cargarCatalogo()}
                />
                <button className="btn btn-primary" onClick={cargarCatalogo}>Buscar</button>
              </div>
            </div>
            <div>
              <label>Categoría</label>
              <select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
                {categoriasUnicas.map((c) => (
                  <option key={c} value={c}>{c === 'TODAS' ? t.todasCategorias : c}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="grid-products">
          {productos.map((p) => (
            <div className="product-card" key={p.id_producto}>
              <img className="product-img" src={p.imagen_url} alt={p.nombre_localizado} />
              <div className="product-body">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="badge badge-blue">{p.categoria}</span>
                  <small style={{ color: '#64748b' }}>SKU: <code>{p.codigo}</code></small>
                </div>
                <strong style={{ fontSize: '1rem' }}>{p.nombre_localizado}</strong>
                <p style={{ margin: 0, fontSize: '0.81rem', color: '#475569', flex: 1 }}>
                  {p.descripcion_localizada}
                </p>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  {t.codigoHs}: <b>{p.codigo_arancelario}</b> • {t.pesoDim}: {p.peso_kg} kg ({p.dimensiones} cm → Vol: {p.pesoVolumetricoKg} kg)
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.4rem' }}>
                  <div>
                    <div className="price-tag">
                      {p.simboloMoneda} {Number(p.precioConvertido).toFixed(2)} <small style={{ fontSize: '0.72rem' }}>{p.moneda}</small>
                    </div>
                    <small style={{ color: '#059669', fontWeight: 600 }}>{t.stockDisponible}: {p.stock}</small>
                  </div>
                  <button className="btn btn-primary" onClick={() => agregarAlCarrito(p)}>
                    + {t.agregarCarrito}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CARRITO Y FLUJO DE COMPRA INTERNACIONAL EN 4 PASOS (RNF12) */}
      <div className="card" style={{ position: 'sticky', top: '1rem' }}>
        <h3 style={{ marginTop: 0, marginBottom: '0.6rem' }}>{t.carritoTitulo}</h3>
        <div className="steps-bar">
          <div className={`step-pill ${pasoCheckout === 1 ? 'active' : ''}`}>{t.paso1}</div>
          <div className={`step-pill ${pasoCheckout === 2 ? 'active' : ''}`}>{t.paso2}</div>
          <div className={`step-pill ${pasoCheckout === 3 ? 'active' : ''}`}>{t.paso3}</div>
          <div className={`step-pill ${pasoCheckout === 4 ? 'active' : ''}`}>{t.paso4}</div>
        </div>

        {carrito.length === 0 && !pedidoCreado ? (
          <p style={{ color: '#64748b', fontSize: '0.88rem' }}>{t.carritoVacio}</p>
        ) : (
          <div>
            {pasoCheckout === 1 && (
              <div>
                {carrito.map((it) => (
                  <div
                    key={it.producto.id_producto}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.45rem 0', borderBottom: '1px solid #e2e8f0' }}
                  >
                    <div style={{ fontSize: '0.84rem' }}>
                      <strong>{it.producto.nombre_localizado}</strong>
                      <div style={{ color: '#64748b' }}>
                        {it.producto.simboloMoneda} {Number(it.producto.precioConvertido).toFixed(2)} × {it.cantidad}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                      <button className="btn btn-outline" onClick={() => cambiarCantidad(it.producto.id_producto, -1)}>-</button>
                      <strong>{it.cantidad}</strong>
                      <button className="btn btn-outline" onClick={() => cambiarCantidad(it.producto.id_producto, 1)}>+</button>
                    </div>
                  </div>
                ))}

                <div style={{ marginTop: '0.75rem' }}>
                  <label>Clasificación Tipo de Venta (RF08)</label>
                  <select value={tipoVenta} onChange={(e) => setTipoVenta(e.target.value as any)}>
                    <option value="MINORISTA">MINORISTA (Venta estándar)</option>
                    <option value="MAYORISTA">MAYORISTA (Exportación corporativa)</option>
                    <option value="PROMOCIONAL">PROMOCIONAL (Campaña global)</option>
                  </select>
                </div>

                <div style={{ marginTop: '0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong>{t.subtotal}: {subtotalLocal.toFixed(2)} {moneda}</strong>
                  <button className="btn btn-primary" onClick={() => setPasoCheckout(2)}>
                    Paso 2: Destino →
                  </button>
                </div>
              </div>
            )}

            {pasoCheckout === 2 && (
              <div style={{ display: 'grid', gap: '0.7rem' }}>
                {token && usuario?.tipoCuenta === 'CLIENTE' ? (
                  <div>
                    <label>Dirección Internacional Registrada (RN06)</label>
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
                      className="btn btn-outline"
                      style={{ marginTop: '0.45rem', width: '100%' }}
                      onClick={() => setMostrarFormDir(!mostrarFormDir)}
                    >
                      + Registrar otra dirección postal
                    </button>
                  </div>
                ) : (
                  <div>
                    <label>País de Destino para Cotización Previa (incluye prueba bloqueo RN12)</label>
                    <select value={paisCotizacion} onChange={(e) => setPaisCotizacion(e.target.value)}>
                      {parametros?.paises?.map((p: any) => (
                        <option key={p.codigo_pais} value={p.codigo_pais}>
                          {p.nombre} ({p.codigo_pais}) {!p.habilitado ? '— [NO HABILITADO RN12]' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {mostrarFormDir && (
                  <form onSubmit={guardarNuevaDireccion} style={{ background: '#f8fafc', padding: '0.65rem', borderRadius: '0.5rem', display: 'grid', gap: '0.45rem' }}>
                    <select value={nuevaDir.pais} onChange={(e) => setNuevaDir({ ...nuevaDir, pais: e.target.value })}>
                      {parametros?.paises?.map((p: any) => (
                        <option key={p.codigo_pais} value={p.codigo_pais}>{p.nombre} ({p.codigo_pais})</option>
                      ))}
                    </select>
                    <input placeholder="Ciudad" required value={nuevaDir.ciudad} onChange={(e) => setNuevaDir({ ...nuevaDir, ciudad: e.target.value })} />
                    <input placeholder="Línea de dirección" required value={nuevaDir.lineaDireccion} onChange={(e) => setNuevaDir({ ...nuevaDir, lineaDireccion: e.target.value })} />
                    <input placeholder="Código Postal (ej. 01000-000 BR, 33131 US)" required value={nuevaDir.codigoPostal} onChange={(e) => setNuevaDir({ ...nuevaDir, codigoPostal: e.target.value })} />
                    <button type="submit" className="btn btn-emerald">Guardar Dirección</button>
                  </form>
                )}

                <div>
                  <label>Operador Logístico Internacional (RF10)</label>
                  <select value={operadorSel} onChange={(e) => setOperadorSel(e.target.value)}>
                    {parametros?.operadores?.map((op: any) => (
                      <option key={op.codigo} value={op.codigo}>
                        {op.nombre} ({op.dias_transito_estimados} días est.)
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <button className="btn btn-outline" onClick={() => setPasoCheckout(1)}>← Volver</button>
                  <button className="btn btn-primary" onClick={cotizarPaso3}>Calcular Aduana y Flete →</button>
                </div>
              </div>
            )}

            {pasoCheckout === 3 && cotizacion && (
              <div style={{ fontSize: '0.85rem', display: 'grid', gap: '0.45rem' }}>
                <div style={{ background: '#f8fafc', padding: '0.65rem', borderRadius: '0.5rem' }}>
                  <div><strong>Destino:</strong> {cotizacion.nombrePais} ({cotizacion.paisDestino})</div>
                  <div><strong>Peso Físico:</strong> {cotizacion.pesoFisicoTotalKg} kg | <strong>Volumétrico:</strong> {cotizacion.pesoVolumetricoTotalKg} kg</div>
                  <div><strong>Peso Tasable Aplicado:</strong> <span className="badge badge-blue">{cotizacion.pesoTasableKg} kg</span></div>
                  <div><strong>Operador:</strong> {cotizacion.operadorCotizado} ({cotizacion.diasTransitoEstimados} días)</div>
                  <div><strong>Tasa congelada (RN02):</strong> 1 USD = {cotizacion.tasaCongelada} {cotizacion.moneda}</div>
                </div>

                <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '0.45rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{t.subtotal}:</span> <strong>{cotizacion.subtotal} {cotizacion.moneda}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>IVA destino + Aranceles HS:</span> <strong>{cotizacion.impuestos} {cotizacion.moneda}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{t.envio}:</span> <strong>{cotizacion.costoEnvio} {cotizacion.moneda}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.08rem', color: '#1d4ed8', marginTop: '0.35rem' }}>
                    <strong>{t.totalCongelado}:</strong>
                    <strong>{cotizacion.total} {cotizacion.moneda}</strong>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: '0.76rem', color: '#64748b' }}>
                    Equivalente moneda base empresa: ${cotizacion.equivalenteUsd} USD
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem' }}>
                  <button className="btn btn-outline" onClick={() => setPasoCheckout(2)}>← Destino</button>
                  <button className="btn btn-emerald" onClick={confirmarPedidoPaso3}>
                    {t.confirmarPedido}
                  </button>
                </div>
              </div>
            )}

            {pasoCheckout === 4 && pedidoCreado && (
              <div style={{ display: 'grid', gap: '0.65rem', fontSize: '0.85rem' }}>
                <div className="alert alert-ok" style={{ margin: 0 }}>
                  <span>Pedido <b>#{pedidoCreado.idPedido}</b> registrado en estado <code>CREADO</code>. Importe congelado: <b>{pedidoCreado.desglose.total} {pedidoCreado.desglose.moneda}</b>.</span>
                </div>

                <div>
                  <label>Medio de Pago Internacional (CU05)</label>
                  <select value={medioPago} onChange={(e) => setMedioPago(e.target.value as any)}>
                    <option value="TARJETA">TARJETA INTERNACIONAL (Tokenizada PCI-DSS)</option>
                    <option value="TRANSFERENCIA">TRANSFERENCIA SWIFT / ACH</option>
                    <option value="BILLETERA_DIGITAL">BILLETERA DIGITAL / PIX / PAYPAL</option>
                  </select>
                </div>

                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '0.6rem', borderRadius: '0.45rem', fontSize: '0.78rem' }}>
                  <strong>Seguridad PCI-DSS (RN11 / RNF03):</strong> Este formulario no captura ni almacena PAN ni CVV en la base de datos; emplea token de un solo uso ante la Pasarela Certificada.
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', cursor: 'pointer', color: '#0f172a' }}>
                  <input
                    type="checkbox"
                    style={{ width: 'auto' }}
                    checked={simularRechazo}
                    onChange={(e) => setSimularRechazo(e.target.checked)}
                  />
                  Simular rechazo de pasarela (Excepción CU05 4a: mantiene pedido en CREADO)
                </label>

                <button className="btn btn-primary" onClick={ejecutarPagoPaso4}>
                  {t.pagarAhora} ({pedidoCreado.desglose.total} {pedidoCreado.desglose.moneda})
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
