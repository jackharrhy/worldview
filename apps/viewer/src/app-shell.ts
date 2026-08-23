export function createAppShell(app: HTMLElement) {
  app.innerHTML = `
    <main class="viewer-shell" data-viewer-shell>
      <canvas id="map-canvas" aria-label="Worldview map viewport"></canvas>

      <div class="map-readout" aria-live="polite">
        <strong data-map-name>Worldview</strong>
        <span data-status>Choose a map from the controls.</span>
        <span class="map-readout__format" data-format>BSP29 and BSP30</span>
      </div>

      <p class="control-hint">Click to look. WASD to move, Space to jump, V for noclip.</p>
      <div class="reticle" aria-hidden="true"></div>
      <div class="drop-target" data-drop-message hidden>Drop a BSP with its map assets</div>

      <aside class="control-dock" aria-label="Map controls" data-control-dock></aside>

      <input
        class="visually-hidden"
        data-local-files
        type="file"
        accept=".bsp,.wad,.spr,.wav,.mp3,.ogg,.lmp,.pal,.tga,application/octet-stream,audio/wav,audio/mpeg,audio/ogg"
        multiple
      />
      <input
        class="visually-hidden"
        data-walkability-file
        type="file"
        accept=".json,application/json"
      />
      <output data-metrics hidden></output>
    </main>
  `;

  return {
    shell: app.querySelector<HTMLElement>('[data-viewer-shell]')!,
    canvas: app.querySelector<HTMLCanvasElement>('#map-canvas')!,
    mapName: app.querySelector<HTMLElement>('[data-map-name]')!,
    status: app.querySelector<HTMLElement>('[data-status]')!,
    formatLabel: app.querySelector<HTMLElement>('[data-format]')!,
    metricsOutput: app.querySelector<HTMLOutputElement>('[data-metrics]')!,
    dropMessage: app.querySelector<HTMLElement>('[data-drop-message]')!,
    localFiles: app.querySelector<HTMLInputElement>('[data-local-files]')!,
    walkabilityFile: app.querySelector<HTMLInputElement>('[data-walkability-file]')!,
    paneContainer: app.querySelector<HTMLElement>('[data-control-dock]')!,
  };
}
