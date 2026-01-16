"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut, onAuthStateChanged, User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useEffect, useState } from "react";
import ChurchLoader from "@/app/components/ChurchLoader";

const links = [
    { href: "/", label: "الصفحة الرئيسية" },
    { href: "/women", label: "إدارة السيدات" },
    { href: "/session", label: "تسجيل الحضور" },
    { href: "/reports", label: "تقارير المواظبة" },
];

function isActivePath(pathname: string, href: string) {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(href + "/");
}

function getUserLabel(u: User) {
  const email = (u.email || "").toLowerCase();

  const map: Record<string, string> = {
    "manalsaad@ladies.com": "الخادمة/ منال سعد",
    "manalsaad@attendance.com": "الخادمة/ منال سعد",
    "fathermikhail@attendance.com": "أبونا/ ميخائيل عطية",
  };

  if (map[email]) return map[email];

  if (u.displayName && u.displayName.trim()) return u.displayName.trim();
  if (email) return email.split("@")[0];
  return "مستخدم";
}

export default function Header() {
    const pathname = usePathname() || "/";
    const router = useRouter();

    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, (u) => {
            setUser(u);
            setLoading(false);
        });

        return () => unsub();
    }, []);

    async function logout() {
        await signOut(auth);
        document.cookie = "auth=; Max-Age=0; path=/";
        setUser(null);
        router.push("/login");
    }

    if (loading) return null;

    if (!user) return null;

    return (
        <header style={s.header} dir="rtl">
            <div className="hdrWrap" style={s.wrap}>
                <div className="hdrTop" style={s.topRow}>

                    <Link href="/">
                        <img
                            src="/logo.png"
                            alt="اجتماع السيدات"
                            height={60}
                            style={s.logo}
                        />
                    </Link>

                    <div style={s.userBox}>
                        <span style={s.userName}>{getUserLabel(user)}</span>
                    </div>

                    <button onClick={logout} style={s.logout} className="logout">
                        تسجيل الخروج
                    </button>
                </div>

                <nav className="hdrNav" style={s.nav}>
                    {links.map((l) => {
                        const active = isActivePath(pathname, l.href);
                        return (
                            <Link
                                key={l.href}
                                href={l.href}
                                style={{ ...s.link, ...(active ? s.linkActive : {}) }}
                                onMouseEnter={(e) => {
                                    if (!active) Object.assign(e.currentTarget.style, s.linkHover);
                                }}
                                onMouseLeave={(e) => {
                                    Object.assign(e.currentTarget.style, active ? s.linkActive : s.link);
                                }}
                            >
                                {l.label}
                            </Link>
                        );
                    })}
                </nav>
            </div>
        </header>
    );
}

const s: Record<string, React.CSSProperties> = {
    header: {
        position: "sticky",
        top: 0,
        zIndex: 50,
        background: "white",
        borderBottom: "1px solid #eee",
    },
    wrap: {
        maxWidth: 1100,
        margin: "0 auto",
        padding: "10px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
    },
    topRow: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
    },
    logo: { display: "block", cursor: "pointer", },

    nav: {
        display: "flex",
        gap: 14,
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "center",
    },

    link: {
        textDecoration: "none",
        color: "#111827",
        padding: "8px 14px",
        borderRadius: 12,
        fontWeight: 800,
        transition: "all 0.25s ease",
        border: "1px solid transparent",
        background: "transparent",
        whiteSpace: "nowrap",
    },
    linkActive: {
        background: "#111827",
        color: "white",
        border: "1px solid #111827",
    },
    linkHover: {
        background: "#f3f4f6",
        border: "1px solid #e5e7eb",
        transform: "scale(1.05)",
    },
    logout: {
        padding: "8px 12px",
        borderRadius: 10,
        border: "1px solid #ddd",
        background: "white",
        cursor: "pointer",
        fontWeight: 900,
        fontFamily: "cairo",
        whiteSpace: "nowrap",
    },
    userBox: {
        display: "flex",
        alignItems: "center",
        gap: 8,
    },
    userName: {
        padding: "8px 12px",
        borderRadius: 999,
        border: "1px solid #e5e7eb",
        background: "#f9fafb",
        fontWeight: 900,
        fontFamily: "cairo",
        color: "#111827",
    },
};
