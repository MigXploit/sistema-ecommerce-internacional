package com.tienda.pedidos;

import com.tienda.catalogo.ControladorCatalogo;
import com.tienda.dominio.CalculadorDominio;
import com.tienda.facturacion.ServicioFacturacion;
import com.tienda.integraciones.AdaptadoresExternos;
import com.tienda.seguridad.FiltroSeguridadRbac;
import com.tienda.seguridad.ServicioAuditoria;
import com.tienda.seguridad.ServicioJwtRs256;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.PreparedStatement;
import java.util.*;

/**
 * Módulo de Carrito, Cotización de Impuestos/Aranceles/Peso Tasable y Registro de Pedidos
 * (CU03, CU04, RF07-RF10, RN02, RN05, RN06, RN07, RN12).
 */
@RestController
public class ControladorPedido {

    private final JdbcTemplate jdbc;
    private final ControladorCatalogo catalogo;
    private final AdaptadoresExternos adaptadores;
    private final ServicioFacturacion facturacion;
    private final ServicioAuditoria auditoria;

    public ControladorPedido(JdbcTemplate jdbc, ControladorCatalogo catalogo,
                             AdaptadoresExternos adaptadores, ServicioFacturacion facturacion,
                             ServicioAuditoria auditoria) {
        this.jdbc = jdbc;
        this.catalogo = catalogo;
        this.adaptadores = adaptadores;
        this.facturacion = facturacion;
        this.auditoria = auditoria;
    }

    public record ItemCarritoReq(int idProducto, int cantidad) {}
    public record CotizacionPedidoReq(
            Integer idDireccion,
            String codigoPaisDestino,
            String moneda,
            String idiomaOperacion,
            String tipoVenta,
            String codigoOperador,
            List<ItemCarritoReq> items
    ) {}

    @PostMapping("/api/pedidos/cotizar")
    public ResponseEntity<?> cotizarDesglosePrevio(@RequestBody CotizacionPedidoReq req) {
        try {
            Map<String, Object> desglose = calcularDesgloseInternacional(req);
            return ResponseEntity.ok(desglose);
        } catch (IllegalArgumentException | IllegalStateException ex) {
            return ResponseEntity.badRequest().body(Map.of("mensaje", ex.getMessage()));
        }
    }

    @PostMapping("/api/pedidos")
    @Transactional
    public ResponseEntity<?> confirmarPedido(@RequestBody CotizacionPedidoReq req, HttpServletRequest httpReq) {
        var sesion = (ServicioJwtRs256.SesionToken) httpReq.getAttribute(FiltroSeguridadRbac.ATTR_SESION);
        if (!"CLIENTE".equals(sesion.tipoCuenta())) {
            return ResponseEntity.status(403).body(Map.of("mensaje", "Solo clientes autenticados pueden registrar pedidos de compra."));
        }
        if (req.idDireccion() == null) {
            return ResponseEntity.badRequest().body(Map.of("mensaje", "RN06: Debe seleccionar una dirección internacional válida."));
        }

        var dirs = jdbc.queryForList("SELECT * FROM direccion WHERE id_direccion = ? AND id_cliente = ?",
                req.idDireccion(), sesion.idSujeto());
        if (dirs.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("mensaje", "La dirección seleccionada no pertenece al cliente."));
        }
        String paisDir = (String) dirs.get(0).get("pais");

        Map<String, Object> calc;
        try {
            calc = calcularDesgloseInternacional(new CotizacionPedidoReq(
                    req.idDireccion(), paisDir, req.moneda(), req.idiomaOperacion(),
                    req.tipoVenta(), req.codigoOperador(), req.items()));
        } catch (RuntimeException ex) {
            return ResponseEntity.badRequest().body(Map.of("mensaje", ex.getMessage()));
        }

        BigDecimal subtotal = (BigDecimal) calc.get("subtotal");
        BigDecimal impuestos = (BigDecimal) calc.get("impuestos");
        BigDecimal costoEnvio = (BigDecimal) calc.get("costoEnvio");
        BigDecimal total = (BigDecimal) calc.get("total");
        BigDecimal tasaCongelada = (BigDecimal) calc.get("tasaCongelada");
        BigDecimal pesoFisico = (BigDecimal) calc.get("pesoFisicoTotalKg");
        BigDecimal pesoVol = (BigDecimal) calc.get("pesoVolumetricoTotalKg");
        BigDecimal pesoTasable = (BigDecimal) calc.get("pesoTasableKg");
        String tipoVentaFinal = (String) calc.get("tipoVentaAplicado");
        String monedaFinal = ((String) calc.get("moneda")).toUpperCase();
        String idiomaFinal = req.idiomaOperacion() != null ? req.idiomaOperacion().toUpperCase() : "ES";

        KeyHolder kh = new GeneratedKeyHolder();
        jdbc.update(con -> {
            PreparedStatement ps = con.prepareStatement("""
                INSERT INTO pedido (id_cliente, id_direccion, moneda, tasa_aplicada, idioma_operacion, tipo_venta,
                                    peso_fisico_total, peso_volumetrico_total, peso_tasable,
                                    subtotal, impuestos, costo_envio, total, estado)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CREADO')
            """, new String[]{"id_pedido"});
            ps.setInt(1, sesion.idSujeto());
            ps.setInt(2, req.idDireccion());
            ps.setString(3, monedaFinal);
            ps.setBigDecimal(4, tasaCongelada);
            ps.setString(5, idiomaFinal);
            ps.setString(6, tipoVentaFinal);
            ps.setBigDecimal(7, pesoFisico);
            ps.setBigDecimal(8, pesoVol);
            ps.setBigDecimal(9, pesoTasable);
            ps.setBigDecimal(10, subtotal);
            ps.setBigDecimal(11, impuestos);
            ps.setBigDecimal(12, costoEnvio);
            ps.setBigDecimal(13, total);
            return ps;
        }, kh);

        int idPedido = kh.getKey().intValue();
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> lineas = (List<Map<String, Object>>) calc.get("lineas");
        for (Map<String, Object> l : lineas) {
            jdbc.update("""
                INSERT INTO detalle_pedido (id_pedido, id_producto, cantidad, precio_unitario)
                VALUES (?, ?, ?, ?)
            """, idPedido, l.get("idProducto"), l.get("cantidad"), l.get("precioUnitario"));
        }

        auditoria.registrar(null, sesion.identificador(), "REGISTRO_PEDIDO_CONGELADO_RN02",
                "PEDIDO", idPedido, "EXITOSO",
                "Pedido #" + idPedido + " en estado CREADO (" + total + " " + monedaFinal + ", tipo=" + tipoVentaFinal + ")");

        return ResponseEntity.ok(Map.of(
                "idPedido", idPedido,
                "estado", "CREADO",
                "desglose", calc,
                "mensaje", "Pedido confirmado en estado CREADO con tipo de cambio e importes congelados (RN02)."
        ));
    }

    @GetMapping("/api/pedidos")
    public ResponseEntity<?> listarPedidos(HttpServletRequest httpReq) {
        var sesion = (ServicioJwtRs256.SesionToken) httpReq.getAttribute(FiltroSeguridadRbac.ATTR_SESION);
        List<Map<String, Object>> pedidos;
        if ("CLIENTE".equals(sesion.tipoCuenta())) {
            pedidos = jdbc.queryForList("""
                SELECT p.*, d.pais AS pais_destino, d.ciudad, d.linea_direccion, d.codigo_postal,
                       c.nombres || ' ' || c.apellidos AS nombre_cliente, c.correo
                FROM pedido p
                JOIN direccion d ON d.id_direccion = p.id_direccion
                JOIN cliente c ON c.id_cliente = p.id_cliente
                WHERE p.id_cliente = ?
                ORDER BY p.id_pedido DESC
            """, sesion.idSujeto());
        } else if (Set.of("GESTOR_PEDIDOS", "LOGISTICA", "FACTURACION", "GERENTE").contains(sesion.rol())) {
            pedidos = jdbc.queryForList("""
                SELECT p.*, d.pais AS pais_destino, d.ciudad, d.linea_direccion, d.codigo_postal,
                       c.nombres || ' ' || c.apellidos AS nombre_cliente, c.correo
                FROM pedido p
                JOIN direccion d ON d.id_direccion = p.id_direccion
                JOIN cliente c ON c.id_cliente = p.id_cliente
                ORDER BY p.id_pedido DESC
            """);
        } else {
            auditoria.registrar(sesion.idSujeto(), sesion.identificador(), "ACCESO_PEDIDOS_NO_AUTORIZADO",
                    "PEDIDO", null, "BLOQUEADO_403", "Rol " + sesion.rol() + " sin permiso sobre pedidos de clientes");
            return ResponseEntity.status(403).body(Map.of(
                    "mensaje", "RNF02: El rol " + sesion.rol() + " no tiene acceso al listado de pedidos de clientes."));
        }

        List<Map<String, Object>> enriquecidos = new ArrayList<>();
        for (Map<String, Object> ped : pedidos) {
            int idPedido = ((Number) ped.get("id_pedido")).intValue();
            Map<String, Object> copia = new LinkedHashMap<>(ped);
            copia.put("detalles", jdbc.queryForList("""
                SELECT dp.*, pr.codigo, pr.codigo_arancelario, pr.peso_kg, pr.dimensiones,
                       COALESCE(tp.nombre, pr.codigo) AS nombre_producto
                FROM detalle_pedido dp
                JOIN producto pr ON pr.id_producto = dp.id_producto
                LEFT JOIN traduccion_producto tp ON tp.id_producto = pr.id_producto AND tp.idioma = ?
                WHERE dp.id_pedido = ?
            """, ped.get("idioma_operacion"), idPedido));
            copia.put("pagos", jdbc.queryForList("SELECT * FROM pago WHERE id_pedido = ? ORDER BY id_pago DESC", idPedido));
            var envios = jdbc.queryForList("SELECT * FROM envio WHERE id_pedido = ?", idPedido);
            copia.put("envio", envios.isEmpty() ? null : envios.get(0));
            copia.put("facturas", jdbc.queryForList("SELECT * FROM factura WHERE id_pedido = ? ORDER BY id_factura ASC", idPedido));
            copia.put("reembolsos", jdbc.queryForList("""
                SELECT r.* FROM reembolso r
                JOIN pago pg ON pg.id_pago = r.id_pago
                WHERE pg.id_pedido = ?
                ORDER BY r.id_reembolso DESC
            """, idPedido));
            enriquecidos.add(copia);
        }
        return ResponseEntity.ok(enriquecidos);
    }

    @PostMapping("/api/pedidos/{idPedido}/cancelar")
    @Transactional
    public ResponseEntity<?> cancelarPedidoAntesDePreparacion(@PathVariable int idPedido, HttpServletRequest httpReq) {
        var sesion = (ServicioJwtRs256.SesionToken) httpReq.getAttribute(FiltroSeguridadRbac.ATTR_SESION);
        var peds = jdbc.queryForList("SELECT * FROM pedido WHERE id_pedido = ?", idPedido);
        if (peds.isEmpty()) return ResponseEntity.notFound().build();

        Map<String, Object> ped = peds.get(0);
        int idCliente = ((Number) ped.get("id_cliente")).intValue();
        if ("CLIENTE".equals(sesion.tipoCuenta()) && sesion.idSujeto() != idCliente) {
            return ResponseEntity.status(403).body(Map.of("mensaje", "No tiene permisos para cancelar pedidos de otro cliente."));
        }
        if ("INTERNO".equals(sesion.tipoCuenta()) && !"GESTOR_PEDIDOS".equals(sesion.rol())) {
            return ResponseEntity.status(403).body(Map.of("mensaje", "RNF02: Solo el Gestor de Pedidos puede cancelar pedidos internamente."));
        }

        String estadoActual = (String) ped.get("estado");
        if ("CREADO".equals(estadoActual)) {
            jdbc.update("UPDATE pedido SET estado = 'CANCELADO' WHERE id_pedido = ?", idPedido);
            auditoria.registrar("INTERNO".equals(sesion.tipoCuenta()) ? sesion.idSujeto() : null,
                    sesion.identificador(), "CANCELACION_PEDIDO", "PEDIDO", idPedido, "EXITOSO", "Pedido cancelado antes del pago");
            return ResponseEntity.ok(Map.of("mensaje", "Pedido #" + idPedido + " cancelado correctamente."));
        }

        if ("PAGADO".equals(estadoActual)) {
            Integer envios = jdbc.queryForObject("SELECT COUNT(*) FROM envio WHERE id_pedido = ?", Integer.class, idPedido);
            if (envios != null && envios > 0) {
                return ResponseEntity.badRequest().body(Map.of(
                        "mensaje", "D08: El pedido ya cuenta con guía logística emitida y no puede cancelarse directamente."));
            }
            // D08: Cancelación antes de preparación -> restaurar stock vendible, reembolso total + Nota de Crédito
            var detalles = jdbc.queryForList("SELECT id_producto, cantidad FROM detalle_pedido WHERE id_pedido = ?", idPedido);
            for (var det : detalles) {
                jdbc.update("UPDATE producto SET stock = stock + ? WHERE id_producto = ?",
                        det.get("cantidad"), det.get("id_producto"));
            }
            var pagos = jdbc.queryForList("SELECT * FROM pago WHERE id_pedido = ? AND estado = 'APROBADO' ORDER BY id_pago DESC LIMIT 1", idPedido);
            Map<String, Object> nc = null;
            if (!pagos.isEmpty()) {
                Map<String, Object> pg = pagos.get(0);
                int idPago = ((Number) pg.get("id_pago")).intValue();
                BigDecimal monto = (BigDecimal) pg.get("monto");
                String moneda = (String) pg.get("moneda");
                adaptadores.ejecutarReembolsoPasarela((String) pg.get("referencia_pasarela"), monto, moneda);

                KeyHolder khReem = new GeneratedKeyHolder();
                Integer idAutoriza = "INTERNO".equals(sesion.tipoCuenta()) ? sesion.idSujeto() : null;
                jdbc.update(con -> {
                    PreparedStatement ps = con.prepareStatement("""
                        INSERT INTO reembolso (id_pago, id_producto_afectado, unidades_defectuosas, monto,
                                               causal_devolucion, motivo, evidencia_ref, inspeccion_aprobada,
                                               id_usuario_autoriza, estado, fecha_reembolso)
                        VALUES (?, NULL, 0, ?, 'CANCELACION', 'Cancelación de pedido pagado antes de preparación logística (D08)',
                                'CANCELACION_PRE_DESPACHO', TRUE, ?, 'APROBADO', CURRENT_TIMESTAMP)
                    """, new String[]{"id_reembolso"});
                    ps.setInt(1, idPago);
                    ps.setBigDecimal(2, monto);
                    if (idAutoriza != null) ps.setInt(3, idAutoriza);
                    else ps.setNull(3, java.sql.Types.INTEGER);
                    return ps;
                }, khReem);

                int idReem = khReem.getKey().intValue();
                jdbc.update("UPDATE pago SET estado = 'REEMBOLSADO' WHERE id_pago = ?", idPago);
                nc = facturacion.emitirNotaCreditoVinculada(idPedido, idReem, monto, idAutoriza, sesion.identificador());
                adaptadores.notificarClienteEnSuIdioma(idCliente, idPedido, "REEMBOLSO_APROBADO_NC",
                        "Cancelación pre-despacho " + monto + " " + moneda + " - Nota de Crédito " + nc.get("numero"));
            }
            jdbc.update("UPDATE pedido SET estado = 'CANCELADO' WHERE id_pedido = ?", idPedido);
            auditoria.registrar("INTERNO".equals(sesion.tipoCuenta()) ? sesion.idSujeto() : null,
                    sesion.identificador(), "CANCELACION_PEDIDO_PAGADO_D08", "PEDIDO", idPedido, "EXITOSO",
                    "Pedido pagado cancelado antes de preparación con reembolso total y Nota de Crédito");
            return ResponseEntity.ok(Map.of(
                    "mensaje", "Pedido #" + idPedido + " cancelado antes de preparación con reembolso y Nota de Crédito emitida.",
                    "notaCredito", nc != null ? nc : Map.of()
            ));
        }

        return ResponseEntity.badRequest().body(Map.of(
                "mensaje", "D08 / RN05: Solo pedidos en estado CREADO o PAGADO sin guía logística pueden cancelarse."));
    }

    private Map<String, Object> calcularDesgloseInternacional(CotizacionPedidoReq req) {
        if (req.items() == null || req.items().isEmpty()) {
            throw new IllegalArgumentException("El carrito debe contener al menos un producto.");
        }
        String pais = req.codigoPaisDestino() != null ? req.codigoPaisDestino().toUpperCase() : "US";
        var paises = jdbc.queryForList("SELECT * FROM param_pais WHERE codigo_pais = ?", pais);
        if (paises.isEmpty() || !Boolean.TRUE.equals(paises.get(0).get("habilitado"))) {
            throw new IllegalStateException("RN12: El país de destino '" + pais + "' no está habilitado para envíos internacionales.");
        }
        Map<String, Object> infoPais = paises.get(0);
        String restringidas = ((String) infoPais.get("categorias_restringidas")).toLowerCase();
        BigDecimal tasaIvaPais = (BigDecimal) infoPais.get("tasa_iva");

        String moneda = req.moneda() != null ? req.moneda().toUpperCase() : "USD";
        BigDecimal tasa = catalogo.obtenerTasaVigente(moneda);

        BigDecimal subtotal = BigDecimal.ZERO;
        BigDecimal arancelesAcumulados = BigDecimal.ZERO;
        BigDecimal pesoFisicoTotal = BigDecimal.ZERO;
        BigDecimal pesoVolumetricoTotal = BigDecimal.ZERO;
        int unidadesTotales = 0;

        List<Map<String, Object>> lineas = new ArrayList<>();
        for (ItemCarritoReq item : req.items()) {
            if (item.cantidad() <= 0) continue;
            var prods = jdbc.queryForList("SELECT * FROM producto WHERE id_producto = ?", item.idProducto());
            if (prods.isEmpty()) throw new IllegalArgumentException("Producto no encontrado: " + item.idProducto());
            Map<String, Object> prod = prods.get(0);

            if (!Boolean.TRUE.equals(prod.get("estado"))) {
                throw new IllegalStateException("RN01: El producto " + prod.get("codigo") + " no se encuentra activo.");
            }
            int stockDisp = ((Number) prod.get("stock")).intValue();
            if (item.cantidad() > stockDisp) {
                throw new IllegalStateException("CU03 2a / RN06: La cantidad solicitada (" + item.cantidad()
                        + ") de " + prod.get("codigo") + " supera el stock vendible disponible (" + stockDisp + ").");
            }

            String cat = (String) prod.get("categoria");
            if (!restringidas.isBlank() && restringidas.contains(cat.toLowerCase())) {
                throw new IllegalStateException("CU04 2a / RN12: La categoría '" + cat + "' tiene restricción aduanera de importación en " + infoPais.get("nombre") + ".");
            }

            String hsCode = (String) prod.get("codigo_arancelario");
            BigDecimal tasaArancel = BigDecimal.ZERO;
            var aranceles = jdbc.queryForList(
                    "SELECT * FROM param_arancel WHERE codigo_pais = ? AND codigo_arancelario = ?", pais, hsCode);
            if (!aranceles.isEmpty()) {
                if (Boolean.TRUE.equals(aranceles.get(0).get("restringido"))) {
                    throw new IllegalStateException("RN12: Partida arancelaria " + hsCode + " restringida en " + infoPais.get("nombre"));
                }
                tasaArancel = (BigDecimal) aranceles.get(0).get("tasa_arancel");
            }

            BigDecimal precioBaseUsd = (BigDecimal) prod.get("precio_base_usd");
            BigDecimal precioUnitMoneda = CalculadorDominio.convertirDesdeUsd(precioBaseUsd, tasa);
            // Descuento mayorista automático 8% si pide >= 10 unidades o tipo MAYORISTA, o 10% en PROMOCIONAL
            BigDecimal cantBd = BigDecimal.valueOf(item.cantidad());
            BigDecimal subtotalLinea = precioUnitMoneda.multiply(cantBd).setScale(2, RoundingMode.HALF_UP);
            BigDecimal arancelLinea = subtotalLinea.multiply(tasaArancel).setScale(2, RoundingMode.HALF_UP);

            BigDecimal pesoUnit = (BigDecimal) prod.get("peso_kg");
            BigDecimal pesoVolUnit = CalculadorDominio.calcularPesoVolumetricoKg((String) prod.get("dimensiones"));
            pesoFisicoTotal = pesoFisicoTotal.add(pesoUnit.multiply(cantBd));
            pesoVolumetricoTotal = pesoVolumetricoTotal.add(pesoVolUnit.multiply(cantBd));

            subtotal = subtotal.add(subtotalLinea);
            arancelesAcumulados = arancelesAcumulados.add(arancelLinea);
            unidadesTotales += item.cantidad();

            lineas.add(Map.of(
                    "idProducto", item.idProducto(),
                    "codigo", prod.get("codigo"),
                    "codigoArancelario", hsCode,
                    "cantidad", item.cantidad(),
                    "precioUnitario", precioUnitMoneda,
                    "subtotalLinea", subtotalLinea,
                    "arancelLinea", arancelLinea
            ));
        }

        // Clasificación automática/explícita de TipoVenta (CU04 paso 3)
        String tipoVenta = req.tipoVenta() != null && !req.tipoVenta().isBlank()
                ? req.tipoVenta().toUpperCase()
                : (unidadesTotales >= 10 ? "MAYORISTA" : "MINORISTA");

        BigDecimal pesoTasable = CalculadorDominio.calcularPesoTasable(pesoFisicoTotal, pesoVolumetricoTotal);
        var cotizacionEnvio = adaptadores.cotizarEnvioInternacional(pais, pesoTasable, req.codigoOperador());
        BigDecimal costoEnvioMoneda = CalculadorDominio.convertirDesdeUsd(cotizacionEnvio.costoUsd(), tasa);

        // Fórmula 3 (Sección 7.5.5): Impuestos = sum(Subtotal_i * TasaArancel) + (Subtotal * TasaIVA_pais)
        BigDecimal ivaLocal = subtotal.multiply(tasaIvaPais).setScale(2, RoundingMode.HALF_UP);
        BigDecimal impuestosTotales = arancelesAcumulados.add(ivaLocal).setScale(2, RoundingMode.HALF_UP);
        BigDecimal totalFinal = subtotal.add(impuestosTotales).add(costoEnvioMoneda).setScale(2, RoundingMode.HALF_UP);

        Map<String, Object> res = new LinkedHashMap<>();
        res.put("paisDestino", pais);
        res.put("nombrePais", infoPais.get("nombre"));
        res.put("moneda", moneda);
        res.put("tasaCongelada", tasa);
        res.put("tipoVentaAplicado", tipoVenta);
        res.put("pesoFisicoTotalKg", pesoFisicoTotal.setScale(3, RoundingMode.HALF_UP));
        res.put("pesoVolumetricoTotalKg", pesoVolumetricoTotal.setScale(3, RoundingMode.HALF_UP));
        res.put("pesoTasableKg", pesoTasable);
        res.put("operadorCotizado", cotizacionEnvio.operador());
        res.put("diasTransitoEstimados", cotizacionEnvio.diasEstimados());
        res.put("subtotal", subtotal);
        res.put("ivaEstimado", ivaLocal);
        res.put("arancelesImportacion", arancelesAcumulados);
        res.put("impuestos", impuestosTotales);
        res.put("costoEnvio", costoEnvioMoneda);
        res.put("total", totalFinal);
        res.put("equivalenteUsd", CalculadorDominio.calcularEquivalenteUsd(totalFinal, tasa));
        res.put("lineas", lineas);
        return res;
    }
}
