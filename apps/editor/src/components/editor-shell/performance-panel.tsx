import { useEffect, useState, useSyncExternalStore } from 'react';
import { editorPerformance, summarizeTimings } from '../../editor-performance.js';
import { Button } from '../ui/button.js';
import '../../styles/performance.css';

export function PerformancePanel() {
  useSyncExternalStore(editorPerformance.subscribe, editorPerformance.getSnapshot);
  const [report, setReport] = useState('');
  useEffect(() => () => editorPerformance.setEnabled(false), []);
  const stats = summarizeTimings(editorPerformance.samples);
  const captureStats = summarizeTimings(editorPerformance.capture);
  const points = editorPerformance.samples
    .slice(-120)
    .map((sample, index) => `${index * 2},${60 - Math.min(60, sample.frameMs)}`)
    .join(' ');
  return (
    <div className="performance-control">
      <Button
        size="compact"
        tone="quiet"
        aria-pressed={editorPerformance.enabled}
        onPress={() => editorPerformance.setEnabled(!editorPerformance.enabled)}
      >
        Performance
      </Button>
      {editorPerformance.enabled && (
        <section className="performance-panel" aria-label="Performance diagnostics">
          <strong>Performance · {stats.fps.toFixed(0)} browser FPS</strong>
          <span>
            Last {stats.frames} frames · p95 {stats.p95Ms.toFixed(1)} ms · worst{' '}
            {stats.maxMs.toFixed(1)} ms
          </span>
          <svg viewBox="0 0 240 60" role="img" aria-label="Frame time graph, 0 to 60 milliseconds">
            <path d="M0 43.33H240 M0 26.66H240" className="performance-budget" />
            <polyline points={points} fill="none" />
          </svg>
          <span>
            Slow frames: {stats.over33Ms} above 33 ms · {stats.over50Ms} above 50 ms
          </span>
          <span>
            Editor: {stats.renderCalls} render calls · {stats.meanRenderCpuMs.toFixed(2)} ms
            CPU/call
          </span>
          <small>
            Browser cadence includes idle time. Editor draws on demand. CPU timing excludes GPU
            execution. Graph guides: 16.7 / 33.3 ms.
          </small>
          <div className="performance-actions">
            <Button
              size="compact"
              onPress={() => {
                setReport('');
                if (editorPerformance.recording) editorPerformance.stopCapture();
                else editorPerformance.startCapture();
              }}
            >
              {editorPerformance.recording ? 'Stop recording' : 'Record 30 seconds'}
            </Button>
            <Button
              size="compact"
              isDisabled={editorPerformance.recording || !editorPerformance.capture.length}
              onPress={() =>
                setReport(
                  JSON.stringify(
                    {
                      version: 1,
                      summary: captureStats,
                      description:
                        'Visible-tab rAF cadence and editor CPU submission timing; not GPU timings.',
                      samples: editorPerformance.capture,
                    },
                    null,
                    2,
                  ),
                )
              }
            >
              Show capture JSON
            </Button>
          </div>
          <span>
            {editorPerformance.recording ? 'Recording — move around the viewport' : 'Capture'}:{' '}
            {captureStats.frames} frames · {captureStats.over50Ms} above 50 ms · worst{' '}
            {captureStats.maxMs.toFixed(1)} ms
          </span>
          {report && <textarea aria-label="Performance capture JSON" readOnly value={report} />}
        </section>
      )}
    </div>
  );
}
