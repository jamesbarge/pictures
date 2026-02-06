/**
 * Admin Layout
 * Provides sidebar navigation and authentication wrapper for all /admin/* routes
 * Protected by middleware and server-side admin check
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { SafeUserButton as UserButton } from "@/components/clerk-components-safe";
import {
  LayoutDashboard,
  Film,
  Building2,
  AlertCircle,
  BarChart3,
  Bot,
  ChevronLeft,
  Calendar,
  ClipboardCheck,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { requireAdmin } from "@/lib/auth";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  description?: string;
}

const navItems: NavItem[] = [
  {
    href: "/admin",
    label: "Health Overview",
    icon: <LayoutDashboard className="w-5 h-5" />,
    description: "Cinema status and scraper health",
  },
  {
    href: "/admin/analytics",
    label: "Analytics",
    icon: <BarChart3 className="w-5 h-5" />,
    description: "User behavior and engagement",
  },
  {
    href: "/admin/screenings",
    label: "Screenings",
    icon: <Film className="w-5 h-5" />,
    description: "Browse and manage screenings",
  },
  {
    href: "/admin/cinemas",
    label: "Cinemas",
    icon: <Building2 className="w-5 h-5" />,
    description: "Cinema configuration and tiers",
  },
  {
    href: "/admin/festivals",
    label: "Festivals",
    icon: <Calendar className="w-5 h-5" />,
    description: "Programme status and scraping",
  },
  {
    href: "/admin/anomalies",
    label: "Anomalies",
    icon: <AlertCircle className="w-5 h-5" />,
    description: "Review and resolve data issues",
  },
  {
    href: "/admin/data-quality",
    label: "Data Quality",
    icon: <ClipboardCheck className="w-5 h-5" />,
    description: "Film metadata completeness",
  },
  {
    href: "/admin/agents",
    label: "AI Agents",
    icon: <Bot className="w-5 h-5" />,
    description: "Run data quality agents",
  },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Defense in depth: ensure all /admin pages require admin privileges.
  const admin = await requireAdmin();
  if (admin instanceof Response) {
    if (admin.status === 401) {
      redirect("/sign-in");
    }
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-background-primary flex">
      {/* Sidebar */}
      <aside className="w-64 bg-background-secondary border-r border-border-subtle flex flex-col">
        {/* Logo/Header */}
        <div className="p-4 border-b border-border-subtle">
          <Link
            href="/"
            className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="text-sm">Back to site</span>
          </Link>
          <h1 className="font-display text-xl text-text-primary mt-3">
            Admin Dashboard
          </h1>
          <p className="text-xs text-text-tertiary mt-1">
            Data completeness system
          </p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => (
            <NavLink key={item.href} item={item} />
          ))}
        </nav>

        {/* User section */}
        <div className="p-4 border-t border-border-subtle">
          <div className="flex items-center gap-3">
            <UserButton
              appearance={{
                elements: {
                  avatarBox: "w-8 h-8",
                },
              }}
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-text-primary truncate">Admin</p>
              <p className="text-xs text-text-tertiary">Manage data</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}

// Client component for active state (could enhance with usePathname later)
function NavLink({ item }: { item: NavItem }) {
  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 rounded-lg",
        "text-text-secondary hover:text-text-primary",
        "hover:bg-background-hover transition-colors",
        "group"
      )}
    >
      <span className="text-text-tertiary group-hover:text-accent-primary transition-colors">
        {item.icon}
      </span>
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium block">{item.label}</span>
        {item.description && (
          <span className="text-xs text-text-tertiary block truncate">
            {item.description}
          </span>
        )}
      </div>
    </Link>
  );
}
