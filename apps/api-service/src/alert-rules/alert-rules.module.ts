import { Module } from '@nestjs/common';
import { AlertRulesController } from './alert-rules.controller';
import { AlertRulesService } from './alert-rules.service';

@Module({
  controllers: [AlertRulesController],
  providers: [AlertRulesService],
  exports: [AlertRulesService],
})
export class AlertRulesModule {}
