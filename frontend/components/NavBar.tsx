"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/questions", label: "Question Bank" },
  { href: "/study", label: "Study" },
  { href: "/bookmarks", label: "Bookmarks" },
];

export function NavBar() {
  const { token, ready, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  return (
    <header className="border-b border-slate-200 bg-[#232f3e] text-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href={token ? "/dashboard" : "/"} className="flex items-center gap-2 font-semibold">
          <span className="rounded bg-orange-500 px-2 py-0.5 text-sm">AWS</span>
          <span>CCP Exam Prep</span>
        </Link>
        {ready && token && (
          <nav className="flex items-center gap-1">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded px-3 py-1.5 text-sm transition-colors ${
                  pathname.startsWith(l.href) ? "bg-white/15" : "hover:bg-white/10"
                }`}
              >
                {l.label}
              </Link>
            ))}
            <button
              onClick={() => {
                logout();
                router.push("/login");
              }}
              className="ml-2 rounded px-3 py-1.5 text-sm text-slate-300 hover:bg-white/10"
            >
              Logout
            </button>
          </nav>
        )}
      </div>
    </header>
  );
}
