"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut, onAuthStateChanged, User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useEffect, useState } from "react";

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

export default function Header() {
    const pathname = usePathname() || "/";
    const router = useRouter();

    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    // مراقبة حالة تسجيل الدخول
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

    // لو لسه بيحمّل حالة المستخدم
    if (loading) return null;

    // لو مش مسجل دخول → مفيش هيدر أصلاً
    if (!user) return null;

    return (
        <header style={s.header} dir="rtl">
            <div style={s.wrap}>
                <img src="/logo.png" alt="اجتماع السيدات" height={70} />

                <nav style={s.nav}>
                    {links.map((l) => {
                        const active = isActivePath(pathname, l.href);
                        return (
                            <Link
                                key={l.href}
                                href={l.href}
                                style={{
                                    ...s.link,
                                    ...(active ? s.linkActive : {}),
                                }}
                                onMouseEnter={(e) => {
                                    if (!active) {
                                    Object.assign(e.currentTarget.style, s.linkHover);
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    Object.assign(
                                    e.currentTarget.style,
                                    active ? s.linkActive : s.link
                                    );
                                }}
                                >
                                {l.label}
                            </Link>
                        );
                    })}
                </nav>

                <button onClick={logout} style={s.logout}>
                    تسجيل الخروج
                </button>
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
        padding: "12px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap",
    },
    nav: { display: "flex", gap: 8, flexWrap: "wrap" },
    link: {
        textDecoration: "none",
        color: "#111827",
        padding: "8px 14px",
        borderRadius: 12,
        fontWeight: 800,
        transition: "all 0.25s ease",
        border: "1px solid transparent",
        background: "transparent",
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
    },
};
