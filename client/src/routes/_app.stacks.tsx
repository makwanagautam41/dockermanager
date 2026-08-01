import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/_app/stacks")({
  component: StacksRedirect,
  head: () => ({
    meta: [
      { title: "Stacks · Docker Manager" },
      { name: "description", content: "Redirects to the containers view." },
    ],
  }),
});

function StacksRedirect() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate({ to: "/containers", replace: true });
  }, [navigate]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
      Redirecting to containers…
    </div>
  );
}
