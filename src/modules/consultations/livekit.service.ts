import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sign } from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { CLOCK } from '../../common/clock/clock';
import type { Clock } from '../../common/clock/clock';

/**
 * Genera tookens JWT para que doctor/patient se conecten a la sala de video en LiveKit.
 *
 * How it works:
 * - Lee LIVEKIT_API_KEY/SECRET/URL desde env; en test usa defaults.
 * - issueToken: firma un JWT HS256 con permisos roomJoin + publisher/subscribe y TTL configurable.
 * - Expone getLivekitUrl para armar payloads/eventos sin regenerar token.
 */

type LiveKitTokenResult = {
  token: string;
  roomName: string;
  livekitUrl: string;
};

@Injectable()
export class LiveKitService {
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly livekitUrl: string;
  private readonly ttlSeconds: number;

  constructor(
    private readonly configService: ConfigService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    // In test environment, use defaults to avoid requiring LiveKit config
    if (process.env.NODE_ENV === 'test') {
      this.apiKey = configService.get<string>('LIVEKIT_API_KEY') ?? 'test_key';
      this.apiSecret =
        configService.get<string>('LIVEKIT_API_SECRET') ?? 'test_secret';
      this.livekitUrl =
        configService.get<string>('LIVEKIT_URL') ?? 'wss://test.livekit.dev';
    } else {
      this.apiKey = configService.getOrThrow<string>('LIVEKIT_API_KEY');
      this.apiSecret = configService.getOrThrow<string>('LIVEKIT_API_SECRET');
      this.livekitUrl = configService.getOrThrow<string>('LIVEKIT_URL');
    }
    this.ttlSeconds =
      configService.get<number>('LIVEKIT_TOKEN_TTL_SECONDS') ?? 600;
  }

  /**
   * Get the LiveKit server URL without generating a token.
   * Useful for WebSocket event payloads.
   */
  getLivekitUrl(): string {
    return this.livekitUrl;
  }

  issueToken(input: {
    identity: string;
    roomName: string;
    canPublish: boolean;
    canSubscribe: boolean;
  }): LiveKitTokenResult {
    const nowSeconds = Math.floor(this.clock.now().getTime() / 1000);
    // LiveKit expects the API key as issuer and the user identity as subject.
    const payload = {
      iss: this.apiKey,
      sub: input.identity,
      nbf: nowSeconds,
      exp: nowSeconds + this.ttlSeconds,
      jti: randomUUID(),
      video: {
        room: input.roomName,
        roomJoin: true,
        canPublish: input.canPublish,
        canSubscribe: input.canSubscribe,
      },
    };

    const token = sign(payload, this.apiSecret, { algorithm: 'HS256' });

    return {
      token,
      roomName: input.roomName,
      livekitUrl: this.livekitUrl,
    };
  }
}
