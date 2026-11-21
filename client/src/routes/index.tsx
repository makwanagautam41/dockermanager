import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Spinner } from "@/components/ui/spinner";

export default function Index() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate("/containers");
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Spinner className="h-4 w-4" />
        <span className="text-sm font-medium">Loading Docker Manager…</span>
      </div>
    </div>
  );
}
