"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

type Role = "admin" | "reports_viewer" | null;

type Ctx = {
  role: Role;
  userUid: string | null;
  loading: boolean;
};

const AuthRoleContext = createContext<Ctx>({
  role: null,
  userUid: null,
  loading: true,
});

export function useAuthRole() {
  return useContext(AuthRoleContext);
}

export default function AuthRoleProvider({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<Role>(null);
  const [userUid, setUserUid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setRole(null);
        setUserUid(null);
        setLoading(false);
        return;
      }

      setUserUid(user.uid);

      try {
        // 1) حاول تجيبها بالـ uid (الأفضل)
        const byUid = await getDoc(doc(db, "users", user.uid));
        if (byUid.exists()) {
          setRole((byUid.data()?.role ?? null) as Role);
          setLoading(false);
          return;
        }

        // 2) fallback: لو docId مش uid، دور بالـ email
        const email = (user.email || "").toLowerCase();
        if (!email) {
          setRole(null);
          setLoading(false);
          return;
        }

        const qy = query(collection(db, "users"), where("email", "==", email));
        const snap = await getDocs(qy);
        if (!snap.empty) {
          const data = snap.docs[0].data();
          setRole((data?.role ?? null) as Role);
        } else {
          setRole(null);
        }
      } catch {
        setRole(null);
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, []);

  return (
    <AuthRoleContext.Provider value={{ role, userUid, loading }}>
      {children}
    </AuthRoleContext.Provider>
  );
}
