/**
 * Lint plugin to enforce using `cn` function for className interpolation.
 * Allows:
 * - String literals: className="..." or className={"..."}
 * - Identifier/member expressions: className={styles.foo}
 * - cn() calls: className={cn(...)}
 * - null/undefined/false: className={null}
 *
 * Disallows:
 * - Ternary expressions: className={cond ? "a" : "b"}
 * - Template literals: className={`a ${b}`}
 * - String concatenation: className={"a" + b}
 * - Logical expressions: className={cond && "a"}
 */

const requireCnClassNameRule = {
  create(context) {
    // Check if file is in packages/ui (should be excluded)
    const filename = context.filename || "";
    const normalizedPath = filename.replace(/\\/g, "/");
    const isInPackagesUi = normalizedPath.includes("/packages/ui/");

    return {
      JSXAttribute(node) {
        // Only check className attributes
        if (
          node.name.type !== "JSXIdentifier" ||
          node.name.name !== "className"
        ) {
          return;
        }

        // Skip if in packages/ui
        if (isInPackagesUi) {
          return;
        }

        // If no value, skip (className without value is invalid anyway)
        if (!node.value) {
          return;
        }

        // Handle JSX expression container: className={...}
        if (node.value.type === "JSXExpressionContainer") {
          const expression = node.value.expression;

          // Allow null, undefined, false (no class applied)
          if (
            expression.type === "Literal" &&
            (expression.value === null ||
              expression.value === false ||
              expression.value === undefined)
          ) {
            return;
          }

          // Allow string literals: className={"..."}
          if (
            expression.type === "Literal" &&
            typeof expression.value === "string"
          ) {
            return;
          }

          // Allow identifier expressions: className={styles}
          if (expression.type === "Identifier") {
            return;
          }

          // Allow member expressions: className={styles.foo}
          if (expression.type === "MemberExpression") {
            return;
          }

          // Allow cn() call expressions: className={cn(...)}
          if (expression.type === "CallExpression") {
            const callee = expression.callee;
            if (callee.type === "Identifier" && callee.name === "cn") {
              return;
            }
            // Also allow member expressions like utils.cn
            if (
              callee.type === "MemberExpression" &&
              callee.property.type === "Identifier" &&
              callee.property.name === "cn"
            ) {
              return;
            }
          }

          // Everything else is disallowed
          context.report({
            node: expression,
            message:
              "className interpolation must use the `cn` function. Use `cn(...)` for conditional classes, or a plain string/identifier if no interpolation is needed.",
          });
        }

        // Handle JSX string attribute: className="..."
        // This is allowed, so we don't need to check it
      },
    };
  },
};

const plugin = {
  meta: {
    name: "require-cn-classname",
  },
  rules: {
    "require-cn-classname": requireCnClassNameRule,
  },
};

export default plugin;
