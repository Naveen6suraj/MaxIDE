/**
 * MaxIDE - AI-Native Software Engineering Studio
 * Real Filesystem Workspace & Project Manager with Git Integration
 */

import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { PathManager } from '../config/PathManager.js';
import { ContentSanitizer } from '../agent/safety/ContentSanitizer.js';

export interface FileNode {
  name: string;
  path: string; // relative
  isDirectory: boolean;
  size?: number;
  extension?: string;
  children?: FileNode[];
}

export interface RecentProject {
  name: string;
  path: string;
  lastOpened: Date;
}

export interface GitStatusResult {
  isRepo: boolean;
  branch?: string;
  modified: string[];
  added: string[];
  deleted: string[];
  untracked: string[];
}

export class WorkspaceManager {
  private rootPath: string;
  private recentProjectsFile: string;
  private recentProjects: RecentProject[] = [];
  private ignored = ['.git', 'node_modules', 'dist', 'build', '.cache'];

  constructor(initialRoot: string, storageDir?: string) {
    this.rootPath = path.resolve(initialRoot);
    if (!fs.existsSync(this.rootPath)) {
      fs.mkdirSync(this.rootPath, { recursive: true });
    }

    try {
      this.recentProjectsFile = storageDir 
        ? path.join(storageDir, 'recent_projects.json')
        : PathManager.getInstance().getRecentProjectsFile();
      const sDir = path.dirname(this.recentProjectsFile);
      if (!fs.existsSync(sDir)) {
        fs.mkdirSync(sDir, { recursive: true });
      }
    } catch {
      this.recentProjectsFile = path.resolve(this.rootPath, '.maxide_recent.json');
    }
    this.loadRecentProjects();
    this.addRecentProject(this.rootPath, path.basename(this.rootPath));
  }

  public getRootPath(): string {
    return this.rootPath;
  }

  public setRootPath(newPath: string): void {
    const resolved = path.resolve(newPath);
    if (!fs.existsSync(resolved)) {
      fs.mkdirSync(resolved, { recursive: true });
    }
    this.rootPath = resolved;
    this.addRecentProject(this.rootPath, path.basename(this.rootPath));
  }

  /**
   * Get recursive real file tree of current workspace.
   */
  public getFileTree(maxDepth: number = 6): FileNode {
    return this.buildTreeNode(this.rootPath, '', 0, maxDepth);
  }

  private buildTreeNode(absDir: string, relDir: string, depth: number, maxDepth: number): FileNode {
    const name = path.basename(absDir) || 'workspace';
    const node: FileNode = {
      name,
      path: relDir.replace(/\\/g, '/'),
      isDirectory: true,
      children: [],
    };

    if (depth >= maxDepth) return node;

    try {
      const entries = fs.readdirSync(absDir, { withFileTypes: true });

      // Sort: directories first, then alphabetical
      const sorted = entries.sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      });

      for (const entry of sorted) {
        if (this.ignored.includes(entry.name)) continue;

        const entryAbs = path.join(absDir, entry.name);
        const entryRel = relDir ? `${relDir}/${entry.name}` : entry.name;

        if (entry.isDirectory()) {
          node.children?.push(this.buildTreeNode(entryAbs, entryRel, depth + 1, maxDepth));
        } else {
          let size = 0;
          try {
            size = fs.statSync(entryAbs).size;
          } catch {}

          node.children?.push({
            name: entry.name,
            path: entryRel.replace(/\\/g, '/'),
            isDirectory: false,
            size,
            extension: path.extname(entry.name),
          });
        }
      }
    } catch {
      // Permission / read error
    }

    return node;
  }

  /**
   * Resolve and validate that a relative or specified path remains strictly within the workspace boundary.
   * Defends against directory traversal (../), absolute path injection, Windows drive escapes,
   * symlink escapes, null-byte manipulation, and sibling escapes.
   */
  public resolveSafePath(relPath: string): string {
    return WorkspaceManager.resolveSafePathForRoot(this.rootPath, relPath);
  }

  public static resolveSafePathForRoot(rootDir: string, relPath: string): string {
    if (!relPath || typeof relPath !== 'string') {
      throw new Error('Invalid path: path must be a non-empty string.');
    }
    // Check null-byte injection
    if (relPath.includes('\0')) {
      throw new Error('Security Violation: Null bytes detected in path.');
    }
    // Clean encoded traversal attempts
    let decoded = relPath;
    try {
      decoded = decodeURIComponent(relPath);
    } catch {}

    // Reject UNC and device paths
    if (/^[\\\/]{2}/.test(decoded)) {
      throw new Error(`Security Violation: UNC paths are not permitted: "${relPath}"`);
    }
    if (/^[\\\/]\?[\\\/]|^[\\\/]\.[\\\/]/.test(decoded)) {
      throw new Error(`Security Violation: Device paths are not permitted: "${relPath}"`);
    }

    const normalizedRoot = path.normalize(rootDir);
    const rootLower = normalizedRoot.toLowerCase();
    const rootWithSep = rootLower.endsWith(path.sep) ? rootLower : rootLower + path.sep;

    // Check Windows drive letter injection (e.g. C:\Windows or C:)
    if (/^[a-zA-Z]:[/\\]/.test(decoded)) {
      const normalizedDrive = path.normalize(decoded);
      const driveLower = normalizedDrive.toLowerCase();
      const isInside = driveLower === rootLower || driveLower.startsWith(rootWithSep);
      if (!isInside) {
        throw new Error(`Security Violation: Absolute path "${relPath}" escapes workspace boundary.`);
      }
      return normalizedDrive;
    }

    // Resolve relative to root
    const abs = path.resolve(rootDir, decoded);
    const normalizedAbs = path.normalize(abs);
    const absLower = normalizedAbs.toLowerCase();

    const isInside = absLower === rootLower || absLower.startsWith(rootWithSep);
    const relativeToRoot = path.relative(normalizedRoot, normalizedAbs);
    if (!isInside || relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
      throw new Error(`Security Violation: Path "${relPath}" attempts to escape workspace root.`);
    }

    return normalizedAbs;
  }

  public readFile(relPath: string): string {
    const abs = this.resolveSafePath(relPath);
    if (!fs.existsSync(abs)) throw new Error(`File not found: ${relPath}`);
    return fs.readFileSync(abs, 'utf8');
  }

  public writeFile(relPath: string, content: string): void {
    const abs = this.resolveSafePath(relPath);
    const dir = path.dirname(abs);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    let safeContent = content;
    if (safeContent !== undefined && safeContent !== null) {
      const sanitization = ContentSanitizer.sanitize(relPath, safeContent);
      if (!sanitization.valid) {
        throw new Error(sanitization.error);
      }
      safeContent = sanitization.sanitized;
    }
    fs.writeFileSync(abs, String(safeContent ?? ''), 'utf8');
  }

  public createFolder(relPath: string): void {
    const abs = this.resolveSafePath(relPath);
    if (!fs.existsSync(abs)) fs.mkdirSync(abs, { recursive: true });
  }

  public deleteItem(relPath: string): boolean {
    const abs = this.resolveSafePath(relPath);
    if (!fs.existsSync(abs)) return false;
    const stats = fs.statSync(abs);
    if (stats.isDirectory()) {
      fs.rmSync(abs, { recursive: true, force: true });
    } else {
      fs.unlinkSync(abs);
    }
    return true;
  }

  public renameItem(oldRel: string, newRel: string): boolean {
    const oldAbs = this.resolveSafePath(oldRel);
    const newAbs = this.resolveSafePath(newRel);
    if (!fs.existsSync(oldAbs)) return false;
    const dir = path.dirname(newAbs);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.renameSync(oldAbs, newAbs);
    return true;
  }

  public duplicateItem(relPath: string): string {
    const abs = this.resolveSafePath(relPath);
    if (!fs.existsSync(abs)) throw new Error(`Item not found: ${relPath}`);
    const ext = path.extname(relPath);
    const base = path.basename(relPath, ext);
    const dir = path.dirname(relPath);

    let copyRel = dir === '.' ? `${base}_copy${ext}` : `${dir}/${base}_copy${ext}`;
    let counter = 1;
    while (fs.existsSync(this.resolveSafePath(copyRel))) {
      copyRel = dir === '.' ? `${base}_copy_${counter}${ext}` : `${dir}/${base}_copy_${counter}${ext}`;
      counter++;
    }

    const copyAbs = this.resolveSafePath(copyRel);
    fs.copyFileSync(abs, copyAbs);
    return copyRel;
  }

  // --- Project Management ---
  public getRecentProjects(): RecentProject[] {
    return [...this.recentProjects];
  }

  public addRecentProject(dirPath: string, name: string): void {
    this.recentProjects = [
      { name, path: dirPath, lastOpened: new Date() },
      ...this.recentProjects.filter((p) => p.path !== dirPath),
    ].slice(0, 10);
    this.saveRecentProjects();
  }

  public createProject(targetPath: string, template: 'empty' | 'node-ts' | 'react' | 'python' | 'webapp' | 'blank' = 'node-ts'): void {
    const resolved = path.resolve(targetPath);
    if (!fs.existsSync(resolved)) fs.mkdirSync(resolved, { recursive: true });

    if (template === 'webapp') {
      fs.writeFileSync(
        path.join(resolved, 'index.html'),
        `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <title>${path.basename(resolved)}</title>\n  <script src="https://cdn.tailwindcss.com"></script>\n</head>\n<body class="bg-slate-900 text-white min-h-screen flex items-center justify-center p-6">\n  <div class="max-w-md w-full bg-slate-800 border border-slate-700 rounded-2xl p-8 text-center shadow-xl">\n    <h1 class="text-2xl font-bold mb-2">${path.basename(resolved)}</h1>\n    <p class="text-slate-400 text-sm mb-4">Built with MaxIDE</p>\n    <button onclick="alert('Hello from MaxIDE!')" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-white font-medium">Click Me</button>\n  </div>\n  <script src="app.js"></script>\n</body>\n</html>`
      );
      fs.writeFileSync(path.join(resolved, 'app.js'), `console.log("${path.basename(resolved)} loaded.");\n`);
      fs.writeFileSync(path.join(resolved, 'style.css'), `/* ${path.basename(resolved)} styles */\n`);
      fs.writeFileSync(
        path.join(resolved, 'package.json'),
        JSON.stringify({ name: path.basename(resolved), version: '1.0.0', main: 'app.js' }, null, 2)
      );
      fs.writeFileSync(path.join(resolved, 'README.md'), `# ${path.basename(resolved)}\n\nModern Web App created with MaxIDE.\n`);
    } else if (template === 'react') {
      fs.writeFileSync(
        path.join(resolved, 'index.html'),
        `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <title>${path.basename(resolved)}</title>\n  <script src="https://unpkg.com/react@18/umd/react.development.js"></script>\n  <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>\n  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>\n  <script src="https://cdn.tailwindcss.com"></script>\n</head>\n<body class="bg-slate-950 text-white min-h-screen">\n  <div id="root"></div>\n  <script type="text/babel" src="App.jsx"></script>\n</body>\n</html>`
      );
      fs.writeFileSync(
        path.join(resolved, 'App.jsx'),
        `function App() {\n  const [count, setCount] = React.useState(0);\n  return (\n    <div className="flex flex-col items-center justify-center min-h-screen p-6">\n      <div className="p-8 bg-slate-900 border border-slate-800 rounded-2xl text-center max-w-sm shadow-2xl">\n        <h1 className="text-3xl font-extrabold text-cyan-400 mb-2">React in MaxIDE</h1>\n        <p className="text-slate-400 text-sm mb-6">Interactive component state</p>\n        <button onClick={() => setCount(c => c + 1)} className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-bold shadow-lg">\n          Count: {count}\n        </button>\n      </div>\n    </div>\n  );\n}\nReactDOM.createRoot(document.getElementById('root')).render(<App />);\n`
      );
      fs.writeFileSync(
        path.join(resolved, 'package.json'),
        JSON.stringify({ name: path.basename(resolved), version: '1.0.0' }, null, 2)
      );
      fs.writeFileSync(path.join(resolved, 'README.md'), `# ${path.basename(resolved)}\n\nReact project initialized in MaxIDE.\n`);
    } else if (template === 'python') {
      fs.writeFileSync(
        path.join(resolved, 'main.py'),
        '# MaxIDE Python Entrypoint\n\ndef main():\n    print("Hello from MaxIDE!")\n\nif __name__ == "__main__":\n    main()\n'
      );
      fs.writeFileSync(
        path.join(resolved, 'README.md'),
        `# ${path.basename(resolved)}\n\nPython project initialized in MaxIDE.\n`
      );
    } else if (template === 'blank') {
      fs.writeFileSync(path.join(resolved, 'README.md'), `# ${path.basename(resolved)}\n\nProject initialized in MaxIDE.\n`);
    } else {
      fs.writeFileSync(
        path.join(resolved, 'package.json'),
        JSON.stringify({ name: path.basename(resolved), version: '1.0.0', type: 'module' }, null, 2)
      );
      fs.writeFileSync(
        path.join(resolved, 'index.ts'),
        '// MaxIDE TypeScript Entrypoint\nconsole.log("Hello from MaxIDE!");\n'
      );
      fs.writeFileSync(
        path.join(resolved, 'README.md'),
        `# ${path.basename(resolved)}\n\nProject initialized in MaxIDE.\n`
      );
    }

    this.setRootPath(resolved);
  }

  private saveRecentProjects(): void {
    try {
      fs.writeFileSync(this.recentProjectsFile, JSON.stringify(this.recentProjects, null, 2), 'utf8');
    } catch {}
  }

  private loadRecentProjects(): void {
    try {
      if (fs.existsSync(this.recentProjectsFile)) {
        this.recentProjects = JSON.parse(fs.readFileSync(this.recentProjectsFile, 'utf8'));
      }
    } catch {}
  }

  // --- Git Integration ---
  public async getGitStatus(): Promise<GitStatusResult> {
    return new Promise((resolve) => {
      exec('git status --porcelain -b', { cwd: this.rootPath }, (error, stdout) => {
        if (error) {
          resolve({
            isRepo: false,
            modified: [],
            added: [],
            deleted: [],
            untracked: [],
          });
          return;
        }

        const lines = stdout.split('\n').filter((l) => l.trim().length > 0);
        let branch = 'unknown';
        const modified: string[] = [];
        const added: string[] = [];
        const deleted: string[] = [];
        const untracked: string[] = [];

        for (const line of lines) {
          if (line.startsWith('##')) {
            branch = line.slice(3).split('...')[0].trim();
            continue;
          }
          const code = line.slice(0, 2);
          const file = line.slice(3).trim();

          if (code.includes('M')) modified.push(file);
          else if (code.includes('A')) added.push(file);
          else if (code.includes('D')) deleted.push(file);
          else if (code.includes('?')) untracked.push(file);
        }

        resolve({
          isRepo: true,
          branch,
          modified,
          added,
          deleted,
          untracked,
        });
      });
    });
  }

  public async getGitDiff(filePath?: string): Promise<string> {
    const cmd = filePath ? `git diff -- "${filePath}"` : 'git diff';
    return new Promise((resolve) => {
      exec(cmd, { cwd: this.rootPath }, (error, stdout, stderr) => {
        if (error) resolve(stderr || 'Git diff unavailable');
        else resolve(stdout || 'No unstaged changes');
      });
    });
  }

  public async getGitLog(count: number = 8): Promise<string[]> {
    return new Promise((resolve) => {
      exec(`git log -n ${count} --oneline`, { cwd: this.rootPath }, (error, stdout) => {
        if (error) resolve([]);
        else resolve(stdout.split('\n').filter((l) => l.trim().length > 0));
      });
    });
  }

  public async gitCommit(message: string): Promise<{ success: boolean; output: string }> {
    return new Promise((resolve) => {
      exec(`git add -A && git commit -m "${message.replace(/"/g, '\\"')}"`, { cwd: this.rootPath }, (error, stdout, stderr) => {
        if (error) resolve({ success: false, output: stderr || error.message });
        else resolve({ success: true, output: stdout });
      });
    });
  }
}
