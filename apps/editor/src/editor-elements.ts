import type { EditorViewportCanvases } from '@jackharrhy/worldview-editor';

export function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing editor element: ${selector}`);
  return element;
}

export function bindEditorElements() {
  const source = required<HTMLTextAreaElement>('#map-source');
  const sourceMessage = required<HTMLParagraphElement>('#source-message');
  const sourceDialog = required<HTMLDialogElement>('#source-dialog');
  const viewportContextMenu = required<HTMLElement>('#viewport-context-menu');
  const statusMessage = required<HTMLSpanElement>('#status-message');
  const cameraPointerContext = required<HTMLSpanElement>('#pointer-context');
  const editorShell = required<HTMLElement>('.editor-shell');
  const issueBrowser = required<HTMLElement>('#issue-browser');
  const issueSummary = required<HTMLElement>('#issue-summary');
  const issueList = required<HTMLDivElement>('#issue-list');
  const issueStatus = required<HTMLButtonElement>('#issue-status');
  const showHiddenIssues = required<HTMLInputElement>('#show-hidden-issues');
  const viewFilterToggle = required<HTMLButtonElement>('[data-action="toggle-view-filters"]');
  const viewFilterPopover = required<HTMLElement>('#view-filter-popover');
  const viewFilterCount = required<HTMLElement>('#view-filter-count');
  const viewFilterStatus = required<HTMLElement>('#view-filter-status');
  const showWorldBrushes = required<HTMLInputElement>('#show-world-brushes');
  const entityClassFilterSearch = required<HTMLInputElement>('#entity-class-filter-search');
  const entityClassFilterSummary = required<HTMLElement>('#entity-class-filter-summary');
  const entityClassFilterList = required<HTMLDivElement>('#entity-class-filter-list');
  const focusSelectionButton = required<HTMLButtonElement>('[data-action="focus-selection"]');
  const selectAllButton = required<HTMLButtonElement>('[data-action="select-all"]');
  const invertSelectionButton = required<HTMLButtonElement>('[data-action="invert-selection"]');
  const undoButton = required<HTMLButtonElement>('[data-action="undo"]');
  const redoButton = required<HTMLButtonElement>('[data-action="redo"]');
  const repeatCommandsButton = required<HTMLButtonElement>('[data-action="repeat-commands"]');
  const clearRepeatCommandsButton = required<HTMLButtonElement>(
    '[data-action="clear-repeat-commands"]',
  );
  const duplicateButton = required<HTMLButtonElement>('[data-action="duplicate"]');
  const copyButton = required<HTMLButtonElement>('[data-action="copy"]');
  const pasteButton = required<HTMLButtonElement>('[data-action="paste"]');
  const pasteHereButton = required<HTMLButtonElement>('[data-action="paste-here"]');
  const deleteButton = required<HTMLButtonElement>('[data-action="delete"]');
  const hideSelectionButton = required<HTMLButtonElement>('[data-action="hide-selection"]');
  const isolateSelectionButton = required<HTMLButtonElement>('[data-action="isolate-selection"]');
  const showAllButton = required<HTMLButtonElement>('[data-action="show-all"]');
  const lockSelectionButton = required<HTMLButtonElement>('[data-action="lock-selection"]');
  const unlockAllButton = required<HTMLButtonElement>('[data-action="unlock-all"]');
  const entityLinkModeSelect = required<HTMLSelectElement>('#entity-link-mode');
  const entityLinkCount = required<HTMLElement>('#entity-link-count');
  const activeLayerName = required<HTMLElement>('#active-layer-name');
  const layerList = required<HTMLDivElement>('#layer-list');
  const layerNameInput = required<HTMLInputElement>('#layer-name');
  const addLayerButton = required<HTMLButtonElement>('[data-action="add-layer"]');
  const moveSelectionToLayerButton = required<HTMLButtonElement>(
    '[data-action="move-selection-to-layer"]',
  );
  const selectLayerButton = required<HTMLButtonElement>('[data-action="select-layer"]');
  const isolateLayerButton = required<HTMLButtonElement>('[data-action="isolate-layer"]');
  const removeLayerButton = required<HTMLButtonElement>('[data-action="remove-layer"]');
  const layerUpButton = required<HTMLButtonElement>('[data-action="layer-up"]');
  const layerDownButton = required<HTMLButtonElement>('[data-action="layer-down"]');
  const compileButton = required<HTMLButtonElement>('[data-action="compile"]');
  const buildProfile = required<HTMLSelectElement>('#build-profile');
  const togglePreviewButton = required<HTMLButtonElement>('[data-action="toggle-preview"]');
  const toggleLeakButton = required<HTMLButtonElement>('[data-action="toggle-leak"]');
  const togglePortalsButton = required<HTMLButtonElement>('[data-action="toggle-portals"]');
  const buildLogButton = required<HTMLButtonElement>('[data-action="build-log"]');
  const launchButton = required<HTMLButtonElement>('[data-action="launch"]');
  const buildLogDialog = required<HTMLDialogElement>('#build-log-dialog');
  const buildLogOutput = required<HTMLPreElement>('#build-log-output');
  const buildHistory = required<HTMLSelectElement>('#build-history');
  const recoveryDialog = required<HTMLDialogElement>('#recovery-dialog');
  const recoveryList = required<HTMLDivElement>('#recovery-list');
  const compileState = required<HTMLDivElement>('.compile-state');
  const perspectiveMode = required<HTMLElement>('#perspective-mode');
  const compiledCanvas = required<HTMLCanvasElement>('.compiled-canvas');
  const selectionKind = required<HTMLSpanElement>('#selection-kind');
  const selectionEmpty = required<HTMLDivElement>('#selection-empty');
  const selectionInspector = required<HTMLDivElement>('#selection-inspector');
  const groupSection = required<HTMLElement>('#group-section');
  const groupState = required<HTMLElement>('#group-state');
  const groupName = required<HTMLInputElement>('#group-name');
  const createGroupButton = required<HTMLButtonElement>('[data-action="create-group"]');
  const renameGroupButton = required<HTMLButtonElement>('[data-action="rename-group"]');
  const openGroupButton = required<HTMLButtonElement>('[data-action="open-group"]');
  const closeGroupButton = required<HTMLButtonElement>('[data-action="close-group"]');
  const createLinkedDuplicateButton = required<HTMLButtonElement>(
    '[data-action="create-linked-duplicate"]',
  );
  const unlinkGroupButton = required<HTMLButtonElement>('[data-action="unlink-group"]');
  const ungroupButton = required<HTMLButtonElement>('[data-action="ungroup"]');
  const selectionBrushSection = required<HTMLElement>('#selection-brush-section');
  const selectionBrushCount = required<HTMLElement>('#selection-brush-count');
  const pointEntityToolSection = required<HTMLElement>('#point-entity-tool-section');
  const pointEntityPreset = required<HTMLSelectElement>('#point-entity-preset');
  const pointEntityClassname = required<HTMLInputElement>('#point-entity-classname');
  const simpleShapeToolSection = required<HTMLElement>('#simple-shape-tool-section');
  const simpleShapeResult = required<HTMLElement>('#simple-shape-result');
  const simpleShapeKind = required<HTMLSelectElement>('#simple-shape-kind');
  const simpleShapeAxis = required<HTMLSelectElement>('#simple-shape-axis');
  const simpleShapeSides = required<HTMLInputElement>('#simple-shape-sides');
  const simpleShapeCircleMode = required<HTMLSelectElement>('#simple-shape-circle-mode');
  const simpleShapeHollow = required<HTMLInputElement>('#simple-shape-hollow');
  const simpleShapeThickness = required<HTMLInputElement>('#simple-shape-thickness');
  const simpleShapeRings = required<HTMLInputElement>('#simple-shape-rings');
  const simpleShapeAccuracy = required<HTMLInputElement>('#simple-shape-accuracy');
  const simpleShapeStepHeight = required<HTMLInputElement>('#simple-shape-step-height');
  const simpleShapeStairDirection = required<HTMLSelectElement>('#simple-shape-stair-direction');
  const simpleShapeCircleFields = required<HTMLElement>('#simple-shape-circle-fields');
  const simpleShapeHollowFields = required<HTMLElement>('#simple-shape-hollow-fields');
  const simpleShapeUvFields = required<HTMLElement>('#simple-shape-uv-fields');
  const simpleShapeIcoFields = required<HTMLElement>('#simple-shape-ico-fields');
  const simpleShapeStairFields = required<HTMLElement>('#simple-shape-stair-fields');
  const hullToolSection = required<HTMLElement>('#hull-tool-section');
  const hullPointCount = required<HTMLElement>('#hull-point-count');
  const createHullButton = required<HTMLButtonElement>('[data-action="create-hull"]');
  const discardHullButton = required<HTMLButtonElement>('[data-action="discard-hull"]');
  const brushId = required<HTMLElement>('#brush-id');
  const brushRevision = required<HTMLElement>('#brush-revision');
  const brushFaces = required<HTMLElement>('#brush-faces');
  const brushBounds = required<HTMLElement>('#brush-bounds');
  const faceMaterial = required<HTMLElement>('#face-material');
  const faceExtrudeSection = required<HTMLElement>('#face-extrude-section');
  const faceNormal = required<HTMLElement>('#face-normal');
  const faceExtrudeDistance = required<HTMLInputElement>('#face-extrude-distance');
  const sweepToolSection = required<HTMLElement>('#sweep-tool-section');
  const sweepGeneratedCount = required<HTMLElement>('#sweep-generated-count');
  const sweepTranslateInputs = [
    required<HTMLInputElement>('#sweep-translate-x'),
    required<HTMLInputElement>('#sweep-translate-y'),
    required<HTMLInputElement>('#sweep-translate-z'),
  ] as const;
  const sweepRotateInputs = [
    required<HTMLInputElement>('#sweep-rotate-x'),
    required<HTMLInputElement>('#sweep-rotate-y'),
    required<HTMLInputElement>('#sweep-rotate-z'),
  ] as const;
  const sweepScale = required<HTMLInputElement>('#sweep-scale');
  const sweepPath = required<HTMLSelectElement>('#sweep-path');
  const sweepSegments = required<HTMLInputElement>('#sweep-segments');
  const sweepIterations = required<HTMLInputElement>('#sweep-iterations');
  const sweepSnap = required<HTMLInputElement>('#sweep-snap');
  const applySweepButton = required<HTMLButtonElement>('[data-action="apply-sweep"]');
  const clipToolSection = required<HTMLElement>('#clip-tool-section');
  const clipPointCount = required<HTMLElement>('#clip-point-count');
  const clipPointPositions = required<HTMLElement>('#clip-point-positions');
  const applyClipButton = required<HTMLButtonElement>('[data-action="apply-clip"]');
  const transformToolSection = required<HTMLElement>('#transform-tool-section');
  const objectFlipSection = required<HTMLElement>('#object-flip-section');
  const topologyToolSection = required<HTMLElement>('#topology-tool-section');
  const csgSection = required<HTMLElement>('#csg-section');
  const csgSelectionCount = required<HTMLElement>('#csg-selection-count');
  const csgMergeButton = required<HTMLButtonElement>('[data-action="csg-merge"]');
  const csgIntersectButton = required<HTMLButtonElement>('[data-action="csg-intersect"]');
  const topologyToolTitle = required<HTMLElement>('#topology-tool-title');
  const topologySelectionCount = required<HTMLElement>('#topology-selection-count');
  const topologyGridSize = required<HTMLElement>('#topology-grid-size');
  const transformToolTitle = required<HTMLElement>('#transform-tool-title');
  const transformToolHelp = required<HTMLElement>('#transform-tool-help');
  const transformPivotX = required<HTMLInputElement>('#transform-pivot-x');
  const transformPivotY = required<HTMLInputElement>('#transform-pivot-y');
  const transformPivotZ = required<HTMLInputElement>('#transform-pivot-z');
  const rotateAxis = required<HTMLSelectElement>('#rotate-axis');
  const rotateAngle = required<HTMLInputElement>('#rotate-angle');
  const rotateUpdateEntityAngles = required<HTMLInputElement>('#rotate-update-entity-angles');
  const scaleX = required<HTMLInputElement>('#scale-x');
  const scaleY = required<HTMLInputElement>('#scale-y');
  const scaleZ = required<HTMLInputElement>('#scale-z');
  const shearSourceAxis = required<HTMLSelectElement>('#shear-source-axis');
  const shearTargetAxis = required<HTMLSelectElement>('#shear-target-axis');
  const shearOffset = required<HTMLInputElement>('#shear-offset');
  const entityClassname = required<HTMLElement>('#entity-classname');
  const entitySection = required<HTMLElement>('#entity-section');
  const entityProperties = required<HTMLDivElement>('#entity-properties');
  const entityPropertyKey = required<HTMLInputElement>('#entity-property-key');
  const entityPropertyValue = required<HTMLInputElement>('#entity-property-value');
  const entityPropertyProtected = required<HTMLInputElement>('#entity-property-protected');
  const entityPropertyProtectedLabel = required<HTMLElement>('#entity-property-protected-label');
  const brushEntityActions = required<HTMLElement>('#brush-entity-actions');
  const brushEntityClassname = required<HTMLInputElement>('#brush-entity-classname');
  const makeBrushEntityButton = required<HTMLButtonElement>('[data-action="make-brush-entity"]');
  const makeStructuralButton = required<HTMLButtonElement>('[data-action="make-structural"]');
  const textureShiftU = required<HTMLInputElement>('#texture-shift-u');
  const textureShiftV = required<HTMLInputElement>('#texture-shift-v');
  const textureScaleU = required<HTMLInputElement>('#texture-scale-u');
  const textureScaleV = required<HTMLInputElement>('#texture-scale-v');
  const textureRotation = required<HTMLInputElement>('#texture-rotation');
  const textureUAxis = required<HTMLElement>('#texture-u-axis');
  const textureVAxis = required<HTMLElement>('#texture-v-axis');
  const uvEditorSvg = required<SVGSVGElement>('#uv-editor');
  const uvEditorStatus = required<HTMLElement>('#uv-editor-status');
  const uvResetPivot = required<HTMLButtonElement>('#uv-reset-pivot');
  const applyTextureTransformButton = required<HTMLButtonElement>(
    '[data-action="apply-texture-transform"]',
  );
  const documentRevision = required<HTMLElement>('#document-revision');
  const entityCount = required<HTMLElement>('#entity-count');
  const brushCount = required<HTMLElement>('#brush-count');
  const groupCount = required<HTMLElement>('#group-count');
  const hiddenObjectCount = required<HTMLElement>('#hidden-object-count');
  const lockedObjectCount = required<HTMLElement>('#locked-object-count');
  const geometryState = required<HTMLElement>('#geometry-state');
  const materialCount = required<HTMLElement>('#material-count');
  const materialCoverage = required<HTMLParagraphElement>('#material-coverage');
  const materialGrid = required<HTMLDivElement>('#material-grid');
  const materialFilter = required<HTMLInputElement>('#material-filter');
  const materialSort = required<HTMLSelectElement>('#material-sort');
  const materialUsedOnly = required<HTMLInputElement>('#material-used-only');
  const materialName = required<HTMLInputElement>('#material-name');
  const materialMessage = required<HTMLParagraphElement>('#material-message');
  const applyMaterialButton = required<HTMLButtonElement>('[data-action="apply-material"]');
  const selectMaterialFacesButton = required<HTMLButtonElement>(
    '[data-action="select-material-faces"]',
  );
  const selectMaterialBrushesButton = required<HTMLButtonElement>(
    '[data-action="select-material-brushes"]',
  );
  const setMaterialReplaceSourceButton = required<HTMLButtonElement>(
    '[data-action="set-material-replace-source"]',
  );
  const setMaterialReplaceTargetButton = required<HTMLButtonElement>(
    '[data-action="set-material-replace-target"]',
  );
  const materialReplaceSource = required<HTMLInputElement>('#material-replace-source');
  const materialReplaceTarget = required<HTMLInputElement>('#material-replace-target');
  const materialReplaceButton = required<HTMLButtonElement>('[data-action="replace-material"]');
  const materialReplaceScope = required<HTMLParagraphElement>('#material-replace-scope');
  const wadFiles = required<HTMLInputElement>('#wad-files');
  const paletteFile = required<HTMLInputElement>('#palette-file');
  const mapFile = required<HTMLInputElement>('#map-file');
  const projectMap = required<HTMLSelectElement>('#project-map');
  const referenceFiles = required<HTMLInputElement>('#reference-files');
  const referenceCount = required<HTMLElement>('#reference-count');
  const referenceList = required<HTMLDivElement>('#reference-list');
  const clearReferencesButton = required<HTMLButtonElement>('[data-action="clear-references"]');
  const viewportGrid = required<HTMLElement>('.viewport-grid');
  const viewportError = required<HTMLDivElement>('.viewport-error');
  const inspector = required<HTMLElement>('.inspector');
  const inspectorToggle = required<HTMLButtonElement>('[data-action="toggle-inspector"]');
  const gridSizeSelect = required<HTMLSelectElement>('#grid-size');
  const textureLock = required<HTMLInputElement>('#texture-lock');
  const documentName = required<HTMLElement>('#document-name');

  const canvases: EditorViewportCanvases = {
    xy: required<HTMLCanvasElement>('[data-viewport="xy"] .source-canvas'),
    xz: required<HTMLCanvasElement>('[data-viewport="xz"] .source-canvas'),
    yz: required<HTMLCanvasElement>('[data-viewport="yz"] .source-canvas'),
    perspective: required<HTMLCanvasElement>('[data-viewport="perspective"] .source-canvas'),
  };

  return {
    source,
    sourceMessage,
    sourceDialog,
    viewportContextMenu,
    statusMessage,
    cameraPointerContext,
    editorShell,
    issueBrowser,
    issueSummary,
    issueList,
    issueStatus,
    showHiddenIssues,
    viewFilterToggle,
    viewFilterPopover,
    viewFilterCount,
    viewFilterStatus,
    showWorldBrushes,
    entityClassFilterSearch,
    entityClassFilterSummary,
    entityClassFilterList,
    focusSelectionButton,
    selectAllButton,
    invertSelectionButton,
    undoButton,
    redoButton,
    repeatCommandsButton,
    clearRepeatCommandsButton,
    duplicateButton,
    copyButton,
    pasteButton,
    pasteHereButton,
    deleteButton,
    hideSelectionButton,
    isolateSelectionButton,
    showAllButton,
    lockSelectionButton,
    unlockAllButton,
    entityLinkModeSelect,
    entityLinkCount,
    activeLayerName,
    layerList,
    layerNameInput,
    addLayerButton,
    moveSelectionToLayerButton,
    selectLayerButton,
    isolateLayerButton,
    removeLayerButton,
    layerUpButton,
    layerDownButton,
    compileButton,
    buildProfile,
    togglePreviewButton,
    toggleLeakButton,
    togglePortalsButton,
    buildLogButton,
    launchButton,
    buildLogDialog,
    buildLogOutput,
    buildHistory,
    recoveryDialog,
    recoveryList,
    compileState,
    perspectiveMode,
    compiledCanvas,
    selectionKind,
    selectionEmpty,
    selectionInspector,
    groupSection,
    groupState,
    groupName,
    createGroupButton,
    renameGroupButton,
    openGroupButton,
    closeGroupButton,
    createLinkedDuplicateButton,
    unlinkGroupButton,
    ungroupButton,
    selectionBrushSection,
    selectionBrushCount,
    pointEntityToolSection,
    pointEntityPreset,
    pointEntityClassname,
    simpleShapeToolSection,
    simpleShapeResult,
    simpleShapeKind,
    simpleShapeAxis,
    simpleShapeSides,
    simpleShapeCircleMode,
    simpleShapeHollow,
    simpleShapeThickness,
    simpleShapeRings,
    simpleShapeAccuracy,
    simpleShapeStepHeight,
    simpleShapeStairDirection,
    simpleShapeCircleFields,
    simpleShapeHollowFields,
    simpleShapeUvFields,
    simpleShapeIcoFields,
    simpleShapeStairFields,
    hullToolSection,
    hullPointCount,
    createHullButton,
    discardHullButton,
    brushId,
    brushRevision,
    brushFaces,
    brushBounds,
    faceMaterial,
    faceExtrudeSection,
    faceNormal,
    faceExtrudeDistance,
    sweepToolSection,
    sweepGeneratedCount,
    sweepTranslateInputs,
    sweepRotateInputs,
    sweepScale,
    sweepPath,
    sweepSegments,
    sweepIterations,
    sweepSnap,
    applySweepButton,
    clipToolSection,
    clipPointCount,
    clipPointPositions,
    applyClipButton,
    transformToolSection,
    objectFlipSection,
    topologyToolSection,
    csgSection,
    csgSelectionCount,
    csgMergeButton,
    csgIntersectButton,
    topologyToolTitle,
    topologySelectionCount,
    topologyGridSize,
    transformToolTitle,
    transformToolHelp,
    transformPivotX,
    transformPivotY,
    transformPivotZ,
    rotateAxis,
    rotateAngle,
    rotateUpdateEntityAngles,
    scaleX,
    scaleY,
    scaleZ,
    shearSourceAxis,
    shearTargetAxis,
    shearOffset,
    entityClassname,
    entitySection,
    entityProperties,
    entityPropertyKey,
    entityPropertyValue,
    entityPropertyProtected,
    entityPropertyProtectedLabel,
    brushEntityActions,
    brushEntityClassname,
    makeBrushEntityButton,
    makeStructuralButton,
    textureShiftU,
    textureShiftV,
    textureScaleU,
    textureScaleV,
    textureRotation,
    textureUAxis,
    textureVAxis,
    uvEditorSvg,
    uvEditorStatus,
    uvResetPivot,
    applyTextureTransformButton,
    documentRevision,
    entityCount,
    brushCount,
    groupCount,
    hiddenObjectCount,
    lockedObjectCount,
    geometryState,
    materialCount,
    materialCoverage,
    materialGrid,
    materialFilter,
    materialSort,
    materialUsedOnly,
    materialName,
    materialMessage,
    applyMaterialButton,
    selectMaterialFacesButton,
    selectMaterialBrushesButton,
    setMaterialReplaceSourceButton,
    setMaterialReplaceTargetButton,
    materialReplaceSource,
    materialReplaceTarget,
    materialReplaceButton,
    materialReplaceScope,
    wadFiles,
    paletteFile,
    mapFile,
    projectMap,
    referenceFiles,
    referenceCount,
    referenceList,
    clearReferencesButton,
    viewportGrid,
    viewportError,
    inspector,
    inspectorToggle,
    gridSizeSelect,
    textureLock,
    documentName,
    canvases,
  };
}

export type EditorElements = ReturnType<typeof bindEditorElements>;
