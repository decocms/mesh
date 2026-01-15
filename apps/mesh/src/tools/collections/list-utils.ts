import type {
  OrderByExpression,
  WhereExpression,
} from "@decocms/bindings/collections";

/**
 * Convert SQL LIKE pattern to regex pattern by tokenizing.
 * Handles % (any chars) and _ (single char) wildcards.
 */
function convertLikeToRegex(likePattern: string): string {
  const result: string[] = [];
  let i = 0;

  while (i < likePattern.length) {
    const char = likePattern[i] as string;
    if (char === "%") {
      result.push(".*");
    } else if (char === "_") {
      result.push(".");
    } else if (/[.*+?^${}()|[\]\\]/.test(char)) {
      // Escape regex special characters
      result.push("\\" + char);
    } else {
      result.push(char);
    }
    i++;
  }

  return result.join("");
}

function isStringOrValue(value: unknown): value is string | number {
  return typeof value === "string" || typeof value === "number";
}

function getFieldValue(item: unknown, fieldPath: string): unknown {
  const parts = fieldPath.split(".");
  let value: unknown = item;
  for (const part of parts) {
    if (value == null || typeof value !== "object") return undefined;
    value = (value as Record<string, unknown>)[part];
  }
  return value;
}

export function evaluateWhereExpression<T>(
  item: T,
  where: WhereExpression,
): boolean {
  if ("conditions" in where) {
    const { operator, conditions } = where;
    switch (operator) {
      case "and":
        return conditions.every((c) => evaluateWhereExpression(item, c));
      case "or":
        return conditions.some((c) => evaluateWhereExpression(item, c));
      case "not":
        return !conditions.every((c) => evaluateWhereExpression(item, c));
      default:
        return true;
    }
  }

  const { field, operator, value } = where;
  const fieldPath = field.join(".");
  const fieldValue = getFieldValue(item, fieldPath);

  switch (operator) {
    case "eq":
      return fieldValue === value;
    case "gt":
      return (
        isStringOrValue(fieldValue) &&
        isStringOrValue(value) &&
        fieldValue > value
      );
    case "gte":
      return (
        isStringOrValue(fieldValue) &&
        isStringOrValue(value) &&
        fieldValue >= value
      );
    case "lt":
      return (
        isStringOrValue(fieldValue) &&
        isStringOrValue(value) &&
        fieldValue < value
      );
    case "lte":
      return (
        isStringOrValue(fieldValue) &&
        isStringOrValue(value) &&
        fieldValue <= value
      );
    case "in":
      return Array.isArray(value) && value.includes(fieldValue);
    case "like":
      if (typeof fieldValue !== "string" || typeof value !== "string") {
        return false;
      }
      if (value.length > 100) return false;
      const pattern = convertLikeToRegex(value);
      return new RegExp(`^${pattern}$`, "i").test(fieldValue);
    case "contains":
      if (typeof fieldValue !== "string" || typeof value !== "string") {
        return false;
      }
      return fieldValue.toLowerCase().includes(value.toLowerCase());
    default:
      return true;
  }
}

export function applyOrderBy<T>(items: T[], orderBy: OrderByExpression[]): T[] {
  return [...items].sort((a, b) => {
    for (const order of orderBy) {
      const fieldPath = order.field.join(".");
      const aValue = getFieldValue(a, fieldPath);
      const bValue = getFieldValue(b, fieldPath);

      let comparison = 0;

      if (aValue == null && bValue == null) continue;
      if (aValue == null) {
        comparison = order.nulls === "first" ? -1 : 1;
      } else if (bValue == null) {
        comparison = order.nulls === "first" ? 1 : -1;
      } else if (typeof aValue === "string" && typeof bValue === "string") {
        comparison = aValue.localeCompare(bValue);
      } else if (typeof aValue === "number" && typeof bValue === "number") {
        comparison = aValue - bValue;
      } else {
        comparison = String(aValue).localeCompare(String(bValue));
      }

      if (comparison !== 0) {
        return order.direction === "desc" ? -comparison : comparison;
      }
    }
    return 0;
  });
}
