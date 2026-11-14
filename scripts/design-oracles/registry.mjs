/**
 * Independent theorem-appearance-v1 policy registry.
 *
 * This file intentionally contains policy values from the reviewed design
 * oracle specification, not values imported from production appearance code.
 */
export const POLICY = Object.freeze({ id: 'theorem-appearance-v1', version: '1.0.0' })

const spec = (id, className, purpose, fixture, requiredEvidence, provenance = POLICY.id) =>
  Object.freeze({ id, version: '1.0', class: className, purpose, fixture, requiredEvidence, provenance })

export const ORACLES = Object.freeze([
  spec('ENV-01', 'Contract', 'Reproducible settled measurements', 'all', ['revision', 'browser', 'viewport', 'deviceScaleFactor', 'scales', 'density', 'palette', 'materials', 'locale', 'direction', 'motion', 'twoFrameSamples']),
  spec('ENV-02', 'Contract', 'Font resource and actual-face evidence', 'F02,F04,F05', ['resourceRequests', 'fontFaceEntries', 'weightStyleCoverage', 'actualFaceEvidence', 'fontAssetHashes']),
  spec('ENV-03', 'Contract', 'Independent rendered evidence', 'all', ['policySource', 'measuredComponents', 'resolvedPaints']),
  spec('TYP-01', 'Contract', 'Complete recipes applied to real elements', 'F02,F04,F05,F08', ['computedSize', 'weight', 'lineHeight', 'tracking', 'fontFamily', 'actualFaceEvidence']),
  spec('TYP-02', 'Contract', 'Prose/editor typography equivalence', 'F05', ['proseRecipe', 'editorRecipe']),
  spec('TYP-03', 'Contract', 'Independent scales and density invariance', 'F09', ['rootSize', 'contentScale', 'uiScale', 'codeScale', 'densityPair', 'proseRecipePair', 'editorRecipePair']),
  spec('TYP-04', 'Target', 'Calibrated rendered reading measure', 'F02', ['corpusHash', 'fontAssetHashes', 'eligibleFullLineGraphemes', 'median', 'p90', 'preferredMeasureEm']),
  spec('TYP-05', 'Contract', 'Readable collapsed previews', 'F03', ['previewTextContrast', 'maskAndOpacity', 'expansionControl', 'fullContentAfterExpansion']),
  spec('TYP-06', 'Target', 'Paragraph and section rhythm', 'F02', ['paragraphBlockGaps', 'sectionBlockGaps', 'headingNeighborGaps']),
  spec('TYP-07', 'Standard', 'Text enlargement and spacing resilience', 'F09', ['textEnlargement200', 'spacingOverride', 'contentPreserved', 'controlsReachable']),
  spec('COL-01', 'Standard+Contract+Target', 'Every required text pair after resolved paint', 'F01-F11', ['pairManifestCoverage', 'resolvedForeground', 'resolvedBackground', 'contrastRatio']),
  spec('COL-02', 'Standard', 'Essential non-text identification contrast', 'F01,F05,F08', ['identifyingFeaturePairs', 'state', 'adjacentPaint', 'contrastRatio']),
  spec('COL-03', 'Contract', 'Correct paint resolution and bounded backgrounds', 'F03,F05,F08', ['renderedPaintStack', 'compositingPath', 'backdropEnvelopeOrOpaquePlane']),
  spec('COL-04', 'Contract', 'Valid emitted and resolved colors', 'palette-matrix', ['allEmittedColors', 'mappingPolicy', 'finalOutputContrast']),
  spec('COL-05', 'Target', 'Calm perceptual surface hierarchy', 'F01,F03,F05,F08', ['surfaceRoles', 'mode', 'oklchLightness', 'oklchChroma']),
  spec('COL-06', 'Diagnostic', 'Perceptual distance and surface visual weight', 'F03', ['visibleAreaFraction', 'lightnessDelta', 'chroma', 'deltaEOK']),
  spec('COL-07', 'Standard+Contract', 'Focus visibility and non-color meaning', 'F05,F08,F10', ['keyboardFocus', 'focusArea', 'focusedUnfocusedContrast', 'meaningfulNonColorCue']),
  spec('SPC-01', 'Contract+Target', 'Authored spacing token use and hierarchy', 'F01,F05,F08', ['authoredPaddingAndGaps', 'selectedDensityTokens', 'effectiveGroups']),
  spec('SPC-02', 'Contract+Standard', 'Content containment and target geometry', 'F05,F08,F09,F10', ['contentBox', 'padding', 'borders', 'hitRegion', 'clipping', 'overlap']),
  spec('SPC-03', 'Contract', 'Reading/editor track alignment', 'F05', ['logicalInlineStart', 'proseWidth', 'editorWidth', 'avatarBudget']),
  spec('SPC-04', 'Contract', 'Width conservation and responsive allocation', 'F08', ['usableWidth', 'rail', 'navigation', 'inspector', 'gaps', 'main', 'paddingBudget', 'prose', 'centeringResidual']),
  spec('SPC-05', 'Contract+Target', 'Composer height derived from its parts', 'F01,F05,F09', ['borders', 'padding', 'editorLineBox', 'toolbar', 'editorToolbarGap', 'localScroll', 'reachableActions']),
  spec('SPC-06', 'Contract+Target', 'Declared radius geometry', 'F01,F05,F08', ['computedRadii', 'roleRecipes', 'normalization']),
  spec('SPC-07', 'Standard+Contract', 'Reflow, obstruction, and visual viewport reachability', 'F09,F10', ['320pxReflow', 'horizontalOverflow', 'keyboardVisualViewport', 'focusedRegionAndActions']),
  spec('ARC-01', 'Contract', 'Palette and mode isolation', 'F11', ['beforeAfterConfig', 'geometry', 'typography', 'hitRegions', 'content', 'capabilities', 'draft', 'runIdentity']),
  spec('ARC-02', 'Contract', 'Material isolation', 'F11', ['beforeAfterConfig', 'composerGeometry', 'composerState', 'navigationMaterial', 'hitRegions']),
  spec('ARC-03', 'Contract', 'Density and ambience isolation', 'F11', ['beforeAfterConfig', 'approvedLayoutChanges', 'textRecipes', 'runtimeState', 'nonAmbientLayout']),
  spec('ARC-04', 'Contract', 'State, focus, IME, and logical-anchor continuity', 'F11', ['draft', 'attachmentIdentity', 'selectionOffsets', 'runIdentity', 'ime', 'commandDispatch', 'focus', 'scrollAnchor']),
  spec('ARC-05', 'Contract', 'Portaled appearance scope', 'F05,F08', ['openPortal', 'appearanceScope', 'recipes', 'density', 'requiredPairs']),
  spec('ARC-06', 'Contract', 'Serializable presets and behavior reuse boundaries', 'F05,F11', ['presetSchema', 'migration', 'unknownFieldHandling', 'compositionReuse']),
])

export const FIXTURES = Object.freeze([
  { id: 'F01', name: 'Empty conversation and one-line composer', requirements: ['baseline actions', 'resting composer geometry', 'surface roles'] },
  { id: 'F02', name: 'Long multi-paragraph answer', requirements: ['headings', 'metadata', '20+ eligible full lines', 'vertical rhythm'] },
  { id: 'F03', name: 'User message preview', requirements: ['short response', 'short user message', 'long collapsed message', 'expanded content'] },
  { id: 'F04', name: 'Code and expanded content', requirements: ['code', 'table', 'inline code', 'link', 'long URL', 'expanded artifact'] },
  { id: 'F05', name: 'Draft with controls and portal', requirements: ['multiline editor', 'references', 'attachments', 'open settings popover', 'composer tracks'] },
  { id: 'F06', name: 'Active stream', requirements: ['active run', 'follow-up action', 'stop action', 'command semantics'] },
  { id: 'F07', name: 'Submission error and recovery', requirements: ['failure state', 'recovery', 'upload status', 'validation/help text'] },
  { id: 'F08', name: 'Navigation states', requirements: ['selected', 'running', 'unread', 'long translated labels'] },
  { id: 'F09', name: 'Scale and narrow reflow', requirements: ['content scale', '200% enlargement', 'spacing overrides', 'narrow layout'] },
  { id: 'F10', name: 'RTL and script fallback', requirements: ['RTL', 'CJK fallback', 'keyboard navigation', 'touch keyboard'] },
  { id: 'F11', name: 'Mid-draft appearance change', requirements: ['draft', 'selection', 'IME', 'logical scroll anchor'] },
])

export const EXECUTION_MATRIX = Object.freeze({
  color: { scope: 'every built-in palette/mode', evidence: ['valid sRGB outputs', 'registered color pairs'] },
  full: { presets: ['Calm light', 'Calm dark'], viewports: [
    { width: 1024, height: 768 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 },
    { width: 320, height: 720 }, { width: 390, height: 844 },
  ], browsers: ['Chromium', 'Firefox', 'WebKit where supported'], variants: ['default', 'text 200%', 'page zoom/reflow 400%', 'spacing override', 'RTL', 'script fallback'] },
})

export const CHILD_ORACLES = Object.freeze([
  { id: 'COL-01.minimum', parent: 'COL-01', class: 'Standard', predicate: 'every applicable readable text pair has contrast >= 4.5:1' },
  { id: 'COL-01.product-minimum', parent: 'COL-01', class: 'Contract', predicate: 'Theorem v1 readable application text role pairs remain >= 4.5:1, including larger headings, metadata and placeholders' },
  { id: 'COL-01.prose-target', parent: 'COL-01', fixture: 'F02', class: 'Target', predicate: 'primary conversation prose has contrast >= 7:1' },
  { id: 'COL-01.large-text-exception', parent: 'COL-01', class: 'Standard', predicate: 'recorded only where the applicable standard exception is used; Theorem v1 still targets 4.5:1' },
  { id: 'COL-02.identifying-controls', parent: 'COL-02', class: 'Standard', predicate: 'essential non-text identifying features have contrast >= 3:1 against relevant adjacent paint' },
  { id: 'COL-02.decorative-separators', parent: 'COL-02', class: 'Standard', predicate: 'decorative separators are exempt unless they identify a required boundary' },
  { id: 'COL-03.opaque-plane', parent: 'COL-03', class: 'Contract', predicate: 'opaque paired reading plane resolves to measured final sRGB paints' },
  { id: 'COL-03.background-envelope', parent: 'COL-03', class: 'Contract', predicate: 'complete material output is bounded; sampled frames alone are insufficient' },
  { id: 'COL-05.required-flat', parent: 'COL-05', class: 'Contract', predicate: 'Calm reading, composer, navigation and user-message surfaces are flat and opaque' },
  { id: 'COL-05.lightness-hierarchy', parent: 'COL-05', class: 'Target', predicate: 'mode-specific signed OKLCH surface edges meet theorem-appearance-v1 ranges' },
  { id: 'SPC-01.token-consumption', parent: 'SPC-01', class: 'Contract', predicate: 'authored role spacing matches selected token within 0.25 CSS px' },
  { id: 'SPC-01.group-hierarchy', parent: 'SPC-01', class: 'Target', predicate: 'where declared, within gap < related gap < group gap' },
  { id: 'SPC-02.content-fit', parent: 'SPC-02', class: 'Contract', predicate: 'control border box contains line box, padding and borders without clipping' },
  { id: 'SPC-02.target-size', parent: 'SPC-02', class: 'Standard', predicate: 'measure actual clickable area; apply WCAG 2.5.8 exceptions explicitly' },
  { id: 'SPC-07.reflow', parent: 'SPC-07', class: 'Standard', predicate: 'at 320 CSS px ordinary content preserves use without two-dimensional page scrolling, subject to exceptions' },
  { id: 'SPC-07.composer-interaction', parent: 'SPC-07', class: 'Contract', predicate: 'focused editor and essential actions remain reachable with the touch keyboard' },
  { id: 'COL-07.focus-standard', parent: 'COL-07', class: 'Standard', predicate: 'keyboard focus is visible and not entirely hidden by author-created content' },
  { id: 'COL-07.focus-appearance', parent: 'COL-07', class: 'Contract', predicate: 'focus indicator has at least 3:1 focused/unfocused contrast and at least a 2 CSS px outer perimeter area' },
  { id: 'COL-07.non-color-meaning', parent: 'COL-07', class: 'Standard', predicate: 'errors and meaningful statuses have a text, shape or icon cue in addition to hue' },
  { id: 'ARC-04.document-state', parent: 'ARC-04', class: 'Contract', predicate: 'appearance changes preserve draft, attachments, run and logical editor selection' },
  { id: 'ARC-04.focus-and-anchor', parent: 'ARC-04', class: 'Contract', predicate: 'focus and logical conversation anchor remain or move to documented counterpart' },
  { id: 'ARC-04.native-composition', parent: 'ARC-04', class: 'Contract', predicate: 'trusted native IME composition remains intact across an appearance change' },
  { id: 'ARC-01.palette-mode-isolation', parent: 'ARC-01', class: 'Contract', predicate: 'real settings palette and mode changes preserve measured geometry, typography and mounted draft/editor' },
  { id: 'ARC-02.material-isolation', parent: 'ARC-02', class: 'Contract', predicate: 'real composer material changes preserve geometry/state and independent navigation material' },
  { id: 'ARC-03.density-isolation', parent: 'ARC-03', class: 'Contract', predicate: 'density changes preserve complete content/editor recipes and runtime state' },
  { id: 'ARC-03.ambient-isolation', parent: 'ARC-03', class: 'Contract', predicate: 'ambient visibility/motion changes leave non-ambient geometry, text and controls invariant' },
  { id: 'ARC-06.versioned-data', parent: 'ARC-06', class: 'Contract', predicate: 'versioned appearance state round-trips through settings, reload and explicit reset' },
  { id: 'ARC-06.migration', parent: 'ARC-06', class: 'Contract', predicate: 'legacy preferences migrate to the current appearance schema in the real renderer' },
  { id: 'ARC-06.schema-rejection', parent: 'ARC-06', class: 'Contract', predicate: 'unsupported persisted/custom fields are explicitly rejected' },
  { id: 'ARC-06.second-consumer', parent: 'ARC-06', class: 'Contract', predicate: 'second composition reuses semantic contract and behavioral parts without duplicate submission state' },
])

export const PREDICATE_TOLERANCES = Object.freeze({
  fontPx: 0.1, lineHeightPx: 0.1, letterSpacingPx: 0.05,
  authoredSpacingPx: 0.25, layoutPx: 1, appearanceEdgePx: 0.5,
  colorChannel: 1e-6, contrastBelowThreshold: 0,
})
