/**
 * Formatter provider interface for clinical note formatting.
 * What it does:
 * - Abstracts the implementation of clinical note formatting (dummy vs LLM).
 * How it works:
 * - Takes raw text and formatting options, returns three proposal variants.
 * Gotchas:
 * - Should not invent clinical information; only restructure and improve wording.
 */
export interface FormatterProvider {
  formatClinicalNote(input: {
    rawText: string;
    preset: string;
    options: Record<string, unknown>;
    promptVersion: number;
  }): Promise<{
    A: { title?: string; body: string };
    B: { title?: string; body: string };
    C: { title?: string; body: string };
  }>;
}
