/**
 * Discover - Component Discovery from ts-morph Project
 *
 * Finds exported React components in a ts-morph Project by checking for:
 * - Default exports that are functions with a typed props parameter
 * - Named exports whose return type suggests JSX output
 *
 * Only .tsx files are inspected since components must return JSX.
 */

import {
  type Project,
  type SourceFile,
  SyntaxKind,
  type FunctionDeclaration,
  type VariableDeclaration,
  type ArrowFunction,
  type FunctionExpression,
} from "ts-morph";
import type { ComponentInfo, LoaderInfo } from "./types.js";

/**
 * JSX return type indicators. If a function's return type text contains any of
 * these, it's likely a React component.
 */
const JSX_RETURN_PATTERNS = [
  "JSX.Element",
  "ReactNode",
  "ReactElement",
  "React.FC",
  "React.FunctionComponent",
  "Element",
];

/**
 * Discover exported React components in the project's .tsx source files.
 *
 * @param project - ts-morph Project populated with source files
 * @returns Array of discovered components with their metadata
 */
export function discoverComponents(project: Project): ComponentInfo[] {
  const components: ComponentInfo[] = [];

  for (const sourceFile of project.getSourceFiles()) {
    const filePath = sourceFile.getFilePath();
    if (!filePath.endsWith(".tsx")) continue;

    // Try default export first (most common pattern for React components)
    const defaultComponent = extractDefaultExport(sourceFile, filePath);
    if (defaultComponent) {
      components.push(defaultComponent);
      continue; // One component per file for default exports
    }

    // Check named exports for component-like functions
    const namedComponents = extractNamedExports(sourceFile, filePath);
    components.push(...namedComponents);
  }

  return components;
}

/**
 * Extract component info from a file's default export.
 */
function extractDefaultExport(
  sourceFile: SourceFile,
  filePath: string,
): ComponentInfo | null {
  const defaultExportSymbol = sourceFile.getDefaultExportSymbol();
  if (!defaultExportSymbol) return null;

  const declarations = defaultExportSymbol.getDeclarations();

  for (const decl of declarations) {
    // Pattern: export default function Hero(props: HeroProps) { ... }
    if (decl.isKind(SyntaxKind.FunctionDeclaration)) {
      return extractFromFunction(
        decl as FunctionDeclaration,
        sourceFile,
        filePath,
      );
    }

    // Pattern: export default (props: HeroProps) => { ... }
    // or: const Hero = (props: HeroProps) => { ... }; export default Hero;
    if (decl.isKind(SyntaxKind.VariableDeclaration)) {
      const varDecl = decl as VariableDeclaration;
      const initializer = varDecl.getInitializer();

      if (
        initializer?.isKind(SyntaxKind.ArrowFunction) ||
        initializer?.isKind(SyntaxKind.FunctionExpression)
      ) {
        const fn = initializer as ArrowFunction | FunctionExpression;
        return extractFromCallable(fn, varDecl.getName(), sourceFile, filePath);
      }
    }

    // Pattern: export default expression (may resolve to a function)
    if (decl.isKind(SyntaxKind.ExportAssignment)) {
      // Try to resolve the expression
      const expr = decl.getExpression();
      if (!expr) continue;

      // If it's an identifier referencing a variable/function
      const symbol = expr.getSymbol();
      if (!symbol) continue;

      for (const symDecl of symbol.getDeclarations()) {
        if (symDecl.isKind(SyntaxKind.FunctionDeclaration)) {
          return extractFromFunction(
            symDecl as FunctionDeclaration,
            sourceFile,
            filePath,
          );
        }
        if (symDecl.isKind(SyntaxKind.VariableDeclaration)) {
          const init = (symDecl as VariableDeclaration).getInitializer();
          if (
            init?.isKind(SyntaxKind.ArrowFunction) ||
            init?.isKind(SyntaxKind.FunctionExpression)
          ) {
            return extractFromCallable(
              init as ArrowFunction | FunctionExpression,
              (symDecl as VariableDeclaration).getName(),
              sourceFile,
              filePath,
            );
          }
        }
      }
    }
  }

  return null;
}

/**
 * Extract component info from a function declaration.
 */
function extractFromFunction(
  fn: FunctionDeclaration,
  sourceFile: SourceFile,
  filePath: string,
): ComponentInfo | null {
  const params = fn.getParameters();
  if (params.length === 0) return null; // No props = no editable props

  const propsParam = params[0];
  const propsType = propsParam.getType();
  const propsTypeName =
    propsType.getAliasSymbol()?.getName() ??
    propsType.getSymbol()?.getName() ??
    null;

  // Skip if the type resolved to an anonymous/literal type with no properties
  if (!propsTypeName && propsType.getProperties().length === 0) return null;

  return {
    name: fn.getName() ?? sourceFile.getBaseNameWithoutExtension(),
    filePath,
    propsTypeName,
    jsDocDescription: extractJsDoc(fn),
  };
}

/**
 * Extract component info from an arrow function or function expression.
 */
function extractFromCallable(
  fn: ArrowFunction | FunctionExpression,
  name: string,
  sourceFile: SourceFile,
  filePath: string,
): ComponentInfo | null {
  const params = fn.getParameters();
  if (params.length === 0) return null;

  const propsParam = params[0];
  const propsType = propsParam.getType();
  const propsTypeName =
    propsType.getAliasSymbol()?.getName() ??
    propsType.getSymbol()?.getName() ??
    null;

  if (!propsTypeName && propsType.getProperties().length === 0) return null;

  return {
    name: name || sourceFile.getBaseNameWithoutExtension(),
    filePath,
    propsTypeName,
    jsDocDescription: extractJsDocFromParent(fn),
  };
}

/**
 * Extract named component exports (functions returning JSX types).
 */
function extractNamedExports(
  sourceFile: SourceFile,
  filePath: string,
): ComponentInfo[] {
  const components: ComponentInfo[] = [];

  const exportedDeclarations = sourceFile.getExportedDeclarations();

  for (const [name, declarations] of exportedDeclarations) {
    if (name === "default") continue; // Already handled

    for (const decl of declarations) {
      if (decl.isKind(SyntaxKind.FunctionDeclaration)) {
        const fn = decl as FunctionDeclaration;
        const returnTypeText = fn.getReturnType().getText();

        if (looksLikeJSX(returnTypeText)) {
          const info = extractFromFunction(fn, sourceFile, filePath);
          if (info) {
            info.name = name; // Use the export name
            components.push(info);
          }
        }
      }

      if (decl.isKind(SyntaxKind.VariableDeclaration)) {
        const varDecl = decl as VariableDeclaration;
        const init = varDecl.getInitializer();
        if (
          init?.isKind(SyntaxKind.ArrowFunction) ||
          init?.isKind(SyntaxKind.FunctionExpression)
        ) {
          const fn = init as ArrowFunction | FunctionExpression;
          const returnTypeText = fn.getReturnType().getText();

          if (looksLikeJSX(returnTypeText)) {
            const info = extractFromCallable(fn, name, sourceFile, filePath);
            if (info) {
              components.push(info);
            }
          }
        }
      }
    }
  }

  return components;
}

/**
 * Check if a return type text indicates JSX output.
 */
function looksLikeJSX(returnTypeText: string): boolean {
  return JSX_RETURN_PATTERNS.some((pattern) =>
    returnTypeText.includes(pattern),
  );
}

/**
 * Extract JSDoc description from a function declaration.
 */
function extractJsDoc(fn: FunctionDeclaration): string {
  const jsDocs = fn.getJsDocs();
  if (jsDocs.length === 0) return "";

  const lastDoc = jsDocs[jsDocs.length - 1];

  // Try @description tag first
  const descTag = lastDoc
    .getTags()
    .find((t) => t.getTagName() === "description");
  if (descTag) {
    return descTag.getCommentText()?.trim() ?? "";
  }

  // Fall back to the main comment body
  return lastDoc.getDescription()?.trim() ?? "";
}

/**
 * Extract JSDoc from parent node (for arrow functions in variable declarations).
 */
function extractJsDocFromParent(
  fn: ArrowFunction | FunctionExpression,
): string {
  const parent = fn.getParent();
  if (!parent) return "";

  // Walk up to the variable statement which can hold JSDoc
  const varStatement = parent.getParent();
  if (varStatement?.isKind(SyntaxKind.VariableStatement)) {
    const jsDocs = varStatement.getJsDocs();
    if (jsDocs.length > 0) {
      const lastDoc = jsDocs[jsDocs.length - 1];
      const descTag = lastDoc
        .getTags()
        .find((t) => t.getTagName() === "description");
      if (descTag) {
        return descTag.getCommentText()?.trim() ?? "";
      }
      return lastDoc.getDescription()?.trim() ?? "";
    }
  }

  return "";
}

// ---------------------------------------------------------------------------
// Loader discovery
// ---------------------------------------------------------------------------

/**
 * Unwrap Promise<T> from a return type text, returning the inner type text.
 * Also strips trailing `| null` and `| undefined` for cleaner type name lookup.
 */
function unwrapPromise(typeText: string): string {
  let inner = typeText;

  // Unwrap Promise<...>
  const promiseMatch = inner.match(/^Promise<(.+)>$/s);
  if (promiseMatch) {
    inner = promiseMatch[1];
  }

  return inner;
}

/**
 * Strip nullable wrappers (| null | undefined) to get the core type name.
 */
function stripNullable(typeText: string): string {
  return typeText
    .split("|")
    .map((s) => s.trim())
    .filter((s) => s !== "null" && s !== "undefined")
    .join(" | ");
}

/**
 * Discover exported loader functions in the project's .ts source files.
 *
 * Loaders differ from components:
 * - Only .ts files (not .tsx)
 * - Default-exported async functions that do NOT return JSX
 * - Extract both input Props type and return type
 * - Zero-parameter loaders are valid (propsTypeName = null)
 *
 * @param project - ts-morph Project populated with source files
 * @returns Array of discovered loaders with their metadata
 */
export function discoverLoaders(project: Project): LoaderInfo[] {
  const loaders: LoaderInfo[] = [];

  for (const sourceFile of project.getSourceFiles()) {
    const filePath = sourceFile.getFilePath();

    // Only scan .ts files, skip .tsx (those are components)
    if (!filePath.endsWith(".ts") || filePath.endsWith(".d.ts")) continue;

    const defaultExportSymbol = sourceFile.getDefaultExportSymbol();
    if (!defaultExportSymbol) continue;

    const declarations = defaultExportSymbol.getDeclarations();

    for (const decl of declarations) {
      const loaderInfo = extractLoaderFromDecl(decl, sourceFile, filePath);
      if (loaderInfo) {
        loaders.push(loaderInfo);
        break; // One loader per file
      }
    }
  }

  return loaders;
}

/**
 * Try to extract loader info from a declaration node.
 */
function extractLoaderFromDecl(
  // deno-lint-ignore no-explicit-any
  decl: any,
  sourceFile: SourceFile,
  filePath: string,
): LoaderInfo | null {
  // Direct function declaration: export default async function loader(props: Props) { ... }
  if (decl.isKind(SyntaxKind.FunctionDeclaration)) {
    return extractLoaderFromFunction(
      decl as FunctionDeclaration,
      sourceFile,
      filePath,
    );
  }

  // Variable declaration: const loader = async (props: Props) => { ... }; export default loader;
  if (decl.isKind(SyntaxKind.VariableDeclaration)) {
    const varDecl = decl as VariableDeclaration;
    const initializer = varDecl.getInitializer();

    if (
      initializer?.isKind(SyntaxKind.ArrowFunction) ||
      initializer?.isKind(SyntaxKind.FunctionExpression)
    ) {
      const fn = initializer as ArrowFunction | FunctionExpression;
      return extractLoaderFromCallable(
        fn,
        varDecl.getName(),
        sourceFile,
        filePath,
      );
    }
  }

  // Export assignment: export default expression
  if (decl.isKind(SyntaxKind.ExportAssignment)) {
    const expr = decl.getExpression();
    if (!expr) return null;

    const symbol = expr.getSymbol();
    if (!symbol) return null;

    for (const symDecl of symbol.getDeclarations()) {
      if (symDecl.isKind(SyntaxKind.FunctionDeclaration)) {
        return extractLoaderFromFunction(
          symDecl as FunctionDeclaration,
          sourceFile,
          filePath,
        );
      }
      if (symDecl.isKind(SyntaxKind.VariableDeclaration)) {
        const init = (symDecl as VariableDeclaration).getInitializer();
        if (
          init?.isKind(SyntaxKind.ArrowFunction) ||
          init?.isKind(SyntaxKind.FunctionExpression)
        ) {
          return extractLoaderFromCallable(
            init as ArrowFunction | FunctionExpression,
            (symDecl as VariableDeclaration).getName(),
            sourceFile,
            filePath,
          );
        }
      }
    }
  }

  return null;
}

/**
 * Extract loader info from a function declaration.
 * Unlike components, loaders can have zero parameters.
 */
function extractLoaderFromFunction(
  fn: FunctionDeclaration,
  sourceFile: SourceFile,
  filePath: string,
): LoaderInfo | null {
  const returnTypeText = fn.getReturnType().getText();

  // Skip if the return type looks like JSX (that's a component, not a loader)
  if (looksLikeJSX(returnTypeText)) return null;

  // Extract props type from first parameter (may be absent)
  let propsTypeName: string | null = null;
  const params = fn.getParameters();
  if (params.length > 0) {
    const propsType = params[0].getType();
    propsTypeName =
      propsType.getAliasSymbol()?.getName() ??
      propsType.getSymbol()?.getName() ??
      null;
  }

  // Extract return type name, unwrapping Promise<T>
  const returnTypeName = resolveReturnTypeName(returnTypeText);

  return {
    name: fn.getName() ?? sourceFile.getBaseNameWithoutExtension(),
    filePath,
    propsTypeName,
    returnTypeName,
    jsDocDescription: extractJsDoc(fn),
  };
}

/**
 * Extract loader info from an arrow function or function expression.
 */
function extractLoaderFromCallable(
  fn: ArrowFunction | FunctionExpression,
  name: string,
  sourceFile: SourceFile,
  filePath: string,
): LoaderInfo | null {
  const returnTypeText = fn.getReturnType().getText();

  if (looksLikeJSX(returnTypeText)) return null;

  let propsTypeName: string | null = null;
  const params = fn.getParameters();
  if (params.length > 0) {
    const propsType = params[0].getType();
    propsTypeName =
      propsType.getAliasSymbol()?.getName() ??
      propsType.getSymbol()?.getName() ??
      null;
  }

  const returnTypeName = resolveReturnTypeName(returnTypeText);

  return {
    name: name || sourceFile.getBaseNameWithoutExtension(),
    filePath,
    propsTypeName,
    returnTypeName,
    jsDocDescription: extractJsDocFromParent(fn),
  };
}

/**
 * Resolve the return type name by unwrapping Promise<> and stripping nullable.
 * Returns null if the type can't be resolved to a named type.
 */
function resolveReturnTypeName(returnTypeText: string): string | null {
  const unwrapped = unwrapPromise(returnTypeText);
  const core = stripNullable(unwrapped);

  // If the core type is a primitive or empty, return null
  if (
    !core ||
    core === "void" ||
    core === "never" ||
    core === "any" ||
    core === "unknown"
  ) {
    return null;
  }

  // If it looks like an inline/anonymous type (starts with { or contains =>),
  // return null since ts-json-schema-generator needs a named type
  if (core.startsWith("{") || core.includes("=>")) {
    return null;
  }

  return core;
}
