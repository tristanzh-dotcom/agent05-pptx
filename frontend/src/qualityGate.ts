export interface QualityGateErrorPayload {
  valid: false
  errors: string[]
  warnings: string[]
}

export function tryParseQualityGate(raw: string): QualityGateErrorPayload | null {
  try {
    const parsed = JSON.parse(raw)
    if (parsed && parsed.valid === false && Array.isArray(parsed.errors)) {
      return {
        valid: false,
        errors: parsed.errors.filter((item: unknown): item is string => typeof item === 'string'),
        warnings: Array.isArray(parsed.warnings) ? parsed.warnings.filter((item: unknown): item is string => typeof item === 'string') : []
      }
    }
    return null
  } catch {
    return null
  }
}
