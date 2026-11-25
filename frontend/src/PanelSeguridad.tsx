import React, { useEffect, useState } from 'react';
import { apiFetch, UsuarioSesion } from './api';

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
  const [cuentas, setCuentas] = useState<any[]>([]);
  const [bitacora, setBitacora] = useState<any[]>([]);
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
        apiFetch<any[]>('/api/seguridad/auditoria?limite=60', {}, token)
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
      notificar('ok', resp.mensaje);
      setNuevoUsr({ nombreCompleto: '', login: '', clave: '', rol: 'LOGISTICA' });
      cargarSeguridad();
    } catch (err: any) {
      notificar('err', err.message);
    }
  };

  const cambiarEstado = async (id: number, activo: boolean) => {
    try {
      const resp = await apiFetch(`/api/seguridad/usuarios/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ activo, desbloquear: true })
      }, token);
      notificar('ok', resp.mensaje);
      cargarSeguridad();
    } catch (err: any) {
      notificar('err', err.message);
    }
  };

  const probarBorradoFisicoRn18 = async (id: number) => {
    try {
      await apiFetch(`/api/seguridad/usuarios/${id}`, { method: 'DELETE' }, token);
    } catch (err: any) {
      notificar('err', err.message);
      cargarSeguridad();
    }
  };

  const probarInmutabilidadAuditoria = async (idAuditoria: number) => {
    try {
      await apiFetch(`/api/seguridad/auditoria/${idAuditoria}`, { method: 'DELETE' }, token);
    } catch (err: any) {
      notificar('err', err.message);
      cargarSeguridad();
    }
  };

  return (
    <div>
      <div className="card card-security">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <h3 style={{ margin: 0 }}>Subsistema Autónomo de Seguridad, RBAC, Hasheo Bcrypt y Auditoría Inmutable (CU14)</h3>
            <small style={{ color: '#92400e', fontWeight: 600 }}>
              Desacoplado de la Administración del Sistema (RN20) • Oficial en sesión: {usuario.nombre} • Firma JWT RS256 • Bcrypt Cost Factor 12
            </small>
          </div>
          <button className="btn btn-outline" onClick={cargarSeguridad}>Actualizar Bitácora</button>
        </div>
      </div>

      <div className="card">
        <h4 style={{ marginTop: 0 }}>Alta de Cuenta Interna con Hasheo Criptográfico Irreversible Bcrypt Costo 12 (RF21)</h4>
        <form onSubmit={crearUsuario} className="form-grid" style={{ alignItems: 'end' }}>
          <div>
            <label>Nombre Completo</label>
            <input required value={nuevoUsr.nombreCompleto} onChange={(e) => setNuevoUsr({ ...nuevoUsr, nombreCompleto: e.target.value })} placeholder="Ej. Camila Torrez" />
          </div>
          <div>
            <label>Login Único</label>
            <input required value={nuevoUsr.login} onChange={(e) => setNuevoUsr({ ...nuevoUsr, login: e.target.value })} placeholder="Ej. camila.logistica" />
          </div>
          <div>
            <label>Contraseña (se persistirá como $2a$12$...)</label>
            <input type="password" required minLength={6} value={nuevoUsr.clave} onChange={(e) => setNuevoUsr({ ...nuevoUsr, clave: e.target.value })} placeholder="Mínimo 6 caracteres" />
          </div>
          <div>
            <label>Rol RBAC (Mínimo Privilegio)</label>
            <select value={nuevoUsr.rol} onChange={(e) => setNuevoUsr({ ...nuevoUsr, rol: e.target.value })}>
              {ROLES_RBAC.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <button type="submit" className="btn btn-amber" style={{ width: '100%' }}>Crear Usuario con Salt + Bcrypt</button>
          </div>
        </form>
      </div>

      <div className="card">
        <h4 style={{ marginTop: 0 }}>Directorio de Usuarios Internos y Estado de Credenciales (Tabla USUARIO)</h4>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Funcionario / Login</th>
              <th>Rol RBAC</th>
              <th>Prefijo Hash Bcrypt (Salt Único)</th>
              <th>Intentos</th>
              <th>Estado</th>
              <th>Controles de Seguridad</th>
            </tr>
          </thead>
          <tbody>
            {cuentas.map((u) => (
              <tr key={u.id_usuario}>
                <td>#{u.id_usuario}</td>
                <td><strong>{u.nombre_completo}</strong><br /><code>{u.login}</code></td>
                <td><span className="badge badge-blue">{u.rol}</span></td>
                <td><code style={{ fontSize: '0.75rem' }}>{u.resumen_hash_bcrypt}</code></td>
                <td>{u.intentos_fallidos} / 5</td>
                <td>
                  {u.activo
                    ? <span className="badge badge-green">ACTIVO</span>
                    : <span className="badge badge-red">DESACTIVADO (RN18)</span>}
                </td>
                <td style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                  <button
                    className="btn btn-outline"
                    onClick={() => cambiarEstado(u.id_usuario, !u.activo)}
                  >
                    {u.activo ? 'Desactivar (RN18)' : 'Reactivar / Desbloquear'}
                  </button>
                  <button
                    className="btn btn-danger"
                    onClick={() => probarBorradoFisicoRn18(u.id_usuario)}
                  >
                    Probar Borrado Físico
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
          <h4 style={{ margin: 0 }}>Bitácora de Auditoría Inmutable (Tabla AUDITORIA — RF23 / RNF08 / RN17)</h4>
          {bitacora.length > 0 && (
            <button className="btn btn-danger" onClick={() => probarInmutabilidadAuditoria(bitacora[0].id_auditoria)}>
              Verificar Bloqueo DELETE sobre AUDITORIA #{bitacora[0].id_auditoria}
            </button>
          )}
        </div>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Fecha / Hora</th>
              <th>Actor</th>
              <th>Operación</th>
              <th>Entidad</th>
              <th>Resultado</th>
              <th>Detalle Trazable</th>
            </tr>
          </thead>
          <tbody>
            {bitacora.map((a) => (
              <tr key={a.id_auditoria}>
                <td>#{a.id_auditoria}</td>
                <td><small>{String(a.fecha_hora).replace('T', ' ').substring(0, 19)}</small></td>
                <td><code>{a.actor}</code></td>
                <td><strong>{a.operacion}</strong></td>
                <td>{a.entidad} {a.id_entidad ? `#${a.id_entidad}` : ''}</td>
                <td>
                  <span className={`badge ${String(a.resultado).includes('BLOQUEADO') || String(a.resultado).includes('RECHAZADO') ? 'badge-red' : 'badge-green'}`}>
                    {a.resultado}
                  </span>
                </td>
                <td><small>{a.detalle}</small></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
