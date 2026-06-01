import { Controller, Get, Post, Delete, Body, Param, ParseUUIDPipe } from '@nestjs/common';
import { ChainsService } from './chains.service';
import { CreateChainDto } from './dto/create-chain.dto';

@Controller('chains')
export class ChainsController {
  constructor(private readonly chainsService: ChainsService) {}

  @Post()
  async create(@Body() dto: CreateChainDto) {
    return this.chainsService.create(dto);
  }

  @Get()
  async findAll() {
    return this.chainsService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.chainsService.findOne(id);
  }

  @Delete(':id')
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.chainsService.remove(id);
  }
}
