/**
 * MaxIDE - Unlimited AI Provider Platform
 * Multi-Format File, Document, Image & Zip Upload Manager
 * 
 * Supports:
 * - Zip archives (.zip): Auto-extraction into workspace
 * - Code & Text documents (.txt, .md, .json, .csv, .ts, .js, .py, etc.): Text extraction & context injection
 * - PDF documents (.pdf): Text stream extraction
 * - Images (.png, .jpg, .jpeg, .webp, .svg): Image storage & multimodal vision integration
 */

import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';

export interface UploadedFilePayload {
  name: string;
  contentBase64: string;
  type?: string;
}

export interface ProcessedUploadResult {
  filename: string;
  relativePath: string;
  fileType: 'zip' | 'document' | 'pdf' | 'image' | 'binary';
  sizeBytes: number;
  extractedFiles?: string[];
  textContent?: string;
  imagePath?: string;
  summary: string;
}

export class UploadManager {
  private workspaceRoot: string;
  private uploadsDir: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = path.resolve(workspaceRoot);
    this.uploadsDir = path.join(this.workspaceRoot, '.orbit', 'uploads');
    this.ensureUploadsDir();
  }

  public setWorkspaceRoot(newRoot: string): void {
    this.workspaceRoot = path.resolve(newRoot);
    this.uploadsDir = path.join(this.workspaceRoot, '.orbit', 'uploads');
    this.ensureUploadsDir();
  }

  private ensureUploadsDir(): void {
    try {
      if (!fs.existsSync(this.uploadsDir)) {
        fs.mkdirSync(this.uploadsDir, { recursive: true });
      }
    } catch {}
  }

  /**
   * Process an uploaded file (document, zip, image, or PDF)
   */
  public async processUpload(
    payload: UploadedFilePayload,
    targetDir?: string
  ): Promise<ProcessedUploadResult> {
    const safeName = path.basename(payload.name).replace(/[^\w\.\-\_]/g, '_');
    const ext = path.extname(safeName).toLowerCase();
    const buffer = Buffer.from(payload.contentBase64, 'base64');
    const sizeBytes = buffer.length;

    // 1. Handle Archives (ZIP, TAR, GZ, TGZ, 7Z, RAR) -> Auto-extract into workspace
    if (['.zip', '.tar', '.gz', '.tgz', '.7z', '.rar'].includes(ext)) {
      const archivePath = path.join(this.uploadsDir, safeName);
      fs.writeFileSync(archivePath, buffer);

      const destDir = targetDir
        ? path.resolve(this.workspaceRoot, targetDir)
        : this.workspaceRoot;

      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      let extractedFiles: string[] = [];
      if (ext === '.zip') {
        extractedFiles = await this.extractZip(archivePath, destDir);
      } else {
        extractedFiles = await this.extractTar(archivePath, destDir);
      }
      return {
        filename: safeName,
        relativePath: path.relative(this.workspaceRoot, archivePath),
        fileType: 'zip',
        sizeBytes,
        extractedFiles,
        summary: `Extracted ${extractedFiles.length} files from archive "${safeName}" into workspace.`,
      };
    }

    // 2. Handle PDF documents -> Extract readable text
    if (ext === '.pdf') {
      const pdfPath = path.join(this.uploadsDir, safeName);
      fs.writeFileSync(pdfPath, buffer);

      const text = await this.extractPdfText(pdfPath, buffer);
      return {
        filename: safeName,
        relativePath: path.relative(this.workspaceRoot, pdfPath),
        fileType: 'pdf',
        sizeBytes,
        textContent: text,
        summary: `Uploaded PDF "${safeName}" (${Math.round(sizeBytes / 1024)} KB). Extracted ${text.length} characters of document text.`,
      };
    }

    // 3. Handle Word Documents (.docx, .doc)
    if (ext === '.docx' || ext === '.doc') {
      const docxPath = path.join(this.uploadsDir, safeName);
      fs.writeFileSync(docxPath, buffer);

      const text = await this.extractDocxText(docxPath, buffer);
      return {
        filename: safeName,
        relativePath: path.relative(this.workspaceRoot, docxPath),
        fileType: 'document',
        sizeBytes,
        textContent: text,
        summary: `Uploaded Word Document "${safeName}" (${Math.round(sizeBytes / 1024)} KB). Extracted ${text.length} characters.`,
      };
    }

    // 4. Handle Excel Spreadsheets (.xlsx, .xls)
    if (ext === '.xlsx' || ext === '.xls') {
      const xlsxPath = path.join(this.uploadsDir, safeName);
      fs.writeFileSync(xlsxPath, buffer);

      const text = await this.extractExcelText(xlsxPath, buffer);
      return {
        filename: safeName,
        relativePath: path.relative(this.workspaceRoot, xlsxPath),
        fileType: 'document',
        sizeBytes,
        textContent: text,
        summary: `Uploaded Excel Spreadsheet "${safeName}" (${Math.round(sizeBytes / 1024)} KB). Extracted tabular summary.`,
      };
    }

    // 5. Handle PowerPoint Presentations (.pptx, .ppt)
    if (ext === '.pptx' || ext === '.ppt') {
      const pptxPath = path.join(this.uploadsDir, safeName);
      fs.writeFileSync(pptxPath, buffer);

      const text = await this.extractPptxText(pptxPath, buffer);
      return {
        filename: safeName,
        relativePath: path.relative(this.workspaceRoot, pptxPath),
        fileType: 'document',
        sizeBytes,
        textContent: text,
        summary: `Uploaded Presentation "${safeName}" (${Math.round(sizeBytes / 1024)} KB). Extracted slide text.`,
      };
    }

    // 6. Handle Tabular Data (.csv, .tsv)
    if (ext === '.csv' || ext === '.tsv') {
      const csvPath = path.join(this.uploadsDir, safeName);
      fs.writeFileSync(csvPath, buffer);
      const text = buffer.toString('utf8');
      const lines = text.split('\n').filter(l => l.trim().length > 0);
      const preview = lines.slice(0, 30).join('\n');
      return {
        filename: safeName,
        relativePath: path.relative(this.workspaceRoot, csvPath),
        fileType: 'document',
        sizeBytes,
        textContent: `Tabular Dataset (${lines.length} rows):\n${preview}${lines.length > 30 ? '\n... [additional rows truncated]' : ''}`,
        summary: `Uploaded tabular data "${safeName}" (${lines.length} rows, ${Math.round(sizeBytes / 1024)} KB).`,
      };
    }

    // 7. Handle Images -> Save for visual inspection & web assets
    if (['.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif', '.bmp', '.ico'].includes(ext)) {
      const imgPath = path.join(this.uploadsDir, safeName);
      fs.writeFileSync(imgPath, buffer);

      return {
        filename: safeName,
        relativePath: path.relative(this.workspaceRoot, imgPath),
        fileType: 'image',
        sizeBytes,
        imagePath: imgPath,
        summary: `Uploaded image "${safeName}" (${Math.round(sizeBytes / 1024)} KB) saved for visual inspection & UI embedding.`,
      };
    }

    // 8. Handle Audio & Video Assets
    if (['.mp3', '.wav', '.ogg', '.m4a', '.mp4', '.mov', '.avi', '.mkv', '.webm'].includes(ext)) {
      const mediaPath = path.join(this.uploadsDir, safeName);
      fs.writeFileSync(mediaPath, buffer);

      return {
        filename: safeName,
        relativePath: path.relative(this.workspaceRoot, mediaPath),
        fileType: 'binary',
        sizeBytes,
        summary: `Uploaded media asset "${safeName}" (${Math.round(sizeBytes / 1024)} KB). Saved for app integration.`,
      };
    }

    // 9. Handle Code & Text Documents (.ts, .js, .py, .html, .css, .md, .txt, .json, .yaml, .xml, .sql, etc.)
    const docPath = path.join(targetDir ? path.resolve(this.workspaceRoot, targetDir) : this.uploadsDir, safeName);
    fs.writeFileSync(docPath, buffer);

    let textContent = '';
    try {
      textContent = buffer.toString('utf8');
    } catch {
      textContent = `[Binary file: ${safeName}]`;
    }

    return {
      filename: safeName,
      relativePath: path.relative(this.workspaceRoot, docPath),
      fileType: 'document',
      sizeBytes,
      textContent: textContent.slice(0, 15000), // Cap context size safely
      summary: `Uploaded document "${safeName}" (${textContent.length} characters).`,
    };
  }

  /**
   * Native zip extraction using PowerShell Expand-Archive
   */
  private extractZip(zipFile: string, destDir: string): Promise<string[]> {
    return new Promise((resolve) => {
      const cmd = `powershell.exe -NoProfile -Command "Expand-Archive -Path '${zipFile.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force"`;
      exec(cmd, { cwd: this.workspaceRoot }, (error) => {
        if (error) {
          console.warn(`[UploadManager] PowerShell unzip warning: ${error.message}`);
        }
        // Inspect destination directory for extracted files
        try {
          const files: string[] = [];
          const scan = (dir: string) => {
            for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
              const full = path.join(dir, item.name);
              if (item.name === '.git' || item.name === 'node_modules' || item.name === '.orbit') continue;
              if (item.isDirectory()) scan(full);
              else files.push(path.relative(destDir, full));
            }
          };
          scan(destDir);
          resolve(files);
        } catch {
          resolve(['archive_extracted']);
        }
      });
    });
  }

  /**
   * Extract readable text from PDF buffer
   */
  private async extractPdfText(pdfPath: string, buffer: Buffer): Promise<string> {
    // 1. Try python pypdf extraction if python is available
    try {
      const normalizedPath = pdfPath.replace(/\\/g, '/');
      const pyCode = `import pypdf; r = pypdf.PdfReader(r'${normalizedPath}'); print('\\n'.join([p.extract_text() or '' for p in r.pages]))`;
      const text = await new Promise<string>((resolve) => {
        exec(`python -c "${pyCode.replace(/"/g, '\\"')}"`, { timeout: 5000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
          if (err || !stdout || stdout.trim().length < 20) resolve('');
          else resolve(stdout.trim());
        });
      });
      if (text && text.length > 20) {
        return text.slice(0, 15000);
      }
    } catch {}

    // 2. Fallback to stream / regex parsing
    const raw = buffer.toString('binary');
    const textPieces: string[] = [];
    const tjRegex = /\(([^)]+)\)\s*Tj/g;
    let match;
    while ((match = tjRegex.exec(raw)) !== null) {
      if (match[1] && match[1].trim().length > 1) {
        textPieces.push(match[1].trim());
      }
    }

    if (textPieces.length > 0) {
      return textPieces.join(' ').slice(0, 10000);
    }

    // Fallback: extract ASCII printable strings
    const printable = raw.replace(/[^\x20-\x7E\n\r\t]/g, ' ');
    const lines = printable.split('\n').map(l => l.trim()).filter(l => l.length > 15);
    return lines.slice(0, 120).join('\n').slice(0, 8000) || '[PDF content parsed]';
  }

  /**
   * Extract readable text from Word Document (.docx, .doc)
   */
  private async extractDocxText(docxPath: string, buffer: Buffer): Promise<string> {
    try {
      const normalizedPath = docxPath.replace(/\\/g, '/');
      const pyCode = `import docx; doc = docx.Document(r'${normalizedPath}'); print('\\n'.join([p.text for p in doc.paragraphs if p.text.strip()]))`;
      const text = await new Promise<string>((resolve) => {
        exec(`python -c "${pyCode.replace(/"/g, '\\"')}"`, { timeout: 6000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
          if (err || !stdout || stdout.trim().length < 10) resolve('');
          else resolve(stdout.trim());
        });
      });
      if (text && text.length > 10) return text.slice(0, 15000);
    } catch {}

    // Fallback: search XML text in zip stream
    try {
      const raw = buffer.toString('utf8');
      const matches = raw.match(/<w:t[^>]*>([^<]+)<\/w:t>/g);
      if (matches) {
        const text = matches.map(m => m.replace(/<[^>]+>/g, '')).join(' ');
        if (text.length > 10) return text.slice(0, 10000);
      }
    } catch {}

    return '[Word document content parsed]';
  }

  /**
   * Extract tabular summary from Excel Spreadsheet (.xlsx, .xls)
   */
  private async extractExcelText(xlsxPath: string, buffer: Buffer): Promise<string> {
    try {
      const normalizedPath = xlsxPath.replace(/\\/g, '/');
      const pyCode = `import pandas as pd; xl = pd.ExcelFile(r'${normalizedPath}'); sheets = ['--- Sheet: ' + s + ' ---\\n' + pd.read_excel(xl, sheet_name=s, nrows=30).to_string() for s in xl.sheet_names[:5]]; print('\\n\\n'.join(sheets))`;
      const text = await new Promise<string>((resolve) => {
        exec(`python -c "${pyCode.replace(/"/g, '\\"')}"`, { timeout: 7000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
          if (err || !stdout || stdout.trim().length < 5) resolve('');
          else resolve(stdout.trim());
        });
      });
      if (text && text.length > 5) return text.slice(0, 15000);
    } catch {}

    return '[Excel spreadsheet data parsed]';
  }

  /**
   * Extract text from PowerPoint Presentation (.pptx, .ppt)
   */
  private async extractPptxText(pptxPath: string, buffer: Buffer): Promise<string> {
    try {
      const normalizedPath = pptxPath.replace(/\\/g, '/');
      const pyCode = `import zipfile, xml.etree.ElementTree as ET
with zipfile.ZipFile(r'${normalizedPath}') as z:
    slides = sorted([f for f in z.namelist() if f.startswith('ppt/slides/slide') and f.endswith('.xml')])
    out = []
    for idx, s in enumerate(slides[:20]):
        root = ET.fromstring(z.read(s))
        texts = [elem.text for elem in root.iter() if elem.text and elem.text.strip()]
        if texts: out.append(f'Slide {idx+1}:\\n' + ' '.join(texts))
    print('\\n\\n'.join(out))`;
      const text = await new Promise<string>((resolve) => {
        exec(`python -c "${pyCode.replace(/"/g, '\\"')}"`, { timeout: 7000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
          if (err || !stdout || stdout.trim().length < 10) resolve('');
          else resolve(stdout.trim());
        });
      });
      if (text && text.length > 10) return text.slice(0, 15000);
    } catch {}

    return '[PowerPoint presentation content parsed]';
  }

  /**
   * Tar / Gzip extraction
   */
  private extractTar(archivePath: string, destDir: string): Promise<string[]> {
    return new Promise((resolve) => {
      const cmd = `tar -xf "${archivePath}" -C "${destDir}"`;
      exec(cmd, { cwd: this.workspaceRoot }, () => {
        try {
          const files = fs.readdirSync(destDir);
          resolve(files);
        } catch {
          resolve(['archive_extracted']);
        }
      });
    });
  }

  /**
   * Format processed uploads into rich context for the Agent Engine
   */
  public buildContextString(results: ProcessedUploadResult[]): string {
    if (!results || results.length === 0) return '';

    let out = '\n### Uploaded User Documents & Workspace Files:\n';
    for (const item of results) {
      out += `\n- **${item.filename}** (${item.fileType}): ${item.summary}\n`;
      if (item.extractedFiles && item.extractedFiles.length > 0) {
        out += `  Extracted files: ${item.extractedFiles.slice(0, 15).join(', ')}${item.extractedFiles.length > 15 ? '...' : ''}\n`;
      }
      if (item.textContent) {
        out += `  \`\`\`\n  ${item.textContent.slice(0, 1500).replace(/\n/g, '\n  ')}\n  \`\`\`\n`;
      }
    }
    return out;
  }
}
