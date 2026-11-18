import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { ActivityDrawer } from "@/components/activity-drawer";
import { useState } from "react";

export function TopBar() {
  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/80 px-3 backdrop-blur">
        <SidebarTrigger />
        <ActivityDrawer />
        <ThemeToggle />
      </header>
    </>
  );
}
