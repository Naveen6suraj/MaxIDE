/**
 * MaxIDE APEX — Mission 10: Outcome-Driven Product Specification Engine
 * Converts natural-language software engineering requests into structured,
 * implementation-ready product specifications before code generation.
 */

import fs from 'fs';
import path from 'path';
import { TaskContract } from '../agent/intent/IntentClassifier.js';

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
    if (/\b(attendance|student|tracker|analyzer|grades?|roster)\b/i.test(lower)) {
      return this.generateAttendanceSpec(prompt, contract, existingAnalysis);
    }

    // 3. Native Windows Desktop Application (WinForms / C#)
    if (contract.targetPlatform === 'NATIVE_WINDOWS' || /\b(native\s+windows|desktop\s+app|winforms|wpf|win32|\.exe\b)\b/i.test(lower)) {
      return this.generateNativeWindowsSpec(prompt, contract, existingAnalysis);
    }

    // 4. Default: General Interactive Modern Web Application
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

    if (!fs.existsSync(workspacePath)) {
      return {
        hasExistingCode: false,
        existingFiles,
        implementedFeatures,
        missingFeatures,
        recommendedImprovements,
        preservedFunctionality,
      };
    }

    try {
      const entries = fs.readdirSync(workspacePath);
      for (const e of entries) {
        if (e.startsWith('.') || e === 'node_modules') continue;
        existingFiles.push(e);
      }

      const hasIndexHtml = existingFiles.includes('index.html');
      const hasAppJs = existingFiles.includes('app.js');
      const hasStyles = existingFiles.includes('styles.css') || existingFiles.includes('style.css');

      if (hasIndexHtml) {
        const html = fs.readFileSync(path.join(workspacePath, 'index.html'), 'utf8');
        if (html.includes('header') || html.includes('<h1>')) implementedFeatures.push('Header / Title Structure');
        if (html.includes('menuGrid') || html.includes('menu-list')) implementedFeatures.push('Menu Container');
        if (html.includes('cartToggleBtn') || html.includes('orderSidebar') || html.includes('cart')) implementedFeatures.push('Cart Structure');

        // Check for placeholder stubs
        if (html.length < 300 || html.includes('<!-- Menu items will be dynamically loaded here -->') || html.includes('<h1>Student Attendance Analyzer</h1>\n<div id="app"></div>')) {
          missingFeatures.push('Real DOM elements (found empty placeholder container)');
          recommendedImprovements.push('Generate fully styled interactive UI components instead of empty placeholders');
        }
      }

      if (hasAppJs) {
        const js = fs.readFileSync(path.join(workspacePath, 'app.js'), 'utf8');
        if (js.includes('MENU_DATA') || js.includes('items =')) implementedFeatures.push('Local Dataset Definition');
        if (js.includes('renderMenu') || js.includes('menuGrid')) implementedFeatures.push('Dynamic Menu Rendering');
        if (js.includes('addToCart')) implementedFeatures.push('Cart State Management');
        if (js.includes('addEventListener')) preservedFunctionality.push('Event Handlers');

        if (js.includes('getElementById') && hasIndexHtml) {
          const html = fs.readFileSync(path.join(workspacePath, 'index.html'), 'utf8');
          const idMatches = Array.from(js.matchAll(/document\.getElementById\(['"]([^'"]+)['"]\)/g)).map(m => m[1]);
          for (const id of idMatches) {
            if (!html.includes(`id="${id}"`) && !html.includes(`id='${id}'`)) {
              missingFeatures.push(`DOM Element id="${id}" referenced in app.js but missing in index.html`);
            }
          }
        }
      }

      if (!hasStyles) {
        missingFeatures.push('styles.css styling stylesheet');
        recommendedImprovements.push('Add modern responsive CSS layout with typography, spacing, and CSS custom properties');
      }
    } catch {}

    return {
      hasExistingCode: existingFiles.length > 0,
      existingFiles,
      implementedFeatures,
      missingFeatures,
      recommendedImprovements,
      preservedFunctionality,
    };
  }

  // --------------------------------------------------------------------------
  // SPEC GENERATOR: CAFE & RESTAURANT ORDERING SYSTEM
  // --------------------------------------------------------------------------
  private static generateCafeOrderingSpec(
    prompt: string,
    contract: TaskContract,
    existing: ExistingProjectAnalysis
  ): ProductSpec {
    const sampleRecords = [
      { id: 'c1', category: 'coffee', name: 'Smoked Vanilla Flat White', desc: 'Double shot Ethiopian espresso, velvety oat milk, Madagascar smoked vanilla.', price: 5.75, calories: '160 kcal', tag: 'Bestseller', icon: '☕', isVegetarian: true, isGlutenFree: true },
      { id: 'c2', category: 'coffee', name: 'Nitro Cold Brew & Salted Foam', desc: 'Cold steeped for 20 hours, infused with nitrogen, caramel salted foam.', price: 6.25, calories: '110 kcal', tag: 'Staff Favorite', icon: '🧊', isVegetarian: true, isGlutenFree: true },
      { id: 'c3', category: 'coffee', name: 'Spanish Cortado', desc: 'Equal parts dark espresso, textured milk, organic agave, Ceylon cinnamon.', price: 4.85, calories: '90 kcal', tag: 'Classic', icon: '☕', isVegetarian: true, isGlutenFree: true },
      { id: 'c4', category: 'coffee', name: 'Hazelnut Espresso Tonic', desc: 'Mediterranean tonic, hand-pressed espresso, roasted hazelnut, orange peel.', price: 5.95, calories: '80 kcal', tag: 'Refreshing', icon: '🍸', isVegetarian: true, isGlutenFree: true },
      { id: 't1', category: 'tea', name: 'Ceremonial Iced Matcha Latte', desc: 'Stone-ground Uji green tea, silky almond milk, lavender blossoms, wildflower honey.', price: 6.50, calories: '140 kcal', tag: 'Organic', icon: '🍵', isVegetarian: true, isGlutenFree: true },
      { id: 't2', category: 'tea', name: 'Blood Orange Hibiscus Cooler', desc: 'Steeped Egyptian hibiscus, blood orange juice, sparkling water, fresh mint.', price: 5.25, calories: '65 kcal', tag: 'Zero Caffeine', icon: '🍹', isVegetarian: true, isGlutenFree: true },
      { id: 't3', category: 'tea', name: 'Spiced London Fog', desc: 'Bergamot Earl Grey tea, steamed whole milk, crushed cardamom, pure vanilla.', price: 5.50, calories: '150 kcal', tag: 'Cozy', icon: '🫖', isVegetarian: true, isGlutenFree: true },
      { id: 'b1', category: 'bakery', name: 'Pistachio Cream Brioche Croissant', desc: 'Slow-fermented French pastry, Sicilian pistachio custard, crushed praline.', price: 5.50, calories: '380 kcal', tag: 'Fresh Baked', icon: '🥐', isVegetarian: true, isGlutenFree: false },
      { id: 'b2', category: 'bakery', name: 'Cardamom Cinnamon Knot', desc: 'Swedish braided dough, crushed green cardamom, caramelized brown sugar pearl.', price: 4.75, calories: '320 kcal', tag: 'Morning Special', icon: '🥨', isVegetarian: true, isGlutenFree: false },
      { id: 'b3', category: 'bakery', name: 'Valrhona Dark Chocolate Scone', desc: 'Buttery cream scone, 70% French chocolate chunks, Maldon sea salt flakes.', price: 4.95, calories: '340 kcal', tag: 'Chef Choice', icon: '🍫', isVegetarian: true, isGlutenFree: false },
      { id: 'br1', category: 'brunch', name: 'Heirloom Avocado Tartine', desc: 'Toasted levain sourdough, smashed Haas avocado, pickled radish, dukkah, microgreens.', price: 11.50, calories: '420 kcal', tag: 'Signature', icon: '🥑', isVegetarian: true, isGlutenFree: false },
      { id: 'br2', category: 'brunch', name: 'Truffled Wild Mushroom Toast', desc: 'Sauteed chanterelles and cremini, whipped ricotta, thyme, organic poached egg.', price: 13.25, calories: '460 kcal', tag: 'Gourmet', icon: '🍳', isVegetarian: true, isGlutenFree: false },
      { id: 'br3', category: 'brunch', name: 'Organic Acai Superfood Bowl', desc: 'Blended Amazonian acai, gluten-free granola, blueberries, chia seeds, almond butter.', price: 10.75, calories: '360 kcal', tag: 'Nutritious', icon: '🍓', isVegetarian: true, isGlutenFree: true },
      { id: 'l1', category: 'gourmet', name: 'Smoked Salmon Carpaccio Bagel', desc: 'Wild Norwegian salmon, dill cream cheese, caper berries, shallots, toasted sesame bagel.', price: 14.50, calories: '510 kcal', tag: 'Deluxe', icon: '🥯', isVegetarian: false, isGlutenFree: false },
      { id: 'l2', category: 'gourmet', name: 'Burrata & Roasted Fig Panini', desc: 'Creamy Pugliese burrata, mission figs, baby arugula, aged balsamic glaze on ciabatta.', price: 12.95, calories: '490 kcal', tag: 'Artisan', icon: '🥪', isVegetarian: true, isGlutenFree: false },
      { id: 'l3', category: 'gourmet', name: 'Crispy Halloumi Grain Bowl', desc: 'Seared Cypriot halloumi, warm quinoa, roasted kabocha squash, tahini lemon dressing.', price: 13.50, calories: '480 kcal', tag: 'High Protein', icon: '🥗', isVegetarian: true, isGlutenFree: true },
    ];

    return {
      id: `spec-cafe-${Date.now()}`,
      name: 'Aroma & Oak — Artisanal Cafe & Kitchen Ordering Studio',
      domain: 'CAFE_ORDERING',
      targetPlatform: 'WEB_APP',
      architectureDescription: 'Production-ready responsive multi-file web app (index.html + styles.css + app.js) with dynamic catalog, dietary filtering, interactive cart arithmetic, and receipt generation.',
      pages: [
        {
          id: 'home_menu_view',
          title: 'Cafe Menu & Ordering Desk',
          containers: ['header.site-header', 'section.hero-section', 'main.main-layout', 'aside.order-sidebar', 'div#orderSuccessModal', 'div#toastContainer'],
          components: [
            'Site Branding & Kitchen Status Badge',
            'Search Bar with Live Clear Button',
            'Category Navigation Pills (All, Coffee, Tea, Bakery, Brunch, Lunch)',
            'Dietary Checkboxes (Vegetarian, Gluten-Free)',
            'Product Cards Grid with Image/Icon, Tag, Description, Price, and Add Button',
            'Order Sidebar with Dining Mode Pills (Dine-In, Takeaway, Delivery)',
            'Customer Name and Table/Address Form Fields',
            'Itemized Cart List with Quantity +/- and Remove Controls',
            'Bill Breakdown (Subtotal, 8% Kitchen Tax, Staff Tip Selector: 0%, 10%, 15%, 20%, Total)',
            'Confirm & Place Order Action Button',
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
            { name: 'calories', type: 'string', required: false },
            { name: 'tag', type: 'string', required: false },
            { name: 'icon', type: 'string', required: true },
            { name: 'isVegetarian', type: 'boolean', required: true },
            { name: 'isGlutenFree', type: 'boolean', required: true },
          ],
          sampleRecords,
        },
      ],
      interactiveFeatures: [
        { id: 'f_catalog_render', name: 'Catalog Rendering', trigger: 'Page load', expectedBehavior: 'Renders at least 16 cards into #menuGrid with real prices, descriptions, and add buttons', mandatory: true },
        { id: 'f_search', name: 'Real-Time Search', trigger: 'Typing in #menuSearchInput', expectedBehavior: 'Filters menu cards by name/description in real-time; clear button resets query', mandatory: true },
        { id: 'f_category_filter', name: 'Category Filter Tabs', trigger: 'Clicking .cat-pill', expectedBehavior: 'Displays only items matching selected category; active pill visually highlighted', mandatory: true },
        { id: 'f_dietary_filter', name: 'Dietary Toggle Filter', trigger: 'Checking #vegOnlyFilter or #glutenFreeFilter', expectedBehavior: 'Filters catalog by vegetarian and gluten-free tags', mandatory: true },
        { id: 'f_add_to_cart', name: 'Add to Cart', trigger: 'Clicking .add-btn on product card', expectedBehavior: 'Adds item to cart, increments header badge count, shows item in sidebar, displays toast notification', mandatory: true },
        { id: 'f_qty_adjust', name: 'Quantity Adjustment', trigger: 'Clicking .qty-btn +/- in cart', expectedBehavior: 'Increases or decreases quantity and updates item line total', mandatory: true },
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
        emptyStates: ['Empty cart displays: "Your order is empty. Select delicious items from the menu to get started."', 'Zero search results displays: "No menu items match your search."'],
        loadingStates: ['Initial data load indicator if fetched asynchronously'],
        errorStates: ['Validation alerts on invalid customer name or empty checkout'],
      },
      responsiveRequirements: {
        desktopLayout: '2-column desktop layout with sticky order sidebar on the right and scrollable catalog grid on the left',
        mobileLayout: 'Single-column fluid layout with sticky mobile header, horizontal category scroller, and full-screen order modal / drawer',
        breakpoints: ['@media (max-width: 992px)', '@media (max-width: 640px)'],
      },
      accessibilityRequirements: [
        'Semantic HTML5 structure (header, main, section, aside, nav, button)',
        'ARIA labels on icon-only buttons (#cartToggleBtn, #clearSearchBtn, .qty-btn)',
        'WCAG AA color contrast ratio (minimum 4.5:1 on text and buttons)',
        'Keyboard focusable buttons and inputs',
      ],
      testCriteria: [
        { id: 't_load', description: 'Application loads at /workspace-preview/index.html with status 200', category: 'RUNTIME', mandatory: true },
        { id: 't_menu_render', description: 'Menu grid renders at least 12 distinct cards with price and title', category: 'FUNCTIONAL', mandatory: true },
        { id: 't_search', description: 'Typing "Espresso" filters menu cards to espresso products', category: 'FUNCTIONAL', mandatory: true },
        { id: 't_categories', description: 'Clicking category tab filters items correctly', category: 'FUNCTIONAL', mandatory: true },
        { id: 't_add_cart', description: 'Clicking Add to Cart increments badge and creates cart line item', category: 'FUNCTIONAL', mandatory: true },
        { id: 't_qty_change', description: 'Incrementing item quantity updates line total and subtotal', category: 'FUNCTIONAL', mandatory: true },
        { id: 't_remove_cart', description: 'Removing item updates cart count and totals', category: 'FUNCTIONAL', mandatory: true },
        { id: 't_arithmetic', description: 'Grand Total equals Subtotal + Tax (8%) + Tip', category: 'FUNCTIONAL', mandatory: true },
        { id: 't_checkout_val', description: 'Submitting empty customer name triggers validation alert', category: 'FUNCTIONAL', mandatory: true },
        { id: 't_receipt_modal', description: 'Submitting valid order opens confirmation modal with ticket summary', category: 'FUNCTIONAL', mandatory: true },
        { id: 't_responsive', description: 'Viewport 390x844 renders without horizontal scroll overflow', category: 'RESPONSIVE', mandatory: true },
        { id: 't_clean_console', description: 'Zero unhandled fatal JavaScript errors or page crashes', category: 'RUNTIME', mandatory: true },
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
    const sampleRecords = [
      { id: 's1', name: 'Sophia Chen', studentId: 'STU-101', course: 'Computer Science', totalClasses: 40, present: 38, absent: 2, late: 0, status: 'Good Standing' },
      { id: 's2', name: 'Liam Johnson', studentId: 'STU-102', course: 'Computer Science', totalClasses: 40, present: 31, absent: 7, late: 2, status: 'At Risk' },
      { id: 's3', name: 'Aaliyah Patel', studentId: 'STU-103', course: 'Software Engineering', totalClasses: 40, present: 40, absent: 0, late: 0, status: 'Perfect Attendance' },
      { id: 's4', name: 'Marcus Miller', studentId: 'STU-104', course: 'Software Engineering', totalClasses: 40, present: 28, absent: 10, late: 2, status: 'Critical Warning' },
      { id: 's5', name: 'Elena Rostova', studentId: 'STU-105', course: 'Data Science', totalClasses: 40, present: 36, absent: 3, late: 1, status: 'Good Standing' },
      { id: 's6', name: 'Ethan Garcia', studentId: 'STU-106', course: 'Data Science', totalClasses: 40, present: 39, absent: 1, late: 0, status: 'Good Standing' },
    ];

    return {
      id: `spec-attendance-${Date.now()}`,
      name: 'Student Attendance Analyzer & Academic Health Dashboard',
      domain: 'ATTENDANCE_ANALYZER',
      targetPlatform: 'WEB_APP',
      architectureDescription: 'Interactive single-page dashboard with summary statistics cards, student attendance table, real-time rate calculator, filter by course/status, and new record entry form.',
      pages: [
        {
          id: 'dashboard_view',
          title: 'Student Attendance Analyzer',
          containers: ['header.app-header', 'section.metrics-bar', 'section.table-controls', 'section.data-table-container', 'div#studentModal'],
          components: [
            'Class Aggregate Statistics (Total Enrolled, Average Attendance Rate, Students At Risk, Perfect Attendance Count)',
            'Search by Student Name or ID',
            'Course Filter Dropdown & Status Filter Dropdown',
            'Interactive Attendance Roster Table with Rate Progress Bars and Status Badges',
            'Record Attendance Modal (Mark Present, Absent, Late)',
            'Add New Student Action Button and Form',
          ],
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
            { name: 'totalClasses', type: 'number', required: true },
            { name: 'present', type: 'number', required: true },
            { name: 'absent', type: 'number', required: true },
            { name: 'late', type: 'number', required: true },
          ],
          sampleRecords,
        },
      ],
      interactiveFeatures: [
        { id: 'f_metrics_calc', name: 'Aggregate Metrics Calculation', trigger: 'Data change', expectedBehavior: 'Calculates overall attendance % = sum(present) / sum(totalClasses) * 100', mandatory: true },
        { id: 'f_search_roster', name: 'Search Student Roster', trigger: 'Typing in search input', expectedBehavior: 'Filters table rows in real-time matching student name or ID', mandatory: true },
        { id: 'f_filter_course', name: 'Course Filter', trigger: 'Selecting course dropdown', expectedBehavior: 'Displays only students enrolled in selected course', mandatory: true },
        { id: 'f_mark_attendance', name: 'Mark Daily Attendance', trigger: 'Clicking quick attendance toggles', expectedBehavior: 'Updates present/absent count and recalculates attendance percentage', mandatory: true },
        { id: 'f_add_student', name: 'Add Student Record', trigger: 'Submitting add student form', expectedBehavior: 'Appends new record to roster and saves to localStorage', mandatory: true },
      ],
      validationRules: [
        { target: 'studentName', rule: 'value.trim().length >= 2', errorMessage: 'Student name must be at least 2 characters.' },
        { target: 'studentId', rule: 'value.trim().length >= 3', errorMessage: 'Student ID is required.' },
      ],
      states: {
        emptyStates: ['Empty roster displays: "No student records found. Add students to begin tracking."'],
        loadingStates: ['Roster loading state'],
        errorStates: ['Validation alert on missing student fields'],
      },
      responsiveRequirements: {
        desktopLayout: 'Full dashboard grid with 4 metrics cards and responsive data table',
        mobileLayout: 'Stacked metrics cards and horizontally scrollable or card-based roster view',
        breakpoints: ['@media (max-width: 768px)'],
      },
      accessibilityRequirements: ['Semantic table structure with th/td scope', 'High-contrast status indicators'],
      testCriteria: [
        { id: 't_load', description: 'Loads dashboard without blank screen', category: 'RUNTIME', mandatory: true },
        { id: 't_table_render', description: 'Renders at least 6 student rows with calculated percentages', category: 'FUNCTIONAL', mandatory: true },
        { id: 't_search', description: 'Searching "Chen" filters to Sophia Chen', category: 'FUNCTIONAL', mandatory: true },
        { id: 't_calc', description: 'Attendance percentage calculates correctly (e.g. 38/40 = 95%)', category: 'FUNCTIONAL', mandatory: true },
        { id: 't_clean_console', description: 'Zero console runtime errors', category: 'RUNTIME', mandatory: true },
      ],
      requiredDeliverables: ['index.html', 'styles.css', 'app.js'],
      existingProjectAnalysis: existing,
      generatedAt: new Date().toISOString(),
    };
  }

  // --------------------------------------------------------------------------
  // SPEC GENERATOR: NATIVE WINDOWS APPLICATION
  // --------------------------------------------------------------------------
  private static generateNativeWindowsSpec(
    prompt: string,
    contract: TaskContract,
    existing: ExistingProjectAnalysis
  ): ProductSpec {
    return {
      id: `spec-native-win-${Date.now()}`,
      name: 'Native Windows Desktop Application',
      domain: 'NATIVE_WINDOWS',
      targetPlatform: 'NATIVE_WINDOWS',
      architectureDescription: 'Stand-alone native Windows desktop application targeting .NET Framework C# compiler (csc.exe) or .NET 8 Desktop SDK with native window GUI controls and event handling.',
      pages: [
        {
          id: 'main_window',
          title: 'Native Desktop Application Window',
          containers: ['Form Window', 'Menu Bar / Toolstrip', 'Status Bar', 'Client Panel'],
          components: ['Window Frame with Title and Icon', 'Buttons with Click Handlers', 'TextBox Input Fields', 'DataGrid / ListView', 'Status Strip with Live Indicator'],
        },
      ],
      dataModels: [],
      interactiveFeatures: [
        { id: 'f_window_launch', name: 'Native Window Launch', trigger: 'Running App.exe', expectedBehavior: 'Launches native GUI window centered on screen with STAThread', mandatory: true },
        { id: 'f_button_action', name: 'Button Click Action', trigger: 'Clicking primary button', expectedBehavior: 'Executes logic and updates GUI text or status bar', mandatory: true },
      ],
      validationRules: [],
      states: { emptyStates: [], loadingStates: [], errorStates: ['Message box on error'] },
      responsiveRequirements: { desktopLayout: 'Native resizable window with MinSize and Docking', mobileLayout: 'N/A (Windows Desktop)', breakpoints: [] },
      accessibilityRequirements: ['Windows UI Automation accessible controls', 'Keyboard tab stop ordering'],
      testCriteria: [
        { id: 't_csc_compile', description: 'csc.exe compiles source file to App.exe with exit code 0', category: 'RUNTIME', mandatory: true },
        { id: 't_binary_exists', description: 'App.exe exists on disk and is non-empty', category: 'RUNTIME', mandatory: true },
      ],
      requiredDeliverables: ['Program.cs', 'App.exe'],
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
    return {
      id: `spec-general-${Date.now()}`,
      name: `Interactive Web Application: ${title}`,
      domain: 'GENERAL_WEB_APP',
      targetPlatform: 'WEB_APP',
      architectureDescription: 'Production-ready responsive modern web application (index.html + styles.css + app.js) implementing complete user requirements with clean styling and interactive state.',
      pages: [
        {
          id: 'main_page',
          title: title,
          containers: ['header.app-header', 'main.app-main', 'footer.app-footer'],
          components: ['Application Header with Navigation', 'Main Interactive Content Panel', 'Controls, Forms, and Action Buttons', 'Results Display and State Indicators'],
        },
      ],
      dataModels: [],
      interactiveFeatures: [
        { id: 'f_interactive_ui', name: 'Interactive UI State', trigger: 'User clicks and inputs', expectedBehavior: 'Updates application state and DOM dynamically without page reloads', mandatory: true },
      ],
      validationRules: [],
      states: {
        emptyStates: ['Displays user-friendly empty state when no data exists'],
        loadingStates: ['Visual feedback on user actions'],
        errorStates: ['Friendly inline error notifications'],
      },
      responsiveRequirements: {
        desktopLayout: 'Max-width 1200px centered responsive layout',
        mobileLayout: 'Single-column responsive flow with touch-friendly controls',
        breakpoints: ['@media (max-width: 768px)'],
      },
      accessibilityRequirements: ['Semantic HTML5 elements', 'Accessible color contrast (WCAG AA)'],
      testCriteria: [
        { id: 't_load', description: 'Loads at /workspace-preview/index.html with status 200', category: 'RUNTIME', mandatory: true },
        { id: 't_no_stub', description: 'Renders complete functional UI without placeholder text', category: 'VISUAL', mandatory: true },
        { id: 't_clean_console', description: 'Zero fatal console errors', category: 'RUNTIME', mandatory: true },
      ],
      requiredDeliverables: ['index.html', 'styles.css', 'app.js'],
      existingProjectAnalysis: existing,
      generatedAt: new Date().toISOString(),
    };
  }
}
