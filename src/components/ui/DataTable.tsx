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
    <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-200">
      <div className="flex flex-col gap-4 border-b border-gray-200 p-4 sm:p-5">
        {filters && <div className="flex flex-wrap gap-3">{filters}</div>}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-gray-500">
            {total === 0 ? "Nenhum item" : `Exibindo ${start} - ${end} de ${total}`}
          </p>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span>Tamanho da pagina</span>
            <select
              value={pageSize}
              onChange={(event) => onPageSizeChange?.(Number(event.target.value))}
              className="rounded-md border border-gray-200 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
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

      <div className="relative">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {columns.map((column) => (
                <th
                  key={String(column.key)}
                  scope="col"
                  className={["px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500", column.className]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {isLoading ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-6 text-center text-sm text-gray-500">
                  Carregando...
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-6 text-center text-sm text-gray-500">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              data.map((row, index) => {
                const rowId = getRowId?.(row) ?? index;
                return (
                  <tr
                    key={rowId}
                    className={onRowClick ? "cursor-pointer hover:bg-gray-50" : undefined}
                    onClick={() => onRowClick?.(row)}
                  >
                    {columns.map((column) => {
                      const content = column.render
                        ? column.render(row)
                        : (row as Record<string, unknown>)[column.key as string];
                      return (
                        <td
                          key={String(column.key)}
                          className={["px-4 py-3 text-sm text-gray-700", column.className]
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

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 p-4 text-sm text-gray-500">
        <div>{total === 0 ? "Nenhuma pagina" : `Pagina ${page} de ${totalPages}`}</div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onPageChange?.(Math.max(1, page - 1))}
            disabled={page <= 1}
            className="rounded-md border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Anterior
          </button>
          <button
            type="button"
            onClick={() => onPageChange?.(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            className="rounded-md border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Proxima
          </button>
        </div>
      </div>
    </div>
  );
}

export default DataTable;
