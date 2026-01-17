"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { db, auth } from "@/lib/firebase";
import { getThisWeekKey, getThisWeekSessionDate } from "@/lib/weekKey";
import ChurchLoader from "@/app/components/ChurchLoader";

async function getMyRole(uid: string) {
  const snap = await getDoc(doc(db, "users", uid));
  return (snap.exists() ? snap.data()?.role : null) as string | null;
}

export default function SessionHome() {
  const router = useRouter();
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace("/login");
        return;
      }
      try {
        const role = await getMyRole(user.uid);
        if (role !== "admin") {
          router.replace("/");
          return;
        }
        const weekKey = getThisWeekKey();
        const sessionRef = doc(db, "sessions", weekKey);
        const snap = await getDoc(sessionRef);

        if (!snap.exists()) {
          await setDoc(
            sessionRef,
            {
              weekKey,
              date: getThisWeekSessionDate(),
              createdAt: serverTimestamp(),
            },
            { merge: true }
          );

          await setDoc(
            doc(db, "attendance", weekKey),
            { records: {}, updatedAt: serverTimestamp() },
            { merge: true }
          );
        }

        router.replace(`/session/${weekKey}`);
      } catch (e) {
        router.replace("/reports");
      } finally {
        setBusy(false);
      }
    });

    return () => unsub();
  }, [router]);

  if (busy) return <ChurchLoader text="جاري فتح صفحة تسجيل الحضور..." />;
  return null;
}
