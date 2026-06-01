import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAlertRuleDto } from './dto/create-alert-rule.dto';

@Injectable()
export class AlertRulesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateAlertRuleDto) {
    // Verify wallet belongs to user
    const wallet = await this.prisma.wallet.findFirst({
      where: { id: dto.walletId, userId },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    return this.prisma.alertRule.create({
      data: {
        userId,
        walletId: dto.walletId,
        chain: dto.chain,
        type: dto.type,
        threshold: dto.threshold || null,
      },
      select: {
        id: true,
        userId: true,
        walletId: true,
        chain: true,
        type: true,
        threshold: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async findAllByUser(userId: string) {
    return this.prisma.alertRule.findMany({
      where: { userId },
      select: {
        id: true,
        userId: true,
        walletId: true,
        chain: true,
        type: true,
        threshold: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, userId: string) {
    const rule = await this.prisma.alertRule.findFirst({
      where: { id, userId },
      select: {
        id: true,
        userId: true,
        walletId: true,
        chain: true,
        type: true,
        threshold: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!rule) {
      throw new NotFoundException('Alert rule not found');
    }

    return rule;
  }

  async remove(id: string, userId: string) {
    const rule = await this.prisma.alertRule.findFirst({
      where: { id, userId },
    });

    if (!rule) {
      throw new NotFoundException('Alert rule not found');
    }

    await this.prisma.alertRule.delete({ where: { id } });

    return { message: 'Alert rule deleted successfully' };
  }
}
