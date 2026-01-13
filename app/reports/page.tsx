"use client";

import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";

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
      const womenList = womenSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Woman));

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

  // ✅ reset page when search/month changes
  useEffect(() => {
    setPage(1);
  }, [search, monthOffset]);

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

  const totalPages = useMemo(() => {
    if (isSearching) return 1;
    return Math.max(1, Math.ceil(filteredWomen.length / PAGE_SIZE));
  }, [filteredWomen.length, isSearching]);

  const currentPage = Math.min(page, totalPages);

  const pageItems = useMemo(() => {
    if (isSearching) return filteredWomen; // show all matches
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredWomen.slice(start, start + PAGE_SIZE);
  }, [filteredWomen, currentPage, isSearching]);

  // ✅ compute rows once (performance)
  const computedRows = useMemo(() => {
    return pageItems.map((w) => {
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
  }, [pageItems, weekKeys, attByWeek]);

  if (loading) return <div style={{ padding: 20 }}>جاري تحميل التقرير...</div>;

  return (
    <div style={{ padding: 20, overflowX: "auto" }} dir="rtl">
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>تقرير مواظبة شهر: {title}</h2>

        <div style={s.btnRow}>
          <button onClick={() => setMonthOffset((v) => v - 1)} style={s.btnGhost} type="button">
            <span style={s.btnIcon}>➡</span> الشهر السابق
          </button>

          <button
            onClick={() => setMonthOffset(0)}
            style={{ ...s.btnPrimary, ...(monthOffset === 0 ? s.btnPrimaryDisabled : {}) }}
            disabled={monthOffset === 0}
            type="button"
          >
            الشهر الحالي
          </button>

          <button onClick={() => setMonthOffset((v) => v + 1)} style={s.btnGhost} type="button">
            الشهر التالي <span style={s.btnIcon}>⬅</span>
          </button>
        </div>
      </div>

      <p style={{ opacity: 0.7, marginTop: 8 }}>
        * أي اسم غير مسجّل حضور في الاجتماع يعتبر غائب تلقائيًا.
      </p>

      {/* ✅ Search */}
      <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <label style={{ display: "block", fontSize: 12, opacity: 0.75, marginBottom: 6 }}>
            بحث (بالاسم أو الرقم)
          </label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="مثال: 101 أو منى"
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #ddd",
              outline: "none",
              fontSize: 14,
              fontFamily: "cairo",
            }}
          />
        </div>

        <button
          type="button"
          onClick={() => setSearch("")}
          style={s.clearBtn}
          disabled={!search}
        >
          مسح
        </button>

        <div style={{ opacity: 0.75 }}>
          النتائج: <b>{filteredWomen.length}</b>
          {!isSearching && (
            <>
              {" "} | المعروض: <b>{pageItems.length}</b>
            </>
          )}
        </div>
      </div>

      {!isSearching && filteredWomen.length > PAGE_SIZE && (
        <div style={s.paginationRow}>
          <button
            type="button"
            style={{ ...s.pageBtn, ...(currentPage <= 1 ? s.pageBtnDisabled : {}) }}
            disabled={currentPage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            السابق
          </button>

          <div style={s.pageInfo}>
            صفحة <b>{currentPage}</b> / <b>{totalPages}</b>
          </div>

          <button
            type="button"
            style={{ ...s.pageBtn, ...(currentPage >= totalPages ? s.pageBtnDisabled : {}) }}
            disabled={currentPage >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            التالي
          </button>
        </div>
      )}

      {weekKeys.length === 0 ? (
        <p>لا توجد أيام اثنين في هذا الشهر.</p>
      ) : filteredWomen.length === 0 ? (
        <p style={{ marginTop: 12 }}>لا توجد نتائج مطابقة.</p>
      ) : (
        <>
          <table style={{ borderCollapse: "collapse", minWidth: 1100, marginTop: 10 }}>
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
              {computedRows.map(({ w, marks, present, absent, pct }) => (
                <tr key={w.id}>
                  <td style={tdCenter}>{w.code}</td>
                  <td style={td}>{w.name}</td>

                  {marks.map((isPresent, idx) => (
                    <td key={weekKeys[idx]} style={tdCenter}>
                      {isPresent ? "✅" : "—"}
                    </td>
                  ))}

                  <td style={tdCenter}>{present}</td>
                  <td style={tdCenter}>{absent}</td>
                  <td style={tdCenter}>{pct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <div style={{ marginTop: 10, opacity: 0.7 }}>
        الشهر المعروض: {year}-{String(monthIndex0 + 1).padStart(2, "0")} | عدد الاجتماعات: <b>{weekKeys.length}</b>
      </div>
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
  },

  pageBtnDisabled: {
    opacity: 0.5,
    cursor: "not-allowed",
  },

  pageInfo: {
    opacity: 0.75,
    fontFamily: "cairo",
  },
};
