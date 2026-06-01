import { Controller, Get, Post, Delete, Body, Param, UseGuards, Request, ParseUUIDPipe } from '@nestjs/common';
import { AlertRulesService } from './alert-rules.service';
import { CreateAlertRuleDto } from './dto/create-alert-rule.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('alert-rules')
@UseGuards(JwtAuthGuard)
export class AlertRulesController {
  constructor(private readonly alertRulesService: AlertRulesService) {}

  @Post()
  async create(@Request() req: any, @Body() dto: CreateAlertRuleDto) {
    return this.alertRulesService.create(req.user.id, dto);
  }

  @Get()
  async findAll(@Request() req: any) {
    return this.alertRulesService.findAllByUser(req.user.id);
  }

  @Get(':id')
  async findOne(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.alertRulesService.findOne(id, req.user.id);
  }

  @Delete(':id')
  async remove(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.alertRulesService.remove(id, req.user.id);
  }
}
