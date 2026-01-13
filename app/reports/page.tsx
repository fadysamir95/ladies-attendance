"use client";

import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";

type Woman = {
  id: string;
  code: number; // ✅ رقم
  name: string;
};

type AttendanceDoc = {
  records?: Record<string, { markedAt?: any }>;
};

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

export default function ReportsPage() {
  const [monthOffset, setMonthOffset] = useState<number>(0);

  const [women, setWomen] = useState<Woman[]>([]);
  const [attByWeek, setAttByWeek] = useState<Record<string, AttendanceDoc>>({});
  const [loading, setLoading] = useState<boolean>(true);

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

      const qWomen = query(collection(db, "women"), where("active", "==", true));
      const womenSnap = await getDocs(qWomen);
      const womenList = womenSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Woman));

      // ✅ ترتيب حسب الرقم دائمًا
      womenList.sort((a, b) => (a.code ?? 0) - (b.code ?? 0));
      setWomen(womenList);

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

  if (loading) return <div style={{ padding: 20 }}>جاري تحميل التقرير...</div>;

  return (
    <div style={{ padding: 20, overflowX: "auto" }} dir="rtl">
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>تقرير مواظبة شهر: {title}</h2>

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
            style={{ ...s.btnPrimary, ...(monthOffset === 0 ? s.btnPrimaryDisabled : {}) }}
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

      {weekKeys.length === 0 ? (
        <p>لا توجد أيام اثنين في هذا الشهر.</p>
      ) : (
        <table style={{ borderCollapse: "collapse", minWidth: 1100, marginTop: 10 }}>
          <thead>
            <tr>
              {/* ✅ عمود الرقم */}
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
            {women.map((w) => {
              let present = 0;

              return (
                <tr key={w.id}>
                  <td style={tdCenter}>{w.code}</td>
                  <td style={td}>{w.name}</td>

                  {weekKeys.map((wk) => {
                    const isPresent = !!attByWeek[wk]?.records?.[w.id];
                    if (isPresent) present++;

                    return (
                      <td key={wk} style={tdCenter}>
                        {isPresent ? "✅" : "—"}
                      </td>
                    );
                  })}

                  {(() => {
                    const total = weekKeys.length;
                    const absent = total - present;
                    const pct = total === 0 ? 0 : Math.round((present / total) * 100);
                    return (
                      <>
                        <td style={tdCenter}>{present}</td>
                        <td style={tdCenter}>{absent}</td>
                        <td style={tdCenter}>{pct}%</td>
                      </>
                    );
                  })()}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <div style={{ marginTop: 10, opacity: 0.7 }}>
        الشهر المعروض: {year}-{String(monthIndex0 + 1).padStart(2, "0")} | عدد الاجتماعات:{" "}
        <b>{weekKeys.length}</b>
      </div>
    </div>
  );
}

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

  btnBase: {
    padding: "10px 14px",
    borderRadius: 999,
    fontWeight: 900,
    cursor: "pointer",
    transition: "all 180ms ease",
    border: "1px solid transparent",
    background: "white",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
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
  },

  btnPrimaryDisabled: {
    opacity: 0.55,
    cursor: "not-allowed",
  },

  btnIcon: {
    opacity: 0.8,
    fontWeight: 900,
  },
};