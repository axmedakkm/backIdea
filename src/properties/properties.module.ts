import { Module } from '@nestjs/common';
import { AgentsModule } from '../agents/agents.module';
import { AgentPropertiesController } from './agent-properties.controller';
import { PropertiesController } from './properties.controller';
import { PropertiesService } from './properties.service';
import { PropertyImagesController } from './property-images.controller';
import { PropertyImagesService } from './property-images.service';

@Module({
  imports: [AgentsModule],
  controllers: [PropertiesController, PropertyImagesController, AgentPropertiesController],
  providers: [PropertiesService, PropertyImagesService],
  exports: [PropertiesService],
})
export class PropertiesModule {}
