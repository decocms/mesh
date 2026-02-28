import { useWidget } from "./use-widget.ts";

type TableArgs = {
  columns?: string[];
  rows?: string[][];
  title?: string;
};

export default function Table() {
  const { args } = useWidget<TableArgs>();

  if (!args) return null;

  const { columns = [], rows = [], title } = args;

  return (
    <div className="font-sans">
      {title && (
        <div className="px-3 py-2 text-sm font-semibold text-foreground border-b border-border">
          {title}
        </div>
      )}
      <div className="overflow-auto">
        <table className="w-full text-sm">
          {columns.length > 0 && (
            <thead>
              <tr className="border-b border-border">
                {columns.map((col, i) => (
                  <th
                    key={i}
                    className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={Math.max(columns.length, 1)}
                  className="px-3 py-4 text-center text-muted-foreground"
                >
                  No data
                </td>
              </tr>
            ) : (
              rows.map((row, ri) => (
                <tr
                  key={ri}
                  className="border-b border-border last:border-0 hover:bg-muted/50"
                >
                  {row.map((cell, ci) => (
                    <td key={ci} className="px-3 py-2 text-foreground">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
