/**
 * MaxIDE - Presentation Engine
 * Generates genuine Microsoft PowerPoint (.pptx) presentations using pptxgenjs
 * and interactive HTML slide deck previews for center viewport rendering.
 * STRICT: Real OpenXML .pptx files, zero fake artifacts.
 */

import fs from 'fs';
import path from 'path';
import pptxgen from 'pptxgenjs';
import { ArtifactManager, Artifact } from '../../artifacts/ArtifactManager.js';

export interface SlideDefinition {
  title: string;
  subtitle?: string;
  layout?: 'title' | 'bullets' | 'split' | 'stat_card' | 'summary';
  bulletPoints?: string[];
  paragraphs?: string[];
  stat?: {
    value: string;
    label: string;
    subtext?: string;
  };
  cardItems?: Array<{
    title: string;
    description: string;
  }>;
  speakerNotes?: string;
}

export interface PresentationOptions {
  title: string;
  subtitle?: string;
  author?: string;
  date?: string;
  theme?: 'dark_cyber' | 'modern_clean' | 'corporate_navy' | 'emerald_minimal';
  slides: SlideDefinition[];
  outputPath?: string;
  workspaceRoot: string;
  artifactManager?: ArtifactManager;
}

export class PresentationTools {
  /**
   * Generate a genuine Microsoft PowerPoint (.pptx) file and an HTML preview deck
   */
  public static async generatePresentation(options: PresentationOptions): Promise<{
    pptxFilePath: string;
    previewHtmlPath: string;
    relativeUrl: string;
    slideCount: number;
    sizeBytes: number;
    artifact?: Artifact;
  }> {
    const root = options.workspaceRoot;
    const presDir = path.join(root, 'presentations');
    if (!fs.existsSync(presDir)) fs.mkdirSync(presDir, { recursive: true });

    const safeTitle = options.title.toLowerCase().replace(/[^a-z0-9]+/g, '_').substring(0, 40) || 'presentation';
    const pptxFilename = options.outputPath ? path.basename(options.outputPath) : `${safeTitle}_${Date.now()}.pptx`;
    const pptxOutputPath = path.isAbsolute(options.outputPath || '')
      ? options.outputPath!
      : path.join(presDir, pptxFilename);

    const PptxConstructor = (pptxgen as any).default || pptxgen;
    const pres = new PptxConstructor();
    pres.layout = 'LAYOUT_16x9';
    pres.title = options.title;
    pres.subject = options.subtitle || 'MaxIDE Presentation';
    pres.author = options.author || 'MaxIDE AI Studio';

    const themeColors = this.getThemeColors(options.theme || 'modern_clean');

    // Slide 1: Title Slide
    const titleSlide = pres.addSlide();
    titleSlide.background = { color: themeColors.bg };

    // Accent line
    titleSlide.addShape(pres.ShapeType.rect, {
      x: 0.8,
      y: 1.8,
      w: 0.8,
      h: 0.08,
      fill: { color: themeColors.accent },
      line: { type: 'none' },
    });

    titleSlide.addText(options.title, {
      x: 0.8,
      y: 2.2,
      w: 11.5,
      h: 1.8,
      fontSize: 38,
      fontFace: 'Arial',
      bold: true,
      color: themeColors.textPrimary,
      valign: 'top',
    });

    if (options.subtitle) {
      titleSlide.addText(options.subtitle, {
        x: 0.8,
        y: 4.0,
        w: 11.0,
        h: 1.0,
        fontSize: 18,
        fontFace: 'Arial',
        color: themeColors.textSecondary,
        valign: 'top',
      });
    }

    titleSlide.addText(`Presented by: ${options.author || 'MaxIDE AI Creation Studio'}  •  ${options.date || new Date().toLocaleDateString()}`, {
      x: 0.8,
      y: 6.2,
      w: 11.0,
      h: 0.5,
      fontSize: 12,
      fontFace: 'Arial',
      color: themeColors.textMuted,
    });

    // Content Slides
    for (let i = 0; i < options.slides.length; i++) {
      const slideDef = options.slides[i];
      const slide = pres.addSlide();
      slide.background = { color: themeColors.bg };

      // Header Banner
      slide.addText(slideDef.title, {
        x: 0.8,
        y: 0.6,
        w: 11.0,
        h: 0.8,
        fontSize: 26,
        fontFace: 'Arial',
        bold: true,
        color: themeColors.textPrimary,
      });

      if (slideDef.subtitle) {
        slide.addText(slideDef.subtitle, {
          x: 0.8,
          y: 1.3,
          w: 11.0,
          h: 0.5,
          fontSize: 14,
          fontFace: 'Arial',
          color: themeColors.textSecondary,
        });
      }

      // Header separator
      slide.addShape(pres.ShapeType.line, {
        x: 0.8,
        y: 1.8,
        w: 11.5,
        h: 0,
        line: { color: themeColors.border, width: 1 },
      });

      // Slide Layout Rendering
      if (slideDef.stat) {
        // Stat Card Layout
        slide.addShape(pres.ShapeType.roundRect, {
          x: 0.8,
          y: 2.2,
          w: 4.0,
          h: 4.2,
          fill: { color: themeColors.cardBg },
          line: { color: themeColors.accent, width: 2 },
          rectRadius: 0.2,
        });

        slide.addText(slideDef.stat.value, {
          x: 1.0,
          y: 2.6,
          w: 3.6,
          h: 1.2,
          fontSize: 44,
          fontFace: 'Arial',
          bold: true,
          color: themeColors.accent,
          align: 'center',
        });

        slide.addText(slideDef.stat.label, {
          x: 1.0,
          y: 3.9,
          w: 3.6,
          h: 1.0,
          fontSize: 16,
          fontFace: 'Arial',
          bold: true,
          color: themeColors.textPrimary,
          align: 'center',
        });

        if (slideDef.stat.subtext) {
          slide.addText(slideDef.stat.subtext, {
            x: 1.0,
            y: 4.9,
            w: 3.6,
            h: 1.0,
            fontSize: 12,
            fontFace: 'Arial',
            color: themeColors.textSecondary,
            align: 'center',
          });
        }

        // Accompanying Bullets on Right
        if (slideDef.bulletPoints && slideDef.bulletPoints.length > 0) {
          const bulletTexts = slideDef.bulletPoints.map((bp) => ({
            text: `${bp}\n`,
            options: { fontSize: 16, color: themeColors.textPrimary, bullet: true, spacing: { after: 12 } },
          }));
          slide.addText(bulletTexts, {
            x: 5.3,
            y: 2.4,
            w: 7.0,
            h: 4.0,
            valign: 'top',
          });
        }
      } else if (slideDef.cardItems && slideDef.cardItems.length > 0) {
        // Multi-Card Layout
        const cardWidth = 3.6;
        const cardGap = 0.35;
        const totalCards = Math.min(slideDef.cardItems.length, 3);

        for (let c = 0; c < totalCards; c++) {
          const card = slideDef.cardItems[c];
          const cardX = 0.8 + c * (cardWidth + cardGap);

          slide.addShape(pres.ShapeType.roundRect, {
            x: cardX,
            y: 2.2,
            w: cardWidth,
            h: 4.2,
            fill: { color: themeColors.cardBg },
            line: { color: themeColors.border, width: 1 },
            rectRadius: 0.15,
          });

          slide.addText(card.title, {
            x: cardX + 0.3,
            y: 2.5,
            w: cardWidth - 0.6,
            h: 0.8,
            fontSize: 18,
            fontFace: 'Arial',
            bold: true,
            color: themeColors.accent,
          });

          slide.addText(card.description, {
            x: cardX + 0.3,
            y: 3.4,
            w: cardWidth - 0.6,
            h: 2.6,
            fontSize: 13,
            fontFace: 'Arial',
            color: themeColors.textSecondary,
            valign: 'top',
          });
        }
      } else {
        // Standard Bullets / Text Layout
        if (slideDef.bulletPoints && slideDef.bulletPoints.length > 0) {
          const bulletTexts = slideDef.bulletPoints.map((bp) => ({
            text: `${bp}\n`,
            options: { fontSize: 18, color: themeColors.textPrimary, bullet: true, spacing: { after: 16 } },
          }));
          slide.addText(bulletTexts, {
            x: 0.8,
            y: 2.3,
            w: 11.5,
            h: 4.2,
            valign: 'top',
          });
        }
      }

      // Footer Slide Number
      slide.addText(`${i + 2} / ${options.slides.length + 1}`, {
        x: 11.0,
        y: 6.8,
        w: 1.5,
        h: 0.4,
        fontSize: 10,
        fontFace: 'Arial',
        color: themeColors.textMuted,
        align: 'right',
      });

      if (slideDef.speakerNotes) {
        slide.addNotes(slideDef.speakerNotes);
      }
    }

    // Write real PPTX file
    await pres.writeFile({ fileName: pptxOutputPath });

    if (!fs.existsSync(pptxOutputPath)) {
      throw new Error('PPTX file was not written to disk.');
    }

    const stats = fs.statSync(pptxOutputPath);
    if (stats.size < 1000) {
      throw new Error('Generated PPTX is smaller than 1KB, verification failed.');
    }

    // Verify OpenXML ZIP magic bytes (PK\x03\x04)
    const buf = Buffer.alloc(4);
    const fd = fs.openSync(pptxOutputPath, 'r');
    fs.readSync(fd, buf, 0, 4, 0);
    fs.closeSync(fd);
    if (buf[0] !== 0x50 || buf[1] !== 0x4b || buf[2] !== 0x03 || buf[3] !== 0x04) {
      throw new Error('File does not have valid ZIP/OpenXML magic bytes, corrupt PPTX.');
    }

    // Also generate an interactive HTML preview deck for instant browser viewing
    const htmlFilename = pptxFilename.replace(/\.pptx$/, '.html');
    const previewHtmlPath = path.join(presDir, htmlFilename);
    const htmlContent = this.buildHtmlSlideDeck(options);
    fs.writeFileSync(previewHtmlPath, htmlContent, 'utf8');

    const totalSlideCount = options.slides.length + 1;
    const relPath = path.relative(root, pptxOutputPath).replace(/\\/g, '/');
    const relativeUrl = `/workspace-preview/${relPath}`;

    let artifact: Artifact | undefined;
    if (options.artifactManager) {
      artifact = options.artifactManager.registerArtifact({
        type: 'PRESENTATION',
        name: `${options.title}.pptx`,
        filePath: pptxOutputPath,
        description: options.subtitle || `Slide Deck: ${options.title}`,
        metadata: {
          slideCount: totalSlideCount,
          theme: options.theme || 'modern_clean',
          summary: options.subtitle,
          previewHtmlPath,
        },
        provider: 'MaxIDE PPTX OpenXML Engine',
        prompt: options.title,
        status: 'verified',
        verificationDetails: `Real PPTX verified (${stats.size} bytes, ${totalSlideCount} slides, PK magic header confirmed)`,
      });
    }

    return {
      pptxFilePath: pptxOutputPath,
      previewHtmlPath,
      relativeUrl,
      slideCount: totalSlideCount,
      sizeBytes: stats.size,
      artifact,
    };
  }

  private static getThemeColors(theme: string) {
    switch (theme) {
      case 'dark_cyber':
        return {
          bg: '0B0F19',
          cardBg: '161E2E',
          textPrimary: 'F9FAFB',
          textSecondary: '9CA3AF',
          textMuted: '6B7280',
          accent: '06B6D4',
          border: '1F2937',
        };
      case 'corporate_navy':
        return {
          bg: 'FFFFFF',
          cardBg: 'F0F4F8',
          textPrimary: '0A192F',
          textSecondary: '334E68',
          textMuted: '829AB1',
          accent: '1E40AF',
          border: 'D9E2EC',
        };
      case 'emerald_minimal':
        return {
          bg: 'F8FAFC',
          cardBg: 'FFFFFF',
          textPrimary: '0F172A',
          textSecondary: '475569',
          textMuted: '94A3B8',
          accent: '059669',
          border: 'E2E8F0',
        };
      case 'modern_clean':
      default:
        return {
          bg: '0F172A',
          cardBg: '1E293B',
          textPrimary: 'FFFFFF',
          textSecondary: '94A3B8',
          textMuted: '64748B',
          accent: '38BDF8',
          border: '334155',
        };
    }
  }

  private static buildHtmlSlideDeck(options: PresentationOptions): string {
    const slidesData = [
      {
        title: options.title,
        subtitle: options.subtitle || '',
        isTitle: true,
        author: options.author || 'MaxIDE AI Studio',
        date: options.date || new Date().toLocaleDateString(),
      },
      ...options.slides.map((s) => ({ ...s, isTitle: false })),
    ];

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${options.title} — Slide Deck</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 0;
      background: #090d16;
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .deck-header {
      height: 52px;
      background: #0f172a;
      border-bottom: 1px solid #1e293b;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 20px;
    }
    .deck-title {
      font-size: 14px;
      font-weight: 600;
      color: #38bdf8;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .deck-controls {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .nav-btn {
      background: #1e293b;
      border: 1px solid #334155;
      color: #e2e8f0;
      padding: 6px 14px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      transition: all 0.15s ease;
    }
    .nav-btn:hover { background: #38bdf8; color: #0f172a; }
    .slide-counter { font-size: 13px; color: #94a3b8; min-width: 60px; text-align: center; }
    .deck-viewport {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 30px;
      background: #060910;
    }
    .slide-frame {
      width: 100%;
      max-width: 1080px;
      aspect-ratio: 16 / 9;
      background: #0f172a;
      border-radius: 12px;
      border: 1px solid #1e293b;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7);
      padding: 50px 60px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      position: relative;
    }
    .slide-accent {
      width: 40px;
      height: 4px;
      background: #38bdf8;
      border-radius: 2px;
      margin-bottom: 20px;
    }
    .slide-h1 {
      font-size: 40px;
      font-weight: 800;
      color: #ffffff;
      line-height: 1.15;
      margin: 0 0 16px 0;
    }
    .slide-sub {
      font-size: 18px;
      color: #94a3b8;
      line-height: 1.5;
      max-width: 800px;
    }
    .bullet-item {
      font-size: 20px;
      line-height: 1.6;
      color: #e2e8f0;
      margin-bottom: 16px;
      display: flex;
      align-items: flex-start;
      gap: 12px;
    }
    .bullet-icon { color: #38bdf8; font-weight: bold; }
    .stat-container {
      display: flex;
      gap: 30px;
      align-items: center;
      margin-top: 20px;
    }
    .stat-box {
      background: #1e293b;
      border: 1px solid #38bdf8;
      border-radius: 10px;
      padding: 30px;
      text-align: center;
      min-width: 240px;
    }
    .stat-val { font-size: 52px; font-weight: 900; color: #38bdf8; }
    .stat-lbl { font-size: 16px; font-weight: 600; color: #f8fafc; margin-top: 8px; }
    .deck-footer {
      font-size: 12px;
      color: #64748b;
      display: flex;
      justify-content: space-between;
      border-top: 1px solid #1e293b;
      padding-top: 16px;
    }
  </style>
</head>
<body>
  <div class="deck-header">
    <div class="deck-title">📊 ${options.title} (Interactive Deck)</div>
    <div class="deck-controls">
      <button class="nav-btn" onclick="prevSlide()">◀ Prev</button>
      <span class="slide-counter" id="counter">1 / ${slidesData.length}</span>
      <button class="nav-btn" onclick="nextSlide()">Next ▶</button>
      <a href="${options.title.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.pptx" download class="nav-btn" style="text-decoration:none; display:inline-block;">⬇️ Download PPTX</a>
    </div>
  </div>

  <div class="deck-viewport">
    <div class="slide-frame" id="slide-content"></div>
  </div>

  <script>
    const slides = ${JSON.stringify(slidesData)};
    let currentIdx = 0;

    function renderSlide(idx) {
      const s = slides[idx];
      document.getElementById('counter').innerText = (idx + 1) + ' / ' + slides.length;
      const el = document.getElementById('slide-content');

      if (s.isTitle) {
        el.innerHTML = \`
          <div>
            <div class="slide-accent"></div>
            <h1 class="slide-h1">\${s.title}</h1>
            <div class="slide-sub">\${s.subtitle}</div>
          </div>
          <div class="deck-footer">
            <span>\${s.author}</span>
            <span>\${s.date}</span>
          </div>
        \`;
      } else {
        let bodyHtml = '';
        if (s.stat) {
          bodyHtml = \`
            <div class="stat-container">
              <div class="stat-box">
                <div class="stat-val">\${s.stat.value}</div>
                <div class="stat-lbl">\${s.stat.label}</div>
              </div>
              <div style="flex:1;">
                \${(s.bulletPoints || []).map(b => \`<div class="bullet-item"><span class="bullet-icon">▸</span><span>\${b}</span></div>\`).join('')}
              </div>
            </div>
          \`;
        } else if (s.bulletPoints) {
          bodyHtml = s.bulletPoints.map(b => \`<div class="bullet-item"><span class="bullet-icon">▸</span><span>\${b}</span></div>\`).join('');
        }

        el.innerHTML = \`
          <div>
            <div style="font-size:12px; color:#38bdf8; text-transform:uppercase; letter-spacing:1px; margin-bottom:6px;">Slide \${idx + 1}</div>
            <h2 class="slide-h1" style="font-size:32px; margin-bottom:12px;">\${s.title}</h2>
            \${s.subtitle ? \`<div class="slide-sub" style="margin-bottom:24px;">\${s.subtitle}</div>\` : ''}
            <div>\${bodyHtml}</div>
          </div>
          <div class="deck-footer">
            <span>MaxIDE Presentation Engine</span>
            <span>\${idx + 1} of \${slides.length}</span>
          </div>
        \`;
      }
    }

    function prevSlide() {
      if (currentIdx > 0) { currentIdx--; renderSlide(currentIdx); }
    }
    function nextSlide() {
      if (currentIdx < slides.length - 1) { currentIdx++; renderSlide(currentIdx); }
    }
    window.addEventListener('keydown', e => {
      if (e.key === 'ArrowRight' || e.key === 'Space') nextSlide();
      if (e.key === 'ArrowLeft') prevSlide();
    });

    renderSlide(0);
  </script>
</body>
</html>`;
  }
}
