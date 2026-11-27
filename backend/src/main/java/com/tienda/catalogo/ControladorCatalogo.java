package com.tienda.catalogo;

import com.tienda.dominio.CalculadorDominio;
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
import java.util.*;

/**
 * Módulo de Catálogo y Precios Multimoneda (CU01, RF01-RF04, RF12, RN01-RN03).
 */
@RestController
public class ControladorCatalogo {

    private final JdbcTemplate jdbc;
    private final AdaptadoresExternos adaptadores;
    private final ServicioAuditoria auditoria;

    public ControladorCatalogo(JdbcTemplate jdbc, AdaptadoresExternos adaptadores, ServicioAuditoria auditoria) {
        this.jdbc = jdbc;
        this.adaptadores = adaptadores;
        this.auditoria = auditoria;
    }

    public BigDecimal obtenerTasaVigente(String monedaDestino) {
        if ("USD".equalsIgnoreCase(monedaDestino)) return BigDecimal.ONE;
        var filas = jdbc.queryForList("""
            SELECT tasa FROM tipo_cambio
            WHERE moneda_origen = 'USD' AND moneda_destino = ?
            ORDER BY fecha DESC, id_tipo_cambio DESC LIMIT 1
        """, monedaDestino.toUpperCase());
        if (filas.isEmpty()) return BigDecimal.ONE;
        return (BigDecimal) filas.get(0).get("tasa");
    }

    @GetMapping("/api/catalogo")
    public List<Map<String, Object>> consultarCatalogo(
            @RequestParam(defaultValue = "ES") String idioma,
            @RequestParam(defaultValue = "USD") String moneda,
            @RequestParam(required = false) String categoria,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) BigDecimal precioMin,
            @RequestParam(required = false) BigDecimal precioMax,
            @RequestParam(defaultValue = "false") boolean incluirInactivos,
            @RequestParam(required = false) String paisCliente
    ) {
        BigDecimal tasa = obtenerTasaVigente(moneda);
        String simbolo = obtenerSimboloMoneda(moneda);

        // Registrar métrica de búsqueda frecuente si aplica (RF04, RF24)
        if (q != null && !q.isBlank()) {
            jdbc.update("""
                INSERT INTO registro_demanda (id_producto, tipo_solicitud, termino_referencia, pais, idioma, moneda)
                VALUES (NULL, 'BUSQUEDA_CATALOGO', ?, ?, ?, ?)
            """, q.trim(), paisCliente != null ? paisCliente : "INTL", idioma, moneda);
        }

        List<Map<String, Object>> productos = jdbc.queryForList("""
            SELECT p.*,
                   COALESCE(t_sel.nombre, t_es.nombre, p.codigo) AS nombre_localizado,
                   COALESCE(t_sel.descripcion, t_es.descripcion, '') AS descripcion_localizada
            FROM producto p
            LEFT JOIN traduccion_producto t_sel ON t_sel.id_producto = p.id_producto AND t_sel.idioma = ?
            LEFT JOIN traduccion_producto t_es  ON t_es.id_producto = p.id_producto AND t_es.idioma = 'ES'
            WHERE (? = TRUE OR (p.estado = TRUE AND p.stock > 0))
            ORDER BY p.id_producto ASC
        """, idioma.toUpperCase(), incluirInactivos);

        List<Map<String, Object>> resultado = new ArrayList<>();
        for (Map<String, Object> prod : productos) {
            int idProd = ((Number) prod.get("id_producto")).intValue();
            BigDecimal baseUsd = (BigDecimal) prod.get("precio_base_usd");
            BigDecimal precioConvertido = CalculadorDominio.convertirDesdeUsd(baseUsd, tasa);
            BigDecimal pesoVol = CalculadorDominio.calcularPesoVolumetricoKg((String) prod.get("dimensiones"));

            if (categoria != null && !categoria.isBlank() && !"TODAS".equalsIgnoreCase(categoria)) {
                if (!categoria.equalsIgnoreCase((String) prod.get("categoria"))) continue;
            }
            if (q != null && !q.isBlank()) {
                String texto = (prod.get("nombre_localizado") + " " + prod.get("descripcion_localizada") + " " + prod.get("codigo")).toLowerCase();
                if (!texto.contains(q.trim().toLowerCase())) continue;
            }
            if (precioMin != null && precioConvertido.compareTo(precioMin) < 0) {
                continue;
            }
            if (precioMax != null && precioConvertido.compareTo(precioMax) > 0) {
                continue;
            }

            Map<String, Object> item = new LinkedHashMap<>(prod);
            item.put("moneda", moneda.toUpperCase());
            item.put("simboloMoneda", simbolo);
            item.put("tasaAplicada", tasa);
            item.put("precioConvertido", precioConvertido);
            item.put("pesoVolumetricoKg", pesoVol);
            if (incluirInactivos) {
                item.put("traducciones", jdbc.queryForList(
                        "SELECT idioma, nombre, descripcion FROM traduccion_producto WHERE id_producto = ?", idProd));
                item.put("precios", jdbc.queryForList(
                        "SELECT moneda, valor FROM precio_producto WHERE id_producto = ?", idProd));
            }
            resultado.add(item);
        }
        return resultado;
    }

    @PostMapping("/api/auth/demanda-producto/{idProducto}")
    public Map<String, Object> registrarInteresProducto(
            @PathVariable int idProducto,
            @RequestParam(defaultValue = "CONSULTA_PRODUCTO") String tipo,
            @RequestParam(defaultValue = "INTL") String pais,
            @RequestParam(defaultValue = "ES") String idioma,
            @RequestParam(defaultValue = "USD") String moneda
    ) {
        jdbc.update("""
            INSERT INTO registro_demanda (id_producto, tipo_solicitud, termino_referencia, pais, idioma, moneda)
            VALUES (?, ?, (SELECT codigo FROM producto WHERE id_producto = ?), ?, ?, ?)
        """, idProducto, tipo, idProducto, pais, idioma, moneda);
        return Map.of("registrado", true);
    }

    public record TraduccionDto(String idioma, String nombre, String descripcion) {}
    public record GuardarProductoRequest(
            String codigo,
            String categoria,
            BigDecimal pesoKg,
            String dimensiones,
            String codigoArancelario,
            BigDecimal precioBaseUsd,
            int stock,
            String imagenUrl,
            Boolean estado,
            List<TraduccionDto> traducciones
    ) {}

    @PostMapping("/api/catalogo/productos")
    @Transactional
    public ResponseEntity<?> registrarProducto(@RequestBody GuardarProductoRequest req, HttpServletRequest httpReq) {
        var sesion = (ServicioJwtRs256.SesionToken) httpReq.getAttribute(FiltroSeguridadRbac.ATTR_SESION);

        if (req.codigo() == null || req.codigo().isBlank() || req.pesoKg() == null || req.pesoKg().compareTo(BigDecimal.ZERO) <= 0
                || req.precioBaseUsd() == null || req.precioBaseUsd().compareTo(BigDecimal.ZERO) <= 0
                || req.codigoArancelario() == null || req.codigoArancelario().isBlank()) {
            return ResponseEntity.badRequest().body(Map.of(
                    "mensaje", "CA-FUNC-01: SKU, peso > 0, precio base > 0, dimensiones y código arancelario son obligatorios."));
        }

        Integer dup = jdbc.queryForObject("SELECT COUNT(*) FROM producto WHERE UPPER(codigo) = UPPER(?)",
                Integer.class, req.codigo().trim());
        if (dup != null && dup > 0) {
            return ResponseEntity.status(409).body(Map.of(
                    "mensaje", "CU01 2a: El código SKU '" + req.codigo() + "' ya existe en el catálogo."));
        }

        // CU01 5a / RN01: Si no cuenta con traducción en idioma por defecto (ES), se guarda como inactivo
        boolean tieneTraduccionBase = req.traducciones() != null && req.traducciones().stream()
                .anyMatch(t -> "ES".equalsIgnoreCase(t.idioma()) && t.nombre() != null && !t.nombre().isBlank());
        boolean activoFinal = tieneTraduccionBase && (req.estado() == null || req.estado());

        KeyHolder kh = new GeneratedKeyHolder();
        jdbc.update(con -> {
            PreparedStatement ps = con.prepareStatement("""
                INSERT INTO producto (codigo, categoria, peso_kg, dimensiones, codigo_arancelario, precio_base_usd, stock, imagen_url, estado)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, new String[]{"id_producto"});
            ps.setString(1, req.codigo().trim().toUpperCase());
            ps.setString(2, req.categoria().trim());
            ps.setBigDecimal(3, req.pesoKg());
            ps.setString(4, req.dimensiones().trim());
            ps.setString(5, req.codigoArancelario().trim());
            ps.setBigDecimal(6, req.precioBaseUsd());
            ps.setInt(7, Math.max(0, req.stock()));
            ps.setString(8, req.imagenUrl());
            ps.setBoolean(9, activoFinal);
            return ps;
        }, kh);

        int idProducto = kh.getKey().intValue();
        guardarTraduccionesYPrecios(idProducto, req.precioBaseUsd(), req.traducciones());

        auditoria.registrar(sesion.idSujeto(), sesion.identificador(), "ALTA_PRODUCTO_MULTIMONEDA",
                "PRODUCTO", idProducto, "EXITOSO",
                "SKU " + req.codigo().toUpperCase() + " registrado con precio base USD " + req.precioBaseUsd());

        return ResponseEntity.ok(Map.of(
                "idProducto", idProducto,
                "estado", activoFinal,
                "mensaje", tieneTraduccionBase
                        ? "Producto registrado con traducciones y precios multimoneda calculados."
                        : "CU01 5a: Producto guardado como INACTIVO por faltar traducción en idioma base (ES)."
        ));
    }

    @PutMapping("/api/catalogo/productos/{idProducto}")
    @Transactional
    public ResponseEntity<?> actualizarProducto(@PathVariable int idProducto,
                                                @RequestBody GuardarProductoRequest req,
                                                HttpServletRequest httpReq) {
        var sesion = (ServicioJwtRs256.SesionToken) httpReq.getAttribute(FiltroSeguridadRbac.ATTR_SESION);
        jdbc.update("""
            UPDATE producto
            SET categoria = ?, peso_kg = ?, dimensiones = ?, codigo_arancelario = ?,
                precio_base_usd = ?, stock = ?, imagen_url = ?, estado = ?
            WHERE id_producto = ?
        """, req.categoria(), req.pesoKg(), req.dimensiones(), req.codigoArancelario(),
                req.precioBaseUsd(), req.stock(), req.imagenUrl(), req.estado() != null ? req.estado() : true, idProducto);

        guardarTraduccionesYPrecios(idProducto, req.precioBaseUsd(), req.traducciones());

        auditoria.registrar(sesion.idSujeto(), sesion.identificador(), "ACTUALIZACION_PRODUCTO_PRECIOS",
                "PRODUCTO", idProducto, "EXITOSO", "Actualización de datos maestros, traducciones y divisas");
        return ResponseEntity.ok(Map.of("mensaje", "Producto y precios multimoneda actualizados."));
    }

    @PostMapping("/api/catalogo/sincronizar-tasas")
    @Transactional
    public Map<String, Object> sincronizarTasasCambio(
            @RequestParam(defaultValue = "false") boolean simularFallaProveedor,
            HttpServletRequest httpReq) {
        var sesion = (ServicioJwtRs256.SesionToken) httpReq.getAttribute(FiltroSeguridadRbac.ATTR_SESION);
        boolean alertaFallback = false;
        Map<String, BigDecimal> tasas;
        try {
            if (simularFallaProveedor) {
                throw new IllegalStateException("Simulación controlada de caída del proveedor externo de divisas");
            }
            tasas = adaptadores.obtenerTasasProveedorExterno();
            for (var entry : tasas.entrySet()) {
                jdbc.update("INSERT INTO tipo_cambio (moneda_origen, moneda_destino, tasa) VALUES ('USD', ?, ?)",
                        entry.getKey(), entry.getValue());
            }
        } catch (Exception e) {
            alertaFallback = true; // RN03: conserva última tasa válida y emite alerta
        }

        var productos = jdbc.queryForList("SELECT id_producto, precio_base_usd FROM producto");
        var monedas = jdbc.queryForList("SELECT codigo_moneda FROM param_moneda WHERE habilitada = TRUE");
        for (var p : productos) {
            int idProd = ((Number) p.get("id_producto")).intValue();
            BigDecimal base = (BigDecimal) p.get("precio_base_usd");
            for (var m : monedas) {
                String codMon = (String) m.get("codigo_moneda");
                BigDecimal tasa = obtenerTasaVigente(codMon);
                BigDecimal valor = CalculadorDominio.convertirDesdeUsd(base, tasa);
                jdbc.update("DELETE FROM precio_producto WHERE id_producto = ? AND moneda = ?", idProd, codMon);
                jdbc.update("INSERT INTO precio_producto (id_producto, moneda, valor) VALUES (?, ?, ?)",
                        idProd, codMon, valor);
            }
        }

        auditoria.registrar(sesion.idSujeto(), sesion.identificador(), "SINCRONIZACION_TIPOS_CAMBIO",
                "TIPO_CAMBIO", null, alertaFallback ? "ALERTA_FALLBACK_RN03" : "EXITOSO",
                "Recálculo masivo de precios multimoneda completado");

        return Map.of(
                "alertaFallbackRn03", alertaFallback,
                "mensaje", alertaFallback
                        ? "RN03: Proveedor externo sin respuesta; se conservó la última tasa vigente."
                        : "Tasas de cambio sincronizadas y precios multimoneda recalculados."
        );
    }

    private void guardarTraduccionesYPrecios(int idProducto, BigDecimal precioBaseUsd, List<TraduccionDto> traducciones) {
        if (traducciones != null) {
            for (TraduccionDto t : traducciones) {
                if (t.nombre() == null || t.nombre().isBlank()) continue;
                jdbc.update("DELETE FROM traduccion_producto WHERE id_producto = ? AND idioma = ?",
                        idProducto, t.idioma().toUpperCase());
                jdbc.update("INSERT INTO traduccion_producto (id_producto, idioma, nombre, descripcion) VALUES (?, ?, ?, ?)",
                        idProducto, t.idioma().toUpperCase(), t.nombre().trim(),
                        t.descripcion() != null ? t.descripcion().trim() : "");
            }
        }
        var monedas = jdbc.queryForList("SELECT codigo_moneda FROM param_moneda WHERE habilitada = TRUE");
        for (var m : monedas) {
            String codMon = (String) m.get("codigo_moneda");
            BigDecimal tasa = obtenerTasaVigente(codMon);
            BigDecimal valor = CalculadorDominio.convertirDesdeUsd(precioBaseUsd, tasa);
            jdbc.update("DELETE FROM precio_producto WHERE id_producto = ? AND moneda = ?", idProducto, codMon);
            jdbc.update("INSERT INTO precio_producto (id_producto, moneda, valor) VALUES (?, ?, ?)",
                    idProducto, codMon, valor);
        }
    }

    private String obtenerSimboloMoneda(String moneda) {
        var filas = jdbc.queryForList("SELECT simbolo FROM param_moneda WHERE codigo_moneda = ?", moneda.toUpperCase());
        return filas.isEmpty() ? "$" : (String) filas.get(0).get("simbolo");
    }
}
