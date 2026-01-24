import { PrismaClient } from '@prisma/client';

export async function resetDb(prisma: PrismaClient) {
  const url = process.env.DATABASE_URL ?? '';
  const testUrl = process.env.DATABASE_URL_TEST ?? '';
  const actualDbName = getDbNameFromUrl(url);
  const expectedDbName = getDbNameFromUrl(testUrl) || 'med_test';

  if (!actualDbName || actualDbName !== expectedDbName) {
    throw new Error(
      `Refusing to reset non-test DB. ` +
        `DATABASE_URL=${url} (db=${actualDbName ?? 'unknown'})`,
    );
  }

  await prisma.payment.deleteMany();
  await prisma.chatMessage.deleteMany();
  await prisma.chatPolicy.deleteMany();
  await prisma.chatThread.deleteMany();
  await prisma.patientFile.deleteMany();
  await prisma.fileObject.deleteMany();
  await prisma.patientClinicalProcedure.deleteMany();
  await prisma.patientClinicalCondition.deleteMany();
  await prisma.patientClinicalMedication.deleteMany();
  await prisma.patientClinicalAllergy.deleteMany();
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

function getDbNameFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname || '';
    const name = pathname.startsWith('/') ? pathname.slice(1) : pathname;
    return name || null;
  } catch {
    return null;
  }
}
