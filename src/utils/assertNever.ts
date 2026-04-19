/**
 * Exhaustive type narrowing guard for discriminated unions.
 *
 * Place in the `default` branch of a switch on a discriminated union.
 * TypeScript will error at compile time if any variant is unhandled,
 * because an unhandled variant's type cannot be assigned to `never`.
 *
 * At runtime, throws if reached — this should never happen when
 * all cases are handled, but guards against data from untyped sources.
 *
 * @param value - The value that should be `never` (all cases handled)
 * @param message - Optional context for the error message
 * @returns Never returns — always throws
 *
 * @example
 * ```typescript
 * type Shape = { type: 'circle'; r: number } | { type: 'square'; s: number }
 *
 * function area(shape: Shape): number {
 *   switch (shape.type) {
 *     case 'circle': return Math.PI * shape.r ** 2
 *     case 'square': return shape.s ** 2
 *     default: return assertNever(shape.type)
 *     // Adding a new Shape variant without a case → compile error here
 *   }
 * }
 * ```
 */
export function assertNever(value: never, message?: string): never {
  if (message !== undefined) throw new Error(message)
  let rendered: string
  try {
    rendered = JSON.stringify(value)
  } catch {
    rendered = String(value)
  }
  throw new Error(`Unexpected value: ${rendered}`)
}
