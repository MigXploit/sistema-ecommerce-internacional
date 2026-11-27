package com.tienda.clientes;

import com.tienda.seguridad.ControladorSeguridad;
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

import java.sql.PreparedStatement;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * Módulo de Clientes Internacionales y Direcciones Postales (CU02, RF05, RF06, RN04, RN06, RN20).
 */
@RestController
public class ControladorCliente {

    private final JdbcTemplate jdbc;
    private final ControladorSeguridad seguridad;
    private final ServicioJwtRs256 jwtService;
    private final ServicioAuditoria auditoria;

    public ControladorCliente(JdbcTemplate jdbc, ControladorSeguridad seguridad,
                              ServicioJwtRs256 jwtService, ServicioAuditoria auditoria) {
        this.jdbc = jdbc;
        this.seguridad = seguridad;
        this.jwtService = jwtService;
        this.auditoria = auditoria;
    }

    public record RegistroClienteRequest(
            String nombres,
            String apellidos,
            String correo,
            String clave,
            String pais,
            String idioma,
            String monedaPreferida,
            String datosFiscales,
            String ciudad,
            String lineaDireccion,
            String codigoPostal
    ) {}

    @PostMapping("/api/auth/registro-cliente")
    @Transactional
    public ResponseEntity<?> registrarCliente(@RequestBody RegistroClienteRequest req) {
        if (req.correo() == null || !req.correo().contains("@") || req.nombres() == null || req.nombres().isBlank()
                || req.datosFiscales() == null || req.datosFiscales().isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("mensaje", "Datos personales, correo válido e identificación fiscal son obligatorios."));
        }

        // RN04 / CU02 4a: Verificar unicidad de correo electrónico
        Integer existe = jdbc.queryForObject("SELECT COUNT(*) FROM cliente WHERE LOWER(correo) = LOWER(?)",
                Integer.class, req.correo().trim());
        if (existe != null && existe > 0) {
            return ResponseEntity.status(409).body(Map.of(
                    "mensaje", "CU02 4a / RN04: El correo electrónico '" + req.correo() + "' ya se encuentra registrado."));
        }

        // RN06 / RN12: Validar país habilitado y formato postal internacional
        var validacionPais = validarPaisYCodigoPostal(req.pais(), req.codigoPostal());
        if (validacionPais != null) {
            return ResponseEntity.badRequest().body(Map.of("mensaje", validacionPais));
        }

        // CU02 paso 5 / RN20: Delegar hasheo bcrypt costo 12 al módulo independiente de Seguridad
        String claveHash = seguridad.hashearClaveBcrypt12(req.clave());

        KeyHolder khCliente = new GeneratedKeyHolder();
        jdbc.update(con -> {
            PreparedStatement ps = con.prepareStatement("""
                INSERT INTO cliente (nombres, apellidos, correo, clave_hash, pais, idioma, moneda_preferida, datos_fiscales)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, new String[]{"id_cliente"});
            ps.setString(1, req.nombres().trim());
            ps.setString(2, req.apellidos() != null ? req.apellidos().trim() : "");
            ps.setString(3, req.correo().trim().toLowerCase());
            ps.setString(4, claveHash);
            ps.setString(5, req.pais().toUpperCase());
            ps.setString(6, req.idioma() != null ? req.idioma().toUpperCase() : "ES");
            ps.setString(7, req.monedaPreferida() != null ? req.monedaPreferida().toUpperCase() : "USD");
            ps.setString(8, req.datosFiscales().trim());
            return ps;
        }, khCliente);

        int idCliente = khCliente.getKey().intValue();
        jdbc.update("""
            INSERT INTO direccion (id_cliente, tipo, pais, ciudad, linea_direccion, codigo_postal)
            VALUES (?, 'AMBOS', ?, ?, ?, ?)
        """, idCliente, req.pais().toUpperCase(), req.ciudad().trim(), req.lineaDireccion().trim(), req.codigoPostal().trim());

        auditoria.registrar(null, req.correo().trim().toLowerCase(), "REGISTRO_CLIENTE_INTERNACIONAL",
                "CLIENTE", idCliente, "EXITOSO", "Cliente registrado en país " + req.pais() + " con credencial hasheada bcrypt");

        String nombreCompleto = (req.nombres() + " " + (req.apellidos() != null ? req.apellidos() : "")).trim();
        String token = jwtService.emitirToken(new ServicioJwtRs256.SesionToken(
                idCliente, req.correo().trim().toLowerCase(), nombreCompleto, "CLIENTE", "CLIENTE"));

        return ResponseEntity.ok(Map.of(
                "token", token,
                "usuario", Map.of(
                        "id", idCliente,
                        "identificador", req.correo().trim().toLowerCase(),
                        "nombre", nombreCompleto,
                        "tipoCuenta", "CLIENTE",
                        "rol", "CLIENTE",
                        "pais", req.pais().toUpperCase(),
                        "idioma", req.idioma() != null ? req.idioma().toUpperCase() : "ES",
                        "monedaPreferida", req.monedaPreferida() != null ? req.monedaPreferida().toUpperCase() : "USD",
                        "datosFiscales", req.datosFiscales().trim()
                )
        ));
    }

    public record ActualizarPerfilReq(
            String nombres,
            String apellidos,
            String pais,
            String idioma,
            String monedaPreferida,
            String datosFiscales
    ) {}

    @GetMapping("/api/clientes/perfil")
    public ResponseEntity<?> obtenerMiPerfil(HttpServletRequest httpReq) {
        var sesion = (ServicioJwtRs256.SesionToken) httpReq.getAttribute(FiltroSeguridadRbac.ATTR_SESION);
        if (!"CLIENTE".equals(sesion.tipoCuenta())) {
            return ResponseEntity.status(403).body(Map.of("mensaje", "Endpoint exclusivo para cuentas de clientes."));
        }
        var filas = jdbc.queryForList("""
            SELECT id_cliente, nombres, apellidos, correo, pais, idioma, moneda_preferida, datos_fiscales, fecha_registro
            FROM cliente WHERE id_cliente = ?
        """, sesion.idSujeto());
        if (filas.isEmpty()) return ResponseEntity.notFound().build();
        return ResponseEntity.ok(filas.get(0));
    }

    @PutMapping("/api/clientes/perfil")
    @Transactional
    public ResponseEntity<?> actualizarMiPerfil(@RequestBody ActualizarPerfilReq req, HttpServletRequest httpReq) {
        var sesion = (ServicioJwtRs256.SesionToken) httpReq.getAttribute(FiltroSeguridadRbac.ATTR_SESION);
        if (!"CLIENTE".equals(sesion.tipoCuenta())) {
            return ResponseEntity.status(403).body(Map.of("mensaje", "Solo clientes pueden actualizar su perfil fiscal."));
        }
        if (req.nombres() == null || req.nombres().isBlank() || req.datosFiscales() == null || req.datosFiscales().isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("mensaje", "Nombres e identificación fiscal son obligatorios."));
        }
        String pais = req.pais() != null ? req.pais().toUpperCase() : "US";
        var paises = jdbc.queryForList("SELECT habilitado, nombre FROM param_pais WHERE codigo_pais = ?", pais);
        if (paises.isEmpty() || !Boolean.TRUE.equals(paises.get(0).get("habilitado"))) {
            return ResponseEntity.badRequest().body(Map.of("mensaje", "RN12: El país seleccionado no está habilitado."));
        }

        jdbc.update("""
            UPDATE cliente
            SET nombres = ?, apellidos = ?, pais = ?, idioma = ?, moneda_preferida = ?, datos_fiscales = ?
            WHERE id_cliente = ?
        """, req.nombres().trim(), req.apellidos() != null ? req.apellidos().trim() : "",
                pais,
                req.idioma() != null ? req.idioma().toUpperCase() : "ES",
                req.monedaPreferida() != null ? req.monedaPreferida().toUpperCase() : "USD",
                req.datosFiscales().trim(),
                sesion.idSujeto());

        auditoria.registrar(null, sesion.identificador(), "ACTUALIZACION_PERFIL_CLIENTE",
                "CLIENTE", sesion.idSujeto(), "EXITOSO", "Actualización de perfil, preferencias e ID fiscal");
        return ResponseEntity.ok(Map.of("mensaje", "Perfil y datos fiscales actualizados correctamente."));
    }

    @GetMapping("/api/clientes/mis-direcciones")
    public List<Map<String, Object>> listarMisDirecciones(HttpServletRequest httpReq) {
        var sesion = (ServicioJwtRs256.SesionToken) httpReq.getAttribute(FiltroSeguridadRbac.ATTR_SESION);
        return jdbc.queryForList("""
            SELECT d.*, p.nombre AS nombre_pais, p.habilitado AS pais_habilitado
            FROM direccion d
            JOIN param_pais p ON p.codigo_pais = d.pais
            WHERE d.id_cliente = ?
            ORDER BY d.id_direccion DESC
        """, sesion.idSujeto());
    }

    public record NuevaDireccionReq(String tipo, String pais, String ciudad, String lineaDireccion, String codigoPostal) {}

    @PostMapping("/api/clientes/direcciones")
    public ResponseEntity<?> agregarDireccion(@RequestBody NuevaDireccionReq req, HttpServletRequest httpReq) {
        var sesion = (ServicioJwtRs256.SesionToken) httpReq.getAttribute(FiltroSeguridadRbac.ATTR_SESION);
        String error = validarPaisYCodigoPostal(req.pais(), req.codigoPostal());
        if (error != null) {
            return ResponseEntity.badRequest().body(Map.of("mensaje", error));
        }
        jdbc.update("""
            INSERT INTO direccion (id_cliente, tipo, pais, ciudad, linea_direccion, codigo_postal)
            VALUES (?, ?, ?, ?, ?, ?)
        """, sesion.idSujeto(),
                req.tipo() != null ? req.tipo().toUpperCase() : "ENVIO",
                req.pais().toUpperCase(), req.ciudad().trim(), req.lineaDireccion().trim(), req.codigoPostal().trim());
        return ResponseEntity.ok(Map.of("mensaje", "Dirección internacional registrada correctamente."));
    }

    @PutMapping("/api/clientes/direcciones/{idDireccion}")
    public ResponseEntity<?> actualizarDireccion(@PathVariable int idDireccion,
                                                 @RequestBody NuevaDireccionReq req,
                                                 HttpServletRequest httpReq) {
        var sesion = (ServicioJwtRs256.SesionToken) httpReq.getAttribute(FiltroSeguridadRbac.ATTR_SESION);
        String error = validarPaisYCodigoPostal(req.pais(), req.codigoPostal());
        if (error != null) {
            return ResponseEntity.badRequest().body(Map.of("mensaje", error));
        }
        int updated = jdbc.update("""
            UPDATE direccion
            SET tipo = ?, pais = ?, ciudad = ?, linea_direccion = ?, codigo_postal = ?
            WHERE id_direccion = ? AND id_cliente = ?
        """, req.tipo() != null ? req.tipo().toUpperCase() : "ENVIO",
                req.pais().toUpperCase(), req.ciudad().trim(), req.lineaDireccion().trim(), req.codigoPostal().trim(),
                idDireccion, sesion.idSujeto());
        if (updated == 0) return ResponseEntity.notFound().build();
        return ResponseEntity.ok(Map.of("mensaje", "Dirección internacional actualizada correctamente."));
    }

    @DeleteMapping("/api/clientes/direcciones/{idDireccion}")
    public ResponseEntity<?> eliminarDireccion(@PathVariable int idDireccion, HttpServletRequest httpReq) {
        var sesion = (ServicioJwtRs256.SesionToken) httpReq.getAttribute(FiltroSeguridadRbac.ATTR_SESION);
        Integer enUso = jdbc.queryForObject(
                "SELECT COUNT(*) FROM pedido WHERE id_direccion = ?", Integer.class, idDireccion);
        if (enUso != null && enUso > 0) {
            return ResponseEntity.status(409).body(Map.of(
                    "mensaje", "No se puede eliminar la dirección porque está vinculada a pedidos históricos (trazabilidad fiscal)."));
        }
        int deleted = jdbc.update("DELETE FROM direccion WHERE id_direccion = ? AND id_cliente = ?",
                idDireccion, sesion.idSujeto());
        if (deleted == 0) return ResponseEntity.notFound().build();
        return ResponseEntity.ok(Map.of("mensaje", "Dirección eliminada correctamente."));
    }

    @GetMapping("/api/clientes/mis-notificaciones")
    public List<Map<String, Object>> listarMisNotificaciones(HttpServletRequest httpReq) {
        var sesion = (ServicioJwtRs256.SesionToken) httpReq.getAttribute(FiltroSeguridadRbac.ATTR_SESION);
        if ("CLIENTE".equals(sesion.tipoCuenta())) {
            return jdbc.queryForList("""
                SELECT * FROM notificacion_cliente WHERE id_cliente = ? ORDER BY id_notificacion DESC
            """, sesion.idSujeto());
        }
        return jdbc.queryForList("SELECT * FROM notificacion_cliente ORDER BY id_notificacion DESC LIMIT 50");
    }

    private String validarPaisYCodigoPostal(String pais, String codigoPostal) {
        if (pais == null || pais.isBlank()) return "Debe seleccionar un país.";
        var paises = jdbc.queryForList("SELECT * FROM param_pais WHERE codigo_pais = ?", pais.toUpperCase());
        if (paises.isEmpty()) return "RN12: El país '" + pais + "' no existe en el catálogo internacional.";
        Map<String, Object> p = paises.get(0);
        if (!Boolean.TRUE.equals(p.get("habilitado"))) {
            return "RN06 / RN12: El país '" + p.get("nombre") + "' no está habilitado para comercio ni despacho internacional.";
        }
        String patron = (String) p.get("patron_codigo_postal");
        if (codigoPostal == null || !Pattern.matches(patron, codigoPostal.trim())) {
            return "CU02 4b: Código postal '" + codigoPostal + "' inválido para " + p.get("nombre") + ".";
        }
        return null;
    }
}
