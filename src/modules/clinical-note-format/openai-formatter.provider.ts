import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import type { FormatterProvider } from './formatter-provider.interface';

/**
 * OpenAI formatter provider for clinical note formatting.
 * What it does:
 * - Generates three formatted proposal variants (A=brief, B=standard, C=detailed) using OpenAI API.
 * How it works:
 * - Uses Chat Completions API with structured outputs (JSON schema) to ensure consistent format.
 * - Applies prompt version 1 with clinical safety rules (no invention of facts).
 * Gotchas:
 * - Requires OPENAI_API_KEY when provider=openai.
 * - Does not log PHI (clinical text content) - only metadata.
 * - Timeout: 30s per request. Includes a small in-provider retry.
 */
@Injectable()
export class OpenAiFormatterProvider implements FormatterProvider {
  private readonly logger = new Logger(OpenAiFormatterProvider.name);
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly promptVersion = 1;
  private readonly temperature = 0.55;
  private readonly requiredSections = [
    'Motivo',
    'Síntomas',
    'Hallazgos',
    'Plan',
    'Indicaciones',
    'Alertas',
  ];
  private readonly maxWords = {
    A: 120,
    B: 250,
    C: 450,
  };

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.getOrThrow<string>('OPENAI_API_KEY');
    this.model =
      this.configService.get<string>('OPENAI_MODEL') ?? 'gpt-4o-mini';
    const baseUrl = this.configService.get<string>('OPENAI_BASE_URL');

    this.client = new OpenAI({
      apiKey,
      ...(baseUrl ? { baseURL: baseUrl } : {}),
      timeout: 30000, // 30s timeout
      maxRetries: 0, // we handle retries explicitly
    });

    this.logger.log(
      JSON.stringify({
        event: 'openai_provider_initialized',
        model: this.model,
        baseUrl: baseUrl ?? 'default',
        promptVersion: this.promptVersion,
      }),
    );
  }

  async formatClinicalNote(input: {
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
    const startTime = Date.now();
    const titleLength = input.rawTitle?.length ?? 0;
    const bodyLength = input.rawBody.length;
    const formatProfile = input.formatProfile || 'clinical_default';

    this.logger.log(
      JSON.stringify({
        event: 'openai_format_start',
        model: this.model,
        promptVersion: input.promptVersion,
        formatProfile,
        traceId: input.traceId ?? null,
        consultationId: input.consultationId ?? null,
        episodeId: input.episodeId ?? null,
        finalNoteId: input.finalNoteId ?? null,
        titleLength,
        bodyLength,
        options: {
          length: input.options.length,
          bullets: input.options.bullets,
          keywords: input.options.keywords,
          tone: input.options.tone,
        },
      }),
    );

    try {
      const prompt = this.buildPrompt({
        rawTitle: input.rawTitle,
        rawBody: input.rawBody,
        formatProfile,
      });
      const responseFormat = this.buildResponseFormat();

      const completion = await this.withRetry(() =>
        this.client.chat.completions.create({
          model: this.model,
          messages: [
            {
              role: 'system',
              content: this.buildSystemPrompt(input.options),
            },
            {
              role: 'user',
              content: prompt,
            },
          ],

          response_format: responseFormat as any,
          temperature: this.temperature,
        }),
      );

      const durationMs = Date.now() - startTime;

      // Extract structured output
      const content = completion.choices[0]?.message?.content;
      if (!content) {
        throw new Error('Empty response from OpenAI');
      }

      let parsed: {
        A: { body: string };
        B: { body: string };
        C: { body: string };
      };

      try {
        parsed = JSON.parse(content);
      } catch (parseError) {
        this.logger.error(
          JSON.stringify({
            event: 'openai_parse_error',
            error:
              parseError instanceof Error
                ? parseError.message
                : String(parseError),
            contentLength: content.length,
          }),
        );
        throw new Error('Failed to parse OpenAI response as JSON');
      }

      // Validate structure
      if (!parsed.A?.body || !parsed.B?.body || !parsed.C?.body) {
        throw new Error('Invalid response structure: missing A, B, or C body');
      }

      const usage = completion.usage;

      const normalizedA = this.normalizeVariant(parsed.A.body, this.maxWords.A);
      const normalizedB = this.normalizeVariant(parsed.B.body, this.maxWords.B);
      const normalizedC = this.normalizeVariant(parsed.C.body, this.maxWords.C);

      this.logger.log(
        JSON.stringify({
          event: 'openai_format_completed',
          model: this.model,
          durationMs,
          promptTokens: usage?.prompt_tokens,
          completionTokens: usage?.completion_tokens,
          totalTokens: usage?.total_tokens,
          responseLength: {
            A: normalizedA.body.length,
            B: normalizedB.body.length,
            C: normalizedC.body.length,
          },
        }),
      );

      return {
        A: { title: 'Variante A (breve)', body: normalizedA.body },
        B: { title: 'Variante B (estándar)', body: normalizedB.body },
        C: { title: 'Variante C (detallada)', body: normalizedC.body },
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorCode = this.classifyError(error);

      this.logger.error(
        JSON.stringify({
          event: 'openai_format_failed',
          model: this.model,
          durationMs,
          errorCode,
          error: errorMessage,
          retryable: this.isRetryableError(error),
        }),
      );

      throw error;
    }
  }

  private buildSystemPrompt(options: Record<string, unknown>): string {
    const tone = (options.tone as string) ?? 'clinical';
    const toneInstruction =
      tone === 'mixed'
        ? 'Usa un tono balanceado entre técnico y accesible.'
        : 'Usa un tono clínico profesional y preciso.';

    return `Eres un asistente especializado en redactar notas clínicas. Tu tarea es reescribir y estructurar notas clínicas mejorando su legibilidad y organización, SIN inventar información.

REGLAS FUNDAMENTALES:
1. NO inventes diagnósticos, medicación, síntomas ni datos clínicos que no estén en el texto original.
2. NO cambies hechos ni fechas mencionadas.
3. NO agregues información que no esté explícitamente presente en el texto.
4. Si hay ambigüedad, mantén el texto original o usa frases neutras.
5. Preserva el idioma del texto de entrada.
6. NO copies text verbatim; you must rewrite and improve readability.
7. Usa subtítulos claros con estas secciones obligatorias en este orden: Motivo, Síntomas, Hallazgos, Plan, Indicaciones, Alertas.
8. Si una sección no aplica, escribe exactamente: "No aplica".
9. Responde en texto plano (sin markdown pesado ni tablas). Puedes usar viñetas simples "-" cuando sea apropiado.
10. ${toneInstruction}

OBJETIVO:
- Mejorar la estructura y legibilidad.
- Organizar en secciones claras.
- Aclarar redacción sin cambiar significado.
- Conservar toda la información original.`;
  }

  private buildPrompt(input: {
    rawTitle?: string | null;
    rawBody: string;
    formatProfile: string;
  }): string {
    const titleBlock = input.rawTitle
      ? `TÍTULO ORIGINAL:\n${input.rawTitle}\n\n`
      : '';
    const formatProfile = input.formatProfile || 'clinical_default';

    // Root cause (2026-01-28): A/B/C used the same length profile and prompts, producing near-identical outputs.
    return `PromptVersion=1. Formato/Perfil: ${formatProfile}.

Genera TRES variantes (A, B, C) claramente distintas. No copies texto literal del original.

VARIANTE A (breve):
- 80 a 120 palabras máximo.
- Ultra-resumen con foco en lo esencial.
- Sin exceso de detalle.

VARIANTE B (estándar):
- 150 a 250 palabras.
- Cobertura completa, equilibrada.
- Puedes usar viñetas simples "-" si ayuda a la claridad.

VARIANTE C (detallada):
- 250 a 450 palabras.
- Más detalle clínico dentro del texto original.
- Incluye viñetas simples "-" en Plan e Indicaciones si corresponde.

Todas las variantes deben incluir estas secciones en este orden (si no aplica, escribir "No aplica"):
Motivo, Síntomas, Hallazgos, Plan, Indicaciones, Alertas.

NOTA CLÍNICA ORIGINAL:
${titleBlock}${input.rawBody}

Devuelve SOLO un objeto JSON válido con las claves A, B, C y cada una con { "body": "..." }.`;
  }

  private buildResponseFormat(): {
    type: 'json_schema';
    json_schema: {
      name: string;
      schema: unknown;
      strict: boolean;
    };
  } {
    return {
      type: 'json_schema',
      json_schema: {
        name: 'clinical_note_proposals',
        schema: {
          type: 'object',
          properties: {
            A: {
              type: 'object',
              properties: {
                body: {
                  type: 'string',
                  description: 'Variante A (Brief): texto breve y conciso',
                },
              },
              required: ['body'],
              additionalProperties: false,
            },
            B: {
              type: 'object',
              properties: {
                body: {
                  type: 'string',
                  description:
                    'Variante B (Standard): texto estándar con estructura completa',
                },
              },
              required: ['body'],
              additionalProperties: false,
            },
            C: {
              type: 'object',
              properties: {
                body: {
                  type: 'string',
                  description:
                    'Variante C (Detailed): texto detallado con más contexto',
                },
              },
              required: ['body'],
              additionalProperties: false,
            },
          },
          required: ['A', 'B', 'C'],
          additionalProperties: false,
        },
        strict: true,
      },
    };
  }

  private normalizeVariant(body: string, maxWords: number): { body: string } {
    const cleaned = this.stripMarkdownHeadings(body);
    const trimmed = this.trimToMaxWords(cleaned, maxWords);
    const withSections = this.ensureSections(trimmed);
    return { body: withSections.trim() };
  }

  private ensureSections(body: string): string {
    const missing = this.requiredSections.filter(
      (section) => !new RegExp(`^\\s*${section}\\s*:`, 'im').test(body),
    );
    if (missing.length === 0) {
      return body;
    }

    const appended = missing
      .map((section) => `${section}: No aplica`)
      .join('\n');

    return `${body.trim()}\n\n${appended}`;
  }

  private stripMarkdownHeadings(text: string): string {
    return text.replace(/^#{1,6}\s*/gm, '');
  }

  private trimToMaxWords(text: string, maxWords: number): string {
    const words = text.trim().split(/\s+/);
    if (words.length <= maxWords) {
      return text.trim();
    }
    return words.slice(0, maxWords).join(' ') + '...';
  }

  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    const maxAttempts = 2;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        if (attempt >= maxAttempts || !this.isRetryableError(error)) {
          break;
        }
        await this.sleep(500 * attempt);
      }
    }

    throw lastError;
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private classifyError(error: unknown): string {
    if (error instanceof Error) {
      // OpenAI SDK errors
      if ('status' in error) {
        const status = (error as { status?: number }).status;
        if (status === 401 || status === 403) {
          return 'AUTHENTICATION_ERROR';
        }
        if (status === 429) {
          return 'RATE_LIMIT_ERROR';
        }
        if (status && status >= 500) {
          return 'SERVER_ERROR';
        }
        if (status === 408 || error.message.includes('timeout')) {
          return 'TIMEOUT_ERROR';
        }
      }

      // Check for specific OpenAI error types
      if (error.message.includes('invalid_request')) {
        return 'INVALID_REQUEST';
      }
      if (error.message.includes('rate_limit')) {
        return 'RATE_LIMIT_ERROR';
      }
      if (error.message.includes('timeout')) {
        return 'TIMEOUT_ERROR';
      }
    }

    return 'UNKNOWN_ERROR';
  }

  private isRetryableError(error: unknown): boolean {
    const errorCode = this.classifyError(error);
    const retryableCodes = [
      'RATE_LIMIT_ERROR',
      'SERVER_ERROR',
      'TIMEOUT_ERROR',
    ];
    return retryableCodes.includes(errorCode);
  }
}
