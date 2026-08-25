import { createSequentialIdFactory } from '@jackharrhy/worldview-editor';

import type { EditorApplication } from './editor-application.js';
import { required } from './editor-elements.js';

export class OrganizationEvents {
  public constructor(private readonly app: EditorApplication) {}
  private get state() {
    return this.app.state;
  }
  private get ui() {
    return this.app.ui;
  }

  public connect(): void {
    this.ui.addLayerButton.addEventListener('click', () => {
      try {
        const name = this.ui.layerNameInput.value.trim();
        const layerId = this.state.session.createLayer(
          name,
          createSequentialIdFactory(`layer-${this.state.session.document.revision + 1}`),
        );
        this.state.selectedLayerId = layerId;
        this.state.layerPanelSignature = '';
        this.app.inspector.updateInspector();
        this.ui.layerNameInput.select();
        this.ui.statusMessage.textContent = `Created and activated ${name}.`;
      } catch (error) {
        this.ui.statusMessage.textContent = error instanceof Error ? error.message : String(error);
      }
    });
    this.ui.layerNameInput.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      this.ui.addLayerButton.click();
    });
    this.ui.moveSelectionToLayerButton.addEventListener('click', () => {
      try {
        const layer = this.app.organization.selectedLayerForPanel();
        if (!layer || !this.state.session.moveSelectedToLayer(layer.id)) {
          this.ui.statusMessage.textContent =
            'Select top-level objects in a different layer first.';
          return;
        }
        this.ui.statusMessage.textContent = `Moved the selection to ${layer.name}.`;
      } catch (error) {
        this.ui.statusMessage.textContent = error instanceof Error ? error.message : String(error);
      }
    });
    this.ui.selectLayerButton.addEventListener('click', () => {
      const layer = this.app.organization.selectedLayerForPanel();
      if (!layer) return;
      if (!this.state.session.selectAllInLayer(layer.id)) {
        this.ui.statusMessage.textContent = `${layer.name} has no selectable contents.`;
        return;
      }
      this.ui.statusMessage.textContent = `Selected all contents of ${layer.name}.`;
    });
    this.ui.isolateLayerButton.addEventListener('click', () => {
      const layer = this.app.organization.selectedLayerForPanel();
      if (!layer || !this.state.session.isolateLayer(layer.id)) {
        this.ui.statusMessage.textContent = layer
          ? `${layer.name} is already isolated.`
          : 'Select a layer.';
        return;
      }
      this.ui.statusMessage.textContent = `Isolated ${layer.name}.`;
    });
    this.ui.removeLayerButton.addEventListener('click', () => {
      const layer = this.app.organization.selectedLayerForPanel();
      if (!layer?.id || !this.state.session.removeLayer(layer.id)) return;
      this.state.selectedLayerId = null;
      this.state.layerPanelSignature = '';
      this.app.inspector.updateInspector();
      this.ui.statusMessage.textContent = `Removed ${layer.name}; its contents moved to Default Layer. Undo restores it.`;
    });
    this.ui.layerUpButton.addEventListener('click', () => {
      const layer = this.app.organization.selectedLayerForPanel();
      if (layer?.id) this.state.session.reorderLayer(layer.id, -1);
    });
    this.ui.layerDownButton.addEventListener('click', () => {
      const layer = this.app.organization.selectedLayerForPanel();
      if (layer?.id) this.state.session.reorderLayer(layer.id, 1);
    });
    required<HTMLButtonElement>('[data-action="show-all-layers"]').addEventListener('click', () => {
      if (!this.state.session.setAllLayersFlag('hidden', false)) {
        this.ui.statusMessage.textContent = 'All layers are already shown.';
      }
    });
    required<HTMLButtonElement>('[data-action="hide-all-layers"]').addEventListener('click', () => {
      this.state.session.setAllLayersFlag('hidden', true);
    });
    required<HTMLButtonElement>('[data-action="unlock-all-layers"]').addEventListener(
      'click',
      () => {
        if (!this.state.session.setAllLayersFlag('locked', false)) {
          this.ui.statusMessage.textContent = 'All layers are already unlocked.';
        }
      },
    );
    required<HTMLButtonElement>('[data-action="lock-all-layers"]').addEventListener('click', () => {
      this.state.session.setAllLayersFlag('locked', true);
    });
  }
}
