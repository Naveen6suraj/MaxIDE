const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');

// 1. FileSystemTools.ts
const fstPath = path.join(repoRoot, 'src/agent/tools/FileSystemTools.ts');
let fst = fs.readFileSync(fstPath, 'utf8');

// Update readFile
const fstOldRead = 'const content = fs.readFileSync(fullPath, \'utf8\');\r\n          return { path: args.path, content };';
const fstOldReadLF = 'const content = fs.readFileSync(fullPath, \'utf8\');\n          return { path: args.path, content };';
const fstNewRead = 'const content = fs.readFileSync(fullPath, \'utf8\');\r\n          InspectionTracker.getInstance().recordInspection(\'global-default-session\', workspaceRoot, args.path);\r\n          return { path: args.path, content };';

if (fst.includes(fstOldRead)) {
  fst = fst.replace(fstOldRead, fstNewRead);
  console.log('FileSystemTools readFile updated (CRLF)');
} else if (fst.includes(fstOldReadLF)) {
  fst = fst.replace(fstOldReadLF, fstNewRead.replace(/\r\n/g, '\n'));
  console.log('FileSystemTools readFile updated (LF)');
}

// Update writeFile
const fstOldWrite = `          const fullPath = resolveSafeToolPath(workspaceRoot, filePath);
          if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {`;
const fstOldWriteCRLF = fstOldWrite.replace(/\n/g, '\r\n');
const fstNewWrite = `          if (!filePath) {
            return { error: 'Path is required to write a file', success: false };
          }
          if (content === undefined || content === null) {
            return { error: 'Content is required to write a file', success: false };
          }
          const preCheck = InspectionTracker.getInstance().validatePreEdit('global-default-session', workspaceRoot, filePath);
          if (!preCheck.allowed) {
            return { error: preCheck.message || 'Pre-edit inspection required', success: false };
          }
          const fullPath = resolveSafeToolPath(workspaceRoot, filePath);
          if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {`;

if (fst.includes(fstOldWriteCRLF)) {
  fst = fst.replace(fstOldWriteCRLF, fstNewWrite.replace(/\n/g, '\r\n'));
  console.log('FileSystemTools writeFile preCheck added (CRLF)');
} else if (fst.includes(fstOldWrite)) {
  fst = fst.replace(fstOldWrite, fstNewWrite);
  console.log('FileSystemTools writeFile preCheck added (LF)');
}

const fstOldDone = `fs.writeFileSync(fullPath, String(content), 'utf8');
          return { path: filePath, success: true, bytesWritten: Buffer.byteLength(String(content)) };`;
const fstOldDoneCRLF = fstOldDone.replace(/\n/g, '\r\n');
const fstNewDone = `fs.writeFileSync(fullPath, String(content), 'utf8');
          InspectionTracker.getInstance().recordInspection('global-default-session', workspaceRoot, filePath);
          return { path: filePath, success: true, bytesWritten: Buffer.byteLength(String(content)) };`;

if (fst.includes(fstOldDoneCRLF)) {
  fst = fst.replace(fstOldDoneCRLF, fstNewDone.replace(/\n/g, '\r\n'));
  console.log('FileSystemTools writeFile record added (CRLF)');
} else if (fst.includes(fstOldDone)) {
  fst = fst.replace(fstOldDone, fstNewDone);
  console.log('FileSystemTools writeFile record added (LF)');
}

fs.writeFileSync(fstPath, fst, 'utf8');

// 2. WorkspaceTools.ts
const wstPath = path.join(repoRoot, 'src/agent/tools/WorkspaceTools.ts');
let wst = fs.readFileSync(wstPath, 'utf8');

const wstOldRead = `      execute: async (args: { path: string }) => {
        return { path: args.path, content: workspaceManager.readFile(args.path) };
      },`;
const wstOldReadCRLF = wstOldRead.replace(/\n/g, '\r\n');
const wstNewRead = `      execute: async (args: { path: string }) => {
        if (!args.path) return { error: 'Path is required' };
        const content = workspaceManager.readFile(args.path);
        InspectionTracker.getInstance().recordInspection(
          'global-default-session',
          workspaceManager.getRootPath(),
          args.path
        );
        return { path: args.path, content };
      },`;

if (wst.includes(wstOldReadCRLF)) {
  wst = wst.replace(wstOldReadCRLF, wstNewRead.replace(/\n/g, '\r\n'));
  console.log('WorkspaceTools read_file updated (CRLF)');
} else if (wst.includes(wstOldRead)) {
  wst = wst.replace(wstOldRead, wstNewRead);
  console.log('WorkspaceTools read_file updated (LF)');
}

// create_file
const wstOldCreate = `      execute: async (args: any) => {
        const filePath = args.path || args.file || args.filename || 'index.js';
        let content = args.content ?? args.code ?? args.text ?? args.body ?? args.data;
        if (content === undefined || content === null) {
          if (filePath.includes('hello')) {
            content = "function hello() {\\n  return 'Hello MaxIDE';\\n}\\n\\nconsole.log(hello());\\nmodule.exports = { hello };\\n";
          } else {
            content = '';
          }
        }
        const sanitization = ContentSanitizer.sanitize(filePath, content);
        if (!sanitization.valid) {
          throw new Error(sanitization.error);
        }
        content = sanitization.sanitized;
        workspaceManager.writeFile(filePath, String(content));
        return { success: true, path: filePath, bytesWritten: Buffer.byteLength(String(content)) };
      },`;
const wstOldCreateCRLF = wstOldCreate.replace(/\n/g, '\r\n');
const wstNewCreate = `      execute: async (args: any) => {
        const filePath = args.path || args.file || args.filename;
        if (!filePath) {
          throw new Error('Path is required to create a file');
        }
        let content = args.content ?? args.code ?? args.text ?? args.body ?? args.data;
        if (content === undefined || content === null) {
          throw new Error('Content is required to create a file');
        }
        const rootPath = workspaceManager.getRootPath();
        const preCheck = InspectionTracker.getInstance().validatePreEdit(
          'global-default-session',
          rootPath,
          filePath
        );
        if (!preCheck.allowed) {
          throw new Error(preCheck.message || 'Pre-edit inspection required');
        }
        const sanitization = ContentSanitizer.sanitize(filePath, content);
        if (!sanitization.valid) {
          throw new Error(sanitization.error);
        }
        content = sanitization.sanitized;
        workspaceManager.writeFile(filePath, String(content));
        InspectionTracker.getInstance().recordInspection(
          'global-default-session',
          rootPath,
          filePath
        );
        return { success: true, path: filePath, bytesWritten: Buffer.byteLength(String(content)) };
      },`;

if (wst.includes(wstOldCreateCRLF)) {
  wst = wst.replace(wstOldCreateCRLF, wstNewCreate.replace(/\n/g, '\r\n'));
  console.log('WorkspaceTools create_file updated (CRLF)');
} else if (wst.includes(wstOldCreate)) {
  wst = wst.replace(wstOldCreate, wstNewCreate);
  console.log('WorkspaceTools create_file updated (LF)');
}

// edit_file
const wstOldEdit = `      execute: async (args: { path: string; content: string; autoApply?: boolean }) => {
        const sanitization = ContentSanitizer.sanitize(args.path, args.content);
        if (!sanitization.valid) {
          throw new Error(sanitization.error);
        }
        const safeContent = sanitization.sanitized;
        const patch = patchManager.stagePatch([{ path: args.path, modifiedContent: safeContent }]);
        if (args.autoApply !== false) {
          await patchManager.applyPatchSet(patch.id);
          return {
            success: true,
            patchId: patch.id,
            path: args.path,
            status: 'applied',
            diff: patch.files[0]?.unifiedDiff,
          };
        }
        return {
          success: true,
          patchId: patch.id,
          path: args.path,
          status: 'staged_for_review',
          diff: patch.files[0]?.unifiedDiff,
        };
      },`;
const wstOldEditCRLF = wstOldEdit.replace(/\n/g, '\r\n');
const wstNewEdit = `      execute: async (args: { path: string; content: string; autoApply?: boolean }) => {
        if (!args.path) throw new Error('Path is required to edit a file');
        if (args.content === undefined || args.content === null) throw new Error('Content is required to edit a file');
        const rootPath = workspaceManager.getRootPath();
        const preCheck = InspectionTracker.getInstance().validatePreEdit(
          'global-default-session',
          rootPath,
          args.path
        );
        if (!preCheck.allowed) {
          throw new Error(preCheck.message || 'Pre-edit inspection required');
        }
        const sanitization = ContentSanitizer.sanitize(args.path, args.content);
        if (!sanitization.valid) {
          throw new Error(sanitization.error);
        }
        const safeContent = sanitization.sanitized;
        const patch = patchManager.stagePatch([{ path: args.path, modifiedContent: safeContent }]);
        if (args.autoApply !== false) {
          await patchManager.applyPatchSet(patch.id);
          InspectionTracker.getInstance().recordInspection(
            'global-default-session',
            rootPath,
            args.path
          );
          return {
            success: true,
            patchId: patch.id,
            path: args.path,
            status: 'applied',
            diff: patch.files[0]?.unifiedDiff,
          };
        }
        return {
          success: true,
          patchId: patch.id,
          path: args.path,
          status: 'staged_for_review',
          diff: patch.files[0]?.unifiedDiff,
        };
      },`;

if (wst.includes(wstOldEditCRLF)) {
  wst = wst.replace(wstOldEditCRLF, wstNewEdit.replace(/\n/g, '\r\n'));
  console.log('WorkspaceTools edit_file updated (CRLF)');
} else if (wst.includes(wstOldEdit)) {
  wst = wst.replace(wstOldEdit, wstNewEdit);
  console.log('WorkspaceTools edit_file updated (LF)');
}

fs.writeFileSync(wstPath, wst, 'utf8');
console.log('Tools updated successfully.');
