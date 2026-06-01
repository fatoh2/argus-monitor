import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWalletDto } from './dto/create-wallet.dto';

@Injectable()
export class WalletsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateWalletDto) {
    const existing = await this.prisma.wallet.findUnique({ where: { address: dto.address } });
    if (existing) {
      throw new ConflictException('Wallet address already exists');
    }

    return this.prisma.wallet.create({
      data: {
        address: dto.address,
        chain: dto.chain,
        userId,
      },
      select: {
        id: true,
        address: true,
        chain: true,
        userId: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async findAllByUser(userId: string) {
    return this.prisma.wallet.findMany({
      where: { userId },
      select: {
        id: true,
        address: true,
        chain: true,
        userId: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, userId: string) {
    const wallet = await this.prisma.wallet.findFirst({
      where: { id, userId },
      select: {
        id: true,
        address: true,
        chain: true,
        userId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    return wallet;
  }

  async remove(id: string, userId: string) {
    const wallet = await this.prisma.wallet.findFirst({
      where: { id, userId },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    await this.prisma.wallet.delete({ where: { id } });

    return { message: 'Wallet deleted successfully' };
  }
}
