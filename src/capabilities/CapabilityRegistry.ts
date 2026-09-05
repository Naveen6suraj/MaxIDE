/**
 * MaxIDE - Universal Capability Registry
 * Implements Section 3 & Section 23 of Master Architecture:
 * Generic, extensible capability registry decoupled from specific task names.
 * Manages all 16 fundamental capability categories.
 */

export type CapabilityCategory =
  | 'SOFTWARE_ENGINEERING'
  | 'FILESYSTEM'
  | 'TERMINAL'
  | 'BROWSER'
  | 'DOCUMENTS'
  | 'IMAGE_GENERATION'
  | 'AUDIO_GENERATION'
  | 'VIDEO_GENERATION'
  | 'DATA_PROCESSING'
  | 'ARCHIVE_PROCESSING'
  | 'SEARCH'
  | 'GIT'
  | 'PROJECT_MANAGEMENT'
  | 'TASK_MANAGEMENT'
  | 'MULTI_AGENT'
  | 'ARTIFACT_MANAGEMENT';

export type CapabilityAvailability =
  | 'available'       // Ready to execute immediately (local/built-in)
  | 'configured'      // Provider configured with active credentials
  | 'not_configured'   // Capability recognized, but provider credentials/engine missing
  | 'offline';        // Configured provider is currently unreachable

export interface CapabilityDefinition {
  id: string;
  name: string;
  category: CapabilityCategory;
  description: string;
  inputSchema?: Record<string, any>;
  outputSchema?: Record<string, any>;
  providerRequirements?: string[];
  permissions: 'SAFE' | 'APPROVAL_REQUIRED' | 'ELEVATED';
  supportedPlatforms: string[];
  availability: CapabilityAvailability;
  verificationMethod: string;
  isBuiltIn?: boolean;
}

export interface CapabilityStatusReport {
  category: CapabilityCategory;
  name: string;
  status: CapabilityAvailability;
  providerName?: string;
  details?: string;
}

export class CapabilityRegistry {
  private capabilities: Map<string, CapabilityDefinition> = new Map();
  private categoryIndex: Map<CapabilityCategory, Set<string>> = new Map();

  constructor() {
    this.registerInitialCapabilities();
  }

  /**
   * Dynamically register a capability
   */
  public registerCapability(cap: CapabilityDefinition): void {
    this.capabilities.set(cap.id, cap);
    if (!this.categoryIndex.has(cap.category)) {
      this.categoryIndex.set(cap.category, new Set());
    }
    this.categoryIndex.get(cap.category)!.add(cap.id);
  }

  /**
   * Get capability by ID
   */
  public getCapability(id: string): CapabilityDefinition | undefined {
    return this.capabilities.get(id);
  }

  /**
   * List all registered capabilities
   */
  public listCapabilities(filter?: { category?: CapabilityCategory; availability?: CapabilityAvailability }): CapabilityDefinition[] {
    let list = Array.from(this.capabilities.values());
    if (filter?.category) {
      list = list.filter(c => c.category === filter.category);
    }
    if (filter?.availability) {
      list = list.filter(c => c.availability === filter.availability);
    }
    return list;
  }

  /**
   * Get all capabilities in a category
   */
  public getByCategory(category: CapabilityCategory): CapabilityDefinition[] {
    const ids = this.categoryIndex.get(category);
    if (!ids) return [];
    return Array.from(ids).map(id => this.capabilities.get(id)!).filter(Boolean);
  }

  /**
   * Check if a capability category is available
   */
  public isCategoryAvailable(category: CapabilityCategory): boolean {
    const caps = this.getByCategory(category);
    return caps.some(c => c.availability === 'available' || c.availability === 'configured');
  }

  /**
   * Update availability status dynamically based on runtime provider checks
   */
  public updateAvailability(id: string, availability: CapabilityAvailability): void {
    const cap = this.capabilities.get(id);
    if (cap) {
      cap.availability = availability;
    }
  }

  /**
   * Get comprehensive capability status report for UI and settings
   */
  public getStatusReport(): CapabilityStatusReport[] {
    const categories: CapabilityCategory[] = [
      'SOFTWARE_ENGINEERING',
      'FILESYSTEM',
      'TERMINAL',
      'BROWSER',
      'DOCUMENTS',
      'IMAGE_GENERATION',
      'AUDIO_GENERATION',
      'VIDEO_GENERATION',
      'DATA_PROCESSING',
      'ARCHIVE_PROCESSING',
      'SEARCH',
      'GIT',
      'PROJECT_MANAGEMENT',
      'TASK_MANAGEMENT',
      'MULTI_AGENT',
      'ARTIFACT_MANAGEMENT',
    ];

    return categories.map(cat => {
      const caps = this.getByCategory(cat);
      const isAvail = caps.some(c => c.availability === 'available');
      const isConfig = caps.some(c => c.availability === 'configured');
      const isOffline = caps.some(c => c.availability === 'offline');

      let status: CapabilityAvailability = 'not_configured';
      if (isAvail) status = 'available';
      else if (isConfig) status = 'configured';
      else if (isOffline) status = 'offline';

      const capNames = caps.map(c => c.name).join(', ');

      return {
        category: cat,
        name: this.getCategoryDisplayName(cat),
        status,
        details: capNames || 'No modules registered',
      };
    });
  }

  private getCategoryDisplayName(cat: CapabilityCategory): string {
    const names: Record<CapabilityCategory, string> = {
      SOFTWARE_ENGINEERING: 'Software Engineering & Code Synthesis',
      FILESYSTEM: 'Filesystem & Organization',
      TERMINAL: 'Safe Terminal Execution',
      BROWSER: 'Browser Automation & Live Verification',
      DOCUMENTS: 'Vector PDF, DOCX & Presentations',
      IMAGE_GENERATION: 'Photorealistic AI Image Generation',
      AUDIO_GENERATION: 'Audio & Music Synthesis',
      VIDEO_GENERATION: '60fps Cinematic Video Recording',
      DATA_PROCESSING: 'Data Analysis & Chart Visualizations',
      ARCHIVE_PROCESSING: 'ZIP & Archive Extraction',
      SEARCH: 'Autonomous Web Research',
      GIT: 'Git Version Control',
      PROJECT_MANAGEMENT: 'Project Lifecycle & Isolation',
      TASK_MANAGEMENT: 'Background Tasks & Queue',
      MULTI_AGENT: 'Multi-Agent Delegation',
      ARTIFACT_MANAGEMENT: 'Universal Artifact Store',
    };
    return names[cat] || cat;
  }

  /**
   * Seed baseline capabilities for all 16 initial categories
   */
  private registerInitialCapabilities(): void {
    // 1. SOFTWARE_ENGINEERING
    this.registerCapability({
      id: 'software_engineering.scaffold',
      name: 'Project Scaffolding & Web App Generation',
      category: 'SOFTWARE_ENGINEERING',
      description: 'Scaffolds full-stack web applications, React dashboards, games, and UI components',
      permissions: 'APPROVAL_REQUIRED',
      supportedPlatforms: ['win32', 'darwin', 'linux'],
      availability: 'available',
      verificationMethod: 'Playwright headless browser verification & DOM check',
      isBuiltIn: true,
    });
    this.registerCapability({
      id: 'software_engineering.code_edit',
      name: 'Multi-File Code Editing & Refactoring',
      category: 'SOFTWARE_ENGINEERING',
      description: 'Edits, patches, and refactors source files across languages',
      permissions: 'APPROVAL_REQUIRED',
      supportedPlatforms: ['win32', 'darwin', 'linux'],
      availability: 'available',
      verificationMethod: 'Syntax validation & file integrity check',
      isBuiltIn: true,
    });

    // 2. FILESYSTEM
    this.registerCapability({
      id: 'filesystem.operations',
      name: 'Safe Filesystem Management',
      category: 'FILESYSTEM',
      description: 'Create folders, move, rename, organize, and inspect files with boundary protection',
      permissions: 'APPROVAL_REQUIRED',
      supportedPlatforms: ['win32', 'darwin', 'linux'],
      availability: 'available',
      verificationMethod: 'Disk existence & resolveSafePath check',
      isBuiltIn: true,
    });

    // 3. TERMINAL
    this.registerCapability({
      id: 'terminal.safe_execution',
      name: 'Safe Command Execution',
      category: 'TERMINAL',
      description: 'Validates, scopes, and executes command-line processes with permission tiers',
      permissions: 'APPROVAL_REQUIRED',
      supportedPlatforms: ['win32', 'darwin', 'linux'],
      availability: 'available',
      verificationMethod: 'Process exit code, stdout, and execution duration',
      isBuiltIn: true,
    });

    // 4. BROWSER
    this.registerCapability({
      id: 'browser.automation',
      name: 'Headless Browser Automation',
      category: 'BROWSER',
      description: 'Launches user applications, inspects DOM elements, captures screenshots, and detects console errors',
      permissions: 'SAFE',
      supportedPlatforms: ['win32', 'darwin', 'linux'],
      availability: 'available',
      verificationMethod: 'Playwright navigation & error telemetry',
      isBuiltIn: true,
    });

    // 5. DOCUMENTS
    this.registerCapability({
      id: 'documents.vector_pdf',
      name: 'Vector PDF & Office Document Engine',
      category: 'DOCUMENTS',
      description: 'Compiles multi-page vector PDFs, OpenXML DOCX documents, and 16:9 PowerPoint decks',
      permissions: 'SAFE',
      supportedPlatforms: ['win32', 'darwin', 'linux'],
      availability: 'available',
      verificationMethod: '%PDF- and PK\\x03\\x04 binary magic header verification',
      isBuiltIn: true,
    });

    // 6. IMAGE_GENERATION
    this.registerCapability({
      id: 'image_generation.ai_bitmap',
      name: 'AI Image Synthesis',
      category: 'IMAGE_GENERATION',
      description: 'Generates photorealistic images via Pollinations Flux AI, OpenAI DALL-E 3, or Playwright procedural engine',
      permissions: 'SAFE',
      supportedPlatforms: ['win32', 'darwin', 'linux'],
      availability: 'available',
      verificationMethod: '\\x89PNG or \\xFF\\xD8\\xFF magic header and minimum size check',
      isBuiltIn: true,
    });

    // 7. AUDIO_GENERATION
    this.registerCapability({
      id: 'audio_generation.music_synth',
      name: 'Audio & Music Generation Engine',
      category: 'AUDIO_GENERATION',
      description: 'Synthesizes authentic 44.1kHz 16-bit stereo PCM audio waveforms (WAV/MP3) and routes to external speech/music providers',
      permissions: 'SAFE',
      supportedPlatforms: ['win32', 'darwin', 'linux'],
      availability: 'available',
      verificationMethod: 'RIFF....WAVE header, audio duration, and non-silent waveform check',
      isBuiltIn: true,
    });

    // 8. VIDEO_GENERATION
    this.registerCapability({
      id: 'video_generation.60fps_recorder',
      name: '60fps Hardware-Accelerated Video Synthesis',
      category: 'VIDEO_GENERATION',
      description: 'Records cinematic animations into valid WebM and companion MP4 video containers with timecode and physics simulation',
      permissions: 'SAFE',
      supportedPlatforms: ['win32', 'darwin', 'linux'],
      availability: 'available',
      verificationMethod: 'EBML / ftyp header and duration threshold check',
      isBuiltIn: true,
    });

    // 9. DATA_PROCESSING
    this.registerCapability({
      id: 'data_processing.analytics',
      name: 'Data Profiling & Chart Generation',
      category: 'DATA_PROCESSING',
      description: 'Parses CSV datasets, computes statistical summaries, and renders high-resolution PNG charts',
      permissions: 'SAFE',
      supportedPlatforms: ['win32', 'darwin', 'linux'],
      availability: 'available',
      verificationMethod: 'CSV row parsing & chart PNG bitmap verification',
      isBuiltIn: true,
    });

    // 10. ARCHIVE_PROCESSING
    this.registerCapability({
      id: 'archive_processing.zip',
      name: 'ZIP Archive Inspection & Extraction',
      category: 'ARCHIVE_PROCESSING',
      description: 'Safely inspects, extracts, and packages ZIP files with directory traversal safeguards',
      permissions: 'APPROVAL_REQUIRED',
      supportedPlatforms: ['win32', 'darwin', 'linux'],
      availability: 'available',
      verificationMethod: 'PK\\x03\\x04 archive header validation',
      isBuiltIn: true,
    });

    // 11. SEARCH
    this.registerCapability({
      id: 'search.web_research',
      name: 'Autonomous Web Research & Fact-Checking',
      category: 'SEARCH',
      description: 'Performs multi-source live web queries, citation extraction, and structured research synthesis',
      permissions: 'SAFE',
      supportedPlatforms: ['win32', 'darwin', 'linux'],
      availability: 'available',
      verificationMethod: 'Verified URL citations and response integrity',
      isBuiltIn: true,
    });

    // 12. GIT
    this.registerCapability({
      id: 'git.version_control',
      name: 'Git Workflow Automation',
      category: 'GIT',
      description: 'Safe execution of git status, diff, commit, and push workflows with branch verification',
      permissions: 'APPROVAL_REQUIRED',
      supportedPlatforms: ['win32', 'darwin', 'linux'],
      availability: 'available',
      verificationMethod: 'Git status cleanly tracked without working tree corruption',
      isBuiltIn: true,
    });

    // 13. PROJECT_MANAGEMENT
    this.registerCapability({
      id: 'project_management.lifecycle',
      name: 'Multi-Project Lifecycle & Storage Isolation',
      category: 'PROJECT_MANAGEMENT',
      description: 'Maintains project boundaries, active workspace directories, and metadata storage',
      permissions: 'SAFE',
      supportedPlatforms: ['win32', 'darwin', 'linux'],
      availability: 'available',
      verificationMethod: 'Project metadata storage validation',
      isBuiltIn: true,
    });

    // 14. TASK_MANAGEMENT
    this.registerCapability({
      id: 'task_management.queue',
      name: 'Background Task Queue & Lifecycle Control',
      category: 'TASK_MANAGEMENT',
      description: 'Controls execution states: ACTIVE, PAUSED, WAITING, COMPLETED, FAILED, CANCELLED',
      permissions: 'SAFE',
      supportedPlatforms: ['win32', 'darwin', 'linux'],
      availability: 'available',
      verificationMethod: 'Task state transitions and persistence verification',
      isBuiltIn: true,
    });

    // 15. MULTI_AGENT
    this.registerCapability({
      id: 'multi_agent.orchestration',
      name: 'Specialized Multi-Agent Coordination',
      category: 'MULTI_AGENT',
      description: 'Coordinates Planner, Coding, Research, Browser, Testing, Design, Media, Document, and Reviewer agents',
      permissions: 'SAFE',
      supportedPlatforms: ['win32', 'darwin', 'linux'],
      availability: 'available',
      verificationMethod: 'Coordinated execution with shared permissions and artifacts',
      isBuiltIn: true,
    });

    // 16. ARTIFACT_MANAGEMENT
    this.registerCapability({
      id: 'artifact_management.store',
      name: 'Universal Typed Artifact Store',
      category: 'ARTIFACT_MANAGEMENT',
      description: 'Registers, indexes, verifies, and serves real binary artifacts across all creation domains',
      permissions: 'SAFE',
      supportedPlatforms: ['win32', 'darwin', 'linux'],
      availability: 'available',
      verificationMethod: 'Disk persistence and VerificationEngine pass',
      isBuiltIn: true,
    });
  }
}
