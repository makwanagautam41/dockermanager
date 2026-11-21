import {
  IconHelpCircle,
  IconCheck,
  IconTerminal,
  IconBulb,
} from "@tabler/icons-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

export interface PageHelpProps {
  title: string;
  description: string;
  tips?: string[];
  dockerCommands?: string[];
}

export function PageHelpPopover({
  title,
  description,
  tips = [],
  dockerCommands = [],
}: PageHelpProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-foreground hover:bg-muted/60 rounded-full transition-colors"
          title={`Help & details for ${title}`}
          aria-label={`Help and details for ${title}`}
        >
          <IconHelpCircle className="h-4 w-4" stroke={1.75} />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-80 sm:w-96 p-4 rounded-xl shadow-xl border bg-popover/95 backdrop-blur-md space-y-3 select-text"
      >
        <div className="flex items-center gap-2 border-b pb-2">
          <div className="grid h-6 w-6 place-items-center rounded-md bg-primary/10 text-primary">
            <IconBulb className="h-3.5 w-3.5" stroke={1.75} />
          </div>
          <span className="font-semibold text-sm tracking-tight">{title}</span>
          <span className="ml-auto font-mono text-[9px] uppercase px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
            info
          </span>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">
          {description}
        </p>

        {tips.length > 0 && (
          <div className="space-y-1.5 pt-1">
            <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              Key Capabilities:
            </div>
            <ul className="space-y-1 text-xs">
              {tips.map((t, i) => (
                <li key={i} className="flex items-start gap-1.5 text-foreground/80">
                  <IconCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" stroke={2} />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {dockerCommands.length > 0 && (
          <div className="space-y-1.5 pt-1 border-t">
            <div className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              <IconTerminal className="h-3 w-3" />
              <span>Underlying Docker Commands:</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {dockerCommands.map((c, i) => (
                <code
                  key={i}
                  className="rounded bg-muted/80 px-1.5 py-0.5 font-mono text-[10px] text-foreground/80 border border-border/50"
                >
                  {c}
                </code>
              ))}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export default PageHelpPopover;
