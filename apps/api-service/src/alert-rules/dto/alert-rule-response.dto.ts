export class AlertRuleResponseDto {
  id: string;
  userId: string;
  walletId: string;
  chain: string;
  type: string;
  threshold: string | null;
  createdAt: Date;
  updatedAt: Date;
}
