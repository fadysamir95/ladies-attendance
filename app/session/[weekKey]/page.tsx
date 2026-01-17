"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import ChurchLoader from "@/app/components/ChurchLoader";

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

// ------------------ Week helpers ------------------
const MEETING_DAY = 1; // Monday (0=Sun..6=Sat)

function toISODate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Monday of current week (00:00) based on "now"
function getWeekMonday(now = new Date()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const diffToMonday = (d.getDay() - MEETING_DAY + 7) % 7;
  d.setDate(d.getDate() - diffToMonday);
  return d;
}

function getDefaultWeekKey(now = new Date()) {
  return toISODate(getWeekMonday(now));
}

// ✅ options: current ± 2 weeks  => 5 weeks
function getWeekOptions(now = new Date()) {
  const monday = getWeekMonday(now);
  const keys: string[] = [];
  for (let offset = -2; offset <= 2; offset++) {
    const d = new Date(monday);
    d.setDate(d.getDate() + offset * 7);
    keys.push(toISODate(d));
  }
  return keys;
}

const PAGE_SIZE = 50;

// session cache keys
const WOMEN_CACHE_KEY = "women_active_cache_v1";

export default function SessionPage() {
  const params = useParams();
  const weekKeyFromUrl = (params.weekKey as string) || "";

  // week options (stable per mount)
  const weekOptions = useMemo(() => getWeekOptions(new Date()), []);

  // selected week
  const [selectedWeekKey, setSelectedWeekKey] = useState(() => {
    return weekKeyFromUrl || getDefaultWeekKey(new Date());
  });

  const [women, setWomen] = useState<Woman[]>([]);
  const [records, setRecords] = useState<Record<string, PresentRecord>>({});

  // split loaders: women + attendance
  const [loadingWomen, setLoadingWomen] = useState(true);
  const [loadingAtt, setLoadingAtt] = useState(true);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "present" | "absent">("all");
  const [page, setPage] = useState(1);

  const [error, setError] = useState<string | null>(null);

  // ✅ in-memory cache للـ attendance عشان الرجوع لنفس الأسبوع ما يعملش read جديد
  const attendanceCache = useRef<Record<string, Record<string, PresentRecord>>>({});

  const attRef = useMemo(() => doc(db, "attendance", selectedWeekKey), [selectedWeekKey]);

  // ✅ 1) Load women مرة واحدة فقط + sessionStorage cache
  useEffect(() => {
    async function loadWomenOnce() {
      try {
        setError(null);
        setLoadingWomen(true);

        // cache first
        try {
          const raw = sessionStorage.getItem(WOMEN_CACHE_KEY);
          if (raw) {
            const parsed = JSON.parse(raw) as Woman[];
            if (Array.isArray(parsed)) {
              setWomen(parsed);
              setLoadingWomen(false);
              return;
            }
          }
        } catch {}

        const qWomen = query(collection(db, "women"), where("active", "==", true));
        const womenSnap = await getDocs(qWomen);

        const list = womenSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Woman));
        list.sort((a, b) => (a.code ?? 0) - (b.code ?? 0));
        setWomen(list);

        try {
          sessionStorage.setItem(WOMEN_CACHE_KEY, JSON.stringify(list));
        } catch {}

        setLoadingWomen(false);
      } catch (e: any) {
        setLoadingWomen(false);
        setError(e?.message || "حدث خطأ أثناء تحميل السيدات");
      }
    }
    loadWomenOnce();
  }, []);

  // ✅ 2) Load attendance فقط عند تغيير selectedWeekKey
  useEffect(() => {
    let cancelled = false;

    async function loadAttendance() {
      try {
        setError(null);
        setLoadingAtt(true);

        // cache hit
        const cached = attendanceCache.current[selectedWeekKey];
        if (cached) {
          if (!cancelled) {
            setRecords(cached);
            setLoadingAtt(false);
          }
          return;
        }

        const snap = await getDoc(attRef);

        if (!snap.exists()) {
          // ⚠️ بدل setDoc الإجباري: حاول، ولو اترفض اعرض رسالة واضحة
          try {
            await setDoc(attRef, { records: {}, updatedAt: serverTimestamp() });
            const empty: Record<string, PresentRecord> = {};
            if (!cancelled) {
              setRecords(empty);
              attendanceCache.current[selectedWeekKey] = empty;
            }
          } catch (e: any) {
            // لو اليوزر مش مسموح له يكتب (rules)، اعرض رسالة
            throw new Error("لا تملك صلاحية إنشاء سجل حضور لهذا الأسبوع. تأكد من صلاحيات Firestore/Role.");
          }
        } else {
          const rec = (snap.data().records || {}) as Record<string, PresentRecord>;
          if (!cancelled) {
            setRecords(rec);
            attendanceCache.current[selectedWeekKey] = rec;
          }
        }

        if (!cancelled) setLoadingAtt(false);
      } catch (e: any) {
        if (!cancelled) {
          setLoadingAtt(false);
          setError(e?.message || "حدث خطأ أثناء تحميل الحضور");
        }
      }
    }

    loadAttendance();
    return () => {
      cancelled = true;
    };
  }, [selectedWeekKey, attRef]);

  // reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, selectedWeekKey]);

  const searchedWomen = useMemo(() => {
    const qName = normalizeArabic(search);
    const qNum = String(search || "").trim();

    if (!qName && !qNum) return women;

    return women.filter((w) => {
      const byName = qName ? normalizeArabic(w.name).includes(qName) : false;
      const byCode = qNum ? String(w.code ?? "").includes(qNum) : false;
      return byName || byCode;
    });
  }, [women, search]);

  const filteredWomen = useMemo(() => {
    if (statusFilter === "all") return searchedWomen;

    return searchedWomen.filter((w) => {
      const isPresent = !!records[w.id];
      if (statusFilter === "present") return isPresent;
      return !isPresent;
    });
  }, [searchedWomen, statusFilter, records]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(filteredWomen.length / PAGE_SIZE)), [filteredWomen.length]);
  const currentPage = Math.min(page, totalPages);

  const pageItems = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredWomen.slice(start, start + PAGE_SIZE);
  }, [filteredWomen, currentPage]);

  async function markPresent(womanId: string) {
    const now = new Date();

    // optimistic
    setRecords((prev) => {
      const next = { ...prev, [womanId]: { markedAt: now } };
      attendanceCache.current[selectedWeekKey] = next; // ✅ update cache
      return next;
    });

    await updateDoc(attRef, {
      [`records.${womanId}`]: { markedAt: now },
      updatedAt: serverTimestamp(),
    });
  }

  async function undoPresent(womanId: string) {
    setRecords((prev) => {
      const next = { ...prev };
      delete next[womanId];
      attendanceCache.current[selectedWeekKey] = next; // ✅ update cache
      return next;
    });

    await updateDoc(attRef, {
      [`records.${womanId}`]: deleteField(),
      updatedAt: serverTimestamp(),
    });
  }

  const loading = loadingWomen || loadingAtt;
  if (loading) return <ChurchLoader text="جاري التحميل  ..." />;

  if (error) {
    return (
      <div dir="rtl" style={{ padding: 16, maxWidth: 900, margin: "0 auto" }}>
        <div
          style={{
            background: "#fff1f2",
            border: "1px solid #fecaca",
            padding: 14,
            borderRadius: 14,
            fontFamily: "cairo",
          }}
        >
          <div style={{ fontWeight: 900, marginBottom: 8 }}>حدث خطأ</div>
          <div style={{ opacity: 0.85, marginBottom: 12 }}>{error}</div>

          <button
            type="button"
            onClick={() => {
              delete attendanceCache.current[selectedWeekKey];
              setLoadingAtt(true);
              setSelectedWeekKey((k) => k);
            }}
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid #ddd",
              background: "white",
              fontWeight: 900,
              cursor: "pointer",
              fontFamily: "cairo",
            }}
          >
            إعادة المحاولة
          </button>
        </div>
      </div>
    );
  }

  const total = women.length;
  const shown = pageItems.length;
  const presentCount = Object.keys(records || {}).length;

  return (
    <div dir="rtl" style={s.page}>
      <div style={s.container}>
        {/* Header card */}
        <div style={s.headerCard}>
          <div>
            <div style={s.badge}>تسجيل حضور</div>
            <h2 style={s.title}>اجتماع يوم الإثنين — {selectedWeekKey}</h2>
            <div style={s.subTitle}>سجّل الحضور فقط، والباقي يعتبر غياب بشكل تلقائي.</div>
          </div>

          <div style={s.statsRow}>
            <Stat label="الحضور" value={presentCount} />
            <Stat label="الإجمالي" value={total} />
            <Stat label="المعروض" value={shown} />
          </div>
        </div>

        {/* Week switcher */}
        <div style={s.card}>
          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ fontWeight: 900, fontFamily: "cairo" }}>اختيار الأسبوع:</div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {weekOptions.map((wk) => {
                const active = wk === selectedWeekKey;
                return (
                  <button
                    key={wk}
                    type="button"
                    onClick={() => setSelectedWeekKey(wk)}
                    style={{ ...s.chip, ...(active ? s.chipActive : {}) }}
                  >
                    {wk}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => setSelectedWeekKey(getDefaultWeekKey(new Date()))}
              style={s.btnGhostSmall}
            >
              رجوع للأسبوع الحالي
            </button>
          </div>

          <div style={{ marginTop: 6, opacity: 0.7, fontSize: 13, fontFamily: "cairo" }}>
            * يظهر: الأسبوع الحالي + أسبوعين قبل + أسبوعين بعد.
          </div>
        </div>

        {/* Search + filter */}
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

              <div style={s.filterRow}>
                <button
                  type="button"
                  onClick={() => setStatusFilter("all")}
                  style={{ ...s.chip, ...(statusFilter === "all" ? s.chipActive : {}) }}
                >
                  إظهار الكل
                </button>

                <button
                  type="button"
                  onClick={() => setStatusFilter("present")}
                  style={{ ...s.chip, ...(statusFilter === "present" ? s.chipActive : {}) }}
                >
                  إظهار الحاضرين فقط
                </button>

                <button
                  type="button"
                  onClick={() => setStatusFilter("absent")}
                  style={{ ...s.chip, ...(statusFilter === "absent" ? s.chipActive : {}) }}
                >
                  إظهار الغائبين فقط
                </button>
              </div>
            </div>

            <button onClick={() => setSearch("")} style={s.secondaryBtn} disabled={!search} type="button">
              مسح
            </button>
          </div>
        </div>

        {/* Pagination top */}
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onFirst={() => setPage(1)}
          onPrev={() => setPage((p) => Math.max(1, p - 1))}
          onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
          onLast={() => setPage(totalPages)}
          onGo={(p) => setPage(p)}
        />

        {/* List */}
        <div style={{ ...s.card, marginTop: 12 }}>
          <div style={s.listHeader} className="sessionListHeader">
            <div style={{ fontWeight: 900 }}>السيدة</div>
            <div style={{ fontWeight: 900, textAlign: "left" }}>الحالة</div>
            <div style={{ fontWeight: 900, textAlign: "left" }}>إجراء</div>
          </div>

          {shown === 0 ? (
            <div style={s.empty}>لا توجد نتائج مطابقة.</div>
          ) : (
            pageItems.map((w) => {
              const isPresent = !!records[w.id];

              return (
                <div
                  key={w.id}
                  className={`sessionRow ${isPresent ? "present" : ""}`}
                  style={{
                    ...s.row,
                    ...(isPresent ? s.rowPresent : {}),
                  }}
                >
                  <div style={s.nameCell}>
                    <span style={s.codePill}>{w.code}</span>
                    <span style={s.nameText}>{w.name}</span>
                  </div>

                  <div style={{ textAlign: "left" }}>
                    {isPresent ? <span style={s.badgePresent}>حاضر</span> : <span style={s.badgeAbsent}>غير مسجل</span>}
                  </div>

                  <div style={{ textAlign: "left" }}>
                    {!isPresent ? (
                      <button style={s.primaryBtn} onClick={() => markPresent(w.id)} type="button">
                        تسجيل حضور
                      </button>
                    ) : (
                      <button style={s.dangerBtn} onClick={() => undoPresent(w.id)} type="button">
                        إلغاء
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Pagination bottom */}
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onFirst={() => setPage(1)}
          onPrev={() => setPage((p) => Math.max(1, p - 1))}
          onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
          onLast={() => setPage(totalPages)}
          onGo={(p) => setPage(p)}
        />

        <div style={s.note}>* أي اسم غير مسجّل حضور يعتبر غائب تلقائيًا.</div>
      </div>
    </div>
  );
}

function getPageNumbers(current: number, total: number) {
  const delta = 2;
  const range: number[] = [];
  const start = Math.max(1, current - delta);
  const end = Math.min(total, current + delta);

  for (let i = start; i <= end; i++) range.push(i);
  if (!range.includes(1)) range.unshift(1);
  if (!range.includes(total)) range.push(total);

  return Array.from(new Set(range));
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div style={s.stat}>
      <div style={s.statValue}>{value}</div>
      <div style={s.statLabel}>{label}</div>
    </div>
  );
}

function Pagination({
  currentPage,
  totalPages,
  onFirst,
  onPrev,
  onNext,
  onLast,
  onGo,
}: {
  currentPage: number;
  totalPages: number;
  onFirst: () => void;
  onPrev: () => void;
  onNext: () => void;
  onLast: () => void;
  onGo: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  const pages = getPageNumbers(currentPage, totalPages);

  return (
    <div style={s.paginationRow}>
      <div style={s.paginationLeft}>
        <button style={s.pageBtn} onClick={onFirst} disabled={currentPage <= 1} type="button">
          « الأول
        </button>
        <button style={s.pageBtn} onClick={onPrev} disabled={currentPage <= 1} type="button">
          السابق
        </button>
      </div>

      <div style={s.pages}>
        {pages.map((p) => (
          <button
            key={p}
            style={{ ...s.pageNumber, ...(p === currentPage ? s.pageNumberActive : {}) }}
            onClick={() => onGo(p)}
            type="button"
          >
            {p}
          </button>
        ))}
      </div>

      <div style={s.paginationRight}>
        <button style={s.pageBtn} onClick={onNext} disabled={currentPage >= totalPages} type="button">
          التالي
        </button>
        <button style={s.pageBtn} onClick={onLast} disabled={currentPage >= totalPages} type="button">
          الأخير »
        </button>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: "#f6f7fb", padding: 16 },
  container: { maxWidth: 1100, margin: "0 auto" },

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
    fontFamily: "cairo",
  },
  title: { margin: 0, fontSize: 22, fontWeight: 900, fontFamily: "cairo" },
  subTitle: { marginTop: 6, opacity: 0.7, fontSize: 13, lineHeight: 1.6, fontFamily: "cairo" },

  statsRow: { display: "flex", gap: 10, flexWrap: "wrap" },
  stat: {
    background: "#fafafa",
    border: "1px solid #eee",
    borderRadius: 14,
    padding: "10px 12px",
    minWidth: 110,
    textAlign: "center",
    fontFamily: "cairo",
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

  label: { display: "block", fontSize: 12, opacity: 0.75, marginBottom: 6, fontFamily: "cairo" },
  input: {
    width: "85%",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #ddd",
    outline: "none",
    fontSize: 14,
    fontFamily: "cairo",
  },
  searchRow: { display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" },

  listHeader: {
    display: "grid",
    gridTemplateColumns: "1fr 140px 120px",
    gap: 10,
    padding: "10px 8px",
    borderBottom: "1px solid #eee",
    opacity: 0.85,
    fontFamily: "cairo",
  },

  row: {
    display: "grid",
    gridTemplateColumns: "1fr 140px 120px",
    gap: 10,
    padding: "12px 8px",
    borderBottom: "1px solid #f1f1f1",
    alignItems: "center",
    fontFamily: "cairo",
  },
  rowPresent: { background: "#ecfdf5", borderRadius: 12, margin: "6px 0", border: "1px solid #bbf7d0" },

  nameCell: { display: "flex", alignItems: "center", gap: 10, fontSize: 15, fontWeight: 800 },
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

  empty: { padding: 14, opacity: 0.75, fontFamily: "cairo" },
  note: { marginTop: 12, opacity: 0.7, fontSize: 13, fontFamily: "cairo" },

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

  filterRow: { marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" },
  chip: {
    padding: "8px 12px",
    borderRadius: 999,
    border: "1px solid #e5e7eb",
    background: "white",
    cursor: "pointer",
    fontWeight: 900,
    fontFamily: "cairo",
  },
  chipActive: { background: "#111827", color: "white", border: "1px solid #111827" },

  btnGhostSmall: {
    padding: "8px 12px",
    borderRadius: 12,
    border: "1px solid #e5e7eb",
    background: "white",
    cursor: "pointer",
    fontWeight: 900,
    fontFamily: "cairo",
  },

  paginationLeft: { display: "flex", gap: 8, flexWrap: "wrap" },
  paginationRight: { display: "flex", gap: 8, flexWrap: "wrap" },

  pages: { display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" },

  pageNumber: {
    minWidth: 38,
    height: 38,
    padding: "0 10px",
    borderRadius: 12,
    border: "1px solid #e5e7eb",
    background: "white",
    cursor: "pointer",
    fontWeight: 900,
    fontFamily: "cairo",
  },
  pageNumberActive: { background: "#111827", color: "white", border: "1px solid #111827" },
};
