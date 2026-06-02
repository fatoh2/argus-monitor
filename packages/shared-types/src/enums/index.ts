export enum ChainType {
  SOLANA = 'solana',
  EVM = 'evm',
}

export enum MonitorType {
  BALANCE = 'balance',
  TRANSACTION = 'transaction',
  TOKEN_ACCOUNT = 'token_account',
  PROGRAM = 'program',
  GAS_PRICE = 'gas_price',
}

export enum AlertCondition {
  GT = 'gt',
  GTE = 'gte',
  LT = 'lt',
  LTE = 'lte',
  EQ = 'eq',
  NEQ = 'neq',
  CHANGED = 'changed',
}

export enum AlertStatus {
  ACTIVE = 'active',
  TRIGGERED = 'triggered',
  RESOLVED = 'resolved',
  DISABLED = 'disabled',
}

export enum NotificationChannel {
  TELEGRAM = 'telegram',
  EMAIL = 'email',
  WEBHOOK = 'webhook',
}

export enum JobStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  RETRYING = 'retrying',
}

export enum RpcStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  DOWN = 'down',
  CIRCUIT_OPEN = 'circuit_open',
}
