import { Link, useLocation } from "react-router-dom";
import {
  IconBrandDocker,
  IconDatabase,
  IconFileCode,
  IconLayersLinked,
  IconPlus,
  IconPhoto,
  IconCloudDownload,
  IconDeviceDesktopAnalytics,
} from "@tabler/icons-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const GROUPS = [
  {
    label: "Manage",
    items: [
      { title: "Containers", to: "/containers", icon: IconBrandDocker },
      { title: "Networks", to: "/networks", icon: IconLayersLinked },
      { title: "Create from YAML", to: "/create/yaml", icon: IconPlus },
      { title: "Images", to: "/images", icon: IconPhoto },
      { title: "Volumes", to: "/volumes", icon: IconDatabase },
      { title: "Registry", to: "/registry", icon: IconCloudDownload },
    ],
  },
  {
    label: "Files",
    items: [{ title: "Explorer", to: "/yaml", icon: IconFileCode }],
  },
  {
    label: "Tools",
    items: [{ title: "Setup", to: "/setup", icon: IconDeviceDesktopAnalytics }],
  },
] as const;

export function AppSidebar() {
  const { pathname } = useLocation();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b p-3 group-data-[collapsible=icon]:p-2">
        <Link
          to="/containers"
          className="flex items-center gap-2 px-1 py-1 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
        >
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md">
            <img src="/docker.svg" alt="Docker" className="h-8 w-8" />
          </div>
          <div className="flex min-w-0 flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="truncate font-mono text-sm font-semibold tracking-tight">
              Docker Manager
            </span>
            <span className="truncate font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              stack manager
            </span>
          </div>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        {GROUPS.map((g) => (
          <SidebarGroup key={g.label}>
            <SidebarGroupLabel className="font-mono text-[10px] uppercase tracking-widest">
              {g.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {g.items.map((item) => {
                  const active = pathname === item.to || pathname.startsWith(item.to + "/");
                  return (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={item.title}
                        className="rounded-md transition-colors duration-150"
                      >
                        <Link to={item.to}>
                          <item.icon className="h-4 w-4" stroke={1.75} />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="border-t">
        <div className="flex items-center justify-between group-data-[collapsible=icon]:hidden">
          {import.meta.env.DEV ? (
            <span className="inline-flex items-center gap-1.5 rounded-xs bg-amber-100 px-2 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-wider text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
              Development
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-xs bg-emerald-100 px-2 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-wider text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              production
            </span>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
