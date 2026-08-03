"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CaretDown,
  ChalkboardTeacher,
  House,
  MapTrifold,
  SignOut,
  UserCircle,
} from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useMemo, useState, type ReactNode } from "react";
import { apiClient, getApiErrorMessage } from "@/lib/api-client";
import { studentApi, studentKeys } from "@/lib/student-api";

const navigation = [
  { label: "Hôm nay", shortLabel: "Hôm nay", href: "/student/dashboard", icon: House },
  { label: "Lộ trình", shortLabel: "Lộ trình", href: "/student/roadmap", icon: MapTrifold },
  { label: "Lớp học", shortLabel: "Lớp", href: "/student/classes", icon: ChalkboardTeacher },
  { label: "Hồ sơ", shortLabel: "Tôi", href: "/student/profile", icon: UserCircle },
] as const;

export function StudentShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const reduceMotion = useReducedMotion();
  const [accountOpen, setAccountOpen] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const immersive = pathname.startsWith("/student/lesson/") || pathname.startsWith("/student/report/");

  const meQuery = useQuery({ queryKey: studentKeys.me, queryFn: studentApi.me });
  const logout = useMutation({
    mutationFn: () => apiClient.post("/auth/logout"),
    onSuccess: () => {
      queryClient.clear();
      router.replace("/login");
      router.refresh();
    },
    onError: (error) =>
      setLogoutError(getApiErrorMessage(error, "Không thể đăng xuất. Thử lại sau.")),
  });

  const initials = useMemo(() => {
    const name = meQuery.data?.full_name || meQuery.data?.username || "HS";
    return name
      .trim()
      .split(/\s+/)
      .slice(-2)
      .map((part) => part[0])
      .join("")
      .toUpperCase();
  }, [meQuery.data]);

  if (immersive) return <>{children}</>;

  return (
    <div className="student-shell">
      <header className="student-topbar">
        <Link className="student-brand" href="/student/dashboard" aria-label="D-Friend Học sinh">
          <Image src="/dfriend-logo.png" alt="Logo D-Friend" width={42} height={42} priority />
          <span>
            <strong>D-Friend</strong>
            <small>Không gian học tập</small>
          </span>
        </Link>

        <nav className="student-desktop-nav" aria-label="Điều hướng học sinh">
          {navigation.map((item) => {
            const active = isNavigationActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} data-active={active}>
                <Icon size={18} weight={active ? "fill" : "regular"} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="student-account-wrap">
          <button
            className="student-account-button"
            onClick={() => {
              setAccountOpen((value) => !value);
              setLogoutError("");
            }}
            aria-haspopup="menu"
            aria-expanded={accountOpen}
          >
            <span className="student-avatar">{initials}</span>
            <span className="student-account-name">
              {meQuery.data?.full_name || meQuery.data?.username || "Học sinh"}
            </span>
            <CaretDown size={14} data-open={accountOpen} />
          </button>
          <AnimatePresence>
            {accountOpen && (
              <motion.div
                className="student-account-menu"
                role="menu"
                initial={reduceMotion ? false : { opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.16 }}
              >
                <div>
                  <strong>{meQuery.data?.full_name || "Học sinh"}</strong>
                  <span>{meQuery.data?.email || meQuery.data?.username}</span>
                </div>
                {logoutError && <p role="alert">{logoutError}</p>}
                <Link role="menuitem" href="/student/profile" onClick={() => setAccountOpen(false)}>
                  <UserCircle size={18} /> Hồ sơ của tôi
                </Link>
                <button role="menuitem" onClick={() => logout.mutate()} disabled={logout.isPending}>
                  <SignOut size={18} /> {logout.isPending ? "Đang đăng xuất" : "Đăng xuất"}
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </header>

      <main id="main-content" className="student-main">
        {children}
      </main>

      <nav className="student-bottom-nav" aria-label="Điều hướng học sinh trên điện thoại">
        {navigation.map((item) => {
          const active = isNavigationActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} data-active={active}>
              <Icon size={21} weight={active ? "fill" : "regular"} />
              <span>{item.shortLabel}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function isNavigationActive(pathname: string, href: string) {
  if (href === "/student/dashboard") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}
