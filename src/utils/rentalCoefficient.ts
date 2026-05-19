export type RentalCoefficientMode = 'none' | 'automatic' | 'formula';

type FormulaToken = {
  type: 'number' | 'identifier' | 'operator' | 'paren' | 'comma';
  value: string;
};

export type CoefficientFormulaNode =
  | { type: 'number'; value: number }
  | { type: 'variable'; name: string }
  | { type: 'unary'; op: '+' | '-'; value: CoefficientFormulaNode }
  | { type: 'binary'; op: '+' | '-' | '*' | '/' | '^'; left: CoefficientFormulaNode; right: CoefficientFormulaNode }
  | { type: 'call'; name: string; args: CoefficientFormulaNode[] };

const FORMULA_FUNCTIONS: Record<string, (...args: number[]) => number> = {
  min: (...args: number[]) => Math.min(...args),
  max: (...args: number[]) => Math.max(...args),
  abs: (value: number) => Math.abs(value),
  round: (value: number) => Math.round(value),
  floor: (value: number) => Math.floor(value),
  ceil: (value: number) => Math.ceil(value),
};

export const normalizeRentalCoefficientMode = (value: unknown): RentalCoefficientMode => {
  if (value === 'automatic' || value === 'formula' || value === 'none') return value;
  return 'none';
};

export const computeAutomaticCoefficient = (daysInput: number) => {
  const days = Math.max(1, Math.floor(daysInput));
  if (days <= 5) {
    return 1 + 0.5 * (days - 1);
  }
  if (days <= 16) {
    return 3.25 + 0.25 * (days - 6);
  }
  if (days <= 19) {
    return 5.75 + 0.2 * (days - 16);
  }
  if (days <= 30) {
    return 6.35 + 0.15 * (days - 19);
  }
  return 8 + 0.5 * (days - 30);
};

const tokenizeFormula = (input: string): FormulaToken[] | null => {
  const tokens: FormulaToken[] = [];
  const trimmed = input.trim();
  if (!trimmed) return tokens;
  let index = 0;
  const isDigit = (char: string) => char >= '0' && char <= '9';
  const isAlpha = (char: string) => (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z');
  while (index < trimmed.length) {
    const char = trimmed[index];
    if (char === ' ' || char === '\t' || char === '\n') {
      index += 1;
      continue;
    }
    if (isDigit(char) || char === '.') {
      let start = index;
      let hasDot = char === '.';
      index += 1;
      while (index < trimmed.length) {
        const next = trimmed[index];
        if (isDigit(next)) {
          index += 1;
          continue;
        }
        if (next === '.' && !hasDot) {
          hasDot = true;
          index += 1;
          continue;
        }
        break;
      }
      const raw = trimmed.slice(start, index);
      if (raw === '.') return null;
      tokens.push({ type: 'number', value: raw });
      continue;
    }
    if (isAlpha(char)) {
      let start = index;
      index += 1;
      while (index < trimmed.length) {
        const next = trimmed[index];
        if (isAlpha(next)) {
          index += 1;
          continue;
        }
        break;
      }
      tokens.push({ type: 'identifier', value: trimmed.slice(start, index) });
      continue;
    }
    if ('+-*/^'.includes(char)) {
      tokens.push({ type: 'operator', value: char });
      index += 1;
      continue;
    }
    if (char === '(' || char === ')') {
      tokens.push({ type: 'paren', value: char });
      index += 1;
      continue;
    }
    if (char === ',') {
      tokens.push({ type: 'comma', value: char });
      index += 1;
      continue;
    }
    return null;
  }
  return tokens;
};

export const parseCoefficientFormula = (input: string): { node: CoefficientFormulaNode | null; error: string | null } => {
  const tokens = tokenizeFormula(input);
  if (!tokens) return { node: null, error: 'Formule invalide.' };
  if (tokens.length === 0) return { node: null, error: 'Formule requise.' };
  let index = 0;
  const peek = () => tokens[index] || null;
  const consume = () => {
    const token = tokens[index];
    index += 1;
    return token;
  };
  const parseExpression = (): CoefficientFormulaNode => parseAddSub();
  const parseAddSub = (): CoefficientFormulaNode => {
    let node = parseMulDiv();
    while (peek() && peek()?.type === 'operator' && (peek()?.value === '+' || peek()?.value === '-')) {
      const op = consume().value as '+' | '-';
      const right = parseMulDiv();
      node = { type: 'binary', op, left: node, right };
    }
    return node;
  };
  const parseMulDiv = (): CoefficientFormulaNode => {
    let node = parsePower();
    while (peek() && peek()?.type === 'operator' && (peek()?.value === '*' || peek()?.value === '/')) {
      const op = consume().value as '*' | '/';
      const right = parsePower();
      node = { type: 'binary', op, left: node, right };
    }
    return node;
  };
  const parsePower = (): CoefficientFormulaNode => {
    let node = parseUnary();
    if (peek() && peek()?.type === 'operator' && peek()?.value === '^') {
      consume();
      const right = parsePower();
      node = { type: 'binary', op: '^', left: node, right };
    }
    return node;
  };
  const parseUnary = (): CoefficientFormulaNode => {
    if (peek() && peek()?.type === 'operator' && (peek()?.value === '+' || peek()?.value === '-')) {
      const op = consume().value as '+' | '-';
      const value = parseUnary();
      return { type: 'unary', op, value };
    }
    return parsePrimary();
  };
  const parsePrimary = (): CoefficientFormulaNode => {
    const token = peek();
    if (!token) throw new Error('Formule incomplete.');
    if (token.type === 'number') {
      consume();
      const value = Number.parseFloat(token.value);
      if (!Number.isFinite(value)) throw new Error('Nombre invalide.');
      return { type: 'number', value };
    }
    if (token.type === 'identifier') {
      consume();
      const name = token.value.toLowerCase();
      if (peek() && peek()?.type === 'paren' && peek()?.value === '(') {
        consume();
        const args: CoefficientFormulaNode[] = [];
        if (peek() && !(peek()?.type === 'paren' && peek()?.value === ')')) {
          args.push(parseExpression());
          while (peek() && peek()?.type === 'comma') {
            consume();
            args.push(parseExpression());
          }
        }
        if (!peek() || peek()?.type !== 'paren' || peek()?.value !== ')') {
          throw new Error('Parenthese manquante.');
        }
        consume();
        if (!FORMULA_FUNCTIONS[name]) {
          throw new Error(`Fonction inconnue: ${token.value}.`);
        }
        return { type: 'call', name, args };
      }
      if (name !== 'x') {
        throw new Error(`Variable inconnue: ${token.value}.`);
      }
      return { type: 'variable', name };
    }
    if (token.type === 'paren' && token.value === '(') {
      consume();
      const node = parseExpression();
      if (!peek() || peek()?.type !== 'paren' || peek()?.value !== ')') {
        throw new Error('Parenthese manquante.');
      }
      consume();
      return node;
    }
    throw new Error('Token invalide.');
  };
  try {
    const node = parseExpression();
    if (index < tokens.length) {
      return { node: null, error: 'Formule invalide.' };
    }
    return { node, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Formule invalide.';
    return { node: null, error: message };
  }
};

export const evaluateCoefficientFormula = (node: CoefficientFormulaNode, xValue: number): number => {
  switch (node.type) {
    case 'number':
      return node.value;
    case 'variable':
      return xValue;
    case 'unary': {
      const value = evaluateCoefficientFormula(node.value, xValue);
      return node.op === '-' ? -value : value;
    }
    case 'binary': {
      const left = evaluateCoefficientFormula(node.left, xValue);
      const right = evaluateCoefficientFormula(node.right, xValue);
      switch (node.op) {
        case '+':
          return left + right;
        case '-':
          return left - right;
        case '*':
          return left * right;
        case '/':
          return right === 0 ? Number.NaN : left / right;
        case '^':
          return Math.pow(left, right);
        default:
          return Number.NaN;
      }
    }
    case 'call': {
      const handler = FORMULA_FUNCTIONS[node.name];
      if (!handler) return Number.NaN;
      const args = node.args.map((arg) => evaluateCoefficientFormula(arg, xValue));
      return handler(...args);
    }
    default:
      return Number.NaN;
  }
};

export const computeRentalCoefficient = (
  mode: RentalCoefficientMode,
  daysInput: number,
  formula?: string | null,
): number | null => {
  if (mode === 'none') return Math.max(1, Math.floor(daysInput));
  if (mode === 'automatic') return computeAutomaticCoefficient(daysInput);
  const parsed = parseCoefficientFormula(formula ?? '');
  if (!parsed.node) return null;
  const value = evaluateCoefficientFormula(parsed.node, daysInput);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
};
