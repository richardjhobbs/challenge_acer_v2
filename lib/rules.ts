import type { Operation } from './types';

export interface OperationResult {
  value: number;
  expression: string;
}

export function scoreForDiff(diff: number): number {
  if (diff === 0) return 10;
  if (diff >= 1 && diff <= 5) return 7;
  if (diff >= 6 && diff <= 10) return 5;
  return 0;
}

// Server-side validation can reuse this operation guard for multiplayer rounds.
export function applyOperation(a: number, b: number, op: Operation): OperationResult {
  let value: number;
  let expression: string;

  switch (op) {
    case '+':
      value = a + b;
      expression = `${a} + ${b} = ${value}`;
      break;
    case '*':
      value = a * b;
      expression = `${a} × ${b} = ${value}`;
      break;
    case '-':
      if (a === b) throw new Error('Subtraction would make 0, not allowed.');
      if (a > b) {
        value = a - b;
        expression = `${a} - ${b} = ${value}`;
      } else {
        value = b - a;
        expression = `${b} - ${a} = ${value}`;
      }
      break;
    case '/':
      if (b !== 0 && a % b === 0) {
        value = a / b;
        expression = `${a} ÷ ${b} = ${value}`;
      } else if (a !== 0 && b % a === 0) {
        value = b / a;
        expression = `${b} ÷ ${a} = ${value}`;
      } else {
        throw new Error('Division must be exact.');
      }
      break;
    default:
      throw new Error('Unsupported operation.');
  }

  if (!Number.isInteger(value) || value <= 0) throw new Error('Result must be a positive integer.');
  return { value, expression };
}
