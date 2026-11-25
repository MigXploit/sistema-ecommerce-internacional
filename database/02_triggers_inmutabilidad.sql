-- =============================================================================
-- SISTEMA DE COMERCIO ELECTRÓNICO INTERNACIONAL (INF-241 - GRUPO 12)
-- Triggers de Seguridad, Inmutabilidad y Reglas de Integridad en Base de Datos
-- Cumple: RNF08, RN10, RN16, RN17, RN18, RN19, Sección 10.5
-- =============================================================================

SET client_encoding = 'UTF8';

-- 1. Inmutabilidad absoluta de la tabla AUDITORIA (Sección 10.5 y RNF08)
CREATE OR REPLACE FUNCTION fn_proteger_auditoria_inmutable()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'VIOLACIÓN DE SEGURIDAD (RN17/RNF08): Los registros de AUDITORIA son inmutables y no pueden modificarse ni eliminarse.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auditoria_inmutable ON auditoria;
CREATE TRIGGER trg_auditoria_inmutable
BEFORE UPDATE OR DELETE ON auditoria
FOR EACH ROW EXECUTE FUNCTION fn_proteger_auditoria_inmutable();

-- 2. Prohibición de borrado físico de USUARIO (RN18: solo desactivación lógica)
CREATE OR REPLACE FUNCTION fn_impedir_borrado_fisico_usuario()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'REGLA DE NEGOCIO RN18: No se permite eliminar físicamente un usuario; utilice desactivación lógica (activo = false) para preservar el historial de auditoría.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_no_delete_usuario ON usuario;
CREATE TRIGGER trg_no_delete_usuario
BEFORE DELETE ON usuario
FOR EACH ROW EXECUTE FUNCTION fn_impedir_borrado_fisico_usuario();

-- 3. Inmutabilidad documental de FACTURA emitida (RN16: sin edición ni borrado físico; ajustes vía Nota de Crédito)
CREATE OR REPLACE FUNCTION fn_proteger_factura_inmutable()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'REGLA DE NEGOCIO RN16: Una factura o nota de crédito emitida no puede eliminarse físicamente.';
    END IF;
    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'REGLA DE NEGOCIO RN16: Una factura emitida es inmutable. Cualquier devolución o ajuste debe respaldarse emitiendo una Nota de Crédito vinculada.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_factura_inmutable ON factura;
CREATE TRIGGER trg_factura_inmutable
BEFORE UPDATE OR DELETE ON factura
FOR EACH ROW EXECUTE FUNCTION fn_proteger_factura_inmutable();

-- 4. Control estricto de tope de reembolso <= 100% del pago y evidencia obligatoria en defectos (RN10, RN19)
CREATE OR REPLACE FUNCTION fn_validar_reembolso_controlado()
RETURNS TRIGGER AS $$
DECLARE
    v_monto_pago NUMERIC(12,2);
    v_estado_pago VARCHAR(20);
    v_acumulado NUMERIC(12,2);
BEGIN
    SELECT monto, estado INTO v_monto_pago, v_estado_pago
    FROM pago
    WHERE id_pago = NEW.id_pago;

    IF v_monto_pago IS NULL THEN
        RAISE EXCEPTION 'Pago asociado no existe.';
    END IF;

    IF v_estado_pago NOT IN ('APROBADO', 'REEMBOLSADO') THEN
        RAISE EXCEPTION 'RN08/RN10: Solo se pueden reembolsar pagos previamente aprobados.';
    END IF;

    IF NEW.causal_devolucion = 'PRODUCTO_DEFECTUOSO' AND (NEW.evidencia_ref IS NULL OR LENGTH(TRIM(NEW.evidencia_ref)) = 0) THEN
        RAISE EXCEPTION 'REGLA DE NEGOCIO RN19: Todo reclamo o reembolso por PRODUCTO_DEFECTUOSO exige evidencia comprobable (evidencia_ref).';
    END IF;

    IF NEW.estado = 'APROBADO' THEN
        SELECT COALESCE(SUM(monto), 0) INTO v_acumulado
        FROM reembolso
        WHERE id_pago = NEW.id_pago
          AND estado = 'APROBADO'
          AND (TG_OP = 'INSERT' OR id_reembolso <> NEW.id_reembolso);

        IF (v_acumulado + NEW.monto) > v_monto_pago THEN
            RAISE EXCEPTION 'REGLA DE NEGOCIO RN10: La suma de reembolsos (%) supera el 100%% del monto originalmente pagado (%).',
                (v_acumulado + NEW.monto), v_monto_pago;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validar_reembolso ON reembolso;
CREATE TRIGGER trg_validar_reembolso
BEFORE INSERT OR UPDATE ON reembolso
FOR EACH ROW EXECUTE FUNCTION fn_validar_reembolso_controlado();
