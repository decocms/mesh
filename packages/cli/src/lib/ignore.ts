import { readFileSync, existsSync } from "fs";
import { join, relative } from "path";
import ignore from "ignore";

/**
 * Create and configure ignore checker for .deconfigignore files
 * Uses the 'ignore' npm package (same as used by eslint, prettier, etc.)
 */
class DeconfigIgnore {
  private ig: ReturnType<typeof ignore>;
  private rootPath: string;
  private patternCount: number = 0;

  constructor(rootPath: string) {
    this.rootPath = rootPath;
    this.ig = ignore();
    this.loadIgnoreFiles();
  }

  /**
   * Load .deconfigignore files and add default patterns
   */
  private loadIgnoreFiles() {
    // Add default patterns first
    this.addDefaultPatterns();

    // Load from .deconfigignore file in the root directory
    const ignoreFilePath = join(this.rootPath, ".deconfigignore");
    if (existsSync(ignoreFilePath)) {
      this.loadIgnoreFile(ignoreFilePath);
    }
  }

  /**
   * Add default ignore patterns
   */
  private addDefaultPatterns() {
    const defaultPatterns = [
      "node_modules/",
      ".git/",
      ".deconfig/",
      ".DS_Store",
      "*.tmp",
      "*.temp",
      ".env.local",
      ".env.*.local",
    ];

    this.ig.add(defaultPatterns);
    this.patternCount += defaultPatterns.length;
  }

  /**
   * Load patterns from a specific .deconfigignore file
   */
  private loadIgnoreFile(filePath: string) {
    try {
      const content = readFileSync(filePath, "utf-8");
      const lines = content
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#")); // Remove empty lines and comments

      if (lines.length > 0) {
        this.ig.add(lines);
        this.patternCount += lines.length;
      }
    } catch (error) {
      console.warn(
        `Warning: Could not read ignore file ${filePath}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Check if a file path should be ignored
   */
  isIgnored(filePath: string): boolean {
    const relativePath = relative(this.rootPath, filePath);

    // Don't ignore paths outside the root
    if (relativePath.startsWith("..")) {
      return false;
    }

    // Normalize path separators to forward slashes (ignore package expects this)
    const normalizedPath = relativePath.replace(/\\/g, "/");

    return this.ig.ignores(normalizedPath);
  }

  /**
   * Filter an array of file paths, removing ignored ones
   */
  filter(filePaths: string[]): string[] {
    const relativePaths = filePaths.map((path) => {
      const rel = relative(this.rootPath, path);
      return rel.replace(/\\/g, "/");
    });

    const filtered = this.ig.filter(relativePaths);

    // Convert back to absolute paths
    return filtered.map((relPath) => join(this.rootPath, relPath));
  }

  /**
   * Get the number of loaded patterns (for logging)
   */
  getPatternCount(): number {
    return this.patternCount;
  }

  /**
   * Create RegExp patterns compatible with the walk() function
   * Since the ignore package handles complex logic, we create a single
   * RegExp that checks each path against the ignore checker
   */
  toWalkSkipPatterns(): RegExp[] {
    // Create a custom RegExp that uses the ignore checker
    const ignoreRegex = new RegExp(".*");

    // Override the test method to use our ignore logic
    ignoreRegex.test = (path: string) => {
      const relativePath = relative(this.rootPath, path);
      const normalizedPath = relativePath.replace(/\\/g, "/");
      return this.ig.ignores(normalizedPath);
    };

    return [ignoreRegex];
  }
}

/**
 * Create a DeconfigIgnore instance for a given directory
 */
export function createIgnoreChecker(rootPath: string): DeconfigIgnore {
  return new DeconfigIgnore(rootPath);
}
