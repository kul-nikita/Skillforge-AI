import Link from "next/link";
import { SignOutButton } from "@/components/SignOutButton";
import type { User } from "@/lib/db/users";

/**
 * Two groups, because six flat links gave a newcomer no idea which mattered
 * first. "Your path" is the loop the product promises; "Tools" is everything
 * you reach for once you are in it. Labels say what the learner gets — "JD Gap"
 * and "Match Score" named the implementation, not the outcome. Routes are
 * unchanged so nothing that links here breaks.
 */
const PATH_NAV = [
  { href: "/dashboard", label: "Your path" },
  { href: "/diagnostic", label: "Diagnostic" },
  { href: "/evidence", label: "Evidence" }
];

const TOOL_NAV = [
  { href: "/graph", label: "Skill map" },
  { href: "/gap-analyzer", label: "Job fit" }
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
  const tools = showAdmin ? [...TOOL_NAV, { href: "/admin", label: "Catalog" }] : TOOL_NAV;
  const links = [...PATH_NAV, ...tools];

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
          <ul className="hidden items-center gap-0.5 md:flex">
            {PATH_NAV.map((link) => (
              <li key={link.href}>
                <NavLink active={current === link.href} href={link.href} label={link.label} />
              </li>
            ))}

            <li aria-hidden="true" className="mx-2 h-4 w-px bg-border" />

            {tools.map((link) => (
              <li key={link.href}>
                <NavLink active={current === link.href} href={link.href} label={link.label} />
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center gap-3">
          {user ? (
            <>
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
                className="rounded-md bg-ink px-4 py-2 text-sm font-semibold text-canvas transition-colors hover:bg-white"
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

function NavLink({ active, href, label }: { active: boolean; href: string; label: string }) {
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={`rounded-md px-3 py-2 text-sm transition-colors ${
        active ? "bg-white/10 font-medium text-ink" : "text-muted hover:bg-white/5 hover:text-ink"
      }`}
      href={href}
    >
      {label}
    </Link>
  );
}
