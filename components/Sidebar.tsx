// @ts-nocheck
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  User,
  LayoutDashboard,
  Wrench,
  Shield,
  Users
} from "lucide-react";

const links = [
  { href: "/app/home", label: "Home", icon: LayoutDashboard },
  { href: "/app/myprofile", label: "My Profile", icon: User },
  { href: "/app/creator", label: "Creator", icon: Wrench },
  { href: "/app/admin", label: "Admin Centre", icon: Shield },
  { href: "/app/admin/users", label: "Users", icon: Users }
];

export default function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="w-64 shrink-0 border-r bg-white">
      <div className="p-4 font-semibold">INFLITE Induction & Training</div>
      <nav className="px-2">
        {links.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-gray-50 ${
                active ? "bg-gray-100 font-medium" : "text-gray-700"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
