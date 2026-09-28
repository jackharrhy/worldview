const GAME_TREE_ASSET_PATH =
  /^(?:textures|env)\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*\.(?:png|tga|wal_json)$/;

export function isGameTreeAssetPath(value: string): boolean {
  return value.length <= 256 && GAME_TREE_ASSET_PATH.test(value);
}

export function gameTreeAssetPath(value: string): string {
  if (!isGameTreeAssetPath(value)) {
    throw new Error('Game assets must be contained PNG, TGA, or WAL metadata paths');
  }
  return value;
}
