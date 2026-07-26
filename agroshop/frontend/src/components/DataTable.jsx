import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Search } from "lucide-react";

/**
 * Clean data table: search, sortable columns, alternating rows, pagination.
 * columns: [{ key, header, render?, align?, sortable?, sortValue? }]
 */
export default function DataTable({
  columns,
  rows,
  searchKeys,
  pageSize = 12,
  empty = "Nothing to show yet.",
  toolbar,
  rowKey = (r) => r.id,
  onRowClick,
}) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState({ key: null, dir: "asc" });
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q || !searchKeys?.length) return rows;
    return rows.filter((r) => searchKeys.some((k) => String(r[k] ?? "").toLowerCase().includes(q)));
  }, [rows, search, searchKeys]);

  const sorted = useMemo(() => {
    if (!sort.key) return filtered;
    const col = columns.find((c) => c.key === sort.key);
    const val = (r) => (col?.sortValue ? col.sortValue(r) : r[sort.key]);
    return [...filtered].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      const cmp =
        typeof x === "number" && typeof y === "number"
          ? x - y
          : String(x ?? "").localeCompare(String(y ?? ""), undefined, { numeric: true });
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sort, columns]);

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const current = Math.min(page, pages);
  const slice = sorted.slice((current - 1) * pageSize, current * pageSize);

  const toggleSort = (key) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  return (
    <div className="space-y-3">
      {(searchKeys?.length || toolbar) && (
        <div className="flex flex-wrap items-center gap-2">
          {searchKeys?.length ? (
            <div className="relative flex-1 min-w-[200px]">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className="input pl-9"
                placeholder="Search…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          ) : (
            <div className="flex-1" />
          )}
          {toolbar}
        </div>
      )}

      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  style={{ textAlign: c.align || "left" }}
                  className={c.sortable === false ? "" : "cursor-pointer select-none"}
                  onClick={c.sortable === false ? undefined : () => toggleSort(c.key)}
                >
                  <span className="inline-flex items-center gap-1">
                    {c.header}
                    {sort.key === c.key &&
                      (sort.dir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.map((r) => (
              <tr
                key={rowKey(r)}
                onClick={onRowClick ? () => onRowClick(r) : undefined}
                className={onRowClick ? "cursor-pointer" : ""}
              >
                {columns.map((c) => (
                  <td key={c.key} style={{ textAlign: c.align || "left" }}>
                    {c.render ? c.render(r) : (r[c.key] ?? "—")}
                  </td>
                ))}
              </tr>
            ))}
            {!slice.length && (
              <tr>
                <td colSpan={columns.length} className="py-10 text-center text-sm text-slate-500">
                  {empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>
            {sorted.length} record{sorted.length === 1 ? "" : "s"} · page {current} of {pages}
          </span>
          <div className="flex gap-2">
            <button className="btn-ghost px-2" disabled={current <= 1} onClick={() => setPage(current - 1)}>
              <ChevronLeft size={16} />
            </button>
            <button className="btn-ghost px-2" disabled={current >= pages} onClick={() => setPage(current + 1)}>
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
