import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateChainDto } from './dto/create-chain.dto';

@Injectable()
export class ChainsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateChainDto) {
    const existing = await this.prisma.chain.findUnique({ where: { name: dto.name } });
    if (existing) {
      throw new ConflictException('Chain already exists');
    }

    return this.prisma.chain.create({ data: dto });
  }

  async findAll() {
    return this.prisma.chain.findMany({ orderBy: { name: 'asc' } });
  }

  async findOne(id: string) {
    const chain = await this.prisma.chain.findUnique({ where: { id } });
    if (!chain) {
      throw new NotFoundException('Chain not found');
    }
    return chain;
  }

  async remove(id: string) {
    const chain = await this.prisma.chain.findUnique({ where: { id } });
    if (!chain) {
      throw new NotFoundException('Chain not found');
    }
    await this.prisma.chain.delete({ where: { id } });
    return { message: 'Chain deleted successfully' };
  }
}
