"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Boxes,
  Image as ImageIcon,
  Database,
  Network,
  Settings,
} from "lucide-react";
import clsx from "clsx";
import { useT } from "@/i18n/provider";
import { RihtimLogo } from "./RihtimLogo";

const items = [
  { href: "/", key: "nav.dashboard", icon: LayoutDashboard },
  { href: "/containers", key: "nav.containers", icon: Boxes },
  { href: "/images", key: "nav.images", icon: ImageIcon },
  { href: "/volumes", key: "nav.volumes", icon: Database },
  { href: "/networks", key: "nav.networks", icon: Network },
  { href: "/settings", key: "nav.settings", icon: Settings },
];

export function Sidebar() {
  const path = usePathname();
  const { t } = useT();
  return (
    <aside className="w-56 shrink-0 border-r border-slate-800 bg-slate-950/60 flex flex-col">
      <div className="h-14 flex items-center gap-2 px-4 border-b border-slate-800">
        <RihtimLogo className="w-6 h-6 rounded-md shadow-sm" />
        <span className="font-semibold tracking-wide">Rihtim</span>
      </div>
      <nav className="flex-1 p-2 space-y-1">
        {items.map(({ href, key, icon: Icon }) => {
          const active = href === "/" ? path === "/" : path?.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm",
                active
                  ? "bg-brand-600/20 text-brand-200 border border-brand-600/30"
                  : "text-slate-300 hover:bg-slate-800/60",
              )}
            >
              <Icon className="w-4 h-4" />
              {t(key)}
            </Link>
          );
        })}
      </nav>
      <div className="p-3 text-xs text-slate-500 border-t border-slate-800">
        v0.1.0
      </div>
    </aside>
  );
}
