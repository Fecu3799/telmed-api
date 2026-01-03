import { PrismaClient } from '@prisma/client';

export async function resetDb(prisma: PrismaClient) {
  await prisma.payment.deleteMany();
  await prisma.consultationMessage.deleteMany();
  await prisma.fileObject.deleteMany();
  await prisma.consultation.deleteMany();
  await prisma.consultationQueueItem.deleteMany();
  await prisma.webhookEvent.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.doctorPaymentAccount.deleteMany();
  await prisma.doctorSpecialty.deleteMany();
  await prisma.doctorAvailabilityRule.deleteMany();
  await prisma.doctorAvailabilityException.deleteMany();
  await prisma.doctorSchedulingConfig.deleteMany();
  await prisma.doctorProfile.deleteMany();
  await prisma.patient.deleteMany();
  await prisma.session.deleteMany();
  await prisma.specialty.deleteMany();
  await prisma.user.deleteMany();
}
