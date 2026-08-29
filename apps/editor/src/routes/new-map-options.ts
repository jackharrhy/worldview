import { WORLDVIEW_GAME_PROFILES } from '@jackharrhy/worldview-editor/core';

export const NEW_MAP_PROFILES = Object.fromEntries(
  WORLDVIEW_GAME_PROFILES.map((profile) => [
    profile.id,
    {
      label: profile.label,
      description: profile.description,
      formats: profile.supportedFaceSyntaxes,
    },
  ]),
) as {
  readonly [Profile in (typeof WORLDVIEW_GAME_PROFILES)[number]['id']]: {
    readonly label: string;
    readonly description: string;
    readonly formats: (typeof WORLDVIEW_GAME_PROFILES)[number]['supportedFaceSyntaxes'];
  };
};
