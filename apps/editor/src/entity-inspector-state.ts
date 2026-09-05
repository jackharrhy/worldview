import { EditorUiPort } from './editor-ui-port.js';

export type EntityPropertyControlKind = 'text' | 'number' | 'boolean' | 'choices' | 'flags';

export interface EntityPropertyChoiceSnapshot {
  readonly value: string;
  readonly label: string;
}

export interface EntityPropertySnapshot {
  readonly key: string;
  readonly label: string;
  readonly description: string;
  readonly value: string;
  readonly placeholder: string;
  readonly control: EntityPropertyControlKind;
  readonly step?: number | 'any';
  readonly choices: readonly EntityPropertyChoiceSnapshot[];
  readonly removable: boolean;
  readonly protected: boolean;
  readonly canProtect: boolean;
}

export interface EntityInspectorSnapshot {
  readonly visible: boolean;
  readonly classname: string;
  readonly canAddProtectedProperty: boolean;
  readonly properties: readonly EntityPropertySnapshot[];
}

export interface EntityInspectorActions {
  setProperty(key: string, value: string | null, protect?: boolean): void;
  setPropertyProtected(key: string, protectedValue: boolean): void;
}

const EMPTY_ENTITY_INSPECTOR: EntityInspectorSnapshot = {
  visible: false,
  classname: '',
  canAddProtectedProperty: false,
  properties: [],
};

export class EntityInspectorPort extends EditorUiPort<
  EntityInspectorSnapshot,
  EntityInspectorActions
> {
  public constructor() {
    super(EMPTY_ENTITY_INSPECTOR);
  }

  public override unbind(): void {
    super.unbind();
    this.store.set(EMPTY_ENTITY_INSPECTOR);
  }

  public setProperty(key: string, value: string | null, protect = false): void {
    this.actions?.setProperty(key, value, protect);
  }

  public setPropertyProtected(key: string, protectedValue: boolean): void {
    this.actions?.setPropertyProtected(key, protectedValue);
  }
}
