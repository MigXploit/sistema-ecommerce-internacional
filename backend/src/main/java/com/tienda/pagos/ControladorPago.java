package com.tienda.pagos;

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
import java.sql.PreparedStatement;
import java.sql.Types;
import java.util.List;
import java.util.Map;

/**
 * Módulo de Pagos Internacionales Tokenizados y Control Estricto de Devoluciones / Reembolsos
 * (CU05, CU06, CU11, RF11, RF13, RF19, RNF03, RNF04, RN08-RN11, RN19).
 */
@RestController
public class ControladorPago {

    private final JdbcTemplate jdbc;
    private final AdaptadoresExternos adaptadores;
    private final ServicioFacturacion facturacion;
    private final ServicioAuditoria auditoria;

    public ControladorPago(JdbcTemplate jdbc, AdaptadoresExternos adaptadores,
                           ServicioFacturacion facturacion, ServicioAuditoria auditoria) {
        this.jdbc = jdbc;
        this.adaptadores = adaptadores;
        this.facturacion = facturacion;
        this.auditoria = auditoria;
    }

    public record ProcesarPagoReq(
            int idPedido,
            String medioPago,
            String tokenPago,
            String claveIdempotencia,
            String numeroTarjetaProhibido, // Si alguien intenta enviar PAN/CVV se rechaza por PCI DSS (RN11)
            String cvvProhibido
    ) {}

    @PostMapping("/api/pagos/procesar")
    @Transactional
    public ResponseEntity<?> procesarPagoInternacional(@RequestBody ProcesarPagoReq req, HttpServletRequest httpReq) {
        var sesion = (ServicioJwtRs256.SesionToken) httpReq.getAttribute(FiltroSeguridadRbac.ATTR_SESION);

        // RN11 / RNF03: Prohibición estricta PCI DSS de recibir o almacenar PAN o CVV
        if ((req.numeroTarjetaProhibido() != null && !req.numeroTarjetaProhibido().isBlank())
                || (req.cvvProhibido() != null && !req.cvvProhibido().isBlank())) {
            return ResponseEntity.badRequest().body(Map.of(
                    "mensaje", "CUMPLIMIENTO PCI DSS (RN11 / RNF03): El sistema rechaza peticiones con números de tarjeta (PAN) o CVV. Envíe únicamente el token transaccional."));
        }

        var peds = jdbc.queryForList("SELECT * FROM pedido WHERE id_pedido = ?", req.idPedido());
        if (peds.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        Map<String, Object> ped = peds.get(0);
        if (!"CREADO".equals(ped.get("estado"))) {
            return ResponseEntity.badRequest().body(Map.of(
                    "mensaje", "CU05: El pedido #" + req.idPedido() + " ya se encuentra en estado " + ped.get("estado") + "."));
        }

        // Verificar disponibilidad atómica de stock antes del cobro (RNF04 ACID)
        var detalles = jdbc.queryForList("SELECT * FROM detalle_pedido WHERE id_pedido = ?", req.idPedido());
        for (var det : detalles) {
            int idProd = ((Number) det.get("id_producto")).intValue();
            int cant = ((Number) det.get("cantidad")).intValue();
            Integer stockActual = jdbc.queryForObject("SELECT stock FROM producto WHERE id_producto = ?", Integer.class, idProd);
            if (stockActual == null || stockActual < cant) {
                return ResponseEntity.badRequest().body(Map.of(
                        "mensaje", "RNF04 / RN06: Stock insuficiente para completar el cobro atómico del producto #" + idProd));
            }
        }

        BigDecimal monto = (BigDecimal) ped.get("total");
        String moneda = (String) ped.get("moneda");
        BigDecimal tasaCongelada = (BigDecimal) ped.get("tasa_aplicada");
        BigDecimal equivalenteUsd = CalculadorDominio.calcularEquivalenteUsd(monto, tasaCongelada);
        String medio = req.medioPago() != null ? req.medioPago().toUpperCase() : "TARJETA";
        String idemp = req.claveIdempotencia() != null ? req.claveIdempotencia() : "PED-" + req.idPedido() + "-" + req.tokenPago();

        var resultadoPasarela = adaptadores.procesarCobroTokenizado(idemp, req.tokenPago(), monto, moneda, medio);

        jdbc.update("""
            INSERT INTO pago (id_pedido, monto, moneda, equivalente_base, medio_pago, token_transaccional, estado, referencia_pasarela)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, req.idPedido(), monto, moneda, equivalenteUsd, medio, req.tokenPago(),
                resultadoPasarela.estado(), resultadoPasarela.referenciaPasarela());

        if (!resultadoPasarela.aprobado()) {
            // Excepción CU05 4a: se registra intento RECHAZADO y el pedido permanece en CREADO
            auditoria.registrar(null, sesion.identificador(), "PAGO_RECHAZADO_PASARELA",
                    "PAGO", req.idPedido(), "RECHAZADO", resultadoPasarela.detalle());
            return ResponseEntity.status(402).body(Map.of(
                    "estadoPago", "RECHAZADO",
                    "referenciaPasarela", resultadoPasarela.referenciaPasarela(),
                    "mensaje", "CU05 4a: Pago rechazado por la pasarela (" + resultadoPasarela.detalle() + "). El pedido sigue en estado CREADO para reintentar."
            ));
        }

        // RNF04 Transacción Atómica ACID: descontar stock en firme + actualizar pedido a PAGADO + emitir Factura Comercial
        for (var det : detalles) {
            jdbc.update("UPDATE producto SET stock = stock - ? WHERE id_producto = ?",
                    det.get("cantidad"), det.get("id_producto"));
        }
        jdbc.update("UPDATE pedido SET estado = 'PAGADO' WHERE id_pedido = ?", req.idPedido());

        Map<String, Object> facturaEmitida = facturacion.emitirFacturaComercial(req.idPedido(), null, sesion.identificador());

        auditoria.registrar(null, sesion.identificador(), "PAGO_INTERNACIONAL_APROBADO",
                "PAGO", req.idPedido(), "EXITOSO",
                "Cobro " + resultadoPasarela.referenciaPasarela() + " por " + monto + " " + moneda
                        + " (equivalente " + equivalenteUsd + " USD). Pedido PAGADO y habilitado para Logística.");

        return ResponseEntity.ok(Map.of(
                "estadoPago", "APROBADO",
                "referenciaPasarela", resultadoPasarela.referenciaPasarela(),
                "montoCobrado", monto,
                "moneda", moneda,
                "equivalenteBaseUsd", equivalenteUsd,
                "factura", facturaEmitida,
                "mensaje", "Pago aprobado. Stock descontado atómicamente, factura " + facturaEmitida.get("numero") + " emitida y pedido habilitado para despacho logístico."
        ));
    }

    // =========================================================================
    // POSTVENTA: DEVOLUCIONES POR PRODUCTOS DEFECTUOSOS Y REEMBOLSOS (CU06, CU11)
    // =========================================================================

    public record SolicitudDevolucionReq(
            int idPedido,
            Integer idProductoAfectado,
            int unidadesDefectuosas,
            BigDecimal montoSolicitado,
            String causalDevolucion, // PRODUCTO_DEFECTUOSO, DANO_TRANSPORTE, ERROR_ENVIO, CANCELACION
            String motivo,
            String evidenciaRef
    ) {}

    @PostMapping("/api/postventa/solicitar-devolucion")
    @Transactional
    public ResponseEntity<?> registrarSolicitudDevolucion(@RequestBody SolicitudDevolucionReq req, HttpServletRequest httpReq) {
        var sesion = (ServicioJwtRs256.SesionToken) httpReq.getAttribute(FiltroSeguridadRbac.ATTR_SESION);

        var peds = jdbc.queryForList("SELECT * FROM pedido WHERE id_pedido = ?", req.idPedido());
        if (peds.isEmpty()) return ResponseEntity.notFound().build();
        Map<String, Object> ped = peds.get(0);

        String estadoPed = (String) ped.get("estado");
        if (!"ENTREGADO".equals(estadoPed) && !"PAGADO".equals(estadoPed) && !"DEVUELTO".equals(estadoPed)) {
            return ResponseEntity.badRequest().body(Map.of(
                    "mensaje", "CU11: Las devoluciones por defecto aplican sobre pedidos entregados (o cancelación de pagados sin despacho)."));
        }

        // CU11 1a / RN19: Evidencia obligatoria cuando la causal es PRODUCTO_DEFECTUOSO
        String causal = req.causalDevolucion() != null ? req.causalDevolucion().toUpperCase() : "PRODUCTO_DEFECTUOSO";
        if ("PRODUCTO_DEFECTUOSO".equals(causal) && (req.evidenciaRef() == null || req.evidenciaRef().isBlank())) {
            return ResponseEntity.badRequest().body(Map.of(
                    "mensaje", "CU11 1a / RN19: Toda solicitud por PRODUCTO_DEFECTUOSO exige adjuntar evidencia comprobable (fotografía o informe técnico)."));
        }
        if (req.motivo() == null || req.motivo().isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("mensaje", "RN10: Debe especificar el motivo documentado de la devolución."));
        }

        var pagos = jdbc.queryForList("SELECT * FROM pago WHERE id_pedido = ? AND estado IN ('APROBADO', 'REEMBOLSADO') ORDER BY id_pago DESC LIMIT 1",
                req.idPedido());
        if (pagos.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("mensaje", "No existe un pago aprobado asociado al pedido."));
        }
        Map<String, Object> pago = pagos.get(0);
        int idPago = ((Number) pago.get("id_pago")).intValue();
        BigDecimal montoPago = (BigDecimal) pago.get("monto");

        BigDecimal reembolsadoPrevio = jdbc.queryForObject(
                "SELECT COALESCE(SUM(monto), 0) FROM reembolso WHERE id_pago = ? AND estado = 'APROBADO'",
                BigDecimal.class, idPago);
        BigDecimal saldoDisponible = montoPago.subtract(reembolsadoPrevio);

        BigDecimal montoSolicitado = req.montoSolicitado() != null ? req.montoSolicitado() : saldoDisponible;
        if (montoSolicitado.compareTo(BigDecimal.ZERO) <= 0 || montoSolicitado.compareTo(saldoDisponible) > 0) {
            return ResponseEntity.badRequest().body(Map.of(
                    "mensaje", "CU06 3a / RN10: El monto solicitado (" + montoSolicitado + ") supera el saldo máximo reembolsable del 100% (" + saldoDisponible + " " + pago.get("moneda") + ").",
                    "saldoMaximoReembolsable", saldoDisponible
            ));
        }

        KeyHolder kh = new GeneratedKeyHolder();
        jdbc.update(con -> {
            PreparedStatement ps = con.prepareStatement("""
                INSERT INTO reembolso (id_pago, id_producto_afectado, unidades_defectuosas, monto,
                                       causal_devolucion, motivo, evidencia_ref, inspeccion_aprobada, estado)
                VALUES (?, ?, ?, ?, ?, ?, ?, FALSE, 'PENDIENTE')
            """, new String[]{"id_reembolso"});
            ps.setInt(1, idPago);
            if (req.idProductoAfectado() != null) ps.setInt(2, req.idProductoAfectado());
            else ps.setNull(2, Types.INTEGER);
            ps.setInt(3, Math.max(0, req.unidadesDefectuosas()));
            ps.setBigDecimal(4, montoSolicitado);
            ps.setString(5, causal);
            ps.setString(6, req.motivo().trim());
            ps.setString(7, req.evidenciaRef());
            return ps;
        }, kh);

        int idReembolso = kh.getKey().intValue();
        String refDemanda = (causal + ": " + req.motivo().trim());
        if (refDemanda.length() > 190) {
            refDemanda = refDemanda.substring(0, 190);
        }
        jdbc.update("""
            INSERT INTO registro_demanda (id_producto, tipo_solicitud, termino_referencia, pais, idioma, moneda)
            VALUES (?, 'RECLAMO_POSTVENTA', ?, 'INTL', ?, ?)
        """, req.idProductoAfectado(), refDemanda, ped.get("idioma_operacion"), ped.get("moneda"));

        auditoria.registrar("INTERNO".equals(sesion.tipoCuenta()) ? sesion.idSujeto() : null,
                sesion.identificador(), "SOLICITUD_DEVOLUCION_REGISTRADA",
                "REEMBOLSO", idReembolso, "PENDIENTE_INSPECCION",
                "Solicitud #" + idReembolso + " por " + causal + " (" + montoSolicitado + " " + pago.get("moneda") + ")");

        return ResponseEntity.ok(Map.of(
                "idReembolso", idReembolso,
                "mensaje", "Solicitud de devolución registrada y enviada a inspección de calidad del Gestor de Pedidos."
        ));
    }

    @GetMapping("/api/postventa/gestion/solicitudes")
    public List<Map<String, Object>> listarSolicitudesDevolucion() {
        return jdbc.queryForList("""
            SELECT r.*, pg.id_pedido, pg.monto AS monto_pago_original, pg.moneda, pg.referencia_pasarela,
                   pr.codigo AS sku_afectado, pr.stock AS stock_vendible, pr.stock_defectuoso AS stock_cuarentena,
                   c.nombres || ' ' || c.apellidos AS nombre_cliente
            FROM reembolso r
            JOIN pago pg ON pg.id_pago = r.id_pago
            JOIN pedido p ON p.id_pedido = pg.id_pedido
            JOIN cliente c ON c.id_cliente = p.id_cliente
            LEFT JOIN producto pr ON pr.id_producto = r.id_producto_afectado
            ORDER BY r.id_reembolso DESC
        """);
    }

    public record ResolverDevolucionReq(boolean aprobar, BigDecimal montoAutorizado, String observacionDictamen) {}

    @PostMapping("/api/postventa/gestion/resolver/{idReembolso}")
    @Transactional
    public ResponseEntity<?> evaluarYEjecutarReembolso(@PathVariable int idReembolso,
                                                       @RequestBody ResolverDevolucionReq req,
                                                       HttpServletRequest httpReq) {
        var sesion = (ServicioJwtRs256.SesionToken) httpReq.getAttribute(FiltroSeguridadRbac.ATTR_SESION);

        var filas = jdbc.queryForList("""
            SELECT r.*, pg.id_pedido, pg.monto AS monto_pago_original, pg.moneda, pg.referencia_pasarela, p.id_cliente
            FROM reembolso r
            JOIN pago pg ON pg.id_pago = r.id_pago
            JOIN pedido p ON p.id_pedido = pg.id_pedido
            WHERE r.id_reembolso = ?
        """, idReembolso);
        if (filas.isEmpty()) return ResponseEntity.notFound().build();

        Map<String, Object> r = filas.get(0);
        if (!"PENDIENTE".equals(r.get("estado"))) {
            return ResponseEntity.badRequest().body(Map.of("mensaje", "Esta solicitud ya fue resuelta previamente."));
        }

        int idPedido = ((Number) r.get("id_pedido")).intValue();
        int idCliente = ((Number) r.get("id_cliente")).intValue();

        if (!req.aprobar()) {
            jdbc.update("UPDATE reembolso SET estado = 'RECHAZADO', id_usuario_autoriza = ? WHERE id_reembolso = ?",
                    sesion.idSujeto(), idReembolso);
            adaptadores.notificarClienteEnSuIdioma(idCliente, idPedido, "DEVOLUCION_RECHAZADA",
                    req.observacionDictamen() != null ? req.observacionDictamen() : "No cumple criterios de inspección");
            auditoria.registrar(sesion.idSujeto(), sesion.identificador(), "RECHAZO_DEVOLUCION",
                    "REEMBOLSO", idReembolso, "RECHAZADO", req.observacionDictamen());
            return ResponseEntity.ok(Map.of("mensaje", "Solicitud de devolución rechazada y cliente notificado."));
        }

        String causal = (String) r.get("causal_devolucion");
        String evidencia = (String) r.get("evidencia_ref");
        if ("PRODUCTO_DEFECTUOSO".equals(causal) && (evidencia == null || evidencia.isBlank())) {
            return ResponseEntity.badRequest().body(Map.of(
                    "mensaje", "RN19: Imposible aprobar reembolso de producto defectuoso sin evidencia registrada."));
        }

        int idPago = ((Number) r.get("id_pago")).intValue();
        BigDecimal montoPago = (BigDecimal) r.get("monto_pago_original");
        BigDecimal acumuladoPrevio = jdbc.queryForObject(
                "SELECT COALESCE(SUM(monto), 0) FROM reembolso WHERE id_pago = ? AND estado = 'APROBADO'",
                BigDecimal.class, idPago);
        BigDecimal montoFinal = req.montoAutorizado() != null ? req.montoAutorizado() : (BigDecimal) r.get("monto");

        if (acumuladoPrevio.add(montoFinal).compareTo(montoPago) > 0) {
            return ResponseEntity.badRequest().body(Map.of(
                    "mensaje", "RN10: El reembolso acumulado excedería el 100% del pago original (" + montoPago + " " + r.get("moneda") + ")."));
        }

        // RN19: Aislar unidades defectuosas en cuarentena (stock_defectuoso) sin devolverlas jamás al stock vendible
        Number numProd = (Number) r.get("id_producto_afectado");
        Integer idProd = numProd != null ? numProd.intValue() : null;
        int unidadesMalas = ((Number) r.get("unidades_defectuosas")).intValue();
        if (idProd != null && unidadesMalas > 0) {
            jdbc.update("UPDATE producto SET stock_defectuoso = stock_defectuoso + ? WHERE id_producto = ?",
                    unidadesMalas, idProd);
        }

        // CU06: Ejecutar reembolso en Pasarela de Pagos + actualizar Pago y Pedido + emitir Nota de Crédito (RN16)
        adaptadores.ejecutarReembolsoPasarela((String) r.get("referencia_pasarela"), montoFinal, (String) r.get("moneda"));

        jdbc.update("""
            UPDATE reembolso
            SET monto = ?, inspeccion_aprobada = TRUE, id_usuario_autoriza = ?, estado = 'APROBADO', fecha_reembolso = CURRENT_TIMESTAMP
            WHERE id_reembolso = ?
        """, montoFinal, sesion.idSujeto(), idReembolso);

        jdbc.update("UPDATE pago SET estado = 'REEMBOLSADO' WHERE id_pago = ?", idPago);
        jdbc.update("UPDATE pedido SET estado = 'DEVUELTO' WHERE id_pedido = ?", idPedido);

        Map<String, Object> notaCredito = facturacion.emitirNotaCreditoVinculada(
                idPedido, idReembolso, montoFinal, sesion.idSujeto(), sesion.identificador());

        adaptadores.notificarClienteEnSuIdioma(idCliente, idPedido, "REEMBOLSO_APROBADO_NC",
                montoFinal + " " + r.get("moneda") + " - Nota de Crédito " + notaCredito.get("numero"));

        auditoria.registrar(sesion.idSujeto(), sesion.identificador(), "APROBACION_REEMBOLSO_AISLAMIENTO_RN19",
                "REEMBOLSO", idReembolso, "EXITOSO",
                "Reembolso controlado de " + montoFinal + " " + r.get("moneda") + ", unidades aisladas="
                        + unidadesMalas + ", Nota de Crédito " + notaCredito.get("numero"));

        return ResponseEntity.ok(Map.of(
                "estado", "APROBADO",
                "notaCredito", notaCredito,
                "unidadesAisladasCuarentena", unidadesMalas,
                "mensaje", "Devolución aprobada: unidades aisladas fuera de stock vendible (RN19), reembolso procesado y Nota de Crédito " + notaCredito.get("numero") + " emitida."
        ));
    }
}
