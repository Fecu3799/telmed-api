import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { ProblemDetailsDto } from '../../common/docs/problem-details.dto';
import { PublicSpecialtyDto } from './docs/public-specialty.dto';
import { SpecialtiesQueryDto } from './dto/specialties-query.dto';
import { SpecialtiesService } from './specialties.service';

@ApiTags('specialties')
@Controller('specialties')
export class SpecialtiesController {
  constructor(private readonly specialtiesService: SpecialtiesService) {}

  @Get()
  @ApiOperation({ summary: 'List active specialties' })
  @ApiOkResponse({ type: [PublicSpecialtyDto] })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  async list(@Query() query: SpecialtiesQueryDto) {
    return this.specialtiesService.listActive(query);
  }
}
