import type { BaseCollectionEntity } from "@decocms/bindings/collections";
import { CollectionCard } from "./collection-card.tsx";
import { CollectionTableWrapper } from "./collection-table-wrapper.tsx";
import { CollectionDisplayButton } from "./collection-display-button.tsx";
import type { CollectionsListProps } from "./types";
import type { TableColumn } from "@deco/ui/components/collection-table.tsx";
import { EmptyState } from "@deco/ui/components/empty-state.tsx";
import { Button } from "@deco/ui/components/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@deco/ui/components/dropdown-menu.tsx";
import {
  DotsVertical,
  Eye,
  Edit01,
  Copy01,
  Trash01,
  Inbox01,
} from "@untitledui/icons";
import type { JsonSchema } from "@/web/utils/constants";

// Helper to generate sort options from JSONSchema
export function generateSortOptionsFromSchema(
  schema: JsonSchema,
  sortableFields?: string[],
): Array<{ id: string; label: string }> {
  return Object.keys(schema.properties || {})
    .filter((key) => {
      // Filter out internal fields
      if (
        ["id", "created_at", "updated_at", "created_by", "updated_by"].includes(
          key,
        )
      ) {
        return false;
      }
      // If sortableFields is provided, only include those
      if (sortableFields) {
        return sortableFields.includes(key);
      }
      return true;
    })
    .map((key) => ({
      id: key,
      label: key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, " "),
    }));
}

export function CollectionsList<T extends BaseCollectionEntity>({
  data,
  schema,
  viewMode,
  onViewModeChange = () => {},
  search,
  sortKey,
  sortDirection = "asc",
  onSort = () => {},
  actions = {},
  onItemClick = () => {},
  headerActions = null,
  emptyState = null,
  readOnly = false,
  columns = undefined,
  hideToolbar = false,
  sortableFields = undefined,
}: CollectionsListProps<T>) {
  // Generate sort options from columns or schema
  const sortOptions = columns
    ? columns
        .filter((col) => col.sortable !== false)
        .filter((col) => !sortableFields || sortableFields.includes(col.id))
        .map((col) => ({
          id: col.id,
          label: typeof col.header === "string" ? col.header : col.id,
        }))
    : generateSortOptionsFromSchema(schema, sortableFields);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header with actions */}
      {!hideToolbar && (
        <div className="shrink-0 w-full border-b border-border h-12">
          <div className="flex items-center gap-3 h-12 px-4">
            <div className="flex items-center gap-2 flex-1">
              {headerActions}
            </div>

            {/* View Mode + Sort Controls */}
            <div className="flex items-center gap-2 shrink-0">
              <CollectionDisplayButton
                viewMode={viewMode}
                onViewModeChange={onViewModeChange}
                sortKey={sortKey}
                sortDirection={sortDirection}
                onSort={onSort}
                sortOptions={sortOptions}
              />
            </div>
          </div>
        </div>
      )}

      {/* Content: Cards or Table */}
      {viewMode === "cards" ? (
        <div className="flex-1 overflow-auto p-5">
          {data.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              {emptyState || (
                <EmptyState
                  icon={<Inbox01 size={36} className="text-muted-foreground" />}
                  title="No items found"
                  description={
                    search ? "Try adjusting your search" : "No items to display"
                  }
                />
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {data.map((item) => (
                <div
                  key={item.id}
                  onClick={() => onItemClick?.(item)}
                  className="cursor-pointer h-full"
                >
                  <CollectionCard
                    item={item}
                    schema={schema}
                    readOnly={readOnly}
                    actions={actions}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <CollectionTableWrapper
          columns={getTableColumns(columns, schema, sortableFields, actions)}
          data={data}
          sortKey={sortKey}
          sortDirection={sortDirection}
          onSort={onSort}
          onRowClick={onItemClick}
          emptyState={
            emptyState || (
              <EmptyState
                icon={<Inbox01 size={36} className="text-muted-foreground" />}
                title="No items found"
                description={
                  search ? "Try adjusting your search" : "No items to display"
                }
              />
            )
          }
        />
      )}
    </div>
  );
}

// Helper to generate actions column
function generateActionsColumn<T extends BaseCollectionEntity>(
  actions: Record<string, (item: T) => void | Promise<void>>,
): TableColumn<T> {
  return {
    id: "actions",
    header: "",
    render: (row) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={(e) => e.stopPropagation()}
          >
            <DotsVertical size={20} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          {actions.open && (
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                actions.open?.(row);
              }}
            >
              <Eye size={16} />
              Open
            </DropdownMenuItem>
          )}
          {actions.edit && (
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                actions.edit?.(row);
              }}
            >
              <Edit01 size={16} />
              Edit
            </DropdownMenuItem>
          )}
          {actions.duplicate && (
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                actions.duplicate?.(row);
              }}
            >
              <Copy01 size={16} />
              Duplicate
            </DropdownMenuItem>
          )}
          {actions.delete && (
            <DropdownMenuItem
              variant="destructive"
              onClick={(e) => {
                e.stopPropagation();
                actions.delete?.(row);
              }}
            >
              <Trash01 size={16} />
              Delete
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    ),
    cellClassName: "w-[60px]",
    sortable: false,
  };
}

// Helper to check if a JSONSchema field is a primitive type (string, number, boolean)
function isPrimitiveType(fieldSchema: JsonSchema): boolean {
  const type = fieldSchema.type;
  return (
    type === "string" ||
    type === "number" ||
    type === "integer" ||
    type === "boolean"
  );
}

// Helper to check if a JSONSchema string field has URL format
function isUrlString(fieldSchema: JsonSchema): boolean {
  return (
    fieldSchema.type === "string" &&
    (fieldSchema.format === "url" || fieldSchema.format === "uri")
  );
}

// Helper to generate columns from schema
function generateColumnsFromSchema<T extends BaseCollectionEntity>(
  schema: JsonSchema,
  sortableFields?: string[],
): TableColumn<T>[] {
  const properties = schema.properties || {};

  // Filter out non-primitive types
  const primitiveKeys = Object.keys(properties).filter((key) => {
    const fieldSchema = properties[key];
    return fieldSchema && isPrimitiveType(fieldSchema);
  });

  // Find the first field that is type: string, format: uri
  const imageFieldName: string | undefined = primitiveKeys.find((key) => {
    const fieldSchema = properties[key];
    return fieldSchema && isUrlString(fieldSchema);
  });

  // Sort columns by priority:
  // 1. Image field (if exists)
  // 2. title
  // 3. desc (with maxLength <= 100)
  // 4. updated_at
  // 5. updated_by
  // 6. Other columns
  const priorityOrder = new Set<string>();

  // Add image field first if found
  if (imageFieldName) {
    priorityOrder.add(imageFieldName);
  }

  const knownFields = ["title", "description", "updated_at", "updated_by"];
  for (const field of knownFields) {
    if (
      primitiveKeys.includes(field) &&
      imageFieldName !== field &&
      !priorityOrder.has(field)
    ) {
      priorityOrder.add(field);
    }
  }

  // Add remaining keys
  for (const key of primitiveKeys) {
    if (!priorityOrder.has(key)) {
      priorityOrder.add(key);
    }
  }

  // Generate columns
  return [...priorityOrder.values()].map((key) => {
    const fieldSchema = properties[key];
    if (!fieldSchema) {
      return {
        id: key,
        header: key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, " "),
        render: (row) => {
          const val = row[key as keyof T];
          if (val === null || val === undefined) return "—";
          return (
            <span className="block truncate max-w-full">{String(val)}</span>
          );
        },
        sortable: sortableFields
          ? sortableFields.includes(key)
          : !["id"].includes(key),
        cellClassName: "max-w-[200px]",
      };
    }

    // Determine if this field should be sortable
    const isSortable = sortableFields
      ? sortableFields.includes(key)
      : !["id"].includes(key); // By default, all fields except 'id' are sortable

    // Handle date fields
    if (fieldSchema.format === "date-time" || key.endsWith("_at")) {
      return {
        id: key,
        header: key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, " "),
        render: (row) => {
          const val = row[key as keyof T];
          if (!val) return "—";
          return (
            <span className="block truncate max-w-full">
              {new Date(val as string).toLocaleDateString()}
            </span>
          );
        },
        sortable: isSortable,
        cellClassName: "max-w-[200px]",
      };
    }

    // Handle image URL fields
    if (imageFieldName === key && isUrlString(fieldSchema)) {
      return {
        id: key,
        header: key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, " "),
        render: (row) => {
          const val = row[key as keyof T];
          if (!val) return "—";
          return (
            <img
              src={String(val)}
              alt={key}
              className="h-8 w-8 rounded object-cover"
            />
          );
        },
        sortable: isSortable,
        cellClassName: "max-w-[200px]",
      };
    }

    // Handle other primitive types
    return {
      id: key,
      header: key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, " "),
      render: (row) => {
        const val = row[key as keyof T];
        if (val === null || val === undefined) return "—";
        return <span className="block truncate max-w-full">{String(val)}</span>;
      },
      sortable: isSortable,
      cellClassName: "max-w-[100px]",
    };
  });
}

// Helper to get table columns with actions column appended
function getTableColumns<T extends BaseCollectionEntity>(
  columns: TableColumn<T>[] | undefined,
  schema: JsonSchema,
  sortableFields: string[] | undefined,
  actions: Record<string, (item: T) => void | Promise<void>>,
): TableColumn<T>[] {
  const baseColumns =
    columns || generateColumnsFromSchema(schema, sortableFields);

  // Check if actions column already exists
  const hasActionsColumn = baseColumns.some((col) => col.id === "actions");

  if (hasActionsColumn) {
    return baseColumns;
  }

  // Append actions column only if there are any actions available
  const hasActions = Object.keys(actions).length > 0;
  if (hasActions) {
    return [...baseColumns, generateActionsColumn(actions)];
  }
  return baseColumns;
}
