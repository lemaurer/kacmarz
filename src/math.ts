export type Dimension = 2 | 3;
export type Vector = number[];
export type Matrix = number[][];

export type ParsedSystem =
  | {
      ok: true;
      A: Matrix;
      b: Vector;
      x0: Vector;
    }
  | {
      ok: false;
      error: string;
    };

export type LeastSquaresResult = {
  solution: Vector | null;
  residualNorm: number | null;
  isConsistent: boolean;
};

export type Trajectory = {
  points: Vector[];
  rowIndices: number[];
};

const PIVOT_TOLERANCE = 1e-10;

export function parseSystem(
  matrixText: string,
  vectorText: string,
  initialPointText: string,
  dimension: Dimension,
): ParsedSystem {
  try {
    const rawMatrix = JSON.parse(matrixText) as unknown;
    const rawVector = JSON.parse(vectorText) as unknown;
    const rawInitialPoint = JSON.parse(initialPointText) as unknown;

    if (!Array.isArray(rawMatrix) || rawMatrix.length === 0) {
      return {
        ok: false,
        error: "A must be a non-empty array of rows.",
      };
    }

    if (
      rawMatrix.some(
        (row) =>
          !Array.isArray(row) ||
          row.length !== dimension ||
          row.some((entry) => !isFiniteNumber(entry)),
      )
    ) {
      return {
        ok: false,
        error: `Every row of A must contain exactly ${dimension} finite numbers.`,
      };
    }

    if (
      !Array.isArray(rawVector) ||
      rawVector.some((entry) => !isFiniteNumber(entry))
    ) {
      return {
        ok: false,
        error: "b must be an array of finite numbers.",
      };
    }

    if (rawVector.length !== rawMatrix.length) {
      return {
        ok: false,
        error: `b must have length ${rawMatrix.length} to match the rows of A.`,
      };
    }

    if (
      !Array.isArray(rawInitialPoint) ||
      rawInitialPoint.length !== dimension ||
      rawInitialPoint.some((entry) => !isFiniteNumber(entry))
    ) {
      return {
        ok: false,
        error: `x0 must contain exactly ${dimension} finite numbers.`,
      };
    }

    const A = rawMatrix as Matrix;
    if (A.some((row) => normSquared(row) <= PIVOT_TOLERANCE)) {
      return {
        ok: false,
        error: "Every row of A must have non-zero norm for Kaczmarz sampling.",
      };
    }

    return {
      ok: true,
      A,
      b: rawVector as Vector,
      x0: rawInitialPoint as Vector,
    };
  } catch {
    return {
      ok: false,
      error:
        "Inputs must use valid JSON syntax, for example [[1, 1], [1, -1]] and [2, 0].",
    };
  }
}

export function dot(a: Vector, b: Vector): number {
  return a.reduce((sum, value, index) => sum + value * b[index], 0);
}

export function normSquared(vector: Vector): number {
  return dot(vector, vector);
}

export function subtract(a: Vector, b: Vector): Vector {
  return a.map((value, index) => value - b[index]);
}

export function add(a: Vector, b: Vector): Vector {
  return a.map((value, index) => value + b[index]);
}

export function scale(vector: Vector, factor: number): Vector {
  return vector.map((value) => value * factor);
}

export function rowProbabilities(A: Matrix): number[] {
  const squaredNorms = A.map(normSquared);
  const frobeniusSquared = squaredNorms.reduce((sum, value) => sum + value, 0);
  return squaredNorms.map((value) => value / frobeniusSquared);
}

export function kaczmarzStep(
  point: Vector,
  row: Vector,
  rhs: number,
): Vector {
  const residual = rhs - dot(row, point);
  return add(point, scale(row, residual / normSquared(row)));
}

export function buildTrajectory(
  A: Matrix,
  b: Vector,
  x0: Vector,
  steps: number,
  seedText: string,
): Trajectory {
  const probabilities = rowProbabilities(A);
  const random = mulberry32(hashSeed(seedText));
  const points: Vector[] = [x0];
  const rowIndices: number[] = [];

  for (let step = 0; step < steps; step += 1) {
    const rowIndex = sampleRow(probabilities, random());
    const nextPoint = kaczmarzStep(
      points[points.length - 1],
      A[rowIndex],
      b[rowIndex],
    );

    rowIndices.push(rowIndex);
    points.push(nextPoint);
  }

  return { points, rowIndices };
}

export function leastSquares(A: Matrix, b: Vector): LeastSquaresResult {
  const dimension = A[0].length;
  const normalMatrix = Array.from({ length: dimension }, (_, row) =>
    Array.from({ length: dimension }, (_, column) =>
      A.reduce((sum, values) => sum + values[row] * values[column], 0),
    ),
  );
  const normalVector = Array.from({ length: dimension }, (_, column) =>
    A.reduce((sum, values, row) => sum + values[column] * b[row], 0),
  );
  const solution = solveLinearSystem(normalMatrix, normalVector);

  if (!solution) {
    return {
      solution: null,
      residualNorm: null,
      isConsistent: false,
    };
  }

  const residual = A.map((row, index) => dot(row, solution) - b[index]);
  const residualNorm = Math.sqrt(normSquared(residual));
  const bNorm = Math.sqrt(normSquared(b));
  const consistencyThreshold = 1e-7 * Math.max(1, bNorm);

  return {
    solution,
    residualNorm,
    isConsistent: residualNorm <= consistencyThreshold,
  };
}

export function formatNumber(value: number): string {
  const normalized = Math.abs(value) < 1e-10 ? 0 : value;
  return normalized.toLocaleString("en-US", {
    maximumFractionDigits: 4,
  });
}

export function formatVector(vector: Vector | null): string {
  if (!vector) {
    return "unavailable";
  }

  return `[${vector.map(formatNumber).join(", ")}]`;
}

function solveLinearSystem(matrix: Matrix, vector: Vector): Vector | null {
  const augmented = matrix.map((row, index) => [...row, vector[index]]);
  const size = vector.length;

  for (let column = 0; column < size; column += 1) {
    let pivotRow = column;

    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivotRow][column])) {
        pivotRow = row;
      }
    }

    if (Math.abs(augmented[pivotRow][column]) <= PIVOT_TOLERANCE) {
      return null;
    }

    if (pivotRow !== column) {
      [augmented[column], augmented[pivotRow]] = [
        augmented[pivotRow],
        augmented[column],
      ];
    }

    const pivot = augmented[column][column];
    for (let index = column; index <= size; index += 1) {
      augmented[column][index] /= pivot;
    }

    for (let row = 0; row < size; row += 1) {
      if (row === column) {
        continue;
      }

      const factor = augmented[row][column];
      for (let index = column; index <= size; index += 1) {
        augmented[row][index] -= factor * augmented[column][index];
      }
    }
  }

  return augmented.map((row) => row[size]);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function sampleRow(probabilities: number[], randomValue: number): number {
  let cumulative = 0;

  for (let index = 0; index < probabilities.length; index += 1) {
    cumulative += probabilities[index];
    if (randomValue <= cumulative) {
      return index;
    }
  }

  return probabilities.length - 1;
}

function hashSeed(seedText: string): number {
  let hash = 1779033703 ^ seedText.length;

  for (let index = 0; index < seedText.length; index += 1) {
    hash = Math.imul(hash ^ seedText.charCodeAt(index), 3432918353);
    hash = (hash << 13) | (hash >>> 19);
  }

  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  return () => {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
