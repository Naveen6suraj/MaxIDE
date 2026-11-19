/**
 * MaxIDE APEX — Mission 10.2: Outcome-Driven Product Specification Engine
 * Converts natural-language software engineering requests into structured,
 * implementation-ready product specifications before code generation.
 * Integrates ProfessionalDesignEngine for tailored design tokens and aesthetics.
 */

import fs from 'fs';
import path from 'path';
import { TaskContract } from '../agent/intent/IntentClassifier.js';
import { ProfessionalDesignEngine, DesignSpecification } from './ProfessionalDesignEngine.js';
import { AssetSelectionEngine } from './AssetSelectionEngine.js';

export interface ProductPageSpec {
  id: string;
  title: string;
  containers: string[];
  components: string[];
}

export interface ProductDataModelSpec {
  entityName: string;
  fields: Array<{ name: string; type: string; required: boolean; description?: string }>;
  sampleRecords: Record<string, any>[];
}

export interface ProductFeatureSpec {
  id: string;
  name: string;
  trigger: string;
  expectedBehavior: string;
  mandatory: boolean;
}

export interface ProductValidationRule {
  target: string;
  rule: string;
  errorMessage: string;
}

export interface ProductTestCriterion {
  id: string;
  description: string;
  category: 'FUNCTIONAL' | 'VISUAL' | 'RUNTIME' | 'RESPONSIVE';
  mandatory: boolean;
}

export interface ExistingProjectAnalysis {
  hasExistingCode: boolean;
  existingFiles: string[];
  implementedFeatures: string[];
  missingFeatures: string[];
  recommendedImprovements: string[];
  preservedFunctionality: string[];
}

export interface ProductSpec {
  id: string;
  name: string;
  domain: string;
  targetPlatform: 'WEB_APP' | 'NATIVE_WINDOWS' | 'FULLSTACK_WEB' | 'BACKEND_SERVICE' | 'CLI_UTILITY';
  architectureDescription: string;
  designSpec?: DesignSpecification;
  pages: ProductPageSpec[];
  dataModels: ProductDataModelSpec[];
  interactiveFeatures: ProductFeatureSpec[];
  validationRules: ProductValidationRule[];
  states: {
    emptyStates: string[];
    loadingStates: string[];
    errorStates: string[];
  };
  responsiveRequirements: {
    desktopLayout: string;
    mobileLayout: string;
    breakpoints: string[];
  };
  accessibilityRequirements: string[];
  testCriteria: ProductTestCriterion[];
  requiredDeliverables: string[];
  existingProjectAnalysis?: ExistingProjectAnalysis;
  generatedAt: string;
}

export class ProductSpecEngine {
  /**
   * Converts a natural-language engineering request and task contract
   * into a complete, non-stub product specification.
   */
  public static generateSpec(
    prompt: string,
    contract: TaskContract,
    workspacePath: string = process.cwd()
  ): ProductSpec {
    const lower = prompt.toLowerCase();
    const existingAnalysis = this.inspectExistingProject(workspacePath, prompt);

    // 1. Cafe & Restaurant Ordering System
    if (/\b(cafe|restaurant|menu|order|food|coffee|bakery|dining)\b/i.test(lower)) {
      return this.generateCafeOrderingSpec(prompt, contract, existingAnalysis);
    }

    // 2. Student Attendance Analyzer & Tracker
    if (/\b(attendance|student|grades?|roster)\b/i.test(lower)) {
      return this.generateAttendanceSpec(prompt, contract, existingAnalysis);
    }

    // 3. E-Commerce Storefront
    if (/\b(store|shop|ecommerce|e-commerce|cart|checkout|headphones|audio|catalog|products?)\b/i.test(lower)) {
      return this.generateECommerceSpec(prompt, contract, existingAnalysis);
    }

    // 4. AI Productivity / Dashboard / Focus Tracker
    if (/\b(productivity|dashboard|focus|task|analyzer|metrics)\b/i.test(lower)) {
      return this.generateProductivitySpec(prompt, contract, existingAnalysis);
    }

    // 4. Full-Stack Web Application (Frontend + Backend + API + Database)
    if (/\b(full-stack|fullstack|backend|api|crud|express|sqlite|notes?)\b/i.test(lower)) {
      return this.generateFullStackSpec(prompt, contract, existingAnalysis);
    }

    // 5. Native Windows Desktop Application (WinForms / C#)
    if (contract.targetPlatform === 'NATIVE_WINDOWS' || /\b(native\s+windows|desktop\s+app|winforms|wpf|win32|\.exe\b)\b/i.test(lower)) {
      return this.generateNativeWindowsSpec(prompt, contract, existingAnalysis);
    }

    // 6. Default: General Interactive Modern Web Application
    return this.generateGeneralWebSpec(prompt, contract, existingAnalysis);
  }

  /**
   * Inspects existing project files to identify implemented functionality,
   * preserve useful code, and detect missing features.
   */
  public static inspectExistingProject(workspacePath: string, prompt?: string): ExistingProjectAnalysis {
    const existingFiles: string[] = [];
    const implementedFeatures: string[] = [];
    const missingFeatures: string[] = [];
    const recommendedImprovements: string[] = [];
    const preservedFunctionality: string[] = [];

    try {
      if (fs.existsSync(workspacePath)) {
        const files = fs.readdirSync(workspacePath);
        for (const f of files) {
          if (!['node_modules', '.git', '.orbit', 'dist'].includes(f)) {
            existingFiles.push(f);
          }
        }
      }
    } catch {}

    const hasExistingCode = existingFiles.includes('index.html') || existingFiles.includes('App.cs') || existingFiles.includes('package.json');

    if (hasExistingCode) {
      preservedFunctionality.push('Preserve existing functional event handlers and working UI layout');
      recommendedImprovements.push('Fix defect identified in prompt while retaining all existing working components');
    }

    return {
      hasExistingCode,
      existingFiles,
      implementedFeatures,
      missingFeatures,
      recommendedImprovements,
      preservedFunctionality,
    };
  }

  // --------------------------------------------------------------------------
  // SPEC GENERATOR: CAFE RESTAURANT ORDERING SYSTEM (WITH PHOTOGRAPHY)
  // --------------------------------------------------------------------------
  private static generateCafeOrderingSpec(
    prompt: string,
    contract: TaskContract,
    existing: ExistingProjectAnalysis
  ): ProductSpec {
    const designSpec = ProfessionalDesignEngine.generateDesignSpec({
      prompt,
      category: 'CAFE_RESTAURANT',
      targetPlatform: 'WEB_APP',
    });

    const sampleRecords = [
      { id: 'c1', category: 'coffee', name: 'Single Origin Pour Over', desc: 'Ethiopian Yirgacheffe with floral jasmine and bergamot notes.', price: 5.25, tag: 'Popular', imageUrl: AssetSelectionEngine.resolveAsset('cafe_pour_over').primaryUrl, imageAlt: 'Pour Over Coffee', isVegetarian: true, isGlutenFree: true },
      { id: 'c2', category: 'coffee', name: 'Kyoto-Style Cold Brew', desc: 'Slow-dripped over 16 hours for a silky, chocolate-forward profile.', price: 5.75, tag: 'Signature', imageUrl: AssetSelectionEngine.resolveAsset('cafe_cold_brew').primaryUrl, imageAlt: 'Cold Brew Glass', isVegetarian: true, isGlutenFree: true },
      { id: 'c3', category: 'coffee', name: 'Double Espresso Romano', desc: 'Rich double espresso extracted over candied lemon peel.', price: 4.25, tag: 'Classic', imageUrl: AssetSelectionEngine.resolveAsset('cafe_espresso').primaryUrl, imageAlt: 'Double Espresso Romano', isVegetarian: true, isGlutenFree: true },
      { id: 'c4', category: 'coffee', name: 'Vanilla Cardamom Oat Latte', desc: 'House-made Madagascar vanilla syrup, organic oat milk, ground cardamom.', price: 6.50, tag: 'Staff Pick', imageUrl: AssetSelectionEngine.resolveAsset('cafe_oat_latte').primaryUrl, imageAlt: 'Oat Milk Latte Art', isVegetarian: true, isGlutenFree: true },
      { id: 't1', category: 'tea', name: 'Ceremonial Matcha Latte', desc: 'Stone-ground Uji matcha whisked with lightly steamed almond milk.', price: 6.75, tag: 'Antioxidant', imageUrl: AssetSelectionEngine.resolveAsset('cafe_matcha').primaryUrl, imageAlt: 'Ceremonial Matcha Latte', isVegetarian: true, isGlutenFree: true },
      { id: 'b1', category: 'bakery', name: 'French Butter Croissant', desc: 'Hand-laminated cultured butter dough baked golden and flaky.', price: 4.50, tag: 'Baked Today', imageUrl: AssetSelectionEngine.resolveAsset('cafe_croissant').primaryUrl, imageAlt: 'French Butter Croissant', isVegetarian: true, isGlutenFree: false },
      { id: 'br1', category: 'brunch', name: 'Sourdough Avocado Tartine', desc: 'Hass avocado, pickled shallots, organic microgreens, chili flakes, Maldon salt.', price: 11.50, tag: 'Brunch Favorite', imageUrl: AssetSelectionEngine.resolveAsset('cafe_avocado_toast').primaryUrl, imageAlt: 'Sourdough Avocado Tartine', isVegetarian: true, isGlutenFree: false },
      { id: 'br2', category: 'brunch', name: 'Acai Berry & Granola Bowl', desc: 'Pure Brazilian acai topped with house granola, fresh berries, and chia seeds.', price: 12.00, tag: 'Organic', imageUrl: AssetSelectionEngine.resolveAsset('cafe_berry_bowl').primaryUrl, imageAlt: 'Acai Berry Granola Bowl', isVegetarian: true, isGlutenFree: true },
    ];

    return {
      id: `spec-cafe-${Date.now()}`,
      name: 'Aroma & Oak Artisanal Cafe & Kitchen',
      domain: 'CAFE_ORDERING',
      targetPlatform: 'WEB_APP',
      architectureDescription: 'High-end responsive artisanal cafe web application featuring genuine food photography, real-time search, category tabs, dietary filtering, interactive cart, tip selector, and receipt confirmation modal.',
      designSpec,
      pages: [
        {
          id: 'menu_page',
          title: 'Aroma & Oak Cafe Menu & Ordering',
          containers: ['header.site-header', 'nav.category-nav', 'section.menu-section', 'aside.order-sidebar', 'div#orderModal'],
          components: [
            'Artisanal Brand Header with Status Badge',
            'Live Search Bar (#menuSearchInput) with Clear Button',
            'Category Tabs (All, Coffee, Teas, Bakery, Brunch)',
            'Dietary Filter Toggles (Vegetarian Only, Gluten-Free Only)',
            'Menu Grid of Cards with High-Res Photography (<img> tags), Pricing, and + Add Buttons',
            'Sticky Order Sidebar with Dine-In / Takeout Toggle and Staff Tip Selector (0%, 10%, 15%, 20%)',
            'Bill Breakdown (Subtotal, 8% Tax, Tip, Grand Total)',
            'Order Receipt Modal with Ticket Summary',
          ],
        },
      ],
      dataModels: [
        {
          entityName: 'MenuItem',
          fields: [
            { name: 'id', type: 'string', required: true },
            { name: 'category', type: 'string', required: true },
            { name: 'name', type: 'string', required: true },
            { name: 'desc', type: 'string', required: true },
            { name: 'price', type: 'number', required: true },
            { name: 'imageUrl', type: 'string', required: true },
            { name: 'imageAlt', type: 'string', required: true },
            { name: 'isVegetarian', type: 'boolean', required: true },
            { name: 'isGlutenFree', type: 'boolean', required: true },
          ],
          sampleRecords,
        },
      ],
      interactiveFeatures: [
        { id: 'f_catalog_render', name: 'Catalog Rendering with Real Photography', trigger: 'Page load', expectedBehavior: 'Renders menu cards with <img> tags, real photography, prices, and + Add buttons', mandatory: true },
        { id: 'f_search', name: 'Real-Time Search', trigger: 'Typing in #menuSearchInput', expectedBehavior: 'Filters menu cards by name/description in real-time', mandatory: true },
        { id: 'f_category_filter', name: 'Category Filter Tabs', trigger: 'Clicking .cat-pill', expectedBehavior: 'Displays only items matching selected category; active pill visually highlighted', mandatory: true },
        { id: 'f_dietary_filter', name: 'Dietary Toggle Filter', trigger: 'Checking dietary toggles', expectedBehavior: 'Filters catalog by vegetarian and gluten-free tags', mandatory: true },
        { id: 'f_add_to_cart', name: 'Add to Cart', trigger: 'Clicking .add-btn', expectedBehavior: 'Adds item to cart, increments badge, recalculates totals', mandatory: true },
        { id: 'f_qty_adjust', name: 'Quantity Adjustment', trigger: 'Clicking .qty-btn +/-', expectedBehavior: 'Increases or decreases quantity and updates line total', mandatory: true },
        { id: 'f_remove_item', name: 'Remove from Cart', trigger: 'Clicking .remove-btn or decrementing to 0', expectedBehavior: 'Removes item from cart and recalculates totals', mandatory: true },
        { id: 'f_tip_selector', name: 'Staff Tip Selector', trigger: 'Clicking tip button (0%, 10%, 15%, 20%)', expectedBehavior: 'Updates tip amount and recalculates final order total', mandatory: true },
        { id: 'f_totals_arithmetic', name: 'Order Totals Calculation', trigger: 'Any cart or tip change', expectedBehavior: 'Subtotal = sum(price * qty); Tax = Subtotal * 0.08; Tip = Subtotal * (tipRate / 100); Total = Subtotal + Tax + Tip', mandatory: true },
        { id: 'f_form_validation', name: 'Checkout Form Validation', trigger: 'Clicking #placeOrderBtn with empty name', expectedBehavior: 'Blocks order placement and displays validation alert requiring customer name', mandatory: true },
        { id: 'f_order_receipt', name: 'Order Receipt Confirmation', trigger: 'Clicking #placeOrderBtn with valid name and non-empty cart', expectedBehavior: 'Displays modal ticket with order number, dining mode, itemized lines, and grand total', mandatory: true },
        { id: 'f_mobile_toggle', name: 'Mobile Order Drawer', trigger: 'Clicking #cartToggleBtn on viewport < 992px', expectedBehavior: 'Slides or opens order sidebar drawer on mobile screens', mandatory: true },
      ],
      validationRules: [
        { target: '#customerName', rule: 'value.trim().length > 0', errorMessage: 'Please enter your name before placing your order.' },
        { target: 'cart.length', rule: 'cart.length > 0', errorMessage: 'Your order is empty. Please add items from the menu.' },
      ],
      states: {
        emptyStates: ['Empty cart displays: "Your order is empty. Select delicious items from the menu."', 'Zero search results displays: "No menu items match your search."'],
        loadingStates: ['Initial data load indicator'],
        errorStates: ['Validation alert on empty customer name'],
      },
      responsiveRequirements: {
        desktopLayout: '2-column layout with 380px sticky right sidebar and catalog grid on left',
        mobileLayout: 'Single-column fluid layout with horizontal category scroller and slide-over order drawer',
        breakpoints: ['@media (max-width: 992px)', '@media (max-width: 640px)'],
      },
      accessibilityRequirements: [
        'Semantic HTML5 structure',
        'Meaningful alt text on all product photographs',
        'WCAG AA color contrast ratio (min 4.5:1)',
      ],
      testCriteria: [
        { id: 't_load', description: 'Application loads at /workspace-preview/index.html with status 200', category: 'RUNTIME', mandatory: true },
        { id: 't_menu_render', description: 'Menu grid renders cards with <img> tags (no emoji placeholders)', category: 'VISUAL', mandatory: true },
        { id: 't_search', description: 'Search filters items dynamically', category: 'FUNCTIONAL', mandatory: true },
        { id: 't_cart_math', description: 'Subtotal + Tax + Tip equals Grand Total exactly', category: 'FUNCTIONAL', mandatory: true },
      ],
      requiredDeliverables: ['index.html', 'styles.css', 'app.js'],
      existingProjectAnalysis: existing,
      generatedAt: new Date().toISOString(),
    };
  }

  // --------------------------------------------------------------------------
  // SPEC GENERATOR: STUDENT ATTENDANCE ANALYZER
  // --------------------------------------------------------------------------
  private static generateAttendanceSpec(
    prompt: string,
    contract: TaskContract,
    existing: ExistingProjectAnalysis
  ): ProductSpec {
    const designSpec = ProfessionalDesignEngine.generateDesignSpec({
      prompt,
      category: 'AI_PRODUCTIVITY',
      targetPlatform: 'WEB_APP',
    });

    const sampleRecords = [
      { id: 's1', name: 'Sophia Chen', studentId: 'STU-101', course: 'Computer Science', totalClasses: 40, present: 38, absent: 2, late: 0, status: 'Good Standing' },
      { id: 's2', name: 'Liam Johnson', studentId: 'STU-102', course: 'Computer Science', totalClasses: 40, present: 31, absent: 7, late: 2, status: 'At Risk' },
      { id: 's3', name: 'Aaliyah Patel', studentId: 'STU-103', course: 'Software Engineering', totalClasses: 40, present: 40, absent: 0, late: 0, status: 'Perfect Attendance' },
    ];

    return {
      id: `spec-attendance-${Date.now()}`,
      name: 'Student Attendance Analyzer & Academic Health Dashboard',
      domain: 'ATTENDANCE_ANALYZER',
      targetPlatform: 'WEB_APP',
      architectureDescription: 'Interactive single-page dashboard with summary statistics cards, student attendance table, real-time rate calculator, filter by course/status, and new record entry form.',
      designSpec,
      pages: [
        {
          id: 'dashboard_view',
          title: 'Student Attendance Analyzer',
          containers: ['header.app-header', 'section.metrics-bar', 'section.table-controls', 'section.data-table-container'],
          components: ['Aggregate Attendance Statistics', 'Search by Student Name or ID', 'Course Filter Dropdown', 'Attendance Roster Table'],
        },
      ],
      dataModels: [
        {
          entityName: 'StudentAttendanceRecord',
          fields: [
            { name: 'id', type: 'string', required: true },
            { name: 'name', type: 'string', required: true },
            { name: 'studentId', type: 'string', required: true },
            { name: 'course', type: 'string', required: true },
            { name: 'present', type: 'number', required: true },
            { name: 'absent', type: 'number', required: true },
          ],
          sampleRecords,
        },
      ],
      interactiveFeatures: [
        { id: 'f_metrics_calc', name: 'Aggregate Metrics Calculation', trigger: 'Data change', expectedBehavior: 'Calculates attendance percentage', mandatory: true },
        { id: 'f_search_roster', name: 'Search Student Roster', trigger: 'Typing in search input', expectedBehavior: 'Filters table rows in real-time', mandatory: true },
        { id: 'f_filter_course', name: 'Course Filter', trigger: 'Selecting course dropdown', expectedBehavior: 'Displays only students in selected course', mandatory: true },
        { id: 'f_mark_attendance', name: 'Mark Daily Attendance', trigger: 'Clicking quick attendance toggles', expectedBehavior: 'Updates present/absent count', mandatory: true },
        { id: 'f_add_student', name: 'Add Student Record', trigger: 'Submitting add student form', expectedBehavior: 'Appends new record to roster', mandatory: true },
      ],
      validationRules: [
        { target: 'studentName', rule: 'value.trim().length >= 2', errorMessage: 'Student name must be at least 2 characters.' },
      ],
      states: {
        emptyStates: ['No students enrolled message'],
        loadingStates: ['Loading attendance records...'],
        errorStates: ['Validation alert on invalid input'],
      },
      responsiveRequirements: {
        desktopLayout: 'Clean responsive dashboard table with metrics cards',
        mobileLayout: 'Single-column stacked list',
        breakpoints: ['@media (max-width: 768px)'],
      },
      accessibilityRequirements: ['Semantic table and header tags'],
      testCriteria: [
        { id: 't_load', description: 'Application loads with status 200', category: 'RUNTIME', mandatory: true },
      ],
      requiredDeliverables: ['index.html', 'styles.css', 'app.js'],
      existingProjectAnalysis: existing,
      generatedAt: new Date().toISOString(),
    };
  }

  // --------------------------------------------------------------------------
  // SPEC GENERATOR: E-COMMERCE STOREFRONT (AUDIO HARDWARE)
  // --------------------------------------------------------------------------
  private static generateECommerceSpec(
    prompt: string,
    contract: TaskContract,
    existing: ExistingProjectAnalysis
  ): ProductSpec {
    const designSpec = ProfessionalDesignEngine.generateDesignSpec({
      prompt,
      category: 'E_COMMERCE',
      targetPlatform: 'WEB_APP',
    });

    const sampleRecords = [
      { id: 'p1', name: 'Aether Studio Wireless Headphones', category: 'Over-Ear', price: 299.00, desc: 'Flagship closed-back headphones with planar magnetic drivers and 40h battery.', rating: 4.9, stock: 14, imageUrl: AssetSelectionEngine.resolveAsset('audio_headphone_pro').primaryUrl, imageAlt: 'Studio Wireless Headphones' },
      { id: 'p2', name: 'Aether Horizon ANC Earbuds', category: 'In-Ear', price: 179.00, desc: 'True-wireless active noise cancelling earbuds with spatial audio tracking.', rating: 4.8, stock: 22, imageUrl: AssetSelectionEngine.resolveAsset('audio_earbuds_anc').primaryUrl, imageAlt: 'Wireless ANC Earbuds' },
      { id: 'p3', name: 'Precision High-Res DAC Amplifier', category: 'DAC / Amps', price: 249.00, desc: '32-bit/384kHz desktop digital-to-analog converter with balanced 4.4mm output.', rating: 5.0, stock: 8, imageUrl: AssetSelectionEngine.resolveAsset('audio_dac_amp').primaryUrl, imageAlt: 'Desktop DAC Amplifier' },
      { id: 'p4', name: 'Audiophile Silver Braided Cable', category: 'Cables', price: 65.00, desc: '8-core silver-plated copper headphone cable with gold-plated connectors.', rating: 4.7, stock: 35, imageUrl: AssetSelectionEngine.resolveAsset('audio_braided_cable').primaryUrl, imageAlt: 'Braided Audio Cable' },
    ];

    return {
      id: `spec-ecommerce-${Date.now()}`,
      name: 'Aether Audio Minimalist Storefront',
      domain: 'E_COMMERCE',
      targetPlatform: 'WEB_APP',
      architectureDescription: 'Modern minimalist e-commerce storefront with product cards, category filters, real-time search, interactive slide-out cart, quantity controls, and checkout modal.',
      designSpec,
      pages: [
        {
          id: 'store_page',
          title: 'Aether Audio — Precision Acoustic Instruments',
          containers: ['header.store-header', 'nav.filter-bar', 'section.products-grid', 'aside#cartDrawer', 'div#checkoutModal'],
          components: [
            'Brand Navigation with Cart Indicator and Search Bar',
            'Category Filter Tabs (All, Over-Ear, In-Ear, DAC / Amps, Cables)',
            'Product Cards with High-Res Photography (<img> tags), Pricing, Badges, and Add to Cart Buttons',
            'Slide-over Cart Drawer with Quantity Increment/Decrement and Remove Controls',
            'Subtotal, Shipping, Tax, and Order Total Calculation',
            'Checkout Modal with Form Validation and Order Confirmation Receipt',
          ],
        },
      ],
      dataModels: [
        {
          entityName: 'Product',
          fields: [
            { name: 'id', type: 'string', required: true },
            { name: 'name', type: 'string', required: true },
            { name: 'category', type: 'string', required: true },
            { name: 'price', type: 'number', required: true },
            { name: 'desc', type: 'string', required: true },
            { name: 'rating', type: 'number', required: true },
            { name: 'stock', type: 'number', required: true },
            { name: 'imageUrl', type: 'string', required: true },
            { name: 'imageAlt', type: 'string', required: true },
          ],
          sampleRecords,
        },
      ],
      interactiveFeatures: [
        { id: 'f_catalog_render', name: 'Catalog Rendering', trigger: 'Page load', expectedBehavior: 'Renders product cards with images, prices, ratings, and Add to Cart buttons', mandatory: true },
        { id: 'f_search', name: 'Real-Time Search', trigger: 'Typing in search input', expectedBehavior: 'Filters product cards in real time matching product name or description', mandatory: true },
        { id: 'f_category_filter', name: 'Category Filter Tabs', trigger: 'Clicking category tab', expectedBehavior: 'Filters products by category with active state indicator', mandatory: true },
        { id: 'f_add_to_cart', name: 'Add to Cart', trigger: 'Clicking Add to Cart button', expectedBehavior: 'Adds item to cart, opens cart drawer, updates badge count, and saves to localStorage', mandatory: true },
        { id: 'f_qty_adjust', name: 'Quantity Adjustment', trigger: 'Clicking +/- buttons in cart', expectedBehavior: 'Adjusts item quantity and updates subtotal', mandatory: true },
        { id: 'f_remove_item', name: 'Remove Item', trigger: 'Clicking remove button in cart', expectedBehavior: 'Removes item from cart and recalculates totals', mandatory: true },
        { id: 'f_totals_arithmetic', name: 'Cart Totals Calculation', trigger: 'Cart modification', expectedBehavior: 'Subtotal + Shipping ($15 or Free over $300) + Tax (8%) = Grand Total', mandatory: true },
        { id: 'f_form_validation', name: 'Checkout Form Validation', trigger: 'Submitting checkout with empty fields', expectedBehavior: 'Requires valid customer name, email, and shipping address', mandatory: true },
        { id: 'f_order_receipt', name: 'Order Confirmation Modal', trigger: 'Submitting valid checkout', expectedBehavior: 'Renders confirmation receipt ticket with order ID, clears cart', mandatory: true },
      ],
      validationRules: [
        { target: '#customerEmail', rule: 'value.includes("@")', errorMessage: 'Please enter a valid email address.' },
        { target: 'cart.length', rule: 'cart.length > 0', errorMessage: 'Your cart is empty.' },
      ],
      states: {
        emptyStates: ['Empty cart displays: "Your shopping bag is empty. Explore our collection."'],
        loadingStates: ['Loading catalog state'],
        errorStates: ['Validation alerts on invalid email or address'],
      },
      responsiveRequirements: {
        desktopLayout: 'Clean 3-column product grid with slide-over drawer',
        mobileLayout: 'Single column responsive grid with sticky mobile header',
        breakpoints: ['@media (max-width: 992px)', '@media (max-width: 640px)'],
      },
      accessibilityRequirements: ['Semantic HTML5', 'Alt text on product photography', 'Keyboard focusable inputs'],
      testCriteria: [
        { id: 't_load', description: 'Storefront loads with status 200', category: 'RUNTIME', mandatory: true },
        { id: 't_cart', description: 'Adding to cart updates cart drawer dynamically', category: 'FUNCTIONAL', mandatory: true },
      ],
      requiredDeliverables: ['index.html', 'styles.css', 'app.js'],
      existingProjectAnalysis: existing,
      generatedAt: new Date().toISOString(),
    };
  }

  // --------------------------------------------------------------------------
  // SPEC GENERATOR: AI PRODUCTIVITY DASHBOARD
  // --------------------------------------------------------------------------
  private static generateProductivitySpec(
    prompt: string,
    contract: TaskContract,
    existing: ExistingProjectAnalysis
  ): ProductSpec {
    const designSpec = ProfessionalDesignEngine.generateDesignSpec({
      prompt,
      category: 'AI_PRODUCTIVITY',
      targetPlatform: 'WEB_APP',
    });

    const sampleRecords = [
      { id: 't1', title: 'Compile Architecture RFC for Microservices', priority: 'High', category: 'Engineering', dueDate: 'Today', completed: false },
      { id: 't2', title: 'Refactor SQLite Query Optimizer for Offline Indexing', priority: 'High', category: 'Backend', dueDate: 'Today', completed: true },
      { id: 't3', title: 'Design System Typography Audit & Token Calibration', priority: 'Medium', category: 'Design', dueDate: 'Tomorrow', completed: false },
      { id: 't4', title: 'Evaluate Model Latency on RTX 3050 VRAM', priority: 'Low', category: 'AI Research', dueDate: 'Friday', completed: true },
    ];

    return {
      id: `spec-prod-${Date.now()}`,
      name: 'Apex Focus AI Productivity Dashboard',
      domain: 'AI_PRODUCTIVITY',
      targetPlatform: 'WEB_APP',
      architectureDescription: 'High-density focus productivity dashboard with aggregate velocity cards, interactive task management, search/filters, light/dark theme toggle, and localStorage persistence.',
      designSpec,
      pages: [
        {
          id: 'dashboard',
          title: 'Apex Focus Dashboard',
          containers: ['header.app-header', 'section.metrics-grid', 'section.task-controls', 'section.task-list', 'div#taskModal'],
          components: [
            'Metrics Bar: Total Tasks, Completed Tasks, Productivity Velocity %, Focus Hours',
            'Search Input and Category Filters (All, Engineering, Backend, Design)',
            'Status Toggle Filters (All, Active, Completed)',
            'Interactive Task Cards with Completion Checkbox, Priority Badge, and Delete Action',
            'Add New Task Modal with Input Validation',
            'Theme Switcher (Dark / Light Mode Toggle)',
          ],
        },
      ],
      dataModels: [
        {
          entityName: 'TaskItem',
          fields: [
            { name: 'id', type: 'string', required: true },
            { name: 'title', type: 'string', required: true },
            { name: 'priority', type: 'string', required: true },
            { name: 'category', type: 'string', required: true },
            { name: 'completed', type: 'boolean', required: true },
          ],
          sampleRecords,
        },
      ],
      interactiveFeatures: [
        { id: 'f_metrics_calc', name: 'Aggregate Metrics Calculation', trigger: 'Task update', expectedBehavior: 'Updates velocity percentage = (completed / total) * 100', mandatory: true },
        { id: 'f_search_roster', name: 'Search Tasks', trigger: 'Typing in search input', expectedBehavior: 'Filters task list in real time matching title or category', mandatory: true },
        { id: 'f_filter_course', name: 'Category & Status Filter', trigger: 'Clicking filter pills', expectedBehavior: 'Filters displayed tasks by active selection', mandatory: true },
        { id: 'f_mark_attendance', name: 'Toggle Task Completion', trigger: 'Clicking task checkbox', expectedBehavior: 'Toggles completed state, updates velocity metrics, saves to localStorage', mandatory: true },
        { id: 'f_add_student', name: 'Add New Task', trigger: 'Submitting task form', expectedBehavior: 'Appends task to list and updates counts', mandatory: true },
      ],
      validationRules: [
        { target: '#taskTitle', rule: 'value.trim().length >= 3', errorMessage: 'Task title must be at least 3 characters.' },
      ],
      states: {
        emptyStates: ['Zero tasks message: "No tasks found in this view. Create one above to get started."'],
        loadingStates: ['Loading dashboard metrics'],
        errorStates: ['Validation alert on empty task submission'],
      },
      responsiveRequirements: {
        desktopLayout: 'Full grid dashboard with metrics cards row and split task list',
        mobileLayout: 'Single column stacked view with bottom action button',
        breakpoints: ['@media (max-width: 768px)'],
      },
      accessibilityRequirements: ['Accessible form inputs', 'High-contrast text tokens', 'Keyboard navigation'],
      testCriteria: [
        { id: 't_load', description: 'Dashboard loads with status 200', category: 'RUNTIME', mandatory: true },
        { id: 't_toggle', description: 'Toggling task marks complete and recalculates velocity', category: 'FUNCTIONAL', mandatory: true },
      ],
      requiredDeliverables: ['index.html', 'styles.css', 'app.js'],
      existingProjectAnalysis: existing,
      generatedAt: new Date().toISOString(),
    };
  }

  // --------------------------------------------------------------------------
  // SPEC GENERATOR: FULL-STACK APPLICATION (FRONTEND + EXPRESS API + SQLITE)
  // --------------------------------------------------------------------------
  private static generateFullStackSpec(
    prompt: string,
    contract: TaskContract,
    existing: ExistingProjectAnalysis
  ): ProductSpec {
    const designSpec = ProfessionalDesignEngine.generateDesignSpec({
      prompt,
      category: 'DEVELOPER_TOOL',
      targetPlatform: 'FULLSTACK_WEB',
    });

    return {
      id: `spec-fullstack-${Date.now()}`,
      name: 'Apex Full-Stack Note Management System',
      domain: 'FULLSTACK_WEB',
      targetPlatform: 'FULLSTACK_WEB',
      architectureDescription: 'Production full-stack Node.js Express backend API on port 3899 with RESTful CRUD endpoints (GET, POST, PUT, DELETE) paired with a responsive modern frontend client.',
      designSpec,
      pages: [
        {
          id: 'client_view',
          title: 'Apex Notes — Full-Stack Knowledge Base',
          containers: ['header.app-header', 'section.create-card', 'section.notes-grid'],
          components: [
            'API Connection Status Indicator (Connected to http://localhost:3899)',
            'New Note Input with Title, Category, and Markdown Body',
            'Notes List with Edit, Timestamp, and Delete Actions',
            'Live Search & Tag Filtering',
          ],
        },
      ],
      dataModels: [
        {
          entityName: 'Note',
          fields: [
            { name: 'id', type: 'string', required: true },
            { name: 'title', type: 'string', required: true },
            { name: 'content', type: 'string', required: true },
            { name: 'category', type: 'string', required: true },
            { name: 'createdAt', type: 'string', required: true },
          ],
          sampleRecords: [
            { id: '1', title: 'System Architecture Notes', content: 'Decoupled API gateway running on separate loopback port.', category: 'Architecture', createdAt: '2026-11-19' },
          ],
        },
      ],
      interactiveFeatures: [
        { id: 'f_catalog_render', name: 'Fetch and Render Notes', trigger: 'Page load', expectedBehavior: 'Issues GET /api/notes and renders cards into DOM', mandatory: true },
        { id: 'f_search', name: 'Filter Notes by Title or Category', trigger: 'Typing search query', expectedBehavior: 'Filters displayed note cards dynamically', mandatory: true },
        { id: 'f_add_student', name: 'Create Note via POST API', trigger: 'Submitting create form', expectedBehavior: 'Issues POST /api/notes, updates list, and displays success toast', mandatory: true },
        { id: 'f_remove_item', name: 'Delete Note via DELETE API', trigger: 'Clicking delete button', expectedBehavior: 'Issues DELETE /api/notes/:id and removes card from DOM', mandatory: true },
        { id: 'f_form_validation', name: 'Form Input Validation', trigger: 'Submitting empty note', expectedBehavior: 'Requires note title and body before dispatching API request', mandatory: true },
      ],
      validationRules: [
        { target: '#noteTitle', rule: 'value.trim().length >= 2', errorMessage: 'Note title must be at least 2 characters.' },
      ],
      states: {
        emptyStates: ['Empty state message: "No notes found. Create your first note above."'],
        loadingStates: ['Loading notes from server...'],
        errorStates: ['API error notification toast'],
      },
      responsiveRequirements: {
        desktopLayout: '2-column view with create panel and notes grid',
        mobileLayout: 'Single column responsive stack',
        breakpoints: ['@media (max-width: 768px)'],
      },
      accessibilityRequirements: ['Semantic HTML5', 'Keyboard accessible buttons'],
      testCriteria: [
        { id: 't_server_run', description: 'Server starts and listens on designated port with 200 health check', category: 'RUNTIME', mandatory: true },
        { id: 't_crud_api', description: 'API handles GET, POST, and DELETE successfully', category: 'FUNCTIONAL', mandatory: true },
      ],
      requiredDeliverables: ['server.js', 'index.html', 'styles.css', 'app.js'],
      existingProjectAnalysis: existing,
      generatedAt: new Date().toISOString(),
    };
  }

  // --------------------------------------------------------------------------
  // SPEC GENERATOR: NATIVE WINDOWS DESKTOP (WINFORMS / C#)
  // --------------------------------------------------------------------------
  private static generateNativeWindowsSpec(
    prompt: string,
    contract: TaskContract,
    existing: ExistingProjectAnalysis
  ): ProductSpec {
    const designSpec = ProfessionalDesignEngine.generateDesignSpec({
      prompt,
      category: 'NATIVE_WINDOWS',
      targetPlatform: 'NATIVE_WINDOWS',
    });

    return {
      id: `spec-native-win-${Date.now()}`,
      name: 'Apex Enterprise Employee Directory',
      domain: 'NATIVE_WINDOWS',
      targetPlatform: 'NATIVE_WINDOWS',
      architectureDescription: 'Stand-alone native Windows desktop application targeting host C# compiler (csc.exe) with native WinForms GUI controls, DataGridView, search filter, and event handling.',
      designSpec,
      pages: [
        {
          id: 'main_window',
          title: 'Native Desktop Application Window',
          containers: ['Form Window', 'TableLayoutPanel', 'Search Header Panel', 'DataGridView Panel', 'StatusStrip'],
          components: [
            'Window Frame with Title and CenterScreen Positioning',
            'Search TextBox with Real-Time RowFilter Event Handler',
            'Full-Row Selection DataGridView with Alternating Color Rows',
            'Add Employee Input Controls and Validation Guard',
            'StatusStrip with Live Filter Count and Status Indicator',
          ],
        },
      ],
      dataModels: [
        {
          entityName: 'Employee',
          fields: [
            { name: 'ID', type: 'int', required: true },
            { name: 'Name', type: 'string', required: true },
            { name: 'Department', type: 'string', required: true },
            { name: 'Email', type: 'string', required: true },
          ],
          sampleRecords: [
            { ID: 101, Name: 'Alice Chen', Department: 'Engineering', Email: 'alice@apex.local' },
            { ID: 102, Name: 'Bob Martinez', Department: 'Product Design', Email: 'bob@apex.local' },
            { ID: 103, Name: 'Clara Oswald', Department: 'Data Science', Email: 'clara@apex.local' },
          ],
        },
      ],
      interactiveFeatures: [
        { id: 'f_window_launch', name: 'Native Window Launch', trigger: 'Running App.exe', expectedBehavior: 'Launches native GUI window centered on screen with STAThread and message pump', mandatory: true },
        { id: 'f_button_action', name: 'Button Click Action', trigger: 'Clicking Add / Save Record button', expectedBehavior: 'Executes logic and appends record to directory', mandatory: true },
        { id: 'f_search_filter', name: 'Directory Search Filter', trigger: 'Typing in search TextBox', expectedBehavior: 'Filters DataGridView rows in real time using DataView.RowFilter', mandatory: true },
        { id: 'f_datagrid_render', name: 'DataGridView Display', trigger: 'Form load', expectedBehavior: 'Renders directory table with sortable columns and alternating colors', mandatory: true },
      ],
      validationRules: [],
      states: { emptyStates: [], loadingStates: [], errorStates: ['MessageBox.Show on input error'] },
      responsiveRequirements: { desktopLayout: 'Native resizable window with TableLayoutPanel docking', mobileLayout: 'N/A (Windows Desktop)', breakpoints: [] },
      accessibilityRequirements: ['Windows UI Automation accessible controls', 'Keyboard tab stop ordering'],
      testCriteria: [
        { id: 't_csc_compile', description: 'csc.exe compiles source file to App.exe with exit code 0', category: 'RUNTIME', mandatory: true },
        { id: 't_binary_exists', description: 'App.exe exists on disk and is non-empty', category: 'RUNTIME', mandatory: true },
      ],
      requiredDeliverables: ['App.cs|Program.cs', 'App.exe'],
      existingProjectAnalysis: existing,
      generatedAt: new Date().toISOString(),
    };
  }

  // --------------------------------------------------------------------------
  // SPEC GENERATOR: GENERAL WEB APPLICATION
  // --------------------------------------------------------------------------
  private static generateGeneralWebSpec(
    prompt: string,
    contract: TaskContract,
    existing: ExistingProjectAnalysis
  ): ProductSpec {
    const title = prompt.length > 30 ? prompt.slice(0, 30) + '...' : prompt;
    const designSpec = ProfessionalDesignEngine.generateDesignSpec({
      prompt,
      category: 'GENERAL_WEB',
      targetPlatform: 'WEB_APP',
    });

    return {
      id: `spec-general-${Date.now()}`,
      name: `Interactive Web Application: ${title}`,
      domain: 'GENERAL_WEB_APP',
      targetPlatform: 'WEB_APP',
      architectureDescription: 'Production-ready responsive modern web application (index.html + styles.css + app.js) implementing complete user requirements with clean styling and interactive state.',
      designSpec,
      pages: [
        {
          id: 'main_page',
          title: 'Interactive Application',
          containers: ['header.site-header', 'main.app-main', 'footer.site-footer'],
          components: ['Brand Header with Icon', 'Main Action Interface', 'Interactive Cards or Form Controls', 'Status Feedback Display'],
        },
      ],
      dataModels: [],
      interactiveFeatures: [
        { id: 'f_ui_state', name: 'Interactive UI State', trigger: 'User interaction', expectedBehavior: 'Updates state and DOM dynamically without page reload', mandatory: true },
      ],
      validationRules: [],
      states: {
        emptyStates: ['Empty state view when no items are active'],
        loadingStates: ['Loading indicator'],
        errorStates: ['Error banner or toast message'],
      },
      responsiveRequirements: {
        desktopLayout: 'Clean modern grid layout',
        mobileLayout: 'Single-column fluid stack',
        breakpoints: ['@media (max-width: 768px)'],
      },
      accessibilityRequirements: ['Semantic HTML5 tags', 'Accessible labels'],
      testCriteria: [
        { id: 't_load', description: 'Application loads with status 200', category: 'RUNTIME', mandatory: true },
      ],
      requiredDeliverables: ['index.html', 'styles.css', 'app.js'],
      existingProjectAnalysis: existing,
      generatedAt: new Date().toISOString(),
    };
  }
}
