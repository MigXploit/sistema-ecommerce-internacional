package com.tienda.facturacion;

import com.tienda.integraciones.AdaptadoresExternos;
import com.tienda.seguridad.FiltroSeguridadRbac;
import com.tienda.seguridad.ServicioAuditoria;
import com.tienda.seguridad.ServicioJwtRs256;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.PreparedStatement;
import java.sql.Types;
import java.util.List;
import java.util.Map;

/**
 * Módulo de Facturación Comercial y Notas de Crédito Inmutables (CU09, RF16, RF17, RN15, RN16).
 */
@Service
@RestController
public class ServicioFacturacion {

    private final JdbcTemplate jdbc;
    private final ServicioAuditoria auditoria;
    private final AdaptadoresExternos adaptadores;

    public ServicioFacturacion(JdbcTemplate jdbc, ServicioAuditoria auditoria, AdaptadoresExternos adaptadores) {
        this.jdbc = jdbc;
        this.auditoria = auditoria;
        this.adaptadores = adaptadores;
    }

    @Transactional
    public Map<String, Object> emitirFacturaComercial(int idPedido, Integer idUsuarioActor, String actor) {
        var existentes = jdbc.queryForList(
                "SELECT * FROM factura WHERE id_pedido = ? AND tipo_documento = 'FACTURA'", idPedido);
        if (!existentes.isEmpty()) {
            return existentes.get(0);
        }

        Map<String, Object> ped = jdbc.queryForMap("""
            SELECT p.*, c.datos_fiscales, d.pais AS pais_destino
            FROM pedido p
            JOIN cliente c ON c.id_cliente = p.id_cliente
            JOIN direccion d ON d.id_direccion = p.id_direccion
            WHERE p.id_pedido = ?
        """, idPedido);

        String datosFiscales = (String) ped.get("datos_fiscales");
        if (datosFiscales == null || datosFiscales.isBlank()) {
            throw new IllegalStateException("CU09 2a: Datos fiscales del cliente incompletos para emitir factura comercial.");
        }

        String pais = (String) ped.get("pais_destino");
        Integer seq = jdbc.queryForObject("SELECT COALESCE(MAX(id_factura), 0) + 91 FROM factura", Integer.class);
        String numeroFactura = "FAC-" + pais + "-2026-" + String.format("%04d", seq);

        KeyHolder kh = new GeneratedKeyHolder();
        jdbc.update(con -> {
            PreparedStatement ps = con.prepareStatement("""
                INSERT INTO factura (id_pedido, tipo_documento, id_factura_origen, id_reembolso, numero,
                                     pais, datos_fiscales_cliente, moneda, subtotal, impuestos, total, estado)
                VALUES (?, 'FACTURA', NULL, NULL, ?, ?, ?, ?, ?, ?, ?, 'EMITIDA')
            """, new String[]{"id_factura"});
            ps.setInt(1, idPedido);
            ps.setString(2, numeroFactura);
            ps.setString(3, pais);
            ps.setString(4, datosFiscales);
            ps.setString(5, (String) ped.get("moneda"));
            ps.setBigDecimal(6, (BigDecimal) ped.get("subtotal"));
            ps.setBigDecimal(7, (BigDecimal) ped.get("impuestos"));
            ps.setBigDecimal(8, (BigDecimal) ped.get("total"));
            return ps;
        }, kh);

        int idFactura = kh.getKey().intValue();
        auditoria.registrar(idUsuarioActor, actor, "EMISION_FACTURA_COMERCIAL",
                "FACTURA", idFactura, "EXITOSO", "Factura inmutable " + numeroFactura + " emitida para pedido #" + idPedido);

        adaptadores.notificarClienteEnSuIdioma(
                ((Number) ped.get("id_cliente")).intValue(),
                idPedido,
                "FACTURA_EMITIDA",
                numeroFactura + " (" + ped.get("total") + " " + ped.get("moneda") + ")"
        );

        return jdbc.queryForMap("SELECT * FROM factura WHERE id_factura = ?", idFactura);
    }

    @Transactional
    public Map<String, Object> emitirNotaCreditoVinculada(int idPedido, int idReembolso, BigDecimal montoReembolso,
                                                          Integer idUsuarioActor, String actor) {
        Map<String, Object> facOrigen = jdbc.queryForMap(
                "SELECT * FROM factura WHERE id_pedido = ? AND tipo_documento = 'FACTURA'", idPedido);
        int idFacOrigen = ((Number) facOrigen.get("id_factura")).intValue();
        String pais = (String) facOrigen.get("pais");

        Integer seq = jdbc.queryForObject("SELECT COUNT(*) + 13 FROM factura WHERE tipo_documento = 'NOTA_CREDITO'", Integer.class);
        String numeroNc = "NC-" + pais + "-2026-" + String.format("%04d", seq);

        BigDecimal totalOriginal = (BigDecimal) facOrigen.get("total");
        BigDecimal proporcion = totalOriginal.compareTo(BigDecimal.ZERO) > 0
                ? montoReembolso.divide(totalOriginal, 4, RoundingMode.HALF_UP)
                : BigDecimal.ONE;
        BigDecimal subProp = ((BigDecimal) facOrigen.get("subtotal")).multiply(proporcion).setScale(2, RoundingMode.HALF_UP);
        BigDecimal impProp = ((BigDecimal) facOrigen.get("impuestos")).multiply(proporcion).setScale(2, RoundingMode.HALF_UP);

        KeyHolder kh = new GeneratedKeyHolder();
        jdbc.update(con -> {
            PreparedStatement ps = con.prepareStatement("""
                INSERT INTO factura (id_pedido, tipo_documento, id_factura_origen, id_reembolso, numero,
                                     pais, datos_fiscales_cliente, moneda, subtotal, impuestos, total, estado)
                VALUES (?, 'NOTA_CREDITO', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'EMITIDA')
            """, new String[]{"id_factura"});
            ps.setInt(1, idPedido);
            ps.setInt(2, idFacOrigen);
            ps.setObject(3, idReembolso, Types.INTEGER);
            ps.setString(4, numeroNc);
            ps.setString(5, pais);
            ps.setString(6, (String) facOrigen.get("datos_fiscales_cliente"));
            ps.setString(7, (String) facOrigen.get("moneda"));
            ps.setBigDecimal(8, subProp);
            ps.setBigDecimal(9, impProp);
            ps.setBigDecimal(10, montoReembolso);
            return ps;
        }, kh);

        int idNc = kh.getKey().intValue();
        auditoria.registrar(idUsuarioActor, actor, "EMISION_NOTA_CREDITO_RN16",
                "FACTURA", idNc, "EXITOSO",
                "Nota de crédito " + numeroNc + " vinculada a factura inmutable " + facOrigen.get("numero"));
        return jdbc.queryForMap("SELECT * FROM factura WHERE id_factura = ?", idNc);
    }

    @GetMapping("/api/facturacion/gestion")
    public List<Map<String, Object>> listarComprobantesTributarios() {
        return jdbc.queryForList("""
            SELECT f.*, orig.numero AS factura_origen_numero,
                   c.nombres || ' ' || c.apellidos AS nombre_cliente
            FROM factura f
            JOIN pedido p ON p.id_pedido = f.id_pedido
            JOIN cliente c ON c.id_cliente = p.id_cliente
            LEFT JOIN factura orig ON orig.id_factura = f.id_factura_origen
            ORDER BY f.id_factura DESC
        """);
    }

    @DeleteMapping("/api/facturacion/gestion/{idFactura}")
    public ResponseEntity<?> intentarBorrarFactura(@PathVariable int idFactura, HttpServletRequest httpReq) {
        var sesion = (ServicioJwtRs256.SesionToken) httpReq.getAttribute(FiltroSeguridadRbac.ATTR_SESION);
        auditoria.registrar(sesion.idSujeto(), sesion.identificador(), "INTENTO_ALTERACION_FACTURA",
                "FACTURA", idFactura, "BLOQUEADO_RN16", "RN16: Factura emitida inmutable");
        return ResponseEntity.status(409).body(Map.of(
                "mensaje", "REGLA DE NEGOCIO RN16: Las facturas emitidas son inmutables y no pueden editarse ni borrarse físicamente. Todo ajuste exige emitir una Nota de Crédito vinculada."));
    }
}
