import { ConflictException, Injectable } from '@nestjs/common';
import {
  DoctorPaymentAccountMode,
  DoctorPaymentAccountStatus,
  PaymentProvider,
} from '@prisma/client';
import type { Actor } from '../../../common/types/actor.type';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { DoctorPaymentAccountDto } from './docs/doctor-payment-account.dto';
import { UpsertDoctorPaymentAccountDto } from './dto/upsert-doctor-payment-account.dto';

const DEFAULT_ACCOUNT: DoctorPaymentAccountDto = {
  provider: PaymentProvider.mercadopago,
  mode: DoctorPaymentAccountMode.dev,
  status: DoctorPaymentAccountStatus.not_configured,
  devLabel: null,
  updatedAt: null,
};

/**
 * Doctor payment account (DEV) service.
 * What it does:
 * - Simulates account connection status for future payouts without real credentials.
 * How it works:
 * - Stores a dev label and status in DoctorPaymentAccount and leaves real tokens null.
 */
@Injectable()
export class DoctorPaymentAccountService {
  constructor(private readonly prisma: PrismaService) {}

  async getMyAccount(actor: Actor): Promise<DoctorPaymentAccountDto> {
    const account = await this.prisma.doctorPaymentAccount.findFirst({
      where: { doctorUserId: actor.id, deletedAt: null },
    });

    if (!account) {
      return { ...DEFAULT_ACCOUNT };
    }

    return this.mapAccount(account);
  }

  async upsertMyAccount(
    actor: Actor,
    dto: UpsertDoctorPaymentAccountDto,
  ): Promise<DoctorPaymentAccountDto> {
    const doctorProfile = await this.prisma.doctorProfile.findUnique({
      where: { userId: actor.id },
      select: { userId: true },
    });

    if (!doctorProfile) {
      throw new ConflictException('Doctor profile required');
    }

    const account = await this.prisma.doctorPaymentAccount.upsert({
      where: { doctorUserId: actor.id },
      create: {
        doctorUserId: actor.id,
        provider: PaymentProvider.mercadopago,
        mode: DoctorPaymentAccountMode.dev,
        status: DoctorPaymentAccountStatus.connected,
        devLabel: dto.devLabel.trim(),
      },
      update: {
        provider: PaymentProvider.mercadopago,
        mode: DoctorPaymentAccountMode.dev,
        status: DoctorPaymentAccountStatus.connected,
        devLabel: dto.devLabel.trim(),
        deletedAt: null,
      },
    });

    return this.mapAccount(account);
  }

  async disconnectMyAccount(actor: Actor): Promise<DoctorPaymentAccountDto> {
    const account = await this.prisma.doctorPaymentAccount.findFirst({
      where: { doctorUserId: actor.id, deletedAt: null },
    });

    if (!account) {
      return { ...DEFAULT_ACCOUNT };
    }

    const updated = await this.prisma.doctorPaymentAccount.update({
      where: { doctorUserId: actor.id },
      data: {
        status: DoctorPaymentAccountStatus.disconnected,
        devLabel: null,
      },
    });

    return this.mapAccount(updated);
  }

  private mapAccount(account: {
    provider: PaymentProvider;
    mode: DoctorPaymentAccountMode;
    status: DoctorPaymentAccountStatus;
    devLabel: string | null;
    updatedAt: Date;
  }): DoctorPaymentAccountDto {
    return {
      provider: account.provider,
      mode: account.mode,
      status: account.status,
      devLabel: account.devLabel,
      updatedAt: account.updatedAt.toISOString(),
    };
  }
}
