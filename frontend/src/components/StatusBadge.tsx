import React from 'react';

interface StatusBadgeProps {
  estado: string;
  texto?: string;
}

const ESTADOS_VERDES = new Set([
  'APROBADO',
  'ENTREGADO',
  'EMITIDA',
  'ACTIVO',
  'HABILITADO',
  'EXITOSO',
  'FACTURA'
]);

const ESTADOS_AMBAR = new Set([
  'PENDIENTE',
  'CREADO',
  'PAGADO',
  'PREPARADO',
  'ENVIADO',
  'EN_TRANSITO',
  'EN_ADUANA',
  'REEMBOLSADO',
  'NOTA_CREDITO',
  'PENDIENTE_INSPECCION'
]);

const ESTADOS_ROJOS = new Set([
  'RECHAZADO',
  'CANCELADO',
  'DEVUELTO',
  'PRODUCTO_DEFECTUOSO',
  'DANO_TRANSPORTE',
  'ERROR_ENVIO',
  'RECHAZO_ADUANA',
  'ANULADA',
  'INACTIVO',
  'DESACTIVADO'
]);

export const StatusBadge: React.FC<StatusBadgeProps> = ({ estado, texto }) => {
  const norm = (estado || '').toUpperCase();
  let clase = 'status-neutral';

  if (ESTADOS_VERDES.has(norm)) {
    clase = 'status-ok';
  } else if (ESTADOS_AMBAR.has(norm)) {
    clase = 'status-warn';
  } else if (
    ESTADOS_ROJOS.has(norm) ||
    norm.includes('BLOQUEADO') ||
    norm.includes('RECHAZADO') ||
    norm.includes('FALLIDO')
  ) {
    clase = 'status-err';
  }

  return <span className={`status-badge ${clase}`}>{texto || estado}</span>;
};

export const ImmutableTag: React.FC<{ label?: string }> = ({ label = 'INMUTABLE / SOLO LECTURA' }) => (
  <span className="immutable-pill" title="Registro protegido contra edición o borrado físico (RN16 / RN17 / RNF08)">
    🔒 {label}
  </span>
);
