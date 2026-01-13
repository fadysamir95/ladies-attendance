"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  updateDoc,
  serverTimestamp,
  deleteField,
  setDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

type Woman = {
  id: string;
  code: number;
  name: string;
  active: boolean;
};

type PresentRecord = {
  markedAt: Date;
};

function normalizeArabic(s: string) {
  return s
    .trim()
    .toLowerCase()
    .replace(/[إأآا]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه");
}

export default function SessionPage() {
  const params = useParams();
  const weekKey = params.weekKey as string;

  const [women, setWomen] = useState<Woman[]>([]);
  const [records, setRecords] = useState<Record<string, PresentRecord>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const attRef = useMemo(() => doc(db, "attendance", weekKey), [weekKey]);

  useEffect(() => {
    async function load() {
      setLoading(true);

      const qWomen = query(collection(db, "women"), where("active", "==", true));
      const womenSnap = await getDocs(qWomen);

      const list = womenSnap.docs.map(
        (d) => ({ id: d.id, ...d.data() } as Woman)
      );

      // ترتيب دائم حسب الرقم
      list.sort((a, b) => (a.code ?? 0) - (b.code ?? 0));
      setWomen(list);

      const attSnap = await getDoc(attRef);

      if (!attSnap.exists()) {
        await setDoc(attRef, { records: {}, updatedAt: serverTimestamp() });
        setRecords({});
      } else {
        setRecords(attSnap.data().records || {});
      }

      setLoading(false);
    }

    load();
  }, [attRef]);

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

  async function markPresent(womanId: string) {
    setRecords((prev) => ({
      ...prev,
      [womanId]: { markedAt: new Date() },
    }));

    await updateDoc(attRef, {
      [`records.${womanId}`]: { markedAt: new Date() },
      updatedAt: serverTimestamp(),
    });
  }

  async function undoPresent(womanId: string) {
    setRecords((prev) => {
      const copy = { ...prev };
      delete copy[womanId];
      return copy;
    });

    await updateDoc(attRef, {
      [`records.${womanId}`]: deleteField(),
      updatedAt: serverTimestamp(),
    });
  }

  if (loading) return <div style={{ padding: 20 }}>تحميل...</div>;

  const total = women.length;
  const shown = filteredWomen.length;
  const presentCount = Object.keys(records || {}).length;

  return (
    <div dir="rtl" style={s.page}>
      <div style={s.container}>
        {/* Header card */}
        <div style={s.headerCard}>
          <div>
            <div style={s.badge}>تسجيل حضور</div>
            <h2 style={s.title}>اجتماع يوم الإثنين — {weekKey}</h2>
            <div style={s.subTitle}>سجّلي الحضور فقط، والباقي غياب تلقائيًا.</div>
          </div>

          <div style={s.statsRow}>
            <Stat label="حضور" value={presentCount} />
            <Stat label="الإجمالي" value={total} />
            <Stat label="المعروض" value={shown} />
          </div>
        </div>

        {/* Search card */}
        <div style={s.card}>
          <div style={s.searchRow}>
            <div style={{ flex: 1 }}>
              <label style={s.label}>بحث (بالاسم أو الرقم)</label>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="مثال: 101 أو منى"
                style={s.input}
              />
            </div>

            <button
              onClick={() => setSearch("")}
              style={s.secondaryBtn}
              disabled={!search}
            >
              مسح
            </button>
          </div>
        </div>

        {/* List */}
        <div style={{ ...s.card, marginTop: 12 }}>
          <div style={s.listHeader}>
            <div style={{ fontWeight: 900 }}>السيدة</div>
            <div style={{ fontWeight: 900, textAlign: "left" }}>الحالة</div>
            <div style={{ fontWeight: 900, textAlign: "left" }}>إجراء</div>
          </div>

          {shown === 0 ? (
            <div style={s.empty}>لا توجد نتائج مطابقة.</div>
          ) : (
            filteredWomen.map((w) => {
              const isPresent = !!records[w.id];

              return (
                <div
                  key={w.id}
                  style={{
                    ...s.row,
                    ...(isPresent ? s.rowPresent : {}),
                  }}
                >
                  {/* name */}
                  <div style={s.nameCell}>
                    <span style={s.codePill}>{w.code}</span>
                    <span style={s.nameText}>{w.name}</span>
                  </div>

                  {/* status */}
                  <div style={{ textAlign: "left" }}>
                    {isPresent ? (
                      <span style={s.badgePresent}>حاضر</span>
                    ) : (
                      <span style={s.badgeAbsent}>غير مسجل</span>
                    )}
                  </div>

                  {/* action */}
                  <div style={{ textAlign: "left" }}>
                    {!isPresent ? (
                      <button style={s.primaryBtn} onClick={() => markPresent(w.id)}>
                        تسجيل حضور
                      </button>
                    ) : (
                      <button style={s.dangerBtn} onClick={() => undoPresent(w.id)}>
                        إلغاء
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div style={s.note}>
          * أي اسم غير مسجّل حضور يعتبر غائب تلقائيًا.
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div style={s.stat}>
      <div style={s.statValue}>{value}</div>
      <div style={s.statLabel}>{label}</div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#f6f7fb",
    padding: 16,
  },
  container: {
    maxWidth: 1000,
    margin: "0 auto",
  },

  headerCard: {
    background: "white",
    border: "1px solid #e7e7e7",
    borderRadius: 18,
    padding: 16,
    boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
    alignItems: "flex-start",
  },
  badge: {
    display: "inline-block",
    padding: "6px 10px",
    borderRadius: 999,
    background: "#111827",
    color: "white",
    fontSize: 12,
    fontWeight: 900,
    marginBottom: 8,
  },
  title: {
    margin: 0,
    fontSize: 22,
    fontWeight: 900,
  },
  subTitle: {
    marginTop: 6,
    opacity: 0.7,
    fontSize: 13,
    lineHeight: 1.6,
  },

  statsRow: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },
  stat: {
    background: "#fafafa",
    border: "1px solid #eee",
    borderRadius: 14,
    padding: "10px 12px",
    minWidth: 110,
    textAlign: "center",
  },
  statValue: { fontSize: 18, fontWeight: 900 },
  statLabel: { fontSize: 12, opacity: 0.7, marginTop: 2 },

  card: {
    background: "white",
    border: "1px solid #e7e7e7",
    borderRadius: 18,
    padding: 14,
    boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
    marginTop: 12,
  },

  label: {
    display: "block",
    fontSize: 12,
    opacity: 0.75,
    marginBottom: 6,
    fontFamily: "cairo",
  },
  input: {
    width: "98%",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #ddd",
    outline: "none",
    fontSize: 14,
    fontFamily: "cairo",
  },
  searchRow: {
    display: "flex",
    gap: 10,
    alignItems: "flex-end",
    flexWrap: "wrap",
  },

  listHeader: {
    display: "grid",
    gridTemplateColumns: "1fr 140px 120px",
    gap: 10,
    padding: "10px 8px",
    borderBottom: "1px solid #eee",
    opacity: 0.85,
  },

  row: {
    display: "grid",
    gridTemplateColumns: "1fr 140px 120px",
    gap: 10,
    padding: "12px 8px",
    borderBottom: "1px solid #f1f1f1",
    alignItems: "center",
  },
  rowPresent: {
    background: "#ecfdf5",
    borderRadius: 12,
    margin: "6px 0",
    border: "1px solid #bbf7d0",
  },

  nameCell: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 15,
    fontWeight: 800,
  },
  codePill: {
    display: "inline-block",
    padding: "6px 10px",
    borderRadius: 999,
    background: "#111827",
    color: "white",
    fontSize: 12,
    fontWeight: 900,
    minWidth: 44,
    textAlign: "center",
  },
  nameText: { fontWeight: 900 },

  badgePresent: {
    display: "inline-block",
    padding: "6px 10px",
    borderRadius: 999,
    background: "#d1fae5",
    border: "1px solid #86efac",
    color: "#065f46",
    fontSize: 12,
    fontWeight: 900,
    fontFamily: "cairo",
  },
  badgeAbsent: {
    display: "inline-block",
    padding: "6px 10px",
    borderRadius: 999,
    background: "#f3f4f6",
    border: "1px solid #e5e7eb",
    color: "#374151",
    fontSize: 12,
    fontWeight: 900,
    fontFamily: "cairo",
  },

  primaryBtn: {
    padding: "8px 12px",
    borderRadius: 12,
    border: "none",
    cursor: "pointer",
    background: "#111827",
    color: "white",
    fontWeight: 900,
    fontFamily: "cairo",
  },
  dangerBtn: {
    padding: "8px 12px",
    borderRadius: 12,
    border: "1px solid #fecaca",
    cursor: "pointer",
    background: "#fee2e2",
    color: "#991b1b",
    fontWeight: 900,
    fontFamily: "cairo",
  },
  secondaryBtn: {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid #ddd",
    cursor: "pointer",
    background: "white",
    fontWeight: 900,
    fontFamily: "cairo",
  },

  empty: { padding: 14, opacity: 0.75 },
  note: { marginTop: 12, opacity: 0.7, fontSize: 13 },
};
