import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function StacksRedirect() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate("/containers", { replace: true });
  }, [navigate]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
      Redirecting to containers…
    </div>
  );
}
