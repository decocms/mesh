import { useState } from "react";
import { Button } from "@deco/ui/components/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@deco/ui/components/dialog.tsx";
import { Input } from "@deco/ui/components/input.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@deco/ui/components/table.tsx";
import type {
  RegistryBulkCreateResult,
  RegistryCreateInput,
} from "../lib/types";

interface CsvImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isImporting?: boolean;
  onImport: (items: RegistryCreateInput[]) => Promise<RegistryBulkCreateResult>;
}

function parseList(value?: string): string[] {
  if (!value) return [];
  return value
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
}

function parseCsvToItems(csvContent: string): RegistryCreateInput[] {
  const lines = csvContent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const header = parseCsvLine(lines[0] ?? "");
  const headerIndex = new Map<string, number>();
  header.forEach((column, index) => {
    headerIndex.set(column.toLowerCase(), index);
  });

  const getValue = (cells: string[], key: string) => {
    const index = headerIndex.get(key);
    return typeof index === "number" ? (cells[index] ?? "") : "";
  };

  const items: RegistryCreateInput[] = [];
  for (let index = 1; index < lines.length; index += 1) {
    const cells = parseCsvLine(lines[index] ?? "");
    const id = getValue(cells, "id").trim();
    const title = getValue(cells, "title").trim();
    if (!id || !title) continue;

    const description = getValue(cells, "description").trim();
    const remoteUrl = getValue(cells, "remote_url").trim();
    const remoteType = getValue(cells, "remote_type").trim() || "http";
    const tags = parseList(getValue(cells, "tags"));
    const categories = parseList(getValue(cells, "categories"));

    items.push({
      id,
      title,
      description: description || null,
      _meta: {
        "mcp.mesh": {
          tags,
          categories,
        },
      },
      server: {
        name: id,
        title,
        description: description || undefined,
        remotes: remoteUrl ? [{ type: remoteType, url: remoteUrl }] : [],
      },
    });
  }

  return items;
}

export function CsvImportDialog({
  open,
  onOpenChange,
  isImporting = false,
  onImport,
}: CsvImportDialogProps) {
  const [items, setItems] = useState<RegistryCreateInput[]>([]);
  const [lastResult, setLastResult] = useState<RegistryBulkCreateResult | null>(
    null,
  );

  const handleOpenChange = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      setItems([]);
      setLastResult(null);
    }
  };

  const handleFile = async (file: File | null) => {
    if (!file) return;
    const content = await file.text();
    const parsedItems = parseCsvToItems(content);
    setItems(parsedItems);
    setLastResult(null);
  };

  const handleImport = async () => {
    if (!items.length) return;
    const result = await onImport(items);
    setLastResult(result);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Import CSV</DialogTitle>
          <DialogDescription>
            Upload a CSV using columns: id, title, description, remote_url,
            remote_type, tags, categories.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <Input
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => handleFile(event.target.files?.[0] ?? null)}
          />

          {items.length > 0 && (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Remote URL</TableHead>
                    <TableHead>Tags</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.slice(0, 20).map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-mono">{item.id}</TableCell>
                      <TableCell>{item.title}</TableCell>
                      <TableCell>
                        {item.server.remotes?.[0]?.url ?? "-"}
                      </TableCell>
                      <TableCell>
                        {(item._meta?.["mcp.mesh"]?.tags ?? []).join(", ") ||
                          "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {lastResult && (
            <div className="text-sm text-muted-foreground">
              Imported {lastResult.created} item(s). {lastResult.errors.length}{" "}
              error(s).
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Close
          </Button>
          <Button
            onClick={handleImport}
            disabled={isImporting || items.length === 0}
          >
            {isImporting ? "Importing..." : `Import ${items.length} item(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
