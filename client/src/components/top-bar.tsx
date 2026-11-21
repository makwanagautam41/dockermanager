import { SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { ActivityDrawer } from "@/components/activity-drawer";

export function TopBar() {
  return (
    <header className="bg-background/70 sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between gap-2 border-b px-3 md:px-4 backdrop-blur-md">
      <div className="flex min-w-0 items-center gap-2">
        <SidebarTrigger className="-ml-1" />
      </div>
      <div className="app-header-actions flex items-center gap-1 md:gap-2">
        <ActivityDrawer />
        <ThemeToggle />
      </div>
    </header>
  );
}

export default TopBar;
