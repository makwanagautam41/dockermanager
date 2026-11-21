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
  IconX,
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
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";

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
  const { setOpenMobile, isMobile } = useSidebar();

  const close = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border p-3 group-data-[collapsible=icon]:p-2">
        <div className="flex items-center justify-between gap-2 px-1 py-1 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <Link
            to="/containers"
            onClick={close}
            className="flex items-center gap-2 group-data-[collapsible=icon]:justify-center"
          >
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md">
              <img src="/docker.svg" alt="Docker" className="h-7 w-7" />
            </div>
            <div className="flex min-w-0 flex-col leading-tight group-data-[collapsible=icon]:hidden">
              <span className="truncate font-semibold text-sm tracking-tight">
                Docker Manager
              </span>
              <span className="truncate font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Stack Manager
              </span>
            </div>
          </Link>
          {isMobile && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 md:hidden"
              aria-label="Close sidebar"
              onClick={() => setOpenMobile(false)}
            >
              <IconX size={16} />
            </Button>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent>
        {GROUPS.map((g) => (
          <SidebarGroup key={g.label}>
            <SidebarGroupLabel className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
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
                        <Link to={item.to} onClick={close}>
                          <item.icon size={16} stroke={1.75} />
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
      <SidebarFooter className="border-t border-sidebar-border p-2 group-data-[collapsible=icon]:p-2 group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:justify-center">
        <div className="flex items-center justify-between px-2 py-1 group-data-[collapsible=icon]:hidden">
          {import.meta.env.DEV ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-mono font-medium tracking-wide text-amber-500">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
              Development
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-mono font-medium tracking-wide text-emerald-500">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Production
            </span>
          )}
        </div>
        <div className="hidden group-data-[collapsible=icon]:flex items-center justify-center py-1">
          {import.meta.env.DEV ? (
            <span
              className="h-2 w-2 rounded-full bg-amber-500 animate-pulse"
              title="Development"
            />
          ) : (
            <span
              className="h-2 w-2 rounded-full bg-emerald-500"
              title="Production"
            />
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

export default AppSidebar;
