package com.tienda.envios;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.tienda.dominio.CalculadorDominio;
import com.tienda.integraciones.AdaptadoresExternos;
import com.tienda.seguridad.FiltroSeguridadRbac;
import com.tienda.seguridad.ServicioAuditoria;
import com.tienda.seguridad.ServicioJwtRs256;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

/**
 * Módulo de Logística Internacional, Emisión de Guías y Seguimiento Aduanero
 * (CU07, CU08, RF14, RF15, RN08, RN13, RN14, Diagrama D09).
 */
@RestController
public class ControladorEnvio {

    private final JdbcTemplate jdbc;
    private final AdaptadoresExternos adaptadores;
    private final ServicioAuditoria auditoria;
    private final ObjectMapper mapper = new ObjectMapper();

    public ControladorEnvio(JdbcTemplate jdbc, AdaptadoresExternos adaptadores, ServicioAuditoria auditoria) {
        this.jdbc = jdbc;
        this.adaptadores = adaptadores;
        this.auditoria = auditoria;
    }

    @GetMapping("/api/envios/gestion/bandeja")
    public Map<String, Object> consultarBandejaLogistica() {
        var listosParaGuia = jdbc.queryForList("""
            SELECT p.*, d.pais AS pais_destino, d.ciudad, d.linea_direccion, d.codigo_postal,
                   c.nombres || ' ' || c.apellidos AS nombre_cliente
            FROM pedido p
            JOIN direccion d ON d.id_direccion = p.id_direccion
            JOIN cliente c ON c.id_cliente = p.id_cliente
            LEFT JOIN envio e ON e.id_pedido = p.id_pedido
            WHERE p.estado IN ('PAGADO', 'PREPARADO') AND e.id_envio IS NULL
            ORDER BY p.id_pedido DESC
        """);

        var despachosActivos = jdbc.queryForList("""
            SELECT e.*, p.moneda, p.total, p.estado AS estado_pedido, p.peso_tasable,
                   p.peso_fisico_total, p.peso_volumetrico_total, p.tipo_venta, p.idioma_operacion,
                   d.pais AS pais_destino, pp.nombre AS nombre_pais, d.ciudad, d.linea_direccion, d.codigo_postal,
                   c.nombres || ' ' || c.apellidos AS nombre_cliente, c.datos_fiscales
            FROM envio e
            JOIN pedido p ON p.id_pedido = e.id_pedido
            JOIN direccion d ON d.id_direccion = p.id_direccion
            JOIN param_pais pp ON pp.codigo_pais = d.pais
            JOIN cliente c ON c.id_cliente = p.id_cliente
            ORDER BY e.id_envio DESC
        """);

        List<Map<String, Object>> despachosEnriquecidos = new ArrayList<>();
        for (Map<String, Object> d : despachosActivos) {
            Map<String, Object> copia = new LinkedHashMap<>(d);
            int idPed = ((Number) d.get("id_pedido")).intValue();
            copia.put("detalles", jdbc.queryForList("""
                SELECT dp.cantidad, dp.precio_unitario, pr.codigo, pr.codigo_arancelario, pr.peso_kg, pr.dimensiones,
                       COALESCE(tp.nombre, pr.codigo) AS nombre_producto
                FROM detalle_pedido dp
                JOIN producto pr ON pr.id_producto = dp.id_producto
                LEFT JOIN traduccion_producto tp ON tp.id_producto = pr.id_producto AND tp.idioma = 'ES'
                WHERE dp.id_pedido = ?
            """, idPed));
            despachosEnriquecidos.add(copia);
        }

        return Map.of(
                "pendientesGuia", listosParaGuia,
                "despachos", despachosEnriquecidos
        );
    }

    /**
     * CU08 / RF15: Seguimiento logístico público o autenticado por número de guía internacional
     * (también acepta búsqueda por #ID de pedido para comodidad del cliente).
     */
    @GetMapping("/api/envios/seguimiento/{codigo}")
    public ResponseEntity<?> consultarSeguimientoLogistico(@PathVariable String codigo) {
        String limpio = codigo != null ? codigo.trim() : "";
        if (limpio.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("mensaje", "Debe ingresar un número de guía internacional."));
        }

        List<Map<String, Object>> envios = jdbc.queryForList("""
            SELECT e.*, p.estado AS estado_pedido, p.fecha AS fecha_pedido, p.moneda, p.total,
                   p.peso_tasable, p.tipo_venta, p.idioma_operacion,
                   d.pais AS pais_destino, pp.nombre AS nombre_pais, d.ciudad, d.codigo_postal,
                   c.nombres || ' ' || c.apellidos AS nombre_cliente
            FROM envio e
            JOIN pedido p ON p.id_pedido = e.id_pedido
            JOIN direccion d ON d.id_direccion = p.id_direccion
            JOIN param_pais pp ON pp.codigo_pais = d.pais
            JOIN cliente c ON c.id_cliente = p.id_cliente
            WHERE UPPER(e.numero_guia) = UPPER(?)
        """, limpio);

        if (envios.isEmpty() && limpio.replace("#", "").matches("\\d+")) {
            int idPed = Integer.parseInt(limpio.replace("#", ""));
            envios = jdbc.queryForList("""
                SELECT e.*, p.estado AS estado_pedido, p.fecha AS fecha_pedido, p.moneda, p.total,
                       p.peso_tasable, p.tipo_venta, p.idioma_operacion,
                       d.pais AS pais_destino, pp.nombre AS nombre_pais, d.ciudad, d.codigo_postal,
                       c.nombres || ' ' || c.apellidos AS nombre_cliente
                FROM envio e
                JOIN pedido p ON p.id_pedido = e.id_pedido
                JOIN direccion d ON d.id_direccion = p.id_direccion
                JOIN param_pais pp ON pp.codigo_pais = d.pais
                JOIN cliente c ON c.id_cliente = p.id_cliente
                WHERE e.id_pedido = ?
            """, idPed);
        }

        if (envios.isEmpty()) {
            return ResponseEntity.status(404).body(Map.of(
                    "mensaje", "CU08: No se encontró ningún envío internacional asociado a la guía '" + limpio + "'."));
        }

        Map<String, Object> env = new LinkedHashMap<>(envios.get(0));
        int idPedido = ((Number) env.get("id_pedido")).intValue();
        List<Map<String, String>> eventos;
        try {
            eventos = mapper.readValue((String) env.get("eventos_tracking"), new TypeReference<>() {});
        } catch (Exception e) {
            eventos = List.of();
        }
        env.put("eventos", eventos);
        env.put("detalles", jdbc.queryForList("""
            SELECT dp.cantidad, pr.codigo, pr.codigo_arancelario, pr.peso_kg,
                   COALESCE(tp.nombre, pr.codigo) AS nombre_producto
            FROM detalle_pedido dp
            JOIN producto pr ON pr.id_producto = dp.id_producto
            LEFT JOIN traduccion_producto tp ON tp.id_producto = pr.id_producto AND tp.idioma = ?
            WHERE dp.id_pedido = ?
        """, env.get("idioma_operacion"), idPedido));

        return ResponseEntity.ok(env);
    }

    public record EmitirGuiaReq(int idPedido, String operador, Boolean despacharInmediato) {}

    @PostMapping("/api/envios/gestion/emitir-guia")
    @Transactional
    public ResponseEntity<?> generarGuiaExportacion(@RequestBody EmitirGuiaReq req, HttpServletRequest httpReq) {
        var sesion = (ServicioJwtRs256.SesionToken) httpReq.getAttribute(FiltroSeguridadRbac.ATTR_SESION);

        var peds = jdbc.queryForList("""
            SELECT p.*, d.pais AS pais_destino
            FROM pedido p
            JOIN direccion d ON d.id_direccion = p.id_direccion
            WHERE p.id_pedido = ?
        """, req.idPedido());
        if (peds.isEmpty()) return ResponseEntity.notFound().build();
        Map<String, Object> ped = peds.get(0);

        Integer guiaExistente = jdbc.queryForObject(
                "SELECT COUNT(*) FROM envio WHERE id_pedido = ?", Integer.class, req.idPedido());
        if (guiaExistente != null && guiaExistente > 0) {
            return ResponseEntity.status(409).body(Map.of(
                    "mensaje", "RN13: El pedido #" + req.idPedido() + " ya cuenta con un número de guía único asignado."));
        }

        // RN08: Precondición estricta de Pago APROBADO
        Integer pagosAprobados = jdbc.queryForObject(
                "SELECT COUNT(*) FROM pago WHERE id_pedido = ? AND estado = 'APROBADO'", Integer.class, req.idPedido());
        if (pagosAprobados == null || pagosAprobados == 0) {
            return ResponseEntity.badRequest().body(Map.of(
                    "mensaje", "RN08: Ningún pedido puede pasar a despacho ni generar guía sin un Pago en estado APROBADO."));
        }

        // CU07 2a / RN14: Validar datos de exportación completos (peso, dimensiones y código arancelario HS)
        var items = jdbc.queryForList("""
            SELECT pr.codigo, pr.peso_kg, pr.dimensiones, pr.codigo_arancelario
            FROM detalle_pedido dp
            JOIN producto pr ON pr.id_producto = dp.id_producto
            WHERE dp.id_pedido = ?
        """, req.idPedido());
        for (var it : items) {
            BigDecimal peso = (BigDecimal) it.get("peso_kg");
            String dim = (String) it.get("dimensiones");
            String hs = (String) it.get("codigo_arancelario");
            if (peso == null || peso.compareTo(BigDecimal.ZERO) <= 0 || dim == null || dim.isBlank() || hs == null || hs.isBlank()) {
                return ResponseEntity.badRequest().body(Map.of(
                        "mensaje", "CU07 2a / RN14: Faltan datos aduaneros (peso, dimensiones o código arancelario HS) en el producto " + it.get("codigo")));
            }
        }

        String pais = (String) ped.get("pais_destino");
        var despacho = adaptadores.emitirGuiaExportacion(req.idPedido(), pais, req.operador());
        boolean inmediato = req.despacharInmediato() == null || req.despacharInmediato();

        String ahora = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm"));
        List<Map<String, String>> eventosIniciales = new ArrayList<>();
        eventosIniciales.add(Map.of("fecha", ahora, "estado", "PENDIENTE",
                "detalle", "Documentación aduanera (CN23/HS) validada y etiqueta " + despacho.etiquetaExportacion() + " emitida en almacén"));
        if (inmediato) {
            eventosIniciales.add(Map.of("fecha", ahora, "estado", "EN_TRANSITO",
                    "detalle", "Despacho internacional recolectado por " + despacho.operador() + " rumbo a " + pais));
        }

        String eventosJson;
        try {
            eventosJson = mapper.writeValueAsString(eventosIniciales);
        } catch (Exception e) {
            eventosJson = "[]";
        }

        String estadoEnvioInicial = inmediato ? "EN_TRANSITO" : "PENDIENTE";
        String estadoPedidoInicial = inmediato ? "ENVIADO" : "PREPARADO";

        jdbc.update("""
            INSERT INTO envio (id_pedido, operador, numero_guia, etiqueta_exportacion, costo, fecha_estimada, estado, eventos_tracking)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, req.idPedido(), despacho.operador(), despacho.numeroGuia(), despacho.etiquetaExportacion(),
                ped.get("costo_envio"), java.sql.Date.valueOf(despacho.fechaEstimada()), estadoEnvioInicial, eventosJson);

        jdbc.update("UPDATE pedido SET estado = ? WHERE id_pedido = ?", estadoPedidoInicial, req.idPedido());

        adaptadores.notificarClienteEnSuIdioma(
                ((Number) ped.get("id_cliente")).intValue(),
                req.idPedido(),
                inmediato ? "GUIA_ENVIO_EMITIDA" : "PEDIDO_PREPARADO_ALMACEN",
                despacho.operador() + " - Guía " + despacho.numeroGuia()
        );

        auditoria.registrar(sesion.idSujeto(), sesion.identificador(), "EMISION_GUIA_INTERNACIONAL",
                "ENVIO", req.idPedido(), "EXITOSO",
                "Guía única " + despacho.numeroGuia() + " generada con " + despacho.operador() + " (estado=" + estadoEnvioInicial + ")");

        return ResponseEntity.ok(Map.of(
                "numeroGuia", despacho.numeroGuia(),
                "operador", despacho.operador(),
                "etiquetaExportacion", despacho.etiquetaExportacion(),
                "fechaEstimada", despacho.fechaEstimada().toString(),
                "estadoEnvio", estadoEnvioInicial,
                "estadoPedido", estadoPedidoInicial,
                "mensaje", inmediato
                        ? "Guía internacional " + despacho.numeroGuia() + " generada y pedido despachado en tránsito."
                        : "Pedido marcado como PREPARADO con guía " + despacho.numeroGuia() + " lista para recolección del operador."
        ));
    }

    public record ActualizarEstadoEnvioReq(String nuevoEstado, String observacionAduana) {}

    @PatchMapping("/api/envios/gestion/{idEnvio}/estado")
    @Transactional
    public ResponseEntity<?> actualizarEstadoSeguimiento(@PathVariable int idEnvio,
                                                         @RequestBody ActualizarEstadoEnvioReq req,
                                                         HttpServletRequest httpReq) {
        var sesion = (ServicioJwtRs256.SesionToken) httpReq.getAttribute(FiltroSeguridadRbac.ATTR_SESION);

        var envios = jdbc.queryForList("""
            SELECT e.*, p.id_cliente FROM envio e JOIN pedido p ON p.id_pedido = e.id_pedido WHERE e.id_envio = ?
        """, idEnvio);
        if (envios.isEmpty()) return ResponseEntity.notFound().build();

        Map<String, Object> env = envios.get(0);
        String estadoActual = (String) env.get("estado");
        String destino = req.nuevoEstado().toUpperCase();

        if (!CalculadorDominio.esTransicionEnvioValida(estadoActual, destino)) {
            return ResponseEntity.badRequest().body(Map.of(
                    "mensaje", "D09: Transición logística no permitida de " + estadoActual + " hacia " + destino + "."));
        }

        List<Map<String, String>> historial;
        try {
            historial = mapper.readValue((String) env.get("eventos_tracking"), new TypeReference<>() {});
        } catch (Exception e) {
            historial = new ArrayList<>();
        }
        historial.add(Map.of(
                "fecha", LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")),
                "estado", destino,
                "detalle", req.observacionAduana() != null && !req.observacionAduana().isBlank()
                        ? req.observacionAduana()
                        : "Actualización reportada por operador " + env.get("operador")
        ));

        String nuevoJson;
        try {
            nuevoJson = mapper.writeValueAsString(historial);
        } catch (Exception e) {
            nuevoJson = "[]";
        }

        jdbc.update("UPDATE envio SET estado = ?, eventos_tracking = ? WHERE id_envio = ?", destino, nuevoJson, idEnvio);

        int idPedido = ((Number) env.get("id_pedido")).intValue();
        int idCliente = ((Number) env.get("id_cliente")).intValue();
        if ("EN_TRANSITO".equals(destino) && "PENDIENTE".equals(estadoActual)) {
            jdbc.update("UPDATE pedido SET estado = 'ENVIADO' WHERE id_pedido = ?", idPedido);
            adaptadores.notificarClienteEnSuIdioma(idCliente, idPedido,
                    "GUIA_ENVIO_EMITIDA", "Paquete recolectado en tránsito internacional - Guía " + env.get("numero_guia"));
        } else if ("EN_ADUANA".equals(destino)) {
            adaptadores.notificarClienteEnSuIdioma(idCliente, idPedido,
                    "ENVIO_EN_ADUANA", "Guía " + env.get("numero_guia") + " en inspección aduanera de destino");
        } else if ("ENTREGADO".equals(destino)) {
            jdbc.update("UPDATE pedido SET estado = 'ENTREGADO' WHERE id_pedido = ?", idPedido);
            adaptadores.notificarClienteEnSuIdioma(idCliente, idPedido,
                    "PEDIDO_ENTREGADO", "Entrega final confirmada para guía " + env.get("numero_guia"));
        } else if ("DEVUELTO".equals(destino)) {
            jdbc.update("UPDATE pedido SET estado = 'DEVUELTO' WHERE id_pedido = ?", idPedido);
            adaptadores.notificarClienteEnSuIdioma(idCliente, idPedido,
                    "INCIDENCIA_ADUANA_DEVUELTO", "Paquete retornado desde aduana de destino");
        }

        auditoria.registrar(sesion.idSujeto(), sesion.identificador(), "CAMBIO_ESTADO_ENVIO_" + destino,
                "ENVIO", idEnvio, "EXITOSO", "Guía " + env.get("numero_guia") + ": " + estadoActual + " -> " + destino);

        return ResponseEntity.ok(Map.of("estado", destino, "mensaje", "Seguimiento de envío actualizado a " + destino + "."));
    }
}
