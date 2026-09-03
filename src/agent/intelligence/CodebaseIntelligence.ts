/**
 * Orbit IDE - Unlimited AI Provider Platform
 * Codebase Intelligence & Semantic Indexing
 * 
 * Includes:
 * - ProjectIndexer: Scans and caches workspace structure
 * - SymbolIndex: Extracts functions, classes, interfaces, and variables
 * - DependencyGraph: Tracks imports and dependents across files
 * - CodeSearch: High-speed text & regex search
 * - ContextBuilder & ContextRanker: Curates token-budgeted relevant context
 * - TokenBudgetManager: Prevents context window overflow
 */

import fs from 'fs';
import path from 'path';

export interface CodeSymbol {
  name: string;
  kind: 'function' | 'class' | 'interface' | 'variable' | 'component' | 'type';
  file: string; // relative
  line: number;
  signature?: string;
  snippet?: string;
}

export interface FileDependency {
  file: string;
  imports: string[]; // resolved relative paths
  dependents: string[]; // files that import this file
}

export interface SearchMatch {
  file: string;
  line: number;
  content: string;
  score: number;
}

export class CodebaseIntelligence {
  private workspaceRoot: string;
  private symbols: Map<string, CodeSymbol[]> = new Map(); // symbolName -> symbols
  private fileSymbols: Map<string, CodeSymbol[]> = new Map(); // filePath -> symbols
  private dependencyGraph: Map<string, FileDependency> = new Map(); // filePath -> dependency
  private fileIndex: Map<string, string> = new Map(); // filePath -> content
  private ignoredPatterns = ['node_modules', '.git', 'dist', 'build', '.cache'];

  constructor(workspaceRoot: string) {
    this.workspaceRoot = path.resolve(workspaceRoot);
  }

  public setWorkspaceRoot(newRoot: string): void {
    this.workspaceRoot = path.resolve(newRoot);
    this.clear();
  }

  public clear(): void {
    this.symbols.clear();
    this.fileSymbols.clear();
    this.dependencyGraph.clear();
    this.fileIndex.clear();
  }

  private isIgnored(relPath: string): boolean {
    const parts = relPath.split(/[/\\]/);
    return parts.some((p) => this.ignoredPatterns.includes(p));
  }

  /**
   * Scan and index the entire project repository.
   */
  public async indexProject(): Promise<{ filesIndexed: number; symbolsIndexed: number }> {
    this.clear();
    this.scanAndIndexDir(this.workspaceRoot);

    // Build reverse dependents in dependency graph
    for (const [filePath, dep] of this.dependencyGraph) {
      for (const imported of dep.imports) {
        if (!this.dependencyGraph.has(imported)) {
          this.dependencyGraph.set(imported, { file: imported, imports: [], dependents: [] });
        }
        const targetDep = this.dependencyGraph.get(imported)!;
        if (!targetDep.dependents.includes(filePath)) {
          targetDep.dependents.push(filePath);
        }
      }
    }

    let totalSymbols = 0;
    for (const [, syms] of this.fileSymbols) {
      totalSymbols += syms.length;
    }

    return {
      filesIndexed: this.fileIndex.size,
      symbolsIndexed: totalSymbols,
    };
  }

  private scanAndIndexDir(dir: string): void {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = path.relative(this.workspaceRoot, fullPath).replace(/\\/g, '/');

      if (this.isIgnored(relPath)) continue;

      if (entry.isDirectory()) {
        this.scanAndIndexDir(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (['.ts', '.tsx', '.js', '.jsx', '.py', '.json', '.html', '.css', '.md'].includes(ext)) {
          try {
            const stats = fs.statSync(fullPath);
            if (stats.size < 2 * 1024 * 1024) {
              const content = fs.readFileSync(fullPath, 'utf8');
              this.fileIndex.set(relPath, content);
              this.extractSymbols(relPath, content);
              this.extractDependencies(relPath, content);
            }
          } catch {
            // skip
          }
        }
      }
    }
  }

  private extractSymbols(relPath: string, content: string): void {
    const lines = content.split('\n');
    const symbolsInFile: CodeSymbol[] = [];

    lines.forEach((line, idx) => {
      const lineNum = idx + 1;
      const trimmed = line.trim();

      // TS/JS Function / Arrow Function
      const fnMatch = trimmed.match(/(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z0-9_$]+)/);
      if (fnMatch) {
        symbolsInFile.push({
          name: fnMatch[1],
          kind: 'function',
          file: relPath,
          line: lineNum,
          signature: trimmed,
        });
      }

      const constFnMatch = trimmed.match(/(?:export\s+)?const\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s*)?\(/);
      if (constFnMatch) {
        const isComponent = /^[A-Z]/.test(constFnMatch[1]);
        symbolsInFile.push({
          name: constFnMatch[1],
          kind: isComponent ? 'component' : 'function',
          file: relPath,
          line: lineNum,
          signature: trimmed,
        });
      }

      // Class
      const classMatch = trimmed.match(/(?:export\s+)?class\s+([a-zA-Z0-9_$]+)/);
      if (classMatch) {
        symbolsInFile.push({
          name: classMatch[1],
          kind: 'class',
          file: relPath,
          line: lineNum,
          signature: trimmed,
        });
      }

      // Interface & Type
      const ifaceMatch = trimmed.match(/(?:export\s+)?interface\s+([a-zA-Z0-9_$]+)/);
      if (ifaceMatch) {
        symbolsInFile.push({
          name: ifaceMatch[1],
          kind: 'interface',
          file: relPath,
          line: lineNum,
          signature: trimmed,
        });
      }

      const typeMatch = trimmed.match(/(?:export\s+)?type\s+([a-zA-Z0-9_$]+)\s*=/);
      if (typeMatch) {
        symbolsInFile.push({
          name: typeMatch[1],
          kind: 'type',
          file: relPath,
          line: lineNum,
          signature: trimmed,
        });
      }

      // Python def / class
      const pyDef = trimmed.match(/^def\s+([a-zA-Z0-9_]+)\s*\(/);
      if (pyDef) {
        symbolsInFile.push({
          name: pyDef[1],
          kind: 'function',
          file: relPath,
          line: lineNum,
          signature: trimmed,
        });
      }
      const pyClass = trimmed.match(/^class\s+([a-zA-Z0-9_]+)/);
      if (pyClass) {
        symbolsInFile.push({
          name: pyClass[1],
          kind: 'class',
          file: relPath,
          line: lineNum,
          signature: trimmed,
        });
      }
    });

    this.fileSymbols.set(relPath, symbolsInFile);

    for (const sym of symbolsInFile) {
      if (!this.symbols.has(sym.name)) {
        this.symbols.set(sym.name, []);
      }
      this.symbols.get(sym.name)!.push(sym);
    }
  }

  private extractDependencies(relPath: string, content: string): void {
    const imports: string[] = [];
    const dir = path.dirname(relPath);

    // import ... from './foo' or require('./foo')
    const importRegex = /(?:import\s+.*?from\s+['"](.*?)['"]|require\(['"](.*?)['"]\))/g;
    let match: RegExpExecArray | null;

    while ((match = importRegex.exec(content)) !== null) {
      const target = match[1] || match[2];
      if (target && target.startsWith('.')) {
        // Resolve relative path
        const resolved = path.normalize(path.join(dir, target)).replace(/\\/g, '/');
        // Check with possible extensions
        const possible = [
          resolved,
          `${resolved}.ts`,
          `${resolved}.tsx`,
          `${resolved}.js`,
          `${resolved}.jsx`,
          `${resolved}/index.ts`,
          `${resolved}/index.js`,
        ];
        const matchFound = possible.find((p) => this.fileIndex.has(p) || fs.existsSync(path.resolve(this.workspaceRoot, p)));
        if (matchFound) {
          imports.push(matchFound);
        } else {
          imports.push(resolved);
        }
      }
    }

    this.dependencyGraph.set(relPath, {
      file: relPath,
      imports,
      dependents: [],
    });
  }

  /**
   * Full text search across all indexed files (CodeSearch).
   */
  public searchCode(query: string, maxResults: number = 20): SearchMatch[] {
    const results: SearchMatch[] = [];
    const lowerQuery = query.toLowerCase();
    const isRegex = query.startsWith('/') && query.endsWith('/');
    let regex: RegExp | null = null;
    if (isRegex) {
      try {
        regex = new RegExp(query.slice(1, -1), 'i');
      } catch {
        regex = null;
      }
    }

    for (const [relPath, content] of this.fileIndex) {
      const lines = content.split('\n');
      lines.forEach((line, idx) => {
        let matched = false;
        if (regex) {
          matched = regex.test(line);
        } else {
          matched = line.toLowerCase().includes(lowerQuery);
        }

        if (matched) {
          let score = 10;
          if (line.toLowerCase().includes(`function ${lowerQuery}`)) score += 30;
          if (line.toLowerCase().includes(`class ${lowerQuery}`)) score += 30;
          if (relPath.toLowerCase().includes(lowerQuery)) score += 20;

          results.push({
            file: relPath,
            line: idx + 1,
            content: line.trim(),
            score,
          });
        }
      });
    }

    return results.sort((a, b) => b.score - a.score).slice(0, maxResults);
  }

  /**
   * Find symbol definitions by name.
   */
  public findSymbols(name: string): CodeSymbol[] {
    return this.symbols.get(name) || [];
  }

  /**
   * Get files that depend on the specified file.
   */
  public getDependents(filePath: string): string[] {
    const clean = filePath.replace(/\\/g, '/');
    return this.dependencyGraph.get(clean)?.dependents || [];
  }

  /**
   * Get files that the specified file imports.
   */
  public getImports(filePath: string): string[] {
    const clean = filePath.replace(/\\/g, '/');
    return this.dependencyGraph.get(clean)?.imports || [];
  }

  /**
   * ContextBuilder: Builds ranked, token-budgeted context for an agent query.
   * Avoids flooding LLM context window with entire repository.
   */
  public buildContext(query: string, maxTokenBudget: number = 3000): string {
    const approxCharsPerToken = 4;
    const maxChars = maxTokenBudget * approxCharsPerToken;

    let context = '';
    const addedFiles = new Set<string>();

    // 1. Check for symbol matches in query
    const words = query.split(/[\s,.:;()'"/?!]+/);
    for (const word of words) {
      if (word.length >= 3 && this.symbols.has(word)) {
        const syms = this.symbols.get(word)!;
        for (const sym of syms.slice(0, 3)) {
          context += `[SYMBOL] ${sym.kind} "${sym.name}" in ${sym.file}:${sym.line}\n${sym.signature || ''}\n\n`;
          addedFiles.add(sym.file);
        }
      }
    }

    // 2. Perform code search for keyword matches
    const searchMatches = this.searchCode(query, 10);
    for (const match of searchMatches) {
      if (context.length >= maxChars) break;
      context += `[MATCH] ${match.file}:${match.line} -> ${match.content}\n`;
      addedFiles.add(match.file);
    }

    // 3. Include high-relevance file snippets
    for (const file of addedFiles) {
      if (context.length >= maxChars) break;
      const content = this.fileIndex.get(file);
      if (content) {
        const snippet = content.slice(0, 800);
        context += `\n--- File: ${file} ---\n${snippet}\n`;
      }
    }

    if (!context) {
      // General structure fallback
      const topFiles = Array.from(this.fileIndex.keys()).slice(0, 15);
      context = `Repository structure:\n${topFiles.join('\n')}\n`;
    }

    return context.slice(0, maxChars);
  }
}
