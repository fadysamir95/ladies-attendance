// lib/firebase.ts
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) {
    // مهم: هتظهر في Console في الديبلوي لو env ناقصة
    console.error(`Missing env var: ${name}`);
  }
  return v || "";
}

const firebaseConfig = {
  apiKey: mustEnv("NEXT_PUBLIC_FIREBASE_API_KEY"),
  authDomain: mustEnv("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"),
  projectId: mustEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID"),

  // ✅ دول غالبًا لازم يكونوا موجودين كمان (خصوصًا في Vercel)
  storageBucket: mustEnv("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: mustEnv("NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"),
  appId: mustEnv("NEXT_PUBLIC_FIREBASE_APP_ID"),
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

// (اختياري) Debug سريع تعرف منه الديبلوي بيستخدم أنهي مشروع
if (typeof window !== "undefined") {
  console.log("Firebase projectId:", (app as any)?.options?.projectId);
}
