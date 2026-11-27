import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Coins,
  Download,
  FileText,
  FlaskConical,
  Globe,
  Landmark,
  Package,
  Pencil,
  Plane,
  Plus,
  Printer,
  RefreshCw,
  Search,
  ShieldCheck,
  TrendingUp,
  Truck,
  X
} from 'lucide-react';
import { apiFetch, UsuarioSesion } from './api';
import { OperationalTable } from './components/OperationalTable';
import { ImmutableTag, StatusBadge } from './components/StatusBadge';
import { DocumentoImprimibleModal } from './components/DocumentoImprimibleModal';
import {
  modalBloqueoSeguridadInmutabilidad,
  modalConfirmarAprobacionReembolso,
  modalErrorValidacionOAduana,
  modalReembolsoEjecutadoExito,
  toastExito,
  toastInfo
} from './utils/alerts';

interface Props {
  token: string;
  usuario: UsuarioSesion;
  parametros: any;
  recargarParametros: () => void;
  notificar: (tipo: 'ok' | 'err', msg: string) => void;
}

const SECCIONES_POR_ROL: Record<string, { id: string; label: string; icon: React.ReactNode }[]> = {
  GESTOR_CATALOGO: [
    { id: 'INVENTARIO', label: 'Catálogo y Stock', icon: <Package size={16} /> },
    { id: 'ALTA_PRODUCTO', label: 'Nuevo Producto', icon: <Plus size={16} /> }
  ],
  GESTOR_PEDIDOS: [
    { id: 'INSPECCION', label: 'Inspección y Reembolsos', icon: <Search size={16} /> },
    { id: 'TODOS_PEDIDOS', label: 'Pedidos e Incidencias', icon: <ClipboardList size={16} /> }
  ],
  LOGISTICA: [
    { id: 'GUIAS', label: 'Emisión de Guías (CU07)', icon: <Plane size={16} /> },
    { id: 'TRANSITO', label: 'Tránsito y Aduana (CU08)', icon: <Truck size={16} /> }
  ],
  FACTURACION: [
    { id: 'COMPROBANTES', label: 'Facturas y Notas de Crédito', icon: <FileText size={16} /> }
  ],
  GERENTE: [
    { id: 'REPORTE_MULTI', label: 'Reporte Multidimensional', icon: <BarChart3 size={16} /> },
    { id: 'DEMANDA', label: 'Ranking y Solicitudes', icon: <TrendingUp size={16} /> }
  ],
  ADMINISTRADOR: [
    { id: 'PAISES_IMPUESTOS', label: 'Países, IVA y Aduana', icon: <Globe size={16} /> },
    { id: 'MONEDAS_TASAS', label: 'Monedas y Tasas', icon: <Coins size={16} /> },
    { id: 'ARANCELES_HS', label: 'Aranceles HS', icon: <Landmark size={16} /> },
    { id: 'OPERADORES_IDIOMAS', label: 'Operadores e Idiomas', icon: <Plane size={16} /> },
    { id: 'SEGREGACION', label: 'Verificación RN20', icon: <ShieldCheck size={16} /> }
  ]
};

export const PanelOperativo: React.FC<Props> = ({
  token,
  usuario,
  parametros,
  recargarParametros,
  notificar
}) => {
  const rol = usuario.rol;
  const secciones = SECCIONES_POR_ROL[rol] || [{ id: 'DEFAULT', label: rol, icon: <Package size={16} /> }];
  const [seccionActiva, setSeccionActiva] = useState<string>(secciones[0].id);

  // Estados por módulo operativo
  const [productos, setProductos] = useState<any[]>([]);
  const [prodEditModal, setProdEditModal] = useState<any | null>(null);
  const [solicitudesDev, setSolicitudesDev] = useState<any[]>([]);
  const [montosParciales, setMontosParciales] = useState<Record<number, string>>({});
  const [todosPedidos, setTodosPedidos] = useState<any[]>([]);
  const [bandejaLog, setBandejaLog] = useState<{ pendientesGuia: any[]; despachos: any[] }>({ pendientesGuia: [], despachos: [] });
  const [facturas, setFacturas] = useState<any[]>([]);
  const [docImprimible, setDocImprimible] = useState<{ tipo: 'COMPROBANTE' | 'ETIQUETA_CN23'; datos: any } | null>(null);
  const [estadisticas, setEstadisticas] = useState<any | null>(null);
  const [reporteMulti, setReporteMulti] = useState<any | null>(null);
  const [aranceles, setAranceles] = useState<any[]>([]);

  // Formularios paramétricos adicionales (CU13 / RF22 / RNF09)
  const [nuevaMoneda, setNuevaMoneda] = useState({ codigoMoneda: 'GBP', nombre: 'Libra Esterlina', simbolo: '£', tasaRespectoUsd: '0.79', habilitada: true });
  const [nuevoArancel, setNuevoArancel] = useState({ codigoPais: 'BR', codigoArancelario: '6110.19', tasaArancel: '0.12', restringido: false });
  const [nuevoOperador, setNuevoOperador] = useState({ codigoOperador: 'FEDEX_INTL', nombre: 'FedEx International Priority', tarifaBaseUsd: '28.00', diasEstimados: '4', activo: true });
  const [nuevoIdioma, setNuevoIdioma] = useState({ codigoIdioma: 'FR', nombre: 'Français', habilitado: true });

  // Filtros multidimensionales obligatorios (RF20 / CA-FUNC-10 + Rango de fechas DESIGN.md §3.E)
  const [filtros, setFiltros] = useState({
    pais: 'TODOS',
    tipoVenta: 'TODOS',
    idioma: 'TODOS',
    moneda: 'TODOS',
    fechaDesde: '2026-11-01',
    fechaHasta: '2026-12-31'
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

  useEffect(() => {
    const lista = SECCIONES_POR_ROL[rol] || [{ id: 'DEFAULT', label: rol }];
    setSeccionActiva(lista[0].id);
    cargarDatosRol();
  }, [rol, token]);

  const cargarDatosRol = async () => {
    try {
      if (rol === 'GESTOR_CATALOGO') {
        const prods = await apiFetch<any[]>('/api/catalogo?incluirInactivos=true', {}, token);
        setProductos(prods);
      } else if (rol === 'GESTOR_PEDIDOS') {
        const [devs, peds] = await Promise.all([
          apiFetch<any[]>('/api/postventa/gestion/solicitudes', {}, token),
          apiFetch<any[]>('/api/pedidos', {}, token)
        ]);
        setSolicitudesDev(devs);
        setTodosPedidos(peds);
      } else if (rol === 'LOGISTICA') {
        const band = await apiFetch<any>('/api/envios/gestion/bandeja', {}, token);
        setBandejaLog(band);
      } else if (rol === 'FACTURACION') {
        const facs = await apiFetch<any[]>('/api/facturacion/gestion', {}, token);
        setFacturas(facs);
      } else if (rol === 'GERENTE') {
        const qs = new URLSearchParams({
          pais: filtros.pais,
          tipoVenta: filtros.tipoVenta,
          idioma: filtros.idioma,
          moneda: filtros.moneda,
          ...(filtros.fechaDesde ? { fechaDesde: filtros.fechaDesde } : {}),
          ...(filtros.fechaHasta ? { fechaHasta: filtros.fechaHasta } : {})
        });
        const [est, rep] = await Promise.all([
          apiFetch('/api/reportes/estadisticas', {}, token),
          apiFetch(`/api/reportes/multidimensional?${qs.toString()}`, {}, token)
        ]);
        setEstadisticas(est);
        setReporteMulti(rep);
      } else if (rol === 'ADMINISTRADOR') {
        const ar = await apiFetch<any[]>('/api/parametros/aranceles', {}, token);
        setAranceles(ar);
      }
    } catch (e: any) {
      notificar('err', e.message);
    }
  };

  const consultarReporteFiltrado = async () => {
    try {
      const qs = new URLSearchParams({
        pais: filtros.pais,
        tipoVenta: filtros.tipoVenta,
        idioma: filtros.idioma,
        moneda: filtros.moneda,
        ...(filtros.fechaDesde ? { fechaDesde: filtros.fechaDesde } : {}),
        ...(filtros.fechaHasta ? { fechaHasta: filtros.fechaHasta } : {})
      });
      const rep = await apiFetch(`/api/reportes/multidimensional?${qs.toString()}`, {}, token);
      setReporteMulti(rep);
      toastInfo(
        `Reporte multidimensional actualizado`,
        `${rep.cantidadRegistros} registros • $${Number(rep.totalConsolidadoUsd).toFixed(2)} USD`
      );
    } catch (e: any) {
      notificar('err', e.message);
    }
  };

  const exportarReporteCsv = () => {
    if (!reporteMulti?.registros?.length) return;
    const headers = ['ID_PEDIDO', 'FECHA', 'CLIENTE', 'PAIS', 'TIPO_VENTA', 'IDIOMA', 'MONEDA', 'TOTAL', 'EQUIV_USD', 'ESTADO', 'FACTURA', 'GUIA'];
    const rows = reporteMulti.registros.map((r: any) => [
      r.id_pedido,
      String(r.fecha || '').substring(0, 19),
      `"${String(r.cliente || '').replace(/"/g, '""')}"`,
      r.pais,
      r.tipo_venta,
      r.idioma_operacion,
      r.moneda,
      r.total,
      r.equivalente_usd,
      r.estado,
      r.numero_factura || '',
      r.numero_guia || ''
    ].join(','));
    const blob = new Blob([[headers.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reporte_multidimensional_${filtros.pais}_${filtros.moneda}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toastExito('Reporte CSV exportado correctamente (CU12)', `${reporteMulti.registros.length} filas`);
  };

  const abrirEdicionProducto = (p: any) => {
    const tEs = p.traducciones?.find((t: any) => t.idioma === 'ES');
    const tEn = p.traducciones?.find((t: any) => t.idioma === 'EN');
    const tPt = p.traducciones?.find((t: any) => t.idioma === 'PT');
    setProdEditModal({
      idProducto: p.id_producto,
      codigo: p.codigo,
      categoria: p.categoria,
      pesoKg: String(p.peso_kg),
      dimensiones: p.dimensiones,
      codigoArancelario: p.codigo_arancelario,
      precioBaseUsd: String(p.precio_base_usd),
      stock: String(p.stock),
      imagenUrl: p.imagen_url || '',
      estado: Boolean(p.estado),
      nombreEs: tEs?.nombre || p.nombre_localizado || '',
      descEs: tEs?.descripcion || '',
      nombreEn: tEn?.nombre || '',
      descEn: tEn?.descripcion || '',
      nombrePt: tPt?.nombre || '',
      descPt: tPt?.descripcion || ''
    });
  };

  const guardarEdicionProducto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prodEditModal) return;
    try {
      const resp = await apiFetch(`/api/catalogo/productos/${prodEditModal.idProducto}`, {
        method: 'PUT',
        body: JSON.stringify({
          codigo: prodEditModal.codigo,
          categoria: prodEditModal.categoria,
          pesoKg: Number(prodEditModal.pesoKg),
          dimensiones: prodEditModal.dimensiones,
          codigoArancelario: prodEditModal.codigoArancelario,
          precioBaseUsd: Number(prodEditModal.precioBaseUsd),
          stock: Number(prodEditModal.stock),
          imagenUrl: prodEditModal.imagenUrl,
          estado: prodEditModal.estado,
          traducciones: [
            { idioma: 'ES', nombre: prodEditModal.nombreEs, descripcion: prodEditModal.descEs },
            { idioma: 'EN', nombre: prodEditModal.nombreEn, descripcion: prodEditModal.descEn },
            { idioma: 'PT', nombre: prodEditModal.nombrePt, descripcion: prodEditModal.descPt }
          ]
        })
      }, token);
      toastExito(resp.mensaje, `${prodEditModal.codigo} • $${Number(prodEditModal.precioBaseUsd).toFixed(2)} USD`);
      setProdEditModal(null);
      cargarDatosRol();
    } catch (err: any) {
      await modalErrorValidacionOAduana({ mensaje: err.message, codigoRef: 'CU01' });
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
      // Toast rápido 3.5s al guardar producto (CU01 - DESIGN.md §5.1)
      toastExito(resp.mensaje, `${nuevoProd.codigo} • $${Number(nuevoProd.precioBaseUsd).toFixed(2)} USD`);
      cargarDatosRol();
      setSeccionActiva('INVENTARIO');
    } catch (err: any) {
      await modalErrorValidacionOAduana({
        mensaje: err.message,
        codigoRef: 'CU01 / CA-FUNC-01'
      });
    }
  };

  const sincronizarTasas = async (simularFalla = false) => {
    try {
      const resp = await apiFetch(`/api/catalogo/sincronizar-tasas?simularFallaProveedor=${simularFalla}`, { method: 'POST' }, token);
      if (resp.alertaFallbackRn03) {
        await modalErrorValidacionOAduana({
          titulo: 'Alerta de Contingencia de Divisas (RN03)',
          mensaje: resp.mensaje,
          codigoRef: 'CU01 4a / RN03'
        });
      } else {
        toastExito(resp.mensaje, 'USD / BRL / BOB / EUR');
      }
      recargarParametros();
      cargarDatosRol();
    } catch (err: any) {
      notificar('err', err.message);
    }
  };

  const emitirGuiaUnClic = async (idPedido: number, operador: string, despacharInmediato = true) => {
    try {
      const resp = await apiFetch('/api/envios/gestion/emitir-guia', {
        method: 'POST',
        body: JSON.stringify({ idPedido, operador, despacharInmediato })
      }, token);
      // Toast rápido 3.5s con número de guía en JetBrains Mono (CU07)
      toastExito(
        despacharInmediato ? `Guía internacional emitida (${resp.operador})` : `Pedido PREPARADO en almacén (${resp.operador})`,
        `${resp.numeroGuia} • Pedido #${idPedido}`
      );
      cargarDatosRol();
    } catch (err: any) {
      await modalErrorValidacionOAduana({
        titulo: 'Requisitos de Exportación Incompletos (RN14 / RN08)',
        mensaje: err.message,
        codigoRef: `Pedido #${idPedido}`
      });
    }
  };

  const cancelarPedidoGestor = async (idPedido: number) => {
    try {
      const resp = await apiFetch(`/api/pedidos/${idPedido}/cancelar`, { method: 'POST' }, token);
      toastInfo(resp.mensaje, `Pedido #${idPedido}`);
      cargarDatosRol();
    } catch (err: any) {
      await modalErrorValidacionOAduana({ mensaje: err.message, codigoRef: 'D08' });
    }
  };

  const avanzarEstadoEnvio = async (idEnvio: number, nuevoEstado: string, obs: string) => {
    try {
      const resp = await apiFetch(`/api/envios/gestion/${idEnvio}/estado`, {
        method: 'PATCH',
        body: JSON.stringify({ nuevoEstado, observacionAduana: obs })
      }, token);
      toastInfo(resp.mensaje, `Envío #${idEnvio} → ${nuevoEstado}`);
      cargarDatosRol();
    } catch (err: any) {
      await modalErrorValidacionOAduana({
        mensaje: err.message,
        codigoRef: 'D09 / CU08'
      });
    }
  };

  const resolverDevolucion = async (solicitud: any, aprobar: boolean) => {
    const montoCustomStr = montosParciales[solicitud.id_reembolso];
    const montoAprobar = montoCustomStr && Number(montoCustomStr) > 0 ? Number(montoCustomStr) : Number(solicitud.monto);

    // Modal con confirmación explícita antes de aprobar/rechazar reembolso y cuarentena (CU06 / RN10 / RN19)
    const confirmado = await modalConfirmarAprobacionReembolso({
      idReembolso: solicitud.id_reembolso,
      idPedido: solicitud.id_pedido,
      sku: solicitud.sku_afectado,
      unidades: solicitud.unidades_defectuosas,
      monto: montoAprobar,
      moneda: solicitud.moneda,
      topeOriginal: solicitud.monto_pago_original,
      aprobar
    });
    if (!confirmado) return;

    try {
      const resp = await apiFetch(`/api/postventa/gestion/resolver/${solicitud.id_reembolso}`, {
        method: 'POST',
        body: JSON.stringify({
          aprobar,
          montoAutorizado: aprobar ? montoAprobar : null,
          observacionDictamen: aprobar
            ? 'Defecto físico comprobado en inspección de calidad; mercadería aislada en cuarentena.'
            : 'Reclamo sin defecto comprobable.'
        })
      }, token);
      cargarDatosRol();
      if (aprobar && resp.notaCredito) {
        await modalReembolsoEjecutadoExito({
          numeroNotaCredito: resp.notaCredito.numero,
          unidadesAisladas: resp.unidadesAisladasCuarentena,
          mensaje: resp.mensaje
        });
      } else {
        toastInfo(resp.mensaje, `Solicitud #${solicitud.id_reembolso}`);
      }
    } catch (err: any) {
      await modalErrorValidacionOAduana({
        titulo: 'Bloqueo de Regla de Reembolso (RN10 / RN19)',
        mensaje: err.message,
        codigoRef: `Solicitud #${solicitud.id_reembolso}`
      });
    }
  };

  const simularIntentoAlteracionFactura = async () => {
    const idTarget = facturas[0]?.id_factura || 1;
    try {
      await apiFetch(`/api/facturacion/gestion/${idTarget}`, { method: 'DELETE' }, token);
    } catch (err: any) {
      await modalBloqueoSeguridadInmutabilidad({
        regla: 'RN16 • INMUTABILIDAD TRIBUTARIA',
        titulo: 'Alteración o Borrado de Factura Bloqueado',
        mensaje: err.message
      });
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
      toastExito(resp.mensaje, `${nuevoPais.codigoPais} • IVA ${(Number(nuevoPais.tasaIva) * 100).toFixed(0)}%`);
      recargarParametros();
    } catch (err: any) {
      await modalErrorValidacionOAduana({
        mensaje: err.message,
        codigoRef: 'CU13 3a'
      });
    }
  };

  const guardarMonedaParametrica = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const resp = await apiFetch('/api/parametros/monedas', {
        method: 'POST',
        body: JSON.stringify({ ...nuevaMoneda, tasaRespectoUsd: Number(nuevaMoneda.tasaRespectoUsd) })
      }, token);
      toastExito(resp.mensaje, `${nuevaMoneda.codigoMoneda} = ${nuevaMoneda.tasaRespectoUsd}`);
      recargarParametros();
    } catch (err: any) {
      await modalErrorValidacionOAduana({ mensaje: err.message, codigoRef: 'CU13' });
    }
  };

  const guardarArancelParametrico = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const resp = await apiFetch('/api/parametros/aranceles', {
        method: 'POST',
        body: JSON.stringify({ ...nuevoArancel, tasaArancel: Number(nuevoArancel.tasaArancel) })
      }, token);
      toastExito(resp.mensaje, `${nuevoArancel.codigoPais} / HS ${nuevoArancel.codigoArancelario}`);
      cargarDatosRol();
    } catch (err: any) {
      await modalErrorValidacionOAduana({ mensaje: err.message, codigoRef: 'CU13' });
    }
  };

  const guardarOperadorParametrico = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const resp = await apiFetch('/api/parametros/operadores', {
        method: 'POST',
        body: JSON.stringify({
          ...nuevoOperador,
          tarifaBaseUsd: Number(nuevoOperador.tarifaBaseUsd),
          diasEstimados: Number(nuevoOperador.diasEstimados)
        })
      }, token);
      toastExito(resp.mensaje, nuevoOperador.codigoOperador);
      recargarParametros();
    } catch (err: any) {
      await modalErrorValidacionOAduana({ mensaje: err.message, codigoRef: 'CU13' });
    }
  };

  const guardarIdiomaParametrico = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const resp = await apiFetch('/api/parametros/idiomas', {
        method: 'POST',
        body: JSON.stringify(nuevoIdioma)
      }, token);
      toastExito(resp.mensaje, nuevoIdioma.codigoIdioma);
      recargarParametros();
    } catch (err: any) {
      await modalErrorValidacionOAduana({ mensaje: err.message, codigoRef: 'CU13' });
    }
  };

  const probarViolacionSegregacionRn20 = async () => {
    try {
      await apiFetch('/api/seguridad/usuarios', {}, token);
    } catch (err: any) {
      await modalBloqueoSeguridadInmutabilidad({
        regla: 'RN20 / RNF02 • HTTP 403 FORBIDDEN',
        titulo: 'Segregación de Seguridad Aplicada',
        mensaje: err.message
      });
    }
  };

  return (
    <div className="admin-shell">
      {/* BARRA LATERAL IZQUIERDA FIJA RBAC (Colapsa en horizontal en < 768px - DESIGN.md §3.E / RNF13) */}
      <aside className="admin-sidebar">
        <div className="sidebar-role-badge">
          <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
            Módulo Autorizado RBAC
          </div>
          <div style={{ marginTop: '4px' }}>
            <StatusBadge estado="APROBADO" texto={rol} />
          </div>
          <div style={{ fontSize: '12px', marginTop: '6px', fontWeight: 600 }}>{usuario.nombre}</div>
          <div className="mono" style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>@{usuario.identificador}</div>
        </div>

        {secciones.map((sec) => (
          <button
            key={sec.id}
            className={`sidebar-nav-btn ${seccionActiva === sec.id ? 'active' : ''}`}
            onClick={() => setSeccionActiva(sec.id)}
          >
            <span className="icon-inline">{sec.icon} {sec.label}</span>
            <ChevronRight size={15} />
          </button>
        ))}

        <button className="btn btn-sm btn-outline" style={{ marginTop: '8px' }} onClick={cargarDatosRol}>
          <RefreshCw size={14} /> Sincronizar Datos
        </button>
      </aside>

      {/* CONTENIDO OPERATIVO PRINCIPAL */}
      <div>
        {/* 1. GESTOR DE CATÁLOGO (CU01) */}
        {rol === 'GESTOR_CATALOGO' && seccionActiva === 'INVENTARIO' && (
          <OperationalTable
            titulo="Catálogo Maestro Internacional: Stock Vendible vs. Cuarentena Defectuosa (CU01 / RN19)"
            subtitulo="Precios convertidos automáticamente a partir de moneda base (USD) y aislamiento de mercadería dañada."
            accionesCabecera={
              <>
                <button className="btn btn-sm btn-accent" onClick={() => sincronizarTasas(false)}>
                  <Coins size={15} /> Sincronizar Tipos de Cambio (RF12)
                </button>
                <button className="btn btn-sm btn-outline" onClick={() => sincronizarTasas(true)}>
                  <AlertTriangle size={15} /> Simular Falla Proveedor (RN03)
                </button>
                <button className="btn btn-sm btn-primary" onClick={() => setSeccionActiva('ALTA_PRODUCTO')}>
                  <Plus size={15} /> Nuevo Producto
                </button>
              </>
            }
            columnas={[
              { key: 'codigo', titulo: 'SKU', mono: true },
              { key: 'nombre_localizado', titulo: 'Producto (ES)', render: (p) => <strong>{p.nombre_localizado}</strong> },
              { key: 'categoria', titulo: 'Categoría' },
              { key: 'codigo_arancelario', titulo: 'Partida HS', mono: true },
              { key: 'peso_kg', titulo: 'Peso / Dim.', mono: true, render: (p) => `${p.peso_kg} kg (${p.dimensiones})` },
              { key: 'precio_base_usd', titulo: 'Base USD', mono: true, render: (p) => `$${Number(p.precio_base_usd).toFixed(2)}` },
              { key: 'stock', titulo: 'Stock Vendible', render: (p) => <StatusBadge estado="APROBADO" texto={`${p.stock} uds`} /> },
              {
                key: 'stock_defectuoso',
                titulo: 'Aislado Defectuoso (RN19)',
                render: (p) =>
                  p.stock_defectuoso > 0 ? (
                    <StatusBadge estado="PRODUCTO_DEFECTUOSO" texto={`${p.stock_defectuoso} en cuarentena`} />
                  ) : (
                    <span className="mono">0</span>
                  )
              },
              { key: 'estado', titulo: 'Estado', render: (p) => <StatusBadge estado={p.estado ? 'ACTIVO' : 'INACTIVO'} /> },
              {
                key: 'editar',
                titulo: 'Gestión',
                render: (p) => (
                  <button className="btn btn-sm btn-outline" onClick={() => abrirEdicionProducto(p)}>
                    <Pencil size={14} /> Editar
                  </button>
                )
              }
            ]}
            datos={productos}
          />
        )}

        {rol === 'GESTOR_CATALOGO' && seccionActiva === 'ALTA_PRODUCTO' && (
          <div className="card">
            <h3 className="section-subtitle">Registrar Nuevo Producto Multilenguaje y Multimoneda (RF01–RF03)</h3>
            <form onSubmit={registrarProducto} style={{ display: 'grid', gap: '16px' }}>
              <div className="form-grid">
                <div><label>SKU Único</label><input className="mono" value={nuevoProd.codigo} onChange={(e) => setNuevoProd({ ...nuevoProd, codigo: e.target.value })} required /></div>
                <div><label>Categoría</label><input value={nuevoProd.categoria} onChange={(e) => setNuevoProd({ ...nuevoProd, categoria: e.target.value })} required /></div>
                <div><label>Peso Físico (kg)</label><input className="mono" type="number" step="0.01" value={nuevoProd.pesoKg} onChange={(e) => setNuevoProd({ ...nuevoProd, pesoKg: e.target.value })} required /></div>
                <div><label>Dimensiones cm (LxAxH)</label><input className="mono" value={nuevoProd.dimensiones} onChange={(e) => setNuevoProd({ ...nuevoProd, dimensiones: e.target.value })} required /></div>
                <div><label>Código Arancelario HS</label><input className="mono" value={nuevoProd.codigoArancelario} onChange={(e) => setNuevoProd({ ...nuevoProd, codigoArancelario: e.target.value })} required /></div>
                <div><label>Precio Base (USD)</label><input className="mono" type="number" step="0.01" value={nuevoProd.precioBaseUsd} onChange={(e) => setNuevoProd({ ...nuevoProd, precioBaseUsd: e.target.value })} required /></div>
                <div><label>Stock Vendible</label><input className="mono" type="number" value={nuevoProd.stock} onChange={(e) => setNuevoProd({ ...nuevoProd, stock: e.target.value })} required /></div>
              </div>
              <div className="form-grid">
                <div><label>Nombre (ES - Base obligatorio RN01)</label><input value={nuevoProd.nombreEs} onChange={(e) => setNuevoProd({ ...nuevoProd, nombreEs: e.target.value })} /></div>
                <div><label>Name (EN)</label><input value={nuevoProd.nombreEn} onChange={(e) => setNuevoProd({ ...nuevoProd, nombreEn: e.target.value })} /></div>
                <div><label>Nome (PT)</label><input value={nuevoProd.nombrePt} onChange={(e) => setNuevoProd({ ...nuevoProd, nombrePt: e.target.value })} /></div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="submit" className="btn btn-accent">Guardar Producto y Calcular Precios en USD/BRL/BOB/EUR</button>
                <button type="button" className="btn btn-outline" onClick={() => setSeccionActiva('INVENTARIO')}>Volver al listado</button>
              </div>
            </form>
          </div>
        )}

        {/* 2. GESTOR DE PEDIDOS Y POSTVENTA (CU06, CU11) */}
        {rol === 'GESTOR_PEDIDOS' && seccionActiva === 'INSPECCION' && (
          <OperationalTable
            titulo="Inspección de Devoluciones por Productos Defectuosos y Control de Reembolsos (CU11 / CU06)"
            subtitulo="RN10 y RN19: Verifica evidencia obligatoria, permite reembolso total o parcial ≤ 100%, aísla unidades dañadas fuera del stock vendible y dispara Nota de Crédito."
            columnas={[
              { key: 'id_reembolso', titulo: 'ID', mono: true, render: (s) => `#${s.id_reembolso}` },
              {
                key: 'id_pedido',
                titulo: 'Pedido / Cliente',
                render: (s) => (
                  <div>
                    <strong className="mono">Pedido #{s.id_pedido}</strong>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{s.nombre_cliente}</div>
                  </div>
                )
              },
              {
                key: 'sku_afectado',
                titulo: 'SKU / Unidades',
                mono: true,
                render: (s) => `${s.sku_afectado || 'N/A'} (${s.unidades_defectuosas} uds)`
              },
              {
                key: 'causal_devolucion',
                titulo: 'Causal y Motivo',
                render: (s) => (
                  <div>
                    <StatusBadge estado={s.causal_devolucion} />
                    <div style={{ fontSize: '11px', marginTop: '3px' }}>{s.motivo}</div>
                  </div>
                )
              },
              {
                key: 'evidencia_ref',
                titulo: 'Evidencia (RN19)',
                mono: true,
                render: (s) => s.evidencia_ref || 'SIN EVIDENCIA'
              },
              {
                key: 'monto',
                titulo: 'Reembolso / Tope (RN10)',
                mono: true,
                render: (s) => (
                  <div>
                    {s.estado === 'PENDIENTE' ? (
                      <input
                        type="number"
                        step="0.01"
                        className="mono"
                        style={{ width: '95px', padding: '4px 6px', fontSize: '12px' }}
                        value={montosParciales[s.id_reembolso] ?? String(s.monto)}
                        onChange={(e) => setMontosParciales({ ...montosParciales, [s.id_reembolso]: e.target.value })}
                      />
                    ) : (
                      <strong>{Number(s.monto).toFixed(2)} {s.moneda}</strong>
                    )}
                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Máx: {s.monto_pago_original} {s.moneda}</div>
                  </div>
                )
              },
              { key: 'estado', titulo: 'Dictamen', render: (s) => <StatusBadge estado={s.estado} /> },
              {
                key: 'acciones',
                titulo: 'Acción de Inspección',
                render: (s) =>
                  s.estado === 'PENDIENTE' ? (
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button className="btn btn-sm btn-accent" onClick={() => resolverDevolucion(s, true)}>
                        Aprobar, Aislar y Reembolsar
                      </button>
                      <button className="btn btn-sm btn-danger" onClick={() => resolverDevolucion(s, false)}>
                        Rechazar
                      </button>
                    </div>
                  ) : (
                    <span className="mono" style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Cerrado</span>
                  )
              }
            ]}
            datos={solicitudesDev}
          />
        )}

        {rol === 'GESTOR_PEDIDOS' && seccionActiva === 'TODOS_PEDIDOS' && (
          <OperationalTable
            titulo="Control Integral de Pedidos Internacionales y Cancelaciones Pre-Despacho (D08 / RN05)"
            subtitulo="Permite cancelar pedidos en estado CREADO o PAGADO antes de preparación logística (con reembolso y Nota de Crédito automática)."
            columnas={[
              { key: 'id_pedido', titulo: 'Pedido', mono: true, render: (p) => `#${p.id_pedido}` },
              { key: 'nombre_cliente', titulo: 'Cliente / País', render: (p) => `${p.nombre_cliente} (${p.pais_destino})` },
              { key: 'tipo_venta', titulo: 'Tipo', render: (p) => <StatusBadge estado="PENDIENTE" texto={p.tipo_venta} /> },
              { key: 'total', titulo: 'Total Congelado', mono: true, render: (p) => `${Number(p.total).toFixed(2)} ${p.moneda}` },
              { key: 'estado', titulo: 'Estado', render: (p) => <StatusBadge estado={p.estado} /> },
              { key: 'guia', titulo: 'Guía Logística', mono: true, render: (p) => p.envio?.numero_guia || 'Sin despacho' },
              {
                key: 'accion',
                titulo: 'Incidencia / Cancelación',
                render: (p) =>
                  (p.estado === 'CREADO' || (p.estado === 'PAGADO' && !p.envio)) ? (
                    <button className="btn btn-sm btn-danger" onClick={() => cancelarPedidoGestor(p.id_pedido)}>
                      <X size={14} /> Cancelar Pedido
                    </button>
                  ) : (
                    <span className="mono" style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>En curso / Cerrado</span>
                  )
              }
            ]}
            datos={todosPedidos}
          />
        )}

        {/* 3. RESPONSABLE DE LOGÍSTICA (CU07, CU08) */}
        {rol === 'LOGISTICA' && seccionActiva === 'GUIAS' && (
          <OperationalTable
            titulo="Pedidos Pagados Listos para Emisión de Guía Internacional en 1 Clic (CU07 / RN08 / RN14)"
            subtitulo="Precondición verificada: Pago APROBADO, peso físico/volumétrico, dimensiones y partida arancelaria HS completos."
            columnas={[
              { key: 'id_pedido', titulo: 'Pedido', mono: true, render: (p) => `#${p.id_pedido}` },
              { key: 'estado', titulo: 'Estado', render: (p) => <StatusBadge estado={p.estado} /> },
              { key: 'nombre_cliente', titulo: 'Cliente / Destino', render: (p) => `${p.nombre_cliente} — ${p.ciudad} (${p.pais_destino})` },
              { key: 'peso_tasable', titulo: 'Peso Tasable', mono: true, render: (p) => `${p.peso_tasable} kg` },
              { key: 'costo_envio', titulo: 'Flete Pactado', mono: true, render: (p) => `${Number(p.costo_envio).toFixed(2)} ${p.moneda}` },
              {
                key: 'accion',
                titulo: 'Emisión de Guía / Preparación (CU07)',
                render: (p) => (
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <button className="btn btn-sm btn-outline" onClick={() => emitirGuiaUnClic(p.id_pedido, 'Courier Global Express', false)}>
                      <Package size={14} /> Preparar (Almacén)
                    </button>
                    <button className="btn btn-sm btn-primary" onClick={() => emitirGuiaUnClic(p.id_pedido, 'Courier Global Express', true)}>
                      <Plane size={14} /> Emitir y Despachar (Courier)
                    </button>
                    <button className="btn btn-sm btn-accent" onClick={() => emitirGuiaUnClic(p.id_pedido, 'DHL Express International', true)}>
                      <Plane size={14} /> Emitir Guía DHL
                    </button>
                  </div>
                )
              }
            ]}
            datos={bandejaLog.pendientesGuia}
            emptyMessage="Todos los pedidos pagados cuentan ya con guía internacional emitida."
          />
        )}

        {rol === 'LOGISTICA' && seccionActiva === 'TRANSITO' && (
          <OperationalTable
            titulo="Control de Tránsito Internacional e Inspección Aduanera (CU08 / Diagrama D09)"
            subtitulo="Actualización de estados de seguimiento sincronizada con el portal del cliente en su idioma."
            columnas={[
              {
                key: 'numero_guia',
                titulo: 'Número de Guía',
                mono: true,
                render: (e) => (
                  <div>
                    <strong>{e.numero_guia}</strong>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{e.etiqueta_exportacion}</div>
                  </div>
                )
              },
              { key: 'id_pedido', titulo: 'Pedido / Destino', render: (e) => `Pedido #${e.id_pedido} → ${e.ciudad} (${e.pais_destino})` },
              { key: 'operador', titulo: 'Operador Logístico' },
              { key: 'estado', titulo: 'Estado Actual', render: (e) => <StatusBadge estado={e.estado} /> },
              {
                key: 'hitos',
                titulo: 'Actualizar Hito Aduanero / Entrega',
                render: (e) => (
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <button
                      className="btn btn-sm btn-outline"
                      onClick={() => setDocImprimible({ tipo: 'ETIQUETA_CN23', datos: e })}
                    >
                      <Printer size={14} /> Etiqueta CN23
                    </button>
                    {e.estado === 'PENDIENTE' && (
                      <button className="btn btn-sm btn-primary" onClick={() => avanzarEstadoEnvio(e.id_envio, 'EN_TRANSITO', 'Paquete recolectado por operador internacional')}>
                        <Truck size={14} /> Despachar a Tránsito
                      </button>
                    )}
                    {e.estado === 'EN_TRANSITO' && (
                      <>
                        <button className="btn btn-sm btn-amber" onClick={() => avanzarEstadoEnvio(e.id_envio, 'EN_ADUANA', 'Ingreso a revisión aduanera en país destino')}>
                          <Landmark size={14} /> Ingresar a Aduana
                        </button>
                        <button className="btn btn-sm btn-accent" onClick={() => avanzarEstadoEnvio(e.id_envio, 'ENTREGADO', 'Recepción final confirmada por destinatario')}>
                          <CheckCircle2 size={14} /> Confirmar Entrega
                        </button>
                      </>
                    )}
                    {e.estado === 'EN_ADUANA' && (
                      <>
                        <button className="btn btn-sm btn-primary" onClick={() => avanzarEstadoEnvio(e.id_envio, 'EN_TRANSITO', 'Mercancía liberada por aduana nacional')}>
                          Liberar Aduana → Tránsito
                        </button>
                        <button className="btn btn-sm btn-danger" onClick={() => avanzarEstadoEnvio(e.id_envio, 'DEVUELTO', 'Importación rechazada por aduana')}>
                          Rechazo Aduanero
                        </button>
                      </>
                    )}
                    {(e.estado === 'ENTREGADO' || e.estado === 'DEVUELTO') && (
                      <span className="mono" style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Estado Terminal</span>
                    )}
                  </div>
                )
              }
            ]}
            datos={bandejaLog.despachos}
          />
        )}

        {/* 4. RESPONSABLE DE FACTURACIÓN (CU09 - Inmutabilidad Visual RN16) */}
        {rol === 'FACTURACION' && (
          <OperationalTable
            titulo="Registro Fiscal de Facturas Comerciales y Notas de Crédito Vinculadas (CU09 / RN15 / RN16)"
            subtitulo="RN16: Todo comprobante emitido es estrictamente de solo lectura; las devoluciones se respaldan con Nota de Crédito."
            accionesCabecera={
              <button className="btn btn-audit-probe" onClick={simularIntentoAlteracionFactura}>
                <FlaskConical size={14} /> Simular intento de alteración (Prueba de auditoría RN16)
              </button>
            }
            columnas={[
              { key: 'tipo_documento', titulo: 'Tipo', render: (f) => <StatusBadge estado={f.tipo_documento} /> },
              { key: 'numero', titulo: 'Número Correlativo', mono: true, render: (f) => <strong>{f.numero}</strong> },
              { key: 'id_pedido', titulo: 'Pedido / Cliente', render: (f) => `Pedido #${f.id_pedido} — ${f.nombre_cliente}` },
              { key: 'pais', titulo: 'Jurisdicción / ID Fiscal', mono: true, render: (f) => `${f.pais} (${f.datos_fiscales_cliente})` },
              { key: 'subtotal', titulo: 'Subtotal + Imp.', mono: true, render: (f) => `${Number(f.subtotal).toFixed(2)} + ${Number(f.impuestos).toFixed(2)} ${f.moneda}` },
              { key: 'total', titulo: 'Total Emitido', mono: true, render: (f) => <strong>{Number(f.total).toFixed(2)} {f.moneda}</strong> },
              {
                key: 'inmutabilidad',
                titulo: 'Control Documental (RN16)',
                render: (f) => (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                    <ImmutableTag />
                    <button
                      className="btn btn-sm btn-outline"
                      onClick={() => setDocImprimible({ tipo: 'COMPROBANTE', datos: f })}
                    >
                      <Printer size={14} /> Ver / Imprimir
                    </button>
                    {f.factura_origen_numero && (
                      <span className="mono" style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                        Vinculada a {f.factura_origen_numero}
                      </span>
                    )}
                  </div>
                )
              }
            ]}
            datos={facturas}
          />
        )}

        {/* 5. GERENTE: REPORTES MULTIDIMENSIONALES Y ESTADÍSTICAS (CU12) */}
        {rol === 'GERENTE' && estadisticas && (
          <div>
            <div className="kpi-grid">
              <div className="kpi-box">
                <small style={{ color: 'var(--color-text-muted)', fontWeight: 600 }}>Ingresos Consolidados (Moneda Base)</small>
                <div className="kpi-val" style={{ color: 'var(--color-brand)' }}>
                  ${Number(estadisticas.ingresosConsolidadosUsd).toFixed(2)} USD
                </div>
              </div>
              <div className="kpi-box">
                <small style={{ color: 'var(--color-text-muted)', fontWeight: 600 }}>Pedidos Internacionales Operados</small>
                <div className="kpi-val">{estadisticas.totalPedidosOperados}</div>
              </div>
              <div className="kpi-box" style={{ borderLeftColor: 'var(--color-sec-accent)' }}>
                <small style={{ color: 'var(--color-text-muted)', fontWeight: 600 }}>Tasa de Devolución por Defectos</small>
                <div className="kpi-val" style={{ color: 'var(--color-sec-accent)' }}>
                  {estadisticas.tasaDevolucionDefectosPct}%
                </div>
              </div>
            </div>

            {seccionActiva === 'REPORTE_MULTI' && reporteMulti && (
              <OperationalTable
                titulo="Reporte Gerencial Controlado Multidimensional (RF20 / CA-FUNC-10)"
                subtitulo={`Coincidencias exactas: ${reporteMulti.cantidadRegistros} pedidos • Total consolidado en moneda base: $${Number(reporteMulti.totalConsolidadoUsd).toFixed(2)} USD`}
                accionesCabecera={
                  <>
                    <button className="btn btn-sm btn-accent" onClick={exportarReporteCsv}>
                      <Download size={15} /> Exportar CSV (CU12)
                    </button>
                    <button className="btn btn-sm btn-outline" onClick={() => window.print()}>
                      <Printer size={15} /> Imprimir / PDF
                    </button>
                  </>
                }
                filtrosSlot={
                  <div className="form-grid" style={{ alignItems: 'end' }}>
                    <div>
                      <label>País Destino</label>
                      <select value={filtros.pais} onChange={(e) => setFiltros({ ...filtros, pais: e.target.value })}>
                        <option value="TODOS">TODOS LOS PAÍSES</option>
                        {parametros?.paises?.map((p: any) => (
                          <option key={p.codigo_pais} value={p.codigo_pais}>{p.nombre} ({p.codigo_pais})</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label>Tipo de Venta</label>
                      <select value={filtros.tipoVenta} onChange={(e) => setFiltros({ ...filtros, tipoVenta: e.target.value })}>
                        <option value="TODOS">TODOS</option>
                        <option value="MINORISTA">MINORISTA</option>
                        <option value="MAYORISTA">MAYORISTA</option>
                        <option value="PROMOCIONAL">PROMOCIONAL</option>
                      </select>
                    </div>
                    <div>
                      <label>Idioma Operación</label>
                      <select value={filtros.idioma} onChange={(e) => setFiltros({ ...filtros, idioma: e.target.value })}>
                        <option value="TODOS">TODOS (ES / EN / PT)</option>
                        <option value="ES">ES — Español</option>
                        <option value="EN">EN — English</option>
                        <option value="PT">PT — Português</option>
                      </select>
                    </div>
                    <div>
                      <label>Moneda Cobro</label>
                      <select value={filtros.moneda} onChange={(e) => setFiltros({ ...filtros, moneda: e.target.value })}>
                        <option value="TODOS">TODAS</option>
                        <option value="USD">USD</option>
                        <option value="BRL">BRL</option>
                        <option value="BOB">BOB</option>
                        <option value="EUR">EUR</option>
                      </select>
                    </div>
                    <div>
                      <label>Fecha Desde</label>
                      <input type="date" className="mono" value={filtros.fechaDesde} onChange={(e) => setFiltros({ ...filtros, fechaDesde: e.target.value })} />
                    </div>
                    <div>
                      <label>Fecha Hasta</label>
                      <input type="date" className="mono" value={filtros.fechaHasta} onChange={(e) => setFiltros({ ...filtros, fechaHasta: e.target.value })} />
                    </div>
                    <div>
                      <button className="btn btn-primary" style={{ width: '100%' }} onClick={consultarReporteFiltrado}>
                        Filtrar Reporte
                      </button>
                    </div>
                  </div>
                }
                columnas={[
                  { key: 'id_pedido', titulo: 'Pedido', mono: true, render: (r) => `#${r.id_pedido}` },
                  { key: 'cliente', titulo: 'Cliente' },
                  { key: 'pais', titulo: 'País', render: (r) => `${r.nombre_pais} (${r.pais})` },
                  { key: 'tipo_venta', titulo: 'Tipo Venta', render: (r) => <StatusBadge estado="PENDIENTE" texto={r.tipo_venta} /> },
                  { key: 'idioma_operacion', titulo: 'Idioma', mono: true },
                  { key: 'total', titulo: 'Total Divisa', mono: true, render: (r) => `${Number(r.total).toFixed(2)} ${r.moneda}` },
                  { key: 'equivalente_usd', titulo: 'Equiv. Base USD', mono: true, render: (r) => <strong>${Number(r.equivalente_usd).toFixed(2)}</strong> },
                  { key: 'estado', titulo: 'Estado / Factura', render: (r) => <StatusBadge estado={r.estado} texto={`${r.estado} ${r.numero_factura ? `• ${r.numero_factura}` : ''}`} /> }
                ]}
                datos={reporteMulti.registros}
              />
            )}

            {seccionActiva === 'DEMANDA' && (
              <div className="form-grid">
                <OperationalTable
                  titulo="Ranking de Productos Más Demandados (RF24)"
                  columnas={[
                    { key: 'codigo', titulo: 'SKU', mono: true },
                    { key: 'nombre', titulo: 'Producto', render: (p) => <strong>{p.nombre}</strong> },
                    { key: 'solicitudes_clientes', titulo: 'Interacciones', mono: true, render: (p) => `${p.solicitudes_clientes} consultas` },
                    { key: 'unidades_vendidas', titulo: 'Vendidos', mono: true, render: (p) => <strong>{p.unidades_vendidas} uds</strong> }
                  ]}
                  datos={estadisticas.rankingProductosDemandados}
                />
                <OperationalTable
                  titulo="Mayores Solicitudes y Búsquedas de Clientes (RF24)"
                  columnas={[
                    { key: 'tipo_solicitud', titulo: 'Tipo Evento' },
                    { key: 'referencia', titulo: 'Referencia / Término', render: (m) => <strong>{m.referencia}</strong> },
                    { key: 'pais', titulo: 'País / Idioma', mono: true, render: (m) => `${m.pais} / ${m.idioma}` },
                    { key: 'frecuencia', titulo: 'Frec.', mono: true }
                  ]}
                  datos={estadisticas.mayoresSolicitudesClientes}
                />
              </div>
            )}
          </div>
        )}

        {/* 6. ADMINISTRADOR DEL SISTEMA: PARÁMETROS OPERATIVOS SIN SEGURIDAD (CU13, RN20) */}
        {rol === 'ADMINISTRADOR' && seccionActiva === 'PAISES_IMPUESTOS' && (
          <div>
            <div className="card">
              <h3 className="section-subtitle">Configurar País Destino, IVA y Reglas Aduaneras sin Recompilar (RF22 / RNF09)</h3>
              <form onSubmit={guardarPaisParametrico} className="form-grid" style={{ alignItems: 'end' }}>
                <div><label>Código ISO País</label><input className="mono" value={nuevoPais.codigoPais} onChange={(e) => setNuevoPais({ ...nuevoPais, codigoPais: e.target.value })} required /></div>
                <div><label>Nombre País</label><input value={nuevoPais.nombre} onChange={(e) => setNuevoPais({ ...nuevoPais, nombre: e.target.value })} required /></div>
                <div><label>Moneda Local</label><input className="mono" value={nuevoPais.monedaLocal} onChange={(e) => setNuevoPais({ ...nuevoPais, monedaLocal: e.target.value })} required /></div>
                <div><label>Idioma Defecto</label><input className="mono" value={nuevoPais.idiomaDefecto} onChange={(e) => setNuevoPais({ ...nuevoPais, idiomaDefecto: e.target.value })} required /></div>
                <div><label>Tasa IVA (0 a 1)</label><input className="mono" type="number" step="0.01" value={nuevoPais.tasaIva} onChange={(e) => setNuevoPais({ ...nuevoPais, tasaIva: e.target.value })} required /></div>
                <div><label>Tarifa Zona USD/kg</label><input className="mono" type="number" step="0.5" value={nuevoPais.tarifaZonaUsdKg} onChange={(e) => setNuevoPais({ ...nuevoPais, tarifaZonaUsdKg: e.target.value })} required /></div>
                <div><button type="submit" className="btn btn-primary" style={{ width: '100%' }}>Guardar País Paramétrico</button></div>
              </form>
            </div>

            <OperationalTable
              titulo="Catálogo Paramétrico de Países, Tasas Impositivas y Restricciones Aduaneras (RN12)"
              columnas={[
                { key: 'codigo_pais', titulo: 'ISO', mono: true },
                { key: 'nombre', titulo: 'País', render: (p) => <strong>{p.nombre}</strong> },
                { key: 'moneda_local', titulo: 'Moneda / Idioma', mono: true, render: (p) => `${p.moneda_local} / ${p.idioma_defecto}` },
                { key: 'tasa_iva', titulo: 'Tasa IVA', mono: true, render: (p) => `${(Number(p.tasa_iva) * 100).toFixed(1)}%` },
                { key: 'tarifa_zona_usd_kg', titulo: 'Tarifa Contingencia', mono: true, render: (p) => `$${Number(p.tarifa_zona_usd_kg).toFixed(2)} USD/kg` },
                { key: 'categorias_restringidas', titulo: 'Categorías Restringidas', render: (p) => p.categorias_restringidas || 'Ninguna' },
                { key: 'habilitado', titulo: 'Estado', render: (p) => <StatusBadge estado={p.habilitado ? 'HABILITADO' : 'RECHAZADO'} texto={p.habilitado ? 'HABILITADO' : 'BLOQUEADO RN12'} /> }
              ]}
              datos={parametros?.paises || []}
            />
          </div>
        )}

        {rol === 'ADMINISTRADOR' && seccionActiva === 'MONEDAS_TASAS' && (
          <div>
            <div className="card">
              <h3 className="section-subtitle">Configurar Divisas Habilitadas y Tasas de Cambio (PARAM_MONEDA / RF22)</h3>
              <form onSubmit={guardarMonedaParametrica} className="form-grid" style={{ alignItems: 'end' }}>
                <div><label>Código ISO (ej. GBP)</label><input className="mono" value={nuevaMoneda.codigoMoneda} onChange={(e) => setNuevaMoneda({ ...nuevaMoneda, codigoMoneda: e.target.value })} required /></div>
                <div><label>Nombre Divisa</label><input value={nuevaMoneda.nombre} onChange={(e) => setNuevaMoneda({ ...nuevaMoneda, nombre: e.target.value })} required /></div>
                <div><label>Símbolo</label><input className="mono" value={nuevaMoneda.simbolo} onChange={(e) => setNuevaMoneda({ ...nuevaMoneda, simbolo: e.target.value })} required /></div>
                <div><label>Tasa respecto a 1 USD</label><input className="mono" type="number" step="0.0001" value={nuevaMoneda.tasaRespectoUsd} onChange={(e) => setNuevaMoneda({ ...nuevaMoneda, tasaRespectoUsd: e.target.value })} required /></div>
                <div><button type="submit" className="btn btn-primary" style={{ width: '100%' }}>Guardar Divisa y Tasa</button></div>
              </form>
            </div>
            <OperationalTable
              titulo="Monedas Activas y Tasas Vigentes (RNF09)"
              columnas={[
                { key: 'codigo_moneda', titulo: 'ISO', mono: true },
                { key: 'nombre', titulo: 'Moneda', render: (m) => <strong>{m.nombre}</strong> },
                { key: 'simbolo', titulo: 'Símbolo', mono: true },
                { key: 'es_base', titulo: 'Moneda Base', render: (m) => m.es_base ? <StatusBadge estado="APROBADO" texto="BASE USD" /> : 'Secundaria' }
              ]}
              datos={parametros?.monedas || []}
            />
          </div>
        )}

        {rol === 'ADMINISTRADOR' && seccionActiva === 'ARANCELES_HS' && (
          <div>
            <div className="card">
              <h3 className="section-subtitle">Configurar Partidas Arancelarias HS y Restricciones por País (PARAM_ARANCEL / RN12)</h3>
              <form onSubmit={guardarArancelParametrico} className="form-grid" style={{ alignItems: 'end' }}>
                <div>
                  <label>País Destino</label>
                  <select value={nuevoArancel.codigoPais} onChange={(e) => setNuevoArancel({ ...nuevoArancel, codigoPais: e.target.value })}>
                    {parametros?.paises?.map((p: any) => (
                      <option key={p.codigo_pais} value={p.codigo_pais}>{p.nombre} ({p.codigo_pais})</option>
                    ))}
                  </select>
                </div>
                <div><label>Código Arancelario HS</label><input className="mono" value={nuevoArancel.codigoArancelario} onChange={(e) => setNuevoArancel({ ...nuevoArancel, codigoArancelario: e.target.value })} required /></div>
                <div><label>Tasa Arancel (0 a 1)</label><input className="mono" type="number" step="0.01" value={nuevoArancel.tasaArancel} onChange={(e) => setNuevoArancel({ ...nuevoArancel, tasaArancel: e.target.value })} required /></div>
                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input type="checkbox" style={{ width: 'auto' }} checked={nuevoArancel.restringido} onChange={(e) => setNuevoArancel({ ...nuevoArancel, restringido: e.target.checked })} />
                    Partida Restringida (RN12)
                  </label>
                </div>
                <div><button type="submit" className="btn btn-primary" style={{ width: '100%' }}>Guardar Partida HS</button></div>
              </form>
            </div>
            <OperationalTable
              titulo="Tabla Paramétrica de Aranceles Aduaneros (PARAM_ARANCEL)"
              columnas={[
                { key: 'codigo_pais', titulo: 'País', mono: true, render: (a) => `${a.nombre_pais} (${a.codigo_pais})` },
                { key: 'codigo_arancelario', titulo: 'Partida HS', mono: true },
                { key: 'tasa_arancel', titulo: 'Tasa Arancel', mono: true, render: (a) => `${(Number(a.tasa_arancel) * 100).toFixed(1)}%` },
                { key: 'restringido', titulo: 'Control Aduanero', render: (a) => <StatusBadge estado={a.restringido ? 'RECHAZADO' : 'APROBADO'} texto={a.restringido ? 'RESTRINGIDO RN12' : 'PERMITIDO'} /> }
              ]}
              datos={aranceles}
            />
          </div>
        )}

        {rol === 'ADMINISTRADOR' && seccionActiva === 'OPERADORES_IDIOMAS' && (
          <div style={{ display: 'grid', gap: '16px' }}>
            <div className="card">
              <h3 className="section-subtitle">Configurar Operadores Logísticos Internacionales (PARAM_OPERADOR_LOGISTICO)</h3>
              <form onSubmit={guardarOperadorParametrico} className="form-grid" style={{ alignItems: 'end' }}>
                <div><label>Código Operador</label><input className="mono" value={nuevoOperador.codigoOperador} onChange={(e) => setNuevoOperador({ ...nuevoOperador, codigoOperador: e.target.value })} required /></div>
                <div><label>Nombre Comercial</label><input value={nuevoOperador.nombre} onChange={(e) => setNuevoOperador({ ...nuevoOperador, nombre: e.target.value })} required /></div>
                <div><label>Tarifa Base (USD)</label><input className="mono" type="number" step="0.5" value={nuevoOperador.tarifaBaseUsd} onChange={(e) => setNuevoOperador({ ...nuevoOperador, tarifaBaseUsd: e.target.value })} required /></div>
                <div><label>Días Estimados</label><input className="mono" type="number" value={nuevoOperador.diasEstimados} onChange={(e) => setNuevoOperador({ ...nuevoOperador, diasEstimados: e.target.value })} required /></div>
                <div><button type="submit" className="btn btn-primary" style={{ width: '100%' }}>Guardar Operador</button></div>
              </form>
            </div>
            <div className="card">
              <h3 className="section-subtitle">Configurar Idiomas Soportados del Portal (PARAM_IDIOMA / RNF07)</h3>
              <form onSubmit={guardarIdiomaParametrico} className="form-grid" style={{ alignItems: 'end' }}>
                <div><label>Código ISO Idioma</label><input className="mono" value={nuevoIdioma.codigoIdioma} onChange={(e) => setNuevoIdioma({ ...nuevoIdioma, codigoIdioma: e.target.value })} required /></div>
                <div><label>Nombre Idioma</label><input value={nuevoIdioma.nombre} onChange={(e) => setNuevoIdioma({ ...nuevoIdioma, nombre: e.target.value })} required /></div>
                <div><button type="submit" className="btn btn-accent" style={{ width: '100%' }}>Guardar Idioma</button></div>
              </form>
            </div>
          </div>
        )}

        {rol === 'ADMINISTRADOR' && seccionActiva === 'SEGREGACION' && (
          <div className="card">
            <h3 className="section-subtitle">Verificación de Segregación Estricta de Funciones (RN20 / CA-FUNC-12)</h3>
            <p style={{ color: 'var(--color-text-muted)' }}>
              Conforme a <b>RN20</b> y <b>DESIGN.md §4</b>, el rol <code>ADMINISTRADOR</code> opera exclusivamente sobre tablas paramétricas comerciales y no posee controles ni permisos sobre usuarios, hashes <code>bcrypt</code> ni la bitácora <code>AUDITORIA</code>.
            </p>
            <button className="btn btn-audit-probe" onClick={probarViolacionSegregacionRn20}>
              <FlaskConical size={14} /> Simular intento de acceso cruzado a /api/seguridad/usuarios (Demostrar Bloqueo 403 + Auditoría)
            </button>
          </div>
        )}
      </div>

      {/* MODAL DE EDICIÓN DE PRODUCTO (CU01) */}
      {prodEditModal && (
        <div className="modal-backdrop">
          <div className="modal-box" style={{ maxWidth: '640px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 className="section-subtitle icon-inline" style={{ margin: 0 }}>
                <Pencil size={17} /> Editar Producto {prodEditModal.codigo} (CU01)
              </h3>
              <button className="btn btn-sm btn-outline" onClick={() => setProdEditModal(null)} aria-label="Cerrar">
                <X size={15} />
              </button>
            </div>
            <form onSubmit={guardarEdicionProducto} style={{ display: 'grid', gap: '12px' }}>
              <div className="form-grid">
                <div><label>Categoría</label><input value={prodEditModal.categoria} onChange={(e) => setProdEditModal({ ...prodEditModal, categoria: e.target.value })} required /></div>
                <div><label>Partida HS</label><input className="mono" value={prodEditModal.codigoArancelario} onChange={(e) => setProdEditModal({ ...prodEditModal, codigoArancelario: e.target.value })} required /></div>
                <div><label>Precio Base (USD)</label><input className="mono" type="number" step="0.01" value={prodEditModal.precioBaseUsd} onChange={(e) => setProdEditModal({ ...prodEditModal, precioBaseUsd: e.target.value })} required /></div>
                <div><label>Stock Vendible</label><input className="mono" type="number" value={prodEditModal.stock} onChange={(e) => setProdEditModal({ ...prodEditModal, stock: e.target.value })} required /></div>
                <div><label>Peso (kg)</label><input className="mono" type="number" step="0.01" value={prodEditModal.pesoKg} onChange={(e) => setProdEditModal({ ...prodEditModal, pesoKg: e.target.value })} required /></div>
                <div><label>Dimensiones</label><input className="mono" value={prodEditModal.dimensiones} onChange={(e) => setProdEditModal({ ...prodEditModal, dimensiones: e.target.value })} required /></div>
              </div>
              <div className="form-grid">
                <div><label>Nombre (ES)</label><input value={prodEditModal.nombreEs} onChange={(e) => setProdEditModal({ ...prodEditModal, nombreEs: e.target.value })} required /></div>
                <div><label>Name (EN)</label><input value={prodEditModal.nombreEn} onChange={(e) => setProdEditModal({ ...prodEditModal, nombreEn: e.target.value })} /></div>
                <div><label>Nome (PT)</label><input value={prodEditModal.nombrePt} onChange={(e) => setProdEditModal({ ...prodEditModal, nombrePt: e.target.value })} /></div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input type="checkbox" style={{ width: 'auto' }} checked={prodEditModal.estado} onChange={(e) => setProdEditModal({ ...prodEditModal, estado: e.target.checked })} />
                Producto Activo en Catálogo Público
              </label>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-outline" onClick={() => setProdEditModal(null)}>Cancelar</button>
                <button type="submit" className="btn btn-accent">Guardar Cambios y Recalcular Divisas</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE COMPROBANTE TRIBUTARIO / ETIQUETA CN23 IMPRIMIBLE */}
      {docImprimible && (
        <DocumentoImprimibleModal
          tipo={docImprimible.tipo}
          datos={docImprimible.datos}
          onCerrar={() => setDocImprimible(null)}
        />
      )}
    </div>
  );
};
