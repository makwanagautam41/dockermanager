import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Bell,
  Bot,
  Database,
  Download,
  FolderTree,
  Gauge,
  Image as ImageIcon,
  LayoutDashboard,
  Settings,
  Container as ContainerIcon,
} from "lucide-react";

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onOpenChange]);

  const go = (fn: () => void) => {
    onOpenChange(false);
    fn();
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Type a command or search…" />
      <CommandList>
        <CommandGroup heading="Navigate">
          <CommandItem onSelect={() => go(() => navigate("/dashboard"))}>
            <LayoutDashboard className="mr-2 h-4 w-4" /> Dashboard
          </CommandItem>
          <CommandItem onSelect={() => go(() => navigate("/metrics"))}>
            <Gauge className="mr-2 h-4 w-4" /> Metrics
          </CommandItem>
          <CommandItem onSelect={() => go(() => navigate("/alerts"))}>
            <Bell className="mr-2 h-4 w-4" /> Alerts
          </CommandItem>
          <CommandItem onSelect={() => go(() => navigate("/containers"))}>
            <ContainerIcon className="mr-2 h-4 w-4" /> Containers
          </CommandItem>
          <CommandItem onSelect={() => go(() => navigate("/images"))}>
            <ImageIcon className="mr-2 h-4 w-4" /> Images
          </CommandItem>
          <CommandItem onSelect={() => go(() => navigate("/volumes"))}>
            <Database className="mr-2 h-4 w-4" /> Volumes
          </CommandItem>
          <CommandItem onSelect={() => go(() => navigate("/registry"))}>
            <Download className="mr-2 h-4 w-4" /> Registry
          </CommandItem>
          <CommandItem onSelect={() => go(() => navigate("/yaml"))}>
            <FolderTree className="mr-2 h-4 w-4" /> YAML Explorer
          </CommandItem>
          <CommandItem onSelect={() => go(() => navigate("/images"))}>
            <ImageIcon className="mr-2 h-4 w-4" /> Images
          </CommandItem>
          <CommandItem onSelect={() => go(() => navigate("/setup"))}>
            <Settings className="mr-2 h-4 w-4" /> Setup
          </CommandItem>
          <CommandItem onSelect={() => go(() => navigate("/ai"))}>
            <Bot className="mr-2 h-4 w-4" /> AI Assistant
          </CommandItem>
          <CommandItem onSelect={() => go(() => navigate("/settings"))}>
            <Settings className="mr-2 h-4 w-4" /> Settings
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
