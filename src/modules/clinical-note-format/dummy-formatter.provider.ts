import { Injectable, Logger } from '@nestjs/common';
import type { FormatterProvider } from './formatter-provider.interface';

/**
 * Dummy formatter provider (dev/testing).
 * What it does:
 * - Generates simple formatted proposals without LLM integration.
 * How it works:
 * - Restructures text with basic headings and creates variants A/B/C.
 * Gotchas:
 * - For development only; does not use actual AI.
 */
@Injectable()
export class DummyFormatterProvider implements FormatterProvider {
  private readonly logger = new Logger(DummyFormatterProvider.name);

  formatClinicalNote(input: {
    rawText: string;
    preset: string;
    options: Record<string, unknown>;
    promptVersion: number;
  }): Promise<{
    A: { title?: string; body: string };
    B: { title?: string; body: string };
    C: { title?: string; body: string };
  }> {
    this.logger.log(
      JSON.stringify({
        event: 'dummy_formatter_called',
        preset: input.preset,
        options: input.options,
        promptVersion: input.promptVersion,
        textLength: input.rawText.length,
      }),
    );

    // Simple restructuring: add headings and create variants
    const baseText = input.rawText.trim();
    const useBullets = input.options.bullets === true;
    const length = (input.options.length ?? 'medium') as
      | 'short'
      | 'medium'
      | 'long';

    // Variant A: Brief (shorter)
    const variantA = this.createVariant(baseText, 'brief', useBullets, length);

    // Variant B: Standard (balanced)
    const variantB = this.createVariant(
      baseText,
      'standard',
      useBullets,
      length,
    );

    // Variant C: Detailed (more structured)
    const variantC = this.createVariant(
      baseText,
      'detailed',
      useBullets,
      length,
    );

    return Promise.resolve({
      A: { title: 'Resumen breve', body: variantA },
      B: { title: 'Resumen estándar', body: variantB },
      C: { title: 'Resumen detallado', body: variantC },
    });
  }

  private createVariant(
    text: string,
    style: 'brief' | 'standard' | 'detailed',
    useBullets: boolean,
    length: 'short' | 'medium' | 'long',
  ): string {
    // Simple restructuring: add basic sections
    const sections: string[] = [];

    // Try to detect common patterns
    if (
      text.toLowerCase().includes('motivo') ||
      text.toLowerCase().includes('consulta')
    ) {
      sections.push('## Motivo de consulta');
      sections.push(
        this.extractSection(text, 'motivo') ||
          text.substring(0, Math.min(200, text.length)),
      );
    }

    if (
      text.toLowerCase().includes('examen') ||
      text.toLowerCase().includes('hallazgo')
    ) {
      sections.push('## Hallazgos');
      sections.push(
        this.extractSection(text, 'hallazgo') || 'Sin hallazgos relevantes.',
      );
    }

    if (
      text.toLowerCase().includes('plan') ||
      text.toLowerCase().includes('tratamiento')
    ) {
      sections.push('## Plan de tratamiento');
      sections.push(
        this.extractSection(text, 'plan') || 'Seguimiento según evolución.',
      );
    }

    // If no sections detected, use original text with minimal formatting
    if (sections.length === 0) {
      sections.push(text);
    }

    let result = sections.join('\n\n');

    // Apply length adjustment
    if (length === 'short' && result.length > 500) {
      result = result.substring(0, 500) + '...';
    } else if (length === 'long' && result.length < 1000) {
      // Add some padding for "long" variant
      result =
        result + '\n\n---\n\nNota: Resumen extendido generado automáticamente.';
    }

    // Apply bullets if requested
    if (useBullets && style === 'detailed') {
      result = result.replace(/\n/g, '\n- ');
      result = '- ' + result;
    }

    return result;
  }

  private extractSection(text: string, keyword: string): string | null {
    const lowerText = text.toLowerCase();
    const keywordIndex = lowerText.indexOf(keyword.toLowerCase());
    if (keywordIndex === -1) {
      return null;
    }
    // Extract a reasonable chunk around the keyword
    const start = Math.max(0, keywordIndex - 50);
    const end = Math.min(text.length, keywordIndex + 300);
    return text.substring(start, end).trim();
  }
}
