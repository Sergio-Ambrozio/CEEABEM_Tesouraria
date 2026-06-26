import type { Metadata } from "next";
import Link from "next/link";
import {
  BarChart3,
  FileCheck2,
  Files,
  FolderTree,
  Landmark,
  LayoutDashboard,
  LogOut,
  Settings,
  Upload,
  WalletCards
} from "lucide-react";
import "./globals.css";
import { readSession } from "@/lib/auth/session";
import { logoutAction } from "@/lib/actions/auth-actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { roleLabels } from "@/lib/auth/permissions";

export const metadata: Metadata = {
  title: "CEEABEM Treasury",
  description: "Treasury management and reporting for CEEABEM"
};

const navItems = [
  ["Dashboard", "/dashboard", LayoutDashboard],
  ["Transactions", "/transactions", WalletCards],
  ["Import", "/transactions/import", Upload],
  ["Categories", "/categories", FolderTree],
  ["Closings", "/closings", FileCheck2],
  ["Reports", "/reports", Files],
  ["Admin", "/admin", Settings]
] as const;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await readSession();

  return (
    <html lang="en">
      <body>
        {user ? (
          <div className="min-h-screen bg-slate-50">
            <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 border-r border-slate-200 bg-white px-4 py-5 lg:block">
              <Link href="/dashboard" className="mb-8 flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-700 text-white">
                  <Landmark className="h-5 w-5" />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-slate-950">CEEABEM</span>
                  <span className="block text-xs text-slate-500">Treasury Office</span>
                </span>
              </Link>
              <nav className="space-y-1">
                {navItems.map(([label, href, Icon]) => (
                  <Link
                    key={href}
                    href={href}
                    className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </Link>
                ))}
              </nav>
              <div className="absolute bottom-5 left-4 right-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-sm font-medium text-slate-900">{user.name}</div>
                <Badge className="mt-2" tone="info">{roleLabels[user.role]}</Badge>
              </div>
            </aside>

            <div className="lg:pl-64">
              <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
                <div className="flex min-h-16 flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between lg:px-8">
                  <div className="flex items-center gap-3 lg:hidden">
                    <Landmark className="h-5 w-5 text-primary" />
                    <span className="font-semibold">CEEABEM Treasury</span>
                  </div>
                  <div className="hidden items-center gap-2 text-sm text-slate-500 lg:flex">
                    <BarChart3 className="h-4 w-4" />
                    Treasury Management System
                  </div>
                  <nav className="flex gap-1 overflow-x-auto lg:hidden">
                    {navItems.map(([label, href, Icon]) => (
                      <Button key={href} asChild variant="ghost" size="sm">
                        <Link href={href}>
                          <Icon className="h-4 w-4" />
                          {label}
                        </Link>
                      </Button>
                    ))}
                  </nav>
                  <form action={logoutAction}>
                    <Button type="submit" size="sm" variant="outline">
                      <LogOut className="h-4 w-4" />
                      Log out
                    </Button>
                  </form>
                </div>
              </header>
              <main className="px-4 py-6 lg:px-8">{children}</main>
            </div>
          </div>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
