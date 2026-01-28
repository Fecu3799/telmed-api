import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FormatterProvider } from './formatter-provider.interface';
import { DummyFormatterProvider } from './dummy-formatter.provider';
import { OpenAiFormatterProvider } from './openai-formatter.provider';

/**
 * Formatter provider factory.
 * What it does:
 * - Selects and instantiates the appropriate formatter provider based on env config.
 * How it works:
 * - Reads CLINICAL_NOTE_FORMAT_PROVIDER and returns corresponding provider instance.
 * Gotchas:
 * - Validates OpenAI API key if provider=openai (validation also in env.schema).
 */
@Injectable()
export class FormatterProviderFactory {
  private readonly logger = new Logger(FormatterProviderFactory.name);

  constructor(private readonly configService: ConfigService) {}

  create(): FormatterProvider {
    const provider = this.configService.get<string>(
      'CLINICAL_NOTE_FORMAT_PROVIDER',
    ) ?? 'dummy';

    this.logger.log(
      JSON.stringify({
        event: 'formatter_provider_selected',
        provider,
      }),
    );

    switch (provider) {
      case 'dummy':
        return new DummyFormatterProvider();
      case 'openai': {
        const apiKey = this.configService.get<string>('OPENAI_API_KEY');
        if (!apiKey || apiKey.length === 0) {
          throw new Error(
            'OPENAI_API_KEY is required when CLINICAL_NOTE_FORMAT_PROVIDER=openai',
          );
        }
        return new OpenAiFormatterProvider(this.configService);
      }
      default:
        throw new Error(
          `Unknown CLINICAL_NOTE_FORMAT_PROVIDER: ${provider}. Must be 'dummy' or 'openai'.`,
        );
    }
  }
}
