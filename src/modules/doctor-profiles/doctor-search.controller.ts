import { Controller, Get, Query, Req } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { ProblemDetailsDto } from '../../common/docs/problem-details.dto';
import { DoctorSearchResponseDto } from './docs/doctor-search.dto';
import { DoctorSearchQueryDto } from './dto/doctor-search-query.dto';
import { DoctorSearchService } from './doctor-search.service';

@ApiTags('doctors')
@Controller('doctors/search')
export class DoctorSearchController {
  constructor(private readonly searchService: DoctorSearchService) {}

  @Get()
  @ApiOperation({ summary: 'Search doctors' })
  @ApiOkResponse({ type: DoctorSearchResponseDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  async search(@Query() query: DoctorSearchQueryDto, @Req() req: Request) {
    const traceId =
      req.header('x-trace-id') ?? req.header('x-request-id') ?? undefined;
    return this.searchService.search(query, traceId);
  }
}
