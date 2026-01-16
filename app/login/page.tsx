"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword, onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        document.cookie = "auth=1; path=/";
        router.replace("/");
      }
      setChecking(false);
    });

    return () => unsub();
  }, [router]);

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const eTrim = email.trim();
    if (!eTrim || !password) {
      setError("من فضلك أدخل الإيميل والباسورد.");
      return;
    }

    try {
      setLoading(true);
      await signInWithEmailAndPassword(auth, eTrim, password);

      document.cookie = "auth=1; path=/";

      router.replace("/");
    } catch (err: any) {
      const msg =
        err?.code === "auth/invalid-credential"
          ? "بيانات الدخول غير صحيحة."
          : err?.code === "auth/user-not-found"
          ? "لا يوجد مستخدم بهذا الإيميل."
          : err?.code === "auth/wrong-password"
          ? "كلمة المرور غير صحيحة."
          : err?.code === "auth/too-many-requests"
          ? "محاولات كثيرة. جرّب لاحقًا."
          : "حدث خطأ أثناء تسجيل الدخول.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <div dir="rtl" style={s.page}>
        <div style={s.card}>
          <div style={{ opacity: 0.75 }}>جاري التحميل...</div>
        </div>
      </div>
    );
  }

  return (
    <div dir="rtl" style={s.page}>
      <div style={s.card}>
        <h1 style={s.title}>تسجيل الدخول</h1>

        <form onSubmit={handleLogin} style={s.form}>
          <div>
            <label style={s.label}>الإيميل</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              style={s.input}
              autoComplete="email"
            />
          </div>

          <div>
            <label style={s.label}>كلمة المرور</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={s.input}
              autoComplete="current-password"
            />
          </div>

          {error && <div style={s.error}>{error}</div>}

          <button type="submit" style={s.primaryBtn} disabled={loading}>
            {loading ? "جاري تسجيل الدخول..." : "تسجيل الدخول"}
          </button>
        </form>

        <div style={s.note}>
          * إذا نسيت كلمة المرور، اطلب من المسؤول إعادة تعيينها من Firebase Authentication.
        </div>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "calc(100vh - 70px)",
    display: "grid",
    placeItems: "center",
    padding: 16,
    background: "linear-gradient(180deg, #f6f7fb 0%, #ffffff 100%)",
    textAlign: "center",
  },
  card: {
    width: "100%",
    maxWidth: 420,
    background: "white",
    border: "1px solid #e7e7e7",
    borderRadius: 18,
    padding: 18,
    boxShadow: "0 2px 10px rgba(0,0,0,0.06)",
  },
  brand: {
    fontWeight: 900,
    fontSize: 14,
    opacity: 0.9,
    marginBottom: 8,
  },
  title: { margin: "4px 0 2px", fontSize: 24 },
  sub: { margin: "0 0 14px", opacity: 0.75, lineHeight: 1.6 },
  form: { display: "grid", gap: 12 },
  label: { display: "block", fontSize: 12, opacity: 0.75, marginBottom: 6, textAlign: "right" },
  input: {
    width: "94%",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #ddd",
    outline: "none",
    fontSize: 14,
    fontFamily: "cairo",
    textAlign: "left",
  },
  error: {
    padding: "10px 12px",
    borderRadius: 12,
    background: "#fff1f1",
    border: "1px solid #fecaca",
    color: "#991b1b",
    fontWeight: 800,
    fontSize: 13,
  },
  primaryBtn: {
    padding: "10px 14px",
    borderRadius: 12,
    border: "none",
    cursor: "pointer",
    background: "#111827",
    color: "white",
    fontWeight: 900,
    fontSize: 14,
    fontFamily: "cairo",
    marginTop: "14px",
  },
  note: {
    marginTop: 12,
    opacity: 0.65,
    fontSize: 12,
    lineHeight: 1.5,
  },
};
