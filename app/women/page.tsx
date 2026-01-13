"use client";

import { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

type Woman = {
  id: string;
  code: number;
  name: string;
  active: boolean;
  createdAt?: any;
};

type CsvRow = {
  code?: string | number;
  name?: string;
  active?: string | boolean;
};

function normalizeArabic(s: string) {
  return s
    .trim()
    .toLowerCase()
    .replace(/[إأآا]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه");
}

function parseCode(v: unknown): number | null {
  const n = Number(String(v ?? "").trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

export default function WomenPage() {
  const [women, setWomen] = useState<Woman[]>([]);
  const [loading, setLoading] = useState(true);

  // add
  const [code, setCode] = useState<string>("");
  const [name, setName] = useState<string>("");

  // search/filter
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("all");

  // edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCode, setEditCode] = useState<string>("");
  const [editName, setEditName] = useState<string>("");

  // pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // import CSV
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [importLog, setImportLog] = useState("");

  async function load() {
    setLoading(true);
    // لو كل اللي عندك عليه code هتستفيد من orderBy("code")
    // لو عندك بيانات قديمة بدون code ممكن يسبب مشاكل → ساعتها نرتب محليًا فقط
    const q = query(collection(db, "women"), orderBy("code", "asc"));
    const snap = await getDocs(q);
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Woman));
    // ترتيب احتياطي محلي
    list.sort((a, b) => (a.code ?? 0) - (b.code ?? 0));
    setWomen(list);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const stats = useMemo(() => {
    const total = women.length;
    const active = women.filter((w) => w.active).length;
    const inactive = total - active;
    return { total, active, inactive };
  }, [women]);

  const filtered = useMemo(() => {
    const q = normalizeArabic(search);
    const qNum = String(search || "").trim(); // للبحث بالرقم

    let list = women;

    if (filter === "active") list = list.filter((w) => w.active);
    if (filter === "inactive") list = list.filter((w) => !w.active);

    if (!q && !qNum) return list;

    return list.filter((w) => {
      const byName = q ? normalizeArabic(w.name).includes(q) : false;
      const byCode = qNum ? String(w.code ?? "").includes(qNum) : false;
      return byName || byCode;
    });
  }, [women, search, filter]);

  useEffect(() => {
    setPage(1);
  }, [search, filter, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);

  const pageItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage, pageSize]);

  async function addWoman(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const c = parseCode(code);
    const nm = name.trim();
    if (!c) return alert("من فضلك أدخل رقم صحيح (أكبر من صفر).");
    if (!nm) return alert("من فضلك أدخل الاسم.");

    // منع تكرار الرقم (محليًا)
    if (women.some((w) => w.code === c)) {
      return alert("هذا الرقم مستخدم بالفعل. اختر رقمًا آخر.");
    }

    await addDoc(collection(db, "women"), {
      code: c,
      name: nm,
      active: true,
      createdAt: serverTimestamp(),
    });

    setCode("");
    setName("");
    await load();
  }

  async function toggleActive(w: Woman) {
    await updateDoc(doc(db, "women", w.id), { active: !w.active });
    await load();
  }

  function startEdit(w: Woman) {
    setEditingId(w.id);
    setEditCode(String(w.code ?? ""));
    setEditName(w.name);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditCode("");
    setEditName("");
  }

  async function saveEdit(w: Woman) {
    const c = parseCode(editCode);
    const nm = editName.trim();
    if (!c) return alert("من فضلك أدخل رقم صحيح.");
    if (!nm) return alert("من فضلك أدخل الاسم.");

    if (women.some((x) => x.id !== w.id && x.code === c)) {
      return alert("هذا الرقم مستخدم بالفعل. اختر رقمًا آخر.");
    }

    await updateDoc(doc(db, "women", w.id), { code: c, name: nm });
    cancelEdit();
    await load();
  }

  async function deleteWoman(w: Woman) {
    const ok = confirm(`هل تريد حذف "${w.name}" (رقم ${w.code}) نهائيًا؟`);
    if (!ok) return;

    await deleteDoc(doc(db, "women", w.id));
    await load();
  }

  async function importCsv() {
    if (!csvFile) return setImportLog("اختر ملف CSV أولًا");

    setImportLog("جاري قراءة الملف...");

    Papa.parse<CsvRow>(csvFile, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const rows = results.data || [];

          // الموجود حاليًا لمنع تكرار الأكواد
          const existingCodes = new Set(women.map((w) => w.code));

          const cleaned = rows
            .map((r) => {
              const c = parseCode(r.code);
              const nm = (r.name || "").trim();
              const active =
                typeof r.active === "boolean"
                  ? r.active
                  : String(r.active ?? "true").toLowerCase() === "true";
              return { code: c, name: nm, active };
            })
            .filter((r) => r.code && r.name.length > 0) as Array<{
            code: number;
            name: string;
            active: boolean;
          }>;

          const toAdd: Array<{ code: number; name: string; active: boolean }> = [];
          const seenInFile = new Set<number>();

          for (const r of cleaned) {
            if (existingCodes.has(r.code)) continue;
            if (seenInFile.has(r.code)) continue;
            seenInFile.add(r.code);
            toAdd.push(r);
          }

          if (toAdd.length === 0) {
            setImportLog("لا يوجد بيانات جديدة (كل الأكواد موجودة بالفعل أو مكررة).");
            return;
          }

          setImportLog(`تم تجهيز ${toAdd.length} صف. جاري الرفع...`);

          const batch = writeBatch(db);
          const colRef = collection(db, "women");

          for (const w of toAdd) {
            const ref = doc(colRef);
            batch.set(ref, {
              code: w.code,
              name: w.name,
              active: w.active,
              createdAt: serverTimestamp(),
            });
          }

          await batch.commit();

          setImportLog(`✅ تم استيراد ${toAdd.length} سيدة بنجاح.`);
          setCsvFile(null);
          await load();
        } catch (e: any) {
          setImportLog("❌ خطأ أثناء الاستيراد: " + (e?.message || "unknown"));
        }
      },
      error: (err) => setImportLog("❌ خطأ في قراءة CSV: " + err.message),
    });
  }

  return (
    <div dir="rtl" style={styles.page}>
      <div style={styles.container}>
        <div style={styles.header}>
          <div>
            <h1 style={styles.title}>ادارة السيدات</h1>
            <p style={styles.subTitle}>
             كنيسة الشهيد العظيم مارجرجش بالجيوشي - شبرا مصر
            </p>
          </div>

          <div style={styles.statsRow}>
            <Stat label="الإجمالي" value={stats.total} />
            <Stat label="نشط" value={stats.active} />
            <Stat label="معطّل" value={stats.inactive} />
          </div>
        </div>

        {/* Add + Import Row */}
        <div className="womenTopRow" style={{ display: "flex", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
          
          <div style={{ ...styles.card, flex: 1, minWidth: 320 }}>
            <div style={styles.sectionTitle}>إضافة سيدة</div>

            <form onSubmit={addWoman} style={{ ...styles.addRow, marginTop: 10 }}>
              <div style={{ width: "48%" }}>
                <label style={styles.label}>الرقم</label>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="مثال: 101"
                  style={styles.input}
                  inputMode="numeric"
                />
              </div>

              <div style={{ width: "48%" }}>
                <label style={styles.label}>اسم السيدة</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="اكتب الاسم ثم اضغط إضافة"
                  style={styles.input}
                />
              </div>

              <button type="submit" style={styles.primaryBtn}>
                إضافة
              </button>
            </form>
          </div>

          {/* استيراد CSV */}
          <div style={{ ...styles.card, flex: 1, minWidth: 320 }}>
            <div style={styles.sectionTitle}>استيراد من CSV</div>
            <div style={{ opacity: 0.75, fontSize: 13, marginTop: 4 }}>
              يجب أن يحتوي الملف على عمود <b>code</b> وعمود <b>name</b>
            </div>

            <div style={styles.importRow}>
              <input
                type="file"
                accept=".csv"
                onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
              />

              <button
                onClick={importCsv}
                style={styles.primaryBtn}
                disabled={!csvFile}
                type="button"
              >
                استيراد
              </button>

              <button
                onClick={() => {
                  setCsvFile(null);
                  setImportLog("");
                }}
                style={styles.secondaryBtn}
                type="button"
              >
                مسح
              </button>
            </div>

            {importLog && <pre style={styles.logBox}>{importLog}</pre>}
          </div>

        </div>

        {/* Search + Filters */}
        <div style={{ ...styles.card, marginTop: 12 }}>
          <div className="womenToolsRow" style={styles.toolsRow}>
            <div style={{ flex: 1 }}>
              <label style={styles.label}>بحث (اسم أو رقم)</label>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="مثال: 101 أو منى"
                style={styles.input}
              />
            </div>

            <div style={{ minWidth: 260 }}>
              <label style={styles.label}>عرض</label>
              <div style={styles.chips}>
                <Chip active={filter === "all"} onClick={() => setFilter("all")} text="الكل" />
                <Chip active={filter === "active"} onClick={() => setFilter("active")} text="نشط" />
                <Chip active={filter === "inactive"} onClick={() => setFilter("inactive")} text="معطّل" />
              </div>
            </div>

            <div style={{ minWidth: 140 }}>
              <label style={styles.label}>لكل صفحة</label>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                style={styles.select}
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>

            <button
              onClick={() => {
                setSearch("");
                setFilter("all");
              }}
              style={styles.secondaryBtn}
              type="button"
            >
              مسح
            </button>
          </div>

          <div style={styles.smallNote}>
            النتائج: <b>{filtered.length}</b> | الصفحة: <b>{currentPage}</b> / <b>{totalPages}</b>
          </div>

          <div style={styles.pagination}>
            <button
              type="button"
              style={styles.pageBtn}
              disabled={currentPage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              السابق
            </button>

            <button
              type="button"
              style={styles.pageBtn}
              disabled={currentPage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              التالي
            </button>
          </div>
        </div>

        {/* List */}
        <div style={{ ...styles.card, marginTop: 12 }}>
          <div className="womenListHeader" style={styles.listHeader}>
            <div style={{ fontWeight: 800 }}>الرقم</div>
            <div style={{ fontWeight: 800 }}>الاسم</div>
            <div style={{ fontWeight: 800 }}>الحالة</div>
            <div style={{ fontWeight: 800 }}>إجراءات</div>
          </div>

          {loading ? (
            <div style={styles.loading}>Loading...</div>
          ) : pageItems.length === 0 ? (
            <div style={styles.empty}>لا توجد نتائج.</div>
          ) : (
            pageItems.map((w) => {
              const isEditing = editingId === w.id;

              return (
                <div key={w.id} className="womenRow" style={styles.row}>
                  {/* code */}
                  <div style={styles.codeCell}>
                    {!isEditing ? (
                      <span>{w.code}</span>
                    ) : (
                      <input
                        value={editCode}
                        onChange={(e) => setEditCode(e.target.value)}
                        style={styles.inlineInput}
                        inputMode="numeric"
                      />
                    )}
                  </div>

                  {/* name */}
                  <div style={styles.nameCell}>
                    {!isEditing ? (
                      <span>{w.name}</span>
                    ) : (
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        style={styles.inlineInput}
                      />
                    )}
                  </div>

                  {/* status */}
                  <div>
                    {w.active ? (
                      <span style={styles.badgeActive}>نشط</span>
                    ) : (
                      <span style={styles.badgeInactive}>معطّل</span>
                    )}
                  </div>

                  {/* actions */}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {!isEditing ? (
                      <>
                        <button type="button" onClick={() => startEdit(w)} style={styles.secondaryBtnSmall}>
                          تعديل
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleActive(w)}
                          style={w.active ? styles.dangerBtn : styles.primaryBtnSmall}
                        >
                          {w.active ? "تعطيل" : "تفعيل"}
                        </button>
                        <button type="button" onClick={() => deleteWoman(w)} style={styles.deleteBtn}>
                          حذف
                        </button>
                      </>
                    ) : (
                      <>
                        <button type="button" onClick={() => saveEdit(w)} style={styles.primaryBtnSmall}>
                          حفظ
                        </button>
                        <button type="button" onClick={cancelEdit} style={styles.secondaryBtnSmall}>
                          إلغاء
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div style={styles.stat}>
      <div style={styles.statValue}>{value}</div>
      <div style={styles.statLabel}>{label}</div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  text,
}: {
  active: boolean;
  onClick: () => void;
  text: string;
}) {
  return (
    <button type="button" onClick={onClick} style={{ ...styles.chip, ...(active ? styles.chipActive : {}) }}>
      {text}
    </button>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: "#f6f7fb", padding: 16 },
  container: { maxWidth: 1100, margin: "0 auto" },

  header: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
    flexWrap: "wrap",
    marginBottom: 12,
  },
  title: { margin: 0, fontSize: 28 },
  subTitle: { margin: "6px 0 0", opacity: 0.7 },

  statsRow: { display: "flex", gap: 10, flexWrap: "wrap" },
  stat: {
    background: "white",
    border: "1px solid #e7e7e7",
    borderRadius: 14,
    padding: "10px 12px",
    minWidth: 110,
    textAlign: "center",
    boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
  },
  statValue: { fontSize: 20, fontWeight: 800 },
  statLabel: { fontSize: 12, opacity: 0.7, marginTop: 2 },

  card: {
    background: "white",
    border: "1px solid #e7e7e7",
    borderRadius: 16,
    padding: 14,
    boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
  },

  sectionTitle: { fontWeight: 900, fontSize: 16 },

  label: { display: "block", fontSize: 12, opacity: 0.75, marginBottom: 6 },

  input: {
    width: "90%",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #ddd",
    outline: "none",
    fontSize: 14,
    fontFamily: "cairo",
  },

  inlineInput: {
    width: "100%",
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid #ddd",
    outline: "none",
    fontSize: 14,
    fontFamily: "cairo",
  },

  select: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #ddd",
    background: "white",
    fontSize: 14,
    fontFamily: "cairo",
  },

  addRow: { display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" },
  toolsRow: { display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" },
  importRow: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 10 },

  logBox: {
    marginTop: 10,
    background: "#f6f6f6",
    padding: 12,
    borderRadius: 12,
    border: "1px solid #eee",
    whiteSpace: "pre-wrap",
  },

  primaryBtn: {
    padding: "10px 14px",
    borderRadius: 12,
    border: "none",
    cursor: "pointer",
    background: "#128026",
    color: "white",
    fontWeight: 800,
    fontFamily: "cairo",
  },
  primaryBtnSmall: {
    padding: "8px 12px",
    borderRadius: 12,
    border: "none",
    cursor: "pointer",
    background: "#111827",
    color: "white",
    fontWeight: 800,
    fontFamily: "cairo",
  },
  secondaryBtn: {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid #ddd",
    cursor: "pointer",
    background: "white",
    fontWeight: 800,
    fontFamily: "cairo",
  },
  secondaryBtnSmall: {
    padding: "8px 12px",
    borderRadius: 12,
    border: "1px solid #ddd",
    cursor: "pointer",
    background: "white",
    fontWeight: 800,
    fontFamily: "cairo",
  },
  dangerBtn: {
    padding: "8px 12px",
    borderRadius: 12,
    border: "1px solid #f3c5c5",
    cursor: "pointer",
    background: "#fff1f1",
    color: "#b91c1c",
    fontWeight: 900,
    fontFamily: "cairo",
  },
  deleteBtn: {
    padding: "8px 12px",
    borderRadius: 12,
    border: "1px solid #fecaca",
    cursor: "pointer",
    background: "#fee2e2",
    color: "#991b1b",
    fontWeight: 900,
    fontFamily: "cairo",
  },

  chips: { display: "flex", gap: 8, flexWrap: "wrap" },
  chip: {
    padding: "8px 10px",
    borderRadius: 999,
    border: "1px solid #ddd",
    background: "white",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 900,
    fontFamily: "cairo",
  },
  chipActive: { background: "#111827", color: "white", border: "1px solid #111827" },

  smallNote: { marginTop: 10, opacity: 0.75, fontSize: 13 },

  pagination: { marginTop: 10, display: "flex", gap: 8 },
  pageBtn: {
    padding: "8px 12px",
    borderRadius: 12,
    border: "1px solid #ddd",
    background: "white",
    cursor: "pointer",
    fontWeight: 900,
    fontFamily: "cairo",
  },

  listHeader: {
    display: "grid",
    gridTemplateColumns: "120px 1fr 120px 320px",
    gap: 10,
    padding: "10px 8px",
    borderBottom: "1px solid #eee",
    opacity: 0.85,
  },

  row: {
    display: "grid",
    gridTemplateColumns: "120px 1fr 120px 320px",
    gap: 10,
    padding: "12px 8px",
    borderBottom: "1px solid #f1f1f1",
    alignItems: "center",
  },

  codeCell: { fontSize: 15, fontWeight: 900 },
  nameCell: { fontSize: 15, fontWeight: 700 },

  badgeActive: {
    display: "inline-block",
    padding: "6px 10px",
    borderRadius: 999,
    background: "#ecfdf5",
    color: "#047857",
    border: "1px solid #bbf7d0",
    fontSize: 12,
    fontWeight: 900,
  },
  badgeInactive: {
    display: "inline-block",
    padding: "6px 10px",
    borderRadius: 999,
    background: "#f3f4f6",
    color: "#374151",
    border: "1px solid #e5e7eb",
    fontSize: 12,
    fontWeight: 900,
  },

  loading: { padding: 16, opacity: 0.7 },
  empty: { padding: 16, opacity: 0.7 },
};
