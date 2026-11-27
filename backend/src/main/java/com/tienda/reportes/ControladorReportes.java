package com.tienda.reportes;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Módulo de Reportes Multidimensionales y Estadísticas Empresariales de Demanda
 * (CU12, RF20, RF24, CA-FUNC-10 - Consultas de solo lectura para Gerencia).
 */
@RestController
public class ControladorReportes {

    private final JdbcTemplate jdbc;

    public ControladorReportes(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping("/api/reportes/estadisticas")
    public Map<String, Object> obtenerTableroEstadisticoEmpresa() {
        BigDecimal ingresosBrutosUsd = jdbc.queryForObject(
                "SELECT COALESCE(SUM(equivalente_base), 0) FROM pago WHERE estado IN ('APROBADO', 'REEMBOLSADO')",
                BigDecimal.class);
        Integer totalPedidosPagados = jdbc.queryForObject(
                "SELECT COUNT(*) FROM pedido WHERE estado IN ('PAGADO', 'PREPARADO', 'ENVIADO', 'ENTREGADO', 'DEVUELTO')",
                Integer.class);
        Integer totalDevueltosDefecto = jdbc.queryForObject(
                "SELECT COUNT(*) FROM reembolso WHERE causal_devolucion = 'PRODUCTO_DEFECTUOSO' AND estado = 'APROBADO'",
                Integer.class);

        BigDecimal tasaDevolucionDefectos = (totalPedidosPagados != null && totalPedidosPagados > 0)
                ? BigDecimal.valueOf(totalDevueltosDefecto * 100.0 / totalPedidosPagados).setScale(2, RoundingMode.HALF_UP)
                : BigDecimal.ZERO;

        var rankingProductosMasDemandados = jdbc.queryForList("""
            SELECT pr.id_producto, pr.codigo, pr.categoria, pr.stock, pr.stock_defectuoso,
                   COALESCE(tp.nombre, pr.codigo) AS nombre,
                   COALESCE((SELECT SUM(dp.cantidad) FROM detalle_pedido dp WHERE dp.id_producto = pr.id_producto), 0) AS unidades_vendidas,
                   COALESCE((SELECT COUNT(*) FROM registro_demanda rd WHERE rd.id_producto = pr.id_producto), 0) AS solicitudes_clientes
            FROM producto pr
            LEFT JOIN traduccion_producto tp ON tp.id_producto = pr.id_producto AND tp.idioma = 'ES'
            ORDER BY solicitudes_clientes DESC, unidades_vendidas DESC
        """);

        var mayoresSolicitudesClientes = jdbc.queryForList("""
            SELECT tipo_solicitud, COALESCE(termino_referencia, 'General') AS referencia,
                   pais, idioma, COUNT(*) AS frecuencia
            FROM registro_demanda
            GROUP BY tipo_solicitud, termino_referencia, pais, idioma
            ORDER BY frecuencia DESC
            LIMIT 10
        """);

        var desempenoPorPais = jdbc.queryForList("""
            SELECT d.pais, pp.nombre AS nombre_pais, COUNT(DISTINCT p.id_pedido) AS cantidad_pedidos,
                   COALESCE(SUM(pg.equivalente_base), 0) AS volumen_usd
            FROM pedido p
            JOIN direccion d ON d.id_direccion = p.id_direccion
            JOIN param_pais pp ON pp.codigo_pais = d.pais
            LEFT JOIN pago pg ON pg.id_pedido = p.id_pedido AND pg.estado IN ('APROBADO', 'REEMBOLSADO')
            GROUP BY d.pais, pp.nombre
            ORDER BY volumen_usd DESC
        """);

        Map<String, Object> kpis = new LinkedHashMap<>();
        kpis.put("ingresosConsolidadosUsd", ingresosBrutosUsd);
        kpis.put("totalPedidosOperados", totalPedidosPagados);
        kpis.put("devolucionesPorDefecto", totalDevueltosDefecto);
        kpis.put("tasaDevolucionDefectosPct", tasaDevolucionDefectos);
        kpis.put("rankingProductosDemandados", rankingProductosMasDemandados);
        kpis.put("mayoresSolicitudesClientes", mayoresSolicitudesClientes);
        kpis.put("desempenoPorMercado", desempenoPorPais);
        return kpis;
    }

    @GetMapping("/api/reportes/multidimensional")
    public Map<String, Object> generarReporteControlado(
            @RequestParam(defaultValue = "TODOS") String pais,
            @RequestParam(defaultValue = "TODOS") String tipoVenta,
            @RequestParam(defaultValue = "TODOS") String idioma,
            @RequestParam(defaultValue = "TODOS") String moneda,
            @RequestParam(required = false) String fechaDesde,
            @RequestParam(required = false) String fechaHasta
    ) {
        StringBuilder sql = new StringBuilder("""
            SELECT p.id_pedido, p.fecha, d.pais, pp.nombre AS nombre_pais,
                   p.tipo_venta, p.idioma_operacion, p.moneda,
                   p.subtotal, p.impuestos, p.costo_envio, p.total, p.estado,
                   c.nombres || ' ' || c.apellidos AS cliente,
                   COALESCE(pg.equivalente_base, ROUND(p.total / p.tasa_aplicada, 2)) AS equivalente_usd,
                   f.numero AS numero_factura,
                   e.numero_guia
            FROM pedido p
            JOIN direccion d ON d.id_direccion = p.id_direccion
            JOIN param_pais pp ON pp.codigo_pais = d.pais
            JOIN cliente c ON c.id_cliente = p.id_cliente
            LEFT JOIN pago pg ON pg.id_pedido = p.id_pedido AND pg.estado IN ('APROBADO', 'REEMBOLSADO')
            LEFT JOIN factura f ON f.id_pedido = p.id_pedido AND f.tipo_documento = 'FACTURA'
            LEFT JOIN envio e ON e.id_pedido = p.id_pedido
            WHERE 1 = 1
        """);
        List<Object> params = new ArrayList<>();

        if (!"TODOS".equalsIgnoreCase(pais)) {
            sql.append(" AND d.pais = ?");
            params.add(pais.toUpperCase());
        }
        if (!"TODOS".equalsIgnoreCase(tipoVenta)) {
            sql.append(" AND p.tipo_venta = ?");
            params.add(tipoVenta.toUpperCase());
        }
        if (!"TODOS".equalsIgnoreCase(idioma)) {
            sql.append(" AND p.idioma_operacion = ?");
            params.add(idioma.toUpperCase());
        }
        if (!"TODOS".equalsIgnoreCase(moneda)) {
            sql.append(" AND p.moneda = ?");
            params.add(moneda.toUpperCase());
        }
        if (fechaDesde != null && !fechaDesde.isBlank()) {
            sql.append(" AND CAST(p.fecha AS DATE) >= ?");
            params.add(java.sql.Date.valueOf(fechaDesde.trim()));
        }
        if (fechaHasta != null && !fechaHasta.isBlank()) {
            sql.append(" AND CAST(p.fecha AS DATE) <= ?");
            params.add(java.sql.Date.valueOf(fechaHasta.trim()));
        }
        sql.append(" ORDER BY p.id_pedido DESC");

        List<Map<String, Object>> filas = jdbc.queryForList(sql.toString(), params.toArray());
        BigDecimal sumaUsd = filas.stream()
                .map(r -> (BigDecimal) r.get("equivalente_usd"))
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        Map<String, Object> filtros = new LinkedHashMap<>();
        filtros.put("pais", pais);
        filtros.put("tipoVenta", tipoVenta);
        filtros.put("idioma", idioma);
        filtros.put("moneda", moneda);
        filtros.put("fechaDesde", fechaDesde != null ? fechaDesde : "");
        filtros.put("fechaHasta", fechaHasta != null ? fechaHasta : "");

        return Map.of(
                "filtrosAplicados", filtros,
                "cantidadRegistros", filas.size(),
                "totalConsolidadoUsd", sumaUsd,
                "registros", filas
        );
    }
}
