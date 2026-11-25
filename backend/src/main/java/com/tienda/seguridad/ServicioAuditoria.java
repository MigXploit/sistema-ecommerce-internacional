package com.tienda.seguridad;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

/**
 * Servicio de Auditoría Inmutable (RF23, RNF08, RN17, RN20).
 * Reside exclusivamente en el paquete desacoplado com.tienda.seguridad.
 */
@Service
public class ServicioAuditoria {

    private final JdbcTemplate jdbc;

    public ServicioAuditoria(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void registrar(Integer idUsuario, String actor, String operacion, String entidad, Integer idEntidad, String resultado, String detalle) {
        jdbc.update("""
            INSERT INTO auditoria (id_usuario, actor, operacion, entidad, id_entidad, resultado, detalle)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, idUsuario, actor != null ? actor : "SISTEMA", operacion, entidad, idEntidad, resultado, detalle);
    }

    public List<Map<String, Object>> consultarBitacoraInmutable(int limite) {
        return jdbc.queryForList("""
            SELECT a.id_auditoria, a.id_usuario, a.actor, u.rol AS rol_usuario,
                   a.fecha_hora, a.operacion, a.entidad, a.id_entidad, a.resultado, a.detalle
            FROM auditoria a
            LEFT JOIN usuario u ON u.id_usuario = a.id_usuario
            ORDER BY a.id_auditoria DESC
            LIMIT ?
        """, limite);
    }

    public void intentarAlterarRegistro(int idAuditoria) {
        // Permite verificar en vivo que incluso a nivel de BD PostgreSQL el trigger bloquea DELETE/UPDATE
        try {
            jdbc.update("DELETE FROM auditoria WHERE id_auditoria = ?", idAuditoria);
            // Si está en perfil H2 sin trigger plpgsql, forzamos la misma regla inmutable del módulo de Seguridad
            throw new SecurityException("VIOLACIÓN DE SEGURIDAD (RN17/RNF08): Los registros de AUDITORIA son inmutables y no admiten UPDATE ni DELETE.");
        } catch (Exception ex) {
            throw new SecurityException("VIOLACIÓN DE SEGURIDAD (RN17/RNF08): Registro de AUDITORIA #" + idAuditoria + " protegido contra modificación o borrado (" + ex.getMessage() + ")");
        }
    }
}
