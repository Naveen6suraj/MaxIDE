/**
 * MaxIDE - Data Analysis & Chart Generation Engine
 * Parses CSV/JSON datasets, calculates rich statistical profiles,
 * and renders high-resolution PNG charts via Playwright headless Chromium + Chart.js,
 * alongside interactive HTML visualizations.
 * STRICT: Real dataset parsing, real calculations, real image charts.
 */

import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';
import { ArtifactManager, Artifact } from '../../artifacts/ArtifactManager.js';

export interface ColumnProfile {
  name: string;
  type: 'numeric' | 'string' | 'boolean' | 'date';
  nullCount: number;
  uniqueCount: number;
  min?: number;
  max?: number;
  mean?: number;
  median?: number;
  sum?: number;
  topValues?: Array<{ value: string; count: number }>;
}

export interface DatasetAnalysisResult {
  filePath: string;
  rowCount: number;
  columnCount: number;
  columns: ColumnProfile[];
  sampleRows: Record<string, any>[];
  summaryMarkdown: string;
}

export interface ChartOptions {
  type: 'bar' | 'line' | 'pie' | 'doughnut' | 'radar';
  title: string;
  labels: string[];
  datasets: Array<{
    label: string;
    data: number[];
    color?: string;
  }>;
  outputPath?: string;
  workspaceRoot: string;
  artifactManager?: ArtifactManager;
}

export class DataTools {
  /**
   * Parse CSV content into structured rows and column headers
   */
  public static parseCsv(content: string): { headers: string[]; rows: Record<string, any>[] } {
    const lines = content.trim().split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0) return { headers: [], rows: [] };

    // Detect delimiter (comma or semicolon or tab)
    const firstLine = lines[0];
    let delimiter = ',';
    if (firstLine.includes('\t')) delimiter = '\t';
    else if (firstLine.split(';').length > firstLine.split(',').length) delimiter = ';';

    const parseLine = (line: string): string[] => {
      const result: string[] = [];
      let cur = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === delimiter && !inQuotes) {
          result.push(cur.trim().replace(/^"|"$/g, ''));
          cur = '';
        } else {
          cur += char;
        }
      }
      result.push(cur.trim().replace(/^"|"$/g, ''));
      return result;
    };

    const headers = parseLine(lines[0]);
    const rows: Record<string, any>[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = parseLine(lines[i]);
      const row: Record<string, any> = {};
      for (let j = 0; j < headers.length; j++) {
        const rawVal = values[j];
        if (rawVal === undefined || rawVal === '') {
          row[headers[j]] = null;
        } else if (!isNaN(Number(rawVal)) && rawVal.trim() !== '') {
          row[headers[j]] = Number(rawVal);
        } else if (rawVal.toLowerCase() === 'true') {
          row[headers[j]] = true;
        } else if (rawVal.toLowerCase() === 'false') {
          row[headers[j]] = false;
        } else {
          row[headers[j]] = rawVal;
        }
      }
      rows.push(row);
    }

    return { headers, rows };
  }

  /**
   * Analyze a dataset and compute complete statistics
   */
  public static analyzeDataset(filePath: string, workspaceRoot: string): DatasetAnalysisResult {
    const absPath = path.isAbsolute(filePath) ? filePath : path.join(workspaceRoot, filePath);
    if (!fs.existsSync(absPath)) {
      throw new Error(`Dataset file not found at: ${absPath}`);
    }

    const content = fs.readFileSync(absPath, 'utf8');
    const { headers, rows } = this.parseCsv(content);

    const columns: ColumnProfile[] = [];

    for (const h of headers) {
      let nullCount = 0;
      const values = rows.map((r) => r[h]).filter((v) => {
        if (v === null || v === undefined) {
          nullCount++;
          return false;
        }
        return true;
      });

      const numericValues = values.filter((v) => typeof v === 'number') as number[];
      const isNumeric = numericValues.length > values.length * 0.7 && values.length > 0;

      const valCounts: Record<string, number> = {};
      for (const v of values) {
        const key = String(v);
        valCounts[key] = (valCounts[key] || 0) + 1;
      }

      const uniqueCount = Object.keys(valCounts).length;
      const topValues = Object.entries(valCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([value, count]) => ({ value, count }));

      if (isNumeric && numericValues.length > 0) {
        numericValues.sort((a, b) => a - b);
        const sum = numericValues.reduce((a, b) => a + b, 0);
        const mean = sum / numericValues.length;
        const min = numericValues[0];
        const max = numericValues[numericValues.length - 1];
        const mid = Math.floor(numericValues.length / 2);
        const median = numericValues.length % 2 !== 0 ? numericValues[mid] : (numericValues[mid - 1] + numericValues[mid]) / 2;

        columns.push({
          name: h,
          type: 'numeric',
          nullCount,
          uniqueCount,
          min: Math.round(min * 100) / 100,
          max: Math.round(max * 100) / 100,
          mean: Math.round(mean * 100) / 100,
          median: Math.round(median * 100) / 100,
          sum: Math.round(sum * 100) / 100,
          topValues,
        });
      } else {
        columns.push({
          name: h,
          type: 'string',
          nullCount,
          uniqueCount,
          topValues,
        });
      }
    }

    // Build markdown summary
    let summary = `### Dataset Statistical Profile: \`${path.basename(absPath)}\`\n\n`;
    summary += `- **Total Rows:** ${rows.length}\n`;
    summary += `- **Total Columns:** ${headers.length} (${headers.join(', ')})\n\n`;
    summary += `| Column | Type | Missing | Unique | Min | Mean | Max |\n`;
    summary += `| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n`;

    for (const c of columns) {
      if (c.type === 'numeric') {
        summary += `| **${c.name}** | numeric | ${c.nullCount} | ${c.uniqueCount} | ${c.min} | ${c.mean} | ${c.max} |\n`;
      } else {
        summary += `| **${c.name}** | ${c.type} | ${c.nullCount} | ${c.uniqueCount} | - | - | - |\n`;
      }
    }

    return {
      filePath: absPath,
      rowCount: rows.length,
      columnCount: headers.length,
      columns,
      sampleRows: rows.slice(0, 5),
      summaryMarkdown: summary,
    };
  }

  /**
   * Render a high-resolution PNG chart and an interactive HTML chart
   */
  public static async generateChart(options: ChartOptions): Promise<{
    pngFilePath: string;
    htmlFilePath: string;
    relativeUrl: string;
    sizeBytes: number;
    artifact?: Artifact;
  }> {
    const root = options.workspaceRoot;
    const chartsDir = path.join(root, 'assets', 'charts');
    if (!fs.existsSync(chartsDir)) fs.mkdirSync(chartsDir, { recursive: true });

    const safeTitle = options.title.toLowerCase().replace(/[^a-z0-9]+/g, '_').substring(0, 40) || 'chart';
    const pngFilename = options.outputPath ? path.basename(options.outputPath) : `${safeTitle}_${Date.now()}.png`;
    const pngOutputPath = path.isAbsolute(options.outputPath || '')
      ? options.outputPath!
      : path.join(chartsDir, pngFilename);

    const htmlFilename = pngFilename.replace(/\.png$/, '.html');
    const htmlOutputPath = path.join(chartsDir, htmlFilename);

    const chartHtml = this.buildChartHtml(options);
    fs.writeFileSync(htmlOutputPath, chartHtml, 'utf8');

    // Use Playwright headless Chromium to take a crisp 2x retina screenshot of the chart canvas
    let browser;
    try {
      browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
      });
      const context = await browser.newContext({ deviceScaleFactor: 2, viewport: { width: 1000, height: 600 } });
      const page = await context.newPage();

      await page.setContent(chartHtml, { waitUntil: 'load' });
      await page.waitForTimeout(400); // Wait for Chart.js animation

      const canvas = await page.$('#chartCanvas');
      if (canvas) {
        await canvas.screenshot({ path: pngOutputPath, type: 'png' });
      } else {
        await page.screenshot({ path: pngOutputPath, fullPage: false });
      }

      await browser.close();
      browser = undefined;
    } catch (err: any) {
      if (browser) await browser.close();
      throw new Error(`Chart PNG rendering failed: ${err.message}`);
    }

    if (!fs.existsSync(pngOutputPath)) {
      throw new Error('Chart PNG file was not written to disk.');
    }

    const stats = fs.statSync(pngOutputPath);
    if (stats.size < 500) {
      throw new Error('Chart PNG is smaller than 500 bytes, verification failed.');
    }

    // Verify PNG magic header
    const buf = Buffer.alloc(8);
    const fd = fs.openSync(pngOutputPath, 'r');
    fs.readSync(fd, buf, 0, 8, 0);
    fs.closeSync(fd);
    if (buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47) {
      throw new Error('File does not start with valid PNG magic header.');
    }

    const relPath = path.relative(root, pngOutputPath).replace(/\\/g, '/');
    const relativeUrl = `/workspace-preview/${relPath}`;

    let artifact: Artifact | undefined;
    if (options.artifactManager) {
      artifact = options.artifactManager.registerArtifact({
        type: 'IMAGE',
        name: `${options.title}.png`,
        filePath: pngOutputPath,
        description: `Visualization: ${options.title}`,
        metadata: {
          chartType: options.type,
          summary: options.title,
          dimensions: { width: 1000, height: 600 },
          htmlPreview: htmlOutputPath,
        },
        provider: 'MaxIDE Chart.js Engine',
        prompt: options.title,
        status: 'verified',
        verificationDetails: `Real PNG chart verified (${stats.size} bytes, PNG header valid)`,
      });
    }

    return {
      pngFilePath: pngOutputPath,
      htmlFilePath: htmlOutputPath,
      relativeUrl,
      sizeBytes: stats.size,
      artifact,
    };
  }

  private static buildChartHtml(options: ChartOptions): string {
    const palette = [
      '#38bdf8', '#818cf8', '#34d399', '#f472b6', '#fbbf24',
      '#a78bfa', '#f87171', '#2dd4bf', '#fb923c', '#60a5fa',
    ];

    const chartDatasets = options.datasets.map((d, i) => {
      const color = d.color || palette[i % palette.length];
      return {
        label: d.label,
        data: d.data,
        backgroundColor: options.type === 'line' ? `${color}33` : (options.type === 'pie' || options.type === 'doughnut' ? palette : color),
        borderColor: color,
        borderWidth: 2,
        fill: options.type === 'line',
        tension: 0.35,
      };
    });

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${options.title}</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.2/dist/chart.umd.min.js"></script>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 24px;
      background: #0f172a;
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
    }
    .chart-card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 12px;
      padding: 28px;
      width: 100%;
      max-width: 920px;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
    }
    .chart-title {
      font-size: 20px;
      font-weight: 700;
      color: #ffffff;
      margin: 0 0 6px 0;
    }
    .chart-subtitle {
      font-size: 13px;
      color: #94a3b8;
      margin: 0 0 20px 0;
    }
    .canvas-container {
      position: relative;
      width: 100%;
      height: 440px;
    }
  </style>
</head>
<body>
  <div class="chart-card">
    <h2 class="chart-title">${options.title}</h2>
    <div class="chart-subtitle">MaxIDE Analytics Engine • Visual Distribution</div>
    <div class="canvas-container">
      <canvas id="chartCanvas"></canvas>
    </div>
  </div>

  <script>
    const ctx = document.getElementById('chartCanvas').getContext('2d');
    new Chart(ctx, {
      type: '${options.type}',
      data: {
        labels: ${JSON.stringify(options.labels)},
        datasets: ${JSON.stringify(chartDatasets)}
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 0 },
        plugins: {
          legend: {
            position: 'top',
            labels: { color: '#cbd5e1', font: { size: 12, weight: 600 } }
          },
          tooltip: {
            backgroundColor: '#0f172a',
            borderColor: '#38bdf8',
            borderWidth: 1,
            titleColor: '#ffffff',
            bodyColor: '#e2e8f0',
            padding: 10
          }
        },
        scales: ${options.type === 'pie' || options.type === 'doughnut' || options.type === 'radar' ? '{}' : `{
          x: {
            grid: { color: 'rgba(255, 255, 255, 0.06)' },
            ticks: { color: '#94a3b8' }
          },
          y: {
            grid: { color: 'rgba(255, 255, 255, 0.06)' },
            ticks: { color: '#94a3b8' }
          }
        }`}
      }
    });
  </script>
</body>
</html>`;
  }
}
