"use client";

import type React from "react";
import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import ChurchLoader from "@/app/components/ChurchLoader";

type Woman = {
  id: string;
  code: number;
  name: string;
};

type AttendanceDoc = {
  records?: Record<string, { markedAt?: any }>;
};

// -------- helpers --------
function normalizeArabic(s: string) {
  return s
    .trim()
    .toLowerCase()
    .replace(/[إأآا]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه");
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function monthTitle(year: number, monthIndex0: number) {
  const d = new Date(year, monthIndex0, 1);
  return d.toLocaleDateString("ar-EG", { year: "numeric", month: "long" });
}

// 0=Sunday..6=Saturday, Monday=1
function getMondaysOfMonth(year: number, monthIndex0: number): string[] {
  const result: string[] = [];
  const first = new Date(year, monthIndex0, 1);
  const last = new Date(year, monthIndex0 + 1, 0);

  const firstDay = first.getDay();
  const diffToMonday = (1 - firstDay + 7) % 7;
  const firstMonday = new Date(year, monthIndex0, 1 + diffToMonday);

  for (let d = new Date(firstMonday); d <= last; d.setDate(d.getDate() + 7)) {
    result.push(toISODate(new Date(d)));
  }
  return result;
}

const PAGE_SIZE = 50;

export default function ReportsPage() {
  const [monthOffset, setMonthOffset] = useState<number>(0);

  const [women, setWomen] = useState<Woman[]>([]);
  const [attByWeek, setAttByWeek] = useState<Record<string, AttendanceDoc>>({});
  const [loading, setLoading] = useState<boolean>(true);

  // ✅ search + pagination
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  // ✅ sorting by attendance percentage
  const [sortMode, setSortMode] = useState<"default" | "desc" | "asc">("default");

  const { year, monthIndex0, weekKeys, title } = useMemo(() => {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
    const y = d.getFullYear();
    const m0 = d.getMonth();
    const keys = getMondaysOfMonth(y, m0);
    return {
      year: y,
      monthIndex0: m0,
      weekKeys: keys,
      title: monthTitle(y, m0),
    };
  }, [monthOffset]);

  useEffect(() => {
    async function load() {
      setLoading(true);

      // 1) Load active women
      const qWomen = query(collection(db, "women"), where("active", "==", true));
      const womenSnap = await getDocs(qWomen);
      const womenList = womenSnap.docs.map(
        (d) => ({ id: d.id, ...d.data() } as Woman)
      );

      // ✅ sort by code always
      womenList.sort((a, b) => (a.code ?? 0) - (b.code ?? 0));
      setWomen(womenList);

      // 2) Load attendance docs for month Mondays
      const pairs = await Promise.all(
        weekKeys.map(async (wk) => {
          const snap = await getDoc(doc(db, "attendance", wk));
          return [wk, snap.exists() ? (snap.data() as AttendanceDoc) : {}] as const;
        })
      );

      const map: Record<string, AttendanceDoc> = {};
      for (const [wk, data] of pairs) map[wk] = data;

      setAttByWeek(map);
      setLoading(false);
    }

    load();
  }, [weekKeys]);

  // ✅ reset page when search/month/sort changes
  useEffect(() => {
    setPage(1);
  }, [search, monthOffset, sortMode]);

  // ✅ filter women by name or code
  const filteredWomen = useMemo(() => {
    const qName = normalizeArabic(search);
    const qNum = String(search || "").trim();

    if (!qName && !qNum) return women;

    return women.filter((w) => {
      const byName = qName ? normalizeArabic(w.name).includes(qName) : false;
      const byCode = qNum ? String(w.code ?? "").includes(qNum) : false;
      return byName || byCode;
    });
  }, [women, search]);

  const isSearching = search.trim().length > 0;

  // ✅ compute ALL rows (so sorting is correct across pages)
  const computedAllRows = useMemo(() => {
    return filteredWomen.map((w) => {
      let present = 0;

      const marks = weekKeys.map((wk) => {
        const isPresent = !!attByWeek[wk]?.records?.[w.id];
        if (isPresent) present++;
        return isPresent;
      });

      const total = weekKeys.length;
      const absent = total - present;
      const pct = total === 0 ? 0 : Math.round((present / total) * 100);

      return { w, marks, present, absent, pct };
    });
  }, [filteredWomen, weekKeys, attByWeek]);

  const sortedRows = useMemo(() => {
    const arr = [...computedAllRows];

    // الوضع الافتراضي → رجوع للترتيب الطبيعي حسب الرقم
    if (sortMode === "default") {
      arr.sort((a, b) => (a.w.code ?? 0) - (b.w.code ?? 0));
      return arr;
    }

    // ترتيب حسب نسبة الحضور
    arr.sort((a, b) => {
      if (a.pct !== b.pct) {
        return sortMode === "asc" ? a.pct - b.pct : b.pct - a.pct;
      }
      return (a.w.code ?? 0) - (b.w.code ?? 0);
    });

    return arr;
  }, [computedAllRows, sortMode]);

  const totalPages = useMemo(() => {
    if (isSearching) return 1;
    return Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));
  }, [sortedRows.length, isSearching]);

  const currentPage = Math.min(page, totalPages);

  const pageRows = useMemo(() => {
    if (isSearching) return sortedRows; // show all matches
    const start = (currentPage - 1) * PAGE_SIZE;
    return sortedRows.slice(start, start + PAGE_SIZE);
  }, [sortedRows, currentPage, isSearching]);

  if (loading) return <ChurchLoader text="جاري تحميل التقارير ..." />;

  return (
    <div style={s.page} dir="rtl">
      {/* top header row */}
      <div style={s.topRow}>
        <div>
          <h2 style={{ margin: 0 }}>تقرير مواظبة شهر: {title}</h2>
          <div style={s.subNote}>
            الشهر المعروض:{" "}
            <b>
              {year}-{String(monthIndex0 + 1).padStart(2, "0")}
            </b>{" "}
            | عدد الاجتماعات: <b>{weekKeys.length}</b> | عدد السيدات:{" "}
            <b>{women.length}</b>
          </div>
        </div>

        <div style={s.btnRow}>
          <button
            onClick={() => setMonthOffset((v) => v - 1)}
            style={s.btnGhost}
            type="button"
          >
            <span style={s.btnIcon}>➡</span> الشهر السابق
          </button>

          <button
            onClick={() => setMonthOffset(0)}
            style={{
              ...s.btnPrimary,
              ...(monthOffset === 0 ? s.btnPrimaryDisabled : {}),
            }}
            disabled={monthOffset === 0}
            type="button"
          >
            الشهر الحالي
          </button>

          <button
            onClick={() => setMonthOffset((v) => v + 1)}
            style={s.btnGhost}
            type="button"
          >
            الشهر التالي <span style={s.btnIcon}>⬅</span>
          </button>
        </div>
      </div>

      <p style={{ opacity: 0.7, marginTop: 8 }}>
        * أي اسم غير مسجّل حضور في الاجتماع يعتبر غائب تلقائيًا.
      </p>

      {/* tools card: search + sort */}
      <div style={s.card}>
        <div style={s.toolsRow}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <label style={s.label}>بحث (بالاسم أو الرقم)</label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="مثال: 101 أو منى"
              style={s.input}
            />
          </div>

          <button type="button" onClick={() => setSearch("")} style={s.clearBtn} disabled={!search}>
            مسح
          </button>

          <button
            type="button"
            onClick={() =>
              setSortMode((m) =>
                m === "default" ? "desc" : m === "desc" ? "asc" : "default"
              )
            }
            style={s.btnGhost}
          >
            الترتيب:{" "}
            {sortMode === "default"
              ? "افتراضي (حسب الرقم)"
              : sortMode === "desc"
              ? "نسبة الحضور تنازلي ↓"
              : "نسبة الحضور تصاعدي ↑"}
          </button>

          <div style={s.resultsNote}>
            النتائج: <b>{filteredWomen.length}</b>
            {!isSearching && (
              <>
                {" "}
                | الصفحة: <b>{currentPage}</b> / <b>{totalPages}</b>
              </>
            )}
          </div>
        </div>

        {/* pagination top (only when search empty) */}
        {!isSearching && totalPages > 1 && (
          <Pagination page={currentPage} totalPages={totalPages} onPage={setPage} />
        )}
      </div>

      {weekKeys.length === 0 ? (
        <div style={{ marginTop: 12 }}>لا توجد أيام اثنين في هذا الشهر.</div>
      ) : filteredWomen.length === 0 ? (
        <div style={{ marginTop: 12 }}>لا توجد نتائج مطابقة.</div>
      ) : (
        <div style={{ ...s.card, marginTop: 12 }}>
          <div style={s.tableWrap}>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={th}>الرقم</th>
                  <th style={th}>الاسم</th>

                  {weekKeys.map((wk) => (
                    <th key={wk} style={th}>
                      {wk}
                    </th>
                  ))}

                  <th style={th}>حضور</th>
                  <th style={th}>غياب</th>
                  <th style={th}>نسبة الحضور</th>
                </tr>
              </thead>

              <tbody>
                {pageRows.map(({ w, marks, present, absent, pct }) => {
                  const never = weekKeys.length > 0 && present === 0;

                  return (
                    <tr
                      key={w.id}
                      style={{
                        ...(present === weekKeys.length && weekKeys.length > 0 ? rowAllPresent : {}),
                        ...(present === 0 && weekKeys.length > 0 ? rowZeroPresent : {}),
                      }}
                    >
                      <td style={tdCenter}>{w.code}</td>
                      <td style={td}>{w.name}</td>

                      {marks.map((isPresent, idx) => (
                        <td key={weekKeys[idx]} style={tdCenter}>
                          {isPresent ? "✅" : "—"}
                        </td>
                      ))}

                      <td style={tdCenter}>{present}</td>
                      <td style={tdCenter}>{absent}</td>
                      <td style={tdCenter}>
                        <span
                          style={{
                            ...s.pctPill,
                            ...(never ? s.pctPillBad : pct >= 75 ? s.pctPillGood : {}),
                          }}
                        >
                          {pct}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* pagination bottom (only when search empty) */}
          {!isSearching && totalPages > 1 && (
            <Pagination page={currentPage} totalPages={totalPages} onPage={setPage} />
          )}
        </div>
      )}
    </div>
  );
}

// -------- pagination component --------
function Pagination({
  page,
  totalPages,
  onPage,
}: {
  page: number;
  totalPages: number;
  onPage: (p: number) => void;
}) {
  if (totalPages <= 1) return null;

  const pages: Array<number | "dots"> = [];

  const push = (v: number | "dots") => pages.push(v);

  push(1);

  if (page > 4) push("dots");

  const from = Math.max(2, page - 2);
  const to = Math.min(totalPages - 1, page + 2);

  for (let p = from; p <= to; p++) push(p);

  if (page < totalPages - 3) push("dots");

  if (totalPages > 1) push(totalPages);

  return (
    <div style={s.paginationRow}>
      <button
        type="button"
        style={{ ...s.pageBtn, ...(page === 1 ? s.pageBtnDisabled : {}) }}
        disabled={page === 1}
        onClick={() => onPage(1)}
      >
        الأولى
      </button>

      <button
        type="button"
        style={{ ...s.pageBtn, ...(page === 1 ? s.pageBtnDisabled : {}) }}
        disabled={page === 1}
        onClick={() => onPage(page - 1)}
      >
        السابق
      </button>

      <div style={s.pageNumbers}>
        {pages.map((p, idx) =>
          p === "dots" ? (
            <span key={idx} style={s.dots}>
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onPage(p)}
              style={{ ...s.numBtn, ...(p === page ? s.numBtnActive : {}) }}
            >
              {p}
            </button>
          )
        )}
      </div>

      <button
        type="button"
        style={{ ...s.pageBtn, ...(page === totalPages ? s.pageBtnDisabled : {}) }}
        disabled={page === totalPages}
        onClick={() => onPage(page + 1)}
      >
        التالي
      </button>

      <button
        type="button"
        style={{ ...s.pageBtn, ...(page === totalPages ? s.pageBtnDisabled : {}) }}
        disabled={page === totalPages}
        onClick={() => onPage(totalPages)}
      >
        الأخيرة
      </button>
    </div>
  );
}

// -------- styles --------
const th: React.CSSProperties = {
  border: "1px solid #ddd",
  padding: 8,
  background: "#f7f7f7",
  textAlign: "center",
  whiteSpace: "nowrap",
};

const td: React.CSSProperties = {
  border: "1px solid #ddd",
  padding: 8,
  whiteSpace: "nowrap",
};

const tdCenter: React.CSSProperties = {
  border: "1px solid #ddd",
  padding: 8,
  textAlign: "center",
  whiteSpace: "nowrap",
};

const PRIMARY = "#152755";

const s: Record<string, React.CSSProperties> = {
  page: {
    padding: 16,
    background: "#f6f7fb",
    minHeight: "calc(100vh - 70px)",
    maxWidth: "1100px",
    margin: "auto",
  },

  topRow: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },

  subNote: {
    marginTop: 6,
    opacity: 0.7,
    fontSize: 13,
  },

  card: {
    background: "white",
    border: "1px solid #e7e7e7",
    borderRadius: 18,
    padding: 14,
    boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
  },

  toolsRow: {
    display: "flex",
    gap: 10,
    alignItems: "flex-end",
    flexWrap: "wrap",
  },

  label: {
    display: "block",
    fontSize: 12,
    opacity: 0.75,
    marginBottom: 6,
    fontFamily: "cairo",
  },

  input: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #ddd",
    outline: "none",
    fontSize: 14,
    fontFamily: "cairo",
    background: "white",
  },

  resultsNote: {
    opacity: 0.75,
    fontFamily: "cairo",
    padding: "8px 10px",
  },

  btnRow: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    alignItems: "center",
  },

  btnGhost: {
    padding: "10px 14px",
    borderRadius: 999,
    fontWeight: 900,
    cursor: "pointer",
    transition: "all 180ms ease",
    border: "1px solid #e5e7eb",
    background: "white",
    color: "#111827",
    fontFamily: "cairo",
    whiteSpace: "nowrap",
  },

  btnPrimary: {
    padding: "10px 14px",
    borderRadius: 999,
    fontWeight: 900,
    cursor: "pointer",
    transition: "all 180ms ease",
    border: `1px solid ${PRIMARY}`,
    background: PRIMARY,
    color: "white",
    fontFamily: "cairo",
    whiteSpace: "nowrap",
  },

  btnPrimaryDisabled: {
    opacity: 0.55,
    cursor: "not-allowed",
  },

  btnIcon: {
    opacity: 0.8,
    fontWeight: 900,
  },

  clearBtn: {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid #ddd",
    cursor: "pointer",
    background: "white",
    fontWeight: 900,
    fontFamily: "cairo",
    whiteSpace: "nowrap",
  },

  tableWrap: {
    overflowX: "auto",
    border: "1px solid #eee",
    borderRadius: 14,
  },

  table: {
    borderCollapse: "collapse",
    minWidth: 1100,
    width: "100%",
  },

  pctPill: {
    display: "inline-block",
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid #e5e7eb",
    background: "#f9fafb",
    fontWeight: 900,
    fontFamily: "cairo",
    minWidth: 64,
  },

  pctPillGood: {
    background: "#ecfdf5",
    border: "1px solid #bbf7d0",
    color: "#065f46",
  },

  pctPillBad: {
    background: "#fee2e2",
    border: "1px solid #fecaca",
    color: "#991b1b",
  },

  paginationRow: {
    marginTop: 12,
    display: "flex",
    gap: 10,
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
  },

  pageBtn: {
    padding: "10px 14px",
    borderRadius: 999,
    border: "1px solid #ddd",
    background: "white",
    cursor: "pointer",
    fontWeight: 900,
    fontFamily: "cairo",
    transition: "all 180ms ease",
    whiteSpace: "nowrap",
  },

  pageBtnDisabled: {
    opacity: 0.5,
    cursor: "not-allowed",
  },

  pageNumbers: {
    display: "flex",
    gap: 6,
    flexWrap: "wrap",
    alignItems: "center",
  },

  numBtn: {
    minWidth: 38,
    height: 38,
    borderRadius: 999,
    border: "1px solid #e5e7eb",
    background: "white",
    cursor: "pointer",
    fontWeight: 900,
    fontFamily: "cairo",
  },

  numBtnActive: {
    background: PRIMARY,
    border: `1px solid ${PRIMARY}`,
    color: "white",
  },

  dots: {
    opacity: 0.6,
    padding: "0 6px",
    fontWeight: 900,
    fontFamily: "cairo",
  },

  pageInfo: {
    opacity: 0.75,
    fontFamily: "cairo",
  },
};

const rowAllPresent: React.CSSProperties = {
  background: "#ecfdf5",
};

const rowZeroPresent: React.CSSProperties = {
  background: "#fff1f2",
};