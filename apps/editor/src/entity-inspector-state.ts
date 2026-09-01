import { SnapshotStore } from '@jackharrhy/worldview/runtime';

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

export class EntityInspectorPort {
  private readonly store = new SnapshotStore<EntityInspectorSnapshot>(EMPTY_ENTITY_INSPECTOR);
  private actions: EntityInspectorActions | null = null;

  public readonly subscribe = this.store.subscribe;
  public readonly getSnapshot = this.store.getSnapshot;

  public bind(actions: EntityInspectorActions): void {
    this.actions = actions;
  }

  public unbind(): void {
    this.actions = null;
    this.store.set(EMPTY_ENTITY_INSPECTOR);
  }

  public set(snapshot: EntityInspectorSnapshot): void {
    this.store.set(snapshot);
  }

  public setProperty(key: string, value: string | null, protect = false): void {
    this.actions?.setProperty(key, value, protect);
  }

  public setPropertyProtected(key: string, protectedValue: boolean): void {
    this.actions?.setPropertyProtected(key, protectedValue);
  }
}
