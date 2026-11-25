import React, { useEffect, useState } from 'react';
import { apiFetch, UsuarioSesion } from './api';

interface Props {
  token: string;
  usuario: UsuarioSesion;
  parametros: any;
  recargarParametros: () => void;
  notificar: (tipo: 'ok' | 'err', msg: string) => void;
}

export const PanelOperativo: React.FC<Props> = ({
  token,
  usuario,
  parametros,
  recargarParametros,
  notificar
}) => {
  const rol = usuario.rol;

  // Estados por módulo operativo
  const [productos, setProductos] = useState<any[]>([]);
  const [solicitudesDev, setSolicitudesDev] = useState<any[]>([]);
  const [bandejaLog, setBandejaLog] = useState<{ pendientesGuia: any[]; despachos: any[] }>({ pendientesGuia: [], despachos: [] });
  const [facturas, setFacturas] = useState<any[]>([]);
  const [estadisticas, setEstadisticas] = useState<any | null>(null);
  const [reporteMulti, setReporteMulti] = useState<any | null>(null);

  // Filtros multidimensionales obligatorios (RF20 / CA-FUNC-10)
  const [filtros, setFiltros] = useState({
    pais: 'TODOS',
    tipoVenta: 'TODOS',
    idioma: 'TODOS',
    moneda: 'TODOS'
  });

  // Formulario Nuevo Producto (CU01)
  const [nuevoProd, setNuevoProd] = useState({
    codigo: 'PRD-ART-006',
    categoria: 'Artesanía',
    pesoKg: '0.65',
    dimensiones: '25x20x12',
    codigoArancelario: '6201.99',
    precioBaseUsd: '95.00',
    stock: '25',
    imagenUrl: 'https://images.unsplash.com/photo-1606760227091-3dd870d97f1d?auto=format&fit=crop&w=600&q=80',
    nombreEs: 'Poncho Andino de Exportación',
    descEs: 'Tejido artesanal de exportación con certificación de origen.',
    nombreEn: 'Export Andean Woven Poncho',
    descEn: 'Handwoven export poncho with origin certification.',
    nombrePt: 'Poncho Andino de Exportação',
    descPt: 'Tecido artesanal de exportação com certificação de origem.'
  });

  // Formulario Parámetros (CU13)
  const [nuevoPais, setNuevoPais] = useState({
    codigoPais: 'CL',
    nombre: 'Chile',
    monedaLocal: 'USD',
    idiomaDefecto: 'ES',
    tasaIva: '0.19',
    tarifaZonaUsdKg: '14.50',
    categoriasRestringidas: '',
    habilitado: true
  });

  const cargarDatosRol = async () => {
    try {
      if (rol === 'GESTOR_CATALOGO') {
        const prods = await apiFetch<any[]>('/api/catalogo?incluirInactivos=true', {}, token);
        setProductos(prods);
      } else if (rol === 'GESTOR_PEDIDOS') {
        const devs = await apiFetch<any[]>('/api/postventa/gestion/solicitudes', {}, token);
        setSolicitudesDev(devs);
      } else if (rol === 'LOGISTICA') {
        const band = await apiFetch<any>('/api/envios/gestion/bandeja', {}, token);
        setBandejaLog(band);
      } else if (rol === 'FACTURACION') {
        const facs = await apiFetch<any[]>('/api/facturacion/gestion', {}, token);
        setFacturas(facs);
      } else if (rol === 'GERENTE') {
        const [est, rep] = await Promise.all([
          apiFetch('/api/reportes/estadisticas', {}, token),
          apiFetch(`/api/reportes/multidimensional?pais=${filtros.pais}&tipoVenta=${filtros.tipoVenta}&idioma=${filtros.idioma}&moneda=${filtros.moneda}`, {}, token)
        ]);
        setEstadisticas(est);
        setReporteMulti(rep);
      }
    } catch (e: any) {
      notificar('err', e.message);
    }
  };

  useEffect(() => {
    cargarDatosRol();
  }, [rol, token]);

  const consultarReporteFiltrado = async () => {
    try {
      const qs = new URLSearchParams(filtros);
      const rep = await apiFetch(`/api/reportes/multidimensional?${qs.toString()}`, {}, token);
      setReporteMulti(rep);
    } catch (e: any) {
      notificar('err', e.message);
    }
  };

  const registrarProducto = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const resp = await apiFetch('/api/catalogo/productos', {
        method: 'POST',
        body: JSON.stringify({
          codigo: nuevoProd.codigo,
          categoria: nuevoProd.categoria,
          pesoKg: Number(nuevoProd.pesoKg),
          dimensiones: nuevoProd.dimensiones,
          codigoArancelario: nuevoProd.codigoArancelario,
          precioBaseUsd: Number(nuevoProd.precioBaseUsd),
          stock: Number(nuevoProd.stock),
          imagenUrl: nuevoProd.imagenUrl,
          estado: true,
          traducciones: [
            { idioma: 'ES', nombre: nuevoProd.nombreEs, descripcion: nuevoProd.descEs },
            { idioma: 'EN', nombre: nuevoProd.nombreEn, descripcion: nuevoProd.descEn },
            { idioma: 'PT', nombre: nuevoProd.nombrePt, descripcion: nuevoProd.descPt }
          ]
        })
      }, token);
      notificar('ok', resp.mensaje);
      cargarDatosRol();
    } catch (err: any) {
      notificar('err', err.message);
    }
  };

  const sincronizarTasas = async () => {
    try {
      const resp = await apiFetch('/api/catalogo/sincronizar-tasas', { method: 'POST' }, token);
      notificar('ok', resp.mensaje);
      cargarDatosRol();
    } catch (err: any) {
      notificar('err', err.message);
    }
  };

  const emitirGuiaUnClic = async (idPedido: number, operador: string) => {
    try {
      const resp = await apiFetch('/api/envios/gestion/emitir-guia', {
        method: 'POST',
        body: JSON.stringify({ idPedido, operador })
      }, token);
      notificar('ok', resp.mensaje);
      cargarDatosRol();
    } catch (err: any) {
      notificar('err', err.message);
    }
  };

  const avanzarEstadoEnvio = async (idEnvio: number, nuevoEstado: string, obs: string) => {
    try {
      const resp = await apiFetch(`/api/envios/gestion/${idEnvio}/estado`, {
        method: 'PATCH',
        body: JSON.stringify({ nuevoEstado, observacionAduana: obs })
      }, token);
      notificar('ok', resp.mensaje);
      cargarDatosRol();
    } catch (err: any) {
      notificar('err', err.message);
    }
  };

  const resolverDevolucion = async (idReembolso: number, aprobar: boolean) => {
    try {
      const resp = await apiFetch(`/api/postventa/gestion/resolver/${idReembolso}`, {
        method: 'POST',
        body: JSON.stringify({
          aprobar,
          observacionDictamen: aprobar
            ? 'Defecto físico comprobado en inspección de calidad; mercadería aislada en cuarentena.'
            : 'Reclamo sin defecto comprobable.'
        })
      }, token);
      notificar('ok', resp.mensaje);
      cargarDatosRol();
    } catch (err: any) {
      notificar('err', err.message);
    }
  };

  const probarInmutabilidadFactura = async (idFactura: number) => {
    try {
      await apiFetch(`/api/facturacion/gestion/${idFactura}`, { method: 'DELETE' }, token);
    } catch (err: any) {
      notificar('err', err.message);
    }
  };

  const guardarPaisParametrico = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const resp = await apiFetch('/api/parametros/paises', {
        method: 'POST',
        body: JSON.stringify({
          ...nuevoPais,
          tasaIva: Number(nuevoPais.tasaIva),
          tarifaZonaUsdKg: Number(nuevoPais.tarifaZonaUsdKg)
        })
      }, token);
      notificar('ok', resp.mensaje);
      recargarParametros();
    } catch (err: any) {
      notificar('err', err.message);
    }
  };

  const probarViolacionSegregacionRn20 = async () => {
    try {
      await apiFetch('/api/seguridad/usuarios', {}, token);
    } catch (err: any) {
      notificar('err', err.message);
    }
  };

  return (
    <div>
      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <h3 style={{ margin: 0 }}>Panel Operativo Interno — Rol Activo: <span className="badge badge-blue">{rol}</span></h3>
          <small style={{ color: '#64748b' }}>Operador autenticado: {usuario.nombre} ({usuario.identificador}) • Control de Acceso Basado en Roles (RNF02)</small>
        </div>
        <button className="btn btn-outline" onClick={cargarDatosRol}>Refrescar Bandeja</button>
      </div>

      {/* 1. GESTOR DE CATÁLOGO (CU01) */}
      {rol === 'GESTOR_CATALOGO' && (
        <div>
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <h4 style={{ margin: 0 }}>Catálogo Maestro, Stock Vendible vs. Cuarentena Defectuosa (CU01 / RN19)</h4>
              <button className="btn btn-emerald" onClick={sincronizarTasas}>Sincronizar Tipos de Cambio (RF12)</button>
            </div>
            <table>
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Producto (ES)</th>
                  <th>Partida HS</th>
                  <th>Peso / Dim.</th>
                  <th>Base USD</th>
                  <th>Stock Vendible</th>
                  <th>Aislado Defectuoso</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {productos.map((p) => (
                  <tr key={p.id_producto}>
                    <td><code>{p.codigo}</code></td>
                    <td><strong>{p.nombre_localizado}</strong></td>
                    <td>{p.codigo_arancelario}</td>
                    <td>{p.peso_kg} kg ({p.dimensiones})</td>
                    <td>${Number(p.precio_base_usd).toFixed(2)}</td>
                    <td><span className="badge badge-green">{p.stock} uds</span></td>
                    <td>
                      {p.stock_defectuoso > 0
                        ? <span className="badge badge-red">{p.stock_defectuoso} en cuarentena</span>
                        : '0'}
                    </td>
                    <td>{p.estado ? 'ACTIVO' : 'INACTIVO'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card">
            <h4 style={{ marginTop: 0 }}>Registrar Nuevo Producto Internacional Multilenguaje (RF01–RF03)</h4>
            <form onSubmit={registrarProducto} style={{ display: 'grid', gap: '0.75rem' }}>
              <div className="form-grid">
                <div><label>SKU Único</label><input value={nuevoProd.codigo} onChange={(e) => setNuevoProd({ ...nuevoProd, codigo: e.target.value })} required /></div>
                <div><label>Categoría</label><input value={nuevoProd.categoria} onChange={(e) => setNuevoProd({ ...nuevoProd, categoria: e.target.value })} required /></div>
                <div><label>Peso Físico (kg)</label><input type="number" step="0.01" value={nuevoProd.pesoKg} onChange={(e) => setNuevoProd({ ...nuevoProd, pesoKg: e.target.value })} required /></div>
                <div><label>Dimensiones cm (LxAxH)</label><input value={nuevoProd.dimensiones} onChange={(e) => setNuevoProd({ ...nuevoProd, dimensiones: e.target.value })} required /></div>
                <div><label>Código Arancelario HS</label><input value={nuevoProd.codigoArancelario} onChange={(e) => setNuevoProd({ ...nuevoProd, codigoArancelario: e.target.value })} required /></div>
                <div><label>Precio Base (USD)</label><input type="number" step="0.01" value={nuevoProd.precioBaseUsd} onChange={(e) => setNuevoProd({ ...nuevoProd, precioBaseUsd: e.target.value })} required /></div>
                <div><label>Stock Vendible</label><input type="number" value={nuevoProd.stock} onChange={(e) => setNuevoProd({ ...nuevoProd, stock: e.target.value })} required /></div>
              </div>
              <div className="form-grid">
                <div><label>Nombre (ES - Base)</label><input value={nuevoProd.nombreEs} onChange={(e) => setNuevoProd({ ...nuevoProd, nombreEs: e.target.value })} /></div>
                <div><label>Name (EN)</label><input value={nuevoProd.nombreEn} onChange={(e) => setNuevoProd({ ...nuevoProd, nombreEn: e.target.value })} /></div>
                <div><label>Nome (PT)</label><input value={nuevoProd.nombrePt} onChange={(e) => setNuevoProd({ ...nuevoProd, nombrePt: e.target.value })} /></div>
              </div>
              <div>
                <button type="submit" className="btn btn-primary">Guardar Producto y Calcular Precios en USD/BRL/BOB/EUR</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. GESTOR DE PEDIDOS Y POSTVENTA (CU06, CU11) */}
      {rol === 'GESTOR_PEDIDOS' && (
        <div className="card">
          <h4 style={{ marginTop: 0 }}>Evaluación de Devoluciones por Productos Defectuosos y Control de Reembolsos (CU11 / CU06)</h4>
          <p style={{ fontSize: '0.83rem', color: '#475569' }}>
            Al aprobarse un reclamo por <code>PRODUCTO_DEFECTUOSO</code>, el sistema aísla las unidades dañadas fuera del stock vendible (RN19), ejecuta el reembolso controlado ≤ 100% (RN10) y emite automáticamente la Nota de Crédito vinculada (RN16).
          </p>
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Pedido / Cliente</th>
                <th>SKU / Unidades</th>
                <th>Causal</th>
                <th>Evidencia</th>
                <th>Monto Reembolso</th>
                <th>Estado</th>
                <th>Acción de Inspección</th>
              </tr>
            </thead>
            <tbody>
              {solicitudesDev.map((s) => (
                <tr key={s.id_reembolso}>
                  <td>#{s.id_reembolso}</td>
                  <td>Pedido #{s.id_pedido}<br /><small>{s.nombre_cliente}</small></td>
                  <td><code>{s.sku_afectado || 'N/A'}</code> ({s.unidades_defectuosas} uds)</td>
                  <td><span className="badge badge-amber">{s.causal_devolucion}</span><br /><small>{s.motivo}</small></td>
                  <td><code>{s.evidencia_ref || 'SIN EVIDENCIA'}</code></td>
                  <td><strong>{s.monto} {s.moneda}</strong><br /><small>Tope: {s.monto_pago_original}</small></td>
                  <td>
                    <span className={`badge ${s.estado === 'APROBADO' ? 'badge-green' : s.estado === 'PENDIENTE' ? 'badge-amber' : 'badge-red'}`}>
                      {s.estado}
                    </span>
                  </td>
                  <td>
                    {s.estado === 'PENDIENTE' ? (
                      <div style={{ display: 'flex', gap: '0.35rem' }}>
                        <button className="btn btn-emerald" onClick={() => resolverDevolucion(s.id_reembolso, true)}>
                          Aprobar, Aislar y Reembolsar
                        </button>
                        <button className="btn btn-danger" onClick={() => resolverDevolucion(s.id_reembolso, false)}>
                          Rechazar
                        </button>
                      </div>
                    ) : (
                      <small style={{ color: '#64748b' }}>Dictaminado</small>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 3. RESPONSABLE DE LOGÍSTICA (CU07, CU08) */}
      {rol === 'LOGISTICA' && (
        <div>
          <div className="card">
            <h4 style={{ marginTop: 0 }}>Bandeja de Pedidos Pagados Listos para Emisión de Guía en Un Clic (CU07 / RN08 / RN14)</h4>
            {bandejaLog.pendientesGuia.length === 0 ? (
              <p style={{ color: '#64748b', fontSize: '0.85rem' }}>No hay pedidos pendientes de emisión de guía internacional.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Pedido</th>
                    <th>Cliente / Destino</th>
                    <th>Peso Tasable</th>
                    <th>Flete</th>
                    <th>Emisión Directa con Operador</th>
                  </tr>
                </thead>
                <tbody>
                  {bandejaLog.pendientesGuia.map((p) => (
                    <tr key={p.id_pedido}>
                      <td><strong>#{p.id_pedido}</strong> ({p.estado})</td>
                      <td>{p.nombre_cliente} — {p.ciudad}, <b>{p.pais_destino}</b></td>
                      <td>{p.peso_tasable} kg</td>
                      <td>{p.costo_envio} {p.moneda}</td>
                      <td style={{ display: 'flex', gap: '0.4rem' }}>
                        <button className="btn btn-primary" onClick={() => emitirGuiaUnClic(p.id_pedido, 'Courier Global Express')}>
                          Emitir Guía Courier Global (1 clic)
                        </button>
                        <button className="btn btn-emerald" onClick={() => emitirGuiaUnClic(p.id_pedido, 'DHL Express International')}>
                          Emitir Guía DHL Express
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="card">
            <h4 style={{ marginTop: 0 }}>Control de Tránsito Internacional e Inspección Aduanera (CU08 / Diagrama D09)</h4>
            <table>
              <thead>
                <tr>
                  <th>Guía (Tracking)</th>
                  <th>Pedido / Destino</th>
                  <th>Operador</th>
                  <th>Estado Actual</th>
                  <th>Simular Hito Logístico / Aduana</th>
                </tr>
              </thead>
              <tbody>
                {bandejaLog.despachos.map((e) => (
                  <tr key={e.id_envio}>
                    <td><code>{e.numero_guia}</code><br /><small>{e.etiqueta_exportacion}</small></td>
                    <td>Pedido #{e.id_pedido} → {e.ciudad} ({e.pais_destino})</td>
                    <td>{e.operador}</td>
                    <td><span className="badge badge-blue">{e.estado}</span></td>
                    <td style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                      {e.estado === 'EN_TRANSITO' && (
                        <>
                          <button className="btn btn-amber" onClick={() => avanzarEstadoEnvio(e.id_envio, 'EN_ADUANA', 'Ingreso a revisión aduanera en país destino')}>
                            Ingresar a Aduana
                          </button>
                          <button className="btn btn-emerald" onClick={() => avanzarEstadoEnvio(e.id_envio, 'ENTREGADO', 'Recepción final confirmada por destinatario')}>
                            Confirmar Entrega
                          </button>
                        </>
                      )}
                      {e.estado === 'EN_ADUANA' && (
                        <>
                          <button className="btn btn-primary" onClick={() => avanzarEstadoEnvio(e.id_envio, 'EN_TRANSITO', 'Mercancía liberada por aduana nacional')}>
                            Liberar Aduana → Tránsito
                          </button>
                          <button className="btn btn-danger" onClick={() => avanzarEstadoEnvio(e.id_envio, 'DEVUELTO', 'Importación rechazada por aduana')}>
                            Rechazo Aduanero
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. RESPONSABLE DE FACTURACIÓN (CU09) */}
      {rol === 'FACTURACION' && (
        <div className="card">
          <h4 style={{ marginTop: 0 }}>Registro Inmutable de Facturas Comerciales y Notas de Crédito (CU09 / RN15 / RN16)</h4>
          <table>
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Número</th>
                <th>Pedido / Cliente</th>
                <th>País / ID Fiscal</th>
                <th>Subtotal / Impuestos</th>
                <th>Total</th>
                <th>Vinculación / Prueba RN16</th>
              </tr>
            </thead>
            <tbody>
              {facturas.map((f) => (
                <tr key={f.id_factura}>
                  <td>
                    <span className={`badge ${f.tipo_documento === 'NOTA_CREDITO' ? 'badge-amber' : 'badge-green'}`}>
                      {f.tipo_documento}
                    </span>
                  </td>
                  <td><code>{f.numero}</code></td>
                  <td>Pedido #{f.id_pedido} — {f.nombre_cliente}</td>
                  <td>{f.pais} ({f.datos_fiscales_cliente})</td>
                  <td>{f.subtotal} + {f.impuestos} {f.moneda}</td>
                  <td><strong>{f.total} {f.moneda}</strong></td>
                  <td>
                    {f.factura_origen_numero ? (
                      <small>Ajusta a <code>{f.factura_origen_numero}</code></small>
                    ) : (
                      <button className="btn btn-outline" onClick={() => probarInmutabilidadFactura(f.id_factura)}>
                        Probar Bloqueo Borrado (RN16)
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 5. GERENTE: ESTADÍSTICAS DE DEMANDA Y REPORTES MULTIDIMENSIONALES (CU12) */}
      {rol === 'GERENTE' && estadisticas && (
        <div>
          <div className="kpi-grid">
            <div className="kpi-box">
              <small style={{ color: '#64748b' }}>Ingresos Consolidados (Moneda Base)</small>
              <div className="kpi-val" style={{ color: '#1d4ed8' }}>${Number(estadisticas.ingresosConsolidadosUsd).toFixed(2)} USD</div>
            </div>
            <div className="kpi-box">
              <small style={{ color: '#64748b' }}>Pedidos Internacionales Operados</small>
              <div className="kpi-val">{estadisticas.totalPedidosOperados}</div>
            </div>
            <div className="kpi-box">
              <small style={{ color: '#64748b' }}>Tasa de Devolución por Defectos</small>
              <div className="kpi-val" style={{ color: '#d97706' }}>{estadisticas.tasaDevolucionDefectosPct}%</div>
            </div>
          </div>

          <div className="form-grid" style={{ marginBottom: '1rem' }}>
            <div className="card" style={{ marginBottom: 0 }}>
              <h4 style={{ marginTop: 0 }}>Ranking de Productos Más Demandados (RF24)</h4>
              <table>
                <thead>
                  <tr>
                    <th>SKU / Producto</th>
                    <th>Solicitudes / Consultas</th>
                    <th>Unidades Vendidas</th>
                  </tr>
                </thead>
                <tbody>
                  {estadisticas.rankingProductosDemandados.map((p: any) => (
                    <tr key={p.id_producto}>
                      <td><code>{p.codigo}</code> — {p.nombre}</td>
                      <td><span className="badge badge-purple">{p.solicitudes_clientes} interacciones</span></td>
                      <td><strong>{p.unidades_vendidas} uds</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="card" style={{ marginBottom: 0 }}>
              <h4 style={{ marginTop: 0 }}>Mayores Solicitudes y Búsquedas de Clientes (RF24)</h4>
              <table>
                <thead>
                  <tr>
                    <th>Tipo</th>
                    <th>Referencia / Búsqueda</th>
                    <th>País / Idioma</th>
                    <th>Frec.</th>
                  </tr>
                </thead>
                <tbody>
                  {estadisticas.mayoresSolicitudesClientes.map((m: any, idx: number) => (
                    <tr key={idx}>
                      <td><small>{m.tipo_solicitud}</small></td>
                      <td><strong>{m.referencia}</strong></td>
                      <td>{m.pais} / {m.idioma}</td>
                      <td>{m.frecuencia}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <h4 style={{ marginTop: 0 }}>Reporte Gerencial Controlado Multidimensional (RF20 / CA-FUNC-10)</h4>
            <div className="form-grid" style={{ alignItems: 'end', marginBottom: '0.9rem' }}>
              <div>
                <label>Filtro País Destino</label>
                <select value={filtros.pais} onChange={(e) => setFiltros({ ...filtros, pais: e.target.value })}>
                  <option value="TODOS">TODOS LOS PAÍSES</option>
                  {parametros?.paises?.map((p: any) => (
                    <option key={p.codigo_pais} value={p.codigo_pais}>{p.nombre} ({p.codigo_pais})</option>
                  ))}
                </select>
              </div>
              <div>
                <label>Filtro Tipo de Venta</label>
                <select value={filtros.tipoVenta} onChange={(e) => setFiltros({ ...filtros, tipoVenta: e.target.value })}>
                  <option value="TODOS">TODOS</option>
                  <option value="MINORISTA">MINORISTA</option>
                  <option value="MAYORISTA">MAYORISTA</option>
                  <option value="PROMOCIONAL">PROMOCIONAL</option>
                </select>
              </div>
              <div>
                <label>Filtro Idioma de Operación</label>
                <select value={filtros.idioma} onChange={(e) => setFiltros({ ...filtros, idioma: e.target.value })}>
                  <option value="TODOS">TODOS (ES / EN / PT)</option>
                  <option value="ES">ES (Español)</option>
                  <option value="EN">EN (English)</option>
                  <option value="PT">PT (Português)</option>
                </select>
              </div>
              <div>
                <label>Filtro Moneda</label>
                <select value={filtros.moneda} onChange={(e) => setFiltros({ ...filtros, moneda: e.target.value })}>
                  <option value="TODOS">TODAS</option>
                  <option value="USD">USD</option>
                  <option value="BRL">BRL</option>
                  <option value="BOB">BOB</option>
                  <option value="EUR">EUR</option>
                </select>
              </div>
              <div>
                <button className="btn btn-primary" style={{ width: '100%' }} onClick={consultarReporteFiltrado}>
                  Ejecutar Cruce Multidimensional
                </button>
              </div>
            </div>

            {reporteMulti && (
              <div>
                <div style={{ marginBottom: '0.6rem', fontSize: '0.86rem' }}>
                  Registros coincidentes: <b>{reporteMulti.cantidadRegistros}</b> • Total consolidado en moneda base:{' '}
                  <span className="badge badge-green">${Number(reporteMulti.totalConsolidadoUsd).toFixed(2)} USD</span>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>Pedido</th>
                      <th>Cliente</th>
                      <th>País</th>
                      <th>Tipo Venta</th>
                      <th>Idioma</th>
                      <th>Total Divisa</th>
                      <th>Equiv. USD</th>
                      <th>Estado / Factura</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reporteMulti.registros.map((r: any) => (
                      <tr key={r.id_pedido}>
                        <td>#{r.id_pedido}</td>
                        <td>{r.cliente}</td>
                        <td>{r.nombre_pais} ({r.pais})</td>
                        <td><span className="badge badge-purple">{r.tipo_venta}</span></td>
                        <td>{r.idioma_operacion}</td>
                        <td>{r.total} {r.moneda}</td>
                        <td><strong>${Number(r.equivalente_usd).toFixed(2)}</strong></td>
                        <td>{r.estado} {r.numero_factura ? `• ${r.numero_factura}` : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 6. ADMINISTRADOR DEL SISTEMA - PARÁMETROS OPERATIVOS SIN SEGURIDAD (CU13, RN20) */}
      {rol === 'ADMINISTRADOR' && (
        <div>
          <div className="card" style={{ borderLeft: '4px solid #dc2626' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.6rem' }}>
              <div>
                <h4 style={{ margin: 0 }}>Verificación de Segregación Estricta de Funciones (RN20 / CA-FUNC-12)</h4>
                <small style={{ color: '#475569' }}>
                  El rol <code>ADMINISTRADOR</code> configura parámetros comerciales pero tiene prohibido acceder a usuarios, hashes <code>bcrypt</code> o registros de <code>AUDITORIA</code>.
                </small>
              </div>
              <button className="btn btn-danger" onClick={probarViolacionSegregacionRn20}>
                Intentar Acceder a /api/seguridad/usuarios (Demostrar Bloqueo 403 + Auditoría)
              </button>
            </div>
          </div>

          <div className="card">
            <h4 style={{ marginTop: 0 }}>Habilitar o Actualizar País Destino e Impuestos sin Recompilar (RF22 / RNF09)</h4>
            <form onSubmit={guardarPaisParametrico} className="form-grid" style={{ alignItems: 'end' }}>
              <div><label>Código ISO País</label><input value={nuevoPais.codigoPais} onChange={(e) => setNuevoPais({ ...nuevoPais, codigoPais: e.target.value })} required /></div>
              <div><label>Nombre País</label><input value={nuevoPais.nombre} onChange={(e) => setNuevoPais({ ...nuevoPais, nombre: e.target.value })} required /></div>
              <div><label>Moneda Local</label><input value={nuevoPais.monedaLocal} onChange={(e) => setNuevoPais({ ...nuevoPais, monedaLocal: e.target.value })} required /></div>
              <div><label>Idioma Defecto</label><input value={nuevoPais.idiomaDefecto} onChange={(e) => setNuevoPais({ ...nuevoPais, idiomaDefecto: e.target.value })} required /></div>
              <div><label>Tasa IVA (0 a 1)</label><input type="number" step="0.01" value={nuevoPais.tasaIva} onChange={(e) => setNuevoPais({ ...nuevoPais, tasaIva: e.target.value })} required /></div>
              <div><label>Tarifa Zona USD/kg</label><input type="number" step="0.5" value={nuevoPais.tarifaZonaUsdKg} onChange={(e) => setNuevoPais({ ...nuevoPais, tarifaZonaUsdKg: e.target.value })} required /></div>
              <div><button type="submit" className="btn btn-primary" style={{ width: '100%' }}>Guardar País Paramétrico</button></div>
            </form>

            <table style={{ marginTop: '1rem' }}>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>País</th>
                  <th>Moneda / Idioma</th>
                  <th>IVA Local</th>
                  <th>Categorías Restringidas</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {parametros?.paises?.map((p: any) => (
                  <tr key={p.codigo_pais}>
                    <td><code>{p.codigo_pais}</code></td>
                    <td><strong>{p.nombre}</strong></td>
                    <td>{p.moneda_local} / {p.idioma_defecto}</td>
                    <td>{(Number(p.tasa_iva) * 100).toFixed(1)}%</td>
                    <td>{p.categorias_restringidas || 'Ninguna'}</td>
                    <td>{p.habilitado ? <span className="badge badge-green">HABILITADO</span> : <span className="badge badge-red">BLOQUEADO RN12</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
