/**
 * MaxIDE APEX — Mission 10.2: Professional Design Engine
 * Synthesizes domain-specific design languages, color palettes, typography pairings,
 * layout systems, component tokens, and interaction patterns.
 * 
 * Prevents generic, cookie-cutter dashboards by deriving distinct design directions
 * based on product category and audience.
 */

export type VisualDirection =
  | 'MINIMALIST'
  | 'PREMIUM_ENTERPRISE'
  | 'MODERN_SAAS'
  | 'ARTISANAL_WARM'
  | 'EDITORIAL'
  | 'CREATIVE_VIBRANT'
  | 'E_COMMERCE_LUXURY'
  | 'PRODUCTIVITY_FOCUS'
  | 'DEVELOPER_DARK'
  | 'NATIVE_WINDOWS_FLUENT';

export type ProductCategory =
  | 'CAFE_RESTAURANT'
  | 'E_COMMERCE'
  | 'AI_PRODUCTIVITY'
  | 'DEVELOPER_TOOL'
  | 'ENTERPRISE_B2B'
  | 'NATIVE_WINDOWS'
  | 'FINTECH'
  | 'HEALTHCARE'
  | 'GENERAL_WEB';

export interface ColorTokenPalette {
  primary: string;
  primaryHover: string;
  secondary: string;
  background: string;
  surface: string;
  surfaceElevated: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  borderSubtle: string;
  accent: string;
  accentGlow: string;
  statusSuccess: string;
  statusWarning: string;
  statusError: string;
}

export interface TypographySpecification {
  googleFontsUrl: string;
  headingFont: string;
  bodyFont: string;
  monoFont: string;
  scale: {
    display: { size: string; weight: string; lineHeight: string; letterSpacing: string };
    h1: { size: string; weight: string; lineHeight: string; letterSpacing: string };
    h2: { size: string; weight: string; lineHeight: string; letterSpacing: string };
    h3: { size: string; weight: string; lineHeight: string; letterSpacing: string };
    body: { size: string; weight: string; lineHeight: string };
    bodySmall: { size: string; weight: string; lineHeight: string };
    caption: { size: string; weight: string; lineHeight: string };
  };
}

export interface LayoutSystemSpecification {
  containerMaxWidth: string;
  gridColumns: number;
  gutter: string;
  sectionPadding: string;
  cardPadding: string;
  borderRadius: {
    sm: string;
    md: string;
    lg: string;
    full: string;
  };
  shadows: {
    sm: string;
    md: string;
    lg: string;
    hover: string;
  };
}

export interface DesignSpecification {
  id: string;
  productName: string;
  targetAudience: string;
  category: ProductCategory;
  visualDirection: VisualDirection;
  colorPalette: ColorTokenPalette;
  typography: TypographySpecification;
  layout: LayoutSystemSpecification;
  navigationModel: {
    type: 'TOP_PILL_NAV' | 'SIDEBAR_DRAWER' | 'STICKY_SPLIT' | 'DESKTOP_TITLEBAR';
    features: string[];
  };
  interactionPatterns: {
    hoverEffect: string;
    buttonTransition: string;
    modalAnimation: string;
    toastPlacement: string;
  };
  cssVariablesBlock: string;
  csharpStylingTokens?: {
    formBackColorHex: string;
    panelBackColorHex: string;
    primaryColorHex: string;
    textColorHex: string;
    fontFamily: string;
    gridAlternatingColorHex: string;
  };
}

export class ProfessionalDesignEngine {
  /**
   * Generates a tailored design specification based on user prompt, domain, and platform.
   */
  public static generateDesignSpec(params: {
    prompt: string;
    category?: ProductCategory;
    targetPlatform?: 'WEB_APP' | 'NATIVE_WINDOWS' | 'FULLSTACK_WEB';
  }): DesignSpecification {
    const { prompt, targetPlatform } = params;
    const category = params.category || this.detectCategory(prompt, targetPlatform);
    const direction = this.resolveVisualDirection(category, prompt);

    const colorPalette = this.buildColorPalette(direction);
    const typography = this.buildTypography(direction);
    const layout = this.buildLayoutSystem(direction);
    const navigationModel = this.buildNavigationModel(category, direction);
    const interactionPatterns = this.buildInteractionPatterns(direction);

    const cssVariablesBlock = this.generateCssVariables(colorPalette, typography, layout, interactionPatterns);

    let csharpTokens;
    if (targetPlatform === 'NATIVE_WINDOWS' || category === 'NATIVE_WINDOWS') {
      csharpTokens = {
        formBackColorHex: '#F0F2F5',
        panelBackColorHex: '#FFFFFF',
        primaryColorHex: '#0067B8',
        textColorHex: '#201F1E',
        fontFamily: 'Segoe UI',
        gridAlternatingColorHex: '#F8F9FA',
      };
    }

    return {
      id: `design-${Date.now()}`,
      productName: this.extractProductName(prompt, category),
      targetAudience: this.deriveTargetAudience(category),
      category,
      visualDirection: direction,
      colorPalette,
      typography,
      layout,
      navigationModel,
      interactionPatterns,
      cssVariablesBlock,
      csharpStylingTokens: csharpTokens,
    };
  }

  private static detectCategory(prompt: string, platform?: string): ProductCategory {
    const p = prompt.toLowerCase();
    if (platform === 'NATIVE_WINDOWS' || /\b(winforms|native\s+windows|\.exe|wpf)\b/i.test(p)) {
      return 'NATIVE_WINDOWS';
    }
    if (/\b(cafe|restaurant|coffee|bistro|dining|menu\s+and\s+order|bakery|food)\b/i.test(p)) {
      return 'CAFE_RESTAURANT';
    }
    if (/\b(store|shop|ecommerce|e-commerce|cart|checkout|headphones|audio|catalog|products?)\b/i.test(p)) {
      return 'E_COMMERCE';
    }
    if (/\b(dashboard|productivity|tracker|task|attendance|analyzer|metrics|todo|focus)\b/i.test(p)) {
      return 'AI_PRODUCTIVITY';
    }
    if (/\b(dev|developer|api|terminal|code|logs|git|debugger|cli)\b/i.test(p)) {
      return 'DEVELOPER_TOOL';
    }
    if (/\b(enterprise|crm|erp|hrm|employee|management|admin)\b/i.test(p)) {
      return 'ENTERPRISE_B2B';
    }
    return 'GENERAL_WEB';
  }

  private static resolveVisualDirection(category: ProductCategory, prompt: string): VisualDirection {
    const p = prompt.toLowerCase();
    if (p.includes('minimal')) return 'MINIMALIST';
    if (p.includes('luxury') || p.includes('premium')) return 'E_COMMERCE_LUXURY';
    if (p.includes('cyberpunk') || p.includes('dark')) return 'DEVELOPER_DARK';

    switch (category) {
      case 'CAFE_RESTAURANT':
        return 'ARTISANAL_WARM';
      case 'E_COMMERCE':
        return 'MINIMALIST';
      case 'AI_PRODUCTIVITY':
        return 'PRODUCTIVITY_FOCUS';
      case 'DEVELOPER_TOOL':
        return 'DEVELOPER_DARK';
      case 'ENTERPRISE_B2B':
        return 'PREMIUM_ENTERPRISE';
      case 'NATIVE_WINDOWS':
        return 'NATIVE_WINDOWS_FLUENT';
      default:
        return 'MODERN_SAAS';
    }
  }

  private static buildColorPalette(direction: VisualDirection): ColorTokenPalette {
    switch (direction) {
      case 'ARTISANAL_WARM':
        return {
          primary: '#d97706',          // Warm Amber
          primaryHover: '#b45309',
          secondary: '#78350f',        // Roasted Umber
          background: '#fcfaf7',       // Warm Cream Canvas
          surface: '#ffffff',          // Crisp White Cards
          surfaceElevated: '#fef3c7',  // Amber Tint
          textPrimary: '#1c1917',      // Deep Charcoal
          textSecondary: '#44403c',    // Warm Stone
          textMuted: '#78716c',        // Stone Gray
          border: '#e7e5e4',           // Soft Stone Border
          borderSubtle: '#f5f5f4',
          accent: '#b45309',
          accentGlow: 'rgba(217, 119, 6, 0.15)',
          statusSuccess: '#15803d',
          statusWarning: '#d97706',
          statusError: '#b91c1c',
        };

      case 'MINIMALIST': // High-end E-commerce
        return {
          primary: '#111827',          // Ink Black
          primaryHover: '#374151',
          secondary: '#4b5563',
          background: '#f9fafb',       // Clean Gray Canvas
          surface: '#ffffff',
          surfaceElevated: '#f3f4f6',
          textPrimary: '#111827',
          textSecondary: '#4b5563',
          textMuted: '#9ca3af',
          border: '#e5e7eb',
          borderSubtle: '#f3f4f6',
          accent: '#2563eb',          // Precision Blue
          accentGlow: 'rgba(37, 99, 235, 0.12)',
          statusSuccess: '#059669',
          statusWarning: '#d97706',
          statusError: '#dc2626',
        };

      case 'PRODUCTIVITY_FOCUS':
        return {
          primary: '#4f46e5',          // Indigo Focus
          primaryHover: '#4338ca',
          secondary: '#6366f1',
          background: '#0f172a',       // Slate 900
          surface: '#1e293b',          // Slate 800
          surfaceElevated: '#334155',  // Slate 700
          textPrimary: '#f8fafc',      // White
          textSecondary: '#cbd5e1',    // Slate 300
          textMuted: '#64748b',        // Slate 500
          border: '#334155',
          borderSubtle: '#1e293b',
          accent: '#38bdf8',          // Sky Blue
          accentGlow: 'rgba(56, 189, 248, 0.2)',
          statusSuccess: '#10b981',
          statusWarning: '#f59e0b',
          statusError: '#ef4444',
        };

      case 'DEVELOPER_DARK':
        return {
          primary: '#10b981',          // Emerald Terminal
          primaryHover: '#059669',
          secondary: '#064e3b',
          background: '#0d1117',       // GitHub Dark Canvas
          surface: '#161b22',          // GitHub Dark Surface
          surfaceElevated: '#21262d',
          textPrimary: '#c9d1d9',
          textSecondary: '#8b949e',
          textMuted: '#484f58',
          border: '#30363d',
          borderSubtle: '#21262d',
          accent: '#58a6ff',
          accentGlow: 'rgba(88, 166, 255, 0.15)',
          statusSuccess: '#3fb950',
          statusWarning: '#d29922',
          statusError: '#f85149',
        };

      case 'NATIVE_WINDOWS_FLUENT':
        return {
          primary: '#0067b8',          // Windows Blue
          primaryHover: '#005da6',
          secondary: '#edebe9',
          background: '#f3f2f1',       // Fluent Mica Gray
          surface: '#ffffff',
          surfaceElevated: '#faf9f8',
          textPrimary: '#201f1e',
          textSecondary: '#605e5c',
          textMuted: '#a19f9d',
          border: '#e1dfdd',
          borderSubtle: '#edebe9',
          accent: '#0078d4',
          accentGlow: 'rgba(0, 120, 212, 0.15)',
          statusSuccess: '#107c10',
          statusWarning: '#d83b01',
          statusError: '#a80000',
        };

      default: // MODERN_SAAS / PREMIUM_ENTERPRISE
        return {
          primary: '#2563eb',          // Royal Blue
          primaryHover: '#1d4ed8',
          secondary: '#3b82f6',
          background: '#f8fafc',
          surface: '#ffffff',
          surfaceElevated: '#f1f5f9',
          textPrimary: '#0f172a',
          textSecondary: '#334155',
          textMuted: '#64748b',
          border: '#e2e8f0',
          borderSubtle: '#f1f5f9',
          accent: '#06b6d4',
          accentGlow: 'rgba(6, 182, 212, 0.15)',
          statusSuccess: '#16a34a',
          statusWarning: '#eab308',
          statusError: '#dc2626',
        };
    }
  }

  private static buildTypography(direction: VisualDirection): TypographySpecification {
    switch (direction) {
      case 'ARTISANAL_WARM':
      case 'EDITORIAL':
        return {
          googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=Playfair+Display:ital,wght@0,500;0,600;0,700;1,400&display=swap',
          headingFont: '"Playfair Display", Georgia, serif',
          bodyFont: 'Outfit, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          monoFont: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
          scale: {
            display: { size: '2.5rem', weight: '700', lineHeight: '1.15', letterSpacing: '-0.02em' },
            h1: { size: '2.0rem', weight: '600', lineHeight: '1.2', letterSpacing: '-0.015em' },
            h2: { size: '1.5rem', weight: '600', lineHeight: '1.3', letterSpacing: '-0.01em' },
            h3: { size: '1.25rem', weight: '600', lineHeight: '1.4', letterSpacing: '0' },
            body: { size: '0.95rem', weight: '400', lineHeight: '1.6' },
            bodySmall: { size: '0.85rem', weight: '400', lineHeight: '1.5' },
            caption: { size: '0.75rem', weight: '500', lineHeight: '1.4' },
          },
        };

      case 'MINIMALIST':
      case 'E_COMMERCE_LUXURY':
        return {
          googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap',
          headingFont: '"Plus Jakarta Sans", -apple-system, system-ui, sans-serif',
          bodyFont: '"Plus Jakarta Sans", -apple-system, system-ui, sans-serif',
          monoFont: 'ui-monospace, Menlo, Consolas, monospace',
          scale: {
            display: { size: '2.75rem', weight: '700', lineHeight: '1.1', letterSpacing: '-0.03em' },
            h1: { size: '2.25rem', weight: '700', lineHeight: '1.2', letterSpacing: '-0.025em' },
            h2: { size: '1.65rem', weight: '600', lineHeight: '1.3', letterSpacing: '-0.015em' },
            h3: { size: '1.25rem', weight: '600', lineHeight: '1.4', letterSpacing: '-0.01em' },
            body: { size: '0.95rem', weight: '400', lineHeight: '1.6' },
            bodySmall: { size: '0.85rem', weight: '400', lineHeight: '1.5' },
            caption: { size: '0.75rem', weight: '500', lineHeight: '1.4' },
          },
        };

      case 'DEVELOPER_DARK':
        return {
          googleFontsUrl: 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Inter:wght@400;500;600;700&display=swap',
          headingFont: 'Inter, -apple-system, sans-serif',
          bodyFont: 'Inter, -apple-system, sans-serif',
          monoFont: '"JetBrains Mono", Consolas, monospace',
          scale: {
            display: { size: '2.25rem', weight: '700', lineHeight: '1.2', letterSpacing: '-0.02em' },
            h1: { size: '1.85rem', weight: '600', lineHeight: '1.25', letterSpacing: '-0.015em' },
            h2: { size: '1.4rem', weight: '600', lineHeight: '1.3', letterSpacing: '-0.01em' },
            h3: { size: '1.15rem', weight: '600', lineHeight: '1.4', letterSpacing: '0' },
            body: { size: '0.9rem', weight: '400', lineHeight: '1.5' },
            bodySmall: { size: '0.8rem', weight: '400', lineHeight: '1.4' },
            caption: { size: '0.75rem', weight: '500', lineHeight: '1.3' },
          },
        };

      default: // Modern SaaS / Native Windows
        return {
          googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
          headingFont: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          bodyFont: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          monoFont: 'ui-monospace, Consolas, monospace',
          scale: {
            display: { size: '2.5rem', weight: '700', lineHeight: '1.15', letterSpacing: '-0.02em' },
            h1: { size: '2.0rem', weight: '700', lineHeight: '1.2', letterSpacing: '-0.02em' },
            h2: { size: '1.5rem', weight: '600', lineHeight: '1.3', letterSpacing: '-0.01em' },
            h3: { size: '1.2rem', weight: '600', lineHeight: '1.4', letterSpacing: '0' },
            body: { size: '0.95rem', weight: '400', lineHeight: '1.55' },
            bodySmall: { size: '0.85rem', weight: '400', lineHeight: '1.5' },
            caption: { size: '0.75rem', weight: '500', lineHeight: '1.4' },
          },
        };
    }
  }

  private static buildLayoutSystem(direction: VisualDirection): LayoutSystemSpecification {
    const isArtsy = direction === 'ARTISANAL_WARM';
    return {
      containerMaxWidth: isArtsy ? '1320px' : '1280px',
      gridColumns: 12,
      gutter: '24px',
      sectionPadding: '40px 0',
      cardPadding: isArtsy ? '20px' : '24px',
      borderRadius: {
        sm: '6px',
        md: isArtsy ? '14px' : '10px',
        lg: isArtsy ? '20px' : '16px',
        full: '9999px',
      },
      shadows: {
        sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        md: '0 4px 6px -1px rgba(0, 0, 0, 0.08), 0 2px 4px -2px rgba(0, 0, 0, 0.04)',
        lg: '0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -4px rgba(0, 0, 0, 0.04)',
        hover: '0 14px 24px -4px rgba(0, 0, 0, 0.12), 0 6px 10px -4px rgba(0, 0, 0, 0.06)',
      },
    };
  }

  private static buildNavigationModel(category: ProductCategory, direction: VisualDirection) {
    if (category === 'NATIVE_WINDOWS') {
      return {
        type: 'DESKTOP_TITLEBAR' as const,
        features: ['Title Bar with App Icon', 'MenuStrip / ToolStrip', 'StatusStrip'],
      };
    }
    if (category === 'CAFE_RESTAURANT') {
      return {
        type: 'STICKY_SPLIT' as const,
        features: ['Sticky Header with Brand', 'Category Pill Scroller', 'Sticky Desktop Cart (380px)'],
      };
    }
    if (category === 'AI_PRODUCTIVITY' || category === 'DEVELOPER_TOOL') {
      return {
        type: 'SIDEBAR_DRAWER' as const,
        features: ['Collapsible Nav Rail', 'Workspace Header', 'Theme Switcher', 'Search Bar'],
      };
    }
    return {
      type: 'TOP_PILL_NAV' as const,
      features: ['Top Brand Header', 'Category Pill Filters', 'Search Input', 'Slide-over Cart Drawer'],
    };
  }

  private static buildInteractionPatterns(direction: VisualDirection) {
    return {
      hoverEffect: 'translateY(-3px)',
      buttonTransition: 'all 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
      modalAnimation: 'fadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
      toastPlacement: 'bottom-right',
    };
  }

  private static generateCssVariables(
    colors: ColorTokenPalette,
    type: TypographySpecification,
    layout: LayoutSystemSpecification,
    interactions: { hoverEffect: string; buttonTransition: string }
  ): string {
    return `/* --- Professional Design Tokens (Generated by ProfessionalDesignEngine) --- */
:root {
  /* Color Palette */
  --color-primary: ${colors.primary};
  --color-primary-hover: ${colors.primaryHover};
  --color-secondary: ${colors.secondary};
  --color-bg: ${colors.background};
  --color-surface: ${colors.surface};
  --color-surface-elevated: ${colors.surfaceElevated};
  --color-text: ${colors.textPrimary};
  --color-text-secondary: ${colors.textSecondary};
  --color-text-muted: ${colors.textMuted};
  --color-border: ${colors.border};
  --color-border-subtle: ${colors.borderSubtle};
  --color-accent: ${colors.accent};
  --color-accent-glow: ${colors.accentGlow};
  --color-success: ${colors.statusSuccess};
  --color-warning: ${colors.statusWarning};
  --color-error: ${colors.statusError};

  /* Typography */
  --font-heading: ${type.headingFont};
  --font-body: ${type.bodyFont};
  --font-mono: ${type.monoFont};

  /* Layout & Spacing */
  --container-max-width: ${layout.containerMaxWidth};
  --gutter: ${layout.gutter};
  --radius-sm: ${layout.borderRadius.sm};
  --radius-md: ${layout.borderRadius.md};
  --radius-lg: ${layout.borderRadius.lg};
  --radius-full: ${layout.borderRadius.full};

  /* Elevation */
  --shadow-sm: ${layout.shadows.sm};
  --shadow-md: ${layout.shadows.md};
  --shadow-lg: ${layout.shadows.lg};
  --shadow-hover: ${layout.shadows.hover};

  /* Micro-Interactions */
  --transition-smooth: ${interactions.buttonTransition};
  --hover-lift: ${interactions.hoverEffect};
}`;
  }

  private static extractProductName(prompt: string, category: ProductCategory): string {
    if (category === 'CAFE_RESTAURANT') return 'Aroma & Oak Artisanal Cafe';
    if (category === 'E_COMMERCE') return 'Aether Audio Minimalist Store';
    if (category === 'AI_PRODUCTIVITY') return 'Apex Focus AI Dashboard';
    if (category === 'NATIVE_WINDOWS') return 'Enterprise Employee Directory';
    return 'Apex Application';
  }

  private static deriveTargetAudience(category: ProductCategory): string {
    switch (category) {
      case 'CAFE_RESTAURANT': return 'Cafe patrons seeking artisanal dining, swift ordering, and dietary clarity';
      case 'E_COMMERCE': return 'Audiophiles and design enthusiasts seeking high-fidelity audio equipment';
      case 'AI_PRODUCTIVITY': return 'Knowledge workers requiring task management, focus metrics, and minimal friction';
      case 'DEVELOPER_TOOL': return 'Engineers requiring low latency, clean syntax highlighting, and keyboard shortcuts';
      case 'NATIVE_WINDOWS': return 'Corporate administrators needing responsive, offline desktop data management';
      default: return 'General users seeking modern, accessible digital software';
    }
  }
}
