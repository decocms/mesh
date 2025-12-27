export function ToolHeader({
  name,
  description,
}: {
  name: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 text-center pb-2">
      <h1 className="text-2xl font-medium text-foreground">{name}</h1>
      <p className="text-muted-foreground text-sm">
        {description || "No description available"}
      </p>
    </div>
  );
}
