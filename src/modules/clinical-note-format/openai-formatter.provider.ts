import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FormatterProvider } from './formatter-provider.interface';

/**
 * OpenAI formatter provider (stub - not implemented yet).
 * What it does:
 * - Placeholder for OpenAI-based clinical note formatting.
 * How it works:
 * - Will integrate with OpenAI API to generate formatted proposals.
 * Gotchas:
 * - Currently throws error; implementation pending.
 */
@Injectable()
export class OpenAiFormatterProvider implements FormatterProvider {
  private readonly logger = new Logger(OpenAiFormatterProvider.name);

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    const model = this.configService.get<string>('OPENAI_MODEL') ?? 'gpt-4o-mini';
    const baseUrl = this.configService.get<string>('OPENAI_BASE_URL');

    this.logger.log(
      JSON.stringify({
        event: 'openai_provider_initialized',
        model,
        baseUrl: baseUrl ?? 'default',
        hasApiKey: !!apiKey,
      }),
    );
  }

  async formatClinicalNote(input: {
    rawText: string;
    preset: string;
    options: Record<string, unknown>;
    promptVersion: number;
  }): Promise<{
    A: { title?: string; body: string };
    B: { title?: string; body: string };
    C: { title?: string; body: string };
  }> {
    // TODO: Implement OpenAI integration
    throw new Error(
      'OpenAI provider not implemented yet. Use CLINICAL_NOTE_FORMAT_PROVIDER=dummy for now.',
    );
  }
}
