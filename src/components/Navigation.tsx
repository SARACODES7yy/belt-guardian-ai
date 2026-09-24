import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, LineChart, FileText, Upload, History, ClipboardList, LogOut, Activity, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { ThemeToggle } from "@/components/ThemeToggle";

export const Navigation = () => {
  const location = useLocation();
  const { signOut, user } = useAuth();

  const navItems = [
    { path: "/", icon: LayoutDashboard, label: "Dashboard" },
    { path: "/analytics", icon: LineChart, label: "Analytics" },
    { path: "/reports", icon: FileText, label: "Reports" },
    { path: "/upload", icon: Upload, label: "Upload Analysis" },
    { path: "/history", icon: History, label: "History" },
    { path: "/work-orders", icon: ClipboardList, label: "Work Orders" },
    { path: "/belts", icon: Wrench, label: "Belts" },
  ];

  return (
    <nav className="fixed top-0 inset-x-0 z-50 border-b border-border bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-4 px-4 md:px-6">
        <Link to="/" className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-[6px] border border-primary/50 bg-secondary text-primary">
            <Activity className="h-4 w-4" />
          </span>
          <span className="flex flex-col leading-none">
            <span className="font-display text-lg font-bold uppercase tracking-[0.1em] text-foreground">
              ConveyorWatch
            </span>
            <span className="text-[11px] font-medium text-muted-foreground">
              Belt monitoring system
            </span>
          </span>
        </Link>

        <div className="ml-auto flex items-center gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;

            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "flex items-center gap-2 rounded-[6px] px-3 py-1.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden md:inline">{item.label}</span>
              </Link>
            );
          })}
        </div>

        <span className="hidden h-5 w-px bg-border sm:inline" />

        <div className="flex items-center gap-1">
          <ThemeToggle />
          <button
            onClick={signOut}
            title={`Sign out (${user?.email})`}
            className="flex h-8 items-center gap-2 rounded-[6px] px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden md:inline">Sign out</span>
          </button>
        </div>
      </div>
    </nav>
  );
};