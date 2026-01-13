"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getThisWeekKey, getThisWeekSessionDate } from "@/lib/weekKey";

export default function SessionHome() {
  const router = useRouter();

  useEffect(() => {
    async function run() {
      const weekKey = getThisWeekKey();

      const sessionRef = doc(db, "sessions", weekKey);
      const snap = await getDoc(sessionRef);

      if (!snap.exists()) {
        await setDoc(sessionRef, {
          weekKey,
          date: getThisWeekSessionDate(),
          createdAt: serverTimestamp(),
        });

        await setDoc(doc(db, "attendance", weekKey), {
          records: {},
          updatedAt: serverTimestamp(),
        });
      }

      router.push(`/session/${weekKey}`);
    }

    run();
  }, [router]);

  return <div style={{ padding: 20 }}>جاري فتح الصفحة...</div>;
}
