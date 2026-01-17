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
  where,
  limit,
} from "firebase/firestore";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import { db, auth } from "@/lib/firebase";
import ChurchLoader from "@/app/components/ChurchLoader";

type Role = "admin" | "reports_viewer";

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

function downloadTextFile(filename: string, content: string, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function WomenPage() {
  const [women, setWomen] = useState<Woman[]>([]);
  const [loading, setLoading] = useState(true);

  // auth/role
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [role, setRole] = useState<Role>("reports_viewer");
  const isReadOnly = role === "reports_viewer";
  const [roleLoading, setRoleLoading] = useState(true);

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

  // errors + retry
  const [error, setError] = useState<string>("");

  // ------------------- load role -------------------
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setRoleLoading(true);

      try {
        if (!u?.email) {
          setRole("admin");
          return;
        }

        const cacheKey = `role:${u.email}`;
        const cached = localStorage.getItem(cacheKey) as Role | null;
        if (cached === "admin" || cached === "reports_viewer") {
          setRole(cached);
          return;
        }

        const qRole = query(
          collection(db, "users"),
          where("email", "==", u.email),
          limit(1)
        );

        const snap = await getDocs(qRole);
        const r = (snap.docs[0]?.data()?.role as Role) || "admin";
        setRole(r);
        localStorage.setItem(cacheKey, r);
      } catch {
        setRole("admin");
      } finally {
        setRoleLoading(false);
      }
    });

    return () => unsub();
  }, []);

  // ------------------- load women -------------------
  async function loadWomen() {
    setError("");
    setLoading(true);

    try {
      const q = query(collection(db, "women"), orderBy("code", "asc"));
      const snap = await getDocs(q);
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Woman));
      list.sort((a, b) => (a.code ?? 0) - (b.code ?? 0));
      setWomen(list);
    } catch (e: any) {
      setError(e?.message || "حدث خطأ أثناء تحميل البيانات من Firestore.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadWomen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ------------------- computed -------------------
  const stats = useMemo(() => {
    const total = women.length;
    const active = women.filter((w) => w.active).length;
    const inactive = total - active;
    return { total, active, inactive };
  }, [women]);

  const gaps = useMemo(() => {
    const codes = women
      .map((w) => Number(w.code))
      .filter((n) => Number.isFinite(n) && n > 0)
      .sort((a, b) => a - b);

    if (codes.length === 0) {
      return {
        first: null as number | null,
        last: null as number | null,
        missing: [] as number[],
        ranges: [] as Array<{ from: number; to: number }>,
      };
    }

    const first = codes[0];
    const last = codes[codes.length - 1];
    const set = new Set(codes);

    const missing: number[] = [];
    for (let n = first; n <= last; n++) if (!set.has(n)) missing.push(n);

    const ranges: Array<{ from: number; to: number }> = [];
    for (let i = 0; i < missing.length; i++) {
      const start = missing[i];
      let end = start;
      while (i + 1 < missing.length && missing[i + 1] === end + 1) {
        i++;
        end = missing[i];
      }
      ranges.push({ from: start, to: end });
    }

    return { first, last, missing, ranges };
  }, [women]);

  const filtered = useMemo(() => {
    const q = normalizeArabic(search);
    const qNum = String(search || "").trim();

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

  function buildPageItems(current: number, total: number) {
    const items: Array<number | "..."> = [];
    if (total <= 7) {
      for (let i = 1; i <= total; i++) items.push(i);
      return items;
    }

    items.push(1);

    const left = Math.max(2, current - 2);
    const right = Math.min(total - 1, current + 2);

    if (left > 2) items.push("...");

    for (let i = left; i <= right; i++) items.push(i);

    if (right < total - 1) items.push("...");

    items.push(total);
    return items;
  }

  const pageButtons = useMemo(
    () => buildPageItems(currentPage, totalPages),
    [currentPage, totalPages]
  );

  const pageItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage, pageSize]);

  // ------------------- actions (no reload to reduce reads) -------------------
  async function addWoman(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isReadOnly) return alert("ليس لديك صلاحية للتعديل.");

    const c = parseCode(code);
    const nm = name.trim();
    if (!c) return alert("من فضلك أدخل رقم صحيح (أكبر من صفر).");
    if (!nm) return alert("من فضلك أدخل الاسم.");

    if (women.some((w) => w.code === c)) {
      return alert("هذا الرقم مستخدم بالفعل. اختر رقمًا آخر.");
    }

    try {
      const ref = await addDoc(collection(db, "women"), {
        code: c,
        name: nm,
        active: true,
        createdAt: serverTimestamp(),
      });

      setWomen((prev) => {
        const next = [...prev, { id: ref.id, code: c, name: nm, active: true }];
        next.sort((a, b) => (a.code ?? 0) - (b.code ?? 0));
        return next;
      });

      setCode("");
      setName("");
    } catch (e: any) {
      alert("❌ حدث خطأ أثناء الإضافة: " + (e?.message || "unknown"));
    }
  }

  async function toggleActive(w: Woman) {
    if (isReadOnly) return alert("ليس لديك صلاحية للتعديل.");

    const nextActive = !w.active;

    // optimistic
    setWomen((prev) =>
      prev.map((x) => (x.id === w.id ? { ...x, active: nextActive } : x))
    );

    try {
      await updateDoc(doc(db, "women", w.id), { active: nextActive });
    } catch (e: any) {
      // rollback
      setWomen((prev) =>
        prev.map((x) => (x.id === w.id ? { ...x, active: w.active } : x))
      );
      alert("❌ خطأ أثناء التحديث: " + (e?.message || "unknown"));
    }
  }

  function startEdit(w: Woman) {
    if (isReadOnly) return alert("ليس لديك صلاحية للتعديل.");
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
    if (isReadOnly) return alert("ليس لديك صلاحية للتعديل.");

    const c = parseCode(editCode);
    const nm = editName.trim();
    if (!c) return alert("من فضلك أدخل رقم صحيح.");
    if (!nm) return alert("من فضلك أدخل الاسم.");

    if (women.some((x) => x.id !== w.id && x.code === c)) {
      return alert("هذا الرقم مستخدم بالفعل. اختر رقمًا آخر.");
    }

    const old = w;

    // optimistic
    setWomen((prev) => {
      const next = prev.map((x) => (x.id === w.id ? { ...x, code: c, name: nm } : x));
      next.sort((a, b) => (a.code ?? 0) - (b.code ?? 0));
      return next;
    });

    try {
      await updateDoc(doc(db, "women", w.id), { code: c, name: nm });
      cancelEdit();
    } catch (e: any) {
      // rollback
      setWomen((prev) => {
        const next = prev.map((x) => (x.id === w.id ? old : x));
        next.sort((a, b) => (a.code ?? 0) - (b.code ?? 0));
        return next;
      });
      alert("❌ خطأ أثناء الحفظ: " + (e?.message || "unknown"));
    }
  }

  async function deleteWoman(w: Woman) {
    if (isReadOnly) return alert("ليس لديك صلاحية للتعديل.");

    const ok = confirm(`هل تريد حذف "${w.name}" (رقم ${w.code}) نهائيًا؟`);
    if (!ok) return;

    // optimistic
    setWomen((prev) => prev.filter((x) => x.id !== w.id));

    try {
      await deleteDoc(doc(db, "women", w.id));
    } catch (e: any) {
      // rollback
      setWomen((prev) => {
        const next = [...prev, w];
        next.sort((a, b) => (a.code ?? 0) - (b.code ?? 0));
        return next;
      });
      alert("❌ خطأ أثناء الحذف: " + (e?.message || "unknown"));
    }
  }

  async function importCsv() {
    if (isReadOnly) return alert("ليس لديك صلاحية للتعديل.");
    if (!csvFile) return setImportLog("اختر ملف CSV أولًا");

    setImportLog("جاري قراءة الملف...");

    Papa.parse<CsvRow>(csvFile, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const rows = results.data || [];
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

          // هنجهز عناصر محلية نضيفها بعد commit (بدون reload)
          const localAdded: Woman[] = [];

          for (const w of toAdd) {
            const ref = doc(colRef);
            batch.set(ref, {
              code: w.code,
              name: w.name,
              active: w.active,
              createdAt: serverTimestamp(),
            });
            localAdded.push({ id: ref.id, code: w.code, name: w.name, active: w.active });
          }

          await batch.commit();

          setWomen((prev) => {
            const next = [...prev, ...localAdded];
            next.sort((a, b) => (a.code ?? 0) - (b.code ?? 0));
            return next;
          });

          setImportLog(`✅ تم استيراد ${toAdd.length} سيدة بنجاح.`);
          setCsvFile(null);
        } catch (e: any) {
          setImportLog("❌ خطأ أثناء الاستيراد: " + (e?.message || "unknown"));
        }
      },
      error: (err) => setImportLog("❌ خطأ في قراءة CSV: " + err.message),
    });
  }

  function exportCsv() {
    const rows = filtered.map((w) => ({
      code: w.code,
      name: w.name,
      active: w.active ? "true" : "false",
    }));

    const csv = Papa.unparse(rows, { quotes: false });
    const filename = `women_export_${new Date().toISOString().slice(0, 10)}.csv`;
    downloadTextFile(filename, csv, "text/csv;charset=utf-8");
  }

  // ------------------- UI states -------------------
  if (roleLoading) return <ChurchLoader text="جاري التحقق من صلاحيات المستخدم..." />;
  if (loading) return <ChurchLoader text="جاري تحميل السيدات ..." />;

  if (error) {
    return (
      <div dir="rtl" style={styles.page}>
        <div style={{ ...styles.card, maxWidth: 900, margin: "24px auto" }}>
          <h2 style={{ margin: 0, fontFamily: "cairo" }}>حدث خطأ أثناء التحميل</h2>
          <p style={{ opacity: 0.8, marginTop: 10, whiteSpace: "pre-wrap", fontFamily: "cairo" }}>
            {error}
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
            <button type="button" style={styles.primaryBtn} onClick={loadWomen}>
              إعادة المحاولة
            </button>
            <button
              type="button"
              style={styles.secondaryBtn}
              onClick={() => {
                setError("");
                setLoading(false);
              }}
            >
              إغلاق
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div dir="rtl" style={styles.page}>
      <div style={styles.container}>
        <div style={styles.header}>
          <div>
            <h1 style={styles.title}>ادارة السيدات</h1>
            <p style={styles.subTitle}>كنيسة الشهيد العظيم مارجرجس الجيوشي - شبرا مصر</p>

            <div style={{ marginTop: 8, opacity: 0.75, fontFamily: "cairo" }}>
              المستخدم: <b>{user?.email || "غير معروف"}</b> | الدور:{" "}
              <b>{role === "reports_viewer" ? "مشاهدة تقارير فقط" : "مسؤول"}</b>
            </div>

            {isReadOnly && (
              <div style={{ marginTop: 8, ...styles.readOnlyNote }}>
                ⚠️ أنت في وضع “قراءة فقط” — لا يمكنك الإضافة أو التعديل أو الحذف.
              </div>
            )}
          </div>

          <div style={styles.statsRow}>
            <Stat label="الإجمالي" value={stats.total} />
            <Stat label="نشط" value={stats.active} />
            <Stat label="معطّل" value={stats.inactive} />
          </div>
        </div>

        {/* Missing codes card */}
        <div style={{ ...styles.card, marginTop: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <div style={{ marginTop: 10, opacity: 0.85, fontWeight: 800, fontFamily: "cairo" }}>
                الأرقام التى لم تسجل حتى رقم <span>{gaps.last}</span>:{" "}
                <b>{gaps.missing.length} ارقام</b>
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" onClick={exportCsv} style={styles.secondaryBtn}>
                تصدير CSV
              </button>
              <button type="button" onClick={loadWomen} style={styles.secondaryBtn}>
                تحديث
              </button>
            </div>
          </div>

          {gaps.first === null ? (
            <div style={{ marginTop: 10, opacity: 0.75, fontFamily: "cairo" }}>لا توجد أرقام بعد.</div>
          ) : gaps.missing.length === 0 ? (
            <div style={{ marginTop: 10, ...styles.okBox }}>
              ✅ ممتاز — لا توجد أرقام مفقودة بين {gaps.first} و {gaps.last}.
            </div>
          ) : (
            <div style={styles.gapsWrap}>
              {gaps.ranges.map((r, idx) => {
                const text = r.from === r.to ? String(r.from) : `${r.from} - ${r.to}`;
                return (
                  <span key={idx} style={styles.gapChip}>
                    {text}
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {/* Add + Import Row (hidden in read-only) */}
        {!isReadOnly && (
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

            <div style={{ ...styles.card, flex: 1, minWidth: 320 }}>
              <div style={styles.sectionTitle}>استيراد من CSV</div>
              <div style={{ opacity: 0.75, fontSize: 13, marginTop: 4, fontFamily: "cairo" }}>
                يجب أن يحتوي الملف على عمود <b>code</b> وعمود <b>name</b>
              </div>

              <div style={styles.importRow}>
                <input type="file" accept=".csv" onChange={(e) => setCsvFile(e.target.files?.[0] || null)} />

                <button onClick={importCsv} style={styles.primaryBtn} disabled={!csvFile} type="button">
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
        )}

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
              <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} style={styles.select}>
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

          {totalPages > 1 && (
            <div style={styles.pagination}>
              <button
                type="button"
                style={{ ...styles.pageBtn, ...(currentPage === 1 ? styles.pageBtnDisabled : {}) }}
                disabled={currentPage === 1}
                onClick={() => setPage(1)}
                title="الأول"
              >
                ⏭
              </button>

              <button
                type="button"
                style={{ ...styles.pageBtn, ...(currentPage === 1 ? styles.pageBtnDisabled : {}) }}
                disabled={currentPage === 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                السابق
              </button>

              <div style={styles.pageNumbers}>
                {pageButtons.map((it, idx) =>
                  it === "..." ? (
                    <span key={`dots-${idx}`} style={styles.pageDots}>
                      …
                    </span>
                  ) : (
                    <button
                      key={it}
                      type="button"
                      onClick={() => setPage(it)}
                      style={{ ...styles.pageNumBtn, ...(it === currentPage ? styles.pageNumBtnActive : {}) }}
                    >
                      {it}
                    </button>
                  )
                )}
              </div>

              <button
                type="button"
                style={{ ...styles.pageBtn, ...(currentPage === totalPages ? styles.pageBtnDisabled : {}) }}
                disabled={currentPage === totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                التالي
              </button>

              <button
                type="button"
                style={{ ...styles.pageBtn, ...(currentPage === totalPages ? styles.pageBtnDisabled : {}) }}
                disabled={currentPage === totalPages}
                onClick={() => setPage(totalPages)}
                title="الأخير"
              >
                ⏮
              </button>
            </div>
          )}
        </div>

        {/* List */}
        <div style={{ ...styles.card, marginTop: 12 }}>
          <div className="womenListHeader" style={styles.listHeader}>
            <div style={{ fontWeight: 800 }}>الرقم</div>
            <div style={{ fontWeight: 800 }}>الاسم</div>
            <div style={{ fontWeight: 800 }}>الحالة</div>
            <div style={{ fontWeight: 800 }}>إجراءات</div>
          </div>

          {pageItems.length === 0 ? (
            <div style={styles.empty}>لا توجد نتائج.</div>
          ) : (
            pageItems.map((w) => {
              const isEditing = editingId === w.id;

              return (
                <div key={w.id} className="womenRow" style={styles.row}>
                  <div style={styles.codeCell}>
                    {!isEditing ? (
                      <span>{w.code}</span>
                    ) : (
                      <input
                        value={editCode}
                        onChange={(e) => setEditCode(e.target.value)}
                        style={styles.inlineInput}
                        inputMode="numeric"
                        className="edit"
                        disabled={isReadOnly}
                      />
                    )}
                  </div>

                  <div style={styles.nameCell}>
                    {!isEditing ? (
                      <span>{w.name}</span>
                    ) : (
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        style={styles.inlineInput}
                        className="edit"
                        disabled={isReadOnly}
                      />
                    )}
                  </div>

                  <div>
                    {w.active ? (
                      <span style={styles.badgeActive}>نشط</span>
                    ) : (
                      <span style={styles.badgeInactive}>معطّل</span>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {isReadOnly ? (
                      <span style={{ opacity: 0.6, fontFamily: "cairo" }}>—</span>
                    ) : !isEditing ? (
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

        {totalPages > 1 && (
          <div style={styles.pagination}>
            <button
              type="button"
              style={{ ...styles.pageBtn, ...(currentPage === 1 ? styles.pageBtnDisabled : {}) }}
              disabled={currentPage === 1}
              onClick={() => setPage(1)}
              title="الأول"
            >
              ⏭
            </button>

            <button
              type="button"
              style={{ ...styles.pageBtn, ...(currentPage === 1 ? styles.pageBtnDisabled : {}) }}
              disabled={currentPage === 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              السابق
            </button>

            <div style={styles.pageNumbers}>
              {pageButtons.map((it, idx) =>
                it === "..." ? (
                  <span key={`dots-${idx}`} style={styles.pageDots}>
                    …
                  </span>
                ) : (
                  <button
                    key={it}
                    type="button"
                    onClick={() => setPage(it)}
                    style={{ ...styles.pageNumBtn, ...(it === currentPage ? styles.pageNumBtnActive : {}) }}
                  >
                    {it}
                  </button>
                )
              )}
            </div>

            <button
              type="button"
              style={{ ...styles.pageBtn, ...(currentPage === totalPages ? styles.pageBtnDisabled : {}) }}
              disabled={currentPage === totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              التالي
            </button>

            <button
              type="button"
              style={{ ...styles.pageBtn, ...(currentPage === totalPages ? styles.pageBtnDisabled : {}) }}
              disabled={currentPage === totalPages}
              onClick={() => setPage(totalPages)}
              title="الأخير"
            >
              ⏮
            </button>
          </div>
        )}
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

function Chip({ active, onClick, text }: { active: boolean; onClick: () => void; text: string }) {
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
  title: { margin: 0, fontSize: 28, fontFamily: "cairo" },
  subTitle: { margin: "6px 0 0", opacity: 0.7, fontFamily: "cairo" },

  readOnlyNote: {
    padding: "10px 12px",
    borderRadius: 12,
    background: "#fff7ed",
    border: "1px solid #fed7aa",
    color: "#9a3412",
    fontWeight: 900,
    fontFamily: "cairo",
    display: "inline-block",
  },

  statsRow: { display: "flex", gap: 10, flexWrap: "wrap" },
  stat: {
    background: "white",
    border: "1px solid #e7e7e7",
    borderRadius: 14,
    padding: "10px 12px",
    minWidth: 110,
    textAlign: "center",
    boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
    fontFamily: "cairo",
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

  sectionTitle: { fontWeight: 900, fontSize: 16, fontFamily: "cairo" },
  label: { display: "block", fontSize: 12, opacity: 0.75, marginBottom: 6, fontFamily: "cairo" },

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
    fontFamily: "cairo",
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

  smallNote: { marginTop: 10, opacity: 0.75, fontSize: 13, fontFamily: "cairo" },

  listHeader: {
    display: "grid",
    gridTemplateColumns: "120px 1fr 120px 320px",
    gap: 10,
    padding: "10px 8px",
    borderBottom: "1px solid #eee",
    opacity: 0.85,
    fontFamily: "cairo",
  },

  row: {
    display: "grid",
    gridTemplateColumns: "120px 1fr 120px 320px",
    gap: 10,
    padding: "12px 8px",
    borderBottom: "1px solid #f1f1f1",
    alignItems: "center",
    fontFamily: "cairo",
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
    fontFamily: "cairo",
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
    fontFamily: "cairo",
  },

  empty: { padding: 16, opacity: 0.7, fontFamily: "cairo" },

  gapsWrap: { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 },

  gapChip: {
    display: "inline-flex",
    alignItems: "center",
    padding: "6px 10px",
    borderRadius: 999,
    background: "#fff7ed",
    border: "1px solid #fed7aa",
    color: "#9a3412",
    fontWeight: 900,
    fontFamily: "cairo",
    fontSize: 13,
  },

  okBox: {
    padding: 12,
    borderRadius: 12,
    background: "#ecfdf5",
    border: "1px solid #bbf7d0",
    color: "#065f46",
    fontWeight: 900,
    fontFamily: "cairo",
  },

  pagination: { marginTop: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" },

  pageBtn: {
    padding: "8px 12px",
    borderRadius: 12,
    border: "1px solid #ddd",
    background: "white",
    cursor: "pointer",
    fontWeight: 900,
    fontFamily: "cairo",
  },

  pageBtnDisabled: { opacity: 0.5, cursor: "not-allowed" },

  pageNumbers: { display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" },

  pageNumBtn: {
    minWidth: 38,
    height: 38,
    padding: "0 10px",
    borderRadius: 12,
    border: "1px solid #ddd",
    background: "white",
    cursor: "pointer",
    fontWeight: 900,
    fontFamily: "cairo",
  },

  pageNumBtnActive: { background: "#111827", color: "white", border: "1px solid #111827" },

  pageDots: { padding: "0 6px", opacity: 0.7, fontWeight: 900, fontFamily: "cairo" },
};
