import Link from "next/link";
import { Bell } from "lucide-react";
import { SignOutButton } from "@/components/SignOutButton";
import type { User } from "@/lib/db/users";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/diagnostic", label: "Diagnostic" },
  { href: "/evidence", label: "Evidence" },
  { href: "/graph", label: "Skill Graph" },
  { href: "/gap-analyzer", label: "JD Gap" },
  { href: "/match-score", label: "Match Score" },
];

export function SiteHeader({
  user,
  current,
  showAdmin = false,
}: {
  user?: Pick<User, "email"> | null;
  current?: string;
  showAdmin?: boolean;
}) {
  const links = showAdmin
    ? [...NAV, { href: "/admin", label: "Catalog" }]
    : NAV;

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[#050816]/75 backdrop-blur-xl">
      <nav className="mx-auto flex h-[68px] max-w-7xl items-center justify-between px-6">
        <Link
          href={user ? "/dashboard" : "/"}
          className="text-base font-bold tracking-tight text-white"
        >
          SkillForge
        </Link>

        {!user && (
          <div className="hidden items-center gap-8 md:flex">
            <a
              href="#how-it-works"
              className="text-sm text-slate-400 transition hover:text-white"
            >
              How it works
            </a>

            <a
              href="#career-tracks"
              className="text-sm text-slate-400 transition hover:text-white"
            >
              Learning paths
            </a>

            <a
              href="#about"
              className="text-sm text-slate-400 transition hover:text-white"
            >
              About us
            </a>
          </div>
        )}

        {user && (
          <ul className="hidden items-center gap-1 md:flex">
            {links.map((link) => {
              const active = current === link.href;

              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    aria-current={active ? "page" : undefined}
                    className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                      active
                        ? "bg-violet-500/15 text-violet-300"
                        : "text-slate-400 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex items-center gap-3">
          {user ? (
            <>
              <button
                type="button"
                className="hidden rounded-lg p-2 text-slate-400 transition hover:bg-white/5 hover:text-white sm:block"
              >
                <Bell size={18} />
              </button>

              <Link
                href="/account"
                className="hidden max-w-[180px] truncate rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-white/5 sm:block"
              >
                {user.email}
              </Link>

              <SignOutButton className="rounded-lg border border-white/10 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:border-white/20 hover:bg-white/5 hover:text-white" />
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="hidden px-3 py-2 text-sm font-medium text-slate-300 transition hover:text-white sm:block"
              >
                Sign in
              </Link>

              <Link
                href="/onboarding"
                className="rounded-xl bg-gradient-to-r from-violet-600 to-cyan-500 px-5 py-2.5 text-sm font-bold text-white shadow-[0_0_25px_rgba(99,102,241,0.2)] transition hover:scale-[1.02]"
              >
                Get started
              </Link>
            </>
          )}
        </div>
      </nav>

      {user && (
        <div className="flex gap-1 overflow-x-auto border-t border-white/5 px-4 py-2 md:hidden">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-white"
            >
              {link.label}
            </Link>
          ))}

          <Link
            href="/account"
            className="whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-white"
          >
            Account
          </Link>
        </div>
      )}
    </header>
  );
}