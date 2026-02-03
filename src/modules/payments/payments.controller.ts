import { Body, Controller, Headers, HttpCode, Post } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { ProblemDetailsDto } from '../../common/docs/problem-details.dto';
import { PaymentsService } from './payments.service';
import { Logger, Req, Get, Param, UseGuards } from '@nestjs/common';
import { PaymentDetailDto } from './docs/payment.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditAction, UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { Actor } from '../../common/types/actor.type';
import { AuditService } from '../../infra/audit/audit.service';
import { PaymentQuoteDto } from './docs/payment-quote.dto';
import { PaymentQuoteRequestDto } from './dto/payment-quote.dto';

@ApiTags('payments')
@Controller()
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly auditService: AuditService,
  ) {}
  private readonly logger = new Logger(PaymentsController.name);

  @Post('payments/webhooks/mercadopago')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mercado Pago webhook' })
  @ApiOkResponse({ schema: { example: { received: true } } })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  async handleMercadoPagoWebhook(
    @Req() req: Request,
    @Body() body: unknown,
    @Headers('x-signature') signature?: string,
    @Headers('x-request-id') requestId?: string,
  ) {
    const traceId = (req as Request & { traceId?: string }).traceId ?? null;
    const queryDataId =
      typeof req.query?.['data.id'] === 'string'
        ? req.query['data.id']
        : undefined;
    const topic =
      typeof req.query?.topic === 'string' ? req.query.topic : undefined;
    const queryId =
      typeof req.query?.id === 'string' ? req.query.id : undefined;
    const resource =
      typeof req.query?.resource === 'string' ? req.query.resource : undefined;
    const mpPaymentId =
      typeof body === 'object' && body !== null
        ? ((body as { data?: { id?: string } })?.data?.id ?? null)
        : null;
    this.logger.log(
      JSON.stringify({
        traceId,
        requestId: requestId ?? null,
        mpPaymentId,
        topic: topic ?? null,
        queryId: queryId ?? null,
        resource: resource ?? null,
        signature: signature ?? null,
      }),
    );

    await this.paymentsService.handleMercadoPagoWebhook({
      body,
      signature,
      requestId,
      dataId: queryDataId,
      topic,
      queryId,
      resource,
      traceId,
    });

    return { received: true };
  }

  @Get('payments/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.doctor, UserRole.admin)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get payment by id' })
  @ApiOkResponse({ type: PaymentDetailDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  async getPaymentById(
    @CurrentUser() actor: Actor,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    const payment = await this.paymentsService.getPaymentById(actor, id);
    // Audit reads for payment access tracking.
    await this.auditService.log({
      action: AuditAction.READ,
      resourceType: 'Payment',
      resourceId: payment.id,
      actor,
      traceId: (req as Request & { traceId?: string }).traceId ?? null,
      ip: req.ip,
      userAgent: req.get('user-agent') ?? null,
    });
    return payment;
  }

  @Post('payments/quote')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.patient)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get payment quote (pre-pago)' })
  @ApiOkResponse({ type: PaymentQuoteDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  @ApiConflictResponse({ type: ProblemDetailsDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  async getPaymentQuote(
    @CurrentUser() actor: Actor,
    @Body() dto: PaymentQuoteRequestDto,
  ) {
    return this.paymentsService.getPaymentQuote(actor, dto);
  }
}
