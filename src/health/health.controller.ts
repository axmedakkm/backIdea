import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { HealthService, HealthStatus } from './health.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: 'Service health probe',
    description:
      'Returns process uptime and database connectivity. Used by load balancers and container orchestrators. Requires no authentication.',
  })
  @ApiOkResponse({ description: 'Service is reachable', type: HealthStatus })
  check(): Promise<HealthStatus> {
    return this.healthService.check();
  }
}
