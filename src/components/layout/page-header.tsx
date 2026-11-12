export function PageHeader({ title, description, actions, headingLevel = 1 }: { title: string; description?: string; actions?: React.ReactNode; headingLevel?: 1 | 2 }) {
  const Heading = headingLevel === 2 ? "h2" : "h1";
  return (
    <div className="mb-7 flex flex-wrap items-start justify-between gap-4 border-b border-border/70 pb-5">
      <div className="min-w-0 max-w-full">
        <Heading className="break-words text-2xl font-semibold tracking-[-0.035em] sm:text-[28px]">{title}</Heading>
        {description ? <p className="mt-1.5 max-w-3xl text-sm leading-6 text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex w-full min-w-0 max-w-full flex-wrap items-center gap-2 sm:w-auto">{actions}</div> : null}
    </div>
  );
}
