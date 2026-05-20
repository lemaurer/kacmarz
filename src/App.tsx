import { useEffect, useMemo, useState } from "react";
import PlotlyModule from "react-plotly.js";
import type { Data, Layout } from "plotly.js";
import { DisplayMath, InlineMath } from "./Latex";
import {
  buildTrajectory,
  dot,
  formatNumber,
  leastSquares,
  parseSystem,
  rowProbabilities,
  type Dimension,
  type Matrix,
  type Vector,
} from "./math";

type Preset = {
  id: string;
  label: string;
  dimension: Dimension;
  matrixText: string;
  vectorText: string;
  initialPointText: string;
};

const PRESETS: Preset[] = [
  {
    id: "consistent-2d",
    label: "Simple 2D consistent",
    dimension: 2,
    matrixText: "[[1, 1], [1, -1], [2, 1]]",
    vectorText: "[2, 0, 3]",
    initialPointText: "[-2, 2]",
  },
  {
    id: "inconsistent-2d",
    label: "2D inconsistent",
    dimension: 2,
    matrixText: "[[1, 1], [1, -1], [2, 1]]",
    vectorText: "[2, 0, 4]",
    initialPointText: "[-2, 2]",
  },
  {
    id: "consistent-3d",
    label: "Simple 3D consistent",
    dimension: 3,
    matrixText: "[[1, 1, 1], [1, -1, 1], [2, 1, -1]]",
    vectorText: "[3, 1, 2]",
    initialPointText: "[-2, 2, -1]",
  },
  {
    id: "inconsistent-3d",
    label: "3D inconsistent",
    dimension: 3,
    matrixText: "[[1, 1, 1], [1, -1, 1], [2, 1, -1], [1, 2, -1]]",
    vectorText: "[3, 1, 2, 5]",
    initialPointText: "[-2, 2, -1]",
  },
];

const ROW_COLORS = ["#2f6fed", "#d95f02", "#009e73", "#8a5cf6", "#b24600"];
const ACTIVE_COLOR = "#111827";
const TRAJECTORY_COLOR = "#2448a6";
const PROJECTION_COLOR = "#c2410c";
const SOLUTION_COLOR = "#0f766e";
const Plot = (
  PlotlyModule as typeof PlotlyModule & {
    default?: typeof PlotlyModule;
  }
).default ?? PlotlyModule;

function App() {
  const initialPreset = PRESETS[0];
  const [dimension, setDimension] = useState<Dimension>(initialPreset.dimension);
  const [presetId, setPresetId] = useState(initialPreset.id);
  const [matrixText, setMatrixText] = useState(initialPreset.matrixText);
  const [vectorText, setVectorText] = useState(initialPreset.vectorText);
  const [initialPointText, setInitialPointText] = useState(
    initialPreset.initialPointText,
  );
  const [seed, setSeed] = useState("7");
  const [speed, setSpeed] = useState(5);
  const [stepCount, setStepCount] = useState(20);
  const [showAllHyperplanes, setShowAllHyperplanes] = useState(true);
  const [showTrajectory, setShowTrajectory] = useState(true);
  const [showSolution, setShowSolution] = useState(true);
  const [showControlsPanel, setShowControlsPanel] = useState(true);
  const [showInfoPanel, setShowInfoPanel] = useState(true);
  const [currentStep, setCurrentStep] = useState(0);
  const [stepPhase, setStepPhase] = useState<"select" | "project">("select");
  const [isRunning, setIsRunning] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewRevision, setViewRevision] = useState(0);

  const parsed = useMemo(
    () => parseSystem(matrixText, vectorText, initialPointText, dimension),
    [dimension, initialPointText, matrixText, vectorText],
  );

  const trajectory = useMemo(() => {
    if (!parsed.ok) {
      return null;
    }

    return buildTrajectory(parsed.A, parsed.b, parsed.x0, stepCount, seed);
  }, [parsed, seed, stepCount]);

  const probabilities = useMemo(() => {
    if (!parsed.ok) {
      return [];
    }

    return rowProbabilities(parsed.A);
  }, [parsed]);

  const solutionInfo = useMemo(() => {
    if (!parsed.ok) {
      return null;
    }

    return leastSquares(parsed.A, parsed.b);
  }, [parsed]);

  const selectedRowIndex =
    stepPhase === "project" ? trajectory?.rowIndices[currentStep] ?? null : null;
  const activeRowIndex = selectedRowIndex;
  const currentPoint = trajectory?.points[currentStep] ?? null;
  const nextPoint =
    stepPhase === "project" ? trajectory?.points[currentStep + 1] ?? null : null;
  const animationDelay = 1450 - speed * 125;
  const progressButtonLabel = stepPhase === "select" ? "Select row" : "Project";

  useEffect(() => {
    setCurrentStep(0);
    setStepPhase("select");
    setIsRunning(false);
  }, [dimension, initialPointText, matrixText, seed, stepCount, vectorText]);

  useEffect(() => {
    if (!isRunning || !trajectory || currentStep >= stepCount) {
      if (currentStep >= stepCount && stepPhase === "select") {
        setIsRunning(false);
      }
      return;
    }

    const timer = window.setTimeout(() => {
      advanceProgress(true);
    }, animationDelay);

    return () => window.clearTimeout(timer);
  }, [animationDelay, currentStep, isRunning, stepCount, stepPhase, trajectory]);

  const plotState = useMemo(() => {
    if (!parsed.ok || !trajectory) {
      return null;
    }

    const extent = computeExtent(
      trajectory.points,
      solutionInfo?.solution ?? null,
    );

    if (dimension === 2) {
      return {
        data: create2DTraces({
          A: parsed.A,
          b: parsed.b,
          points: trajectory.points,
          currentStep,
          currentPoint,
          nextPoint,
          solution: solutionInfo?.solution ?? null,
          solutionLabel: solutionInfo?.isConsistent
            ? "x<sub>*</sub>"
            : "x<sub>LS</sub>",
          showAllHyperplanes,
          showTrajectory,
          showSolution,
          activeRowIndex,
          extent,
        }),
        layout: create2DLayout(extent, viewRevision),
      };
    }

    return {
      data: create3DTraces({
        A: parsed.A,
        b: parsed.b,
        points: trajectory.points,
        currentStep,
        currentPoint,
        nextPoint,
        solution: solutionInfo?.solution ?? null,
        solutionLabel: solutionInfo?.isConsistent
          ? "x<sub>*</sub>"
          : "x<sub>LS</sub>",
        showAllHyperplanes,
        showTrajectory,
        showSolution,
        activeRowIndex,
        extent,
      }),
      layout: create3DLayout(extent, viewRevision),
    };
  }, [
    activeRowIndex,
    currentPoint,
    currentStep,
    dimension,
    nextPoint,
    parsed,
    showAllHyperplanes,
    showSolution,
    showTrajectory,
    solutionInfo,
    trajectory,
    viewRevision,
  ]);

  const selectedRow =
    parsed.ok && selectedRowIndex !== null ? parsed.A[selectedRowIndex] : null;
  const selectedRightHandSide =
    parsed.ok && selectedRowIndex !== null ? parsed.b[selectedRowIndex] : null;
  const residual =
    selectedRow && currentPoint && selectedRightHandSide !== null
      ? selectedRightHandSide - dot(selectedRow, currentPoint)
      : null;
  const currentError =
    parsed.ok && currentPoint
      ? Math.sqrt(
          parsed.A.reduce((sum, row, index) => {
            const rowResidual = dot(row, currentPoint) - parsed.b[index];
            return sum + rowResidual * rowResidual;
          }, 0),
        )
      : null;

  useEffect(() => {
    if (!isFullscreen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsFullscreen(false);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isFullscreen]);

  function handleDimensionChange(nextDimension: Dimension) {
    const nextPreset = PRESETS.find(
      (preset) => preset.dimension === nextDimension,
    );

    if (!nextPreset) {
      return;
    }

    setDimension(nextDimension);
    loadPreset(nextPreset);
  }

  function handlePresetChange(nextPresetId: string) {
    if (nextPresetId === "custom") {
      setPresetId("custom");
      return;
    }

    const nextPreset = PRESETS.find((preset) => preset.id === nextPresetId);
    if (!nextPreset) {
      return;
    }

    setDimension(nextPreset.dimension);
    loadPreset(nextPreset);
  }

  function loadPreset(preset: Preset) {
    setPresetId(preset.id);
    setMatrixText(preset.matrixText);
    setVectorText(preset.vectorText);
    setInitialPointText(preset.initialPointText);
  }

  function markCustom(change: (value: string) => void, value: string) {
    setPresetId("custom");
    change(value);
  }

  function resetIteration() {
    setCurrentStep(0);
    setStepPhase("select");
    setIsRunning(false);
  }

  function advanceProgress(keepRunning = false) {
    if (!trajectory || currentStep >= stepCount) {
      setIsRunning(false);
      return;
    }

    if (stepPhase === "select") {
      setStepPhase("project");
      if (!keepRunning) {
        setIsRunning(false);
      }
      return;
    }

    setCurrentStep((step) => Math.min(step + 1, stepCount));
    setStepPhase("select");
    if (!keepRunning) {
      setIsRunning(false);
    }
  }

  function stepBack() {
    if (stepPhase === "project") {
      setStepPhase("select");
      setIsRunning(false);
      return;
    }

    if (currentStep > 0) {
      setCurrentStep((step) => Math.max(step - 1, 0));
      setStepPhase("project");
    }

    setIsRunning(false);
  }

  function resetView() {
    setViewRevision((revision) => revision + 1);
  }

  const solutionSymbol = solutionInfo?.isConsistent
    ? "x_\\star"
    : "x_{\\mathrm{LS}}";
  const workspaceClassName = [
    "workspace",
    showControlsPanel ? "controls-visible" : "controls-hidden",
    showInfoPanel ? "info-visible" : "info-hidden",
  ].join(" ");

  return (
    <main className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Interactive seminar demo</p>
          <h1>Randomized Kaczmarz</h1>
        </div>
      </header>

      <section className={workspaceClassName}>
        {showControlsPanel && (
        <aside className="control-panel">
          <div className="panel-block">
            <label>
              Dimension
              <select
                value={dimension}
                onChange={(event) =>
                  handleDimensionChange(Number(event.target.value) as Dimension)
                }
              >
                <option value={2}>2D</option>
                <option value={3}>3D</option>
              </select>
            </label>

            <label>
              Preset system
              <select value={presetId} onChange={(event) => handlePresetChange(event.target.value)}>
                {PRESETS.filter((preset) => preset.dimension === dimension).map(
                  (preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.label}
                    </option>
                  ),
                )}
                <option value="custom">Custom</option>
              </select>
            </label>
          </div>

          <div className="panel-block matrix-inputs">
            <label>
              <InlineMath>A</InlineMath>
              <textarea
                rows={3}
                value={matrixText}
                onChange={(event) => markCustom(setMatrixText, event.target.value)}
              />
            </label>

            <label>
              <InlineMath>b</InlineMath>
              <textarea
                rows={2}
                value={vectorText}
                onChange={(event) => markCustom(setVectorText, event.target.value)}
              />
            </label>

            <label>
              <InlineMath>x_0</InlineMath>
              <textarea
                rows={2}
                value={initialPointText}
                onChange={(event) =>
                  markCustom(setInitialPointText, event.target.value)
                }
              />
            </label>

            {!parsed.ok && <p className="error-message">{parsed.error}</p>}
          </div>

          <div className="panel-block">
            <div className="button-row">
              <button
                type="button"
                onClick={() => setIsRunning(true)}
                disabled={!trajectory || currentStep >= stepCount || isRunning}
              >
                Run animation
              </button>
              <button
                type="button"
                onClick={() => setIsRunning(false)}
                disabled={!isRunning}
              >
                Pause
              </button>
              <button
                type="button"
                onClick={resetIteration}
                disabled={!trajectory}
              >
                Reset
              </button>
              <button
                type="button"
                onClick={() => advanceProgress()}
                disabled={!trajectory || currentStep >= stepCount}
              >
                {progressButtonLabel}
              </button>
            </div>

            <label>
              Speed
              <div className="range-line">
                <input
                  type="range"
                  min={1}
                  max={10}
                  value={speed}
                  onChange={(event) => setSpeed(Number(event.target.value))}
                />
                <span>{speed}/10</span>
              </div>
            </label>

            <label>
              Number of steps
              <div className="range-line">
                <input
                  type="range"
                  min={1}
                  max={60}
                  value={stepCount}
                  onChange={(event) => setStepCount(Number(event.target.value))}
                />
                <span>{stepCount}</span>
              </div>
            </label>

            <label>
              Random seed
              <input
                type="text"
                value={seed}
                onChange={(event) => setSeed(event.target.value)}
              />
            </label>
          </div>

          <div className="panel-block toggle-list">
            <label>
              <input
                type="checkbox"
                checked={showAllHyperplanes}
                onChange={(event) => setShowAllHyperplanes(event.target.checked)}
              />
              Show all hyperplanes
            </label>
            <label>
              <input
                type="checkbox"
                checked={showTrajectory}
                onChange={(event) => setShowTrajectory(event.target.checked)}
              />
              Show trajectory
            </label>
            <label>
              <input
                type="checkbox"
                checked={showSolution}
                onChange={(event) => setShowSolution(event.target.checked)}
              />
              Show true solution / least-squares point
            </label>
          </div>
        </aside>
        )}

        <section className="visual-panel">
          <div className="visual-toolbar">
            <div className="toolbar-actions">
              <button type="button" onClick={() => setIsFullscreen(true)}>
                Fullscreen plot
              </button>
              <button
                type="button"
                onClick={stepBack}
                disabled={!trajectory || (currentStep === 0 && stepPhase === "select")}
              >
                Step back
              </button>
              <button
                type="button"
                onClick={() => advanceProgress()}
                disabled={!trajectory || currentStep >= stepCount}
              >
                {progressButtonLabel}
              </button>
              <button type="button" onClick={resetView}>
                Reset view
              </button>
            </div>

            <div className="plot-error" aria-live="polite">
              <span>Current error</span>
              <InlineMath>
                {String.raw`\lVert Ax_k-b\rVert_2=${
                  currentError === null ? "\\text{unavailable}" : formatNumber(currentError)
                }`}
              </InlineMath>
            </div>

            <div className="toolbar-toggles" aria-label="Panel visibility">
              <label>
                <input
                  type="checkbox"
                  checked={showControlsPanel}
                  onChange={(event) =>
                    setShowControlsPanel(event.target.checked)
                  }
                />
                Controls
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={showInfoPanel}
                  onChange={(event) => setShowInfoPanel(event.target.checked)}
                />
                Information
              </label>
            </div>
          </div>

          <div className="plot-stage">
          {plotState ? (
            <Plot
              data={plotState.data}
              layout={plotState.layout}
              config={{
                displaylogo: false,
                responsive: true,
                scrollZoom: true,
              }}
              useResizeHandler
              className="plot"
            />
          ) : (
            <div className="plot-placeholder">
              Fix the input error to render the visualization.
            </div>
          )}
          {parsed.ok && <SystemOverlay A={parsed.A} b={parsed.b} />}
          </div>
        </section>

        {showInfoPanel && (
        <aside className="readout-panel">
          <div className="panel-block formula-panel">
            <h2>Formula</h2>
            <div className="formula-entry">
              <strong>Kaczmarz step</strong>
              <DisplayMath>
                {String.raw`x_{k+1}=x_k+\frac{b_i-a_i^\top x_k}{\lVert a_i\rVert_2^2}a_i`}
              </DisplayMath>
            </div>
            <div className="formula-entry">
              <strong>Sampling rule</strong>
              <DisplayMath>
                {String.raw`\mathbb{P}(i)=\frac{\lVert a_i\rVert_2^2}{\lVert A\rVert_F^2}`}
              </DisplayMath>
            </div>
          </div>

          <div className="panel-block">
            <h2>Row probabilities</h2>
            <ol className="probability-list">
              {probabilities.map((probability, index) => (
                <li key={index}>
                  <InlineMath>
                    {String.raw`\mathbb{P}(${index + 1})=${formatNumber(probability)}`}
                  </InlineMath>
                </li>
              ))}
            </ol>
          </div>

          <div className="panel-block">
            <h2>Current step</h2>
            <dl>
              <div>
                <dt>
                  Iteration <InlineMath>k</InlineMath>
                </dt>
                <dd>{currentStep}</dd>
              </div>
              <div>
                <dt>
                  Selected row <InlineMath>i</InlineMath>
                </dt>
                <dd>
                  {currentStep >= stepCount
                    ? "complete"
                    : selectedRowIndex === null
                      ? "not selected yet"
                      : selectedRowIndex + 1}
                </dd>
              </div>
              <div>
                <dt>Selected equation</dt>
                <dd>
                  {selectedRow && selectedRightHandSide !== null
                    ? (
                      <InlineMath>
                        {formatEquationLatex(selectedRow, selectedRightHandSide)}
                      </InlineMath>
                    )
                    : currentStep >= stepCount
                      ? "No upcoming projection"
                      : "Select a row to reveal the next projection"}
                </dd>
              </div>
              <div>
                <dt>
                  Residual <InlineMath>b_i-a_i^\top x_k</InlineMath>
                </dt>
                <dd>{residual === null ? "—" : formatNumber(residual)}</dd>
              </div>
              <div>
                <dt>
                  Current iterate <InlineMath>x_k</InlineMath>
                </dt>
                <dd>
                  {currentPoint ? (
                    <InlineMath>{formatVectorLatex(currentPoint)}</InlineMath>
                  ) : (
                    "unavailable"
                  )}
                </dd>
              </div>
              <div>
                <dt>
                  Next iterate <InlineMath>{String.raw`x_{k+1}`}</InlineMath>
                </dt>
                <dd>
                  {nextPoint ? (
                    <InlineMath>{formatVectorLatex(nextPoint)}</InlineMath>
                  ) : (
                    "unavailable"
                  )}
                </dd>
              </div>
            </dl>
          </div>

          <div className="panel-block solution-block">
            <h2>Solution status</h2>
            {solutionInfo?.solution ? (
              <>
                <p>
                  <InlineMath>
                    {`${solutionSymbol}=${formatVectorLatex(solutionInfo.solution)}`}
                  </InlineMath>
                </p>
                <p>
                  Residual norm:{" "}
                  {solutionInfo.residualNorm === null
                    ? "unavailable"
                    : formatNumber(solutionInfo.residualNorm)}
                </p>
                <p>
                  {solutionInfo.isConsistent
                    ? "The displayed hyperplanes share an exact intersection."
                    : (
                      <>
                        The hyperplanes do not share one exact intersection;{" "}
                        <InlineMath>{String.raw`x_{\mathrm{LS}}`}</InlineMath> is the
                        least-squares minimizer.
                      </>
                    )}
                </p>
              </>
            ) : (
              <p>
                A unique least-squares point is unavailable for this rank-deficient
                input.
              </p>
            )}
          </div>
        </aside>
        )}
      </section>

      {isFullscreen && (
        <div
          className="fullscreen-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Fullscreen plot"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setIsFullscreen(false);
            }
          }}
        >
          <section className="fullscreen-panel">
            <div className="fullscreen-toolbar">
              <div className="fullscreen-controls">
                <button
                  type="button"
                  onClick={() => setIsRunning(true)}
                  disabled={!trajectory || currentStep >= stepCount || isRunning}
                >
                  Run
                </button>
                <button
                  type="button"
                  onClick={() => setIsRunning(false)}
                  disabled={!isRunning}
                >
                  Pause
                </button>
                <button
                  type="button"
                  onClick={resetIteration}
                  disabled={!trajectory}
                >
                  Reset
                </button>
                <button
                  type="button"
                  onClick={stepBack}
                  disabled={!trajectory || (currentStep === 0 && stepPhase === "select")}
                >
                  Step back
                </button>
                <button
                  type="button"
                  onClick={() => advanceProgress()}
                  disabled={!trajectory || currentStep >= stepCount}
                >
                  {progressButtonLabel}
                </button>
                <button type="button" onClick={resetView}>
                  Reset view
                </button>
              </div>

              <button
                type="button"
                className="close-button"
                onClick={() => setIsFullscreen(false)}
              >
                Close
              </button>
            </div>

            <div className="fullscreen-plot-stage">
              {plotState ? (
                <Plot
                  data={plotState.data}
                  layout={plotState.layout}
                  config={{
                    displaylogo: false,
                    responsive: true,
                    scrollZoom: true,
                  }}
                  useResizeHandler
                  className="plot fullscreen-plot"
                />
              ) : (
                <div className="plot-placeholder fullscreen-placeholder">
                  Fix the input error to render the visualization.
                </div>
              )}
              {parsed.ok && <SystemOverlay A={parsed.A} b={parsed.b} />}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

type TraceOptions = {
  A: Matrix;
  b: Vector;
  points: Vector[];
  currentStep: number;
  currentPoint: Vector | null;
  nextPoint: Vector | null;
  solution: Vector | null;
  solutionLabel: string;
  showAllHyperplanes: boolean;
  showTrajectory: boolean;
  showSolution: boolean;
  activeRowIndex: number | null;
  extent: number;
};

function SystemOverlay({ A, b }: { A: Matrix; b: Vector }) {
  return (
    <div className="system-overlay" aria-label="Current linear system">
      <div className="system-card">
        <DisplayMath>{String.raw`A=${formatMatrixLatex(A)}`}</DisplayMath>
      </div>
      <div className="system-card">
        <DisplayMath>{String.raw`b=${formatVectorLatex(b)}`}</DisplayMath>
      </div>
    </div>
  );
}

function create2DTraces(options: TraceOptions): Data[] {
  const visibleRows = getVisibleRows(
    options.A.length,
    options.showAllHyperplanes,
    options.activeRowIndex,
  );
  const traces: Data[] = visibleRows.map((rowIndex) => {
    const { x, y } = createLine(
      options.A[rowIndex],
      options.b[rowIndex],
      options.extent,
    );
    const isActive = rowIndex === options.activeRowIndex;

    return {
      type: "scatter",
      mode: "lines",
      x,
      y,
      name: `row ${rowIndex + 1}`,
      hovertemplate: `${formatEquationHtml(options.A[rowIndex], options.b[rowIndex])}<extra></extra>`,
      line: {
        color: isActive
          ? ACTIVE_COLOR
          : hexToRgba(ROW_COLORS[rowIndex % ROW_COLORS.length], 0.34),
        width: isActive ? 4 : 3,
        dash: "solid",
      },
    };
  });

  const shownTrajectory = options.points.slice(0, options.currentStep + 1);
  if (options.showTrajectory && shownTrajectory.length > 0) {
    traces.push({
      type: "scatter",
      mode: "lines+markers",
      x: shownTrajectory.map((point) => point[0]),
      y: shownTrajectory.map((point) => point[1]),
      name: "trajectory",
      line: { color: TRAJECTORY_COLOR, width: 3 },
      marker: { color: TRAJECTORY_COLOR, size: 7 },
    });
  }

  if (options.currentPoint && options.nextPoint) {
    traces.push({
      type: "scatter",
      mode: "lines",
      x: [options.currentPoint[0], options.nextPoint[0]],
      y: [options.currentPoint[1], options.nextPoint[1]],
      name: "projection segment",
      line: { color: PROJECTION_COLOR, width: 4, dash: "dash" },
    });
  }

  if (options.currentPoint) {
    traces.push({
      type: "scatter",
      mode: "markers",
      x: [options.currentPoint[0]],
      y: [options.currentPoint[1]],
      name: "x<sub>k</sub>",
      marker: {
        color: ACTIVE_COLOR,
        size: 14,
        line: { color: "#ffffff", width: 2 },
      },
    });
  }

  if (options.nextPoint) {
    traces.push({
      type: "scatter",
      mode: "markers",
      x: [options.nextPoint[0]],
      y: [options.nextPoint[1]],
      name: "x<sub>k+1</sub>",
      marker: {
        color: PROJECTION_COLOR,
        size: 13,
        symbol: "diamond",
        line: { color: "#ffffff", width: 2 },
      },
    });
  }

  if (options.showSolution && options.solution) {
    traces.push({
      type: "scatter",
      mode: "markers",
      x: [options.solution[0]],
      y: [options.solution[1]],
      name: options.solutionLabel,
      marker: {
        color: SOLUTION_COLOR,
        size: 16,
        symbol: "star",
      },
    });
  }

  return traces;
}

function create3DTraces(options: TraceOptions): Data[] {
  const visibleRows = getVisibleRows(
    options.A.length,
    options.showAllHyperplanes,
    options.activeRowIndex,
  );
  const traces: Data[] = visibleRows.map((rowIndex) => {
    const plane = createPlane(
      options.A[rowIndex],
      options.b[rowIndex],
      options.extent,
    );
    const isActive = rowIndex === options.activeRowIndex;
    const color = isActive
      ? ACTIVE_COLOR
      : ROW_COLORS[rowIndex % ROW_COLORS.length];

    return {
      type: "surface",
      ...plane,
      name: `row ${rowIndex + 1}`,
      legendgroup: `row-${rowIndex + 1}`,
      showlegend: false,
      hovertemplate: `${formatEquationHtml(options.A[rowIndex], options.b[rowIndex])}<extra></extra>`,
      showscale: false,
      opacity: isActive ? 0.58 : 0.18,
      colorscale: [
        [0, color],
        [1, color],
      ],
    };
  });

  traces.push(
    ...visibleRows.map((rowIndex) => {
      const isActive = rowIndex === options.activeRowIndex;
      const color = isActive
        ? ACTIVE_COLOR
        : ROW_COLORS[rowIndex % ROW_COLORS.length];

      return {
        type: "scatter3d",
        mode: "lines",
        x: [null],
        y: [null],
        z: [null],
        name: `row ${rowIndex + 1}`,
        legendgroup: `row-${rowIndex + 1}`,
        hoverinfo: "skip",
        showlegend: true,
        line: {
          color,
          width: isActive ? 7 : 5,
          dash: isActive ? "solid" : "dot",
        },
      } satisfies Data;
    }),
  );

  const shownTrajectory = options.points.slice(0, options.currentStep + 1);
  if (options.showTrajectory && shownTrajectory.length > 0) {
    traces.push({
      type: "scatter3d",
      mode: "lines+markers",
      x: shownTrajectory.map((point) => point[0]),
      y: shownTrajectory.map((point) => point[1]),
      z: shownTrajectory.map((point) => point[2]),
      name: "trajectory",
      line: { color: TRAJECTORY_COLOR, width: 6 },
      marker: { color: TRAJECTORY_COLOR, size: 4 },
    });
  }

  if (options.currentPoint && options.nextPoint) {
    traces.push({
      type: "scatter3d",
      mode: "lines",
      x: [options.currentPoint[0], options.nextPoint[0]],
      y: [options.currentPoint[1], options.nextPoint[1]],
      z: [options.currentPoint[2], options.nextPoint[2]],
      name: "projection segment",
      line: { color: PROJECTION_COLOR, width: 8, dash: "dash" },
    });
  }

  if (options.currentPoint) {
    traces.push({
      type: "scatter3d",
      mode: "markers",
      x: [options.currentPoint[0]],
      y: [options.currentPoint[1]],
      z: [options.currentPoint[2]],
      name: "x<sub>k</sub>",
      marker: {
        color: ACTIVE_COLOR,
        size: 7,
        line: { color: "#ffffff", width: 2 },
      },
    });
  }

  if (options.nextPoint) {
    traces.push({
      type: "scatter3d",
      mode: "markers",
      x: [options.nextPoint[0]],
      y: [options.nextPoint[1]],
      z: [options.nextPoint[2]],
      name: "x<sub>k+1</sub>",
      marker: {
        color: PROJECTION_COLOR,
        size: 7,
        symbol: "diamond",
        line: { color: "#ffffff", width: 2 },
      },
    });
  }

  if (options.showSolution && options.solution) {
    traces.push({
      type: "scatter3d",
      mode: "markers",
      x: [options.solution[0]],
      y: [options.solution[1]],
      z: [options.solution[2]],
      name: options.solutionLabel,
      marker: {
        color: SOLUTION_COLOR,
        size: 8,
        symbol: "diamond",
      },
    });
  }

  return traces;
}

function create2DLayout(extent: number, viewRevision: number): Partial<Layout> {
  return {
    autosize: true,
    margin: { l: 52, r: 20, t: 20, b: 48 },
    paper_bgcolor: "#ffffff",
    plot_bgcolor: "#ffffff",
    hovermode: "closest",
    hoverdistance: 18,
    dragmode: "pan",
    legend: {
      orientation: "h",
      y: 1.08,
      x: 0,
    },
    xaxis: {
      title: { text: "x<sub>1</sub>" },
      range: [-extent, extent],
      zeroline: true,
      gridcolor: "#e5e7eb",
      scaleanchor: "y",
      scaleratio: 1,
    },
    yaxis: {
      title: { text: "x<sub>2</sub>" },
      range: [-extent, extent],
      zeroline: true,
      gridcolor: "#e5e7eb",
    },
    uirevision: `kaczmarz-2d-${viewRevision}`,
  };
}

function create3DLayout(extent: number, viewRevision: number): Partial<Layout> {
  return {
    autosize: true,
    margin: { l: 0, r: 0, t: 12, b: 0 },
    paper_bgcolor: "#ffffff",
    hovermode: "closest",
    legend: {
      orientation: "h",
      y: 1.08,
      x: 0,
    },
    scene: {
      aspectmode: "cube",
      xaxis: {
        title: { text: "x<sub>1</sub>" },
        range: [-extent, extent],
        gridcolor: "#e5e7eb",
      },
      yaxis: {
        title: { text: "x<sub>2</sub>" },
        range: [-extent, extent],
        gridcolor: "#e5e7eb",
      },
      zaxis: {
        title: { text: "x<sub>3</sub>" },
        range: [-extent, extent],
        gridcolor: "#e5e7eb",
      },
    },
    uirevision: `kaczmarz-3d-${viewRevision}`,
  };
}

function getVisibleRows(
  rowCount: number,
  showAllHyperplanes: boolean,
  activeRowIndex: number | null,
): number[] {
  if (showAllHyperplanes || activeRowIndex === null) {
    return showAllHyperplanes
      ? Array.from({ length: rowCount }, (_, index) => index)
      : [];
  }

  return [activeRowIndex];
}

function createLine(row: Vector, rhs: number, extent: number) {
  const [a1, a2] = row;
  const lineExtent = extent * 3;
  const sampleCount = 161;
  const sampleAxis = Array.from({ length: sampleCount }, (_, index) => {
    const t = index / (sampleCount - 1);
    return -lineExtent + 2 * lineExtent * t;
  });

  if (Math.abs(a2) >= Math.abs(a1)) {
    const x = sampleAxis;
    return {
      x,
      y: x.map((value) => (rhs - a1 * value) / a2),
    };
  }

  const y = sampleAxis;
  return {
    x: y.map((value) => (rhs - a2 * value) / a1),
    y,
  };
}

function createPlane(row: Vector, rhs: number, extent: number) {
  const [a1, a2, a3] = row;
  const dominantCoordinate = row.reduce(
    (largestIndex, value, index) =>
      Math.abs(value) > Math.abs(row[largestIndex]) ? index : largestIndex,
    0,
  );
  const low = -extent;
  const high = extent;

  if (dominantCoordinate === 0) {
    const y = [
      [low, high],
      [low, high],
    ];
    const z = [
      [low, low],
      [high, high],
    ];
    return {
      x: y.map((planeRow, rowIndex) =>
        planeRow.map(
          (value, columnIndex) =>
            (rhs - a2 * value - a3 * z[rowIndex][columnIndex]) / a1,
        ),
      ),
      y,
      z,
    };
  }

  if (dominantCoordinate === 1) {
    const x = [
      [low, high],
      [low, high],
    ];
    const z = [
      [low, low],
      [high, high],
    ];
    return {
      x,
      y: x.map((planeRow, rowIndex) =>
        planeRow.map(
          (value, columnIndex) =>
            (rhs - a1 * value - a3 * z[rowIndex][columnIndex]) / a2,
        ),
      ),
      z,
    };
  }

  const x = [
    [low, high],
    [low, high],
  ];
  const y = [
    [low, low],
    [high, high],
  ];
  return {
    x,
    y,
    z: x.map((planeRow, rowIndex) =>
      planeRow.map(
        (value, columnIndex) =>
          (rhs - a1 * value - a2 * y[rowIndex][columnIndex]) / a3,
      ),
    ),
  };
}

function computeExtent(points: Vector[], solution: Vector | null): number {
  const coordinates = [
    ...points.flat(),
    ...(solution ? solution : []),
  ];
  const largestCoordinate = coordinates.reduce(
    (largest, value) => Math.max(largest, Math.abs(value)),
    0,
  );

  return Math.max(3, Math.ceil(largestCoordinate + 1));
}

function formatVectorLatex(vector: Vector): string {
  return `\\begin{bmatrix}${vector.map(formatNumber).join(" \\\\ ")}\\end{bmatrix}`;
}

function formatMatrixLatex(matrix: Matrix): string {
  return `\\begin{bmatrix}${matrix
    .map((row) => row.map(formatNumber).join(" & "))
    .join(" \\\\ ")}\\end{bmatrix}`;
}

function hexToRgba(hexColor: string, alpha: number): string {
  const normalized = hexColor.replace("#", "");
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function formatEquationLatex(row: Vector, rhs: number): string {
  const leftSide = row
    .map((coefficient, index) => {
      const magnitude = formatNumber(Math.abs(coefficient));
      const term = `${magnitude}x_{${index + 1}}`;

      if (index === 0) {
        return coefficient < 0 ? `-${term}` : term;
      }

      return coefficient < 0 ? ` - ${term}` : ` + ${term}`;
    })
    .join("");

  return `${leftSide} = ${formatNumber(rhs)}`;
}

function formatEquationHtml(row: Vector, rhs: number): string {
  const leftSide = row
    .map((coefficient, index) => {
      const magnitude = formatNumber(Math.abs(coefficient));
      const term = `${magnitude}x<sub>${index + 1}</sub>`;

      if (index === 0) {
        return coefficient < 0 ? `-${term}` : term;
      }

      return coefficient < 0 ? ` - ${term}` : ` + ${term}`;
    })
    .join("");

  return `${leftSide} = ${formatNumber(rhs)}`;
}

export default App;
