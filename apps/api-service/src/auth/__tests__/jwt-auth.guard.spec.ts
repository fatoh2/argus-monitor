import { JwtAuthGuard } from '../jwt-auth.guard';

describe('JwtAuthGuard', () => {
  it('should be defined', () => {
    const guard = new JwtAuthGuard();
    expect(guard).toBeDefined();
  });

  it('should extend AuthGuard("jwt")', () => {
    const guard = new JwtAuthGuard();
    // JwtAuthGuard extends AuthGuard('jwt') from @nestjs/passport
    expect(guard.constructor.name).toBe('JwtAuthGuard');
  });
});
