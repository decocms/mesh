import { lazy, Suspense } from "react";
import { Loading01 } from "@untitledui/icons";

const RegistryLayout = lazy(
  () =>
    import("mesh-plugin-private-registry/client/components/registry-layout"),
);

export default function SettingsRegistryPage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center">
          <Loading01 size={20} className="animate-spin text-muted-foreground" />
        </div>
      }
    >
      <RegistryLayout />
    </Suspense>
  );
}
