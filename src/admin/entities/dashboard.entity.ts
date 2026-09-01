import { ApiProperty } from '@nestjs/swagger';

class UserStats {
  @ApiProperty({ example: 1284 }) total!: number;
  @ApiProperty({ example: 1180 }) users!: number;
  @ApiProperty({ example: 96 }) agents!: number;
  @ApiProperty({ example: 8 }) admins!: number;
  @ApiProperty({ example: 34, description: 'Registered in the last 30 days' }) newLast30Days!: number;
  @ApiProperty({ example: 12 }) suspended!: number;
}

class PropertyStats {
  @ApiProperty({ example: 640 }) total!: number;
  @ApiProperty({ example: 512 }) approved!: number;
  @ApiProperty({ example: 47, description: 'Awaiting moderation' }) pending!: number;
  @ApiProperty({ example: 18 }) rejected!: number;
  @ApiProperty({ example: 43 }) draft!: number;
  @ApiProperty({ example: 15 }) sold!: number;
  @ApiProperty({ example: 5 }) rented!: number;
  @ApiProperty({ example: 24 }) featured!: number;
  @ApiProperty({ example: 61, description: 'Created in the last 30 days' }) newLast30Days!: number;
}

class EngagementStats {
  @ApiProperty({ example: 3120 }) favorites!: number;
  @ApiProperty({ example: 412 }) appointments!: number;
  @ApiProperty({ example: 76, description: 'Appointments awaiting agent confirmation' })
  pendingAppointments!: number;
  @ApiProperty({ example: 289 }) reviews!: number;
  @ApiProperty({ example: 154 }) conversations!: number;
  @ApiProperty({ example: 4821 }) messages!: number;
}

class ReportStats {
  @ApiProperty({ example: 9 }) PENDING!: number;
  @ApiProperty({ example: 3 }) REVIEWING!: number;
  @ApiProperty({ example: 41 }) RESOLVED!: number;
  @ApiProperty({ example: 7 }) REJECTED!: number;
}

class TopAgentSummary {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'Jordan Rivera' }) name!: string;
  @ApiProperty({ example: 4.8 }) rating!: number;
  @ApiProperty({ example: 23 }) reviewCount!: number;
  @ApiProperty({ example: 31 }) propertyCount!: number;
}

export class AdminDashboardEntity {
  @ApiProperty({ type: UserStats })
  users!: UserStats;

  @ApiProperty({ type: PropertyStats })
  properties!: PropertyStats;

  @ApiProperty({ type: EngagementStats })
  engagement!: EngagementStats;

  @ApiProperty({ type: ReportStats, description: 'Report counts by status' })
  reports!: ReportStats;

  @ApiProperty({ type: [TopAgentSummary], description: 'Highest-rated agents' })
  topAgents!: TopAgentSummary[];

  @ApiProperty({ example: '2026-08-29T10:15:00.000Z', description: 'When these figures were computed' })
  generatedAt!: string;
}
