import type { ReactNode } from "react";

export function Heading({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div>
      <h2 className="text-2xl font-bold tracking-tight md:text-3xl">{title}</h2>
      {description && <p className="text-muted-foreground mt-1 text-sm">{description}</p>}
    </div>
  );
}

export function PageContainer({
  children,
  pageTitle,
  pageDescription,
  pageHeaderAction,
}: {
  children: ReactNode;
  pageTitle?: string;
  pageDescription?: string;
  pageHeaderAction?: ReactNode;
}) {
  const hasHeader = Boolean(pageTitle || pageHeaderAction);
  return (
    <div className="flex flex-1 flex-col">
      {hasHeader && (
        <div className="mb-5 flex items-start justify-between gap-4">
          <Heading title={pageTitle ?? ""} description={pageDescription} />
          {pageHeaderAction && <div className="shrink-0">{pageHeaderAction}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

export default PageContainer;
