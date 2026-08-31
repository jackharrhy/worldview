import {
  deriveEditorGroups,
  linkedGroupSiblings,
  pointEntityDefinition,
  protectedEntityProperties,
  type EditorSelection,
  type MapDocument,
} from '@jackharrhy/worldview-editor';

import type { EditorShellState } from './editor-shell-state.js';

type EntityUi = Pick<EditorShellState, 'entityInspector' | 'pointEntityTool' | 'statusMessage'>;
import type { EditorState } from './editor-state.js';
import type {
  EntityPropertyControlKind,
  EntityPropertySnapshot,
} from './entity-inspector-state.js';

export class EntityPresenter {
  public constructor(
    private readonly state: EditorState,
    private readonly ui: EntityUi,
  ) {
    this.ui.entityInspector.bind({
      setProperty: (key, value, protect) => this.setEntityProperty(key, value, protect),
      setPropertyProtected: (key, protectedValue) =>
        this.setEntityPropertyProtected(key, protectedValue),
    });
    this.ui.pointEntityTool.bind({
      setClassname: (classname) => {
        this.ui.pointEntityTool.update({ classname });
        this.state.renderer?.setEntityPlacementBounds(
          pointEntityDefinition(classname, this.state.entityDefinitions).bounds,
        );
        if (this.state.activeTool === 'entity') {
          this.ui.statusMessage.set(
            classname.trim()
              ? `Entity tool active. Click to place ${classname.trim()}.`
              : 'Enter a point-entity classname before placing it.',
          );
        }
      },
    });
  }

  public dispose(): void {
    this.ui.entityInspector.unbind();
    this.ui.pointEntityTool.unbind();
  }

  public setEntityProperty(key: string, value: string | null, protect = false): void {
    if (!this.state.activeEntityId) {
      this.ui.statusMessage.set('Select a brush or point entity before editing entity properties.');
      return;
    }
    try {
      if (!this.state.session.setEntityProperty(this.state.activeEntityId, key, value, protect)) {
        this.ui.statusMessage.set('Entity property is already up to date.');
      }
    } catch (error) {
      this.ui.statusMessage.set(error instanceof Error ? error.message : String(error));
    }
  }

  private setEntityPropertyProtected(key: string, protectedValue: boolean): void {
    if (!this.state.activeEntityId) return;
    try {
      this.state.session.setEntityPropertyProtected(this.state.activeEntityId, key, protectedValue);
    } catch (error) {
      this.ui.statusMessage.setError(error instanceof Error ? error.message : String(error));
    }
  }

  public renderEntityProperties(
    mapDocument: MapDocument,
    selection: EditorSelection | null,
    visible = true,
  ): void {
    const entity = selection?.entityId
      ? mapDocument.entities.find((candidate) => candidate.id === selection.entityId)
      : selection?.brushId
        ? mapDocument.entities.find((candidate) =>
            candidate.primitives.some((brush) => brush.id === selection.brushId),
          )
        : undefined;
    this.state.activeEntityId = entity?.id ?? null;
    if (!entity) {
      this.ui.entityInspector.set({
        visible: false,
        classname: '',
        canAddProtectedProperty: false,
        properties: [],
      });
      return;
    }

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

    const properties: EntityPropertySnapshot[] = propertyKeys.flatMap((key) => {
      if (key === '_tb_group' || key === '_tb_protected_properties') return [];
      const propertyDefinition = definitionsByKey.get(key);
      const value = entity.properties[key] ?? propertyDefinition?.defaultValue ?? '';
      const control: EntityPropertyControlKind =
        propertyDefinition?.type === 'choices'
          ? 'choices'
          : propertyDefinition?.type === 'boolean'
            ? 'boolean'
            : propertyDefinition?.type === 'flags'
              ? 'flags'
              : propertyDefinition?.type === 'integer' ||
                  propertyDefinition?.type === 'float' ||
                  propertyDefinition?.type === 'angle'
                ? 'number'
                : 'text';
      const choices = propertyDefinition?.choices ?? [];
      const knownChoice = choices.some((choice) => choice.value === value);
      return [
        {
          key,
          label: propertyDefinition?.label ?? key,
          description: propertyDefinition?.description ?? '',
          value,
          placeholder: propertyDefinition?.defaultValue ?? '',
          control,
          ...(propertyDefinition?.type === 'integer'
            ? { step: 1 as const }
            : propertyDefinition?.type === 'float' || propertyDefinition?.type === 'angle'
              ? { step: 'any' as const }
              : {}),
          choices: [
            ...choices,
            ...(!knownChoice && value ? [{ value, label: `Unknown (${value})` }] : []),
          ],
          removable: key !== 'classname' && key in entity.properties,
          protected: protectedProperties.has(key),
          canProtect: canProtectProperties,
        },
      ];
    });

    this.ui.entityInspector.set({
      visible,
      classname: entity.properties.classname ?? '',
      canAddProtectedProperty: canProtectProperties,
      properties,
    });
  }
}
