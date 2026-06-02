import { http, HttpResponse, delay } from 'msw';

// In-memory store for E2E tests
interface User {
  id: string;
  email: string;
  passwordHash: string;
}

interface Wallet {
  id: string;
  address: string;
  chain: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

interface AlertRule {
  id: string;
  userId: string;
  walletId: string;
  chain: string;
  type: string;
  threshold: string | null;
  createdAt: string;
  updatedAt: string;
}

const store: {
  users: User[];
  wallets: Wallet[];
  alertRules: AlertRule[];
  revokedTokens: string[];
} = {
  users: [],
  wallets: [],
  alertRules: [],
  revokedTokens: [],
};

let nextId = 1;
function genId(): string {
  return `mock-id-${nextId++}`;
}

function createToken(userId: string): string {
  return `mock-jwt-${userId}-${Date.now()}`;
}

function extractUserId(token: string): string | null {
  if (!token || !token.startsWith('mock-jwt-')) return null;
  const parts = token.split('-');
  if (parts.length < 3) return null;
  return `${parts[2]}`;
}

export const handlers = [
  // Auth: Register
  http.post('/api/auth/register', async ({ request }) => {
    await delay(50);
    const body = (await request.json()) as { email: string; password: string };

    if (store.users.find((u) => u.email === body.email)) {
      return HttpResponse.json({ message: 'Email already registered' }, { status: 409 });
    }

    const user: User = {
      id: genId(),
      email: body.email,
      passwordHash: body.password, // In tests, we store plaintext for simplicity
    };
    store.users.push(user);

    const accessToken = createToken(user.id);

    return HttpResponse.json({
      accessToken,
      user: { id: user.id, email: user.email },
    });
  }),

  // Auth: Login
  http.post('/api/auth/login', async ({ request }) => {
    await delay(50);
    const body = (await request.json()) as { email: string; password: string };

    const user = store.users.find((u) => u.email === body.email);
    if (!user || user.passwordHash !== body.password) {
      return HttpResponse.json({ message: 'Invalid credentials' }, { status: 401 });
    }

    const accessToken = createToken(user.id);

    return HttpResponse.json({
      accessToken,
      user: { id: user.id, email: user.email },
    });
  }),

  // Auth: Logout
  http.post('/api/auth/logout', async () => {
    await delay(50);
    return HttpResponse.json({ message: 'Logged out successfully' });
  }),

  // Auth: Me
  http.get('/api/auth/me', async ({ request }) => {
    await delay(50);
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.slice(7);
    const userId = extractUserId(token);
    if (!userId) {
      return HttpResponse.json({ message: 'Invalid token' }, { status: 401 });
    }

    const user = store.users.find((u) => u.id === userId);
    if (!user) {
      return HttpResponse.json({ message: 'User not found' }, { status: 401 });
    }

    return HttpResponse.json({ id: user.id, email: user.email });
  }),

  // Wallets: Create
  http.post('/api/wallets', async ({ request }) => {
    await delay(50);
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.slice(7);
    const userId = extractUserId(token);
    if (!userId) {
      return HttpResponse.json({ message: 'Invalid token' }, { status: 401 });
    }

    const body = (await request.json()) as { address: string; chain: string };
    const wallet: Wallet = {
      id: genId(),
      address: body.address,
      chain: body.chain,
      userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    store.wallets.push(wallet);
    return HttpResponse.json(wallet);
  }),

  // Wallets: List all
  http.get('/api/wallets', async ({ request }) => {
    await delay(50);
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.slice(7);
    const userId = extractUserId(token);
    if (!userId) {
      return HttpResponse.json({ message: 'Invalid token' }, { status: 401 });
    }

    const userWallets = store.wallets.filter((w) => w.userId === userId);
    return HttpResponse.json(userWallets);
  }),

  // Wallets: Get one
  http.get('/api/wallets/:id', async ({ params, request }) => {
    await delay(50);
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.slice(7);
    const userId = extractUserId(token);
    if (!userId) {
      return HttpResponse.json({ message: 'Invalid token' }, { status: 401 });
    }

    const wallet = store.wallets.find((w) => w.id === params.id && w.userId === userId);
    if (!wallet) {
      return HttpResponse.json({ message: 'Wallet not found' }, { status: 404 });
    }
    return HttpResponse.json(wallet);
  }),

  // Wallets: Delete
  http.delete('/api/wallets/:id', async ({ params, request }) => {
    await delay(50);
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.slice(7);
    const userId = extractUserId(token);
    if (!userId) {
      return HttpResponse.json({ message: 'Invalid token' }, { status: 401 });
    }

    const idx = store.wallets.findIndex((w) => w.id === params.id && w.userId === userId);
    if (idx === -1) {
      return HttpResponse.json({ message: 'Wallet not found' }, { status: 404 });
    }
    store.wallets.splice(idx, 1);
    // Also remove associated alert rules
    store.alertRules = store.alertRules.filter((r) => r.walletId !== params.id);
    return HttpResponse.json({ message: 'Wallet deleted' });
  }),

  // Alert Rules: Create
  http.post('/api/alert-rules', async ({ request }) => {
    await delay(50);
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.slice(7);
    const userId = extractUserId(token);
    if (!userId) {
      return HttpResponse.json({ message: 'Invalid token' }, { status: 401 });
    }

    const body = (await request.json()) as {
      walletId: string;
      chain: string;
      type: string;
      threshold?: string;
    };

    const rule: AlertRule = {
      id: genId(),
      userId,
      walletId: body.walletId,
      chain: body.chain,
      type: body.type,
      threshold: body.threshold || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    store.alertRules.push(rule);
    return HttpResponse.json(rule);
  }),

  // Alert Rules: List all
  http.get('/api/alert-rules', async ({ request }) => {
    await delay(50);
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.slice(7);
    const userId = extractUserId(token);
    if (!userId) {
      return HttpResponse.json({ message: 'Invalid token' }, { status: 401 });
    }

    const userRules = store.alertRules.filter((r) => r.userId === userId);
    return HttpResponse.json(userRules);
  }),

  // Alert Rules: Get one
  http.get('/api/alert-rules/:id', async ({ params, request }) => {
    await delay(50);
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.slice(7);
    const userId = extractUserId(token);
    if (!userId) {
      return HttpResponse.json({ message: 'Invalid token' }, { status: 401 });
    }

    const rule = store.alertRules.find((r) => r.id === params.id && r.userId === userId);
    if (!rule) {
      return HttpResponse.json({ message: 'Alert rule not found' }, { status: 404 });
    }
    return HttpResponse.json(rule);
  }),

  // Alert Rules: Delete
  http.delete('/api/alert-rules/:id', async ({ params, request }) => {
    await delay(50);
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.slice(7);
    const userId = extractUserId(token);
    if (!userId) {
      return HttpResponse.json({ message: 'Invalid token' }, { status: 401 });
    }

    const idx = store.alertRules.findIndex((r) => r.id === params.id && r.userId === userId);
    if (idx === -1) {
      return HttpResponse.json({ message: 'Alert rule not found' }, { status: 404 });
    }
    store.alertRules.splice(idx, 1);
    return HttpResponse.json({ message: 'Alert rule deleted' });
  }),
];
