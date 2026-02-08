import type { BestSolution, Operation } from './types';

interface SolutionNode {
  value: number;
  left?: SolutionNode;
  right?: SolutionNode;
  op?: Operation;
}

export function computeBestSolution(tiles: number[], target: number): BestSolution | null {
  const n = tiles.length;
  const memo = new Map<number, Map<number, SolutionNode>>();

  const getMap = (mask: number) => {
    if (!memo.has(mask)) memo.set(mask, new Map());
    return memo.get(mask)!;
  };

  const outSet = (map: Map<number, SolutionNode>, value: number, node: SolutionNode) => {
    if (!Number.isInteger(value)) return;
    if (value <= 0) return;
    if (value > 50000) return;
    if (!map.has(value)) map.set(value, node);
  };

  for (let i = 0; i < n; i += 1) {
    const mask = 1 << i;
    getMap(mask).set(tiles[i], { value: tiles[i] });
  }

  for (let mask = 1; mask < 1 << n; mask += 1) {
    for (let a = (mask - 1) & mask; a > 0; a = (a - 1) & mask) {
      const b = mask ^ a;
      if (b === 0) continue;
      if (a > b) continue;

      const mapA = getMap(a);
      const mapB = getMap(b);
      if (!mapA.size || !mapB.size) continue;

      const out = getMap(mask);
      for (const [va, nodeA] of mapA.entries()) {
        for (const [vb, nodeB] of mapB.entries()) {
          outSet(out, va + vb, { value: va + vb, left: nodeA, right: nodeB, op: '+' });
          outSet(out, va * vb, { value: va * vb, left: nodeA, right: nodeB, op: '*' });

          if (va > vb) {
            outSet(out, va - vb, { value: va - vb, left: nodeA, right: nodeB, op: '-' });
          }
          if (vb > va) {
            outSet(out, vb - va, { value: vb - va, left: nodeB, right: nodeA, op: '-' });
          }

          if (vb !== 0 && va % vb === 0) {
            outSet(out, va / vb, { value: va / vb, left: nodeA, right: nodeB, op: '/' });
          }
          if (va !== 0 && vb % va === 0) {
            outSet(out, vb / va, { value: vb / va, left: nodeB, right: nodeA, op: '/' });
          }
        }
      }
    }
  }

  const formatStep = (left: SolutionNode, right: SolutionNode, op: Operation, result: number) => {
    switch (op) {
      case '+':
        return `${left.value} + ${right.value} = ${result}`;
      case '*':
        return `${left.value} × ${right.value} = ${result}`;
      case '-':
        return `${left.value} - ${right.value} = ${result}`;
      case '/':
        return `${left.value} ÷ ${right.value} = ${result}`;
    }
  };

  const collectSteps = (node: SolutionNode): string[] => {
    if (!node.left || !node.right || !node.op) return [];
    return [
      ...collectSteps(node.left),
      ...collectSteps(node.right),
      formatStep(node.left, node.right, node.op, node.value)
    ];
  };

  let best: { value: number; diff: number; node: SolutionNode } | null = null;
  for (let mask = 1; mask < 1 << n; mask += 1) {
    const map = getMap(mask);
    for (const [value, node] of map.entries()) {
      const diff = Math.abs(target - value);
      if (!best || diff < best.diff) {
        best = { value, diff, node };
      }
      if (best && best.diff === 0) {
        return { value: best.value, diff: best.diff, steps: collectSteps(best.node) };
      }
    }
  }

  if (!best) return null;
  return { value: best.value, diff: best.diff, steps: collectSteps(best.node) };
}
