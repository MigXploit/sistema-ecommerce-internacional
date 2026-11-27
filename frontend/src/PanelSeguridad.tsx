import React, { useEffect, useState } from 'react';
import { apiFetch, UsuarioSesion } from './api';
import { OperationalTable } from './components/OperationalTable';
import { ImmutableTag, StatusBadge } from './components/StatusBadge';
import {
  modalBloqueoSeguridadInmutabilidad,
  modalConfirmarEstadoUsuarioRn18,
  modalErrorValidacionOAduana,
  toastExito
} from './utils/alerts';

interface Props {
  token: string;
  usuario: UsuarioSesion;
  notificar: (tipo: 'ok' | 'err', msg: string) => void;
}

const ROLES_RBAC = [
  'OFICIAL_SEGURIDAD',
  'ADMINISTRADOR',
  'GESTOR_CATALOGO',
  'GESTOR_PEDIDOS',
  'LOGISTICA',
  'FACTURACION',
  'GERENTE'
];

export const PanelSeguridad: React.FC<Props> = ({ token, usuario, notificar }) => {
  const [seccion, setSeccion] = useState<'AUDITORIA' | 'DIRECTORIO' | 'ALTA_BCRYPT'>('AUDITORIA');
  const [cuentas, setCuentas] = useState<any[]>([]);
  const [bitacora, setBitacora] = useState<any[]>([]);
  const [filtroEntidad, setFiltroEntidad] = useState('TODAS');
  const [nuevoUsr, setNuevoUsr] = useState({
    nombreCompleto: '',
    login: '',
    clave: '',
    rol: 'LOGISTICA'
  });

  const cargarSeguridad = async () => {
    try {
      const [u, a] = await Promise.all([
        apiFetch<any[]>('/api/seguridad/usuarios', {}, token),
        apiFetch<any[]>('/api/seguridad/auditoria?limite=80', {}, token)
      ]);
      setCuentas(u);
      setBitacora(a);
    } catch (e: any) {
      notificar('err', e.message);
    }
  };

  useEffect(() => {
    cargarSeguridad();
  }, [token]);

  const crearUsuario = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const resp = await apiFetch('/api/seguridad/usuarios', {
        method: 'POST',
        body: JSON.stringify(nuevoUsr)
      }, token);
      toastExito(resp.mensaje, `@${nuevoUsr.login} [${nuevoUsr.rol}]`);
      setNuevoUsr({ nombreCompleto: '', login: '', clave: '', rol: 'LOGISTICA' });
      cargarSeguridad();
      setSeccion('DIRECTORIO');
    } catch (err: any) {
      await modalErrorValidacionOAduana({
        titulo: 'Conflicto en Registro de Cuenta (CU14 2a)',
        mensaje: err.message,
        codigoRef: nuevoUsr.login
      });
    }
  };

  const cambiarEstado = async (u: any, activar: boolean) => {
    // Modal de confirmación explícita de desactivación lógica RN18
    const ok = await modalConfirmarEstadoUsuarioRn18({
      login: u.login,
      nombre: u.nombre_completo,
      activar
    });
    if (!ok) return;

    try {
      const resp = await apiFetch(`/api/seguridad/usuarios/${u.id_usuario}`, {
        method: 'PATCH',
        body: JSON.stringify({ activo: activar, desbloquear: true })
      }, token);
      toastExito(resp.mensaje, `@${u.login} → ${activar ? 'ACTIVO' : 'DESACTIVADO (RN18)'}`);
      cargarSeguridad();
    } catch (err: any) {
      notificar('err', err.message);
    }
  };

  const simularIntentoBorradoUsuarioRn18 = async () => {
    const idTarget = cuentas[cuentas.length - 1]?.id_usuario || 1;
    try {
      await apiFetch(`/api/seguridad/usuarios/${idTarget}`, { method: 'DELETE' }, token);
    } catch (err: any) {
      await modalBloqueoSeguridadInmutabilidad({
        regla: 'RN18 • PROHIBICIÓN DE BORRADO FÍSICO',
        titulo: 'Eliminación Física de Usuario Bloqueada',
        mensaje: err.message
      });
      cargarSeguridad();
    }
  };

  const simularIntentoAlteracionAuditoriaRn17 = async () => {
    const idTarget = bitacora[0]?.id_auditoria || 1;
    try {
      await apiFetch(`/api/seguridad/auditoria/${idTarget}`, { method: 'DELETE' }, token);
    } catch (err: any) {
      await modalBloqueoSeguridadInmutabilidad({
        regla: 'RN17 / RNF08 • AUDITORÍA INMUTABLE',
        titulo: 'Intento de Borrado sobre AUDITORIA Bloqueado',
        mensaje: err.message
      });
      cargarSeguridad();
    }
  };

  const entidadesUnicas = ['TODAS', ...Array.from(new Set(bitacora.map((b) => b.entidad)))];
  const bitacoraFiltrada = bitacora.filter(
    (b) => filtroEntidad === 'TODAS' || b.entidad === filtroEntidad
  );

  return (
    <div>
      {/* Encabezado Pizarra Oscuro #0F172A con Acento Ámbar #D97706 (DESIGN.md §2) */}
      <div className="card-security-banner">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '20px' }}>🛡️</span>
              <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800 }}>
                Consola Autónoma del Oficial de Seguridad (CU14 / RN20)
              </h2>
            </div>
            <div className="mono" style={{ fontSize: '12px', color: '#FBBF24', marginTop: '4px' }}>
              Subsistema Independiente de la Administración Operativa • Hasheo bcrypt (Factor Costo 12 + Salt Único) • Firma JWT RS256 • Auditoría Inmutable
            </div>
          </div>
          <button className="btn btn-sm btn-amber" onClick={cargarSeguridad}>
            ↻ Refrescar Bitácora
          </button>
        </div>
      </div>

      <div className="admin-shell">
        {/* Barra lateral izquierda fija en tema Pizarra Oscuro (colapsa en < 768px - RNF13) */}
        <aside className="admin-sidebar security-sidebar">
          <div className="sidebar-role-badge">
            <div style={{ fontSize: '11px', color: '#FBBF24', fontWeight: 700, textTransform: 'uppercase' }}>
              Rol de Seguridad Autónoma
            </div>
            <div style={{ marginTop: '6px' }}>
              <StatusBadge estado="PENDIENTE" texto={usuario.rol} />
            </div>
            <div style={{ fontSize: '13px', marginTop: '6px', fontWeight: 600 }}>{usuario.nombre}</div>
            <div className="mono" style={{ fontSize: '11px', color: '#94A3B8' }}>@{usuario.identificador}</div>
          </div>

          <button
            className={`sidebar-nav-btn ${seccion === 'AUDITORIA' ? 'active' : ''}`}
            onClick={() => setSeccion('AUDITORIA')}
          >
            <span>📜 Auditoría Inmutable</span>
            <span>›</span>
          </button>
          <button
            className={`sidebar-nav-btn ${seccion === 'DIRECTORIO' ? 'active' : ''}`}
            onClick={() => setSeccion('DIRECTORIO')}
          >
            <span>👥 Directorio RBAC y Hashes</span>
            <span>›</span>
          </button>
          <button
            className={`sidebar-nav-btn ${seccion === 'ALTA_BCRYPT' ? 'active' : ''}`}
            onClick={() => setSeccion('ALTA_BCRYPT')}
          >
            <span>🔐 Alta Cuenta Bcrypt-12</span>
            <span>›</span>
          </button>
        </aside>

        <div>
          {/* 1. BITÁCORA DE AUDITORÍA INMUTABLE (Sin botones de borrado en filas + prueba discreta en cabecera) */}
          {seccion === 'AUDITORIA' && (
            <OperationalTable
              titulo="Bitácora de Auditoría Inmutable (Tabla AUDITORIA — RF23 / RNF08 / RN17)"
              subtitulo="Registros protegidos a nivel de aplicación y mediante trigger de base de datos PostgreSQL contra UPDATE o DELETE."
              accionesCabecera={
                <button className="btn btn-audit-probe" onClick={simularIntentoAlteracionAuditoriaRn17}>
                  🧪 Simular intento de alteración (Prueba de auditoría RN17)
                </button>
              }
              filtrosSlot={
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <label style={{ margin: 0 }}>Filtrar por Entidad:</label>
                  <select
                    style={{ width: 'auto' }}
                    value={filtroEntidad}
                    onChange={(e) => setFiltroEntidad(e.target.value)}
                  >
                    {entidadesUnicas.map((ent) => (
                      <option key={ent} value={ent}>{ent}</option>
                    ))}
                  </select>
                </div>
              }
              columnas={[
                { key: 'id_auditoria', titulo: 'ID', mono: true, render: (a) => `#${a.id_auditoria}` },
                {
                  key: 'fecha_hora',
                  titulo: 'Fecha / Hora Exacta',
                  mono: true,
                  render: (a) => String(a.fecha_hora).replace('T', ' ').substring(0, 19)
                },
                { key: 'actor', titulo: 'Actor', mono: true },
                { key: 'operacion', titulo: 'Operación Crítica', render: (a) => <strong>{a.operacion}</strong> },
                {
                  key: 'entidad',
                  titulo: 'Entidad',
                  mono: true,
                  render: (a) => `${a.entidad}${a.id_entidad ? ` #${a.id_entidad}` : ''}`
                },
                { key: 'resultado', titulo: 'Resultado', render: (a) => <StatusBadge estado={a.resultado} /> },
                { key: 'detalle', titulo: 'Detalle Trazable' },
                { key: 'inmutable', titulo: 'Integridad (RNF08)', render: () => <ImmutableTag /> }
              ]}
              datos={bitacoraFiltrada}
              filasPorPagina={10}
            />
          )}

          {/* 2. DIRECTORIO DE USUARIOS RBAC Y HASHES BCRYPT */}
          {seccion === 'DIRECTORIO' && (
            <OperationalTable
              titulo="Directorio de Usuarios Internos, Roles RBAC y Hashes Bcrypt (Tabla USUARIO — RF21 / RN18)"
              subtitulo="RN18: Las cuentas con historial no admiten borrado físico; únicamente desactivación lógica preservando su trazabilidad."
              accionesCabecera={
                <button className="btn btn-audit-probe" onClick={simularIntentoBorradoUsuarioRn18}>
                  🧪 Simular intento de alteración / borrado físico (Prueba RN18)
                </button>
              }
              columnas={[
                { key: 'id_usuario', titulo: 'ID', mono: true, render: (u) => `#${u.id_usuario}` },
                {
                  key: 'nombre_completo',
                  titulo: 'Funcionario / Login',
                  render: (u) => (
                    <div>
                      <strong>{u.nombre_completo}</strong>
                      <div className="mono" style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>@{u.login}</div>
                    </div>
                  )
                },
                { key: 'rol', titulo: 'Rol RBAC', render: (u) => <StatusBadge estado={u.rol === 'OFICIAL_SEGURIDAD' ? 'PENDIENTE' : 'APROBADO'} texto={u.rol} /> },
                { key: 'resumen_hash_bcrypt', titulo: 'Prefijo Hash Bcrypt (Costo 12)', mono: true },
                { key: 'intentos_fallidos', titulo: 'Intentos (Máx 5)', mono: true, render: (u) => `${u.intentos_fallidos} / 5` },
                {
                  key: 'activo',
                  titulo: 'Estado Cuenta',
                  render: (u) => (
                    <StatusBadge
                      estado={u.activo ? 'ACTIVO' : 'DESACTIVADO'}
                      texto={u.activo ? 'ACTIVO' : 'DESACTIVADO (RN18)'}
                    />
                  )
                },
                {
                  key: 'control',
                  titulo: 'Control de Acceso (RN18)',
                  render: (u) => (
                    <button
                      className={`btn btn-sm ${u.activo ? 'btn-outline' : 'btn-accent'}`}
                      onClick={() => cambiarEstado(u, !u.activo)}
                    >
                      {u.activo ? 'Desactivar Cuenta (RN18)' : 'Reactivar / Desbloquear'}
                    </button>
                  )
                }
              ]}
              datos={cuentas}
            />
          )}

          {/* 3. ALTA DE CUENTA CON HASHEO BCRYPT COSTO 12 */}
          {seccion === 'ALTA_BCRYPT' && (
            <div className="card">
              <h3 className="section-subtitle">Alta de Cuenta Interna con Hasheo Criptográfico Irreversible Bcrypt Costo 12 (RF21)</h3>
              <form onSubmit={crearUsuario} style={{ display: 'grid', gap: '16px' }}>
                <div className="form-grid">
                  <div>
                    <label>Nombre Completo del Funcionario</label>
                    <input
                      required
                      value={nuevoUsr.nombreCompleto}
                      onChange={(e) => setNuevoUsr({ ...nuevoUsr, nombreCompleto: e.target.value })}
                      placeholder="Ej. Camila Torrez"
                    />
                  </div>
                  <div>
                    <label>Login Único</label>
                    <input
                      required
                      className="mono"
                      value={nuevoUsr.login}
                      onChange={(e) => setNuevoUsr({ ...nuevoUsr, login: e.target.value })}
                      placeholder="Ej. camila.logistica"
                    />
                  </div>
                  <div>
                    <label>Contraseña (se hashea con salt aleatorio $2a$12$...)</label>
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={nuevoUsr.clave}
                      onChange={(e) => setNuevoUsr({ ...nuevoUsr, clave: e.target.value })}
                      placeholder="Mínimo 6 caracteres"
                    />
                  </div>
                  <div>
                    <label>Rol RBAC (Principio de Mínimo Privilegio)</label>
                    <select value={nuevoUsr.rol} onChange={(e) => setNuevoUsr({ ...nuevoUsr, rol: e.target.value })}>
                      {ROLES_RBAC.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <button type="submit" className="btn btn-amber">
                    🔐 Generar Hash Bcrypt (Costo 12) y Registrar Usuario
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
