import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { handlePrismaError } from '../common/prisma-error.handler';
import { CreateChainDto } from './dto/create-chain.dto';

@Injectable()
export class ChainsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateChainDto) {
    const existing = await this.prisma.chain.findUnique({ where: { name: dto.name } });
    if (existing) {
      throw new ConflictException('Chain already exists');
    }

    try {
      return await this.prisma.chain.create({ data: dto });
    } catch (error) {
      handlePrismaError(error, 'ChainsService.create');
    }
  }

  async findAll() {
    try {
      return await this.prisma.chain.findMany({ orderBy: { name: 'asc' } });
    } catch (error) {
      handlePrismaError(error, 'ChainsService.findAll');
    }
  }

  async findOne(id: string) {
    try {
      const chain = await this.prisma.chain.findUnique({ where: { id } });
      if (!chain) {
        throw new NotFoundException('Chain not found');
      }
      return chain;
    } catch (error) {
      handlePrismaError(error, 'ChainsService.findOne');
    }
  }

  async remove(id: string) {
    try {
      const chain = await this.prisma.chain.findUnique({ where: { id } });
      if (!chain) {
        throw new NotFoundException('Chain not found');
      }
      await this.prisma.chain.delete({ where: { id } });
      return { message: 'Chain deleted successfully' };
    } catch (error) {
      handlePrismaError(error, 'ChainsService.remove');
    }
  }
}
