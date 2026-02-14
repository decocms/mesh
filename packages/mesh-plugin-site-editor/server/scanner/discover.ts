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
import type { ComponentInfo } from "./types.js";

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
