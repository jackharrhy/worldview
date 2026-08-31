import { describe, expect, it, vi } from 'vitest';

import { createEditorShellState } from '../src/editor-shell-state.js';

describe('editor shell state ports', () => {
  it('publishes status messages and resets an error tone on the next message', () => {
    const shell = createEditorShellState();
    const listener = vi.fn();
    const unsubscribe = shell.statusMessage.subscribe(listener);

    shell.statusMessage.setError('Storage failed');
    expect(shell.statusMessage.getSnapshot()).toEqual({
      message: 'Storage failed',
      tone: 'error',
    });

    shell.statusMessage.set('Saved map');
    expect(shell.statusMessage.getSnapshot()).toEqual({
      message: 'Saved map',
      tone: 'normal',
    });
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    shell.statusMessage.set('No longer observed');
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('keeps document, compiler, pointer, and map-summary snapshots independent', () => {
    const shell = createEditorShellState();

    shell.documentName.set('• dm1.map', 'dm1.map');
    shell.compileState.set('COMPILER READY', 'ready');
    shell.pointerContext.set('PERSPECTIVE / fly');
    shell.documentSummary.set({
      revision: 7,
      entityCount: 4,
      brushCount: 12,
      groupCount: 2,
      hiddenObjectCount: 3,
      lockedObjectCount: 1,
      geometryErrorCount: 0,
    });

    expect(shell.documentName.getSnapshot()).toEqual({
      label: '• dm1.map',
      title: 'dm1.map',
    });
    expect(shell.compileState.getSnapshot()).toEqual({
      label: 'COMPILER READY',
      state: 'ready',
    });
    expect(shell.pointerContext.getSnapshot()).toBe('PERSPECTIVE / fly');
    expect(shell.documentSummary.getSnapshot()).toEqual({
      revision: 7,
      entityCount: 4,
      brushCount: 12,
      groupCount: 2,
      hiddenObjectCount: 3,
      lockedObjectCount: 1,
      geometryErrorCount: 0,
    });
  });

  it('publishes immutable context-menu descriptions and invokes only its narrow command port', () => {
    const shell = createEditorShellState();
    const dismiss = vi.fn();
    const invoke = vi.fn();
    shell.viewportContextMenu.bind({ dismiss, invoke });
    const sections = [
      {
        id: 'selection',
        label: 'Selection',
        actions: [
          { id: 'selection:focus', label: 'Focus selection', shortcut: 'Home' },
          { id: 'selection:hide', label: 'Hide selection', disabled: true },
        ],
      },
    ] as const;

    shell.viewportContextMenu.show({
      x: 280,
      y: 120,
      heading: '3D view',
      detail: '0 64 128',
      sections,
    });

    expect(shell.viewportContextMenu.getSnapshot()).toEqual({
      open: true,
      x: 280,
      y: 120,
      heading: '3D view',
      detail: '0 64 128',
      sections,
    });
    shell.viewportContextMenu.invoke('selection:focus');
    shell.viewportContextMenu.dismiss(true);
    expect(invoke).toHaveBeenCalledWith('selection:focus');
    expect(dismiss).toHaveBeenCalledWith(true);

    shell.viewportContextMenu.hide();
    expect(shell.viewportContextMenu.getSnapshot()).toMatchObject({
      open: false,
      sections: [],
    });
  });

  it('routes Perspective-only layout changes through the renderer port', () => {
    const shell = createEditorShellState();
    const setPerspectiveOnly = vi.fn((enabled: boolean) => {
      shell.viewportLayout.setPerspectiveOnly(enabled);
    });

    expect(shell.viewportLayout.getSnapshot()).toEqual({
      perspectiveOnly: false,
      rendererReady: false,
    });
    shell.viewportLayout.togglePerspectiveOnly();
    expect(setPerspectiveOnly).not.toHaveBeenCalled();

    shell.viewportLayout.bind({ setPerspectiveOnly });
    expect(shell.viewportLayout.getSnapshot().rendererReady).toBe(true);
    shell.viewportLayout.togglePerspectiveOnly();
    expect(setPerspectiveOnly).toHaveBeenCalledWith(true);
    expect(shell.viewportLayout.getSnapshot().perspectiveOnly).toBe(true);
  });

  it('publishes React-owned inspector and theme selections through narrow ports', () => {
    const shell = createEditorShellState();
    const setPreference = vi.fn((preference: 'system' | 'dark' | 'light') => {
      shell.theme.setPreference(preference);
    });

    shell.inspectorLayout.setActive('textures');
    expect(shell.inspectorLayout.getSnapshot().active).toBe('textures');

    shell.theme.bind({ setPreference }, 'system');
    shell.theme.select('light');
    expect(setPreference).toHaveBeenCalledWith('light');
    expect(shell.theme.getSnapshot()).toBe('light');
  });

  it('routes dynamic editor surfaces through typed command ports', () => {
    const shell = createEditorShellState();
    const setProperty = vi.fn();
    const createLayer = vi.fn();
    const setFiltersOpen = vi.fn();
    const inspectBuild = vi.fn();
    const openMap = vi.fn();

    shell.entityInspector.bind({ setProperty, setPropertyProtected: vi.fn() });
    shell.layerPanel.bind({
      select: vi.fn(),
      makeActive: vi.fn(),
      rename: vi.fn(),
      setFlag: vi.fn(),
      create: createLayer,
      moveSelection: vi.fn(),
      selectContents: vi.fn(),
      isolate: vi.fn(),
      remove: vi.fn(),
      reorder: vi.fn(),
      setAllFlags: vi.fn(),
    });
    shell.viewFilter.bind({
      setOpen: setFiltersOpen,
      setWorldBrushesVisible: vi.fn(),
      setSpecialBrushTypeVisible: vi.fn(),
      setEntityClassVisible: vi.fn(),
      setAllEntityClassesVisible: vi.fn(),
    });
    shell.buildLog.bind({ inspect: inspectBuild });
    shell.projectToolbar.bind({ openMap, selectBuildProfile: vi.fn() });

    shell.entityInspector.setProperty('message', 'Hello');
    shell.layerPanel.invoke('create', 'Gameplay');
    shell.viewFilter.invoke('setOpen', true);
    shell.buildLog.inspect('build-7');
    shell.projectToolbar.openMap('maps/start.map');

    expect(setProperty).toHaveBeenCalledWith('message', 'Hello', false);
    expect(createLayer).toHaveBeenCalledWith('Gameplay');
    expect(setFiltersOpen).toHaveBeenCalledWith(true);
    expect(inspectBuild).toHaveBeenCalledWith('build-7');
    expect(openMap).toHaveBeenCalledWith('maps/start.map');
  });

  it('routes project and tool controls without using DOM event relays', () => {
    const shell = createEditorShellState();
    const invokeProject = vi.fn();
    const applySource = vi.fn();
    const createCheckpoint = vi.fn();
    const updateShape = vi.fn();
    const setSweepTransform = vi.fn();
    const dispatchObjectTool = vi.fn();
    const invokeEditorCommand = vi.fn();

    shell.projectUi.bind({ invoke: invokeProject, applySource, createCheckpoint });
    shell.simpleShapeTool.bind({ updateOptions: updateShape });
    shell.sweepTool.bind({
      setTransform: setSweepTransform,
      setOptions: vi.fn(),
      reset: vi.fn(),
      apply: vi.fn(),
    });
    shell.objectTools.bind({ dispatch: dispatchObjectTool });
    shell.editorCommands.bind({ invoke: invokeEditorCommand, selectTool: vi.fn() });
    shell.editorCommands.updateActions({
      delete: { disabled: true },
      undo: { disabled: false },
    });

    shell.projectUi.invoke('show-source');
    shell.projectUi.applySource('// map source');
    shell.projectUi.createCheckpoint('Before CSG');
    shell.simpleShapeTool.updateOptions({ kind: 'cylinder', sides: 12 });
    shell.sweepTool.setTransform({
      translation: [0, 0, 64],
      rotationDegrees: [0, 90, 0],
      scale: 1,
    });
    shell.objectTools.dispatch({ type: 'csg', operation: 'merge' });
    shell.editorCommands.invoke('delete');
    shell.editorCommands.invoke('undo');

    expect(invokeProject).toHaveBeenCalledWith('show-source');
    expect(applySource).toHaveBeenCalledWith('// map source');
    expect(createCheckpoint).toHaveBeenCalledWith('Before CSG');
    expect(updateShape).toHaveBeenCalledWith({ kind: 'cylinder', sides: 12 });
    expect(setSweepTransform).toHaveBeenCalledWith({
      translation: [0, 0, 64],
      rotationDegrees: [0, 90, 0],
      scale: 1,
    });
    expect(dispatchObjectTool).toHaveBeenCalledWith({ type: 'csg', operation: 'merge' });
    expect(invokeEditorCommand).toHaveBeenCalledTimes(1);
    expect(invokeEditorCommand).toHaveBeenCalledWith('undo');
  });

  it('publishes viewport and inspector presentation as immutable React snapshots', () => {
    const shell = createEditorShellState();
    const initialViewport = shell.viewportPresentation.getSnapshot();

    shell.viewportPresentation.update({
      showingCompiled: true,
      perspectiveMode: 'FLY',
      perspectiveTitle: 'Free-look camera',
      error: null,
    });
    shell.workspaceLayout.update({
      viewportColumn: 0.62,
      viewportTop: 0.4,
      inspectorWidth: 384,
      dragging: 'viewport-cross',
    });
    shell.inspectorLayout.setOpen(false);

    expect(initialViewport).toEqual({
      showingCompiled: false,
      perspectiveMode: 'EDIT',
      perspectiveTitle: '',
      error: null,
    });
    expect(shell.viewportPresentation.getSnapshot()).toEqual({
      showingCompiled: true,
      perspectiveMode: 'FLY',
      perspectiveTitle: 'Free-look camera',
      error: null,
    });
    expect(shell.inspectorLayout.getSnapshot()).toEqual({ active: 'object', open: false });
    expect(shell.workspaceLayout.getSnapshot()).toEqual({
      viewportColumn: 0.62,
      viewportTop: 0.4,
      inspectorWidth: 384,
      dragging: 'viewport-cross',
    });
  });

  it('detaches application-owned actions when their lifetime ends', () => {
    const shell = createEditorShellState();
    const setPerspectiveOnly = vi.fn();
    const setPreference = vi.fn();
    const dismiss = vi.fn();
    const invoke = vi.fn();
    const setFlag = vi.fn();
    const setValue = vi.fn();
    const setProjectionField = vi.fn();
    const copyMaterialName = vi.fn();
    const open = vi.fn();

    shell.viewportLayout.bind({ setPerspectiveOnly });
    shell.theme.bind({ setPreference }, 'dark');
    shell.viewportContextMenu.bind({ dismiss, invoke });
    shell.surfaceInspector.bind({ setFlag, setValue });
    shell.faceInspector.bind({
      setProjectionField,
      align: vi.fn(),
      resetUvPivot: vi.fn(),
      frameUvSelection: vi.fn(),
      setUvGrid: vi.fn(),
    });
    shell.materialBrowser.bind({
      setFilter: vi.fn(),
      setSort: vi.fn(),
      setUsedOnly: vi.fn(),
      setSource: vi.fn(),
      setActiveMaterial: vi.fn(),
      activateMaterial: vi.fn(),
      sampleSelection: vi.fn(),
      applyActiveMaterial: vi.fn(),
      selectFaces: vi.fn(),
      selectBrushes: vi.fn(),
      copyMaterialName,
      setReplaceSource: vi.fn(),
      setReplaceTarget: vi.fn(),
      replace: vi.fn(),
    });
    shell.collaborationUi.bind({
      open,
      close: vi.fn(),
      setDisplayName: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      copyLink: vi.fn(),
    });
    shell.viewportContextMenu.show({
      x: 1,
      y: 2,
      heading: 'View',
      detail: '0 0 0',
      sections: [],
    });

    shell.viewportLayout.unbind();
    shell.theme.unbind();
    shell.viewportContextMenu.unbind();
    shell.surfaceInspector.unbind();
    shell.faceInspector.unbind();
    shell.materialBrowser.unbind();
    shell.collaborationUi.unbind();
    shell.viewportLayout.togglePerspectiveOnly();
    shell.theme.select('light');
    shell.viewportContextMenu.dismiss();
    shell.viewportContextMenu.invoke('selection:focus');
    shell.surfaceInspector.invoke('setValue', 7);
    shell.faceInspector.invoke('setProjectionField', 'offset-u', 32);
    shell.materialBrowser.invoke('copyMaterialName');
    shell.collaborationUi.invoke('open');

    expect(shell.viewportLayout.getSnapshot()).toEqual({
      perspectiveOnly: false,
      rendererReady: false,
    });
    expect(shell.viewportContextMenu.getSnapshot().open).toBe(false);
    for (const action of [
      setPerspectiveOnly,
      setPreference,
      dismiss,
      invoke,
      setFlag,
      setValue,
      setProjectionField,
      copyMaterialName,
      open,
    ]) {
      expect(action).not.toHaveBeenCalled();
    }
  });
});
