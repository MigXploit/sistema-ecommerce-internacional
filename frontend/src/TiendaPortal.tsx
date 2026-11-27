import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CreditCard,
  Plane,
  Printer,
  Radar,
  RefreshCw,
  Scale,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Trash2,
  User,
  X
} from 'lucide-react';
import { apiFetch, UsuarioSesion } from './api';
import { IdiomaCode, MonedaCode, TEXTOS } from './i18n';
import { ProductCard } from './components/ProductCard';
import { CheckoutStepper, ItemCarrito } from './components/CheckoutStepper';
import { ImmutableTag, StatusBadge } from './components/StatusBadge';
import { OperationalTable } from './components/OperationalTable';
import { DocumentoImprimibleModal } from './components/DocumentoImprimibleModal';
import {
  modalConfirmarEnvioReclamo,
  modalConfirmarPagoCongelado,
  modalConfirmarVaciarCarrito,
  modalErrorValidacionOAduana,
  modalExitoReclamo,
  modalLimpiarPedidosInmutablesRn16,
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
  busqueda: string;
  categoria: string;
  busquedaTrigger: number;
  onCategoriasDetectadas: (cats: string[]) => void;
  carritoAbierto: boolean;
  setCarritoAbierto: (v: boolean) => void;
  onCantidadCarritoChange: (n: number) => void;
  onCambiarVista: (v: 'TIENDA' | 'MIS_PEDIDOS' | 'RASTREO') => void;
  onRastrearGuia: (guia: string) => void;
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
  busqueda,
  categoria,
  busquedaTrigger,
  onCategoriasDetectadas,
  carritoAbierto,
  setCarritoAbierto,
  onCantidadCarritoChange,
  onCambiarVista,
  onRastrearGuia,
  notificar,
  pedirLogin
}) => {
  const t = TEXTOS[idioma];
  const [productos, setProductos] = useState<any[]>([]);
  const [cargandoCatalogo, setCargandoCatalogo] = useState(false);
  const [precioMin, setPrecioMin] = useState<string>('');
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

  // Mis pedidos, perfil, comprobantes y postventa
  const [misPedidos, setMisPedidos] = useState<any[]>([]);
  const [notificaciones, setNotificaciones] = useState<any[]>([]);
  const [comprobanteModal, setComprobanteModal] = useState<any | null>(null);
  const [mostrarPerfil, setMostrarPerfil] = useState(false);
  const [perfilForm, setPerfilForm] = useState({
    nombres: '',
    apellidos: '',
    pais: 'BR',
    idioma: 'ES',
    monedaPreferida: 'USD',
    datosFiscales: ''
  });
  const [devolucionModal, setDevolucionModal] = useState<any | null>(null);
  const [formDev, setFormDev] = useState({
    idProductoAfectado: 0,
    causalDevolucion: 'PRODUCTO_DEFECTUOSO',
    unidadesDefectuosas: 1,
    montoSolicitado: '',
    motivo: '',
    evidenciaRef: 'EVID-FOTO-CLIENTE-2026.jpg'
  });

  const cargarCatalogo = async () => {
    setCargandoCatalogo(true);
    try {
      const qs = new URLSearchParams({
        idioma,
        moneda,
        ...(categoria !== 'TODAS' ? { categoria } : {}),
        ...(busqueda.trim() ? { q: busqueda.trim() } : {}),
        ...(precioMin.trim() && Number(precioMin) > 0 ? { precioMin: precioMin.trim() } : {}),
        ...(precioMax.trim() && Number(precioMax) > 0 ? { precioMax: precioMax.trim() } : {}),
        ...(usuario?.pais ? { paisCliente: usuario.pais } : {})
      });
      const data = await apiFetch<any[]>(`/api/catalogo?${qs.toString()}`);
      setProductos(data);
      if (categoria === 'TODAS' && !busqueda.trim() && !precioMin && !precioMax) {
        const cats = ['TODAS', ...Array.from(new Set(data.map((p) => p.categoria)))];
        onCategoriasDetectadas(cats);
      }
    } catch (e: any) {
      notificar('err', e.message);
    } finally {
      setCargandoCatalogo(false);
    }
  };

  useEffect(() => {
    if (vista === 'CATALOGO') {
      cargarCatalogo();
    }
  }, [idioma, moneda, categoria, vista, busquedaTrigger]);

  // Sincronizar contador animado del carrito en el HeaderGlobal
  useEffect(() => {
    const totalUds = carrito.reduce((acc, it) => acc + it.cantidad, 0);
    onCantidadCarritoChange(totalUds);
  }, [carrito]);

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

    // Toast rápido 3.5s (CU03 - DESIGN.md §5.1) y abrir Checkout Drawer
    toastExito(
      `${prod.nombre_localizado} ${t.toastCarritoAgregado}`,
      `${prod.codigo} • ${prod.simboloMoneda} ${Number(prod.precioConvertido).toFixed(2)} ${prod.moneda}`
    );
    setCarritoAbierto(true);
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

  const vaciarCarritoConConfirmacion = async () => {
    const totalUds = carrito.reduce((acc, it) => acc + it.cantidad, 0);
    if (totalUds === 0) return;
    const confirmado = await modalConfirmarVaciarCarrito(idioma, totalUds);
    if (!confirmado) return;
    setCarrito([]);
    setCotizacion(null);
    setPedidoCreado(null);
    setPasoCheckout(1);
    toastInfo('Carrito internacional vaciado', '0 uds');
  };

  const limpiarOCancelarPedidos = async () => {
    if (!token) return;
    const pendientesCreados = misPedidos.filter((p) => p.estado === 'CREADO');
    const protegidos = misPedidos.filter(
      (p) => p.estado !== 'CREADO' && p.estado !== 'CANCELADO'
    );
    const facturasEjemplo = protegidos
      .flatMap((p) => (p.facturas || []).map((f: any) => f.numero))
      .filter(Boolean);

    let canceladosCount = 0;
    for (const ped of pendientesCreados) {
      try {
        await apiFetch(`/api/pedidos/${ped.id_pedido}/cancelar`, { method: 'POST' }, token);
        canceladosCount++;
      } catch {
        // continuar con el resto
      }
    }

    if (canceladosCount > 0) {
      await cargarMisPedidos();
    }

    if (protegidos.length > 0) {
      const accion = await modalLimpiarPedidosInmutablesRn16({
        canceladosCount,
        protegidosCount: protegidos.length,
        facturasEjemplo
      });
      if (accion === 'RESTAURAR_DEMO') {
        setCarrito([]);
        setCotizacion(null);
        setPedidoCreado(null);
        setPagoConfirmado(null);
        setPasoCheckout(1);
        await cargarMisPedidos();
        toastInfo(
          'Vista demo restablecida con los registros iniciales verificados',
          'RN05 / RN16 intactos'
        );
      }
      return;
    }

    if (canceladosCount > 0) {
      toastExito(
        `Se cancelaron ${canceladosCount} pedido(s) en estado CREADO`,
        'CREADO → CANCELADO (RN05)'
      );
    } else {
      toastInfo('No hay pedidos pendientes en estado CREADO para cancelar');
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

  const cargarPerfil = async () => {
    if (!token || usuario?.tipoCuenta !== 'CLIENTE') return;
    try {
      const p = await apiFetch<any>('/api/clientes/perfil', {}, token);
      setPerfilForm({
        nombres: p.nombres || '',
        apellidos: p.apellidos || '',
        pais: p.pais || 'BR',
        idioma: p.idioma || 'ES',
        monedaPreferida: p.moneda_preferida || 'USD',
        datosFiscales: p.datos_fiscales || ''
      });
    } catch {
      // ignore
    }
  };

  const guardarPerfil = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    try {
      const resp = await apiFetch('/api/clientes/perfil', {
        method: 'PUT',
        body: JSON.stringify(perfilForm)
      }, token);
      toastExito(resp.mensaje, perfilForm.datosFiscales);
      setMostrarPerfil(false);
    } catch (err: any) {
      await modalErrorValidacionOAduana({ idioma, mensaje: err.message, codigoRef: 'RF05' });
    }
  };

  const eliminarDireccion = async (idDir: number) => {
    if (!token) return;
    try {
      const resp = await apiFetch(`/api/clientes/direcciones/${idDir}`, { method: 'DELETE' }, token);
      toastInfo(resp.mensaje);
      const dirs = await apiFetch<any[]>('/api/clientes/mis-direcciones', {}, token);
      setDirecciones(dirs);
    } catch (err: any) {
      await modalErrorValidacionOAduana({ idioma, mensaje: err.message, codigoRef: 'RF06' });
    }
  };

  const pagarPedidoPendiente = async (ped: any) => {
    if (!token) return;
    const equivUsd = Number(ped.tasa_aplicada) > 0 ? Number(ped.total) / Number(ped.tasa_aplicada) : Number(ped.total);
    const confirmado = await modalConfirmarPagoCongelado({
      idioma,
      idPedido: ped.id_pedido,
      total: Number(ped.total),
      moneda: ped.moneda,
      equivalenteUsd: equivUsd,
      medioPago: 'TARJETA'
    });
    if (!confirmado) return;
    try {
      const resp = await apiFetch('/api/pagos/procesar', {
        method: 'POST',
        body: JSON.stringify({
          idPedido: ped.id_pedido,
          medioPago: 'TARJETA',
          tokenPago: `tok_reintento_${Date.now()}`,
          claveIdempotencia: `RETRY-${ped.id_pedido}-${Date.now()}`
        })
      }, token);
      cargarMisPedidos();
      await modalPagoAprobadoExito({
        idioma,
        referenciaPasarela: resp.referenciaPasarela,
        numeroFactura: resp.factura?.numero || 'EMITIDA',
        monto: resp.montoCobrado,
        moneda: resp.moneda,
        equivalenteUsd: resp.equivalenteBaseUsd
      });
    } catch (err: any) {
      await modalErrorValidacionOAduana({ idioma, mensaje: err.message, codigoRef: 'CU05' });
    }
  };

  const cancelarPedido = async (idPedido: number) => {
    if (!token) return;
    try {
      const resp = await apiFetch(`/api/pedidos/${idPedido}/cancelar`, { method: 'POST' }, token);
      toastInfo(resp.mensaje, `Pedido #${idPedido}`);
      cargarMisPedidos();
    } catch (err: any) {
      await modalErrorValidacionOAduana({ idioma, mensaje: err.message, codigoRef: 'D08 / RN05' });
    }
  };

  const abrirModalDevolucion = (ped: any) => {
    const primerItem = ped.detalles?.[0];
    const montoInicial = primerItem ? Number(primerItem.precio_unitario).toFixed(2) : Number(ped.total).toFixed(2);
    setFormDev({
      idProductoAfectado: primerItem?.id_producto || 0,
      causalDevolucion: 'PRODUCTO_DEFECTUOSO',
      unidadesDefectuosas: 1,
      montoSolicitado: Math.min(Number(montoInicial), Number(ped.total)).toFixed(2),
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
          montoSolicitado: formDev.montoSolicitado ? Number(formDev.montoSolicitado) : devolucionModal.total,
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
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              className="btn btn-outline"
              onClick={() => {
                if (!mostrarPerfil) cargarPerfil();
                setMostrarPerfil(!mostrarPerfil);
              }}
            >
              <User size={15} /> {mostrarPerfil ? 'Ocultar Perfil y Direcciones' : 'Mi Perfil y Direcciones (RF05/RF06)'}
            </button>
            <button
              className="btn btn-outline"
              style={{ color: 'var(--state-err-text)', borderColor: '#FCA5A5' }}
              onClick={limpiarOCancelarPedidos}
            >
              <Trash2 size={15} /> Limpiar / Cancelar pedidos
            </button>
            <button className="btn btn-outline" onClick={cargarMisPedidos}>
              <RefreshCw size={15} /> {t.actualizarEstado}
            </button>
          </div>
        </div>

        {mostrarPerfil && (
          <div className="card">
            <h3 className="section-subtitle icon-inline">
              <User size={18} /> Perfil Fiscal Internacional y Libreta de Direcciones (RF05 / RF06)
            </h3>
            <div className="form-grid">
              <form onSubmit={guardarPerfil} style={{ display: 'grid', gap: '10px' }}>
                <div className="form-grid">
                  <div><label>Nombres</label><input required value={perfilForm.nombres} onChange={(e) => setPerfilForm({ ...perfilForm, nombres: e.target.value })} /></div>
                  <div><label>Apellidos</label><input required value={perfilForm.apellidos} onChange={(e) => setPerfilForm({ ...perfilForm, apellidos: e.target.value })} /></div>
                </div>
                <div className="form-grid">
                  <div>
                    <label>País</label>
                    <select value={perfilForm.pais} onChange={(e) => setPerfilForm({ ...perfilForm, pais: e.target.value })}>
                      {parametros?.paises?.filter((p: any) => p.habilitado).map((p: any) => (
                        <option key={p.codigo_pais} value={p.codigo_pais}>{p.nombre} ({p.codigo_pais})</option>
                      ))}
                    </select>
                  </div>
                  <div><label>ID Fiscal (CPF/NIT/EIN/NIF)</label><input className="mono" required value={perfilForm.datosFiscales} onChange={(e) => setPerfilForm({ ...perfilForm, datosFiscales: e.target.value })} /></div>
                </div>
                <div className="form-grid">
                  <div>
                    <label>Idioma Preferido</label>
                    <select value={perfilForm.idioma} onChange={(e) => setPerfilForm({ ...perfilForm, idioma: e.target.value })}>
                      <option value="ES">ES</option>
                      <option value="EN">EN</option>
                      <option value="PT">PT</option>
                    </select>
                  </div>
                  <div>
                    <label>Moneda Preferida</label>
                    <select value={perfilForm.monedaPreferida} onChange={(e) => setPerfilForm({ ...perfilForm, monedaPreferida: e.target.value })}>
                      <option value="USD">USD</option>
                      <option value="BRL">BRL</option>
                      <option value="BOB">BOB</option>
                      <option value="EUR">EUR</option>
                    </select>
                  </div>
                </div>
                <button type="submit" className="btn btn-primary btn-sm">Guardar Cambios de Perfil</button>
              </form>

              <div>
                <strong style={{ fontSize: '13px' }}>Direcciones Internacionales Registradas ({direcciones.length})</strong>
                <div style={{ display: 'grid', gap: '8px', marginTop: '8px' }}>
                  {direcciones.map((d) => (
                    <div
                      key={d.id_direccion}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        border: '1px solid var(--color-border)',
                        backgroundColor: 'var(--color-bg)',
                        fontSize: '12px'
                      }}
                    >
                      <div>
                        <strong>{d.ciudad} ({d.pais})</strong> — CP <code className="mono">{d.codigo_postal}</code>
                        <div style={{ color: 'var(--color-text-muted)' }}>{d.linea_direccion}</div>
                      </div>
                      <button className="btn btn-sm btn-trash-item" onClick={() => eliminarDireccion(d.id_direccion)} aria-label="Eliminar dirección">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

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
                      <div className="mono" style={{ fontSize: '12px', color: 'var(--color-text-muted)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                        <span>Guía: <b>{ped.envio.numero_guia}</b> • Operador: {ped.envio.operador}</span>
                        <button
                          className="btn btn-sm btn-outline"
                          onClick={() => onRastrearGuia(ped.envio.numero_guia)}
                        >
                          <Radar size={14} /> Rastreo Detallado
                        </button>
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
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                              <ImmutableTag label={t.inmutableLabel} />
                              <button
                                className="btn btn-sm btn-outline"
                                onClick={() => setComprobanteModal({ ...f, nombre_cliente: usuario.nombre })}
                              >
                                <Printer size={14} /> Ver / Imprimir
                              </button>
                            </div>
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

                  {ped.estado === 'CREADO' && (
                    <div style={{ marginTop: '14px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <button className="btn btn-sm btn-accent" style={{ flex: 1 }} onClick={() => pagarPedidoPendiente(ped)}>
                        <CreditCard size={15} /> Pagar Pedido Pendiente (CU05)
                      </button>
                      <button className="btn btn-sm btn-outline" onClick={() => cancelarPedido(ped.id_pedido)}>
                        <X size={14} /> Cancelar Pedido
                      </button>
                    </div>
                  )}

                  {ped.estado === 'PAGADO' && !ped.envio && (
                    <div style={{ marginTop: '14px' }}>
                      <button className="btn btn-sm btn-outline" style={{ width: '100%' }} onClick={() => cancelarPedido(ped.id_pedido)}>
                        <X size={14} /> Cancelar Antes de Preparación (Reembolso + Nota de Crédito)
                      </button>
                    </div>
                  )}

                  {ped.estado === 'ENTREGADO' && (!ped.reembolsos || ped.reembolsos.length === 0) && (
                    <div style={{ marginTop: '16px' }}>
                      <button className="btn btn-amber" style={{ width: '100%' }} onClick={() => abrirModalDevolucion(ped)}>
                        <AlertTriangle size={16} /> {t.reportarDefectoBtn}
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
                      onChange={(e) => {
                        const uds = Number(e.target.value);
                        const itemSel = devolucionModal.detalles?.find((d: any) => d.id_producto === formDev.idProductoAfectado) || devolucionModal.detalles?.[0];
                        const calc = itemSel ? Math.min(Number(itemSel.precio_unitario) * uds, Number(devolucionModal.total)) : Number(devolucionModal.total);
                        setFormDev({ ...formDev, unidadesDefectuosas: uds, montoSolicitado: calc.toFixed(2) });
                      }}
                    />
                  </div>
                </div>
                <div>
                  <label>Monto de Reembolso Solicitado ({devolucionModal.moneda} — Máx. 100%: {Number(devolucionModal.total).toFixed(2)})</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={Number(devolucionModal.total)}
                    className="mono"
                    value={formDev.montoSolicitado}
                    onChange={(e) => setFormDev({ ...formDev, montoSolicitado: e.target.value })}
                  />
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
        {comprobanteModal && (
          <DocumentoImprimibleModal
            tipo="COMPROBANTE"
            datos={comprobanteModal}
            onCerrar={() => setComprobanteModal(null)}
          />
        )}
      </div>
    );
  }

  const renderCheckoutDrawer = () => (
    <CheckoutStepper
      abierto={carritoAbierto}
      onCerrar={() => setCarritoAbierto(false)}
      idioma={idioma}
      moneda={moneda}
      carrito={carrito}
      paso={pasoCheckout}
      setPaso={setPasoCheckout}
      tipoVenta={tipoVenta}
      setTipoVenta={setTipoVenta}
      onCambiarCantidad={cambiarCantidad}
      onVaciarCarrito={vaciarCarritoConConfirmacion}
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
        setCarritoAbierto(false);
        onCambiarVista('MIS_PEDIDOS');
      }}
    />
  );

  return (
    <div className="view-animate">
      {/* BANNER HERO COMPACTO Y MODERNO CON BENEFICIOS */}
      <section className="hero-banner">
        <div style={{ position: 'relative', zIndex: 1 }}>
          <span className="hero-kicker"><Sparkles size={13} /> {t.heroKicker}</span>
          <h1 className="hero-title">{t.heroTitulo}</h1>
          <p className="hero-desc">{t.heroDesc}</p>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <a href="#catalogo-grid" className="btn btn-accent" style={{ textDecoration: 'none' }}>
              <ShoppingBag size={16} /> {t.heroCtaExplorar}
            </a>
            <button
              className="btn btn-outline"
              style={{ backgroundColor: 'rgba(255,255,255,0.12)', color: '#FFFFFF', borderColor: 'rgba(255,255,255,0.28)' }}
              onClick={() => onCambiarVista('RASTREO')}
            >
              <Radar size={16} /> {t.heroCtaRastrear}
            </button>
          </div>
        </div>

        <div className="hero-benefits">
          <div className="hero-benefit-card">
            <span className="hero-benefit-icon"><Plane size={18} /></span>
            <div>
              <strong style={{ fontSize: '13px', display: 'block' }}>{t.beneficio1Titulo}</strong>
              <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.8)' }}>{t.beneficio1Desc}</span>
            </div>
          </div>
          <div className="hero-benefit-card">
            <span className="hero-benefit-icon"><Scale size={18} /></span>
            <div>
              <strong style={{ fontSize: '13px', display: 'block' }}>{t.beneficio2Titulo}</strong>
              <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.8)' }}>{t.beneficio2Desc}</span>
            </div>
          </div>
          <div className="hero-benefit-card">
            <span className="hero-benefit-icon"><ShieldCheck size={18} /></span>
            <div>
              <strong style={{ fontSize: '13px', display: 'block' }}>{t.beneficio3Titulo}</strong>
              <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.8)' }}>{t.beneficio3Desc}</span>
            </div>
          </div>
        </div>
      </section>

      {/* BARRA COMPACTA DE RANGO DE PRECIOS Y CONTEO (RF04) */}
      <div
        id="catalogo-grid"
        className="card card-compact"
        style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <strong style={{ fontSize: '15px' }}>
            {categoria === 'TODAS' ? t.todasCategorias : categoria}
          </strong>
          <span className="mono" style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
            ({productos.length} productos • {moneda})
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <input
            type="number"
            className="mono"
            style={{ width: '125px' }}
            placeholder={`${t.precioMinLabel} (${moneda})`}
            value={precioMin}
            onChange={(e) => setPrecioMin(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && cargarCatalogo()}
          />
          <span style={{ color: 'var(--color-text-muted)' }}>—</span>
          <input
            type="number"
            className="mono"
            style={{ width: '125px' }}
            placeholder={`${t.precioMaxLabel} (${moneda})`}
            value={precioMax}
            onChange={(e) => setPrecioMax(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && cargarCatalogo()}
          />
          <button className="btn btn-sm btn-primary" onClick={cargarCatalogo}>{t.buscarBtn}</button>
          {(precioMin || precioMax) && (
            <button
              className="btn btn-sm btn-outline"
              onClick={() => {
                setPrecioMin('');
                setPrecioMax('');
                setTimeout(cargarCatalogo, 0);
              }}
            >
              {t.limpiarFiltros}
            </button>
          )}
        </div>
      </div>

      {/* GRILLA LIMPIA DE 4 COLUMNAS CON SKELETONS DE CARGA */}
      {cargandoCatalogo ? (
        <div className="grid-products-4">
          {[1, 2, 3, 4].map((n) => (
            <div className="product-card-skeleton" key={n}>
              <div className="product-media-4x3">
                <div className="product-skeleton" />
              </div>
              <div style={{ padding: '16px', display: 'grid', gap: '10px' }}>
                <div className="skeleton-line" style={{ width: '45%' }} />
                <div className="skeleton-line" style={{ width: '90%', height: '18px' }} />
                <div className="skeleton-line" style={{ width: '70%' }} />
                <div className="skeleton-line" style={{ width: '100%', height: '34px', marginTop: '6px' }} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid-products-4">
          {productos.map((p) => (
            <ProductCard
              key={p.id_producto}
              producto={p}
              idioma={idioma}
              onAgregar={agregarAlCarrito}
            />
          ))}
        </div>
      )}

      {/* CHECKOUT EN 4 PASOS DENTRO DE DRAWER LATERAL DESLIZABLE (RNF12 / RN07) */}
      {renderCheckoutDrawer()}
    </div>
  );
};
