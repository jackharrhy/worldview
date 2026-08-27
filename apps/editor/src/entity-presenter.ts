import {
  deriveEditorGroups,
  linkedGroupSiblings,
  protectedEntityProperties,
  type EntityPropertyDefinition,
  type EditorSelection,
  type MapDocument,
} from '@jackharrhy/worldview-editor';

import type { EditorElements } from './editor-elements.js';
import type { EditorState } from './editor-state.js';

export class EntityPresenter {
  public constructor(
    private readonly state: EditorState,
    private readonly ui: EditorElements,
  ) {}

  public setEntityProperty(key: string, value: string | null, protect = false): void {
    if (!this.state.activeEntityId) {
      this.ui.statusMessage.textContent =
        'Select a brush or point entity before editing entity properties.';
      return;
    }
    try {
      if (!this.state.session.setEntityProperty(this.state.activeEntityId, key, value, protect)) {
        this.ui.statusMessage.textContent = 'Entity property is already up to date.';
      }
    } catch (error) {
      this.ui.statusMessage.textContent = error instanceof Error ? error.message : String(error);
    }
  }

  public typedEntityPropertyControl(
    key: string,
    value: string,
    definition?: EntityPropertyDefinition,
  ): HTMLElement {
    if (definition?.type === 'choices' && definition.choices) {
      const select = document.createElement('select');
      for (const choice of definition.choices) {
        const option = document.createElement('option');
        option.value = choice.value;
        option.textContent = choice.label;
        select.append(option);
      }
      if (![...select.options].some((option) => option.value === value) && value) {
        select.append(new Option(`Unknown (${value})`, value));
      }
      select.value = value;
      select.setAttribute('aria-label', `${definition.label} value`);
      select.addEventListener('change', () => this.setEntityProperty(key, select.value));
      return select;
    }
    if (definition?.type === 'boolean') {
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = value !== '0' && value.toLowerCase() !== 'false' && value !== '';
      input.setAttribute('aria-label', `${definition.label} value`);
      input.addEventListener('change', () =>
        this.setEntityProperty(key, input.checked ? '1' : '0'),
      );
      return input;
    }
    if (definition?.type === 'flags' && definition.choices) {
      const flags = document.createElement('div');
      flags.className = 'entity-flags';
      const selected = Number(value) || 0;
      for (const choice of definition.choices) {
        const bit = Number(choice.value);
        if (!Number.isInteger(bit) || bit <= 0) continue;
        const label = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = (selected & bit) === bit;
        input.addEventListener('change', () => {
          const next = [...flags.querySelectorAll<HTMLInputElement>('input[data-flag]')].reduce(
            (sum, checkbox) => sum | (checkbox.checked ? Number(checkbox.dataset.flag) : 0),
            0,
          );
          this.setEntityProperty(key, String(next));
        });
        input.dataset.flag = String(bit);
        label.append(input, choice.label);
        flags.append(label);
      }
      return flags;
    }
    const input = document.createElement('input');
    input.type =
      definition?.type === 'integer' || definition?.type === 'float' || definition?.type === 'angle'
        ? 'number'
        : 'text';
    if (definition?.type === 'integer') input.step = '1';
    if (definition?.type === 'float' || definition?.type === 'angle') input.step = 'any';
    input.value = value;
    input.placeholder = definition?.defaultValue ?? '';
    input.setAttribute('aria-label', `${definition?.label ?? key} value`);
    input.addEventListener('change', () => this.setEntityProperty(key, input.value));
    return input;
  }

  public renderEntityProperties(mapDocument: MapDocument, selection: EditorSelection | null): void {
    const entity = selection?.entityId
      ? mapDocument.entities.find((candidate) => candidate.id === selection.entityId)
      : selection?.brushId
        ? mapDocument.entities.find((candidate) =>
            candidate.brushes.some((brush) => brush.id === selection.brushId),
          )
        : undefined;
    this.state.activeEntityId = entity?.id ?? null;
    this.ui.entityClassname.textContent = entity?.properties.classname ?? '';
    this.ui.entityProperties.replaceChildren();
    this.ui.entityPropertyProtectedLabel.hidden = true;
    this.ui.entityPropertyProtected.checked = false;
    if (!entity) return;

    const groups = deriveEditorGroups(mapDocument);
    const groupsById = new Map(groups.map((group) => [group.id, group]));
    const openGroup = groups.find((group) => group.id === this.state.openGroupId);
    let containingGroup =
      groups.find((group) => group.id === entity.properties['_tb_group']) ?? null;
    let insideOpenGroup = containingGroup?.id === openGroup?.id;
    while (!insideOpenGroup && containingGroup?.parentGroupId) {
      containingGroup = groupsById.get(containingGroup.parentGroupId) ?? null;
      insideOpenGroup = containingGroup?.id === openGroup?.id;
    }
    const canProtectProperties = Boolean(
      openGroup?.linkedGroupId &&
      linkedGroupSiblings(mapDocument, openGroup.id).length > 1 &&
      insideOpenGroup,
    );
    this.ui.entityPropertyProtectedLabel.hidden = !canProtectProperties;
    const protectedProperties = new Set(protectedEntityProperties(entity));
    const definition = this.state.entityDefinitions.find(entity.properties.classname ?? '');
    const definitionsByKey = new Map(
      definition?.properties.map((property) => [property.key, property]),
    );
    const propertyKeys = [
      ...Object.keys(entity.properties),
      ...(definition?.properties.map(({ key }) => key) ?? []).filter(
        (key) => !(key in entity.properties),
      ),
    ];

    for (const key of propertyKeys) {
      if (key === '_tb_group' || key === '_tb_protected_properties') continue;
      const propertyDefinition = definitionsByKey.get(key);
      const value = entity.properties[key] ?? propertyDefinition?.defaultValue ?? '';
      const row = window.document.createElement('div');
      row.className = 'entity-property-row';
      const keyLabel = document.createElement('span');
      keyLabel.textContent = propertyDefinition?.label ?? key;
      keyLabel.title = propertyDefinition?.description
        ? `${key}: ${propertyDefinition.description}`
        : key;
      const input = this.typedEntityPropertyControl(key, value, propertyDefinition);
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = 'Remove';
      remove.disabled = key === 'classname' || !(key in entity.properties);
      remove.title = remove.disabled ? 'Every map entity needs a classname' : `Remove ${key}`;
      remove.addEventListener('click', () => this.setEntityProperty(key, null));
      if (canProtectProperties) {
        const protection = document.createElement('input');
        protection.type = 'checkbox';
        protection.checked = protectedProperties.has(key);
        protection.className = 'entity-property-protection';
        protection.setAttribute('aria-label', `Protect ${key}`);
        protection.title = 'Keep this value independent in this linked copy';
        protection.addEventListener('change', () => {
          try {
            this.state.session.setEntityPropertyProtected(entity.id, key, protection.checked);
          } catch (error) {
            this.ui.statusMessage.textContent =
              error instanceof Error ? error.message : String(error);
          }
        });
        row.append(keyLabel, input, protection, remove);
      } else row.append(keyLabel, input, remove);
      this.ui.entityProperties.append(row);
    }
  }
}
