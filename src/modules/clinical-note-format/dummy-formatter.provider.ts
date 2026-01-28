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
    rawTitle?: string | null;
    rawBody: string;
    formatProfile: string;
    options: Record<string, unknown>;
    promptVersion: number;
    traceId?: string | null;
    consultationId?: string;
    episodeId?: string;
    finalNoteId?: string;
  }): Promise<{
    A: { title?: string; body: string };
    B: { title?: string; body: string };
    C: { title?: string; body: string };
  }> {
    this.logger.log(
      JSON.stringify({
        event: 'dummy_formatter_called',
        formatProfile: input.formatProfile,
        options: input.options,
        promptVersion: input.promptVersion,
        traceId: input.traceId ?? null,
        consultationId: input.consultationId ?? null,
        episodeId: input.episodeId ?? null,
        finalNoteId: input.finalNoteId ?? null,
        titleLength: input.rawTitle?.length ?? 0,
        bodyLength: input.rawBody.length,
      }),
    );

    // Simple restructuring: add headings and create variants with clear differences
    const sourceText = [input.rawTitle, input.rawBody]
      .filter(Boolean)
      .join('\n');
    const sections = this.buildSections(sourceText);

    const variantA = this.renderSections(sections, {
      maxWords: 120,
      bullets: false,
    });

    const variantB = this.renderSections(sections, {
      maxWords: 250,
      bullets: false,
    });

    const variantC = this.renderSections(sections, {
      maxWords: 450,
      bullets: true,
    });

    return Promise.resolve({
      A: { title: 'Resumen breve', body: variantA },
      B: { title: 'Resumen estándar', body: variantB },
      C: { title: 'Resumen detallado', body: variantC },
    });
  }

  private buildSections(
    text: string,
  ): Array<{ label: string; content: string }> {
    const lower = text.toLowerCase();
    const firstSentence = this.firstSentence(text);

    const motivo =
      this.extractSectionByKeywords(text, ['motivo', 'consulta']) ??
      firstSentence ??
      'No aplica';
    const sintomas =
      this.extractSectionByKeywords(text, [
        'síntoma',
        'sintoma',
        'dolor',
        'fiebre',
      ]) ?? 'No aplica';
    const hallazgos =
      this.extractSectionByKeywords(text, [
        'hallazgo',
        'examen',
        'signo',
        'signos',
      ]) ?? 'No aplica';
    const plan =
      this.extractSectionByKeywords(text, [
        'plan',
        'tratamiento',
        'conducta',
      ]) ??
      (lower.includes('indicaciones') ? 'Ver indicaciones.' : 'No aplica');
    const indicaciones =
      this.extractSectionByKeywords(text, [
        'indicaciones',
        'recomend',
        'medic',
        'dosis',
      ]) ?? 'No aplica';
    const alertas =
      this.extractSectionByKeywords(text, [
        'alarma',
        'alerta',
        'urgencia',
        'emergencia',
      ]) ?? 'No aplica';

    return [
      { label: 'Motivo', content: motivo },
      { label: 'Síntomas', content: sintomas },
      { label: 'Hallazgos', content: hallazgos },
      { label: 'Plan', content: plan },
      { label: 'Indicaciones', content: indicaciones },
      { label: 'Alertas', content: alertas },
    ];
  }

  private renderSections(
    sections: Array<{ label: string; content: string }>,
    options: { maxWords: number; bullets: boolean },
  ): string {
    const lines = sections.map((section) => {
      const content =
        section.content.trim().length > 0
          ? section.content.trim()
          : 'No aplica';
      if (
        options.bullets &&
        ['Plan', 'Indicaciones', 'Alertas'].includes(section.label)
      ) {
        return `${section.label}:\n${this.toBullets(content)}`;
      }
      return `${section.label}: ${content}`;
    });

    const body = lines.join('\n');
    return this.trimToMaxWords(body, options.maxWords);
  }

  private extractSectionByKeywords(
    text: string,
    keywords: string[],
  ): string | null {
    const lowerText = text.toLowerCase();
    const keywordIndex = keywords
      .map((keyword) => lowerText.indexOf(keyword))
      .filter((index) => index >= 0)
      .sort((a, b) => a - b)[0];

    if (keywordIndex === undefined) {
      return null;
    }

    const start = Math.max(0, keywordIndex - 50);
    const end = Math.min(text.length, keywordIndex + 280);
    return text.substring(start, end).trim();
  }

  private firstSentence(text: string): string | null {
    const match = text.trim().match(/^[^.!?]{20,200}[.!?]/);
    return match ? match[0].trim() : null;
  }

  private toBullets(text: string): string {
    const parts = text
      .split(/[\n;•-]+/)
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length <= 1) {
      return `- ${text.trim()}`;
    }
    return parts.map((part) => `- ${part}`).join('\n');
  }

  private trimToMaxWords(text: string, maxWords: number): string {
    const words = text.trim().split(/\s+/);
    if (words.length <= maxWords) {
      return text.trim();
    }
    return words.slice(0, maxWords).join(' ') + '...';
  }
}
