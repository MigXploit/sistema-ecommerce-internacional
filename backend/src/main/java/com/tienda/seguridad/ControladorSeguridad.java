package com.tienda.seguridad;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.sql.PreparedStatement;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * Subsistema Independiente de Seguridad (CU14, RF21, RF23, RNF01, RN17, RN18, RN20).
 * Gestiona autenticación con bcrypt (costo 12 con salt único), bloqueo tras 5 intentos fallidos,
 * emisión de JWT RS256, administración de usuarios/roles RBAC y auditoría inmutable.
 */
@RestController
public class ControladorSeguridad {

    private final JdbcTemplate jdbc;
    private final ServicioJwtRs256 jwtService;
    private final ServicioAuditoria auditoria;
    private final BCryptPasswordEncoder bcrypt = new BCryptPasswordEncoder(12);

    @Value("${app.seguridad.max-intentos-fallidos:5}")
    private int maxIntentosFallidos;

    @Value("${app.seguridad.bloqueo-minutos:15}")
    private int bloqueoMinutos;

    public ControladorSeguridad(JdbcTemplate jdbc, ServicioJwtRs256 jwtService, ServicioAuditoria auditoria) {
        this.jdbc = jdbc;
        this.jwtService = jwtService;
        this.auditoria = auditoria;
    }

    public String hashearClaveBcrypt12(String clavePlana) {
        if (clavePlana == null || clavePlana.length() < 6) {
            throw new IllegalArgumentException("La contraseña debe tener al menos 6 caracteres.");
        }
        return bcrypt.encode(clavePlana);
    }

    public record LoginRequest(String identificador, String clave, String tipoCuenta) {}

    @PostMapping("/api/auth/login")
    public ResponseEntity<?> iniciarSesion(@RequestBody LoginRequest req) {
        if (req.identificador() == null || req.clave() == null) {
            return ResponseEntity.badRequest().body(Map.of("mensaje", "Credenciales incompletas."));
        }
        boolean esCliente = "CLIENTE".equalsIgnoreCase(req.tipoCuenta());
        return esCliente ? autenticarCliente(req.identificador().trim(), req.clave())
                         : autenticarUsuarioInterno(req.identificador().trim(), req.clave());
    }

    private ResponseEntity<?> autenticarUsuarioInterno(String login, String clave) {
        List<Map<String, Object>> filas = jdbc.queryForList(
                "SELECT * FROM usuario WHERE LOWER(login) = LOWER(?)", login);
        if (filas.isEmpty()) {
            auditoria.registrar(null, login, "LOGIN_INTERNO_FALLIDO", "USUARIO", null, "RECHAZADO", "Usuario inexistente");
            return ResponseEntity.status(401).body(Map.of("mensaje", "Credenciales inválidas."));
        }

        Map<String, Object> u = filas.get(0);
        int idUsuario = ((Number) u.get("id_usuario")).intValue();
        boolean activo = Boolean.TRUE.equals(u.get("activo"));

        // RN18: Usuario desactivado no puede autenticarse pero conserva su historial
        if (!activo) {
            auditoria.registrar(idUsuario, login, "LOGIN_USUARIO_DESACTIVADO", "USUARIO", idUsuario, "BLOQUEADO_RN18",
                    "Intento de ingreso de cuenta desactivada lógicamente");
            return ResponseEntity.status(403).body(Map.of(
                    "mensaje", "Cuenta desactivada lógicamente (RN18). Contacte al Oficial de Seguridad."));
        }

        Timestamp bloqueadoHasta = (Timestamp) u.get("bloqueado_hasta");
        if (bloqueadoHasta != null && bloqueadoHasta.toInstant().isAfter(Instant.now())) {
            return ResponseEntity.status(423).body(Map.of(
                    "mensaje", "Cuenta bloqueada temporalmente tras 5 intentos fallidos (RNF01). Intente más tarde o solicite desbloqueo al Oficial de Seguridad."));
        }

        String hashAlmacenado = (String) u.get("clave_hash");
        if (!bcrypt.matches(clave, hashAlmacenado)) {
            int intentos = ((Number) u.get("intentos_fallidos")).intValue() + 1;
            Timestamp nuevoBloqueo = intentos >= maxIntentosFallidos
                    ? Timestamp.from(Instant.now().plusSeconds(bloqueoMinutos * 60L))
                    : null;
            jdbc.update("UPDATE usuario SET intentos_fallidos = ?, bloqueado_hasta = ? WHERE id_usuario = ?",
                    intentos, nuevoBloqueo, idUsuario);

            auditoria.registrar(idUsuario, login, "LOGIN_CLAVE_ERRONEA", "USUARIO", idUsuario,
                    nuevoBloqueo != null ? "CUENTA_BLOQUEADA_RNF01" : "FALLIDO_" + intentos,
                    "Intento fallido #" + intentos + " validado contra hash bcrypt");

            String msg = nuevoBloqueo != null
                    ? "Cuenta bloqueada por seguridad tras alcanzar 5 intentos fallidos consecutivos (RNF01)."
                    : "Contraseña incorrecta (intento " + intentos + " de " + maxIntentosFallidos + ").";
            return ResponseEntity.status(401).body(Map.of("mensaje", msg, "intentosFallidos", intentos));
        }

        jdbc.update("UPDATE usuario SET intentos_fallidos = 0, bloqueado_hasta = NULL, ultimo_acceso = CURRENT_TIMESTAMP WHERE id_usuario = ?",
                idUsuario);

        String rol = (String) u.get("rol");
        String nombre = (String) u.get("nombre_completo");
        var sesion = new ServicioJwtRs256.SesionToken(idUsuario, login, nombre, "INTERNO", rol);
        String token = jwtService.emitirToken(sesion);

        auditoria.registrar(idUsuario, login, "LOGIN_EXITOSO_JWT_RS256", "USUARIO", idUsuario, "EXITOSO",
                "Sesión iniciada con rol RBAC " + rol);

        return ResponseEntity.ok(Map.of(
                "token", token,
                "algoritmo", "RS256",
                "inactividadMinutos", 15,
                "usuario", Map.of(
                        "id", idUsuario,
                        "identificador", login,
                        "nombre", nombre,
                        "tipoCuenta", "INTERNO",
                        "rol", rol
                )
        ));
    }

    private ResponseEntity<?> autenticarCliente(String correo, String clave) {
        List<Map<String, Object>> filas = jdbc.queryForList(
                "SELECT * FROM cliente WHERE LOWER(correo) = LOWER(?)", correo);
        if (filas.isEmpty()) {
            return ResponseEntity.status(401).body(Map.of("mensaje", "Correo o contraseña inválidos."));
        }
        Map<String, Object> c = filas.get(0);
        int idCliente = ((Number) c.get("id_cliente")).intValue();

        Timestamp bloqueadoHasta = (Timestamp) c.get("bloqueado_hasta");
        if (bloqueadoHasta != null && bloqueadoHasta.toInstant().isAfter(Instant.now())) {
            return ResponseEntity.status(423).body(Map.of(
                    "mensaje", "Cuenta de cliente bloqueada tras 5 intentos fallidos (RNF01)."));
        }

        if (!bcrypt.matches(clave, (String) c.get("clave_hash"))) {
            int intentos = ((Number) c.get("intentos_fallidos")).intValue() + 1;
            Timestamp nuevoBloqueo = intentos >= maxIntentosFallidos
                    ? Timestamp.from(Instant.now().plusSeconds(bloqueoMinutos * 60L))
                    : null;
            jdbc.update("UPDATE cliente SET intentos_fallidos = ?, bloqueado_hasta = ? WHERE id_cliente = ?",
                    intentos, nuevoBloqueo, idCliente);
            return ResponseEntity.status(401).body(Map.of(
                    "mensaje", "Contraseña incorrecta (intento " + intentos + " de " + maxIntentosFallidos + ")."));
        }

        jdbc.update("UPDATE cliente SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id_cliente = ?", idCliente);

        String nombreCompleto = c.get("nombres") + " " + c.get("apellidos");
        var sesion = new ServicioJwtRs256.SesionToken(idCliente, correo, nombreCompleto, "CLIENTE", "CLIENTE");
        String token = jwtService.emitirToken(sesion);

        return ResponseEntity.ok(Map.of(
                "token", token,
                "algoritmo", "RS256",
                "inactividadMinutos", 15,
                "usuario", Map.of(
                        "id", idCliente,
                        "identificador", correo,
                        "nombre", nombreCompleto,
                        "tipoCuenta", "CLIENTE",
                        "rol", "CLIENTE",
                        "pais", c.get("pais"),
                        "idioma", c.get("idioma"),
                        "monedaPreferida", c.get("moneda_preferida"),
                        "datosFiscales", c.get("datos_fiscales")
                )
        ));
    }

    @PostMapping("/api/auth/logout")
    public Map<String, Object> cerrarSesion(HttpServletRequest req) {
        String auth = req.getHeader("Authorization");
        if (auth != null && auth.startsWith("Bearer ")) {
            jwtService.invalidarToken(auth.substring(7).trim());
        }
        return Map.of("mensaje", "Sesión cerrada correctamente.");
    }

    // =========================================================================
    // PANEL AUTÓNOMO DEL OFICIAL DE SEGURIDAD (/api/seguridad/** - CU14)
    // =========================================================================

    @GetMapping("/api/seguridad/usuarios")
    public List<Map<String, Object>> listarUsuariosSeguridad() {
        return jdbc.queryForList("""
            SELECT id_usuario, nombre_completo, login, rol, activo, intentos_fallidos,
                   bloqueado_hasta, ultimo_acceso,
                   SUBSTRING(clave_hash, 1, 29) || '...' AS resumen_hash_bcrypt
            FROM usuario
            ORDER BY id_usuario
        """);
    }

    public record CrearUsuarioRequest(String nombreCompleto, String login, String clave, String rol) {}

    @PostMapping("/api/seguridad/usuarios")
    public ResponseEntity<?> crearUsuario(@RequestBody CrearUsuarioRequest req, HttpServletRequest httpReq) {
        var sesion = (ServicioJwtRs256.SesionToken) httpReq.getAttribute(FiltroSeguridadRbac.ATTR_SESION);
        Integer existe = jdbc.queryForObject("SELECT COUNT(*) FROM usuario WHERE LOWER(login) = LOWER(?)",
                Integer.class, req.login().trim());
        if (existe != null && existe > 0) {
            return ResponseEntity.status(409).body(Map.of("mensaje", "CU14 2a: El login '" + req.login() + "' ya existe."));
        }

        String claveHash = hashearClaveBcrypt12(req.clave());
        KeyHolder kh = new GeneratedKeyHolder();
        jdbc.update(con -> {
            PreparedStatement ps = con.prepareStatement(
                    "INSERT INTO usuario (nombre_completo, login, clave_hash, rol, activo) VALUES (?, ?, ?, ?, TRUE)",
                    new String[]{"id_usuario"});
            ps.setString(1, req.nombreCompleto().trim());
            ps.setString(2, req.login().trim());
            ps.setString(3, claveHash);
            ps.setString(4, req.rol());
            return ps;
        }, kh);

        int nuevoId = kh.getKey().intValue();
        auditoria.registrar(sesion.idSujeto(), sesion.identificador(), "CREACION_USUARIO_BCRYPT",
                "USUARIO", nuevoId, "EXITOSO", "Cuenta '" + req.login() + "' creada con rol " + req.rol() + " y hash bcrypt costo 12");

        return ResponseEntity.ok(Map.of("idUsuario", nuevoId, "mensaje", "Usuario registrado con contraseña hasheada en bcrypt (costo 12)."));
    }

    public record ActualizarSeguridadUsuarioReq(String rol, Boolean activo, String nuevaClave, Boolean desbloquear) {}

    @PatchMapping("/api/seguridad/usuarios/{id}")
    public ResponseEntity<?> actualizarEstadoORol(@PathVariable int id,
                                                  @RequestBody ActualizarSeguridadUsuarioReq req,
                                                  HttpServletRequest httpReq) {
        var sesion = (ServicioJwtRs256.SesionToken) httpReq.getAttribute(FiltroSeguridadRbac.ATTR_SESION);

        if (req.rol() != null) {
            jdbc.update("UPDATE usuario SET rol = ? WHERE id_usuario = ?", req.rol(), id);
        }
        if (req.activo() != null) {
            jdbc.update("UPDATE usuario SET activo = ? WHERE id_usuario = ?", req.activo(), id);
        }
        if (Boolean.TRUE.equals(req.desbloquear())) {
            jdbc.update("UPDATE usuario SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id_usuario = ?", id);
        }
        if (req.nuevaClave() != null && !req.nuevaClave().isBlank()) {
            String nuevoHash = hashearClaveBcrypt12(req.nuevaClave());
            jdbc.update("UPDATE usuario SET clave_hash = ?, intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id_usuario = ?",
                    nuevoHash, id);
        }

        auditoria.registrar(sesion.idSujeto(), sesion.identificador(), "ACTUALIZACION_RBAC_CUENTA",
                "USUARIO", id, "EXITOSO",
                "Actualización en módulo de Seguridad (rol=" + req.rol() + ", activo=" + req.activo()
                        + ", rotacionHash=" + (req.nuevaClave() != null && !req.nuevaClave().isBlank()) + ")");

        return ResponseEntity.ok(Map.of("mensaje", "Cuenta actualizada correctamente bajo control independiente."));
    }

    @DeleteMapping("/api/seguridad/usuarios/{id}")
    public ResponseEntity<?> intentarEliminarFisicamente(@PathVariable int id, HttpServletRequest httpReq) {
        var sesion = (ServicioJwtRs256.SesionToken) httpReq.getAttribute(FiltroSeguridadRbac.ATTR_SESION);
        auditoria.registrar(sesion.idSujeto(), sesion.identificador(), "INTENTO_BORRADO_FISICO_USUARIO",
                "USUARIO", id, "RECHAZADO_RN18", "RN18 impide eliminar físicamente cuentas; se exige desactivación lógica");
        return ResponseEntity.status(409).body(Map.of(
                "mensaje", "CU14 2b / RN18: No se permite el borrado físico de usuarios para conservar intacto el historial de auditoría. Utilice la desactivación lógica."));
    }

    @GetMapping("/api/seguridad/auditoria")
    public List<Map<String, Object>> consultarAuditoria(@RequestParam(defaultValue = "100") int limite) {
        return auditoria.consultarBitacoraInmutable(limite);
    }

    @DeleteMapping("/api/seguridad/auditoria/{id}")
    public ResponseEntity<?> verificarInmutabilidadAuditoria(@PathVariable int id, HttpServletRequest httpReq) {
        var sesion = (ServicioJwtRs256.SesionToken) httpReq.getAttribute(FiltroSeguridadRbac.ATTR_SESION);
        try {
            auditoria.intentarAlterarRegistro(id);
            return ResponseEntity.ok().build();
        } catch (SecurityException ex) {
            auditoria.registrar(sesion.idSujeto(), sesion.identificador(), "PRUEBA_INMUTABILIDAD_AUDITORIA",
                    "AUDITORIA", id, "BLOQUEADO_INMUTABLE", ex.getMessage());
            return ResponseEntity.status(403).body(Map.of("mensaje", ex.getMessage()));
        }
    }
}
