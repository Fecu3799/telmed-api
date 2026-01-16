import { Injectable, Logger } from '@nestjs/common';
import { NotificationsGateway } from './notifications.gateway';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly gateway: NotificationsGateway) {}

  appointmentsChanged(userIds: string[]) {
    for (const userId of userIds) {
      try {
        this.gateway.emitAppointmentsChanged(userId);
      } catch (error) {
        this.logger.warn(
          JSON.stringify({
            event: 'notifications_appointments_failed',
            userId,
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      }
    }
  }

  emergenciesChanged(userIds: string[]) {
    for (const userId of userIds) {
      try {
        this.gateway.emitEmergenciesChanged(userId);
      } catch (error) {
        this.logger.warn(
          JSON.stringify({
            event: 'notifications_emergencies_failed',
            userId,
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      }
    }
  }

  consultationsChanged(userIds: string[]) {
    for (const userId of userIds) {
      try {
        this.gateway.emitConsultationsChanged(userId);
      } catch (error) {
        this.logger.warn(
          JSON.stringify({
            event: 'notifications_consultations_failed',
            userId,
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      }
    }
  }
}
