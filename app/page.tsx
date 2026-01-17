"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import ChurchLoader from "@/app/components/ChurchLoader";
import { useAuthRole } from "@/app/providers/AuthRoleProvider";

export default function Home() {
  const [loadingUi, setLoadingUi] = useState(true);
  const { role, loading: roleLoading } = useAuthRole();

  const isAdmin = role === "admin";

  const items = useMemo(
    () => [
      {
        title: "إدارة السيدات",
        desc: "إضافة/تعديل/تعطيل/حذف + استيراد CSV وترتيب دائم حسب الرقم.",
        href: "/women",
        adminOnly: false, // انت مخليها تظهر للـ reports_viewer (بس هتكون قراءة فقط داخل الصفحة)
      },
      {
        title: "تسجيل الحضور",
        desc: "تسجيل حضور الاجتماع بامكانية البحث بالاسم أو الرقم لسرعة التسجيل.",
        href: "/session",
        adminOnly: true, // ✅ تتخفى لغير الأدمن
      },
      {
        title: "تقارير المواظبة",
        desc: "عرض تقرير الشهر والتنقل بين الشهور ومتابعة المواظبة.",
        href: "/reports",
        adminOnly: false,
      },
    ],
    []
  );

  const visibleItems = useMemo(() => {
    if (roleLoading) return []; // عشان ما يحصلش flicker (تظهر وبعدين تختفي)
    return items.filter((it) => !it.adminOnly || isAdmin);
  }, [items, isAdmin, roleLoading]);

  useEffect(() => {
    const t = setTimeout(() => setLoadingUi(false), 600);
    return () => clearTimeout(t);
  }, []);

  if (loadingUi || roleLoading) {
    return <ChurchLoader text="جاري تحميل الصفحة الرئيسية..." />;
  }

  return (
    <div style={s.page}>
      <h1 style={s.h1}>الصفحة الرئيسية</h1>
      <p style={s.p}>اختر القسم الذي تريد الدخول إليه.</p>

      <div style={s.grid}>
        {visibleItems.map((it) => (
          <Link key={it.href} href={it.href} style={s.card} className="home-box">
            <div style={s.cardTitle}>{it.title}</div>
            <div style={s.cardDesc}>{it.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1100, margin: "0 auto" },
  h1: { margin: "6px 0 4px", fontSize: 24 },
  p: { margin: "0 0 14px", opacity: 0.75 },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: 14,
  },
  card: {
    textDecoration: "none",
    color: "#111827",
    background: "white",
    border: "1px solid #e7e7e7",
    borderRadius: 18,
    padding: 18,
    boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
    display: "grid",
    gap: 10,
    minHeight: 150,
  },
  cardTitle: { fontWeight: 900, fontSize: 18 },
  cardDesc: { opacity: 0.75, lineHeight: 1.6 },
};
