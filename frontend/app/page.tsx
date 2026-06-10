"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";

export default function Home() {
  const { token, ready } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (ready && token) router.replace("/dashboard");
  }, [ready, token, router]);

  return (
    <div className="py-16 text-center">
      <h1 className="text-4xl font-bold tracking-tight text-slate-900">
        Pass the AWS Cloud Practitioner exam
      </h1>
      <p className="mx-auto mt-4 max-w-xl text-lg text-slate-600">
        Timed mock exams, untimed practice with full explanations, domain-focused study, and
        progress tracking — built around the CLF-C02 blueprint. Runs entirely on your machine.
      </p>
      <div className="mt-8 flex justify-center gap-3">
        <Link href="/register" className="btn-primary px-6 py-3 text-base">
          Get started free
        </Link>
        <Link href="/login" className="btn-secondary px-6 py-3 text-base">
          Sign in
        </Link>
      </div>
    </div>
  );
}
