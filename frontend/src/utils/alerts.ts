import Swal from 'sweetalert2';
import 'sweetalert2/dist/sweetalert2.min.css';
import { IdiomaCode, TEXTOS } from '../i18n';

/**
 * Sistema Dual de Retroalimentación y Alertas (DESIGN.md §5).
 * 1. Toasts rápidos (3.5s, top-end, debajo del HeaderGlobal)
 * 2. Modales SweetAlert2 con íconos animados (sin sonidos) y tokens tipográficos Inter + JetBrains Mono
 */

const ToastMixin = Swal.mixin({
  toast: true,
  position: 'top-end',
  showConfirmButton: false,
  timer: 3500,
  timerProgressBar: true,
  customClass: {
    popup: 'agy-swal-toast',
    title: 'agy-swal-toast-title',
    htmlContainer: 'agy-swal-toast-html'
  },
  didOpen: (toast) => {
    toast.onmouseenter = Swal.stopTimer;
    toast.onmouseleave = Swal.resumeTimer;
  }
});

const ModalBase = Swal.mixin({
  buttonsStyling: false,
  customClass: {
    popup: 'agy-swal-popup',
    title: 'agy-swal-title',
    htmlContainer: 'agy-swal-html',
    confirmButton: 'btn btn-primary agy-swal-btn',
    cancelButton: 'btn btn-outline agy-swal-btn',
    denyButton: 'btn btn-danger agy-swal-btn'
  }
});

// ============================================================================
// 1. TOASTS RÁPIDOS (3.5s, esquina superior derecha)
// ============================================================================

export function toastExito(titulo: string, detalleCodigo?: string) {
  ToastMixin.fire({
    icon: 'success',
    title: titulo,
    html: detalleCodigo ? `<span class="agy-swal-code">${detalleCodigo}</span>` : undefined
  });
}

export function toastInfo(titulo: string, detalleCodigo?: string) {
  ToastMixin.fire({
    icon: 'info',
    title: titulo,
    html: detalleCodigo ? `<span class="agy-swal-code">${detalleCodigo}</span>` : undefined
  });
}

export function toastAdvertencia(titulo: string, detalleCodigo?: string) {
  ToastMixin.fire({
    icon: 'warning',
    title: titulo,
    html: detalleCodigo ? `<span class="agy-swal-code">${detalleCodigo}</span>` : undefined
  });
}

// ============================================================================
// 2. MODALES SWEETALERT2 CON CONFIRMACIÓN Y ANIMACIÓN DE ÉXITO / ERROR
// ============================================================================

/**
 * Confirmación de Pago Congelado (CU05 / RN02 / RN07) con botón comercial #059669.
 */
export async function modalConfirmarPagoCongelado(params: {
  idioma: IdiomaCode;
  idPedido: number;
  total: number | string;
  moneda: string;
  equivalenteUsd?: number | string;
  medioPago: string;
}): Promise<boolean> {
  const t = TEXTOS[params.idioma];
  const res = await ModalBase.fire({
    icon: 'question',
    title: t.swalConfirmarPagoTitulo,
    html: `
      <p style="margin:0 0 12px;color:#475569;font-size:14px;">${t.swalConfirmarPagoSub}</p>
      <div class="agy-swal-summary-box">
        <div>Pedido: <span class="agy-swal-code">#${params.idPedido}</span> • Medio: <span class="agy-swal-code">${params.medioPago}</span></div>
        <div style="font-size:20px;font-weight:800;color:#0F4C81;margin-top:6px;" class="mono">
          ${Number(params.total).toFixed(2)} ${params.moneda}
        </div>
        ${
          params.equivalenteUsd
            ? `<div class="mono" style="font-size:12px;color:#475569;margin-top:2px;">${t.equivalenteUsd}: $${Number(params.equivalenteUsd).toFixed(2)} USD</div>`
            : ''
        }
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: `🔒 ${t.swalBtnAutorizarPago}`,
    cancelButtonText: t.cancelar,
    customClass: {
      popup: 'agy-swal-popup',
      title: 'agy-swal-title',
      htmlContainer: 'agy-swal-html',
      confirmButton: 'btn btn-accent agy-swal-btn',
      cancelButton: 'btn btn-outline agy-swal-btn'
    }
  });
  return res.isConfirmed;
}

/**
 * Modal de éxito tras confirmar cobro internacional y emitir factura comercial (CU05 / CU09).
 */
export async function modalPagoAprobadoExito(params: {
  idioma: IdiomaCode;
  referenciaPasarela: string;
  numeroFactura: string;
  monto: number | string;
  moneda: string;
  equivalenteUsd: number | string;
}) {
  const t = TEXTOS[params.idioma];
  await ModalBase.fire({
    icon: 'success',
    title: t.swalPagoExitoTitulo,
    html: `
      <div class="agy-swal-summary-box">
        <div style="margin-bottom:6px;">Transacción Pasarela: <span class="agy-swal-code">${params.referenciaPasarela}</span></div>
        <div style="margin-bottom:6px;">Factura Comercial Inmutable: <span class="agy-swal-code">${params.numeroFactura}</span></div>
        <div class="mono" style="font-size:16px;font-weight:700;color:#059669;">
          Cobrado: ${Number(params.monto).toFixed(2)} ${params.moneda} (Base: $${Number(params.equivalenteUsd).toFixed(2)} USD)
        </div>
      </div>
    `,
    confirmButtonText: 'OK'
  });
}

/**
 * Confirmación de envío de reclamo por Producto Defectuoso (CU11 / RN19).
 */
export async function modalConfirmarEnvioReclamo(params: {
  idioma: IdiomaCode;
  idPedido: number;
  causal: string;
  unidades: number;
  evidenciaRef: string;
}): Promise<boolean> {
  const t = TEXTOS[params.idioma];
  const res = await ModalBase.fire({
    icon: 'warning',
    title: t.swalReclamoConfirmTitulo,
    html: `
      <div class="agy-swal-summary-box" style="text-align:left;">
        <div>Pedido: <span class="agy-swal-code">#${params.idPedido}</span></div>
        <div>Causal: <span class="agy-swal-code">${params.causal}</span> (${params.unidades} uds)</div>
        <div>Evidencia adjunta: <span class="agy-swal-code">${params.evidenciaRef || 'N/A'}</span></div>
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: t.enviarReclamo,
    cancelButtonText: t.cancelar,
    customClass: {
      popup: 'agy-swal-popup',
      title: 'agy-swal-title',
      htmlContainer: 'agy-swal-html',
      confirmButton: 'btn btn-amber agy-swal-btn',
      cancelButton: 'btn btn-outline agy-swal-btn'
    }
  });
  return res.isConfirmed;
}

export async function modalExitoReclamo(idioma: IdiomaCode, idReembolso: number, mensaje: string) {
  const t = TEXTOS[idioma];
  await ModalBase.fire({
    icon: 'success',
    title: t.swalReclamoExitoTitulo,
    html: `<p style="margin:0 0 8px;">${mensaje}</p><span class="agy-swal-code">Solicitud #${idReembolso}</span>`,
    confirmButtonText: 'OK'
  });
}

/**
 * Confirmación explícita de Aprobación de Reembolso, Cuarentena y Nota de Crédito (CU06 / RN10 / RN19).
 */
export async function modalConfirmarAprobacionReembolso(params: {
  idReembolso: number;
  idPedido: number;
  sku: string;
  unidades: number;
  monto: number | string;
  moneda: string;
  topeOriginal: number | string;
  aprobar: boolean;
}): Promise<boolean> {
  if (!params.aprobar) {
    const resRechazo = await ModalBase.fire({
      icon: 'warning',
      title: `¿Rechazar solicitud de devolución #${params.idReembolso}?`,
      html: `<p style="font-size:14px;color:#475569;">Se notificará el dictamen al cliente en su idioma sin afectar el stock ni emitir Nota de Crédito.</p>`,
      showCancelButton: true,
      confirmButtonText: 'Confirmar Rechazo',
      cancelButtonText: 'Cancelar',
      customClass: {
        popup: 'agy-swal-popup',
        title: 'agy-swal-title',
        htmlContainer: 'agy-swal-html',
        confirmButton: 'btn btn-danger agy-swal-btn',
        cancelButton: 'btn btn-outline agy-swal-btn'
      }
    });
    return resRechazo.isConfirmed;
  }

  const res = await ModalBase.fire({
    icon: 'warning',
    title: 'Confirmar Aprobación de Reembolso y Cuarentena (CU06 / RN10 / RN19)',
    html: `
      <div class="agy-swal-summary-box" style="text-align:left;">
        <div>Solicitud: <span class="agy-swal-code">#${params.idReembolso}</span> (Pedido <span class="agy-swal-code">#${params.idPedido}</span>)</div>
        <div>Aislamiento Stock Defectuoso (RN19): <span class="agy-swal-code">${params.unidades} uds de ${params.sku || 'SKU'} → Cuarentena</span></div>
        <div>Monto a Reembolsar (RN10): <span class="agy-swal-code">${Number(params.monto).toFixed(2)} ${params.moneda}</span> (Tope 100%: <span class="agy-swal-code">${params.topeOriginal} ${params.moneda}</span>)</div>
        <div style="margin-top:6px;color:#059669;font-weight:600;">✓ Se emitirá automáticamente la Nota de Crédito vinculada (RN16).</div>
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: 'Aprobar, Aislar Stock y Emitir Nota de Crédito',
    cancelButtonText: 'Cancelar',
    customClass: {
      popup: 'agy-swal-popup',
      title: 'agy-swal-title',
      htmlContainer: 'agy-swal-html',
      confirmButton: 'btn btn-accent agy-swal-btn',
      cancelButton: 'btn btn-outline agy-swal-btn'
    }
  });
  return res.isConfirmed;
}

export async function modalReembolsoEjecutadoExito(params: {
  numeroNotaCredito: string;
  unidadesAisladas: number;
  mensaje: string;
}) {
  await ModalBase.fire({
    icon: 'success',
    title: 'Reembolso Ejecutado y Nota de Crédito Emitida (RN16 / RN19)',
    html: `
      <p style="font-size:14px;color:#475569;margin-bottom:10px;">${params.mensaje}</p>
      <div class="agy-swal-summary-box">
        <div>Nota de Crédito Vinculada: <span class="agy-swal-code">${params.numeroNotaCredito}</span></div>
        <div style="margin-top:4px;">Unidades Aisladas en Cuarentena: <span class="agy-swal-code">${params.unidadesAisladas} uds</span></div>
      </div>
    `,
    confirmButtonText: 'Entendido'
  });
}

/**
 * Confirmación de Desactivación / Reactivación Lógica de Usuario (RN18).
 */
export async function modalConfirmarEstadoUsuarioRn18(params: {
  login: string;
  nombre: string;
  activar: boolean;
}): Promise<boolean> {
  const res = await ModalBase.fire({
    icon: 'warning',
    title: params.activar
      ? '¿Reactivar y desbloquear cuenta interna?'
      : '¿Aplicar desactivación lógica de cuenta (RN18)?',
    html: `
      <div class="agy-swal-summary-box">
        <div>Funcionario: <b>${params.nombre}</b> (<span class="agy-swal-code">@${params.login}</span>)</div>
        <div style="font-size:12px;color:#475569;margin-top:6px;">
          ${
            params.activar
              ? 'La cuenta recuperará acceso RBAC y se reiniciará el contador de intentos fallidos.'
              : 'RN18: El usuario no podrá autenticarse ni operar, pero todo su historial de AUDITORIA se conservará íntegro.'
          }
        </div>
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: params.activar ? 'Sí, Reactivar Cuenta' : 'Sí, Desactivar Lógicamente',
    cancelButtonText: 'Cancelar',
    customClass: {
      popup: 'agy-swal-popup agy-swal-security',
      title: 'agy-swal-title',
      htmlContainer: 'agy-swal-html',
      confirmButton: params.activar ? 'btn btn-accent agy-swal-btn' : 'btn btn-amber agy-swal-btn',
      cancelButton: 'btn btn-outline agy-swal-btn'
    }
  });
  return res.isConfirmed;
}

/**
 * Modal de Bloqueo de Seguridad e Inmutabilidad con acento #0F172A / #D97706 (RN16, RN17, RN18, RN20).
 */
export async function modalBloqueoSeguridadInmutabilidad(params: {
  regla: string;
  titulo: string;
  mensaje: string;
}) {
  await ModalBase.fire({
    icon: 'error',
    title: params.titulo,
    html: `
      <div class="agy-swal-security-box">
        <div style="margin-bottom:6px;">
          <span class="agy-swal-code" style="background:#FEF3C7;color:#92400E;border-color:#D97706;">
            🔒 ${params.regla} • PROTECCIÓN ACTIVA
          </span>
        </div>
        <div style="font-size:13px;color:#0F172A;line-height:1.5;">${params.mensaje}</div>
      </div>
    `,
    confirmButtonText: 'Cerrar y Ver Registro de Auditoría',
    customClass: {
      popup: 'agy-swal-popup agy-swal-security',
      title: 'agy-swal-title',
      htmlContainer: 'agy-swal-html',
      confirmButton: 'btn btn-amber agy-swal-btn'
    }
  });
}

/**
 * Modal de Rechazo de Pago, Restricción Aduanera o Validación (RN06, RN11, RN12, RN14, CU05 4a).
 */
export async function modalErrorValidacionOAduana(params: {
  idioma?: IdiomaCode;
  titulo?: string;
  mensaje: string;
  codigoRef?: string;
}) {
  const t = TEXTOS[params.idioma || 'ES'];
  await ModalBase.fire({
    icon: 'error',
    title: params.titulo || t.swalErrorRestriccionTitulo,
    html: `
      <p style="font-size:14px;color:#0F172A;margin:0 0 8px;">${params.mensaje}</p>
      ${params.codigoRef ? `<span class="agy-swal-code">${params.codigoRef}</span>` : ''}
    `,
    confirmButtonText: 'Entendido',
    customClass: {
      popup: 'agy-swal-popup',
      title: 'agy-swal-title',
      htmlContainer: 'agy-swal-html',
      confirmButton: 'btn btn-primary agy-swal-btn'
    }
  });
}
