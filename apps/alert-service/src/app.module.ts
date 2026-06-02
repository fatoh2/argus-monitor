import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { HealthModule } from "./health/health.module";
import { AlertEngineService } from "./alert-engine/alert-engine.service";

@Module({
  imports: [HealthModule],
  controllers: [AppController],
  providers: [AppService, AlertEngineService],
})
export class AppModule {}
