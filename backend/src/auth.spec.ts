import { Role } from '@prisma/client';
import { RolesGuard } from './auth';

describe('RolesGuard', () => {
  it('does not allow an employee through a manager-only route', () => {
    const reflector: any = { getAllAndOverride: jest.fn().mockReturnValue([Role.MANAGER]) };
    const context: any = { getHandler: () => undefined, getClass: () => undefined, switchToHttp: () => ({ getRequest: () => ({ user: { role: Role.EMPLOYEE } }) }) };
    expect(new RolesGuard(reflector).canActivate(context)).toBe(false);
  });
});
