import type { ReactNode } from "react";

type Column<T> = {
  key: keyof T | string;
  label: string;
  render?: (row: T) => ReactNode;
  className?: string;
};

type DataTableProps<T> = {
  columns: Column<T>[];
  data: T[];
  filters?: ReactNode;
  page: number;
  pageSize: number;
  total: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
  isLoading?: boolean;
  emptyMessage?: string;
  getRowId?: (row: T) => string | number;
  onRowClick?: (row: T) => void;
};

const DEFAULT_PAGE_SIZES = [10, 20, 50];

export function DataTable<T>({
  columns,
  data,
  filters,
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = DEFAULT_PAGE_SIZES,
  isLoading = false,
  emptyMessage = "Nenhum registro encontrado",
  getRowId,
  onRowClick,
}: DataTableProps<T>) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);

  return (
    <div className="overflow-hidden rounded-large bg-surface shadow-medium border border-border">
      {/* Header com filtros e informações */}
      <div className="flex flex-col gap-4 border-b border-border p-4 sm:p-6 bg-background-secondary">
        {filters && (
          <div className="flex flex-wrap gap-3">
            {filters}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-foreground-tertiary font-medium">
            {total === 0 ? "Nenhum item encontrado" : `Exibindo ${start} - ${end} de ${total} itens`}
          </p>
          <div className="flex items-center gap-2 text-sm text-foreground-tertiary">
            <span className="font-medium">Itens por página:</span>
            <select
              value={pageSize}
              onChange={(event) => onPageSizeChange?.(Number(event.target.value))}
              className="rounded-medium border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground transition-all duration-fast focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary hover:border-border-secondary"
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Tabela */}
      <div className="relative overflow-x-auto">
        <table className="min-w-full divide-y divide-border">
          <thead className="bg-background-tertiary">
            <tr>
              {columns.map((column) => (
                <th
                  key={String(column.key)}
                  scope="col"
                  className={[
                    "px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-foreground-tertiary",
                    column.className
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-surface">
            {isLoading ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center">
                  <div className="flex items-center justify-center gap-2 text-foreground-tertiary">
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary border-t-transparent"></div>
                    <span className="text-sm font-medium">Carregando dados...</span>
                  </div>
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center">
                  <div className="text-foreground-tertiary">
                    <svg className="mx-auto h-8 w-8 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p className="text-sm font-medium">{emptyMessage}</p>
                  </div>
                </td>
              </tr>
            ) : (
              data.map((row, index) => {
                const rowId = getRowId?.(row) ?? index;
                return (
                  <tr
                    key={rowId}
                    className={[
                      "transition-colors duration-fast",
                      onRowClick 
                        ? "cursor-pointer hover:bg-background-secondary focus-within:bg-background-secondary" 
                        : ""
                    ].filter(Boolean).join(" ")}
                    onClick={() => onRowClick?.(row)}
                  >
                    {columns.map((column) => {
                      const content = column.render
                        ? column.render(row)
                        : (row as Record<string, unknown>)[column.key as string];
                      return (
                        <td
                          key={String(column.key)}
                          className={[
                            "px-4 py-3 text-sm text-foreground-secondary",
                            column.className
                          ]
                            .filter(Boolean)
                            .join(" ")}
                        >
                          {content as ReactNode}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Footer com paginação */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-4 text-sm text-foreground-tertiary bg-background-secondary">
        <div className="font-medium">
          {total === 0 ? "Nenhuma página" : `Página ${page} de ${totalPages}`}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onPageChange?.(Math.max(1, page - 1))}
            disabled={page <= 1}
            className="rounded-medium border border-border px-3 py-1.5 text-sm font-medium text-foreground-secondary transition-all duration-fast hover:bg-surface hover:border-border-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:border-border disabled:hover:text-foreground-secondary focus:outline-none focus:ring-2 focus:ring-primary"
          >
            ← Anterior
          </button>
          <button
            type="button"
            onClick={() => onPageChange?.(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            className="rounded-medium border border-border px-3 py-1.5 text-sm font-medium text-foreground-secondary transition-all duration-fast hover:bg-surface hover:border-border-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:border-border disabled:hover:text-foreground-secondary focus:outline-none focus:ring-2 focus:ring-primary"
          >
            Próxima →
          </button>
        </div>
      </div>
    </div>
  );
}

export default DataTable;
