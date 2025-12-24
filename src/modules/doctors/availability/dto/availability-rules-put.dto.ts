import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, ValidateNested } from 'class-validator';
import { AvailabilityRuleInputDto } from './availability-rule-input.dto';

export class AvailabilityRulesPutDto {
  @ApiProperty({ type: [AvailabilityRuleInputDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AvailabilityRuleInputDto)
  rules!: AvailabilityRuleInputDto[];
}
