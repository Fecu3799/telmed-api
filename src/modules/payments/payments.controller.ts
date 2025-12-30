import { Body, Controller, Headers, HttpCode, Post } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { ProblemDetailsDto } from '../../common/docs/problem-details.dto';
import { PaymentsService } from './payments.service';

@ApiTags('payments')
@Controller()
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('payments/webhooks/mercadopago')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mercado Pago webhook' })
  @ApiOkResponse({ schema: { example: { received: true } } })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  async handleMercadoPagoWebhook(
    @Body() body: unknown,
    @Headers('x-signature') signature?: string,
    @Headers('x-request-id') requestId?: string,
  ) {
    await this.paymentsService.handleMercadoPagoWebhook({
      body,
      signature,
      requestId,
    });

    return { received: true };
  }
}
