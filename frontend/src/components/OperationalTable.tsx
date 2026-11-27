import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface ColumnaTabla<T = any> {
  key: string;
  titulo: string;
  mono?: boolean;
  render?: (fila: T) => React.ReactNode;
}

interface OperationalTableProps<T = any> {
  titulo: string;
  subtitulo?: string;
  accionesCabecera?: React.ReactNode;
  filtrosSlot?: React.ReactNode;
  columnas: ColumnaTabla<T>[];
  datos: T[];
  filasPorPagina?: number;
  emptyMessage?: string;
}

export function OperationalTable<T = any>({
  titulo,
  subtitulo,
  accionesCabecera,
  filtrosSlot,
  columnas,
  datos,
  filasPorPagina = 8,
  emptyMessage = 'No se encontraron registros para el criterio seleccionado.'
}: OperationalTableProps<T>) {
  const [pagina, setPagina] = useState(1);

  useEffect(() => {
    setPagina(1);
  }, [datos.length]);

  const totalPaginas = Math.max(1, Math.ceil(datos.length / filasPorPagina));
  const paginaSegura = Math.min(pagina, totalPaginas);
  const inicio = (paginaSegura - 1) * filasPorPagina;
  const filasVisibles = datos.slice(inicio, inicio + filasPorPagina);

  return (
    <section className="op-table-card">
      <div className="op-table-header">
        <div>
          <h4 className="section-subtitle" style={{ margin: 0 }}>{titulo}</h4>
          {subtitulo && (
            <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
              {subtitulo}
            </div>
          )}
        </div>
        {accionesCabecera && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
            {accionesCabecera}
          </div>
        )}
      </div>

      {filtrosSlot && <div className="op-table-filters">{filtrosSlot}</div>}

      <div className="op-table-scroll">
        <table className="op-table">
          <thead>
            <tr>
              {columnas.map((col) => (
                <th key={col.key}>{col.titulo}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filasVisibles.length === 0 ? (
              <tr>
                <td colSpan={columnas.length} style={{ textAlign: 'center', padding: '24px', color: 'var(--color-text-muted)' }}>
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              filasVisibles.map((fila, idx) => (
                <tr key={idx}>
                  {columnas.map((col) => (
                    <td key={col.key} className={col.mono ? 'mono' : undefined}>
                      {col.render ? col.render(fila) : (fila as any)[col.key]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="op-table-pagination">
        <span className="mono">
          Mostrando {datos.length === 0 ? 0 : inicio + 1}–{Math.min(inicio + filasPorPagina, datos.length)} de {datos.length} registros
        </span>
        {totalPaginas > 1 && (
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <button
              className="btn btn-sm btn-outline"
              disabled={paginaSegura <= 1}
              onClick={() => setPagina(paginaSegura - 1)}
            >
              <ChevronLeft size={14} /> Anterior
            </button>
            <span className="mono" style={{ padding: '0 6px' }}>
              Pág. {paginaSegura} / {totalPaginas}
            </span>
            <button
              className="btn btn-sm btn-outline"
              disabled={paginaSegura >= totalPaginas}
              onClick={() => setPagina(paginaSegura + 1)}
            >
              Siguiente <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
