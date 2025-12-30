/**
 * Add Binding Modal
 *
 * A modal that allows users to add common binding implementations to their MCP Mesh.
 * Bindings are common patterns/interfaces that MCPs can implement.
 */

import { useState } from "react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@deco/ui/components/dialog.tsx";
import { Button } from "@deco/ui/components/button.tsx";
import { Input } from "@deco/ui/components/input.tsx";
import { Label } from "@deco/ui/components/label.tsx";
import { Spinner } from "@deco/ui/components/spinner.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@deco/ui/components/select.tsx";
import { ArrowLeft, Check, Clock, Folder } from "@untitledui/icons";
import { cn } from "@deco/ui/lib/utils.ts";
import { useProjectContext } from "@/web/providers/project-context-provider";
import { useConnectionActions } from "@/web/hooks/collections/use-connection";
import { generatePrefixedId } from "@/shared/utils/generate-id";
import { authClient } from "@/web/lib/auth-client";
import type { StdioConnectionParameters } from "@/tools/connection/schema";
import {
  type BindingDefinition,
  type BindingImplementation,
  getAvailableBindings,
  getComingSoonBindings,
} from "./binding-definitions";

interface AddBindingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ModalStep = "select-binding" | "select-implementation" | "configure";

export function AddBindingModal({ open, onOpenChange }: AddBindingModalProps) {
  const navigate = useNavigate();
  const { org } = useProjectContext();
  const { data: session } = authClient.useSession();
  const actions = useConnectionActions();

  const [step, setStep] = useState<ModalStep>("select-binding");
  const [selectedBinding, setSelectedBinding] =
    useState<BindingDefinition | null>(null);
  const [selectedImplementation, setSelectedImplementation] =
    useState<BindingImplementation | null>(null);
  const [configValues, setConfigValues] = useState<Record<string, string>>({});
  const [isCreating, setIsCreating] = useState(false);

  const availableBindings = getAvailableBindings();
  const comingSoonBindings = getComingSoonBindings();

  const handleSelectBinding = (binding: BindingDefinition) => {
    if (binding.status === "coming_soon") {
      return;
    }
    setSelectedBinding(binding);

    // If only one implementation, skip to configure
    if (binding.implementations.length === 1 && binding.implementations[0]) {
      setSelectedImplementation(binding.implementations[0]);
      setStep("configure");
    } else {
      setStep("select-implementation");
    }
  };

  const handleSelectImplementation = (impl: BindingImplementation) => {
    setSelectedImplementation(impl);
    // Apply default config if available
    if (impl.defaultConfig) {
      setConfigValues(impl.defaultConfig);
    }
    setStep("configure");
  };

  const handleBack = () => {
    if (step === "configure") {
      if (selectedBinding && selectedBinding.implementations.length > 1) {
        setStep("select-implementation");
      } else {
        setStep("select-binding");
        setSelectedBinding(null);
        setSelectedImplementation(null);
      }
    } else if (step === "select-implementation") {
      setStep("select-binding");
      setSelectedBinding(null);
      setSelectedImplementation(null);
    }
  };

  const handleConfigChange = (field: string, value: string) => {
    setConfigValues((prev) => ({ ...prev, [field]: value }));
  };

  const handleCreate = async () => {
    if (!selectedImplementation || !org || !session?.user?.id) {
      return;
    }

    // Validate required fields
    const requiredFields =
      selectedImplementation.configFields?.filter((f) => f.required) ?? [];
    const missingFields = requiredFields.filter((f) => !configValues[f.name]);
    if (missingFields.length > 0) {
      toast.error(
        `Please fill in: ${missingFields.map((f) => f.label).join(", ")}`,
      );
      return;
    }

    setIsCreating(true);

    try {
      const connectionId = generatePrefixedId("conn");
      const now = new Date().toISOString();

      if (selectedImplementation.connectionType === "STDIO") {
        // Build STDIO connection
        const pathArg = configValues["path"] ?? "";

        let connectionHeaders: StdioConnectionParameters;

        // Use localCommand if available (for development), otherwise npx
        if (selectedImplementation.localCommand) {
          connectionHeaders = {
            command: selectedImplementation.localCommand.command,
            args: [...selectedImplementation.localCommand.args, pathArg].filter(
              Boolean,
            ),
          };
        } else {
          connectionHeaders = {
            command: "npx",
            args: ["-y", selectedImplementation.npxPackage!, pathArg].filter(
              Boolean,
            ),
          };
        }

        // Add env vars if there are API keys etc
        const envVars: Record<string, string> = {};
        for (const field of selectedImplementation.configFields ?? []) {
          const fieldValue = configValues[field.name];
          if (field.name !== "path" && fieldValue) {
            // Convert to env var format (e.g., apiKey -> API_KEY)
            const envKey = field.name
              .replace(/([A-Z])/g, "_$1")
              .toUpperCase()
              .replace(/^_/, "");
            envVars[envKey] = fieldValue;
          }
        }
        if (Object.keys(envVars).length > 0) {
          connectionHeaders.envVars = envVars;
        }

        await actions.create.mutateAsync({
          id: connectionId,
          title: `${selectedBinding?.name ?? "Binding"} (${selectedImplementation.name})`,
          description:
            selectedImplementation.description ||
            `${selectedBinding?.name} via ${selectedImplementation.name}`,
          connection_type: "STDIO",
          connection_url: "",
          connection_headers: connectionHeaders,
          connection_token: null,
          organization_id: org.id,
          created_at: now,
          updated_at: now,
          created_by: session.user.id,
          icon: null,
          app_name: selectedImplementation.npxPackage ?? null,
          app_id: null,
          oauth_config: null,
          configuration_state: null,
          metadata: null,
          tools: null,
          bindings: selectedBinding?.bindingType
            ? [selectedBinding.bindingType]
            : null,
          status: "inactive",
        });
      } else {
        // HTTP/SSE connection
        await actions.create.mutateAsync({
          id: connectionId,
          title: `${selectedBinding?.name ?? "Binding"} (${selectedImplementation.name})`,
          description:
            selectedImplementation.description ||
            `${selectedBinding?.name} via ${selectedImplementation.name}`,
          connection_type: selectedImplementation.connectionType,
          connection_url: selectedImplementation.httpEndpoint ?? "",
          connection_headers: null,
          connection_token: configValues["apiKey"] ?? null,
          organization_id: org.id,
          created_at: now,
          updated_at: now,
          created_by: session.user.id,
          icon: null,
          app_name: null,
          app_id: null,
          oauth_config: null,
          configuration_state: null,
          metadata: null,
          tools: null,
          bindings: selectedBinding?.bindingType
            ? [selectedBinding.bindingType]
            : null,
          status: "inactive",
        });
      }

      toast.success(`${selectedImplementation.name} connected successfully!`);
      onOpenChange(false);
      resetState();

      // Navigate to the new connection
      navigate({
        to: "/$org/mcps/$connectionId",
        params: { org: org.slug, connectionId },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Failed to create connection: ${message}`);
    } finally {
      setIsCreating(false);
    }
  };

  const resetState = () => {
    setStep("select-binding");
    setSelectedBinding(null);
    setSelectedImplementation(null);
    setConfigValues({});
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      resetState();
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-2">
            {step !== "select-binding" && (
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={handleBack}
              >
                <ArrowLeft className="size-4" />
              </Button>
            )}
            <div>
              <DialogTitle>
                {step === "select-binding" && "Add Binding to MCP Mesh"}
                {step === "select-implementation" &&
                  `${selectedBinding?.name} Providers`}
                {step === "configure" &&
                  `Configure ${selectedImplementation?.name}`}
              </DialogTitle>
              <DialogDescription>
                {step === "select-binding" &&
                  "Bindings are common patterns that MCPs implement. Select one to add capabilities to your mesh."}
                {step === "select-implementation" &&
                  `Choose how you want to implement ${selectedBinding?.name}`}
                {step === "configure" &&
                  `Set up ${selectedImplementation?.name} to add ${selectedBinding?.name} to your mesh`}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-4">
          {step === "select-binding" && (
            <div className="space-y-6">
              {/* Available Bindings */}
              {availableBindings.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-muted-foreground px-1">
                    Available
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    {availableBindings.map((binding) => (
                      <BindingCard
                        key={binding.id}
                        binding={binding}
                        onClick={() => handleSelectBinding(binding)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Coming Soon Bindings */}
              {comingSoonBindings.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-muted-foreground px-1">
                    Coming Soon
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    {comingSoonBindings.map((binding) => (
                      <BindingCard
                        key={binding.id}
                        binding={binding}
                        disabled
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {step === "select-implementation" && selectedBinding && (
            <div className="grid grid-cols-1 gap-3">
              {selectedBinding.implementations.map((impl) => (
                <ImplementationCard
                  key={impl.id}
                  implementation={impl}
                  onClick={() => handleSelectImplementation(impl)}
                />
              ))}
            </div>
          )}

          {step === "configure" && selectedImplementation && (
            <div className="space-y-6">
              {/* Implementation Header */}
              <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/50 border">
                <div className="text-3xl">{selectedImplementation.icon}</div>
                <div>
                  <h3 className="font-semibold">
                    {selectedImplementation.name}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {selectedImplementation.description}
                  </p>
                </div>
              </div>

              {/* Configuration Fields */}
              {selectedImplementation.configFields &&
                selectedImplementation.configFields.length > 0 && (
                  <div className="space-y-4">
                    {selectedImplementation.configFields.map((field) => (
                      <div key={field.name} className="space-y-2">
                        <Label htmlFor={field.name}>
                          {field.label}
                          {field.required && (
                            <span className="text-destructive ml-1">*</span>
                          )}
                        </Label>

                        {field.type === "path" ? (
                          <div className="flex gap-2">
                            <Input
                              id={field.name}
                              placeholder={field.placeholder}
                              value={configValues[field.name] ?? ""}
                              onChange={(e) =>
                                handleConfigChange(field.name, e.target.value)
                              }
                              className="flex-1"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              title="Browse folder (coming soon)"
                              disabled
                            >
                              <Folder className="size-4" />
                            </Button>
                          </div>
                        ) : field.type === "select" && field.options ? (
                          <Select
                            value={configValues[field.name]}
                            onValueChange={(val) =>
                              handleConfigChange(field.name, val)
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder={field.placeholder} />
                            </SelectTrigger>
                            <SelectContent>
                              {field.options.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            id={field.name}
                            type={
                              field.name.toLowerCase().includes("key") ||
                              field.name.toLowerCase().includes("secret") ||
                              field.name.toLowerCase().includes("token")
                                ? "password"
                                : "text"
                            }
                            placeholder={field.placeholder}
                            value={configValues[field.name] ?? ""}
                            onChange={(e) =>
                              handleConfigChange(field.name, e.target.value)
                            }
                          />
                        )}

                        {field.description && (
                          <p className="text-xs text-muted-foreground">
                            {field.description}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

              {/* Create Button */}
              <div className="flex justify-end gap-3 pt-4 border-t">
                <Button variant="outline" onClick={handleBack}>
                  Back
                </Button>
                <Button onClick={handleCreate} disabled={isCreating}>
                  {isCreating ? (
                    <>
                      <Spinner size="xs" />
                      <span className="ml-2">Connecting...</span>
                    </>
                  ) : (
                    <>
                      <Check className="size-4 mr-2" />
                      Connect {selectedImplementation.name}
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Binding Card Component
 */
function BindingCard({
  binding,
  onClick,
  disabled,
}: {
  binding: BindingDefinition;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const isComingSoon = binding.status === "coming_soon" || disabled;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isComingSoon}
      className={cn(
        "relative flex flex-col items-start gap-2 p-4 rounded-xl border text-left transition-all",
        "bg-linear-to-br",
        binding.gradient,
        isComingSoon
          ? "opacity-60 cursor-not-allowed"
          : "hover:border-primary/50 hover:shadow-md cursor-pointer",
      )}
    >
      {isComingSoon && (
        <div className="absolute top-2 right-2 flex items-center gap-1 text-xs text-muted-foreground bg-background/80 px-2 py-0.5 rounded-full">
          <Clock className="size-3" />
          Soon
        </div>
      )}
      <div className="text-2xl">{binding.icon}</div>
      <div>
        <h4 className="font-semibold">{binding.name}</h4>
        <p className="text-xs text-muted-foreground line-clamp-2">
          {binding.description}
        </p>
      </div>
      {binding.implementations.length > 0 && !isComingSoon && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
          <span>{binding.implementations.length} provider</span>
          {binding.implementations.length > 1 && "s"}
        </div>
      )}
    </button>
  );
}

/**
 * Implementation Card Component
 */
function ImplementationCard({
  implementation,
  onClick,
}: {
  implementation: BindingImplementation;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-4 p-4 rounded-xl border text-left transition-all",
        "hover:border-primary/50 hover:bg-muted/50 hover:shadow-md cursor-pointer",
      )}
    >
      <div className="text-3xl">{implementation.icon}</div>
      <div className="flex-1">
        <h4 className="font-semibold">{implementation.name}</h4>
        <p className="text-sm text-muted-foreground">
          {implementation.description}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs bg-muted px-2 py-0.5 rounded-full">
            {implementation.connectionType === "STDIO" ? "Local" : "Remote"}
          </span>
          {implementation.npxPackage && (
            <span className="text-xs text-muted-foreground font-mono">
              {implementation.npxPackage}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
