import { IsBoolean, IsInt, IsObject, IsOptional, Min } from 'class-validator';

export class UpdatePolicyDto {
  @IsOptional()
  @IsBoolean()
  patientCanMessage?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  dailyLimit?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  burstLimit?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  burstWindowSeconds?: number;

  @IsOptional()
  @IsBoolean()
  requireRecentConsultation?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  recentConsultationWindowHours?: number;

  @IsOptional()
  @IsBoolean()
  closedByDoctor?: boolean;

  @IsOptional()
  @IsObject()
  allowedSchedule?: any;
}

